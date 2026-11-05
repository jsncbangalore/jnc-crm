/**
 * Playwright script to verify:
 * 1. Invoices table 10 columns:
 *    Document Type, Doc Number, Customer & State, Buyer Order / PO, Dated, Taxable (₹), GST / Tax, Total Amount, Status, Actions
 * 2. Actions column contains a single 3-dots button (MoreVertical)
 * 3. Clicking 3-dots opens portaled dropdown with View Document, Edit Document, Download PDF, Print Document, Email to Customer
 * 4. Captures screenshot evidence
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.TEST_FRONTEND_URL || 'http://localhost:5173';
const ARTIFACT_DIR = 'C:\\Users\\JNC R&D\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824';
const EVIDENCE_DIR = path.resolve(__dirname, '../evidence');

const ADMIN_EMAIL = 'tenant-admin@example.com';
const PASSWORD = 'DevPassword@123';

async function performLogin(page, email, password) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="username"], #company-identifier', { timeout: 10000 });
  await page.fill('input[name="username"], #company-identifier', email);
  await page.fill('input[name="password"], #company-password', password);
  await page.click('button[type="submit"]');

  await page.waitForTimeout(1000);
  const continueBtn = page.locator('button:has-text("Continue")');
  if (await continueBtn.isVisible()) {
    console.log('Company selection screen detected, clicking Continue...');
    await continueBtn.click();
  }

  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  await page.waitForTimeout(1000);
}

async function run() {
  console.log('='.repeat(70));
  console.log('VERIFYING INVOICES TABLE COLUMNS AND 3-DOTS ACTIONS MENU');
  console.log('Frontend URL:', BASE_URL);
  console.log('='.repeat(70));

  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  let passed = 0;
  let failed = 0;

  function assertCondition(desc, condition) {
    if (condition) {
      passed++;
      console.log(`[PASS] ${desc}`);
    } else {
      failed++;
      console.error(`[FAIL] ${desc}`);
    }
  }

  try {
    console.log('\n1. Logging in...');
    await performLogin(page, ADMIN_EMAIL, PASSWORD);
    console.log('Logged in successfully. Destination URL:', page.url());

    console.log('\n2. Navigating to Invoices page...');
    await page.goto(`${BASE_URL}/invoices`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Verify 10 column headers
    console.log('\n3. Verifying table column headers...');
    const ths = await page.$$eval('table thead tr th', (els) => els.map((el) => el.innerText.trim()));
    console.log('Detected headers:', JSON.stringify(ths));

    const expectedHeaders = [
      'Document Type',
      'Doc Number',
      'Customer & State',
      'Buyer Order / PO',
      'Dated',
      'Taxable (₹)',
      'GST / Tax',
      'Total Amount',
      'Status',
      'Actions',
    ];

    assertCondition(
      'Header count is 10',
      ths.length === 10
    );

    for (let i = 0; i < expectedHeaders.length; i++) {
      assertCondition(
        `Header [${i}] is "${expectedHeaders[i]}" (actual: "${ths[i]}")`,
        ths[i] && ths[i].toLowerCase() === expectedHeaders[i].toLowerCase()
      );
    }

    // Verify 3-dots action buttons in table rows
    console.log('\n4. Verifying Actions column contains 3-dots button...');
    const actionButtons = await page.$$('button[aria-label^="Actions for invoice"], button[title="Document Actions"]');
    console.log(`Found ${actionButtons.length} 3-dots action buttons in the table.`);
    assertCondition(
      'Found at least one 3-dots action button',
      actionButtons.length > 0
    );

    // Verify individual buttons are NOT rendered directly in table row
    const firstRowButtons = await page.$$eval('table tbody tr:first-child td:last-child button', (btns) =>
      btns.map((b) => b.getAttribute('title') || b.getAttribute('aria-label') || b.innerText.trim())
    );
    console.log('Buttons inside first row Actions cell:', JSON.stringify(firstRowButtons));
    assertCondition(
      'Only 1 action button (the 3-dots trigger) exists in the table cell',
      firstRowButtons.length === 1
    );

    // Capture desktop table screenshot before opening menu
    const tableOverviewPath = path.join(EVIDENCE_DIR, 'evidence-invoices-10-columns-table.png');
    await page.screenshot({ path: tableOverviewPath, fullPage: false });
    const brainOverviewPath = path.join(ARTIFACT_DIR, 'evidence-invoices-10-columns-table.png');
    fs.copyFileSync(tableOverviewPath, brainOverviewPath);
    console.log(`Saved table overview screenshot: ${tableOverviewPath}`);

    // Click 3-dots button to open portaled dropdown menu
    console.log('\n5. Clicking 3-dots action button...');
    await actionButtons[0].click();
    await page.waitForTimeout(600);

    // Verify portaled dropdown menu items
    const dropdownItems = await page.$$eval('[role="menu"] button, .crm-dropdown-portal button, div.z-50 button', (els) =>
      els.map((el) => el.innerText.trim()).filter(Boolean)
    );
    console.log('Dropdown items visible:', JSON.stringify(dropdownItems));

    assertCondition(
      'Dropdown contains "View Document"',
      dropdownItems.some((item) => item.includes('View Document'))
    );
    assertCondition(
      'Dropdown contains "Edit Document"',
      dropdownItems.some((item) => item.includes('Edit Document'))
    );
    assertCondition(
      'Dropdown contains "Download PDF"',
      dropdownItems.some((item) => item.includes('Download PDF'))
    );
    assertCondition(
      'Dropdown contains "Print Document"',
      dropdownItems.some((item) => item.includes('Print Document'))
    );
    assertCondition(
      'Dropdown contains "Email to Customer"',
      dropdownItems.some((item) => item.includes('Email to Customer'))
    );

    // Capture screenshot with 3-dots menu open
    const menuOpenPath = path.join(EVIDENCE_DIR, 'evidence-invoices-3dots-dropdown-open.png');
    await page.screenshot({ path: menuOpenPath, fullPage: false });
    const brainMenuOpenPath = path.join(ARTIFACT_DIR, 'evidence-invoices-3dots-dropdown-open.png');
    fs.copyFileSync(menuOpenPath, brainMenuOpenPath);
    console.log(`Saved 3-dots menu open screenshot: ${menuOpenPath}`);

    // Test wide screen 1536px
    console.log('\n6. Testing 1536px wide screen viewport...');
    await page.setViewportSize({ width: 1536, height: 864 });
    await page.waitForTimeout(500);
    const widePath = path.join(EVIDENCE_DIR, 'evidence-invoices-wide-1536.png');
    await page.screenshot({ path: widePath, fullPage: false });
    const brainWidePath = path.join(ARTIFACT_DIR, 'evidence-invoices-wide-1536.png');
    fs.copyFileSync(widePath, brainWidePath);
    console.log(`Saved 1536px wide screenshot: ${widePath}`);

    console.log('\n' + '='.repeat(70));
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('='.repeat(70));

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
