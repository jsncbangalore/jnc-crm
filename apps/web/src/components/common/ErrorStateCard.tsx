import React from 'react';
import { AlertTriangle, WifiOff, ShieldAlert, RefreshCw, LogIn } from 'lucide-react';

export interface ErrorStateCardProps {
  message: string;
  status?: number;
  isNetworkError?: boolean;
  onRetry?: () => void;
  className?: string;
  title?: string;
}

export function ErrorStateCard({
  message,
  status,
  isNetworkError,
  onRetry,
  className = '',
  title,
}: ErrorStateCardProps) {
  const is401 = status === 401 || message === 'Unauthorized' || message?.toLowerCase().includes('unauthorized') || message?.toLowerCase().includes('session expired');
  const is403 = status === 403;

  const defaultTitle = is401
    ? 'Session Expired'
    : is403
    ? 'Access Denied'
    : isNetworkError
    ? 'Connection Failed'
    : 'Failed to Load Data';

  return (
    <div
      className={`rounded-2xl border p-6 text-center max-w-lg mx-auto my-8 bg-white dark:bg-[#181B26] shadow-sm ${
        is403
          ? 'border-amber-200 dark:border-amber-900/50'
          : isNetworkError
          ? 'border-rose-200 dark:border-rose-900/50'
          : 'border-slate-200 dark:border-slate-800'
      } ${className}`}
    >
      <div className="flex justify-center mb-3">
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            is403
              ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400'
              : isNetworkError
              ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
          }`}
        >
          {is401 ? (
            <LogIn size={24} />
          ) : is403 ? (
            <ShieldAlert size={24} />
          ) : isNetworkError ? (
            <WifiOff size={24} />
          ) : (
            <AlertTriangle size={24} />
          )}
        </div>
      </div>

      <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
        {title || defaultTitle}
      </h3>

      <p className="text-xs text-slate-600 dark:text-slate-400 mb-5 leading-relaxed">
        {is401 ? 'Your login session has expired. Please sign in again to refresh your access.' : message}
      </p>

      {is401 ? (
        <button
          onClick={() => {
            try {
              localStorage.removeItem('crm_staff_token');
              localStorage.removeItem('crm_platform_token');
              sessionStorage.clear();
            } catch {}
            window.location.href = '/login?expired=1';
          }}
          type="button"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-crm-blue text-white text-xs font-bold hover:bg-crm-blue-dark transition-all shadow-sm active:scale-95 cursor-pointer"
        >
          <LogIn size={14} />
          Sign In Again
        </button>
      ) : onRetry && (
        <button
          onClick={onRetry}
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-crm-blue text-white text-xs font-bold hover:bg-crm-blue-dark transition-all shadow-sm active:scale-95 cursor-pointer"
        >
          <RefreshCw size={13} />
          Retry
        </button>
      )}
    </div>
  );
}

export function parseApiError(err: any): { status?: number; message: string; isNetworkError: boolean } {
  const isNetworkError =
    !err?.response ||
    err.code === 'ERR_NETWORK' ||
    err.code === 'ECONNABORTED' ||
    err.message?.includes('Network Error') ||
    err.message?.includes('Failed to fetch');
  const status = err?.response?.status;

  let message = 'An unexpected error occurred.';
  if (isNetworkError) {
    message = 'Cannot reach the server';
  } else if (status === 403) {
    const dataMsg = err?.response?.data?.message || err?.response?.data?.error;
    message = Array.isArray(dataMsg)
      ? dataMsg.join(', ')
      : typeof dataMsg === 'string' && dataMsg.trim()
      ? dataMsg
      : 'Access forbidden. You do not have permission to view this resource.';
  } else {
    const dataMsg = err?.response?.data?.message || err?.response?.data?.error;
    message = Array.isArray(dataMsg)
      ? dataMsg.join(', ')
      : typeof dataMsg === 'string' && dataMsg.trim()
      ? dataMsg
      : err.message || 'Failed to load data from server.';
  }

  return { status, message, isNetworkError };
}
