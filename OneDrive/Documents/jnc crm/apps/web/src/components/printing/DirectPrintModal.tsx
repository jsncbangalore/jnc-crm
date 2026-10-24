/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Printer, X, Check, ShieldCheck, Download,
  Layers, Copy, Palette, Eye, ZoomIn, ZoomOut, CheckCircle2,
  Building2, Landmark, FileCheck, MapPin, Zap
} from 'lucide-react';
import { Invoice, CompanyInvoiceProfile, SignatorySettings, DocumentType } from '../../types';
import { BRAND_CONFIG } from '../../config/brand';
import { executeDirectPrint, DirectPrintOptions } from '../../utils/directPrint';
import { numberToIndianWords } from '../invoices/InvoiceModal';
import { invoicesApi } from '../../services/api';
import { format } from 'date-fns';

export type GstCopyType = 'original' | 'duplicate' | 'triplicate' | 'extra' | 'all_three';

interface DirectPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
  profile?: CompanyInvoiceProfile | null;
  signatoryConfig?: SignatorySettings | null;
  activeTemplate?: DocumentType;
  invoiceLogo?: string;
  onDownloadPdf?: () => void;
}

export default function DirectPrintModal({
  isOpen,
  onClose,
  invoice,
  profile,
  signatoryConfig,
  activeTemplate = 'tax_invoice',
  invoiceLogo = '',
  onDownloadPdf,
}: DirectPrintModalProps) {
  const [copyType, setCopyType] = useState<GstCopyType>('original');
  const [paperSize, setPaperSize] = useState<'A4' | 'A5' | '4x6'>('A4');
  const [includeHeader, setIncludeHeader] = useState(true);
  const [includeSignatory, setIncludeSignatory] = useState(true);
  const [includeBankDetails, setIncludeBankDetails] = useState(true);
  const [includeTerms, setIncludeTerms] = useState(true);
  const [includeDeliveryAddress, setIncludeDeliveryAddress] = useState(true);
  const [includeTaxSummary, setIncludeTaxSummary] = useState(true);
  const [monochrome, setMonochrome] = useState(false);
  const [copies, setCopies] = useState(1);
  const [zoomLevel, setZoomLevel] = useState<number>(0.72);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printSuccess, setPrintSuccess] = useState(false);

  // Hardware direct-to-printer state (Brother DCP-T520W)
  const [printers, setPrinters] = useState<Array<{ deviceId: string; name: string }>>([
    { deviceId: 'Brother DCP-T520W Printer', name: 'Brother DCP-T520W Printer' },
  ]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('Brother DCP-T520W Printer');
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [isSendingToHardware, setIsSendingToHardware] = useState(false);
  const [hardwareSuccessMessage, setHardwareSuccessMessage] = useState<string | null>(null);
  const [hardwareErrorMessage, setHardwareErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    setIsLoadingPrinters(true);

    invoicesApi
      .getPrinters()
      .then((res) => {
        if (!isMounted) return;
        const list = res.data?.printers || [];
        if (list.length > 0) {
          setPrinters(list);
          const brotherPrinter = list.find((p) => p.name.toLowerCase().includes('brother'));
          const defaultPrn = res.data?.defaultPrinter?.name;
          if (brotherPrinter) {
            setSelectedPrinter(brotherPrinter.name);
          } else if (defaultPrn) {
            setSelectedPrinter(defaultPrn);
          } else {
            setSelectedPrinter(list[0].name);
          }
        }
      })
      .catch((err) => {
        console.warn('Could not fetch printer list:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingPrinters(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const previewRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !invoice) return null;

  const effectiveCompanyName = signatoryConfig?.companyName || profile?.companyName || BRAND_CONFIG.displayName;
  const effectiveLogoUrl =
    invoiceLogo && !invoiceLogo.startsWith('data:') && invoiceLogo.trim() !== ''
      ? invoiceLogo
      : (profile?.logoUrl || BRAND_CONFIG.logoUrl || '');
  const effectiveAddress1 = profile?.addressLine1 || profile?.address || '';
  const effectiveAddress2 = profile ? `${profile.addressLine2 || ''} ${profile.city || ''} ${profile.pincode || ''}`.trim() : '';
  const effectiveGstin = profile?.gstin || '';
  const effectiveUdyam = profile?.msmeUdyamNo || '';
  const effectiveState = profile?.state || '';
  const effectiveStateCode = profile?.stateCode || '';
  const effectiveEmail = profile?.email || '';

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

  const formatDateDMY = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), 'dd-MM-yyyy');
    } catch {
      return dateStr;
    }
  };

  const distinctHsns = lines
    .map((l) => l.hsnCode || '85312000')
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(', ');

  const theoreticalIgst = Number((((effectiveSubtotal || 0) * 18) / 100).toFixed(2));

  // Determine copy badge text
  const getCopyLabel = (type: GstCopyType) => {
    switch (type) {
      case 'original':
        return 'Original for Recipient';
      case 'duplicate':
        return 'Duplicate for Transporter';
      case 'triplicate':
        return 'Triplicate for Supplier';
      case 'extra':
        return 'Extra / Office Copy';
      case 'all_three':
        return 'Triplicate Set (All 3 Copies)';
      default:
        return 'Original for Recipient';
    }
  };

  const docTitle = isDC
    ? 'DELIVERY CHALLAN'
    : isProforma
    ? 'PROFORMA INVOICE'
    : isCreditNote
    ? 'CREDIT NOTE'
    : isPO
    ? 'PURCHASE ORDER'
    : isSEZ
    ? 'TAX INVOICE (SEZ/LUT)'
    : 'TAX INVOICE';

  /**
   * Generates a printable HTML string for a single copy of the document
   */
  const generateSingleSheetHtml = (copyLabel: string, isBreak: boolean = false) => {
    return `
      <div class="print-sheet ${isBreak ? 'print-sheet-break' : ''}" style="margin-bottom: 20px;">
        ${/* Document Title & Copy Type Badge */ ''}
        <div class="text-center font-bold text-sm tracking-wide py-1 border-b border-black bg-white text-black" style="position: relative;">
          ${docTitle}
          <span style="position: absolute; right: 12px; top: 4px; font-size: 10px; font-weight: normal; color: #000000; text-transform: uppercase;">
            ${copyLabel}
          </span>
        </div>

        ${isSEZ ? `
          <div class="text-center font-normal text-[9.5px] py-0.5 px-2 border-b border-black bg-gray-50 italic text-black">
            (Supply meant for export/Supply to SEZ unit or SEZ developer for authorised operations under bond or letter of undertaking without payment of IGST)
          </div>
        ` : ''}

        ${includeHeader ? `
          <div class="grid grid-cols-2 border-b border-black divide-x divide-black bg-white text-black">
            <div class="p-1.5 space-y-0.5 text-[10px]">
              ${effectiveLogoUrl ? `
                <div style="margin-bottom: 3px; display: flex; align-items: center;">
                  <img src="${effectiveLogoUrl}" alt="${effectiveCompanyName}" style="max-height: 38px !important; max-width: 150px !important; width: auto !important; height: auto !important; object-fit: contain !important; display: block !important;" />
                </div>
              ` : ''}
              <p class="font-bold text-[11px] text-black leading-tight">${effectiveCompanyName}</p>
              <p class="text-black font-medium leading-tight">${effectiveAddress1}</p>
              <p class="text-black font-medium leading-tight">${effectiveAddress2}</p>
              <p class="font-bold text-black leading-tight">GST IN : ${effectiveGstin}.</p>
              <p class="text-black font-medium leading-tight">MSME UDYAM Reg No: ${effectiveUdyam}.</p>
              <p class="text-black font-medium leading-tight">State Name : ${effectiveState}, Code - ${effectiveStateCode}</p>
              <p class="text-black font-medium leading-tight">Email : ${effectiveEmail}</p>
            </div>
            <div class="text-[10px]">
              <table style="width: 100%; height: 100%; border-collapse: collapse;">
                <tbody>
                  <tr class="border-b border-black">
                    <td class="p-1.5 border-r border-black" style="width: 50%;">
                      <span class="font-bold">${isDC ? 'DC No' : isCreditNote ? 'CN No' : 'Invoice No'} : </span>
                      <span class="font-mono font-bold">${invoice.invoiceNumber}</span>
                    </td>
                    <td class="p-1.5" style="width: 50%;">
                      <span class="font-bold">Dated: </span>
                      <span class="font-bold">${formatDateDMY(invoice.invoiceDate)}</span>
                    </td>
                  </tr>
                  <tr class="border-b border-black">
                    <td class="p-1.5 border-r border-black">
                      <p class="font-bold">Reference No. & Date.</p>
                      <p class="font-semibold">${invoice.referenceNo || invoice.order?.orderNumber || '-'}</p>
                    </td>
                    <td class="p-1.5">
                      <p class="font-bold">Mode/ Terms of Payment:</p>
                      <p class="font-semibold">${invoice.paymentTerms || (isDC ? 'Immediately' : 'Advance')}</p>
                    </td>
                  </tr>
                  <tr>
                    <td class="p-1.5 border-r border-black">
                      <p class="font-bold">${isDC ? 'PO Order .' : "Buyer's Order No."}</p>
                      <p class="font-semibold">${invoice.buyerOrderNo || invoice.order?.orderNumber || '-'}</p>
                    </td>
                    <td class="p-1.5">
                      <p class="font-bold">${isDC ? 'Order-Dated:' : 'PO-Dated:'} <span class="font-semibold">${invoice.poDate ? formatDateDMY(invoice.poDate) : formatDateDMY(invoice.invoiceDate)}</span></p>
                    </td>
                  </tr>
                  ${(isSEZ || isCreditNote) ? `
                    <tr class="border-t border-black">
                      <td colspan="2" class="p-1.5 bg-gray-50">
                        <p class="font-bold">LUT/Bond No : <span class="font-mono font-bold">${invoice.lutBondNo || (isSEZ ? (profile?.lutBondNo || '') : '')}</span></p>
                        ${isSEZ ? `<p class="font-semibold">${invoice.lutValidity || profile?.lutValidity || ''}</p>` : ''}
                      </td>
                    </tr>
                  ` : ''}
                </tbody>
              </table>
            </div>
          </div>
        ` : `
          ${/* Minimal placeholder if user is printing onto pre-printed letterhead */ ''}
          <div style="height: 48px; border-bottom: 1px solid #000000; text-align: center; padding-top: 14px; font-size: 10px; color: #555; background: #fafafa;">
            [Pre-printed Company Letterhead Header Space]
          </div>
          <div class="grid grid-cols-2 border-b border-black divide-x divide-black bg-white text-black text-[10.5px]">
            <div class="p-2">
              <span class="font-bold">Invoice No : </span>
              <span class="font-mono font-bold">${invoice.invoiceNumber}</span>
            </div>
            <div class="p-2">
              <span class="font-bold">Dated: </span>
              <span class="font-bold">${formatDateDMY(invoice.invoiceDate)}</span>
            </div>
          </div>
        `}

        ${/* Billing and Delivery Address */ ''}
        <div class="grid grid-cols-2 border-b border-black divide-x divide-black bg-white text-black">
          <div class="p-2 space-y-0.5 text-[10.5px]">
            <p class="font-bold text-[11px]">Billing Address :</p>
            <p class="font-bold text-xs">${invoice.customerName}</p>
            <p class="font-medium">${invoice.billingAddress || `${invoice.customerState || 'Karnataka'}, India`}</p>
            ${!isDC ? `
              <p class="font-bold text-[10.5px] pt-0.5">
                GST No: ${invoice.customerGstin || (invoice.company?.gstin ? invoice.company.gstin : '-')}
              </p>
            ` : ''}
          </div>
          <div class="p-2 space-y-0.5 text-[10.5px]">
            ${includeDeliveryAddress ? `
              <p class="font-bold text-[11px]">Delivery Address :</p>
              <p class="font-bold text-xs">${invoice.customerName}</p>
              <p class="font-medium">${invoice.deliveryAddress || invoice.billingAddress || `${invoice.customerState || 'Karnataka'}, India`}</p>
            ` : `
              <p class="text-gray-400 italic text-[10px]">Delivery address omitted per print selection</p>
            `}
          </div>
        </div>

        ${/* Items Table */ ''}
        <div class="bg-white text-black">
          <table style="width: 100%; table-layout: fixed; border-collapse: collapse; border-bottom: 1px solid #000000;">
            <thead>
              <tr class="border-b border-black font-bold text-center bg-gray-100">
                <th style="width: 5.5%; border-right: 1px solid #000;">Sl</th>
                <th style="width: 44.5%; text-align: left; border-right: 1px solid #000;">Description of Goods</th>
                ${!isDC ? `
                  <th style="width: 10.5%; border-right: 1px solid #000;">HSN/SAC</th>
                  <th style="width: 6.5%; border-right: 1px solid #000;">Unit</th>
                  <th style="width: 11.5%; text-align: right; border-right: 1px solid #000;">Unit Rate</th>
                  <th style="width: 6.5%; border-right: 1px solid #000;">Qty</th>
                  <th style="width: 15%; text-align: right;">Amount</th>
                ` : `
                  <th style="width: 10%; border-right: 1px solid #000;">UNIT</th>
                  <th style="width: 10%; border-right: 1px solid #000;">Qty</th>
                  <th style="width: 30%; text-align: right;">Remarks</th>
                `}
              </tr>
            </thead>
            <tbody>
              ${lines.map((l, idx) => {
                const lineTaxable = (l.quantity || 0) * (l.unitPrice || 0);
                return `
                  <tr style="vertical-align: top;">
                    <td style="text-align: center; border-right: 1px solid #000;">${idx + 1}</td>
                    <td style="text-align: left; border-right: 1px solid #000; font-weight: 500; white-space: pre-line;">${l.description}</td>
                    ${!isDC ? `<td style="text-align: center; border-right: 1px solid #000; font-family: monospace;">${l.hsnCode || '8504'}</td>` : ''}
                    <td style="text-align: center; border-right: 1px solid #000;">${l.unit || (isDC ? 'No' : "No's")}</td>
                    ${!isDC ? `<td style="text-align: right; border-right: 1px solid #000; font-family: monospace;">${Math.round(l.unitPrice || 0).toLocaleString('en-IN')}</td>` : ''}
                    <td style="text-align: center; border-right: 1px solid #000; font-weight: 600;">${l.quantity || 0}</td>
                    <td style="text-align: right; font-family: monospace; font-weight: 600;">${isDC ? '-' : lineTaxable.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                  </tr>
                `;
              }).join('')}

              ${/* Spacer row - tuned strictly so document never spills onto sheet 2 */ ''}
              <tr style="height: ${Math.max(15, Math.min(75, 90 - lines.length * 15))}px;">
                <td style="border-right: 1px solid #000;"></td>
                <td style="border-right: 1px solid #000;"></td>
                ${!isDC ? '<td style="border-right: 1px solid #000;"></td>' : ''}
                <td style="border-right: 1px solid #000;"></td>
                ${!isDC ? '<td style="border-right: 1px solid #000;"></td>' : ''}
                <td style="border-right: 1px solid #000;"></td>
                <td></td>
              </tr>

              ${isDC ? `
                <tr class="border-t border-black font-bold bg-gray-50">
                  <td colspan="3" style="text-align: right; border-right: 1px solid #000;">Total Quantity:</td>
                  <td style="text-align: center; font-family: monospace; border-right: 1px solid #000;">${totalQty}</td>
                  <td style="text-align: center;">-</td>
                </tr>
              ` : `
                <tr class="border-t border-black font-bold">
                  <td colspan="4" rowspan="${totalsRowCount}" style="border-right: 1px solid #000; background: #ffffff;"></td>
                  <td style="text-align: right; border-right: 1px solid #000;">Sub Total</td>
                  <td style="text-align: center; font-family: monospace; border-right: 1px solid #000;">${totalQty}</td>
                  <td style="text-align: right; font-family: monospace;">${(effectiveSubtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                </tr>

                ${isSEZ ? `
                  <tr>
                    <td colspan="2" style="text-align: right; border-top: 1px solid #000; border-right: 1px solid #000; font-style: italic; font-size: 10px;">Nill - IGST 18% Tax by LUT</td>
                    <td style="text-align: right; border-top: 1px solid #000; font-family: monospace; font-weight: bold;">-</td>
                  </tr>
                ` : isInterState ? `
                  <tr>
                    <td colspan="2" style="text-align: right; border-top: 1px solid #000; border-right: 1px solid #000; font-weight: bold;">IGST 18%</td>
                    <td style="text-align: right; border-top: 1px solid #000; font-family: monospace; font-weight: bold;">${(invoice.igstAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                  </tr>
                ` : `
                  <tr>
                    <td colspan="2" style="text-align: right; border-top: 1px solid #000; border-right: 1px solid #000; font-weight: bold;">CGST 9%</td>
                    <td style="text-align: right; border-top: 1px solid #000; font-family: monospace; font-weight: bold;">${(invoice.cgstAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                  </tr>
                  <tr>
                    <td colspan="2" style="text-align: right; border-top: 1px solid #000; border-right: 1px solid #000; font-weight: bold;">SGST 9%</td>
                    <td style="text-align: right; border-top: 1px solid #000; font-family: monospace; font-weight: bold;">${(invoice.sgstAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                  </tr>
                `}

                ${isProforma ? `
                  <tr style="background: #ecfdf5;">
                    <td colspan="2" style="text-align: right; border-top: 1px solid #000; border-right: 1px solid #000; font-weight: bold; color: #064e3b;">Advance ${advancePercent}% with PO</td>
                    <td style="text-align: right; border-top: 1px solid #000; font-family: monospace; font-weight: bold; color: #064e3b;">${advanceAmount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                  </tr>
                  <tr>
                    <td colspan="2" style="text-align: right; border-top: 1px solid #000; border-right: 1px solid #000; font-weight: bold; color: #334155; font-style: italic; font-size: 10px;">Balance ${100 - advancePercent}% on Dispatch / Delivery</td>
                    <td style="text-align: right; border-top: 1px solid #000; font-family: monospace; font-weight: 600; color: #334155;">${(effectiveTotal - advanceAmount).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                  </tr>
                ` : ''}

                <tr>
                  <td colspan="2" style="text-align: right; border-top: 1px solid #000; border-right: 1px solid #000; font-weight: bold;">Round off</td>
                  <td style="text-align: right; border-top: 1px solid #000; font-family: monospace; font-weight: bold;">${(invoice.roundOff !== undefined && invoice.roundOff !== 0 ? (invoice.roundOff > 0 ? `+${invoice.roundOff.toFixed(2)}` : invoice.roundOff.toFixed(2)) : '-')}</td>
                </tr>

                <tr class="font-bold text-xs" style="background: #f3f4f6;">
                  <td style="text-align: right; border-top: 1px solid #000; border-right: 1px solid #000;">Total</td>
                  <td style="text-align: center; border-top: 1px solid #000; font-family: monospace; border-right: 1px solid #000;">${totalQty}</td>
                  <td style="text-align: right; border-top: 1px solid #000; font-family: monospace; font-weight: 900;">${Math.round(effectiveTotal).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                </tr>

                ${hasAdvanceAdjusted ? `
                  <tr style="background: #ecfdf5;">
                    <td colspan="2" style="text-align: right; border-top: 1px solid #000; border-right: 1px solid #000; font-weight: bold; color: #064e3b;">Less: Advance Received</td>
                    <td style="text-align: right; border-top: 1px solid #000; font-family: monospace; font-weight: bold; color: #064e3b;">- ${(invoice.advanceAdjusted || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                  </tr>
                  <tr class="font-bold text-xs" style="background: #d1fae5;">
                    <td colspan="2" style="text-align: right; border-top: 1px solid #000; border-right: 1px solid #000; font-weight: bold;">Net Balance Payable / Due</td>
                    <td style="text-align: right; border-top: 1px solid #000; font-family: monospace; font-weight: 900;">${(invoice.balanceDue ?? Math.max(0, effectiveTotal - (invoice.advanceAdjusted || 0))).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                  </tr>
                ` : ''}
              `}
            </tbody>
          </table>
        </div>

        ${!isDC ? `
          <div class="p-1.5 px-2 border-b border-black font-bold text-[10.5px] bg-white text-black">
            In Words :- <span class="font-semibold">${amountInWords}</span>
          </div>
        ` : ''}

        ${(isSEZ && includeTaxSummary) ? `
          <div class="border-b border-black bg-white text-black">
            <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
              <thead>
                <tr class="border-b border-black bg-gray-100 font-bold text-center">
                  <th style="border-right: 1px solid #000;">HSN/SAC</th>
                  <th style="text-align: right; border-right: 1px solid #000;">Taxable Value</th>
                  <th style="border-right: 1px solid #000;">Rate</th>
                  <th style="text-align: right; border-right: 1px solid #000;">Integrated Tax</th>
                  <th style="text-align: right;">Total Tax</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="text-align: center; border-right: 1px solid #000; font-family: monospace;">${distinctHsns}</td>
                  <td style="text-align: right; border-right: 1px solid #000; font-family: monospace;">${(effectiveSubtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                  <td style="text-align: center; border-right: 1px solid #000; font-family: monospace;">18%</td>
                  <td style="text-align: right; border-right: 1px solid #000; font-family: monospace;">${theoreticalIgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td style="text-align: right; font-family: monospace; font-weight: bold;">${theoreticalIgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ` : ''}

        ${/* Bottom Declarations & Signatory Section */ ''}
        <div class="grid grid-cols-2 divide-x divide-black border-b border-black text-[10px] bg-white text-black">
          ${/* Declaration Box */ ''}
          <div class="p-2 space-y-0.5 bg-white text-black">
            ${includeTerms ? `
              <p class="font-bold text-[10.5px]">
                ${isDC ? 'Dispatch & Delivery Declaration:' : isSEZ ? 'SEZ / LUT Statutory Declaration:' : isProforma ? 'Proforma Terms & Conditions:' : 'Declaration:'}
              </p>
              <ol style="padding-left: 14px; margin-top: 4px; line-height: 1.25;">
                <li>Any complaints should be reported within 2 days of material receipt.</li>
                <li>Goods once sold will not be exchanged or taken back.</li>
                <li>Payment should be made strictly as per agreed terms. Subject to ${profile?.city || 'Local'} Jurisdiction.</li>
                <li>${effectiveCompanyName} holds lien on equipment until final payment settlement.</li>
              </ol>
            ` : `
              <div style="height: 60px; color: #888; font-style: italic; padding-top: 20px;">
                [Standard Declaration Space]
              </div>
            `}
          </div>

          ${/* Bank Details and Signatory Box */ ''}
          <div class="flex flex-col justify-between bg-white text-black">
            ${includeBankDetails && !isDC ? `
              <div class="p-2 border-b border-black space-y-0.5 text-[10px]">
                <p class="font-bold text-[10.5px]">Company's Bank Details</p>
                <p><span>A/C Holder : </span><strong>${profile?.bankDetails?.accountHolderName || effectiveCompanyName}</strong></p>
                <p><span>Bank Name : </span><strong>${profile?.bankDetails?.bankName || ''}</strong></p>
                <p><span>A/c No : </span><strong class="font-mono">${profile?.bankDetails?.accountNumber || ''}</strong></p>
                <p><span>Branch & IFS Code : </span><strong>${profile?.bankDetails?.branch || ''} ${profile?.bankDetails?.ifscCode ? `& ${profile.bankDetails.ifscCode}` : ''}</strong></p>
              </div>
            ` : `
              <div class="p-2 border-b border-black text-[10px] text-gray-500 italic">
                ${isDC ? 'Consignee Acknowledgment & Stamp Verified' : 'Direct bank settlement details on file'}
              </div>
            `}

            <div class="p-2 text-right flex flex-col justify-between" style="min-height: 70px;">
              <p class="font-bold text-[10.5px]">FOR ${effectiveCompanyName}</p>
              <div style="position: relative; margin: 4px 0; min-height: 36px; display: flex; align-items: center; justify-content: flex-end;">
                ${(includeSignatory && effectiveSignatory?.stampImage) ? `
                  <img src="${effectiveSignatory.stampImage}" alt="Seal" style="width: 48px; height: 48px; position: absolute; right: 60px; top: 0; opacity: 0.85;" />
                ` : ''}
                ${(includeSignatory && effectiveSignatory?.signatureImage) ? `
                  <img src="${effectiveSignatory.signatureImage}" alt="Signature" style="max-height: 36px; max-width: 120px; object-fit: contain; position: relative; z-index: 2;" />
                ` : `
                  <div style="height: 24px;"></div>
                `}
              </div>
              <p class="text-[10px] font-bold">Authorised Signatory</p>
            </div>
          </div>
        </div>

        ${/* Computer Generated Notice */ ''}
        <div class="text-center text-[9px] py-0.5 text-black font-medium bg-white">
          This is a Computer Generated ${docTitle}
        </div>
      </div>
    `;
  };

  /**
   * Triggers the direct sandboxed print connection
   */
  const handleDirectPrintNow = async () => {
    try {
      setIsPrinting(true);
      setPrintSuccess(false);

      let finalHtml = '';

      if (copyType === 'all_three') {
        // Print all 3 GST statutory copies sequentially in 1 single print job!
        finalHtml += generateSingleSheetHtml('Original for Recipient', false);
        finalHtml += generateSingleSheetHtml('Duplicate for Transporter', true);
        finalHtml += generateSingleSheetHtml('Triplicate for Supplier', true);
      } else {
        // Print single copy based on selection
        const label = getCopyLabel(copyType);
        finalHtml = generateSingleSheetHtml(label, false);
      }

      const options: DirectPrintOptions = {
        title: `${docTitle}_${invoice.invoiceNumber}`,
        paperSize,
        monochrome,
        copies,
      };

      const success = await executeDirectPrint(finalHtml, options);
      if (success) {
        setPrintSuccess(true);
        setTimeout(() => setPrintSuccess(false), 4000);
      }
    } catch (err) {
      console.error('Direct print failed:', err);
      alert('Unable to complete print job. Please check printer connection.');
    } finally {
      setIsPrinting(false);
    }
  };

  /**
   * Direct 1-Click Hardware Print: sends job straight to the Windows printer spooler.
   * Completely eliminates the browser print preview popup window and prints immediately.
   */
  const handlePrintStraightToPrinter = async () => {
    try {
      setIsSendingToHardware(true);
      setHardwareSuccessMessage(null);
      setHardwareErrorMessage(null);

      const targetPrinterName = selectedPrinter || 'Brother DCP-T520W Printer';
      const res = await invoicesApi.directPrintToPrinter(invoice.id, {
        printerName: targetPrinterName,
        copies,
        copyType,
        templateType: activeTemplate,
        paperSize,
      });

      if (res?.data?.success) {
        setHardwareSuccessMessage(res.data.message || `Dispatched directly to ${targetPrinterName}!`);
        setTimeout(() => setHardwareSuccessMessage(null), 6000);
      }
    } catch (err: any) {
      console.error('Direct hardware print failed:', err);
      const errMsg =
        err?.response?.data?.message || err?.message || 'Unable to communicate with physical printer. Please check connection.';
      setHardwareErrorMessage(errMsg);
      setTimeout(() => setHardwareErrorMessage(null), 8000);
    } finally {
      setIsSendingToHardware(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          className="bg-white dark:bg-[#12151F] border border-slate-200 dark:border-[#262B3C] rounded-2xl w-full max-w-6xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden"
        >
          {/* ═══════════════════════════════════════════════════════════════════
              DIRECT PRINTER CONNECTION HEADER
             ═══════════════════════════════════════════════════════════════════ */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-[#262B3C] bg-gradient-to-r from-slate-50 via-white to-blue-50/30 dark:from-[#171B27] dark:via-[#131622] dark:to-[#171E30]">
            <div className="flex items-center gap-3">
              {effectiveLogoUrl ? (
                <div className="h-10 w-10 rounded-xl bg-white dark:bg-white/10 p-1 border border-slate-200 dark:border-white/10 shadow-sm flex items-center justify-center overflow-hidden">
                  <img
                    src={effectiveLogoUrl}
                    alt={effectiveCompanyName}
                    className="h-full w-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              ) : null}
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black tracking-tight text-slate-900 dark:text-white">
                    Direct Print Hub
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30 flex items-center gap-1.5 shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Direct Connection Ready
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {effectiveCompanyName} • {docTitle} #{invoice.invoiceNumber}
                </p>
              </div>
            </div>

            {/* Quick Actions & Close */}
            <div className="flex items-center gap-2">
              {onDownloadPdf && (
                <button
                  onClick={onDownloadPdf}
                  className="btn bg-white dark:bg-white/10 hover:bg-slate-100 dark:hover:bg-white/20 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-white/10 text-xs py-1.5 px-3 font-semibold shadow-sm gap-1.5 hidden sm:flex"
                  title="Download vector PDF directly"
                >
                  <Download size={13} /> Save PDF
                </button>
              )}
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              MODAL BODY (TWO COLUMNS: LIVE PREVIEW & CONFIGURATION OPTIONS)
             ═══════════════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-hidden">
            {/* LEFT COLUMN: LIVE PRINT DOCUMENT PREVIEW */}
            <div className="lg:col-span-7 bg-slate-900/90 dark:bg-[#0A0C13] border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-[#262B3C] p-4 flex flex-col justify-between overflow-hidden">
              <div className="flex items-center justify-between pb-3 text-xs text-slate-400 border-b border-white/10 mb-3">
                <div className="flex items-center gap-2">
                  <Eye size={14} className="text-crm-teal" />
                  <span className="font-semibold text-slate-200">Live Print Stream Preview</span>
                  <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono text-slate-300">
                    {paperSize} {monochrome ? '• Grayscale' : '• Color'}
                  </span>
                </div>

                {/* Zoom Controls */}
                <div className="flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-lg border border-white/10">
                  <button
                    onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.1))}
                    className="p-1 hover:text-white transition-colors"
                    title="Zoom Out"
                  >
                    <ZoomOut size={13} />
                  </button>
                  <span className="font-mono text-[11px] text-slate-300 w-10 text-center">
                    {Math.round(zoomLevel * 100)}%
                  </span>
                  <button
                    onClick={() => setZoomLevel((z) => Math.min(1.1, z + 0.1))}
                    className="p-1 hover:text-white transition-colors"
                    title="Zoom In"
                  >
                    <ZoomIn size={13} />
                  </button>
                  <button
                    onClick={() => setZoomLevel(0.72)}
                    className="ml-1 text-[10px] text-crm-teal hover:underline font-semibold"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* Scaled Preview Paper Canvas */}
              <div className="flex-1 overflow-y-auto flex items-start justify-center p-2 rounded-xl bg-black/30 border border-white/5">
                <div
                  ref={previewRef}
                  style={{
                    transform: `scale(${zoomLevel})`,
                    transformOrigin: 'top center',
                    filter: monochrome ? 'grayscale(100%) contrast(110%)' : 'none',
                    transition: 'all 0.2s ease',
                  }}
                  className="w-[794px] min-h-[1050px] bg-white text-black p-6 shadow-2xl border-[1.5px] border-black my-2 flex flex-col justify-between font-sans text-[11px] leading-tight select-none"
                >
                  {/* Top Bar with Dynamic Copy Type Badge */}
                  <div>
                    <div className="relative text-center font-bold text-sm tracking-wide py-1.5 border-b border-black bg-white text-black">
                      <span>{docTitle}</span>
                      <span className="absolute right-3 top-1.5 text-[10.5px] font-semibold text-black uppercase tracking-wider bg-gray-100 px-2 py-0.5 rounded border border-black/40">
                        {getCopyLabel(copyType)}
                      </span>
                    </div>

                    {/* Company Header */}
                    {includeHeader ? (
                      <div className="grid grid-cols-2 border-b border-black divide-x divide-black bg-white text-black">
                        <div className="p-2 space-y-0.5 text-[10px]">
                          {effectiveLogoUrl ? (
                            <div className="mb-1 flex items-center">
                              <img
                                src={effectiveLogoUrl}
                                alt={effectiveCompanyName}
                                style={{ maxHeight: '38px', maxWidth: '150px', width: 'auto', height: 'auto', objectFit: 'contain', display: 'block' }}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            </div>
                          ) : null}
                          <p className="font-bold text-[11px] text-black leading-tight">{effectiveCompanyName}</p>
                          <p className="text-black font-medium leading-tight">{effectiveAddress1}</p>
                          <p className="text-black font-medium leading-tight">{effectiveAddress2}</p>
                          <p className="font-bold text-black leading-tight">GST IN : {effectiveGstin}.</p>
                          <p className="text-black font-medium leading-tight">State Name : {effectiveState}, Code - {effectiveStateCode}</p>
                          <p className="text-black font-medium leading-tight">Email : {effectiveEmail}</p>
                        </div>
                        <div className="text-[10.5px]">
                          <table className="w-full h-full border-collapse">
                            <tbody>
                              <tr className="border-b border-black">
                                <td className="p-1.5 border-r border-black w-1/2">
                                  <span className="font-bold">Invoice No : </span>
                                  <span className="font-mono font-bold">{invoice.invoiceNumber}</span>
                                </td>
                                <td className="p-1.5 w-1/2">
                                  <span className="font-bold">Dated: </span>
                                  <span className="font-bold">{formatDateDMY(invoice.invoiceDate)}</span>
                                </td>
                              </tr>
                              <tr className="border-b border-black">
                                <td className="p-1.5 border-r border-black">
                                  <p className="font-bold">Reference No.</p>
                                  <p className="font-semibold">{invoice.referenceNo || invoice.order?.orderNumber || '-'}</p>
                                </td>
                                <td className="p-1.5">
                                  <p className="font-bold">Payment Terms:</p>
                                  <p className="font-semibold">{invoice.paymentTerms || (isDC ? 'Immediate' : 'Advance')}</p>
                                </td>
                              </tr>
                              <tr>
                                <td className="p-1.5 border-r border-black">
                                  <p className="font-bold">Buyer PO No.</p>
                                  <p className="font-semibold">{invoice.buyerOrderNo || '-'}</p>
                                </td>
                                <td className="p-1.5">
                                  <p className="font-bold">PO Date:</p>
                                  <p className="font-semibold">{invoice.poDate ? formatDateDMY(invoice.poDate) : formatDateDMY(invoice.invoiceDate)}</p>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 border-b border-black text-center text-xs font-semibold text-slate-400 bg-gray-50 italic">
                        [Header & Logo hidden for Pre-Printed Stationery / Letterhead]
                      </div>
                    )}

                    {/* Address Box */}
                    <div className="grid grid-cols-2 border-b border-black divide-x divide-black bg-white text-black">
                      <div className="p-2 text-[10.5px]">
                        <p className="font-bold">Billing Address :</p>
                        <p className="font-bold text-xs">{invoice.customerName}</p>
                        <p className="font-medium">{invoice.billingAddress || `${invoice.customerState || ''}, India`}</p>
                        {!isDC && <p className="font-bold pt-0.5">GSTIN: {invoice.customerGstin || '-'}</p>}
                      </div>
                      <div className="p-2 text-[10.5px]">
                        {includeDeliveryAddress ? (
                          <>
                            <p className="font-bold">Delivery Address :</p>
                            <p className="font-bold text-xs">{invoice.customerName}</p>
                            <p className="font-medium">{invoice.deliveryAddress || invoice.billingAddress || `${invoice.customerState || ''}, India`}</p>
                          </>
                        ) : (
                          <p className="text-gray-400 italic text-[10px]">Delivery address hidden</p>
                        )}
                      </div>
                    </div>

                    {/* Items Sample Table */}
                    <table className="w-full text-[10.5px] table-fixed border-collapse border-b border-black">
                      <thead>
                        <tr className="border-b border-black font-bold text-center bg-gray-100">
                          <th className="py-1.5 px-2 w-[5.5%] border-r border-black">#</th>
                          <th className="py-1.5 px-3 text-left w-[44.5%] border-r border-black">Description of Goods</th>
                          {!isDC && <th className="py-1.5 px-2 w-[10.5%] border-r border-black">HSN</th>}
                          <th className="py-1.5 px-2 w-[6.5%] border-r border-black">Unit</th>
                          {!isDC && <th className="py-1.5 px-2 w-[11.5%] text-right border-r border-black">Rate</th>}
                          <th className="py-1.5 px-2 w-[6.5%] border-r border-black">Qty</th>
                          <th className="py-1.5 px-3 w-[15%] text-right">{isDC ? 'Remarks' : 'Amount'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.slice(0, 5).map((l, idx) => (
                          <tr key={idx} className="border-b border-black/20">
                            <td className="py-1.5 px-2 text-center border-r border-black">{idx + 1}</td>
                            <td className="py-1.5 px-3 text-left border-r border-black font-medium">{l.description}</td>
                            {!isDC && <td className="py-1.5 px-2 text-center font-mono border-r border-black">{l.hsnCode || '8504'}</td>}
                            <td className="py-1.5 px-2 text-center border-r border-black">{l.unit || 'Nos'}</td>
                            {!isDC && <td className="py-1.5 px-2 text-right font-mono border-r border-black">{Number(l.unitPrice || 0).toLocaleString('en-IN')}</td>}
                            <td className="py-1.5 px-2 text-center font-bold border-r border-black">{l.quantity}</td>
                            <td className="py-1.5 px-3 text-right font-mono font-bold">
                              {((l.quantity || 0) * (l.unitPrice || 0)).toLocaleString('en-IN')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Total Summary */}
                    <div className="flex justify-between items-center p-2 border-b border-black font-bold text-xs bg-gray-50">
                      <span>Total Amount:</span>
                      <span className="font-mono text-sm">₹{Math.round(effectiveTotal).toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  {/* Bottom Area: Bank & Signatory */}
                  <div className="grid grid-cols-2 divide-x divide-black border-t border-black text-[10px]">
                    <div className="p-2 space-y-0.5">
                      {includeTerms ? (
                        <>
                          <p className="font-bold">Declaration & Terms:</p>
                          <p className="text-[9.5px]">Standard warranty and payment terms apply. Subject to ${profile?.city || 'Local'} Jurisdiction.</p>
                        </>
                      ) : (
                        <p className="text-gray-400 italic">[Terms hidden]</p>
                      )}
                    </div>
                    <div className="p-2 flex flex-col justify-between text-right min-h-[60px]">
                      <p className="font-bold text-[10px]">FOR {effectiveCompanyName}</p>
                      {includeSignatory ? (
                        <div className="flex items-center justify-end my-1 gap-2">
                          {effectiveSignatory?.stampImage && (
                            <img src={effectiveSignatory.stampImage} alt="Stamp" className="h-8 object-contain" />
                          )}
                          {effectiveSignatory?.signatureImage && (
                            <img src={effectiveSignatory.signatureImage} alt="Sign" className="h-7 object-contain" />
                          )}
                        </div>
                      ) : (
                        <div className="h-5"></div>
                      )}
                      <p className="font-bold text-[9.5px]">Authorised Signatory</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: DIRECT PRINT CONFIGURATION OPTIONS */}
            <div className="lg:col-span-5 p-5 flex flex-col justify-between overflow-y-auto bg-slate-50 dark:bg-[#151824] space-y-5">
              <div className="space-y-5">
                {/* 1. DOCUMENT COPY SELECTION (GST STATUTORY PRESETS) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Copy size={13} className="text-crm-blue" /> Document Copy Preset
                    </label>
                    <span className="text-[10.5px] font-medium text-slate-500 dark:text-slate-400">
                      GST Compliance Rule 48
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'original', label: 'Original Copy', sub: 'For Buyer / Recipient' },
                      { id: 'duplicate', label: 'Duplicate Copy', sub: 'For Transporter' },
                      { id: 'triplicate', label: 'Triplicate Copy', sub: 'For Supplier / Office' },
                      { id: 'extra', label: 'Extra Copy', sub: 'For Internal Records' },
                    ].map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setCopyType(c.id as GstCopyType)}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          copyType === c.id
                            ? 'bg-crm-blue/10 dark:bg-crm-blue/20 border-crm-blue text-slate-900 dark:text-white shadow-sm'
                            : 'bg-white dark:bg-[#1E2230] border-slate-200 dark:border-[#2A3042] text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs">{c.label}</span>
                          {copyType === c.id && <Check size={13} className="text-crm-blue" />}
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{c.sub}</p>
                      </button>
                    ))}
                  </div>

                  {/* 1-Click All 3 Copies Triplicate Batch Button */}
                  <button
                    onClick={() => setCopyType('all_three')}
                    className={`w-full p-2.5 rounded-xl border flex items-center justify-between transition-all ${
                      copyType === 'all_three'
                        ? 'bg-emerald-50 dark:bg-emerald-500/20 border-emerald-400 text-emerald-900 dark:text-emerald-300 shadow-sm'
                        : 'bg-white dark:bg-[#1E2230] border-slate-200 dark:border-[#2A3042] text-slate-800 dark:text-slate-300 hover:border-emerald-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-emerald-500 text-white flex items-center justify-center font-black text-xs">
                        3x
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-bold leading-tight">Batch Print All 3 Copies (Triplicate Set)</p>
                        <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                          1-Click: Prints Original + Duplicate + Triplicate in sequence
                        </p>
                      </div>
                    </div>
                    {copyType === 'all_three' && <Check size={16} className="text-emerald-600 dark:text-emerald-400" />}
                  </button>
                </div>

                {/* 2. PAPER SIZE & FORMAT */}
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Layers size={13} className="text-crm-teal" /> Paper Format
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'A4', label: 'A4 Standard', desc: '210 × 297 mm' },
                      { id: 'A5', label: 'A5 Compact', desc: '148 × 210 mm' },
                      { id: '4x6', label: '4" × 6" Thermal', desc: 'Logistics Label' },
                    ].map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setPaperSize(p.id as any)}
                        className={`p-2 rounded-xl border text-center transition-all ${
                          paperSize === p.id
                            ? 'bg-crm-teal/10 dark:bg-crm-teal/20 border-crm-teal text-slate-900 dark:text-white font-bold'
                            : 'bg-white dark:bg-[#1E2230] border-slate-200 dark:border-[#2A3042] text-slate-700 dark:text-slate-300 hover:border-slate-300'
                        }`}
                      >
                        <div className="text-xs font-bold">{p.label}</div>
                        <div className="text-[9.5px] text-slate-500 dark:text-slate-400">{p.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. COLOR & INK MODE + COPIES COUNTER */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Color Mode */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Palette size={13} className="text-purple-500" /> Ink / Color Mode
                    </label>
                    <div className="flex bg-white dark:bg-[#1E2230] p-1 rounded-xl border border-slate-200 dark:border-[#2A3042]">
                      <button
                        onClick={() => setMonochrome(false)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          !monochrome
                            ? 'bg-crm-blue text-white shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        Color
                      </button>
                      <button
                        onClick={() => setMonochrome(true)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          monochrome
                            ? 'bg-slate-800 text-white shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        B&W Saver
                      </button>
                    </div>
                  </div>

                  {/* Copies Stepper */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Copies
                    </label>
                    <div className="flex items-center bg-white dark:bg-[#1E2230] rounded-xl border border-slate-200 dark:border-[#2A3042] overflow-hidden p-0.5">
                      <button
                        onClick={() => setCopies((c) => Math.max(1, c - 1))}
                        className="px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={copies}
                        onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full text-center font-bold text-xs bg-transparent border-0 focus:ring-0 p-0 text-slate-900 dark:text-white"
                      />
                      <button
                        onClick={() => setCopies((c) => Math.min(20, c + 1))}
                        className="px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Direct Hardware Printer Selection Card */}
                <div className="p-3 bg-gradient-to-r from-blue-50/80 to-indigo-50/60 dark:from-crm-blue/15 dark:to-indigo-500/10 border border-blue-200 dark:border-crm-blue/30 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-blue-900 dark:text-crm-blue">
                      <Printer size={14} className="text-crm-blue" />
                      <span>Target Windows Printer</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      Ready (Direct Spool)
                    </span>
                  </div>

                  <div className="relative">
                    <select
                      value={selectedPrinter}
                      onChange={(e) => setSelectedPrinter(e.target.value)}
                      className="w-full text-xs font-bold py-2 px-3 rounded-lg bg-white dark:bg-[#1E2230] border border-slate-300 dark:border-[#2A3042] text-slate-900 dark:text-white shadow-sm focus:ring-1 focus:ring-crm-blue cursor-pointer"
                    >
                      {printers.map((p) => (
                        <option key={p.deviceId || p.name} value={p.name}>
                          {p.name} {p.name.toLowerCase().includes('brother') ? '(Recommended / Connected)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <p className="text-[10.5px] text-blue-800/80 dark:text-slate-300 leading-tight">
                    1-Click Direct Print routes instantly to your Windows spooler without showing the browser preview dialog.
                  </p>
                </div>
              </div>

              {/* ═══════════════════════════════════════════════════════════════
                  BOTTOM ACTIONS: DIRECT HARDWARE PRINT & BROWSER FALLBACK
                 ═══════════════════════════════════════════════════════════════ */}
              <div className="pt-3 border-t border-slate-200 dark:border-[#262B3C] space-y-2">
                {hardwareSuccessMessage && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-300 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-400 text-xs flex items-center gap-2 font-bold animate-fadeIn">
                    <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
                    <span>{hardwareSuccessMessage}</span>
                  </div>
                )}

                {hardwareErrorMessage && (
                  <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-300 dark:border-rose-500/30 text-rose-800 dark:text-rose-400 text-xs flex items-center gap-2 font-bold animate-fadeIn">
                    <X size={16} className="text-rose-600 flex-shrink-0" />
                    <span>{hardwareErrorMessage}</span>
                  </div>
                )}

                {printSuccess && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-300 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-400 text-xs flex items-center gap-2 font-bold animate-fadeIn">
                    <CheckCircle2 size={15} /> Print stream sent directly to printer!
                  </div>
                )}

                <div className="space-y-2">
                  {/* PRIMARY 1-CLICK ACTION: DIRECT TO BROTHER PRINTER (NO DIALOG) */}
                  <button
                    onClick={handlePrintStraightToPrinter}
                    disabled={isSendingToHardware || isPrinting}
                    className="btn w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs py-3 px-4 font-bold shadow-lg shadow-emerald-600/25 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  >
                    <Zap size={15} className="text-amber-300" />
                    <span className="tracking-wide">
                      {isSendingToHardware
                        ? `Sending Straight to ${selectedPrinter}...`
                        : `Print Straight to ${selectedPrinter.includes('Brother') ? 'Brother Printer' : selectedPrinter} (No Dialog)`}
                    </span>
                  </button>

                  <div className="flex items-center gap-2">
                    {/* SECONDARY: BROWSER PRINT DIALOG FALLBACK */}
                    <button
                      onClick={handleDirectPrintNow}
                      disabled={isPrinting || isSendingToHardware}
                      className="btn flex-1 bg-white dark:bg-white/10 hover:bg-slate-100 dark:hover:bg-white/20 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-white/10 text-xs py-2 px-3 font-semibold flex items-center justify-center gap-1.5"
                      title="Open standard browser print dialog"
                    >
                      <Printer size={13} />
                      <span>{isPrinting ? 'Opening...' : 'Browser Print Dialog'}</span>
                    </button>

                    <button
                      onClick={onClose}
                      className="btn bg-white dark:bg-white/10 hover:bg-slate-100 dark:hover:bg-white/20 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-white/10 text-xs py-2 px-4 font-semibold"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
