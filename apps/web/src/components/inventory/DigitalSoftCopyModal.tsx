import React, { useRef, useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Printer,
  Download,
  X,
  Building2,
  Receipt,
  CheckCircle2,
  Calendar,
  Layers,
  Tag,
  Eye,
  Paperclip,
} from 'lucide-react';
import { numberToIndianWords } from '../invoices/InvoiceDocumentTemplate';
import { formatImageUrl } from './PurchaseBillsHub';
import { fetchPrivateFileBlobUrl } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useBranding } from '../../contexts/BrandingContext';

interface DigitalSoftCopyModalProps {
  isOpen: boolean;
  onClose: () => void;
  bill: any | null;
}

export const DigitalSoftCopyModal: React.FC<DigitalSoftCopyModalProps> = ({
  isOpen,
  onClose,
  bill,
}) => {
  const { user } = useAuth();
  const { branding } = useBranding();
  const printRef = useRef<HTMLDivElement>(null);
  const [activeView, setActiveView] = useState<'soft_copy' | 'original_doc'>('soft_copy');
  const [docBlobUrl, setDocBlobUrl] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const companyDisplayName =
    bill?.softCopyData?.companyName ||
    user?.tenant?.name ||
    branding.companyDisplayName ||
    'Client Workspace';
  const companyGstin =
    bill?.softCopyData?.companyGstin ||
    user?.tenant?.gstin ||
    '';
  const companyEmail = user?.tenant?.email || user?.email || '';

  // Robust parsing of line items (supports array, JSON string, or nested objects)
  const parsedItems = useMemo(() => {
    if (!bill) return [];
    if (Array.isArray(bill.items)) return bill.items;
    if (typeof bill.items === 'string') {
      try {
        const parsed = JSON.parse(bill.items);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.items)) return parsed.items;
      } catch {}
    }
    if (bill.softCopyData && Array.isArray(bill.softCopyData.items)) {
      return bill.softCopyData.items;
    }
    return [];
  }, [bill]);

  useEffect(() => {
    let activeBlob: string | null = null;
    let isCancelled = false;

    if (isOpen && bill?.documentUrl) {
      fetchPrivateFileBlobUrl(bill.documentUrl)
        .then((blobUrl) => {
          if (!isCancelled) {
            activeBlob = blobUrl;
            setDocBlobUrl(blobUrl);
          } else if (blobUrl.startsWith('blob:')) {
            URL.revokeObjectURL(blobUrl);
          }
        })
        .catch((err) => {
          console.error('Failed to load bill document', err);
        });
    }

    return () => {
      isCancelled = true;
      if (activeBlob && activeBlob.startsWith('blob:')) {
        URL.revokeObjectURL(activeBlob);
      }
      setDocBlobUrl(null);
    };
  }, [isOpen, bill?.documentUrl]);

  const isIgst = Boolean(bill && (Number(bill.igst) > 0 || bill.softCopyData?.taxMode === 'igst'));
  const isVerified = Boolean(bill && (bill.isVerified || bill.verifiedAt || bill.status === 'verified'));

  const hasStockLines = useMemo(() => {
    if (!bill) return false;
    if (bill.hasStockLines !== undefined) return Boolean(bill.hasStockLines);
    if (bill.inwardedToStock !== undefined) return Boolean(bill.inwardedToStock);
    return parsedItems.length > 0 && parsedItems.some((it: any) => it.skuCode || it.sku || it.quantity);
  }, [bill, parsedItems]);

  const displayBillDate = useMemo(() => {
    if (!bill) return 'N/A';
    const raw = bill.billDate || bill.invoiceDateReal || bill.invoiceDate || bill.createdAt;
    if (!raw) return 'N/A';
    try {
      const d = new Date(raw);
      return isNaN(d.getTime()) ? String(raw) : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return String(raw);
    }
  }, [bill]);

  const { taxableBase, cgstVal, sgstVal, igstVal, grandTotalVal, roundOffVal } = useMemo(() => {
    if (!bill) {
      return {
        taxableBase: 0,
        cgstVal: 0,
        sgstVal: 0,
        igstVal: 0,
        grandTotalVal: 0,
        roundOffVal: 0,
      };
    }
    const taxable = Number(Number(bill.subtotal || 0).toFixed(2));
    const rawGrandTotal = Number(Number(bill.grandTotal || bill.totalAmount || 0).toFixed(2));

    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    if (isIgst) {
      igst = Number(Number(bill.igst || bill.totalTax || 0).toFixed(2));
    } else {
      const halfTax = bill.totalTax ? bill.totalTax / 2 : 0;
      cgst = Number(Number(bill.cgst !== undefined && bill.cgst !== null ? bill.cgst : halfTax).toFixed(2));
      sgst = Number(Number(bill.sgst !== undefined && bill.sgst !== null ? bill.sgst : halfTax).toFixed(2));
    }

    const calculatedSum = Number((taxable + (isIgst ? igst : (cgst + sgst))).toFixed(2));
    const roundOff = Number((rawGrandTotal - calculatedSum).toFixed(2));

    return {
      taxableBase: taxable,
      cgstVal: cgst,
      sgstVal: sgst,
      igstVal: igst,
      grandTotalVal: rawGrandTotal,
      roundOffVal: roundOff,
    };
  }, [bill, isIgst]);

  if (!isOpen || !bill) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <AnimatePresence>
      <div
        data-testid="digital-soft-copy-backdrop"
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto cursor-pointer"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="Digital Soft Copy Purchase Invoice"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-4xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden my-auto cursor-default"
        >
          {/* Header Bar */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shadow-glow-blue">
                <FileText size={20} />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-950 dark:text-white">Digital Soft Copy Purchase Invoice</h2>
                <p className="text-xs text-slate-400 font-mono">
                  {bill.invoiceNumber} • {bill.vendorName}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Toggle Soft Copy vs Original Scan */}
              <div className="flex items-center bg-slate-100 dark:bg-[#141722] p-0.5 rounded-lg border border-slate-200 dark:border-[#2A3042] text-xs">
                <button
                  type="button"
                  onClick={() => setActiveView('soft_copy')}
                  className={`px-3 py-1 rounded font-bold transition-all ${
                    activeView === 'soft_copy'
                      ? 'bg-crm-blue text-white shadow-sm'
                      : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                  }`}
                >
                  Digital Soft Copy
                </button>
                {bill.documentUrl && (
                  <button
                    type="button"
                    onClick={() => setActiveView('original_doc')}
                    className={`px-3 py-1 rounded font-bold transition-all flex items-center gap-1 ${
                      activeView === 'original_doc'
                        ? 'bg-crm-blue text-white shadow-sm'
                        : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                    }`}
                  >
                    <Paperclip size={12} /> Original Scan
                  </button>
                )}
              </div>

              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white ml-2"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Content Body */}
          <div className="p-6 overflow-y-auto flex-1 bg-slate-50 dark:bg-[#0F1117]">
            {activeView === 'soft_copy' ? (
              <div
                ref={printRef}
                className="bg-white text-slate-900 rounded-2xl p-6 sm:p-8 shadow-2xl max-w-3xl mx-auto space-y-6 font-sans border border-slate-200"
              >
                {/* Invoice Top Banner */}
                <div className="flex justify-between items-start border-b border-slate-300 pb-5">
                  <div>
                    <span className="text-[11px] font-black uppercase tracking-widest text-blue-600 block">
                      PURCHASE & INWARD SOFT COPY
                    </span>
                    <h1 className="text-2xl font-black text-slate-900 mt-0.5">{companyDisplayName}</h1>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Enterprise Inventory, Procurement & Sourcing Soft Copy
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      {companyGstin ? `GSTIN: ${companyGstin}` : ''} {companyEmail ? `• ${companyEmail}` : ''}
                    </p>
                  </div>

                  <div className="text-right">
                    {isVerified ? (
                      <div className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-black uppercase mb-1">
                        VERIFIED INWARD BILL
                      </div>
                    ) : (
                      <div className="inline-block px-3 py-1 bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold uppercase mb-1">
                        PURCHASE BILL RECORD
                      </div>
                    )}
                    <p className="font-mono text-base font-black text-slate-900">
                      #{bill.invoiceNumber}
                    </p>
                    <p className="text-xs text-slate-700 font-medium">
                      Date: {displayBillDate}
                    </p>
                  </div>
                </div>

                {/* Vendor Details Box */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-300 text-xs text-slate-900">
                  <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block">
                    SUPPLIER / VENDOR DETAILS
                  </span>
                  <p className="text-sm font-black text-slate-900 mt-1">{bill.vendorName}</p>
                  <p className="font-mono text-slate-800 font-semibold mt-0.5">
                    GSTIN: {bill.vendorGstin || '33AAACJ1234F1Z5'}
                  </p>
                  <p className="text-slate-700 mt-0.5">{bill.vendorAddress || 'Authorized Supplier / Distributor'}</p>
                </div>

                {/* Line Items Table (rendered only when real items exist) */}
                {parsedItems.length > 0 && (
                  <table className="w-full text-xs text-left border border-slate-300">
                    <thead className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="p-2.5 border-r border-slate-300">#</th>
                        <th className="p-2.5 border-r border-slate-300">Component Item & SKU</th>
                        <th className="p-2.5 text-center border-r border-slate-300">Qty</th>
                        <th className="p-2.5 text-right border-r border-slate-300">Unit Rate</th>
                        <th className="p-2.5 text-right">Base Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {parsedItems.map((it: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2.5 font-mono text-slate-700 border-r border-slate-200">{idx + 1}</td>
                          <td className="p-2.5 border-r border-slate-200">
                            <span className="font-bold text-slate-900 block">{it.name || it.description || 'Component Item'}</span>
                            <span className="font-mono text-[10.5px] text-blue-700 font-semibold">
                              {it.skuCode || it.sku || it.hsnCode || ''}
                            </span>
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-slate-900 border-r border-slate-200">
                            {it.quantity || 1} {it.unit || 'Nos'}
                          </td>
                          <td className="p-2.5 text-right font-mono text-slate-800 border-r border-slate-200">
                            ₹{Number(it.unitPrice || it.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                            ₹{Number((it.quantity || 1) * (it.unitPrice || it.rate || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Tax Ledger & Grand Total Breakdown */}
                <div className="flex justify-between items-start pt-2 gap-4">
                  {/* Amount in Words */}
                  <div className="flex-1 bg-slate-50 p-4 rounded-xl border border-slate-300 text-xs">
                    <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block">
                      AMOUNT IN WORDS (INR):
                    </span>
                    <p className="text-slate-900 font-bold italic mt-1 leading-relaxed">
                      {bill.softCopyData?.amountInWords || numberToIndianWords(Number(bill.grandTotal || bill.totalAmount || 0))}
                    </p>
                  </div>

                  {/* Math Breakdown Box */}
                  <div className="w-72 space-y-1.5 text-xs text-slate-800 bg-slate-50 p-4 rounded-xl border border-slate-300 font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-700">Taxable Base Value:</span>
                      <span className="font-bold text-slate-900">
                        ₹{taxableBase.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    {!isIgst ? (
                      <>
                        <div className="flex justify-between text-slate-700">
                          <span>CGST @ {(bill.taxRate / 2 || 9)}%:</span>
                          <span className="font-semibold text-slate-900">+₹{cgstVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between text-slate-700">
                          <span>SGST @ {(bill.taxRate / 2 || 9)}%:</span>
                          <span className="font-semibold text-slate-900">+₹{sgstVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between text-slate-700">
                        <span>IGST @ {bill.taxRate || 18}%:</span>
                        <span className="font-semibold text-slate-900">+₹{igstVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    )}

                    {Math.abs(roundOffVal) >= 0.005 && (
                      <div className="flex justify-between text-slate-700">
                        <span>Round Off:</span>
                        <span className="font-semibold text-slate-900">
                          {roundOffVal > 0 ? `+₹${roundOffVal.toFixed(2)}` : `-₹${Math.abs(roundOffVal).toFixed(2)}`}
                        </span>
                      </div>
                    )}

                    <div className="border-t border-slate-300 pt-2 flex justify-between text-sm font-black text-slate-900">
                      <span>Grand Total:</span>
                      <span className="text-emerald-700">
                        ₹{grandTotalVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Digital Stamp Footer */}
                {isVerified ? (
                  <div className="border-t border-slate-300 pt-4 flex justify-between items-center text-[10.5px] text-slate-700 font-mono">
                    <span className="font-semibold">Digitally Verified & Stamped</span>
                    <span>Security Checksum: {bill.id}</span>
                  </div>
                ) : (
                  <div className="border-t border-slate-300 pt-4 flex justify-between items-center text-[10.5px] text-slate-600 font-mono">
                    <span>Purchase Invoice Record</span>
                    <span>Reference ID: {bill.id ? String(bill.id).slice(0, 8) : 'N/A'}</span>
                  </div>
                )}
              </div>
            ) : (
              /* Original Document View */
              <div className="bg-black/60 rounded-2xl p-4 border border-slate-200 dark:border-[#2A3042] flex flex-col items-center justify-center min-h-[450px]">
                {bill.documentUrl?.toLowerCase().endsWith('.pdf') ? (
                  <iframe
                    src={docBlobUrl || formatImageUrl(bill.documentUrl)}
                    title="Original Document"
                    className="w-full h-[70vh] rounded-xl border border-white/10"
                  />
                ) : (
                  <img
                    src={docBlobUrl || formatImageUrl(bill.documentUrl)}
                    alt="Original Receipt Scan"
                    className="max-h-[70vh] rounded-xl shadow-2xl border border-white/10 object-contain"
                  />
                )}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-between">
            <div className="text-xs text-slate-600 dark:text-slate-300">
              Status:{' '}
              {hasStockLines ? (
                <strong className="text-emerald-600 dark:text-emerald-400">Verified & Inwarded to Store Stock</strong>
              ) : (
                <strong className="text-blue-600 dark:text-blue-400">Recorded in Accounts & Purchase Ledger</strong>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="btn bg-slate-100 hover:bg-slate-200 dark:bg-[#141722] dark:hover:bg-white/10 text-slate-800 dark:text-white text-xs px-4 py-2 font-bold gap-1.5 border border-slate-300 dark:border-[#2A3042]"
              >
                <Printer size={14} /> Print Invoice
              </button>

              <button
                type="button"
                onClick={onClose}
                className="btn-primary text-xs px-5 font-bold shadow-glow-blue"
              >
                Close
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
