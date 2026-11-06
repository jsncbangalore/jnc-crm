/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React from 'react';
import { LogIn } from 'lucide-react';
import { UnifiedErrorComponent } from './UnifiedErrorComponent';

export interface ErrorStateCardProps {
  message: string;
  status?: number;
  code?: string;
  field?: string;
  page?: string;
  recordType?: string;
  referenceId?: string;
  isNetworkError?: boolean;
  onRetry?: () => void;
  onAction?: () => void;
  actionLabel?: string;
  className?: string;
  title?: string;
  compact?: boolean;
}

export function ErrorStateCard({
  message,
  status,
  code,
  field,
  page,
  recordType,
  referenceId,
  isNetworkError,
  onRetry,
  onAction,
  actionLabel,
  className = '',
  title,
  compact = false,
}: ErrorStateCardProps) {
  const is401 = status === 401 || message === 'Unauthorized' || message?.toLowerCase().includes('unauthorized') || message?.toLowerCase().includes('session expired');

  if (is401) {
    return (
      <div className={`rounded-2xl border p-6 text-center max-w-lg mx-auto my-8 bg-white dark:bg-[#181B26] border-slate-200 dark:border-slate-800 shadow-sm ${className}`}>
        <div className="flex justify-center mb-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            <LogIn size={24} />
          </div>
        </div>
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
          Session Expired
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-400 mb-5 leading-relaxed">
          Your login session has expired. Please sign in again to refresh your access.
        </p>
        <button
          onClick={() => {
            let hadSession = false;
            try {
              hadSession = Boolean(
                localStorage.getItem('crm_user') ||
                sessionStorage.getItem('crm_user') ||
                sessionStorage.getItem('crm_tab_user_id') ||
                localStorage.getItem('crm_refresh_token_fb') ||
                sessionStorage.getItem('crm_refresh_token_fb')
              );
              localStorage.removeItem('crm_staff_token');
              localStorage.removeItem('crm_platform_token');
              sessionStorage.clear();
              if (hadSession) {
                sessionStorage.setItem('crm_session_expired', 'Your session expired, please sign in');
              }
            } catch {}
            window.location.href = hadSession ? '/login?expired=1' : '/login';
          }}
          type="button"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-crm-blue text-white text-xs font-bold hover:bg-crm-blue-dark transition-all shadow-sm active:scale-95 cursor-pointer"
        >
          <LogIn size={14} />
          Sign In Again
        </button>
      </div>
    );
  }

  return (
    <UnifiedErrorComponent
      title={title}
      message={message}
      status={status}
      code={code}
      field={field}
      page={page}
      recordType={recordType}
      referenceId={referenceId}
      onRetry={onRetry}
      onAction={onAction}
      actionLabel={actionLabel}
      className={className}
      compact={compact}
    />
  );
}

export function parseApiError(err: any): {
  status?: number;
  message: string;
  isNetworkError: boolean;
  code?: string;
  field?: string;
  referenceId?: string;
} {
  const isNetworkError =
    !err?.response ||
    err.code === 'ERR_NETWORK' ||
    err.code === 'ECONNABORTED' ||
    err.message?.includes('Network Error') ||
    err.message?.includes('Failed to fetch');
  const status = err?.response?.status;
  const data = err?.response?.data || {};
  const code = data?.code;
  const field = data?.field || (data?.fieldErrors?.[0]?.field);
  const referenceId =
    data?.requestId ||
    err?.requestId ||
    (err?.response?.headers ? err.response.headers['x-request-id'] : null) ||
    'N/A';

  let message = 'An unexpected error occurred.';
  if (isNetworkError) {
    message = 'Cannot reach the server';
  } else if (code === 'SCHEMA_OUT_OF_DATE' || status === 503) {
    message = `The system needs an update. Nothing was lost. Ask your administrator (reference ${referenceId}).`;
  } else if (status === 403) {
    const dataMsg = data?.message || data?.error;
    message = Array.isArray(dataMsg)
      ? dataMsg.join(', ')
      : typeof dataMsg === 'string' && dataMsg.trim()
      ? dataMsg
      : 'Access forbidden. You do not have permission to view this resource.';
  } else {
    const dataMsg = data?.message || data?.error;
    message = Array.isArray(dataMsg)
      ? dataMsg.join(', ')
      : typeof dataMsg === 'string' && dataMsg.trim()
      ? dataMsg
      : err.message || 'Failed to load data from server.';
  }

  return { status, message, isNetworkError, code, field, referenceId };
}
