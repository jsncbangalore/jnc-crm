/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const { chromium } = require('playwright');

const BASE_URL = process.env.TEST_FRONTEND_URL || 'http://localhost:5173';
const STAFF_EMAIL = 'tenantadmin@example.com';
const PLATFORM_EMAIL = 'platform@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'type-your-own-long-password';

async function runTests() {
  console.log('========================================================================');
  console.log('PLAYWRIGHT DUAL-CONTEXT BROWSER TEST SUITE');
  console.log('Frontend Target:', BASE_URL);
  console.log('Browser Engine:  Chromium (Headless)');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, testName, detail = '') {
    total++;
    if (condition) {
      passed++;
      console.log(`[PASS] ${testName}${detail ? ' -> ' + detail : ''}`);
    } else {
      console.error(`[FAIL] ${testName}${detail ? ' -> ' + detail : ''}`);
    }
  }

  const browser = await chromium.launch({
    headless: true,
  });

  try {
    // ------------------------------------------------------------------------
    // SCENARIO (A): Concurrent Staff (Context A) and Platform (Context B) Logins
    // ------------------------------------------------------------------------
    console.log('--- TEST SCENARIO (a): Concurrent Dual Login & Session Persistence ---');

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    // Context A: Staff Login
    await pageA.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await pageA.fill('#identifier', STAFF_EMAIL);
    await pageA.fill('#password', TEST_PASSWORD);
    await pageA.click('button[type="submit"]');

    await pageA.waitForURL((url) => !url.pathname.includes('/login'), { waitUntil: 'domcontentloaded', timeout: 15000 });
    const urlA = pageA.url();
    assert(!urlA.includes('/login'), 'Context A: Staff logged in successfully', `URL: ${urlA}`);

    // Context B: Platform Super Admin Login
    await pageB.goto(`${BASE_URL}/platform/login`, { waitUntil: 'domcontentloaded' });
    await pageB.fill('#platform-email', PLATFORM_EMAIL);
    await pageB.fill('#platform-password', TEST_PASSWORD);
    await pageB.click('button[type="submit"]');

    await pageB.waitForURL((url) => url.pathname.includes('/platform/companies'), { waitUntil: 'domcontentloaded', timeout: 15000 });
    const urlB = pageB.url();
    assert(urlB.includes('/platform/companies'), 'Context B: Platform Super Admin logged in successfully', `URL: ${urlB}`);

    // Reload Context A: Session persists on staff side
    await pageA.waitForTimeout(1000);
    await pageA.reload({ waitUntil: 'domcontentloaded' });
    await pageA.waitForTimeout(1500);
    const reloadUrlA = pageA.url();
    assert(!reloadUrlA.includes('/login'), 'Context A: Session persisted across page reload', `URL: ${reloadUrlA}`);

    // Reload Context B: Session persists on platform side
    await pageB.waitForTimeout(1000);
    await pageB.reload({ waitUntil: 'domcontentloaded' });
    await pageB.waitForTimeout(1500);
    const reloadUrlB = pageB.url();
    assert(reloadUrlB.includes('/platform/companies'), 'Context B: Session persisted across page reload', `URL: ${reloadUrlB}`);

    // ------------------------------------------------------------------------
    // SCENARIO (B): Logout in B Does Not Log Out A
    // ------------------------------------------------------------------------
    console.log('\n--- TEST SCENARIO (b): Session Isolation on Logout ---');

    // Logout from Platform in Context B
    const logoutBtnB = pageB.locator('button[title="Logout"]').first();
    if (await logoutBtnB.count() > 0) {
      await logoutBtnB.click();
    } else {
      // Direct call to logout via header / dropdown if visible, or evaluate AuthContext logoutPlatform
      await pageB.evaluate(() => {
        window.location.href = '/platform/login';
      });
      // Call platform logout API to simulate clean logout
      await contextB.request.post('http://localhost:3333/api/v1/platform-auth/logout', {
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Origin': BASE_URL }
      });
    }

    await pageB.waitForURL((url) => url.pathname.includes('/platform/login'), { timeout: 10000 });
    assert(pageB.url().includes('/platform/login'), 'Context B: Platform logged out cleanly', `URL: ${pageB.url()}`);

    // Reload Context A to prove staff session remains 100% active and authenticated
    await pageA.waitForTimeout(1000);
    await pageA.reload({ waitUntil: 'domcontentloaded' });
    await pageA.waitForTimeout(1500);
    const staffStillLoggedIn = !pageA.url().includes('/login');
    assert(staffStillLoggedIn, 'Context A: Staff session remains authenticated after Platform logout in Context B', `URL: ${pageA.url()}`);

    // ------------------------------------------------------------------------
    // SCENARIO (C): Route Guard Notices & Prevent Redirect Loops
    // ------------------------------------------------------------------------
    console.log('\n--- TEST SCENARIO (c): Cross-Portal Route Guards & Notices ---');

    // Context A (Staff user) navigates to /platform/companies
    await pageA.goto(`${BASE_URL}/platform/companies`, { waitUntil: 'domcontentloaded' });
    await pageA.waitForTimeout(2000);
    const pageAText = await pageA.innerText('body');
    const hasPortalNotice = pageAText.includes('This is the client-company portal. Use the team login.') ||
                            pageAText.includes('Portal Access Notice');
    const noLoopA = pageA.url().includes('/platform/companies');
    assert(hasPortalNotice && noLoopA, 'Context A: Navigating to /platform/companies displays client-company notice without redirect loop', `URL: ${pageA.url()}`);

    // Re-authenticate Context B as Platform Admin to test /leads guard
    await pageB.goto(`${BASE_URL}/platform/login`, { waitUntil: 'domcontentloaded' });
    await pageB.fill('#platform-email', PLATFORM_EMAIL);
    await pageB.fill('#platform-password', TEST_PASSWORD);
    await pageB.click('button[type="submit"]');
    await pageB.waitForURL((url) => url.pathname.includes('/platform/companies'), { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Context B navigates directly to /leads
    await pageB.goto(`${BASE_URL}/leads`, { waitUntil: 'domcontentloaded' });
    await pageB.waitForTimeout(2000);
    const pageBText = await pageB.innerText('body');
    const hasImpersonationNotice = pageBText.includes('Impersonation Required') ||
                                  pageBText.includes('Impersonate a company from the client-companies portal to view CRM records.');
    assert(hasImpersonationNotice, 'Context B: Navigating to /leads displays Impersonation Required notice', `URL: ${pageB.url()}`);

    // ------------------------------------------------------------------------
    // SCENARIO (D): Stopped / Unreachable API Shows "Cannot reach the server"
    // ------------------------------------------------------------------------
    console.log('\n--- TEST SCENARIO (d): Stopped/Unreachable API Error Display ---');

    const contextOffline = await browser.newContext();
    const pageOffline = await contextOffline.newPage();

    // Intercept and abort backend API requests to simulate stopped API server
    await pageOffline.route('**/api/v1/**', (route) => {
      route.abort('connectionrefused');
    });
    await pageOffline.route('http://localhost:3333/**', (route) => {
      route.abort('connectionrefused');
    });

    await pageOffline.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await pageOffline.waitForSelector('#identifier', { timeout: 10000 });
    await pageOffline.fill('#identifier', 'test@example.com');
    await pageOffline.fill('#password', 'AnyPassword#123');
    await pageOffline.click('button[type="submit"]');

    // Wait for error banner
    const errorAlert = pageOffline.locator('[role="alert"]');
    await errorAlert.waitFor({ state: 'visible', timeout: 10000 });
    const errorText = await errorAlert.innerText();
    const showsCannotReach = errorText.includes('Cannot reach the server');
    assert(showsCannotReach, 'Offline API: Login form displays "Cannot reach the server" error banner', `Message: "${errorText.trim()}"`);

    await contextA.close();
    await contextB.close();
    await contextOffline.close();

    console.log('\n========================================================================');
    console.log(`TEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
    console.log('========================================================================\n');

    if (passed !== total) {
      process.exit(1);
    }
  } catch (err) {
    console.error('\nFatal Playwright test exception:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runTests();
