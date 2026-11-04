/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect, useRef, useId, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, ChevronDown, Plus, ExternalLink, Package, X } from 'lucide-react';
import { inventoryApi } from '../../../services/api';
import { Sku } from '../../../types';
import { formatIndianCurrency } from '@crm/shared-validation';
import { toPlainText } from '../../../utils/toPlainText';

export interface SelectedProductPayload {
  name: string;
  skuId?: string;
  skuCode?: string;
  unit?: string;
  unitPrice?: number;
  hsnCode?: string;
  taxRate?: number;
  isCustom?: boolean;
}

export interface ProductFieldProps {
  id?: string;
  label?: string;
  value?: string;
  selectedSkuCode?: string;
  onChange?: (payload: SelectedProductPayload) => void;
  required?: boolean;
  disabled?: boolean;
  error?: any;
  placeholder?: string;
  containerClassName?: string;
  className?: string;
}

export const ProductField: React.FC<ProductFieldProps> = ({
  id: customId,
  label = 'Product / Item',
  value = '',
  selectedSkuCode,
  onChange,
  required = false,
  disabled = false,
  error: extError,
  placeholder = 'Select product or pick catalog SKU...',
  containerClassName = '',
  className = '',
}) => {
  const autoId = useId();
  const id = customId || `product-field-${autoId}`;

  const [skus, setSkus] = useState<Sku[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isOther, setIsOther] = useState(false);
  const [customName, setCustomName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch SKUs on mount
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    inventoryApi.getSkus()
      .then((res) => {
        if (!mounted) return;
        const list = Array.isArray(res.data) ? res.data : res.data?.items || [];
        setSkus(list);
      })
      .catch((err) => {
        console.error('Failed to load inventory SKUs for ProductField', err);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Sync external value with selection mode
  useEffect(() => {
    if (!value) {
      setIsOther(false);
      setCustomName('');
      return;
    }

    if (skus.length > 0) {
      const match = skus.find(
        (s) => s.skuCode === selectedSkuCode || s.name === value || `${s.skuCode} - ${s.name}` === value
      );
      if (match) {
        setIsOther(false);
        setCustomName('');
      } else {
        setIsOther(true);
        setCustomName(value === 'Other' ? '' : value);
      }
    } else if (value) {
      setCustomName(value);
    }
  }, [value, selectedSkuCode, skus]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
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

  const filteredSkus = useMemo(() => {
    if (!search.trim()) return skus;
    const q = search.toLowerCase();
    return skus.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.skuCode.toLowerCase().includes(q) ||
        (s.category && s.category.toLowerCase().includes(q))
    );
  }, [skus, search]);

  const handleSelectSku = (sku: Sku) => {
    setIsOther(false);
    setIsOpen(false);
    setSearch('');
    onChange?.({
      name: sku.name,
      skuId: sku.id,
      skuCode: sku.skuCode,
      unit: sku.packageType || 'NOS',
      unitPrice: sku.unitPrice,
      hsnCode: sku.hsnCode || undefined,
      taxRate: sku.taxRate,
      isCustom: false,
    });
  };

  const handleSelectOther = () => {
    setIsOther(true);
    setIsOpen(false);
    setSearch('');
    onChange?.({
      name: customName || '',
      isCustom: true,
      unit: 'NOS',
    });
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setCustomName(text);
    onChange?.({
      name: text,
      isCustom: true,
      unit: 'NOS',
    });
  };

  const errorText = toPlainText(extError);

  return (
    <div className={`space-y-1.5 text-left relative ${containerClassName}`} ref={dropdownRef}>
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-semibold text-slate-700 dark:text-slate-300 select-none"
        >
          {label}
          {required && <span className="text-red-500 ml-0.5 font-bold" aria-hidden="true">*</span>}
        </label>
      )}

      {/* Main trigger box or custom input */}
      {!isOther ? (
        <button
          type="button"
          id={id}
          data-testid="product-field-button"
          disabled={disabled}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className={`w-full rounded-xl text-xs py-2.5 px-3 bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white border flex items-center justify-between font-medium transition-all ${
            errorText
              ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
              : 'border-slate-300 dark:border-[#2A3042] focus:border-crm-blue focus:ring-2 focus:ring-crm-blue/20'
          } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-slate-400'} ${className}`}
        >
          <span className={value ? 'font-semibold text-slate-900 dark:text-white truncate' : 'text-slate-400'}>
            {value || placeholder}
          </span>
          <ChevronDown size={14} className="text-slate-400 shrink-0 ml-1.5" />
        </button>
      ) : (
        <div className="space-y-1.5 animate-fadeIn">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              id={id}
              data-testid="custom-product-input"
              placeholder="Enter custom product name..."
              value={customName}
              onChange={handleCustomChange}
              disabled={disabled}
              className={`w-full rounded-xl text-xs px-3.5 py-2.5 font-medium bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white border outline-none ${
                errorText
                  ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
                  : 'border-slate-300 dark:border-[#2A3042] focus:border-crm-blue focus:ring-2 focus:ring-crm-blue/20'
              } ${disabled ? 'opacity-60 cursor-not-allowed' : ''} ${className}`}
            />
            <button
              type="button"
              onClick={() => {
                setIsOther(false);
                setIsOpen(true);
              }}
              className="px-2.5 py-2.5 rounded-xl border border-slate-300 dark:border-[#2A3042] bg-slate-50 dark:bg-white/5 hover:bg-slate-100 text-slate-600 dark:text-slate-400 text-xs shrink-0 cursor-pointer font-medium"
              title="Switch back to SKU catalog"
            >
              Catalog
            </button>
          </div>
        </div>
      )}

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-[#1E2230] border border-slate-200 dark:border-[#2A3042] rounded-xl shadow-xl overflow-hidden animate-fadeIn">
          {/* Search box inside dropdown */}
          <div className="p-2 border-b border-slate-100 dark:border-white/10 flex items-center gap-2">
            <Search size={14} className="text-slate-400 ml-1 shrink-0" />
            <input
              type="text"
              autoFocus
              placeholder="Search by SKU code, name or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs bg-transparent border-none focus:outline-none text-slate-900 dark:text-white"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-white/5">
            {loading ? (
              <div className="p-4 text-center text-xs text-slate-400">Loading catalog SKUs...</div>
            ) : skus.length === 0 ? (
              <div className="p-4 text-center space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No products yet.{' '}
                  <Link
                    to="/inventory?action=create"
                    target="_blank"
                    className="text-crm-blue underline font-semibold hover:text-crm-blue-dark"
                  >
                    Add one in Inventory
                  </Link>
                </p>
                <button
                  type="button"
                  onClick={handleSelectOther}
                  className="px-3 py-1 bg-crm-blue/10 hover:bg-crm-blue/20 text-crm-blue rounded-lg text-xs font-bold transition"
                >
                  Type custom product name
                </button>
              </div>
            ) : filteredSkus.length === 0 ? (
              <div className="p-4 text-center space-y-2">
                <p className="text-xs text-slate-400">No SKU found matching "{search}".</p>
                <button
                  type="button"
                  onClick={handleSelectOther}
                  className="px-3 py-1 bg-crm-blue/10 hover:bg-crm-blue/20 text-crm-blue rounded-lg text-xs font-bold transition"
                >
                  Use "{search}" as custom product
                </button>
              </div>
            ) : (
              filteredSkus.map((sku) => (
                <button
                  key={sku.id}
                  type="button"
                  onClick={() => handleSelectSku(sku)}
                  className="w-full text-left p-2.5 hover:bg-slate-50 dark:hover:bg-white/5 transition flex items-center justify-between group"
                >
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {sku.name}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5 font-mono">
                      <span className="bg-slate-100 dark:bg-white/10 px-1 rounded text-slate-600 dark:text-slate-300">
                        {sku.skuCode}
                      </span>
                      <span>Unit: {sku.packageType || 'NOS'}</span>
                      {sku.category && <span>({sku.category})</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-mono font-bold text-crm-teal">
                      {formatIndianCurrency(sku.unitPrice)}
                    </span>
                  </div>
                </button>
              ))
            )}

            {/* Always allow "Other (type a product)" */}
            <button
              type="button"
              onClick={handleSelectOther}
              className="w-full text-left p-2.5 bg-slate-50/70 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-bold text-crm-blue flex items-center gap-1.5 transition"
            >
              <Plus size={13} />
              <span>Other (type a custom product)</span>
            </button>
          </div>
        </div>
      )}

      {errorText && (
        <p className="text-[11px] text-red-500 font-medium mt-1">{errorText}</p>
      )}
    </div>
  );
};

export default ProductField;
