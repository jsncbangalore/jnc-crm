/**
 * Playwright verification test for Purchase Bills Hub (Post-OCR Scan Removal).
 *
 * Requirements:
 * - Viewports: 1536x730 and 390px (390x844)
 * - Purchase Bills page loads cleanly
 * - Scan button ('Scan & Add New Bill' and 'Scan First Bill') is absent
 * - 'Record Purchase' opens modal cleanly and closes
 * - 'View Soft Copy' opens Digital Soft Copy viewer cleanly and closes
 * - Zero console errors or hook warnings throughout
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const BASE_URL = process.env.TEST_FRONTEND_URL || 'http://localhost:5173';
const STAFF_EMAIL = process.env.TEST_STAFF_EMAIL || 'tenant-admin@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'DevPassword@123';

const fakePurchaseBill = {
  id: 'pb-fake-test-999',
  invoiceNumber: 'PB-2026-VERIFY-01',
  vendorName: 'Apex Precision Technologies',
  vendorGstin: '29ABCDE1234F1Z5',
  billDate: '2026-11-03',
  subtotal: 25000,
  cgst: 2250,
  sgst: 2250,
  igst: 0,
  totalTax: 4500,
  grandTotal: 29500,
  status: 'verified',
  isVerified: true,
  documentUrl: null,
  softCopyData: {
    companyName: 'Apex Precision Technologies',
    companyGstin: '29ABCDE1234F1Z5',
    taxMode: 'cgst_sgst',
    items: [
      {
        skuCode: 'SKU-TEST-RESISTOR',
        description: 'Precision SMD Resistor 10k 1%',
        quantity: 1000,
        rate: 25,
        amount: 25000,
      },
    ],
  },
};

async function testViewport(browser, width, height, name) {
  console.log(`\n---------------------------------------------------------------`);
  console.log(`Testing Viewport: ${name} (${width}x${height})`);
  console.log(`---------------------------------------------------------------`);

  const context = await browser.newContext({
    viewport: { width, height },
  });
  const page = await context.newPage();

  const consoleLogs = [];
  const consoleErrors = [];
  const hookViolations = [];

  page.on('console', (msg) => {
    const text = msg.text();
    consoleLogs.push(`[${msg.type().toUpperCase()}] ${text}`);
    if (msg.type() === 'error') {
      consoleErrors.push(text);
    }
    if (/rendered more hooks|rendered fewer hooks|rules of hooks/i.test(text)) {
      hookViolations.push(text);
    }
  });

  page.on('pageerror', (err) => {
    const text = err.message || String(err);
    consoleErrors.push(`[PAGEERROR] ${text}`);
    if (/rendered more hooks|rendered fewer hooks|rules of hooks/i.test(text)) {
      hookViolations.push(text);
    }
  });

  // Intercept backend API requests for purchase bills with fake data
  await page.route('**/api/v1/inventory/purchase-bills*', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [fakePurchaseBill],
        }),
      });
    }
    return route.continue();
  });

  // Intercept project stock so modal can populate project dropdown
  await page.route('**/api/v1/inventory/project-stock*', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: [{ project: 'General Inventory' }],
      }),
    });
  });

  try {
    // 1. Sign In
    console.log(`[1] Authenticating at ${BASE_URL}/login...`);
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
        console.log('   Multi-company prompt detected, selecting first company...');
        await page.click('input[type="radio"]');
        await page.click('button:has-text("Continue")');
        await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
      }
    }
    console.log(`  ✓ Logged in successfully. Current URL: ${page.url()}`);

    // 2. Navigate to /bills
    console.log('[2] Navigating to Purchase Bills page (/bills)...');
    await page.goto(`${BASE_URL}/bills`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Purchase Bills', { timeout: 10000 });
    console.log('  ✓ Purchase Bills page loaded');

    // Dismiss cookie banner if present so it does not intercept touches on mobile
    const cookieBtn = page.locator('button:has-text("Accept all"), button:has-text("Reject optional")').first();
    if (await cookieBtn.isVisible()) {
      await cookieBtn.click();
      await page.waitForTimeout(300);
    }

    // 3. Confirm Scan & Add New Bill button is completely ABSENT
    console.log('[3] Verifying scan buttons are absent...');
    const scanHeaderBtn = await page.$$('button:has-text("Scan & Add New Bill")');
    assert.strictEqual(scanHeaderBtn.length, 0, 'Scan & Add New Bill button must NOT exist');

    const scanFirstBtn = await page.$$('button:has-text("Scan First Bill")');
    assert.strictEqual(scanFirstBtn.length, 0, 'Scan First Bill button must NOT exist');

    const bodyContent = await page.content();
    assert(!bodyContent.includes('Scan & Add New Bill'), 'Page must not contain "Scan & Add New Bill" text');
    console.log('  ✓ Confirmed: Scan & Add New Bill and Scan First Bill buttons are completely absent');

    // 4. Test "Record Purchase" Modal Open and Close
    console.log('[4] Opening Record Purchase modal...');
    const recordBtn = page.locator('button:has-text("Record Purchase")').first();
    await recordBtn.waitFor({ state: 'visible', timeout: 5000 });
    await recordBtn.click();

    // Confirm modal opened
    const recordModal = page.locator('text=Add Component & Record Purchase');
    await recordModal.waitFor({ state: 'visible', timeout: 5000 });
    console.log('  ✓ Record Purchase modal opened successfully');

    // Close modal via top header Close button
    const closeBtn = page.locator('button[title="Close"]').first();
    await closeBtn.click();
    await recordModal.waitFor({ state: 'hidden', timeout: 5000 });
    console.log('  ✓ Record Purchase modal closed cleanly');

    // 5. Test "View Soft Copy" Modal Open and Close
    console.log('[5] Opening Digital Soft Copy viewer...');
    const softCopyBtn = page.locator('button:has-text("View Soft Copy")').first();
    await softCopyBtn.waitFor({ state: 'visible', timeout: 5000 });
    await softCopyBtn.click();

    // Confirm Soft Copy modal opened
    const softCopyModal = page.locator('[data-testid="digital-soft-copy-backdrop"]');
    await softCopyModal.waitFor({ state: 'visible', timeout: 5000 });
    assert(await page.locator('text=Digital Soft Copy Purchase Invoice').count() > 0, 'Soft copy must show header');
    assert(await page.locator('text=Apex Precision Technologies').count() > 0, 'Soft copy must show vendor name');
    console.log('  ✓ Digital Soft Copy viewer opened successfully and displayed bill details');

    // Close Soft Copy modal by pressing Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    // If still open, click outside or close button
    if (await softCopyModal.isVisible()) {
      await page.mouse.click(10, 10);
    }
    await softCopyModal.waitFor({ state: 'hidden', timeout: 5000 });
    console.log('  ✓ Digital Soft Copy viewer closed cleanly');

    // 6. Screenshot capture for evidence
    const evidenceDir = path.resolve(__dirname, '../evidence');
    if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });
    const screenshotPath = path.join(evidenceDir, `purchase-bills-${name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`  ✓ Screenshot saved to evidence/purchase-bills-${name}.png`);

    // 7. Verify console errors and hook violations
    console.log('[7] Checking console integrity...');
    assert.strictEqual(hookViolations.length, 0, `React hook violations detected: ${hookViolations.join('; ')}`);
    assert.strictEqual(consoleErrors.length, 0, `Console errors detected: ${consoleErrors.join('; ')}`);
    console.log('  ✓ 0 Console errors, 0 Hook violations detected');

    console.log(`  ✓ Viewport ${name} passed with 100% success!`);
  } finally {
    await context.close();
  }
}

async function run() {
  console.log('===============================================================');
  console.log('PLAYWRIGHT VERIFICATION: PURCHASE BILLS HUB (NO SCAN FEATURE)');
  console.log('===============================================================');

  const browser = await chromium.launch({ headless: true });
  try {
    // 1536x730 Viewport (Desktop)
    await testViewport(browser, 1536, 730, '1536x730');

    // 390px Viewport (Mobile)
    await testViewport(browser, 390, 844, '390px');

    console.log('\n===============================================================');
    console.log('[PASS] ALL VIEWPORTS & FUNCTIONALITIES VERIFIED WITH ZERO ERRORS');
    console.log('===============================================================\n');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('\n[FAIL] Test encountered an error:', err);
  process.exit(1);
});
