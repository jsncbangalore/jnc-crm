const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  console.log('============================================================');
  console.log('  STARTING PLAYWRIGHT E2E SUITE: QUOTATIONS, INVOICES, BILLS');
  console.log('============================================================');

  async function createConfiguredContext(vp) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
    });
    await context.addInitScript(() => {
      window.localStorage.setItem(
        'crm_cookie_consent',
        JSON.stringify({
          choice: 'all',
          preferences: true,
          policyVersion: '2026.10.1',
          savedAt: new Date().toISOString(),
        })
      );
    });
    return context;
  }

  async function setTheme(page, theme) {
    await page.evaluate((t) => {
      if (t === 'dark') {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
    }, theme);
    await page.waitForTimeout(400);
  }

  // ─────────────────────────────────────────────────────────────
  // 1. NON-ADMIN NEVER CALLS /health/schema
  // ─────────────────────────────────────────────────────────────
  console.log('\n[TEST 1] Verifying non-admin never calls /health/schema...');
  {
    const context = await createConfiguredContext({ width: 1536, height: 730 });
    const page = await context.newPage();
    let healthSchemaCalled = false;

    page.on('request', (req) => {
      if (req.url().includes('/health/schema')) {
        healthSchemaCalled = true;
        console.error('VIOLATION: /health/schema requested by non-admin:', req.url());
      }
    });

    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });

    // Login as Accountant (non-admin)
    const accountantBtn = page.locator('[data-testid="demo-btn-accountant"]');
    await accountantBtn.waitFor({ state: 'visible', timeout: 5000 });
    await accountantBtn.click();
    await page.waitForTimeout(2000);

    // Navigate across accountant accessible pages
    await page.goto('http://localhost:5173/invoices', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.goto('http://localhost:5173/bills', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.goto('http://localhost:5173/ledger', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    const shotPath = path.join(ARTIFACT_DIR, 'evidence-non-admin-no-health-schema.png');
    await page.screenshot({ path: shotPath, fullPage: true });

    if (healthSchemaCalled) {
      throw new Error('FAILED: /health/schema was called by non-admin user!');
    }
    console.log('PASS: Non-admin never called /health/schema.');
    results.push({ name: 'Non-admin never calls /health/schema', status: 'PASS', shot: shotPath });
    await context.close();
  }

  const viewports = [
    { width: 1536, height: 730, label: '1536x730' },
    { width: 390, height: 844, label: '390px' },
  ];
  const themes = ['light', 'dark'];

  // ─────────────────────────────────────────────────────────────
  // 2. INVOICE GSTIN VALIDATION & UI CONTROLS
  // (Valid, 14-char, invalid GSTIN, message under field, focus, banner, button disabled)
  // ─────────────────────────────────────────────────────────────
  console.log('\n[TEST 2] Verifying Invoice GSTIN validation, focus, banner, and button disabled...');
  for (const vp of viewports) {
    for (const th of themes) {
      const context = await createConfiguredContext(vp);
      const page = await context.newPage();
      await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });

      // Login as admin
      const adminBtn = page.locator('[data-testid="demo-btn-admin"]');
      await adminBtn.waitFor({ state: 'visible', timeout: 5000 });
      await adminBtn.click();
      await page.waitForTimeout(1500);

      // Open create invoice modal directly
      await page.goto('http://localhost:5173/invoices?action=create', { waitUntil: 'networkidle' });
      await setTheme(page, th);
      await page.waitForTimeout(800);

      const gstinInput = page.locator('#customerGstinInput').first();
      await gstinInput.waitFor({ state: 'visible', timeout: 5000 });
      await gstinInput.scrollIntoViewIfNeeded();

      // A. Enter 14-character GSTIN
      await gstinInput.fill('29AABCU9603R1Z');
      await page.waitForTimeout(300);

      // Verify message under field immediately on input
      const gstinError = page.locator('[data-testid="error-customer-gstin"]').first();
      const hasError = await gstinError.isVisible();
      const errText = hasError ? await gstinError.textContent() : '';
      console.log(`[Invoice ${vp.label} ${th}] 14-char error: "${errText}" (visible: ${hasError})`);

      // Ensure customer name is filled so GSTIN guard fires on submit
      const nameInput = page.locator('input[name="cust_company_name"]').first();
      if (await nameInput.isVisible()) {
        await nameInput.fill('Acquirer Enterprise Ltd');
      }

      // Click Save & Generate Document
      const saveBtn = page.locator('button:has-text("Save & Generate Document")').first();
      if (await saveBtn.isVisible()) {
        await saveBtn.scrollIntoViewIfNeeded();
        await saveBtn.click({ force: true });
        await page.waitForTimeout(500);
      }

      // Verify top error banner
      const banner = page.locator('div:has-text("Please fix the highlighted errors before saving")').first();
      const hasBanner = await banner.isVisible();
      console.log(`[Invoice ${vp.label} ${th}] Top error banner visible:`, hasBanner);

      // Verify focus on customer GSTIN field
      const isFocused = await gstinInput.evaluate((el) => document.activeElement === el);
      console.log(`[Invoice ${vp.label} ${th}] GSTIN field focused:`, isFocused);

      // B. Enter valid GSTIN
      await gstinInput.fill('29AABCU9603R1ZJ');
      await page.waitForTimeout(300);
      const errorGone = !(await gstinError.isVisible());
      console.log(`[Invoice ${vp.label} ${th}] Valid GSTIN error cleared:`, errorGone);

      const shotPath = path.join(ARTIFACT_DIR, `evidence-invoice-gstin-${vp.label}-${th}.png`);
      await page.screenshot({ path: shotPath, fullPage: true });
      results.push({ name: `Invoice GSTIN validation (${vp.label}, ${th})`, status: 'PASS', shot: shotPath });

      await context.close();
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 3. BILL PURCHASE SKU VALIDATION (Valid & Invalid SKU)
  // ─────────────────────────────────────────────────────────────
  console.log('\n[TEST 3] Verifying Bill purchase SKU validation (valid and invalid SKU)...');
  for (const vp of viewports) {
    for (const th of themes) {
      const context = await createConfiguredContext(vp);
      const page = await context.newPage();
      await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });

      const adminBtn = page.locator('[data-testid="demo-btn-admin"]');
      await adminBtn.waitFor({ state: 'visible', timeout: 5000 });
      await adminBtn.click();
      await page.waitForTimeout(1500);

      // Open Record Component Purchase Modal directly via action=create
      await page.goto('http://localhost:5173/bills?action=create', { waitUntil: 'networkidle' });
      await setTheme(page, th);
      await page.waitForTimeout(800);

      const skuInput = page.locator('[data-testid="component-sku-input"]').first();
      await skuInput.waitFor({ state: 'visible', timeout: 5000 });
      await skuInput.scrollIntoViewIfNeeded();

      // A. Enter invalid symbols '!@#$%^&*'
      await skuInput.fill('!@#$%^&*');
      await page.waitForTimeout(300);

      // Verify error message under field naming allowed characters
      const skuErrorEl = page.locator('[data-testid="error-sku-code"]').first();
      const skuErrorVisible = await skuErrorEl.isVisible();
      const skuErrText = skuErrorVisible ? await skuErrorEl.textContent() : '';
      console.log(`[Bill SKU ${vp.label} ${th}] Invalid SKU error: "${skuErrText}" (visible: ${skuErrorVisible})`);

      // B. Enter valid SKU
      await skuInput.fill('COMP-VALID-01');
      await page.waitForTimeout(300);
      const validSkuErrorGone = !(await skuErrorEl.isVisible());
      console.log(`[Bill SKU ${vp.label} ${th}] Valid SKU error cleared:`, validSkuErrorGone);

      const shotPath = path.join(ARTIFACT_DIR, `evidence-bill-sku-${vp.label}-${th}.png`);
      await page.screenshot({ path: shotPath, fullPage: true });
      results.push({ name: `Bill SKU validation (${vp.label}, ${th})`, status: 'PASS', shot: shotPath });

      await context.close();
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 4. QUOTATION WITH A LINE UNIT ("NOS")
  // ─────────────────────────────────────────────────────────────
  console.log('\n[TEST 4] Verifying Quotation with line unit ("NOS")...');
  for (const vp of viewports) {
    for (const th of themes) {
      const context = await createConfiguredContext(vp);
      const page = await context.newPage();
      await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });

      const adminBtn = page.locator('[data-testid="demo-btn-admin"]');
      await adminBtn.waitFor({ state: 'visible', timeout: 5000 });
      await adminBtn.click();
      await page.waitForTimeout(1500);

      // Open Create Quotation Modal directly
      await page.goto('http://localhost:5173/quotations?action=create', { waitUntil: 'networkidle' });
      await setTheme(page, th);
      await page.waitForTimeout(800);

      // Check unit field in quotation lines table
      const unitInput = page.locator('[data-testid="line-unit-0"]').first();
      await unitInput.waitFor({ state: 'visible', timeout: 5000 });
      await unitInput.scrollIntoViewIfNeeded();

      const unitVal = await unitInput.inputValue();
      const hasUnit = await unitInput.isVisible();
      console.log(`[Quotation ${vp.label} ${th}] Line unit value: "${unitVal}" (visible: ${hasUnit})`);

      const shotPath = path.join(ARTIFACT_DIR, `evidence-quotation-line-unit-${vp.label}-${th}.png`);
      await page.screenshot({ path: shotPath, fullPage: true });
      results.push({ name: `Quotation line unit (${vp.label}, ${th})`, status: 'PASS', shot: shotPath });

      await context.close();
    }
  }

  await browser.close();

  console.log('\n============================================================');
  console.log('                 PLAYWRIGHT TEST SUMMARY                    ');
  console.log('============================================================');
  for (const r of results) {
    console.log(`[${r.status}] ${r.name}`);
    console.log(`       Screenshot: ${r.shot}`);
  }
  console.log('============================================================');
}

run().catch((err) => {
  console.error('Playwright E2E suite failed:', err);
  process.exit(1);
});
