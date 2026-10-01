import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Camera,
  Search,
  Receipt,
  Building2,
  Eye,
  Trash2,
  Printer,
  Sparkles,
  RefreshCw,
  Plus,
  Tag,
  Paperclip,
  CheckCircle2,
  X,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Coins,
  Calculator,
  TrendingUp,
  PackageCheck,
} from 'lucide-react';
import { inventoryApi } from '../../services/api';
import { SmartBillScannerModal } from './SmartBillScannerModal';
import { DigitalSoftCopyModal } from './DigitalSoftCopyModal';

interface PurchaseBillsHubProps {
  existingProjects?: string[];
  onStockUpdated: () => void;
}

export const formatImageUrl = (url?: string) => {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return `${url.startsWith('/') ? '' : '/'}${url}`;
};

export const PurchaseBillsHub: React.FC<PurchaseBillsHubProps> = ({
  onStockUpdated,
}) => {
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modals & Actions
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [selectedSoftCopyBill, setSelectedSoftCopyBill] = useState<any | null>(null);
  const [previewScanImage, setPreviewScanImage] = useState<{ url: string; title: string } | null>(null);
  const [deleteConfirmBill, setDeleteConfirmBill] = useState<{ id: string; invoiceNumber: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Fetch Bills
  const fetchBills = async () => {
    try {
      setLoading(true);
      const res = await inventoryApi.getPurchaseBills();
      const list = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.data)
        ? res.data.data
        : [];
      setBills(list);
    } catch (err: any) {
      console.error('Failed to load purchase bills:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBills();
  }, []);

  // Filtered Bills
  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          (b.invoiceNumber && b.invoiceNumber.toLowerCase().includes(q)) ||
          (b.vendorName && b.vendorName.toLowerCase().includes(q)) ||
          (b.vendorGstin && b.vendorGstin.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [bills, search]);

  // Metrics
  const totalBillsCount = bills.length;
  const totalExpenditure = bills.reduce((sum, b) => sum + (Number(b.grandTotal) || 0), 0);
  const totalGstPaid = bills.reduce((sum, b) => sum + (Number(b.totalTax) || 0), 0);
  const totalItemsInwarded = bills.reduce(
    (sum, b) =>
      sum +
      (Array.isArray(b.items)
        ? b.items.reduce((s: number, it: any) => s + (Number(it.quantity) || 0), 0)
        : 0),
    0
  );

  return (
    <div className="space-y-4">
      {/* KPI METRICS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        {/* Card 1: Archived Bills */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400">
              Archived Bills
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-crm-blue/15 text-crm-blue flex items-center justify-center border border-blue-200 dark:border-transparent">
              <Receipt size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-950 dark:text-white mt-2 tabular-nums font-mono">
            {totalBillsCount} <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">Invoices</span>
          </p>
          <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">Supplier Receipts Vault</span>
        </div>

        {/* Card 2: Total Inward Value */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400">
              Total Inward Value
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-transparent">
              <TrendingUp size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-950 dark:text-white mt-2 tabular-nums font-mono">
            ₹{Math.round(totalExpenditure).toLocaleString('en-IN')}
          </p>
          <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">Grand Total with GST</span>
        </div>

        {/* Card 3: Total GST Paid */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400">
              Total GST Paid
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center border border-amber-200 dark:border-transparent">
              <Calculator size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-700 dark:text-amber-400 mt-2 tabular-nums font-mono">
            ₹{Math.round(totalGstPaid).toLocaleString('en-IN')}
          </p>
          <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">CGST + SGST Input Credit</span>
        </div>

        {/* Card 4: Units Inwarded */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400">
              Units Inwarded
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-200 dark:border-transparent">
              <PackageCheck size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-950 dark:text-white mt-2 tabular-nums font-mono">
            {totalItemsInwarded.toLocaleString('en-IN')} <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">Nos</span>
          </p>
          <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">Stock Replenished</span>
        </div>
      </div>

      {/* ACTION & SEARCH BAR */}
      <div className="flex items-center justify-between gap-3 flex-wrap bg-white dark:bg-[#181B26] p-3.5 rounded-2xl border border-slate-200 dark:border-[#2A3042] shadow-sm">
        <div className="relative flex-1 min-w-[280px]">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by invoice number, vendor name, or GSTIN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 dark:bg-[#141722] border border-slate-300 dark:border-[#2A3042] rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-crm-blue"
          />
        </div>

        {/* Scan & Add Bill Button */}
        <button
          onClick={() => setShowScannerModal(true)}
          className="btn-primary text-xs px-4 py-2 font-bold shadow-sm flex items-center gap-2"
        >
          <Camera size={14} />
          <span>Scan & Add New Bill</span>
        </button>
      </div>

      {/* BILLS REPOSITORY TABLE */}
      <div className="table-wrapper border border-slate-200 dark:border-[#2A3042] rounded-xl overflow-hidden shadow-sm bg-white dark:bg-[#141722]">
        <table className="crm-table w-full border-collapse text-xs">
          <thead className="bg-slate-100 dark:bg-[#181B26] border-b border-slate-300 dark:border-[#2A3042] text-slate-800 dark:text-slate-300 font-bold shadow-sm">
            <tr>
              <th className="text-left px-3 py-2.5 font-bold border-r border-slate-200 dark:border-[#2A3042]/60 min-w-[170px]">Invoice No & Date</th>
              <th className="text-left px-3 py-2.5 font-bold border-r border-slate-200 dark:border-[#2A3042]/60 min-w-[180px]">Vendor / Supplier</th>
              <th className="text-center px-3 py-2.5 font-bold border-r border-slate-200 dark:border-[#2A3042]/60 whitespace-nowrap">Components</th>
              <th className="text-right px-3 py-2.5 font-bold border-r border-slate-200 dark:border-[#2A3042]/60 whitespace-nowrap">Base Amount</th>
              <th className="text-right px-3 py-2.5 font-bold border-r border-slate-200 dark:border-[#2A3042]/60 whitespace-nowrap">GST Paid</th>
              <th className="text-right px-3 py-2.5 font-bold border-r border-slate-200 dark:border-[#2A3042]/60 whitespace-nowrap">Grand Total</th>
              <th className="text-center px-3 py-2.5 font-bold border-r border-slate-200 dark:border-[#2A3042]/60 whitespace-nowrap">Original Bill</th>
              <th className="text-center px-3 py-2.5 font-bold border-r border-slate-200 dark:border-[#2A3042]/60 whitespace-nowrap">Digital Soft Copy</th>
              <th className="text-right px-3 py-2.5 font-bold whitespace-nowrap min-w-[80px]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#2A3042]/40">
            {loading ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-slate-500">
                  <RefreshCw size={20} className="animate-spin mx-auto text-crm-blue mb-2" />
                  <span>Loading billing archive...</span>
                </td>
              </tr>
            ) : filteredBills.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-slate-500">
                  <Receipt size={32} className="mx-auto text-slate-400 mb-2" />
                  <p className="font-bold text-slate-950 dark:text-white">No Purchase Bills Archived Yet</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    Click "Scan & Add New Bill" to upload a paper receipt photo or invoice PDF.
                  </p>
                  <button
                    onClick={() => setShowScannerModal(true)}
                    className="btn-primary text-xs px-4 py-2 mt-4 inline-flex items-center gap-1.5 shadow-sm font-bold"
                  >
                    <Camera size={14} /> Scan First Bill
                  </button>
                </td>
              </tr>
            ) : (
              filteredBills.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                  {/* Invoice No & Date */}
                  <td className="px-3 py-2.5 border-r border-slate-200 dark:border-[#2A3042]/30">
                    <div>
                      <div className="font-mono font-bold text-slate-950 dark:text-white text-xs">{b.invoiceNumber}</div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 font-medium mt-0.5">
                        {b.invoiceDate}
                      </div>
                    </div>
                  </td>

                  {/* Vendor */}
                  <td className="px-3 py-2.5 border-r border-slate-200 dark:border-[#2A3042]/30">
                    <div>
                      <div className="font-bold text-slate-950 dark:text-white text-xs flex items-center gap-1.5">
                        <Building2 size={12} className="text-emerald-600 dark:text-emerald-400" />
                        <span>{b.vendorName}</span>
                      </div>
                      <div className="font-mono text-[10.5px] text-emerald-700 dark:text-crm-teal font-semibold mt-0.5">
                        GSTIN: {b.vendorGstin || '33AAACJ1234F1Z5'}
                      </div>
                    </div>
                  </td>

                  {/* Items Count */}
                  <td className="px-3 py-2.5 text-center border-r border-slate-200 dark:border-[#2A3042]/30">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-slate-100 dark:bg-black/40 text-slate-800 dark:text-slate-300 border border-slate-200 dark:border-white/10">
                      {Array.isArray(b.items) ? b.items.length : 0} items
                    </span>
                  </td>

                  {/* Base Amount */}
                  <td className="px-3 py-2.5 text-right font-mono text-xs font-bold text-slate-900 dark:text-slate-200 border-r border-slate-200 dark:border-[#2A3042]/30">
                    ₹{Number(b.subtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>

                  {/* GST Paid */}
                  <td className="px-3 py-2.5 text-right font-mono text-xs font-bold text-amber-800 dark:text-amber-300 border-r border-slate-200 dark:border-[#2A3042]/30">
                    +₹{Number(b.totalTax || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>

                  {/* Grand Total */}
                  <td className="px-3 py-2.5 text-right font-mono text-xs font-black text-emerald-700 dark:text-emerald-400 border-r border-slate-200 dark:border-[#2A3042]/30">
                    ₹{Number(b.grandTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>

                  {/* Original Bill Scan — Opens Direct In-App Viewer (No Download) */}
                  <td className="px-3 py-2.5 text-center border-r border-slate-200 dark:border-[#2A3042]/30">
                    {b.documentUrl ? (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewScanImage({
                            url: formatImageUrl(b.documentUrl),
                            title: `Original Bill Scan: #${b.invoiceNumber} (${b.vendorName})`,
                          })
                        }
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#1E2230] hover:bg-slate-100 dark:hover:bg-[#2A3042] text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-[#2A3042] text-[11px] font-bold inline-flex items-center gap-1 transition-all shadow-sm"
                        title="View original scanned bill image directly in popup"
                      >
                        <Eye size={12} /> View Scan
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-500 italic">No scan</span>
                    )}
                  </td>

                  {/* Digital Soft Copy */}
                  <td className="px-3 py-2.5 text-center border-r border-slate-200 dark:border-[#2A3042]/30">
                    <button
                      onClick={() => setSelectedSoftCopyBill(b)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold inline-flex items-center gap-1 shadow-sm"
                    >
                      <FileText size={12} /> View Soft Copy
                    </button>
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => setDeleteConfirmBill({ id: b.id, invoiceNumber: b.invoiceNumber || 'Unknown' })}
                      className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/20 text-slate-400 hover:text-red-600 transition-colors"
                      title="Delete bill"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Smart OCR Bill Scanner Modal */}
      <SmartBillScannerModal
        isOpen={showScannerModal}
        onClose={() => setShowScannerModal(false)}
        onSuccess={() => {
          fetchBills();
          onStockUpdated();
        }}
      />

      {/* Digital Soft Copy Viewer & Printer Modal */}
      <DigitalSoftCopyModal
        isOpen={!!selectedSoftCopyBill}
        onClose={() => setSelectedSoftCopyBill(null)}
        bill={selectedSoftCopyBill}
      />

      {/* In-App Delete Confirmation Modal (Native CRM UI, Zero Browser Alert) */}
      <AnimatePresence>
        {deleteConfirmBill && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0">
                  <Trash2 size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-950 dark:text-white">Delete Purchase Bill?</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    Are you sure you want to permanently delete record{' '}
                    <strong className="text-slate-950 dark:text-white">#{deleteConfirmBill.invoiceNumber}</strong>?
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-xs text-red-700 dark:text-red-300 font-medium leading-relaxed">
                Warning: This bill and its soft copy record will be permanently deleted from your system.
              </div>

              {actionError && (
                <div className="p-2.5 rounded-lg bg-red-100 dark:bg-red-500/20 border border-red-300 dark:border-red-500/40 text-xs text-red-800 dark:text-red-200">
                  {actionError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteConfirmBill(null);
                    setActionError(null);
                  }}
                  disabled={deleteLoading}
                  className="px-4 py-2 rounded-xl bg-white dark:bg-[#1E2230] hover:bg-slate-100 dark:hover:bg-[#252A3C] text-slate-800 dark:text-slate-300 text-xs font-bold transition-all border border-slate-300 dark:border-[#2A3042] shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!deleteConfirmBill) return;
                    setDeleteLoading(true);
                    setActionError(null);
                    try {
                      await inventoryApi.deletePurchaseBill(deleteConfirmBill.id);
                      await fetchBills();
                      onStockUpdated();
                      setDeleteConfirmBill(null);
                    } catch (err: any) {
                      setActionError(err?.response?.data?.message || err.message || 'Failed to delete bill');
                    } finally {
                      setDeleteLoading(false);
                    }
                  }}
                  disabled={deleteLoading}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-glow-red transition-all"
                >
                  {deleteLoading ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (
                    <Trash2 size={13} />
                  )}
                  {deleteLoading ? 'Deleting...' : 'Delete Bill'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Direct In-App Original Scan Image Viewer (Strictly view only, zero download) */}
      <AnimatePresence>
        {previewScanImage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="p-4 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Receipt size={16} className="text-crm-blue" />
                  <h3 className="text-sm font-bold text-slate-950 dark:text-white">{previewScanImage.title}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewScanImage(null)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Image Container */}
              <div className="p-4 overflow-auto flex-1 flex items-center justify-center bg-slate-50 dark:bg-[#0F1117] min-h-[400px]">
                {previewScanImage.url.toLowerCase().endsWith('.pdf') ? (
                  <iframe
                    src={previewScanImage.url}
                    title="Original Document"
                    className="w-full h-[75vh] rounded-xl border border-white/10"
                  />
                ) : (
                  <img
                    src={previewScanImage.url}
                    alt="Original Receipt Scan"
                    className="max-h-[75vh] max-w-full rounded-xl shadow-2xl border border-white/10 object-contain"
                  />
                )}
              </div>

              {/* Footer */}
              <div className="p-3 border-t border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex justify-end">
                <button
                  type="button"
                  onClick={() => setPreviewScanImage(null)}
                  className="btn-primary text-xs px-5 py-1.5 font-bold shadow-glow-blue"
                >
                  Close Viewer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
