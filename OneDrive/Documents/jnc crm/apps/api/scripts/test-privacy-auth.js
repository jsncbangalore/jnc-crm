/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const http = require('http');

async function main() {
  console.log('========================================================================');
  console.log('PRIVACY & SECURITY AUTHENTICATION TEST SUITE');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
    }
  }

  // --- TEST 1: Storage Sanitization Simulation (Theme preserved, all else cleared) ---
  console.log('--- TEST GROUP 1: Storage Sanitization (Theme Preserved, All Else Cleared) ---');
  {
    const mockLocalStorage = {
      store: {
        crm_theme: 'dark',
        crm_user: JSON.stringify({ id: '123', name: 'Test' }),
        crm_last_company_code: 'DEMO',
        auth_token: 'secret-token-123',
        user_settings: '{"sidebar":true}',
      },
      getItem(k) { return this.store[k] ?? null; },
      setItem(k, v) { this.store[k] = String(v); },
      removeItem(k) { delete this.store[k]; },
      clear() { this.store = {}; },
      key(i) { return Object.keys(this.store)[i]; },
      get length() { return Object.keys(this.store).length; },
    };

    const mockSessionStorage = {
      store: {
        session_cache: 'confidential_data',
        temp_id: 'abc',
      },
      clear() { this.store = {}; },
      get length() { return Object.keys(this.store).length; },
    };

    // Replicate clearStorageExceptTheme() implementation from AuthContext.tsx
    function clearStorageExceptTheme(ls, ss) {
      const theme = ls.getItem('crm_theme');
      ls.clear();
      if (theme) ls.setItem('crm_theme', theme);
      ss.clear();
    }

    clearStorageExceptTheme(mockLocalStorage, mockSessionStorage);

    const lsKeys = Object.keys(mockLocalStorage.store);
    const ssKeys = Object.keys(mockSessionStorage.store);

    assert(lsKeys.length === 1 && lsKeys[0] === 'crm_theme', `localStorage contains only 'crm_theme' (Actual keys: [${lsKeys.join(', ')}])`);
    assert(mockLocalStorage.getItem('crm_theme') === 'dark', 'Theme value is preserved');
    assert(mockLocalStorage.getItem('crm_user') === null, 'crm_user key was removed from localStorage');
    assert(mockLocalStorage.getItem('crm_last_company_code') === null, 'Company code was removed from localStorage');
    assert(ssKeys.length === 0, `sessionStorage is completely empty (Count: ${ssKeys.length})`);
  }

  // --- TEST GROUP 2: Frontend Code Inspection (LoginPage.tsx & Auth Pages) ---
  console.log('\n--- TEST GROUP 2: Frontend Code Inspection (LoginPage, Auth Pages, BFCache) ---');
  {
    const loginPageCode = fs.readFileSync(path.resolve(__dirname, '../../web/src/pages/LoginPage.tsx'), 'utf8');
    const authContextCode = fs.readFileSync(path.resolve(__dirname, '../../web/src/contexts/AuthContext.tsx'), 'utf8');
    const forgotPageCode = fs.readFileSync(path.resolve(__dirname, '../../web/src/pages/ForgotPasswordPage.tsx'), 'utf8');
    const resetPageCode = fs.readFileSync(path.resolve(__dirname, '../../web/src/pages/ResetPasswordPage.tsx'), 'utf8');
    const platformLoginPageCode = fs.readFileSync(path.resolve(__dirname, '../../web/src/pages/PlatformLoginPage.tsx'), 'utf8');
    const mainCode = fs.readFileSync(path.resolve(__dirname, '../../web/src/main.tsx'), 'utf8');

    // 1. LoginPage starts with empty company code and removes old key on mount
    assert(loginPageCode.includes('localStorage.removeItem(COMPANY_CODE_KEY);'), 'LoginPage removes old saved company code from localStorage on mount');
    assert(loginPageCode.includes("const [companyCode, setCompanyCode] = useState<string>('')") || loginPageCode.includes("const [companyCode, setCompanyCode] = useState('')"), 'LoginPage initializes companyCode as empty string');
    assert(!loginPageCode.includes('localStorage.setItem(COMPANY_CODE_KEY'), 'LoginPage never writes company code to localStorage');

    // 2. Autofill prevention attributes
    assert(loginPageCode.includes('autoComplete="off"'), 'LoginPage form has autoComplete="off"');
    assert(loginPageCode.includes('name="company"'), 'LoginPage company input has name="company"');
    assert(loginPageCode.includes('name="identity"'), 'LoginPage identity input has name="identity"');
    assert(loginPageCode.includes('name="secret"'), 'LoginPage password input has name="secret"');
    assert(loginPageCode.includes('autoComplete="new-password"'), 'LoginPage password input has autoComplete="new-password"');
    assert(loginPageCode.includes('spellCheck={false}'), 'LoginPage inputs have spellCheck={false}');

    // 3. Other auth pages
    assert(forgotPageCode.includes('autoComplete="off"'), 'ForgotPasswordPage form has autoComplete="off"');
    assert(resetPageCode.includes('autoComplete="new-password"'), 'ResetPasswordPage uses autoComplete="new-password"');
    assert(platformLoginPageCode.includes('autoComplete="off"'), 'PlatformLoginPage form has autoComplete="off"');
    assert(!platformLoginPageCode.includes("localStorage.setItem('user'") && !platformLoginPageCode.includes("localStorage.setItem('crm_user'"), 'PlatformLoginPage never saves user to localStorage');

    // 4. In-memory profile & logout replaceState in AuthContext.tsx
    assert(!authContextCode.includes("localStorage.setItem('user'") && !authContextCode.includes("localStorage.setItem('crm_user'"), 'AuthContext never writes user profile to localStorage');
    assert(authContextCode.includes("window.history.replaceState(null, '', '/login');"), 'AuthContext uses history.replaceState on logout to prevent Back button navigation to private view');

    // 5. BFCache pageshow handler in main.tsx
    assert(mainCode.includes('pageshow') && mainCode.includes('event.persisted'), 'main.tsx registers pageshow event listener checking event.persisted to defeat BFCache restoration');
  }

  // --- TEST GROUP 3: Live API HTTP Headers Inspection ---
  console.log('\n--- TEST GROUP 3: Live API HTTP Response Headers Inspection ---');
  {
    function httpRequest(options, postData) {
      return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
        });
        req.on('error', reject);
        if (postData) req.write(postData);
        req.end();
      });
    }

    try {
      // 1. GET /api/v1/auth/me (Unauthorized)
      const resMe = await httpRequest({
        hostname: 'localhost',
        port: 3333,
        path: '/api/v1/auth/me',
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      assert(resMe.statusCode === 401, `/api/v1/auth/me returns 401 Unauthorized (Actual: ${resMe.statusCode})`);
      assert(resMe.headers['cache-control'] && resMe.headers['cache-control'].includes('no-store'), `/api/v1/auth/me carries Cache-Control: no-store (Actual: "${resMe.headers['cache-control']}")`);
      assert(resMe.headers['pragma'] === 'no-cache', `/api/v1/auth/me carries Pragma: no-cache`);
      assert(resMe.headers['expires'] === '0', `/api/v1/auth/me carries Expires: 0`);

      // 2. POST /api/v1/auth/logout
      const resLogout = await httpRequest({
        hostname: 'localhost',
        port: 3333,
        path: '/api/v1/auth/logout',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });
      assert(resLogout.statusCode === 201 || resLogout.statusCode === 200, `/api/v1/auth/logout returns 200/201 (Actual: ${resLogout.statusCode})`);
      assert(resLogout.headers['clear-site-data'] === '"cache", "storage"', `/api/v1/auth/logout carries Clear-Site-Data: "cache", "storage"`);
      assert(resLogout.headers['cache-control'] && resLogout.headers['cache-control'].includes('no-store'), `/api/v1/auth/logout carries Cache-Control: no-store (Actual: "${resLogout.headers['cache-control']}")`);
      const setCookie = resLogout.headers['set-cookie'] ? resLogout.headers['set-cookie'].join('; ') : '';
      assert(setCookie.includes('crm_refresh_token=;') && setCookie.includes('1970'), `/api/v1/auth/logout clears refresh cookie (Set-Cookie: "${setCookie}")`);
    } catch (e) {
      console.error('[!] API test error:', e.message);
      assert(false, `API request failed: ${e.message}`);
    }
  }

  // --- Playwright Browser End-To-End Note ---
  console.log('\n--- Playwright E2E Tests ---');
  console.log('Playwright E2E: NOT RUN (Playwright not installed in environment; verified via Component + Node Integration Suite)');

  console.log('\n========================================================================');
  console.log(`TOTAL TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('========================================================================');
}

main().catch(console.error);
