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
  orders: '/orders',
  invoices: '/invoices',
  inventory: '/inventory',
  suppliers: '/suppliers',
  shipments: '/shipments',
  quotations: '/quotations',
  users: '/users',
  automation: '/automation',
  custom_objects: '/setup/objects',
  daily_activities: '/daily-activities',
};

/** Roles restricted to a specific page */
export const ROLE_ONLY_PAGE: Record<string, string> = {
  project_manager: 'daily_activities',
  developer_lead: 'daily_activities',
  developer: 'daily_activities',
  store_manager: 'inventory',
};

export interface NavigationDecision {
  action: 'allow' | 'redirect' | 'no_pages';
  targetRoute?: string;
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
    return { action: 'redirect', targetRoute: '/platform/companies' };
  }

  // Tenant admin and sub-admin roles bypass team module restrictions
  if (user.role === 'tenant_admin' || user.role === 'admin' || user.role === 'sub_admin') {
    return { action: 'allow' };
  }

  // Roles locked to a single page
  const onlyPage = ROLE_ONLY_PAGE[user.role || ''];
  if (onlyPage) {
    if (pageKey !== onlyPage) {
      return { action: 'redirect', targetRoute: PAGE_KEY_TO_ROUTE[onlyPage] || '/' };
    }
    return { action: 'allow' };
  }

  // Team-scoped access: check allowedPages
  if (user.teamId && user.teamRef) {
    let allowedPages: string[] = [];
    try {
      allowedPages = typeof user.teamRef.allowedPages === 'string'
        ? JSON.parse(user.teamRef.allowedPages || '[]')
        : (user.teamRef.allowedPages || []);
    } catch {
      allowedPages = [];
    }

    // Empty allowedPages = no access to any page
    if (allowedPages.length === 0) {
      return { action: 'no_pages' };
    }

    if (!allowedPages.includes(pageKey)) {
      // Redirect to the FIRST page the team is allowed to access
      const firstAllowed = allowedPages.find((p) => PAGE_KEY_TO_ROUTE[p]);
      return { action: 'redirect', targetRoute: PAGE_KEY_TO_ROUTE[firstAllowed || ''] || '/' };
    }
  }

  // No team restriction or page is explicitly allowed
  return { action: 'allow' };
}
