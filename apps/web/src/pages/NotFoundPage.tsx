import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Home, ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAllowedPages } from '../hooks/useAllowedPages';
import { isTenantAdminRole } from '../config/roles-permissions';

export default function NotFoundPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { homePageRoute, hasPage } = useAllowedPages();

  const homeTarget = isAuthenticated ? (homePageRoute || '/dashboard') : '/login';
  const showSystemErrors = isAuthenticated && (isTenantAdminRole(user?.role) || hasPage('audit_logs'));

  return (
    <div
      data-testid="not-found-page"
      className="min-h-screen bg-slate-50 dark:bg-[#0F1117] flex items-center justify-center p-6 text-center select-none"
    >
      <div className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl max-w-md w-full p-8 shadow-2xl space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
          <AlertTriangle size={32} />
        </div>

        <div>
          <span className="inline-block text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 mb-2">
            HTTP 404 — Page Not Found
          </span>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            We couldn&apos;t find this page
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
            The route <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono">{location.pathname}</code> does not exist or may have been moved.
          </p>
        </div>

        <div className="pt-2 flex flex-wrap gap-2 justify-center">
          <button
            type="button"
            data-testid="error-go-home"
            onClick={() => navigate(homeTarget)}
            className="btn-primary text-xs px-4 py-2 gap-1.5 inline-flex items-center cursor-pointer"
          >
            <Home size={14} />
            <span>{isAuthenticated ? 'Go to Home Screen' : 'Go to Login'}</span>
          </button>

          <button
            type="button"
            data-testid="error-go-back"
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate(homeTarget);
              }
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>Go Back</span>
          </button>

          {showSystemErrors && (
            <button
              type="button"
              onClick={() => navigate('/system-errors')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800/50 bg-indigo-50 dark:bg-indigo-950/30 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition cursor-pointer"
            >
              <ShieldAlert size={14} />
              <span>System Error Logs</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
