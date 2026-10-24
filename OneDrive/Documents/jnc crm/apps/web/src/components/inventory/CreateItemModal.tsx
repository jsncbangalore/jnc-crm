/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState } from 'react';
import { Package, RefreshCw } from 'lucide-react';
import { AccessibleModal } from '../common/AccessibleModal';
import { inventoryApi } from '../../services/api';

export interface CreateItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (item: any) => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export default function CreateItemModal({
  isOpen,
  onClose,
  onSuccess,
  triggerRef,
}: CreateItemModalProps) {
  const [name, setName] = useState('');
  const [skuCode, setSkuCode] = useState('');
  const [category, setCategory] = useState('General');
  const [unit, setUnit] = useState('Nos');
  const [unitPrice, setUnitPrice] = useState<string>('');
  const [reorderPoint, setReorderPoint] = useState<string>('10');
  const [initialStock, setInitialStock] = useState<string>('0');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setName('');
    setSkuCode('');
    setCategory('General');
    setUnit('Nos');
    setUnitPrice('');
    setReorderPoint('10');
    setInitialStock('0');
    setError(null);
  };

  const isDirty = Boolean(name.trim() || skuCode.trim() || unitPrice.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter an item name.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload: any = {
        name: name.trim(),
        skuCode: skuCode.trim() || `ITEM-${Date.now().toString().slice(-6)}`,
        category: category.trim() || 'General',
        unit: unit.trim() || 'Nos',
        unitPrice: unitPrice ? parseFloat(unitPrice) : 0,
        reorderPoint: reorderPoint ? parseInt(reorderPoint, 10) : 10,
        initialStock: initialStock ? parseInt(initialStock, 10) : 0,
      };

      const res = await inventoryApi.createSku(payload);
      resetForm();
      onSuccess(res.data);
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : msg || 'Unable to create item.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={() => {
        resetForm();
        onClose();
      }}
      title="Add Item"
      subtitle="Create a new catalog product or inventory item"
      icon={<Package size={20} className="text-blue-600 dark:text-blue-400" />}
      isDirty={isDirty}
      triggerRef={triggerRef}
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} noValidate autoComplete="off" data-lpignore="true" className="space-y-4">
        {error && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-sm font-medium"
          >
            {error}
          </div>
        )}

        <div>
          <label htmlFor="create-item-name" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
            Item name <span className="text-rose-500">*</span>
          </label>
          <input
            id="create-item-name"
            type="text"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Standard Product A"
            className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 transition-colors"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="create-item-sku" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
              SKU code (optional)
            </label>
            <input
              id="create-item-sku"
              type="text"
              value={skuCode}
              onChange={(e) => setSkuCode(e.target.value.toUpperCase())}
              placeholder="e.g. ITEM-001"
              className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm font-mono placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 transition-colors uppercase"
            />
          </div>

          <div>
            <label htmlFor="create-item-category" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
              Category
            </label>
            <input
              id="create-item-category"
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Products, General"
              className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 transition-colors"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="create-item-unit" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
              Unit
            </label>
            <input
              id="create-item-unit"
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="Nos, Pcs, Kg"
              className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="create-item-price" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
              Unit price (₹)
            </label>
            <input
              id="create-item-price"
              type="number"
              min="0"
              step="0.01"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="0.00"
              className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm font-mono placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="create-item-reorder" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
              Reorder level
            </label>
            <input
              id="create-item-reorder"
              type="number"
              min="0"
              value={reorderPoint}
              onChange={(e) => setReorderPoint(e.target.value)}
              placeholder="10"
              className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm font-mono placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 transition-colors"
            />
          </div>
        </div>

        <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => {
              resetForm();
              onClose();
            }}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Adding...</span>
              </>
            ) : (
              <span>Add item</span>
            )}
          </button>
        </div>
      </form>
    </AccessibleModal>
  );
}
