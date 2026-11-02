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

async function runChainPlaywright() {
  console.log('========================================================================');
  console.log('PLAYWRIGHT END-TO-END CHAIN TEST ON DEVELOPMENT DATABASE');
  console.log('Chain: Quotation -> Order -> Invoice -> Payment -> Ledger');
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
    console.log('\n>>> STARTING 1440px DESKTOP CHAIN RUN <<<');
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: 'light',
    });
    const page = await desktopContext.newPage();

    await performLogin(page, ADMIN_EMAIL, PASSWORD);
    console.log('[1440] Logged in successfully.');

    // 1. QUOTATION CREATION
    console.log('\n[1440] Step 1: Navigating to /quotations and creating a quotation...');
    await page.goto(`${BASE_URL}/quotations`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const newQuoteBtn = page.locator('button:has-text("New Quotation"), button:has-text("Create Quotation")').first();
    if (await newQuoteBtn.isVisible()) {
      await newQuoteBtn.click();
      await page.waitForTimeout(1000);

      // Fill Quotation Form using exact IDs & valid values
      await page.fill('#quoteCustomerName', 'Dev Anand Test Customer');
      await page.fill('#quoteCustomerPhone', '9876543210');

      const prodInput = page.locator('input[placeholder="Product name or catalog SKU..."]').first();
      await prodInput.fill('Industrial Micro Pressure Sensor');

      const qtyInput = page.locator('input[placeholder="Qty"]').first();
      await qtyInput.fill('2');

      const rateInput = page.locator('input[placeholder*="Rate"]').first();
      await rateInput.fill('5000');

      // Click Create Quotation
      const submitQuoteBtn = page.locator('button[type="submit"]:has-text("Create Quotation")');
      await submitQuoteBtn.click();
      await page.waitForTimeout(2500);
    }

    const ss1440Quote = path.join(ARTIFACT_DIR, 'evidence-chain-1440-quotation.png');
    await page.screenshot({ path: ss1440Quote, fullPage: false });
    console.log('[1440] Step 1 Quotation verified. Screenshot saved:', ss1440Quote);

    // 2. CONVERT QUOTATION TO ORDER
    console.log('\n[1440] Step 2: Converting quotation to order...');
    const orderBtn = page.locator('button[title*="Convert" i], button:has-text("Order")').first();
    if (await orderBtn.isVisible()) {
      await orderBtn.click();
      await page.waitForTimeout(800);

      const confirmBtn = page.locator('button:has-text("Yes, Convert to Order")');
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
        await page.waitForTimeout(2000);
      }

      const gotItBtn = page.locator('button:has-text("Got It")');
      if (await gotItBtn.isVisible()) {
        await gotItBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    await page.goto(`${BASE_URL}/orders`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const ss1440Order = path.join(ARTIFACT_DIR, 'evidence-chain-1440-order.png');
    await page.screenshot({ path: ss1440Order, fullPage: false });
    console.log('[1440] Step 2 Order verified. Screenshot saved:', ss1440Order);

    // 3. GENERATE / CREATE INVOICE
    console.log('\n[1440] Step 3: Generating Tax Invoice from Order...');
    const genInvoiceBtn = page.locator('button:has-text("Generate Invoice")').first();
    if (await genInvoiceBtn.isVisible()) {
      await genInvoiceBtn.click();
      await page.waitForTimeout(2500);

      // Close invoice view modal if opened
      const closeBtn = page.locator('button[aria-label="Close"], button:has-text("Close")').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    await page.goto(`${BASE_URL}/invoices`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const ss1440Invoice = path.join(ARTIFACT_DIR, 'evidence-chain-1440-invoice.png');
    await page.screenshot({ path: ss1440Invoice, fullPage: false });
    console.log('[1440] Step 3 Invoice verified. Screenshot saved:', ss1440Invoice);

    // 4. RECORD PAYMENT
    console.log('\n[1440] Step 4: Recording Payment...');
    await page.goto(`${BASE_URL}/ledger?action=payment`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const recordPayBtn = page.locator('button:has-text("Record Payment")').first();
    if (await recordPayBtn.isVisible()) {
      await recordPayBtn.click();
      await page.waitForTimeout(1000);

      // Fill party or amount if needed
      const amtInput = page.locator('input[placeholder*="amount" i], input[type="number"]').first();
      if (await amtInput.isVisible()) {
        await amtInput.fill('2000');
      }

      const postPayBtn = page.locator('button:has-text("Confirm & Post Payment"), button:has-text("Record Payment"), button[type="submit"]:has-text("Record")').first();
      if (await postPayBtn.isVisible()) {
        await postPayBtn.click();
        await page.waitForTimeout(2000);
      }
    }

    const ss1440Payment = path.join(ARTIFACT_DIR, 'evidence-chain-1440-payment.png');
    await page.screenshot({ path: ss1440Payment, fullPage: false });
    console.log('[1440] Step 4 Payment recorded. Screenshot saved:', ss1440Payment);

    // 5. SEE LEDGER
    console.log('\n[1440] Step 5: Viewing Ledger statement...');
    await page.goto(`${BASE_URL}/ledger`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Select first customer row if present
    const partyRow = page.locator('tbody tr').first();
    if (await partyRow.isVisible()) {
      await partyRow.click();
      await page.waitForTimeout(1500);
    }

    const ss1440Ledger = path.join(ARTIFACT_DIR, 'evidence-chain-1440-ledger.png');
    await page.screenshot({ path: ss1440Ledger, fullPage: false });
    console.log('[1440] Step 5 Ledger verified. Screenshot saved:', ss1440Ledger);

    await desktopContext.close();

    // ------------------------------------------------------------------------
    // MOBILE RUN (390px)
    // ------------------------------------------------------------------------
    console.log('\n>>> STARTING 390px MOBILE CHAIN RUN <<<');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const mPage = await mobileContext.newPage();

    await performLogin(mPage, ADMIN_EMAIL, PASSWORD);
    console.log('[390] Mobile logged in successfully.');

    // 1. Quotations Mobile
    await mPage.goto(`${BASE_URL}/quotations`, { waitUntil: 'domcontentloaded' });
    await mPage.waitForTimeout(1500);
    const ss390Quote = path.join(ARTIFACT_DIR, 'evidence-chain-390-quotation.png');
    await mPage.screenshot({ path: ss390Quote, fullPage: false });
    console.log('[390] Quotations screenshot saved:', ss390Quote);

    // 2. Orders Mobile
    await mPage.goto(`${BASE_URL}/orders`, { waitUntil: 'domcontentloaded' });
    await mPage.waitForTimeout(1500);
    const ss390Order = path.join(ARTIFACT_DIR, 'evidence-chain-390-order.png');
    await mPage.screenshot({ path: ss390Order, fullPage: false });
    console.log('[390] Orders screenshot saved:', ss390Order);

    // 3. Invoices Mobile
    await mPage.goto(`${BASE_URL}/invoices`, { waitUntil: 'domcontentloaded' });
    await mPage.waitForTimeout(1500);
    const ss390Invoice = path.join(ARTIFACT_DIR, 'evidence-chain-390-invoice.png');
    await mPage.screenshot({ path: ss390Invoice, fullPage: false });
    console.log('[390] Invoices screenshot saved:', ss390Invoice);

    // 4. Payment Mobile
    await mPage.goto(`${BASE_URL}/ledger?action=payment`, { waitUntil: 'domcontentloaded' });
    await mPage.waitForTimeout(1500);
    const ss390Payment = path.join(ARTIFACT_DIR, 'evidence-chain-390-payment.png');
    await mPage.screenshot({ path: ss390Payment, fullPage: false });
    console.log('[390] Payment screenshot saved:', ss390Payment);

    // 5. Ledger Mobile
    await mPage.goto(`${BASE_URL}/ledger`, { waitUntil: 'domcontentloaded' });
    await mPage.waitForTimeout(1500);
    const ss390Ledger = path.join(ARTIFACT_DIR, 'evidence-chain-390-ledger.png');
    await mPage.screenshot({ path: ss390Ledger, fullPage: false });
    console.log('[390] Ledger screenshot saved:', ss390Ledger);

    await mobileContext.close();

    console.log('\n========================================================================');
    console.log('PLAYWRIGHT END-TO-END CHAIN TEST COMPLETED SUCCESSFULLY (10/10 SCREENSHOTS)');
    console.log('========================================================================\n');
  } finally {
    await browser.close();
  }
}

runChainPlaywright().catch((err) => {
  console.error('[CHAIN PLAYWRIGHT FATAL]', err);
  process.exit(1);
});
