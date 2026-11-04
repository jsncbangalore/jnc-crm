/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect, useId } from 'react';
import { formatIndianCurrency } from '@crm/shared-validation';
import { toPlainText } from '../../../utils/toPlainText';

export interface MoneyFieldProps {
  id?: string;
  name?: string;
  label?: string;
  value?: number | string;
  onChange?: (val: number, raw?: string) => void;
  onBlur?: (val: number) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  error?: any;
  containerClassName?: string;
  className?: string;
  dataTestId?: string;
  helperText?: string;
}

export const MoneyField: React.FC<MoneyFieldProps> = ({
  id: customId,
  name,
  label = 'Amount (₹)',
  value = '',
  onChange,
  onBlur,
  required = false,
  disabled = false,
  placeholder = '0.00',
  error: extError,
  containerClassName = '',
  className = '',
  dataTestId,
  helperText,
}) => {
  const autoId = useId();
  const id = customId || `money-field-${autoId}`;

  const formatDisplay = (val: number | string): string => {
    if (val === '' || val === null || val === undefined) return '';
    const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''));
    if (isNaN(num)) return '';
    return new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    }).format(num);
  };

  const [isFocused, setIsFocused] = useState(false);
  const [textValue, setTextValue] = useState<string>(() => {
    if (value === '' || value === null || value === undefined) return '';
    return String(value);
  });

  // Sync external value changes when not focused
  useEffect(() => {
    if (!isFocused) {
      if (value === '' || value === null || value === undefined) {
        setTextValue('');
      } else {
        const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
        setTextValue(isNaN(num) ? '' : String(num));
      }
    }
  }, [value, isFocused]);

  const handleFocus = () => {
    setIsFocused(true);
    // When focused, strip formatting for direct editing
    const rawDigits = textValue.replace(/,/g, '');
    setTextValue(rawDigits);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;

    // Allow empty string
    if (raw === '') {
      setTextValue('');
      onChange?.(0, '');
      return;
    }

    // Digits and at most 1 decimal point with up to 2 decimal places
    const clean = raw.replace(/[^0-9.]/g, '');
    const parts = clean.split('.');
    let formatted = parts[0];
    if (parts.length > 1) {
      formatted += '.' + parts.slice(1).join('').slice(0, 2);
    }

    setTextValue(formatted);
    const parsed = parseFloat(formatted);
    onChange?.(isNaN(parsed) ? 0 : parsed, formatted);
  };

  const handleBlurEvent = () => {
    setIsFocused(false);
    const parsed = parseFloat(textValue.replace(/,/g, ''));
    const finalVal = isNaN(parsed) ? 0 : parsed;
    onChange?.(finalVal, String(finalVal));
    onBlur?.(finalVal);
  };

  const displayString = isFocused ? textValue : (textValue ? formatDisplay(textValue) : '');
  const errorText = toPlainText(extError);

  return (
    <div className={`space-y-1.5 text-left ${containerClassName}`}>
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-semibold text-slate-700 dark:text-slate-300 select-none"
        >
          {label}
          {required && <span className="text-red-500 ml-0.5 font-bold" aria-hidden="true">*</span>}
        </label>
      )}

      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs pointer-events-none">
          ₹
        </span>
        <input
          id={id}
          name={name}
          type="text"
          inputMode="decimal"
          value={displayString}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlurEvent}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          data-lpignore="true"
          data-testid={dataTestId}
          className={`w-full rounded-xl text-xs pl-7 pr-3.5 py-2.5 font-mono transition-all outline-none ${
            errorText
              ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-red-900 dark:text-red-200 bg-red-50/40 dark:bg-red-950/20 border'
              : 'border-slate-300 dark:border-[#2A3042] focus:border-crm-blue focus:ring-2 focus:ring-crm-blue/20 bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white border'
          } ${disabled ? 'opacity-60 cursor-not-allowed bg-slate-100 dark:bg-[#141722]' : ''} ${className}`}
        />
      </div>

      {errorText ? (
        <p className="text-[11px] text-red-500 font-medium mt-1">{errorText}</p>
      ) : helperText ? (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{helperText}</p>
      ) : null}
    </div>
  );
};

export default MoneyField;
