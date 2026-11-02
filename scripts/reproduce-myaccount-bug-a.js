const path = require('path');
const { chromium } = require('playwright');
const bcrypt = require('bcryptjs');

process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev?schema=public';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BASE_URL = process.env.TEST_FRONTEND_URL || 'http://localhost:5173';
const ARTIFACT_DIR = 'C:\\Users\\JNC R&D\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824';

const TEST_EMAIL = 'repro-2fa-tester@example.internal';
const TEST_PASSWORD = 'DevPassword@123';

async function seedUser() {
  console.log('[SEED] Preparing clean user for 2FA reproduction...');
  const passHash = await bcrypt.hash(TEST_PASSWORD, 10);

  // Check tenant
  let tenant = await prisma.tenant.findFirst({ where: { code: 'ZZTEST' } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: 'Demo Company',
        code: 'ZZTEST',
        slug: 'zztest',
      },
    });
  }

  // Upsert user
  let user = await prisma.user.findFirst({ where: { email: TEST_EMAIL } });
  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: passHash,
        role: 'tenant_admin',
        mustResetPassword: false,
        isActive: true,
        phone: '+91 9876543210',
      },
    });
    // Remove existing 2FA setup to reproduce cleanly
    await prisma.userTwoFactor.deleteMany({ where: { userId: user.id } });
  } else {
    user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        name: 'Repro Tester',
        employeeCode: 'EMP-REP-01',
        passwordHash: passHash,
        role: 'tenant_admin',
        tenantId: tenant.id,
        phone: '+91 9876543210',
        isActive: true,
      },
    });
  }

  // Clear any lockout
  await prisma.$executeRawUnsafe(`DELETE FROM "AccountLockout" WHERE "identityKey" = '${TEST_EMAIL}'`);

  return user;
}

async function runReproduction() {
  await seedUser();
  await prisma.$disconnect();

  console.log('[BROWSER] Launching Chromium to reproduce Bug A...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  let setupRequest = null;
  let setupResponse = null;

  page.on('request', (req) => {
    if (req.url().includes('/auth/2fa/setup')) {
      setupRequest = {
        url: req.url(),
        method: req.method(),
        headers: req.headers(),
      };
    }
  });

  // Allow status check to pass so UI stays on Security tab
  await page.route('**/api/v1/auth/2fa/status', async (route) => {
    // Fulfill with unconfigured 2FA status
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        enabled: false,
        method: null,
        enabledAt: null,
        backupCodesRemaining: 0,
        isEnforced: false,
        isPending: false,
        gracePeriod: null,
      }),
    });
  });

  page.on('response', async (res) => {
    if (res.status() >= 400) {
      const txt = await res.text().catch(() => '');
      console.log('[HTTP ERROR]', res.status(), res.url(), txt);
    }
    if (res.url().includes('/auth/2fa/setup')) {
      let bodyText = '';
      try {
        bodyText = await res.text();
      } catch (e) {
        bodyText = e.message;
      }
      setupResponse = {
        url: res.url(),
        status: res.status(),
        statusText: res.statusText(),
        body: bodyText,
      };
    }
  });

  page.on('console', (msg) => console.log('[BROWSER CONSOLE]', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('[BROWSER ERROR]', err.message));

  // 1. Login
  console.log('[NAV] Going to /login...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="username"], #company-identifier', { timeout: 10000 });
  await page.fill('input[name="username"], #company-identifier', TEST_EMAIL);
  await page.fill('input[name="password"], #company-password', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  console.log('[AUTH] Logged in successfully. Current URL:', page.url());

  // Dismiss cookie banner
  const cookieBtn = page.locator('button:has-text("Accept all")');
  if (await cookieBtn.count() > 0 && await cookieBtn.isVisible()) {
    await cookieBtn.click();
    await page.waitForTimeout(500);
  }

  // 2. Navigate to /account via UI
  console.log('[NAV] Opening User Profile dropdown in Navbar...');
  const profileBtn = page.locator('button[title*="Signed in as"], #user-profile-button').first();
  await profileBtn.waitFor({ state: 'visible', timeout: 5000 });
  await profileBtn.click();
  await page.waitForTimeout(500);

  console.log('[NAV] Clicking "My Account" link...');
  const accountLink = page.locator('a[href="/account"]').first();
  await accountLink.waitFor({ state: 'visible', timeout: 5000 });
  await accountLink.click();
  await page.waitForURL((url) => url.pathname.includes('/account'), { timeout: 10000 });
  await page.waitForTimeout(1000);
  console.log('[NAV] Successfully on My Account:', page.url());

  // 3. Click Security tab
  console.log('[UI] Looking for Security tab button...');
  const securityTab = page.locator('button', { hasText: 'Security' }).first();
  await securityTab.waitFor({ state: 'visible', timeout: 5000 });
  await securityTab.click();
  await page.waitForTimeout(1500);

  // 4. Click "Set Up 2-Step Verification"
  console.log('[UI] Looking for "Set Up 2-Step Verification" button...');
  const setupBtn = page.locator('button', { hasText: 'Set Up 2-Step Verification' });
  await setupBtn.waitFor({ state: 'visible', timeout: 5000 });
  await setupBtn.click();
  console.log('[UI] Clicked "Set Up 2-Step Verification"');

  // 5. Wait for modal and error message
  console.log('[UI] Waiting for 2FA setup modal...');
  await page.waitForSelector('text=Set Up 2-Step Verification', { timeout: 5000 });
  await page.waitForTimeout(2000);

  // Capture screenshot of reproduced state
  const screenshotPath = path.join(ARTIFACT_DIR, 'evidence-bug-a-reproduced.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`[EVIDENCE] Screenshot saved to: ${screenshotPath}`);

  // Check UI state
  const errorText = await page.locator('div:has-text("Invalid or expired setup token"), span:has-text("Invalid or expired setup token")').first().textContent().catch(() => null);
  const secretText = await page.locator('span:has-text("Generating...")').first().textContent().catch(() => null);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('BUG A REPRODUCTION RESULTS:');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Setup Request URL:', setupRequest?.url);
  console.log('Setup Request Method:', setupRequest?.method);
  console.log('Setup Request Authorization Header present:', Boolean(setupRequest?.headers?.authorization));
  console.log('Setup Response Status:', setupResponse?.status, setupResponse?.statusText);
  console.log('Setup Response Body:', setupResponse?.body);
  console.log('UI Error Text Displayed:', errorText);
  console.log('UI Key Text Displayed:', secretText);
  console.log('═══════════════════════════════════════════════════════════════\n');

  await browser.close();
}

runReproduction().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});
