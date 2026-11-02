/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Check } from 'lucide-react';
import { LAYERS } from '../../constants/layers';

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
  disabled?: boolean;
}

interface StyledSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
  menuZIndex?: number;
}

export default function StyledSelect({
  id,
  value,
  onChange,
  options,
  placeholder = 'Select option...',
  label,
  searchable = false,
  disabled = false,
  className = '',
  menuZIndex,
}: StyledSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [coords, setCoords] = useState<{ top: number; left: number; width: number; maxHeight: number }>({
    top: 0,
    left: 0,
    width: 240,
    maxHeight: 260,
  });

  const selectedOption = options.find((o) => o.value === value);

  // Position calculation with automatic flip and viewport constraints
  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !isOpen) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const padding = 8;
    const estimatedHeight = menuRef.current?.offsetHeight || 220;

    let top = rect.bottom + 4;
    let flipAbove = false;

    if (top + estimatedHeight > viewportHeight - padding) {
      const spaceAbove = rect.top - padding;
      const spaceBelow = viewportHeight - rect.bottom - padding;
      if (spaceAbove > spaceBelow && spaceAbove > 100) {
        top = Math.max(padding, rect.top - estimatedHeight - 4);
        flipAbove = true;
      }
    }

    const maxHeight = flipAbove
      ? Math.max(120, rect.top - padding - 8)
      : Math.max(120, viewportHeight - top - padding);

    setCoords({
      top: Math.round(top),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      maxHeight: Math.round(maxHeight),
    });
  }, [isOpen]);

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;
    const handleScrollOrResize = () => updatePosition();
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen, updatePosition]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: MouseEvent | PointerEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  // Focus search input when opening
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen, searchable]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      if (!isOpen) {
        e.preventDefault();
        setIsOpen(true);
      }
    } else if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault();
        setIsOpen(false);
        setSearch('');
        triggerRef.current?.focus();
      }
    }
  };

  const filteredOptions = searchable && search.trim()
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(search.toLowerCase()) ||
          (o.sublabel && o.sublabel.toLowerCase().includes(search.toLowerCase()))
      )
    : options;

  return (
    <div className={`relative ${className}`}>
      {label && (
        <label htmlFor={id} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
          {label}
        </label>
      )}

      {/* Select Trigger */}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-all text-left ${
          isOpen
            ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-white dark:bg-slate-900'
            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-400 dark:hover:border-slate-600'
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-800' : 'cursor-pointer'}`}
      >
        <div className="min-w-0 flex-1">
          {selectedOption ? (
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 dark:text-white truncate">
                {selectedOption.label}
              </span>
              {selectedOption.badge && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  {selectedOption.badge}
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-400 dark:text-slate-500">{placeholder}</span>
          )}
        </div>
        <ChevronDown
          size={14}
          className={`shrink-0 text-slate-400 dark:text-slate-500 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Portaled Dropdown Menu */}
      {isOpen && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            data-testid="select-portal-menu"
            role="listbox"
            tabIndex={-1}
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              width: coords.width,
              maxHeight: coords.maxHeight,
              zIndex: menuZIndex ?? 150,
            }}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col"
          >
            {searchable && (
              <div className="p-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 bg-slate-50 dark:bg-slate-950/40">
                <Search size={13} className="text-slate-400 shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="w-full bg-transparent text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
                />
              </div>
            )}

            <div className="overflow-y-auto p-1 divide-y divide-slate-50 dark:divide-slate-800/40">
              {filteredOptions.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-400">No matching options</div>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      role="option"
                      aria-selected={isSelected}
                      type="button"
                      disabled={opt.disabled}
                      onClick={() => {
                        onChange(opt.value);
                        setIsOpen(false);
                        setSearch('');
                        triggerRef.current?.focus();
                      }}
                      className={`w-full flex items-center justify-between p-2 rounded-lg text-xs text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200 font-bold'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200'
                      } ${opt.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{opt.label}</span>
                          {opt.badge && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                              {opt.badge}
                            </span>
                          )}
                        </div>
                        {opt.sublabel && (
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                            {opt.sublabel}
                          </p>
                        )}
                      </div>
                      {isSelected && (
                        <Check size={14} className="text-indigo-600 dark:text-indigo-400 shrink-0 ml-2" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
