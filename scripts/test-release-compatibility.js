#!/usr/bin/env node
/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Release Compatibility & Error Handling Test Suite
 *
 * Verifies:
 * 1. Error message mappings in API client (network failure, 404, 405, 429, 5xx, 400 validation).
 * 2. Version check & semver comparison logic (detecting outdated API and disabling forms).
 * 3. Backward compatibility of routes against backend API (health, login, refresh, forgot-password, reset-password).
 */

const assert = require('assert');
const http = require('http');

let passedTests = 0;
let totalTests = 0;

function it(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
  }
}

async function itAsync(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Inlined getApiErrorMessage logic (mirroring apps/web/src/services/api.ts)
// ─────────────────────────────────────────────────────────────────────────────
function getApiErrorMessage(err) {
  if (!err?.response) {
    return 'Cannot reach the server. Check your connection.';
  }

  const status = err.response.status;

  if (status === 404 || status === 405) {
    return 'This feature is not available yet. We are updating the system, please try again in a few minutes.';
  }

  if (status === 429) {
    return 'Too many attempts. Please wait and try again.';
  }

  if (status >= 500) {
    return 'Something went wrong on our side. Please try again.';
  }

  if (status === 400) {
    const data = err.response.data;
    if (data?.message) {
      if (Array.isArray(data.message)) {
        const cleanList = data.message
          .map((m) => String(m).replace(/[A-Za-z]:\\[^ ]+|\/[a-zA-Z0-9_\-./]+/g, '').trim())
          .filter(Boolean);
        if (cleanList.length > 0) {
          return cleanList.join(', ');
        }
      } else if (typeof data.message === 'string') {
        const clean = data.message.replace(/[A-Za-z]:\\[^ ]+|\/[a-zA-Z0-9_\-./]+/g, '').trim();
        const lower = clean.toLowerCase();
        if (clean && !lower.includes('syntaxerror') && !lower.includes('prisma') && !lower.includes('stack')) {
          return clean;
        }
      }
    }
    return 'Invalid request details. Please check the fields and try again.';
  }

  if (status === 401) {
    return err.response.data?.message || 'Incorrect email or password. Please check and try again.';
  }

  if (status === 403) {
    return err.response.data?.message || 'Access restricted. Please contact your administrator.';
  }

  return err.response?.data?.message || 'An error occurred. Please try again.';
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Semver Comparison Logic (mirroring apps/web/src/utils/versionCheck.ts)
// ─────────────────────────────────────────────────────────────────────────────
function compareSemver(v1, v2) {
  const parse = (v) =>
    (v || '0.0.0')
      .replace(/^v/i, '')
      .split('.')
      .map((seg) => parseInt(seg, 10) || 0);

  const [maj1, min1, pat1] = parse(v1);
  const [maj2, min2, pat2] = parse(v2);

  if (maj1 !== maj2) return maj1 > maj2 ? 1 : -1;
  if (min1 !== min2) return min1 > min2 ? 1 : -1;
  if (pat1 !== pat2) return pat1 > pat2 ? 1 : -1;
  return 0;
}

function checkApiCompatibilitySim(apiVer, reqVer) {
  const isOutdated = compareSemver(apiVer, reqVer) < 0;
  return {
    compatible: !isOutdated,
    apiVersion: apiVer,
    requiredVersion: reqVer,
    isOutdated,
    message: isOutdated
      ? 'We are updating the system. Please try again in a few minutes.'
      : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. HTTP Request Helper for Live API
// ─────────────────────────────────────────────────────────────────────────────
function apiPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      `http://localhost:3333/api/v1${path}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'X-Requested-With': 'XMLHttpRequest',
        },
        timeout: 5000,
      },
      (res) => {
        let respData = '';
        res.on('data', (c) => (respData += c));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(respData);
          } catch {
            parsed = respData;
          }
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.write(data);
    req.end();
  });
}

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `http://localhost:3333/api/v1${path}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        timeout: 5000,
      },
      (res) => {
        let respData = '';
        res.on('data', (c) => (respData += c));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(respData);
          } catch {
            parsed = respData;
          }
          resolve({ status: res.statusCode, data: parsed });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.end();
  });
}

async function main() {
  console.log('='.repeat(70));
  console.log('  TEST SUITE: API ERROR HANDLING & RELEASE COMPATIBILITY');
  console.log('='.repeat(70));

  // ── TEST GROUP 1: Error Message Mappings ───────────────────────────────────
  console.log('\n[1] Error Message Mapping Tests:');

  it('No response at all (network failure or CORS) maps to connection message', () => {
    const msg = getApiErrorMessage({ code: 'ERR_NETWORK', message: 'Network Error' });
    assert.strictEqual(msg, 'Cannot reach the server. Check your connection.');
  });

  it('404 Not Found maps to maintenance/updating message', () => {
    const msg = getApiErrorMessage({ response: { status: 404, data: { message: 'Cannot POST /api/v1/auth/forgot-password/start' } } });
    assert.strictEqual(msg, 'This feature is not available yet. We are updating the system, please try again in a few minutes.');
  });

  it('405 Method Not Allowed maps to maintenance/updating message', () => {
    const msg = getApiErrorMessage({ response: { status: 405, data: { message: 'Method Not Allowed' } } });
    assert.strictEqual(msg, 'This feature is not available yet. We are updating the system, please try again in a few minutes.');
  });

  it('429 Rate limit maps to too many attempts message', () => {
    const msg = getApiErrorMessage({ response: { status: 429, data: { message: 'ThrottlerException: Too Many Requests' } } });
    assert.strictEqual(msg, 'Too many attempts. Please wait and try again.');
  });

  it('500 Internal Server Error maps to safe generic message', () => {
    const msg = getApiErrorMessage({ response: { status: 500, data: { message: 'Database query failed' } } });
    assert.strictEqual(msg, 'Something went wrong on our side. Please try again.');
  });

  it('502 / 503 Bad Gateway maps to safe generic message', () => {
    const msg502 = getApiErrorMessage({ response: { status: 502, data: {} } });
    const msg503 = getApiErrorMessage({ response: { status: 503, data: {} } });
    assert.strictEqual(msg502, 'Something went wrong on our side. Please try again.');
    assert.strictEqual(msg503, 'Something went wrong on our side. Please try again.');
  });

  it('400 Validation error shows clean field message without server paths', () => {
    const errWithPaths = {
      response: {
        status: 400,
        data: {
          message: [
            'email must be an email',
            'password must be a string C:\\app\\src\\auth\\auth.service.ts:120',
          ],
        },
      },
    };
    const msg = getApiErrorMessage(errWithPaths);
    assert.ok(msg.includes('email must be an email'));
    assert.ok(!msg.includes('C:\\app\\src'));
  });

  // ── TEST GROUP 2: Version Check & Form Disabling ───────────────────────────
  console.log('\n[2] Version Check & Semver Compatibility Tests:');

  it('Semver comparator correctly evaluates version relations', () => {
    assert.strictEqual(compareSemver('1.1.0', '1.0.0'), 1);
    assert.strictEqual(compareSemver('1.0.0', '1.1.0'), -1);
    assert.strictEqual(compareSemver('1.1.0', '1.1.0'), 0);
    assert.strictEqual(compareSemver('1.2.0', '1.1.0'), 1);
  });

  it('Old API (1.0.0) triggers isOutdated: true and sets maintenance notice', () => {
    const res = checkApiCompatibilitySim('1.0.0', '1.1.0');
    assert.strictEqual(res.compatible, false);
    assert.strictEqual(res.isOutdated, true);
    assert.strictEqual(
      res.message,
      'We are updating the system. Please try again in a few minutes.'
    );
  });

  it('Current API (1.1.0) allows operation with isOutdated: false', () => {
    const res = checkApiCompatibilitySim('1.1.0', '1.1.0');
    assert.strictEqual(res.compatible, true);
    assert.strictEqual(res.isOutdated, false);
    assert.strictEqual(res.message, undefined);
  });

  // ── TEST GROUP 3: Backend Release Compatibility Live Verification ──────────
  console.log('\n[3] Backend API Release Compatibility Live Tests:');

  await itAsync('GET /api/v1/health returns status ok, apiVersion 1.1.0, and features without secrets', async () => {
    const res = await apiGet('/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, 'ok');
    assert.strictEqual(res.data.apiVersion, '1.1.0');
    assert.ok(Array.isArray(res.data.features));
    assert.ok(res.data.features.includes('password-reset-flow'));
    // Ensure no secrets/server details leaked
    assert.strictEqual(res.data.secret, undefined);
    assert.strictEqual(res.data.database, undefined);
    assert.strictEqual(res.data.env, undefined);
  });

  await itAsync('POST /api/v1/auth/login works with legacy payload (new fields optional)', async () => {
    // Calling with only legacy fields (email and password)
    const res = await apiPost('/auth/login', {
      email: 'test_nonexistent_user_compat@example.com',
      password: 'SecurePassword123!',
    });
    // Should process login and return 401 Unauthorized for invalid user, NOT 400 Bad Request
    assert.strictEqual(res.status, 401);
  });

  await itAsync('POST /api/v1/auth/forgot-password legacy endpoint works', async () => {
    const res = await apiPost('/auth/forgot-password', {
      email: 'test_compat_user@example.com',
    });
    // Should return 200 or 201 with generic message, NOT 404 or 405
    assert.ok(res.status === 200 || res.status === 201);
  });

  await itAsync('POST /api/v1/auth/reset-password does NOT return 410 Gone', async () => {
    const res = await apiPost('/auth/reset-password', {
      token: 'mock-legacy-token-1234567890',
      newPassword: 'NewSecurePassword#2026',
    });
    // Must NOT return 410 Gone!
    assert.notStrictEqual(res.status, 410);
    // Returns 400 Bad Request with clean message when token is invalid
    assert.strictEqual(res.status, 400);
    assert.ok(
      String(res.data.message || '').includes('Invalid or expired password reset link')
    );
  });

  console.log('\n' + '='.repeat(70));
  console.log(`  SUMMARY: ${passedTests}/${totalTests} tests passed.`);
  console.log('='.repeat(70));

  if (passedTests < totalTests) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
