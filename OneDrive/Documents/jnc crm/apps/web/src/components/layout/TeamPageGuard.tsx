/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

import { isPlatformOwner } from '../../utils/roles';

/** Maps a pageKey to its route path so we never redirect blindly to "/" */
const PAGE_KEY_TO_ROUTE: Record<string, string> = {
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
const ROLE_ONLY_PAGE: Record<string, string> = {
  project_manager: 'daily_activities',
  developer_lead: 'daily_activities',
  developer: 'daily_activities',
  store_manager: 'inventory',
};

export default function TeamPageGuard({ pageKey, children }: { pageKey: string; children: React.ReactNode }) {
  const { user } = useAuth();

  // Platform owner without tenant cannot open company CRM pages; redirect to platform hub
  if (isPlatformOwner(user)) {
    return <Navigate to="/platform/companies" replace />;
  }

  // Tenant admin and sub-admin roles bypass team module restrictions
  if (user?.role === 'tenant_admin' || user?.role === 'admin' || user?.role === 'sub_admin') {
    return <>{children}</>;
  }

  // Roles locked to a single page
  const onlyPage = ROLE_ONLY_PAGE[user?.role || ''];
  if (onlyPage) {
    if (pageKey !== onlyPage) {
      return <Navigate to={PAGE_KEY_TO_ROUTE[onlyPage] || '/'} replace />;
    }
    return <>{children}</>;
  }

  // Team-scoped access: check allowedPages
  if (user?.teamId && user?.teamRef) {
    let allowedPages: string[] = [];
    try {
      allowedPages = typeof user.teamRef.allowedPages === 'string'
        ? JSON.parse(user.teamRef.allowedPages || '[]')
        : (user.teamRef.allowedPages || []);
    } catch {
      allowedPages = [];
    }

    // Empty allowedPages = no access to any page (show a clear screen instead of loop)
    if (allowedPages.length === 0) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0F1117]">
          <div className="text-center p-8 max-w-sm">
            <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
              <span className="text-amber-600 dark:text-amber-400 text-xl">⚠</span>
            </div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-2">No Pages Assigned</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Your team does not have access to any pages yet. Please contact your administrator.
            </p>
          </div>
        </div>
      );
    }

    if (!allowedPages.includes(pageKey)) {
      // Redirect to the FIRST page the team is allowed to access
      const firstAllowed = allowedPages.find((p) => PAGE_KEY_TO_ROUTE[p]);
      return <Navigate to={PAGE_KEY_TO_ROUTE[firstAllowed || ''] || '/'} replace />;
    }
  }

  // No team restriction or page is explicitly allowed
  return <>{children}</>;
}
