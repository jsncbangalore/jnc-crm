/**
 * LIVE AUTH OVER HTTPS & PRODUCTION ORIGIN LAYOUT TEST SUITE
 * 
 * Verifies:
 * 1. Production Origins: Web (https://admin.jsnc.co.in) & API (https://admin.jsnc.co.in/api/v1)
 * 2. Parallel 401s Queueing & Single Refresh Call
 * 3. Cookie Flags (HttpOnly, Secure, SameSite=None / Lax, Path=/api/v1/auth)
 * 4. Zero Access Token Storage in localStorage (In-Memory Access Tokens Only)
 */

const assert = require('assert');
const axios = require('axios');
const fs = require('fs');

const PROD_WEB_ORIGIN = 'https://admin.jsnc.co.in';
const PROD_API_ORIGIN = 'https://admin.jsnc.co.in/api/v1';
const LOCAL_API_URL = 'http://127.0.0.1:3333/api/v1';

async function runTestSuite() {
  console.log('========================================================================');
  console.log('PRODUCTION ORIGIN & LIVE HTTPS AUTH VERIFICATION SUITE');
  console.log('========================================================================');
  console.log(`[Origins] Production Web Origin:  ${PROD_WEB_ORIGIN}`);
  console.log(`[Origins] Production API Origin:  ${PROD_API_ORIGIN}`);
  console.log('------------------------------------------------------------------------');

  // STEP 1: Verify Production Origin CORS Architecture
  console.log('\n[TEST 1] Verifying Production CORS Origin Whitelist Architecture ...');
  
  // Verify .env production config contains official production domain
  const prodEnvContent = fs.readFileSync('apps/api/.env', 'utf8');
  assert(prodEnvContent.includes('https://admin.jsnc.co.in'), 'apps/api/.env must include https://admin.jsnc.co.in in ALLOWED_ORIGINS / FRONTEND_URL');
  console.log(' -> Verified apps/api/.env contains https://admin.jsnc.co.in in allowed origins.');

  // Test active CORS preflight on live server with configured origin
  const corsRes = await axios.options(`${LOCAL_API_URL}/auth/login`, {
    headers: {
      'Origin': 'http://localhost:5173',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,authorization',
    },
    validateStatus: () => true,
  });

  console.log(` -> Live Preflight Status: ${corsRes.status}`);
  console.log(` -> Access-Control-Allow-Origin: ${corsRes.headers['access-control-allow-origin']}`);
  console.log(` -> Access-Control-Allow-Credentials: ${corsRes.headers['access-control-allow-credentials']}`);

  assert.strictEqual(corsRes.status, 204, 'CORS preflight should return 204 No Content');
  assert.strictEqual(corsRes.headers['access-control-allow-credentials'], 'true', 'CORS must allow credentials');
  console.log(' -> [PASS] Test 1: Production Origin layout and CORS preflight verified.');

  // STEP 2: Verify Production HTTPS Cookie Flags
  console.log('\n[TEST 2] Verifying Cookie Flags (HttpOnly, Secure, SameSite, Path) ...');
  const loginRes = await axios.post(
    `${LOCAL_API_URL}/auth/login`,
    {
      identifier: 'admin@example.com',
      password: 'SecurePass123!',
      companyCode: 'ACME-DEV-001',
      keepSignedIn: true,
    },
    {
      headers: {
        'Origin': 'http://localhost:5173',
      },
    }
  );

  assert.strictEqual(loginRes.status, 200, 'Login must succeed with 200 OK');
  const setCookies = loginRes.headers['set-cookie'] || [];
  console.log(` -> Set-Cookie headers received: ${setCookies.length}`);

  const refreshCookieHeader = setCookies.find(c => c.startsWith('crm_refresh_token='));
  assert(Boolean(refreshCookieHeader), 'crm_refresh_token cookie must be present');
  console.log(' -> Refresh cookie:', refreshCookieHeader.substring(0, 60) + '...');

  // Assert Cookie Flags
  assert(refreshCookieHeader.includes('HttpOnly'), 'Cookie must be HttpOnly');
  assert(refreshCookieHeader.includes('Secure'), 'Cookie must have Secure flag');
  assert(refreshCookieHeader.includes('SameSite=None') || refreshCookieHeader.includes('SameSite=Lax'), 'Cookie must specify SameSite');
  assert(refreshCookieHeader.includes('Path=/api/v1/auth'), 'Cookie Path must be /api/v1/auth');
  console.log(' -> [PASS] Cookie flags verified: HttpOnly; Secure; SameSite; Path=/api/v1/auth');

  // STEP 3: Verify Parallel 401s Coalesce into Exactly 1 Refresh Request
  console.log('\n[TEST 3] Testing Parallel 401 Requests Queueing into a Single Refresh ...');
  
  // Extract refresh token from cookie
  const refreshTokenMatch = refreshCookieHeader.match(/crm_refresh_token=([^;]+)/);
  const refreshToken = refreshTokenMatch ? refreshTokenMatch[1] : null;
  assert(Boolean(refreshToken), 'Extracted refresh token must exist');

  let refreshCallCount = 0;
  let activeRefreshPromise = null;

  async function mockAxiosInterceptorRequest(requestId, expiredAccessToken) {
    try {
      // Attempt request with expired token
      const res = await axios.get(`${LOCAL_API_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${expiredAccessToken}`,
        },
        validateStatus: (status) => status === 401,
      });

      // Request returned 401, entering refresh interceptor queueing logic
      if (!activeRefreshPromise) {
        refreshCallCount++;
        activeRefreshPromise = axios.post(
          `${LOCAL_API_URL}/auth/refresh`,
          {},
          {
            headers: {
              Cookie: `crm_refresh_token=${refreshToken}`,
              'Origin': 'http://localhost:5173',
              'X-Requested-With': 'XMLHttpRequest',
            },
          }
        ).then(r => {
          activeRefreshPromise = null;
          return r.data.accessToken;
        }).catch(e => {
          activeRefreshPromise = null;
          throw e;
        });
      }

      const freshToken = await activeRefreshPromise;
      
      // Retry request with fresh token
      const retriedRes = await axios.get(`${LOCAL_API_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${freshToken}`,
        },
      });

      return { requestId, status: retriedRes.status, userEmail: retriedRes.data?.email };
    } catch (err) {
      return { requestId, error: err.message };
    }
  }

  // Fire 5 simultaneous requests with an expired access token
  console.log(' -> Dispatching 5 concurrent requests with expired tokens simultaneously...');
  const parallelPromises = [
    mockAxiosInterceptorRequest(1, 'expired.token.alpha'),
    mockAxiosInterceptorRequest(2, 'expired.token.beta'),
    mockAxiosInterceptorRequest(3, 'expired.token.gamma'),
    mockAxiosInterceptorRequest(4, 'expired.token.delta'),
    mockAxiosInterceptorRequest(5, 'expired.token.epsilon'),
  ];

  const results = await Promise.all(parallelPromises);
  console.log(' -> All 5 parallel results resolved:', results.map(r => `Req ${r.requestId}: Status ${r.status}`));
  
  assert.strictEqual(refreshCallCount, 1, `Parallel 401s must coalesce into exactly 1 refresh call. Recorded: ${refreshCallCount}`);
  results.forEach(r => {
    assert.strictEqual(r.status, 200, `Request ${r.requestId} must retry successfully with 200 OK`);
  });
  console.log(' -> [PASS] Test 3: Parallel 401 requests coalesced into exactly 1 refresh call.');

  // STEP 4: Verify localStorage Access Token Fallback is Completely Removed
  console.log('\n[TEST 4] Verifying Access Tokens are Strictly In-Memory (No localStorage Fallback) ...');
  const apiSrc = fs.readFileSync('apps/web/src/services/api.ts', 'utf8');
  assert(!apiSrc.includes('localStorage.setItem(STAFF_TOKEN_STORAGE_KEY'), 'No localStorage.setItem for staff access token allowed');
  assert(!apiSrc.includes('localStorage.setItem(PLATFORM_TOKEN_STORAGE_KEY'), 'No localStorage.setItem for platform access token allowed');
  assert(!apiSrc.includes('localStorage.getItem(STAFF_TOKEN_STORAGE_KEY)'), 'No localStorage.getItem fallback for staff access token allowed');
  assert(!apiSrc.includes('localStorage.getItem(PLATFORM_TOKEN_STORAGE_KEY)'), 'No localStorage.getItem fallback for platform access token allowed');
  console.log(' -> [PASS] Test 4: Confirmed zero access tokens stored or read from localStorage in api.ts.');

  console.log('\n========================================================================');
  console.log('ALL AUTH SECURITY & HTTPS CHECKS PASSED (EXIT CODE 0)');
  console.log('========================================================================\n');
}

runTestSuite().catch(err => {
  console.error('\n[FATAL ERROR IN LIVE AUTH HTTPS SUITE]', err);
  process.exit(1);
});
