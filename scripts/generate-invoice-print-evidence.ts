const fs = require('fs');
const path = require('path');
import { generateInvoicePdfBuffer } from '../apps/api/src/invoicing/pdf-generator';
const { chromium } = require('playwright');

const ARTIFACT_DIR = 'C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824';

async function renderPdfToPng(pdfBuffer: Buffer, outPngPath: string) {
  const pdfBase64 = pdfBuffer.toString('base64');
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <style>
    body { margin: 0; background: #fff; display: flex; flex-direction: column; align-items: center; }
    canvas { box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin: 20px; }
  </style>
</head>
<body>
  <div id="container"></div>
  <script>
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const raw = atob("${pdfBase64}");
    const uint8Array = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      uint8Array[i] = raw.charCodeAt(i);
    }

    pdfjsLib.getDocument({ data: uint8Array }).promise.then(async function(pdf) {
      const container = document.getElementById('container');
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        container.appendChild(canvas);

        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;
      }
      window.__PDF_RENDERED__ = true;
    }).catch(err => {
      console.error('Render error:', err);
      window.__PDF_ERROR__ = err.message;
    });
  </script>
</body>
</html>
  `;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 2000 } });
  await page.setContent(html);
  await page.waitForFunction(() => (window as any).__PDF_RENDERED__ || (window as any).__PDF_ERROR__, { timeout: 15000 });
  const canvas = await page.waitForSelector('canvas', { timeout: 10000 });
  await canvas.screenshot({ path: outPngPath });
  await browser.close();
}

async function main() {
  console.log('Generating PDF evidence for single authoritative renderer...');

  const mockCompanyProfile = {
    companyName: 'JNC CORPORATION PRIVATE LIMITED',
    tagline: 'Industrial & High-Tech Hardware Solutions',
    gstin: '29AABCJ1234F1Z5',
    pan: 'AABCJ1234F',
    cin: 'U72200KA2020PTC123456',
    addressLine1: 'Plot No. 42, Electronic City Phase 1',
    addressLine2: 'Hosur Road, Bengaluru',
    city: 'Bengaluru',
    state: 'Karnataka',
    stateCode: '29',
    pincode: '560100',
    phone: '+91 80 4123 4567',
    email: 'billing@jnccorp.com',
    website: 'https://jnccorp.com',
    bankName: 'HDFC Bank Ltd',
    bankAccountNo: '50200012345678',
    bankIfsc: 'HDFC0000123',
    bankBranch: 'Koramangala Branch',
  };

  // 1. INV 0008-Style Data: High Value / Long Name / Multi-line items with Genuine Rupee (₹) Font
  const inv0008Mock = {
    invoiceNumber: 'INV/26-27/0008',
    date: '2026-10-15',
    dueDate: '2026-11-14',
    customerName: 'Omni Retail Enterprises India Pvt Ltd',
    customerGstin: '29AABCO9999P1ZQ',
    customerAddress: 'Tower B, Tech Park, Whitefield, Bengaluru, Karnataka 560066',
    customerState: 'Karnataka',
    customerStateCode: '29',
    placeOfSupply: '29-Karnataka',
    paymentTerms: 'Net 30 Days',
    companyProfile: mockCompanyProfile,
    lines: [
      {
        description: 'Apple 16 Pro Max 1TB Natural Titanium - Model A3296 with Ceramic Shield Front and Textured Matte Glass Back',
        hsnCode: '85171300',
        quantity: 1,
        unit: 'PCS',
        unitPrice: 100000.00,
        taxRate: 18.00,
        cgstAmount: 9000.00,
        sgstAmount: 9000.00,
        igstAmount: 0.00,
        totalAmount: 118000.00,
      },
      {
        description: 'AppleCare+ 2-Year Comprehensive Accidental Protection Plan',
        hsnCode: '998719',
        quantity: 1,
        unit: 'NOS',
        unitPrice: 15000.00,
        taxRate: 18.00,
        cgstAmount: 1350.00,
        sgstAmount: 1350.00,
        igstAmount: 0.00,
        totalAmount: 17700.00,
      }
    ],
    subtotal: 115000.00,
    cgstAmount: 10350.00,
    sgstAmount: 10350.00,
    igstAmount: 0.00,
    roundOff: 0.00,
    totalAmount: 135700.00,
    amountInWords: 'INR One Lakh Thirty Five Thousand Seven Hundred Only',
  };

  // 2. SEZ under LUT (0% IGST)
  const sezLutMock = {
    invoiceNumber: 'SEZ/26-27/0001',
    docType: 'sez_invoice',
    isSez: true,
    sezType: 'lut',
    lutNumber: 'AD290326001234F',
    date: '2026-10-20',
    dueDate: '2026-11-19',
    customerName: 'Global Cloud Systems SEZ Unit III',
    customerGstin: '29AAACG8888L1Z1',
    customerAddress: 'SEZ Special Economic Zone, Cessna Business Park, Bengaluru 560103',
    customerState: 'Karnataka',
    customerStateCode: '29',
    placeOfSupply: '29-Karnataka',
    companyProfile: mockCompanyProfile,
    lines: [
      {
        description: 'High Performance Dedicated Server Infrastructure Blades 64C/512GB (SEZ Authorised Operations)',
        hsnCode: '84715000',
        quantity: 2,
        unit: 'UNITS',
        unitPrice: 250000.00,
        taxRate: 0.00,
        cgstAmount: 0.00,
        sgstAmount: 0.00,
        igstAmount: 0.00,
        totalAmount: 500000.00,
      }
    ],
    subtotal: 500000.00,
    cgstAmount: 0.00,
    sgstAmount: 0.00,
    igstAmount: 0.00,
    roundOff: 0.00,
    totalAmount: 500000.00,
    amountInWords: 'INR Five Lakhs Only',
  };

  // 3. SEZ on Payment of IGST (18% Integrated Tax)
  const sezIgstMock = {
    invoiceNumber: 'SEZ/26-27/0002',
    docType: 'sez_invoice',
    isSez: true,
    sezType: 'igst',
    date: '2026-10-22',
    dueDate: '2026-11-21',
    customerName: 'Apex Data Services SEZ Developer Unit',
    customerGstin: '29AABCA7777M1Z2',
    customerAddress: 'Manyata Embassy Business Park SEZ, Nagawara, Bengaluru 560045',
    customerState: 'Karnataka',
    customerStateCode: '29',
    placeOfSupply: '29-Karnataka',
    companyProfile: mockCompanyProfile,
    lines: [
      {
        description: 'Enterprise Optical Networking Transceivers 400G QSFP-DD (Authorised SEZ Supply on IGST Payment)',
        hsnCode: '85176290',
        quantity: 4,
        unit: 'PCS',
        unitPrice: 75000.00,
        taxRate: 18.00,
        cgstAmount: 0.00,
        sgstAmount: 0.00,
        igstAmount: 54000.00,
        totalAmount: 354000.00,
      }
    ],
    subtotal: 300000.00,
    cgstAmount: 0.00,
    sgstAmount: 0.00,
    igstAmount: 54000.00,
    roundOff: 0.00,
    totalAmount: 354000.00,
    amountInWords: 'INR Three Lakhs Fifty Four Thousand Only',
  };

  console.log('Rendering Inv 0008-Style Tax Invoice PDF Buffer...');
  const inv0008Pdf = await generateInvoicePdfBuffer(inv0008Mock, { copyLabel: 'Original for Recipient' });
  const inv0008PngPath = path.join(ARTIFACT_DIR, 'evidence-invoice-authoritative-pdf.png');
  await renderPdfToPng(inv0008Pdf, inv0008PngPath);
  console.log('Saved:', inv0008PngPath);

  console.log('Rendering SEZ LUT (0% IGST) PDF Buffer...');
  const sezLutPdf = await generateInvoicePdfBuffer(sezLutMock, { copyLabel: 'Original for Recipient' });
  const sezLutPngPath = path.join(ARTIFACT_DIR, 'evidence-sez-lut-pdf.png');
  await renderPdfToPng(sezLutPdf, sezLutPngPath);
  console.log('Saved:', sezLutPngPath);

  console.log('Rendering SEZ IGST (18% Integrated Tax) PDF Buffer...');
  const sezIgstPdf = await generateInvoicePdfBuffer(sezIgstMock, { copyLabel: 'Original for Recipient' });
  const sezIgstPngPath = path.join(ARTIFACT_DIR, 'evidence-sez-igst-pdf.png');
  await renderPdfToPng(sezIgstPdf, sezIgstPngPath);
  console.log('Saved:', sezIgstPngPath);

  console.log('All PDF evidence generated successfully!');
}

main().catch((err) => {
  console.error('Evidence generation failed:', err);
  process.exit(1);
});
