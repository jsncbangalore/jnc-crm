/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Playwright verification test for React Rules-of-Hooks compliance.
 *
 * Verifies that opening and closing:
 * 1. Invoice View Modal (InvoiceModal)
 * 2. Purchase Bill Soft Copy Modal (DigitalSoftCopyModal)
 * 3. Create Document Modal (CreateDocumentModal)
 * 4. Record Payment Modal (UnifiedRecordPaymentModal)
 *
 * 3 times each with fake data NEVER triggers:
 * - "Rendered more hooks than during the previous render"
 * - ErrorBoundary "Something went wrong" screen
 * - Any React hook ordering/count console errors or warnings
 */

const { chromium } = require('playwright');

const BASE_URL = process.env.TEST_FRONTEND_URL || 'http://localhost:5173';
const STAFF_EMAIL = process.env.TEST_STAFF_EMAIL || 'tenant-admin@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'DevPassword@123';

async function run() {
  console.log('='.repeat(70));
  console.log('   PLAYWRIGHT MODAL HOOK-CYCLE VERIFICATION TEST');
  console.log('='.repeat(70));
  console.log(` Target URL : ${BASE_URL}`);
  console.log(' Testing 4 modals x 3 open/close cycles each...');
  console.log('-'.repeat(70));

  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const capturedConsoleLogs = [];
  const hookViolations = [];
  const uncaughtErrors = [];

  page.on('console', (msg) => {
    const text = msg.text();
    capturedConsoleLogs.push(`[CONSOLE ${msg.type().toUpperCase()}] ${text}`);
    if (
      /rendered more hooks/i.test(text) ||
      /rendered fewer hooks/i.test(text) ||
      /order of hooks/i.test(text) ||
      /rules of hooks/i.test(text)
    ) {
      hookViolations.push(text);
      console.error(` >>> HOOK VIOLATION DETECTED in console: ${text}`);
    }
  });

  page.on('pageerror', (err) => {
    const text = err.message || String(err);
    capturedConsoleLogs.push(`[PAGEERROR] ${text}`);
    uncaughtErrors.push(text);
    if (
      /rendered more hooks/i.test(text) ||
      /rendered fewer hooks/i.test(text) ||
      /order of hooks/i.test(text) ||
      /rules of hooks/i.test(text)
    ) {
      hookViolations.push(text);
      console.error(` >>> HOOK VIOLATION DETECTED in pageerror: ${text}`);
    }
  });

  // Setup fake data
  const fakeInvoice = {
    id: 'inv_fake_hook_test_101',
    invoiceNumber: 'INV-2026-FAKE-01',
    invoiceDate: '2026-11-01',
    docType: 'tax_invoice',
    status: 'issued',
    paymentStatus: 'unpaid',
    customerName: 'Fake Customer Testing Ltd',
    customerGstin: '29ABCDE1234F1Z5',
    customerState: 'Karnataka',
    subtotal: 10000,
    cgstAmount: 900,
    sgstAmount: 900,
    igstAmount: 0,
    totalAmount: 11800,
    balanceDue: 11800,
    createdAt: new Date().toISOString(),
    signatorySettings: null,
    companyProfile: {
      companyName: 'Acme Testing Corp',
      gstin: '29AAAAA0000A1Z5',
      state: 'Karnataka',
    },
    lineItems: [
      {
        id: 'li_01',
        description: 'Quality Testing Hardware Module',
        hsnCode: '85312000',
        unit: 'NOS',
        quantity: 1,
        unitPrice: 10000,
        taxRate: 18,
        totalAmount: 11800,
      },
    ],
  };

  const fakePurchaseBill = {
    id: 'pb_fake_hook_test_201',
    invoiceNumber: 'BILL-PB-2026-01',
    vendorName: 'Apex Precision Supplies',
    vendorGstin: '29AAAAA0000A1Z5',
    billDate: '2026-11-01',
    subtotal: 20000,
    cgst: 1800,
    sgst: 1800,
    igst: 0,
    totalTax: 3600,
    grandTotal: 23600,
    status: 'verified',
    isVerified: true,
    documentUrl: null,
    softCopyData: {
      companyName: 'JNC Technologies Dev',
      companyGstin: '29ABCDE1234F1Z5',
      taxMode: 'cgst_sgst',
      items: [
        {
          skuCode: 'SKU-TEST-01',
          description: 'Precision Testing Probe',
          quantity: 10,
          rate: 2000,
          amount: 20000,
        },
      ],
    },
  };

  try {
    // 1. Login
    console.log('1. Signing in with staff credentials...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[name="username"], #company-identifier', { timeout: 10000 });
    await page.fill('input[name="username"], #company-identifier', STAFF_EMAIL);
    await page.fill('input[name="password"], #company-password', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    await Promise.race([
      page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 }).catch(() => {}),
      page.waitForSelector('text=Select company', { timeout: 15000 }).catch(() => {}),
    ]);

    if (page.url().includes('/login')) {
      const selectCompanyPrompt = await page.$('text=Select company');
      if (selectCompanyPrompt) {
        console.log('   -> Multi-company prompt detected, selecting first company...');
        await page.click('input[type="radio"]');
        await page.click('button:has-text("Continue")');
        await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
      }
    }
    console.log('   -> Signed in successfully. Landed on:', page.url());

    // Intercept with fake data
    await page.route('**/api/v1/invoices*', async (route) => {
      if (route.request().method() === 'GET') {
        const url = route.request().url();
        if (url.includes('/company-profile/completeness')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ missing: [] }),
          });
        }
        if (url.includes('/company-profile')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                companyName: 'Acme Testing Corp',
                gstin: '29AAAAA0000A1Z5',
                state: 'Karnataka',
              },
            }),
          });
        }
        if (url.includes('/generate-number') || url.includes('/next-number')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ nextNumber: 'INV-2026-FAKE-02' }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [fakeInvoice], total: 1 }),
        });
      }
      return route.continue();
    });

    await page.route('**/api/v1/inventory/purchase-bills*', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([fakePurchaseBill]),
        });
      }
      return route.continue();
    });

    // 2. Test Modal 1: InvoiceModal (View Invoice) - 3 cycles
    console.log('\n2. Testing Invoice View Modal (3 open/close cycles)...');
    await page.goto(`${BASE_URL}/invoices`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    for (let i = 1; i <= 3; i++) {
      console.log(`   [Cycle ${i}/3] Opening Invoice View Modal...`);
      const viewTrigger = page.locator('button[title*="View"], button:has-text("View"), tr:has-text("INV-2026-FAKE-01")').first();
      await viewTrigger.waitFor({ state: 'visible', timeout: 10000 });
      await viewTrigger.click();

      // Wait for modal to render
      const downloadBtn = page.locator('button:has-text("Download PDF")');
      await downloadBtn.waitFor({ state: 'visible', timeout: 8000 });
      await page.waitForTimeout(300);

      // Verify no ErrorBoundary error screen
      const errorBoundary = await page.$('text="Something went wrong"');
      if (errorBoundary) {
        throw new Error(`ErrorBoundary screen detected while opening InvoiceModal on cycle ${i}!`);
      }

      console.log(`   [Cycle ${i}/3] Closing Invoice View Modal...`);
      const closeBtn = page.locator('button[title="Close preview"], button:has-text("Close")').last();
      await closeBtn.click();
      await downloadBtn.waitFor({ state: 'hidden', timeout: 5000 });
      await page.waitForTimeout(300);
      console.log(`   [Cycle ${i}/3] Invoice View Modal closed cleanly.`);
    }

    // 3. Test Modal 2: CreateDocumentModal - 3 cycles
    console.log('\n3. Testing Create Document Modal (3 open/close cycles)...');
    for (let i = 1; i <= 3; i++) {
      console.log(`   [Cycle ${i}/3] Opening Create Document Modal...`);
      const createBtn = page.locator('button:has-text("Create Document")').first();
      await createBtn.waitFor({ state: 'visible', timeout: 8000 });
      await createBtn.click();

      // Wait for modal header
      const modalHeader = page.locator('text=Create Official GST / Dispatch Document');
      await modalHeader.waitFor({ state: 'visible', timeout: 8000 });
      await page.waitForTimeout(300);

      // Verify no ErrorBoundary error screen
      const errorBoundary = await page.$('text="Something went wrong"');
      if (errorBoundary) {
        throw new Error(`ErrorBoundary screen detected while opening CreateDocumentModal on cycle ${i}!`);
      }

      console.log(`   [Cycle ${i}/3] Closing Create Document Modal...`);
      const cancelBtn = page.locator('button:has-text("Cancel")').last();
      await cancelBtn.click();
      await modalHeader.waitFor({ state: 'hidden', timeout: 5000 });
      await page.waitForTimeout(300);
      console.log(`   [Cycle ${i}/3] Create Document Modal closed cleanly.`);
    }

    // 4. Test Modal 3: UnifiedRecordPaymentModal - 3 cycles
    console.log('\n4. Testing Payment Modal (UnifiedRecordPaymentModal) (3 open/close cycles)...');
    for (let i = 1; i <= 3; i++) {
      console.log(`   [Cycle ${i}/3] Opening Invoice View to trigger Payment Modal...`);
      const viewTrigger = page.locator('button[title*="View"], button:has-text("View"), tr:has-text("INV-2026-FAKE-01")').first();
      await viewTrigger.waitFor({ state: 'visible', timeout: 8000 });
      await viewTrigger.click();
      const downloadBtn = page.locator('button:has-text("Download PDF")');
      await downloadBtn.waitFor({ state: 'visible', timeout: 8000 });
      await page.waitForTimeout(300);

      console.log(`   [Cycle ${i}/3] Clicking Record Payment inside Invoice View...`);
      const recordPayBtn = page.locator('button:has-text("Record Payment")').first();
      await recordPayBtn.waitFor({ state: 'visible', timeout: 8000 });
      await recordPayBtn.click();

      // Wait for payment modal
      const payTitle = page.locator('#payment-modal-title');
      await payTitle.waitFor({ state: 'visible', timeout: 8000 });
      await page.waitForTimeout(300);

      // Verify no ErrorBoundary
      const errorBoundary = await page.$('text="Something went wrong"');
      if (errorBoundary) {
        throw new Error(`ErrorBoundary screen detected while opening UnifiedRecordPaymentModal on cycle ${i}!`);
      }

      console.log(`   [Cycle ${i}/3] Closing Payment Modal...`);
      await page.keyboard.press('Escape');
      await payTitle.waitFor({ state: 'hidden', timeout: 5000 });
      await page.waitForTimeout(300);

      // Close Invoice View modal
      const closeBtn = page.locator('button[title="Close preview"], button:has-text("Close")').last();
      await closeBtn.click();
      await downloadBtn.waitFor({ state: 'hidden', timeout: 5000 });
      await page.waitForTimeout(300);
      console.log(`   [Cycle ${i}/3] Payment Modal closed cleanly.`);
    }

    // 5. Test Modal 4: DigitalSoftCopyModal (Purchase Bill Soft Copy) - 3 cycles
    console.log('\n5. Testing Purchase Bill Soft Copy Modal (3 open/close cycles)...');
    await page.goto(`${BASE_URL}/bills`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    for (let i = 1; i <= 3; i++) {
      console.log(`   [Cycle ${i}/3] Opening Purchase Bill Soft Copy Modal...`);
      const softCopyBtn = page.locator('button:has-text("View Soft Copy")').first();
      await softCopyBtn.waitFor({ state: 'visible', timeout: 8000 });
      await softCopyBtn.click();

      // Wait for soft copy modal
      const modalBackdrop = page.locator('[data-testid="digital-soft-copy-backdrop"]');
      await modalBackdrop.waitFor({ state: 'visible', timeout: 8000 });
      await page.waitForTimeout(300);

      // Verify no ErrorBoundary error screen
      const errorBoundary = await page.$('text="Something went wrong"');
      if (errorBoundary) {
        throw new Error(`ErrorBoundary screen detected while opening DigitalSoftCopyModal on cycle ${i}!`);
      }

      console.log(`   [Cycle ${i}/3] Closing Purchase Bill Soft Copy Modal...`);
      const softCopyCloseBtn = modalBackdrop.locator('button:has-text("Close")');
      await softCopyCloseBtn.click();
      await modalBackdrop.waitFor({ state: 'hidden', timeout: 5000 });
      await page.waitForTimeout(300);
      console.log(`   [Cycle ${i}/3] Purchase Bill Soft Copy Modal closed cleanly.`);
    }

    // Summary & Assertions
    console.log('\n' + '='.repeat(70));
    console.log('   CYCLE TEST RESULTS & CONSOLE AUDIT');
    console.log('='.repeat(70));
    console.log(` Total Captured Console Messages : ${capturedConsoleLogs.length}`);
    console.log(` Uncaught Errors                : ${uncaughtErrors.length}`);
    console.log(` React Hook Order/Count Warnings : ${hookViolations.length}`);

    if (hookViolations.length > 0) {
      console.error('\n[FAIL] Hook violations were caught in the browser console:');
      hookViolations.forEach((h, idx) => console.error(`  ${idx + 1}. ${h}`));
      process.exit(1);
    }

    console.log('\n[PASS] All 4 modals opened and closed 3 times with zero hook violations and zero crash screens.');
    console.log('='.repeat(70));
  } catch (err) {
    console.error('\n[TEST RUN ERROR]:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
