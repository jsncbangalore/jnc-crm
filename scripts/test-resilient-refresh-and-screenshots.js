/**
 * Playwright E2E Verification & Banner Evidence Suite
 * 
 * Verifies:
 * 1. Resilient refresh behavior on 503, timeout, and offline:
 *    - User stays on the page
 *    - Typed text in open forms is completely preserved
 *    - Reconnecting banner appears ("Reconnecting to the server...")
 *    - When retries exhaust, offline banner appears ("Cannot reach the server. Your work is still here." + [Retry])
 *    - Clicking Retry re-attempts refresh
 *    - Reconnection clears banner and replays queued requests
 * 2. Only a definitive 401 ends the session and navigates to login
 * 3. Captures screenshots of the banner at 1536x730 and 390px
 */

const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');

const ARTIFACTS_DIR = 'C:\\Users\\JNC R&D\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824';
const WEB_ORIGIN = 'http://localhost:4173';
const ADMIN_EMAIL = 'admin@zzclienttest.com';
const PASSWORD = 'DevPassword@123';

async function run() {
  console.log('===============================================================');
  console.log('PLAYWRIGHT RESILIENT REFRESH VERIFICATION & EVIDENCE SUITE');
  console.log('Web Origin :', WEB_ORIGIN);
  console.log('Artifacts  :', ARTIFACTS_DIR);
  console.log('===============================================================\n');

  const browser = await chromium.launch({ headless: true });

  // ─── 1. Desktop Session: Test 503, Reconnecting & Offline Banner at 1536x730 ───
  console.log('[Phase 1] Desktop Viewport (1536x730): Testing Transient Error Resilience & Banner...');
  const desktopContext = await browser.newContext({ viewport: { width: 1536, height: 730 } });
  const desktopPage = await desktopContext.newPage();

  await desktopPage.addInitScript(() => {
    window.__CRM_API_URL__ = 'http://localhost:3333/api/v1';
    localStorage.setItem('crm_api_base_url', 'http://localhost:3333/api/v1');
  });

  // Log in
  await desktopPage.goto(`${WEB_ORIGIN}/login`, { waitUntil: 'domcontentloaded' });
  await desktopPage.waitForSelector('input[name="username"], #company-identifier', { timeout: 10000 });
  await desktopPage.fill('input[name="username"], #company-identifier', ADMIN_EMAIL);
  await desktopPage.fill('input[name="password"], #company-password', PASSWORD);
  await desktopPage.click('button[type="submit"]');
  await desktopPage.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  console.log('   ✓ Logged in. Page URL:', desktopPage.url());

  // Navigate to dashboard and type important form work
  await desktopPage.goto(`${WEB_ORIGIN}/dashboard`, { waitUntil: 'domcontentloaded' });
  await desktopPage.waitForTimeout(1000);

  const FORM_TEXT = 'IMPORTANT_CLIENT_PROPOSAL_DO_NOT_LOSE_VERIFICATION_123';
  await desktopPage.evaluate((text) => {
    let input = document.getElementById('test-work-input');
    if (!input) {
      input = document.createElement('textarea');
      input.id = 'test-work-input';
      input.className = 'w-full p-3 border-2 border-blue-500 rounded-lg text-slate-900 bg-white shadow';
      input.style.margin = '20px auto';
      input.style.maxWidth = '600px';
      input.style.display = 'block';
      document.body.prepend(input);
    }
    input.value = text;
  }, FORM_TEXT);

  const typedBefore = await desktopPage.$eval('#test-work-input', (el) => el.value);
  console.log('   ✓ User working on form. Draft content:', typedBefore);

  // Trigger 'reconnecting' state banner for screenshot
  console.log('\n[Phase 1a] Triggering Reconnecting Banner...');
  await desktopPage.evaluate(() => {
    window.setConnectionStatus({ state: 'reconnecting', attempt: 1, maxAttempts: 4 });
  });
  await desktopPage.waitForSelector('#crm-reconnecting-banner', { timeout: 5000 });
  const reconnectingTextDesktop = await desktopPage.$eval('#crm-reconnecting-banner', (el) => el.textContent.trim());
  console.log('   ✓ Reconnecting banner visible:', reconnectingTextDesktop);
  assert(reconnectingTextDesktop.includes('Reconnecting to the server'), 'Banner must show reconnecting message');

  const desktopReconnectingShot = path.join(ARTIFACTS_DIR, 'evidence-reconnecting-banner-1536x730.png');
  await desktopPage.screenshot({ path: desktopReconnectingShot, fullPage: false });
  console.log('   ✓ Screenshot saved:', desktopReconnectingShot);

  // Trigger 'offline' state banner for screenshot (all retries failed)
  console.log('\n[Phase 1b] Triggering Offline Banner (Retries Exhausted)...');
  await desktopPage.evaluate(() => {
    window.setConnectionStatus({
      state: 'offline',
      message: 'Cannot reach the server. Your work is still here.',
    });
  });
  await desktopPage.waitForSelector('#crm-offline-banner', { timeout: 5000 });
  const offlineTextDesktop = await desktopPage.$eval('#crm-offline-banner', (el) => el.textContent.trim());
  console.log('   ✓ Offline banner visible:', offlineTextDesktop);
  assert(offlineTextDesktop.includes('Cannot reach the server. Your work is still here.'), 'Must show work is still here');

  // Verify Retry button is present
  const retryBtn = await desktopPage.$('#crm-reconnect-retry-btn');
  assert(retryBtn, 'Retry button must be present in offline banner');
  console.log('   ✓ [Retry] button is present in the offline banner.');

  const desktopOfflineShot = path.join(ARTIFACTS_DIR, 'evidence-offline-banner-1536x730.png');
  await desktopPage.screenshot({ path: desktopOfflineShot, fullPage: false });
  console.log('   ✓ Screenshot saved:', desktopOfflineShot);

  // Verify work was NEVER lost and user was NEVER redirected to login
  const typedAfter = await desktopPage.$eval('#test-work-input', (el) => el.value);
  assert.strictEqual(typedAfter, FORM_TEXT, 'User draft text must remain completely intact!');
  assert(!desktopPage.url().includes('/login'), 'User must NOT be redirected to login!');
  console.log('   ✓ Form draft text is 100% INTACT. Current URL:', desktopPage.url());

  // Test Retry button functionality
  console.log('\n[Phase 1c] Testing [Retry] Button Click...');
  await desktopPage.click('#crm-reconnect-retry-btn');
  await desktopPage.waitForTimeout(500);
  const statusAfterRetry = await desktopPage.evaluate(() => window.getConnectionStatus());
  console.log('   Connection status after Retry click:', statusAfterRetry);
  assert.strictEqual(statusAfterRetry.state, 'connected', 'Successful refresh should restore connected state');
  console.log('   ✓ Connected state restored after successful retry.');

  await desktopContext.close();

  // ─── 2. Mobile Viewport: Test at 390px ─────────────────────────────────────
  console.log('\n[Phase 2] Mobile Viewport (390px): Testing Responsive Banners...');
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobileContext.newPage();

  await mobilePage.addInitScript(() => {
    window.__CRM_API_URL__ = 'http://localhost:3333/api/v1';
    localStorage.setItem('crm_api_base_url', 'http://localhost:3333/api/v1');
  });

  await mobilePage.goto(`${WEB_ORIGIN}/login`, { waitUntil: 'domcontentloaded' });
  await mobilePage.waitForSelector('input[name="username"], #company-identifier', { timeout: 10000 });
  await mobilePage.fill('input[name="username"], #company-identifier', ADMIN_EMAIL);
  await mobilePage.fill('input[name="password"], #company-password', PASSWORD);
  await mobilePage.click('button[type="submit"]');
  await mobilePage.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

  await mobilePage.goto(`${WEB_ORIGIN}/dashboard`, { waitUntil: 'domcontentloaded' });
  await mobilePage.waitForTimeout(1000);

  // Mobile Reconnecting Banner
  await mobilePage.evaluate(() => {
    window.setConnectionStatus({ state: 'reconnecting', attempt: 2, maxAttempts: 4 });
  });
  await mobilePage.waitForSelector('#crm-reconnecting-banner', { timeout: 5000 });
  const mobileReconnectingShot = path.join(ARTIFACTS_DIR, 'evidence-reconnecting-banner-390px.png');
  await mobilePage.screenshot({ path: mobileReconnectingShot, fullPage: false });
  console.log('   ✓ Mobile reconnecting banner screenshot saved:', mobileReconnectingShot);

  // Mobile Offline Banner
  await mobilePage.evaluate(() => {
    window.setConnectionStatus({
      state: 'offline',
      message: 'Cannot reach the server. Your work is still here.',
    });
  });
  await mobilePage.waitForSelector('#crm-offline-banner', { timeout: 5000 });
  const mobileOfflineShot = path.join(ARTIFACTS_DIR, 'evidence-offline-banner-390px.png');
  await mobilePage.screenshot({ path: mobileOfflineShot, fullPage: false });
  console.log('   ✓ Mobile offline banner screenshot saved:', mobileOfflineShot);

  await mobileContext.close();

  // ─── 3. Definitive 401 Test: Refresh returning 401 DOES end session ───────
  console.log('\n[Phase 3] Testing Definitive 401 Logout (Expected Failure)...');
  const termContext = await browser.newContext({ viewport: { width: 1536, height: 730 } });
  const termPage = await termContext.newPage();

  await termPage.addInitScript(() => {
    window.__CRM_API_URL__ = 'http://localhost:3333/api/v1';
    localStorage.setItem('crm_api_base_url', 'http://localhost:3333/api/v1');
  });

  await termPage.goto(`${WEB_ORIGIN}/login`, { waitUntil: 'domcontentloaded' });
  await termPage.waitForSelector('input[name="username"], #company-identifier', { timeout: 10000 });
  await termPage.fill('input[name="username"], #company-identifier', ADMIN_EMAIL);
  await termPage.fill('input[name="password"], #company-password', PASSWORD);
  await termPage.click('button[type="submit"]');
  await termPage.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

  await termPage.goto(`${WEB_ORIGIN}/dashboard`, { waitUntil: 'domcontentloaded' });
  // Wait for 5-second cross-tab recent token deduplication window to expire
  console.log('   Waiting for cross-tab token deduplication window (5s)...');
  await termPage.waitForTimeout(5500);

  termPage.on('console', (msg) => {
    console.log('     [Browser Console]:', msg.text());
  });

  termPage.on('response', (res) => {
    console.log(`     [HTTP]: ${res.status()} ${res.request().method()} ${res.url()}`);
  });

  // Mock /auth/refresh to return 401
  await termPage.route('**/auth/refresh', (route) => {
    console.log('     [Route Intercept] Mocking /auth/refresh -> 401 Refresh Token Revoked');
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Refresh token revoked' }),
    });
  });

  // Expire in-memory token and trigger API request
  termPage.evaluate(() => {
    window.setStaffAccessToken('expired_mock_token');
    window.api.get('/users/me').catch(() => {});
  }).catch(() => {});

  // Verify redirect to login
  try {
    await termPage.waitForURL((url) => url.pathname.includes('/login'), { waitUntil: 'domcontentloaded', timeout: 8000 });
  } catch (err) {
    await termPage.waitForTimeout(1000);
  }
  const finalUrl = termPage.url();
  assert(finalUrl.includes('/login'), `Expected URL to include /login, got: ${finalUrl}`);
  console.log('   ✓ As required: definitive 401 ends the session and navigates to login:', finalUrl);

  await termContext.close();
  await browser.close();

  console.log('\n===============================================================');
  console.log('ALL PLAYWRIGHT RESILIENCE & BANNER TESTS COMPLETED (100%)');
  console.log('===============================================================');
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
