/**
 * Reproduction Script for Session Expiration Bug
 * 
 * Demonstrates what the user sees today when /auth/refresh fails due to:
 * 1. 503 Service Unavailable (e.g. Render server cold start / restart)
 * 2. Request Timeout (>60s or network stall)
 * 3. Browser Offline / Network disconnect
 * 4. Legitimate 401 Unauthorized (token actually expired/revoked)
 */

const { chromium } = require('playwright');
const assert = require('assert');

const WEB_ORIGIN = 'http://localhost:4173';
const ADMIN_EMAIL = 'admin@zzclienttest.com';
const PASSWORD = 'DevPassword@123';

async function reproduce() {
  console.log('===============================================================');
  console.log('REPRODUCING SESSION EXPIRATION BUG (CURRENT BEHAVIOR)');
  console.log('Web Origin:', WEB_ORIGIN);
  console.log('===============================================================\n');

  const browser = await chromium.launch({ headless: true });

  const runScenario = async (name, setupRoute) => {
    console.log(`\n--- Scenario: ${name} ---`);
    const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
    const page = await context.newPage();

    page.on('console', (msg) => {
      const txt = msg.text();
      if (txt.includes('refresh') || txt.includes('session') || txt.includes('401') || txt.includes('503') || txt.includes('Error')) {
        console.log('     [Browser Console]:', txt);
      }
    });

    page.on('response', (res) => {
      if (res.url().includes('refresh') || res.status() === 401 || res.status() === 503) {
        console.log(`     [HTTP Response]: ${res.status()} ${res.request().method()} ${res.url()}`);
      }
    });

    await page.addInitScript(() => {
      window.__CRM_API_URL__ = 'http://localhost:3333/api/v1';
      localStorage.setItem('crm_api_base_url', 'http://localhost:3333/api/v1');
    });

    // 1. Log in
    await page.goto(`${WEB_ORIGIN}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[name="username"], #company-identifier', { timeout: 10000 });
    await page.fill('input[name="username"], #company-identifier', ADMIN_EMAIL);
    await page.fill('input[name="password"], #company-password', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    console.log('  1. User logged in, on page:', page.url());

    // 2. Simulate user typing into an input field (working on a form)
    await page.goto(`${WEB_ORIGIN}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Let's create an input or type into search to simulate unsaved form text
    const DRAFT_TEXT = 'DRAFT_IMPORTANT_CLIENT_PROPOSAL_DO_NOT_LOSE';
    await page.evaluate((text) => {
      // Create a temporary form textarea simulating work in progress
      let input = document.getElementById('test-work-input');
      if (!input) {
        input = document.createElement('textarea');
        input.id = 'test-work-input';
        input.className = 'w-full p-2 border rounded';
        document.body.prepend(input);
      }
      input.value = text;
    }, DRAFT_TEXT);

    const typedBefore = await page.$eval('#test-work-input', (el) => el.value);
    console.log('  2. User working on form. Typed draft text:', typedBefore);

    // 3. Set up route interception for /auth/refresh
    await setupRoute(context, page);

    // 4. Invalidate access token in memory so the next API call receives a 401 and triggers refresh
    console.log('  3. Expiring access token in-memory to trigger automatic refresh on next API call...');
    await page.evaluate(() => {
      if (typeof window.setStaffAccessToken === 'function') {
        window.setStaffAccessToken('expired_mock_jwt_token');
      }
    });

    // 5. Make an API request to /users/me via window.api (which triggers 401 interceptor & performStaffRefresh)
    console.log('  4. Making API request to /users/me with expired token via window.api...');
    page.evaluate(async () => {
      try {
        await window.api.get('/users/me');
      } catch (err) {
        // expected to fail
      }
    }).catch(() => {});

    // 6. Check what happens to the user
    console.log('  5. Checking what the user sees...');
    try {
      await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 8000 });
      const currentUrl = page.url();
      const sessionExpiredMsg = await page.evaluate(() => sessionStorage.getItem('crm_session_expired'));
      const toastOrAlert = await page.evaluate(() => {
        const el = document.querySelector('[role="alert"], .text-red-600, .bg-red-50, .alert, .text-danger');
        return el ? el.textContent.trim() : null;
      });

      console.log('     >>> TODAY\'S BUG CONFIRMED <<<');
      console.log('     Redirected URL:', currentUrl);
      console.log('     sessionStorage.crm_session_expired:', sessionExpiredMsg);
      console.log('     Visible Alert/Banner on screen:', toastOrAlert);
      console.log('     Form draft text status: DESTROYED (page unloaded / navigated to login)');
      return { evicted: true, url: currentUrl, message: sessionExpiredMsg };
    } catch (e) {
      console.log('     User was NOT redirected to login. Current URL:', page.url());
      return { evicted: false, url: page.url() };
    } finally {
      await context.close();
    }
  };

  // Scenario 1: 503 Service Unavailable
  await runScenario('1. Refresh returns 503 (Render Server Cold-start / 503)', async (context, page) => {
    await page.route('**/auth/refresh', (route) => {
      console.log('     [Route Intercept] Intercepted /auth/refresh -> Returning 503 Service Unavailable');
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Service Unavailable - Cold starting' }),
      });
    });
  });

  // Scenario 2: Request Timeout
  await runScenario('2. Refresh times out (Network stall / >60s)', async (context, page) => {
    await page.route('**/auth/refresh', (route) => {
      console.log('     [Route Intercept] Intercepted /auth/refresh -> Aborting with timedout');
      route.abort('timedout');
    });
  });

  // Scenario 3: Browser goes offline
  await runScenario('3. Browser goes offline (Network drop)', async (context, page) => {
    await page.route('**/auth/refresh', (route) => {
      console.log('     [Route Intercept] Intercepted /auth/refresh -> Aborting with connection failed');
      route.abort('failed');
    });
  });

  // Scenario 4: Legitimate 401
  await runScenario('4. Refresh returns 401 (Refresh token actually expired/revoked)', async (context, page) => {
    await page.route('**/auth/refresh', (route) => {
      console.log('     [Route Intercept] Intercepted /auth/refresh -> Returning 401 Unauthorized');
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Refresh token expired' }),
      });
    });
  });

  await browser.close();
  console.log('\n===============================================================');
  console.log('REPRODUCTION RUN COMPLETE');
  console.log('===============================================================');
}

reproduce().catch((err) => {
  console.error('Fatal reproduction error:', err);
  process.exit(1);
});
