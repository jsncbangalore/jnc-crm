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

async function testNavbarDropdowns() {
  console.log('========================================================================');
  console.log('PLAYWRIGHT TEST: NAVBAR DROPDOWNS OVERFLOW & VISIBILITY VERIFICATION');
  console.log('Frontend URL:', BASE_URL);
  console.log('Artifacts Directory:', ARTIFACT_DIR);
  console.log('========================================================================\n');

  if (!fs.existsSync(ARTIFACT_DIR)) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('favicon') && !text.includes('Failed to load resource')) {
          errors.push(text);
        }
      }
    });

    console.log('1. Logging in as tenant admin...');
    await performLogin(page, ADMIN_EMAIL, PASSWORD);

    console.log('2. Waiting for navbar to be visible...');
    await page.waitForSelector('header', { timeout: 5000 });

    // 1) Test "More" Dropdown
    console.log('3. Clicking "More" button in navbar...');
    const moreBtn = await page.waitForSelector('button:has-text("More")', { timeout: 5000 });
    await moreBtn.click();
    await page.waitForTimeout(500);

    // Verify "Other Modules" popover is visible and not clipped
    const otherModulesHeading = await page.waitForSelector('text=Other Modules', { state: 'visible', timeout: 5000 });
    console.log('✓ "Other Modules" heading inside More dropdown is visible!');

    // Capture screenshot of "More" dropdown
    const moreScreenshotPath = path.join(ARTIFACT_DIR, 'evidence-navbar-more-dropdown.png');
    await page.screenshot({ path: moreScreenshotPath, fullPage: false });
    console.log('✓ Captured screenshot:', moreScreenshotPath);

    // Check bounding box of More dropdown popover
    const moreMenu = await page.locator('text=Other Modules').locator('xpath=ancestor::div[contains(@class, "rounded-2xl")]');
    const moreBox = await moreMenu.boundingBox();
    console.log('More Dropdown Bounding Box:', moreBox);
    if (moreBox && moreBox.height > 100) {
      console.log(`✓ More Dropdown height is ${moreBox.height}px (properly expanded, NOT clipped by 40px navbar)!`);
    } else {
      throw new Error(`More dropdown height is only ${moreBox?.height}px, seems clipped!`);
    }

    // 2) Test "Invoices" dropdown button
    console.log('4. Clicking "Invoices" dropdown arrow in navbar...');
    // Locate the Invoices menu button
    const invoicesMenuBtn = page.locator('button[title="Invoices Menu"]');
    await invoicesMenuBtn.click();
    await page.waitForTimeout(500);

    // Verify "Invoices Actions" is visible
    await page.waitForSelector('text=Invoices Actions', { state: 'visible', timeout: 5000 });
    console.log('✓ "Invoices Actions" quick menu is visible!');

    // Capture screenshot of "Invoices" dropdown
    const invoicesScreenshotPath = path.join(ARTIFACT_DIR, 'evidence-navbar-invoices-dropdown.png');
    await page.screenshot({ path: invoicesScreenshotPath, fullPage: false });
    console.log('✓ Captured screenshot:', invoicesScreenshotPath);

    const invoicesMenu = await page.locator('text=Invoices Actions').locator('xpath=ancestor::div[contains(@class, "rounded-2xl")]');
    const invoicesBox = await invoicesMenu.boundingBox();
    console.log('Invoices Dropdown Bounding Box:', invoicesBox);
    if (invoicesBox && invoicesBox.height > 100) {
      console.log(`✓ Invoices Dropdown height is ${invoicesBox.height}px (properly expanded, NOT clipped by 40px navbar)!`);
    } else {
      throw new Error(`Invoices dropdown height is only ${invoicesBox?.height}px, seems clipped!`);
    }

    // 3) Test "Quotations" dropdown button
    console.log('5. Clicking "Quotations" dropdown arrow in navbar...');
    const quotationsMenuBtn = page.locator('button[title="Quotations Menu"]');
    await quotationsMenuBtn.click();
    await page.waitForTimeout(500);

    await page.waitForSelector('text=Quotations Actions', { state: 'visible', timeout: 5000 });
    console.log('✓ "Quotations Actions" quick menu is visible!');

    const quoteScreenshotPath = path.join(ARTIFACT_DIR, 'evidence-navbar-quotations-dropdown.png');
    await page.screenshot({ path: quoteScreenshotPath, fullPage: false });
    console.log('✓ Captured screenshot:', quoteScreenshotPath);

    const quoteMenu = await page.locator('text=Quotations Actions').locator('xpath=ancestor::div[contains(@class, "rounded-2xl")]');
    const quoteBox = await quoteMenu.boundingBox();
    console.log('Quotations Dropdown Bounding Box:', quoteBox);
    if (quoteBox && quoteBox.height > 100) {
      console.log(`✓ Quotations Dropdown height is ${quoteBox.height}px (properly expanded, NOT clipped by 40px navbar)!`);
    } else {
      throw new Error(`Quotations dropdown height is only ${quoteBox?.height}px, seems clipped!`);
    }

    // 4) Verify console errors
    console.log('\nChecking console errors during test...');
    if (errors.length > 0) {
      console.warn('Console errors detected:', errors);
    } else {
      console.log('✓ 0 console errors detected!');
    }

    console.log('\n========================================================================');
    console.log('ALL NAVBAR DROPDOWN OVERFLOW & VISIBILITY TESTS PASSED SUCCESSFULLY!');
    console.log('========================================================================\n');
  } finally {
    await browser.close();
  }
}

testNavbarDropdowns().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
