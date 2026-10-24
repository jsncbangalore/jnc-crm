/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/** Maps a pageKey to its route path so we never redirect blindly to "/" */
export const PAGE_KEY_TO_ROUTE: Record<string, string> = {
  dashboard: '/',
  leads: '/leads',
  lead_flow: '/lead-flow',
  lead_setup: '/start-setup',
  orders: '/orders',
  invoices: '/invoices',
  inventory: '/inventory',
  suppliers: '/purchase-bills',
  purchase_bills: '/purchase-bills',
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
  audit_logs: '/users?tab=audit',
  platform_companies: '/platform/companies',
  platform_admins: '/platform/admins',
  platform_backup: '/platform/backup',
};

/** Roles restricted to a specific page (single page locked roles) */
export const ROLE_ONLY_PAGE: Record<string, string> = {
  project_manager: 'daily_activities',
  developer_lead: 'daily_activities',
  developer: 'daily_activities',
};

/** Strict role-to-page baseline access rules */
export const ROLE_ALLOWED_PAGES: Record<string, string[]> = {
  tenant_admin: ['dashboard', 'leads', 'lead_flow', 'lead_setup', 'quotations', 'orders', 'invoices', 'inventory', 'suppliers', 'purchase_bills', 'shipments', 'daily_activities', 'notifications', 'custom_objects', 'automation', 'audit_logs', 'users', 'teams', 'branding', 'mail_settings'],
  admin: ['dashboard', 'leads', 'lead_flow', 'lead_setup', 'quotations', 'orders', 'invoices', 'inventory', 'suppliers', 'purchase_bills', 'shipments', 'daily_activities', 'notifications', 'custom_objects', 'automation', 'audit_logs', 'users', 'teams', 'branding', 'mail_settings'],
  sub_admin: ['dashboard', 'leads', 'lead_flow', 'quotations', 'orders', 'invoices', 'inventory', 'suppliers', 'purchase_bills', 'shipments', 'daily_activities', 'notifications'],
  employee: ['dashboard', 'leads', 'lead_flow', 'quotations', 'orders', 'notifications'],
  store_manager: ['dashboard', 'orders', 'inventory', 'suppliers', 'purchase_bills', 'shipments', 'notifications'],
  finance: ['dashboard', 'quotations', 'orders', 'invoices', 'suppliers', 'purchase_bills', 'notifications'],
  accountant: ['dashboard', 'quotations', 'orders', 'invoices', 'suppliers', 'purchase_bills', 'notifications'],
  developer: ['daily_activities', 'notifications'],
  developer_lead: ['daily_activities', 'notifications'],
  project_manager: ['daily_activities', 'notifications'],
};

/** Default landing route per role upon login */
export const ROLE_DEFAULT_LANDING: Record<string, string> = {
  tenant_admin: '/',
  admin: '/',
  sub_admin: '/',
  employee: '/leads',
  store_manager: '/inventory',
  finance: '/invoices',
  accountant: '/invoices',
  developer: '/daily-activities',
  developer_lead: '/daily-activities',
  project_manager: '/daily-activities',
};

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

  // Tenant admin has full access to all company pages
  if (user.role === 'tenant_admin') {
    return { action: 'allow' };
  }

  // If effectivePages is provided on the user object (from /auth/me or login)
  if (Array.isArray(user.effectivePages)) {
    if (user.effectivePages.length === 0) {
      return { action: 'no_pages' };
    }

    if (user.effectivePages.includes(pageKey)) {
      return { action: 'allow' };
    }

    // Direct access to a page without access: redirect or show no access with first allowed page
    const firstAllowedKey = user.effectivePages.find((k: string) => PAGE_KEY_TO_ROUTE[k]);
    const firstAllowedRoute = firstAllowedKey ? PAGE_KEY_TO_ROUTE[firstAllowedKey] : '/';
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

    if (allowedPages.length === 0) {
      return { action: 'no_pages' };
    }

    const hasAccess = allowedPages.includes(pageKey);
    if (!hasAccess) {
      const firstAllowed = allowedPages.find((p) => PAGE_KEY_TO_ROUTE[p]);
      const targetRoute = PAGE_KEY_TO_ROUTE[firstAllowed || ''] || '/';
      return { action: 'redirect', targetRoute, firstAllowedRoute: targetRoute };
    }
  }

  // Fallback to role-allowed pages if no team is set
  const roleAllowed = ROLE_ALLOWED_PAGES[user.role || ''];
  if (roleAllowed) {
    if (!roleAllowed.includes(pageKey)) {
      const defaultLanding = ROLE_DEFAULT_LANDING[user.role || ''] || '/';
      return { action: 'redirect', targetRoute: defaultLanding, firstAllowedRoute: defaultLanding };
    }
  }

  return { action: 'allow' };
}

