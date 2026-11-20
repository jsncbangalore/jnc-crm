/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Centralized Role Definitions & Hierarchy (Frontend)
 */

export * from '../config/roles-permissions';

import {
  ALL_ROLE_KEYS,
  TENANT_ROLE_KEYS,
  ROLE_RANKS,
  ROLE_LABELS,
  RoleKey,
  TenantRoleKey,
  normalizeRole,
} from '../config/roles-permissions';
import { PAGE_KEY_TO_ROUTE, COMPANY_PAGE_REGISTRY } from '../config/page-registry';

export const ALL_ROLES = ALL_ROLE_KEYS;
export type UserRole = RoleKey;

/**
 * Returns true if the user is the Platform Owner (vendor super admin with no tenant)
 */
export function isPlatformOwner(user?: { role?: string; tenantId?: string | null } | null): boolean {
  if (!user) return false;
  return user.role === 'platform_super_admin' && !user.tenantId;
}

/**
 * Determines redirect path based on user role and tenant
 */
export function getRoleRedirectPath(user?: { role?: string; tenantId?: string | null; effectivePages?: string[]; homePage?: string | null } | null): string {
  if (!user) return '/login';
  if (isPlatformOwner(user)) {
    return '/platform/companies';
  }

  // If user has effectivePages defined, validate landing path strictly against granted pages
  if (Array.isArray(user.effectivePages)) {
    if (user.effectivePages.length === 0) {
      return '/';
    }
    const pages = user.effectivePages.map((k) => (k === 'purchase_bills' ? 'bills' : k));
    if (user.homePage && pages.includes(user.homePage) && PAGE_KEY_TO_ROUTE[user.homePage]) {
      return PAGE_KEY_TO_ROUTE[user.homePage];
    }
    for (const key of Object.keys(COMPANY_PAGE_REGISTRY)) {
      if (pages.includes(key) && PAGE_KEY_TO_ROUTE[key]) {
        return PAGE_KEY_TO_ROUTE[key];
      }
    }
    return PAGE_KEY_TO_ROUTE[pages[0]] || '/';
  }

  const norm = normalizeRole(user.role);
  switch (norm) {
    case 'administrator':
    case 'sub_administrator':
      return '/dashboard';
    case 'sales_representative':
      return '/leads';
    case 'developer':
    case 'developer_lead':
    case 'project_manager':
      return '/daily-activities';
    case 'store_inventory_manager':
      return '/inventory';
    case 'finance_specialist':
    case 'accountant':
      return '/invoices';
    default:
      return '/dashboard';
  }
}

