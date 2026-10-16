/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React from 'react';
import { ShieldAlert, ArrowRight, LogIn, AlertTriangle, X, Building2, User as UserIcon } from 'lucide-react';
import { SessionConflictDetail } from '../../utils/sessionSync';

interface SessionConflictModalProps {
  conflict: SessionConflictDetail | null;
  onSwitchToIncoming: (conflict: SessionConflictDetail) => void;
  onReLogin: (expectedEmail?: string) => void;
}

export const SessionConflictModal: React.FC<SessionConflictModalProps> = ({
  conflict,
  onSwitchToIncoming,
  onReLogin,
}) => {
  if (!conflict) return null;

  const expectedEmail = conflict.expectedUser?.email || 'Previous Account';
  const expectedTenant = conflict.expectedUser?.tenantName || conflict.expectedUser?.tenantCode || 'Workspace';
  const incomingEmail = conflict.incomingUser?.email || 'New Account';
  const incomingTenant =
    conflict.incomingUser?.tenant?.name ||
    conflict.incomingUser?.tenant?.code ||
    (conflict.incomingUser?.role === 'platform_super_admin' ? 'Platform Management' : 'Workspace');

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Header with Icon */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Multi-Account Tab Lock Active
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Another tab in this browser signed in as a different user. To protect your data and prevent accidental cross-tenant changes, background requests for this tab have been paused.
            </p>
          </div>
        </div>

        {/* Account Comparison Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Active Tab User */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              Current Tab User
            </div>
            <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-semibold text-sm truncate">
              <UserIcon className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="truncate" title={expectedEmail}>{expectedEmail}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 truncate">
              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{expectedTenant}</span>
            </div>
          </div>

          {/* Incoming Session */}
          <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/40 space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              New Session in Other Tab
            </div>
            <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-semibold text-sm truncate">
              <UserIcon className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="truncate" title={incomingEmail}>{incomingEmail}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 truncate">
              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{incomingTenant}</span>
            </div>
          </div>
        </div>

        {/* Security Rationale */}
        <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          <strong>Why is this happening?</strong> Web browsers share login cookies across all tabs under the same address. JNC CRM Tab Isolation prevents one tab from silently corrupting or modifying data in another tab&apos;s workspace.
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={() => onSwitchToIncoming(conflict)}
            className="flex-1 py-3 px-4 rounded-xl bg-crm-blue-DEFAULT hover:bg-crm-blue-600 text-white font-medium text-sm transition-all shadow-md flex items-center justify-center gap-2"
          >
            <span>Switch to {incomingEmail}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onReLogin(conflict.expectedUser?.email)}
            className="py-3 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium text-sm transition-all flex items-center justify-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            <span>Sign in as {expectedEmail}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface CrossTabNoticeBannerProps {
  notice: {
    otherEmail: string;
    otherTenant: string;
    currentEmail: string;
    currentTenant: string;
  } | null;
  onSwitchTab: () => void;
  onDismiss: () => void;
}

export const CrossTabNoticeBanner: React.FC<CrossTabNoticeBannerProps> = ({
  notice,
  onSwitchTab,
  onDismiss,
}) => {
  if (!notice) return null;

  return (
    <div className="sticky top-0 z-[9000] w-full bg-gradient-to-r from-amber-500/90 via-amber-600/90 to-orange-600/90 text-white shadow-md backdrop-blur-md px-4 py-2.5 text-xs sm:text-sm animate-in slide-in-from-top duration-300">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 text-center sm:text-left">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-100 animate-pulse" />
          <span>
            <strong>Account Session Isolation:</strong> Another tab signed in as{' '}
            <span className="font-semibold underline decoration-white/50">{notice.otherEmail}</span> ({notice.otherTenant}). This tab is isolated to{' '}
            <span className="font-semibold">{notice.currentEmail}</span>.
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onSwitchTab}
            className="px-3 py-1 rounded-lg bg-white text-amber-900 font-semibold text-xs hover:bg-amber-50 transition-colors shadow-sm"
          >
            Switch to New Account
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss banner"
            className="p-1 rounded-lg hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
