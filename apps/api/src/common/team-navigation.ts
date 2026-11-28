/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import {
  ALL_CANONICAL_PAGES,
  TENANT_ROLE_KEYS,
  getRoleDefaultPermissions,
  getDefaultHomePageForRole,
  isTenantAdminRole,
  normalizeRole,
  normalizeCompanyPageKey,
} from './roles-permissions';

/** Maps a pageKey to its route path so we never redirect blindly to "/" */
export const PAGE_KEY_TO_ROUTE: Record<string, string> = {
  dashboard: '/dashboard',
  leads: '/leads',
  lead_flow: '/lead-flow',
  lead_setup: '/start-setup',
  orders: '/orders',
  invoices: '/invoices',
  ledger: '/ledger',
  inventory: '/inventory',
  suppliers: '/suppliers',
  bills: '/bills',
  purchase_bills: '/bills',
  shipments: '/shipments',
  quotations: '/quotations',
  users: '/users',
  teams: '/users?tab=teams',
  branding: '/settings/branding',
  mail_settings: '/settings/mail',
  automation: '/automation',
  custom_objects: '/setup/objects',
  daily_activities: '/daily-activities',
  notifications: '/notifications',
  audit_logs: '/audit-logs',
  platform_companies: '/platform/companies',
  platform_admins: '/platform/admins',
  platform_backup: '/platform/backup',
};

/** Deprecated single-page lockouts removed: all roles use unified roles-permissions defaults + mandatory Daily Activities */
export const ROLE_ONLY_PAGE: Record<string, string> = {};

/** Canonical role-to-page baseline access derived directly from roles-permissions */
export const ROLE_ALLOWED_PAGES: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {};
  for (const roleKey of [...TENANT_ROLE_KEYS, 'tenant_admin', 'admin', 'sub_admin', 'employee', 'store_manager', 'finance']) {
    map[roleKey] = Object.keys(getRoleDefaultPermissions(roleKey));
  }
  map.administrator = [...ALL_CANONICAL_PAGES];
  map.tenant_admin = [...ALL_CANONICAL_PAGES];
  map.admin = [...ALL_CANONICAL_PAGES];
  return map;
})();

/** Default landing route per role upon login derived from ROLE_DEFAULT_HOME_PAGE */
export const ROLE_DEFAULT_LANDING: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const roleKey of [...TENANT_ROLE_KEYS, 'tenant_admin', 'admin', 'sub_admin', 'employee', 'store_manager', 'finance']) {
    const homeKey = getDefaultHomePageForRole(roleKey);
    map[roleKey] = PAGE_KEY_TO_ROUTE[homeKey] || '/dashboard';
  }
  return map;
})();

export interface NavigationDecision {
  action: 'allow' | 'redirect' | 'no_pages';
  targetRoute?: string;
  firstAllowedRoute?: string;
}

/**
 * Pure function determining navigation outcome for a user accessing a specific pageKey.
 * Used by TeamPageGuard in React frontend and verified in test suite.
 */
export function resolveTeamNavigation(user: any, pageKey: string): NavigationDecision {
  if (!user) {
    return { action: 'redirect', targetRoute: '/login' };
  }

  // Platform owner without tenant cannot open company CRM pages; redirect to platform hub
  const isPlatformSuperAdmin = user.role === 'platform_super_admin' && !user.tenantId;
  if (isPlatformSuperAdmin) {
    if (pageKey.startsWith('platform')) {
      return { action: 'allow' };
    }
    return { action: 'redirect', targetRoute: '/platform/companies' };
  }

  // Tenant admin / Administrator has full access to all company pages
  if (isTenantAdminRole(user.role)) {
    return { action: 'allow' };
  }

  // If effectivePages is provided on the user object (from /auth/me or login)
  if (Array.isArray(user.effectivePages)) {
    if (user.effectivePages.length === 0) {
      return { action: 'no_pages' };
    }

    const canonPage = normalizeCompanyPageKey(pageKey);
    const hasKey =
      user.effectivePages.includes(pageKey) ||
      user.effectivePages.includes(canonPage) ||
      (pageKey === 'bills' && user.effectivePages.includes('purchase_bills')) ||
      (pageKey === 'purchase_bills' && user.effectivePages.includes('bills'));
    if (hasKey) {
      return { action: 'allow' };
    }

    // Direct access to a page without access: redirect or show no access with first allowed page
    const firstAllowedKey = user.effectivePages.find((k: string) => PAGE_KEY_TO_ROUTE[k]);
    const firstAllowedRoute = firstAllowedKey ? PAGE_KEY_TO_ROUTE[firstAllowedKey] : (ROLE_DEFAULT_LANDING[normalizeRole(user.role)] || '/daily-activities');
    return {
      action: 'redirect',
      targetRoute: firstAllowedRoute,
      firstAllowedRoute,
    };
  }

  // Fallback if effectivePages is not yet loaded:
  if (user.teamId && user.teamRef) {
    let allowedPages: string[] = [];
    try {
      allowedPages = typeof user.teamRef.allowedPages === 'string'
        ? JSON.parse(user.teamRef.allowedPages || '[]')
        : (user.teamRef.allowedPages || []);
    } catch {
      allowedPages = [];
    }

    if (allowedPages.length > 0) {
      const canonPage = normalizeCompanyPageKey(pageKey);
      const hasAccess = allowedPages.includes(pageKey) || allowedPages.includes(canonPage);
      if (!hasAccess) {
        const firstAllowed = allowedPages.find((p) => PAGE_KEY_TO_ROUTE[p]);
        const targetRoute = PAGE_KEY_TO_ROUTE[firstAllowed || ''] || ROLE_DEFAULT_LANDING[normalizeRole(user.role)] || '/daily-activities';
        return { action: 'redirect', targetRoute, firstAllowedRoute: targetRoute };
      }
      return { action: 'allow' };
    }
  }

  // Fallback to role-allowed pages if no team is set
  const normRole = normalizeRole(user.role);
  const roleAllowed = ROLE_ALLOWED_PAGES[normRole] || ROLE_ALLOWED_PAGES[user.role || ''];
  if (roleAllowed) {
    const canonPage = normalizeCompanyPageKey(pageKey);
    if (!roleAllowed.includes(pageKey) && !roleAllowed.includes(canonPage)) {
      const defaultLanding = ROLE_DEFAULT_LANDING[normRole] || ROLE_DEFAULT_LANDING[user.role || ''] || '/daily-activities';
      return { action: 'redirect', targetRoute: defaultLanding, firstAllowedRoute: defaultLanding };
    }
  }

  return { action: 'allow' };
}

