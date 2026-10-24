/* --- REUSABLE ACCESSIBLE FORM FIELD LAYER ---
 * Accessible labels, error text with aria-describedby, character counters,
 * required indicator, light/dark mode, and input filtering.
 * -------------------------------------------------------------------------- */

import React, { useId, forwardRef } from 'react';
import { AlertCircle } from 'lucide-react';

export interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> {
  label?: string;
  error?: string | null;
  helperText?: string;
  required?: boolean;
  as?: 'input' | 'textarea' | 'select';
  showCount?: boolean;
  maxLength?: number;
  icon?: React.ReactNode;
  rightElement?: React.ReactNode;
  containerClassName?: string;
  options?: Array<{ label: string; value: string | number; disabled?: boolean }>;
  rows?: number;
}

export const FormField = forwardRef<HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement, FormFieldProps>(
  (
    {
      label,
      error,
      helperText,
      required,
      as = 'input',
      showCount = false,
      maxLength,
      icon,
      rightElement,
      containerClassName = '',
      className = '',
      options,
      value,
      id: customId,
      disabled,
      ...rest
    },
    ref
  ) => {
    const autoId = useId();
    const id = customId || autoId;
    const errorId = `${id}-error`;
    const helperId = `${id}-helper`;

    const currentLength = typeof value === 'string' ? value.length : typeof value === 'number' ? String(value).length : 0;
    const hasError = Boolean(error);

    const baseInputStyles = `w-full rounded-xl text-xs transition-all outline-none font-medium ${
      hasError
        ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-red-900 dark:text-red-200 bg-red-50/40 dark:bg-red-950/20 border'
        : 'border-slate-300 dark:border-[#2A3042] focus:border-crm-blue focus:ring-2 focus:ring-crm-blue/20 bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white border'
    } ${disabled ? 'opacity-60 cursor-not-allowed bg-slate-100 dark:bg-[#141722]' : ''}`;

    return (
      <div className={`space-y-1.5 text-left ${containerClassName}`}>
        {label && (
          <div className="flex items-center justify-between">
            <label
              htmlFor={id}
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 select-none"
            >
              {label}
              {required && <span className="text-red-500 ml-0.5 font-bold" aria-hidden="true">*</span>}
            </label>
            {showCount && maxLength && (
              <span
                className={`text-[10px] font-mono ${
                  currentLength >= maxLength ? 'text-red-500 font-bold' : 'text-slate-400'
                }`}
                aria-live="polite"
              >
                {currentLength}/{maxLength}
              </span>
            )}
          </div>
        )}

        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none flex items-center justify-center">
              {icon}
            </div>
          )}

          {as === 'textarea' ? (
            <textarea
              ref={ref as any}
              id={id}
              value={value}
              disabled={disabled}
              maxLength={maxLength}
              autoComplete="off"
              data-lpignore="true"
              aria-invalid={hasError}
              aria-describedby={hasError ? errorId : helperText ? helperId : undefined}
              className={`p-2.5 min-h-[70px] resize-none ${baseInputStyles} ${icon ? 'pl-9' : ''} ${className}`}
              {...(rest as any)}
            />
          ) : as === 'select' ? (
            <select
              ref={ref as any}
              id={id}
              value={value}
              disabled={disabled}
              autoComplete="off"
              data-lpignore="true"
              aria-invalid={hasError}
              aria-describedby={hasError ? errorId : helperText ? helperId : undefined}
              className={`h-9 px-3 ${baseInputStyles} ${icon ? 'pl-9' : ''} ${className}`}
              {...(rest as any)}
            >
              {options?.map((opt) => (
                <option key={String(opt.value)} value={opt.value} disabled={opt.disabled}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              ref={ref as any}
              id={id}
              value={value}
              disabled={disabled}
              maxLength={maxLength}
              autoComplete="off"
              data-lpignore="true"
              aria-invalid={hasError}
              aria-describedby={hasError ? errorId : helperText ? helperId : undefined}
              className={`h-9 px-3 ${baseInputStyles} ${icon ? 'pl-9' : ''} ${rightElement ? 'pr-9' : ''} ${className}`}
              {...(rest as any)}
            />
          )}

          {rightElement && (
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
              {rightElement}
            </div>
          )}
        </div>

        {hasError && (
          <p
            id={errorId}
            role="alert"
            className="text-[11px] font-medium text-red-600 dark:text-red-400 flex items-center gap-1 mt-1 animate-fade-in"
          >
            <AlertCircle size={12} className="shrink-0 text-red-500" />
            <span>{error}</span>
          </p>
        )}

        {!hasError && helperText && (
          <p id={helperId} className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

FormField.displayName = 'FormField';

// Filter helper for text-only inputs (Customer Name, Company Name, Contact Person, etc.)
// Strictly strips all numbers (0-9) and disallowed special characters
export const filterTextOnlyInput = (val: string): string => {
  return val.replace(/[0-9]/g, '').replace(/[^a-zA-Z\u00C0-\u024F\u1E00-\u1EFF\s.,&'\-()\/]/g, '');
};

// Filter helper for phone input while typing
export const filterPhoneInput = (val: string): string => {
  // Allow leading + for international, and digits, spaces, hyphens
  let filtered = val.replace(/[^0-9+\s\-]/g, '');
  // Only allow + at the very beginning
  if (filtered.includes('+')) {
    filtered = (filtered.startsWith('+') ? '+' : '') + filtered.replace(/\+/g, '');
  }
  return filtered;
};

// Filter helper for currency/rates while typing (disallow negative, exponent, non-digits/dot)
export const filterRateInput = (val: string): string => {
  // Allow only digits and at most one decimal point
  let clean = val.replace(/[^0-9.]/g, '');
  const parts = clean.split('.');
  if (parts.length > 2) {
    clean = `${parts[0]}.${parts.slice(1).join('')}`;
  }
  // Disallow leading zeros for integer part (e.g. "02" -> "2", but "0." is allowed)
  if (/^0[0-9]/.test(clean)) {
    clean = clean.replace(/^0+/, '');
  }
  // Cap at 2 decimal places
  if (clean.includes('.')) {
    const [int, dec] = clean.split('.');
    clean = `${int}.${dec.slice(0, 2)}`;
  }
  return clean;
};

// Filter helper for integer quantities
export const filterIntegerInput = (val: string): string => {
  let clean = val.replace(/[^0-9]/g, '');
  if (/^0[0-9]/.test(clean)) {
    clean = clean.replace(/^0+/, '');
  }
  return clean;
};

// Filter helper for PIN code (6 digits)
export const filterPinInput = (val: string): string => {
  return val.replace(/[^0-9]/g, '').slice(0, 6);
};

// Filter helper for PAN (uppercase 10 chars)
export const filterPanInput = (val: string): string => {
  return val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
};

// Filter helper for GSTIN (uppercase 15 chars)
export const filterGstinInput = (val: string): string => {
  return val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
};

// Filter helper for IFSC (uppercase 11 chars)
export const filterIfscInput = (val: string): string => {
  return val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
};

export default FormField;
