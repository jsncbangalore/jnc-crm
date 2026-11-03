/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Printer, Download, X, AlertTriangle, RefreshCw, FileText } from 'lucide-react';
import { invoicesApi, quotationsApi, ledgerApi, inventoryApi, brandingApi } from '../services/api';
import { useAllowedPages } from '../hooks/useAllowedPages';
import { BRAND_CONFIG } from '../config/brand';
import InvoiceDocumentTemplate, { numberToIndianWords } from '../components/invoices/InvoiceDocumentTemplate';
import { downloadDocumentPdf } from '../utils/printHelper';
import { DocumentType } from '../types';

export default function DedicatedPrintPage() {
  const { docType = 'invoice', id } = useParams<{ docType: string; id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const { hasPage } = useAllowedPages();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [docData, setDocData] = useState<any>(null);
  const [brandingProfile, setBrandingProfile] = useState<any>(null);

  // Print controls state
  const [paperSize, setPaperSize] = useState<'A4' | 'A5'>(
    (searchParams.get('paperSize') as 'A4' | 'A5') || 'A4'
  );
  const [copyLabel, setCopyLabel] = useState<string>(
    searchParams.get('copyLabel') || 'ORIGINAL FOR RECIPIENT'
  );
  const [downloading, setDownloading] = useState(false);

  const hasAutoPrintedRef = useRef(false);

  // Normalized document category
  const normalizedDocType = docType.toLowerCase();
  const isInvoiceFamily = [
    'invoice',
    'tax_invoice',
    'delivery_challan',
    'proforma_invoice',
    'credit_note',
    'purchase_order',
    'sez_invoice',
  ].includes(normalizedDocType);

  const isQuotation = normalizedDocType === 'quotation';
  const isStatement = normalizedDocType === 'statement' || normalizedDocType === 'ledger';
  const isPurchaseBill = normalizedDocType === 'purchase_bill' || normalizedDocType === 'bill';

  // Permission Verification
  const hasAccess = (() => {
    if (isInvoiceFamily) return hasPage('invoices') || hasPage('orders');
    if (isQuotation) return hasPage('quotations');
    if (isStatement) return hasPage('ledger');
    if (isPurchaseBill) return hasPage('bills') || hasPage('inventory');
    return true;
  })();

  // 1. Fetch document and branding data
  useEffect(() => {
    if (!id) {
      setError('Document ID is required.');
      setLoading(false);
      return;
    }

    if (!hasAccess) {
      setError('You do not have permission to view or print this document.');
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        // Fetch company branding
        const brandingRes = await brandingApi.get().catch(() => ({ data: null }));
        if (isMounted && brandingRes?.data) {
          setBrandingProfile(brandingRes.data);
        }

        // Fetch document according to type
        if (isInvoiceFamily) {
          const res = await invoicesApi.get(id!);
          if (isMounted) setDocData(res.data);
        } else if (isQuotation) {
          const res = await quotationsApi.get(id!);
          if (isMounted) setDocData(res.data);
        } else if (isStatement) {
          const fy = searchParams.get('fy') || '2026-27';
          // Try fetching as customer first, fallback to supplier if needed
          let res = await ledgerApi.getStatement({
            partyType: 'customer',
            partyId: id!,
            financialYear: fy,
          }).catch(() => null);

          if (!res || !res.data) {
            res = await ledgerApi.getStatement({
              partyType: 'supplier',
              partyId: id!,
              financialYear: fy,
            }).catch(() => null);
          }

          if (isMounted) {
            if (res?.data) {
              setDocData(res.data);
            } else {
              throw new Error('Statement data not found for party.');
            }
          }
        } else if (isPurchaseBill) {
          const res = await inventoryApi.getPurchaseBill(id!);
          if (isMounted) setDocData(res.data);
        } else {
          throw new Error(`Unsupported document type: ${docType}`);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.response?.data?.message || err?.message || 'Failed to load document for printing.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [id, normalizedDocType, hasAccess, searchParams]);

  // 2. Auto-print trigger: wait for fonts & images, then invoke window.print() once
  useEffect(() => {
    if (loading || error || !docData || hasAutoPrintedRef.current) return;

    // Check if autoPrint was explicitly disabled
    if (searchParams.get('autoPrint') === 'false') return;

    const timer = setTimeout(() => {
      const fontPromise = document.fonts ? document.fonts.ready : Promise.resolve();
      const images = Array.from(document.querySelectorAll('img'));
      const imagePromises = images.map((img) => {
        if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
        return new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        });
      });

      Promise.all([fontPromise, ...imagePromises]).then(() => {
        if (!hasAutoPrintedRef.current) {
          hasAutoPrintedRef.current = true;
          // Trigger print dialog once; NEVER close the window automatically
          try {
            window.print();
          } catch (printErr) {
            console.error('Auto window.print failed:', printErr);
          }
        }
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [loading, error, docData, searchParams]);

  // Handle PDF Download
  const handleDownloadPdf = async () => {
    if (!id) return;
    try {
      setDownloading(true);
      const effectiveTemplate = isInvoiceFamily
        ? (normalizedDocType === 'invoice' ? 'tax_invoice' : normalizedDocType)
        : normalizedDocType;

      const fy = searchParams.get('fy') || '2026-27';
      await downloadDocumentPdf(normalizedDocType, id, undefined, {
        template: effectiveTemplate,
        fy,
      });
    } catch (err) {
      console.error('Download PDF error:', err);
    } finally {
      setDownloading(false);
    }
  };

  // Handle Paper Size Change
  const handlePaperSizeChange = (size: 'A4' | 'A5') => {
    setPaperSize(size);
    const newParams = new URLSearchParams(searchParams);
    newParams.set('paperSize', size);
    setSearchParams(newParams, { replace: true });
  };

  // Handle Copy Label Change
  const handleCopyLabelChange = (label: string) => {
    setCopyLabel(label);
    const newParams = new URLSearchParams(searchParams);
    newParams.set('copyLabel', label);
    setSearchParams(newParams, { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-slate-800">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
          <span className="font-semibold text-sm">Preparing official print document...</span>
        </div>
        <p className="text-xs text-slate-400 mt-2">Loading document structure, typography, and company assets</p>
      </div>
    );
  }

  if (error || !docData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-6 border border-slate-200 shadow-xl text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Document Unavailable</h2>
            <p className="text-xs text-slate-500 mt-1">{error || 'Could not load requested document.'}</p>
          </div>
          <div className="pt-2 flex justify-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
            >
              Retry
            </button>
            <button
              onClick={() => window.close()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition"
            >
              Close Window
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Determine active document template type for invoices family
  const effectiveInvoiceTemplate: DocumentType = (
    normalizedDocType === 'invoice'
      ? (docData.docType || 'tax_invoice')
      : (normalizedDocType as DocumentType)
  );

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 print:bg-white text-slate-900 font-sans">
      {/* ─── FLOATING TOP TOOLBAR (HIDDEN DURING PRINT) ─────────────────────── */}
      <header
        className="sticky top-0 z-50 print:hidden bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-white px-4 py-2.5 shadow-xl flex items-center justify-between gap-4 flex-wrap"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-xs font-bold leading-tight uppercase tracking-wider text-slate-200">
              {isInvoiceFamily
                ? (effectiveInvoiceTemplate === 'delivery_challan' ? 'Delivery Challan' : 'Official Tax Document')
                : isQuotation
                ? 'Formal Price Quotation'
                : isStatement
                ? 'Statement of Account'
                : 'Purchase Bill Soft Copy'}
            </h1>
            <p className="text-[11px] font-mono text-blue-400">
              {docData.invoiceNumber || docData.quoteNumber || docData.billNumber || docData.party?.partyName || id}
            </p>
          </div>
        </div>

        {/* Print Configuration Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Copy Label Selector (Applicable for Invoices / Challans) */}
          {isInvoiceFamily && (
            <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700 text-xs">
              <span className="text-[11px] text-slate-400">Copy:</span>
              <select
                value={copyLabel}
                onChange={(e) => handleCopyLabelChange(e.target.value)}
                className="bg-transparent text-white font-medium text-xs focus:outline-none cursor-pointer"
                title="Select statutory copy designation"
              >
                <option value="ORIGINAL FOR RECIPIENT" className="bg-slate-900 text-white">Original for Recipient</option>
                <option value="DUPLICATE FOR TRANSPORTER" className="bg-slate-900 text-white">Duplicate for Transporter</option>
                <option value="TRIPLICATE FOR SUPPLIER" className="bg-slate-900 text-white">Triplicate for Supplier</option>
                <option value="EXTRA / OFFICE COPY" className="bg-slate-900 text-white">Extra / Office Copy</option>
              </select>
            </div>
          )}

          {/* Paper Size Selector */}
          <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700 text-xs">
            <span className="text-[11px] text-slate-400">Paper:</span>
            <select
              value={paperSize}
              onChange={(e) => handlePaperSizeChange(e.target.value as 'A4' | 'A5')}
              className="bg-transparent text-white font-medium text-xs focus:outline-none cursor-pointer"
              title="Select paper output format"
            >
              <option value="A4" className="bg-slate-900 text-white">A4 (210 × 297 mm)</option>
              <option value="A5" className="bg-slate-900 text-white">A5 (148 × 210 mm)</option>
            </select>
          </div>

          {/* Print Button */}
          <button
            onClick={() => window.print()}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition active:scale-95"
            title="Open browser print dialog"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>

          {/* Download PDF Button */}
          <button
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 transition disabled:opacity-50"
            title="Download direct PDF file"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{downloading ? 'Downloading...' : 'Download PDF'}</span>
          </button>

          {/* Close Window */}
          <button
            onClick={() => window.close()}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg border border-slate-700 transition"
            title="Close this window"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ─── PRINT CANVAS AREA (FIXED WHITE CANVAS WITH PURE BLACK TEXT) ───── */}
      <main className="p-4 sm:p-8 flex justify-center print:p-0 print:m-0 print:w-full print:block">
        <div className="w-full flex justify-center print:block">
          {/* INVOICE / CHALLAN FAMILY */}
          {isInvoiceFamily && (
            <InvoiceDocumentTemplate
              invoice={docData}
              profile={brandingProfile}
              activeTemplate={effectiveInvoiceTemplate}
              invoiceLogo={brandingProfile?.documentLogoUrl || brandingProfile?.logoUrl}
              copyLabel={copyLabel}
              paperSize={paperSize}
              showLogoNotice={false}
              includeHeader={true}
              includeDeliveryAddress={true}
              includeBankDetails={true}
              includeTerms={true}
              includeSignatory={true}
            />
          )}

          {/* QUOTATION TEMPLATE */}
          {isQuotation && (
            <div
              className={`w-full ${paperSize === 'A5' ? 'max-w-[559px] paper-a5 text-[9.5px]' : 'max-w-[794px] paper-a4 text-[11px]'} bg-white text-black p-6 border-2 border-black shadow-2xl print:border-black print:shadow-none print:m-0`}
            >
              <div className="border-b-2 border-black pb-3 mb-4 flex justify-between items-start">
                <div>
                  {(brandingProfile?.documentLogoUrl || brandingProfile?.logoUrl || BRAND_CONFIG.logoUrl) && (
                    <img
                      src={brandingProfile?.documentLogoUrl || brandingProfile?.logoUrl || BRAND_CONFIG.logoUrl}
                      alt="Company Logo"
                      className="max-h-10 max-w-[160px] object-contain mb-2 inline-block"
                    />
                  )}
                  <h2 className="text-base font-black uppercase text-black">
                    {brandingProfile?.companyName || docData.tenant?.name || BRAND_CONFIG.displayName}
                  </h2>
                  <p className="text-[10px] text-black">
                    {brandingProfile?.address || docData.tenant?.address || ''}
                  </p>
                  <p className="text-[10px] text-black">
                    GSTIN: {brandingProfile?.gstin || docData.tenant?.gstin || 'Unregistered'}
                  </p>
                </div>
                <div className="text-right">
                  <h1 className="text-lg font-black tracking-wide text-black uppercase">PRICE QUOTATION</h1>
                  <p className="font-mono font-bold text-xs mt-1 text-black">{docData.quoteNumber}</p>
                  <p className="text-[10px] text-black">Date: {new Date(docData.createdAt).toLocaleDateString('en-IN')}</p>
                  <p className="text-[10px] text-black">Valid Until: {new Date(docData.validUntil).toLocaleDateString('en-IN')}</p>
                </div>
              </div>

              {/* Quotation Recipient Details */}
              <div className="grid grid-cols-2 gap-4 border border-black p-3 mb-4 bg-gray-50 text-black">
                <div>
                  <span className="font-bold text-[10px] uppercase text-black">Quotation For:</span>
                  <p className="font-bold text-xs text-black">{docData.lead?.customerName || docData.contact?.name || 'Valued Client'}</p>
                  <p className="text-[10px] text-black">{docData.lead?.company?.name || docData.lead?.companyName || ''}</p>
                  <p className="text-[10px] text-black">Phone: {docData.lead?.customerPhone || docData.contact?.phone || '—'}</p>
                  <p className="text-[10px] text-black">Email: {docData.lead?.customerEmail || docData.contact?.email || '—'}</p>
                </div>
                <div className="text-right">
                  <span className="font-bold text-[10px] uppercase text-black">Prepared By:</span>
                  <p className="font-bold text-xs text-black">{docData.createdBy?.name || 'Sales Representative'}</p>
                  <p className="text-[10px] text-black">Status: <strong className="uppercase">{docData.status || 'Active'}</strong></p>
                </div>
              </div>

              {/* Line Items Table */}
              <table className="w-full border-collapse border border-black mb-4 text-black">
                <thead>
                  <tr className="bg-gray-100 text-black border-b border-black">
                    <th className="border border-black p-1.5 text-center w-8 text-[10px]">#</th>
                    <th className="border border-black p-1.5 text-left text-[10px]">Description & Specifications</th>
                    <th className="border border-black p-1.5 text-right w-14 text-[10px]">Qty</th>
                    <th className="border border-black p-1.5 text-right w-24 text-[10px]">Rate (₹)</th>
                    <th className="border border-black p-1.5 text-right w-24 text-[10px]">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {(docData.lines || []).map((line: any, idx: number) => (
                    <tr key={idx} className="border-b border-black">
                      <td className="border border-black p-1.5 text-center text-[10px]">{idx + 1}</td>
                      <td className="border border-black p-1.5 text-left text-[10px]">
                        <strong>{line.sku?.skuCode || ''}</strong> {line.sku?.name || line.description || 'Item'}
                      </td>
                      <td className="border border-black p-1.5 text-right text-[10px]">{line.quantity}</td>
                      <td className="border border-black p-1.5 text-right text-[10px]">
                        {Number(line.unitPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="border border-black p-1.5 text-right font-bold text-[10px]">
                        {Number(line.totalPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals Summary */}
              <div className="w-72 ml-auto mb-4 border border-black p-2 text-black">
                <div className="flex justify-between py-0.5 text-[10px]">
                  <span>Subtotal:</span>
                  <span>₹{Number(docData.subtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-0.5 text-[10px]">
                  <span>Tax ({docData.taxRate || 18}%):</span>
                  <span>₹{Number(docData.taxAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-1 font-bold border-t border-black text-xs">
                  <span>Grand Total:</span>
                  <span>₹{Number(docData.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              {/* Amount in words */}
              <div className="border border-black p-2 mb-4 text-[10px] bg-gray-50 text-black">
                <strong>Amount in Words: </strong>
                <span>INR {numberToIndianWords(Number(docData.totalAmount || 0))}</span>
              </div>

              {/* Terms & Conditions */}
              {docData.terms && (
                <div className="border border-black p-2.5 mb-4 text-[10px] text-black">
                  <strong className="block mb-1">Terms & Conditions:</strong>
                  <div className="whitespace-pre-line">{docData.terms}</div>
                </div>
              )}

              {/* Authorized Signatory */}
              <div className="flex justify-between items-end mt-8 pt-4 border-t border-black text-[10px]">
                <div>
                  <p className="text-slate-600">This estimate is valid for 30 days from issue.</p>
                </div>
                <div className="text-right">
                  <p className="font-bold">For {brandingProfile?.companyName || BRAND_CONFIG.displayName}</p>
                  <div className="h-12" />
                  <p className="border-t border-black pt-1 inline-block font-bold">Authorized Signatory</p>
                </div>
              </div>
            </div>
          )}

          {/* STATEMENT OF ACCOUNT TEMPLATE */}
          {isStatement && (
            <div
              className={`w-full ${paperSize === 'A5' ? 'max-w-[559px] paper-a5 text-[9.5px]' : 'max-w-[794px] paper-a4 text-[11px]'} bg-white text-black p-6 border-2 border-black shadow-2xl print:border-black print:shadow-none print:m-0`}
            >
              <div className="border-b-2 border-black pb-3 mb-4 flex justify-between items-start">
                <div>
                  {(brandingProfile?.documentLogoUrl || brandingProfile?.logoUrl || BRAND_CONFIG.logoUrl) && (
                    <img
                      src={brandingProfile?.documentLogoUrl || brandingProfile?.logoUrl || BRAND_CONFIG.logoUrl}
                      alt="Company Logo"
                      className="max-h-10 max-w-[160px] object-contain mb-2 inline-block"
                    />
                  )}
                  <h2 className="text-base font-black uppercase text-black">
                    {brandingProfile?.companyName || BRAND_CONFIG.displayName}
                  </h2>
                  <p className="text-[10px] text-black">{brandingProfile?.address || ''}</p>
                  <p className="text-[10px] text-black">GSTIN: {brandingProfile?.gstin || 'Unregistered'}</p>
                </div>
                <div className="text-right">
                  <h1 className="text-lg font-black tracking-wide text-black uppercase">STATEMENT OF ACCOUNT</h1>
                  <p className="font-bold text-xs mt-1 text-black">
                    FY: {docData.financialYear || searchParams.get('fy') || '2026-27'}
                  </p>
                  <p className="text-[10px] text-black">
                    Period: {docData.fromDate || '—'} to {docData.toDate || '—'}
                  </p>
                </div>
              </div>

              {/* Party Information */}
              <div className="border border-black p-3 mb-4 bg-gray-50 text-black">
                <span className="font-bold text-[10px] uppercase text-black">Account Of:</span>
                <p className="font-bold text-sm text-black">{docData.party?.partyName || docData.party?.name || 'Party'}</p>
                <p className="text-[10px] text-black">GSTIN: {docData.party?.gstin || 'Unregistered'}</p>
                <p className="text-[10px] text-black">Phone: {docData.party?.phone || '—'} | Email: {docData.party?.email || '—'}</p>
              </div>

              {/* Opening Balance Row */}
              <div className="flex justify-between items-center border border-black p-2 mb-2 bg-gray-100 text-black font-bold text-xs">
                <span>Opening Balance ({docData.fromDate || ''})</span>
                <span>₹{Number(docData.openingBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} {docData.openingSide || 'Dr'}</span>
              </div>

              {/* Transactions Table */}
              <table className="w-full border-collapse border border-black mb-4 text-black">
                <thead>
                  <tr className="bg-gray-100 text-black border-b border-black">
                    <th className="border border-black p-1.5 text-left text-[10px] w-20">Date</th>
                    <th className="border border-black p-1.5 text-left text-[10px] w-28">Ref No</th>
                    <th className="border border-black p-1.5 text-left text-[10px]">Particulars</th>
                    <th className="border border-black p-1.5 text-right text-[10px] w-24">Debit (₹)</th>
                    <th className="border border-black p-1.5 text-right text-[10px] w-24">Credit (₹)</th>
                    <th className="border border-black p-1.5 text-right text-[10px] w-28">Balance (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {(docData.entries || []).map((entry: any, idx: number) => (
                    <tr key={idx} className="border-b border-black">
                      <td className="border border-black p-1.5 text-left text-[10px]">{entry.date}</td>
                      <td className="border border-black p-1.5 text-left font-mono text-[10px]">{entry.referenceNo || entry.refNumber || '—'}</td>
                      <td className="border border-black p-1.5 text-left text-[10px]">{entry.description || entry.particulars || 'Transaction'}</td>
                      <td className="border border-black p-1.5 text-right text-[10px]">
                        {Number(entry.debit || 0) > 0 ? Number(entry.debit).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}
                      </td>
                      <td className="border border-black p-1.5 text-right text-[10px]">
                        {Number(entry.credit || 0) > 0 ? Number(entry.credit).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}
                      </td>
                      <td className="border border-black p-1.5 text-right font-bold text-[10px]">
                        ₹{Number(entry.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} {entry.balanceSide || ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals & Closing Balance */}
              <div className="border border-black p-3 mb-4 bg-gray-50 text-black flex justify-between items-center text-xs font-bold">
                <div>
                  <span>Total Debit: ₹{Number(docData.totals?.totalDebit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  <span className="mx-3">|</span>
                  <span>Total Credit: ₹{Number(docData.totals?.totalCredit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="text-right">
                  <span>Closing Balance: ₹{Number(docData.closingBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} {docData.closingSide || 'Dr'}</span>
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-between items-end mt-8 pt-4 border-t border-black text-[10px]">
                <div>
                  <p className="text-slate-600">This is a system generated statement of accounts.</p>
                </div>
                <div className="text-right">
                  <p className="font-bold">For {brandingProfile?.companyName || BRAND_CONFIG.displayName}</p>
                  <div className="h-12" />
                  <p className="border-t border-black pt-1 inline-block font-bold">Accounts Department</p>
                </div>
              </div>
            </div>
          )}

          {/* PURCHASE BILL SOFT COPY */}
          {isPurchaseBill && (
            <div
              className={`w-full ${paperSize === 'A5' ? 'max-w-[559px] paper-a5 text-[9.5px]' : 'max-w-[794px] paper-a4 text-[11px]'} bg-white text-black p-6 border-2 border-black shadow-2xl print:border-black print:shadow-none print:m-0`}
            >
              <div className="border-b-2 border-black pb-3 mb-4 flex justify-between items-start">
                <div>
                  <h1 className="text-lg font-black tracking-wide text-black uppercase">PURCHASE BILL SOFT COPY</h1>
                  <p className="font-mono font-bold text-xs mt-1 text-black">Bill No: {docData.billNumber}</p>
                  <p className="text-[10px] text-black">Date: {docData.billDate || new Date(docData.createdAt).toLocaleDateString('en-IN')}</p>
                </div>
                <div className="text-right">
                  <span className="font-bold text-[10px] uppercase text-black">Recorded For:</span>
                  <h2 className="text-sm font-black uppercase text-black">
                    {brandingProfile?.companyName || BRAND_CONFIG.displayName}
                  </h2>
                  <p className="text-[10px] text-black">GSTIN: {brandingProfile?.gstin || 'Unregistered'}</p>
                </div>
              </div>

              {/* Vendor Information */}
              <div className="border border-black p-3 mb-4 bg-gray-50 text-black">
                <span className="font-bold text-[10px] uppercase text-black">Supplier / Vendor:</span>
                <p className="font-bold text-sm text-black">{docData.supplier?.name || docData.supplierName || 'Vendor'}</p>
                <p className="text-[10px] text-black">GSTIN: {docData.supplier?.gstin || docData.supplierGstin || 'Unregistered'}</p>
                <p className="text-[10px] text-black">State: {docData.supplier?.state || '—'}</p>
              </div>

              {/* Line Items Table */}
              <table className="w-full border-collapse border border-black mb-4 text-black">
                <thead>
                  <tr className="bg-gray-100 text-black border-b border-black">
                    <th className="border border-black p-1.5 text-center w-8 text-[10px]">#</th>
                    <th className="border border-black p-1.5 text-left text-[10px]">Item Description</th>
                    <th className="border border-black p-1.5 text-right w-14 text-[10px]">Qty</th>
                    <th className="border border-black p-1.5 text-right w-24 text-[10px]">Unit Price (₹)</th>
                    <th className="border border-black p-1.5 text-right w-24 text-[10px]">Total (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {(docData.items || []).map((item: any, idx: number) => (
                    <tr key={idx} className="border-b border-black">
                      <td className="border border-black p-1.5 text-center text-[10px]">{idx + 1}</td>
                      <td className="border border-black p-1.5 text-left text-[10px]">
                        <strong>{item.sku?.skuCode || item.skuCode || ''}</strong> {item.name || item.sku?.name || 'Item'}
                      </td>
                      <td className="border border-black p-1.5 text-right text-[10px]">{item.quantity}</td>
                      <td className="border border-black p-1.5 text-right text-[10px]">
                        {Number(item.unitCost || item.unitPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="border border-black p-1.5 text-right font-bold text-[10px]">
                        {Number(item.totalCost || item.totalPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div className="w-72 ml-auto mb-4 border border-black p-2 text-black">
                <div className="flex justify-between py-0.5 text-[10px]">
                  <span>Taxable Value:</span>
                  <span>₹{Number(docData.taxableAmount || docData.subtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-0.5 text-[10px]">
                  <span>GST Amount:</span>
                  <span>₹{Number(docData.gstAmount || docData.taxAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-1 font-bold border-t border-black text-xs">
                  <span>Grand Total:</span>
                  <span>₹{Number(docData.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              {/* Amount in words */}
              <div className="border border-black p-2 mb-4 text-[10px] bg-gray-50 text-black">
                <strong>Amount in Words: </strong>
                <span>INR {numberToIndianWords(Number(docData.totalAmount || 0))}</span>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
