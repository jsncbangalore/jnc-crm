import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Plus, Trash2, Upload, FileText, CheckCircle2,
  AlertCircle, RefreshCw, Search, Building2, Receipt
} from 'lucide-react';
import { inventoryApi } from '../../services/api';

const GST_RATES = [0, 5, 12, 18, 28];

interface PurchaseItem {
  skuId: string;
  skuCode: string;
  name: string;
  quantity: number;
  unitRate: number;
}

interface Props {
  supplier: {
    id: string;
    name: string;
    gstin?: string;
    phone?: string;
    city?: string;
  };
  prefillSkuId?: string; // for "Buy More" from low-stock dashboard
  onClose: () => void;
  onSuccess?: () => void;
}

export default function SupplierPurchaseModal({ supplier, prefillSkuId, onClose, onSuccess }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().slice(0, 10),
    supplierGstin: supplier.gstin || '',
    taxRate: 18,
    taxType: 'cgst_sgst' as 'cgst_sgst' | 'igst',
    notes: '',
  });

  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [skuSearch, setSkuSearch] = useState('');
  const [skuResults, setSkuResults] = useState<any[]>([]);
  const [showSkuDrop, setShowSkuDrop] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [documentUrl, setDocumentUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Load all SKUs once
  const [allSkus, setAllSkus] = useState<any[]>([]);
  useEffect(() => {
    inventoryApi.getSkus().then(({ data }) => {
      setAllSkus(Array.isArray(data) ? data : []);
      // If prefillSkuId, pre-add it
      if (prefillSkuId) {
        const sku = (Array.isArray(data) ? data : []).find((s: any) => s.id === prefillSkuId);
        if (sku) {
          setItems([{
            skuId: sku.id,
            skuCode: sku.skuCode,
            name: sku.name,
            quantity: sku.reorderQty || 1,
            unitRate: sku.costPrice || sku.unitPrice || 0,
          }]);
        }
      }
    }).catch(() => {});
  }, [prefillSkuId]);

  useEffect(() => {
    if (!skuSearch.trim()) { setSkuResults([]); return; }
    const q = skuSearch.toLowerCase();
    setSkuResults(
      allSkus
        .filter(s => s.skuCode.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
        .slice(0, 8)
    );
  }, [skuSearch, allSkus]);

  const handleAddSku = (sku: any) => {
    const exists = items.find(i => i.skuId === sku.id);
    if (exists) {
      setItems(prev => prev.map(i => i.skuId === sku.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setItems(prev => [...prev, {
        skuId: sku.id,
        skuCode: sku.skuCode,
        name: sku.name,
        quantity: 1,
        unitRate: sku.costPrice || 0,
      }]);
    }
    setSkuSearch('');
    setShowSkuDrop(false);
  };

  const handleRemoveItem = (skuId: string) => {
    setItems(prev => prev.filter(i => i.skuId !== skuId));
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    setUploading(true);
    try {
      const { data } = await inventoryApi.uploadPurchaseDocument(file);
      setDocumentUrl(data.url);
    } catch (err: any) {
      setError('File upload failed: ' + (err?.response?.data?.message || err.message));
      setUploadedFile(null);
    } finally {
      setUploading(false);
    }
  };

  // GST Math
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitRate, 0);
  const gstAmount = Math.round(((subtotal * form.taxRate) / 100) * 100) / 100;
  const cgst = form.taxType === 'cgst_sgst' ? gstAmount / 2 : 0;
  const sgst = form.taxType === 'cgst_sgst' ? gstAmount / 2 : 0;
  const igst = form.taxType === 'igst' ? gstAmount : 0;
  const grandTotal = subtotal + gstAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) { setError('Add at least one item'); return; }
    setError('');
    setSaving(true);
    try {
      await inventoryApi.recordSupplierPurchase(supplier.id, {
        invoiceNumber: form.invoiceNumber || undefined,
        invoiceDate: form.invoiceDate,
        supplierGstin: form.supplierGstin || undefined,
        taxRate: form.taxRate,
        taxType: form.taxType,
        documentUrl: documentUrl || undefined,
        notes: form.notes || undefined,
        items: items.map(i => ({ skuId: i.skuId, quantity: i.quantity, unitRate: i.unitRate })),
      });
      setSaved(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 2000);
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || 'Failed to record purchase');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-slate-50 dark:bg-[#0F1117] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-[#2A3042]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Receipt size={16} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-950 dark:text-white">Record Purchase</h2>
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Building2 size={10} />
                {supplier.name}
                {supplier.city && ` — ${supplier.city}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost p-2 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <AnimatePresence>
            {saved && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-4 py-8 text-center"
              >
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 size={32} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-white font-black text-lg">Purchase Recorded Successfully</p>
                  <p className="text-xs text-emerald-300 mt-1">
                    ₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })} purchase from {supplier.name}
                  </p>
                  {documentUrl && (
                    <p className="text-xs text-slate-400 mt-1">GST document uploaded and linked</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!saved && (
            <form id="purchase-form" onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="flex items-center gap-2 text-crm-coral text-xs bg-crm-coral/10 border border-crm-coral/30 rounded-lg px-3 py-2">
                  <AlertCircle size={13} />
                  {error}
                </div>
              )}

              {/* Invoice Details Row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Invoice Number</label>
                  <input
                    className="input w-full text-sm"
                    placeholder="e.g. INV-2024-001"
                    value={form.invoiceNumber}
                    onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Invoice Date</label>
                  <input
                    type="date"
                    className="input w-full text-sm"
                    value={form.invoiceDate}
                    onChange={e => setForm(f => ({ ...f, invoiceDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Supplier GSTIN</label>
                  <input
                    className="input w-full text-sm font-mono"
                    placeholder="15-digit GSTIN"
                    value={form.supplierGstin}
                    onChange={e => setForm(f => ({ ...f, supplierGstin: e.target.value.toUpperCase() }))}
                    maxLength={15}
                  />
                </div>
              </div>

              {/* Items Table */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Items Purchased <span className="text-crm-coral">*</span>
                </label>

                {/* SKU Search */}
                <div className="relative mb-3">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    className="input w-full pl-8 text-sm"
                    placeholder="Search SKU code or name to add item..."
                    value={skuSearch}
                    onChange={e => { setSkuSearch(e.target.value); setShowSkuDrop(true); }}
                    onFocus={() => setShowSkuDrop(true)}
                    onBlur={() => setTimeout(() => setShowSkuDrop(false), 200)}
                  />
                  {showSkuDrop && skuResults.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#1A2035] border border-slate-200 dark:border-[#2A3042] rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                      {skuResults.map(sku => (
                        <button
                          key={sku.id}
                          type="button"
                          onMouseDown={() => handleAddSku(sku)}
                          className="w-full text-left px-4 py-2.5 hover:bg-white/5 text-sm"
                        >
                          <span className="font-mono text-crm-blue text-xs">{sku.skuCode}</span>
                          <span className="text-white ml-2">{sku.name}</span>
                          <span className="text-slate-400 text-[10px] ml-2">₹{sku.costPrice || 0}/unit</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Items list */}
                {items.length === 0 ? (
                  <div className="border border-dashed border-slate-200 dark:border-[#2A3042] rounded-xl p-6 text-center text-slate-500 text-xs">
                    Search and add items above
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Header row */}
                    <div className="grid grid-cols-12 gap-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      <span className="col-span-5">Component</span>
                      <span className="col-span-2 text-right">Qty</span>
                      <span className="col-span-3 text-right">Unit Rate ₹</span>
                      <span className="col-span-1 text-right">Amount</span>
                      <span className="col-span-1" />
                    </div>
                    {items.map(item => (
                      <div key={item.skuId} className="grid grid-cols-12 gap-2 items-center bg-white/3 rounded-lg px-2 py-2 border border-white/5">
                        <div className="col-span-5">
                          <p className="text-xs font-mono text-crm-blue">{item.skuCode}</p>
                          <p className="text-[10px] text-slate-400 truncate">{item.name}</p>
                        </div>
                        <input
                          type="number"
                          className="col-span-2 input text-xs text-right py-1 px-2"
                          min={1}
                          value={item.quantity}
                          onChange={e => setItems(prev => prev.map(i => i.skuId === item.skuId ? { ...i, quantity: Number(e.target.value) } : i))}
                        />
                        <input
                          type="number"
                          className="col-span-3 input text-xs text-right py-1 px-2"
                          min={0}
                          step={0.01}
                          value={item.unitRate}
                          onChange={e => setItems(prev => prev.map(i => i.skuId === item.skuId ? { ...i, unitRate: Number(e.target.value) } : i))}
                        />
                        <span className="col-span-1 text-xs text-right text-slate-300">
                          ₹{(item.quantity * item.unitRate).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.skuId)}
                          className="col-span-1 flex items-center justify-end text-slate-500 hover:text-crm-coral transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* GST Config + Math Panel */}
              {items.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* GST Controls */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">GST Rate</label>
                      <div className="flex gap-1.5 flex-wrap">
                        {GST_RATES.map(r => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setForm(f => ({ ...f, taxRate: r }))}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              form.taxRate === r
                                ? 'bg-crm-blue text-white shadow-glow-blue'
                                : 'bg-white/5 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white border border-white/10'
                            }`}
                          >
                            {r}%
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">Tax Type</label>
                      <div className="flex gap-2">
                        {(['cgst_sgst', 'igst'] as const).map(t => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setForm(f => ({ ...f, taxType: t }))}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              form.taxType === t
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                : 'bg-white/5 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white border border-white/10'
                            }`}
                          >
                            {t === 'cgst_sgst' ? 'CGST + SGST' : 'IGST (Inter-state)'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Math Summary */}
                  <div className="bg-slate-100 dark:bg-[#141722] rounded-xl border border-slate-200 dark:border-[#2A3042] p-4 space-y-2 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Subtotal</span>
                      <span className="font-mono">₹{subtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    </div>
                    {form.taxType === 'cgst_sgst' ? (
                      <>
                        <div className="flex justify-between text-slate-400">
                          <span>CGST ({form.taxRate / 2}%)</span>
                          <span className="font-mono">₹{cgst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>SGST ({form.taxRate / 2}%)</span>
                          <span className="font-mono">₹{sgst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between text-slate-400">
                        <span>IGST ({form.taxRate}%)</span>
                        <span className="font-mono">₹{igst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="border-t border-slate-200 dark:border-[#2A3042] pt-2 flex justify-between text-white font-black text-sm">
                      <span>Grand Total</span>
                      <span className="font-mono text-emerald-400">₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      {items.length} item{items.length !== 1 ? 's' : ''} · {form.taxRate}% GST
                    </p>
                  </div>
                </div>
              )}

              {/* GST Document Upload */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  GST Invoice Document <span className="text-slate-500 font-normal">(optional — PDF, JPG, PNG, max 20MB)</span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {!uploadedFile ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border border-dashed border-slate-200 dark:border-[#2A3042] hover:border-crm-blue/40 rounded-xl p-4 flex flex-col items-center gap-2 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white transition-colors"
                  >
                    <Upload size={18} />
                    <span className="text-xs">Click to upload GST invoice / bill PDF or image</span>
                  </button>
                ) : (
                  <div className={`flex items-center gap-3 bg-white/3 border rounded-xl px-4 py-3 ${documentUrl ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
                    {uploading ? (
                      <RefreshCw size={16} className="text-amber-400 animate-spin flex-shrink-0" />
                    ) : documentUrl ? (
                      <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
                    ) : (
                      <AlertCircle size={16} className="text-amber-400 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-950 dark:text-white truncate">{uploadedFile.name}</p>
                      <p className="text-[10px] text-slate-400">
                        {uploading ? 'Uploading...' : documentUrl ? 'Uploaded & linked' : 'Upload failed'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setUploadedFile(null); setDocumentUrl(''); }}
                      className="text-slate-500 hover:text-crm-coral"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Notes / Remarks</label>
                <textarea
                  className="input w-full text-sm resize-none"
                  rows={2}
                  placeholder="e.g. Delivery expected in 5 days, partial shipment..."
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        {!saved && (
          <div className="p-5 border-t border-slate-200 dark:border-[#2A3042] flex items-center justify-between gap-3">
            <div className="text-xs text-slate-400">
              {items.length > 0 && (
                <span className="text-white font-bold">
                  ₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </span>
              )}
              {items.length === 0 && 'Add items above to proceed'}
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={onClose} className="btn-ghost text-sm">Cancel</button>
              <button
                type="submit"
                form="purchase-form"
                disabled={saving || items.length === 0 || uploading}
                className="btn-primary text-sm gap-2 shadow-glow-blue min-w-[160px]"
              >
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {saving ? 'Recording...' : 'Record Purchase'}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
