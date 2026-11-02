const { chromium } = require('playwright');
const assert = require('assert');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5173';
const COMPANY_CODE = 'ACME-DEV-001';
const PASSWORD = 'DevPassword@123';

const USERS = [
  {
    role: 'tenant_admin',
    email: 'admin@example.com',
    expectedHomeRoute: '/dashboard',
    hasFullAccess: true,
  },
  {
    role: 'platform_admin',
    email: 'platform-admin@example.com',
    expectedHomeRoute: '/dashboard',
    hasFullAccess: true,
  },
  {
    role: 'inventory_only',
    email: 'store-manager@example.com',
    expectedHomeRoute: '/inventory',
    hasFullAccess: false,
  },
];

const VIEWPORTS = [
  { name: '1440px Desktop', width: 1440, height: 900, isMobile: false },
  { name: '390px Mobile', width: 390, height: 844, isMobile: true },
];

async function performLogin(page, email, password, companyCode) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  // Accept cookies if banner visible
  const cookieBtn = page.locator('button:has-text("Accept All"), button:has-text("Accept")');
  if (await cookieBtn.isVisible({ timeout: 500 }).catch(() => false)) {
    await cookieBtn.click();
  }

  // Clear session if already logged in
  if (!page.url().includes('/login')) {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('crm_cookie_consent', JSON.stringify({
        choice: 'all',
        preferences: true,
        policyVersion: '2026.10.1',
        savedAt: new Date().toISOString(),
      }));
      localStorage.setItem('cookie_consent', 'all');
    });
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
  }

  const codeToggleBtn = page.locator('button:has-text("Have a company code?")');
  if (await codeToggleBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await codeToggleBtn.click();
  }

  const companyInput = page.locator('input[name="companyCode"], #company-code-input');
  if (await companyInput.isVisible({ timeout: 1000 }).catch(() => false)) {
    await companyInput.fill(companyCode);
  }

  await page.fill('input[name="username"], #company-identifier', email);
  await page.fill('input[name="password"], #company-password', password);
  await page.click('button[type="submit"]');

  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  await page.waitForTimeout(800);

  const cookieBtn2 = page.locator('button:has-text("Accept All"), button:has-text("Accept")');
  if (await cookieBtn2.first().isVisible({ timeout: 500 }).catch(() => false)) {
    await cookieBtn2.first().click().catch(() => {});
  }
}

async function verifyPageHeading(page, expectedRoute) {
  await page.waitForLoadState('domcontentloaded');
  const pathname = new URL(page.url()).pathname;
  assert.strictEqual(pathname, expectedRoute, `URL mismatch: expected ${expectedRoute}, got ${pathname}`);

  const bodyText = await page.innerText('body');

  if (pathname === '/dashboard') {
    assert(bodyText.includes('Dashboard'), `Dashboard page should contain 'Dashboard'`);
    const hasCard = await page.locator('[data-testid="summary-card-leads"]').isVisible({ timeout: 5000 }).catch(() => false);
    assert(hasCard, `Dashboard should render summary cards`);
  } else if (pathname === '/leads') {
    assert(bodyText.includes('Pipeline & Kanban') || bodyText.includes('NEW INQUIRIES'), `Leads page should contain 'Pipeline & Kanban'`);
  } else if (pathname === '/quotations') {
    assert(bodyText.includes('Quotations & Estimates'), `Quotations page should contain 'Quotations & Estimates'`);
  } else if (pathname === '/orders') {
    assert(bodyText.includes('Orders & Tax Invoicing'), `Orders page should contain 'Orders & Tax Invoicing'`);
  } else if (pathname === '/invoices') {
    assert(bodyText.includes('Invoices & Dispatch Document Center') || bodyText.includes('Tax Invoices'), `Invoices page should contain Invoices header`);
  } else if (pathname === '/shipments') {
    assert(bodyText.includes('Logistics & Shipments'), `Shipments page should contain 'Logistics & Shipments'`);
  } else if (pathname === '/inventory') {
    assert(bodyText.includes('Stock Master'), `Inventory page should contain 'Stock Master'`);
  } else if (pathname === '/ledger') {
    assert(bodyText.includes('Party Ledger & Statements'), `Ledger page should contain 'Party Ledger & Statements'`);
  } else if (pathname === '/suppliers') {
    assert(bodyText.includes('Supplier Companies'), `Suppliers page should contain 'Supplier Companies'`);
  } else if (pathname === '/bills') {
    assert(bodyText.includes('Purchase Bills & Inward Register'), `Bills page should contain 'Purchase Bills & Inward Register'`);
  } else if (pathname === '/daily-activities') {
    assert(bodyText.includes('Daily Activities'), `Daily Activities page should contain 'Daily Activities'`);
  }
}

async function runTests() {
  console.log('========================================================================');
  console.log('PLAYWRIGHT TOP-MENU NAVIGATION & ACCESS CONTROL INTEGRITY TEST');
  console.log('========================================================================\n');

  const browser = await chromium.launch({ headless: true });
  let totalAssertions = 0;
  let passedAssertions = 0;

  for (const vp of VIEWPORTS) {
    console.log(`\n========================================================================`);
    console.log(`>>> TESTING VIEWPORT: ${vp.name} (${vp.width}x${vp.height}) <<<`);
    console.log(`========================================================================`);

    for (const testUser of USERS) {
      console.log(`\n------------------------------------------------------------------------`);
      console.log(`[USER] ${testUser.role} (${testUser.email})`);
      console.log(`------------------------------------------------------------------------`);

      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      await context.addInitScript(() => {
        try {
          const consentRecord = {
            choice: 'all',
            preferences: true,
            policyVersion: '2026.10.1',
            savedAt: new Date().toISOString(),
          };
          localStorage.setItem('crm_cookie_consent', JSON.stringify(consentRecord));
          localStorage.setItem('crm_cookie_consent', JSON.stringify({
        choice: 'all',
        preferences: true,
        policyVersion: '2026.10.1',
        savedAt: new Date().toISOString(),
      }));
      localStorage.setItem('cookie_consent', 'all');
        } catch {}
      });
      const page = await context.newPage();

      try {
        // 1. Perform login
        console.log(`  1. Logging in as ${testUser.email}...`);
        await performLogin(page, testUser.email, PASSWORD, COMPANY_CODE);
        console.log(`     ✓ Logged in. Current URL: ${page.url()}`);

        if (testUser.hasFullAccess) {
          if (!vp.isMobile) {
            // ── DESKTOP FULL ACCESS MENU CLICK TEST ─────────────────────────────
            console.log(`  2. Checking desktop top-menu tabs for ${testUser.role}...`);
            await page.waitForSelector('nav[aria-label="Application Tabs"] a', { timeout: 10000 });
            const navTabs = page.locator('nav[aria-label="Application Tabs"] a');
            const tabCount = await navTabs.count();
            console.log(`     Found ${tabCount} desktop navigation tabs.`);
            assert(tabCount >= 10, `Full access admin should have at least 10 navbar tabs, got ${tabCount}`);

            // Test HOME specifically
            console.log(`     Testing 'Home' tab...`);
            const homeTab = navTabs.filter({ hasText: /^Home$/ }).first();
            await homeTab.click();
            await page.waitForTimeout(500);
            await verifyPageHeading(page, '/dashboard');
            console.log(`     ✓ 'Home' tab clicked -> navigated to /dashboard with Dashboard heading.`);
            totalAssertions++; passedAssertions++;

            // Test BILLS specifically
            console.log(`     Testing 'Bills' tab...`);
            const billsTab = navTabs.filter({ hasText: /^Bills$/ }).first();
            await billsTab.click();
            await page.waitForTimeout(500);
            await verifyPageHeading(page, '/bills');
            console.log(`     ✓ 'Bills' tab clicked -> navigated directly to /bills with Bills heading.`);
            totalAssertions++; passedAssertions++;

            // Test EVERY tab in application tabs
            for (let i = 0; i < tabCount; i++) {
              const currentTab = navTabs.nth(i);
              const tabText = (await currentTab.innerText()).trim();
              const expectedHref = await currentTab.getAttribute('href');
              console.log(`     Clicking Tab [${i + 1}/${tabCount}]: "${tabText}" (href: ${expectedHref})...`);

              await currentTab.click();
              await page.waitForTimeout(400);

              const currentUrl = page.url();
              const currentPath = new URL(currentUrl).pathname;
              assert.strictEqual(
                currentPath,
                expectedHref,
                `Clicking tab "${tabText}" must land exactly on its own route "${expectedHref}", but got "${currentPath}"`
              );

              await verifyPageHeading(page, expectedHref);

              // Assert active tab styling: only matching tab has active class
              const activeCount = await page.locator('nav[aria-label="Application Tabs"] div.border-crm-blue').count();
              assert.strictEqual(
                activeCount,
                1,
                `Exactly ONE tab must be highlighted with border-crm-blue, but found ${activeCount} active tabs`
              );

              console.log(`       ✓ Landed on ${currentPath}, heading verified, exactly 1 tab active.`);
              totalAssertions++; passedAssertions++;
            }

            // Test Logo Click
            console.log(`  3. Testing Brand Logo click...`);
            const logoLink = page.locator('header a').first();
            await logoLink.click();
            await page.waitForTimeout(500);
            await verifyPageHeading(page, testUser.expectedHomeRoute);
            console.log(`     ✓ Logo clicked -> navigated to ${testUser.expectedHomeRoute}`);
            totalAssertions++; passedAssertions++;

          } else {
            // ── MOBILE FULL ACCESS MENU CLICK TEST ──────────────────────────────
            console.log(`  2. Checking mobile dock and drawer for ${testUser.role}...`);
            await page.waitForSelector('nav[aria-label="Mobile Navigation"] a', { timeout: 10000 });
            const mobileDockLinks = page.locator('nav[aria-label="Mobile Navigation"] a');
            const dockCount = await mobileDockLinks.count();
            console.log(`     Found ${dockCount} mobile primary dock tabs.`);

            // Click each mobile primary tab
            for (let i = 0; i < dockCount; i++) {
              const dockTab = mobileDockLinks.nth(i);
              const tabText = (await dockTab.innerText()).trim();
              const expectedHref = await dockTab.getAttribute('href');
              console.log(`     Clicking Mobile Dock Tab [${i + 1}/${dockCount}]: "${tabText}" (${expectedHref})...`);

              await dockTab.click();
              await page.waitForTimeout(400);
              const currentPath = new URL(page.url()).pathname;
              assert.strictEqual(currentPath, expectedHref, `Mobile dock tab "${tabText}" landed on "${currentPath}" instead of "${expectedHref}"`);
              await verifyPageHeading(page, expectedHref);
              totalAssertions++; passedAssertions++;
            }

            // Test Mobile "More" Drawer
            const moreBtn = page.locator('nav[aria-label="Mobile Navigation"] button:has-text("More")');
            if (await moreBtn.isVisible().catch(() => false)) {
              console.log(`     Opening Mobile Drawer via 'More' button...`);
              await moreBtn.click();
              await page.waitForTimeout(500);

              const drawerLinks = page.locator('div.fixed a[href]');
              const drawerCount = await drawerLinks.count();
              console.log(`     Found ${drawerCount} items inside Mobile Drawer.`);

              // Test clicking Bills specifically from drawer if present
              const drawerBills = drawerLinks.filter({ hasText: /^Bills/ }).first();
              if (await drawerBills.isVisible().catch(() => false)) {
                console.log(`     Clicking 'Bills' from mobile drawer...`);
                await drawerBills.click();
                await page.waitForTimeout(500);
                await verifyPageHeading(page, '/bills');
                console.log(`     ✓ Bills clicked in mobile drawer -> landed on /bills.`);
                totalAssertions++; passedAssertions++;
              }
            }

            // Test Mobile Logo Click
            console.log(`  3. Testing Brand Logo click in mobile header...`);
            const mobileLogo = page.locator('header a').first();
            await mobileLogo.click();
            await page.waitForTimeout(500);
            await verifyPageHeading(page, testUser.expectedHomeRoute);
            console.log(`     ✓ Logo clicked in mobile -> navigated to ${testUser.expectedHomeRoute}`);
            totalAssertions++; passedAssertions++;
          }

        } else {
          // ── INVENTORY-ONLY USER ACCESS & SILENT REDIRECT TEST ──────────────────
          console.log(`  2. Checking restricted inventory-only user navigation...`);

          if (!vp.isMobile) {
            await page.waitForSelector('nav[aria-label="Application Tabs"] a', { timeout: 10000 });
            // Verify Home tab is HIDDEN
            const homeTab = page.locator('nav[aria-label="Application Tabs"] a').filter({ hasText: /^Home$/ });
            const isHomeVisible = await homeTab.isVisible({ timeout: 1000 }).catch(() => false);
            assert.strictEqual(isHomeVisible, false, `Home tab MUST be hidden for users without dashboard page permission`);
            console.log(`     ✓ Home tab is hidden for inventory-only user.`);
            totalAssertions++; passedAssertions++;

            // Verify Bills tab is HIDDEN
            const billsTab = page.locator('nav[aria-label="Application Tabs"] a').filter({ hasText: /^Bills$/ });
            const isBillsVisible = await billsTab.isVisible({ timeout: 1000 }).catch(() => false);
            assert.strictEqual(isBillsVisible, false, `Bills tab MUST be hidden for users without bills permission`);
            console.log(`     ✓ Bills tab is hidden for inventory-only user.`);
            totalAssertions++; passedAssertions++;

            // Verify ONLY Inventory is visible
            const visibleTabs = page.locator('nav[aria-label="Application Tabs"] a');
            const count = await visibleTabs.count();
            assert.strictEqual(count, 1, `Inventory-only user should only see exactly 1 navbar tab, found ${count}`);
            const tabText = (await visibleTabs.first().innerText()).trim();
            assert.strictEqual(tabText, 'Inventory', `Visible tab must be 'Inventory', got '${tabText}'`);
            console.log(`     ✓ Only 'Inventory' tab is visible.`);
            totalAssertions++; passedAssertions++;

            // Click Inventory tab
            await visibleTabs.first().click();
            await page.waitForTimeout(400);
            await verifyPageHeading(page, '/inventory');
            console.log(`     ✓ Inventory tab clicked -> navigated to /inventory.`);
            totalAssertions++; passedAssertions++;

            // Test Logo Click -> MUST navigate to user's home page (/inventory), NOT /dashboard
            console.log(`  3. Testing Logo click for inventory-only user...`);
            const logo = page.locator('header a').first();
            await logo.click();
            await page.waitForTimeout(500);
            const logoUrlPath = new URL(page.url()).pathname;
            assert.strictEqual(logoUrlPath, '/inventory', `Logo click must navigate to user home page (/inventory), got '${logoUrlPath}'`);
            console.log(`     ✓ Logo clicked -> navigated to ${logoUrlPath}`);
            totalAssertions++; passedAssertions++;
          }

          // ── TEST NO SILENT REDIRECTS (REQUIREMENT 4) ──────────────────────────
          console.log(`  4. Testing direct URL navigation to forbidden pages (No Silent Redirects)...`);

          // Test Direct URL to /invoices
          console.log(`     Direct navigation to /invoices...`);
          await page.goto(`${BASE_URL}/invoices`, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(800);

          let currentPath = new URL(page.url()).pathname;
          assert.strictEqual(
            currentPath,
            '/invoices',
            `User must NOT be silently redirected away from typed URL /invoices. Current URL is ${currentPath}`
          );

          // Assert No Access Card is displayed
          const noAccessTitle = await page.locator('h2:has-text("No Access")').isVisible({ timeout: 3000 });
          assert.strictEqual(noAccessTitle, true, `Must display 'No Access' title`);

          const noAccessMessage = await page.locator('text=/You do not have access to (Invoices|Tax Invoices)/i').isVisible({ timeout: 2000 });
          assert.strictEqual(noAccessMessage, true, `Must display 'You do not have access to Invoices'`);

          // Assert Button to Home Page is present
          const goHomeBtn = page.locator('[data-testid="go-home-button"], button:has-text("Go to your home page")');
          assert.strictEqual(await goHomeBtn.isVisible(), true, `Button 'Go to your home page' must be visible`);
          console.log(`     ✓ No silent redirect: /invoices rendered 'No Access' message with button to home page.`);
          totalAssertions++; passedAssertions++;

          // Click "Go to your home page"
          await goHomeBtn.click();
          await page.waitForTimeout(500);
          const afterHomeUrl = new URL(page.url()).pathname;
          assert.strictEqual(afterHomeUrl, '/inventory', `Clicking home button must land on /inventory, got '${afterHomeUrl}'`);
          console.log(`     ✓ Home button clicked -> landed on ${afterHomeUrl}`);
          totalAssertions++; passedAssertions++;

          // Test Direct URL to /dashboard
          console.log(`     Direct navigation to /dashboard...`);
          await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(800);

          currentPath = new URL(page.url()).pathname;
          assert.strictEqual(
            currentPath,
            '/dashboard',
            `User must NOT be silently redirected away from /dashboard. Current URL is ${currentPath}`
          );

          const dashNoAccess = await page.locator('text=/You do not have access to Home/i').isVisible({ timeout: 3000 });
          assert.strictEqual(dashNoAccess, true, `Must display 'You do not have access to Home'`);
          console.log(`     ✓ No silent redirect: /dashboard rendered 'No Access to Home' message.`);
          totalAssertions++; passedAssertions++;
        }

      } finally {
        await context.close();
      }
    }
  }

  await browser.close();

  console.log('\n========================================================================');
  console.log(`ALL TESTS PASSED! (${passedAssertions}/${totalAssertions} assertions passed)`);
  console.log('========================================================================\n');
}

runTests().catch((err) => {
  console.error('\n[TEST RUNNER ERROR]:', err);
  process.exit(1);
});
