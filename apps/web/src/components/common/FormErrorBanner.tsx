/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React from 'react';
import { AlertCircle } from 'lucide-react';
import { ParsedApiError } from '../../utils/errorHelper';

interface FormErrorBannerProps {
  error: ParsedApiError | string | null | undefined;
  className?: string;
  onDismiss?: () => void;
  onRetry?: () => void;
  retryTestId?: string;
}

export const FormErrorBanner: React.FC<FormErrorBannerProps> = ({
  error,
  className = '',
  onDismiss,
  onRetry,
  retryTestId,
}) => {
  if (!error) return null;

  const isString = typeof error === 'string';
  const message = isString ? error : error.message;

  return (
    <div
      role="alert"
      data-testid="form-error-banner"
      className={`p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-600 dark:text-rose-400 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-all animate-fadeIn ${className}`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <AlertCircle size={17} className="shrink-0 mt-0.5 text-rose-500" />
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="font-semibold text-slate-900 dark:text-rose-200 break-words leading-snug">
            {message}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            data-testid={retryTestId || 'btn-retry'}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5 transition cursor-pointer"
          >
            Retry
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs px-1"
          >
            &times;
          </button>
        )}
      </div>
    </div>
  );
};

export default FormErrorBanner;
