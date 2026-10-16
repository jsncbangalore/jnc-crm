/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const PDFDocument = require('pdfkit');
import * as fs from 'fs';
import * as path from 'path';
import { JSNC_COMPANY_PROFILE, numberToIndianWords } from './invoice-config';
import { BRAND_CONFIG } from '../common/brand';

export interface PdfDocumentOptions {
  templateType?: string;
  copyLabel?: string;
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

export function generateInvoicePdfBuffer(invoice: any, options?: PdfDocumentOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4', // 595.28 x 841.89 pt
        margins: { top: 20, bottom: 20, left: 25, right: 25 },
        autoFirstPage: true,
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk: any) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err: any) => reject(err));

      // Defensive sanitization: replace any stray Unicode ₹ in text fields with Rs. to prevent PDFKit Helvetica glyph corruption
      if (invoice) {
        if (typeof invoice.paymentTerms === 'string') invoice.paymentTerms = invoice.paymentTerms.replace(/₹/g, 'Rs. ');
        if (typeof invoice.transactionRef === 'string') invoice.transactionRef = invoice.transactionRef.replace(/₹/g, 'Rs. ');
        if (typeof invoice.notes === 'string') invoice.notes = invoice.notes.replace(/₹/g, 'Rs. ');
        if (Array.isArray(invoice.lines)) {
          invoice.lines.forEach((line: any) => {
            if (line && typeof line.description === 'string') line.description = line.description.replace(/₹/g, 'Rs. ');
          });
        }
      }

      // Resolve Dynamic Tenant Profile & Signatory Settings
      const profile = options?.companyProfile || invoice.companyProfile || JSNC_COMPANY_PROFILE;
      const companyName = options?.signatorySettings?.companyName || invoice?.signatorySettings?.companyName || profile.companyName || BRAND_CONFIG.displayName;
      const companyAddress = profile.address || 'No, 18/19, 2nd Floor, Coconut Avenue, 3rd cross, 8th Phase JP Nagar, Bangalore 76.';
      const companyCity = profile.city || 'Bengaluru';
      const companyState = profile.state || 'Karnataka';
      const companyPincode = profile.pincode || '560076';
      const companyGstin = profile.gstin || '29ABCDE1234F1Z5';
      const companyEmail = profile.email || 'accounts@example.com';
      const companyPhone = profile.phone || '+91 9876543210';

      const bankName = profile.bankName || 'Sample Bank';
      const bankAccountNo = profile.bankAccountNumber || '00001234567890';
      const bankIfsc = profile.bankIfsc || 'HDFC0000001';
      const bankBranch = profile.bankBranch || 'Main Branch';
      const bankHolder = profile.bankAccountHolder || companyName;

      const signatoryName = options?.signatorySettings?.signatoryName || profile.signatoryName || 'Authorized Signatory';
      const signatoryDesignation = options?.signatorySettings?.signatoryDesignation || profile.signatoryDesignation || 'Proprietor';

      const docType = options?.templateType || invoice.docType || 'tax_invoice';
      const isPO = docType === 'purchase_order';
      const isCreditNote = docType === 'credit_note';
      const isSez = docType === 'sez_invoice' || (invoice.isSez && !isCreditNote && !isPO);
      const isProforma = docType === 'proforma_invoice';
      const isDC = docType === 'delivery_challan';

      const isInterState =
        invoice.customerState?.toLowerCase() !== 'karnataka' &&
        invoice.customerState?.toLowerCase() !== 'ka' &&
        invoice.customerState?.toLowerCase() !== '29';

      const effectiveTotal = isDC || isSez ? invoice.subtotal : invoice.totalAmount;
      const words = numberToIndianWords(effectiveTotal);

      // Page boundary coordinates
      const startX = 25;
      const startY = 22;
      const pageWidth = 545; // 595 - 50
      const rightX = startX + pageWidth;

      const formatDateDMY = (d: Date | string) => {
        if (!d) return '-';
        const date = new Date(d);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
      };

      // Resolve official Logo (Always prioritize official JNC Brand Logo)
      let resolvedLogo: any = null;
      const possibleLogoPaths = [
        path.join(process.cwd(), 'apps/web/public/jnc-logo.jpg'),
        path.join(process.cwd(), 'public/jnc-logo.jpg'),
        path.join(process.cwd(), '../web/public/jnc-logo.jpg'),
        path.join(process.cwd(), '../../apps/web/public/jnc-logo.jpg'),
      ];
      for (const p of possibleLogoPaths) {
        if (fs.existsSync(p)) {
          resolvedLogo = p;
          break;
        }
      }

      // If official JNC logo file was not on disk, check custom tenant path (non-base64)
      if (!resolvedLogo && profile.logoUrl && !profile.logoUrl.startsWith('data:')) {
        if (fs.existsSync(profile.logoUrl)) {
          resolvedLogo = profile.logoUrl;
        }
      }

      // Resolve Stamp & Signature Images if provided
      let resolvedStamp: any = null;
      if (options?.signatorySettings?.stampImage?.startsWith('data:image/')) {
        try {
          const b64 = options.signatorySettings.stampImage.split(',')[1];
          if (b64) resolvedStamp = Buffer.from(b64, 'base64');
        } catch (e) {}
      }

      let resolvedSignature: any = null;
      if (options?.signatorySettings?.signatureImage?.startsWith('data:image/')) {
        try {
          const b64 = options.signatorySettings.signatureImage.split(',')[1];
          if (b64) resolvedSignature = Buffer.from(b64, 'base64');
        } catch (e) {}
      }

      // ════════════════════════════════════════════════════════════════════════
      // 1. PURCHASE ORDER (PO) EXACT FORMAT (MATCHING PDF 1)
      // ════════════════════════════════════════════════════════════════════════
      if (isPO) {
        let currentY = startY;
        const poBoxStartY = currentY;
        const targetPageBottomY = 820;

        // Top Header: Centered Logo & Company Details
        if (resolvedLogo) {
          try {
            doc.image(resolvedLogo, startX + pageWidth / 2 - 35, currentY, { height: 26 });
            currentY += 30;
          } catch (e) {
            currentY += 4;
          }
        }

        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor('#000000')
          .text(companyName.toUpperCase(), startX, currentY, { width: pageWidth, align: 'center' });
        currentY += 14;

        doc
          .font('Helvetica')
          .fontSize(7.5)
          .text(`Address : ${companyAddress}, ${companyCity}, ${companyState} ${companyPincode}`, startX, currentY, { width: pageWidth, align: 'center' });
        currentY += 10;

        doc
          .font('Helvetica')
          .fontSize(7.5)
          .text(`Contact No: ${companyPhone}, E-mail: ${companyEmail}`, startX, currentY, { width: pageWidth, align: 'center' });
        currentY += 12;

        // Title Bar
        doc.moveTo(startX, currentY).lineTo(rightX, currentY).stroke('#000000');
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .text('Purchase Order', startX, currentY + 3.5, { width: pageWidth, align: 'center' });
        currentY += 16;
        doc.moveTo(startX, currentY).lineTo(rightX, currentY).stroke('#000000');

        // Vendor TO & PO Metadata Grid
        const midX = startX + pageWidth / 2;
        const vendorBoxH = 50;
        doc.moveTo(midX, currentY).lineTo(midX, currentY + vendorBoxH).stroke('#000000');

        // Left TO
        doc
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .text('TO', startX + 6, currentY + 3.5)
          .font('Helvetica-Bold')
          .fontSize(8.5)
          .text(invoice.customerName || 'Vendor Name', startX + 6, currentY + 14)
          .font('Helvetica')
          .fontSize(7)
          .text(invoice.billingAddress || '', startX + 6, currentY + 26, { width: pageWidth / 2 - 12 });

        // Right Date & PO-No
        doc
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .text(`Date :-  ${formatDateDMY(invoice.invoiceDate)}`, midX + 6, currentY + 10, { width: pageWidth / 2 - 12, align: 'right' })
          .text(`PO-No :-  ${invoice.invoiceNumber || 'JNC_PO_02/26-27'}`, midX + 6, currentY + 24, { width: pageWidth / 2 - 12, align: 'right' });

        currentY += vendorBoxH;
        doc.moveTo(startX, currentY).lineTo(rightX, currentY).stroke('#000000');

        // Greeting
        doc
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .text('Dear Sir,', startX + 6, currentY + 3.5)
          .font('Helvetica')
          .fontSize(7)
          .text('With reference to discussion had with you, we are pleased to place an order for supply of materials as below.', startX + 6, currentY + 13);
        currentY += 24;
        doc.moveTo(startX, currentY).lineTo(rightX, currentY).stroke('#000000');

        // Table Columns
        const poCols = [
          { title: 'SLNO', width: 35, align: 'center' as const },
          { title: 'ITEM DESCRIPTION', width: 240, align: 'left' as const },
          { title: 'Unit', width: 45, align: 'center' as const },
          { title: 'QTY', width: 45, align: 'center' as const },
          { title: 'UNIT RATE', width: 85, align: 'right' as const },
          { title: 'TOTAL', width: 95, align: 'right' as const },
        ];

        // Table Header
        const tableHeaderH = 16;
        let colX = startX;
        poCols.forEach((col, idx) => {
          if (idx > 0) doc.moveTo(colX, currentY).lineTo(colX, currentY + tableHeaderH).stroke('#000000');
          doc.font('Helvetica-Bold').fontSize(7).text(col.title, colX + 2, currentY + 4.5, { width: col.width - 4, align: col.align });
          colX += col.width;
        });
        currentY += tableHeaderH;
        doc.moveTo(startX, currentY).lineTo(rightX, currentY).stroke('#000000');

        const tableContentStartY = currentY;
        let rowsTotalH = 0;

        invoice.lines.forEach((line: any, idx: number) => {
          const rowStartY = currentY;
          const descText = line.description || '-';
          const descWidth = poCols[1].width - 8;
          const textH = doc.font('Helvetica').fontSize(7.5).heightOfString(descText, { width: descWidth });
          const rowH = Math.max(16, textH + 6);

          colX = startX;
          doc.font('Helvetica-Bold').fontSize(7.5).text(String(idx + 1), colX, rowStartY + 4, { width: poCols[0].width, align: 'center' });
          colX += poCols[0].width;

          doc.font('Helvetica-Bold').fontSize(7.5).text(descText, colX + 4, rowStartY + 4, { width: descWidth, align: 'left' });
          colX += poCols[1].width;

          doc.font('Helvetica').fontSize(7.5).text(line.unit || 'Mtr', colX, rowStartY + 4, { width: poCols[2].width, align: 'center' });
          colX += poCols[2].width;

          doc.font('Helvetica-Bold').fontSize(7.5).text(String(line.quantity || 1), colX, rowStartY + 4, { width: poCols[3].width, align: 'center' });
          colX += poCols[3].width;

          doc.font('Helvetica').fontSize(7.5).text(Math.round(line.unitPrice || 0).toLocaleString('en-IN'), colX, rowStartY + 4, { width: poCols[4].width - 4, align: 'right' });
          colX += poCols[4].width;

          const amt = (line.quantity || 1) * (line.unitPrice || 0);
          doc.font('Helvetica-Bold').fontSize(7.5).text(amt.toLocaleString('en-IN', { minimumFractionDigits: 2 }), colX, rowStartY + 4, { width: poCols[5].width - 4, align: 'right' });

          currentY += rowH;
          rowsTotalH += rowH;
        });

        // Stretch / Spacer
        const poBottomFixedH = 45 + 90 + 55; // totals + terms + footer
        const availableTableH = targetPageBottomY - currentY - poBottomFixedH;
        const spacerH = Math.max(25, availableTableH);
        currentY += spacerH;

        const fullTableBodyH = rowsTotalH + spacerH;
        colX = startX;
        poCols.forEach((col, idx) => {
          if (idx > 0) doc.moveTo(colX, tableContentStartY).lineTo(colX, tableContentStartY + fullTableBodyH).stroke('#000000');
          colX += col.width;
        });

        doc.moveTo(startX, currentY).lineTo(rightX, currentY).stroke('#000000');

        // Totals Breakdown
        const subtotal = invoice.subtotal || 0;
        const gstAmt = invoice.igstAmount || (invoice.cgstAmount + invoice.sgstAmount) || Math.round((subtotal * 18) / 100);
        const grandTotal = invoice.totalAmount || (subtotal + gstAmt);

        // Row 1: Total Amount (INR)
        doc.moveTo(startX, currentY).lineTo(rightX, currentY).stroke('#000000');
        doc.moveTo(rightX - poCols[5].width, currentY).lineTo(rightX - poCols[5].width, currentY + 14).stroke('#000000');
        doc.font('Helvetica-Bold').fontSize(7.5).text('Total Amount (INR)', startX + 5, currentY + 3.5, { width: pageWidth - poCols[5].width - 10, align: 'right' });
        doc.font('Helvetica-Bold').fontSize(7.5).text(subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 }), rightX - poCols[5].width, currentY + 3.5, { width: poCols[5].width - 4, align: 'right' });
        currentY += 14;

        // Row 2: GST @ 18%
        doc.moveTo(startX, currentY).lineTo(rightX, currentY).stroke('#000000');
        doc.moveTo(rightX - poCols[5].width, currentY).lineTo(rightX - poCols[5].width, currentY + 14).stroke('#000000');
        doc.font('Helvetica-Bold').fontSize(7.5).text('GST @ 18%', startX + 5, currentY + 3.5, { width: pageWidth - poCols[5].width - 10, align: 'right' });
        doc.font('Helvetica-Bold').fontSize(7.5).text(gstAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 }), rightX - poCols[5].width, currentY + 3.5, { width: poCols[5].width - 4, align: 'right' });
        currentY += 14;

        // Row 3: Total Amount (INR) Inc GST
        doc.moveTo(startX, currentY).lineTo(rightX, currentY).stroke('#000000');
        doc.moveTo(rightX - poCols[5].width, currentY).lineTo(rightX - poCols[5].width, currentY + 16).stroke('#000000');
        doc.font('Helvetica-Bold').fontSize(8).text('Total Amount (INR) Inc GST', startX + 5, currentY + 4, { width: pageWidth - poCols[5].width - 10, align: 'right' });
        doc.font('Helvetica-Bold').fontSize(8.5).text(grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 }), rightX - poCols[5].width, currentY + 4, { width: poCols[5].width - 4, align: 'right' });
        currentY += 16;
        doc.moveTo(startX, currentY).lineTo(rightX, currentY).stroke('#000000');

        // Terms and Conditions
        currentY += 4;
        doc.font('Helvetica-Bold').fontSize(7.5).text('Terms and Conditions', startX + 6, currentY);
        currentY += 11;

        const deliveryAddr = invoice.deliveryAddress || 'Exide Energy Solutions Limited, Plot No: 28P, 29 to 46, 47P, 50P, 51 to 66 & 67, Hi-tech Defence & Aerospace Park, Phase II, Devanahalli, Channarayapatna, Bangaluru Rural, Karnataka – 562135.';
        const deliverySched = invoice.deliverySchedule || 'First Lot 6000 Mtr on 30-08-2026 and second Lot 1000.';
        const billingAddr = invoice.billingAddress || companyName;
        const paymentTerm = invoice.paymentTerms || 'Advance';
        const gstin = companyGstin;

        const terms = [
          `1. Delivery Address : ${deliveryAddr}`,
          `2. Delivery schedule : ${deliverySched}`,
          `3. Billing Address : ${billingAddr}`,
          `4. Payment : ${paymentTerm}`,
          `5. GST : ${gstin}`,
        ];

        terms.forEach((t) => {
          doc.font('Helvetica').fontSize(6.8).lineGap(1).text(t, startX + 6, currentY, { width: pageWidth - 12 });
          currentY += doc.font('Helvetica').fontSize(6.8).heightOfString(t, { width: pageWidth - 12 }) + 2;
        });

        // Signatory Footer
        currentY = Math.max(currentY + 10, targetPageBottomY - 45);
        if (resolvedLogo) {
          try {
            doc.image(resolvedLogo, startX + 6, currentY + 8, { height: 18 });
          } catch (e) {}
        }

        doc
          .font('Helvetica-Bold')
          .fontSize(8)
          .text(`For ${companyName}`, midX, currentY, { width: pageWidth / 2 - 6, align: 'right' });

        doc
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .text('Authorised Signatory', midX, currentY + 28, { width: pageWidth / 2 - 6, align: 'right' });

        // Outer Box Stroke
        doc.rect(startX, poBoxStartY, pageWidth, targetPageBottomY - poBoxStartY).stroke('#000000');

        doc.end();
        return;
      }

      // ════════════════════════════════════════════════════════════════════════
      // 2. STANDARD BOXED TEMPLATES (TAX INVOICE / SEZ / PROFORMA / DC / CREDIT NOTE)
      // ════════════════════════════════════════════════════════════════════════
      let currentY = startY;

      if (isSez) {
        doc
          .font('Helvetica-Bold')
          .fontSize(13)
          .fillColor('#000000')
          .text('Tax Invoice', startX, currentY, { width: pageWidth, align: 'center' });

        const copyBadge = options?.copyLabel || 'Original Copy';
        doc
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .text(copyBadge, rightX - 160, currentY + 3, { width: 155, align: 'right' });

        currentY += 16;

        doc
          .font('Helvetica-Bold')
          .fontSize(7)
          .text(
            '(Supply meant for export/Supply to SEZ unit or SEZ developer for authorised operations under\nbound or letter of undertaking without payment of IGST)',
            startX,
            currentY,
            { width: pageWidth, align: 'center', lineGap: 1.5 }
          );

        currentY += 22;
      } else if (isCreditNote) {
        doc
          .font('Helvetica-Bold')
          .fontSize(13)
          .fillColor('#000000')
          .text('Credit Note', startX, currentY, { width: pageWidth, align: 'center' });

        const copyBadge = options?.copyLabel || 'Original Copy';
        doc
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .text(copyBadge, rightX - 160, currentY + 3, { width: 155, align: 'right' });

        currentY += 20;
      } else {
        const titleText = isDC
          ? 'DELIVERY CHALLAN'
          : isProforma
          ? 'Proforma Invoice'
          : 'Invoice';

        doc
          .font('Helvetica-Bold')
          .fontSize(13)
          .fillColor('#000000')
          .text(titleText, startX, currentY, { width: pageWidth, align: 'center' });

        const copyBadge = options?.copyLabel || (isDC ? 'Delivery Copy' : 'Original for Recipient');
        doc
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .text(copyBadge, rightX - 160, currentY + 3, { width: 155, align: 'right' });

        currentY += 20;
      }

      // Header Box (Company Left, Invoice Details Right)
      const headerBoxHeight = (isSez || isCreditNote) ? 104 : 98;
      const midX = startX + pageWidth / 2;

      doc.rect(startX, currentY, pageWidth, headerBoxHeight).stroke('#000000');
      doc.moveTo(midX, currentY).lineTo(midX, currentY + headerBoxHeight).stroke('#000000');

      // Left Column: Logo & Company Profile
      let compY = currentY + 4;
      if (resolvedLogo) {
        try {
          doc.image(resolvedLogo, startX + 6, compY, { height: 24 });
          compY += 28;
        } catch (e) {
          // ignore logo error
        }
      }

      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(companyName, startX + 6, compY, { width: pageWidth / 2 - 12 });
      compY += 11;

      doc
        .font('Helvetica')
        .fontSize(7)
        .lineGap(1)
        .text(`${companyAddress},\n${companyCity}, ${companyState} - ${companyPincode}`, startX + 6, compY);
      compY += 17;

      doc.font('Helvetica-Bold').fontSize(7).text(`GST IN : ${companyGstin}`, startX + 6, compY);
      compY += 9;

      doc
        .font('Helvetica')
        .fontSize(6.5)
        .lineGap(1)
        .text(`State Name : ${companyState} | Email : ${companyEmail}`, startX + 6, compY);

      // Right Column: Invoice / DC Metadata grid
      const colRightW = pageWidth / 2;
      const colQuarterX = midX + colRightW / 2;
      const metaRowH = (isSez || isCreditNote) ? 26 : (headerBoxHeight / 3);

      // Row 1: Invoice No & Date
      doc.rect(midX, currentY, colRightW, metaRowH).stroke('#000000');
      doc.moveTo(colQuarterX, currentY).lineTo(colQuarterX, currentY + metaRowH).stroke('#000000');

      const numLabel = isDC ? 'DC No :' : isCreditNote ? 'CN No :' : 'Invoice No :';
      doc
        .font('Helvetica-Bold')
        .fontSize(7)
        .text(numLabel, midX + 5, currentY + 3)
        .font('Helvetica-Bold')
        .fontSize(8)
        .text(invoice.invoiceNumber || '-', midX + 5, currentY + 14);

      doc
        .font('Helvetica-Bold')
        .fontSize(7)
        .text('Dated:', colQuarterX + 5, currentY + 3)
        .font('Helvetica')
        .fontSize(7.5)
        .text(formatDateDMY(invoice.invoiceDate), colQuarterX + 5, currentY + 14);

      // Row 2: Reference & Terms
      doc.rect(midX, currentY + metaRowH, colRightW, metaRowH).stroke('#000000');
      doc.moveTo(colQuarterX, currentY + metaRowH).lineTo(colQuarterX, currentY + metaRowH * 2).stroke('#000000');

      doc
        .font('Helvetica-Bold')
        .fontSize(7)
        .text('Reference No. & Date.', midX + 5, currentY + metaRowH + 3)
        .font('Helvetica')
        .fontSize(7)
        .text(invoice.referenceNo || invoice.order?.orderNumber || '-', midX + 5, currentY + metaRowH + 13, { width: colRightW / 2 - 8 });

      doc
        .font('Helvetica-Bold')
        .fontSize(7)
        .text('Mode/ Terms of Payment:', colQuarterX + 5, currentY + metaRowH + 3)
        .font('Helvetica')
        .fontSize(7)
        .text(invoice.paymentTerms || (isDC ? 'Immediately' : 'Advance'), colQuarterX + 5, currentY + metaRowH + 13, { width: colRightW / 2 - 8 });

      // Row 3: Buyer's Order & PO Date
      doc.rect(midX, currentY + metaRowH * 2, colRightW, metaRowH).stroke('#000000');
      doc.moveTo(colQuarterX, currentY + metaRowH * 2).lineTo(colQuarterX, currentY + metaRowH * 3).stroke('#000000');

      doc
        .font('Helvetica-Bold')
        .fontSize(7)
        .text(isDC ? 'PO Order .' : "Buyer's Order No.", midX + 5, currentY + metaRowH * 2 + 3)
        .font('Helvetica')
        .fontSize(7)
        .text(invoice.buyerOrderNo || invoice.order?.orderNumber || '-', midX + 5, currentY + metaRowH * 2 + 13, { width: colRightW / 2 - 8 });

      doc
        .font('Helvetica-Bold')
        .fontSize(7)
        .text(isDC ? 'Order-Dated:' : 'PO-Dated:', colQuarterX + 5, currentY + metaRowH * 2 + 3)
        .font('Helvetica')
        .fontSize(7)
        .text(formatDateDMY(invoice.poDate || invoice.invoiceDate), colQuarterX + 5, currentY + metaRowH * 2 + 13);

      // Row 4 (If SEZ or Credit Note): LUT / Bond Details
      if (isSez || isCreditNote) {
        const lutRowH = headerBoxHeight - metaRowH * 3;
        doc.rect(midX, currentY + metaRowH * 3, colRightW, lutRowH).stroke('#000000');
        doc
          .font('Helvetica-Bold')
          .fontSize(7)
          .text(`LUT/Bond No : ${invoice.lutBondNo || profile.lutBondNo || 'AD290525013648T'}`, midX + 5, currentY + metaRowH * 3 + 3)
          .font('Helvetica')
          .fontSize(6.5)
          .text(isSez ? (invoice.lutValidity || profile.lutValidity || 'From : 10/05/2025 To: 09/05/2026') : '', midX + 5, currentY + metaRowH * 3 + 13);
      }

      currentY += headerBoxHeight;

      // Addresses Box
      const addrBoxH = 54;
      doc.rect(startX, currentY, pageWidth, addrBoxH).stroke('#000000');
      doc.moveTo(midX, currentY).lineTo(midX, currentY + addrBoxH).stroke('#000000');

      // Billing
      doc
        .font('Helvetica-Bold')
        .fontSize(7)
        .text('Billing Address :', startX + 6, currentY + 3.5)
        .font('Helvetica-Bold')
        .fontSize(8)
        .text(invoice.customerName || '-', startX + 6, currentY + 13)
        .font('Helvetica')
        .fontSize(6.5)
        .text(invoice.billingAddress || `${invoice.customerState || 'Karnataka'}, India`, startX + 6, currentY + 23, { width: pageWidth / 2 - 12 });

      if (!isDC && invoice.customerGstin) {
        doc.font('Helvetica-Bold').fontSize(6.5).text(`GST No: ${invoice.customerGstin}`, startX + 6, currentY + 42);
      }

      // Delivery
      doc
        .font('Helvetica-Bold')
        .fontSize(7)
        .text('Delivery Address :', midX + 6, currentY + 3.5)
        .font('Helvetica-Bold')
        .fontSize(8)
        .text(invoice.shippingName || invoice.customerName || '-', midX + 6, currentY + 13)
        .font('Helvetica')
        .fontSize(6.5)
        .text(invoice.shippingAddress || invoice.billingAddress || `${invoice.customerState || 'Karnataka'}, India`, midX + 6, currentY + 23, { width: pageWidth / 2 - 12 });

      currentY += addrBoxH;

      // Line Items Table - Column widths calibrated so the divider between Description
      // and HSN/SAC aligns EXACTLY with midX (272.5pt from startX), creating a continuous vertical line!
      const cols = isDC
        ? [
            { title: 'Sl No', width: 32.5, align: 'center' as const },
            { title: 'Description of Goods', width: 240, align: 'left' as const },
            { title: 'UNIT', width: 50, align: 'center' as const },
            { title: 'Qty', width: 50, align: 'center' as const },
            { title: 'Remarks/Rate', width: 172.5, align: 'right' as const },
          ]
        : [
            { title: 'Sl No', width: 30, align: 'center' as const },
            { title: 'Description of Goods', width: 242.5, align: 'left' as const },
            { title: 'HSN/ SAC', width: 52.5, align: 'center' as const },
            { title: 'Unit', width: 35, align: 'center' as const },
            { title: 'Unit Rate', width: 65, align: 'right' as const },
            { title: 'Qty', width: 40, align: 'center' as const },
            { title: 'Amount', width: 80, align: 'right' as const },
          ];

      // Table Header Row
      const tableHeaderH = 18;
      doc.rect(startX, currentY, pageWidth, tableHeaderH).stroke('#000000');
      let colX = startX;
      cols.forEach((col, idx) => {
        if (idx > 0) {
          doc.moveTo(colX, currentY).lineTo(colX, currentY + tableHeaderH).stroke('#000000');
        }
        doc
          .font('Helvetica-Bold')
          .fontSize(7)
          .text(col.title, colX + 2, currentY + 5, { width: col.width - 4, align: col.align });
        colX += col.width;
      });

      currentY += tableHeaderH;
      const tableContentStartY = currentY;

      // Render actual line rows
      let rowsTotalH = 0;
      invoice.lines.forEach((line: any, idx: number) => {
        const rowStartY = currentY;
        const descText = line.description || '-';
        const descWidth = cols[1].width - 8;
        const textH = doc.font('Helvetica').fontSize(7.5).heightOfString(descText, { width: descWidth });
        const rowH = Math.max(18, textH + 8);

        colX = startX;
        doc.font('Helvetica').fontSize(7.5).text(String(idx + 1), colX, rowStartY + 5, { width: cols[0].width, align: 'center' });
        colX += cols[0].width;

        doc.font('Helvetica-Bold').fontSize(7.5).text(descText, colX + 4, rowStartY + 5, { width: descWidth, align: 'left' });
        colX += cols[1].width;

        if (!isDC) {
          doc.font('Helvetica').fontSize(7).text(line.hsnCode || '85312000', colX, rowStartY + 5, { width: cols[2].width, align: 'center' });
          colX += cols[2].width;

          doc.font('Helvetica').fontSize(7.5).text(line.unit || "No's", colX, rowStartY + 5, { width: cols[3].width, align: 'center' });
          colX += cols[3].width;

          doc.font('Helvetica').fontSize(7.5).text(`Rs. ${Math.round(line.unitPrice || 0).toLocaleString('en-IN')}`, colX, rowStartY + 5, { width: cols[4].width - 4, align: 'right' });
          colX += cols[4].width;

          doc.font('Helvetica-Bold').fontSize(7.5).text(String(line.quantity || 1), colX, rowStartY + 5, { width: cols[5].width, align: 'center' });
          colX += cols[5].width;

          const amt = (line.quantity || 1) * (line.unitPrice || 0);
          doc.font('Helvetica-Bold').fontSize(7.5).text(`Rs. ${amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, colX, rowStartY + 5, { width: cols[6].width - 4, align: 'right' });
        } else {
          doc.font('Helvetica').fontSize(7.5).text(line.unit || 'No', colX, rowStartY + 5, { width: cols[2].width, align: 'center' });
          colX += cols[2].width;
          doc.font('Helvetica-Bold').fontSize(7.5).text(String(line.quantity || 1), colX, rowStartY + 5, { width: cols[3].width, align: 'center' });
          colX += cols[3].width;
          doc.font('Helvetica').fontSize(7.5).text('-', colX, rowStartY + 5, { width: cols[4].width - 4, align: 'right' });
        }

        currentY += rowH;
        rowsTotalH += rowH;
      });

      // Calculate Dynamic Full A4 Page Stretch
      let totalsBlockHeight = 0;
      if (isDC) {
        totalsBlockHeight = 20;
      } else {
        totalsBlockHeight = 15;
        if (isSez) {
          totalsBlockHeight += 14 + 13 + 18 + 18 + 26 + 13;
        } else if (isInterState) {
          totalsBlockHeight += 14 + 13 + 18 + 18;
        } else {
          totalsBlockHeight += 13 + 13 + 13 + 18 + 18;
        }
        if (isProforma && invoice.advanceAmount) {
          totalsBlockHeight += 14;
        }
        if (!isDC && !isProforma && !isCreditNote && invoice.advanceAdjusted && invoice.advanceAdjusted > 0) {
          totalsBlockHeight += 14 + 15; // advAdjRowH (14) + balRowH (15)
        }
      }

      const declBoxH = 88;
      const footerH = 14;
      const targetPageBottomY = 818;
      const nonTableFixedHeights = (currentY - startY) + totalsBlockHeight + declBoxH + footerH;
      const availableTableContentH = (targetPageBottomY - startY) - nonTableFixedHeights;
      const spacerHeight = Math.max(30, availableTableContentH);
      currentY += spacerHeight;

      const fullTableBodyH = rowsTotalH + spacerHeight;
      doc.rect(startX, tableContentStartY, pageWidth, fullTableBodyH).stroke('#000000');
      colX = startX;
      cols.forEach((col, idx) => {
        if (idx > 0) {
          doc.moveTo(colX, tableContentStartY).lineTo(colX, tableContentStartY + fullTableBodyH).stroke('#000000');
        }
        colX += col.width;
      });

      // Totals & Tax Breakdown
      if (!isDC) {
        const subtotalRowH = 15;
        doc.rect(startX, currentY, pageWidth, subtotalRowH).stroke('#000000');
        doc.moveTo(rightX - cols[cols.length - 1].width, currentY).lineTo(rightX - cols[cols.length - 1].width, currentY + subtotalRowH).stroke('#000000');

        doc
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .text('Subtotal (Taxable Amount):', startX + 5, currentY + 3.5, { width: pageWidth - cols[cols.length - 1].width - 10, align: 'right' });
        doc
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .text(`Rs. ${invoice.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, rightX - cols[cols.length - 1].width, currentY + 3.5, { width: cols[cols.length - 1].width - 4, align: 'right' });

        currentY += subtotalRowH;

        // Taxes rows
        if (isSez) {
          const taxRowH = 14;
          doc.rect(startX, currentY, pageWidth, taxRowH).stroke('#000000');
          doc.moveTo(rightX - cols[cols.length - 1].width, currentY).lineTo(rightX - cols[cols.length - 1].width, currentY + taxRowH).stroke('#000000');

          doc
            .font('Helvetica-Oblique')
            .fontSize(7)
            .text('Nill - IGST 18% Tax by LUT:', startX + 5, currentY + 3.5, { width: pageWidth - cols[cols.length - 1].width - 10, align: 'right' });
          doc
            .font('Helvetica')
            .fontSize(7.5)
            .text('Rs. 0.00', rightX - cols[cols.length - 1].width, currentY + 3.5, { width: cols[cols.length - 1].width - 4, align: 'right' });

          currentY += taxRowH;
        } else if (isInterState) {
          const taxRowH = 14;
          doc.rect(startX, currentY, pageWidth, taxRowH).stroke('#000000');
          doc.moveTo(rightX - cols[cols.length - 1].width, currentY).lineTo(rightX - cols[cols.length - 1].width, currentY + taxRowH).stroke('#000000');

          doc
            .font('Helvetica-Bold')
            .fontSize(7)
            .text('IGST 18%:', startX + 5, currentY + 3.5, { width: pageWidth - cols[cols.length - 1].width - 10, align: 'right' });
          doc
            .font('Helvetica-Bold')
            .fontSize(7.5)
            .text(`Rs. ${invoice.igstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, rightX - cols[cols.length - 1].width, currentY + 3.5, { width: cols[cols.length - 1].width - 4, align: 'right' });

          currentY += taxRowH;
        } else {
          // CGST 9%
          const taxRowH = 13;
          doc.rect(startX, currentY, pageWidth, taxRowH).stroke('#000000');
          doc.moveTo(rightX - cols[cols.length - 1].width, currentY).lineTo(rightX - cols[cols.length - 1].width, currentY + taxRowH).stroke('#000000');
          doc
            .font('Helvetica-Bold')
            .fontSize(7)
            .text('CGST 9%:', startX + 5, currentY + 3, { width: pageWidth - cols[cols.length - 1].width - 10, align: 'right' });
          doc
            .font('Helvetica-Bold')
            .fontSize(7.5)
            .text(`Rs. ${invoice.cgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, rightX - cols[cols.length - 1].width, currentY + 3, { width: cols[cols.length - 1].width - 4, align: 'right' });
          currentY += taxRowH;

          // SGST 9%
          doc.rect(startX, currentY, pageWidth, taxRowH).stroke('#000000');
          doc.moveTo(rightX - cols[cols.length - 1].width, currentY).lineTo(rightX - cols[cols.length - 1].width, currentY + taxRowH).stroke('#000000');
          doc
            .font('Helvetica-Bold')
            .fontSize(7)
            .text('SGST 9%:', startX + 5, currentY + 3, { width: pageWidth - cols[cols.length - 1].width - 10, align: 'right' });
          doc
            .font('Helvetica-Bold')
            .fontSize(7.5)
            .text(`Rs. ${invoice.sgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, rightX - cols[cols.length - 1].width, currentY + 3, { width: cols[cols.length - 1].width - 4, align: 'right' });
          currentY += taxRowH;
        }

        // Round off Row
        const roundOffRowH = 13;
        doc.rect(startX, currentY, pageWidth, roundOffRowH).stroke('#000000');
        doc.moveTo(rightX - cols[cols.length - 1].width, currentY).lineTo(rightX - cols[cols.length - 1].width, currentY + roundOffRowH).stroke('#000000');
        doc
          .font('Helvetica-Bold')
          .fontSize(7)
          .text('Round off', startX + 5, currentY + 3, { width: pageWidth - cols[cols.length - 1].width - 10, align: 'right' });
        doc
          .font('Helvetica')
          .fontSize(7.5)
          .text('-', rightX - cols[cols.length - 1].width, currentY + 3, { width: cols[cols.length - 1].width - 4, align: 'right' });
        currentY += roundOffRowH;

        // Proforma Advance
        if (isProforma && invoice.advanceAmount) {
          const advRowH = 14;
          doc.rect(startX, currentY, pageWidth, advRowH).stroke('#000000');
          doc.moveTo(rightX - cols[cols.length - 1].width, currentY).lineTo(rightX - cols[cols.length - 1].width, currentY + advRowH).stroke('#000000');
          doc
            .font('Helvetica-Bold')
            .fontSize(7.5)
            .text(`Advance ${invoice.advancePercent || 50}%:`, startX + 5, currentY + 3.5, { width: pageWidth - cols[cols.length - 1].width - 10, align: 'right' });
          doc
            .font('Helvetica-Bold')
            .fontSize(7.5)
            .text(`Rs. ${invoice.advanceAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, rightX - cols[cols.length - 1].width, currentY + 3.5, { width: cols[cols.length - 1].width - 4, align: 'right' });
          currentY += advRowH;
        }

        // Tax Invoice Advance Deduction
        if (!isDC && !isProforma && !isCreditNote && invoice.advanceAdjusted && invoice.advanceAdjusted > 0) {
          const advAdjRowH = 14;
          doc.rect(startX, currentY, pageWidth, advAdjRowH).stroke('#000000');
          doc.moveTo(rightX - cols[cols.length - 1].width, currentY).lineTo(rightX - cols[cols.length - 1].width, currentY + advAdjRowH).stroke('#000000');
          doc
            .font('Helvetica-Bold')
            .fontSize(7.5)
            .text(`Less: Advance Received${invoice.transactionRef ? ` (${invoice.transactionRef})` : ''}:`, startX + 5, currentY + 3.5, { width: pageWidth - cols[cols.length - 1].width - 10, align: 'right' });
          doc
            .font('Helvetica-Bold')
            .fontSize(7.5)
            .text(`- Rs. ${invoice.advanceAdjusted.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, rightX - cols[cols.length - 1].width, currentY + 3.5, { width: cols[cols.length - 1].width - 4, align: 'right' });
          currentY += advAdjRowH;

          // Balance Due Row
          const balRowH = 15;
          doc.rect(startX, currentY, pageWidth, balRowH).stroke('#000000');
          doc.moveTo(rightX - cols[cols.length - 1].width, currentY).lineTo(rightX - cols[cols.length - 1].width, currentY + balRowH).stroke('#000000');
          doc
            .font('Helvetica-Bold')
            .fontSize(8)
            .text('Net Balance Due / Payable:', startX + 5, currentY + 3.5, { width: pageWidth - cols[cols.length - 1].width - 10, align: 'right' });
          doc
            .font('Helvetica-Bold')
            .fontSize(8.5)
            .text(`Rs. ${(invoice.balanceDue ?? (invoice.totalAmount - invoice.advanceAdjusted)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, rightX - cols[cols.length - 1].width, currentY + 3.5, { width: cols[cols.length - 1].width - 4, align: 'right' });
          currentY += balRowH;
        }
      }

      // Grand Total Row
      const grandTotalRowH = 18;
      doc.rect(startX, currentY, pageWidth, grandTotalRowH).stroke('#000000');
      doc.moveTo(rightX - cols[cols.length - 1].width, currentY).lineTo(rightX - cols[cols.length - 1].width, currentY + grandTotalRowH).stroke('#000000');

      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .text('Total:', startX + 5, currentY + 4.5, { width: pageWidth - cols[cols.length - 1].width - 10, align: 'right' });
      doc
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .text(isDC ? '-' : `Rs. ${invoice.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, rightX - cols[cols.length - 1].width, currentY + 4.5, { width: cols[cols.length - 1].width - 4, align: 'right' });

      currentY += grandTotalRowH;

      // In Words Row
      if (!isDC) {
        const wordsRowH = 18;
        doc.rect(startX, currentY, pageWidth, wordsRowH).stroke('#000000');
        doc
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .text('In Words :- ', startX + 6, currentY + 4.5, { continued: true })
          .font('Helvetica-Oblique')
          .text(words, { align: 'left' });
        currentY += wordsRowH;
      }

      // SEZ Statutory HSN Summary Table
      if (isSez) {
        const sezTableH = 26;
        doc.rect(startX, currentY, pageWidth, sezTableH).stroke('#000000');

        const sCols = [
          { title: 'HSN/SAC', width: 90, align: 'center' as const },
          { title: 'Taxable Value', width: 115, align: 'right' as const },
          { title: 'Integrated Tax Rate', width: 110, align: 'center' as const },
          { title: 'Integrated Tax Amount', width: 115, align: 'right' as const },
          { title: 'Total Tax Amount', width: 115, align: 'right' as const },
        ];

        let sX = startX;
        sCols.forEach((col, i) => {
          if (i > 0) doc.moveTo(sX, currentY).lineTo(sX, currentY + 12).stroke('#000000');
          doc.font('Helvetica-Bold').fontSize(6.5).text(col.title, sX + 2, currentY + 2.5, { width: col.width - 4, align: col.align });
          sX += col.width;
        });

        doc.moveTo(startX, currentY + 12).lineTo(rightX, currentY + 12).stroke('#000000');
        sX = startX;
        const distinctHsn = invoice.lines.map((l: any) => l.hsnCode || '85312000').filter((v: string, i: number, a: string[]) => a.indexOf(v) === i).join(', ');
        const calcTax = Number(((invoice.subtotal * 18) / 100).toFixed(2));

        sCols.forEach((col, i) => {
          if (i > 0) doc.moveTo(sX, currentY + 12).lineTo(sX, currentY + sezTableH).stroke('#000000');
          let val = '';
          if (i === 0) val = distinctHsn;
          else if (i === 1) val = `Rs. ${invoice.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
          else if (i === 2) val = '18%';
          else if (i === 3) val = `Rs. ${calcTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
          else if (i === 4) val = `Rs. ${calcTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

          doc.font(i === 4 ? 'Helvetica-Bold' : 'Helvetica').fontSize(6.5).text(val, sX + 2, currentY + 15, { width: col.width - 4, align: col.align });
          sX += col.width;
        });

        currentY += sezTableH;

        const summaryTotalH = 13;
        doc.rect(startX, currentY, pageWidth, summaryTotalH).stroke('#000000');
        doc.moveTo(startX + sCols[0].width, currentY).lineTo(startX + sCols[0].width, currentY + summaryTotalH).stroke('#000000');
        doc.moveTo(startX + sCols[0].width + sCols[1].width, currentY).lineTo(startX + sCols[0].width + sCols[1].width, currentY + summaryTotalH).stroke('#000000');
        doc.moveTo(rightX - sCols[4].width, currentY).lineTo(rightX - sCols[4].width, currentY + summaryTotalH).stroke('#000000');
        doc
          .font('Helvetica-Bold')
          .fontSize(6.5)
          .text('Total', startX + 2, currentY + 3.5, { width: sCols[0].width - 4, align: 'left' });
        doc
          .font('Helvetica-Bold')
          .fontSize(6.5)
          .text(`Rs. ${invoice.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, startX + sCols[0].width + 2, currentY + 3.5, { width: sCols[1].width - 4, align: 'right' });
        doc
          .font('Helvetica-Bold')
          .fontSize(6.5)
          .text(`Rs. ${calcTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, rightX - sCols[4].width + 2, currentY + 3.5, { width: sCols[4].width - 4, align: 'right' });
        currentY += summaryTotalH;
      }

      // Declaration & Bank / Signatory
      doc.rect(startX, currentY, pageWidth, declBoxH).stroke('#000000');
      doc.moveTo(midX, currentY).lineTo(midX, currentY + declBoxH).stroke('#000000');

      // Left: Declaration (Dynamic with company name)
      const declarationTitle = 'Declaration:';
      const declarationText =
        '1. Any complaints should be reported within 2 days on receipt of material after which no complaint will be entertained.\n' +
        '2. Goods once sold will not be exchanged or taken back.\n' +
        '3. Payment should be made strictly as per terms mentioned.\n' +
        `4. If non payment as per terms agreed, ${companyName} will have rights to seize the materials & take back.\n` +
        '5. Advance amount will not be refunded for any circumstances.';

      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .text(declarationTitle, startX + 6, currentY + 4)
        .font('Helvetica')
        .fontSize(6.0)
        .lineGap(0.8)
        .text(declarationText, startX + 6, currentY + 14, { width: pageWidth / 2 - 12 });

      // Right: Bank Details
      if (!isDC) {
        doc
          .font('Helvetica-Bold')
          .fontSize(7)
          .text("Company's Bank Details", midX + 6, currentY + 4)
          .font('Helvetica')
          .fontSize(6.5)
          .lineGap(1)
          .text(
            `A/C Holder's Name : ${bankHolder}\n` +
            `Bank Name : ${bankName}\n` +
            `A/c No : ${bankAccountNo}\n` +
            `Branch & IFS Code : ${bankBranch} & ${bankIfsc}`,
            midX + 6,
            currentY + 13
          );
      }

      // Signatory Sub-Box
      const sigBoxH = 38;
      const sigBoxY = currentY + declBoxH - sigBoxH;
      doc.moveTo(midX, sigBoxY).lineTo(rightX, sigBoxY).stroke('#000000');

      doc
        .font('Helvetica-Bold')
        .fontSize(7)
        .text(`FOR ${companyName}`, midX + 6, sigBoxY + 4, { width: pageWidth / 2 - 12, align: 'right' });

      // Render Stamp if present
      if (resolvedStamp) {
        try {
          doc.image(resolvedStamp, rightX - 110, sigBoxY + 6, { height: 26 });
        } catch (e) {}
      }

      // Render Signature if present
      if (resolvedSignature) {
        try {
          doc.image(resolvedSignature, rightX - 55, sigBoxY + 10, { height: 18 });
        } catch (e) {}
      }

      doc
        .font('Helvetica')
        .fontSize(7)
        .text('Authorised Signatory', midX + 6, currentY + declBoxH - 10, { width: pageWidth / 2 - 12, align: 'right' });

      currentY += declBoxH;

      // Footer Note
      const footerNotice = isDC
        ? 'This is a Computer Generated DC'
        : isCreditNote
        ? 'This is a Computer Generated invoice'
        : isProforma
        ? 'This is a Computer Generated Proforma Invoice'
        : isSez
        ? 'This is a Computer Generated Tax Invoice (SEZ/LUT)'
        : 'This is a Computer Generated invoice';

      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor('#000000')
        .text(footerNotice, startX, currentY + 6, {
          width: pageWidth,
          align: 'center',
        });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
