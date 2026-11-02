const PDFDocument = require('pdfkit');
import * as fs from 'fs';
import * as path from 'path';

function resolveFontPaths() {
  const candidates = [
    path.join(__dirname, '../../assets/fonts'),
    path.join(__dirname, '../assets/fonts'),
    path.join(__dirname, 'assets/fonts'),
    path.join(process.cwd(), 'apps/api/assets/fonts'),
    path.join(process.cwd(), 'assets/fonts'),
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

export interface StatementPdfOptions {
  companyProfile?: {
    companyName?: string;
    tradeName?: string;
    address?: string;
    city?: string;
    state?: string;
    gstin?: string;
    phone?: string;
    email?: string;
    logoUrl?: string | null; // Strictly Document logo only
  };
}

export function formatIndianCurrency(val: number): string {
  if (val == null || isNaN(val)) return '0.00';
  return Number(val).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function getHumanVoucherType(type: string): string {
  switch ((type || '').toLowerCase()) {
    case 'sales':
    case 'tax_invoice':
      return 'Sales Invoice';
    case 'purchase':
    case 'purchase_bill':
      return 'Purchase Bill';
    case 'credit_note':
      return 'Credit Note';
    case 'debit_note':
      return 'Debit Note';
    case 'receipt':
      return 'Receipt';
    case 'payment':
      return 'Payment';
    case 'opening':
      return 'Opening Balance';
    case 'reversal':
      return 'Reversal';
    case 'journal':
      return 'Journal Voucher';
    default:
      return type ? type.replace(/_/g, ' ') : '-';
  }
}

function formatDateDMY(dateStr: string | Date | undefined): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function generateLedgerStatementPdfBuffer(statementData: any, options?: StatementPdfOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 25, bottom: 25, left: 25, right: 25 },
        autoFirstPage: true,
        bufferPages: true,
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk: any) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err: any) => reject(err));

      // Register embedded Noto Sans Unicode fonts for authentic Rupee symbol (₹) and Indian typography
      const fonts = resolveFontPaths();
      let fontRegular = 'Helvetica';
      let fontBold = 'Helvetica-Bold';
      let hasUnicodeFont = false;

      if (fonts.regular && fonts.bold) {
        try {
          doc.registerFont('NotoSans', fonts.regular);
          doc.registerFont('NotoSans-Bold', fonts.bold);
          fontRegular = 'NotoSans';
          fontBold = 'NotoSans-Bold';
          hasUnicodeFont = true;
        } catch {
          fontRegular = 'Helvetica';
          fontBold = 'Helvetica-Bold';
        }
      }

      const sym = hasUnicodeFont ? '₹' : 'Rs.';

      const profile = options?.companyProfile || {};
      const companyName = profile.companyName || 'Our Company';
      const companyGstin = profile.gstin || '';
      const companyAddress = profile.address || '';
      const companyPhone = profile.phone || '';
      const companyEmail = profile.email || '';

      const startX = 25;
      let currentY = 25;
      const pageWidth = 545; // 595 - 50

      // ─── 1. HEADER: DOCUMENT LOGO & COMPANY INFO ──────────────────────────
      let logoRendered = false;
      const docLogo = profile.logoUrl;
      if (docLogo && typeof docLogo === 'string' && docLogo.startsWith('data:image/')) {
        try {
          const b64 = docLogo.split(',')[1];
          if (b64) {
            const logoBuffer = Buffer.from(b64, 'base64');
            doc.image(logoBuffer, startX, currentY, { fit: [120, 50], align: 'left' });
            logoRendered = true;
          }
        } catch {
          // fallback if decoding fails
        }
      }

      const textStartX = logoRendered ? startX + 130 : startX;
      doc.font(fontBold).fontSize(14).fillColor('#1E293B').text(companyName, textStartX, currentY);
      currentY += 16;

      doc.font(fontRegular).fontSize(8).fillColor('#64748B');
      if (companyAddress) {
        doc.text(companyAddress, textStartX, currentY);
        currentY += 10;
      }
      const contactLine = [
        companyGstin ? `GSTIN: ${companyGstin}` : '',
        companyPhone ? `Phone: ${companyPhone}` : '',
        companyEmail ? `Email: ${companyEmail}` : '',
      ].filter(Boolean).join('  |  ');
      if (contactLine) {
        doc.text(contactLine, textStartX, currentY);
        currentY += 12;
      }

      currentY = Math.max(currentY + 5, 85);

      // Statement Title Bar
      doc.rect(startX, currentY, pageWidth, 22).fill('#1E2A78');
      doc.font(fontBold).fontSize(10).fillColor('#FFFFFF')
        .text('STATEMENT OF ACCOUNT / PARTY LEDGER', startX + 10, currentY + 6);

      const periodFrom = formatDateDMY(statementData.fromDate || statementData.startDate);
      const periodTo = formatDateDMY(statementData.toDate || statementData.endDate);
      const statementDateFormatted = formatDateDMY(new Date());

      const periodHeader = `Period: ${periodFrom} to ${periodTo}`;
      doc.font(fontBold).fontSize(8.5).fillColor('#FFFFFF')
        .text(periodHeader, startX + pageWidth - 200, currentY + 6, { width: 190, align: 'right' });

      currentY += 28;

      // ─── 2. PARTY INFORMATION & METADATA ──────────────────────────────────
      const party = statementData.party || {};
      const partyTypeLabel = party.type === 'supplier' ? 'SUPPLIER (VENDOR)' : 'CUSTOMER (CLIENT)';

      const partySub = [
        party.gstin ? `GSTIN: ${party.gstin}` : '',
        party.address ? `Address: ${party.address}` : '',
        party.phone ? `Phone: ${party.phone}` : '',
      ].filter(Boolean).join('  |  ');

      doc.font(fontRegular).fontSize(8);
      const subHeight = doc.heightOfString(partySub, { width: pageWidth - 160 });
      const cardHeight = Math.max(50, 30 + subHeight + 6);

      doc.roundedRect(startX, currentY, pageWidth, cardHeight, 4).strokeColor('#E2E8F0').stroke();
      doc.font(fontBold).fontSize(8).fillColor('#64748B').text(partyTypeLabel, startX + 8, currentY + 6);
      doc.font(fontBold).fontSize(11).fillColor('#0F172A').text(party.name || 'Party Name', startX + 8, currentY + 16);

      doc.font(fontRegular).fontSize(8).fillColor('#475569').text(partySub, startX + 8, currentY + 30, { width: pageWidth - 160 });

      // Statement Date in metadata box
      doc.font(fontRegular).fontSize(8).fillColor('#64748B')
        .text(`Statement Date: ${statementDateFormatted}`, startX + pageWidth - 150, currentY + 8, { width: 140, align: 'right' });
      if (statementData.financialYear) {
        doc.font(fontBold).fontSize(8).fillColor('#1E2A78')
          .text(`FY: 20${statementData.financialYear.slice(0, 2)}-20${statementData.financialYear.slice(3, 5)}`, startX + pageWidth - 150, currentY + 22, { width: 140, align: 'right' });
      }

      currentY += cardHeight + 8;

      // ─── 3. SUMMARY CARDS (PLAIN LABELS: Opening, Billed, Received, Balance) ───
      const openingAmount = typeof statementData.openingBalance === 'number'
        ? statementData.openingBalance
        : statementData.openingBalance?.amount || 0;
      const openingSide = statementData.openingSide || statementData.openingBalance?.side || 'Dr';
      const opening = { amount: openingAmount, side: openingSide };
      const totals = statementData.totals || { debitTotal: 0, creditTotal: 0, closingBalance: 0, closingSide: 'Dr' };
      const cardWidth = (pageWidth - 15) / 4;
      const isCustomer = party.type !== 'supplier';

      const summaryCards = [
        { label: 'Opening', val: `${sym} ${formatIndianCurrency(opening.amount)} ${opening.side}` },
        { label: isCustomer ? 'Billed' : 'Purchases', val: `${sym} ${formatIndianCurrency(isCustomer ? totals.debitTotal : totals.creditTotal)}` },
        { label: isCustomer ? 'Received' : 'Paid', val: `${sym} ${formatIndianCurrency(isCustomer ? totals.creditTotal : totals.debitTotal)}` },
        { label: 'Balance', val: `${sym} ${formatIndianCurrency(totals.closingBalance)} ${totals.closingSide}` },
      ];

      summaryCards.forEach((c, i) => {
        const cx = startX + i * (cardWidth + 5);
        doc.roundedRect(cx, currentY, cardWidth, 28, 3).fillColor('#F8FAFC').fillAndStroke('#E2E8F0');
        doc.font(fontRegular).fontSize(7).fillColor('#64748B').text(c.label, cx + 5, currentY + 4);
        doc.font(fontBold).fontSize(8.5).fillColor('#0F172A').text(c.val, cx + 5, currentY + 14);
      });

      currentY += 36;

      // ─── 4. STATEMENT TABLE COLUMN SIZING & INVARIANTS ─────────────────────
      // Rules:
      // - Size numeric columns from the longest formatted value
      // - Never wrap amounts
      // - Put Dr/Cr in its own narrow column
      // - Wrap long particulars (no clipping with "...")
      // - Human voucher labels
      // - "Rs." used consistently
      const entries = statementData.entries || [];

      // Determine longest numbers across all data
      let maxDr = Math.max(totals.debitTotal || 0, ...entries.map((e: any) => Number(e.debit || 0)));
      let maxCr = Math.max(totals.creditTotal || 0, ...entries.map((e: any) => Number(e.credit || 0)));
      let maxBal = Math.max(totals.closingBalance || 0, opening.amount || 0, ...entries.map((e: any) => Number(e.runningBalance || 0)));

      // Measure text width using pdfkit helper
      doc.font(fontBold).fontSize(7.5);
      const strDr = formatIndianCurrency(maxDr);
      const strCr = formatIndianCurrency(maxCr);
      const strBal = formatIndianCurrency(maxBal);

      const headerDr = `Debit (${sym})`;
      const headerCr = `Credit (${sym})`;
      const headerBal = `Balance (${sym})`;

      const wDrCalc = Math.max(62, doc.widthOfString(strDr) + 16, doc.widthOfString(headerDr) + 10);
      const wCrCalc = Math.max(62, doc.widthOfString(strCr) + 16, doc.widthOfString(headerCr) + 10);
      const wBalCalc = Math.max(66, doc.widthOfString(strBal) + 16, doc.widthOfString(headerBal) + 10);

      const wDate = 50;
      const wType = 72;
      const wNo = 66;
      const wSide = 26; // Dedicated narrow Dr/Cr column

      const fixedWidth = wDate + wType + wNo + wDrCalc + wCrCalc + wBalCalc + wSide;
      const wParticulars = Math.max(116, pageWidth - fixedWidth);

      const colWidths = [wDate, wParticulars, wType, wNo, wDrCalc, wCrCalc, wBalCalc, wSide];
      const colX = [
        startX,
        startX + wDate,
        startX + wDate + wParticulars,
        startX + wDate + wParticulars + wType,
        startX + wDate + wParticulars + wType + wNo,
        startX + wDate + wParticulars + wType + wNo + wDrCalc,
        startX + wDate + wParticulars + wType + wNo + wDrCalc + wCrCalc,
        startX + wDate + wParticulars + wType + wNo + wDrCalc + wCrCalc + wBalCalc,
      ];

      // Helper function to render table header
      const renderTableHeader = (headerY: number) => {
        doc.rect(startX, headerY, pageWidth, 18).fill('#F1F5F9');
        doc.font(fontBold).fontSize(7.5).fillColor('#334155');
        doc.text('Date', colX[0] + 4, headerY + 5);
        doc.text('Particulars', colX[1] + 4, headerY + 5);
        doc.text('Type', colX[2] + 4, headerY + 5);
        doc.text('Voucher No.', colX[3] + 4, headerY + 5);
        doc.text(headerDr, colX[4] + 4, headerY + 5, { width: colWidths[4] - 8, align: 'right' });
        doc.text(headerCr, colX[5] + 4, headerY + 5, { width: colWidths[5] - 8, align: 'right' });
        doc.text(headerBal, colX[6] + 4, headerY + 5, { width: colWidths[6] - 8, align: 'right' });
        doc.text('Dr/Cr', colX[7] + 2, headerY + 5, { width: colWidths[7] - 4, align: 'center' });
      };

      // Initial header row
      renderTableHeader(currentY);
      currentY += 18;

      // ─── OPENING BALANCE ROW (b/f) ─────────────────────────────────────────
      // Rule 1: The opening entry appears ONLY as the "Opening Balance b/f" row, never as a transaction row
      doc.rect(startX, currentY, pageWidth, 16).fillColor('#FFFFFF').fillAndStroke('#E2E8F0');
      doc.font(fontBold).fontSize(7.5).fillColor('#0F172A');
      doc.text(periodFrom || '-', colX[0] + 4, currentY + 4, { width: colWidths[0] - 8, lineBreak: false });
      doc.text('Opening Balance', colX[1] + 4, currentY + 4, { width: colWidths[1] - 8, lineBreak: false });
      doc.text('Opening', colX[2] + 4, currentY + 4, { width: colWidths[2] - 8, lineBreak: false });
      doc.text('-', colX[3] + 4, currentY + 4, { width: colWidths[3] - 8, lineBreak: false });
      doc.text('-', colX[4] + 4, currentY + 4, { width: colWidths[4] - 8, align: 'right', lineBreak: false });
      doc.text('-', colX[5] + 4, currentY + 4, { width: colWidths[5] - 8, align: 'right', lineBreak: false });
      doc.text(formatIndianCurrency(opening.amount), colX[6] + 4, currentY + 4, { width: colWidths[6] - 8, align: 'right', lineBreak: false });
      doc.text(opening.side, colX[7] + 2, currentY + 4, { width: colWidths[7] - 4, align: 'center', lineBreak: false });

      currentY += 16;

      // ─── TRANSACTION ROWS WITH PAGE BREAKS & CARRIED FORWARD TOTALS ────────
      let runningPageDebits = 0;
      let runningPageCredits = 0;

      entries.forEach((entry: any, index: number) => {
        const dr = Number(entry.debit || 0);
        const cr = Number(entry.credit || 0);
        runningPageDebits += dr;
        runningPageCredits += cr;

        // Measure text height of particulars to ensure zero clipping / no truncation
        doc.font(fontRegular).fontSize(7);
        const partText = entry.particulars || '-';
        const particularsHeight = doc.heightOfString(partText, { width: colWidths[1] - 8 });
        const rowHeight = Math.max(14.5, particularsHeight + 4);

        // Check if row exceeds printable height (760)
        if (currentY + rowHeight > 760) {
          // Render Carried Forward line
          doc.rect(startX, currentY, pageWidth, 14).fill('#F8FAFC');
          doc.font(fontBold).fontSize(7).fillColor('#475569');
          doc.text('Carried Forward to Next Page >>', colX[1] + 4, currentY + 3, { lineBreak: false });
          doc.text(formatIndianCurrency(runningPageDebits), colX[4] + 4, currentY + 3, { width: colWidths[4] - 8, align: 'right', lineBreak: false });
          doc.text(formatIndianCurrency(runningPageCredits), colX[5] + 4, currentY + 3, { width: colWidths[5] - 8, align: 'right', lineBreak: false });

          doc.addPage();
          currentY = 25;

          // Header row repeated on new page
          renderTableHeader(currentY);
          currentY += 18;

          // Render Brought Forward line
          doc.rect(startX, currentY, pageWidth, 14).fill('#F8FAFC');
          doc.font(fontBold).fontSize(7).fillColor('#475569');
          doc.text('<< Brought Forward from Previous Page', colX[1] + 4, currentY + 3, { lineBreak: false });
          doc.text(formatIndianCurrency(runningPageDebits), colX[4] + 4, currentY + 3, { width: colWidths[4] - 8, align: 'right', lineBreak: false });
          doc.text(formatIndianCurrency(runningPageCredits), colX[5] + 4, currentY + 3, { width: colWidths[5] - 8, align: 'right', lineBreak: false });
          currentY += 14;
        }

        const isEven = index % 2 === 0;
        doc.rect(startX, currentY, pageWidth, rowHeight).fillColor(isEven ? '#FFFFFF' : '#F8FAFC').fillAndStroke('#E2E8F0');
        doc.font(fontRegular).fontSize(7).fillColor('#334155');

        // Date
        const dateFormatted = formatDateDMY(entry.date || entry.entryDate);
        doc.text(dateFormatted, colX[0] + 4, currentY + 4);

        // Particulars (wrap long text, no clipping with ellipsis)
        doc.text(partText, colX[1] + 4, currentY + 4, {
          width: colWidths[1] - 8,
          lineBreak: true,
          ellipsis: false,
        });

        // Human voucher label
        const humanType = getHumanVoucherType(entry.voucherType);
        doc.text(humanType, colX[2] + 4, currentY + 4, { width: colWidths[2] - 8 });

        // Voucher No.
        doc.text(entry.voucherNo || '-', colX[3] + 4, currentY + 4, { width: colWidths[3] - 8 });

        // Numeric amounts (never wrap)
        const drText = dr > 0 ? formatIndianCurrency(dr) : '-';
        const crText = cr > 0 ? formatIndianCurrency(cr) : '-';
        const balText = formatIndianCurrency(entry.runningBalance);

        doc.text(drText, colX[4] + 4, currentY + 4, { width: colWidths[4] - 8, align: 'right' });
        doc.text(crText, colX[5] + 4, currentY + 4, { width: colWidths[5] - 8, align: 'right' });
        doc.font(fontBold).text(balText, colX[6] + 4, currentY + 4, { width: colWidths[6] - 8, align: 'right' });

        // Separate narrow Dr/Cr column
        const sideText = entry.runningSide || (entry.side ? String(entry.side).toUpperCase() : 'Dr');
        doc.text(sideText, colX[7] + 2, currentY + 4, { width: colWidths[7] - 4, align: 'center' });

        currentY += rowHeight;
      });

      // ─── TOTALS ROW ────────────────────────────────────────────────────────
      if (currentY + 36 > 760) {
        doc.addPage();
        currentY = 25;
        renderTableHeader(currentY);
        currentY += 18;
      }

      doc.rect(startX, currentY, pageWidth, 18).fill('#E2E8F0');
      doc.font(fontBold).fontSize(7.5).fillColor('#0F172A');
      doc.text('TOTAL (TRANSACTIONS)', colX[1] + 4, currentY + 5);
      doc.text(formatIndianCurrency(totals.debitTotal), colX[4] + 4, currentY + 5, { width: colWidths[4] - 8, align: 'right' });
      doc.text(formatIndianCurrency(totals.creditTotal), colX[5] + 4, currentY + 5, { width: colWidths[5] - 8, align: 'right' });
      doc.text(formatIndianCurrency(totals.closingBalance), colX[6] + 4, currentY + 5, { width: colWidths[6] - 8, align: 'right' });
      doc.text(totals.closingSide, colX[7] + 2, currentY + 5, { width: colWidths[7] - 4, align: 'center' });

      currentY += 20;

      // ─── CLOSING BALANCE ROW (c/d) ─────────────────────────────────────────
      doc.rect(startX, currentY, pageWidth, 18).fill('#F1F5F9');
      doc.font(fontBold).fontSize(8).fillColor('#1E2A78');
      doc.text('CLOSING BALANCE c/d', colX[1] + 4, currentY + 5);
      doc.text(formatIndianCurrency(totals.closingBalance), colX[6] + 4, currentY + 5, { width: colWidths[6] - 8, align: 'right' });
      doc.text(totals.closingSide, colX[7] + 2, currentY + 5, { width: colWidths[7] - 4, align: 'center' });

      // ─── FOOTER WITH PAGE X OF Y ──────────────────────────────────────────
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.font(fontRegular).fontSize(7).fillColor('#94A3B8')
          .text('Generated from CRM Ledger System. Authoritative double-entry ledger statement.', startX, 795, { width: pageWidth - 100, align: 'left', lineBreak: false });
        doc.font(fontRegular).fontSize(7).fillColor('#64748B')
          .text(`Page ${i + 1} of ${range.count}`, startX + pageWidth - 90, 795, { width: 90, align: 'right', lineBreak: false });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
