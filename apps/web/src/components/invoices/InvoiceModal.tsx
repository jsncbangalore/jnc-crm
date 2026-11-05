import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Printer, Mail, Ban, CheckCircle2, AlertTriangle, FileText,
  ShieldCheck, Send, Check, Eye, Layers, Truck, FileSpreadsheet, Download,
  CreditCard, Edit3, ZoomIn, ZoomOut, Maximize2
} from 'lucide-react';
import { Invoice, SignatorySettings, DocumentType, CompanyInvoiceProfile } from '../../types';
import { invoicesApi, resolveFileUrl } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useBranding } from '../../contexts/BrandingContext';
import { BRAND_CONFIG } from '../../config/brand';
import { format } from 'date-fns';
import InvoiceSettingsModal from './InvoiceSettingsModal';
import UnifiedRecordPaymentModal from '../common/UnifiedRecordPaymentModal';
import RelatedDocumentsPanel from '../common/RelatedDocumentsPanel';
import InvoiceDocumentTemplate, { numberToIndianWords } from './InvoiceDocumentTemplate';
import { openDedicatedPrintTab, POPUP_BLOCKED_MESSAGE } from '../../utils/printHelper';
import { executeDirectPrint } from '../../utils/directPrint';

export { numberToIndianWords };

interface InvoiceModalProps {
  invoice: Invoice | null;
  onClose: () => void;
  onInvoiceUpdated?: () => void;
  onEditInvoice?: (inv: Invoice) => void;
}

export default function InvoiceModal({ invoice, onClose, onInvoiceUpdated, onEditInvoice }: InvoiceModalProps) {
  const { user } = useAuth();
  const { branding } = useBranding();
  const canAdmin = user?.role === 'tenant_admin' || user?.role === 'admin' || user?.role === 'platform_super_admin';

  // Single Source of Truth Company Profile
  const [companyProfile, setCompanyProfile] = useState<CompanyInvoiceProfile | null>(
    invoice?.companyProfile || null
  );

  React.useEffect(() => {
    if (invoice?.companyProfile) {
      setCompanyProfile(invoice.companyProfile);
    } else {
      invoicesApi.getCompanyProfile().then((res) => {
        if (res.data) setCompanyProfile(res.data);
      }).catch((err) => {
        console.error('Failed to load company profile from API', err);
      });
    }
  }, [invoice]);

  // Template Type Switcher State (Defaults to invoice's saved docType)
  const [activeTemplate, setActiveTemplate] = useState<DocumentType>(
    invoice?.docType || (invoice?.isSez ? 'sez_invoice' : 'tax_invoice')
  );

  // Emailing State
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [customNote, setCustomNote] = useState('');
  const [emailing, setEmailing] = useState(false);
  const [emailResult, setEmailResult] = useState<string | null>(null);

  // Voiding State
  const [voiding, setVoiding] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [showVoidPrompt, setShowVoidPrompt] = useState(false);

  // Signatory Settings Modal
  const [showSignatorySettings, setShowSignatorySettings] = useState(false);
  const [signatoryConfig, setSignatoryConfig] = useState<SignatorySettings | null>(
    invoice?.signatorySettings || null
  );

  // Payment Recording Modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Zoom State for Preview (Default 0.8 / 80% so full A4 document fits on screen)
  const [zoom, setZoom] = useState<number>(0.8);
  const handleZoomIn = () => setZoom((prev) => Math.min(1.5, Number((prev + 0.1).toFixed(2))));
  const handleZoomOut = () => setZoom((prev) => Math.max(0.5, Number((prev - 0.1).toFixed(2))));
  const handleResetZoom = () => setZoom(1);
  const handleFitPage = () => setZoom(0.8);

  // PDF & Print State
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [popupBlockedMsg, setPopupBlockedMsg] = useState<string | null>(null);
  const printableRef = useRef<HTMLDivElement>(null);

  if (!invoice) return null;

  const isCreditNote = activeTemplate === 'credit_note';
  const isPO = activeTemplate === 'purchase_order';
  const isDC = activeTemplate === 'delivery_challan';
  const isProforma = activeTemplate === 'proforma_invoice';
  const isSEZ = (activeTemplate === 'sez_invoice' || !!invoice.isSez) && !isCreditNote && !isPO && !isDC && !isProforma;

  const isInterState =
    invoice.customerState?.toLowerCase() !== 'karnataka' &&
    invoice.customerState?.toLowerCase() !== 'ka' &&
    invoice.customerState?.toLowerCase() !== '29';

  const profile = companyProfile || invoice?.companyProfile;
  const rawLogo = profile?.logoUrl || branding?.companyLogoUrl;
  const hasDocumentLogo = !!(rawLogo && typeof rawLogo === 'string' && rawLogo.trim() !== '');
  const invoiceLogo = hasDocumentLogo ? resolveFileUrl(rawLogo) : '';

  const handleDownloadPdf = async () => {
    if (!invoice) return;
    try {
      setDownloadingPdf(true);
      const res = await invoicesApi.downloadPdf(invoice.id, activeTemplate);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cleanNum = invoice.invoiceNumber.replace(/[\/\\]/g, '_');
      const docTitle = isDC
        ? 'Delivery_Challan'
        : isProforma
        ? 'Proforma_Invoice'
        : isCreditNote
        ? 'Credit_Note'
        : isPO
        ? 'Purchase_Order'
        : isSEZ
        ? 'SEZ_Tax_Invoice'
        : 'Tax_Invoice';
      a.download = `${docTitle}_${cleanNum}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      console.error('Failed to download PDF:', err);
      alert('Failed to generate PDF download.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handlePrint = async () => {
    if (!invoice) return;
    setPopupBlockedMsg(null);
    setIsPrinting(true);
    try {
      const renderedHtml = printableRef.current?.innerHTML || '';
      if (!renderedHtml) {
        throw new Error('Printable invoice container not found.');
      }
      const cleanNum = invoice.invoiceNumber.replace(/[\/\\]/g, '_');
      const docTitle = isDC
        ? 'Delivery_Challan'
        : isProforma
        ? 'Proforma_Invoice'
        : isCreditNote
        ? 'Credit_Note'
        : isPO
        ? 'Purchase_Order'
        : isSEZ
        ? 'SEZ_Tax_Invoice'
        : 'Tax_Invoice';

      await executeDirectPrint(renderedHtml, {
        title: `${docTitle}_${cleanNum}`,
        paperSize: 'A4',
      });
    } catch (err: any) {
      console.error('Invoice direct print failed:', err);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleOpenEmailModal = () => {
    const defaultEmail =
      invoice.company?.billingEmail ||
      invoice.defaultBillingEmail ||
      invoice.customerEmail ||
      '';
    setRecipientEmail(defaultEmail);
    setCustomNote('');
    setShowEmailModal(true);
  };

  const handleSendEmail = async () => {
    if (!recipientEmail.trim()) {
      alert('Please enter a recipient email address.');
      return;
    }

    setEmailing(true);
    setEmailResult(null);
    try {
      const { data } = await invoicesApi.emailInvoice(invoice.id, {
        recipientEmail: recipientEmail.trim(),
        customNote: customNote.trim() || undefined,
        templateType: activeTemplate,
      });
      setShowEmailModal(false);
      setEmailResult(data.message || `Document emailed to ${recipientEmail}`);
      setTimeout(() => setEmailResult(null), 5000);
    } catch (err: any) {
      alert('Failed to send email: ' + (err?.response?.data?.message || err.message));
    } finally {
      setEmailing(false);
    }
  };

  const handleVoid = async () => {
    if (!voidReason.trim()) {
      alert('Please provide a reason for voiding this document.');
      return;
    }
    setVoiding(true);
    try {
      await invoicesApi.voidInvoice(invoice.id, voidReason);
      setShowVoidPrompt(false);
      if (onInvoiceUpdated) onInvoiceUpdated();
      onClose();
    } catch (err: any) {
      alert('Failed to void document: ' + (err?.response?.data?.message || err.message));
    } finally {
      setVoiding(false);
    }
  };

  const effectiveSignatory = signatoryConfig || invoice.signatorySettings;
  const effectiveCompanyName = effectiveSignatory?.companyName || profile?.companyName || BRAND_CONFIG.displayName;
  const lines = invoice.lines || [];
  
  // Calculate subtotal and total depending on document type
  const computedLineSum = lines.reduce((acc, l) => acc + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
  const totalQty = lines.reduce((acc, l) => acc + (Number(l.quantity) || 0), 0);
  const effectiveSubtotal = (invoice.subtotal && invoice.subtotal > 0) ? invoice.subtotal : computedLineSum;

  const effectiveTotal = isDC
    ? effectiveSubtotal
    : isSEZ
    ? effectiveSubtotal
    : (invoice.totalAmount && invoice.totalAmount > 0
        ? invoice.totalAmount
        : (effectiveSubtotal + (invoice.igstAmount || 0) + (invoice.cgstAmount || 0) + (invoice.sgstAmount || 0)));

  const amountInWords = numberToIndianWords(effectiveTotal);

  // Advance calculation for Proforma
  const advancePercent = invoice.advancePercent || 50;
  const advanceAmount = invoice.advanceAmount || Number(((effectiveTotal * advancePercent) / 100).toFixed(2));

  // Compute exact totals row count for seamless A4 table layout without stray horizontal lines
  const hasAdvanceAdjusted = !isProforma && !isDC && !isCreditNote && Number(invoice.advanceAdjusted || 0) > 0;
  let totalsRowCount = 1; // Sub Total row
  if (isSEZ || isInterState) {
    totalsRowCount += 1;
  } else {
    totalsRowCount += 2; // CGST + SGST
  }
  if (isProforma) {
    totalsRowCount += 2; // Advance + Balance
  }
  totalsRowCount += 1; // Round off
  totalsRowCount += 1; // Total
  if (hasAdvanceAdjusted) {
    totalsRowCount += 2; // Less Advance + Net Balance Due
  }

  // Format date helper: DD-MM-YYYY
  const formatDateDMY = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), 'dd-MM-yyyy');
    } catch {
      return dateStr;
    }
  };

  // Distinct HSN codes list for SEZ table
  const distinctHsns = lines
    .map((l) => l.hsnCode || '85312000')
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(', ');

  const theoreticalIgst = Number((((effectiveSubtotal || 0) * 18) / 100).toFixed(2));

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto print:static print:p-0 print:m-0 print:bg-white print:overflow-visible">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-5xl h-[94vh] max-h-[94vh] flex flex-col shadow-2xl overflow-hidden my-auto print:border-none print:shadow-none print:max-h-none print:h-auto print:max-w-none print:w-full print:bg-white print:text-black print:rounded-none print:static print:m-0 print:overflow-visible"
        >
          {/* Header Action Bar (Hidden when printing) */}
          <div className="flex items-center justify-between p-3 sm:p-4 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] print:hidden flex-wrap gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isDC ? 'bg-teal-50 dark:bg-crm-teal/20 text-teal-700 dark:text-crm-teal border border-teal-200 dark:border-transparent' : isProforma ? 'bg-blue-50 dark:bg-crm-blue/20 text-blue-700 dark:text-crm-blue border border-blue-200 dark:border-transparent' : isCreditNote ? 'bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-transparent' : isPO ? 'bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-transparent' : isSEZ ? 'bg-purple-50 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-transparent' : 'bg-amber-50 dark:bg-crm-amber/20 text-amber-700 dark:text-crm-amber border border-amber-200 dark:border-transparent'
              }`}>
                {isDC ? <Truck size={16} /> : isProforma ? <FileSpreadsheet size={16} /> : <FileText size={16} />}
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-950 dark:text-white flex items-center gap-2">
                  <span>{isDC ? 'Delivery Challan' : isProforma ? 'Proforma Invoice' : isCreditNote ? 'Credit Note' : isPO ? 'Purchase Order' : isSEZ ? 'SEZ / Export Invoice' : 'Tax Invoice'}</span>: <span className="font-mono text-amber-700 dark:text-crm-amber">{invoice.invoiceNumber}</span>
                  {!isDC && (
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                        invoice.paymentStatus === 'paid'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-green-500/15 dark:text-green-400 border-emerald-300 dark:border-green-500/30'
                          : invoice.paymentStatus === 'partial'
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 border-amber-300 dark:border-amber-500/30'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-400 border-slate-300 dark:border-slate-500/30'
                      }`}
                    >
                      {invoice.paymentStatus || 'unpaid'}
                    </span>
                  )}
                  {invoice.isVoided && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-crm-coral border border-red-300 dark:border-red-500/40">
                      VOIDED
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">Official GST Format (Full Width A4 Printable)</p>
              </div>
            </div>

            {/* Template Switcher Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#141722] p-1 rounded-xl border border-slate-200 dark:border-[#2A3042] overflow-x-auto">
              {[
                { id: 'tax_invoice', label: 'Tax Invoice' },
                { id: 'sez_invoice', label: 'SEZ / LUT (0%)' },
                { id: 'proforma_invoice', label: 'Proforma' },
                { id: 'delivery_challan', label: 'Delivery Challan' },
                { id: 'credit_note', label: 'Credit Note' },
                { id: 'purchase_order', label: 'Purchase Order' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTemplate(t.id as DocumentType)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    activeTemplate === t.id
                      ? 'bg-crm-blue text-white shadow-glow-blue font-bold'
                      : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/5 font-bold'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Edit Document Button */}
              {onEditInvoice && !invoice.isVoided && (
                <button
                  onClick={() => {
                    onClose();
                    onEditInvoice(invoice);
                  }}
                  className="btn bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-500/40 text-xs gap-1.5 py-1.5 font-bold shadow-sm"
                  title="Edit Line Items, Customer & Financials"
                >
                  <Edit3 size={13} /> Edit Document
                </button>
              )}

              {/* Signatory Settings Button for Admin/Super Admin */}
              {canAdmin && (
                <button
                  onClick={() => setShowSignatorySettings(true)}
                  className="btn bg-white dark:bg-[#141722] hover:bg-slate-100 dark:hover:bg-[#202534] border border-slate-300 dark:border-[#2A3042] text-slate-800 dark:text-slate-300 text-xs gap-1.5 py-1.5 shadow-sm font-bold"
                  title="Configure Authorized Signatory Signature & Stamp"
                >
                  <ShieldCheck size={13} className="text-emerald-600 dark:text-crm-teal" /> Signatory & Stamp
                </button>
              )}

              <button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="btn bg-teal-50 hover:bg-teal-100 dark:bg-crm-teal/20 dark:hover:bg-crm-teal/30 text-teal-800 dark:text-crm-teal border border-teal-300 dark:border-crm-teal/40 text-xs gap-1.5 py-1.5 font-bold shadow-sm"
                title="Download Official Vector A4 PDF directly"
              >
                <Download size={13} /> {downloadingPdf ? 'Generating PDF...' : 'Download PDF'}
              </button>

              <button
                onClick={handlePrint}
                disabled={isPrinting}
                className="btn bg-white dark:bg-white/10 hover:bg-slate-100 dark:hover:bg-white/20 text-slate-800 dark:text-white border border-slate-300 dark:border-transparent text-xs gap-1.5 py-1.5 font-bold shadow-sm"
                title="Print Official Vector PDF"
              >
                <Printer size={13} className="text-crm-blue" /> {isPrinting ? 'Printing...' : 'Print'}
              </button>

              {!invoice.isVoided && invoice.paymentStatus !== 'paid' && ((invoice.balanceDue ?? invoice.totalAmount) > 0.01) && (
                <button
                  onClick={() => setShowPaymentModal(true)}
                  className="btn bg-green-600 hover:bg-green-700 text-white text-xs gap-1.5 py-1.5 shadow-sm font-bold"
                  title="Open receipt with exact balance pre-filled to mark fully paid"
                >
                  <CheckCircle2 size={13} /> Mark as fully paid
                </button>
              )}

              <button
                onClick={() => setShowPaymentModal(true)}
                disabled={invoice.isVoided}
                className="btn bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/40 text-xs gap-1.5 py-1.5 shadow-sm font-bold disabled:opacity-50"
                title="Record Advance Receipt or Final Balance Settlement (UTR/NEFT)"
              >
                <CreditCard size={13} /> Record Payment
              </button>

              <button
                onClick={handleOpenEmailModal}
                disabled={emailing || invoice.isVoided}
                className="btn bg-crm-blue hover:bg-crm-blue-hover text-white text-xs gap-1.5 py-1.5 shadow-glow-blue font-bold disabled:opacity-50"
              >
                <Mail size={13} /> Email PDF
              </button>

              {canAdmin && !invoice.isVoided && (
                <button
                  onClick={() => setShowVoidPrompt(true)}
                  className="btn bg-red-50 hover:bg-red-100 dark:bg-crm-coral/20 dark:hover:bg-crm-coral/30 text-red-700 dark:text-crm-coral border border-red-300 dark:border-crm-coral/30 text-xs gap-1.5 py-1.5 font-bold shadow-sm"
                  title="Void Document (Admin only)"
                >
                  <Ban size={13} /> Void
                </button>
              )}

              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white flex items-center justify-center ml-1"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Email confirmation toast */}
          {emailResult && (
            <div className="p-3 bg-green-50 dark:bg-green-500/15 border-b border-green-200 dark:border-green-500/30 text-green-800 dark:text-green-400 text-xs flex items-center gap-2 print:hidden font-medium">
              <CheckCircle2 size={14} /> {emailResult}
            </div>
          )}

          {/* Void prompt banner */}
          {showVoidPrompt && (
            <div className="p-4 bg-red-50 dark:bg-red-500/10 border-b border-red-200 dark:border-red-500/30 space-y-3 print:hidden">
              <div className="flex items-center gap-2 text-red-700 dark:text-crm-coral text-xs font-bold">
                <AlertTriangle size={15} /> Confirm Voiding Document {invoice.invoiceNumber}
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                Voiding marks the document permanently inactive without deleting it or reusing its sequence number.
              </p>
              <div className="flex gap-2">
                <input
                  className="input text-xs flex-1"
                  placeholder="Enter reason for voiding (e.g. Order cancelled / Re-issued)"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                />
                <button
                  onClick={handleVoid}
                  disabled={voiding}
                  className="btn bg-red-600 hover:bg-red-700 text-white text-xs px-4 font-bold"
                >
                  {voiding ? 'Voiding...' : 'Confirm Void'}
                </button>
                <button
                  onClick={() => setShowVoidPrompt(false)}
                  className="btn-ghost text-xs text-slate-600 dark:text-slate-400 font-bold"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {popupBlockedMsg && (
            <div data-testid="popup-blocked-alert" className="p-3 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between gap-2 print:hidden font-medium">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 shrink-0" />
                <span>{popupBlockedMsg}</span>
              </div>
              <button
                onClick={handleDownloadPdf}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition shrink-0"
              >
                Download PDF
              </button>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════════════════
              EXACT INVOICE A4 PAPER TEMPLATE (FULL SCREEN ON MONITOR & EXACT 1-PAGE PRINT A4)
             ════════════════════════════════════════════════════════════════════════════ */}
          <div className="p-3 sm:p-6 overflow-y-auto min-h-0 flex-1 bg-[#0B0D14] flex flex-col items-center print:bg-white print:p-0 print:m-0 print:overflow-visible relative">
            {/* Floating Zoom & Fit Toolbar */}
            <div className="sticky top-0 z-20 mb-3 flex items-center gap-1.5 bg-slate-900/90 text-white backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-700/60 shadow-xl print:hidden text-xs">
              <button
                onClick={handleZoomOut}
                disabled={zoom <= 0.5}
                className="p-1 rounded-full hover:bg-white/20 text-slate-300 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                title="Zoom Out (-)"
              >
                <ZoomOut size={14} />
              </button>
              <span className="font-mono text-[11px] font-bold px-1.5 min-w-[42px] text-center text-slate-200">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                disabled={zoom >= 1.5}
                className="p-1 rounded-full hover:bg-white/20 text-slate-300 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                title="Zoom In (+)"
              >
                <ZoomIn size={14} />
              </button>
              <div className="h-3.5 w-px bg-slate-700 mx-1" />
              <button
                onClick={handleFitPage}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all ${
                  zoom === 0.8 ? 'bg-crm-blue text-white shadow-sm' : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
                title="Fit Entire Page on Screen (80%)"
              >
                Fit Page
              </button>
              <button
                onClick={handleResetZoom}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all ${
                  zoom === 1 ? 'bg-crm-blue text-white shadow-sm' : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
                title="Original 100% Size"
              >
                100%
              </button>
            </div>

            {/* Related Documents Chain */}
            <div className="w-full max-w-[794px] mb-3 print:hidden">
              <RelatedDocumentsPanel type="invoice" id={invoice.id} />
            </div>

            {/* Scaled Document Wrapper */}
            <div
              ref={printableRef}
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'top center',
                marginBottom: zoom !== 1 ? `${Math.round((isPO ? 1050 : 1120) * (zoom - 1))}px` : undefined,
              }}
              className="transition-transform duration-150 ease-out print:transform-none print:m-0 flex justify-center w-full"
            >
              <InvoiceDocumentTemplate
                invoice={invoice}
                profile={profile}
                signatoryConfig={effectiveSignatory}
                activeTemplate={activeTemplate}
                invoiceLogo={invoiceLogo}
                showLogoNotice={!hasDocumentLogo}
                onLogoNoticeClick={() => {
                  window.location.href = '/settings/branding';
                }}
              />
            </div>
          </div>

          {/* Footer Bar */}
          <div className="p-3 border-t border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex justify-between items-center print:hidden text-xs text-slate-400 shrink-0">
            <span className="font-mono">
              {isDC ? 'DC' : 'Invoice'} #{invoice.invoiceNumber} {!isDC && `| Total: ₹${effectiveTotal.toLocaleString('en-IN')}`}
            </span>
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-slate-200/80 dark:bg-[#141722] rounded-lg p-0.5 border border-slate-300 dark:border-[#2A3042]">
                <button
                  onClick={handleZoomOut}
                  disabled={zoom <= 0.5}
                  className="p-1 rounded text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-white/10 disabled:opacity-30 transition-all"
                  title="Zoom Out (-)"
                >
                  <ZoomOut size={13} />
                </button>
                <span className="text-[11px] font-mono font-bold px-2 text-slate-800 dark:text-slate-200 min-w-[38px] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={handleZoomIn}
                  disabled={zoom >= 1.5}
                  className="p-1 rounded text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-white/10 disabled:opacity-30 transition-all"
                  title="Zoom In (+)"
                >
                  <ZoomIn size={13} />
                </button>
                <button
                  onClick={handleFitPage}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                    zoom === 0.8 ? 'bg-crm-blue text-white shadow-sm' : 'text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Fit Page (80%)"
                >
                  Fit Page
                </button>
                <button
                  onClick={handleResetZoom}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                    zoom === 1 ? 'bg-crm-blue text-white shadow-sm' : 'text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="100%"
                >
                  100%
                </button>
              </div>
              <button onClick={onClose} className="btn-ghost text-xs px-5">
                Close
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ─── EMAIL INVOICE MODAL (WITH TEMPLATE SELECTOR & EDITABLE RECIPIENT) ── */}
      <AnimatePresence>
        {showEmailModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="card w-full max-w-md border-slate-200 dark:border-[#2A3042] shadow-2xl p-6 bg-white dark:bg-[#181B26]"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#2A3042] mb-4">
                <div className="flex items-center gap-2">
                  <Mail size={18} className="text-crm-blue" />
                  <h3 className="text-sm font-bold text-slate-950 dark:text-white">Email Document to Customer</h3>
                </div>
                <button
                  onClick={() => setShowEmailModal(false)}
                  className="p-1 rounded hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4 text-xs">
                <div className="p-3 rounded-lg bg-slate-100 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042] space-y-1">
                  <div className="flex justify-between text-slate-400">
                    <span>Document:</span>
                    <strong className="text-white font-mono">{invoice.invoiceNumber}</strong>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Format:</span>
                    <strong className="text-crm-teal capitalize">{activeTemplate.replace('_', ' ')}</strong>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Customer:</span>
                    <strong className="text-white">{invoice.customerName}</strong>
                  </div>
                  {!isDC && (
                    <div className="flex justify-between text-slate-400">
                      <span>Total Amount:</span>
                      <strong className="text-emerald-400 font-mono">₹{effectiveTotal.toLocaleString('en-IN')}</strong>
                    </div>
                  )}
                </div>

                <div>
                  <label className="label text-slate-300">
                    Recipient Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    className="input text-xs font-mono"
                    placeholder="e.g. ap@example.com / billing@example.com"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                  />
                  <p className="text-[10.5px] text-slate-400 mt-1">
                    Pre-filled from customer profile. You can freely edit or override.
                  </p>
                </div>

                <div>
                  <label className="label">Custom Note (Optional)</label>
                  <textarea
                    rows={2}
                    className="input text-xs resize-none"
                    placeholder="e.g. Please find attached tax invoice for Project Phase-1 dispatch"
                    value={customNote}
                    onChange={(e) => setCustomNote(e.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-[#2A3042]">
                  <button
                    type="button"
                    onClick={() => setShowEmailModal(false)}
                    className="btn-ghost text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={emailing || !recipientEmail.trim()}
                    onClick={handleSendEmail}
                    className="btn-primary text-xs px-5 shadow-glow-blue flex items-center gap-1.5"
                  >
                    <Send size={13} /> {emailing ? 'Sending...' : 'Send Document Email'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── INVOICE SIGNATORY & STAMP SETTINGS MODAL (ADMIN ONLY) ─────────── */}
      <InvoiceSettingsModal
        isOpen={showSignatorySettings}
        onClose={() => setShowSignatorySettings(false)}
        onSaved={(updated) => setSignatoryConfig(updated)}
      />

      {/* ─── RECORD PAYMENT / UTR RECEIPT MODAL ──────────────────────────────── */}
      <UnifiedRecordPaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        defaultInvoiceId={invoice.id}
        defaultCustomerId={(invoice as any).customerId || invoice.companyId}
        defaultCustomerName={invoice.customerName}
        defaultAmount={invoice.balanceDue ?? invoice.totalAmount}
        onSuccess={() => {
          if (onInvoiceUpdated) onInvoiceUpdated();
        }}
      />
    </>
  );
}
