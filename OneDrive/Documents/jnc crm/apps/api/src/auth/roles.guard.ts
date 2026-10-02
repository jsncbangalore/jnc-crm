/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { PAGE_ACCESS_KEY } from './page-access.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredPage = this.reflector.getAllAndOverride<string>(PAGE_ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = context.switchToHttp().getRequest();
    const { user } = req;

    if (user && user.mustResetPassword) {
      const path = req.path || req.url || '';
      if (
        !path.includes('/auth/change-password') &&
        !path.includes('/auth/me') &&
        !path.includes('/auth/refresh')
      ) {
        throw new ForbiddenException(
          'Password reset required: You must change your temporary password before accessing CRM resources.',
        );
      }
    }

    if (!user) {
      throw new ForbiddenException('User authentication context required');
    }

    // Platform super_admin and platform_super_admin bypass all role restrictions and team page restrictions
    if (user.role === 'super_admin' || user.role === 'platform_super_admin') {
      return true;
    }

    // Check Role Hierarchy
    if (requiredRoles && requiredRoles.length > 0) {
      let isAuthorized = requiredRoles.includes(user.role);

      if (!isAuthorized) {
        // tenant_admin (Client Super Admin) has full control over all tenant operational features
        if (user.role === 'tenant_admin') {
          const isPlatformOnly = requiredRoles.every(
            (r) => r === 'super_admin' || r === 'platform_super_admin',
          );
          if (!isPlatformOnly) {
            isAuthorized = true;
          }
        } else if (user.role === 'admin') {
          if (requiredRoles.some((r) => ['admin', 'sub_admin', 'employee'].includes(r))) {
            isAuthorized = true;
          }
        } else if (user.role === 'sub_admin') {
          if (requiredRoles.some((r) => ['sub_admin', 'employee'].includes(r))) {
            isAuthorized = true;
          }
        }
      }

      if (!isAuthorized) {
        throw new ForbiddenException(`Access denied. Required roles: [${requiredRoles.join(', ')}]`);
      }
    }

    // Check Page Access (Team Restrictions)
    if (requiredPage) {
      // Fetch user's team from database to ensure fresh permission state
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.sub || user.id },
        include: { teamRef: true }
      });

      if (!dbUser) return false;

      // If user has a team assigned, verify the page is in the team's allowed list
      if (dbUser.teamId && dbUser.teamRef) {
        try {
          const allowedPages = JSON.parse(dbUser.teamRef.allowedPages || '[]');
          if (!allowedPages.includes(requiredPage)) {
            throw new ForbiddenException(`Access restricted: Your team does not have access to the '${requiredPage}' module.`);
          }
        } catch (e) {
          if (e instanceof ForbiddenException) throw e;
          // Parse error, fail closed
          throw new ForbiddenException(`Access restricted: Invalid team permissions format.`);
        }
      }
      // If dbUser.teamId is null, it means no team restriction -> full access per their role
    }

    return true;
  }
}

