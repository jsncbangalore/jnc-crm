/* --- TEST SESSION CONFLICT SUITE ---
 * Verifies:
 * 1. Blocking modal is NEVER shown (replaced by non-blocking banner)
 * 2. Never on public pages (/login): stale keys cleared, no modal/banner loop
 * 3. Cross-portal isolation: platform super admin vs company staff never raise conflict
 * 4. Same user twice: signing in again as same user never raises conflict
 * 5. Impersonation: 'Login As' never raises conflict in original tab
 * 6. Case (a): Real identity change safely signs out old tab to /login with non-blocking banner once, zero data of other account shown
 * 7. Case (e): Refresh returning another user is blocked (409 SESSION_CHANGED) and safely terminates
 * 8. Responsive & Theme: light and dark, 1536x730 and 390px
 */

const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { chromium } = require('playwright');
const { PrismaClient } = require(path.join(__dirname, '../node_modules/@prisma/client'));

const prisma = new PrismaClient();
const API_BASE = process.env.API_URL || 'http://localhost:3333/api/v1';
const WEB_BASE = process.env.WEB_URL || 'http://localhost:5173';
const ARTIFACTS_DIR = 'C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824';

const createdTenantIds = [];
const createdUserIds = [];

async function cleanup() {
  try {
    if (createdUserIds.length > 0) {
      await prisma.userPageAccess.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
      await prisma.refreshSession.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
      await prisma.otpChallenge.deleteMany({ where: { emailNormalized: { contains: 'session_test_' } } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {});
    }
    if (createdTenantIds.length > 0) {
      await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } }).catch(() => {});
    }
  } catch (err) {
    console.error('Cleanup error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

async function createTestTenantAndUser(label, role = 'tenant_admin') {
  const rand = Math.floor(100000 + Math.random() * 900000);
  const tenantId = `tenant-${label}-${rand}`;
  const userId = `user-${label}-${rand}`;
  const email = `session_test_${label}_${rand}@example.fake`;
  const password = 'DevPassword@123';
  const passwordHash = await bcrypt.hash(password, 10);

  let tenant = null;
  if (role !== 'platform_super_admin') {
    tenant = await prisma.tenant.create({
      data: {
        id: tenantId,
        code: `TN-${rand}`,
        name: `Tenant ${label} ${rand}`,
        slug: `tenant-${label}-${rand}`,
        status: 'active',
        planTier: 'enterprise',
        requireTwoFactor: false,
      },
    });
    createdTenantIds.push(tenant.id);
  }

  const user = await prisma.user.create({
    data: {
      id: userId,
      tenant: tenant ? { connect: { id: tenant.id } } : undefined,
      email,
      name: `User ${label}`,
      role,
      employeeCode: `EMP-${rand}`,
      passwordHash,
      isActive: true,
      firstLoginAfter2FaReleaseAt: new Date(),
    },
  });
  createdUserIds.push(user.id);

  if (tenant) {
    await prisma.userPageAccess.create({
      data: {
        tenant: { connect: { id: tenant.id } },
        user: { connect: { id: user.id } },
        pages: JSON.stringify(['dashboard', 'invoices', 'quotations', 'branding', 'companies']),
      },
    });
  }

  return { tenant, user, email, password };
}

async function performLogin(page, email, password, isPlatform = false) {
  const loginUrl = isPlatform ? `${WEB_BASE}/platform/login` : `${WEB_BASE}/login`;
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="username"]', { timeout: 15000 });
  await page.fill('input[name="username"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 });
  await page.waitForTimeout(1000);
}

async function main() {
  console.log('================================================================');
  console.log('RUNNING SESSION CONFLICT & TAB ISOLATION TEST SUITE');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (!condition) {
      console.error(`  FAIL: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    } else {
      passedTests++;
      console.log(`  PASS: ${message}`);
    }
  }

  const browser = await chromium.launch({ headless: true });

  try {
    // -------------------------------------------------------------
    // TEST 1: NEVER ON PUBLIC PAGES (/login)
    // -------------------------------------------------------------
    console.log('[TEST 1] Tab sitting on /login never shows popup or banner when another tab signs in');
    {
      const u1 = await createTestTenantAndUser('T1_U1');
      const u2 = await createTestTenantAndUser('T1_U2');

      const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
      const tabA = await context.newPage();
      await tabA.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
      await tabA.waitForSelector('input[name="username"]', { timeout: 15000 });

      // Tab A is sitting on /login
      const tabB = await context.newPage();
      await performLogin(tabB, u2.email, u2.password);
      await tabB.waitForTimeout(1000);

      // Verify Tab A has not shown any modal or banner
      await tabA.bringToFront();
      await tabA.waitForTimeout(1000);

      const hasModal = await tabA.evaluate(() => document.body.innerText.includes('Session Changed') && document.body.innerText.includes('Reload'));
      const hasBanner = await tabA.evaluate(() => document.querySelector('[data-testid="session-conflict-banner"]') !== null);
      const staleKey = await tabA.evaluate(() => sessionStorage.getItem('crm_last_active_user_id'));

      assert(!hasModal, 'Blocking modal is NOT shown on /login');
      assert(!hasBanner, 'Session conflict banner is NOT shown on /login without prior session');
      assert(!staleKey, 'Stale tab keys are cleared on /login');

      // Screenshot
      const shotPath = path.join(ARTIFACTS_DIR, 'evidence-session-login-clean-1536x730.png');
      await tabA.screenshot({ path: shotPath });
      console.log(`  Screenshot saved: ${shotPath}`);

      await context.close();
    }

    // -------------------------------------------------------------
    // TEST 2: SAME USER TWICE NEVER RAISES CONFLICT
    // -------------------------------------------------------------
    console.log('\n[TEST 2] Signing in again as SAME user in another tab never raises conflict');
    {
      const u1 = await createTestTenantAndUser('T2_Same');

      const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
      const tabA = await context.newPage();
      const tabB = await context.newPage();

      // Both tabs start on /login
      await tabA.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
      await tabA.waitForSelector('input[name="username"]', { timeout: 15000 });
      await tabB.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
      await tabB.waitForSelector('input[name="username"]', { timeout: 15000 });

      // Tab A logs in as u1
      await tabA.fill('input[name="username"]', u1.email);
      await tabA.fill('input[name="password"]', u1.password);
      await tabA.click('button[type="submit"]');
      await tabA.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 });
      await tabA.goto(`${WEB_BASE}/invoices`, { waitUntil: 'domcontentloaded' });

      // Tab B signs in as the SAME user u1
      await tabB.fill('input[name="username"]', u1.email);
      await tabB.fill('input[name="password"]', u1.password);
      await tabB.click('button[type="submit"]');
      await tabB.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 });
      await tabB.waitForTimeout(1000);

      // Tab A should still be active, zero modal, zero banner
      await tabA.bringToFront();
      await tabA.waitForTimeout(1000);

      const hasModal = await tabA.evaluate(() => document.body.innerText.includes('Session Changed') && document.body.innerText.includes('Reload'));
      const hasBanner = await tabA.evaluate(() => document.querySelector('[data-testid="session-conflict-banner"]') !== null);
      const currentUrl = tabA.url();

      assert(!hasModal, 'Same user signing in again in another tab does NOT show modal');
      assert(!hasBanner, 'Same user signing in again does NOT show conflict banner');
      assert(currentUrl.includes('/invoices'), 'Tab A remains on /invoices with active session');

      await context.close();
    }

    // -------------------------------------------------------------
    // TEST 3: DIFFERENT PORTALS NEVER RAISE CONFLICT
    // -------------------------------------------------------------
    console.log('\n[TEST 3] Platform Super Admin vs Company Staff never raise conflict across tabs');
    {
      const platUser = await createTestTenantAndUser('T3_Plat', 'platform_super_admin');
      const compUser = await createTestTenantAndUser('T3_Comp', 'tenant_admin');

      const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
      const tabA = await context.newPage();
      await performLogin(tabA, platUser.email, platUser.password, true);
      assert(tabA.url().includes('/platform/companies'), 'Platform owner logs in successfully to platform portal');

      const tabB = await context.newPage();
      await performLogin(tabB, compUser.email, compUser.password, false);
      assert(!tabB.url().includes('/login'), 'Company user logs in successfully to company portal');

      // Check Tab A (Platform Console)
      await tabA.bringToFront();
      await tabA.waitForTimeout(1000);

      const hasModal = await tabA.evaluate(() => document.body.innerText.includes('Session Changed') && document.body.innerText.includes('Reload'));
      const hasBanner = await tabA.evaluate(() => document.querySelector('[data-testid="session-conflict-banner"]') !== null);
      const platUrl = tabA.url();

      assert(!hasModal, 'Platform Console tab does NOT show modal when company user logs in');
      assert(!hasBanner, 'Platform Console tab does NOT show conflict banner');
      assert(platUrl.includes('/platform/companies'), 'Platform Console remains active on /platform/companies');

      // Check cookies
      const cookies = await context.cookies();
      const hasPlatformCookie = cookies.some(c => c.name === 'crm_platform_refresh');
      const hasStaffCookie = cookies.some(c => c.name === 'crm_refresh_token');
      assert(hasPlatformCookie && hasStaffCookie, 'Both crm_platform_refresh and crm_refresh_token coexist independently');

      // Screenshot
      const shotPath = path.join(ARTIFACTS_DIR, 'evidence-portals-coexist-1536x730.png');
      await tabA.screenshot({ path: shotPath });
      console.log(`  Screenshot saved: ${shotPath}`);

      await context.close();
    }

    // -------------------------------------------------------------
    // TEST 4: IMPERSONATION ('Login As') NEVER RAISES CONFLICT
    // -------------------------------------------------------------
    console.log('\n[TEST 4] "Login As" impersonation never raises conflict popup or banner');
    {
      const platUser = await createTestTenantAndUser('T4_Plat', 'platform_super_admin');
      const compUser = await createTestTenantAndUser('T4_Comp', 'tenant_admin');

      const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
      const tabA = await context.newPage();
      await performLogin(tabA, platUser.email, platUser.password, true);

      await tabA.goto(`${WEB_BASE}/platform/companies`, { waitUntil: 'domcontentloaded' });
      await tabA.waitForSelector('button:has-text("Login As")', { timeout: 15000 });
      await tabA.click('button:has-text("Login As")');
      await tabA.waitForSelector('button:has-text("Enter Workspace")', { timeout: 5000 });
      await tabA.click('button:has-text("Enter Workspace")');
      await tabA.waitForTimeout(2000);

      const hasModal = await tabA.evaluate(() => document.body.innerText.includes('Session Changed') && document.body.innerText.includes('Reload'));
      const hasBanner = await tabA.evaluate(() => document.querySelector('[data-testid="session-conflict-banner"]') !== null);

      assert(!hasModal, 'Impersonation does NOT show blocking modal');
      assert(!hasBanner, 'Impersonation does NOT show session conflict banner');
      assert(!tabA.url().includes('/login'), 'Impersonation tab navigates successfully into client workspace');

      const shotPath = path.join(ARTIFACTS_DIR, 'evidence-impersonation-clean-1536x730.png');
      await tabA.screenshot({ path: shotPath });
      console.log(`  Screenshot saved: ${shotPath}`);

      await context.close();
    }

    // -------------------------------------------------------------
    // TEST 5: REAL IDENTITY CHANGE (SCENARIO A)
    // -------------------------------------------------------------
    console.log('\n[TEST 5] Real identity change safely signs out Tab A with non-blocking banner once and NO other data');
    {
      const u1 = await createTestTenantAndUser('T5_U1');
      const u2 = await createTestTenantAndUser('T5_U2');

      // Test at 1536x730 light mode
      const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
      const tabA = await context.newPage();
      const tabB = await context.newPage();

      await tabA.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
      await tabA.waitForSelector('input[name="username"]', { timeout: 15000 });
      await tabB.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
      await tabB.waitForSelector('input[name="username"]', { timeout: 15000 });

      // Tab A logs in as User 1
      await tabA.fill('input[name="username"]', u1.email);
      await tabA.fill('input[name="password"]', u1.password);
      await tabA.click('button[type="submit"]');
      await tabA.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 });

      // Tab B logs in as User 2
      await tabB.fill('input[name="username"]', u2.email);
      await tabB.fill('input[name="password"]', u2.password);
      await tabB.click('button[type="submit"]');
      await tabB.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 });

      // Bring Tab A to front
      await tabA.bringToFront();
      await tabA.waitForTimeout(2000);

      // Verify Tab A was safely signed out to /login
      assert(tabA.url().includes('/login'), 'Tab A was safely redirected to /login');

      // Verify NO blocking modal
      const hasModal = await tabA.evaluate(() => document.body.innerText.includes('Session Changed') && document.body.innerText.includes('Reload'));
      assert(!hasModal, 'Tab A does NOT have the old blocking modal');

      // Verify Non-blocking Banner appears
      const banner = await tabA.waitForSelector('[data-testid="session-conflict-banner"]', { timeout: 5000 });
      assert(banner !== null, 'Non-blocking session conflict banner is visible');
      const bannerText = await banner.textContent();
      assert(bannerText.includes('Another account signed in on this browser. This tab was signed out for your safety.'), 'Banner displays exact required security notice');
      assert(bannerText.includes('Sign in again'), 'Banner includes "Sign in again" button');

      // Verify NO data of User 2 is shown in Tab A
      const tabAPageText = await tabA.evaluate(() => document.body.innerText);
      assert(!tabAPageText.includes(u2.tenant.name), 'Tab A does NOT show User 2 tenant name');
      assert(!tabAPageText.includes(u2.email), 'Tab A does NOT show User 2 email');

      // Screenshot 1536x730 Light
      const shotLight = path.join(ARTIFACTS_DIR, 'evidence-conflict-banner-1536x730-light.png');
      await tabA.screenshot({ path: shotLight });
      console.log(`  Screenshot saved: ${shotLight}`);

      // Test banner dismissal
      await tabA.click('button[aria-label="Dismiss notice"]');
      await tabA.waitForTimeout(500);
      const isDismissed = await tabA.evaluate(() => document.querySelector('[data-testid="session-conflict-banner"]') === null);
      assert(isDismissed, 'Banner dismissed when user clicks dismiss (X)');

      await context.close();
    }

    // -------------------------------------------------------------
    // TEST 6: MOBILE VIEWPORT & DARK THEME (390px Dark)
    // -------------------------------------------------------------
    console.log('\n[TEST 6] Mobile viewport (390px) and Dark mode check for session conflict banner');
    {
      const u1 = await createTestTenantAndUser('T6_U1');
      const u2 = await createTestTenantAndUser('T6_U2');

      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        colorScheme: 'dark',
      });
      const tabA = await context.newPage();
      const tabB = await context.newPage();

      await tabA.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
      await tabA.waitForSelector('input[name="username"]', { timeout: 15000 });
      await tabB.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
      await tabB.waitForSelector('input[name="username"]', { timeout: 15000 });

      // Tab A logs in
      await tabA.fill('input[name="username"]', u1.email);
      await tabA.fill('input[name="password"]', u1.password);
      await tabA.click('button[type="submit"]');
      await tabA.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 });

      // Tab B logs in
      await tabB.fill('input[name="username"]', u2.email);
      await tabB.fill('input[name="password"]', u2.password);
      await tabB.click('button[type="submit"]');
      await tabB.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 });

      // Check Tab A on mobile dark
      await tabA.bringToFront();
      await tabA.waitForTimeout(2000);

      assert(tabA.url().includes('/login'), 'Tab A on mobile was redirected to /login');
      const banner = await tabA.waitForSelector('[data-testid="session-conflict-banner"]', { timeout: 5000 });
      assert(banner !== null, 'Banner renders cleanly on 390px mobile viewport');

      const shotDark = path.join(ARTIFACTS_DIR, 'evidence-conflict-banner-390px-dark.png');
      await tabA.screenshot({ path: shotDark });
      console.log(`  Screenshot saved: ${shotDark}`);

      await context.close();
    }

    // -------------------------------------------------------------
    // TEST 7: REFRESH RETURNING ANOTHER USER (SCENARIO E)
    // -------------------------------------------------------------
    console.log('\n[TEST 7] Refresh returning another user is blocked (409 SESSION_CHANGED)');
    {
      const u1 = await createTestTenantAndUser('T7_U1');
      const u2 = await createTestTenantAndUser('T7_U2');

      const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
      const tabA = await context.newPage();
      await performLogin(tabA, u1.email, u1.password);

      // Rotate session cookie to u2
      const tabB = await context.newPage();
      await tabB.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
      await tabB.evaluate(async ({ email, password }) => {
        await fetch('/api/v1/auth/login', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: email, password }),
        });
      }, { email: u2.email, password: u2.password });
      await tabB.close();

      // Tab A calls refresh with expectedUserId of u1
      await tabA.bringToFront();
      const res = await tabA.evaluate(async (expectedId) => {
        const r = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-Expected-User-Id': expectedId,
          },
          body: JSON.stringify({ expectedUserId: expectedId }),
        });
        const json = await r.json();
        return { status: r.status, json };
      }, u1.user.id);

      assert(res.status === 409, 'Server refresh returns 409 Conflict when expected user differs');
      assert(res.json?.code === 'SESSION_CHANGED', 'Server returns SESSION_CHANGED error code');

      await context.close();
    }

    console.log('\n================================================================');
    console.log(`SESSION CONFLICT SUITE COMPLETE: ${passedTests}/${totalTests} PASSED`);
    console.log('================================================================\n');

  } catch (err) {
    console.error('Test failed with error:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    await cleanup();
  }
}

main().catch(console.error);
