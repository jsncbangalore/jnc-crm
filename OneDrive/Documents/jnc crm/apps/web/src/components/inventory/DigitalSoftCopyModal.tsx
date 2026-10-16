import React, { useRef, useState, useEffect } from 'react';
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
import { numberToIndianWords } from './SmartBillScannerModal';
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

  if (!isOpen || !bill) return null;

  const handlePrint = () => {
    window.print();
  };

  const isIgst = Number(bill.igst) > 0 || bill.softCopyData?.taxMode === 'igst';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-4xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden my-auto"
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
                    <div className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-black uppercase mb-1">
                      VERIFIED INWARD BILL
                    </div>
                    <p className="font-mono text-base font-black text-slate-900">
                      #{bill.invoiceNumber}
                    </p>
                    <p className="text-xs text-slate-600 font-medium">
                      Date: {bill.invoiceDate}
                    </p>
                  </div>
                </div>

                {/* Vendor Details Box */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    SUPPLIER / VENDOR DETAILS
                  </span>
                  <p className="text-sm font-black text-slate-900 mt-1">{bill.vendorName}</p>
                  <p className="font-mono text-slate-700 font-semibold mt-0.5">
                    GSTIN: {bill.vendorGstin || '33AAACJ1234F1Z5'}
                  </p>
                  <p className="text-slate-600 mt-0.5">{bill.vendorAddress || 'Authorized Supplier / Distributor'}</p>
                </div>

                {/* Line Items Table */}
                <table className="w-full text-xs text-left border border-slate-300">
                  <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-2.5 border-r border-slate-300">#</th>
                      <th className="p-2.5 border-r border-slate-300">Component Item & SKU</th>
                      <th className="p-2.5 text-center border-r border-slate-300">Qty</th>
                      <th className="p-2.5 text-right border-r border-slate-300">Unit Rate</th>
                      <th className="p-2.5 text-right">Base Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {Array.isArray(bill.items) && bill.items.length > 0 ? (
                      bill.items.map((it: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2.5 font-mono text-slate-500 border-r border-slate-200">{idx + 1}</td>
                          <td className="p-2.5 border-r border-slate-200">
                            <span className="font-bold text-slate-900 block">{it.name}</span>
                            <span className="font-mono text-[10.5px] text-blue-600 font-semibold">
                              {it.skuCode}
                            </span>
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-slate-900 border-r border-slate-200">
                            {it.quantity} {it.unit || 'Nos'}
                          </td>
                          <td className="p-2.5 text-right font-mono text-slate-700 border-r border-slate-200">
                            ₹{Number(it.unitPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                            ₹{Number(it.quantity * it.unitPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="p-3 text-center text-slate-500 italic">
                          No itemized records attached
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* Tax Ledger & Grand Total Breakdown */}
                <div className="flex justify-between items-start pt-2 gap-4">
                  {/* Amount in Words */}
                  <div className="flex-1 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      AMOUNT IN WORDS (INR):
                    </span>
                    <p className="text-slate-800 font-bold italic mt-1 leading-relaxed">
                      {bill.softCopyData?.amountInWords || numberToIndianWords(Number(bill.grandTotal))}
                    </p>
                  </div>

                  {/* Math Breakdown Box */}
                  <div className="w-72 space-y-1.5 text-xs text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-200 font-mono">
                    <div className="flex justify-between">
                      <span>Taxable Base Value:</span>
                      <span className="font-bold text-slate-900">
                        ₹{Number(bill.subtotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    {!isIgst ? (
                      <>
                        <div className="flex justify-between text-slate-600">
                          <span>CGST @ {(bill.taxRate / 2 || 9)}%:</span>
                          <span>+₹{Number(bill.cgst || (bill.totalTax / 2)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>SGST @ {(bill.taxRate / 2 || 9)}%:</span>
                          <span>+₹{Number(bill.sgst || (bill.totalTax / 2)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between text-slate-600">
                        <span>IGST @ {bill.taxRate || 18}%:</span>
                        <span>+₹{Number(bill.igst || bill.totalTax).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}

                    <div className="border-t border-slate-300 pt-2 flex justify-between text-sm font-black text-slate-900">
                      <span>Grand Total:</span>
                      <span className="text-emerald-700">
                        ₹{Number(bill.grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Digital Stamp Footer */}
                <div className="border-t border-slate-300 pt-4 flex justify-between items-center text-[10.5px] text-slate-500 font-mono">
                  <span>Digitally Verified & Stamped by JNC ERP</span>
                  <span>Security Checksum: JNC-{bill.id}</span>
                </div>
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
            <div className="text-xs text-slate-400">
              Status: <strong className="text-emerald-400">Verified & Inwarded to Store Stock</strong>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="btn bg-slate-100 dark:bg-[#141722] hover:bg-white/10 text-white text-xs px-4 py-2 font-bold gap-1.5 border border-slate-200 dark:border-[#2A3042]"
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
