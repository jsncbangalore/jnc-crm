import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  Boxes,
  X,
  Layers,
  Building2,
  Receipt,
  CheckCircle2,
  Percent,
  AlertTriangle,
  TrendingUp,
  Hash,
} from 'lucide-react';
import { inventoryApi } from '../../services/api';

interface RestockComponentModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: any | null;
  onSuccess: () => void;
}

export const RestockComponentModal: React.FC<RestockComponentModalProps> = ({
  isOpen,
  onClose,
  item,
  onSuccess,
}) => {
  const [quantityToAdd, setQuantityToAdd] = useState<number | ''>(50);
  const [batchNumber, setBatchNumber] = useState<string>('');
  const [supplierName, setSupplierName] = useState<string>('');
  const [unitPrice, setUnitPrice] = useState<number | ''>(5);
  const [taxRate, setTaxRate] = useState<number>(18);
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      const shortageVal = Number(item.shortage ?? 0);
      const defaultQty = shortageVal > 0 ? shortageVal : 50;
      setQuantityToAdd(defaultQty);

      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      setBatchNumber(`LOT-${todayStr}-${item.skuCode?.slice(-4) || '01'}`);
      setSupplierName(item.supplier || '');
      setUnitPrice(Number(item.unitPrice || 0));
      setTaxRate(Number(item.taxRate ?? 18));
      setInvoiceNumber('');
      setError(null);
    }
  }, [item]);

  if (!isOpen || !item) return null;

  // Real-time Calculations
  const currentStock = Number(item.quantityOnHand ?? item.presentStock ?? 0);
  const addQty = quantityToAdd === '' ? 0 : Math.max(0, Number(quantityToAdd));
  const newTotalStock = currentStock + addQty;
  const plannedReq = Number(item.plannedRequirement || 50);
  const remainingShortage = Math.max(0, plannedReq - newTotalStock);

  const baseRate = unitPrice === '' ? 0 : Number(unitPrice) || 0;
  const batchBaseTotal = Number((addQty * baseRate).toFixed(2));
  const batchGstAmount = Number(((batchBaseTotal * taxRate) / 100).toFixed(2));
  const batchGrandTotal = Number((batchBaseTotal + batchGstAmount).toFixed(2));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addQty <= 0) {
      setError('Please enter a restock quantity greater than 0');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // 1. Update Project Stock Position if exists
      if (item.positionId) {
        let updatedNotes = item.notes || '';
        const restockLog = `\n[${new Date().toISOString().slice(0, 10)}] Restocked +${addQty} ${
          item.unit || 'Nos'
        } (Batch: ${batchNumber}, Supplier: ${supplierName}, Inv: ${invoiceNumber || 'N/A'})`;
        updatedNotes = `${updatedNotes}${restockLog}`.trim();

        let newStatus = 'Sufficient';
        if (remainingShortage <= 0 && newTotalStock >= plannedReq * 1.5) {
          newStatus = 'Surplus';
        } else if (remainingShortage <= 0) {
          newStatus = 'Sufficient';
        } else {
          newStatus = 'Shortage';
        }

        await inventoryApi.updateProjectStockPosition(item.positionId, {
          presentStock: newTotalStock,
          shortage: remainingShortage,
          status: newStatus,
          notes: updatedNotes,
        });
      }

      // 2. Update SKU if exists
      if (item.skuId) {
        await inventoryApi.updateSku(item.skuId, {
          costPrice: baseRate,
          unitPrice: baseRate,
          taxRate: taxRate,
          supplierName: supplierName.trim() || undefined,
        });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to apply restock batch');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          className="bg-white dark:bg-[#181B26] border border-slate-300 dark:border-[#2A3042] rounded-2xl w-full max-w-xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden my-auto"
        >
          {/* Header */}
          <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20 shadow-sm">
                <Zap size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-black text-slate-950 dark:text-white">
                    Restock / Inflow Batch
                  </h2>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-violet-50 dark:bg-crm-violet/20 text-violet-700 dark:text-crm-violet-light border border-violet-200 dark:border-crm-violet/30 font-bold">
                    {item.skuCode || item.itemCode}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-sm">
                  {item.name || item.partValue} &bull; {item.project}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white transition-colors"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Form */}
          <form id="restock-form" onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1">
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-red-500/10 border border-rose-200 dark:border-red-500/30 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2 font-medium">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* LIVE STOCK PREVIEW BANNER */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141722] border border-slate-300 dark:border-blue-500/30 shadow-xs">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                <span className="flex items-center gap-1.5 text-blue-600 dark:text-crm-blue">
                  <TrendingUp size={13} /> Stock Position Impact
                </span>
                {remainingShortage === 0 ? (
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 size={13} /> Deficit Fully Resolved!
                  </span>
                ) : (
                  <span className="text-amber-700 dark:text-amber-400 font-bold flex items-center gap-1">
                    <AlertTriangle size={13} /> Remaining Deficit: {remainingShortage} {item.unit}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-1.5 rounded-lg bg-white dark:bg-[#1E2230] border border-slate-200 dark:border-white/5">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase">Current Stock</div>
                  <div className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-300 font-mono mt-0.5">
                    {currentStock} <span className="text-[10px] font-normal text-slate-500">{item.unit || 'Nos'}</span>
                  </div>
                </div>

                <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30">
                  <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold uppercase">+ Adding Batch</div>
                  <div className="text-xs sm:text-sm font-black text-emerald-700 dark:text-emerald-400 font-mono mt-0.5">
                    +{addQty} <span className="text-[10px] font-normal">{item.unit || 'Nos'}</span>
                  </div>
                </div>

                <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-crm-blue/10 border border-blue-200 dark:border-crm-blue/30">
                  <div className="text-[10px] text-blue-700 dark:text-crm-blue font-semibold uppercase">New Total Stock</div>
                  <div className="text-xs sm:text-sm font-black text-blue-800 dark:text-white font-mono mt-0.5">
                    {newTotalStock} <span className="text-[10px] font-normal">{item.unit || 'Nos'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Batch Quantity & Batch/Lot Reference */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-slate-200 mb-1">
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <Boxes size={13} />
                    BATCH QUANTITY <span className="text-red-500">*</span>
                  </span>
                  {item.shortage > 0 && (
                    <button
                      type="button"
                      onClick={() => setQuantityToAdd(item.shortage)}
                      className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline font-bold"
                    >
                      Fill Deficit ({item.shortage})
                    </button>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    value={quantityToAdd}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setQuantityToAdd(val === '' ? '' : parseInt(val, 10));
                    }}
                    className="w-full px-3 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-emerald-600 dark:text-emerald-400 pr-14 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="0"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-[#1E2230] px-1.5 py-0.5 rounded border border-slate-200 dark:border-[#2A3042] pointer-events-none select-none">
                    {item.unit || 'Nos'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-slate-200 mb-1">
                  <span className="inline-flex items-center gap-1 text-teal-600 dark:text-crm-teal">
                    <Hash size={13} />
                    BATCH / LOT REFERENCE #
                  </span>
                </label>
                <input
                  type="text"
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. LOT-001"
                />
              </div>
            </div>

            {/* Supplier & Invoice Number */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-slate-200 mb-1">
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <Building2 size={13} />
                    SUPPLIER / VENDOR NAME
                  </span>
                </label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter supplier name"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-slate-200 mb-1">
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-crm-amber">
                    <Receipt size={13} />
                    SUPPLIER GST INVOICE #
                  </span>
                </label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono uppercase rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. INV-001"
                />
              </div>
            </div>

            {/* Unit Price & GST Rate */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-slate-200 mb-1">
                  PURCHASE UNIT COST (₹ BASE)
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold pointer-events-none select-none">₹</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={unitPrice}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                        setUnitPrice(val === '' ? '' : (val as any));
                      }
                    }}
                    className="w-full pl-6 pr-3 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-slate-200 mb-1">
                  <span className="inline-flex items-center gap-1 text-teal-600 dark:text-crm-teal">
                    <Percent size={13} /> GST TAX RATE
                  </span>
                </label>
                <select
                  value={taxRate}
                  onChange={(e) => setTaxRate(parseInt(e.target.value))}
                  className="w-full px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={0}>0% (Exempt / Nil)</option>
                  <option value={5}>5% GST (2.5% + 2.5%)</option>
                  <option value={12}>12% GST (6% + 6%)</option>
                  <option value={18}>18% GST (9% + 9%) [Standard]</option>
                  <option value={28}>28% GST (14% + 14%)</option>
                </select>
              </div>
            </div>

            {/* Batch Financial Summary Box */}
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-300 dark:border-[#2A3042] flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400 font-medium">Batch Cost: </span>
                <span className="font-mono text-slate-900 dark:text-slate-200 font-bold">
                  {addQty} × ₹{baseRate.toFixed(2)} = ₹{batchBaseTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-slate-500 text-[11px] ml-1.5">(+{taxRate}% GST: ₹{batchGstAmount.toFixed(2)})</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold block">Total Batch Inflow</span>
                <span className="text-xs sm:text-sm font-black text-emerald-700 dark:text-emerald-400 font-mono">
                  ₹{batchGrandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </form>

          {/* Fixed Footer Actions */}
          <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="restock-form"
              disabled={saving}
              className="px-5 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              {saving ? (
                <span>Applying Restock...</span>
              ) : (
                <>
                  <Zap size={14} className="fill-white" />
                  <span>Apply Restock (+{addQty} {item.unit || 'Nos'})</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
