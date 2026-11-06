/**
 * Playwright Tests for Session Guarantees:
 * 1. 403 keeps the session
 * 2. Wrong password stays on login
 * 3. Refresh 401 shows the banner and lands on '/' with notice and 'Sign in' link
 * 4. Network offline never logs out
 */

const { chromium } = require('playwright');
const assert = require('assert');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5174';

let passedTests = 0;
let failedTests = 0;

function logPass(name) {
  passedTests++;
  console.log(`[PASS] ${name}`);
}

function logFail(name, err) {
  failedTests++;
  console.error(`[FAIL] ${name}:`, err?.message || err);
}

async function runTests() {
  console.log('========================================================================');
  console.log('SESSION PLAYWRIGHT TESTS');
  console.log('Target Base URL:', BASE_URL);
  console.log('========================================================================\n');

  const browser = await chromium.launch({ headless: true });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Wrong password stays on login
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Intercept /auth/login with 401 Invalid credentials
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 401, message: 'Invalid credentials' }),
      });
    });

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#company-identifier', { state: 'visible', timeout: 10000 });

    await page.fill('#company-identifier', 'wrong_user@example.com');
    await page.fill('#company-password', 'wrong_password');
    await page.click('button[type="submit"]');

    await page.waitForTimeout(1000);

    const currentUrl = page.url();
    assert(currentUrl.includes('/login'), `Stayed on /login: ${currentUrl}`);

    // Banner should NOT appear on wrong password
    const banner = await page.$('[data-testid="session-expired-banner"]');
    assert(!banner, 'Session expired banner did not appear on wrong password');

    logPass('Wrong password stays on login (never starts timeout flow)');
    await context.close();
  } catch (err) {
    logFail('Wrong password stays on login', err);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: 403 Forbidden keeps the session
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    const fakeUser = {
      id: 'test_usr_403',
      name: 'Test 403 User',
      email: 'test403@example.com',
      role: 'admin',
      tenantId: 'tenant-403',
      tenant: { id: 'tenant-403', name: 'Test Tenant 403', code: 'T403' },
      effectivePages: ['dashboard', 'orders', 'leads', 'invoices'],
    };

    // Pre-populate storage for active session
    await page.addInitScript((u) => {
      localStorage.setItem('crm_user', JSON.stringify(u));
      localStorage.setItem('crm_portal', 'staff');
      localStorage.setItem('crm_staff_refresh_token', 'fake_refresh_token_403');
      sessionStorage.setItem('crm_portal', 'staff');
      sessionStorage.setItem('crm_tab_user_id', u.id);
      sessionStorage.setItem('crm_tab_user_email', u.email);
    }, fakeUser);

    // Mock auth refresh returning valid token
    await page.route('**/api/v1/auth/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'fake_jwt_valid_403',
          refreshToken: 'fake_refresh_token_403',
          user: fakeUser,
        }),
      });
    });

    // Mock schema status & me
    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(fakeUser),
      });
    });
    await page.route('**/api/v1/admin/schema-status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, pendingCount: 0 }),
      });
    });

    // Mock API call returning 403 Forbidden
    await page.route('**/api/v1/orders**', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 403, message: 'Forbidden access to orders' }),
      });
    });

    await page.goto(`${BASE_URL}/orders`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Verify session remains intact: no session expired banner, user still stored
    const banner = await page.$('[data-testid="session-expired-banner"]');
    assert(!banner, 'No session expired banner shown on 403');

    const storedUser = await page.evaluate(() => localStorage.getItem('crm_user'));
    assert(storedUser !== null, 'Session user is still present in localStorage after 403');

    logPass('403 keeps the session (never expires or logs out)');
    await context.close();
  } catch (err) {
    logFail('403 keeps the session', err);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Refresh 401 shows banner and lands on '/'
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    const fakeUser = {
      id: 'test_usr_401',
      name: 'Test 401 User',
      email: 'test401@example.com',
      role: 'admin',
      tenantId: 'tenant-401',
      tenant: { id: 'tenant-401', name: 'Test Tenant 401', code: 'T401' },
      effectivePages: ['dashboard', 'orders', 'leads', 'invoices'],
    };

    // Pre-populate storage for active session with short countdown for test speed
    await page.addInitScript((u) => {
      localStorage.setItem('crm_user', JSON.stringify(u));
      localStorage.setItem('crm_portal', 'staff');
      localStorage.setItem('crm_staff_refresh_token', 'expired_refresh_token');
      sessionStorage.setItem('crm_portal', 'staff');
      sessionStorage.setItem('crm_tab_user_id', u.id);
      sessionStorage.setItem('crm_tab_user_email', u.email);
    }, fakeUser);

    // Initially return 200 on refresh so page loads into protected layout
    let refreshFailsWith401 = false;
    await page.route('**/api/v1/auth/refresh', async (route) => {
      if (refreshFailsWith401) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ statusCode: 401, message: 'Refresh token expired' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            accessToken: 'fake_jwt_valid',
            refreshToken: 'fake_refresh_token',
            user: fakeUser,
          }),
        });
      }
    });

    // Mock best-effort POST /auth/logout
    let logoutCalled = false;
    await page.route('**/api/v1/auth/logout', async (route) => {
      logoutCalled = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });

    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Now trigger refresh failure with 401
    refreshFailsWith401 = true;

    // Trigger an API call that returns 401, prompting auto-refresh which fails with 401
    await page.route('**/api/v1/leads**', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 401, message: 'Unauthorized' }),
      });
    });

    await page.evaluate(() => {
      fetch('/api/v1/leads').catch(() => {});
    });

    // Wait for the red session expired banner to appear
    await page.waitForSelector('[data-testid="session-expired-banner"]', { timeout: 10000 });
    const bannerText = await page.$eval('[data-testid="session-expired-banner"]', (el) => el.textContent);
    assert(bannerText.includes('Session timed out'), `Banner displayed countdown: ${bannerText}`);

    // Wait for countdown to expire and land on '/'
    await page.waitForURL((url) => url.pathname === '/', { timeout: 12000 });
    const finalUrl = page.url();
    assert(new URL(finalUrl).pathname === '/', `Landed on '/' index page: ${finalUrl}`);

    // Verify the notice is displayed on the index page
    await page.waitForSelector('[data-testid="session-ended-notice"]', { timeout: 5000 });
    const noticeText = await page.$eval('[data-testid="session-ended-notice"]', (el) => el.textContent);
    assert(noticeText.includes('Your session ended. Please sign in again'), `Notice visible on '/': ${noticeText}`);

    // Verify Sign in link is present
    const signInLink = await page.$('[data-testid="session-ended-notice"] a');
    assert(signInLink !== null, 'Sign in link is visible on landing page notice');

    // Click Sign in and verify navigation to /login
    await signInLink.click();
    await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 5000 });
    assert(page.url().includes('/login'), `Navigated to /login after clicking Sign in: ${page.url()}`);

    logPass("Refresh 401 shows banner and lands on '/' with notice and 'Sign in' link");
    await context.close();
  } catch (err) {
    logFail("Refresh 401 shows banner and lands on '/'", err);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Network offline never logs out
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    const fakeUser = {
      id: 'test_usr_offline',
      name: 'Test Offline User',
      email: 'offline@example.com',
      role: 'admin',
      tenantId: 'tenant-offline',
      tenant: { id: 'tenant-offline', name: 'Test Tenant Offline', code: 'TOFF' },
      effectivePages: ['dashboard', 'orders', 'leads', 'invoices'],
    };

    // Pre-populate storage for active session
    await page.addInitScript((u) => {
      localStorage.setItem('crm_user', JSON.stringify(u));
      localStorage.setItem('crm_portal', 'staff');
      localStorage.setItem('crm_staff_refresh_token', 'valid_refresh_token_offline');
      sessionStorage.setItem('crm_portal', 'staff');
      sessionStorage.setItem('crm_tab_user_id', u.id);
      sessionStorage.setItem('crm_tab_user_email', u.email);
    }, fakeUser);

    // Initial refresh succeeds
    await page.route('**/api/v1/auth/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'fake_jwt_valid_offline',
          refreshToken: 'valid_refresh_token_offline',
          user: fakeUser,
        }),
      });
    });

    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(fakeUser),
      });
    });

    await page.route('**/api/v1/admin/schema-status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, pendingCount: 0 }),
      });
    });

    await page.route('**/api/v1/dashboard/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ stats: {} }),
      });
    });

    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Now set browser to offline mode
    await context.setOffline(true);

    // Simulate network activity while offline
    await page.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
    });

    await page.waitForTimeout(2000);

    // Verify user is NOT logged out
    const currentUrl = page.url();
    assert(!currentUrl.includes('/login'), `Stayed on protected page while offline: ${currentUrl}`);
    const banner = await page.$('[data-testid="session-expired-banner"]');
    assert(!banner, 'Session expired banner never shown for network offline');

    const storedUser = await page.evaluate(() => localStorage.getItem('crm_user'));
    assert(storedUser !== null, 'Session user is retained in storage during network offline');

    logPass('Network offline never logs out (session preserved)');
    await context.close();
  } catch (err) {
    logFail('Network offline never logs out', err);
  }

  await browser.close();

  console.log('\n========================================================================');
  console.log(`TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('========================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
