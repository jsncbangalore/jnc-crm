/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const http = require('http');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '..');
const API_BASE = 'http://127.0.0.1:3333/api/v1/';

let passedTests = 0;
let failedTests = 0;

function logPass(title, details = '') {
  passedTests++;
  console.log(`  [PASS] ${title}`);
  if (details) console.log(`         ${details}`);
}

function logFail(title, error) {
  failedTests++;
  console.error(`  [FAIL] ${title}`);
  console.error(`         ${error?.message || error}`);
}

function requestJson(urlPath, method = 'GET', data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const cleanPath = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath;
    const url = new URL(cleanPath, API_BASE);
    const postData = data ? JSON.stringify(data) : null;
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers,
    };
    if (postData) {
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(url, { method, headers: reqHeaders }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed, raw: body });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, data: null, raw: body });
        }
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runAllTests() {
  console.log('========================================================================');
  console.log('SUITE: DEV DEMO LOGIN & SAFETY CONTROLS TEST SUITE');
  console.log('========================================================================\n');

  // --------------------------------------------------------------------------
  // 1. Startup Guard Refusal: validateEnvironment
  // --------------------------------------------------------------------------
  console.log('1. Startup Guard Refusal Tests (Production & Non-Local DB rejection):');
  try {
    const { validateEnvironment } = require('../apps/api/dist/common/env-validation.js');

    // Case 1a: DEV_DEMO_LOGIN='true' in production must be rejected
    const prodEnv = {
      NODE_ENV: 'production',
      DEV_DEMO_LOGIN: 'true',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev',
      JWT_SECRET: 'test-secret-at-least-32-chars-long-security',
      JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-chars',
      APP_URL: 'https://app.example.com',
      ENCRYPTION_KEY: '01234567890123456789012345678901',
    };
    const prodResult = validateEnvironment(prodEnv);
    const prodHasError = prodResult.invalidVariables.some((msg) =>
      msg.includes('DEV_DEMO_LOGIN cannot be enabled in production mode')
    );
    if (!prodResult.isValid && prodHasError) {
      logPass(
        'validateEnvironment flags DEV_DEMO_LOGIN=true in production as invalid',
        prodResult.invalidVariables.find((m) => m.includes('DEV_DEMO_LOGIN'))
      );
    } else {
      logFail('validateEnvironment DEV_DEMO_LOGIN in production', `Expected invalidVariables error, got isValid=${prodResult.isValid}`);
    }

    // Case 1b: DEV_DEMO_LOGIN='true' with remote database must be rejected
    const remoteEnv = {
      NODE_ENV: 'development',
      DEV_DEMO_LOGIN: 'true',
      DATABASE_URL: 'postgresql://user:pass@db.production-cloud.com:5432/jnc_crm_dev',
      JWT_SECRET: 'test-secret-at-least-32-chars-long-security',
      JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-chars',
      APP_URL: 'http://localhost:5173',
      ENCRYPTION_KEY: '01234567890123456789012345678901',
    };
    const remoteResult = validateEnvironment(remoteEnv);
    const remoteHasError = remoteResult.invalidVariables.some((msg) =>
      msg.includes('Database host must be localhost')
    );
    if (!remoteResult.isValid && remoteHasError) {
      logPass(
        'validateEnvironment flags DEV_DEMO_LOGIN=true with remote host as invalid',
        remoteResult.invalidVariables.find((m) => m.includes('Database host must be localhost'))
      );
    } else {
      logFail('validateEnvironment DEV_DEMO_LOGIN with remote host', `Expected invalidVariables error, got isValid=${remoteResult.isValid}`);
    }

    // Case 1c: DEV_DEMO_LOGIN='true' with non-dev database name must be rejected
    const prodDbNameEnv = {
      NODE_ENV: 'development',
      DEV_DEMO_LOGIN: 'true',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/crm_production_live',
      JWT_SECRET: 'test-secret-at-least-32-chars-long-security',
      JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-chars',
      APP_URL: 'http://localhost:5173',
      ENCRYPTION_KEY: '01234567890123456789012345678901',
    };
    const dbNameResult = validateEnvironment(prodDbNameEnv);
    const dbNameHasError = dbNameResult.invalidVariables.some((msg) =>
      msg.includes("Database name must start with 'jnc_crm_dev'")
    );
    if (!dbNameResult.isValid && dbNameHasError) {
      logPass(
        'validateEnvironment flags database name not starting with jnc_crm_dev as invalid',
        dbNameResult.invalidVariables.find((m) => m.includes("Database name must start with 'jnc_crm_dev'"))
      );
    } else {
      logFail('validateEnvironment non-dev database name', `Expected invalidVariables error, got isValid=${dbNameResult.isValid}`);
    }
  } catch (err) {
    logFail('Failed to load or test env-validation', err);
  }

  // --------------------------------------------------------------------------
  // 2. Demo Seed & Reset Guard Tests
  // --------------------------------------------------------------------------
  console.log('\n2. Seed and Reset Scripts Refusal on Non-Local Database:');
  {
    // dev-demo-seed with remote DB
    const seedRes = spawnSync(
      process.execPath,
      ['scripts/dev-demo-seed.js'],
      {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          DATABASE_URL: 'postgresql://postgres:postgres@cloud-db.prod.internal:5432/jnc_crm_dev',
        },
        encoding: 'utf8',
      }
    );
    if (seedRes.status !== 0 && seedRes.stderr.includes('[FATAL] dev:demo-seed REFUSED TO RUN')) {
      logPass('dev:demo-seed exits non-zero and refuses to run against non-localhost database', 'Stderr confirmed refusal');
    } else {
      logFail('dev:demo-seed refusal on remote DB', `Exit: ${seedRes.status}, Output: ${seedRes.stderr || seedRes.stdout}`);
    }

    // dev-demo-reset with remote DB
    const resetRes = spawnSync(
      process.execPath,
      ['scripts/dev-demo-reset.js'],
      {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          DATABASE_URL: 'postgresql://postgres:postgres@cloud-db.prod.internal:5432/jnc_crm_dev',
        },
        encoding: 'utf8',
      }
    );
    if (resetRes.status !== 0 && resetRes.stderr.includes('[FATAL] dev:demo-reset REFUSED TO RUN')) {
      logPass('dev:demo-reset exits non-zero and refuses to run against non-localhost database', 'Stderr confirmed refusal');
    } else {
      logFail('dev:demo-reset refusal on remote DB', `Exit: ${resetRes.status}, Output: ${resetRes.stderr || resetRes.stdout}`);
    }
  }

  // --------------------------------------------------------------------------
  // 3. API Endpoint Guards: 404 for invalid requests & non-demo users
  // --------------------------------------------------------------------------
  console.log('\n3. Endpoint 404 Guards (POST /auth/dev-demo-login):');
  {
    // Test 3a: Non-existent or invalid role
    const invalidRoleRes = await requestJson('/auth/dev-demo-login', 'POST', { role: 'hacker_role' });
    if (invalidRoleRes.status === 404) {
      logPass('Returns 404 for unknown or unpermitted role', 'Status: 404');
    } else {
      logFail('Returns 404 for unknown role', `Expected 404, got ${invalidRoleRes.status}`);
    }

    // Test 3b: Attempt to target non-demo user (or empty role)
    const emptyRoleRes = await requestJson('/auth/dev-demo-login', 'POST', { role: '' });
    if (emptyRoleRes.status === 400 || emptyRoleRes.status === 404) {
      logPass('Returns 400/404 for empty role', `Status: ${emptyRoleRes.status}`);
    } else {
      logFail('Returns 400/404 for empty role', `Expected 400/404, got ${emptyRoleRes.status}`);
    }

    // Test 3c: Fake X-Forwarded-For header must NOT bypass loopback check
    const xffRes = await requestJson('/auth/dev-demo-login', 'POST', { role: 'admin' }, {
      'X-Forwarded-For': '203.0.113.195',
      'X-Real-IP': '203.0.113.195',
    });
    // Since direct socket connection to 127.0.0.1 is loopback, controller inspects socket.remoteAddress, NOT XFF
    if (xffRes.status === 200) {
      logPass('Direct socket connection from 127.0.0.1 ignores spoofed X-Forwarded-For headers', 'Status: 200 based on true TCP socket');
    } else {
      logFail('Spoofed X-Forwarded-For handling', `Expected 200 on local socket, got ${xffRes.status}`);
    }
  }

  // --------------------------------------------------------------------------
  // 4. Successful Demo Login for all 6 Roles
  // --------------------------------------------------------------------------
  console.log('\n4. Successful Demo Login for all 6 Roles:');
  const expectedRoles = [
    {
      role: 'platform_owner',
      expectedEmail: 'platform_owner@demo.test',
      expectedUserRole: 'platform_super_admin',
      expectedRedirect: '/platform/companies',
    },
    {
      role: 'admin',
      expectedEmail: 'admin@demo.test',
      expectedUserRole: 'tenant_admin',
      expectedRedirect: '/dashboard',
    },
    {
      role: 'sales',
      expectedEmail: 'sales@demo.test',
      expectedUserRole: 'employee',
      expectedRedirect: '/leads',
    },
    {
      role: 'accountant',
      expectedEmail: 'accountant@demo.test',
      expectedUserRole: 'accountant',
      expectedRedirect: '/invoices',
    },
    {
      role: 'store',
      expectedEmail: 'store@demo.test',
      expectedUserRole: 'store_manager',
      expectedRedirect: '/inventory',
    },
    {
      role: 'viewer',
      expectedEmail: 'viewer@demo.test',
      expectedUserRole: 'employee',
      expectedRedirect: '/leads',
    },
  ];

  let accountantAccessToken = null;

  for (const exp of expectedRoles) {
    const res = await requestJson('/auth/dev-demo-login', 'POST', { role: exp.role });
    if (res.status === 200 && res.data) {
      const user = res.data.user;
      const validEmail = user?.email === exp.expectedEmail;
      const validRole = user?.role === exp.expectedUserRole;
      const validRedirect = res.data.redirectPath === exp.expectedRedirect;
      const hasAccessToken = !!res.data.accessToken;
      const hasRefreshToken = !!res.data.refreshToken;
      const isDemo = user?.isDemo === true;

      if (validEmail && validRole && validRedirect && hasAccessToken && hasRefreshToken && isDemo) {
        logPass(
          `Role '${exp.role}': email=${user.email}, role=${user.role}, isDemo=true, redirect=${res.data.redirectPath}`,
          `Tokens issued: accessToken & refreshToken present, 2FA bypassed`
        );
      } else {
        logFail(
          `Role '${exp.role}' verification`,
          `Email match: ${validEmail}, Role match: ${validRole}, Redirect match: ${validRedirect}, isDemo: ${isDemo}`
        );
      }

      if (exp.role === 'accountant') {
        accountantAccessToken = res.data.accessToken;
      }
    } else {
      logFail(`Role '${exp.role}' failed`, `Status: ${res.status}, Body: ${res.raw}`);
    }
  }

  // --------------------------------------------------------------------------
  // 5. Accountant Permissions & Invoices Access Check
  // --------------------------------------------------------------------------
  console.log('\n5. Accountant User Access & Invoices Authorization Check:');
  if (accountantAccessToken) {
    const meRes = await requestJson('/auth/me', 'GET', null, {
      Authorization: `Bearer ${accountantAccessToken}`,
    });
    const effectivePages = meRes.data?.effectivePages || meRes.data?.user?.effectivePages;
    if (meRes.status === 200 && effectivePages?.includes('invoices')) {
      logPass(
        'GET /auth/me confirms accountant effectivePages includes "invoices"',
        `Effective pages: [${effectivePages.join(', ')}]`
      );
    } else {
      logFail('Accountant effectivePages verification', `Status: ${meRes.status}, data: ${JSON.stringify(meRes.data)}`);
    }

    const invoicesRes = await requestJson('/invoices?limit=5', 'GET', null, {
      Authorization: `Bearer ${accountantAccessToken}`,
    });
    if (invoicesRes.status === 200) {
      logPass('GET /invoices authorized and returned HTTP 200 for accountant', `Invoices count: ${invoicesRes.data?.invoices?.length ?? invoicesRes.data?.length ?? 0}`);
    } else {
      logFail('GET /invoices for accountant', `Status: ${invoicesRes.status}, Body: ${invoicesRes.raw}`);
    }
  } else {
    logFail('Accountant verification skipped', 'No access token available');
  }

  // --------------------------------------------------------------------------
  // 6. Production Bundle Leak Scan
  // --------------------------------------------------------------------------
  console.log('\n6. Production Web Bundle Hygiene (No dev leaks in apps/web/dist):');
  const scanRes = spawnSync(process.execPath, ['scripts/scan-dist-leaks.js'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (scanRes.status === 0) {
    logPass('scripts/scan-dist-leaks.js passed: 0 banned strings in production web bundle', scanRes.stdout.trim());
  } else {
    logFail('scripts/scan-dist-leaks.js failed', `${scanRes.stdout}\n${scanRes.stderr}`);
  }

  // --------------------------------------------------------------------------
  // 7. TwoFactorChallenge UI Bug Fix Check
  // --------------------------------------------------------------------------
  console.log('\n7. TwoFactorChallenge Component Fix Check:');
  const twoFactorFile = path.join(REPO_ROOT, 'apps/web/src/components/common/TwoFactorChallenge.tsx');
  if (fs.existsSync(twoFactorFile)) {
    const tfContent = fs.readFileSync(twoFactorFile, 'utf8');
    const hasDigitChangeClear = tfContent.includes('const handleEmailDigitChange = (index: number, val: string) => {\r\n    setError(\'\');') ||
                                tfContent.includes('const handleEmailDigitChange = (index: number, val: string) => {\n    setError(\'\');');
    const hasKeyDownClear = tfContent.includes('const handleEmailKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {\r\n    setError(\'\');') ||
                            tfContent.includes('const handleEmailKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {\n    setError(\'\');');
    const hasPasteClear = tfContent.includes('const handleEmailPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {\r\n    e.preventDefault();\r\n    setError(\'\');') ||
                          tfContent.includes('const handleEmailPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {\n    e.preventDefault();\n    setError(\'\');');

    if (hasDigitChangeClear && hasKeyDownClear && hasPasteClear) {
      logPass(
        'TwoFactorChallenge clears error immediately upon user typing, keydown, or paste',
        'Verified setError("") in handleEmailDigitChange, handleEmailKeyDown, handleEmailPaste'
      );
    } else {
      logFail('TwoFactorChallenge error handling', 'Expected setError("") calls in handlers not detected');
    }
  } else {
    logFail('TwoFactorChallenge file not found', twoFactorFile);
  }

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`DEMO LOGIN SUITE SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${passedTests + failedTests})`);
  console.log('========================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('[FATAL] Suite execution error:', err);
  process.exit(1);
});
