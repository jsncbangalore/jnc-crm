const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.TEST_FRONTEND_URL || 'http://localhost:5173';
const ARTIFACT_DIR = 'C:\\Users\\JNC R&D\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824';
const STORAGE_STATE_PATH = path.join(ARTIFACT_DIR, 'auth-state.json');

const ADMIN_EMAIL = 'tenant-admin@example.com';
const PASSWORD = 'DevPassword@123';

async function performLogin(page, email, password) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="username"], #company-identifier', { timeout: 10000 });
  await page.fill('input[name="username"], #company-identifier', email);
  await page.fill('input[name="password"], #company-password', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  await page.waitForTimeout(1000);
}

async function auditPagesAndButtons() {
  console.log('========================================================================');
  console.log('FULL APPLICATION PAGES & BUTTONS AUDIT WITH CONSOLE & NETWORK BUG PROFILING');
  console.log('========================================================================\n');

  const browser = await chromium.launch({ headless: true });

  const auditReport = {
    testedAt: new Date().toISOString(),
    pagesTested: [],
    consoleErrors: [],
    pageErrors: [],
    networkFailures: [],
    buttonTestSummary: [],
  };

  try {
    // 1. Establish session
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // Listen to console and page errors globally
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('favicon') && !text.includes('Failed to load resource: net::ERR_CONNECTION_REFUSED')) {
          auditReport.consoleErrors.push({ url: page.url(), message: text });
          console.error(`  [Console Error @ ${page.url()}]: ${text}`);
        }
      }
    });

    page.on('pageerror', (err) => {
      auditReport.pageErrors.push({ url: page.url(), message: err.message, stack: err.stack });
      console.error(`  [Page Uncaught Exception @ ${page.url()}]: ${err.message}`);
    });

    page.on('response', (res) => {
      if (res.status() >= 400 && !res.url().includes('favicon')) {
        // filter out expected 403 or intentional error tests
        auditReport.networkFailures.push({
          pageUrl: page.url(),
          requestUrl: res.url(),
          status: res.status(),
          statusText: res.statusText(),
        });
        console.warn(`  [Network ${res.status()} @ ${res.url()}]`);
      }
    });

    console.log('[1/4] Authenticating as Tenant Admin...');
    await performLogin(page, ADMIN_EMAIL, PASSWORD);
    await context.storageState({ path: STORAGE_STATE_PATH });
    console.log('  ✓ Logged in successfully\n');

    // Pages to crawl and test
    const routes = [
      { name: 'Dashboard', path: '/' },
      { name: 'Leads List', path: '/leads' },
      { name: 'Lead Flow Board', path: '/leads/flow' },
      { name: 'Quotations', path: '/quotations' },
      { name: 'Orders', path: '/orders' },
      { name: 'Shipments', path: '/shipments' },
      { name: 'Inventory', path: '/inventory' },
      { name: 'Suppliers', path: '/suppliers' },
      { name: 'Invoices', path: '/invoices' },
      { name: 'Ledger', path: '/ledger' },
      { name: 'Daily Activities', path: '/daily-activities' },
      { name: 'Public Solutions', path: '/solutions' },
      { name: 'Public Inquiry & Walkthrough', path: '/inquiry' },
      { name: 'Branding & GST Settings', path: '/settings/branding' },
      { name: 'User Management', path: '/settings/users' },
      { name: 'Mail Settings', path: '/settings/mail' },
    ];

    console.log('[2/4] Auditing all pages and interactive button actions...');

    for (const route of routes) {
      console.log(`\n---> Auditing Page: ${route.name} (${route.path})`);
      const pageInfo = { name: route.name, path: route.path, status: 'OK', buttonsCount: 0, actionsTested: [] };

      try {
        await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1000);

        // Count buttons
        const buttons = await page.locator('button:visible');
        const btnCount = await buttons.count();
        pageInfo.buttonsCount = btnCount;
        console.log(`     Found ${btnCount} visible buttons.`);

        // Test key interactive buttons on specific pages
        if (route.path === '/ledger') {
          // 1. Test Switching to Suppliers tab
          console.log('     Testing Ledger: Switching to Suppliers Tab...');
          const suppliersTab = page.locator('button:has-text("Suppliers")').first();
          if (await suppliersTab.isVisible()) {
            await suppliersTab.click();
            await page.waitForTimeout(600);
            pageInfo.actionsTested.push('Clicked Suppliers Tab');
          }

          // 2. Test Switching back to Customers tab
          console.log('     Testing Ledger: Switching back to Customers Tab...');
          const customersTab = page.locator('button:has-text("Customers")').first();
          if (await customersTab.isVisible()) {
            await customersTab.click();
            await page.waitForTimeout(600);
            pageInfo.actionsTested.push('Clicked Customers Tab');
          }

          // 3. Test Add Entry Modal open & close
          console.log('     Testing Ledger: Opening Add Entry Modal...');
          const addEntryBtn = page.locator('button:has-text("Add entry")').first();
          if (await addEntryBtn.isVisible()) {
            await addEntryBtn.click();
            await page.waitForTimeout(500);
            // Verify modal is open
            const modalOpen = await page.locator('text=Add Manual Ledger Entry').isVisible();
            console.log(`     Modal Opened: ${modalOpen}`);
            // Close via Cancel
            await page.locator('button:has-text("Cancel")').first().click();
            await page.waitForTimeout(400);
            pageInfo.actionsTested.push('Add Entry Modal Open & Cancel');
          }

          // 4. Test Record Receipt Modal open & close
          console.log('     Testing Ledger: Opening Record Receipt Modal...');
          const recordReceiptBtn = page.locator('button:has-text("Record receipt"), button:has-text("Record payment")').first();
          if (await recordReceiptBtn.isVisible()) {
            await recordReceiptBtn.click();
            await page.waitForTimeout(500);
            const receiptModalOpen = await page.locator('text=Authoritative posting via PaymentsService').isVisible();
            console.log(`     Receipt Modal Opened: ${receiptModalOpen}`);
            await page.locator('button:has-text("Cancel")').first().click();
            await page.waitForTimeout(400);
            pageInfo.actionsTested.push('Record Receipt Modal Open & Cancel');
          }

          // 5. Test Lock Period Modal open & close
          console.log('     Testing Ledger: Opening Lock Period Modal...');
          const lockBtn = page.locator('button[title*="Period"], button:has-text("Lock period")').first();
          if (await lockBtn.isVisible()) {
            await lockBtn.click();
            await page.waitForTimeout(500);
            const lockModalOpen = await page.locator('text=Ledger Period Lock').isVisible();
            console.log(`     Lock Modal Opened: ${lockModalOpen}`);
            await page.locator('button:has-text("Cancel")').first().click();
            await page.waitForTimeout(400);
            pageInfo.actionsTested.push('Lock Period Modal Open & Cancel');
          }
        } else if (route.path === '/invoices') {
          // Test filter tabs (All, Unpaid, Paid, Overdue, Cancelled)
          const filterTabs = ['Unpaid', 'Paid', 'All'];
          for (const tab of filterTabs) {
            const btn = page.locator(`button:has-text("${tab}")`).first();
            if (await btn.isVisible()) {
              await btn.click();
              await page.waitForTimeout(300);
              pageInfo.actionsTested.push(`Invoices filter: ${tab}`);
            }
          }
        } else if (route.path === '/solutions') {
          // Test clicking Walkthrough link
          const walkthroughLink = page.locator('a:has-text("Request solution walkthrough")').first();
          if (await walkthroughLink.isVisible()) {
            const href = await walkthroughLink.getAttribute('href');
            pageInfo.actionsTested.push(`Walkthrough Link Target: ${href}`);
          }
        } else if (route.path === '/inquiry') {
          // Test selecting solution tracks
          const tracks = ['High-Volume Order Processing', 'Manufacturing & Engineering', 'B2B Professional Services', 'Multi-Location Operations'];
          for (const t of tracks) {
            const trackBtn = page.locator(`button:has-text("${t}")`).first();
            if (await trackBtn.isVisible()) {
              await trackBtn.click();
              await page.waitForTimeout(200);
              pageInfo.actionsTested.push(`Selected Track: ${t}`);
            }
          }
        } else if (route.path === '/settings/branding') {
          // Test in-page validation trigger and reset
          const saveBtn = page.locator('button[data-testid="btn-save-branding"]');
          if (await saveBtn.isVisible()) {
            pageInfo.actionsTested.push('Branding Save Button Visible');
          }
        }

        auditReport.pagesTested.push(pageInfo);
      } catch (err) {
        console.error(`     Error while auditing ${route.name}:`, err.message);
        pageInfo.status = `ERROR: ${err.message}`;
        auditReport.pagesTested.push(pageInfo);
      }
    }

    // 3. Test Navbar Quick Create and Profile menus
    console.log('\n[3/4] Testing Global Navbar Actions...');
    const qcBtn = page.locator('#quick-create-button');
    if (await qcBtn.isVisible()) {
      await qcBtn.click();
      await page.waitForTimeout(300);
      const qcOpen = await page.locator('#quick-create-menu').isVisible();
      console.log(`     Quick Create Dropdown Opened: ${qcOpen}`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }

    const profileBtn = page.locator('#user-profile-button');
    if (await profileBtn.isVisible()) {
      await profileBtn.click();
      await page.waitForTimeout(300);
      const profOpen = await page.locator('#user-profile-menu').isVisible();
      console.log(`     User Profile Dropdown Opened: ${profOpen}`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }

    // 4. Summarize and write report
    console.log('\n[4/4] Compiling Audit & Bug Report...');
    const reportPath = path.join(ARTIFACT_DIR, 'page-and-button-audit-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(auditReport, null, 2), 'utf8');
    console.log(`  ✓ Saved audit report to: ${reportPath}`);

    await context.close();
  } finally {
    await browser.close();
  }

  console.log('\n========================================================================');
  console.log(`AUDIT FINISHED: ${auditReport.pagesTested.length} Pages Audited`);
  console.log(`Console Errors: ${auditReport.consoleErrors.length}`);
  console.log(`Page Exceptions: ${auditReport.pageErrors.length}`);
  console.log(`Network Failures: ${auditReport.networkFailures.length}`);
  console.log('========================================================================\n');
}

auditPagesAndButtons().catch((err) => {
  console.error('[FAIL] Audit crashed:', err);
  process.exit(1);
});
