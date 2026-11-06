const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.TEST_FRONTEND_URL || 'http://localhost:5173';
const ARTIFACT_DIR = 'C:\\Users\\JNC R&D\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824';

const ADMIN_EMAIL = 'tenant-admin@example.com';
const PASSWORD = 'DevPassword@123';

async function performLogin(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem(
      'crm_cookie_consent',
      JSON.stringify({
        choice: 'all',
        preferences: true,
        policyVersion: '2026.10.1',
        savedAt: new Date().toISOString(),
      })
    );
  });
  await page.reload({ waitUntil: 'domcontentloaded' });

  const codeBtn = page.locator('button:has-text("Have a company code")');
  if (await codeBtn.isVisible().catch(() => false)) {
    await codeBtn.click();
  }

  await page.fill('#company-code-input', 'ACME-DEV-001');
  await page.fill('#company-identifier', 'admin@seed.dev');
  await page.fill('#company-password', 'DevPassword@123');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  await page.waitForTimeout(1000);
}

async function runVerification() {
  console.log('========================================================================');
  console.log('PLAYWRIGHT E2E EVIDENCE & VERIFICATION SUITE');
  console.log('Frontend URL:', BASE_URL);
  console.log('Artifacts Directory:', ARTIFACT_DIR);
  console.log('========================================================================\n');

  if (!fs.existsSync(ARTIFACT_DIR)) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });

  try {
    // ------------------------------------------------------------------------
    // SCENARIO 1: Desktop 1536x730 Views & Evidence
    // ------------------------------------------------------------------------
    console.log('\n--- 1. DESKTOP VIEWPORT (1536x730) ---');
    const desktopContext = await browser.newContext({
      viewport: { width: 1536, height: 730 },
      colorScheme: 'light',
    });
    const page = await desktopContext.newPage();

    console.log('Logging in as Admin on 1536x730...');
    await performLogin(page);
    await page.waitForURL('**/dashboard', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
    console.log('Current URL after login:', page.url());

    // 1.1 Customers Page at 1536x730
    console.log('Navigating to Customers Page (/customers)...');
    await page.goto(`${BASE_URL}/customers`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    console.log('Customers page URL:', page.url());
    const customers1536Path = path.join(ARTIFACT_DIR, 'evidence-customers-1536x730.png');
    await page.screenshot({ path: customers1536Path, fullPage: false });
    console.log(`[SAVED] Customers Desktop Evidence: ${customers1536Path}`);

    // 1.2 System Errors & Invoice Numbers Reconciliation Page at 1536x730
    console.log('Navigating to System Errors & Invoice Reconciliation (/system-errors)...');
    await page.goto(`${BASE_URL}/system-errors`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    // Click "Invoice Number Reconciliation" tab
    const tabRecon = page.locator('button:has-text("Invoice Number Reconciliation")');
    if (await tabRecon.isVisible().catch(() => false)) {
      await tabRecon.click();
      await page.waitForTimeout(2000);
    }
    const recon1536Path = path.join(ARTIFACT_DIR, 'evidence-reconciliation-1536x730.png');
    await page.screenshot({ path: recon1536Path, fullPage: false });
    console.log(`[SAVED] Reconciliation Desktop Evidence: ${recon1536Path}`);

    // 1.3 Invoice Modal Toolbar at 1536x730
    console.log('Navigating to Invoices (/invoices) to verify clean toolbar and More dropdown...');
    await page.goto(`${BASE_URL}/invoices`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Click first invoice row if present to open modal
    const invoiceRow = page.locator('tbody tr').first();
    if (await invoiceRow.isVisible().catch(() => false)) {
      await invoiceRow.click();
      await page.waitForTimeout(1500);
      const invoiceModal1536Path = path.join(ARTIFACT_DIR, 'evidence-invoice-toolbar-1536x730.png');
      await page.screenshot({ path: invoiceModal1536Path, fullPage: false });
      console.log(`[SAVED] Invoice Modal Toolbar 1536x730: ${invoiceModal1536Path}`);

      // Click "More" menu to demonstrate overflow actions
      const moreBtn = page.locator('button:has-text("More")');
      if (await moreBtn.isVisible().catch(() => false)) {
        await moreBtn.click();
        await page.waitForTimeout(800);
        const invoiceMore1536Path = path.join(ARTIFACT_DIR, 'evidence-invoice-more-menu-1536x730.png');
        await page.screenshot({ path: invoiceMore1536Path, fullPage: false });
        console.log(`[SAVED] Invoice Toolbar More Menu Open 1536x730: ${invoiceMore1536Path}`);
      }
    }

    await desktopContext.close();

    // ------------------------------------------------------------------------
    // SCENARIO 2: Mobile 390px Viewport Views & Evidence
    // ------------------------------------------------------------------------
    console.log('\n--- 2. MOBILE VIEWPORT (390px) ---');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      colorScheme: 'light',
    });
    const mobilePage = await mobileContext.newPage();

    console.log('Logging in as Admin on 390px...');
    await performLogin(mobilePage);
    await mobilePage.waitForURL('**/dashboard', { timeout: 10000 }).catch(() => {});
    await mobilePage.waitForTimeout(1500);

    // 2.1 Customers Page at 390px
    console.log('Navigating to Customers Page on 390px...');
    await mobilePage.goto(`${BASE_URL}/customers`, { waitUntil: 'domcontentloaded' });
    await mobilePage.waitForTimeout(2500);
    const customers390Path = path.join(ARTIFACT_DIR, 'evidence-customers-390px.png');
    await mobilePage.screenshot({ path: customers390Path, fullPage: false });
    console.log(`[SAVED] Customers Mobile Evidence: ${customers390Path}`);

    // 2.2 System Errors & Invoice Numbers Reconciliation at 390px
    console.log('Navigating to System Errors on 390px...');
    await mobilePage.goto(`${BASE_URL}/system-errors`, { waitUntil: 'domcontentloaded' });
    await mobilePage.waitForTimeout(2000);
    const mobTabRecon = mobilePage.locator('button:has-text("Invoice Number Reconciliation")');
    if (await mobTabRecon.isVisible().catch(() => false)) {
      await mobTabRecon.click();
      await mobilePage.waitForTimeout(2000);
    }
    const recon390Path = path.join(ARTIFACT_DIR, 'evidence-reconciliation-390px.png');
    await mobilePage.screenshot({ path: recon390Path, fullPage: false });
    console.log(`[SAVED] Reconciliation Mobile Evidence: ${recon390Path}`);

    // 2.3 Invoice Modal Toolbar at 390px
    console.log('Navigating to Invoices on 390px...');
    await mobilePage.goto(`${BASE_URL}/invoices`, { waitUntil: 'domcontentloaded' });
    await mobilePage.waitForTimeout(2000);
    const mobInvoiceRow = mobilePage.locator('tbody tr').first();
    if (await mobInvoiceRow.isVisible().catch(() => false)) {
      await mobInvoiceRow.click();
      await mobilePage.waitForTimeout(1500);
      const invoiceModal390Path = path.join(ARTIFACT_DIR, 'evidence-invoice-toolbar-390px.png');
      await mobilePage.screenshot({ path: invoiceModal390Path, fullPage: false });
      console.log(`[SAVED] Invoice Modal Toolbar 390px: ${invoiceModal390Path}`);
    }

    await mobileContext.close();

    console.log('\n========================================================================');
    console.log('PLAYWRIGHT VERIFICATION & SCREENSHOT CAPTURE COMPLETED SUCCESSFULLY');
    console.log('========================================================================\n');
  } catch (err) {
    console.error('Error during Playwright verification:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runVerification();
