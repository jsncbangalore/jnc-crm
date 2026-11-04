/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect, useId } from 'react';
import { Minus, Plus } from 'lucide-react';
import { toPlainText } from '../../../utils/toPlainText';

export interface QuantityFieldProps {
  id?: string;
  name?: string;
  label?: string;
  value?: number | string;
  onChange?: (val: number) => void;
  onBlur?: (val: number) => void;
  allowDecimals?: boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  required?: boolean;
  error?: any;
  containerClassName?: string;
  className?: string;
  dataTestId?: string;
}

export const QuantityField: React.FC<QuantityFieldProps> = ({
  id: customId,
  name,
  label,
  value = 1,
  onChange,
  onBlur,
  allowDecimals = false,
  min = 1,
  max = 999999,
  step = 1,
  unit,
  disabled = false,
  required = false,
  error: extError,
  containerClassName = '',
  className = '',
  dataTestId,
}) => {
  const autoId = useId();
  const id = customId || `quantity-field-${autoId}`;

  // Keep internal text state so user can clear/backspace without snapping to 1 immediately
  const [textValue, setTextValue] = useState<string>(String(value ?? 1));

  // Sync if prop value changes externally
  useEffect(() => {
    const num = typeof value === 'number' ? value : parseFloat(String(value));
    if (!isNaN(num) && num !== parseFloat(textValue)) {
      setTextValue(String(value));
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;

    // Allow empty string while typing so the box can be cleared
    if (raw === '') {
      setTextValue('');
      return;
    }

    if (allowDecimals) {
      // Allow digits and up to one decimal point
      if (/^\d*\.?\d*$/.test(raw)) {
        setTextValue(raw);
        const parsed = parseFloat(raw);
        if (!isNaN(parsed)) {
          onChange?.(parsed);
        }
      }
    } else {
      // Whole numbers only
      const digitsOnly = raw.replace(/\D/g, '');
      if (digitsOnly === '') {
        setTextValue('');
      } else {
        const num = parseInt(digitsOnly, 10);
        if (num <= max) {
          setTextValue(digitsOnly);
          onChange?.(num);
        }
      }
    }
  };

  const handleBlurEvent = () => {
    let finalNum = parseFloat(textValue);
    if (isNaN(finalNum) || finalNum < min) {
      finalNum = min;
    } else if (finalNum > max) {
      finalNum = max;
    }

    setTextValue(String(finalNum));
    onChange?.(finalNum);
    onBlur?.(finalNum);
  };

  const handleDecrement = () => {
    if (disabled) return;
    const current = parseFloat(textValue) || min;
    const next = Math.max(min, current - step);
    const rounded = allowDecimals ? Math.round(next * 100) / 100 : Math.round(next);
    setTextValue(String(rounded));
    onChange?.(rounded);
  };

  const handleIncrement = () => {
    if (disabled) return;
    const current = parseFloat(textValue) || 0;
    const next = Math.min(max, current + step);
    const rounded = allowDecimals ? Math.round(next * 100) / 100 : Math.round(next);
    setTextValue(String(rounded));
    onChange?.(rounded);
  };

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
          {unit && <span className="text-slate-400 font-normal ml-1">({unit})</span>}
        </label>
      )}

      <div className="flex items-center">
        {/* Stepper Minus Button */}
        <button
          type="button"
          onClick={handleDecrement}
          disabled={disabled || (parseFloat(textValue) <= min)}
          aria-label="Decrease quantity"
          className="h-10 w-9 rounded-l-xl bg-slate-100 dark:bg-[#141722] hover:bg-slate-200 dark:hover:bg-[#1E2230] text-slate-600 dark:text-slate-300 border border-r-0 border-slate-300 dark:border-[#2A3042] flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <Minus size={13} />
        </button>

        {/* Input */}
        <input
          id={id}
          name={name}
          type="text"
          inputMode={allowDecimals ? 'decimal' : 'numeric'}
          value={textValue}
          onChange={handleChange}
          onBlur={handleBlurEvent}
          disabled={disabled}
          autoComplete="off"
          data-lpignore="true"
          data-testid={dataTestId}
          placeholder="1"
          className={`h-10 text-center font-bold text-xs w-full bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white border outline-none transition-all ${
            errorText
              ? 'border-red-500 focus:border-red-500 text-red-900 dark:text-red-200'
              : 'border-slate-300 dark:border-[#2A3042] focus:border-crm-blue'
          } ${disabled ? 'opacity-60 cursor-not-allowed bg-slate-100 dark:bg-[#141722]' : ''} ${className}`}
        />

        {/* Stepper Plus Button */}
        <button
          type="button"
          onClick={handleIncrement}
          disabled={disabled || (parseFloat(textValue) >= max)}
          aria-label="Increase quantity"
          className="h-10 w-9 rounded-r-xl bg-slate-100 dark:bg-[#141722] hover:bg-slate-200 dark:hover:bg-[#1E2230] text-slate-600 dark:text-slate-300 border border-l-0 border-slate-300 dark:border-[#2A3042] flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <Plus size={13} />
        </button>
      </div>

      {errorText && (
        <p className="text-[11px] text-red-500 font-medium mt-1">{errorText}</p>
      )}
    </div>
  );
};

export default QuantityField;
