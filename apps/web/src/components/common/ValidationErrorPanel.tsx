import React from 'react';
import { AlertTriangle, ArrowRight, X, AlertCircle } from 'lucide-react';
import { ParsedValidationError, jumpToErrorField } from '../../utils/validationErrorHandler';

interface ValidationErrorPanelProps {
  errors: ParsedValidationError[];
  onClear?: () => void;
  title?: string;
}

export const ValidationErrorPanel: React.FC<ValidationErrorPanelProps> = ({
  errors,
  onClear,
  title,
}) => {
  if (!errors || errors.length === 0) return null;

  const count = errors.length;
  const headerTitle =
    title ||
    `${count} ${count === 1 ? 'Validation Issue' : 'Validation Issues'} Found`;

  return (
    <div
      role="alert"
      className="p-4 rounded-xl border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 text-rose-950 dark:text-rose-100 shadow-md space-y-3 transition-all animate-fadeIn"
    >
      {/* Header with Count & Dismiss */}
      <div className="flex items-start justify-between gap-3 border-b border-rose-200 dark:border-rose-500/30 pb-2.5">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-rose-500 text-white shadow-sm flex items-center justify-center">
            <AlertTriangle size={16} />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-black tracking-wide flex items-center gap-2">
              <span>{headerTitle}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-200 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-700">
                {count} {count === 1 ? 'error' : 'errors'}
              </span>
            </h4>
            <p className="text-[11px] text-rose-700 dark:text-rose-300 mt-0.5">
              Click any issue below to jump directly to the field and fix the error.
            </p>
          </div>
        </div>

        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="p-1 rounded-md text-rose-500 hover:text-rose-700 dark:hover:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors"
            title="Dismiss error list"
            aria-label="Dismiss"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Discrete, spaced error cards with gap */}
      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {errors.map((err, idx) => {
          const hasTarget = !!err.domId;

          return (
            <div
              key={err.id || idx}
              onClick={() => {
                if (hasTarget) {
                  jumpToErrorField(err.domId);
                }
              }}
              className={`p-2.5 rounded-lg border text-xs transition-all flex items-center justify-between gap-3 ${
                hasTarget
                  ? 'cursor-pointer bg-white dark:bg-[#1E2230] border-rose-200 dark:border-rose-500/30 hover:border-rose-400 dark:hover:border-rose-400 hover:shadow-md hover:bg-rose-50/50 dark:hover:bg-rose-900/20 group'
                  : 'bg-white/60 dark:bg-[#1E2230]/60 border-rose-100 dark:border-rose-500/20'
              }`}
              title={hasTarget ? `Click to jump to ${err.fieldLabel}` : undefined}
            >
              <div className="flex items-start gap-2 min-w-0">
                <AlertCircle
                  size={14}
                  className="text-rose-500 dark:text-rose-400 shrink-0 mt-0.5"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {err.fieldLabel}:
                    </span>
                    <span className="text-rose-900 dark:text-rose-200 font-medium">
                      {err.humanMsg}
                    </span>
                  </div>
                </div>
              </div>

              {hasTarget && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    jumpToErrorField(err.domId);
                  }}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-rose-100 hover:bg-rose-200 dark:bg-rose-500/20 dark:hover:bg-rose-500/30 text-rose-700 dark:text-rose-300 transition-colors group-hover:scale-105"
                >
                  <span>Go to field</span>
                  <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
