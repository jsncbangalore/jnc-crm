/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect, useId, useMemo } from 'react';
import { toPlainText } from '../../../utils/toPlainText';

export interface StateCityFieldProps {
  stateValue?: string;
  cityValue?: string;
  onStateChange?: (state: string) => void;
  onCityChange?: (city: string) => void;
  required?: boolean;
  disabled?: boolean;
  stateLabel?: string;
  cityLabel?: string;
  stateError?: any;
  cityError?: any;
  containerClassName?: string;
  className?: string;
}

export const StateCityField: React.FC<StateCityFieldProps> = ({
  stateValue = 'Karnataka',
  cityValue = '',
  onStateChange,
  onCityChange,
  required = false,
  disabled = false,
  stateLabel = 'State',
  cityLabel = 'City / Location',
  stateError: extStateError,
  cityError: extCityError,
  containerClassName = '',
  className = '',
}) => {
  const stateId = useId();
  const cityId = useId();

  const [dataset, setDataset] = useState<Record<string, string[]> | null>(null);
  const [isOtherCity, setIsOtherCity] = useState(false);
  const [customCityText, setCustomCityText] = useState('');

  // Lazy-load static dataset without bundling on initial load and without API calls
  useEffect(() => {
    let mounted = true;
    import('../../../data/indiaStatesCities.json')
      .then((mod) => {
        if (mounted) {
          const data = (mod.default || mod) as Record<string, string[]>;
          setDataset(data);
        }
      })
      .catch((err) => {
        console.error('Failed to load local state/city static dataset', err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const stateOptions = useMemo(() => {
    if (!dataset) return [stateValue || 'Karnataka'];
    const keys = Object.keys(dataset);
    if (!keys.includes(stateValue) && stateValue) {
      return [stateValue, ...keys];
    }
    return keys;
  }, [dataset, stateValue]);

  const availableCities = useMemo(() => {
    if (!dataset || !stateValue || !dataset[stateValue]) return ['Other'];
    return dataset[stateValue];
  }, [dataset, stateValue]);

  // Determine if cityValue is "Other" or custom
  useEffect(() => {
    if (!cityValue) {
      if (!isOtherCity) {
        setCustomCityText('');
      }
      return;
    }

    if (cityValue === 'Other') {
      setIsOtherCity(true);
      return;
    }

    if (dataset && stateValue && dataset[stateValue]) {
      const citiesInState = dataset[stateValue];
      if (citiesInState.includes(cityValue) && cityValue !== 'Other') {
        setIsOtherCity(false);
        setCustomCityText('');
      } else {
        // Pre-existing custom city in old record
        setIsOtherCity(true);
        setCustomCityText(cityValue);
      }
    } else if (cityValue) {
      // While dataset is loading, keep typed value
      setIsOtherCity(true);
      setCustomCityText(cityValue);
    }
  }, [cityValue, stateValue, dataset]);

  const handleStateSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newState = e.target.value;
    onStateChange?.(newState);

    // Pick first city or reset
    if (dataset && dataset[newState]) {
      const defaultCity = dataset[newState][0] || '';
      if (defaultCity && defaultCity !== 'Other') {
        setIsOtherCity(false);
        onCityChange?.(defaultCity);
      } else {
        setIsOtherCity(true);
        onCityChange?.('Other');
      }
    }
  };

  const handleCitySelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value;
    if (selected === 'Other') {
      setIsOtherCity(true);
      onCityChange?.('Other');
    } else {
      setIsOtherCity(false);
      setCustomCityText('');
      onCityChange?.(selected);
    }
  };

  const handleCustomCityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setCustomCityText(text);
    onCityChange?.(text.trim() === '' ? 'Other' : text);
  };

  const stateErrorText = toPlainText(extStateError);
  const cityErrorText = toPlainText(extCityError);

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${containerClassName}`}>
      {/* State Dropdown */}
      <div className="space-y-1.5 text-left">
        <label
          htmlFor={stateId}
          className="block text-xs font-semibold text-slate-700 dark:text-slate-300 select-none"
        >
          {stateLabel}
          {required && <span className="text-red-500 ml-0.5 font-bold" aria-hidden="true">*</span>}
        </label>
        <select
          id={stateId}
          data-testid="state-select"
          value={stateValue}
          onChange={handleStateSelect}
          disabled={disabled}
          className={`w-full rounded-xl text-xs py-2.5 px-3 bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white border outline-none font-medium cursor-pointer ${
            stateErrorText
              ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
              : 'border-slate-300 dark:border-[#2A3042] focus:border-crm-blue focus:ring-2 focus:ring-crm-blue/20'
          } ${disabled ? 'opacity-60 cursor-not-allowed' : ''} ${className}`}
        >
          {stateOptions.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
        {stateErrorText && (
          <p className="text-[11px] text-red-500 font-medium mt-1">{stateErrorText}</p>
        )}
      </div>

      {/* City Dropdown & Other City Input */}
      <div className="space-y-1.5 text-left">
        <label
          htmlFor={cityId}
          className="block text-xs font-semibold text-slate-700 dark:text-slate-300 select-none"
        >
          {cityLabel}
          {required && <span className="text-red-500 ml-0.5 font-bold" aria-hidden="true">*</span>}
        </label>

        <div className="space-y-2">
          <select
            id={cityId}
            data-testid="city-select"
            value={isOtherCity ? 'Other' : cityValue}
            onChange={handleCitySelect}
            disabled={disabled}
            className={`w-full rounded-xl text-xs py-2.5 px-3 bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white border outline-none font-medium cursor-pointer ${
              cityErrorText
                ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
                : 'border-slate-300 dark:border-[#2A3042] focus:border-crm-blue focus:ring-2 focus:ring-crm-blue/20'
            } ${disabled ? 'opacity-60 cursor-not-allowed' : ''} ${className}`}
          >
            <option value="" disabled>
              Select city...
            </option>
            {availableCities.map((ct) => (
              <option key={ct} value={ct}>
                {ct === 'Other' ? 'Other City (type custom)' : ct}
              </option>
            ))}
          </select>

          {/* Text input for Other city or custom city in existing records */}
          {isOtherCity && (
            <input
              type="text"
              data-testid="custom-city-input"
              placeholder="Enter custom city or district"
              value={customCityText}
              onChange={handleCustomCityChange}
              disabled={disabled}
              className={`w-full rounded-xl text-xs px-3.5 py-2 font-medium bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white border outline-none animate-fadeIn ${
                cityErrorText
                  ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
                  : 'border-slate-300 dark:border-[#2A3042] focus:border-crm-blue focus:ring-2 focus:ring-crm-blue/20'
              } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
            />
          )}
        </div>

        {cityErrorText && (
          <p className="text-[11px] text-red-500 font-medium mt-1">{cityErrorText}</p>
        )}
      </div>
    </div>
  );
};

export default StateCityField;
