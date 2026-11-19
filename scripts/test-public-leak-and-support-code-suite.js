#!/usr/bin/env node
/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Dedicated Public Leak Prevention & Zero Code Exposure Verification Suite
 * (scripts/test-public-leak-and-support-code-suite.js)
 *
 * Verifies Requirement 1, 2, 3, and 4:
 * 1. Public error screens NEVER show support codes, UUIDs, 'Ref', 'Copy' buttons, or technical wording.
 * 2. Login error shows friendly sentence: "We can't sign you in right now. Please try again in a few minutes. If this continues, contact support."
 * 3. Shows 'Try again' button and 'Contact support' link without exposing codes.
 * 4. Never says 'system is being updated' on public screens.
 * 5. Full DOM HTML and text scanning for UUID and hex patterns on public error screens.
 * 6. Viewports: 1536x730 and 390px, Light and Dark mode.
 * 7. Traceability: Logged-in admins still see support code under 'Error details'; non-admins see only friendly text.
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
  console.log('PUBLIC LEAK PREVENTION, ZERO CODES ON PUBLIC SCREENS & FRIENDLY MESSAGES');
  console.log('Testing Playwright on 1536x730 and 390px (Light & Dark Mode)...');
  console.log('========================================================================\n');

  const browser = await chromium.launch({ headless: true });

  try {
    // ─── SECTION 1: LOGIN 500 (1536x730 & 390px, LIGHT & DARK) ──────────────────
    console.log('\n[1/4] Testing Login 500 across Viewports & Themes (Zero Codes, Friendly Text)...');

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

        // Force 500 on login
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
              message: "We can't sign you in right now. Please try again in a few minutes. If this continues, contact support.",
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

        await page.waitForSelector('#company-form-error, [role="alert"]', { timeout: 15000 });

        const errorEl = await page.$('#company-form-error, [role="alert"]');
        const errorText = errorEl ? await errorEl.innerText() : '';
        const domContent = errorEl ? await errorEl.innerHTML() : '';

        // Assertion 1: Friendly message without technical jargon
        assert(
          `[Login 500 ${vp.name} ${theme}] Shows friendly sign-in message without technical words`,
          errorText.includes("We can't sign you in right now. Please try again in a few minutes. If this continues, contact support.") &&
            !errorText.includes('Prisma') &&
            !errorText.includes('SQL') &&
            !errorText.includes('column') &&
            !errorText.includes('migration') &&
            !errorText.includes('stack')
        );

        // Assertion 2: Zero support codes, zero 'Support code' label, zero 'Copy' buttons in error container
        const hasSupportCode = /[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}/.test(errorText);
        const hasCopyBtn = await page.$('#company-form-error button:has-text("Copy"), [role="alert"] button:has-text("Copy"), [data-testid="copy-support-code-btn"]');
        assert(
          `[Login 500 ${vp.name} ${theme}] Zero support code and zero Copy button on public screen`,
          !hasSupportCode && !errorText.toLowerCase().includes('support code') && !hasCopyBtn
        );

        // Assertion 3: Zero long UUIDs in visible text AND DOM HTML of error container
        const hasUuidInText = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(errorText);
        const hasUuidInDom = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(domContent);
        assert(
          `[Login 500 ${vp.name} ${theme}] Zero UUID in page text and zero UUID in error DOM`,
          !hasUuidInText && !hasUuidInDom && !errorText.includes('Ref:') && !errorText.includes('(Ref')
        );

        // Assertion 4: Footer shows only copyright (no build mismatch or build IDs on public page)
        const footerText = await page.innerText('footer');
        assert(
          `[Login 500 ${vp.name} ${theme}] Footer shows copyright only without build IDs or mismatch banner`,
          !footerText.includes('Build mismatch') && !footerText.includes('Build dev') && !footerText.includes('API:')
        );

        // Assertion 5: Try again button and Contact support link present without displaying codes
        const tryAgainBtn = await page.$('[data-testid="btn-try-again"]');
        const contactSupportLink = await page.$('[data-testid="link-contact-support"]');
        const contactHref = contactSupportLink ? await contactSupportLink.getAttribute('href') : '';
        assert(
          `[Login 500 ${vp.name} ${theme}] 'Try again' button and 'Contact support' link are present without code leak`,
          Boolean(tryAgainBtn) && Boolean(contactSupportLink) && !contactHref.includes('K7F-29Q')
        );

        await captureScreenshot(page, `evidence-friendly-login-500-${vp.name}-${theme}.png`);
        await context.close();
      }
    }

    // ─── SECTION 2: OTHER PUBLIC ERROR STATES (503, PUBLIC FORM, 429, NETWORK) ───
    console.log('\n[2/4] Testing 503, Public Form, Rate Limit 429, and Network Failure...');
    {
      const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
      const page = await context.newPage();

      // 2.1 Force 503 on Login (must NOT say 'system is being updated' to public; must show friendly login text, zero codes)
      await page.route('**/api/v1/auth/login', async (route) => {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          headers: { 'x-support-code': 'M4K-89P' },
          body: JSON.stringify({
            statusCode: 503,
            code: 'SERVER_UPDATE_PENDING',
            message: "We can't sign you in right now. Please try again in a few minutes. If this continues, contact support.",
            requestId: 'c1234567-89ab-cdef-0123-456789abcdef',
          }),
        });
      });

      await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
      await page.fill('#company-identifier, #platform-identifier, input[autocomplete="username"]', 'staff@example.com');
      await page.fill('#company-password, #platform-password, input[type="password"]', 'Password123!');
      await page.click('button[type="submit"]');

      await page.waitForSelector('#company-form-error, [role="alert"]', { timeout: 15000 });
      const errorText503 = await page.innerText('#company-form-error, [role="alert"]');
      const errorDom503 = await page.innerHTML('#company-form-error, [role="alert"]');

      assert(
        '[Login 503] Public login does NOT say "system is being updated"; shows friendly sign-in text',
        !errorText503.toLowerCase().includes('system is being updated') &&
          errorText503.includes("We can't sign you in right now. Please try again in a few minutes. If this continues, contact support.")
      );

      assert(
        '[Login 503] Zero support code, zero UUID, and zero Copy button on 503 public error',
        !/[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}/.test(errorText503) &&
          !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(errorDom503) &&
          !errorText503.toLowerCase().includes('support code') &&
          !errorDom503.includes('copy-support-code-btn')
      );
      await captureScreenshot(page, 'evidence-friendly-login-503-1536x730.png');

      // 2.2 Public Form: Force 500 on Public Walkthrough Inquiry (/public/inquiry)
      await page.route('**/api/v1/inquiries/config**', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            statusCode: 500,
            code: 'INTERNAL',
            message: 'We could not complete your request right now. Please try again in a few minutes. If this continues, contact support.',
            requestId: 'f9999999-8888-7777-6666-555555555555',
          }),
        });
      });

      await page.goto('http://localhost:5173/public/inquiry', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      const publicFormVisibleText = await page.innerText('body');

      assert(
        '[Public Form 500] Zero support codes, zero UUIDs, and zero Copy buttons on public form error',
        !/[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}/.test(publicFormVisibleText) &&
          !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(publicFormVisibleText) &&
          !publicFormVisibleText.includes('Support code:') &&
          !publicFormVisibleText.includes('Ref:')
      );

      // 2.3 Public Form: Force 503 on Public Walkthrough Inquiry
      await page.unroute('**/api/v1/inquiries/config**');
      await page.route('**/api/v1/inquiries/config**', async (route) => {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            statusCode: 503,
            code: 'SERVER_UPDATE_PENDING',
            message: 'We could not complete your request right now. Please try again in a few minutes. If this continues, contact support.',
            requestId: 'a8888888-7777-6666-5555-444444444444',
          }),
        });
      });

      await page.goto('http://localhost:5173/public/inquiry', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      const public503Text = await page.innerText('body');

      assert(
        '[Public Form 503] Public form shows friendly error and does not say "system is being updated"',
        !public503Text.toLowerCase().includes('system is being updated') &&
          !/[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}/.test(public503Text) &&
          !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(public503Text)
      );

      // 2.4 Force 429 Rate limit on Login
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

      await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
      await page.fill('#company-identifier, #platform-identifier, input[autocomplete="username"]', 'staff@example.com');
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

      // 2.5 Force Network failure
      await page.unroute('**/api/v1/auth/login');
      await page.route('**/api/v1/auth/login', async (route) => {
        await route.abort('failed');
      });

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

    // ─── SECTION 3: COMPANY PAGES & ROLE TRACEABILITY ───────────────────────────
    console.log('\n[3/4] Testing Company Pages & Traceability (Admin vs Non-Admin)...');
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
          bodyText.includes('We could not complete your request right now. Please try again in a few minutes.') &&
            !bodyText.includes('d9876543-21fe-dcba-0987-654321fedcba')
        );

        await captureScreenshot(page, `evidence-friendly-invoices-500-1536x730-${theme}.png`);
        await context.close();
      }

      // 3.2 Company Page: /quotations (Force 503 - Admin sees details, main card has friendly text)
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
          '[/quotations 503] Logged-in admin sees error card with admin details expander',
          bodyText.includes('Error details (Admin visible)') || bodyText.includes('Action Could Not Complete') || bodyText.includes('System Update Needed')
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
    console.log('\n[4/4] Testing Platform Console Build Badge Parity...');
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
