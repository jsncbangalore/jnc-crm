/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Invoice, CompanyInvoiceProfile, SignatorySettings, DocumentType } from '../../types';
import { BRAND_CONFIG } from '../../config/brand';
import { resolveFileUrl } from '../../services/api';
import { format } from 'date-fns';

export interface InvoiceDocumentTemplateProps {
  invoice: Invoice;
  profile?: CompanyInvoiceProfile | null;
  signatoryConfig?: SignatorySettings | null;
  activeTemplate: DocumentType;
  invoiceLogo?: string;
  copyLabel?: string;
  showLogoNotice?: boolean;
  onLogoNoticeClick?: () => void;
  // Print configuration toggles (all default to true)
  includeHeader?: boolean;
  includeDeliveryAddress?: boolean;
  includeBankDetails?: boolean;
  includeTerms?: boolean;
  includeSignatory?: boolean;
}

// ─── Indian Currency Number to Words Converter ─────────────────────────────
export function numberToIndianWords(amount: number): string {
  const num = Number(amount);
  if (!num || isNaN(num)) return 'Zero Only';

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

  const integerPart = Math.floor(Math.abs(num));
  const decimalPart = Math.round((Math.abs(num) - integerPart) * 100);

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

export const formatDateDMY = (dateStr?: string) => {
  if (!dateStr) return '-';
  try {
    return format(new Date(dateStr), 'dd-MM-yyyy');
  } catch {
    return dateStr;
  }
};

export default function InvoiceDocumentTemplate({
  invoice,
  profile,
  signatoryConfig,
  activeTemplate,
  invoiceLogo,
  copyLabel,
  showLogoNotice = true,
  onLogoNoticeClick,
  includeHeader = true,
  includeDeliveryAddress = true,
  includeBankDetails = true,
  includeTerms = true,
  includeSignatory = true,
}: InvoiceDocumentTemplateProps) {
  const isCreditNote = activeTemplate === 'credit_note';
  const isPO = activeTemplate === 'purchase_order';
  const isDC = activeTemplate === 'delivery_challan';
  const isProforma = activeTemplate === 'proforma_invoice';
  const isSEZ = (activeTemplate === 'sez_invoice' || !!invoice.isSez) && !isCreditNote && !isPO && !isDC && !isProforma;

  const isInterState =
    invoice.customerState?.toLowerCase() !== 'karnataka' &&
    invoice.customerState?.toLowerCase() !== 'ka' &&
    invoice.customerState?.toLowerCase() !== '29';

  const effectiveSignatory = signatoryConfig || invoice.signatorySettings;
  const effectiveCompanyName = effectiveSignatory?.companyName || profile?.companyName || BRAND_CONFIG.displayName;

  // Resolve document logo
  const resolvedLogo =
    invoiceLogo && typeof invoiceLogo === 'string' && invoiceLogo.trim() !== ''
      ? resolveFileUrl(invoiceLogo)
      : profile?.logoUrl && typeof profile.logoUrl === 'string' && profile.logoUrl.trim() !== ''
      ? resolveFileUrl(profile.logoUrl)
      : '';

  const [logoFailed, setLogoFailed] = React.useState(false);

  const lines = invoice.lines || [];
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
  const advancePercent = invoice.advancePercent || 50;
  const advanceAmount = invoice.advanceAmount || Number(((effectiveTotal * advancePercent) / 100).toFixed(2));

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

  // Distinct HSN codes list for SEZ table
  const distinctHsns = lines
    .map((l) => l.hsnCode || '85312000')
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(', ');

  const theoreticalIgst = Number((((effectiveSubtotal || 0) * 18) / 100).toFixed(2));

  const docTitle = isDC
    ? 'DELIVERY CHALLAN'
    : isProforma
    ? 'PROFORMA INVOICE'
    : isCreditNote
    ? 'CREDIT NOTE'
    : isPO
    ? 'PURCHASE ORDER'
    : isSEZ
    ? 'TAX INVOICE'
    : 'TAX INVOICE';

  const defaultCopyLabel = isDC
    ? 'CONSIGNEE COPY'
    : isProforma
    ? 'OFFICIAL COPY'
    : isCreditNote
    ? 'ORIGINAL FOR RECIPIENT'
    : isPO
    ? 'VENDOR COPY'
    : isSEZ
    ? 'ORIGINAL FOR RECIPIENT'
    : 'ORIGINAL FOR RECIPIENT';

  const effectiveCopyLabel = copyLabel || defaultCopyLabel;

  // ─── PURCHASE ORDER (PO) TEMPLATE ─────────────────────────────────────────
  if (isPO) {
    return (
      <div id="printable-tax-invoice" className="w-full max-w-[794px] mx-auto bg-white text-black font-sans text-[11px] leading-[1.3] shadow-2xl box-border border-2 border-black print:border-black print:shadow-none print:max-w-none print:w-[210mm] p-6 flex flex-col justify-between min-h-[1050px]">
        <div>
          {/* Top Company Header with Logo & Details */}
          <div className="text-center space-y-1 pb-2 border-b border-black">
            {resolvedLogo && !logoFailed ? (
              <div className="flex justify-center mb-1">
                <img
                  src={resolvedLogo}
                  alt={effectiveCompanyName}
                  className="h-10 object-contain"
                  onError={() => setLogoFailed(true)}
                />
              </div>
            ) : showLogoNotice ? (
              <div className="flex justify-center mb-1.5 print:hidden" data-testid="logo-not-added-badge">
                <button
                  type="button"
                  onClick={onLogoNoticeClick}
                  className="p-1.5 max-w-sm rounded bg-amber-50 border border-amber-300 text-[10px] text-amber-900 font-medium hover:bg-amber-100 transition-colors cursor-pointer text-center"
                  title="Configure Document Logo in Company Branding Settings"
                >
                  <div className="flex items-center justify-center gap-1.5 font-bold text-amber-800 text-[10.5px]">
                    <AlertCircle size={12} className="text-amber-600 shrink-0" />
                    <span>Document Logo Not Added</span>
                  </div>
                  <p className="text-[9.5px] text-amber-700 mt-0.5 leading-tight">
                    No official document logo configured. You can proceed with viewing/printing.
                  </p>
                </button>
              </div>
            ) : null}
            <h2 className="text-sm font-bold text-black uppercase tracking-wider">
              {effectiveCompanyName}
            </h2>
            <p className="text-[10px] text-black">
              Address :{profile?.addressLine1 || profile?.address || ''} {profile?.addressLine2 || ''} {profile?.city || ''} {profile?.pincode || ''}.
            </p>
            <p className="text-[10px] text-black">
              Contact No: {profile?.phone || ''}{profile?.email ? `, E-mail: ${profile.email}` : ''}
            </p>
          </div>

          {/* Title Bar */}
          <div className="relative text-center font-bold text-xs py-1 border-b border-black bg-gray-50 uppercase tracking-wide text-black">
            <span>Purchase Order</span>
            <span className="absolute right-3 top-1 text-[9.5px] font-semibold text-black uppercase tracking-wider bg-white px-2 py-0.5 rounded border border-black/40">
              {effectiveCopyLabel}
            </span>
          </div>

          {/* Vendor TO & PO Metadata Grid */}
          <div className="grid grid-cols-2 border-b border-black divide-x divide-black text-[10.5px]">
            <div className="p-2 space-y-0.5">
              <p className="font-bold text-black">TO</p>
              <p className="font-bold text-xs text-black">{invoice.customerName || 'Vendor Name'}</p>
              {invoice.billingAddress && (
                <p className="text-black text-[10px]">{invoice.billingAddress}</p>
              )}
              {invoice.customerGstin && (
                <p className="font-bold text-[10px] text-black">GSTIN: {invoice.customerGstin}</p>
              )}
            </div>
            <div className="p-2 space-y-1 text-right">
              <p className="font-bold text-black">Date :- <span className="font-normal">{formatDateDMY(invoice.invoiceDate)}</span></p>
              <p className="font-bold text-black">PO-No :- <span className="font-mono font-bold">{invoice.invoiceNumber}</span></p>
            </div>
          </div>

          {/* PO Items Table */}
          <table className="w-full text-[10.5px] border-collapse border-b border-black">
            <thead>
              <tr className="border-b border-black font-bold text-center bg-gray-50">
                <th className="py-1 px-1 border-r border-black w-8">Sl.No</th>
                <th className="py-1 px-2 border-r border-black text-left">Description</th>
                <th className="py-1 px-2 border-r border-black w-16">HSN/SAC</th>
                <th className="py-1 px-2 border-r border-black w-14">QTY</th>
                <th className="py-1 px-2 border-r border-black w-16 text-right">Rate</th>
                <th className="py-1 px-3 w-24 text-right">Amount (INR)</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={line.id || idx} className="border-b border-black/30 align-top">
                  <td className="py-1 px-1 text-center border-r border-black">{idx + 1}</td>
                  <td className="py-1 px-2 border-r border-black font-medium">{line.description}</td>
                  <td className="py-1 px-2 text-center font-mono border-r border-black">{line.hsnCode || '8504'}</td>
                  <td className="py-1 px-2 text-center border-r border-black font-semibold">{line.quantity} {line.unit || 'Nos'}</td>
                  <td className="py-1 px-2 text-right font-mono border-r border-black">
                    {Number(line.unitPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-1 px-3 text-right font-mono font-semibold">
                    {((line.quantity || 0) * (line.unitPrice || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-black font-bold">
                <td colSpan={5} className="py-1 px-3 text-right border-r border-black text-black">
                  Total
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

          {/* PO Amount in Words */}
          <div className="p-1.5 px-3 border-b border-black font-bold text-[10.5px] bg-white text-black">
            In Words :- <span className="font-semibold">{numberToIndianWords(effectiveTotal || (effectiveSubtotal + Math.round((effectiveSubtotal * 18) / 100)))}</span>
          </div>

          {/* Terms and Conditions */}
          {includeTerms && (
            <div className="p-3 text-[10px] space-y-1.5">
              <p className="font-bold underline text-black">Terms and Conditions</p>
              <div className="space-y-1 text-black">
                <p><strong className="font-bold">1. Delivery Address : </strong>{invoice.deliveryAddress || ''}</p>
                <p><strong className="font-bold">2. Delivery schedule : </strong>{invoice.deliverySchedule || 'As agreed'}</p>
                <p><strong className="font-bold">3. Billing Address : </strong>{invoice.billingAddress || effectiveCompanyName}</p>
                <p><strong className="font-bold">4. Payment : </strong>{invoice.paymentTerms || 'Advance'}</p>
                <p><strong className="font-bold">5. GST : </strong>{profile?.gstin || ''}</p>
                <p><strong className="font-bold">6. Place of Supply : </strong>{invoice.placeOfSupply || invoice.customerState || profile?.state || 'Karnataka'}</p>
              </div>
            </div>
          )}
        </div>

        {/* PO Signatory Footer */}
        {includeSignatory && (
          <div className="pt-6 flex justify-between items-end">
            <div>
              {resolvedLogo && !logoFailed ? (
                <img
                  src={resolvedLogo}
                  alt={effectiveCompanyName}
                  style={{ maxHeight: '30px', maxWidth: '140px', width: 'auto', height: 'auto', objectFit: 'contain' }}
                  className="h-6 object-contain opacity-80"
                  onError={() => setLogoFailed(true)}
                />
              ) : null}
            </div>
            <div className="text-right space-y-8">
              <p className="font-bold text-[10.5px] text-black">For {effectiveCompanyName}</p>
              <p className="font-bold text-[10px] text-black">Authorised Signatory</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── STANDARD GST / DELIVERY CHALLAN / SEZ / PROFORMA / CREDIT NOTE ──────
  return (
    <div
      id="printable-tax-invoice"
      className="w-full max-w-[794px] mx-auto bg-white text-black font-sans text-[11px] leading-[1.25] shadow-2xl box-border border-2 border-black min-h-[1050px] flex flex-col justify-between print:border-black print:shadow-none print:max-w-none print:w-[210mm] print:min-h-0 print:h-auto select-none"
    >
      <div>
        {/* ── 1. TOP DOCUMENT TITLE & STATUTORY COPY BADGE ───────────────── */}
        <div className="relative text-center font-bold text-sm tracking-wide py-1.5 border-b border-black bg-white text-black">
          <span>{docTitle}</span>
          <span className="absolute right-3 top-1 text-[10px] font-semibold text-black uppercase tracking-wider bg-gray-100 px-2 py-0.5 rounded border border-black">
            {effectiveCopyLabel}
          </span>
        </div>

        {/* ── 2. SEZ STATUTORY UNDERTAKING SUBTITLE ──────────────────────── */}
        {isSEZ && (
          <div className="text-center font-normal text-[9.5px] py-0.5 px-2 border-b border-black bg-gray-50 italic leading-tight text-black">
            (Supply meant for export/Supply to SEZ unit or SEZ developer for authorised operations under bond or letter of undertaking without payment of IGST)
          </div>
        )}

        {/* ── 3. COMPANY HEADER & INVOICE METADATA TABLE ─────────────────── */}
        {includeHeader ? (
          <table className="w-full border-collapse border-b border-black bg-white text-black">
            <tbody>
              <tr>
                {/* Left Half (50%): Company Details + Logo */}
                <td className="w-1/2 p-2 align-top border-r border-black space-y-0.5 text-[10.5px]">
                  {/* Brand Logo */}
                  {resolvedLogo && !logoFailed ? (
                    <div className="mb-1 flex items-center">
                      <img
                        src={resolvedLogo}
                        alt={effectiveCompanyName}
                        style={{ maxHeight: '38px', maxWidth: '150px', width: 'auto', height: 'auto', objectFit: 'contain', display: 'block' }}
                        className="h-8 sm:h-9 object-contain"
                        onError={() => setLogoFailed(true)}
                      />
                    </div>
                  ) : showLogoNotice ? (
                    <div className="mb-1.5 print:hidden" data-testid="logo-not-added-badge">
                      <button
                        type="button"
                        onClick={onLogoNoticeClick}
                        className="w-full text-left p-1.5 rounded bg-amber-50 border border-amber-300 text-[10px] text-amber-900 font-medium hover:bg-amber-100 transition-colors cursor-pointer block"
                        title="Configure Document Logo in Company Branding Settings"
                      >
                        <div className="flex items-center gap-1.5 font-bold text-amber-800 text-[10.5px]">
                          <AlertCircle size={12} className="text-amber-600 shrink-0" />
                          <span>Document Logo Not Added</span>
                        </div>
                        <p className="text-[9.5px] text-amber-700 mt-0.5 leading-tight">
                          No official document logo configured. You can proceed with viewing/printing.
                        </p>
                      </button>
                    </div>
                  ) : null}

                  <p className="font-bold text-xs text-black leading-tight">{effectiveCompanyName}</p>
                  <p className="text-black font-medium leading-tight">{profile?.addressLine1 || profile?.address || ''}</p>
                  <p className="text-black font-medium leading-tight">{profile ? `${profile.addressLine2 || ''} ${profile.city || ''} ${profile.pincode || ''}`.trim() : ''}</p>
                  <p className="font-bold text-black leading-tight">GST IN : {profile?.gstin || ''}.</p>
                  <p className="text-black font-medium leading-tight">MSME UDYAM Reg No: {profile?.msmeUdyamNo || ''}.</p>
                  <p className="text-black font-medium leading-tight">State Name : {profile?.state || ''}, Code - {profile?.stateCode || ''}</p>
                  <p className="text-black font-medium leading-tight">Email : {profile?.email || ''}</p>
                </td>

                {/* Right Half (50%): Invoice / DC Metadata Table */}
                <td className="w-1/2 p-0 align-top text-[10.5px]">
                  <table className="w-full h-full border-collapse">
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
                          <p className="font-bold text-black">Mode/ Terms of Payment:</p>
                          <p className="font-semibold text-black">{invoice.paymentTerms || (isDC ? 'Immediately' : 'Advance')}</p>
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
                            <p className="font-bold text-black">LUT/Bond No : <span className="font-mono font-bold text-black">{invoice.lutBondNo || (isSEZ ? (profile?.lutBondNo || '') : '')}</span></p>
                            {isSEZ && <p className="text-black font-semibold">{invoice.lutValidity || profile?.lutValidity || ''}</p>}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          <div className="p-3 border-b border-black text-center text-xs font-semibold text-slate-400 bg-gray-50 italic">
            [Header & Logo Space Omitted for Pre-Printed Stationery]
          </div>
        )}

        {/* ── 4. BILLING & DELIVERY ADDRESS BOX (PERFECT 50% - 50% SPLIT) ─── */}
        <table className="w-full border-collapse border-b border-black bg-white text-black">
          <tbody>
            <tr>
              {/* Billing Address (Left 50%) */}
              <td className="w-1/2 p-2 align-top border-r border-black space-y-0.5 text-[10.5px]">
                <p className="font-bold text-[11px] text-black">Billing Address :</p>
                <p className="font-bold text-xs text-black">{invoice.customerName}</p>
                <p className="text-black font-medium leading-tight">{invoice.billingAddress || `${invoice.customerState || 'Karnataka'}, India`}</p>
                {(
                  <p className="font-bold text-[10.5px] pt-0.5 text-black">
                    GST No: {invoice.customerGstin || (invoice.company?.gstin ? invoice.company.gstin : '-')}
                  </p>
                )}
                <p className="font-medium text-[10px] text-black">
                  Place of Supply: {invoice.placeOfSupply || invoice.customerState || profile?.state || 'Karnataka'}
                </p>
              </td>

              {/* Delivery Address (Right 50%) */}
              <td className="w-1/2 p-2 align-top space-y-0.5 text-[10.5px]">
                {includeDeliveryAddress ? (
                  <>
                    <p className="font-bold text-[11px] text-black">Delivery Address :</p>
                    <p className="font-bold text-xs text-black">{invoice.customerName}</p>
                    <p className="text-black font-medium leading-tight">{invoice.deliveryAddress || invoice.billingAddress || `${invoice.customerState || 'Karnataka'}, India`}</p>
                  </>
                ) : (
                  <p className="text-gray-400 italic text-[10px]">Delivery address hidden</p>
                )}
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── 5. ITEMS TABLE WITH SEAMLESS CONTINUOUS 50% VERTICAL LINE ─── */}
        <div className="relative bg-white text-black">
          <table className="w-full text-[11px] table-fixed border-collapse border-b border-black bg-white">
            <thead>
              <tr className="border-b border-black font-bold text-center bg-gray-100 print:bg-transparent">
                <th className="py-2 px-2 w-[5.5%] border-r border-black font-bold text-black">Sl No</th>
                <th className="py-2 px-3 text-left w-[44.5%] border-r border-black font-bold text-black">Description of Goods</th>
                {!isDC ? (
                  <>
                    <th className="py-2 px-2 w-[11%] border-r border-black font-bold text-black">HSN/ SAC</th>
                    <th className="py-2 px-2 w-[6.5%] border-r border-black font-bold text-black">Unit</th>
                    <th className="py-2 px-2 w-[11%] text-right border-r border-black font-bold text-black">Unit Rate</th>
                    <th className="py-2 px-2 w-[6.5%] border-r border-black font-bold text-black">Qty</th>
                    <th className="py-2 px-3 w-[15%] text-right font-bold text-black">Amount</th>
                  </>
                ) : (
                  <>
                    <th className="py-2 px-2 w-[15%] border-r border-black font-bold text-black">UNIT</th>
                    <th className="py-2 px-2 w-[15%] border-r border-black font-bold text-black">Qty</th>
                    <th className="py-2 px-3 w-[20%] text-right font-bold text-black">Remarks/Rate</th>
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
                      {isDC && (
                        <div className="text-[9.5px] text-black font-mono">HSN/SAC: {line.hsnCode || '8504'}</div>
                      )}
                    </td>
                    {!isDC && (
                      <td className="py-2 px-2 text-center border-r border-black font-mono text-black">
                        {line.hsnCode || (idx === lines.length - 1 && line.description?.toLowerCase().includes('transport') ? '9965' : '8504')}
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
                      {lineTaxable.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}

              {/* Proportional Spacer Row: seamlessly connects vertical borders */}
              <tr style={{ height: `${Math.max(60, 240 - lines.length * 22)}px` }} className="bg-white print:h-[180px]">
                <td className="border-r border-black"></td>
                <td className="border-r border-black"></td>
                {!isDC && <td className="border-r border-black"></td>}
                <td className="border-r border-black"></td>
                {!isDC && <td className="border-r border-black"></td>}
                <td className="border-r border-black"></td>
                <td></td>
              </tr>

              {/* ── DELIVERY CHALLAN TOTAL QUANTITY ROW ─────────────────── */}
              {isDC ? (
                <tr className="border-t border-black font-bold text-[11px] bg-gray-50 print:bg-transparent">
                  {/* Exactly covers Sl No (5.5%) + Description (44.5%) = 50.0% */}
                  <td colSpan={2} className="py-2 px-3 text-right font-bold border-r border-black text-black">
                    Total Quantity:
                  </td>
                  <td className="py-2 px-2 text-center border-r border-black font-mono text-black">
                    -
                  </td>
                  <td className="py-2 px-2 text-center font-mono font-bold border-r border-black text-black">
                    {totalQty}
                  </td>
                  <td className="py-2 px-2 text-center font-mono text-black">
                    -
                  </td>
                </tr>
              ) : (
                /* ── TAX INVOICE / PROFORMA / SEZ FINANCIAL TOTALS ───────── */
                <>
                  {/* Sub Total Taxable Row */}
                  <tr className="border-t border-black bg-white">
                    {/* Left half (50%): Sl No (5.5%) + Description (44.5%) */}
                    <td colSpan={2} rowSpan={totalsRowCount} className="border-r border-black bg-white align-top p-2" />
                    <td colSpan={3} className="py-1 px-3 text-right font-bold border-r border-black text-black">
                      Sub Total
                    </td>
                    <td className="py-1 px-2 text-center font-mono font-semibold border-r border-black text-black">
                      {totalQty}
                    </td>
                    <td className="py-1 px-2 text-right font-mono font-bold text-black">
                      {(effectiveSubtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* GST Tax Breakdown */}
                  {isSEZ ? (
                    <tr className="bg-white">
                      <td colSpan={4} className="py-1 px-3 text-right font-bold border-t border-r border-black italic text-[10px] text-black">
                        Nill - IGST 18% Tax by LUT
                      </td>
                      <td className="py-1 px-2 text-right font-mono font-bold border-t border-black text-black">
                        -
                      </td>
                    </tr>
                  ) : isInterState ? (
                    <tr className="bg-white">
                      <td colSpan={4} className="py-1 px-3 text-right font-bold border-t border-r border-black text-black">
                        IGST 18%
                      </td>
                      <td className="py-1 px-2 text-right font-mono font-bold border-t border-black text-black">
                        {(invoice.igstAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ) : (
                    <>
                      <tr className="bg-white">
                        <td colSpan={4} className="py-0.5 px-3 text-right font-bold border-t border-r border-black text-black">
                          CGST 9%
                        </td>
                        <td className="py-0.5 px-2 text-right font-mono font-bold border-t border-black text-black">
                          {(invoice.cgstAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                      <tr className="bg-white">
                        <td colSpan={4} className="py-0.5 px-3 text-right font-bold border-t border-r border-black text-black">
                          SGST 9%
                        </td>
                        <td className="py-0.5 px-2 text-right font-mono font-bold border-t border-black text-black">
                          {(invoice.sgstAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </>
                  )}

                  {/* Proforma Advance Breakdown */}
                  {isProforma && (
                    <>
                      <tr className="bg-emerald-50">
                        <td colSpan={4} className="py-1 px-3 text-right font-bold border-t border-r border-black text-emerald-900">
                          Advance {advancePercent}% with PO
                        </td>
                        <td className="py-1 px-2 text-right font-mono font-bold border-t border-black text-emerald-900">
                          {advanceAmount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                      <tr className="bg-white">
                        <td colSpan={4} className="py-0.5 px-3 text-right font-bold border-t border-r border-black text-slate-700 italic text-[10px]">
                          Balance {100 - advancePercent}% on Dispatch / Delivery
                        </td>
                        <td className="py-0.5 px-2 text-right font-mono font-semibold border-t border-black text-slate-700">
                          {(effectiveTotal - advanceAmount).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </>
                  )}

                  {/* Round off row */}
                  <tr className="bg-white">
                    <td colSpan={4} className="py-0.5 px-3 text-right font-bold border-t border-r border-black text-black">
                      Round off
                    </td>
                    <td className="py-0.5 px-2 text-right font-mono font-bold border-t border-black text-black">
                      {(invoice.roundOff !== undefined && invoice.roundOff !== 0 ? (invoice.roundOff > 0 ? `+${invoice.roundOff.toFixed(2)}` : invoice.roundOff.toFixed(2)) : '-')}
                    </td>
                  </tr>

                  {/* Grand Total Row */}
                  <tr className="font-bold text-xs bg-gray-100 print:bg-transparent">
                    <td colSpan={3} className="py-1.5 px-3 text-right border-t border-r border-black font-bold text-black">
                      Total
                    </td>
                    <td className="py-1.5 px-2 text-center font-mono font-bold border-t border-r border-black text-black">
                      {totalQty}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono font-black text-xs text-black border-t border-black">
                      {Math.round(effectiveTotal).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* Advance Adjusted for Final Tax Invoice */}
                  {hasAdvanceAdjusted && (
                    <>
                      <tr className="bg-emerald-50/50">
                        <td colSpan={4} className="py-1 px-3 text-right font-bold border-t border-r border-black text-emerald-900">
                          Less: Advance Received {invoice.transactionRef ? `(${invoice.transactionRef})` : ''}
                        </td>
                        <td className="py-1 px-2 text-right font-mono font-bold border-t border-black text-emerald-900">
                          - {(invoice.advanceAdjusted || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                      <tr className="font-bold text-xs bg-emerald-100/70 print:bg-transparent">
                        <td colSpan={4} className="py-1.5 px-3 text-right border-t border-r border-black font-bold text-black">
                          Net Balance Payable / Due
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono font-black text-xs text-black border-t border-black">
                          {(invoice.balanceDue ?? Math.max(0, effectiveTotal - (invoice.advanceAdjusted || 0))).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* ── 6. AMOUNT IN WORDS ROW ─────────────────────────────────────── */}
        {(true) && (
          <div className="p-1.5 px-2 border-b border-black font-bold text-[10.5px] bg-white text-black">
            In Words :- <span className="font-semibold">{amountInWords}</span>
          </div>
        )}

        {/* ── 7. SEZ STATUTORY HSN/SAC SUMMARY TABLE ─────────────────────── */}
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

        {/* ── 8. BOTTOM DECLARATION & BANK DETAILS / SIGNATORY GRID ──────── */}
        <table className="w-full border-collapse bg-white text-black text-[10px]">
          <tbody>
            <tr>
              {/* Left Half (50%): Statutory Declaration */}
              <td className="w-1/2 p-2 align-top border-r border-black space-y-0.5 bg-white text-black">
                {includeTerms ? (
                  <>
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
                        <li>Supply made to SEZ unit for authorized operations under LUT No. <strong>{invoice.lutBondNo || profile?.lutBondNo || ''}</strong> without payment of IGST.</li>
                        <li>Goods once sold will not be exchanged or taken back.</li>
                        <li>Payment should be made strictly as per agreed terms. Subject to {profile?.city || 'Local'} Jurisdiction.</li>
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
                  </>
                ) : (
                  <p className="text-gray-400 italic text-[10px]">[Declaration omitted per print settings]</p>
                )}
              </td>

              {/* Right Half (50%): Bank Details / Consignee Stamp & Signatory */}
              <td className="w-1/2 p-0 align-top bg-white text-black">
                <table className="w-full h-full border-collapse">
                  <tbody>
                    {/* Bank Details or Consignee Acknowledgment */}
                    <tr>
                      <td className="p-2 border-b border-black space-y-0.5 text-[10px]">
                        {!isDC ? (
                          includeBankDetails ? (
                            <>
                              <p className="font-bold text-[10.5px] text-black">Company's Bank Details</p>
                              <p><span className="font-medium">A/C Holder's Name : </span><strong>{profile?.bankDetails?.accountHolderName || effectiveCompanyName}</strong></p>
                              <p><span className="font-medium">Bank Name : </span><strong>{profile?.bankDetails?.bankName || ''}</strong></p>
                              <p><span className="font-medium">A/c No : </span><strong className="font-mono">{profile?.bankDetails?.accountNumber || ''}</strong></p>
                              <p><span className="font-medium">Branch & IFS Code : </span><strong>{profile?.bankDetails?.branch || ''} {profile?.bankDetails?.ifscCode ? `& ${profile.bankDetails.ifscCode}` : ''}</strong></p>
                            </>
                          ) : (
                            <p className="text-gray-400 italic text-[10px]">[Bank details omitted]</p>
                          )
                        ) : (
                          <div className="bg-gray-50 p-1.5 rounded space-y-0.5">
                            <p className="font-bold text-[10.5px] text-black">Consignee Acknowledgment & Stamp</p>
                            <p className="text-[9.5px] text-black font-medium">Received the above goods in sound condition & correct quantity.</p>
                            <div className="pt-3 flex justify-between items-end text-[9.5px] text-black font-medium">
                              <span>Receiver's Sign & Date</span>
                              <span className="font-mono text-black font-bold">Official Company Seal</span>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* Authorized Signatory Area */}
                    <tr>
                      <td className="p-2 text-right flex-1 min-h-[75px] bg-white text-black">
                        {includeSignatory ? (
                          <>
                            <p className="font-bold text-[10.5px] text-black">FOR {effectiveCompanyName}</p>

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

                            <p className="text-[10px] font-bold text-black">
                              Authorised Signatory
                            </p>
                          </>
                        ) : (
                          <div className="h-10"></div>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── 9. COMPUTER GENERATED NOTICE FOOTER ─────────────────────────── */}
      <div className="text-center text-[9px] py-1 text-black font-medium bg-white border-t border-black">
        This is a Computer Generated {isDC ? 'Delivery Challan' : isProforma ? 'Proforma Invoice' : isCreditNote ? 'Credit Note' : isSEZ ? 'Tax Invoice (SEZ/LUT)' : 'Tax Invoice'}
      </div>
    </div>
  );
}
