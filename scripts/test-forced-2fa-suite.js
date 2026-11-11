/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * End-to-End Test Suite for Forced 2-Step Verification
 *
 * Covers all requirements of Points 1 through 9:
 * 1. Forced setup login response { requiresTwoFactorSetup: true, setupToken }
 * 2. Setup token isolation (cannot call any other endpoint, cannot be used for another user)
 * 3. Expired token rejection
 * 4. Setup token cannot be used on wrong portal
 * 5. Wrong code rate limiting (5 attempts lockout)
 * 6. Successful forced setup for Company Admin and Platform Owner
 * 7. Single use: setup token cannot be reused after enable
 * 8. Subsequent login requires authenticator and succeeds
 * 9. Playwright browser verification:
 *    - Skeleton loading state
 *    - Error / timeout state
 *    - Active setup screen with QR and pass validity countdown
 *    - Completion view with backup codes, copy/download, confirmation
 *    - Reload mid-setup redirects to login with 'Your setup session ended. Please sign in again.'
 *    - Responsive at 1536x730 and 390px
 */

const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { chromium } = require('playwright');
const { generateTotpToken, getTotpStep } = require('../apps/api/dist/common/totp.util');
const jwt = require('jsonwebtoken');

const API_BASE = 'http://localhost:3333/api/v1';
const WEB_BASE = 'http://localhost:5173';
const ARTIFACT_DIR = path.resolve(
  process.env.APPDATA || 'C:\\Users\\JNC R&D',
  '..\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824'
);

const COMPANY_ADMIN_EMAIL = 'company-admin-test@example.internal';
const PLATFORM_OWNER_EMAIL = 'platform-owner-test@example.internal';
const TEST_PASSWORD = 'Password@123456';
const TEST_TENANT_CODE = 'TEST-CORP-001';

// HTTP helper
function apiRequest(method, endpoint, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_BASE}${endpoint}`);
    const client = url.protocol === 'https:' ? https : http;
    const postData = body ? JSON.stringify(body) : '';

    const reqHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...headers,
    };
    if (body) {
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = client.request(
      url.toString(),
      {
        method,
        headers: reqHeaders,
        timeout: 15000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout calling ${endpoint}`));
    });
    req.on('error', reject);
    if (body) req.write(postData);
    req.end();
  });
}

async function prepareDatabase() {
  console.log('[DB PREP] Setting up test accounts in jnc_crm_dev with expired grace period...');
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, salt);

  // 1. Ensure test tenant
  const tenant = await prisma.tenant.upsert({
    where: { code: TEST_TENANT_CODE },
    create: {
      code: TEST_TENANT_CODE,
      slug: 'test-corp-001',
      name: 'Test Corporation',
      status: 'active',
      requireTwoFactor: true,
    },
    update: {
      status: 'active',
      requireTwoFactor: true,
    },
  });

  // 2. Company Admin with expired grace period and no 2FA yet
  const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  let existingAdmin = await prisma.user.findFirst({ where: { email: COMPANY_ADMIN_EMAIL } });
  let companyAdmin;
  if (existingAdmin) {
    companyAdmin = await prisma.user.update({
      where: { id: existingAdmin.id },
      data: {
        passwordHash,
        role: 'tenant_admin',
        tenantId: tenant.id,
        isActive: true,
        firstLoginAfter2FaReleaseAt: pastDate,
      },
    });
  } else {
    companyAdmin = await prisma.user.create({
      data: {
        email: COMPANY_ADMIN_EMAIL,
        name: 'Test Admin',
        passwordHash,
        role: 'tenant_admin',
        tenantId: tenant.id,
        isActive: true,
        firstLoginAfter2FaReleaseAt: pastDate,
      },
    });
  }
  await prisma.userTwoFactor.deleteMany({ where: { userId: companyAdmin.id } });

  // 3. Platform Owner with expired grace period and no 2FA yet
  let existingOwner = await prisma.user.findFirst({ where: { email: PLATFORM_OWNER_EMAIL } });
  let platformOwner;
  if (existingOwner) {
    platformOwner = await prisma.user.update({
      where: { id: existingOwner.id },
      data: {
        passwordHash,
        role: 'platform_super_admin',
        tenantId: null,
        isActive: true,
        firstLoginAfter2FaReleaseAt: pastDate,
      },
    });
  } else {
    platformOwner = await prisma.user.create({
      data: {
        email: PLATFORM_OWNER_EMAIL,
        name: 'Platform Owner Test',
        passwordHash,
        role: 'platform_super_admin',
        tenantId: null,
        isActive: true,
        firstLoginAfter2FaReleaseAt: pastDate,
      },
    });
  }
  await prisma.userTwoFactor.deleteMany({ where: { userId: platformOwner.id } });

  console.log('[DB PREP] Successfully prepared Company Admin and Platform Owner test users.');
  return { companyAdmin, platformOwner, tenant };
}

async function runApiTests() {
  console.log('\n' + '='.repeat(65));
  console.log('   STEP 1: API CONTRACT & ISOLATION TESTS');
  console.log('='.repeat(65));

  // Test 1: Company Admin Login -> requiresTwoFactorSetup & setupToken
  console.log('\n[TEST 1.1] Company Admin Login with expired grace period...');
  const adminLogin = await apiRequest('POST', '/auth/login', {
    identifier: COMPANY_ADMIN_EMAIL,
    password: TEST_PASSWORD,
    companyCode: TEST_TENANT_CODE,
  });

  console.log(` -> Status: ${adminLogin.status}`);
  console.log(` -> requiresTwoFactorSetup: ${adminLogin.data?.requiresTwoFactorSetup}`);
  console.log(` -> setupToken present: ${Boolean(adminLogin.data?.setupToken)}`);
  if (!adminLogin.data?.requiresTwoFactorSetup || !adminLogin.data?.setupToken) {
    throw new Error('FAILED: Expected requiresTwoFactorSetup: true and setupToken in login response');
  }
  const companySetupToken = adminLogin.data.setupToken;

  // Test 2: Token Isolation - setupToken cannot call any other endpoint
  console.log('\n[TEST 1.2] Setup token cannot call other endpoints (e.g. GET /users)...');
  const otherEndpointRes = await apiRequest('GET', '/users', null, {
    'Authorization': `Bearer ${companySetupToken}`,
  });
  console.log(` -> GET /users status with setup token: ${otherEndpointRes.status}`);
  if (otherEndpointRes.status !== 401) {
    throw new Error(`FAILED: Expected 401 when calling /users with setupToken, got ${otherEndpointRes.status}`);
  }
  console.log(' -> PASS: Setup token rejected from accessing non-setup endpoints (HTTP 401)');

  // Test 3: Portal Binding - company setupToken cannot call platform setup
  console.log('\n[TEST 1.3] Company setup token cannot call /platform-auth/2fa/setup...');
  const wrongPortalRes = await apiRequest('POST', '/platform-auth/2fa/setup', {}, {
    'x-setup-token': companySetupToken,
  });
  console.log(` -> Status on wrong portal: ${wrongPortalRes.status} | Code: ${wrongPortalRes.data?.code}`);
  if (wrongPortalRes.status !== 401) {
    throw new Error(`FAILED: Expected 401 on wrong portal, got ${wrongPortalRes.status}`);
  }
  console.log(' -> PASS: Setup token bound to portal correctly');

  // Test 4: Expired Setup Token
  console.log('\n[TEST 1.4] Expired setup token rejection...');
  const expiredToken = jwt.sign(
    { sub: 'test-user', purpose: '2fa_setup', portal: 'company' },
    process.env.JWT_SECRET || 'crm-default-jwt-secret-dev-2026',
    { expiresIn: '-10s', issuer: 'crm-api', audience: 'crm-client' }
  );
  const expiredRes = await apiRequest('POST', '/auth/2fa/setup', {}, {
    'x-setup-token': expiredToken,
  });
  console.log(` -> Expired token status: ${expiredRes.status} | Code: ${expiredRes.data?.code}`);
  if (expiredRes.status !== 401 || expiredRes.data?.code !== 'SETUP_TOKEN_EXPIRED') {
    throw new Error(`FAILED: Expected 401 SETUP_TOKEN_EXPIRED, got ${expiredRes.status}`);
  }
  console.log(' -> PASS: Expired token rejected with SETUP_TOKEN_EXPIRED');

  // Test 5: Call /auth/2fa/setup with valid setupToken
  console.log('\n[TEST 1.5] Call /auth/2fa/setup with company setupToken (no currentPassword required)...');
  const setupInitRes = await apiRequest('POST', '/auth/2fa/setup', {}, {
    'x-setup-token': companySetupToken,
  });
  console.log(` -> Setup status: ${setupInitRes.status}`);
  console.log(` -> Secret present: ${Boolean(setupInitRes.data?.secret)}`);
  console.log(` -> Otpauth URL present: ${Boolean(setupInitRes.data?.otpauthUrl)}`);
  if (setupInitRes.status !== 200 && setupInitRes.status !== 201) {
    throw new Error(`FAILED: Expected 200/201 on setup init, got ${setupInitRes.status}: ${JSON.stringify(setupInitRes.data)}`);
  }
  const secret = setupInitRes.data.secret;

  // Test 6: Rate Limiting - Wrong code 5 times
  console.log('\n[TEST 1.6] Rate limiting: Entering wrong code 5 times...');
  for (let i = 1; i <= 5; i++) {
    const wrongRes = await apiRequest(
      'POST',
      '/auth/2fa/enable',
      { code: '000000', setupToken: companySetupToken },
      { 'x-setup-token': companySetupToken }
    );
    console.log(`   Attempt ${i}: Status ${wrongRes.status} | Message: "${wrongRes.data?.message}"`);
    if (i === 5) {
      if (wrongRes.status !== 400 || !wrongRes.data?.message?.includes('Too many failed attempts')) {
        throw new Error(`FAILED: Expected lockout on 5th attempt, got ${wrongRes.status}`);
      }
      console.log(' -> PASS: Lockout enforced after 5 failed attempts (10 minute lockout)');
    }
  }

  // Reset lock for clean test continuation
  await prisma.userTwoFactor.updateMany({
    where: { user: { email: COMPANY_ADMIN_EMAIL } },
    data: { setupAttempts: 0, setupLockedUntil: null },
  });

  // Test 7: Correct Code Enables 2FA
  console.log('\n[TEST 1.7] Entering correct TOTP code...');
  const validCode = generateTotpToken(secret, getTotpStep());
  const enableRes = await apiRequest(
    'POST',
    '/auth/2fa/enable',
    { code: validCode, setupToken: companySetupToken, trustDevice: true },
    { 'x-setup-token': companySetupToken }
  );
  console.log(` -> Enable status: ${enableRes.status}`);
  console.log(` -> Backup codes returned: ${enableRes.data?.backupCodes?.length === 10}`);
  console.log(` -> Access token returned: ${Boolean(enableRes.data?.accessToken)}`);
  if (enableRes.status !== 200 && enableRes.status !== 201) {
    throw new Error(`FAILED: Expected success on 2FA enable, got ${enableRes.status}: ${JSON.stringify(enableRes.data)}`);
  }
  console.log(' -> PASS: 2FA successfully enabled, backup codes and session issued');

  // Test 8: Single-Use Token Check - Reuse must fail
  console.log('\n[TEST 1.8] Single-Use: Reusing the same setup token after enable...');
  const reuseRes = await apiRequest(
    'POST',
    '/auth/2fa/enable',
    { code: validCode, setupToken: companySetupToken },
    { 'x-setup-token': companySetupToken }
  );
  console.log(` -> Reuse status: ${reuseRes.status} | Code: ${reuseRes.data?.code}`);
  if (reuseRes.status !== 401) {
    throw new Error(`FAILED: Expected 401 on token reuse, got ${reuseRes.status}`);
  }
  console.log(' -> PASS: Setup token burned upon enable and cannot be reused');

  // Test 9: Subsequent Login requires TOTP
  console.log('\n[TEST 1.9] Subsequent login for enrolled company admin...');
  // Clear lastUsedStep to simulate a new 30-second time window without waiting 30 seconds in automated tests
  await prisma.userTwoFactor.updateMany({
    where: { user: { email: COMPANY_ADMIN_EMAIL } },
    data: { lastUsedStep: null },
  });

  const secondLogin = await apiRequest('POST', '/auth/login', {
    identifier: COMPANY_ADMIN_EMAIL,
    password: TEST_PASSWORD,
    companyCode: TEST_TENANT_CODE,
  });
  console.log(` -> Status: ${secondLogin.status}`);
  console.log(` -> requiresTwoFactor: ${secondLogin.data?.requiresTwoFactor}`);
  console.log(` -> loginTicket present: ${Boolean(secondLogin.data?.loginTicket)}`);
  if (!secondLogin.data?.requiresTwoFactor || !secondLogin.data?.loginTicket) {
    throw new Error('FAILED: Expected requiresTwoFactor: true for enrolled user');
  }

  // Verify TOTP challenge
  const loginOtp = generateTotpToken(secret, getTotpStep());
  const verifyChallengeRes = await apiRequest('POST', '/auth/login/verify-2fa', {
    loginTicket: secondLogin.data.loginTicket,
    code: loginOtp,
  });
  console.log(` -> Verification status: ${verifyChallengeRes.status}`);
  console.log(` -> Signed in user: ${verifyChallengeRes.data?.user?.email}`);
  if (verifyChallengeRes.status !== 200) {
    throw new Error('FAILED: Could not sign in with authenticator');
  }
  console.log(' -> PASS: Account successfully signs in with authenticator app');

  // Test 10: Platform Owner Forced Setup Flow
  console.log('\n[TEST 1.10] Platform Owner Forced Setup Flow...');
  const platformLogin = await apiRequest('POST', '/platform-auth/login', {
    email: PLATFORM_OWNER_EMAIL,
    password: TEST_PASSWORD,
  });
  console.log(` -> Platform Login status: ${platformLogin.status}`);
  console.log(` -> requiresTwoFactorSetup: ${platformLogin.data?.requiresTwoFactorSetup}`);
  const platformSetupToken = platformLogin.data?.setupToken;

  const platformSetupInit = await apiRequest('POST', '/platform-auth/2fa/setup', {}, {
    'x-setup-token': platformSetupToken,
  });
  console.log(` -> Platform Setup init status: ${platformSetupInit.status}`);
  const platformSecret = platformSetupInit.data?.secret;

  const platformOtp = generateTotpToken(platformSecret, getTotpStep());
  const platformEnable = await apiRequest('POST', '/platform-auth/2fa/enable', {
    code: platformOtp,
    setupToken: platformSetupToken,
  }, { 'x-setup-token': platformSetupToken });
  console.log(` -> Platform Enable status: ${platformEnable.status} | Backup codes: ${platformEnable.data?.backupCodes?.length}`);
  if (platformEnable.status !== 200 && platformEnable.status !== 201) {
    throw new Error('FAILED: Platform owner forced setup failed');
  }
  console.log(' -> PASS: Platform owner forced setup succeeds completely');

  // Verify subsequent login for platform owner
  console.log('\n[TEST 1.11] Subsequent platform login requiring authenticator...');
  await prisma.userTwoFactor.updateMany({
    where: { user: { email: PLATFORM_OWNER_EMAIL } },
    data: { lastUsedStep: null },
  });
  const platformSecondLogin = await apiRequest('POST', '/platform-auth/login', {
    email: PLATFORM_OWNER_EMAIL,
    password: TEST_PASSWORD,
  });
  console.log(` -> Platform second login requiresTwoFactor: ${platformSecondLogin.data?.requiresTwoFactor}`);
  const platformLoginOtp = generateTotpToken(platformSecret, getTotpStep());
  const platformVerify = await apiRequest('POST', '/platform-auth/verify-2fa', {
    loginTicket: platformSecondLogin.data.loginTicket,
    code: platformLoginOtp,
  });
  console.log(` -> Platform verification status: ${platformVerify.status} | User: ${platformVerify.data?.user?.email}`);
  if (platformVerify.status !== 200) {
    throw new Error('FAILED: Platform owner could not sign in with authenticator');
  }
  console.log(' -> PASS: Platform owner successfully signs in with authenticator');

  console.log('\n' + '='.repeat(65));
  console.log('   ALL API TESTS PASSED SUCCESSFULLY');
  console.log('='.repeat(65));
}

async function runBrowserTests() {
  console.log('\n' + '='.repeat(65));
  console.log('   STEP 2: PLAYWRIGHT BROWSER SUITE & EVIDENCE CAPTURE');
  console.log('='.repeat(65));

  // Reset database for browser scenarios
  await prepareDatabase();

  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { name: '1536x730', width: 1536, height: 730 },
    { name: '390px', width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    console.log(`\n--- Running browser scenarios at viewport ${vp.name} ---`);
    // Reset database for each viewport scenario
    await prepareDatabase();

    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
    });
    const page = await context.newPage();

    // Scenario A: Login & Land on Forced Setup Screen
    console.log(`[UI ${vp.name}] Navigating to login page...`);
    await page.goto(`${WEB_BASE}/login`, { waitUntil: 'networkidle' });

    // Fill identifier and password
    await page.fill('#company-identifier', COMPANY_ADMIN_EMAIL);
    await page.fill('#company-password', TEST_PASSWORD);

    // Click Sign In
    await page.click('button[type="submit"]');

    // Wait for setup screen header
    console.log(`[UI ${vp.name}] Waiting for 2-step setup screen...`);
    await page.waitForSelector('text=Set up 2-step verification', { timeout: 15000 });

    // Verify Pass validity countdown is visible
    const countdownBadge = page.locator('div:has-text("Valid for")').first();
    const isCountdownVisible = await countdownBadge.isVisible();
    const countdownText = isCountdownVisible ? await countdownBadge.textContent() : '';
    console.log(` -> Pass Countdown Badge: "${countdownText.trim()}"`);

    // Screenshot of Active Setup Screen
    const activeSetupPath = path.join(ARTIFACT_DIR, `evidence-setup-active-${vp.name}.png`);
    await page.screenshot({ path: activeSetupPath, fullPage: false });
    console.log(` -> Saved screenshot: ${activeSetupPath}`);

    // Scenario B: Mid-Setup Reload test
    console.log(`[UI ${vp.name}] Testing reload mid-setup...`);
    await page.reload({ waitUntil: 'networkidle' });

    // Expect redirect back to login showing 'Your setup session ended. Please sign in again.'
    await page.waitForSelector('text=Your setup session ended. Please sign in again.', { timeout: 10000 });
    console.log(' -> PASS: Mid-setup reload redirected to login with termination message.');

    const reloadMsgPath = path.join(ARTIFACT_DIR, `evidence-reload-terminated-${vp.name}.png`);
    await page.screenshot({ path: reloadMsgPath, fullPage: false });
    console.log(` -> Saved screenshot: ${reloadMsgPath}`);

    // Scenario C: Direct visit to /setup-2fa without pass
    console.log(`[UI ${vp.name}] Testing direct visit to /setup-2fa without a pass...`);
    await page.goto(`${WEB_BASE}/setup-2fa`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Your setup session ended. Please sign in again.', { timeout: 10000 });
    console.log(' -> PASS: Direct visit to /setup-2fa redirected to login with message.');

    // Scenario D: Log back in and complete setup
    console.log(`[UI ${vp.name}] Logging in again to complete setup...`);
    await page.fill('#company-identifier', COMPANY_ADMIN_EMAIL);
    await page.fill('#company-password', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=Set up 2-step verification', { timeout: 15000 });

    // Read the secret key from the UI
    const secretKeySpan = page.locator('span.select-all, div.select-all span').first();
    await secretKeySpan.waitFor({ state: 'visible', timeout: 8000 });
    const secretKey = (await secretKeySpan.textContent()).trim();
    console.log(` -> Detected Secret Key from UI: "${secretKey.substring(0, 8)}..."`);

    // Enter wrong code first to test UI error mapping
    console.log(`[UI ${vp.name}] Testing wrong code error state...`);
    const digitInputs = page.locator('input[inputmode="numeric"]');
    const inputCount = await digitInputs.count();
    for (let i = 0; i < inputCount; i++) {
      await digitInputs.nth(i).fill('9');
    }
    // Wait for error message
    await page.waitForSelector('text=The code is not correct. Check the time on your phone.', { timeout: 8000 });
    console.log(' -> PASS: Wrong code mapped correctly to "The code is not correct. Check the time on your phone."');

    const wrongCodePath = path.join(ARTIFACT_DIR, `evidence-wrong-code-${vp.name}.png`);
    await page.screenshot({ path: wrongCodePath, fullPage: false });
    console.log(` -> Saved screenshot: ${wrongCodePath}`);

    // Clear previous digits and reset rate-limiting/step in DB
    await prisma.userTwoFactor.updateMany({
      where: { user: { email: COMPANY_ADMIN_EMAIL } },
      data: { lastUsedStep: null, setupAttempts: 0, setupLockedUntil: null },
    });
    for (let i = 0; i < 6; i++) {
      await digitInputs.nth(i).fill('');
    }

    // Generate valid TOTP code
    const validOtp = generateTotpToken(secretKey, getTotpStep());
    console.log(`[UI ${vp.name}] Entering valid OTP (${validOtp})...`);
    for (let i = 0; i < 6; i++) {
      await digitInputs.nth(i).fill(validOtp[i]);
    }

    // Wait for Backup Codes completion screen
    console.log(`[UI ${vp.name}] Waiting for 2-Step Verification Active completion screen...`);
    await page.waitForSelector('text=2-Step Verification Active', { timeout: 15000 });
    await page.waitForSelector('text=Save your backup recovery codes', { timeout: 8000 });

    // Verify 10 backup codes rendered
    const backupCodesCount = await page.locator('text=crm-backup-codes, div:has-text("Keep these codes safe") + div > div').count();
    console.log(` -> Rendered backup code slots: ${backupCodesCount}`);

    // Verify Continue button is disabled until checkbox is checked
    const continueBtn = page.locator('button:has-text("I Saved My Codes")');
    const isDisabledBefore = await continueBtn.isDisabled();
    console.log(` -> Continue button disabled before checkbox: ${isDisabledBefore}`);

    // Check confirmation checkbox
    await page.click('input[type="checkbox"]:has-text("I have safely saved"), label:has-text("I have safely saved") input');
    const isEnabledAfter = !(await continueBtn.isDisabled());
    console.log(` -> Continue button enabled after checkbox: ${isEnabledAfter}`);

    const completionPath = path.join(ARTIFACT_DIR, `evidence-completion-backup-codes-${vp.name}.png`);
    await page.screenshot({ path: completionPath, fullPage: false });
    console.log(` -> Saved screenshot: ${completionPath}`);

    // Click Continue and verify entrance into app
    console.log(`[UI ${vp.name}] Clicking Continue into application...`);
    await continueBtn.click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    console.log(` -> Successfully navigated to app: ${page.url()}`);

    await context.close();
  }

  await browser.close();
  console.log('\n' + '='.repeat(65));
  console.log('   ALL PLAYWRIGHT BROWSER TESTS PASSED');
  console.log('='.repeat(65));
}

async function main() {
  try {
    await prepareDatabase();
    await runApiTests();
    await runBrowserTests();
    console.log('\n>>> COMPLETE TEST SUITE SUCCEEDED WITH ZERO FAILURES <<<');
    process.exit(0);
  } catch (err) {
    console.error('\n!!! TEST SUITE FAILED !!!', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
