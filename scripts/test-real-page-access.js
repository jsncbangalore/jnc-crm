/* --- REAL PAGE ACCESS INTEGRATION TEST SUITE ---
 * Replaces decorator-only checks with live end-to-end integration tests:
 * 1. Authenticates against live API daemon as a user WITHOUT each page:
 *    - ledger
 *    - invoices
 *    - quotations
 *    - branding
 * 2. Asserts HTTP 403 Forbidden on the corresponding backend API endpoints.
 * 3. Launches Playwright browser and logs into frontend UI as the restricted user:
 *    - Navigates to /ledger -> Asserts 'No Access' screen is rendered.
 *    - Navigates to /invoices -> Asserts 'No Access' screen is rendered.
 *    - Navigates to /quotations -> Asserts 'No Access' screen is rendered.
 *    - Navigates to /settings/branding -> Asserts 'No Access' screen is rendered.
 * 4. Asserts positive access when permission is granted.
 * -------------------------------------------------------------------------- */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const assert = require('assert');

// 1. Load dev environment variables safely
if (fs.existsSync('.env.development')) {
  fs.readFileSync('.env.development', 'utf8').split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let val = (match[2] || '').trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      process.env[match[1]] = val;
    }
  });
}

const { PrismaClient } = require(path.resolve(__dirname, '../node_modules/@prisma/client'));
const prisma = new PrismaClient();

const API_PORT = 3333;
const WEB_PORT = 5173;
const API_BASE = `http://localhost:${API_PORT}/api/v1`;
const WEB_BASE = `http://localhost:${WEB_PORT}`;

const TEST_USER_EMAIL = 'access-tester@example.internal';
const TEST_USER_PASS = 'TestAccessSecure@123';
const BCRYPT_SALT_ROUNDS = 10;
const bcrypt = require('bcryptjs');

let totalTests = 0;
let passedTests = 0;

function logTest(name, passed, detail = '') {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`  [PASS] Test ${totalTests}: ${name}`);
  } else {
    console.error(`  [FAIL] Test ${totalTests}: ${name}`);
    if (detail) console.error(`         ${detail}`);
  }
}

function apiRequest(method, endpointPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + endpointPath);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function loginApi(email, password) {
  const res = await apiRequest('POST', '/auth/login', {}, { email, password });
  if (res.status !== 200 || !res.body?.accessToken) {
    throw new Error(`Login failed for ${email}: status ${res.status} - ${JSON.stringify(res.body)}`);
  }
  return res.body.accessToken;
}

async function setupTestUser(pages) {
  // Ensure tenant exists
  const tenant = await prisma.tenant.findFirst({
    where: { code: 'ACME-DEV-001' },
  });
  if (!tenant) throw new Error('ACME-DEV-001 tenant not found in dev database');

  const passwordHash = await bcrypt.hash(TEST_USER_PASS, BCRYPT_SALT_ROUNDS);

  let user = await prisma.user.findFirst({
    where: { email: TEST_USER_EMAIL },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: TEST_USER_EMAIL,
        name: 'Access Tester User',
        employeeCode: 'EMP-TST-001',
        passwordHash,
        role: 'employee',
        tenantId: tenant.id,
        isActive: true,
        mustResetPassword: false,
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        role: 'employee',
        isActive: true,
        mustResetPassword: false,
      },
    });
  }

  // Configure explicit page access
  await prisma.userPageAccess.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      tenantId: tenant.id,
      pages: JSON.stringify(pages),
    },
    update: {
      pages: JSON.stringify(pages),
    },
  });

  return user;
}

async function main() {
  console.log('========================================================================');
  console.log('   REAL ACCESS TESTS: LIVE API 403 AND BROWSER "NO ACCESS" SCREENS    ');
  console.log('========================================================================\n');

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // PART A: Backend API Integration Tests for 403 Forbidden Rejections
    // ─────────────────────────────────────────────────────────────────────────
    console.log('[STAGE 1] Testing Backend API Endpoints (403 Expected when page omitted)...');

    // Scenario 1: User without 'ledger'
    await setupTestUser(['dashboard', 'leads', 'invoices', 'quotations']);
    const tokenNoLedger = await loginApi(TEST_USER_EMAIL, TEST_USER_PASS);
    const ledgerApiRes = await apiRequest('GET', '/ledger/parties', {
      Authorization: `Bearer ${tokenNoLedger}`,
    });
    logTest(
      'GET /api/v1/ledger/parties returns 403 Forbidden when user lacks "ledger" page',
      ledgerApiRes.status === 403 &&
        (ledgerApiRes.body?.message?.includes('access') || ledgerApiRes.body?.pageKey === 'ledger'),
      `Got status ${ledgerApiRes.status}: ${JSON.stringify(ledgerApiRes.body)}`
    );

    // Scenario 2: User without 'invoices'
    await setupTestUser(['dashboard', 'leads', 'ledger', 'quotations']);
    const tokenNoInvoices = await loginApi(TEST_USER_EMAIL, TEST_USER_PASS);
    const invoicesApiRes = await apiRequest('GET', '/invoices', {
      Authorization: `Bearer ${tokenNoInvoices}`,
    });
    logTest(
      'GET /api/v1/invoices returns 403 Forbidden when user lacks "invoices" page',
      invoicesApiRes.status === 403 &&
        (invoicesApiRes.body?.message?.includes('access') || invoicesApiRes.body?.pageKey === 'invoices'),
      `Got status ${invoicesApiRes.status}: ${JSON.stringify(invoicesApiRes.body)}`
    );

    // Scenario 3: User without 'quotations'
    await setupTestUser(['dashboard', 'leads', 'ledger', 'invoices']);
    const tokenNoQuotations = await loginApi(TEST_USER_EMAIL, TEST_USER_PASS);
    const quotationsApiRes = await apiRequest('GET', '/quotations', {
      Authorization: `Bearer ${tokenNoQuotations}`,
    });
    logTest(
      'GET /api/v1/quotations returns 403 Forbidden when user lacks "quotations" page',
      quotationsApiRes.status === 403 &&
        (quotationsApiRes.body?.message?.includes('access') || quotationsApiRes.body?.pageKey === 'quotations'),
      `Got status ${quotationsApiRes.status}: ${JSON.stringify(quotationsApiRes.body)}`
    );

    // Scenario 4: User without 'branding'
    await setupTestUser(['dashboard', 'leads', 'ledger', 'invoices', 'quotations']);
    const tokenNoBranding = await loginApi(TEST_USER_EMAIL, TEST_USER_PASS);
    const brandingApiRes = await apiRequest('GET', '/settings/company-profile', {
      Authorization: `Bearer ${tokenNoBranding}`,
    });
    logTest(
      'GET /api/v1/settings/company-profile returns 403 Forbidden when user lacks "branding" page',
      brandingApiRes.status === 403,
      `Got status ${brandingApiRes.status}: ${JSON.stringify(brandingApiRes.body)}`
    );

    // Scenario 5: Positive test - User WITH 'ledger' gets 200 OK
    await setupTestUser(['dashboard', 'leads', 'ledger']);
    const tokenWithLedger = await loginApi(TEST_USER_EMAIL, TEST_USER_PASS);
    const ledgerPositiveRes = await apiRequest('GET', '/ledger/parties', {
      Authorization: `Bearer ${tokenWithLedger}`,
    });
    logTest(
      'GET /api/v1/ledger/parties returns 200 OK when user is granted "ledger" page',
      ledgerPositiveRes.status === 200 && Array.isArray(ledgerPositiveRes.body),
      `Got status ${ledgerPositiveRes.status}`
    );

    // ─────────────────────────────────────────────────────────────────────────
    // PART B: Browser UI Integration Tests (Playwright)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[STAGE 2] Testing Browser UI with Playwright ("No Access" screen expected)...');
    const browser = await chromium.launch({ headless: true });

    async function testPageBrowserAccess(pageKey, routePath, expectedLabel) {
      // Configure user with ONLY 'leads' (explicitly missing pageKey)
      await setupTestUser(['leads']);

      const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
      const page = await context.newPage();

      try {
        // Go to login page
        await page.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#company-identifier, input[name="username"]', { timeout: 8000 });

        // Fill credentials
        await page.fill('#company-identifier, input[name="username"]', TEST_USER_EMAIL);
        await page.fill('#company-password, input[name="password"]', TEST_USER_PASS);
        await page.click('button[type="submit"]');

        // Wait for redirect away from /login
        await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 12000 });

        // Now navigate directly to the restricted page
        await page.goto(`${WEB_BASE}${routePath}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);

        // Check for 'No Access' screen heading and explanatory text
        const noAccessHeading = page.locator('h2:has-text("No Access")');
        const hasHeading = (await noAccessHeading.count()) > 0;

        const bodyText = await page.innerText('body');
        const hasNoAccessText =
          bodyText.includes('No Access') &&
          bodyText.includes(`You do not have access to ${expectedLabel}`);

        logTest(
          `Browser renders "No Access" screen for restricted route ${routePath} (missing "${pageKey}")`,
          hasHeading && hasNoAccessText,
          `Heading: ${hasHeading}, Text: ${hasNoAccessText}`
        );
      } finally {
        await context.close();
      }
    }

    await testPageBrowserAccess('ledger', '/ledger', 'Ledger');
    await testPageBrowserAccess('invoices', '/invoices', 'Invoices');
    await testPageBrowserAccess('quotations', '/quotations', 'Quotations');
    await testPageBrowserAccess('branding', '/settings/branding', 'Branding');

    // Scenario 10: Positive UI Test - User granted 'ledger' sees the Ledger Table
    await setupTestUser(['leads', 'ledger']);
    const contextPositive = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pagePositive = contextPositive.newPage();
    const p = await pagePositive;
    try {
      await p.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('#company-identifier, input[name="username"]', { timeout: 8000 });
      await p.fill('#company-identifier, input[name="username"]', TEST_USER_EMAIL);
      await p.fill('#company-password, input[name="password"]', TEST_USER_PASS);
      await p.click('button[type="submit"]');
      await p.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 12000 });

      // Click on the Ledger tab in the navbar
      await p.locator('a[href="/ledger"]').first().click();
      await p.waitForURL((url) => url.pathname.includes('/ledger'), { timeout: 8000 });
      await p.waitForTimeout(1500);

      const currentUrl = p.url();
      const bodyText = await p.innerText('body');
      console.log('Positive test URL after nav:', currentUrl);
      console.log('Positive test text excerpt:', bodyText.slice(0, 400).replace(/\n+/g, ' '));

      const noAccess = await p.locator('h2:has-text("No Access")').count();
      const hasPartyTable = (await p.locator('table').count()) > 0 || bodyText.includes('Ledger') || bodyText.includes('Receivables');

      logTest(
        'Browser renders full ledger interface (no "No Access" screen) when granted "ledger"',
        noAccess === 0 && hasPartyTable,
        `noAccess: ${noAccess}, hasPartyTable: ${hasPartyTable}`
      );
    } finally {
      await contextPositive.close();
    }

    await browser.close();

    console.log('\n========================================================================');
    console.log(`   REAL ACCESS TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log('========================================================================\n');

    if (passedTests < totalTests) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
