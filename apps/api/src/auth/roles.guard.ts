/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { PAGE_ACCESS_KEY, IS_PUBLIC_KEY, AUTH_ONLY_KEY } from './page-access.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { getEffectivePagesForUser } from './effective-page-access';

const PAGE_LABEL_MAP: Record<string, string> = {
  shipments: 'Shipments',
  orders: 'Orders',
  invoices: 'Invoices',
  quotations: 'Quotations',
  inventory: 'Inventory',
  suppliers: 'Suppliers',
  bills: 'Bills',
  purchase_bills: 'Bills',
  ledger: 'Ledger',
  leads: 'Leads',
  lead_flow: 'Lead Flow',
  lead_setup: 'Lead Setup',
  daily_activities: 'Daily Activities',
  notifications: 'Notifications',
  custom_objects: 'Custom Objects',
  automation: 'Workflow Automation',
  audit_logs: 'Audit Logs',
  users: 'Users',
  teams: 'Teams',
  branding: 'Branding',
  mail_settings: 'Mail Settings',
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredPage = this.reflector.getAllAndOverride<string | string[]>(PAGE_ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('User authentication context required');
    }

    if (user && user.mustResetPassword) {
      const path = req.path || req.url || '';
      const isAuthRoute = path.includes('/auth/') || path.startsWith('/api/v1/auth/');

      if (!isAuthRoute) {
        throw new ForbiddenException(
          'Password reset required: You must change your temporary password before accessing CRM resources.',
        );
      }
    }

    // Platform super_admin:
    // When tenantId is null (not impersonating), they are strictly restricted to platform operations.
    // They are forbidden from accessing tenant operational endpoints (leads, orders, invoices, inventory, etc.).
    if (user.role === 'platform_super_admin' && !user.tenantId) {
      if (requiredRoles && requiredRoles.includes('platform_super_admin')) {
        return true;
      }
      if (requiredPage || (requiredRoles && requiredRoles.length > 0)) {
        throw new ForbiddenException(
          'Platform administrators cannot access company workspace resources directly. Impersonate a client company to view their data.',
        );
      }
      const path = req.path || req.url || '';
      if (path.includes('/platform/') || path.includes('/auth/')) {
        return true;
      }

      throw new ForbiddenException(
        'Platform administrators cannot access company workspace resources directly. Impersonate a client company to view their data.',
      );
    }

    // 1. Check Page Access (Dynamic Per-User & Per-Team Page Access from database, no stale cache)
    let userEffectivePages: string[] | null = null;
    let hasPageAccess = true;

    if (requiredPage) {
      userEffectivePages = await getEffectivePagesForUser(this.prisma, {
        id: user.sub || user.id,
        role: user.role,
        tenantId: user.tenantId,
      });

      const requiredKeys = Array.isArray(requiredPage) ? requiredPage : [requiredPage];
      hasPageAccess = requiredKeys.some((k) => userEffectivePages!.includes(k));

      if (!hasPageAccess) {
        const rejectedKey = requiredKeys[0];
        const pageLabel = PAGE_LABEL_MAP[rejectedKey] || rejectedKey.charAt(0).toUpperCase() + rejectedKey.slice(1);
        throw new ForbiddenException({
          statusCode: 403,
          code: 'FORBIDDEN',
          message: `You do not have permission to use ${pageLabel}. Ask your administrator.`,
          pageKey: rejectedKey,
        });
      }
    }

    // 2. Check Role Hierarchy / Admin Restrictions
    if (requiredRoles && requiredRoles.length > 0) {
      let isAuthorized = requiredRoles.includes(user.role);

      if (!isAuthorized) {
        // tenant_admin (Client Super Admin) has full control over all tenant operational features
        if (user.role === 'tenant_admin' || user.role === 'platform_admin' || user.role === 'platform_super_admin') {
          const isPlatformOnly = requiredRoles.every((r) => r === 'platform_super_admin');
          if (!isPlatformOnly || user.role === 'platform_super_admin') {
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
        const pageKey = requiredPage ? (Array.isArray(requiredPage) ? requiredPage[0] : requiredPage) : null;
        const pageLabel = pageKey ? (PAGE_LABEL_MAP[pageKey] || pageKey.charAt(0).toUpperCase() + pageKey.slice(1)) : null;
        const message = pageLabel
          ? `You do not have permission to use ${pageLabel}. Ask your administrator.`
          : 'You do not have permission to perform this action. Ask your administrator.';

        throw new ForbiddenException({
          statusCode: 403,
          code: 'FORBIDDEN',
          message,
          ...(pageKey ? { pageKey } : {}),
        });
      }
    }

    return true;
  }
}


