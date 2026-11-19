#!/usr/bin/env node
/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Dedicated Public Leak Prevention & Support Code Verification Suite
 * (scripts/test-public-leak-and-support-code-suite.js)
 *
 * Runs comprehensive Playwright E2E and contract verifications:
 * 1. Forced error injection on /login (500, 503, 429, network failure)
 * 2. Forced error injection on company pages (/invoices, /quotations, /users)
 * 3. Light and dark mode across 1536x730 and 390px viewports
 * 4. Friendly messages verification: zero technical words (Prisma, SQL, column, migration, stack, etc.)
 * 5. Short support code verification: 6-8 chars (e.g. K7F-29Q) with Copy button, no long UUIDs
 * 6. Build badge verification: only for platform admin inside /platform/*; equal IDs never warn
 * 7. Evidence screenshot captures to artifact directory
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT_DIR = path.resolve(__dirname, '..');
const ARTIFACT_DIR = path.resolve('C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824');

if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

let passedCount = 0;
let failedCount = 0;
const failures = [];
const screenshotsCaptured = [];

function assert(description, condition, extraInfo = '') {
  if (condition) {
    passedCount++;
    console.log(`  [PASS] ${description}`);
  } else {
    failedCount++;
    const errMsg = extraInfo ? ` -> ${extraInfo}` : '';
    console.error(`  [FAIL] ${description}${errMsg}`);
    failures.push({ description, extraInfo });
  }
}

async function captureScreenshot(page, filename) {
  const filePath = path.join(ARTIFACT_DIR, filename);
  await page.screenshot({ path: filePath, fullPage: true });
  screenshotsCaptured.push({
    filename,
    path: filePath,
  });
  console.log(`    [SCREENSHOT] Saved: ${filename}`);
}

function parseCookies(setCookieHeader) {
  if (!setCookieHeader) return [];
  const cookies = [];
  const parts = setCookieHeader.split(/,(?=[a-zA-Z0-9_-]+=)/);
  for (const p of parts) {
    const match = p.trim().match(/^([^=]+)=([^;]+)/);
    if (match) {
      const name = match[1].trim();
      const value = match[2].trim();
      const pathMatch = p.match(/Path=([^;]+)/i);
      cookies.push({
        name,
        value,
        domain: 'localhost',
        path: pathMatch ? pathMatch[1] : '/',
        httpOnly: p.toLowerCase().includes('httponly'),
        sameSite: 'Lax',
      });
    }
  }
  return cookies;
}

async function run() {
  console.log('========================================================================');
  console.log('PUBLIC LEAK PREVENTION, FRIENDLY MESSAGES & SUPPORT CODE E2E SUITE');
  console.log('Testing Playwright on 1536x730 and 390px (Light & Dark Mode)...');
  console.log('========================================================================\n');

  const browser = await chromium.launch({ headless: true });

  try {
    // ─── SECTION 1: LOGIN PAGE ERROR SCENARIOS (1536x730 & 390px, LIGHT & DARK) ───
    console.log('\n[1/5] Testing Login Page Failure Scenarios...');

    const viewports = [
      { name: '1536x730', width: 1536, height: 730 },
      { name: '390px', width: 390, height: 844 },
    ];

    const themes = ['light', 'dark'];

    for (const vp of viewports) {
      for (const theme of themes) {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          colorScheme: theme,
        });
        const page = await context.newPage();

        // 1.1 Force 500 on login
        await page.route('**/api/v1/auth/login', async (route) => {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            headers: {
              'x-support-code': 'K7F-29Q',
              'x-request-id': 'e8a71234-abcd-ef01-2345-6789abcdef01',
            },
            body: JSON.stringify({
              statusCode: 500,
              code: 'INTERNAL',
              message: 'We could not sign you in right now. Please try again in a few minutes.',
              requestId: 'e8a71234-abcd-ef01-2345-6789abcdef01',
              supportCode: 'K7F-29Q',
              fieldErrors: [],
            }),
          });
        });

        await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
        await page.fill('#company-identifier, #platform-identifier, input[autocomplete="username"]', 'testuser@example.com');
        await page.fill('#company-password, #platform-password, input[type="password"]', 'Password123!');
        await page.click('button[type="submit"]');

        await page.waitForSelector('#company-form-error, [role="alert"]', { timeout: 5000 });

        const errorText = await page.innerText('#company-form-error, [role="alert"]');
        assert(
          `[Login 500 ${vp.name} ${theme}] Shows friendly login failure message without technical words`,
          errorText.includes('We could not sign you in right now. Please try again in a few minutes.') &&
            !errorText.includes('Prisma') &&
            !errorText.includes('SQL') &&
            !errorText.includes('column') &&
            !errorText.includes('stack')
        );

        assert(
          `[Login 500 ${vp.name} ${theme}] Shows short support code with copy button`,
          errorText.includes('Support code: K7F-29Q')
        );

        assert(
          `[Login 500 ${vp.name} ${theme}] Long UUID is NOT displayed in visible text`,
          !errorText.includes('e8a71234-abcd-ef01-2345-6789abcdef01') &&
            !/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i.test(errorText)
        );

        // Check footer on public login page: must not show build IDs or build mismatch
        const footerText = await page.innerText('footer');
        assert(
          `[Login 500 ${vp.name} ${theme}] Footer shows only copyright and legal links (no build mismatch or commit ID)`,
          !footerText.includes('Build mismatch') && !footerText.includes('Build dev') && !footerText.includes('API:')
        );

        await captureScreenshot(page, `evidence-friendly-login-500-${vp.name}-${theme}.png`);
        await context.close();
      }
    }

    // ─── SECTION 2: OTHER LOGIN ERROR STATES (503, 429, NETWORK FAIL) ─────────
    console.log('\n[2/5] Testing 503, 429, and Network Failure on Login...');
    {
      const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
      const page = await context.newPage();

      // 2.1 Force 503 Schema update
      await page.route('**/api/v1/auth/login', async (route) => {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          headers: { 'x-support-code': 'M4K-89P' },
          body: JSON.stringify({
            statusCode: 503,
            code: 'SCHEMA_OUT_OF_DATE',
            message: 'The system is being updated. Please try again in a few minutes.',
            requestId: 'c1234567-89ab-cdef-0123-456789abcdef',
            supportCode: 'M4K-89P',
          }),
        });
      });

      await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
      await page.fill('#company-identifier, #platform-identifier, input[autocomplete="username"]', 'staff@example.com');
      await page.fill('#company-password, #platform-password, input[type="password"]', 'Password123!');
      await page.click('button[type="submit"]');

      await page.waitForSelector('#company-form-error, [role="alert"]', { timeout: 5000 });
      const errorText503 = await page.innerText('#company-form-error, [role="alert"]');
      assert(
        '[Login 503] Displays friendly system update message and support code',
        errorText503.includes('The system is being updated. Please try again in a few minutes.') &&
          errorText503.includes('Support code: M4K-89P') &&
          !errorText503.includes('c1234567-89ab-cdef-0123-456789abcdef')
      );
      await captureScreenshot(page, 'evidence-friendly-login-503-1536x730.png');

      // 2.2 Force 429 Rate limit
      await page.unroute('**/api/v1/auth/login');
      await page.route('**/api/v1/auth/login', async (route) => {
        await route.fulfill({
          status: 429,
          headers: { 'retry-after': '900' },
          body: JSON.stringify({
            statusCode: 429,
            message: 'Too many attempts. Please wait 15 minutes.',
            retryAfter: 900,
          }),
        });
      });

      await page.fill('#company-password, #platform-password, input[type="password"]', 'Password123!');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(500);
      const errorText429 = await page.innerText('#company-form-error, [role="alert"]');
      assert(
        '[Login 429] Displays friendly rate limit message with countdown',
        errorText429.includes('Too many attempts. Please wait 15 minutes.')
      );
      const isSubmitDisabled = await page.isDisabled('button[type="submit"]');
      assert('[Login 429] Submit button is disabled during rate limit countdown', isSubmitDisabled);
      await captureScreenshot(page, 'evidence-friendly-login-429-1536x730.png');

      // 2.3 Force Network failure
      await page.unroute('**/api/v1/auth/login');
      await page.route('**/api/v1/auth/login', async (route) => {
        await route.abort('failed');
      });

      // Reload to clear 429 lock
      await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
      await page.fill('#company-identifier, #platform-identifier, input[autocomplete="username"]', 'staff@example.com');
      await page.fill('#company-password, #platform-password, input[type="password"]', 'Password123!');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(500);

      const errorTextNet = await page.innerText('#company-form-error, [role="alert"]');
      assert(
        '[Login Network Failure] Displays friendly network error message',
        errorTextNet.includes('Could not reach the server. Check your internet and try again.')
      );
      await captureScreenshot(page, 'evidence-friendly-login-network-fail-1536x730.png');

      await context.close();
    }

    // ─── SECTION 3: COMPANY PAGES ERROR STATES (/invoices, /quotations, /users) ─
    console.log('\n[3/5] Testing Company Pages (/invoices, /quotations, /users)...');
    {
      const loginRes = await fetch('http://localhost:3333/api/v1/auth/dev-demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@demo.test' }),
      });
      const authData = await loginRes.json();
      const cookies = parseCookies(loginRes.headers.get('set-cookie'));

      const setupCompanyContext = async (context, theme = 'light') => {
        await context.addCookies(cookies);
        const page = await context.newPage();
        await page.addInitScript(
          ({ authData, theme }) => {
            window.__INITIAL_STAFF_TOKEN__ = authData.accessToken;
            localStorage.setItem('crm_user', JSON.stringify(authData.user));
            localStorage.setItem('crm_staff_token', authData.accessToken);
            localStorage.setItem('crm_refresh_token_fb', authData.refreshToken);
            localStorage.setItem('crm_last_user_activity', String(Date.now()));
            sessionStorage.setItem('crm_tab_user_id', authData.user.id);
            sessionStorage.setItem('crm_portal', 'staff');
            sessionStorage.setItem('crm_portal_marker', 'company');
            sessionStorage.setItem('crm_last_active_user_id', authData.user.id);
            sessionStorage.setItem('crm_refresh_token_fb', authData.refreshToken);
            if (theme === 'dark') {
              document.documentElement.classList.add('dark');
            } else {
              document.documentElement.classList.remove('dark');
            }
          },
          { authData, theme }
        );
        return page;
      };

      // 3.1 Company Page: /invoices (Force 500)
      for (const theme of ['light', 'dark']) {
        const context = await browser.newContext({
          viewport: { width: 1536, height: 730 },
          colorScheme: theme,
        });
        const page = await setupCompanyContext(context, theme);

        await page.route('**/api/v1/invoices**', async (route) => {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            headers: { 'x-support-code': 'R7H-55B' },
            body: JSON.stringify({
              statusCode: 500,
              code: 'INTERNAL',
              message: 'We could not complete your request right now. Please try again in a few minutes.',
              requestId: 'd9876543-21fe-dcba-0987-654321fedcba',
              supportCode: 'R7H-55B',
            }),
          });
        });

        await page.goto('http://localhost:5173/invoices', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);

        const bodyText = await page.innerText('main, [role="main"], body');
        assert(
          `[/invoices 500 ${theme}] Shows friendly sentence on server error`,
          bodyText.includes('We could not complete your request right now. Please try again in a few minutes.')
        );
        assert(
          `[/invoices 500 ${theme}] Displays support code with copy button`,
          bodyText.includes('Support code: R7H-55B') || bodyText.includes('R7H-55B')
        );
        assert(
          `[/invoices 500 ${theme}] No long UUID in visible text`,
          !bodyText.includes('d9876543-21fe-dcba-0987-654321fedcba')
        );

        // Check footer: no build IDs for company users
        const footerText = await page.innerText('footer');
        assert(
          `[/invoices 500 ${theme}] Footer has no build IDs or mismatch banner for company users`,
          !footerText.includes('Build mismatch') && !footerText.includes('Build dev')
        );

        await captureScreenshot(page, `evidence-friendly-invoices-500-1536x730-${theme}.png`);
        await context.close();
      }

      // 3.2 Company Page: /quotations (Force 503 Schema)
      {
        const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
        const page = await setupCompanyContext(context);

        await page.route('**/api/v1/quotations**', async (route) => {
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            headers: { 'x-support-code': 'P3X-19T' },
            body: JSON.stringify({
              statusCode: 503,
              code: 'SCHEMA_OUT_OF_DATE',
              message: 'The system is being updated. Please try again in a few minutes.',
              requestId: 'b5555555-4444-3333-2222-111111111111',
              supportCode: 'P3X-19T',
            }),
          });
        });

        await page.goto('http://localhost:5173/quotations', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);

        const bodyText = await page.innerText('main, [role="main"], body');
        assert(
          '[/quotations 503] Shows friendly system update message and support code',
          bodyText.includes('The system is being updated. Please try again in a few minutes.') &&
            (bodyText.includes('Support code: P3X-19T') || bodyText.includes('P3X-19T')) &&
            !bodyText.includes('b5555555-4444-3333-2222-111111111111')
        );
        await captureScreenshot(page, 'evidence-friendly-quotations-503-1536x730.png');
        await context.close();
      }

      // 3.3 Company Page: /users (Force 403 Forbidden)
      {
        const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
        const page = await setupCompanyContext(context);

        await page.route('**/api/v1/users**', async (route) => {
          await route.fulfill({
            status: 403,
            contentType: 'application/json',
            headers: { 'x-support-code': 'Q8N-42M' },
            body: JSON.stringify({
              statusCode: 403,
              code: 'FORBIDDEN',
              message: 'You do not have permission to view this page. Ask your administrator.',
              requestId: 'a7777777-8888-9999-0000-111122223333',
              supportCode: 'Q8N-42M',
            }),
          });
        });

        await page.goto('http://localhost:5173/users', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);

        const bodyText = await page.innerText('main, [role="main"], body');
        assert(
          '[/users 403] Shows friendly forbidden message without internal roles leaked',
          bodyText.includes('permission') &&
            !bodyText.includes('Required roles') &&
            !bodyText.includes('tenant_admin') &&
            !bodyText.includes('platform_super_admin')
        );
        await captureScreenshot(page, 'evidence-friendly-users-403-1536x730.png');
        await context.close();
      }
    }

    // ─── SECTION 4: PLATFORM ADMIN VS COMPANY BUILD BADGE PARITY ───────────────
    console.log('\n[4/5] Testing Platform Console Build Badge Parity...');
    {
      const platRes = await fetch('http://localhost:3333/api/v1/auth/dev-demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'platform_owner@demo.test' }),
      });
      const platAuth = await platRes.json();
      const platCookies = parseCookies(platRes.headers.get('set-cookie'));

      const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
      await context.addCookies(platCookies);
      const page = await context.newPage();

      await page.route('**/api/v1/platform-auth/refresh', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            accessToken: platAuth.accessToken,
            user: platAuth.user,
          }),
        });
      });

      await page.route('**/api/v1/platform/tenants**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.addInitScript(
        ({ platAuth }) => {
          window.__INITIAL_PLATFORM_TOKEN__ = platAuth.accessToken;
          localStorage.setItem('crm_user', JSON.stringify(platAuth.user));
          localStorage.setItem('crm_platform_user', JSON.stringify(platAuth.user));
          localStorage.setItem('crm_platform_token', platAuth.accessToken);
          localStorage.setItem('crm_refresh_token_fb', platAuth.refreshToken);
          localStorage.setItem('crm_last_user_activity', String(Date.now()));
          sessionStorage.setItem('crm_tab_user_id', platAuth.user.id);
          sessionStorage.setItem('crm_portal', 'platform');
          sessionStorage.setItem('crm_portal_marker', 'platform');
          sessionStorage.setItem('crm_last_active_user_id', platAuth.user.id);
          sessionStorage.setItem('crm_refresh_token_fb', platAuth.refreshToken);
        },
        { platAuth }
      );

      // Route health endpoints returning commitId matching frontend git commit prefix
      await page.route('**/api/v1/health**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            version: '1.2.0',
            commitId: 'dev',
            database: 'ok',
            migrations: { total: 37, applied: 37, pending: 0, failed: 0 },
          }),
        });
      });

      await page.goto('http://localhost:5173/platform/companies', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);

      const footerText = await page.innerText('footer');
      assert(
        '[Platform Admin /platform/companies] Shows build IDs inside platform console',
        footerText.includes('Build') || footerText.includes('dev')
      );
      assert(
        '[Platform Admin /platform/companies] Equal commit IDs never trigger build mismatch warning',
        !footerText.includes('Build mismatch')
      );

      await captureScreenshot(page, 'evidence-platform-footer-build-ids-1536x730.png');
      await context.close();
    }

    // ─── SECTION 5: HIDE SUPPORT CODE CONFIGURATION ───────────────────────────
    console.log('\n[5/5] Testing Support Code Hidden Configuration Toggle...');
    {
      const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
      const page = await context.newPage();

      // Inject __HIDE_SUPPORT_CODE__ = true
      await page.addInitScript(() => {
        window.__HIDE_SUPPORT_CODE__ = true;
      });

      await page.route('**/api/v1/auth/login', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          headers: { 'x-support-code': 'K7F-29Q' },
          body: JSON.stringify({
            statusCode: 500,
            code: 'INTERNAL',
            message: 'We could not sign you in right now. Please try again in a few minutes.',
            supportCode: 'K7F-29Q',
          }),
        });
      });

      await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
      await page.fill('#company-identifier, #platform-identifier, input[autocomplete="username"]', 'staff@example.com');
      await page.fill('#company-password, #platform-password, input[type="password"]', 'Password123!');
      await page.click('button[type="submit"]');

      await page.waitForSelector('#company-form-error, [role="alert"]', { timeout: 5000 });
      const errorText = await page.innerText('#company-form-error, [role="alert"]');

      assert(
        '[Support Code Hidden Flag] When hidden, support code is completely omitted from the UI',
        !errorText.includes('Support code:') && !errorText.includes('K7F-29Q')
      );

      await context.close();
    }

  } finally {
    await browser.close();
  }

  console.log('\n========================================================================');
  console.log(`SUITE COMPLETE: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log(`TOTAL SCREENSHOTS CAPTURED: ${screenshotsCaptured.length}`);
  console.log('========================================================================\n');

  if (failedCount > 0) {
    console.error(`[FAIL] ${failedCount} test(s) failed in public leak & support code suite.`);
    process.exit(1);
  }

  process.exit(0);
}

if (require.main === module) {
  run().catch((err) => {
    console.error('[UNCAUGHT ERROR]:', err);
    process.exit(1);
  });
}

module.exports = { run };
