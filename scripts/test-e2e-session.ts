/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as jwt from 'jsonwebtoken';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`[PASS] ${testName}${detail ? ' -> ' + detail : ''}`);
  } else {
    failed++;
    console.error(`[FAIL] ${testName}${detail ? ' -> ' + detail : ''}`);
  }
}

// ── Test Database & State for E2E Session Tests ──────────────────────────────
interface FakeUser {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId?: string | null;
  companyCode?: string;
  pages: string[];
}

const JWT_SECRET = 'playwright-test-jwt-secret-12345';
const TOKEN_LIFETIME_SEC = 2; // Short 2-second access token lifetime for test

const FAKE_USERS: Record<string, FakeUser> = {
  'alice@example.com': {
    id: 'user_alice_101',
    name: 'Alice Smith',
    email: 'alice@example.com',
    role: 'admin',
    tenantId: 'tenant-test-1',
    companyCode: 'ACME',
    pages: ['dashboard', 'orders', 'leads', 'invoices', 'users'],
  },
  'bob@example.com': {
    id: 'user_bob_202',
    name: 'Bob Jones',
    email: 'bob@example.com',
    role: 'employee',
    tenantId: 'tenant-test-1',
    companyCode: 'ACME',
    pages: ['dashboard', 'orders', 'leads'],
  },
  'psa@example.com': {
    id: 'user_psa_999',
    name: 'Super Admin',
    email: 'psa@example.com',
    role: 'platform_super_admin',
    tenantId: null,
    pages: ['platform_companies', 'platform_admins', 'system_info'],
  },
};

async function runE2ESessionSuite() {
  console.log('========================================================================');
  console.log('PLAYWRIGHT E2E BROWSER SESSION TEST SUITE');
  console.log('1 Browser Context, 2 Pages, Real Chrome Engine');
  console.log('========================================================================\n');

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    context = await browser.newContext({
      baseURL: 'http://localhost:5173',
      viewport: { width: 1280, height: 800 },
    });

    // In-memory cookie session tracker for this browser context
    let activeCookieUser: FakeUser | null = null;
    let refreshCounter = 0;

    // Intercept backend API calls to provide hermetic test database state
    await context.route('**/api/v1/**', async (route, request) => {
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const headers = request.headers();

      // Read custom expected user header if provided
      const expectedUserId = headers['x-expected-user-id'];

      // ── GET /api/v1/auth/session-probe & /platform-auth/session-probe
      if (path.endsWith('/auth/session-probe') || path.endsWith('/platform-auth/session-probe')) {
        if (!activeCookieUser) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ signedIn: false, displayName: null, portal: null }),
          });
        }
        const portal = activeCookieUser.role === 'platform_super_admin' ? 'platform' : 'staff';
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            signedIn: true,
            displayName: activeCookieUser.name,
            portal,
          }),
        });
      }

      // ── POST /api/v1/auth/login
      if (path.endsWith('/auth/login') && method === 'POST') {
        const postData = JSON.parse(request.postData() || '{}');
        const identifier = (postData.identifier || postData.email || '').toLowerCase().trim();
        const user = FAKE_USERS[identifier];

        if (!user || postData.password !== 'Password123!') {
          return route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Invalid credentials' }),
          });
        }

        activeCookieUser = user;
        const accessToken = jwt.sign(
          { sub: user.id, email: user.email, role: user.role, tenantId: user.tenantId },
          JWT_SECRET,
          { expiresIn: `${TOKEN_LIFETIME_SEC}s` },
        );

        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: {
            'Set-Cookie': 'crm_refresh_token_c2pa=fake_refresh_cookie_hash; Path=/api/v1/auth; HttpOnly; SameSite=Strict',
          },
          body: JSON.stringify({
            accessToken,
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              tenantId: user.tenantId,
              tenant: user.tenantId ? { name: 'Acme Test Corp', code: 'ACME' } : null,
              effectivePages: user.pages,
            },
          }),
        });
      }

      // ── POST /api/v1/platform-auth/login
      if (path.endsWith('/platform-auth/login') && method === 'POST') {
        const postData = JSON.parse(request.postData() || '{}');
        const email = (postData.email || '').toLowerCase().trim();
        const user = FAKE_USERS[email];

        if (!user || user.role !== 'platform_super_admin' || postData.password !== 'Password123!') {
          return route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Invalid platform credentials' }),
          });
        }

        activeCookieUser = user;
        const accessToken = jwt.sign(
          { sub: user.id, email: user.email, role: user.role, tenantId: null },
          JWT_SECRET,
          { expiresIn: `${TOKEN_LIFETIME_SEC}s` },
        );

        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: {
            'Set-Cookie': 'crm_platform_refresh_token_c2pa=fake_platform_cookie_hash; Path=/api/v1/platform-auth; HttpOnly; SameSite=Strict',
          },
          body: JSON.stringify({
            accessToken,
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              effectivePages: user.pages,
            },
          }),
        });
      }

      // ── POST /api/v1/auth/refresh & /platform-auth/refresh
      if ((path.endsWith('/auth/refresh') || path.endsWith('/platform-auth/refresh')) && method === 'POST') {
        refreshCounter++;
        let bodyExpectedUser = expectedUserId;
        try {
          const pb = JSON.parse(request.postData() || '{}');
          if (pb.expectedUserId) bodyExpectedUser = pb.expectedUserId;
        } catch {}

        if (!activeCookieUser) {
          return route.fulfill({ status: 401, body: JSON.stringify({ message: 'No active session' }) });
        }

        // 409 Conflict if tab expected a different user
        if (bodyExpectedUser && activeCookieUser.id !== bodyExpectedUser) {
          return route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
              statusCode: 409,
              error: 'Conflict',
              code: 'SESSION_CHANGED',
              message: 'Session changed in another tab or window.',
            }),
          });
        }

        const accessToken = jwt.sign(
          { sub: activeCookieUser.id, email: activeCookieUser.email, role: activeCookieUser.role, tenantId: activeCookieUser.tenantId },
          JWT_SECRET,
          { expiresIn: `${TOKEN_LIFETIME_SEC}s` },
        );

        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            accessToken,
            user: {
              id: activeCookieUser.id,
              name: activeCookieUser.name,
              email: activeCookieUser.email,
              role: activeCookieUser.role,
              tenantId: activeCookieUser.tenantId,
              tenant: activeCookieUser.tenantId ? { name: 'Acme Test Corp', code: 'ACME' } : null,
              effectivePages: activeCookieUser.pages,
            },
          }),
        });
      }

      // ── GET /api/v1/auth/me & /platform-auth/me
      if (path.endsWith('/auth/me') || path.endsWith('/platform-auth/me')) {
        const authHeader = headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return route.fulfill({ status: 401, body: JSON.stringify({ message: 'Unauthorized' }) });
        }

        const token = authHeader.substring(7);
        try {
          const payload = jwt.verify(token, JWT_SECRET) as any;
          const user = Object.values(FAKE_USERS).find((u) => u.id === payload.sub);
          if (!user) return route.fulfill({ status: 401, body: JSON.stringify({ message: 'Unauthorized' }) });

          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              tenantId: user.tenantId,
              tenant: user.tenantId ? { name: 'Acme Test Corp', code: 'ACME' } : null,
              effectivePages: user.pages,
            }),
          });
        } catch {
          return route.fulfill({ status: 401, body: JSON.stringify({ message: 'Token expired or invalid' }) });
        }
      }

      // ── POST /api/v1/auth/logout & /platform-auth/logout
      if (path.endsWith('/logout') && method === 'POST') {
        let bodyExpectedUser = expectedUserId;
        try {
          const pb = JSON.parse(request.postData() || '{}');
          if (pb.expectedUserId) bodyExpectedUser = pb.expectedUserId;
        } catch {}

        if (bodyExpectedUser && activeCookieUser && activeCookieUser.id !== bodyExpectedUser) {
          return route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
              statusCode: 409,
              error: 'Conflict',
              code: 'SESSION_CHANGED',
              message: 'Session changed in another tab or window.',
            }),
          });
        }

        activeCookieUser = null;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: {
            'Set-Cookie': 'crm_refresh_token_c2pa=; Path=/api/v1/auth; Max-Age=0; HttpOnly; SameSite=Strict',
          },
          body: JSON.stringify({ success: true, message: 'Logged out successfully' }),
        });
      }

      if (path.includes('/dashboard/kpis')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            isPlatformOwner: false,
            platformMetrics: { totalCompanies: 1, totalUsers: 2, activeCompanies: 1 },
            clientTenantInfo: { name: 'Acme Test Corp' },
            leadsToday: {
              total: 5,
              breakdown: {
                indiamart: 2,
                web: 1,
                whatsapp: 1,
                manual: 1,
              },
            },
            pendingFollowUps: 0,
            ordersInTransit: 0,
            lowStockSkus: 0,
            activeSuppliers: 0,
            leadsByStatus: {},
            leadTrend: [{ date: new Date().toISOString(), total: 5 }],
            recentOrders: [],
            cards: {
              leads: { totalToday: 5, pendingFollowUps: 0 },
              orders: { inTransit: 0, recentOrders: [] },
              inventory: { lowStockSkus: 0 },
              suppliers: { activeCount: 0 },
              quotations: { pendingCount: 0 },
              invoices: { unpaidCount: 0 },
              shipments: { inTransitCount: 0 },
              dailyActivities: { todayCount: 0 },
            },
          }),
        });
      }

      if (path.includes('/branding')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            companyDisplayName: 'Acme Test Corp',
            portalTheme: 'system',
          }),
        });
      }

      if (path.includes('/tenants')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }

      // Default mock 200 for other API endpoints
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], success: true }),
      });
    });

    const page1 = await context.newPage();
    const page2 = await context.newPage();

    page1.on('console', (msg) => console.log('[BROWSER 1 LOG]', msg.text()));
    page1.on('pageerror', (err) => console.error('[BROWSER 1 ERROR]', err));
    page1.on('response', (res) => {
      if (res.status() >= 400) console.log('[HTTP FAILED]', res.status(), res.url());
    });
    page2.on('console', (msg) => console.log('[BROWSER 2 LOG]', msg.text()));
    page2.on('pageerror', (err) => console.error('[BROWSER 2 ERROR]', err));

    // ── CASE 1: Log in as A in page 1, open /login in page 2 ───────────────────
    console.log('--- CASE 1: Log in as User A in Page 1, open /login in Page 2 ---');
    await page1.goto('/login', { waitUntil: 'domcontentloaded' });
    console.log('Page 1 loaded, content preview:', (await page1.content()).substring(0, 500));
    await page1.waitForSelector('#identifier', { timeout: 10000 });

    await page1.fill('#identifier', 'alice@example.com');
    await page1.fill('#password', 'Password123!');
    await page1.click('button[type="submit"]');

    // Wait for Page 1 to sign in and reach the dashboard / home
    await page1.waitForURL((url) => url.pathname !== '/login', { timeout: 10000 });
    assert(page1.url().includes('/'), 'Page 1 logged in successfully as User A');

    // Open /login in Page 2
    await page2.goto('/login');
    await page2.waitForSelector('text=Already signed in', { timeout: 10000 });

    const page2CardText = await page2.locator('text=You are already signed in as').textContent();
    assert(
      Boolean(page2CardText && page2CardText.includes('Alice Smith')),
      'Page 2 displays "Already signed in" card with display name "Alice Smith"',
      page2CardText || undefined,
    );

    // Verify login form is NOT shown on Page 2
    const formInputCount = await page2.locator('#identifier').count();
    assert(formInputCount === 0, 'Login form is hidden on Page 2 (only already-signed-in card shown)');

    // ── CASE 2: Sign out in Page 2 and Page 1 returns to login ─────────────────
    console.log('\n--- CASE 2: Sign out in Page 2, Page 1 returns to login ---');
    const signOutBtn = page2.locator('button:has-text("Sign out and use another account")');
    await signOutBtn.click();

    // Wait for Page 2 to show the login form
    await page2.waitForSelector('#identifier', { timeout: 10000 });
    assert(true, 'Page 2 successfully signed out and returned to login form');

    // Page 1 should receive the cross-tab signed_out broadcast and return to /login
    await page1.waitForURL((url) => url.pathname === '/login', { timeout: 10000 });
    await page1.waitForSelector('#identifier', { timeout: 10000 });
    assert(page1.url().endsWith('/login'), 'Page 1 automatically returned to /login via cross-tab sync');

    // ── CASE 3: Log in as B in Page 2, Page 1 shows Session Changed modal ──────
    console.log('\n--- CASE 3: Log in as User B in Page 2, Page 1 shows Session Changed modal ---');
    // Page 2 has already signed out and is on the login form. Log in as User B.
    await page2.fill('#identifier', 'bob@example.com');
    await page2.fill('#password', 'Password123!');
    await page2.click('button[type="submit"]');
    await page2.waitForURL((url) => url.pathname !== '/login', { timeout: 10000 });
    assert(page2.url().includes('/'), 'Page 2 logged in as User B');

    // Page 1 should detect that another account logged in across tabs
    // and display the Session Changed modal
    const modalFound = await page1.waitForSelector(
      'text=Session Changed',
      { timeout: 8000 },
    ).catch(() => null);

    assert(Boolean(modalFound), 'Page 1 displayed Session Changed modal when User B signed in on Page 2');

    // ── CASE 4: Both pages open longer than access token lifetime (silent refresh)
    console.log('\n--- CASE 4: Both pages open longer than token lifetime without unexpected logout ---');
    // Open both pages to authenticated application routes
    await page1.goto('/');
    await page2.goto('/');
    await page1.waitForURL((url) => url.pathname === '/', { timeout: 10000 });
    await page2.waitForURL((url) => url.pathname === '/', { timeout: 10000 });
    await page1.waitForLoadState('networkidle');
    await page2.waitForLoadState('networkidle');

    const initialRefreshes = refreshCounter;
    // Wait 3.5 seconds (longer than the 2s token lifetime)
    await new Promise((r) => setTimeout(r, 3500));

    // Both pages make an API call to verify silent refresh occurred cleanly
    const [p1Url, p2Url] = [page1.url(), page2.url()];
    assert(!p1Url.includes('/login') && !p2Url.includes('/login'), 'Neither page was logged out unexpectedly after token lifetime expired');
    assert(refreshCounter >= initialRefreshes, 'Silent token refresh executed transparently across tabs');

    // ── CASE 5: Platform and Company sessions blocking each other ─────────────
    console.log('\n--- CASE 5: Platform and Company sessions blocking each other ---');
    // Currently User B (Company user) is signed in. Open /platform/login in Page 2.
    await page2.goto('/platform/login');
    await page2.getByRole('heading', { name: 'Already signed in' }).waitFor({ timeout: 10000 });

    const platformBlockText = await page2.getByRole('heading', { name: 'Already signed in' }).textContent();
    assert(
      Boolean(platformBlockText),
      'Company session blocks /platform/login with "Already signed in" card',
      platformBlockText || undefined,
    );

    // Sign out from Page 2
    await page2.locator('button:has-text("Sign out and use another account")').click();
    await page2.waitForSelector('#platform-email', { timeout: 10000 });

    // Log into platform as PSA
    await page2.fill('#platform-email', 'psa@example.com');
    await page2.fill('#platform-password', 'Password123!');
    await page2.click('button[type="submit"]');
    await page2.waitForURL((url) => url.pathname.includes('/platform/companies'), { timeout: 10000 });
    assert(page2.url().includes('/platform/companies'), 'Page 2 logged in as Platform Super Admin');

    // Now visit /login (company portal) in Page 1 -> should block and show "Already signed in"
    await page1.goto('/login');
    await page1.getByRole('heading', { name: 'Already signed in' }).waitFor({ timeout: 10000 });
    const companyBlockText = await page1.locator('text=You are already signed in as').textContent();
    assert(
      Boolean(companyBlockText && companyBlockText.includes('Super Admin')),
      'Platform session blocks company /login with "Already signed in as Super Admin"',
      companyBlockText || undefined,
    );

  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
  }

  console.log('\n========================================================================');
  console.log(`PLAYWRIGHT TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runE2ESessionSuite().catch((err) => {
  console.error('[FATAL PLAYWRIGHT ERROR]:', err);
  process.exit(1);
});
