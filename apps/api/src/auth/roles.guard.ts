/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { PAGE_ACCESS_KEY, IS_PUBLIC_KEY } from './page-access.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { getEffectivePermissionsForUser } from './effective-page-access';
import {
  canAccessPage,
  normalizeRole,
  normalizeCompanyPageKey,
  ROLE_RANKS,
  PageAction,
  EffectiveAccessResult,
} from '../common/roles-permissions';

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
  dashboard: 'Dashboard',
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

    // Impersonation restriction: Cannot call platform administration endpoints while impersonating
    if (user.isImpersonating) {
      const path = (req.path || req.url || '').toLowerCase();
      const isPlatformRoute = path.includes('/platform/') || path.includes('/platform-auth/') || path.endsWith('/platform') || path.endsWith('/platform-auth');
      const isPlatformRole = requiredRoles && requiredRoles.includes('platform_super_admin');
      if (isPlatformRoute || isPlatformRole) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'FORBIDDEN',
          message: 'Cannot access platform administration endpoints while impersonating a company workspace. Exit impersonation first.',
        });
      }
    }

    const normUserRole = normalizeRole(user.role);

    // Determine requested action from HTTP method
    const method = (req.method || 'GET').toUpperCase();
    const requestedAction: PageAction =
      method === 'POST' || method === 'PUT' || method === 'PATCH'
        ? 'create_edit'
        : method === 'DELETE'
        ? 'delete'
        : 'view';

    let effectiveAccess: EffectiveAccessResult | null = null;
    let matchingPageKey: string | undefined;

    // 1. Check Page Access and Action Permission (Requirement B & C)
    if (requiredPage) {
      effectiveAccess = await getEffectivePermissionsForUser(this.prisma, {
        id: user.sub || user.id,
        role: user.role,
        tenantId: user.tenantId,
      });

      const requiredKeys = Array.isArray(requiredPage) ? requiredPage : [requiredPage];
      
      // Does user have view access to any of the required page keys?
      matchingPageKey = requiredKeys.find((k) => canAccessPage(effectiveAccess!, k, 'view'));

      if (!matchingPageKey) {
        const rejectedKey = requiredKeys[0];
        const pageLabel = PAGE_LABEL_MAP[rejectedKey] || rejectedKey.charAt(0).toUpperCase() + rejectedKey.slice(1);
        throw new ForbiddenException({
          statusCode: 403,
          code: 'FORBIDDEN',
          message: `You do not have permission to use ${pageLabel}. Ask your administrator.`,
          pageKey: rejectedKey,
        });
      }

      // If mutation method (POST/PUT/PATCH/DELETE), check if action is permitted (Requirement C)
      if (requestedAction !== 'view') {
        const canMutate = requiredKeys.some((k) => canAccessPage(effectiveAccess!, k, requestedAction));
        if (!canMutate && normUserRole !== 'administrator') {
          const pageLabel = PAGE_LABEL_MAP[matchingPageKey] || matchingPageKey.charAt(0).toUpperCase() + matchingPageKey.slice(1);
          throw new ForbiddenException({
            statusCode: 403,
            code: 'FORBIDDEN',
            message: `You have view-only access to ${pageLabel}. Modifications are not permitted.`,
            pageKey: matchingPageKey,
            action: requestedAction,
          });
        }
      }
    }

    // 2. Check Role Hierarchy / Specific Role Restrictions (Requirement A & D)
    if (requiredRoles && requiredRoles.length > 0) {
      let isAuthorized = false;

      // Administrator / Platform Super Admin has full authority over all tenant operations
      if (normUserRole === 'administrator' || user.role === 'platform_super_admin' || user.role === 'platform_admin') {
        const isPlatformOnly = requiredRoles.every((r) => r === 'platform_super_admin');
        if (!isPlatformOnly || user.role === 'platform_super_admin') {
          isAuthorized = true;
        }
      } else {
        const normRequiredRoles = requiredRoles.map((r) => normalizeRole(r));

        // Direct match with normalized role
        if (normRequiredRoles.includes(normUserRole)) {
          isAuthorized = true;
        }
        // Sub-Administrator has operational admin powers over all roles with rank <= 80
        else if (normUserRole === 'sub_administrator') {
          const userRank = ROLE_RANKS['sub_administrator'] || 80;
          // Sub-admin satisfies any decorator requiring sub_admin, employee, or lower rank roles
          if (requiredRoles.some((r) => ['sub_admin', 'sub_administrator', 'employee', 'sales_representative'].includes(r) || (ROLE_RANKS[r] || 0) <= userRank)) {
            isAuthorized = true;
          }
        }
        // If decorator required regular employee / sales rep, any tenant user who passed page access satisfies it
        else if (requiredRoles.includes('employee') || normRequiredRoles.includes('sales_representative')) {
          isAuthorized = true;
        }

        // Honor explicit Admin Extra Access grants for operational modules (non-platform, non-user/team privilege escalation, non-destructive wipe)
        if (!isAuthorized && matchingPageKey && effectiveAccess?.explicitPages) {
          const canonMatch = normalizeCompanyPageKey(matchingPageKey);
          const reqPath = String(req.path || req.url || '').toLowerCase();
          const isPlatformOnly = requiredRoles.every((r) => r === 'platform_super_admin');
          const isPrivilegedControlRoute =
            canonMatch === 'users' ||
            canonMatch === 'teams' ||
            reqPath.includes('clear-all') ||
            reqPath.includes('reset-demo');
          if (!isPlatformOnly && !isPrivilegedControlRoute && effectiveAccess.explicitPages.includes(canonMatch)) {
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
