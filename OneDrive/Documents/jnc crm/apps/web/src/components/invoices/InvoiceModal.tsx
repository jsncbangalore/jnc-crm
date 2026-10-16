import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Printer, Mail, Ban, CheckCircle2, AlertTriangle, FileText,
  ShieldCheck, Send, Check, Eye, Layers, Truck, FileSpreadsheet, Download,
  CreditCard, Edit3
} from 'lucide-react';
import { Invoice, SignatorySettings, DocumentType, CompanyInvoiceProfile } from '../../types';
import { invoicesApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useBranding } from '../../contexts/BrandingContext';
import { BRAND_CONFIG } from '../../config/brand';
import { format } from 'date-fns';
import InvoiceSettingsModal from './InvoiceSettingsModal';
import { RecordPaymentModal } from './RecordPaymentModal';
import DirectPrintModal from '../printing/DirectPrintModal';

interface InvoiceModalProps {
  invoice: Invoice | null;
  onClose: () => void;
  onInvoiceUpdated?: () => void;
  onEditInvoice?: (inv: Invoice) => void;
}

// ─── Indian Currency Number to Words Converter ─────────────────────────────
export function numberToIndianWords(amount: number): string {
  if (!amount || isNaN(amount)) return 'Zero Only';

  const single = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertChunk = (n: number): string => {
    let str = '';
    if (n >= 100) {
      str += single[Math.floor(n / 100)] + ' hundred ';
      n %= 100;
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + single[n % 10] : '') + ' ';
    } else if (n > 0) {
      str += single[n] + ' ';
    }
    return str;
  };

  const integerPart = Math.floor(Math.abs(amount));
  const decimalPart = Math.round((Math.abs(amount) - integerPart) * 100);

  const crore = Math.floor(integerPart / 10000000);
  let remainder = integerPart % 10000000;
  const lakh = Math.floor(remainder / 100000);
  remainder = remainder % 100000;
  const thousand = Math.floor(remainder / 1000);
  const hundreds = remainder % 1000;

  let words = '';
  if (crore > 0) words += convertChunk(crore) + 'Crore ';
  if (lakh > 0) words += convertChunk(lakh) + 'Lakh ';
  if (thousand > 0) words += convertChunk(thousand) + 'thousand ';
  if (hundreds > 0) words += convertChunk(hundreds);

  words = words.trim();
  if (!words) words = 'Zero';

  words = words.charAt(0).toUpperCase() + words.slice(1);

  if (decimalPart > 0) {
    words += ' and ' + convertChunk(decimalPart).trim() + ' Paise';
  }
  return words + ' Only';
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

  // JNC Direct Printer Connection Modal
  const [showDirectPrintModal, setShowDirectPrintModal] = useState(false);

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
  const invoiceLogo =
    rawLogo && typeof rawLogo === 'string' && !rawLogo.startsWith('data:') && rawLogo.trim() !== ''
      ? rawLogo
      : '/jnc-logo.jpg';

  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const handleDownloadPdf = async () => {
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

  const handlePrint = () => {
    setShowDirectPrintModal(true);
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
          className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-5xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden my-auto print:border-none print:shadow-none print:max-h-none print:max-w-none print:w-full print:bg-white print:text-black print:rounded-none print:static print:m-0 print:overflow-visible"
        >
          {/* Header Action Bar (Hidden when printing) */}
          <div className="flex items-center justify-between p-3 sm:p-4 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] print:hidden flex-wrap gap-2">
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
                className="btn bg-white dark:bg-white/10 hover:bg-slate-100 dark:hover:bg-white/20 text-slate-800 dark:text-white border border-slate-300 dark:border-transparent text-xs gap-1.5 py-1.5 font-bold shadow-sm"
                title="Direct Printer Connection (JNC Hub & Options)"
              >
                <Printer size={13} className="text-crm-blue" /> Direct Print
              </button>

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

          {/* ════════════════════════════════════════════════════════════════════════════
              EXACT INVOICE A4 PAPER TEMPLATE (FULL SCREEN ON MONITOR & EXACT 1-PAGE PRINT A4)
             ════════════════════════════════════════════════════════════════════════════ */}
          <div className="p-3 sm:p-6 overflow-y-auto bg-[#0B0D14] flex-1 print:bg-white print:p-0 print:m-0 print:overflow-visible flex justify-center">
            {isPO ? (
              /* ════════════════════════════════════════════════════════════════════════════
                 EXACT PURCHASE ORDER (PO) A4 PAPER TEMPLATE (MATCHING BUSINESS PDF)
                 ════════════════════════════════════════════════════════════════════════════ */
              <div id="printable-tax-invoice" className="w-full max-w-[794px] mx-auto bg-white text-black font-sans text-[11px] leading-[1.3] shadow-2xl border-[1.5px] border-black print:border-black print:shadow-none print:max-w-none print:w-[210mm] p-6 flex flex-col justify-between min-h-[1050px]">
                <div>
                  {/* Top Company Header with Official JNC Logo & Details */}
                  <div className="text-center space-y-1 pb-2 border-b border-black">
                    <div className="flex justify-center mb-1">
                      <img
                        src={invoiceLogo}
                        alt="Logo"
                        className="h-10 object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/jnc-logo.jpg';
                        }}
                      />
                    </div>
                    <h2 className="text-sm font-bold text-black uppercase tracking-wider">
                      {effectiveCompanyName}
                    </h2>
                    <p className="text-[10px] text-black">
                      Address :{profile?.addressLine1 || 'No, 18/19, 2nd Floor, Coconut Avenue'}, {profile?.addressLine2 || '3rd cross, 8th Phase JP Nagar'}, {profile?.city || 'Bangalore'} {profile?.pincode || '76'}.
                    </p>
                    <p className="text-[10px] text-black">
                      Contact No: {profile?.phone || '+91 9876543210'}{profile?.email ? `, E-mail: ${profile.email}` : ''}
                    </p>
                  </div>

                  {/* Title Bar */}
                  <div className="text-center font-bold text-xs py-1 border-b border-black bg-gray-50 uppercase tracking-wide text-black">
                    Purchase Order
                  </div>

                  {/* Vendor TO & PO Metadata Grid */}
                  <div className="grid grid-cols-2 border-b border-black divide-x divide-black text-[10.5px]">
                    <div className="p-2 space-y-0.5">
                      <p className="font-bold text-black">TO</p>
                      <p className="font-bold text-xs text-black">{invoice.customerName || 'Vendor Name'}</p>
                      {invoice.billingAddress && (
                        <p className="text-black text-[10px]">{invoice.billingAddress}</p>
                      )}
                    </div>
                    <div className="p-2 space-y-1 text-right">
                      <p className="font-bold text-black">Date :- <span className="font-normal">{formatDateDMY(invoice.invoiceDate)}</span></p>
                      <p className="font-bold text-black">PO-No :- <span className="font-mono font-bold">{invoice.invoiceNumber}</span></p>
                    </div>
                  </div>

                  {/* Formal Greeting */}
                  <div className="p-2.5 text-[10.5px] border-b border-black space-y-1">
                    <p className="font-bold text-black">Dear Sir,</p>
                    <p className="text-black">With reference to discussion had with you, we are pleased to place an order for supply of materials as below.</p>
                  </div>

                  {/* PO Items Table */}
                  <table className="w-full text-[10.5px] border-collapse border-b border-black">
                    <thead>
                      <tr className="border-b border-black font-bold text-center bg-gray-100">
                        <th className="py-1.5 px-2 w-10 border-r border-black font-bold text-black">SLNO</th>
                        <th className="py-1.5 px-3 text-left border-r border-black font-bold text-black">ITEM DESCRIPTION</th>
                        <th className="py-1.5 px-2 w-14 border-r border-black font-bold text-black">Unit</th>
                        <th className="py-1.5 px-2 w-14 border-r border-black font-bold text-black">QTY</th>
                        <th className="py-1.5 px-2 w-24 text-right border-r border-black font-bold text-black">UNIT RATE</th>
                        <th className="py-1.5 px-3 w-28 text-right font-bold text-black">TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, idx) => {
                        const lineTotal = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
                        return (
                          <tr key={l.id || idx} className="align-top border-b border-black/30">
                            <td className="py-2 px-2 text-center border-r border-black font-bold text-black">{idx + 1}</td>
                            <td className="py-2 px-3 text-left border-r border-black font-medium text-black whitespace-pre-line">{l.description}</td>
                            <td className="py-2 px-2 text-center border-r border-black text-black">{l.unit || 'Mtr'}</td>
                            <td className="py-2 px-2 text-center border-r border-black font-bold text-black">{l.quantity}</td>
                            <td className="py-2 px-2 text-right border-r border-black font-mono text-black">{Number(l.unitPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}</td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-black">{lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        );
                      })}

                      {/* Spacer row */}
                      <tr style={{ height: Math.max(60, 220 - lines.length * 35) }}>
                        <td className="border-r border-black"></td>
                        <td className="border-r border-black"></td>
                        <td className="border-r border-black"></td>
                        <td className="border-r border-black"></td>
                        <td className="border-r border-black"></td>
                        <td></td>
                      </tr>

                      {/* Totals Breakdown */}
                      <tr className="border-t border-black font-bold">
                        <td colSpan={5} className="py-1 px-3 text-right border-r border-black text-black">
                          Total Amount (INR)
                        </td>
                        <td className="py-1 px-3 text-right font-mono font-bold text-black">
                          {(effectiveSubtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                      <tr className="border-t border-black font-bold">
                        <td colSpan={5} className="py-1 px-3 text-right border-r border-black text-black">
                          GST @ 18%
                        </td>
                        <td className="py-1 px-3 text-right font-mono font-bold text-black">
                          {(invoice.igstAmount || (invoice.cgstAmount + invoice.sgstAmount) || Math.round((effectiveSubtotal * 18) / 100)).toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                        </td>
                      </tr>
                      <tr className="border-t border-black font-black text-xs bg-gray-100">
                        <td colSpan={5} className="py-1.5 px-3 text-right border-r border-black text-black">
                          Total Amount (INR) Inc GST
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono font-black text-black">
                          {(effectiveTotal || (effectiveSubtotal + Math.round((effectiveSubtotal * 18) / 100))).toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Terms and Conditions */}
                  <div className="p-3 text-[10px] space-y-1.5">
                    <p className="font-bold underline text-black">Terms and Conditions</p>
                    <div className="space-y-1 text-black">
                      <p><strong className="font-bold">1. Delivery Address : </strong>{invoice.deliveryAddress || 'Sample Logistics Park, Plot No: 100, Phase II, Bangalore, Karnataka – 560001.'}</p>
                      <p><strong className="font-bold">2. Delivery schedule : </strong>{invoice.deliverySchedule || 'Lot 1 within 15 days, balance as agreed.'}</p>
                      <p><strong className="font-bold">3. Billing Address : </strong>{invoice.billingAddress || effectiveCompanyName}</p>
                      <p><strong className="font-bold">4. Payment : </strong>{invoice.paymentTerms || 'Advance'}</p>
                      <p><strong className="font-bold">5. GST : </strong>{profile?.gstin || '29ABCDE1234F1Z5'}</p>
                    </div>
                  </div>
                </div>

                {/* PO Signatory Footer */}
                <div className="pt-6 flex justify-between items-end">
                  <div>
                    <img
                      src={invoiceLogo}
                      alt="Logo"
                      style={{ maxHeight: '30px', maxWidth: '140px', width: 'auto', height: 'auto', objectFit: 'contain' }}
                      className="h-6 object-contain opacity-80"
                    />
                  </div>
                  <div className="text-right space-y-8">
                    <p className="font-bold text-[10.5px] text-black">For {effectiveCompanyName}</p>
                    <p className="font-bold text-[10px] text-black">Authorised Signatory</p>
                  </div>
                </div>
              </div>
            ) : (
              /* ════════════════════════════════════════════════════════════════════════════
                 EXACT INVOICE / CREDIT NOTE / SEZ / PROFORMA / DC A4 PAPER TEMPLATE
                 ════════════════════════════════════════════════════════════════════════════ */
              <div id="printable-tax-invoice" className="w-full max-w-[794px] mx-auto bg-white text-black font-sans text-[11px] leading-[1.25] shadow-2xl border-[1.5px] border-black print:border-black print:shadow-none print:max-w-none print:w-[210mm]">

                {/* Top Title: Invoice / Tax Invoice / Proforma / Delivery Challan / Credit Note */}
                <div className="relative text-center font-bold text-sm tracking-wide py-1 border-b border-black bg-white text-black">
                  {isDC ? 'DELIVERY CHALLAN' : isProforma ? 'Proforma Invoice' : isCreditNote ? 'Credit Note' : isSEZ ? 'Tax Invoice' : 'Invoice'}
                  {(isSEZ || isCreditNote) && (
                    <span className="absolute right-3 top-1 text-[10.5px] font-normal text-black">
                      Original Copy
                    </span>
                  )}
                </div>

                {/* SEZ Statutory Undertaking Subtitle */}
                {isSEZ && (
                  <div className="text-center font-normal text-[9.5px] py-0.5 px-2 border-b border-black bg-gray-50 italic leading-tight text-black">
                    (Supply meant for export/Supply to SEZ unit or SEZ developer for authorised operations under bound or letter of undertaking without payment of IGST)
                  </div>
                )}

                {/* Header Box (Two Columns) */}
                <div className="grid grid-cols-2 border-b border-black divide-x divide-black bg-white text-black">
                  {/* Left Column: Company Details + Official Brand Logo */}
                  <div className="p-2 space-y-0.5 text-[10.5px] bg-white text-black">
                    {/* Official Brand Logo */}
                    <div className="mb-1 flex items-center">
                      <img
                        src={invoiceLogo}
                        alt="Logo"
                        style={{ maxHeight: '38px', maxWidth: '150px', width: 'auto', height: 'auto', objectFit: 'contain', display: 'block' }}
                        className="h-8 sm:h-9 object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/jnc-logo.jpg';
                        }}
                      />
                    </div>
                    <p className="font-bold text-xs text-black">{effectiveCompanyName}</p>
                    <p className="text-black font-medium">{profile?.addressLine1 || 'No, 18/19, 2nd Floor, Coconut Avenue,'}</p>
                    <p className="text-black font-medium">{profile ? `${profile.addressLine2}, ${profile.city} ${profile.pincode}.` : '3rd cross, 8th Phase JP Nagar, Bangalore 76.'}</p>
                    <p className="font-bold text-black">GST IN : {profile?.gstin || '29ABCDE1234F1Z5'}.</p>
                    <p className="text-black font-medium">MSME UDYAM Reg No: {profile?.msmeUdyamNo || 'UDYAM-XX-00-0000000'}.</p>
                    <p className="text-black font-medium">State Name : {profile?.state || 'Karnataka'}, Code - {profile?.stateCode || '29'}</p>
                    <p className="text-black font-medium">Email : {profile?.email || 'accounts@example.com'}</p>
                  </div>

                  {/* Right Column: Invoice Metadata Table with Full Continuous Borders */}
                  <div className="text-[10.5px] bg-white text-black">
                    <table className="w-full h-full border-collapse bg-white text-black">
                      <tbody>
                        <tr className="border-b border-black">
                          <td className="p-1.5 w-1/2 border-r border-black text-black">
                            <span className="font-bold text-black">{isDC ? 'DC No' : isCreditNote ? 'CN No' : 'Invoice No'} : </span>
                            <span className="font-mono font-bold text-black">{invoice.invoiceNumber}</span>
                          </td>
                          <td className="p-1.5 w-1/2 text-black">
                            <span className="font-bold text-black">Dated: </span>
                            <span className="font-bold text-black">{formatDateDMY(invoice.invoiceDate)}</span>
                          </td>
                        </tr>

                        <tr className="border-b border-black">
                          <td className="p-1.5 w-1/2 border-r border-black text-black">
                            <p className="font-bold text-black">Reference No. & Date.</p>
                            <p className="text-black font-semibold">{invoice.referenceNo || invoice.order?.orderNumber || '-'}</p>
                          </td>
                          <td className="p-1.5 w-1/2 text-black">
                            <p className="font-bold text-black">Mode/ Terms of</p>
                            <p className="font-bold text-black">Payment: <span className="font-semibold text-black">{invoice.paymentTerms || (isDC ? 'Immediately' : 'Advance')}</span></p>
                          </td>
                        </tr>

                        <tr className={(isSEZ || isCreditNote) ? 'border-b border-black' : ''}>
                          <td className="p-1.5 w-1/2 border-r border-black text-black">
                            <p className="font-bold text-black">{isDC ? 'PO Order .' : "Buyer's Order No."}</p>
                            <p className="text-black font-semibold">{invoice.buyerOrderNo || invoice.order?.orderNumber || '-'}</p>
                          </td>
                          <td className="p-1.5 w-1/2 text-black">
                            <p className="font-bold text-black">{isDC ? 'Order-Dated:' : 'PO-Dated:'} <span className="font-semibold text-black">{invoice.poDate ? formatDateDMY(invoice.poDate) : formatDateDMY(invoice.invoiceDate)}</span></p>
                          </td>
                        </tr>

                        {/* LUT / Bond Box for SEZ or Credit Note */}
                        {(isSEZ || isCreditNote) && (
                          <tr>
                            <td colSpan={2} className="p-1.5 bg-gray-50 text-black">
                              <p className="font-bold text-black">LUT/Bond No : <span className="font-mono font-bold text-black">{invoice.lutBondNo || (isSEZ ? (profile?.lutBondNo || 'AD290525013648T') : '')}</span></p>
                              {isSEZ && <p className="text-black font-semibold">{invoice.lutValidity || profile?.lutValidity || 'From : 10/05/2025 To: 09/05/2026'}</p>}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Address Box (Two Columns) */}
                <div className="grid grid-cols-2 border-b border-black divide-x divide-black bg-white text-black">
                  {/* Billing Address */}
                  <div className="p-2 space-y-0.5 text-[10.5px] bg-white text-black">
                    <p className="font-bold text-[11px] text-black">Billing Address :</p>
                    <p className="font-bold text-xs text-black">{invoice.customerName}</p>
                    <p className="text-black font-medium">{invoice.billingAddress || `${invoice.customerState || 'Karnataka'}, India`}</p>
                    {!isDC && (
                      <p className="font-bold text-[10.5px] pt-0.5 text-black">
                        GST No: {invoice.customerGstin || (invoice.company?.gstin ? invoice.company.gstin : '-')}
                      </p>
                    )}
                  </div>

                  {/* Delivery Address */}
                  <div className="p-2 space-y-0.5 text-[10.5px] bg-white text-black">
                    <p className="font-bold text-[11px] text-black">Delivery Address :</p>
                    <p className="font-bold text-xs text-black">{invoice.customerName}</p>
                    <p className="text-black font-medium">{invoice.deliveryAddress || invoice.billingAddress || `${invoice.customerState || 'Karnataka'}, India`}</p>
                  </div>
                </div>

                {/* Items Table with Full Continuous Grid Lines (Expanded Center Section) */}
                <div className="relative bg-white text-black">
                  <table className="w-full text-[11px] table-fixed border-collapse border-b border-black bg-white">
                    <thead>
                      <tr className="border-b border-black font-bold text-center bg-gray-100 print:bg-transparent">
                        <th className="py-2 px-2 w-[5.5%] border-r border-black font-bold text-black">Sl No</th>
                        <th className="py-2 px-3 text-left w-[44.5%] border-r border-black font-bold text-black">Description of Goods</th>
                        {!isDC ? (
                          <>
                            <th className="py-2 px-2 w-[10.5%] border-r border-black font-bold text-black">HSN/ SAC</th>
                            <th className="py-2 px-2 w-[6.5%] border-r border-black font-bold text-black">Unit</th>
                            <th className="py-2 px-2 w-[11.5%] text-right border-r border-black font-bold text-black">Unit Rate</th>
                            <th className="py-2 px-2 w-[6.5%] border-r border-black font-bold text-black">Qty</th>
                            <th className="py-2 px-3 w-[15%] text-right font-bold text-black">Amount</th>
                          </>
                        ) : (
                          <>
                            <th className="py-2 px-2 w-[10%] border-r border-black font-bold text-black">UNIT</th>
                            <th className="py-2 px-2 w-[10%] border-r border-black font-bold text-black">Qty</th>
                            <th className="py-2 px-3 w-[30%] text-right font-bold text-black">Remarks/Rate</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {lines.map((line, idx) => {
                        const lineTaxable = (line.quantity || 0) * (line.unitPrice || 0);
                        return (
                          <tr key={line.id || idx} className="align-top bg-white">
                            <td className="py-2 px-2 text-center border-r border-black text-black">{idx + 1}</td>
                            <td className="py-2 px-3 text-left border-r border-black font-medium whitespace-pre-line leading-relaxed text-black">
                              {line.description}
                            </td>
                            {!isDC && (
                              <td className="py-2 px-2 text-center border-r border-black font-mono text-black">
                                {line.hsnCode || (idx === lines.length - 1 && line.description.toLowerCase().includes('transport') ? '9965' : '8504')}
                              </td>
                            )}
                            <td className="py-2 px-2 text-center border-r border-black text-black">{line.unit || (isDC ? 'No' : "No's")}</td>
                            {!isDC && (
                              <td className="py-2 px-2 text-right border-r border-black font-mono text-black">
                                {Math.round(line.unitPrice || 0).toLocaleString('en-IN')}
                              </td>
                            )}
                            <td className="py-2 px-2 text-center border-r border-black font-semibold text-black">
                              {line.quantity || 0}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-semibold text-black">
                              {isDC ? '-' : lineTaxable.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })}

                      {/* Generous Spacer row extending the center section */}
                      <tr style={{ height: Math.max(100, 320 - lines.length * 35) }} className="bg-white">
                        <td className="border-r border-black"></td>
                        <td className="border-r border-black"></td>
                        {!isDC && <td className="border-r border-black"></td>}
                        <td className="border-r border-black"></td>
                        {!isDC && <td className="border-r border-black"></td>}
                        <td className="border-r border-black"></td>
                        <td></td>
                      </tr>

                      {isDC ? (
                        <tr className="border-t border-black font-bold text-[11px] bg-gray-50 print:bg-transparent">
                          <td colSpan={3} className="py-1.5 px-3 text-right font-bold border-r border-black text-black">
                            Total Quantity:
                          </td>
                          <td className="py-1.5 px-2 text-center font-mono font-bold border-r border-black text-black">
                            {totalQty}
                          </td>
                          <td className="py-1.5 px-2 text-center font-mono text-black">
                            -
                          </td>
                        </tr>
                      ) : (
                        <>
                          {/* Subtotal Taxable Row */}
                          <tr className="border-t border-black bg-white">
                            <td colSpan={5} className="py-1 px-3 text-right font-bold border-r border-black text-black">
                              Sub Total
                            </td>
                            <td className="py-1 px-2 text-center font-mono font-semibold border-r border-black text-black">
                              {totalQty}
                            </td>
                            <td className="py-1 px-2 text-right font-mono font-bold text-black">
                              {(effectiveSubtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                            </td>
                          </tr>

                          {/* Tax Row(s) */}
                          {isSEZ ? (
                            <tr className="border-t border-black/40 bg-white">
                              <td colSpan={6} className="py-1 px-3 text-right font-bold border-r border-black italic text-[10px] text-black">
                                Nill - IGST 18% Tax by LUT
                              </td>
                              <td className="py-1 px-2 text-right font-mono font-bold text-black">
                                -
                              </td>
                            </tr>
                          ) : isInterState ? (
                            <tr className="border-t border-black/40 bg-white">
                              <td colSpan={6} className="py-1 px-3 text-right font-bold border-r border-black text-black">
                                IGST 18%
                              </td>
                              <td className="py-1 px-2 text-right font-mono font-bold text-black">
                                {(invoice.igstAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ) : (
                            <>
                              <tr className="border-t border-black/40 bg-white">
                                <td colSpan={6} className="py-0.5 px-3 text-right font-bold border-r border-black text-black">
                                  CGST 9%
                                </td>
                                <td className="py-0.5 px-2 text-right font-mono font-bold text-black">
                                  {(invoice.cgstAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                              <tr className="border-t border-black/40 bg-white">
                                <td colSpan={6} className="py-0.5 px-3 text-right font-bold border-r border-black text-black">
                                  SGST 9%
                                </td>
                                <td className="py-0.5 px-2 text-right font-mono font-bold text-black">
                                  {(invoice.sgstAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            </>
                          )}

                          {/* Advance Row for Proforma */}
                          {isProforma && (
                            <>
                              <tr className="border-t border-black/40 bg-emerald-50">
                                <td colSpan={6} className="py-1 px-3 text-right font-bold border-r border-black text-emerald-900">
                                  Advance {advancePercent}% with PO
                                </td>
                                <td className="py-1 px-2 text-right font-mono font-bold text-emerald-900">
                                  {advanceAmount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                              <tr className="border-t border-black/40 bg-white">
                                <td colSpan={6} className="py-0.5 px-3 text-right font-bold border-r border-black text-slate-700 italic text-[10px]">
                                  Balance {100 - advancePercent}% on Dispatch / Delivery
                                </td>
                                <td className="py-0.5 px-2 text-right font-mono font-semibold text-slate-700">
                                  {(effectiveTotal - advanceAmount).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            </>
                          )}

                          {/* Round off row */}
                          <tr className="border-t border-black/40 bg-white">
                            <td colSpan={6} className="py-0.5 px-3 text-right font-bold border-r border-black text-black">
                              Round off
                            </td>
                            <td className="py-0.5 px-2 text-right font-mono font-bold text-black">
                              {(invoice.roundOff !== undefined && invoice.roundOff !== 0 ? (invoice.roundOff > 0 ? `+${invoice.roundOff.toFixed(2)}` : invoice.roundOff.toFixed(2)) : '-')}
                            </td>
                          </tr>

                          {/* Grand Total Row */}
                          <tr className="border-t border-black font-bold text-xs bg-gray-100 print:bg-transparent">
                            <td colSpan={5} className="py-1.5 px-3 text-right border-r border-black font-bold text-black">
                              Total
                            </td>
                            <td className="py-1.5 px-2 text-center font-mono font-bold border-r border-black text-black">
                              {totalQty}
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono font-black text-xs text-black">
                              {Math.round(effectiveTotal).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                            </td>
                          </tr>

                          {/* Advance Adjusted for Final Tax Invoice */}
                          {!isProforma && !isDC && !isCreditNote && (invoice.advanceAdjusted && invoice.advanceAdjusted > 0) && (
                            <>
                              <tr className="border-t border-black/40 bg-emerald-50/50">
                                <td colSpan={6} className="py-1 px-3 text-right font-bold border-r border-black text-emerald-900">
                                  Less: Advance Received {invoice.transactionRef ? `(${invoice.transactionRef})` : ''}
                                </td>
                                <td className="py-1 px-2 text-right font-mono font-bold text-emerald-900">
                                  - {invoice.advanceAdjusted.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                              <tr className="border-t border-black font-bold text-xs bg-emerald-100/70 print:bg-transparent">
                                <td colSpan={6} className="py-1.5 px-3 text-right border-r border-black font-bold text-black">
                                  Net Balance Payable / Due
                                </td>
                                <td className="py-1.5 px-2 text-right font-mono font-black text-xs text-black">
                                  {(invoice.balanceDue ?? Math.max(0, effectiveTotal - invoice.advanceAdjusted)).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            </>
                          )}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Amount in Words Row */}
                {!isDC && (
                  <div className="p-1.5 px-2 border-b border-black font-bold text-[10.5px] bg-white text-black">
                    In Words :- <span className="font-semibold">{amountInWords}</span>
                  </div>
                )}

                {/* Secondary Statutory HSN/SAC Summary Table for SEZ / Export */}
                {isSEZ && (
                  <div className="border-b border-black bg-white text-black">
                    <table className="w-full text-[10px] border-collapse bg-white">
                      <thead>
                        <tr className="border-b border-black bg-gray-100 font-bold text-center">
                          <th className="py-1 px-1.5 border-r border-black text-black">HSN/SAC</th>
                          <th className="py-1 px-1.5 border-r border-black text-right text-black">Taxable Value</th>
                          <th className="py-1 px-1.5 border-r border-black text-black">Rate</th>
                          <th className="py-1 px-1.5 border-r border-black text-right text-black">Integrated Tax Amount</th>
                          <th className="py-1 px-1.5 text-right text-black">Total Tax Amount</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        <tr className="border-b border-black">
                          <td className="py-1 px-1.5 border-r border-black text-center font-mono text-black">{distinctHsns}</td>
                          <td className="py-1 px-1.5 border-r border-black text-right font-mono text-black">{(effectiveSubtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                          <td className="py-1 px-1.5 border-r border-black text-center font-mono text-black">18%</td>
                          <td className="py-1 px-1.5 border-r border-black text-right font-mono text-black">{theoreticalIgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="py-1 px-1.5 text-right font-mono font-bold text-black">{theoreticalIgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        </tr>
                        <tr className="font-bold bg-gray-50">
                          <td className="py-1 px-1.5 border-r border-black text-right text-black">Total</td>
                          <td className="py-1 px-1.5 border-r border-black text-right font-mono text-black">{(effectiveSubtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                          <td className="py-1 px-1.5 border-r border-black"></td>
                          <td className="py-1 px-1.5 border-r border-black text-right font-mono text-black">{theoreticalIgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="py-1 px-1.5 text-right font-mono font-bold text-black">{theoreticalIgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Bottom Declaration & Bank/Signatory Grid */}
                <div className="grid grid-cols-2 divide-x divide-black border-b border-black text-[10px] bg-white text-black">
                  {/* Left Box: Declaration */}
                  <div className="p-2 space-y-0.5 bg-white text-black">
                    <p className="font-bold text-[10.5px] text-black">
                      {isDC
                        ? 'Dispatch & Delivery Declaration:'
                        : isSEZ
                        ? 'SEZ / LUT Statutory Declaration:'
                        : isProforma
                        ? 'Proforma Terms & Conditions:'
                        : 'Declaration:'}
                    </p>
                    {isDC ? (
                      <ol className="list-decimal pl-3 space-y-0.5 text-black leading-tight text-[10px]">
                        <li>Goods dispatched in sound condition as per Buyer Purchase Order.</li>
                        <li>Any discrepancy, shortage, or damage must be reported within 2 working days of material receipt.</li>
                        <li>Consignee/Receiver to verify physical quantity, serial numbers & acknowledge with official stamp and signature.</li>
                        <li>This Delivery Challan is for material transit and transportation purposes only (NOT a Tax Invoice).</li>
                      </ol>
                    ) : isSEZ ? (
                      <ol className="list-decimal pl-3 space-y-0.5 text-black leading-tight text-[10px]">
                        <li>We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</li>
                        <li>Supply made to SEZ unit for authorized operations under LUT No. <strong>{invoice.lutBondNo || profile?.lutBondNo || 'AD290525013648T'}</strong> without payment of IGST.</li>
                        <li>Goods once sold will not be exchanged or taken back.</li>
                        <li>Payment should be made strictly as per agreed terms. Subject to Bangalore Jurisdiction.</li>
                      </ol>
                    ) : isProforma ? (
                      <ol className="list-decimal pl-3 space-y-0.5 text-black leading-tight text-[10px]">
                        <li>This is a Proforma Invoice and NOT a Tax Invoice. Final GST Tax Invoice will be issued upon delivery/dispatch.</li>
                        <li>Payment Terms: Advance payment as per milestone breakdown. Procurement/dispatch will commence upon advance confirmation.</li>
                        <li>Rates and terms quoted herein remain valid for 30 days from the document date.</li>
                        <li>Advance amount is non-refundable once procurement/fabrication has initiated.</li>
                      </ol>
                    ) : isCreditNote ? (
                      <ol className="list-decimal pl-3 space-y-0.5 text-black leading-tight text-[10px]">
                        <li>Any complaints should be reported within 2 days on receipt of material after which no complaint will be entertained.</li>
                        <li>Goods once sold will not be exchanged or taken back.</li>
                        <li>Payment should be made strictly as per terms mentioned.</li>
                        <li>If non payment as per terms agreed, {effectiveCompanyName} will have rights to seize the materials & take back.</li>
                        <li>Advance amount will not be refunded for any circumstances.</li>
                      </ol>
                    ) : (
                      <ol className="list-decimal pl-3 space-y-0.5 text-black leading-tight text-[10px]">
                        <li>Any complaints should be reported within 2 days on receipt of material after which no complaint will be entertained.</li>
                        <li>Goods once sold will not be exchanged or taken back.</li>
                        <li>Payment should be made strictly as per terms mentioned.</li>
                        <li>If non payment as per terms agreed, {effectiveCompanyName} will have rights to seize the materials & take back.</li>
                        <li>Advance amount will not be refunded for any circumstances.</li>
                      </ol>
                    )}
                  </div>

                  {/* Right Box: Bank Details & Authorized Signatory */}
                  <div className="flex flex-col justify-between bg-white text-black">
                    {/* Bank Details or Consignee Acknowledgment */}
                    {!isDC ? (
                      <div className="p-2 border-b border-black space-y-0.5 text-[10px] bg-white text-black">
                        <p className="font-bold text-[10.5px] text-black">Company's Bank Details</p>
                        <p><span className="font-medium">A/C Holder's Name : </span><strong>{profile?.bankDetails?.accountHolderName || effectiveCompanyName}</strong></p>
                        <p><span className="font-medium">Bank Name : </span><strong>{profile?.bankDetails?.bankName || 'Karnataka Bank'}</strong></p>
                        <p><span className="font-medium">A/c No : </span><strong className="font-mono">{profile?.bankDetails?.accountNumber || '9222000100091501'}</strong></p>
                        <p><span className="font-medium">Branch & IFS Code : </span><strong>{profile?.bankDetails?.branch || 'J P Nagar 7th Phase'} & {profile?.bankDetails?.ifscCode || 'KARB0000922'}</strong></p>
                      </div>
                    ) : (
                      <div className="p-2 border-b border-black space-y-0.5 bg-gray-50 text-[10px] text-black">
                        <p className="font-bold text-[10.5px] text-black">Consignee Acknowledgment & Stamp</p>
                        <p className="text-[9.5px] text-black font-medium">Received the above goods in sound condition & correct quantity.</p>
                        <div className="pt-4 flex justify-between items-end text-[9.5px] text-black font-medium">
                          <span>Receiver's Sign & Date</span>
                          <span className="font-mono text-black font-bold">Official Company Seal</span>
                        </div>
                      </div>
                    )}

                    {/* Signatory Area */}
                    <div className="p-2 text-right flex-1 flex flex-col justify-between min-h-[75px] bg-white text-black">
                      <p className="font-bold text-[10.5px] text-black">FOR {effectiveCompanyName}</p>

                      {/* Stamp & Signature Image Area */}
                      <div className="relative my-0.5 min-h-[36px] flex items-center justify-end">
                        {effectiveSignatory?.stampImage && (
                          <img
                            src={effectiveSignatory.stampImage}
                            alt="Seal"
                            className="w-12 h-12 object-contain opacity-85 absolute right-16 top-0 pointer-events-none"
                          />
                        )}
                        {effectiveSignatory?.signatureImage ? (
                          <img
                            src={effectiveSignatory.signatureImage}
                            alt="Signature"
                            className="max-h-9 max-w-[120px] object-contain relative z-10"
                          />
                        ) : (
                          <div className="h-6"></div>
                        )}
                      </div>

                      <div>
                        <p className="text-[10px] font-bold text-black">
                          Authorised Signatory
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Line: Computer Generated Notice */}
                <div className="text-center text-[9px] py-0.5 text-black font-medium bg-white">
                  This is a Computer Generated {isDC ? 'Delivery Challan' : isProforma ? 'Proforma Invoice' : isCreditNote ? 'Credit Note' : isSEZ ? 'Tax Invoice (SEZ/LUT)' : 'Tax Invoice'}
                </div>

              </div>
            )}
          </div>

          {/* Footer Bar */}
          <div className="p-3 border-t border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex justify-between items-center print:hidden text-xs text-slate-400">
            <span className="font-mono">
              {isDC ? 'DC' : 'Invoice'} #{invoice.invoiceNumber} {!isDC && `| Total: ₹${effectiveTotal.toLocaleString('en-IN')}`}
            </span>
            <button onClick={onClose} className="btn-ghost text-xs px-5">
              Close
            </button>
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
                    placeholder="e.g. ap@customer.com / billing@company.in"
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
      <RecordPaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        invoice={invoice}
        onSuccess={() => {
          if (onInvoiceUpdated) onInvoiceUpdated();
        }}
      />

      {/* ─── JNC DIRECT PRINTER CONNECTION MODAL ───────────────────────────────── */}
      <DirectPrintModal
        isOpen={showDirectPrintModal}
        onClose={() => setShowDirectPrintModal(false)}
        invoice={invoice}
        profile={profile}
        signatoryConfig={effectiveSignatory}
        activeTemplate={activeTemplate}
        invoiceLogo={invoiceLogo}
        onDownloadPdf={handleDownloadPdf}
      />
    </>
  );
}
