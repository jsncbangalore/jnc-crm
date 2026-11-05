/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useId, useState, useEffect } from 'react';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { checkPhonePaste, cleanPhonePaste, formatToE164, isIndianLandline } from '@crm/shared-validation';
import { toPlainText } from '../../../utils/toPlainText';

export interface PhoneFieldProps {
  id?: string;
  name?: string;
  label?: string;
  value?: string;
  initialValue?: string;
  phoneType?: 'mobile' | 'landline';
  allowTypeSwitch?: boolean;
  onChange?: (e164: string, national?: string, type?: 'mobile' | 'landline') => void;
  onBlur?: (e164: string) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  error?: any;
  className?: string;
  containerClassName?: string;
  helperText?: string;
  dataTestId?: string;
}

const COUNTRY_CODES = [
  { code: '+91', country: 'IN', label: 'India (+91)', flag: '🇮🇳' },
  { code: '+1', country: 'US', label: 'United States (+1)', flag: '🇺🇸' },
  { code: '+44', country: 'GB', label: 'United Kingdom (+44)', flag: '🇬🇧' },
  { code: '+971', country: 'AE', label: 'UAE (+971)', flag: '🇦🇪' },
  { code: '+65', country: 'SG', label: 'Singapore (+65)', flag: '🇸🇬' },
  { code: '+61', country: 'AU', label: 'Australia (+61)', flag: '🇦🇺' },
  { code: '+49', country: 'DE', label: 'Germany (+49)', flag: '🇩🇪' },
  { code: '+81', country: 'JP', label: 'Japan (+81)', flag: '🇯🇵' },
  { code: '+966', country: 'SA', label: 'Saudi Arabia (+966)', flag: '🇸🇦' },
  { code: '+880', country: 'BD', label: 'Bangladesh (+880)', flag: '🇧🇩' },
  { code: '+977', country: 'NP', label: 'Nepal (+977)', flag: '🇳🇵' },
];

export const PhoneField: React.FC<PhoneFieldProps> = ({
  id: customId,
  name,
  label = 'Mobile Number',
  value = '',
  initialValue,
  phoneType: initialPhoneType = 'mobile',
  allowTypeSwitch = true,
  onChange,
  onBlur,
  required = false,
  disabled = false,
  placeholder,
  error: externalError,
  className = '',
  containerClassName = '',
  helperText,
  dataTestId,
}) => {
  const generatedId = useId();
  const id = customId || `phone-field-${generatedId}`;

  // Parse initial country code and national digits from value
  const parseInitial = (val: string) => {
    if (!val) return { countryCode: '+91', national: '' };
    const trimmed = val.trim();
    if (trimmed.startsWith('+')) {
      for (const item of COUNTRY_CODES) {
        if (trimmed.startsWith(item.code)) {
          return {
            countryCode: item.code,
            national: trimmed.slice(item.code.length).replace(/\D/g, ''),
          };
        }
      }
      // If starts with + but not in primary list
      const match = trimmed.match(/^(\+\d{1,4})(\d+)$/);
      if (match) {
        return { countryCode: match[1], national: match[2] };
      }
    }
    // Default assumption for digits without +
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length >= 12 && digits.startsWith('91')) {
      return { countryCode: '+91', national: digits.slice(2) };
    }
    return { countryCode: '+91', national: digits };
  };

  const initialParsed = parseInitial(value);
  const [selectedCountry, setSelectedCountry] = useState(initialParsed.countryCode);
  const [nationalNumber, setNationalNumber] = useState(initialParsed.national);
  const [currentPhoneType, setCurrentPhoneType] = useState<'mobile' | 'landline'>(
    initialPhoneType || (isIndianLandline(initialParsed.national) ? 'landline' : 'mobile')
  );
  const [internalError, setInternalError] = useState<string | null>(null);

  // Sync state if external value changes significantly
  useEffect(() => {
    const parsed = parseInitial(value);
    const currentCombined = formatToE164(nationalNumber, selectedCountry);
    if (value && value !== currentCombined && value !== nationalNumber) {
      setSelectedCountry(parsed.countryCode);
      setNationalNumber(parsed.national);
      if (isIndianLandline(parsed.national)) {
        setCurrentPhoneType('landline');
      }
    }
  }, [value]);

  const displayError = toPlainText(externalError || internalError);

  const isValueUnchanged = (digits: string, country: string): boolean => {
    if (!initialValue) return false;
    const initClean = initialValue.replace(/\D/g, '');
    const currentClean = `${country}${digits}`.replace(/\D/g, '');
    if (initClean && currentClean && initClean === currentClean) return true;
    if (value && value.trim() === initialValue.trim()) return true;
    return false;
  };

  const validateNumber = (digits: string, country: string, type: 'mobile' | 'landline' = currentPhoneType): string | null => {
    if (isValueUnchanged(digits, country)) {
      return null;
    }

    if (!digits) {
      if (required) return type === 'landline' ? 'Enter a valid landline / other phone number (6 to 12 digits).' : 'Enter a 10-digit mobile number.';
      return null;
    }

    if (country === '+91') {
      if (type === 'landline') {
        if (digits.length < 6 || digits.length > 12) {
          return 'Enter a valid landline / other phone number (6 to 12 digits, optional STD code).';
        }
        return null;
      }
      if (digits.length !== 10 || !/^[6-9]/.test(digits)) {
        return 'Enter a 10-digit mobile number.';
      }
      return null;
    }

    const full = `${country}${digits}`;
    try {
      if (!isValidPhoneNumber(full)) {
        return 'Enter a valid phone number for selected country.';
      }
    } catch {
      if (digits.length < 8 || digits.length > 15) {
        return 'Enter a valid phone number for selected country.';
      }
    }
    return null;
  };

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCountry = e.target.value;
    setSelectedCountry(newCountry);
    const e164 = nationalNumber ? formatToE164(nationalNumber, newCountry) : '';
    onChange?.(e164, nationalNumber, currentPhoneType);

    if (nationalNumber) {
      const err = validateNumber(nationalNumber, newCountry, currentPhoneType);
      setInternalError(err);
    }
  };

  const handleTypeChange = (newType: 'mobile' | 'landline') => {
    setCurrentPhoneType(newType);
    const e164 = nationalNumber ? formatToE164(nationalNumber, selectedCountry) : '';
    onChange?.(e164, nationalNumber, newType);
    if (nationalNumber) {
      const err = validateNumber(nationalNumber, selectedCountry, newType);
      setInternalError(err);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    let digits = raw.replace(/\D/g, '');

    // For +91 mobile, block more than 10 digits; for landline allow up to 12 (STD + local digits)
    const maxDigits = selectedCountry === '+91' ? (currentPhoneType === 'landline' ? 12 : 10) : 15;
    if (digits.length > maxDigits) {
      digits = digits.slice(0, maxDigits);
    }

    setNationalNumber(digits);
    const e164 = digits ? formatToE164(digits, selectedCountry) : '';
    onChange?.(e164, digits, currentPhoneType);

    if (isValueUnchanged(digits, selectedCountry)) {
      setInternalError(null);
      return;
    }

    // Live validation feedback
    if (selectedCountry === '+91') {
      if (currentPhoneType === 'mobile') {
        if (digits.length >= 1 && !/^[6-9]/.test(digits)) {
          setInternalError('Enter a 10-digit mobile number.');
        } else if (digits.length === 10) {
          setInternalError(null);
        } else {
          setInternalError(null);
        }
      } else {
        if (digits.length >= 6 && digits.length <= 12) {
          setInternalError(null);
        }
      }
    } else {
      setInternalError(null);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    let targetCountry = selectedCountry;

    if (pasted.includes('+') && !pasted.includes('+91')) {
      for (const item of COUNTRY_CODES) {
        if (pasted.trim().startsWith(item.code)) {
          targetCountry = item.code;
          setSelectedCountry(item.code);
          break;
        }
      }
    }

    // Do NOT silently truncate too-long pasted numbers; show message
    const check = checkPhonePaste(pasted, targetCountry, currentPhoneType);
    if (!check.valid) {
      setInternalError(check.error || 'Pasted number has too many digits. Please enter a valid number.');
      return;
    }

    const finalDigits = check.digits;
    setNationalNumber(finalDigits);

    const e164 = finalDigits ? formatToE164(finalDigits, targetCountry) : '';
    onChange?.(e164, finalDigits, currentPhoneType);

    const err = validateNumber(finalDigits, targetCountry, currentPhoneType);
    setInternalError(err);
  };

  const handleBlurEvent = () => {
    if (isValueUnchanged(nationalNumber, selectedCountry)) {
      setInternalError(null);
      onBlur?.(value || (nationalNumber ? formatToE164(nationalNumber, selectedCountry) : ''));
      return;
    }
    const err = validateNumber(nationalNumber, selectedCountry, currentPhoneType);
    setInternalError(err);
    const e164 = nationalNumber ? formatToE164(nationalNumber, selectedCountry) : '';
    onBlur?.(e164);
  };

  const dynamicLabel =
    label === 'Mobile Number' && currentPhoneType === 'landline'
      ? 'Landline Number'
      : label;

  return (
    <div className={`space-y-1.5 text-left ${containerClassName}`}>
      <div className="flex items-center justify-between">
        {dynamicLabel && (
          <label
            htmlFor={id}
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300 select-none"
          >
            {dynamicLabel}
            {required && <span className="text-red-500 ml-0.5 font-bold" aria-hidden="true">*</span>}
          </label>
        )}
        {allowTypeSwitch && (
          <div className="flex items-center gap-1 text-[10px] font-medium bg-slate-100 dark:bg-slate-800 p-0.5 rounded-md border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => handleTypeChange('mobile')}
              className={`px-2 py-0.5 rounded transition ${
                currentPhoneType === 'mobile'
                  ? 'bg-white dark:bg-slate-900 text-crm-blue font-semibold shadow-xs'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              Mobile
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('landline')}
              className={`px-2 py-0.5 rounded transition ${
                currentPhoneType === 'landline'
                  ? 'bg-white dark:bg-slate-900 text-crm-blue font-semibold shadow-xs'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              Landline / other
            </button>
          </div>
        )}
      </div>

      <div className="flex items-stretch gap-1.5">
        {/* Country Code Dropdown */}
        <div className="w-[110px] shrink-0">
          <select
            value={selectedCountry}
            onChange={handleCountryChange}
            disabled={disabled}
            aria-label="Country calling code"
            className="w-full rounded-xl text-xs py-2.5 px-2 font-mono bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white border border-slate-300 dark:border-[#2A3042] outline-none focus:border-crm-blue focus:ring-2 focus:ring-crm-blue/20 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {COUNTRY_CODES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.code}
              </option>
            ))}
          </select>
        </div>

        {/* National Number Input */}
        <div className="relative flex-1">
          <input
            id={id}
            name={name}
            type="tel"
            inputMode="numeric"
            value={nationalNumber}
            onChange={handleInputChange}
            onPaste={handlePaste}
            onBlur={handleBlurEvent}
            disabled={disabled}
            placeholder={
              placeholder ||
              (selectedCountry === '+91'
                ? currentPhoneType === 'landline'
                  ? 'STD code + number (6 to 12 digits, e.g. 0802345678)'
                  : '10-digit mobile number'
                : 'Phone digits')
            }
            maxLength={selectedCountry === '+91' ? (currentPhoneType === 'landline' ? 12 : 10) : 15}
            autoComplete="tel-national"
            data-lpignore="true"
            data-testid={dataTestId}
            className={`w-full rounded-xl text-xs px-3.5 py-2.5 font-mono transition-all outline-none ${
              displayError
                ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-red-900 dark:text-red-200 bg-red-50/40 dark:bg-red-950/20 border'
                : 'border-slate-300 dark:border-[#2A3042] focus:border-crm-blue focus:ring-2 focus:ring-crm-blue/20 bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white border'
            } ${disabled ? 'opacity-60 cursor-not-allowed bg-slate-100 dark:bg-[#141722]' : ''} ${className}`}
          />
        </div>
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

export default PhoneField;
