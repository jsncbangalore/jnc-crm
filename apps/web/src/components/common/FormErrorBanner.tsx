/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState } from 'react';
import { AlertCircle, Copy, Check } from 'lucide-react';
import { ParsedApiError } from '../../utils/errorHelper';
import { generateSupportCode, isSupportCodeHidden } from '../../utils/supportCode';

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
  const [copied, setCopied] = useState(false);

  if (!error) return null;

  const isString = typeof error === 'string';
  const message = isString ? error : error.message;
  const requestId = !isString ? error.requestId : undefined;
  const supportCode = !isString && (error as any).supportCode ? (error as any).supportCode : generateSupportCode(requestId);
  const rawDetails = !isString ? error.rawDetails : error;

  const handleCopy = () => {
    if (rawDetails) {
      navigator.clipboard.writeText(rawDetails);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopySupportCode = () => {
    if (supportCode) {
      navigator.clipboard.writeText(supportCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
          {!isSupportCodeHidden() && supportCode && (
            <div className="flex flex-col gap-0.5 mt-0.5">
              <div className="flex items-center gap-1.5">
                <span data-testid="form-error-support-code" className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  Support code: <span className="font-bold select-all">{supportCode}</span>
                </span>
                <button
                  type="button"
                  onClick={handleCopySupportCode}
                  className="px-1.5 py-0.2 text-[10px] rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 transition cursor-pointer"
                  data-testid="copy-support-code-btn"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                If this keeps happening, contact support and quote this reference.
              </span>
            </div>
          )}
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
        {rawDetails && (
          <button
            type="button"
            onClick={handleCopy}
            data-testid="btn-copy-error-details"
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-700 dark:text-rose-300 flex items-center gap-1.5 transition"
            title="Copy error details"
          >
            {copied ? (
              <>
                <Check size={12} className="text-emerald-500" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy size={12} />
                <span>Copy details</span>
              </>
            )}
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
