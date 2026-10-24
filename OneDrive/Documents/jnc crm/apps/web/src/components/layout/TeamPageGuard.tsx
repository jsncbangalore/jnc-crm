/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, LogOut, ArrowRight, Lock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { resolveTeamNavigation, PAGE_KEY_TO_ROUTE, ROLE_ONLY_PAGE } from '../../utils/team-navigation';
import { isPlatformOwner } from '../../utils/roles';
import { COMPANY_PAGE_REGISTRY } from '../../config/page-registry';

export { PAGE_KEY_TO_ROUTE, ROLE_ONLY_PAGE, resolveTeamNavigation };

export default function TeamPageGuard({ pageKey, children }: { pageKey: string; children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (isPlatformOwner(user)) {
    return <>{children}</>;
  }

  const decision = resolveTeamNavigation(user, pageKey);

  // 1. User has zero pages assigned
  if (decision.action === 'no_pages') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0F1117] p-4 select-none">
        <div className="text-center p-8 max-w-md w-full bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto mb-4 border border-amber-500/20">
            <ShieldAlert size={28} />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No Access Granted</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
            Your account does not have access to any modules yet. Ask your administrator to give you access.
          </p>
          <button
            type="button"
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold text-sm transition-all shadow-sm"
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    );
  }

  // 2. Direct address to a page that is not granted
  if (decision.action === 'redirect') {
    const pageLabel = COMPANY_PAGE_REGISTRY[pageKey]?.label || pageKey;
    const targetRoute = decision.targetRoute || '/';

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0F1117] p-4 select-none">
        <div className="text-center p-8 max-w-md w-full bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto mb-4 border border-rose-500/20">
            <Lock size={28} />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No Access</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2 leading-relaxed">
            You do not have access to <span className="font-semibold text-slate-900 dark:text-white">{pageLabel}</span>.
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-6">
            Ask your administrator if you need permission for this page.
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => navigate(targetRoute)}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-crm-blue hover:bg-crm-blue-dark text-white font-semibold text-sm transition-all shadow-sm"
            >
              <span>Go to Available Page</span>
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs font-medium transition-all"
            >
              <LogOut size={14} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
