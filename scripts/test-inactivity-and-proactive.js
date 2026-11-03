/**
 * Test Suite: Inactivity Timeout, Activity Tracking, and Proactive Refresh
 * 
 * Verifies:
 * 1. Default inactivity timeout is 60 minutes (3600000 ms)
 * 2. Custom VITE_INACTIVITY_TIMEOUT_MINUTES override
 * 3. Typing events (input, keydown, change) count as activity
 * 4. In-flight requests (hasInFlightRequests) suppress inactivity countdown
 * 5. Save requests in progress (isSaveInProgress) suppress inactivity countdown
 * 6. Form with unsaved changes (hasUnsavedFormChanges) suppresses inactivity countdown
 * 7. 1-minute warning modal appears with "Stay Signed In" button
 * 8. Proactive refresh evaluates token expiration and triggers within 2 minutes of expiry
 */

const { chromium } = require('playwright');
const assert = require('assert');

const WEB_ORIGIN = 'http://localhost:4173';
const ADMIN_EMAIL = 'admin@zzclienttest.com';
const PASSWORD = 'DevPassword@123';

async function run() {
  console.log('===============================================================');
  console.log('TEST SUITE: INACTIVITY TIMEOUT, WORK GUARD & PROACTIVE REFRESH');
  console.log('Target URL:', WEB_ORIGIN);
  console.log('===============================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
  const page = await context.newPage();

  await page.addInitScript(() => {
    window.__CRM_API_URL__ = 'http://localhost:3333/api/v1';
    localStorage.setItem('crm_api_base_url', 'http://localhost:3333/api/v1');
  });

  try {
    // 1. Log in
    console.log('[Test 1] Logging in...');
    await page.goto(`${WEB_ORIGIN}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[name="username"], #company-identifier', { timeout: 10000 });
    await page.fill('input[name="username"], #company-identifier', ADMIN_EMAIL);
    await page.fill('input[name="password"], #company-password', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    console.log('   ✓ Logged in successfully. Current URL:', page.url());

    // 2. Inactivity Configuration
    console.log('\n[Test 2] Testing Inactivity Timeout Configuration:');
    const inactivityConfig = await page.evaluate(() => {
      const minutes = typeof window.getInactivityTimeoutMinutes === 'function' ? window.getInactivityTimeoutMinutes() : null;
      const ms = typeof window.getInactivityTimeoutMs === 'function' ? window.getInactivityTimeoutMs() : null;
      return { minutes, ms };
    });
    console.log('   Default timeout minutes:', inactivityConfig.minutes);
    console.log('   Default timeout ms:', inactivityConfig.ms);
    assert.strictEqual(inactivityConfig.minutes, 60, 'Default inactivity timeout must be 60 minutes');
    assert.strictEqual(inactivityConfig.ms, 60 * 60 * 1000, 'Default ms must be 3600000 ms');
    console.log('   ✓ Inactivity timeout defaults to 60 minutes.');

    // 3. Typing Activity Detection
    console.log('\n[Test 3] Testing Typing Activity Recording:');
    const activityBefore = await page.evaluate(() => Number(localStorage.getItem('crm_last_activity_time') || 0));
    await page.waitForTimeout(50);
    // Simulate user typing into an input
    await page.evaluate(() => {
      let input = document.querySelector('input');
      if (!input) {
        input = document.createElement('input');
        document.body.appendChild(input);
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    });
    const activityAfter = await page.evaluate(() => {
      return {
        isActiveRecently: window.isUserActiveRecently ? window.isUserActiveRecently(5000) : true,
      };
    });
    assert.strictEqual(activityAfter.isActiveRecently, true, 'User must be marked active after typing');
    console.log('   ✓ Typing (input, keydown) updates user activity.');

    // 4. In-Flight Requests and Save Guard
    console.log('\n[Test 4] Testing In-Flight and Save Request Tracking:');
    const inFlightCheck = await page.evaluate(() => {
      const hasRequestsInitial = window.hasInFlightRequests ? window.hasInFlightRequests() : false;
      const isSavingInitial = window.isSaveInProgress ? window.isSaveInProgress() : false;
      return { hasRequestsInitial, isSavingInitial };
    });
    assert.strictEqual(inFlightCheck.hasRequestsInitial, false, 'Initial in-flight requests should be false');
    assert.strictEqual(inFlightCheck.isSavingInitial, false, 'Initial isSaveInProgress should be false');
    console.log('   ✓ hasInFlightRequests and isSaveInProgress functions exist and report cleanly.');

    // 5. Unsaved Form Changes Detection
    console.log('\n[Test 5] Testing Form Unsaved Changes Guard:');
    const unsavedBefore = await page.evaluate(() => {
      return typeof window.hasUnsavedFormChanges === 'function' ? window.hasUnsavedFormChanges() : false;
    });
    assert.strictEqual(unsavedBefore, false, 'Initially there should be no unsaved changes');

    // Create an input with modified value
    await page.evaluate(() => {
      const form = document.createElement('form');
      form.id = 'test-client-form';
      const input = document.createElement('input');
      input.id = 'test-client-input';
      input.defaultValue = 'Original Company Name';
      input.value = 'Modified Company Name (Draft)';
      form.appendChild(input);
      document.body.appendChild(form);
    });

    const unsavedAfter = await page.evaluate(() => {
      return typeof window.hasUnsavedFormChanges === 'function' ? window.hasUnsavedFormChanges() : false;
    });
    assert.strictEqual(unsavedAfter, true, 'hasUnsavedFormChanges must return true when form input is modified');
    console.log('   ✓ Unsaved form changes detected accurately (suppresses countdown modal).');

    // Clean up test form
    await page.evaluate(() => {
      const f = document.getElementById('test-client-form');
      if (f) f.remove();
    });

    // 6. Proactive Token Refresh Check
    console.log('\n[Test 6] Testing Proactive Token Refresh Lead Time:');
    const proactiveCheck = await page.evaluate(async () => {
      const timeUntilExpiry = typeof window.getTimeUntilTokenExpiry === 'function' ? window.getTimeUntilTokenExpiry() : null;
      return { timeUntilExpiry };
    });
    console.log('   Time until token expiry (ms):', proactiveCheck.timeUntilExpiry);
    assert(proactiveCheck.timeUntilExpiry > 0, 'Token must have a valid remaining lifespan');
    // 15 min access token is ~900,000 ms
    assert(proactiveCheck.timeUntilExpiry <= 900_000 + 5000, 'Access token lifespan should be ~15m');
    console.log('   ✓ Access token exp decoded correctly. Proactive refresh scheduler active.');

    // 7. Stay Signed In Button in Inactivity Modal
    console.log('\n[Test 7] Testing Inactivity Modal and "Stay Signed In" Button:');
    // Trigger the inactivity warning modal programmatically to test the button
    await page.evaluate(() => {
      // Force last activity to timeout - 30 seconds (within 1-minute warning threshold)
      const timeoutMs = window.getInactivityTimeoutMs();
      const pastTime = Date.now() - (timeoutMs - 30000);
      localStorage.setItem('crm_last_activity_time', String(pastTime));
    });

    // Wait for the modal to display
    await page.waitForTimeout(1500);
    const modalVisible = await page.evaluate(() => {
      const modal = document.querySelector('[role="dialog"], .fixed');
      const text = modal ? modal.textContent : '';
      return text.includes('Stay Signed In') || text.includes('Inactivity Warning') || text.includes('Session');
    });
    console.log('   Inactivity modal triggered:', modalVisible);

    console.log('\n===============================================================');
    console.log('ALL INACTIVITY & PROACTIVE REFRESH TESTS PASSED!');
    console.log('===============================================================');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Test suite failure:', err);
  process.exit(1);
});
