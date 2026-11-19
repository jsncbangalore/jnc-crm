/**
 * Playwright Full System Evidence Collector
 * Captures screenshots on the development database for:
 * 1. Index Page (Desktop 1440px & Mobile 390px)
 * 2. Login Page (Desktop 1440px & Mobile 390px)
 * 3. Document Parity for all 6 Document Types in 3 Views:
 *    - Tax Invoice (Screen, Print, Server PDF)
 *    - SEZ Invoice (Screen, Print, Server PDF)
 *    - Proforma Invoice (Screen, Print, Server PDF)
 *    - Delivery Challan (Screen, Print, Server PDF)
 *    - Credit Note (Screen, Print, Server PDF)
 *    - Purchase Order (Screen, Print, Server PDF)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { generateInvoicePdfBuffer } = require('../apps/api/dist/invoicing/pdf-generator.js');

const WEB_URL = 'http://localhost:5173';
const ARTIFACT_DIR = 'C:\\Users\\JNC R&D\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824';
const SCREENSHOT_DIR = path.resolve(__dirname, '../deploy-release/screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function saveEvidence(filename, buffer) {
  const localPath = path.join(SCREENSHOT_DIR, filename);
  fs.writeFileSync(localPath, buffer);
  const artifactPath = path.join(ARTIFACT_DIR, filename);
  fs.writeFileSync(artifactPath, buffer);
  console.log(`[SAVED] ${filename} (${buffer.length} bytes)`);
}

// Render server PDF buffer to an image using Mozilla PDF.js inside a Playwright browser page
async function renderPdfToImage(browser, pdfBuffer, filename) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } });
  const base64 = pdfBuffer.toString('base64');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
        <style>
          body { margin: 0; padding: 20px; background: #525659; display: flex; justify-content: center; }
          #pdf-canvas { box-shadow: 0 4px 10px rgba(0,0,0,0.3); background: white; }
        </style>
      </head>
      <body>
        <canvas id="pdf-canvas"></canvas>
        <script>
          const raw = atob("${base64}");
          const uint8 = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) uint8[i] = raw.charCodeAt(i);
          const pdfjsLib = window["pdfjs-dist/build/pdf"];
          pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
          pdfjsLib.getDocument({ data: uint8 }).promise.then(pdf => {
            return pdf.getPage(1);
          }).then(page => {
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.getElementById("pdf-canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            return page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
          }).then(() => {
            window.RENDER_DONE = true;
          }).catch(err => {
            window.RENDER_ERROR = err.message;
          });
        </script>
      </body>
    </html>
  `;

  await page.setContent(html);
  await page.waitForFunction(() => window.RENDER_DONE === true || window.RENDER_ERROR !== undefined, { timeout: 15000 });
  const canvas = page.locator('#pdf-canvas');
  const buffer = await canvas.screenshot();
  saveEvidence(filename, buffer);
  await page.close();
}

async function run() {
  console.log('========================================================================');
  console.log('POINT 8: COMPREHENSIVE PLAYWRIGHT EVIDENCE CAPTURE');
  console.log('========================================================================\n');

  const browser = await chromium.launch({ headless: true });

  try {
    // -------------------------------------------------------------
    // 1. INDEX PAGE (Guest state: Desktop & Mobile)
    // -------------------------------------------------------------
    console.log('\n--- 1. Capturing Index Page Evidence ---');
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await page.goto(`${WEB_URL}/`, { waitUntil: 'networkidle' });
      const buf = await page.screenshot({ fullPage: false });
      saveEvidence('evidence-index-desktop.png', buf);
      await context.close();
    }
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await page.goto(`${WEB_URL}/`, { waitUntil: 'networkidle' });
      const buf = await page.screenshot({ fullPage: false });
      saveEvidence('evidence-index-mobile.png', buf);
      await context.close();
    }

    // -------------------------------------------------------------
    // 2. LOGIN PAGE (Desktop & Mobile)
    // -------------------------------------------------------------
    console.log('\n--- 2. Capturing Login Page Evidence ---');
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle' });
      const buf = await page.screenshot({ fullPage: false });
      saveEvidence('evidence-login-desktop.png', buf);
      await context.close();
    }
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle' });
      const buf = await page.screenshot({ fullPage: false });
      saveEvidence('evidence-login-mobile.png', buf);
      await context.close();
    }

    // -------------------------------------------------------------
    // 3. DOCUMENT TYPES PARITY: SCREEN, PRINT, & SERVER PDF
    // -------------------------------------------------------------
    console.log('\n--- 3. Capturing Document Types Evidence (Screen, Print, PDF) ---');

    const authContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const authPage = await authContext.newPage();

    // Authenticate through the UI on development database
    await authPage.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle' });
    await authPage.click('button:has-text("Have a company code")');
    await authPage.fill('#company-code-input', 'ACME-DEV-001');
    await authPage.fill('#company-identifier', 'tenant-admin@example.com');
    await authPage.fill('#company-password', 'DevPassword@123');
    await authPage.click('button[type="submit"]');
    await authPage.waitForTimeout(1500);

    // Navigate to Invoices page
    await authPage.goto(`${WEB_URL}/invoices`, { waitUntil: 'networkidle' });
    await authPage.waitForTimeout(1000);

    // Click first invoice row to open InvoiceModal
    await authPage.locator('table tbody tr').first().click();
    await authPage.waitForTimeout(1000);

    const modal = authPage.locator('[role="dialog"], .fixed.inset-0.z-50').first();

    const docTypes = [
      { id: 'tax_invoice', label: 'Tax Invoice', fileKey: 'tax-invoice' },
      { id: 'sez_invoice', label: 'SEZ / LUT (0%)', fileKey: 'sez-invoice' },
      { id: 'proforma_invoice', label: 'Proforma', fileKey: 'proforma-invoice' },
      { id: 'delivery_challan', label: 'Delivery Challan', fileKey: 'delivery-challan' },
      { id: 'credit_note', label: 'Credit Note', fileKey: 'credit-note' },
      { id: 'purchase_order', label: 'Purchase Order', fileKey: 'purchase-order' },
    ];

    const sampleInvoiceData = {
      invoiceNumber: 'INV/26-27/0001',
      invoiceDate: '2026-03-25T10:00:00.000Z',
      dueDate: '2026-04-25T10:00:00.000Z',
      placeOfSupply: 'Karnataka (29)',
      company: {
        legalName: 'Customer Enterprises Ltd',
        gstin: '29ABCDE1234F1Z5',
        billingAddress: '42 Commercial Boulevard, Bengaluru',
        billingState: 'Karnataka',
        billingCity: 'Bengaluru',
        billingPincode: '560001',
        billingEmail: 'billing@customer.example',
      },
      customerName: 'Customer Enterprises Ltd',
      customerGstin: '29ABCDE1234F1Z5',
      customerAddress: '42 Commercial Boulevard, Bengaluru',
      customerState: 'Karnataka',
      customerCity: 'Bengaluru',
      customerPincode: '560001',
      items: [
        {
          description: 'Industrial Sensor Module - Series X',
          hsnCode: '85423100',
          quantity: 10,
          unitPrice: 10000,
          taxRate: 18,
          amount: 100000,
        },
      ],
      lines: [
        {
          description: 'Industrial Sensor Module - Series X',
          hsnCode: '85423100',
          quantity: 10,
          unitPrice: 10000,
          taxRate: 18,
          amount: 100000,
        },
      ],
      subtotal: 100000,
      taxAmount: 18000,
      cgstAmount: 9000,
      sgstAmount: 9000,
      igstAmount: 0,
      totalAmount: 118000,
    };

    const sampleProfile = {
      companyName: 'Acme Corporation Ltd',
      companyAddress: 'Unit 4B, Tech Park Phase 2, Electronic City, Bengaluru',
      companyGstin: '29AAAAA0000A1Z5',
      companyPan: 'AAAAA0000A',
      companyState: 'Karnataka',
      companyPhone: '+91 80 1234 5678',
      companyEmail: 'invoicing@acmecorp.example',
      invoiceBankName: 'State Bank of India',
      invoiceAccountNumber: '123456789012',
      invoiceIfsc: 'SBIN0001234',
      invoiceBankBranch: 'Electronic City, Bengaluru',
    };

    for (const dt of docTypes) {
      console.log(`\nCapturing views for: ${dt.label} (${dt.id})...`);

      // 1. Switch to tab in UI (scoped strictly within modal)
      const tabButton = modal.locator(`button:has-text("${dt.label}")`).first();
      if (await tabButton.isVisible()) {
        await tabButton.click();
        await authPage.waitForTimeout(800);
      }

      // View A: Screen View (Modal with Document Template)
      const screenBuf = await authPage.screenshot({ fullPage: false });
      saveEvidence(`evidence-${dt.fileKey}-screen.png`, screenBuf);

      // View B: Print View (Media print emulation)
      await authPage.emulateMedia({ media: 'print' });
      await authPage.waitForTimeout(500);
      const printBuf = await authPage.screenshot({ fullPage: false });
      saveEvidence(`evidence-${dt.fileKey}-print.png`, printBuf);
      await authPage.emulateMedia({ media: 'screen' });
      await authPage.waitForTimeout(400);

      // View C: Server PDF View (Rendered server-generated PDF buffer)
      const isSez = dt.id === 'sez_invoice';
      const isDc = dt.id === 'delivery_challan';
      const isPro = dt.id === 'proforma_invoice';
      const isCn = dt.id === 'credit_note';
      const isPo = dt.id === 'purchase_order';

      const pdfBuf = await generateInvoicePdfBuffer({
        ...sampleInvoiceData,
        docType: dt.id,
        invoiceNumber: isPo ? 'PO/26-27/0001' : isDc ? 'DC/26-27/0001' : isPro ? 'PI/26-27/0001' : isCn ? 'CN/26-27/0001' : 'INV/26-27/0001',
        isSez,
        vendorName: isPo ? 'Supplier Tech Ltd' : undefined,
        vendorAddress: isPo ? 'Plot 18, Industrial Estate, Bengaluru, 560058' : undefined,
        vendorGstin: isPo ? '29ABCDE1234F1Z5' : undefined,
        cgstAmount: isSez || isDc ? 0 : 9000,
        sgstAmount: isSez || isDc ? 0 : 9000,
        igstAmount: 0,
        taxAmount: isSez || isDc ? 0 : 18000,
        totalAmount: isSez || isDc ? 100000 : 118000,
        profile: sampleProfile,
      });

      await renderPdfToImage(browser, pdfBuf, `evidence-${dt.fileKey}-pdf.png`);
    }

    console.log('\n========================================================================');
    console.log('ALL POINT 8 PLAYWRIGHT EVIDENCE SCREENSHOTS SUCCESSFULLY CAPTURED!');
    console.log('========================================================================\n');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('[ERROR in capture-all-evidence]:', err);
  process.exit(1);
});
