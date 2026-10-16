/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { resolveTeamNavigation, PAGE_KEY_TO_ROUTE, ROLE_ONLY_PAGE } from '../../utils/team-navigation';
import { isPlatformOwner } from '../../utils/roles';

export { PAGE_KEY_TO_ROUTE, ROLE_ONLY_PAGE, resolveTeamNavigation };

export default function TeamPageGuard({ pageKey, children }: { pageKey: string; children: React.ReactNode }) {
  const { user } = useAuth();

  if (isPlatformOwner(user)) {
    return <>{children}</>;
  }

  const decision = resolveTeamNavigation(user, pageKey);

  if (decision.action === 'redirect' && decision.targetRoute) {
    return <Navigate to={decision.targetRoute} replace />;
  }

  if (decision.action === 'no_pages') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0F1117]">
        <div className="text-center p-8 max-w-sm">
          <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="text-amber-600 dark:text-amber-400" size={24} />
          </div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-2">No Pages Assigned</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Your team does not have access to any pages yet. Please contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
