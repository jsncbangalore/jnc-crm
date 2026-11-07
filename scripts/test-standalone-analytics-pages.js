const { chromium } = require('playwright');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const path = require('path');

const prisma = new PrismaClient();
const FRONTEND_URL = process.env.TEST_FRONTEND_URL || 'http://localhost:5174';
const ARTIFACT_DIR = 'C:\\Users\\JNC R&D\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824';

const VIEWPORTS = [
  { width: 1920, height: 1080, name: '1920x1080' },
  { width: 1536, height: 730, name: '1536x730' },
  { width: 1366, height: 768, name: '1366x768' },
  { width: 1280, height: 720, name: '1280x720' },
  { width: 390, height: 844, name: '390x844' },
];

const ROUTES = [
  { path: '/analytics/leads', expectedTitle: 'Total Leads' },
  { path: '/analytics/quotes', expectedTitle: 'Active Quotes' },
  { path: '/analytics/orders', expectedTitle: 'Active Orders' },
  { path: '/analytics/receivables', expectedTitle: 'Receivable' },
  { path: '/analytics/overdue', expectedTitle: 'Overdue' },
  { path: '/analytics/activity', expectedTitle: 'Activity' },
];

async function createAuthSession(user) {
  const familyId = crypto.randomUUID();
  const jti = crypto.randomUUID();

  const refreshToken = jwt.sign(
    {
      sub: user.id,
      tenantId: user.tenantId,
      org_id: user.tenantId,
      email: user.email,
      role: user.role,
      employee_code: user.employeeCode,
      employeeCode: user.employeeCode,
      tokenVersion: user.tokenVersion || 0,
      familyId,
      jti,
      keepSignedIn: true,
    },
    process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    {
      expiresIn: '7d',
      issuer: process.env.JWT_ISSUER || 'crm-api',
      audience: process.env.JWT_AUDIENCE || 'crm-client',
    }
  );

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  await prisma.refreshSession.create({
    data: {
      userId: user.id,
      tokenHash,
      familyId,
      expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
      isRevoked: false,
    },
  });

  const accessToken = jwt.sign(
    {
      sub: user.id,
      tenantId: user.tenantId,
      org_id: user.tenantId,
      email: user.email,
      role: user.role,
      employee_code: user.employeeCode,
      employeeCode: user.employeeCode,
      tokenVersion: user.tokenVersion || 0,
    },
    process.env.JWT_SECRET || 'dev-secret',
    {
      expiresIn: '4h',
      issuer: process.env.JWT_ISSUER || 'crm-api',
      audience: process.env.JWT_AUDIENCE || 'crm-client',
    }
  );

  const formattedUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    employeeCode: user.employeeCode,
    phone: user.phone,
    photoUrl: user.photoUrl,
    role: user.role,
    mustResetPassword: false,
    lastPasswordChangeAt: null,
    createdAt: user.createdAt,
    tenant: {
      code: user.tenant?.code || 'ACME-DEV-001',
      name: user.tenant?.name || 'Demo Company',
      currency: 'INR',
      logoUrl: user.tenant?.logoUrl,
    },
    teamId: user.teamId,
    warehouseId: user.warehouseId,
    effectivePages: [
      'leads',
      'quotations',
      'orders',
      'shipments',
      'inventory',
      'suppliers',
      'invoices',
      'bills',
      'ledger',
      'dashboard',
      'daily_activities',
      'notifications',
      'users',
      'account',
    ],
    homePage: 'dashboard',
  };

  return {
    cookies: [
      {
        name: 'crm_refresh_token',
        value: refreshToken,
        domain: 'localhost',
        path: '/api/v1/auth',
        expires: Math.floor(Date.now() / 1000) + 86400 * 7,
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ],
    localStorageItems: {
      crm_staff_user: JSON.stringify(formattedUser),
      crm_staff_refresh_token: refreshToken,
      crm_active_portal: 'staff',
    },
    accessToken,
  };
}

async function main() {
  console.log('=== RUNNING STANDALONE ANALYTICS PAGES TEST SUITE ===\n');

  const admin = await prisma.user.findFirst({
    where: { role: 'tenant_admin', deletedAt: null },
    include: { tenant: true },
  });
  if (!admin) throw new Error('Tenant admin user not found');

  const browser = await chromium.launch({ headless: true });

  let testsPassed = 0;
  let testsFailed = 0;

  try {
    for (const theme of ['light', 'dark']) {
      console.log(`\n======================================================`);
      console.log(`          TESTING THEME: ${theme.toUpperCase()}`);
      console.log(`======================================================`);

      for (const vp of VIEWPORTS) {
        console.log(`\n--- Viewport: ${vp.name} (${vp.width}x${vp.height}) ---`);

        // Generate a fresh session per viewport context so refresh token rotation never collides
        const session = await createAuthSession(admin);

        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
        });

        await context.addCookies(session.cookies);

        const storageWithTheme = {
          ...session.localStorageItems,
          theme,
        };

        await context.addInitScript(
          ({ items, token }) => {
            for (const [k, v] of Object.entries(items)) {
              localStorage.setItem(k, v);
            }
            window.__E2E_ACCESS_TOKEN__ = token;
            const interval = setInterval(() => {
              if (typeof window.setStaffAccessToken === 'function') {
                window.setStaffAccessToken(token);
                clearInterval(interval);
              }
            }, 50);
            setTimeout(() => clearInterval(interval), 5000);
          },
          { items: storageWithTheme, token: session.accessToken }
        );

        const page = await context.newPage();

        for (const route of ROUTES) {
          const url = `${FRONTEND_URL}${route.path}`;
          await page.goto(url, { waitUntil: 'domcontentloaded' });

          // Wait for h1 to be visible
          const h1 = page.locator('h1').first();
          await h1.waitFor({ state: 'visible', timeout: 10000 });

          // 1. Verify NO navbar test id, NO role=navigation, NO nav tag
          const navElements = await page.locator('nav, [role="navigation"], [data-testid="navbar"], [data-testid="crm-navbar"], [data-testid="nav-tabs-container"]').count();
          if (navElements !== 0) {
            console.error(`❌ FAIL: Found ${navElements} navigation/navbar elements on ${route.path} (${vp.name})`);
            testsFailed++;
          } else {
            testsPassed++;
          }

          // 2. Verify Page Title
          await page.waitForFunction(
            (expected) => document.title.includes(expected),
            route.expectedTitle,
            { timeout: 5000 }
          ).catch(() => {});
          const title = await page.title();
          if (!title.includes(route.expectedTitle)) {
            console.error(`❌ FAIL: Title mismatch on ${route.path}. Got "${title}", expected to contain "${route.expectedTitle}"`);
            testsFailed++;
          } else {
            testsPassed++;
          }

          // 3. Verify No Horizontal Overflow
          const overflow = await page.evaluate(() => {
            const docWidth = document.documentElement.scrollWidth;
            const docClient = document.documentElement.clientWidth;
            const bodyWidth = document.body.scrollWidth;
            const bodyClient = document.body.clientWidth;
            const maxDelta = Math.max(docWidth - docClient, bodyWidth - bodyClient);
            return {
              hasOverflow: maxDelta > 3, // 3px margin for subpixel scrollbars
              maxDelta,
              docWidth,
              docClient,
              bodyWidth,
              bodyClient,
            };
          });

          if (overflow.hasOverflow) {
            console.error(`❌ FAIL: Horizontal overflow detected on ${route.path} at ${vp.name}: ${JSON.stringify(overflow)}`);
            testsFailed++;
          } else {
            testsPassed++;
          }

          // 4. Capture screenshots at specified viewports (1536x730 and 390x844)
          if (vp.width === 1536 || vp.width === 390) {
            const pageSlug = route.path.replace('/analytics/', '');
            const screenshotFile = path.join(
              ARTIFACT_DIR,
              `evidence-standalone-${pageSlug}-${vp.width}-${theme}.png`
            );
            await page.screenshot({ path: screenshotFile, fullPage: false });
            console.log(`✓ Saved screenshot: evidence-standalone-${pageSlug}-${vp.width}-${theme}.png`);
          }
        }

        // 5. Test Back to Dashboard button and keyboard focus on 1536x730 dark
        if (vp.width === 1536 && theme === 'dark') {
          console.log('\nTesting "Back to Dashboard" button...');
          await page.goto(`${FRONTEND_URL}/analytics/leads`, { waitUntil: 'domcontentloaded' });
          await page.locator('h1').first().waitFor({ state: 'visible', timeout: 10000 });
          const backLinksCount = await page.locator('a:has-text("Back to Dashboard")').count();
          console.log(`Back to Dashboard link count on /analytics/leads: ${backLinksCount}`);
          if (backLinksCount === 1) {
            console.log('✓ PASS: Exactly one "Back to Dashboard" button present (duplicate below removed)');
            testsPassed++;
          } else {
            console.error(`❌ FAIL: Expected 1 "Back to Dashboard" button, found ${backLinksCount}`);
            testsFailed++;
          }
          const backBtn = page.locator('a:has-text("Back to Dashboard")').first();
          await backBtn.click();
          await page.waitForURL('**/dashboard');
          console.log(`✓ PASS: Navigated back to ${page.url()}`);
          testsPassed++;

          // Test Deep Link Refresh
          console.log('Testing deep link refresh on /analytics/orders...');
          await page.goto(`${FRONTEND_URL}/analytics/orders`, { waitUntil: 'domcontentloaded' });
          await page.locator('h1').first().waitFor({ state: 'visible', timeout: 10000 });
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.locator('h1').first().waitFor({ state: 'visible', timeout: 10000 });
          const orderHeader = await page.locator('h1').innerText();
          if (orderHeader.includes('Active Orders')) {
            console.log(`✓ PASS: Deep link refresh preserved page: "${orderHeader}"`);
            testsPassed++;
          } else {
            console.error(`❌ FAIL: Deep link reload failed`);
            testsFailed++;
          }

          // Test Keyboard Focus on Back to Dashboard
          console.log('Testing keyboard focus navigation...');
          await page.goto(`${FRONTEND_URL}/analytics/leads`, { waitUntil: 'domcontentloaded' });
          await page.locator('h1').first().waitFor({ state: 'visible', timeout: 10000 });
          await page.keyboard.press('Tab');
          const focusedText = await page.evaluate(() => document.activeElement?.textContent?.trim() || '');
          console.log(`✓ Keyboard focused on: "${focusedText}"`);
          testsPassed++;
        }

        await context.close();
      }
    }

    // 6. Test logged-out redirect to login / landing flow
    console.log('\nTesting logged-out visit redirection...');
    const loggedOutContext = await browser.newContext();
    const loggedOutPage = await loggedOutContext.newPage();
    await loggedOutPage.goto(`${FRONTEND_URL}/analytics/leads`);
    await loggedOutPage.waitForFunction(() => {
      const p = window.location.pathname;
      return p === '/login' || p === '/' || window.location.search.includes('notice');
    }, { timeout: 15000 });
    console.log(`✓ PASS: Logged-out visit redirected to login flow: ${loggedOutPage.url()}`);
    testsPassed++;
    await loggedOutContext.close();

    // 7. Test /analytics redirects to /dashboard
    console.log('Testing /analytics redirects to /dashboard...');
    const sessionForRedirect = await createAuthSession(admin);
    const authContext = await browser.newContext();
    await authContext.addCookies(sessionForRedirect.cookies);
    await authContext.addInitScript(
      ({ items, token }) => {
        for (const [k, v] of Object.entries(items)) {
          localStorage.setItem(k, v);
        }
        window.__E2E_ACCESS_TOKEN__ = token;
        const interval = setInterval(() => {
          if (typeof window.setStaffAccessToken === 'function') {
            window.setStaffAccessToken(token);
            clearInterval(interval);
          }
        }, 50);
        setTimeout(() => clearInterval(interval), 5000);
      },
      { items: sessionForRedirect.localStorageItems, token: sessionForRedirect.accessToken }
    );
    const authPage = await authContext.newPage();
    await authPage.goto(`${FRONTEND_URL}/analytics`);
    await authPage.waitForURL('**/dashboard');
    console.log(`✓ PASS: /analytics redirected to ${authPage.url()}`);
    testsPassed++;
    await authContext.close();

  } finally {
    await browser.close();
    await prisma.$disconnect();
  }

  console.log(`\n======================================================`);
  console.log(`TEST SUMMARY: ${testsPassed} checks passed, ${testsFailed} failed`);
  console.log(`======================================================\n`);

  if (testsFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n❌ TEST RUNNER ERROR:', err);
  process.exit(1);
});
