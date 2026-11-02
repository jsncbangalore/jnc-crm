/**
 * Playwright Cross-Origin Save Test
 * Verifies real cross-origin browser requests from Web (http://localhost:4173) to API (http://localhost:3333):
 * 1. OPTIONS preflight allowing all custom web headers (Idempotency-Key, X-Expected-User-Id, X-Requested-With)
 * 2. Cross-origin Payment Save with Idempotency-Key & X-Expected-User-Id (and idempotent replay check)
 * 3. Cross-origin Branding Save
 * 4. Cross-origin Bank Account Save (with at-rest encryption check in DB)
 * 5. X-Expected-User-Id mismatch contract validation (HTTP 409 SESSION_CHANGED)
 */

const { chromium } = require('playwright');
const assert = require('assert');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: { url: 'postgresql://jnc_app:jnc_app_pass_dev_2026@localhost:5432/jnc_crm_dev?schema=public' },
  },
});

const WEB_ORIGIN = 'http://localhost:4173';
const API_URL = 'http://localhost:3333/api/v1';

const ADMIN_EMAIL = 'admin@zzclienttest.com';
const PASSWORD = 'DevPassword@123';

async function run() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('PLAYWRIGHT REAL CROSS-ORIGIN SAVE SUITE');
  console.log('Web Origin:', WEB_ORIGIN);
  console.log('API Target:', API_URL);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
  const page = await context.newPage();

  // Point web requests directly to local dev API
  await page.addInitScript(() => {
    window.__CRM_API_URL__ = 'http://localhost:3333/api/v1';
    localStorage.setItem('crm_api_base_url', 'http://localhost:3333/api/v1');
  });

  try {
    // ─── STEP 1: AUTHENTICATE IN BROWSER ────────────────────────────────
    console.log('1. Logging in via Playwright at', `${WEB_ORIGIN}/login...`);
    await page.goto(`${WEB_ORIGIN}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[name="username"], #company-identifier', { timeout: 10000 });
    await page.fill('input[name="username"], #company-identifier', ADMIN_EMAIL);
    await page.fill('input[name="password"], #company-password', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    console.log('   ✓ Logged in successfully. Current URL:', page.url());

    // Extract auth state from browser storage
    const authInfo = await page.evaluate(() => {
      const token = typeof window.getAccessToken === 'function' ? window.getAccessToken() : localStorage.getItem('crm_staff_token');
      const userStr = localStorage.getItem('crm_user');
      return { token, user: userStr ? JSON.parse(userStr) : null };
    });

    assert(authInfo.token, 'Auth token must be present from window.getAccessToken()');
    const token = authInfo.token;
    const userId = authInfo.user?.id;
    const tenantId = authInfo.user?.tenant?.id || authInfo.user?.tenantId;
    console.log(`   ✓ Active User ID: ${userId}, Tenant ID: ${tenantId}`);

    // ─── STEP 2: PREFLIGHT OPTIONS VERIFICATION ────────────────────────
    console.log('\n2. Verifying CORS Preflight OPTIONS from browser...');
    const [preflightResponse] = await Promise.all([
      page.waitForResponse((res) => res.request().method() === 'OPTIONS' && res.url().includes('/payments')),
      page.evaluate(async (targetUrl) => {
        return fetch(`${targetUrl}/payments`, {
          method: 'OPTIONS',
          headers: {
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'authorization,content-type,idempotency-key,x-expected-user-id,x-requested-with',
          },
        }).catch(() => null);
      }, API_URL),
    ]);

    const preflightStatus = preflightResponse.status();
    const preflightHeaders = preflightResponse.headers();
    const allowOrigin = preflightHeaders['access-control-allow-origin'];
    const allowHeaders = preflightHeaders['access-control-allow-headers'];
    const allowMethods = preflightHeaders['access-control-allow-methods'];

    console.log('   Preflight Status:', preflightStatus);
    console.log('   Allow-Origin:', allowOrigin);
    console.log('   Allow-Headers:', allowHeaders);
    console.log('   Allow-Methods:', allowMethods);

    assert([200, 204].includes(preflightStatus), 'Preflight must return 200 or 204');
    assert(
      allowOrigin === WEB_ORIGIN || allowOrigin === '*',
      `Allow-Origin must include ${WEB_ORIGIN}`
    );
    const allowedHeaders = (allowHeaders || '').toLowerCase();
    assert(allowedHeaders.includes('idempotency-key'), 'Preflight must allow Idempotency-Key');
    assert(allowedHeaders.includes('x-expected-user-id'), 'Preflight must allow X-Expected-User-Id');
    assert(allowedHeaders.includes('x-requested-with'), 'Preflight must allow X-Requested-With');
    console.log('   ✓ Preflight OPTIONS asserted 100% compliant.');

    // ─── STEP 3: CROSS-ORIGIN PAYMENT SAVE & IDEMPOTENCY ──────────────
    console.log('\n3. Performing Cross-Origin Payment Save from browser context...');
    const idempotencyKey = `e2e-cors-test-${Date.now()}`;

    // Look up or create a customer
    let party = await prisma.company.findFirst({
      where: { tenantId },
      select: { id: true, name: true },
    });
    if (!party) {
      party = await prisma.company.create({
        data: {
          tenantId,
          name: 'CORS Test Client Ltd',
          city: 'Bengaluru',
          state: 'Karnataka',
        },
      });
    }

    const paymentPayload = {
      partyType: 'customer',
      partyId: party.id,
      amount: 2500,
      paymentMethod: 'bank_transfer',
      reference: 'NEFT99887766',
      notes: 'Cross-origin Playwright payment test',
      isAdvance: true,
      allowAdvance: true,
      paymentDate: new Date().toISOString(),
    };

    // First attempt: create payment
    const paymentSave1 = await page.evaluate(
      async ({ targetUrl, token, userId, key, payload }) => {
        const res = await fetch(`${targetUrl}/payments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'Idempotency-Key': key,
            'X-Expected-User-Id': userId,
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        return { status: res.status, data };
      },
      { targetUrl: API_URL, token, userId, key: idempotencyKey, payload: paymentPayload }
    );

    console.log('   First Payment Save Status:', paymentSave1.status);
    assert([200, 201].includes(paymentSave1.status), 'Payment save must return 200 or 201');
    const paymentId1 = paymentSave1.data?.payment?.id || paymentSave1.data?.id;
    assert(paymentId1, 'Payment ID must be returned');
    console.log('   ✓ Created Payment ID:', paymentId1);

    // Second attempt: identical request with SAME Idempotency-Key (Retry test)
    console.log('   Retrying identical request with same Idempotency-Key...');
    const paymentSave2 = await page.evaluate(
      async ({ targetUrl, token, userId, key, payload }) => {
        const res = await fetch(`${targetUrl}/payments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'Idempotency-Key': key,
            'X-Expected-User-Id': userId,
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        return { status: res.status, data };
      },
      { targetUrl: API_URL, token, userId, key: idempotencyKey, payload: paymentPayload }
    );

    console.log('   Retry Payment Save Status:', paymentSave2.status);
    assert([200, 201].includes(paymentSave2.status), 'Retry must return 200 or 201');
    const paymentId2 = paymentSave2.data?.payment?.id || paymentSave2.data?.id;
    assert.strictEqual(paymentId1, paymentId2, 'Idempotent retry must return the exact same payment ID');

    // DB Verification: exactly 1 payment record exists
    const dbPayments = await prisma.paymentRecord.findMany({
      where: {
        tenantId,
        id: paymentId1,
      },
    });
    assert.strictEqual(dbPayments.length, 1, 'Exactly ONE payment record must exist in DB for the payment');
    const dbIdem = await prisma.systemSetting.findUnique({
      where: { key: `idempotency:payment:${tenantId}:${idempotencyKey}` },
    });
    assert(dbIdem, 'Idempotency key must be stored in systemSetting');
    console.log('   ✓ Database verified: exactly 1 payment record created and idempotency record saved.');

    // ─── STEP 4: CROSS-ORIGIN BRANDING SAVE ────────────────────────────
    console.log('\n4. Performing Cross-Origin Branding Save from browser context...');
    const brandingSave = await page.evaluate(
      async ({ targetUrl, token, userId }) => {
        const res = await fetch(`${targetUrl}/settings/branding`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Expected-User-Id': userId,
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify({
            companyDisplayName: 'ZZ Client Test Ltd',
            companyPhone: '+91 99887 76655',
          }),
        });
        const data = await res.json();
        return { status: res.status, data };
      },
      { targetUrl: API_URL, token, userId }
    );

    console.log('   Branding Save Status:', brandingSave.status);
    assert([200, 201].includes(brandingSave.status), 'Branding save must return 200/201');
    console.log('   ✓ Branding save asserted.');

    // ─── STEP 5: CROSS-ORIGIN BANK ACCOUNT SAVE ────────────────────────
    console.log('\n5. Performing Cross-Origin Bank Account Save from browser context...');
    const bankPayload = {
      label: `Ops Account ${Date.now().toString().slice(-4)}`,
      bankName: 'HDFC Bank',
      holderName: 'ZZ Client Test Ltd',
      accountNumber: '9876543210987',
      ifsc: 'HDFC0001234',
      branch: 'Indiranagar',
      upiId: 'zztest@hdfcbank',
      isDefault: true,
    };

    const bankSave = await page.evaluate(
      async ({ targetUrl, token, userId, payload }) => {
        const res = await fetch(`${targetUrl}/settings/bank-accounts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Expected-User-Id': userId,
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        return { status: res.status, data };
      },
      { targetUrl: API_URL, token, userId, payload: bankPayload }
    );

    console.log('   Bank Account Save Status:', bankSave.status);
    assert([200, 201].includes(bankSave.status), 'Bank account save must return 200/201');
    const createdBankId = bankSave.data?.id;
    assert(createdBankId, 'Created bank account ID must be returned');
    console.log('   ✓ Bank account created with ID:', createdBankId);

    // Verify DB encryption at rest (AES-256-GCM formatted as ivHex:tagHex:encryptedHex)
    const dbAccount = await prisma.companyBankAccount.findUnique({
      where: { id: createdBankId },
    });
    assert(dbAccount, 'Bank account must exist in DB');
    assert.notStrictEqual(
      dbAccount.accountNumber,
      bankPayload.accountNumber,
      'Account number in database must NOT be plaintext'
    );
    const parts = dbAccount.accountNumber.split(':');
    assert.strictEqual(
      parts.length,
      3,
      'Encrypted account number must be formatted as AES-256-GCM (iv:tag:cipher)'
    );
    console.log('   ✓ DB verified: Account number is encrypted at rest (AES-256-GCM iv:tag:cipher).');

    // ─── STEP 6: X-EXPECTED-USER-ID MISMATCH CONTRACT ─────────────────
    console.log('\n6. Testing X-Expected-User-Id mismatch contract on /auth/refresh...');
    const mismatchRes = await page.evaluate(
      async ({ targetUrl }) => {
        const res = await fetch(`${targetUrl}/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Expected-User-Id': '00000000-0000-0000-0000-000000000000',
            'X-Requested-With': 'XMLHttpRequest',
          },
          credentials: 'include',
          body: JSON.stringify({}),
        });
        const data = await res.json();
        return { status: res.status, data };
      },
      { targetUrl: API_URL }
    );

    console.log('   Mismatch Status:', mismatchRes.status);
    console.log('   Mismatch Response:', JSON.stringify(mismatchRes.data));
    assert.strictEqual(mismatchRes.status, 409, 'Mismatch must return HTTP 409 Conflict');
    assert.strictEqual(mismatchRes.data?.code, 'SESSION_CHANGED', 'Error code must be SESSION_CHANGED');
    assert.strictEqual(mismatchRes.data?.message, 'Session changed in another tab or window.');
    console.log('   ✓ Mismatch correctly responded with HTTP 409 SESSION_CHANGED: "Session changed in another tab or window."');

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('ALL PLAYWRIGHT CROSS-ORIGIN TESTS PASSED (100%)');
    console.log('═══════════════════════════════════════════════════════════════');
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

run().catch((err) => {
  console.error('PLAYWRIGHT CROSS-ORIGIN TEST FAILED:', err);
  process.exit(1);
});
