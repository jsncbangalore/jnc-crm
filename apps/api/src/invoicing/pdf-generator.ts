/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const PDFDocument = require('pdfkit');
import * as fs from 'fs';
import * as path from 'path';
import { numberToIndianWords } from './invoice-config';
import { BRAND_CONFIG } from '../common/brand';

export interface PdfDocumentOptions {
  templateType?: string;
  copyLabel?: string; // 'original' | 'duplicate' | 'triplicate' | 'all_three' | custom string
  paperSize?: 'A4' | 'A5';
  companyProfile?: {
    companyName?: string;
    tradeName?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    gstin?: string;
    pan?: string;
    phone?: string;
    email?: string;
    website?: string;
    bankName?: string;
    bankAccountNumber?: string;
    bankIfsc?: string;
    bankBranch?: string;
    bankAccountHolder?: string;
    lutBondNo?: string;
    lutValidity?: string;
    logoUrl?: string | null;
  };
  signatorySettings?: {
    companyName?: string;
    signatoryName?: string;
    signatoryDesignation?: string;
    signatureImage?: string | null;
    stampImage?: string | null;
  };
}

/**
 * Format number into Indian currency representation with 2 decimals
 */
export function formatIndianCurrency(num: number | string | undefined | null): string {
  const n = Number(num || 0);
  if (isNaN(n)) return '0.00';
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format quantity with up to 2 decimal places, trimming trailing zeros
 */
export function formatQuantity(qty: number | string | undefined | null): string {
  const n = Number(qty || 0);
  if (isNaN(n)) return '1';
  return n.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  });
}

/**
 * Clean unit name (e.g. Nos, Kg, Pcs) instead of raw IDs or numeric codes
 */
export function formatUnitName(unit: string | undefined | null): string {
  if (!unit) return 'Nos';
  const u = String(unit).trim().toLowerCase();
  if (u === 'nos' || u === "no's" || u === 'no' || u === 'numbers') return 'Nos';
  if (u === 'kg' || u === 'kgs' || u === 'kilogram') return 'Kg';
  if (u === 'pcs' || u === 'pieces' || u === 'pc') return 'Pcs';
  if (u === 'mtr' || u === 'meter' || u === 'meters') return 'Mtr';
  if (u === 'box' || u === 'boxes') return 'Box';
  if (u === 'set' || u === 'sets') return 'Set';
  if (u === 'sqft' || u === 'sq.ft') return 'Sq.Ft';
  if (u === 'hour' || u === 'hrs') return 'Hrs';
  // Capitalize first letter of custom unit
  return unit.charAt(0).toUpperCase() + unit.slice(1);
}

/**
 * Mask bank account number to show only last 4 digits (e.g. ••••5678)
 */
export function maskBankAccount(accountNo: string | undefined | null): string {
  if (!accountNo) return '';
  const clean = String(accountNo).replace(/\s+/g, '');
  if (clean.length <= 4) return clean;
  const last4 = clean.slice(-4);
  return `••••${last4}`;
}

/**
 * Resolve disk path for embedded Noto Sans fonts
 */
function resolveFontPaths(): { regular: string | null; bold: string | null } {
  const candidates = [
    path.resolve(__dirname, '../../assets/fonts'),
    path.resolve(process.cwd(), 'apps/api/assets/fonts'),
    path.resolve(process.cwd(), 'assets/fonts'),
    path.resolve(__dirname, '../../../assets/fonts'),
  ];

  for (const dir of candidates) {
    const reg = path.join(dir, 'NotoSans-Regular.ttf');
    const bld = path.join(dir, 'NotoSans-Bold.ttf');
    if (fs.existsSync(reg) && fs.existsSync(bld)) {
      return { regular: reg, bold: bld };
    }
  }
  return { regular: null, bold: null };
}

/**
 * Main unified PDF Generator
 * Renders 100% compliant, vector-sharp Tax Invoices, SEZ Invoices, Credit Notes, Delivery Challans,
 * and Proforma Invoices with an adaptive table layout engine, baseline alignment, and zero text overlap.
 */
export function generateInvoicePdfBuffer(invoice: any, options?: PdfDocumentOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const isA5 = options?.paperSize === 'A5';

      // Page dimensions in points (72 points = 1 inch, 28.3465 pt = 10 mm)
      // A4 = 595.28 x 841.89 pt; A5 = 419.53 x 595.28 pt
      const fullPageWidth = isA5 ? 419.53 : 595.28;
      const fullPageHeight = isA5 ? 595.28 : 841.89;

      // Exact 10mm margins on all sides (28.35 pt for A4, 20 pt for A5)
      const margin = isA5 ? 20 : 28.35;
      const startX = margin;
      const startY = margin;
      const pageWidth = fullPageWidth - 2 * margin; // 538.58 pt for A4
      const rightX = startX + pageWidth;
      const pageBottomLimit = fullPageHeight - margin; // 813.54 pt for A4

      const doc = new PDFDocument({
        size: isA5 ? 'A5' : 'A4',
        margins: { top: margin, bottom: margin, left: margin, right: margin },
        autoFirstPage: true,
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk: any) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err: any) => reject(err));

      // Register embedded Noto Sans fonts for genuine Rupee symbol (₹) and Indian typography
      const fonts = resolveFontPaths();
      let fontRegular = 'Helvetica';
      let fontBold = 'Helvetica-Bold';
      let hasNotoSans = false;

      if (fonts.regular && fonts.bold) {
        try {
          doc.registerFont('NotoSans', fonts.regular);
          doc.registerFont('NotoSans-Bold', fonts.bold);
          fontRegular = 'NotoSans';
          fontBold = 'NotoSans-Bold';
          hasNotoSans = true;
        } catch {
          fontRegular = 'Helvetica';
          fontBold = 'Helvetica-Bold';
        }
      }

      // Safe currency symbol representation
      const currencySymbol = hasNotoSans ? '₹' : 'Rs.';

      // Determine copies to generate
      const copyOption = (options?.copyLabel || 'original').toLowerCase().trim();
      const copiesList: string[] = [];

      if (copyOption === 'all_three') {
        copiesList.push('Original for Recipient', 'Duplicate for Transporter', 'Triplicate for Supplier');
      } else if (copyOption.includes('duplicate')) {
        copiesList.push('Duplicate for Transporter');
      } else if (copyOption.includes('triplicate')) {
        copiesList.push('Triplicate for Supplier');
      } else if (copyOption.includes('extra') || copyOption.includes('office')) {
        copiesList.push('Extra Copy');
      } else {
        copiesList.push(options?.copyLabel || 'Original for Recipient');
      }

      // Resolve Company Profile & Signatory Information
      const profile = options?.companyProfile || invoice.companyProfile || {};
      const companyName = (
        options?.signatorySettings?.companyName ||
        invoice?.signatorySettings?.companyName ||
        profile.companyName ||
        BRAND_CONFIG.displayName
      ).trim();

      const companyAddress = (profile.address || '').trim();
      const companyCity = (profile.city || '').trim();
      const companyState = (profile.state || 'Karnataka').trim();
      const companyPincode = (profile.pincode || '').trim();
      const companyGstin = (profile.gstin || '').trim();
      const companyEmail = (profile.email || '').trim();
      const companyPhone = (profile.phone || '').trim();

      // State Code derivation
      const companyStateCode = companyGstin.length >= 2 && /^\d{2}/.test(companyGstin)
        ? companyGstin.slice(0, 2)
        : '29';

      const bankName = (profile.bankName || '').trim();
      const bankAccountNo = (profile.bankAccountNumber || '').trim();
      const bankIfsc = (profile.bankIfsc || '').trim();
      const bankBranch = (profile.bankBranch || '').trim();
      const bankHolder = (profile.bankAccountHolder || companyName).trim();

      // Document Type Classification
      const docType = options?.templateType || invoice.docType || 'tax_invoice';
      const isCreditNote = docType === 'credit_note';
      const isSez = docType === 'sez_invoice' || (invoice.isSez && !isCreditNote);
      const sezType = invoice.sezType || (isSez ? 'lut' : undefined);
      const isSezWithIgst = isSez && sezType === 'igst';
      const isProforma = docType === 'proforma_invoice';
      const isDC = docType === 'delivery_challan';
      const isPO = docType === 'purchase_order';

      // Interstate check
      const custStateLower = (invoice.customerState || '').toLowerCase().trim();
      const isInterState =
        custStateLower !== 'karnataka' &&
        custStateLower !== 'ka' &&
        custStateLower !== '29';

      // Customer state code
      const custGstin = (invoice.customerGstin || '').trim();
      const custStateCode = custGstin.length >= 2 && /^\d{2}/.test(custGstin)
        ? custGstin.slice(0, 2)
        : (isInterState ? '' : '29');

      // Date formatter
      const formatDateDMY = (d: Date | string | undefined | null) => {
        if (!d) return '-';
        const date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
      };

      // Resolve Company Document Logo
      let resolvedLogo: any = (profile as any)?.logoBuffer || null;
      const candidateLogo = (profile as any)?.logoBase64 || profile.logoUrl || process.env.PRODUCT_LOGO_URL;
      const tenantId = (profile as any)?.tenantId || (invoice as any)?.tenantId;

      if (!resolvedLogo && tenantId) {
        const exts = ['png', 'jpg', 'jpeg'];
        const candidateDirs = [
          path.resolve(process.cwd(), 'uploads/branding'),
          path.resolve(process.cwd(), '../../uploads/branding'),
          path.resolve(process.cwd(), 'apps/web/public/uploads/branding'),
          path.resolve(process.cwd(), '../web/public/uploads/branding'),
          path.resolve(process.cwd(), '../../apps/web/public/uploads/branding'),
          path.resolve(process.cwd(), 'public/uploads/branding'),
        ];
        for (const dir of candidateDirs) {
          for (const ext of exts) {
            const diskPath = path.join(dir, `${tenantId}_logo.${ext}`);
            if (fs.existsSync(diskPath)) {
              try {
                const stat = fs.statSync(diskPath);
                if (stat.size > 150) {
                  resolvedLogo = diskPath;
                  break;
                }
              } catch {}
            }
          }
          if (resolvedLogo) break;
        }
      }

      if (!resolvedLogo && candidateLogo) {
        if (typeof candidateLogo === 'string' && candidateLogo.startsWith('data:image/')) {
          try {
            const b64 = candidateLogo.split(',')[1];
            if (b64) resolvedLogo = Buffer.from(b64, 'base64');
          } catch {}
        } else if (typeof candidateLogo === 'string') {
          if (fs.existsSync(candidateLogo)) {
            resolvedLogo = candidateLogo;
          } else {
            const relPath = path.resolve(process.cwd(), candidateLogo);
            if (fs.existsSync(relPath)) {
              resolvedLogo = relPath;
            } else if (candidateLogo.includes('logo') || candidateLogo.startsWith('/')) {
              const staticCandidates = [
                path.resolve(process.cwd(), 'apps/web/public/logo.png'),
                path.resolve(process.cwd(), '../web/public/logo.png'),
                path.resolve(process.cwd(), 'apps/api/assets/logo.png'),
                path.resolve(process.cwd(), 'public/logo.png'),
              ];
              for (const c of staticCandidates) {
                if (fs.existsSync(c)) {
                  resolvedLogo = c;
                  break;
                }
              }
            }
          }
        }
      }

      // Line items array sanitized
      const lines: any[] = Array.isArray(invoice.lines) && invoice.lines.length > 0
        ? invoice.lines
        : [{
            description: 'Item Description',
            hsnCode: '85312000',
            unit: 'Nos',
            quantity: 1,
            unitPrice: invoice.subtotal || 0,
            taxRate: 18,
          }];

      // Effective total for in-words calculation
      const effectiveTotal = isDC
        ? invoice.subtotal || 0
        : invoice.totalAmount !== undefined && invoice.totalAmount !== null
        ? Number(invoice.totalAmount)
        : (invoice.subtotal || 0);

      const wordsInRupees = numberToIndianWords(effectiveTotal);

      // Pre-measure longest amount to ensure no wrapping in amount column
      let longestAmountLen = 0;
      lines.forEach((l) => {
        const amtStr = formatIndianCurrency((Number(l.quantity) || 1) * (Number(l.unitPrice) || 0));
        if (amtStr.length > longestAmountLen) longestAmountLen = amtStr.length;
      });
      const totalStr = formatIndianCurrency(effectiveTotal);
      if (totalStr.length > longestAmountLen) longestAmountLen = totalStr.length;

      // ────────────────────────────────────────────────────────────────────────
      // RENDER EACH COPY PAGE
      // ────────────────────────────────────────────────────────────────────────
      copiesList.forEach((copyTitle, copyIndex) => {
        if (copyIndex > 0) {
          doc.addPage();
        }

        let currentY = startY;

        // 1. TOP HEADER & TITLE BAR
        // Document Title Text
        let docTitle = 'TAX INVOICE';
        if (isDC) docTitle = 'DELIVERY CHALLAN';
        else if (isCreditNote) docTitle = 'CREDIT NOTE';
        else if (isProforma) docTitle = 'PROFORMA INVOICE';
        else if (isPO) docTitle = 'PURCHASE ORDER';
        else if (invoice.isBillOfSupply) docTitle = 'INVOICE-CUM-BILL OF SUPPLY';

        // Draw Title and Copy Badge
        const titleH = isSez ? 26 : 20;
        doc.rect(startX, currentY, pageWidth, titleH).stroke('#000000');

        doc
          .font(fontBold)
          .fontSize(12)
          .fillColor('#000000')
          .text(docTitle, startX + 10, currentY + 4, {
            width: pageWidth - 20,
            align: 'center',
          });

        // Copy Badge inside top-right border
        doc
          .font(fontBold)
          .fontSize(7.5)
          .fillColor('#000000')
          .text(copyTitle, rightX - 160, currentY + 5, {
            width: 154,
            align: 'right',
          });

        currentY += titleH;

        // SEZ Statutory Subtitle line if applicable
        if (isSez) {
          const sezSubtitleH = 22;
          doc.rect(startX, currentY, pageWidth, sezSubtitleH).stroke('#000000');

          const sezText = isSezWithIgst
            ? '(Supply to SEZ unit or SEZ developer for authorised operations on payment of Integrated Tax)'
            : '(Supply meant for export / Supply to SEZ unit or SEZ developer for authorised operations under bond or letter of undertaking without payment of IGST)';

          doc
            .font(fontRegular)
            .fontSize(6.8)
            .fillColor('#000000')
            .text(sezText, startX + 6, currentY + 3.5, {
              width: pageWidth - 12,
              align: 'center',
              lineGap: 1.5,
            });

          const lutNo = profile.lutBondNo || invoice.lutBondNo;
          const lutVal = profile.lutValidity || invoice.lutValidity;
          if (lutNo && !isSezWithIgst) {
            const lutLine = `LUT/Bond No: ${lutNo}${lutVal ? ` | Validity: ${lutVal}` : ''}`;
            doc
              .font(fontBold)
              .fontSize(6.5)
              .text(lutLine, startX + 6, currentY + 13, {
                width: pageWidth - 12,
                align: 'center',
              });
          }

          currentY += sezSubtitleH;
        }

        // 2. COMPANY PROFILE & DOCUMENT METADATA GRID
        const midX = startX + Math.round(pageWidth / 2);
        const headerBlockH = 92;

        doc.rect(startX, currentY, pageWidth, headerBlockH).stroke('#000000');
        doc.moveTo(midX, currentY).lineTo(midX, currentY + headerBlockH).stroke('#000000');

        // Left Column: Company Profile & Document Logo
        let compY = currentY + 5;
        const leftColW = midX - startX - 12;

        if (resolvedLogo) {
          try {
            doc.image(resolvedLogo, startX + 6, compY, { height: 26 });
            compY += 30;
          } catch {
            compY += 2;
          }
        }

        doc
          .font(fontBold)
          .fontSize(9.5)
          .text(companyName, startX + 6, compY, { width: leftColW });
        compY += doc.font(fontBold).fontSize(9.5).heightOfString(companyName, { width: leftColW }) + 2;

        // Address without trailing hyphens or empty pincode
        const fullAddr = [
          companyAddress,
          companyCity,
          companyState + (companyPincode ? ` - ${companyPincode}` : ''),
        ]
          .filter(Boolean)
          .join(', ');

        doc
          .font(fontRegular)
          .fontSize(6.8)
          .text(fullAddr, startX + 6, compY, { width: leftColW, lineGap: 1 });
        compY += doc.font(fontRegular).fontSize(6.8).heightOfString(fullAddr, { width: leftColW, lineGap: 1 }) + 2;

        if (companyGstin) {
          doc
            .font(fontBold)
            .fontSize(7)
            .text(`GSTIN : ${companyGstin} (State Code: ${companyStateCode})`, startX + 6, compY);
          compY += 9;
        }

        const comms = [
          companyPhone ? `Ph: ${companyPhone}` : '',
          companyEmail ? `Email: ${companyEmail}` : '',
        ]
          .filter(Boolean)
          .join(' | ');

        if (comms) {
          doc
            .font(fontRegular)
            .fontSize(6.5)
            .text(comms, startX + 6, compY, { width: leftColW });
        }

        // Right Column: Invoice Metadata 3-tier subgrid
        const metaColW = rightX - midX;
        const metaQuarterX = midX + Math.round(metaColW / 2);
        const metaRowH = Math.round(headerBlockH / 3);

        // Row 1: Invoice No & Date
        doc.rect(midX, currentY, metaColW, metaRowH).stroke('#000000');
        doc.moveTo(metaQuarterX, currentY).lineTo(metaQuarterX, currentY + metaRowH).stroke('#000000');

        const docNumLabel = isDC ? 'Challan No :' : isCreditNote ? 'Credit Note No :' : isPO ? 'PO No :' : 'Invoice No :';
        doc
          .font(fontBold)
          .fontSize(7)
          .text(docNumLabel, midX + 5, currentY + 3.5)
          .font(fontBold)
          .fontSize(8)
          .text(invoice.invoiceNumber || '-', midX + 5, currentY + 14, { width: metaQuarterX - midX - 8 });

        doc
          .font(fontBold)
          .fontSize(7)
          .text('Dated :', metaQuarterX + 5, currentY + 3.5)
          .font(fontRegular)
          .fontSize(7.5)
          .text(formatDateDMY(invoice.invoiceDate), metaQuarterX + 5, currentY + 14);

        // Row 2: Reference & Payment Terms
        const r2Y = currentY + metaRowH;
        doc.rect(midX, r2Y, metaColW, metaRowH).stroke('#000000');
        doc.moveTo(metaQuarterX, r2Y).lineTo(metaQuarterX, r2Y + metaRowH).stroke('#000000');

        const refVal = (invoice.referenceNo || invoice.order?.orderNumber || '').trim();
        if (refVal && refVal !== '-') {
          doc
            .font(fontBold)
            .fontSize(7)
            .text('Reference No. & Date', midX + 5, r2Y + 3.5)
            .font(fontRegular)
            .fontSize(7)
            .text(refVal, midX + 5, r2Y + 14, { width: metaQuarterX - midX - 8 });
        } else {
          // Hide label when empty
          doc
            .font(fontRegular)
            .fontSize(6.5)
            .fillColor('#64748B')
            .text('', midX + 5, r2Y + 14);
          doc.fillColor('#000000');
        }

        const termsVal = (invoice.paymentTerms || (isDC ? 'Immediately' : 'Advance')).trim();
        doc
          .font(fontBold)
          .fontSize(7)
          .text('Terms of Payment', metaQuarterX + 5, r2Y + 3.5)
          .font(fontRegular)
          .fontSize(7)
          .text(termsVal, metaQuarterX + 5, r2Y + 14, { width: rightX - metaQuarterX - 8 });

        // Row 3: Buyer's Order / Despatch Details
        const r3Y = currentY + metaRowH * 2;
        doc.rect(midX, r3Y, metaColW, metaRowH).stroke('#000000');
        doc.moveTo(metaQuarterX, r3Y).lineTo(metaQuarterX, r3Y + metaRowH).stroke('#000000');

        const poNoVal = (invoice.poNumber || invoice.orderNumber || '').trim();
        if (poNoVal && poNoVal !== '-') {
          doc
            .font(fontBold)
            .fontSize(7)
            .text("Buyer's Order No.", midX + 5, r3Y + 3.5)
            .font(fontRegular)
            .fontSize(7)
            .text(poNoVal, midX + 5, r3Y + 14, { width: metaQuarterX - midX - 8 });
        }

        const poDateVal = invoice.poDate ? formatDateDMY(invoice.poDate) : '';
        const dueVal = invoice.dueDate ? formatDateDMY(invoice.dueDate) : '';
        const effectiveDateLabel = poDateVal ? "Buyer's Order Date" : (dueVal && dueVal !== '-' ? 'Payment Due Date' : '');
        const effectiveDateVal = poDateVal || (dueVal && dueVal !== '-' ? dueVal : '');

        if (effectiveDateLabel && effectiveDateVal) {
          doc
            .font(fontBold)
            .fontSize(7)
            .text(effectiveDateLabel, metaQuarterX + 5, r3Y + 3.5)
            .font(fontRegular)
            .fontSize(7)
            .text(effectiveDateVal, metaQuarterX + 5, r3Y + 14);
        }

        currentY += headerBlockH;

        // 3. BILL TO & SHIP TO SECTION
        const addrBoxH = 68;
        doc.rect(startX, currentY, pageWidth, addrBoxH).stroke('#000000');
        doc.moveTo(midX, currentY).lineTo(midX, currentY + addrBoxH).stroke('#000000');

        // Receiver (Billed To)
        const custName = (invoice.customerName || 'Customer Name').trim();
        const billAddr = (invoice.billingAddress || '').trim();
        const custState = (invoice.customerState || 'Karnataka').trim();
        const placeOfSupply = (invoice.placeOfSupply || custState).trim();

        doc
          .font(fontBold)
          .fontSize(7)
          .text('Details of Receiver (Billed to) :', startX + 6, currentY + 4)
          .font(fontBold)
          .fontSize(8)
          .text(custName, startX + 6, currentY + 14, { width: leftColW });

        let custAddrY = currentY + 24;
        if (billAddr) {
          doc
            .font(fontRegular)
            .fontSize(6.8)
            .text(billAddr, startX + 6, custAddrY, { width: leftColW, height: 20 });
          custAddrY += 16;
        }

        const stateInfo = `State: ${custState}${custStateCode ? ` (${custStateCode})` : ''} | Place of Supply: ${placeOfSupply}`;
        doc.font(fontRegular).fontSize(6.5).text(stateInfo, startX + 6, currentY + 45, { width: leftColW });

        if (custGstin) {
          doc.font(fontBold).fontSize(7).text(`GSTIN / Unique ID: ${custGstin}`, startX + 6, currentY + 55);
        } else {
          doc.font(fontRegular).fontSize(6.5).text('GSTIN: Unregistered Consumer', startX + 6, currentY + 55);
        }

        // Consignee (Shipped To)
        const shipName = (invoice.shippingName || custName).trim();
        const shipAddr = (invoice.shippingAddress || billAddr || `${custState}, India`).trim();

        doc
          .font(fontBold)
          .fontSize(7)
          .text('Details of Consignee (Shipped to) :', midX + 6, currentY + 4)
          .font(fontBold)
          .fontSize(8)
          .text(shipName, midX + 6, currentY + 14, { width: leftColW });

        doc
          .font(fontRegular)
          .fontSize(6.8)
          .text(shipAddr, midX + 6, currentY + 24, { width: leftColW, height: 20 });

        doc.font(fontRegular).fontSize(6.5).text(`State: ${custState}${custStateCode ? ` (${custStateCode})` : ''}`, midX + 6, currentY + 45);

        if (invoice.dispatchDocNo || invoice.deliveryNote) {
          doc.font(fontRegular).fontSize(6.5).text(`Despatch Doc: ${invoice.dispatchDocNo || invoice.deliveryNote}`, midX + 6, currentY + 55);
        }

        currentY += addrBoxH;

        // 4. ITEMS TABLE LAYOUT ENGINE
        // Exact column sizing ensuring zero wrapping and exact page width match
        // Total pageWidth = 538.58 pt
        const cols = isDC
          ? [
              { key: 'sl', title: 'Sl No', width: 28, align: 'center' as const },
              { key: 'desc', title: 'Description of Goods', width: 240.58, align: 'left' as const },
              { key: 'unit', title: 'Unit', width: 45, align: 'center' as const },
              { key: 'qty', title: 'Qty', width: 45, align: 'center' as const },
              { key: 'rate', title: 'Remarks / Rate', width: 90, align: 'right' as const },
              { key: 'amt', title: `Amount (${currencySymbol})`, width: 90, align: 'right' as const },
            ]
          : [
              { key: 'sl', title: 'Sl No', width: 28, align: 'center' as const },
              { key: 'desc', title: 'Description of Goods / Services', width: 172.58, align: 'left' as const },
              { key: 'hsn', title: 'HSN/SAC', width: 52, align: 'center' as const },
              { key: 'qty', title: 'Qty', width: 38, align: 'center' as const },
              { key: 'unit', title: 'Unit', width: 36, align: 'center' as const },
              { key: 'rate', title: 'Unit Rate', width: 68, align: 'right' as const },
              { key: 'tax', title: 'GST %', width: 36, align: 'center' as const },
              { key: 'amt', title: `Amount (${currencySymbol})`, width: 108, align: 'right' as const },
            ];

        // Helper function to draw table header row
        const drawTableHeader = (yPos: number) => {
          const headerH = 18;
          doc.rect(startX, yPos, pageWidth, headerH).fillAndStroke('#F1F5F9', '#000000');
          doc.fillColor('#000000');

          let cX = startX;
          cols.forEach((col, idx) => {
            if (idx > 0) {
              doc.moveTo(cX, yPos).lineTo(cX, yPos + headerH).stroke('#000000');
            }
            doc
              .font(fontBold)
              .fontSize(7)
              .text(col.title, cX + 2, yPos + 5, {
                width: col.width - 4,
                align: col.align,
              });
            cX += col.width;
          });
          return headerH;
        };

        let tableHeaderH = drawTableHeader(currentY);
        currentY += tableHeaderH;
        const tableContentStartY = currentY;

        // Calculate reserved footer height
        let totalsBlockH = 18; // Grand total
        if (!isDC) {
          totalsBlockH += 16; // Subtotal
          if (isSez) {
            totalsBlockH += 15; // SEZ tax line
          } else if (isInterState) {
            totalsBlockH += 15; // IGST line
          } else {
            totalsBlockH += 28; // CGST + SGST lines
          }
          totalsBlockH += 14; // Round off
          if (invoice.advanceAdjusted && Number(invoice.advanceAdjusted) > 0) {
            totalsBlockH += 28; // Advance + Net balance due
          }
        }
        totalsBlockH += 18; // In Words

        const declBlockH = 88; // Declaration + Bank + Signatory
        const footerNoteH = 16;
        const totalFooterReserve = totalsBlockH + declBlockH + footerNoteH;

        // Render each line item using the adaptive measurement engine
        let totalQuantitySum = 0;
        let lineIndex = 0;

        while (lineIndex < lines.length) {
          const line = lines[lineIndex];
          const qty = Number(line.quantity) || 1;
          const rate = Number(line.unitPrice) || 0;
          const lineAmt = qty * rate;
          totalQuantitySum += qty;

          const descText = String(line.description || 'Item Description').trim();
          const descColWidth = cols.find((c) => c.key === 'desc')?.width || 170;
          const textInnerW = descColWidth - 8;

          // Measure tallest cell height with font
          const descH = doc.font(fontRegular).fontSize(7.5).heightOfString(descText, { width: textInnerW });
          const rowH = Math.max(18, Math.ceil(descH + 8));

          // Multi-page pagination check
          const isLastItem = lineIndex === lines.length - 1;
          const requiredBottomSpace = isLastItem ? totalFooterReserve + rowH : rowH + 25;

          if (currentY + requiredBottomSpace > pageBottomLimit) {
            // Close table on this page
            doc.moveTo(startX, currentY).lineTo(rightX, currentY).stroke('#000000');

            // Draw vertical column dividers down to currentY
            let divX = startX;
            cols.forEach((col, idx) => {
              if (idx > 0) {
                doc.moveTo(divX, tableContentStartY).lineTo(divX, currentY).stroke('#000000');
              }
              divX += col.width;
            });
            doc.rect(startX, tableContentStartY, pageWidth, currentY - tableContentStartY).stroke('#000000');

            // Bottom note
            doc
              .font(fontRegular)
              .fontSize(6.5)
              .text('Continued on next page...', startX + 6, currentY + 4);

            doc.addPage();
            currentY = startY;

            // Redraw table header on continuation page
            tableHeaderH = drawTableHeader(currentY);
            currentY += tableHeaderH;
          }

          const rowTopY = currentY;
          doc.rect(startX, rowTopY, pageWidth, rowH).stroke('#000000');

          // Render cells along uniform baseline (rowTopY + 4 pt)
          let cellX = startX;
          cols.forEach((col, idx) => {
            if (idx > 0) {
              doc.moveTo(cellX, rowTopY).lineTo(cellX, rowTopY + rowH).stroke('#000000');
            }

            const cellW = col.width;
            const innerW = cellW - 8;

            if (col.key === 'sl') {
              doc
                .font(fontRegular)
                .fontSize(7.5)
                .text(String(lineIndex + 1), cellX, rowTopY + 4, {
                  width: cellW,
                  align: 'center',
                });
            } else if (col.key === 'desc') {
              doc
                .font(fontBold)
                .fontSize(7.5)
                .text(descText, cellX + 4, rowTopY + 4, {
                  width: innerW,
                  align: 'left',
                });
            } else if (col.key === 'hsn') {
              doc
                .font(fontRegular)
                .fontSize(7)
                .text(line.hsnCode || '85312000', cellX, rowTopY + 4, {
                  width: cellW,
                  align: 'center',
                });
            } else if (col.key === 'qty') {
              doc
                .font(fontBold)
                .fontSize(7.5)
                .text(formatQuantity(qty), cellX, rowTopY + 4, {
                  width: cellW,
                  align: 'center',
                });
            } else if (col.key === 'unit') {
              doc
                .font(fontRegular)
                .fontSize(7.5)
                .text(formatUnitName(line.unit), cellX, rowTopY + 4, {
                  width: cellW,
                  align: 'center',
                });
            } else if (col.key === 'rate') {
              const rateStr = formatIndianCurrency(rate);
              // Scale font if rate value is long to ensure it never wraps
              let rFontSize = 7.5;
              while (doc.font(fontRegular).fontSize(rFontSize).widthOfString(rateStr) > innerW && rFontSize > 6) {
                rFontSize -= 0.5;
              }
              doc
                .font(fontRegular)
                .fontSize(rFontSize)
                .text(rateStr, cellX + 4, rowTopY + 4, {
                  width: innerW,
                  align: 'right',
                });
            } else if (col.key === 'tax') {
              const taxPct = isDC || (isSez && !isSezWithIgst) ? '0%' : `${Number(line.taxRate ?? 18)}%`;
              doc
                .font(fontRegular)
                .fontSize(7)
                .text(taxPct, cellX, rowTopY + 4, {
                  width: cellW,
                  align: 'center',
                });
            } else if (col.key === 'amt') {
              const amtStr = formatIndianCurrency(lineAmt);
              let aFontSize = 7.5;
              while (doc.font(fontBold).fontSize(aFontSize).widthOfString(amtStr) > innerW && aFontSize > 6) {
                aFontSize -= 0.5;
              }
              doc
                .font(fontBold)
                .fontSize(aFontSize)
                .text(amtStr, cellX + 4, rowTopY + 4, {
                  width: innerW,
                  align: 'right',
                });
            }

            cellX += cellW;
          });

          currentY += rowH;
          lineIndex++;
        }

        // Fill remaining height on current page if only 1 page to create a neat full-height invoice
        const remainingSpaceForTable = pageBottomLimit - totalFooterReserve - currentY;
        if (remainingSpaceForTable > 25 && copiesList.length === 1) {
          const spacerH = remainingSpaceForTable;
          doc.rect(startX, currentY, pageWidth, spacerH).stroke('#000000');

          let cX = startX;
          cols.forEach((col, idx) => {
            if (idx > 0) {
              doc.moveTo(cX, currentY).lineTo(cX, currentY + spacerH).stroke('#000000');
            }
            cX += col.width;
          });
          currentY += spacerH;
        }

        // 5. TOTALS & SUMMARY SECTION
        const lastCol = cols[cols.length - 1];
        const lastColW = lastCol.width;
        const totalLabelsW = pageWidth - lastColW - 10;
        const totalValX = rightX - lastColW;

        if (!isDC) {
          // Subtotal Row
          const subtotalH = 16;
          doc.rect(startX, currentY, pageWidth, subtotalH).stroke('#000000');
          doc.moveTo(totalValX, currentY).lineTo(totalValX, currentY + subtotalH).stroke('#000000');

          doc
            .font(fontBold)
            .fontSize(7.5)
            .text('Subtotal (Taxable Amount) :', startX + 6, currentY + 4, {
              width: totalLabelsW,
              align: 'right',
            });
          doc
            .font(fontBold)
            .fontSize(7.5)
            .text(formatIndianCurrency(invoice.subtotal), totalValX + 4, currentY + 4, {
              width: lastColW - 8,
              align: 'right',
            });

          currentY += subtotalH;

          // Tax Breakdown Rows
          if (isSez && !isSezWithIgst) {
            const taxRowH = 15;
            doc.rect(startX, currentY, pageWidth, taxRowH).stroke('#000000');
            doc.moveTo(totalValX, currentY).lineTo(totalValX, currentY + taxRowH).stroke('#000000');

            doc
              .font(fontRegular)
              .fontSize(7)
              .text('Nill - IGST 0% (Under LUT/Bond) :', startX + 6, currentY + 3.5, {
                width: totalLabelsW,
                align: 'right',
              });
            doc
              .font(fontRegular)
              .fontSize(7.5)
              .text('0.00', totalValX + 4, currentY + 3.5, {
                width: lastColW - 8,
                align: 'right',
              });

            currentY += taxRowH;
          } else if (isInterState || isSezWithIgst) {
            const taxRowH = 15;
            doc.rect(startX, currentY, pageWidth, taxRowH).stroke('#000000');
            doc.moveTo(totalValX, currentY).lineTo(totalValX, currentY + taxRowH).stroke('#000000');

            const igstRateLabel = isSezWithIgst ? 'Integrated Tax (IGST 18%) :' : 'IGST (18%) :';
            doc
              .font(fontBold)
              .fontSize(7)
              .text(igstRateLabel, startX + 6, currentY + 3.5, {
                width: totalLabelsW,
                align: 'right',
              });
            doc
              .font(fontBold)
              .fontSize(7.5)
              .text(formatIndianCurrency(invoice.igstAmount), totalValX + 4, currentY + 3.5, {
                width: lastColW - 8,
                align: 'right',
              });

            currentY += taxRowH;
          } else {
            // Intra-State: CGST (9%) + SGST (9%)
            const taxRowH = 14;

            // CGST
            doc.rect(startX, currentY, pageWidth, taxRowH).stroke('#000000');
            doc.moveTo(totalValX, currentY).lineTo(totalValX, currentY + taxRowH).stroke('#000000');
            doc
              .font(fontBold)
              .fontSize(7)
              .text('Central Tax (CGST 9%) :', startX + 6, currentY + 3.5, {
                width: totalLabelsW,
                align: 'right',
              });
            doc
              .font(fontBold)
              .fontSize(7.5)
              .text(formatIndianCurrency(invoice.cgstAmount), totalValX + 4, currentY + 3.5, {
                width: lastColW - 8,
                align: 'right',
              });
            currentY += taxRowH;

            // SGST
            doc.rect(startX, currentY, pageWidth, taxRowH).stroke('#000000');
            doc.moveTo(totalValX, currentY).lineTo(totalValX, currentY + taxRowH).stroke('#000000');
            doc
              .font(fontBold)
              .fontSize(7)
              .text('State Tax (SGST 9%) :', startX + 6, currentY + 3.5, {
                width: totalLabelsW,
                align: 'right',
              });
            doc
              .font(fontBold)
              .fontSize(7.5)
              .text(formatIndianCurrency(invoice.sgstAmount), totalValX + 4, currentY + 3.5, {
                width: lastColW - 8,
                align: 'right',
              });
            currentY += taxRowH;
          }

          // Round Off Row
          const roundOffH = 14;
          doc.rect(startX, currentY, pageWidth, roundOffH).stroke('#000000');
          doc.moveTo(totalValX, currentY).lineTo(totalValX, currentY + roundOffH).stroke('#000000');

          const roundOffVal = Number(invoice.roundOff || 0);
          doc
            .font(fontRegular)
            .fontSize(7)
            .text('Round off :', startX + 6, currentY + 3.5, {
              width: totalLabelsW,
              align: 'right',
            });
          doc
            .font(fontRegular)
            .fontSize(7.5)
            .text(roundOffVal !== 0 ? formatIndianCurrency(roundOffVal) : '0.00', totalValX + 4, currentY + 3.5, {
              width: lastColW - 8,
              align: 'right',
            });

          currentY += roundOffH;

          // Advance adjustment if recorded
          if (invoice.advanceAdjusted && Number(invoice.advanceAdjusted) > 0) {
            const advH = 14;
            doc.rect(startX, currentY, pageWidth, advH).stroke('#000000');
            doc.moveTo(totalValX, currentY).lineTo(totalValX, currentY + advH).stroke('#000000');

            doc
              .font(fontBold)
              .fontSize(7)
              .text(`Less: Advance Received${invoice.transactionRef ? ` (${invoice.transactionRef})` : ''} :`, startX + 6, currentY + 3.5, {
                width: totalLabelsW,
                align: 'right',
              });
            doc
              .font(fontBold)
              .fontSize(7.5)
              .text(`- ${formatIndianCurrency(invoice.advanceAdjusted)}`, totalValX + 4, currentY + 3.5, {
                width: lastColW - 8,
                align: 'right',
              });
            currentY += advH;

            // Balance Due Row
            const balH = 14;
            doc.rect(startX, currentY, pageWidth, balH).stroke('#000000');
            doc.moveTo(totalValX, currentY).lineTo(totalValX, currentY + balH).stroke('#000000');

            const balDue = invoice.balanceDue !== undefined && invoice.balanceDue !== null
              ? Number(invoice.balanceDue)
              : Math.max(0, Number(invoice.totalAmount || 0) - Number(invoice.advanceAdjusted || 0));

            doc
              .font(fontBold)
              .fontSize(7.5)
              .text('Net Balance Due / Payable :', startX + 6, currentY + 3.5, {
                width: totalLabelsW,
                align: 'right',
              });
            doc
              .font(fontBold)
              .fontSize(8)
              .text(formatIndianCurrency(balDue), totalValX + 4, currentY + 3.5, {
                width: lastColW - 8,
                align: 'right',
              });
            currentY += balH;
          }
        }

        // Grand Total Row
        const grandTotalH = 18;
        doc.rect(startX, currentY, pageWidth, grandTotalH).fillAndStroke('#F8FAFC', '#000000');
        doc.fillColor('#000000');
        doc.moveTo(totalValX, currentY).lineTo(totalValX, currentY + grandTotalH).stroke('#000000');

        const totalLabel = isDC ? 'Total Units :' : `Total (${currencySymbol}) :`;
        const totalValFormatted = isDC
          ? `${formatQuantity(totalQuantitySum)} Nos`
          : formatIndianCurrency(effectiveTotal);

        doc
          .font(fontBold)
          .fontSize(8.5)
          .text(totalLabel, startX + 6, currentY + 4.5, {
            width: totalLabelsW,
            align: 'right',
          });

        // Ensure total number fits cleanly on one line without wrapping
        let tFontSize = 9;
        while (doc.font(fontBold).fontSize(tFontSize).widthOfString(totalValFormatted) > lastColW - 8 && tFontSize > 6) {
          tFontSize -= 0.5;
        }

        doc
          .font(fontBold)
          .fontSize(tFontSize)
          .text(totalValFormatted, totalValX + 4, currentY + 4.5, {
            width: lastColW - 8,
            align: 'right',
          });

        currentY += grandTotalH;

        // In Words Row
        const wordsH = 18;
        doc.rect(startX, currentY, pageWidth, wordsH).stroke('#000000');

        doc
          .font(fontBold)
          .fontSize(7.5)
          .text('In Words :', startX + 6, currentY + 4.5, { continued: true })
          .font(fontRegular)
          .fontSize(7.5)
          .text(`  ${wordsInRupees}`, {
            width: pageWidth - 20,
            align: 'left',
          });

        currentY += wordsH;

        // 6. DECLARATION & BANK DETAILS / SIGNATORY
        doc.rect(startX, currentY, pageWidth, declBlockH).stroke('#000000');
        doc.moveTo(midX, currentY).lineTo(midX, currentY + declBlockH).stroke('#000000');

        // Left Half: Statutory Declaration
        doc
          .font(fontBold)
          .fontSize(7.5)
          .text('Declaration :', startX + 6, currentY + 4);

        const declTerms = [
          '1. Any discrepancy must be notified within 2 days of receipt of materials.',
          '2. Goods once sold will not be exchanged or taken back.',
          '3. Payment must be made strictly as per agreed payment terms.',
          `4. Title of goods remains with ${companyName} until invoice is paid in full.`,
          '5. Interest @ 18% p.a. will be charged on overdue payments after due date.',
        ].join('\n');

        doc
          .font(fontRegular)
          .fontSize(5.8)
          .text(declTerms, startX + 6, currentY + 14, {
            width: leftColW,
            lineGap: 1.2,
          });

        // Right Half: Company's Bank Details & Masked Account
        if (!isDC && bankAccountNo) {
          doc
            .font(fontBold)
            .fontSize(7)
            .text("Company's Bank Details", midX + 6, currentY + 4);

          const bankDetailsLines = [
            `A/C Holder : ${bankHolder}`,
            `Bank Name  : ${bankName}`,
            `A/c No     : ${maskBankAccount(bankAccountNo)}`,
            `IFSC Code  : ${bankIfsc}${bankBranch && bankBranch !== '-' ? ` (Branch: ${bankBranch})` : ''}`,
          ];

          doc
            .font(fontRegular)
            .fontSize(6.5)
            .text(bankDetailsLines.join('\n'), midX + 6, currentY + 13, {
              width: leftColW,
              lineGap: 1.2,
            });
        }

        // Signatory Box on Right Bottom (positioned strictly inside border, with clear margin above)
        const sigH = 32;
        const sigY = currentY + declBlockH - sigH;
        doc.moveTo(midX, sigY).lineTo(rightX, sigY).stroke('#000000');

        doc
          .font(fontBold)
          .fontSize(7)
          .text(`For ${companyName}`, midX + 6, sigY + 4, {
            width: leftColW,
            align: 'right',
          });

        doc
          .font(fontBold)
          .fontSize(7)
          .text('Authorised Signatory', midX + 6, currentY + declBlockH - 8, {
            width: leftColW,
            align: 'right',
          });

        currentY += declBlockH;

        // 7. PAGE FOOTER NOTICE
        const computerNotice = isDC
          ? 'This is a Computer Generated Delivery Challan'
          : isCreditNote
          ? 'This is a Computer Generated Credit Note'
          : isProforma
          ? 'This is a Computer Generated Proforma Invoice'
          : isSez
          ? 'This is a Computer Generated Tax Invoice (SEZ Supply)'
          : 'This is a Computer Generated Tax Invoice';

        doc
          .font(fontRegular)
          .fontSize(6.5)
          .fillColor('#64748B')
          .text(computerNotice, startX, currentY + 4, {
            width: pageWidth,
            align: 'center',
          });
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
