import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, CheckCircle2, X, RefreshCw, Cpu,
  Package, ChevronDown, AlertCircle
} from 'lucide-react';
import { inventoryApi, suppliersApi } from '../../services/api';

const CATEGORIES = [
  'PA System', 'Talk Back System', 'Addressable Talk Back', 'Fire Alarm System',
  'Nurse Call System', 'EPABX / IPABX', 'Panic Alarm System', 'CCTV Surveillance',
  'Access Control', 'Network Infrastructure',
];

interface Props {
  preselectedProduct?: any; // product object if opened from Finished Products panel
  onClose?: () => void;
  onSuccess?: () => void;
}

export default function QuickAddComponentForm({ preselectedProduct, onClose, onSuccess }: Props) {
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '',
    skuCode: '',
    category: 'PA System',
    productId: preselectedProduct?.id || '',
    qtyNeededPerUnit: 1,
    currentStockOnHand: 0,
    reorderPoint: 10,
    preferredSupplierId: '',
    unitPrice: 0,
    costPrice: 0,
    hsnCode: '',
  });

  const [productSearch, setProductSearch] = useState(preselectedProduct?.name || '');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showProductDrop, setShowProductDrop] = useState(false);
  const [showSupplierDrop, setShowSupplierDrop] = useState(false);

  useEffect(() => {
    Promise.all([
      inventoryApi.getProducts(),
      suppliersApi.list(),
    ]).then(([pRes, sRes]) => {
      setProducts(Array.isArray(pRes.data) ? pRes.data : []);
      setSuppliers(Array.isArray(sRes.data) ? sRes.data : []);
    }).catch(() => {}).finally(() => setLoadingMeta(false));
  }, []);

  // Auto-generate SKU code from name
  const handleNameChange = (name: string) => {
    const sku = name.trim().toUpperCase().replace(/[^A-Z0-9\s-]/g, '').replace(/\s+/g, '-').substring(0, 20);
    setForm(f => ({ ...f, name, skuCode: sku }));
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  );
  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  const selectedProduct = products.find(p => p.id === form.productId);
  const selectedSupplier = suppliers.find(s => s.id === form.preferredSupplierId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Component name is required'); return; }
    if (!form.skuCode.trim()) { setError('SKU Code is required'); return; }
    if (!form.productId) { setError('Please select which product this component is used in'); return; }
    setError('');
    setSaving(true);
    try {
      // 1. Create SKU
      const { data: sku } = await inventoryApi.createSku({
        name: form.name,
        skuCode: form.skuCode,
        category: form.category,
        productId: form.productId,
        reorderPoint: Number(form.reorderPoint),
        reorderQty: Number(form.reorderPoint) * 5,
        unitPrice: Number(form.unitPrice) || 0,
        costPrice: Number(form.costPrice) || 0,
        hsnCode: form.hsnCode || undefined,
        preferredSupplierId: form.preferredSupplierId || undefined,
      });

      // 2. If stock on hand > 0, create inward movement
      if (form.currentStockOnHand > 0) {
        const warehousesRes = await inventoryApi.getWarehouses();
        const defaultWarehouse = Array.isArray(warehousesRes.data) ? warehousesRes.data[0] : null;
        if (defaultWarehouse) {
          await inventoryApi.recordMovement({
            skuId: sku.id,
            type: 'inward',
            quantity: Number(form.currentStockOnHand),
            destWarehouseId: defaultWarehouse.id,
            referenceType: 'manual',
            reasonCode: 'Opening stock via Quick Add Component',
          });
        }
      }

      setSaved(true);
      setTimeout(() => {
        onSuccess?.();
        onClose?.();
      }, 1800);
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || 'Failed to save component');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-950 dark:text-white flex items-center gap-2">
            <Cpu size={18} className="text-crm-blue" />
            Quick Add Component
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Add a component to your catalog and link it to a finished product in one step
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} className="btn-ghost p-2 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Success State */}
      <AnimatePresence>
        {saved && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card p-8 flex flex-col items-center gap-4 text-center border-emerald-500/30 bg-emerald-500/10"
          >
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 size={28} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-white font-black text-base">Component Added Successfully</p>
              <p className="text-xs text-emerald-300 mt-1">
                "{form.name}" is now in the catalog and linked to {selectedProduct?.name || 'the product'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!saved && (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-crm-coral text-xs bg-crm-coral/10 border border-crm-coral/30 rounded-lg px-3 py-2">
              <AlertCircle size={13} />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Component Name */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Component Name <span className="text-crm-coral">*</span>
              </label>
              <input
                className="input w-full text-sm"
                placeholder="e.g. 10K SIP Resistor 5-Pin, 240W PA Amplifier..."
                value={form.name}
                onChange={e => handleNameChange(e.target.value)}
                required
              />
            </div>

            {/* SKU Code */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                SKU Code <span className="text-crm-coral">*</span>
                <span className="text-slate-500 font-normal ml-1">(auto-generated, editable)</span>
              </label>
              <input
                className="input w-full text-sm font-mono uppercase"
                placeholder="e.g. 10K-SIP-5PIN"
                value={form.skuCode}
                onChange={e => setForm(f => ({ ...f, skuCode: e.target.value.toUpperCase() }))}
                required
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Category</label>
              <select
                className="input w-full text-sm"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Used In Product */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Used In Product <span className="text-crm-coral">*</span>
              </label>
              <div className="relative">
                <div className="relative">
                  <Package size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    className="input w-full pl-8 text-sm"
                    placeholder="Search and select product..."
                    value={selectedProduct ? selectedProduct.name : productSearch}
                    onChange={e => {
                      setProductSearch(e.target.value);
                      setForm(f => ({ ...f, productId: '' }));
                      setShowProductDrop(true);
                    }}
                    onFocus={() => setShowProductDrop(true)}
                    onBlur={() => setTimeout(() => setShowProductDrop(false), 200)}
                  />
                  {selectedProduct && (
                    <button
                      type="button"
                      onClick={() => { setForm(f => ({ ...f, productId: '' })); setProductSearch(''); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                {showProductDrop && !selectedProduct && filteredProducts.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#1A2035] border border-slate-200 dark:border-[#2A3042] rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                    {loadingMeta ? (
                      <div className="px-4 py-3 text-xs text-slate-400">Loading...</div>
                    ) : filteredProducts.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={() => {
                          setForm(f => ({ ...f, productId: p.id }));
                          setProductSearch(p.name);
                          setShowProductDrop(false);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-white/5 flex items-center gap-2 text-sm text-white"
                      >
                        <Package size={13} className="text-crm-blue flex-shrink-0" />
                        <span>{p.name}</span>
                        <span className="text-[10px] text-slate-500 ml-auto">{p.category}</span>
                      </button>
                    ))}
                    {filteredProducts.length === 0 && (
                      <div className="px-4 py-3 text-xs text-slate-400">No products found. Go to Finished Products tab to seed them.</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Qty Needed Per Unit */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Qty Needed Per Unit <span className="text-crm-coral">*</span>
              </label>
              <input
                type="number"
                className="input w-full text-sm"
                min={1}
                placeholder="1"
                value={form.qtyNeededPerUnit}
                onChange={e => setForm(f => ({ ...f, qtyNeededPerUnit: Number(e.target.value) }))}
              />
              <p className="text-[10px] text-slate-500 mt-1">How many of this component goes into 1 finished unit</p>
            </div>

            {/* Current Stock On Hand */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Current Stock On Hand</label>
              <input
                type="number"
                className="input w-full text-sm"
                min={0}
                placeholder="0"
                value={form.currentStockOnHand}
                onChange={e => setForm(f => ({ ...f, currentStockOnHand: Number(e.target.value) }))}
              />
              <p className="text-[10px] text-slate-500 mt-1">Units you already have in stock today</p>
            </div>

            {/* Reorder Point */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Reorder Point</label>
              <input
                type="number"
                className="input w-full text-sm"
                min={0}
                placeholder="10"
                value={form.reorderPoint}
                onChange={e => setForm(f => ({ ...f, reorderPoint: Number(e.target.value) }))}
              />
              <p className="text-[10px] text-slate-500 mt-1">Alert when stock falls below this</p>
            </div>

            {/* Preferred Supplier */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Preferred Supplier</label>
              <div className="relative">
                <input
                  className="input w-full text-sm pr-7"
                  placeholder="Search supplier..."
                  value={selectedSupplier ? selectedSupplier.name : supplierSearch}
                  onChange={e => {
                    setSupplierSearch(e.target.value);
                    setForm(f => ({ ...f, preferredSupplierId: '' }));
                    setShowSupplierDrop(true);
                  }}
                  onFocus={() => setShowSupplierDrop(true)}
                  onBlur={() => setTimeout(() => setShowSupplierDrop(false), 200)}
                />
                {selectedSupplier && (
                  <button
                    type="button"
                    onClick={() => { setForm(f => ({ ...f, preferredSupplierId: '' })); setSupplierSearch(''); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                  >
                    <X size={13} />
                  </button>
                )}
                {showSupplierDrop && !selectedSupplier && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#1A2035] border border-slate-200 dark:border-[#2A3042] rounded-xl shadow-2xl max-h-40 overflow-y-auto">
                    {filteredSuppliers.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onMouseDown={() => {
                          setForm(f => ({ ...f, preferredSupplierId: s.id }));
                          setSupplierSearch(s.name);
                          setShowSupplierDrop(false);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-white/5 text-sm text-white"
                      >
                        {s.name}
                        {s.city && <span className="text-[10px] text-slate-500 ml-2">{s.city}</span>}
                      </button>
                    ))}
                    {filteredSuppliers.length === 0 && (
                      <div className="px-4 py-3 text-xs text-slate-400">No suppliers found</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Unit Price */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Unit Price (Sale ₹)</label>
              <input
                type="number"
                className="input w-full text-sm"
                min={0}
                placeholder="0.00"
                value={form.unitPrice || ''}
                onChange={e => setForm(f => ({ ...f, unitPrice: Number(e.target.value) }))}
              />
            </div>

            {/* Cost Price */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Cost Price (Purchase ₹)</label>
              <input
                type="number"
                className="input w-full text-sm"
                min={0}
                placeholder="0.00"
                value={form.costPrice || ''}
                onChange={e => setForm(f => ({ ...f, costPrice: Number(e.target.value) }))}
              />
            </div>

            {/* HSN Code */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">HSN Code <span className="text-slate-500 font-normal">(optional)</span></label>
              <input
                className="input w-full text-sm font-mono"
                placeholder="e.g. 85184000"
                value={form.hsnCode}
                onChange={e => setForm(f => ({ ...f, hsnCode: e.target.value }))}
              />
            </div>
          </div>

          {/* Summary Preview */}
          {form.name && form.productId && (
            <div className="bg-crm-blue/5 border border-crm-blue/20 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle2 size={15} className="text-crm-blue mt-0.5 flex-shrink-0" />
              <div className="text-xs text-slate-300 space-y-1">
                <p className="font-bold text-slate-950 dark:text-white">Ready to save</p>
                <p>
                  <span className="font-mono text-crm-blue">{form.skuCode}</span>
                  {' '} — {form.name}
                </p>
                <p>
                  Used in: <span className="text-crm-blue font-semibold">{selectedProduct?.name}</span>
                  {' · '} {form.qtyNeededPerUnit} unit(s) per finished product
                  {form.currentStockOnHand > 0 && ` · ${form.currentStockOnHand} in stock`}
                </p>
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center gap-3 justify-end">
            {onClose && (
              <button type="button" onClick={onClose} className="btn-ghost text-sm">Cancel</button>
            )}
            <button
              type="submit"
              disabled={saving || !form.name || !form.productId}
              className="btn-primary text-sm gap-2 min-w-[140px] shadow-glow-blue"
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
              {saving ? 'Saving...' : 'Add Component'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
