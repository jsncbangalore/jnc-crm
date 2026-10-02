import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingCart,
  Upload,
  X,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Building2,
  Calendar,
  DollarSign,
  Receipt,
  FileCheck,
  Eye,
  Trash2,
} from 'lucide-react';
import { ProjectStockPosition } from '../../types';
import { inventoryApi } from '../../services/api';

interface RecordPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ProjectStockPosition | null;
  onSuccess: () => void;
}

export const RecordPurchaseModal: React.FC<RecordPurchaseModalProps> = ({
  isOpen,
  onClose,
  item,
  onSuccess,
}) => {
  const [supplierName, setSupplierName] = useState<string>('');
  const [supplierGstin, setSupplierGstin] = useState<string>('');
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [quantityPurchased, setQuantityPurchased] = useState<number>(1);
  const [unitRate, setUnitRate] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(18);
  const [taxType, setTaxType] = useState<'cgst_sgst' | 'igst'>('cgst_sgst');
  const [notes, setNotes] = useState<string>('');

  // GST Document / Invoice File Upload
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentDataUrl, setDocumentDataUrl] = useState<string>('');
  const [documentName, setDocumentName] = useState<string>('');

  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setQuantityPurchased(item.shortage > 0 ? item.shortage : 1);
      setSupplierName('');
      setSupplierGstin('');
      setInvoiceNumber('');
      setInvoiceDate(new Date().toISOString().split('T')[0]);
      setUnitRate(0);
      setTaxRate(18);
      setDocumentFile(null);
      setDocumentDataUrl('');
      setDocumentName('');
      setError(null);
    }
  }, [item]);

  if (!isOpen || !item) return null;

  // Realtime GST Math
  const qty = Number(quantityPurchased) || 0;
  const rate = Number(unitRate) || 0;
  const subtotal = Number((qty * rate).toFixed(2));
  const gstAmount = Number(((subtotal * taxRate) / 100).toFixed(2));
  const cgstAmount = taxType === 'cgst_sgst' ? Number((gstAmount / 2).toFixed(2)) : 0;
  const sgstAmount = taxType === 'cgst_sgst' ? Number((gstAmount / 2).toFixed(2)) : 0;
  const igstAmount = taxType === 'igst' ? gstAmount : 0;
  const grandTotal = Number((subtotal + gstAmount).toFixed(2));

  // File Upload Handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be under 10MB');
      return;
    }

    setDocumentFile(file);
    setDocumentName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      setDocumentDataUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveDocument = () => {
    setDocumentFile(null);
    setDocumentDataUrl('');
    setDocumentName('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (qty <= 0) {
      setError('Please enter a valid purchase quantity greater than 0');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await inventoryApi.recordProjectStockPurchase(item.id, {
        quantityPurchased: qty,
        unitRate: rate,
        taxRate,
        supplierName: supplierName.trim(),
        supplierGstin: supplierGstin.trim().toUpperCase(),
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate,
        documentDataUrl,
        notes: notes.trim(),
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to record component purchase');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto"
        >
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 text-crm-coral flex items-center justify-center border border-red-500/30 shadow-glow-coral">
                <ShoppingCart size={20} />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-950 dark:text-white flex items-center gap-2">
                  <span>Record Component Purchase & GST Invoice</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300 border border-red-300 dark:border-red-500/30 font-bold">
                    Deficit: {item.shortage} {item.unit}
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Log supplier purchase, calculate GST breakdown & upload Tax Invoice document
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-crm-coral text-xs flex items-center gap-2">
                <AlertTriangle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Target Component Info Card */}
            <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042] grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <span className="text-[10.5px] text-slate-400 block">Product / Project:</span>
                <strong className="text-white truncate block">{item.project}</strong>
              </div>
              <div>
                <span className="text-[10.5px] text-slate-400 block">Component / SKU:</span>
                <strong className="text-crm-blue-light font-mono block">{item.itemCode}</strong>
              </div>
              <div>
                <span className="text-[10.5px] text-slate-400 block">Specs / Package:</span>
                <span className="text-slate-300 block truncate">{item.partValue || '-'} ({item.package || 'TH'})</span>
              </div>
              <div>
                <span className="text-[10.5px] text-slate-400 block">Current Store Stock:</span>
                <strong className="text-emerald-400 font-mono block">{item.presentStock} {item.unit}</strong>
              </div>
            </div>

            {/* Supplier Information */}
            <div className="space-y-3 p-3.5 rounded-xl bg-slate-100 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042]">
              <div className="font-bold text-slate-200 flex items-center gap-1.5 border-b border-slate-200 dark:border-[#2A3042] pb-2">
                <Building2 size={14} className="text-crm-blue" />
                <span>1. Supplier & Invoice Details</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Supplier / Vendor Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter supplier or vendor name"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    className="input font-bold text-slate-950 dark:text-white"
                  />
                </div>

                <div>
                  <label className="label">Supplier GSTIN (15 Digits)</label>
                  <input
                    type="text"
                    maxLength={15}
                    placeholder="e.g. 29ABCDE1234F1Z5"
                    value={supplierGstin}
                    onChange={(e) => setSupplierGstin(e.target.value.toUpperCase())}
                    className="input uppercase font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Purchase Invoice / Bill No *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. INV-001"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    className="input font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="label">Invoice Date</label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="input text-white"
                  />
                </div>
              </div>
            </div>

            {/* Quantity, Rate & GST Breakdown */}
            <div className="space-y-3 p-3.5 rounded-xl bg-slate-100 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042]">
              <div className="font-bold text-slate-200 flex items-center gap-1.5 border-b border-slate-200 dark:border-[#2A3042] pb-2">
                <Receipt size={14} className="text-amber-400" />
                <span>2. Quantity, Rate & GST Breakdown</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="label text-emerald-400">Qty Purchased *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={quantityPurchased}
                    onChange={(e) => setQuantityPurchased(Number(e.target.value) || 1)}
                    className="input font-mono font-bold text-emerald-400 text-sm"
                  />
                </div>

                <div>
                  <label className="label">Rate per Unit (₹ excl. GST)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={unitRate}
                    onChange={(e) => setUnitRate(Number(e.target.value) || 0)}
                    className="input font-mono font-bold text-slate-950 dark:text-white text-sm"
                  />
                </div>

                <div>
                  <label className="label">GST Rate %</label>
                  <select
                    value={taxRate}
                    onChange={(e) => setTaxRate(Number(e.target.value))}
                    className="input font-bold text-amber-300"
                  >
                    <option value={18}>18% (Standard Electronics)</option>
                    <option value={12}>12% (Machinery / Parts)</option>
                    <option value={28}>28% (Luxury / High Tax)</option>
                    <option value={5}>5% (Concessional)</option>
                    <option value={0}>0% (Exempt / Nil)</option>
                  </select>
                </div>

                <div>
                  <label className="label">Tax Type</label>
                  <select
                    value={taxType}
                    onChange={(e) => setTaxType(e.target.value as any)}
                    className="input font-bold"
                  >
                    <option value="cgst_sgst">Intrastate (CGST+SGST)</option>
                    <option value="igst">Interstate (IGST)</option>
                  </select>
                </div>
              </div>

              {/* Real-time GST Calculation Pill Strip */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#1E2230] border border-amber-500/30 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2 rounded-lg bg-slate-100 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042]">
                  <span className="text-[10px] text-slate-400 block">Base Subtotal</span>
                  <span className="font-mono font-bold text-slate-950 dark:text-white text-xs">
                    ₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {taxType === 'cgst_sgst' ? (
                  <>
                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042]">
                      <span className="text-[10px] text-amber-400 block">CGST ({taxRate / 2}%)</span>
                      <span className="font-mono font-bold text-amber-300 text-xs">
                        ₹{cgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042]">
                      <span className="text-[10px] text-amber-400 block">SGST ({taxRate / 2}%)</span>
                      <span className="font-mono font-bold text-amber-300 text-xs">
                        ₹{sgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="p-2 rounded-lg bg-slate-100 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042] col-span-2">
                    <span className="text-[10px] text-amber-400 block">IGST ({taxRate}%)</span>
                    <span className="font-mono font-bold text-amber-300 text-xs">
                      ₹{igstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}

                <div className="p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30">
                  <span className="text-[10px] text-emerald-400 block font-bold">Total with GST</span>
                  <span className="font-mono font-black text-emerald-300 text-sm">
                    ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* 3. GST Tax Invoice / Bill Document Upload Area */}
            <div className="space-y-3 p-3.5 rounded-xl bg-slate-100 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042]">
              <div className="font-bold text-slate-200 flex items-center justify-between border-b border-slate-200 dark:border-[#2A3042] pb-2">
                <span className="flex items-center gap-1.5">
                  <Upload size={14} className="text-crm-teal" />
                  <span>3. Upload GST Invoice / Vendor Bill Document</span>
                </span>
                <span className="text-[10.5px] text-slate-400 font-normal">PDF, PNG, JPG (Max 10MB)</span>
              </div>

              {documentDataUrl ? (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#1E2230] border border-emerald-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                      <FileCheck size={18} />
                    </div>
                    <div>
                      <strong className="text-white text-xs block">{documentName || 'GST_Tax_Invoice.pdf'}</strong>
                      <span className="text-[10.5px] text-emerald-400">Attached & Ready to Save</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRemoveDocument}
                      className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30"
                      title="Remove Document"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <label className="border-2 border-dashed border-slate-200 dark:border-[#2A3042] hover:border-crm-blue/50 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-colors bg-white dark:bg-[#181B26]/50">
                  <Upload size={22} className="text-slate-400 mb-1" />
                  <span className="text-xs font-bold text-slate-300">Click to Upload GST Tax Invoice / Bill</span>
                  <span className="text-[10.5px] text-slate-500 mt-0.5">Supports PDF or Image of Supplier Receipt</span>
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            <div>
              <label className="label">Procurement Remarks / Notes</label>
              <textarea
                rows={2}
                placeholder="Enter remarks or notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input resize-none"
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-[#2A3042]">
              <span className="text-[11px] text-slate-400">
                Saving will add <strong>+{qty} {item.unit}</strong> directly to Store Stock and clear the shortage.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="btn-ghost text-xs px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-5 py-2.5 font-bold shadow-lg flex items-center gap-2"
                >
                  {saving ? (
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    <>
                      <CheckCircle2 size={15} />
                      <span>Confirm Purchase & Inward to Stock</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
