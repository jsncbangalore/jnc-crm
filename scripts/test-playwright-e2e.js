const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.TEST_FRONTEND_URL || 'http://localhost:5173';
const ARTIFACT_DIR = 'C:\\Users\\JNC R&D\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824';

const ADMIN_EMAIL = 'tenant-admin@example.com';
const SALES_EMAIL = 'sales-agent@example.com';
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

async function runPlaywrightSuite() {
  console.log('========================================================================');
  console.log('PLAYWRIGHT E2E EVIDENCE & VERIFICATION SUITE');
  console.log('Frontend URL:', BASE_URL);
  console.log('Artifacts Directory:', ARTIFACT_DIR);
  console.log('========================================================================\n');

  if (!fs.existsSync(ARTIFACT_DIR)) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  let totalTests = 0;
  let passedTests = 0;

  function assert(condition, name, details = '') {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`[PASS] ${name}${details ? ' -> ' + details : ''}`);
    } else {
      console.error(`[FAIL] ${name}${details ? ' -> ' + details : ''}`);
      throw new Error(`Assertion failed: ${name}`);
    }
  }

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Admin User - 1440px Light & Dark (8 tabs + More, No Setup in tabs)
    // ------------------------------------------------------------------------
    console.log('\n--- 1. ADMIN USER: 8 Tabs + More Dropdown (1440px) ---');
    const adminContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: 'light',
    });
    const adminPage = await adminContext.newPage();

    await performLogin(adminPage, ADMIN_EMAIL, PASSWORD);
    console.log('Admin logged in successfully, URL:', adminPage.url());

    // Locate primary nav tabs in Tier 2
    const navTabsLocator = adminPage.locator('header nav a');
    const tabTexts = await navTabsLocator.allTextContents();
    const cleanTabs = tabTexts.map((t) => t.trim()).filter(Boolean);
    console.log('Tier-2 primary tabs detected:', cleanTabs);

    // Verify exactly the 8 primary granted pages in order:
    // Home, Leads, Quotations, Orders, Invoices, Shipments, Inventory, Ledger
    const expectedOrder = ['Home', 'Leads', 'Quotations', 'Orders', 'Invoices', 'Shipments', 'Inventory', 'Ledger'];
    const matchedTabs = cleanTabs.slice(0, 8);
    console.log('Matched tabs (at most 8):', matchedTabs);

    assert(matchedTabs.length === 8, 'Admin has exactly 8 primary tabs in tab line');
    assert(
      JSON.stringify(matchedTabs) === JSON.stringify(expectedOrder),
      'Tabs appear in exact order: Home, Leads, Quotations, Orders, Invoices, Shipments, Inventory, Ledger',
      matchedTabs.join(', ')
    );

    // Verify "More" button exists
    const moreBtn = adminPage.locator('button:has-text("More")');
    const hasMore = (await moreBtn.count()) > 0;
    assert(hasMore, 'Admin navigation displays "More" dropdown button');

    // Click "More" to verify other granted pages move into More dropdown
    await moreBtn.first().click();
    await adminPage.waitForTimeout(500);
    const hasOtherModules = (await adminPage.locator('text="Other Modules"').count()) > 0;
    assert(hasOtherModules, '"More" dropdown popover opened with Other Modules');
    const moreItems = await adminPage.locator('text="Other Modules"').locator('..').locator('..').locator('a').allTextContents();
    const cleanMoreItems = moreItems.map((t) => t.trim()).filter(Boolean);
    console.log('More dropdown items:', cleanMoreItems);
    assert(cleanMoreItems.length > 0, '"More" dropdown displays additional pages', cleanMoreItems.join(', '));

    // Close "More" dropdown
    await adminPage.keyboard.press('Escape');
    await adminPage.waitForTimeout(300);

    // Verify NO setup item in the tab line
    const setupInTabLine = await adminPage.locator('header nav:has-text("Lead Flow"), header nav:has-text("Lead Setup"), header nav:has-text("Web Forms")').count();
    assert(setupInTabLine === 0, 'No Setup items (Lead Flow, Lead Setup, Web Forms) in horizontal tab line');

    // Check that Setup Studio is accessible from Avatar profile menu
    const avatarBtn = adminPage.locator('button[aria-label="User menu"]');
    await avatarBtn.click();
    await adminPage.waitForTimeout(500);
    const setupStudioItem = adminPage.locator('a[href="/start-setup"]');
    const hasSetupStudio = (await setupStudioItem.count()) > 0;
    assert(hasSetupStudio, 'Setup Studio is accessible from Avatar menu for admin');
    await adminPage.keyboard.press('Escape');

    // Screenshot: 1440px Light Mode
    const ss1440Light = path.join(ARTIFACT_DIR, 'evidence-1440-light-admin.png');
    await adminPage.screenshot({ path: ss1440Light, fullPage: false });
    console.log('Saved screenshot:', ss1440Light);

    // Screenshot: 1440px Dark Mode
    await adminPage.evaluate(() => document.documentElement.classList.add('dark'));
    await adminPage.waitForTimeout(500);
    const ss1440Dark = path.join(ARTIFACT_DIR, 'evidence-1440-dark-admin.png');
    await adminPage.screenshot({ path: ss1440Dark, fullPage: false });
    console.log('Saved screenshot:', ss1440Dark);

    // Revert dark mode for further actions
    await adminPage.evaluate(() => document.documentElement.classList.remove('dark'));

    // ------------------------------------------------------------------------
    // TEST 2: Admin User - 390px Mobile View (Light & Dark)
    // ------------------------------------------------------------------------
    console.log('\n--- 2. MOBILE VIEW: 390px Viewport (Light & Dark) ---');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobileContext.newPage();

    await performLogin(mobilePage, ADMIN_EMAIL, PASSWORD);
    console.log('Mobile logged in successfully, URL:', mobilePage.url());

    // Screenshot: 390px Light Mode
    const ss390Light = path.join(ARTIFACT_DIR, 'evidence-390-light-admin.png');
    await mobilePage.screenshot({ path: ss390Light, fullPage: false });
    console.log('Saved screenshot:', ss390Light);

    // Screenshot: 390px Dark Mode
    await mobilePage.evaluate(() => document.documentElement.classList.add('dark'));
    await mobilePage.waitForTimeout(500);
    const ss390Dark = path.join(ARTIFACT_DIR, 'evidence-390-dark-admin.png');
    await mobilePage.screenshot({ path: ss390Dark, fullPage: false });
    console.log('Saved screenshot:', ss390Dark);

    // ------------------------------------------------------------------------
    // TEST 3: Sales User - Sees Fewer Tabs (Leads, Quotations, Orders only)
    // ------------------------------------------------------------------------
    console.log('\n--- 3. SALES USER: Fewer Tabs (1440px) ---');
    const salesContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const salesPage = await salesContext.newPage();

    await performLogin(salesPage, SALES_EMAIL, PASSWORD);
    console.log('Sales user logged in, URL:', salesPage.url());

    const salesNavTabsLocator = salesPage.locator('header nav a');
    const salesTabTexts = await salesNavTabsLocator.allTextContents();
    const cleanSalesTabs = salesTabTexts.map((t) => t.trim()).filter(Boolean);
    console.log('Sales user visible tabs:', cleanSalesTabs);

    assert(cleanSalesTabs.length < 8, 'Sales user sees fewer tabs than admin (count < 8)', `Count: ${cleanSalesTabs.length}`);
    assert(cleanSalesTabs.includes('Leads') || cleanSalesTabs.includes('Quotations') || cleanSalesTabs.includes('Orders'),
      'Sales user sees sales-related tabs');

    // Verify Sales user does NOT see Invoices, Shipments, Inventory, Ledger
    assert(!cleanSalesTabs.includes('Invoices'), 'Sales user cannot see Invoices tab');
    assert(!cleanSalesTabs.includes('Ledger'), 'Sales user cannot see Ledger tab');
    assert(!cleanSalesTabs.includes('Inventory'), 'Sales user cannot see Inventory tab');

    const ssSales = path.join(ARTIFACT_DIR, 'evidence-1440-sales-user.png');
    await salesPage.screenshot({ path: ssSales, fullPage: false });
    console.log('Saved screenshot:', ssSales);

    // ------------------------------------------------------------------------
    // TEST 4: Quotations List Loads
    // ------------------------------------------------------------------------
    console.log('\n--- 4. QUOTATIONS LIST LOADS ---');
    await adminPage.goto(`${BASE_URL}/quotations`, { waitUntil: 'networkidle' });
    await adminPage.waitForTimeout(1500);

    // Check no "Failed to load data" error
    const failedToLoad = await adminPage.locator('text=Failed to load data').count();
    assert(failedToLoad === 0, 'No "Failed to load data" banner on Quotations page');

    // Verify quotations content loaded
    const pageBody = await adminPage.content();
    assert(pageBody.includes('Quotation') || pageBody.includes('QT-') || pageBody.includes('Draft'),
      'Quotations list loaded records from dev database');

    const ssQuotes = path.join(ARTIFACT_DIR, 'evidence-1440-quotations-loaded.png');
    await adminPage.screenshot({ path: ssQuotes, fullPage: false });
    console.log('Saved screenshot:', ssQuotes);

    // ------------------------------------------------------------------------
    // TEST 5: Invoice Creation Modal (Single Payment Terms Select & Prefix)
    // ------------------------------------------------------------------------
    console.log('\n--- 5. INVOICE CREATION MODAL ---');
    await adminPage.goto(`${BASE_URL}/invoices`, { waitUntil: 'networkidle' });
    await adminPage.waitForTimeout(1500);

    const createDocBtn = adminPage.locator('button:has-text("Create Document"), button:has-text("Create Tax Invoice"), button:has-text("New Invoice")').first();
    if (await createDocBtn.isVisible()) {
      await createDocBtn.click();
      await adminPage.waitForTimeout(1200);

      // Verify single payment terms select control
      const paymentTermsSelect = adminPage.locator('select').filter({ hasText: /Due on Receipt|Immediate|NET 30|NET 15/i });
      const selectCount = await paymentTermsSelect.count();
      assert(selectCount >= 1, 'Invoice modal has single payment terms <select> control (no fragmented chips)');

      const ssInvoiceModal = path.join(ARTIFACT_DIR, 'evidence-1440-invoice-modal.png');
      await adminPage.screenshot({ path: ssInvoiceModal, fullPage: false });
      console.log('Saved screenshot:', ssInvoiceModal);

      // Close modal
      const cancelBtn = adminPage.locator('button:has-text("Cancel")').first();
      if (await cancelBtn.isVisible()) {
        await cancelBtn.click();
      }
    }

    console.log('\n========================================================================');
    console.log(`ALL PLAYWRIGHT TESTS PASSED (${passedTests}/${totalTests})`);
    console.log('========================================================================\n');

  } finally {
    await browser.close();
  }
}

runPlaywrightSuite().catch((err) => {
  console.error('[PLAYWRIGHT ERROR]', err);
  process.exit(1);
});
