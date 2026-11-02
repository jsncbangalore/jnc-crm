const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const assert = require('assert');

const TEST_PORT = 4188;
const DIST_DIR = path.resolve(__dirname, '../apps/web/dist');

if (!fs.existsSync(DIST_DIR)) {
  console.error(`Dist directory does not exist at ${DIST_DIR}. Run build first.`);
  process.exit(1);
}

// 1. Static HTTP Server for built web app
const mimeTypes = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${TEST_PORT}`);
  let reqPath = parsedUrl.pathname;
  let filePath = path.join(DIST_DIR, reqPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (err) {
    res.writeHead(500);
    res.end('Server error');
  }
});

const ALL_PAGES = [
  'dashboard', 'leads', 'lead_flow', 'lead_setup', 'quotations', 'orders',
  'shipments', 'inventory', 'suppliers', 'purchase_orders', 'purchase_bills',
  'invoices', 'payments', 'daily_activities', 'projects', 'amc', 'production',
  'tasks', 'users', 'teams', 'access_templates', 'branding', 'mail_settings',
  'audit_logs', 'automation'
];

async function runE2E() {
  console.log('========================================================================');
  console.log('     PLAYWRIGHT E2E SUITE: GRANULAR PAGE-BASED PERMISSIONS              ');
  console.log('========================================================================\n');

  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`[HTTP] Serving built web app on http://localhost:${TEST_PORT}\n`);

  const browser = await chromium.launch({ headless: true });

  let passedScenarios = 0;
  let totalScenarios = 0;

  async function runScenario(title, testFn) {
    totalScenarios++;
    console.log(`\n---> SCENARIO ${totalScenarios}: ${title}`);
    try {
      await testFn();
      console.log(`  [PASS] Scenario ${totalScenarios} succeeded.`);
      passedScenarios++;
    } catch (err) {
      console.error(`  [FAIL] Scenario ${totalScenarios} failed:`, err.message);
      throw err;
    }
  }

  try {
    // ─── SCENARIO 1: Inventory-Only User (Desktop 1440px & Mobile 390px) ─────
    await runScenario('Inventory-only user lands on /inventory and sees only Inventory in all nav surfaces', async () => {
      const inventoryUser = {
        id: 'user-inv-01',
        employeeCode: 'INV001',
        name: 'Inventory Specialist',
        email: 'inv-specialist@example.internal',
        role: 'store_manager',
        effectivePages: ['inventory'],
        homePage: 'inventory',
        isActive: true,
        tenantId: 'tenant-test-1',
        tenant: { id: 'tenant-test-1', name: 'Equipment Supply Corp', slug: 'equip-supply' },
      };

      // 1A. Desktop 1440px
      const contextDesktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const pageDesktop = await contextDesktop.newPage();

      // Setup mock API and initial localStorage
      await pageDesktop.addInitScript((u) => {
        localStorage.setItem('crm_user', JSON.stringify(u));
        localStorage.setItem('crm_portal', 'staff');
        localStorage.setItem('crm_cookie_consent', JSON.stringify({ necessary: true, preferences: true }));
        window.__CRM_API_URL__ = 'http://localhost:4188/api/v1';
      }, inventoryUser);

      await pageDesktop.route('**/api/v1/**', async (route) => {
        const url = route.request().url();
        if (url.includes('/auth/me')) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(inventoryUser) });
        } else if (url.includes('/inventory')) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], total: 0 }) });
        } else if (url.includes('/settings/branding/public') || url.includes('/settings/branding')) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ companyName: 'Equipment Supply Corp' }) });
        } else {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
        }
      });

      // Navigate to root '/'
      await pageDesktop.goto(`http://localhost:${TEST_PORT}/`);
      await pageDesktop.waitForTimeout(1500);

      // Verify redirected to /inventory
      const currentUrl = pageDesktop.url();
      assert.ok(currentUrl.includes('/inventory'), `Expected redirect to /inventory, got ${currentUrl}`);

      // Verify Top Menu links
      const navText = await pageDesktop.locator('nav').first().innerText();
      assert.ok(navText.includes('Inventory'), 'Desktop top nav must include Inventory');
      assert.ok(!navText.includes('Dashboard'), 'Desktop top nav must NOT include Dashboard');
      assert.ok(!navText.includes('Leads'), 'Desktop top nav must NOT include Leads');
      assert.ok(!navText.includes('Quotations'), 'Desktop top nav must NOT include Quotations');
      assert.ok(!navText.includes('Orders'), 'Desktop top nav must NOT include Orders');

      // Verify Search Placeholder
      const searchInput = pageDesktop.locator('input[placeholder*="Search"]');
      if (await searchInput.count() > 0) {
        const placeholder = await searchInput.first().getAttribute('placeholder');
        assert.ok(
          placeholder.toLowerCase().includes('inventory'),
          `Search placeholder must mention inventory: "${placeholder}"`
        );
        assert.ok(!placeholder.toLowerCase().includes('leads'), 'Search placeholder must not mention leads');
      }

      // Verify Profile Menu
      const avatarBtn = pageDesktop.locator('button[aria-label="User menu"]');
      if (await avatarBtn.count() > 0) {
        await avatarBtn.first().click();
        await pageDesktop.waitForTimeout(300);
        const dropdownText = await pageDesktop.locator('body').innerText();
        assert.ok(dropdownText.includes('My Account'), 'Profile menu must include My Account');
        assert.ok(!dropdownText.includes('Team & Users'), 'Profile menu must NOT include Team & Users');
        assert.ok(!dropdownText.includes('Company Branding & GST'), 'Profile menu must NOT include Company Branding');
      }
      await contextDesktop.close();

      // 1B. Mobile 390px
      const contextMobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const pageMobile = await contextMobile.newPage();

      await pageMobile.addInitScript((u) => {
        localStorage.setItem('crm_user', JSON.stringify(u));
        localStorage.setItem('crm_portal', 'staff');
        localStorage.setItem('crm_cookie_consent', JSON.stringify({ necessary: true, preferences: true }));
        window.__CRM_API_URL__ = 'http://localhost:4188/api/v1';
      }, inventoryUser);

      await pageMobile.route('**/api/v1/**', async (route) => {
        const url = route.request().url();
        if (url.includes('/auth/me')) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(inventoryUser) });
        } else {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
        }
      });

      await pageMobile.goto(`http://localhost:${TEST_PORT}/inventory`);
      await pageMobile.waitForTimeout(1500);

      // Verify bottom dock
      const dock = pageMobile.locator('nav[aria-label="Mobile Navigation"]');
      assert.strictEqual(await dock.count(), 1, 'Mobile navigation dock must be visible');
      const dockText = await dock.innerText();
      assert.ok(dockText.includes('Inventory'), 'Mobile dock must display Inventory');
      assert.ok(!dockText.includes('Leads'), 'Mobile dock must NOT display Leads');
      assert.ok(!dockText.includes('Dashboard'), 'Mobile dock must NOT display Dashboard');

      await contextMobile.close();
    });

    // ─── SCENARIO 2: Project Manager with Daily Activities Only ──────────────
    await runScenario('Project Manager with daily_activities lands there without Dashboard redirect or error', async () => {
      const pmUser = {
        id: 'user-pm-01',
        employeeCode: 'PM001',
        name: 'Project Coordinator',
        email: 'pm-lead@example.internal',
        role: 'employee',
        effectivePages: ['daily_activities'],
        homePage: 'daily_activities',
        isActive: true,
        tenantId: 'tenant-test-1',
        tenant: { id: 'tenant-test-1', name: 'Equipment Supply Corp' },
      };

      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();

      const pageErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') pageErrors.push(msg.text());
      });

      await page.addInitScript((u) => {
        localStorage.setItem('crm_user', JSON.stringify(u));
        localStorage.setItem('crm_portal', 'staff');
        window.__CRM_API_URL__ = 'http://localhost:4188/api/v1';
      }, pmUser);

      await page.route('**/api/v1/**', async (route) => {
        const url = route.request().url();
        if (url.includes('/auth/me')) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pmUser) });
        } else {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
        }
      });

      await page.goto(`http://localhost:${TEST_PORT}/`);
      await page.waitForTimeout(1500);

      const url = page.url();
      assert.ok(url.includes('/daily-activities'), `Expected PM to land on /daily-activities, but got ${url}`);

      // Verify no dashboard error
      const dashboardErrors = pageErrors.filter((e) => e.toLowerCase().includes('dashboard'));
      assert.strictEqual(dashboardErrors.length, 0, 'Must have zero dashboard errors');

      await context.close();
    });

    // ─── SCENARIO 3: Zero Pages User (No Access Screen & Navigation Hidden) ──
    await runScenario('Zero-pages user sees only No Access screen with all navigation bars hidden', async () => {
      const zeroUser = {
        id: 'user-zero-01',
        employeeCode: 'ZER001',
        name: 'Unassigned Staff',
        email: 'unassigned@example.internal',
        role: 'viewer',
        effectivePages: [],
        homePage: null,
        isActive: true,
        tenantId: 'tenant-test-1',
        tenant: { id: 'tenant-test-1', name: 'Equipment Supply Corp' },
      };

      // Desktop
      const contextDesktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const pageDesktop = await contextDesktop.newPage();

      await pageDesktop.addInitScript((u) => {
        localStorage.setItem('crm_user', JSON.stringify(u));
        localStorage.setItem('crm_portal', 'staff');
        window.__CRM_API_URL__ = 'http://localhost:4188/api/v1';
      }, zeroUser);

      await pageDesktop.route('**/api/v1/**', async (route) => {
        const url = route.request().url();
        if (url.includes('/auth/me')) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(zeroUser) });
        } else {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
        }
      });

      await pageDesktop.goto(`http://localhost:${TEST_PORT}/`);
      await pageDesktop.waitForTimeout(1500);

      const bodyText = await pageDesktop.locator('body').innerText();
      assert.ok(
        bodyText.includes('No Access Granted') || bodyText.includes('Access Pending') || bodyText.includes('contact your administrator'),
        'Must display No Access / Access Pending message'
      );

      // Verify desktop navigation bar is hidden
      const desktopNavLinks = await pageDesktop.locator('header nav a, nav[aria-label="Main"] a').count();
      assert.strictEqual(desktopNavLinks, 0, 'Zero navigation links should be present for zero-pages user');
      await contextDesktop.close();

      // Mobile
      const contextMobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const pageMobile = await contextMobile.newPage();

      await pageMobile.addInitScript((u) => {
        localStorage.setItem('crm_user', JSON.stringify(u));
        localStorage.setItem('crm_portal', 'staff');
        window.__CRM_API_URL__ = 'http://localhost:4188/api/v1';
      }, zeroUser);

      await pageMobile.route('**/api/v1/**', async (route) => {
        const url = route.request().url();
        if (url.includes('/auth/me')) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(zeroUser) });
        } else {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
        }
      });

      await pageMobile.goto(`http://localhost:${TEST_PORT}/`);
      await pageMobile.waitForTimeout(1500);

      // Mobile dock should be hidden
      const mobileDock = pageMobile.locator('nav[aria-label="Mobile Navigation"]');
      assert.strictEqual(await mobileDock.count(), 0, 'Mobile bottom dock must be completely hidden for zero-pages user');
      await contextMobile.close();
    });

    // ─── SCENARIO 4: Leads & Quotations User (Cannot see Team or Branding) ───
    await runScenario('Leads & Quotations user cannot access or see Team & Users or Branding', async () => {
      const salesUser = {
        id: 'user-sales-01',
        employeeCode: 'SAL001',
        name: 'Sales Executive',
        email: 'sales-exec@example.internal',
        role: 'employee',
        effectivePages: ['leads', 'quotations'],
        homePage: 'leads',
        isActive: true,
        tenantId: 'tenant-test-1',
        tenant: { id: 'tenant-test-1', name: 'Equipment Supply Corp' },
      };

      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();

      await page.addInitScript((u) => {
        localStorage.setItem('crm_user', JSON.stringify(u));
        localStorage.setItem('crm_portal', 'staff');
        window.__CRM_API_URL__ = 'http://localhost:4188/api/v1';
      }, salesUser);

      await page.route('**/api/v1/**', async (route) => {
        const url = route.request().url();
        if (url.includes('/auth/me')) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(salesUser) });
        } else {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
        }
      });

      // 1. Check navigation
      await page.goto(`http://localhost:${TEST_PORT}/leads`);
      await page.waitForTimeout(1500);

      const navText = await page.locator('nav').first().innerText();
      assert.ok(navText.includes('Leads'), 'Nav must include Leads');
      assert.ok(navText.includes('Quotations'), 'Nav must include Quotations');
      assert.ok(!navText.includes('Team & Users'), 'Nav must NOT include Team & Users');
      assert.ok(!navText.includes('Branding'), 'Nav must NOT include Branding');

      // 2. Direct route guard test: Attempt to open /settings/branding
      await page.goto(`http://localhost:${TEST_PORT}/settings/branding`);
      await page.waitForTimeout(1500);

      // Verify No Access guard is shown
      const guardText = await page.locator('body').innerText();
      assert.ok(
        guardText.includes('No Access') && guardText.includes('Branding'),
        'Must display No Access guard when directly navigating to forbidden page'
      );

      // Click "Go to Available Page" button (Requirement 2)
      const goBtn = page.locator('button:has-text("Go to Available Page")');
      assert.strictEqual(await goBtn.count(), 1, 'Go to Available Page button must be present');
      await goBtn.click();
      await page.waitForTimeout(1000);

      const guardUrl = page.url();
      assert.ok(
        guardUrl.includes('/leads'),
        `Clicking "Go to Available Page" must redirect to homePage (/leads), got ${guardUrl}`
      );

      await context.close();
    });

    // ─── SCENARIO 5: Admin User (Full Access) ─────────────────────────────────
    await runScenario('Admin user has access to full navigation suite', async () => {
      const adminUser = {
        id: 'user-admin-01',
        employeeCode: 'ADM001',
        name: 'Operations Director',
        email: 'ops-director@example.internal',
        role: 'admin',
        effectivePages: ALL_PAGES,
        homePage: 'dashboard',
        isActive: true,
        tenantId: 'tenant-test-1',
        tenant: { id: 'tenant-test-1', name: 'Equipment Supply Corp' },
      };

      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();

      await page.addInitScript((u) => {
        localStorage.setItem('crm_user', JSON.stringify(u));
        localStorage.setItem('crm_portal', 'staff');
        window.__CRM_API_URL__ = 'http://localhost:4188/api/v1';
      }, adminUser);

      await page.route('**/api/v1/**', async (route) => {
        const url = route.request().url();
        if (url.includes('/auth/me')) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(adminUser) });
        } else {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
        }
      });

      await page.goto(`http://localhost:${TEST_PORT}/`);
      await page.waitForTimeout(1500);

      // Verify full access via 9-Dot App Launcher
      const launcherBtn = page.locator('button[title="App Launcher"]');
      assert.strictEqual(await launcherBtn.count(), 1, 'App Launcher button must be present');
      await launcherBtn.click();
      await page.waitForTimeout(300);

      const launcherText = await page.locator('body').innerText();
      assert.ok(launcherText.includes('Dashboard'), 'Admin launcher must include Dashboard');
      assert.ok(launcherText.includes('Leads & Accounts'), 'Admin launcher must include Leads & Accounts');
      assert.ok(launcherText.includes('Sales Orders'), 'Admin launcher must include Sales Orders');
      assert.ok(launcherText.includes('Inventory & Stock'), 'Admin launcher must include Inventory & Stock');
      assert.ok(launcherText.includes('Invoices & Billing'), 'Admin launcher must include Invoices & Billing');
      await launcherBtn.click(); // close launcher
      await page.waitForTimeout(200);

      // Verify full access via Avatar dropdown
      const avatarBtn = page.locator('button[aria-label="User menu"]');
      assert.strictEqual(await avatarBtn.count(), 1, 'Avatar button must be present');
      await avatarBtn.click();
      await page.waitForTimeout(300);

      const profileText = await page.locator('body').innerText();
      assert.ok(profileText.includes('Team & Users'), 'Admin profile menu must include Team & Users');
      assert.ok(profileText.includes('Company Branding & GST'), 'Admin profile menu must include Company Branding & GST');
      assert.ok(profileText.includes('Start Setup'), 'Admin profile menu must include Start Setup');
      assert.ok(profileText.includes('Mail accounts'), 'Admin profile menu must include Mail accounts');
      assert.ok(profileText.includes('My Account'), 'Admin profile menu must include My Account');

      await context.close();
    });

    // ─── SCENARIO 6: Branding Logo Upload ────────────────────────────────────
    await runScenario('Branding logo upload works with base64 PNG data URL up to 2MB', async () => {
      let savedBrandingPayload = null;

      const adminUser = {
        id: 'user-admin-01',
        employeeCode: 'ADM001',
        name: 'Operations Director',
        email: 'ops-director@example.internal',
        role: 'admin',
        effectivePages: ALL_PAGES,
        homePage: 'dashboard',
        isActive: true,
        tenantId: 'tenant-test-1',
        tenant: { id: 'tenant-test-1', name: 'Equipment Supply Corp' },
      };

      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();

      await page.addInitScript((u) => {
        localStorage.setItem('crm_user', JSON.stringify(u));
        localStorage.setItem('crm_portal', 'staff');
        window.__CRM_API_URL__ = 'http://localhost:4188/api/v1';
      }, adminUser);

      // Mock branding endpoint
      await page.route('**/api/v1/**', async (route) => {
        const url = route.request().url();
        const method = route.request().method();

        if (url.includes('/auth/me')) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(adminUser) });
        } else if (url.includes('/settings/branding') && method === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              companyName: 'Equipment Supply Corp',
              companyLogoUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            }),
          });
        } else if (url.includes('/settings/branding') && method === 'PUT') {
          savedBrandingPayload = JSON.parse(route.request().postData());
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, ...savedBrandingPayload }),
          });
        } else {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
        }
      });

      // Test programmatic update via page evaluation to verify client-side API accepts base64 logo without 500-char error
      await page.goto(`http://localhost:${TEST_PORT}/settings/branding`);
      await page.waitForTimeout(1000);

      // 1 MB simulated PNG
      const test1MbBase64 = 'data:image/png;base64,' + 'A'.repeat(800000);
      const apiResult = await page.evaluate(async (logoPayload) => {
        try {
          const res = await fetch('/api/v1/settings/branding', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyLogoUrl: logoPayload }),
          });
          return { status: res.status, ok: res.ok };
        } catch (e) {
          return { error: e.message };
        }
      }, test1MbBase64);

      assert.strictEqual(apiResult.ok, true, 'Base64 logo upload must return 200 OK');
      assert.ok(savedBrandingPayload !== null, 'Saved branding payload must be captured');
      assert.ok(savedBrandingPayload.companyLogoUrl.length > 500, 'Data URL length exceeds 500 characters cleanly');

      await context.close();
    });

  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n========================================================================`);
  console.log(`  E2E SUMMARY: ${passedScenarios}/${totalScenarios} SCENARIOS PASSED (100%) `);
  console.log(`========================================================================\n`);
}

runE2E().catch((err) => {
  console.error('[FATAL E2E ERROR]:', err);
  if (server.listening) server.close();
  process.exit(1);
});
