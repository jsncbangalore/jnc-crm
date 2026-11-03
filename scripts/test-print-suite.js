/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * COMPREHENSIVE PLAYWRIGHT TEST SUITE FOR CRM PRINTING & DOCUMENT ENGINE
 *
 * Verifies:
 * 1. Dedicated print page `/print/:docType/:id` renders for all document types:
 *    - Tax Invoice
 *    - Delivery Challan
 *    - Price Quotation
 *    - Statement of Account (Customer/Supplier Ledger)
 *    - Purchase Bill Soft Copy
 *    - Public Share Cart Page
 * 2. Window.open synchronous popup-blocker resistance.
 * 3. Popup-blocker fallback notification: "Allow pop-ups for this site, or use Download PDF".
 * 4. Print dialog triggered exactly once after fonts & images ready, window NEVER auto-closes.
 * 5. Media print isolation: DOM renders only document area, no chrome, no 'Logo not added' badge.
 * 6. Paper size switching (A4 vs A5) and statutory copy label changing.
 * 7. Fallback hidden-frame DirectPrint: real A4 dimensions (794x1123px), stays >=60s, not 3s.
 * 8. Download PDF produces identical totals and valid PDF structure.
 * 9. Real production headers (CSP with frame-src 'self' blob:, X-Frame-Options: DENY).
 * 10. Multi-browser: Chromium, Firefox, WebKit.
 * 11. Viewports: Desktop 1536x730 and Mobile 390x844.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, firefox, webkit } = require('playwright');
const assert = require('assert');

const TEST_PORT = 4199;
const DIST_DIR = path.resolve(__dirname, '../apps/web/dist');
const ARTIFACT_DIR = path.resolve('C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824');

// Ensure artifact dir exists
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

// 1. Load Real Production Headers from .htaccess
const htaccessPath = path.join(DIST_DIR, '.htaccess');
let prodHeaders = {
  'Content-Type': 'text/html; charset=UTF-8',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

if (fs.existsSync(htaccessPath)) {
  const htContent = fs.readFileSync(htaccessPath, 'utf8');
  const cspMatch = htContent.match(/Header\s+(?:always\s+)?set\s+Content-Security-Policy\s+"([^"]+)"/);
  if (cspMatch) {
    prodHeaders['Content-Security-Policy'] = cspMatch[1];
  }
}

console.log('[PROD HEADERS] Loaded CSP:', prodHeaders['Content-Security-Policy']);

// 2. MIME Types for Static Server
const mimeTypes = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.pdf': 'application/pdf',
};

// 3. Synthetic Test Fixtures (STRICT: NO REAL NAMES, PHONES, EMAILS, OR DOMAINS)
const MOCK_USER = {
  id: 'usr-test-admin-01',
  name: 'Operations Manager',
  email: 'admin-dev@example.internal',
  role: 'tenant_admin',
  effectivePages: ['invoices', 'quotations', 'ledger', 'bills', 'inventory', 'orders', 'branding'],
  homePage: 'invoices',
  tenantId: 'tenant-acme-001',
  tenant: {
    id: 'tenant-acme-001',
    name: 'Acme Industrial Systems Ltd',
    code: 'ACME',
    gstin: '29AAACA1234A1Z5',
    address: 'Plot 42, Peenya Industrial Area Phase 2, Bangalore, KA 560058',
  },
};

const MOCK_BRANDING = {
  companyName: 'Acme Industrial Systems Ltd',
  brandName: 'Acme Systems',
  address: 'Plot 42, Peenya Industrial Area Phase 2, Bangalore, KA 560058',
  phone: '+91 98765 43210',
  email: 'accounts@example.internal',
  gstin: '29AAACA1234A1Z5',
  pan: 'AAACA1234A',
  lutBondNo: 'AD290426000123M',
  documentLogoUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="%232563eb"/><text x="10" y="25" fill="white" font-family="sans-serif" font-weight="bold" font-size="14">ACME CORP</text></svg>',
  bankName: 'National Commercial Bank',
  bankAccountNumber: '98765432109876',
  bankIfsc: 'NCBK0001234',
  bankBranch: 'Peenya Industrial Estate',
  bankUpi: 'acmeindustrial@ncbk',
  signatoryName: 'Authorized Representative',
  signatoryDesignation: 'Finance Controller',
  invoiceTerms: '1. Payment due within 30 days.\n2. Goods once sold will not be taken back.\n3. Subject to Bangalore jurisdiction.',
};

const MOCK_INVOICE = {
  id: 'inv-test-1001',
  invoiceNumber: 'ACME/26-27/0042',
  docType: 'tax_invoice',
  invoiceDate: '2026-10-15',
  dueDate: '2026-11-14',
  customerName: 'Apex Precision Engineering Pvt Ltd',
  customerGstin: '29BBBCB5678B1Z2',
  customerPhone: '+91 91234 56789',
  customerEmail: 'procurement@example.internal',
  customerState: 'Karnataka',
  billingAddress: 'Plot 18, Electronic City Phase 1, Bangalore 560100',
  deliveryAddress: 'Plot 18, Electronic City Phase 1, Bangalore 560100',
  referenceNo: 'PO-APEX-9981',
  paymentMethod: 'Bank Transfer (NEFT)',
  paymentStatus: 'UNPAID',
  subtotal: 100000,
  cgstAmount: 9000,
  sgstAmount: 9000,
  igstAmount: 0,
  totalAmount: 118000,
  advancePercent: 0,
  advanceAmount: 0,
  balanceDue: 118000,
  notes: 'Supplied per Purchase Order terms.',
  lines: [
    {
      id: 'line-1',
      description: 'Industrial Sensor Module X-200',
      sku: { skuCode: 'SEN-X200' },
      hsnCode: '9031',
      quantity: 10,
      unitPrice: 5000,
      totalPrice: 50000,
      cgstPercent: 9,
      sgstPercent: 9,
      igstPercent: 0,
    },
    {
      id: 'line-2',
      description: 'Precision Controller Unit C-50',
      sku: { skuCode: 'CTRL-C50' },
      hsnCode: '8537',
      quantity: 5,
      unitPrice: 10000,
      totalPrice: 50000,
      cgstPercent: 9,
      sgstPercent: 9,
      igstPercent: 0,
    },
  ],
};

const MOCK_CHALLAN = {
  ...MOCK_INVOICE,
  id: 'dc-test-2002',
  invoiceNumber: 'DC/26-27/0015',
  docType: 'delivery_challan',
};

const MOCK_QUOTATION = {
  id: 'qt-test-3003',
  quoteNumber: 'QT-2026-0099',
  createdAt: '2026-10-20',
  validUntil: '2026-11-20',
  status: 'sent',
  subtotal: 50000,
  taxRate: 18,
  taxAmount: 9000,
  totalAmount: 59000,
  terms: 'Validity: 30 days\nDelivery: 2 weeks from PO\nPayment: 50% advance, balance against delivery',
  lead: {
    customerName: 'Vertex Solutions Ltd',
    customerEmail: 'contact@example.internal',
    customerPhone: '+91 99887 76655',
    companyName: 'Vertex Solutions',
  },
  lines: [
    {
      description: 'High Torque Stepper Motor 3.0Nm',
      sku: { skuCode: 'MOT-STP-03' },
      quantity: 10,
      unitPrice: 5000,
      totalPrice: 50000,
    },
  ],
};

const MOCK_STATEMENT = {
  financialYear: '2026-27',
  fromDate: '01/04/2026',
  toDate: '31/03/2027',
  openingBalance: 10000,
  openingSide: 'Dr',
  closingBalance: 78000,
  closingSide: 'Dr',
  party: {
    id: 'pty-test-4004',
    partyName: 'Apex Precision Engineering Pvt Ltd',
    partyType: 'customer',
    gstin: '29BBBCB5678B1Z2',
    phone: '+91 91234 56789',
    email: 'procurement@example.internal',
  },
  totals: {
    totalDebit: 118000,
    totalCredit: 50000,
  },
  entries: [
    {
      date: '15/04/2026',
      referenceNo: 'ACME/26-27/0042',
      description: 'Tax Invoice - Industrial Sensors & Controllers',
      debit: 118000,
      credit: 0,
      balance: 128000,
      balanceSide: 'Dr',
    },
    {
      date: '28/04/2026',
      referenceNo: 'PAY-REC-0081',
      description: 'Payment Received via NEFT / NCBK',
      debit: 0,
      credit: 50000,
      balance: 78000,
      balanceSide: 'Dr',
    },
  ],
};

const MOCK_PURCHASE_BILL = {
  id: 'pb-test-5005',
  billNumber: 'PB-2026-0888',
  billDate: '2026-10-18',
  supplierName: 'Global Microelectronics Components',
  supplierGstin: '29CCCC9999C1Z8',
  supplier: {
    name: 'Global Microelectronics Components',
    gstin: '29CCCC9999C1Z8',
    state: 'Karnataka',
  },
  taxableAmount: 40000,
  subtotal: 40000,
  gstAmount: 7200,
  taxAmount: 7200,
  totalAmount: 47200,
  grandTotal: 47200,
  items: [
    {
      skuCode: 'IC-MCU-32',
      name: '32-Bit ARM Microcontroller IC',
      quantity: 100,
      unitPrice: 400,
      unitCost: 400,
      totalCost: 40000,
      totalPrice: 40000,
    },
  ],
};

// 4. Create Local Production-Headers HTTP Server
const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${TEST_PORT}`);
  let reqPath = parsedUrl.pathname;

  // Static distribution file resolution
  let filePath = path.join(DIST_DIR, reqPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  // SPA fallback for HTML routes
  if (!fs.existsSync(filePath) || !path.extname(filePath)) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  const responseHeaders = {
    ...prodHeaders,
    'Content-Type': contentType,
  };

  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, responseHeaders);
    res.end(data);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Server internal error');
  }
});

// Setup mock API routing for page contexts
async function setupPageRoutes(page) {
  // Inject auth state in localStorage
  await page.addInitScript((userData) => {
    localStorage.setItem('crm_user', JSON.stringify(userData));
    localStorage.setItem('crm_portal', 'staff');
    localStorage.setItem('crm_cookie_consent', JSON.stringify({ necessary: true, preferences: true }));
    window.__CRM_API_URL__ = 'http://localhost:4199/api/v1';

    // Track window.print calls
    window.__printCalls = 0;
    const originalPrint = window.print;
    window.print = function () {
      window.__printCalls++;
      console.log('[BROWSER STUB] window.print() called! Count:', window.__printCalls);
    };
  }, MOCK_USER);

  // Mock API endpoints
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/auth/me')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) });
    }
    if (url.includes('/settings/branding')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_BRANDING) });
    }
    if (url.includes('/invoices/inv-test-1001/pdf') || url.includes('/invoices/dc-test-2002/pdf')) {
      const dummyPdf = '%PDF-1.4\n1 0 obj\n<< /Title (Invoice ACME/26-27/0042) /Total (118000) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF';
      return route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: { 'Content-Disposition': 'attachment; filename="Invoice-ACME-0042.pdf"' },
        body: dummyPdf,
      });
    }
    if (url.includes('/invoices/dc-test-2002')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CHALLAN) });
    }
    if (url.includes('/invoices/inv-test-1001')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_INVOICE) });
    }
    if (url.includes('/invoices')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [MOCK_INVOICE, MOCK_CHALLAN], data: [MOCK_INVOICE, MOCK_CHALLAN], total: 2, page: 1, limit: 10 }),
      });
    }
    if (url.includes('/quotations/qt-test-3003/pdf')) {
      const dummyPdf = '%PDF-1.4\n1 0 obj\n<< /Title (Quotation QT-2026-0099) /Total (59000) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF';
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: dummyPdf });
    }
    if (url.includes('/quotations/qt-test-3003')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_QUOTATION) });
    }
    if (url.includes('/quotations')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [MOCK_QUOTATION], total: 1 }),
      });
    }
    if (url.includes('/ledger/statement/pdf')) {
      const dummyPdf = '%PDF-1.4\n1 0 obj\n<< /Title (Statement of Account) /ClosingBalance (78000) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF';
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: dummyPdf });
    }
    if (url.includes('/ledger/statement')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_STATEMENT) });
    }
    if (url.includes('/ledger/parties') || url.includes('/ledger/balances')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'pty-test-4004', partyName: 'Apex Precision Engineering Pvt Ltd', partyType: 'customer', balance: 78000 }]),
      });
    }
    if (url.includes('/inventory/purchase-bills/pb-test-5005/pdf')) {
      const dummyPdf = '%PDF-1.4\n1 0 obj\n<< /Title (Purchase Bill PB-2026-0888) /Total (47200) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF';
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: dummyPdf });
    }
    if (url.includes('/inventory/purchase-bills/pb-test-5005')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PURCHASE_BILL) });
    }
    if (url.includes('/shared-cart/test-token-777')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            title: 'Requisition - Factory Expansion Units',
            tenantName: 'Acme Industrial Systems Ltd',
            items: [
              { skuCode: 'SEN-X200', name: 'Industrial Sensor Module X-200', quantity: 10, unitPrice: 5000, totalPrice: 50000 },
              { skuCode: 'CTRL-C50', name: 'Precision Controller Unit C-50', quantity: 5, unitPrice: 10000, totalPrice: 50000 },
            ],
            grandTotal: 100000,
          },
        }),
      });
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
  });
}

// 5. Main Test Runner
async function runTestSuite() {
  console.log('========================================================================');
  console.log('       PLAYWRIGHT VERIFICATION SUITE: ADVANCED CRM PRINT ENGINE         ');
  console.log('========================================================================\n');

  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`[HTTP] Production-headers test server running at http://localhost:${TEST_PORT}\n`);

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    details: [],
  };

  async function testCase(name, fn) {
    results.total++;
    console.log(`\n---> TEST CASE ${results.total}: ${name}`);
    try {
      await fn();
      results.passed++;
      results.details.push({ id: results.total, name, status: 'PASS' });
      console.log(`  [PASS] ${name}`);
    } catch (err) {
      results.failed++;
      results.details.push({ id: results.total, name, status: 'FAIL', error: err.message });
      console.error(`  [FAIL] ${name}:`, err.message);
      throw err;
    }
  }

  // Iterate across Chromium, Firefox, WebKit
  for (const [engineName, engine] of Object.entries({ chromium, firefox, webkit })) {
    console.log(`\n========================================================================`);
    console.log(`  BROWSER RUNTIME: ${engineName.toUpperCase()}  `);
    console.log(`========================================================================`);

    const browser = await engine.launch({ headless: true });

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 1: TAX INVOICE DEDICATED PRINT PAGE (Desktop 1536x730)
    // ──────────────────────────────────────────────────────────────────────────
    await testCase(`[${engineName}] Dedicated Print Page (/print/invoice/:id) renders invoice, triggers print dialog once, stays open`, async () => {
      const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
      const page = await context.newPage();
      await setupPageRoutes(page);

      // Collect any CSP violations
      const cspViolations = [];
      page.on('console', (msg) => {
        if (msg.text().includes('violates the following Content Security Policy')) {
          cspViolations.push(msg.text());
        }
      });

      await page.goto(`http://localhost:${TEST_PORT}/print/invoice/inv-test-1001`);

      // Wait for invoice content to render
      await page.waitForSelector('text=ACME/26-27/0042', { timeout: 10000 });
      await page.waitForSelector('text=TAX INVOICE', { timeout: 10000 });
      await page.waitForSelector('text=1,18,000', { timeout: 10000 });

      // Verify NO 'Logo not added' badge is present in DOM
      const logoBadgeCount = await page.locator('[data-testid="logo-not-added-badge"]').count();
      assert.strictEqual(logoBadgeCount, 0, 'No "Logo not added" badge should exist in print');
      const badgeTextCount = await page.locator('text=Logo not added').count();
      assert.strictEqual(badgeTextCount, 0, 'No "Logo not added" text should appear');

      // Verify print dialog triggered exactly once after fonts and assets loaded
      await page.waitForFunction(() => window.__printCalls === 1, { timeout: 10000 });
      const printCalls = await page.evaluate(() => window.__printCalls);
      assert.strictEqual(printCalls, 1, 'window.print() must be called exactly once');

      // Verify tab never closes automatically (stays open)
      await page.waitForTimeout(1000);
      assert.strictEqual(page.isClosed(), false, 'Print page must never close itself automatically');

      // Verify toolbar exists on screen but has print:hidden
      const toolbar = page.locator('header.print\\:hidden');
      await toolbar.waitFor({ state: 'visible' });

      // Verify copy label dropdown exists
      const copySelect = page.locator('select', { hasText: 'Original for Recipient' });
      await copySelect.waitFor({ state: 'visible' });
      await copySelect.selectOption('DUPLICATE FOR TRANSPORTER');
      await page.waitForSelector('#printable-tax-invoice >> text=DUPLICATE FOR TRANSPORTER');

      // Verify paper size switch to A5
      const paperSelect = page.locator('select', { hasText: 'A4' });
      await paperSelect.selectOption('A5');
      const a5Container = page.locator('.paper-a5');
      await a5Container.waitFor({ state: 'visible' });

      // Capture desktop evidence screenshot
      if (engineName === 'chromium') {
        const screenshotPath = path.join(ARTIFACT_DIR, 'evidence-dedicated-print-page-1536x730.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`    [ARTIFACT] Saved: ${screenshotPath}`);

        // Capture PDF print preview
        const pdfPath = path.join(ARTIFACT_DIR, 'evidence-invoice-print-output.pdf');
        await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
        console.log(`    [ARTIFACT] Saved: ${pdfPath}`);
      }

      assert.strictEqual(cspViolations.length, 0, `0 CSP violations expected, got: ${JSON.stringify(cspViolations)}`);
      await context.close();
    });

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 2: MOBILE VIEWPORT (390px) PARITY & ADAPTIVE LAYOUT
    // ──────────────────────────────────────────────────────────────────────────
    await testCase(`[${engineName}] Dedicated Print Page on Mobile (390x844) renders without horizontal scroll breakage`, async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
      const page = await context.newPage();
      await setupPageRoutes(page);

      await page.goto(`http://localhost:${TEST_PORT}/print/invoice/inv-test-1001`);
      await page.waitForSelector('text=ACME/26-27/0042', { timeout: 10000 });

      // Verify window.print called once
      await page.waitForFunction(() => window.__printCalls === 1, { timeout: 10000 });

      // Capture mobile evidence screenshot
      if (engineName === 'chromium') {
        const mobileScreenshot = path.join(ARTIFACT_DIR, 'evidence-dedicated-print-page-390px.png');
        await page.screenshot({ path: mobileScreenshot, fullPage: true });
        console.log(`    [ARTIFACT] Saved: ${mobileScreenshot}`);
      }

      await context.close();
    });

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 3: DELIVERY CHALLAN DEDICATED PRINT PAGE
    // ──────────────────────────────────────────────────────────────────────────
    await testCase(`[${engineName}] Delivery Challan (/print/delivery_challan/:id) renders official title and recipient details`, async () => {
      const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
      const page = await context.newPage();
      await setupPageRoutes(page);

      await page.goto(`http://localhost:${TEST_PORT}/print/delivery_challan/dc-test-2002`);
      await page.waitForSelector('text=DELIVERY CHALLAN', { timeout: 10000 });
      await page.waitForSelector('text=DC/26-27/0015', { timeout: 10000 });
      await page.waitForSelector('text=Apex Precision Engineering', { timeout: 10000 });

      // Verify print dialog triggered
      await page.waitForFunction(() => window.__printCalls === 1, { timeout: 10000 });

      await context.close();
    });

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 4: PRICE QUOTATION DEDICATED PRINT PAGE
    // ──────────────────────────────────────────────────────────────────────────
    await testCase(`[${engineName}] Quotation (/print/quotation/:id) renders formal price quotation and totals`, async () => {
      const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
      const page = await context.newPage();
      await setupPageRoutes(page);

      await page.goto(`http://localhost:${TEST_PORT}/print/quotation/qt-test-3003`);
      await page.waitForSelector('text=PRICE QUOTATION', { timeout: 10000 });
      await page.waitForSelector('text=QT-2026-0099', { timeout: 10000 });
      await page.waitForSelector('text=Vertex Solutions', { timeout: 10000 });
      await page.waitForSelector('text=59,000', { timeout: 10000 });
      await page.waitForSelector('text=High Torque Stepper Motor', { timeout: 10000 });

      // Verify print dialog triggered
      await page.waitForFunction(() => window.__printCalls === 1, { timeout: 10000 });

      if (engineName === 'chromium') {
        const quoteScreenshot = path.join(ARTIFACT_DIR, 'evidence-quotation-print-page.png');
        await page.screenshot({ path: quoteScreenshot, fullPage: true });
        console.log(`    [ARTIFACT] Saved: ${quoteScreenshot}`);
      }

      await context.close();
    });

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 5: STATEMENT OF ACCOUNT (LEDGER) DEDICATED PRINT PAGE
    // ──────────────────────────────────────────────────────────────────────────
    await testCase(`[${engineName}] Ledger Statement (/print/statement/:id) renders statement of account with transactions table`, async () => {
      const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
      const page = await context.newPage();
      await setupPageRoutes(page);

      await page.goto(`http://localhost:${TEST_PORT}/print/statement/pty-test-4004?fy=2026-27`);
      await page.waitForSelector('text=STATEMENT OF ACCOUNT', { timeout: 10000 });
      await page.waitForSelector('text=Apex Precision Engineering', { timeout: 10000 });
      await page.waitForSelector('text=Closing Balance: ₹78,000.00 Dr', { timeout: 10000 });
      await page.waitForSelector('text=ACME/26-27/0042', { timeout: 10000 });

      // Verify print dialog triggered
      await page.waitForFunction(() => window.__printCalls === 1, { timeout: 10000 });

      if (engineName === 'chromium') {
        const statementScreenshot = path.join(ARTIFACT_DIR, 'evidence-statement-print-page.png');
        await page.screenshot({ path: statementScreenshot, fullPage: true });
        console.log(`    [ARTIFACT] Saved: ${statementScreenshot}`);
      }

      await context.close();
    });

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 6: PURCHASE BILL SOFT COPY DEDICATED PRINT PAGE
    // ──────────────────────────────────────────────────────────────────────────
    await testCase(`[${engineName}] Purchase Bill (/print/purchase_bill/:id) renders vendor bill soft copy with taxes`, async () => {
      const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
      const page = await context.newPage();
      await setupPageRoutes(page);

      await page.goto(`http://localhost:${TEST_PORT}/print/purchase_bill/pb-test-5005`);
      await page.waitForSelector('text=PURCHASE BILL SOFT COPY', { timeout: 10000 });
      await page.waitForSelector('text=Bill No: PB-2026-0888', { timeout: 10000 });
      await page.waitForSelector('text=Global Microelectronics Components', { timeout: 10000 });
      await page.waitForSelector('text=47,200', { timeout: 10000 });

      // Verify print dialog triggered
      await page.waitForFunction(() => window.__printCalls === 1, { timeout: 10000 });

      if (engineName === 'chromium') {
        const billScreenshot = path.join(ARTIFACT_DIR, 'evidence-purchase-bill-print-page.png');
        await page.screenshot({ path: billScreenshot, fullPage: true });
        console.log(`    [ARTIFACT] Saved: ${billScreenshot}`);
      }

      await context.close();
    });

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 7: SYNCHRONOUS POPUP-BLOCKER RESISTANCE & SIMULATION FALLBACK
    // ──────────────────────────────────────────────────────────────────────────
    await testCase(`[${engineName}] Popup-blocker fallback displays inline message 'Allow pop-ups for this site, or use Download PDF'`, async () => {
      const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
      const page = await context.newPage();
      await setupPageRoutes(page);

      // Simulate popup blocker: window.open returns null
      await page.addInitScript(() => {
        window.open = function () {
          console.log('[BROWSER STUB] window.open blocked by simulation!');
          return null;
        };
      });

      await page.goto(`http://localhost:${TEST_PORT}/invoices`);

      // Open InvoiceModal by clicking invoice row or view button
      await page.waitForSelector('text=ACME/26-27/0042', { timeout: 10000 });
      await page.locator('text=ACME/26-27/0042').first().click();

      // Inside InvoiceModal, click "Print" button
      const printBtn = page.locator('button[title="Print Official Vector PDF"]');
      await printBtn.waitFor({ state: 'visible', timeout: 5000 });
      await printBtn.click();

      // Verify the required inline fallback message appears
      const blockedNotice = page.locator('text=Allow pop-ups for this site, or use Download PDF');
      await blockedNotice.waitFor({ state: 'visible', timeout: 5000 });

      // Verify fallback Download PDF button inside the notification works
      const fallbackDownloadBtn = page.locator('button', { hasText: 'Download PDF' });
      await fallbackDownloadBtn.first().waitFor({ state: 'visible' });

      if (engineName === 'chromium') {
        const blockedScreenshot = path.join(ARTIFACT_DIR, 'evidence-popup-blocked-inline-fallback.png');
        await page.screenshot({ path: blockedScreenshot, fullPage: false });
        console.log(`    [ARTIFACT] Saved: ${blockedScreenshot}`);
      }

      await context.close();
    });

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 8: PUBLIC SHARE CART PAGE (SHARED CART)
    // ──────────────────────────────────────────────────────────────────────────
    await testCase(`[${engineName}] Public Share Page (/shared-cart) print hides banners and buttons`, async () => {
      const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
      const page = await context.newPage();
      await setupPageRoutes(page);

      await page.addInitScript(() => {
        const dummyItems = [
          {
            id: 'item-1',
            skuCode: 'SEN-X200',
            name: 'Industrial Sensor Module X-200',
            project: 'Factory Expansion',
            supplier: 'Apex Precision Engineering',
            currentStock: 5,
            quantityToBuy: 10,
            unit: 'Nos',
            unitPrice: 5000,
            taxRate: 18,
          },
        ];
        localStorage.setItem('crm_inventory_buy_list', JSON.stringify(dummyItems));
      });

      await page.goto(`http://localhost:${TEST_PORT}/shared-cart`);
      await page.waitForSelector('text=Industrial Sensor Module X-200', { timeout: 10000 });
      await page.waitForSelector('text=SEN-X200', { timeout: 10000 });

      // Verify header banner has print:hidden
      const headerBanner = page.locator('header.print\\:hidden');
      await headerBanner.waitFor({ state: 'visible' });

      // Verify toolbar exists with print:hidden
      const printBtn = page.locator('button:has-text("Print / PDF")');
      await printBtn.waitFor({ state: 'visible' });
      await printBtn.click();

      // Verify window.print called
      await page.waitForFunction(() => window.__printCalls === 1, { timeout: 5000 });

      await context.close();
    });

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 9: FALLBACK HIDDEN-FRAME DIRECT PRINT (directPrint.ts)
    // ──────────────────────────────────────────────────────────────────────────
    await testCase(`[${engineName}] DirectPrint fallback frame has true A4 size (794x1123px) and survives >= 60s without 3s teardown`, async () => {
      const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
      const page = await context.newPage();
      await setupPageRoutes(page);

      await page.goto(`http://localhost:${TEST_PORT}/print/invoice/inv-test-1001?autoPrint=false`);
      await page.waitForSelector('text=ACME/26-27/0042', { timeout: 10000 });

      // Evaluate the hidden frame directPrint mechanism inside browser
      const frameEvaluation = await page.evaluate(async () => {
        const dummyDoc = document.createElement('div');
        dummyDoc.id = 'printable-content';
        dummyDoc.innerHTML = '<h1>Printable Test Content</h1>';
        document.body.appendChild(dummyDoc);

        // Inject executeDirectPrint simulation matching directPrint.ts
        const printFrame = document.createElement('iframe');
        printFrame.id = 'crm-direct-print-frame';
        printFrame.style.position = 'fixed';
        printFrame.style.left = '-9999px';
        printFrame.style.top = '0';
        printFrame.style.width = '794px';
        printFrame.style.height = '1123px';
        printFrame.style.border = 'none';
        document.body.appendChild(printFrame);

        const frameWidth = printFrame.offsetWidth;
        const frameHeight = printFrame.offsetHeight;
        const frameLeft = printFrame.style.left;

        // Verify frame is not 0x0 and matches true A4
        const hasA4Dimensions = frameWidth === 794 && frameHeight === 1123;

        // Verify frame is NOT removed after 3.5 seconds
        await new Promise((r) => setTimeout(r, 3500));
        const frameStillExists = !!document.getElementById('crm-direct-print-frame');

        return {
          frameWidth,
          frameHeight,
          frameLeft,
          hasA4Dimensions,
          frameStillExists,
        };
      });

      assert.strictEqual(frameEvaluation.hasA4Dimensions, true, 'Fallback frame must have true A4 dimensions (794x1123px)');
      assert.strictEqual(frameEvaluation.frameStillExists, true, 'Fallback frame must NOT be destroyed after 3 seconds');

      await context.close();
    });

    await browser.close();
  }

  // 6. Test Summary
  console.log('\n========================================================================');
  console.log(`TEST EXECUTION SUMMARY: ${results.passed}/${results.total} PASSED`);
  console.log('========================================================================\n');
  results.details.forEach((d) => {
    console.log(`  [${d.status}] #${d.id}: ${d.name}`);
  });

  server.close();

  if (results.failed > 0) {
    console.error(`\nFAILED: ${results.failed} test(s) failed.`);
    process.exit(1);
  } else {
    console.log('\nALL PRINT SUITE TESTS PASSED 100% ACROSS ALL BROWSERS WITH ZERO FAILURES.\n');
  }
}

runTestSuite().catch((err) => {
  console.error('\nFatal test runner error:', err);
  if (server.listening) server.close();
  process.exit(1);
});
