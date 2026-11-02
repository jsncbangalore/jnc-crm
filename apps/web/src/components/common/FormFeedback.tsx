/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

export interface FormFeedbackProps {
  error?: string | null;
  success?: string | null;
  className?: string;
  onDismiss?: () => void;
  'data-testid'?: string;
}

/**
 * Shared in-form message component for errors and success notices.
 * Appears inside the form flow (near save buttons and headers), never as a detached toast or overlay.
 */
export function FormFeedback({
  error,
  success,
  className = '',
  onDismiss,
  'data-testid': testId,
}: FormFeedbackProps) {
  if (!error && !success) return null;

  if (error) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        data-testid={testId || 'form-feedback-error'}
        className={`p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5 shadow-2xs ${className}`}
      >
        <AlertCircle size={15} className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
        <span className="flex-1 font-semibold leading-relaxed">{error}</span>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-200 transition-colors p-0.5"
            aria-label="Dismiss error"
          >
            <X size={13} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid={testId || 'form-feedback-success'}
      className={`p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 text-xs flex items-start gap-2.5 shadow-2xs ${className}`}
    >
      <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
      <span className="flex-1 font-semibold leading-relaxed">{success}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-200 transition-colors p-0.5"
          aria-label="Dismiss success message"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

export interface FormFieldErrorProps {
  error?: string | null;
  id?: string;
  className?: string;
  'data-testid'?: string;
}

/**
 * Shared field-level error message rendered immediately underneath form inputs.
 */
export function FormFieldError({
  error,
  id,
  className = '',
  'data-testid': testId,
}: FormFieldErrorProps) {
  if (!error) return null;

  return (
    <p
      id={id}
      role="alert"
      data-testid={testId || 'form-field-error'}
      className={`text-rose-600 dark:text-rose-400 text-[11px] font-semibold mt-1 flex items-center gap-1 leading-tight ${className}`}
    >
      <AlertCircle size={11} className="shrink-0" />
      <span>{error}</span>
    </p>
  );
}

export default FormFeedback;
