/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useId, useState, useEffect } from 'react';
import { filterNameInput, validateNameField } from '@crm/shared-validation';
import { toPlainText } from '../../../utils/toPlainText';

export interface NameFieldProps {
  id?: string;
  name?: string;
  label?: string;
  value?: string;
  onChange?: (val: string) => void;
  onBlur?: (val: string) => void;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  error?: any;
  maxLength?: number;
  className?: string;
  containerClassName?: string;
  helperText?: string;
  dataTestId?: string;
}

export const NameField: React.FC<NameFieldProps> = ({
  id: customId,
  name,
  label = 'Name',
  value = '',
  onChange,
  onBlur,
  required = false,
  placeholder = 'Enter name',
  disabled = false,
  autoFocus = false,
  error: externalError,
  maxLength = 60,
  className = '',
  containerClassName = '',
  helperText,
  dataTestId,
}) => {
  const generatedId = useId();
  const id = customId || `name-field-${generatedId}`;
  const [internalError, setInternalError] = useState<string | null>(null);

  const displayError = toPlainText(externalError || internalError);
  const currentLength = (value || '').length;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const filtered = filterNameInput(raw);

    if (raw !== filtered) {
      setInternalError('Use letters only.');
    } else {
      setInternalError(null);
    }

    // Limit to maxLength
    const capped = filtered.slice(0, maxLength);
    onChange?.(capped);
  };

  const handleBlurEvent = () => {
    const trimmed = (value || '').trim();
    if (trimmed !== value) {
      onChange?.(trimmed);
    }
    const check = validateNameField(trimmed, required, maxLength);
    if (!check.valid) {
      setInternalError(check.error || 'Use letters only.');
    } else {
      setInternalError(null);
    }
    onBlur?.(trimmed);
  };

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
          <span
            className={`text-[10px] font-mono ${
              currentLength >= maxLength ? 'text-red-500 font-bold' : 'text-slate-400'
            }`}
            aria-live="polite"
          >
            {currentLength}/{maxLength}
          </span>
        </div>
      )}

      <div className="relative">
        <input
          id={id}
          name={name}
          type="text"
          value={value}
          onChange={handleChange}
          onBlur={handleBlurEvent}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete="off"
          data-lpignore="true"
          data-testid={dataTestId}
          className={`w-full rounded-xl text-xs px-3.5 py-2.5 transition-all outline-none font-medium ${
            displayError
              ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-red-900 dark:text-red-200 bg-red-50/40 dark:bg-red-950/20 border'
              : 'border-slate-300 dark:border-[#2A3042] focus:border-crm-blue focus:ring-2 focus:ring-crm-blue/20 bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white border'
          } ${disabled ? 'opacity-60 cursor-not-allowed bg-slate-100 dark:bg-[#141722]' : ''} ${className}`}
        />
      </div>

      {displayError ? (
        <p className="text-[11px] text-red-500 font-medium flex items-center gap-1 mt-1">
          <span>{displayError}</span>
        </p>
      ) : helperText ? (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{helperText}</p>
      ) : null}
    </div>
  );
};

export default NameField;
