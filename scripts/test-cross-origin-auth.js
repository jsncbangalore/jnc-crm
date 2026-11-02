const { chromium } = require('playwright');
const assert = require('assert');

const WEB_ORIGIN = 'http://localhost:5173';
const API_ORIGIN = 'http://127.0.0.1:3333';
const API_URL = `${API_ORIGIN}/api/v1`;

async function runTests() {
  console.log('========================================================================');
  console.log('CROSS-ORIGIN AUTHENTICATION & REFRESH TEST SUITE (PLAYWRIGHT)');
  console.log(`Web Origin: ${WEB_ORIGIN}`);
  console.log(`API Origin: ${API_ORIGIN}`);
  console.log('========================================================================\n');

  const browser = await chromium.launch({ headless: true });

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Cross-Origin Login & Refresh Cookie Invariant
    // -------------------------------------------------------------------------
    console.log('[TEST 1] Testing cross-origin login sets HttpOnly refresh cookie ...');
    const context1 = await browser.newContext();
    await context1.addInitScript(() => {
      window.__CRM_API_URL__ = 'http://127.0.0.1:3333/api/v1';
      localStorage.setItem('crm_api_base_url', 'http://127.0.0.1:3333/api/v1');
    });
    const page1 = await context1.newPage();

    page1.on('response', async res => {
      if (res.url().includes('/auth/')) {
        console.log(`[Response ${res.status()}] ${res.url()}`);
        const headers = await res.allHeaders();
        console.log('   set-cookie:', headers['set-cookie']);
      }
    });

    await page1.goto(`${WEB_ORIGIN}/login`);
    await page1.waitForSelector('#company-identifier, input[name="username"]', { timeout: 8000 });

    // Fill login credentials
    const identInput = page1.locator('#company-identifier, input[name="username"]').first();
    const passInput = page1.locator('#company-password, input[name="password"]').first();
    await identInput.fill('admin@example.com');
    await passInput.fill('SecurePass123!');

    // Check if company code input is visible or toggle it
    const companyInput = page1.locator('#company-code-input, input[name="companyCode"]');
    if (await companyInput.isVisible().catch(() => false)) {
      await companyInput.fill('ACME-DEV-001');
    } else {
      const toggleBtn = page1.locator('button:has-text("Enter company code"), span:has-text("Enter company code"), button:has-text("company code")').first();
      if (await toggleBtn.isVisible().catch(() => false)) {
        await toggleBtn.click();
        await page1.waitForTimeout(300);
        await companyInput.fill('ACME-DEV-001');
      }
    }

    const submitBtn = page1.locator('button[type="submit"]');
    await submitBtn.click();

    // Wait for navigation past login
    await page1.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10000 });
    console.log(` -> Successfully logged in. Landed on: ${page1.url()}`);

    const cookiesAll = await context1.cookies();
    const cookiesApi = await context1.cookies('http://127.0.0.1:3333/api/v1/auth');
    console.log(' -> All Cookies in context:', cookiesAll.map(c => `${c.name}@${c.domain}${c.path}`));
    console.log(' -> API Cookies in context:', cookiesApi.map(c => `${c.name}@${c.domain}${c.path}`));
    const cookies = [...cookiesAll, ...cookiesApi];
    const refreshCookie = cookies.find(c => c.name === 'crm_refresh_token');
    const sessionActiveCookie = cookies.find(c => c.name === 'crm_session_active');

    assert(Boolean(refreshCookie), 'Expected crm_refresh_token cookie to be present after login');
    assert.strictEqual(refreshCookie.httpOnly, true, 'crm_refresh_token must be HttpOnly');
    assert(refreshCookie.path.includes('/api/v1/auth'), 'crm_refresh_token must target auth path');

    const storedToken = await page1.evaluate(() => localStorage.getItem('crm_staff_token'));
    const inMemoryToken = await page1.evaluate(() => window.getAccessToken ? window.getAccessToken() : null);
    assert.strictEqual(storedToken, null, 'Access token must NOT be stored in localStorage (memory-only enforced)');
    assert(Boolean(inMemoryToken), 'Expected in-memory access token after login');
    console.log(' -> [PASS] Test 1: Cross-origin login succeeded and set HttpOnly refresh cookie.');

    // -------------------------------------------------------------------------
    // TEST 2: Expired Access Token Auto-Refreshes and Continues Working
    // -------------------------------------------------------------------------
    console.log('\n[TEST 2] Testing auto-refresh when access token is expired ...');
    let refreshCallsCount = 0;
    page1.on('request', req => {
      if (req.url().includes('/auth/refresh') && req.method() === 'POST') {
        refreshCallsCount++;
      }
    });

    // Intentionally corrupt access token to simulate expiration
    await page1.evaluate(() => {
      if (window.setStaffAccessToken) {
        window.setStaffAccessToken('expired.dummy.token');
      } else {
        localStorage.setItem('crm_staff_token', 'expired.dummy.token');
      }
    });

    // Make an authenticated API call via the page context
    const apiResult = await page1.evaluate(async () => {
      try {
        const res = await window.api.get('/auth/me');
        return { status: res.status, email: res.data?.email || res.data?.user?.email };
      } catch (e) {
        return { error: e.message, status: e?.response?.status };
      }
    });

    console.log(' -> Evaluation result after expired token:', apiResult);
    assert.strictEqual(apiResult.status, 200, 'API request should succeed after auto-refresh');
    assert.strictEqual(apiResult.email, 'admin@example.com', 'API should return the authenticated user');
    assert.strictEqual(refreshCallsCount, 1, 'Exactly one refresh request should have been dispatched');

    const newStoredToken = await page1.evaluate(() => localStorage.getItem('crm_staff_token'));
    const newInMemoryToken = await page1.evaluate(() => window.getAccessToken ? window.getAccessToken() : null);
    assert.strictEqual(newStoredToken, null, 'Access token must NOT be stored in localStorage after refresh');
    assert(newInMemoryToken && newInMemoryToken !== 'expired.dummy.token', 'New valid in-memory access token should replace expired token');
    console.log(' -> [PASS] Test 2: Auto-refresh transparently restored session on 401.');

    // -------------------------------------------------------------------------
    // TEST 3: Bad Refresh Cookie Redirects to Login Without Looping
    // -------------------------------------------------------------------------
    console.log('\n[TEST 3] Testing bad refresh cookie triggers redirect to login without looping ...');
    const context3 = await browser.newContext();
    await context3.addInitScript(() => {
      window.__CRM_API_URL__ = 'http://127.0.0.1:3333/api/v1';
      localStorage.setItem('crm_api_base_url', 'http://127.0.0.1:3333/api/v1');
    });
    const page3 = await context3.newPage();

    let client401Count = 0;
    let refreshAttempts = 0;

    page3.on('request', req => {
      if (req.url().includes('/auth/refresh') && req.method() === 'POST') {
        refreshAttempts++;
      }
    });

    page3.on('response', res => {
      if (res.status() === 401) {
        client401Count++;
      }
    });

    // Seed invalid session state
    await page3.goto(`${WEB_ORIGIN}/login`);
    await page3.evaluate(() => {
      if (window.setStaffAccessToken) window.setStaffAccessToken('bad-access-token');
      localStorage.setItem('crm_user', JSON.stringify({ id: 'test', email: 'test@example.com' }));
      sessionStorage.setItem('crm_tab_user_id', 'invalid-user');
    });

    // Add an invalid refresh cookie to context
    await context3.addCookies([{
      name: 'crm_refresh_token',
      value: 'invalid.bad.refresh.token',
      domain: '127.0.0.1',
      path: '/api/v1/auth',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    }]);

    // Navigate to a protected route (/dashboard or /users)
    await page3.goto(`${WEB_ORIGIN}/users`);

    // Interceptor should catch failed refresh and redirect to /login?expired=1
    await page3.waitForURL(url => url.pathname.includes('/login'), { timeout: 8000 });
    assert(page3.url().includes('expired=1'), 'URL should include expired=1 parameter');

    // Verify session expired error banner is displayed
    const expiredBanner = page3.locator('text="Your session expired, please sign in"').first();
    await expiredBanner.waitFor({ state: 'visible', timeout: 5000 });
    const bannerText = await expiredBanner.textContent();
    assert(bannerText.includes('Your session expired, please sign in'), 'Expected expired session message banner');

    // Wait 3 seconds to guarantee no refresh loop continues
    await page3.waitForTimeout(3000);
    const loopAttempts = refreshAttempts;
    console.log(` -> Refresh attempts recorded: ${loopAttempts} (Expected: <= 2, No looping)`);
    assert(loopAttempts <= 2, 'Refresh attempts must not loop');
    console.log(' -> [PASS] Test 3: Bad refresh cookie redirected to login without looping.');

    // -------------------------------------------------------------------------
    // TEST 4: Users Page Loads User Records
    // -------------------------------------------------------------------------
    console.log('\n[TEST 4] Testing Users page loads data for authenticated user ...');
    await page1.goto(`${WEB_ORIGIN}/users`, { waitUntil: 'domcontentloaded' });
    await page1.waitForSelector('table', { timeout: 10000 });

    // Look for user table or admin email in the users list
    const adminUserCell = page1.locator('table td').filter({ hasText: 'admin@example.com' }).first();
    await adminUserCell.waitFor({ state: 'visible', timeout: 10000 });
    console.log(' -> Successfully found admin user in Users list table.');
    console.log(' -> [PASS] Test 4: Users page loaded data properly.');

    // -------------------------------------------------------------------------
    // TEST 5: Public Inquiry Form Works and Sets No Cookies
    // -------------------------------------------------------------------------
    console.log('\n[TEST 5] Testing public inquiry form submission sets no cookies ...');
    const context5 = await browser.newContext();
    const page5 = await context5.newPage();
    await page5.goto(WEB_ORIGIN, { waitUntil: 'domcontentloaded' });

    // Use public demo request endpoint
    const publicFormResult = await page5.evaluate(async (apiUrl) => {
      const res = await fetch(`${apiUrl}/public/demo-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:5173',
        },
        body: JSON.stringify({
          name: 'Playwright Cross-Origin Tester',
          phone: '+919876543210',
          email: 'public-test@example.com',
          message: 'Public lead inquiry verification',
        }),
      });
      const data = await res.json().catch(() => null);
      return { status: res.status, data };
    }, API_URL);

    console.log(' -> Public form submit response:', publicFormResult);
    assert.strictEqual(publicFormResult.status, 200, 'Public inquiry form submission should return 200 OK');

    const cookiesContext5 = await context5.cookies();
    console.log(` -> Cookies in public context: ${cookiesContext5.length}`);
    assert.strictEqual(cookiesContext5.length, 0, 'Public inquiry submission must set ZERO cookies');
    console.log(' -> [PASS] Test 5: Public inquiry form works and sets no cookies.');

    await context1.close();
    await context3.close();
    await context5.close();
  } finally {
    await browser.close();
  }

  console.log('\n========================================================================');
  console.log('ALL 5 CROSS-ORIGIN AUTHENTICATION TESTS PASSED SUCCESSFULLY!');
  console.log('========================================================================\n');
}

runTests().catch((err) => {
  console.error('\n[FATAL TEST ERROR]', err);
  process.exit(1);
});
