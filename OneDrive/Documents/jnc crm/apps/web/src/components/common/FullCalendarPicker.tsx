import React, { useState, useEffect, useRef } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X, Check } from 'lucide-react';

interface FullCalendarPickerProps {
  value: string; // Format: YYYY-MM-DD or ''
  onChange: (dateStr: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  name?: string;
  minYear?: number;
  maxYear?: number;
  className?: string;
  disabled?: boolean;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// Precompute years array from 1990 to 3000
const DEFAULT_YEARS: number[] = [];
for (let y = 1990; y <= 3000; y++) {
  DEFAULT_YEARS.push(y);
}

export const FullCalendarPicker: React.FC<FullCalendarPickerProps> = ({
  value,
  onChange,
  label,
  placeholder = 'Select date',
  required = false,
  name,
  minYear = 1990,
  maxYear = 3000,
  className = '',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse current date or default to today's year & month for view
  const parseDate = (str: string) => {
    if (!str) return null;
    const parts = str.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        return { year: y, month: m, day: d };
      }
    }
    return null;
  };

  const parsed = parseDate(value);
  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDay = today.getDate();

  const [viewYear, setViewYear] = useState<number>(parsed?.year || todayYear);
  const [viewMonth, setViewMonth] = useState<number>(parsed?.month ?? todayMonth);
  const [inputValue, setInputValue] = useState<string>(value || '');

  // Keep internal input in sync with external value
  useEffect(() => {
    setInputValue(value || '');
    if (value) {
      const p = parseDate(value);
      if (p) {
        setViewYear(p.year);
        setViewMonth(p.month);
      }
    }
  }, [value]);

  // Click outside listener to close calendar
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const years = DEFAULT_YEARS.filter((y) => y >= minYear && y <= maxYear);

  // Month navigation
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      if (viewYear > minYear) {
        setViewYear(viewYear - 1);
        setViewMonth(11);
      }
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      if (viewYear < maxYear) {
        setViewYear(viewYear + 1);
        setViewMonth(0);
      }
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  // Day calculations
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();

  const handleSelectDay = (day: number) => {
    const formatted = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(formatted);
    setInputValue(formatted);
    setIsOpen(false);
  };

  const handleSetToday = () => {
    const formatted = `${todayYear}-${String(todayMonth + 1).padStart(2, '0')}-${String(todayDay).padStart(2, '0')}`;
    setViewYear(todayYear);
    setViewMonth(todayMonth);
    onChange(formatted);
    setInputValue(formatted);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setInputValue('');
    setIsOpen(false);
  };

  const handleManualInputBlur = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      onChange('');
      return;
    }
    // Accept YYYY-MM-DD or DD/MM/YYYY or DD-MM-YYYY
    const dmyRegex = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;
    const ymdRegex = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/;

    if (ymdRegex.test(trimmed)) {
      const match = trimmed.match(ymdRegex);
      if (match) {
        const y = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        const d = parseInt(match[3], 10);
        if (y >= minYear && y <= maxYear && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          const formatted = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          onChange(formatted);
          setInputValue(formatted);
          setViewYear(y);
          setViewMonth(m - 1);
          return;
        }
      }
    } else if (dmyRegex.test(trimmed)) {
      const match = trimmed.match(dmyRegex);
      if (match) {
        const d = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        const y = parseInt(match[3], 10);
        if (y >= minYear && y <= maxYear && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          const formatted = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          onChange(formatted);
          setInputValue(formatted);
          setViewYear(y);
          setViewMonth(m - 1);
          return;
        }
      }
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="label flex items-center justify-between">
          <span>{label}</span>
          {required && <span className="text-red-500 font-bold">*</span>}
        </label>
      )}

      {/* Input Box with Calendar Trigger Button */}
      <div className="relative flex items-center">
        <input
          type="text"
          name={name || 'jnc_full_calendar_date'}
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleManualInputBlur}
          onClick={() => !disabled && setIsOpen(true)}
          className="input text-xs pr-8 font-mono cursor-pointer"
        />

        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className="absolute right-2 p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          title="Open Calendar (1990 - 3000)"
        >
          <Calendar size={14} className="text-teal-600 dark:text-crm-teal" />
        </button>
      </div>

      {/* Popover Calendar Window */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 z-50 w-72 bg-white dark:bg-[#181B26] border border-slate-300 dark:border-[#2A3042] rounded-xl shadow-2xl p-3 space-y-2.5 animate-in fade-in zoom-in-95 duration-100 select-none">
          {/* Header: Month & Year Selector (1990 to 3000) */}
          <div className="flex items-center justify-between gap-1 pb-2 border-b border-slate-200 dark:border-[#2A3042]">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 transition-colors"
              title="Previous Month"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="flex items-center gap-1.5 flex-1 justify-center">
              {/* Month Select */}
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(parseInt(e.target.value, 10))}
                className="text-xs font-bold py-1 px-1.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-crm-blue"
              >
                {MONTH_NAMES.map((m, idx) => (
                  <option key={m} value={idx}>
                    {m}
                  </option>
                ))}
              </select>

              {/* Year Select (1990 to 3000) */}
              <select
                value={viewYear}
                onChange={(e) => setViewYear(parseInt(e.target.value, 10))}
                className="text-xs font-bold font-mono py-1 px-1.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-crm-blue"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 transition-colors"
              title="Next Month"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Day of Week Labels */}
          <div className="grid grid-cols-7 text-center">
            {DAY_NAMES.map((d, i) => (
              <span
                key={d}
                className={`text-[10px] font-bold py-0.5 ${
                  i === 0 ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {d}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty slots for days before 1st */}
            {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
              <div key={`empty-${idx}`} className="h-7 w-7" />
            ))}

            {/* Days of current month */}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const day = idx + 1;
              const isSelected =
                parsed?.year === viewYear &&
                parsed?.month === viewMonth &&
                parsed?.day === day;
              const isToday =
                todayYear === viewYear &&
                todayMonth === viewMonth &&
                todayDay === day;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={`h-7 w-7 rounded-lg text-xs font-semibold flex items-center justify-center transition-all ${
                    isSelected
                      ? 'bg-crm-blue text-white font-bold shadow-md'
                      : isToday
                      ? 'bg-teal-50 dark:bg-crm-teal/20 text-teal-700 dark:text-crm-teal font-bold border border-teal-400 dark:border-crm-teal/40'
                      : 'hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer Actions: Today, Clear, Close */}
          <div className="pt-2 border-t border-slate-200 dark:border-[#2A3042] flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={handleSetToday}
              className="text-[11px] font-bold text-teal-700 dark:text-crm-teal hover:underline py-0.5 px-1"
            >
              Today
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClear}
                className="text-[11px] font-medium text-slate-500 hover:text-red-600 py-0.5 px-1"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-[11px] font-bold bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 px-2 py-0.5 rounded text-slate-800 dark:text-slate-200"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FullCalendarPicker;
