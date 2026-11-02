const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.TEST_FRONTEND_URL || 'http://localhost:5173';
const ARTIFACT_DIR = 'C:\\Users\\JNC R&D\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824';

const ADMIN_EMAIL = 'tenant-admin@example.com';
const PASSWORD = 'DevPassword@123';

async function performLogin(page, email, password) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="username"], #company-identifier', { timeout: 10000 });
  await page.fill('input[name="username"], #company-identifier', email);
  await page.fill('input[name="password"], #company-password', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  await page.waitForTimeout(1500);
}

async function runInvoiceAndPrintTest() {
  console.log('========================================================================');
  console.log('PLAYWRIGHT TEST: INVOICE / DC VIEW LINES, PRINT STREAM & LOGO VERIFICATION');
  console.log('Frontend URL:', BASE_URL);
  console.log('Artifacts Directory:', ARTIFACT_DIR);
  console.log('========================================================================\n');

  if (!fs.existsSync(ARTIFACT_DIR)) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });

  try {
    // ------------------------------------------------------------------------
    // DESKTOP RUN (1440px)
    // ------------------------------------------------------------------------
    console.log('\n>>> STARTING 1440px DESKTOP VERIFICATION <<<');
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: 'light',
    });
    const page = await desktopContext.newPage();

    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
        console.error('[Browser Error]', msg.text());
      }
    });

    await performLogin(page, ADMIN_EMAIL, PASSWORD);
    console.log('[1440] Logged in successfully.');

    // Navigate to /invoices
    await page.goto(`${BASE_URL}/invoices`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Click on the first invoice row to open the Document View Modal
    const row = page.locator('table tbody tr').first();
    await row.waitFor({ state: 'visible', timeout: 10000 });
    await row.click();
    await page.waitForTimeout(1500);

    // Verify modal is open
    const modal = page.locator('#printable-tax-invoice');
    await modal.waitFor({ state: 'visible', timeout: 5000 });
    console.log('[1440] Document View Modal is open.');

    // Check for logo warning banner when logo is not added
    const logoBanner = page.locator('text=Document Logo Not Added: No company logo has been uploaded for documents yet');
    const isBannerVisible = await logoBanner.isVisible();
    console.log('[1440] Logo not added warning banner visible:', isBannerVisible);

    // Check for inline logo notice inside document
    const inlineNotice = page.locator('text=Logo not added (Upload in Company Branding)');
    const isInlineNoticeVisible = await inlineNotice.isVisible();
    console.log('[1440] Inline logo notice badge visible:', isInlineNoticeVisible);

    // Capture Invoice View Screenshot
    const invoiceModalPath = path.join(ARTIFACT_DIR, 'evidence-invoice-modal-1440.png');
    await page.screenshot({ path: invoiceModalPath, fullPage: false });
    console.log('[1440] Saved screenshot:', invoiceModalPath);

    // Switch to Delivery Challan tab
    const dcTab = page.getByRole('button', { name: 'Delivery Challan', exact: true });
    if (await dcTab.isVisible()) {
      await dcTab.click();
      await page.waitForTimeout(1000);
      console.log('[1440] Switched to Delivery Challan template.');

      const dcModalPath = path.join(ARTIFACT_DIR, 'evidence-delivery-challan-modal-1440.png');
      await page.screenshot({ path: dcModalPath, fullPage: false });
      console.log('[1440] Saved Delivery Challan screenshot:', dcModalPath);
    }

    // Verify Direct Print option is REMOVED, and only Authoritative PDF Print & Download exist
    const directPrintBtn = page.locator('button:has-text("Direct Print")');
    const directPrintCount = await directPrintBtn.count();
    console.log('[1440] Direct Print button count (Must be 0):', directPrintCount);
    if (directPrintCount > 0) {
      throw new Error('Direct Print option should be completely removed!');
    }

    const printBtn = page.locator('button:has-text("Print")').first();
    await printBtn.waitFor({ state: 'visible', timeout: 5000 });
    console.log('[1440] Single Authoritative PDF Print button is active.');

    const downloadPdfBtn = page.locator('button:has-text("Download PDF")');
    await downloadPdfBtn.waitFor({ state: 'visible', timeout: 5000 });
    console.log('[1440] Download PDF button is active.');

    // ------------------------------------------------------------------------
    // GAMMA TECH (ZERO LOGO CONFIGURED) RUN
    // ------------------------------------------------------------------------
    console.log('\n>>> TESTING GAMMA TECH (ZERO LOGO CONFIGURED) <<<');
    const gammaContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: 'light',
    });
    const pageGamma = await gammaContext.newPage();
    await performLogin(pageGamma, 'gamma-admin@example.com', 'DevPassword@123');
    await pageGamma.goto(`${BASE_URL}/invoices`, { waitUntil: 'domcontentloaded' });
    await pageGamma.waitForTimeout(2000);

    const rowGamma = pageGamma.locator('table tbody tr').first();
    if (await rowGamma.isVisible()) {
      await rowGamma.click();
      await pageGamma.waitForTimeout(1500);

      const bannerGamma = pageGamma.locator('text=Document Logo Not Added: No company logo has been uploaded for documents yet');
      const isBannerVisible = await bannerGamma.isVisible();
      console.log('[Gamma Tech - No Logo] Warning banner visible:', isBannerVisible);

      const inlineNoticeGamma = pageGamma.locator('text=Logo not added (Upload in Company Branding)');
      const isInlineNoticeVisible = await inlineNoticeGamma.isVisible();
      console.log('[Gamma Tech - No Logo] Inline document badge visible:', isInlineNoticeVisible);

      const noLogoModalPath = path.join(ARTIFACT_DIR, 'evidence-invoice-modal-no-logo-warning.png');
      await pageGamma.screenshot({ path: noLogoModalPath, fullPage: false });
      console.log('[Gamma Tech - No Logo] Saved No Logo Warning screenshot:', noLogoModalPath);

      // Open Direct Print Hub to verify no logo notice is handled gracefully in print preview
      const directPrintBtnGamma = pageGamma.locator('button:has-text("Direct Print")');
      if (await directPrintBtnGamma.isVisible()) {
        await directPrintBtnGamma.click();
        await pageGamma.waitForTimeout(1500);

        const noLogoPrintHubPath = path.join(ARTIFACT_DIR, 'evidence-direct-print-no-logo.png');
        await pageGamma.screenshot({ path: noLogoPrintHubPath, fullPage: false });
        console.log('[Gamma Tech - No Logo] Saved Direct Print No Logo screenshot:', noLogoPrintHubPath);
      }
    }

    // ------------------------------------------------------------------------
    // MOBILE RUN (390px)
    // ------------------------------------------------------------------------
    console.log('\n>>> STARTING 390px MOBILE VERIFICATION <<<');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobileContext.newPage();
    mobilePage.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(`[Mobile] ${msg.text()}`);
      }
    });

    await performLogin(mobilePage, ADMIN_EMAIL, PASSWORD);
    await mobilePage.goto(`${BASE_URL}/invoices`, { waitUntil: 'domcontentloaded' });
    await mobilePage.waitForTimeout(2000);

    const mobileRow = mobilePage.locator('.lg\\:hidden > div, .lg\\:hidden .card').first();
    await mobileRow.waitFor({ state: 'visible', timeout: 10000 });
    await mobileRow.click();
    await mobilePage.waitForTimeout(1500);

      const mobileModalPath = path.join(ARTIFACT_DIR, 'evidence-invoice-modal-390.png');
      await mobilePage.screenshot({ path: mobileModalPath, fullPage: false });
      console.log('[390] Saved Mobile Invoice Modal screenshot:', mobileModalPath);

      // Open Direct Print Hub on mobile
      const mobilePrintBtn = mobilePage.locator('button:has-text("Direct Print")');
      if (await mobilePrintBtn.isVisible()) {
        await mobilePrintBtn.click();
        await mobilePage.waitForTimeout(1500);

        const mobilePrintHubPath = path.join(ARTIFACT_DIR, 'evidence-direct-print-hub-390.png');
        await mobilePage.screenshot({ path: mobilePrintHubPath, fullPage: false });
        console.log('[390] Saved Mobile Direct Print Hub screenshot:', mobilePrintHubPath);
      }

    console.log('\n========================================================================');
    console.log('TEST SUMMARY:');
    console.log('Console Errors Detected:', consoleErrors.length);
    if (consoleErrors.length > 0) {
      consoleErrors.forEach((e) => console.log(' -', e));
    }
    console.log('ALL PLAYWRIGHT SCREENSHOTS SAVED SUCCESSFULLY.');
    console.log('========================================================================\n');
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runInvoiceAndPrintTest();
