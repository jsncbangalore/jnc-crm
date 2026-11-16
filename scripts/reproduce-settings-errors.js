/**
 * REPRODUCE SETTINGS SAVE ERRORS (Step 1)
 * Tests requests (a) through (f) using Playwright in a real browser context.
 * Records: HTTP status, response body, CORS headers, and what the browser shows.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Load environment variables for DB
if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(process.cwd(), 'apps/api/.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        process.env[match[1]] = value;
      }
    }
  }
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const FRONTEND_URL = 'http://localhost:5173';

function makeFakePngDataUrl(byteSize) {
  const buf = Buffer.alloc(byteSize);
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4e; buf[3] = 0x47;
  buf[4] = 0x0d; buf[5] = 0x0a; buf[6] = 0x1a; buf[7] = 0x0a;
  return `data:image/png;base64,${buf.toString('base64')}`;
}

async function main() {
  console.log('========================================================================');
  console.log('  STEP 1: REPRODUCE SETTINGS SAVE ERRORS IN BROWSER');
  console.log('========================================================================\n');

  const runId = Date.now().toString().slice(-4);
  const tenantCode = `TEST_REPRO_${runId}`;
  const userEmail = `repro_admin_${runId}@example.fake`;
  const plainPassword = 'Password@123';
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  // 1. Create temporary tenant and admin user
  const tenant = await prisma.tenant.create({
    data: {
      code: tenantCode,
      name: `Repro Settings Test Corp ${runId}`,
      slug: `repro-settings-${runId}`,
      status: 'active',
      isInternal: false,
      users: {
        create: [
          {
            email: userEmail,
            name: 'Repro Admin User',
            role: 'tenant_admin',
            employeeCode: `EMP-REPRO-${runId}`,
            passwordHash,
          },
        ],
      },
    },
    include: { users: true },
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    // 2. Log in through the UI
    console.log(`[AUTH] Navigating to ${FRONTEND_URL}/login...`);
    await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#company-identifier', { timeout: 10000 });

    // Set cookie consent
    await page.evaluate(() => {
      localStorage.setItem(
        'crm_cookie_consent',
        JSON.stringify({
          choice: 'all',
          preferences: true,
          policyVersion: '2026.10.1',
          savedAt: new Date().toISOString(),
        })
      );
    });

    await page.fill('#company-identifier', userEmail);
    await page.fill('#company-password', plainPassword);
    await page.click('button[type="submit"]');

    // Wait for navigation past login
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    console.log('[AUTH] Successfully authenticated into dashboard.\n');

    // Helper to execute and observe fetch from within page context
    async function executeBrowserRequest(name, route, method, payload) {
      console.log(`------------------------------------------------------------------------`);
      console.log(`CASE: ${name}`);
      console.log(`Target: ${method} ${route}`);
      const payloadSummary = typeof payload === 'string'
        ? `Payload string length: ${payload.length}`
        : `Payload keys: ${Object.keys(payload || {}).join(', ')} (Approx size: ${Math.round(JSON.stringify(payload).length / 1024)} KB)`;
      console.log(`Payload details: ${payloadSummary}`);

      let networkResponse = null;
      let networkFailed = null;

      const responseListener = (res) => {
        if (res.url().includes(route)) {
          networkResponse = res;
        }
      };
      const failedListener = (req) => {
        if (req.url().includes(route)) {
          networkFailed = req.failure();
        }
      };

      page.on('response', responseListener);
      page.on('requestfailed', failedListener);

      const browserResult = await page.evaluate(async ({ route, method, payload }) => {
        const token = (typeof window.getAccessToken === 'function')
          ? window.getAccessToken()
          : (sessionStorage.getItem('crm_access_token') || localStorage.getItem('crm_access_token') || '');
        try {
          const res = await window.fetch(`http://localhost:3333/api/v1${route}`, {
            method,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': token ? `Bearer ${token}` : '',
              'Origin': window.location.origin,
            },
            body: typeof payload === 'string' ? payload : JSON.stringify(payload),
          });

          const corsHeaders = {
            'access-control-allow-origin': res.headers.get('access-control-allow-origin'),
            'access-control-allow-credentials': res.headers.get('access-control-allow-credentials'),
            'access-control-allow-methods': res.headers.get('access-control-allow-methods'),
          };

          let bodyText = '';
          try {
            bodyText = await res.text();
          } catch (e) {
            bodyText = `<Failed to read body: ${e.message}>`;
          }

          return {
            status: res.status,
            statusText: res.statusText,
            corsHeaders,
            body: bodyText,
            browserShows: `HTTP ${res.status} ${res.statusText}`,
            error: null,
          };
        } catch (fetchErr) {
          return {
            status: 0,
            statusText: 'FETCH_ERROR',
            corsHeaders: null,
            body: null,
            browserShows: `Browser threw ${fetchErr.name}: ${fetchErr.message}`,
            error: fetchErr.message,
          };
        }
      }, { route, method, payload });

      page.off('response', responseListener);
      page.off('requestfailed', failedListener);

      console.log(`HTTP Status:    ${browserResult.status} ${browserResult.statusText}`);
      console.log(`CORS Headers:   ${JSON.stringify(browserResult.corsHeaders || {})}`);
      console.log(`Response Body:  ${browserResult.body ? (browserResult.body.slice(0, 300) + (browserResult.body.length > 300 ? '... [truncated]' : '')) : '(None - blocked by browser)'}`);
      console.log(`Browser Shows:  ${browserResult.browserShows}`);
      if (networkFailed) {
        console.log(`Network Failed: ${networkFailed.errorText}`);
      }
      console.log('');
      return browserResult;
    }

    // ─── a) Signatory save with NO images ─────────────────────────────────────────
    await executeBrowserRequest(
      'a) Signatory save with NO images',
      '/invoices/settings/signatory',
      'POST',
      {
        companyName: 'Repro Clean Corp',
        signatoryName: 'John Doe',
        signatoryDesignation: 'Managing Director',
        signatureImage: null,
        stampImage: null,
      }
    );

    // ─── b) Signatory save with a 400 KB signature and a 400 KB stamp ──────────
    const sig400kb = makeFakePngDataUrl(400 * 1024);
    const stamp400kb = makeFakePngDataUrl(400 * 1024);
    await executeBrowserRequest(
      'b) Signatory save with a 400 KB signature and a 400 KB stamp',
      '/invoices/settings/signatory',
      'POST',
      {
        companyName: 'Repro 400KB Corp',
        signatoryName: 'Jane Smith',
        signatoryDesignation: 'Director',
        signatureImage: sig400kb,
        stampImage: stamp400kb,
      }
    );

    // ─── c) Signatory save with 1.9 MB images (largest UI allows) ────────────────
    const sig1900kb = makeFakePngDataUrl(1900 * 1024);
    const stamp1900kb = makeFakePngDataUrl(1900 * 1024);
    await executeBrowserRequest(
      'c) Signatory save with 1.9 MB images (largest UI allows)',
      '/invoices/settings/signatory',
      'POST',
      {
        companyName: 'Repro 1.9MB Corp',
        signatoryName: 'Bob Vance',
        signatoryDesignation: 'CEO',
        signatureImage: sig1900kb,
        stampImage: stamp1900kb,
      }
    );

    // ─── d) Company profile save with valid fake PAN and GSTIN ───────────────────
    await executeBrowserRequest(
      'd) Company profile save with valid fake PAN and GSTIN',
      '/settings/company-profile',
      'POST',
      {
        name: 'Valid Tax Profile Corp',
        gstin: '29ABCDE1234F1ZW',
        pan: 'ABCDE1234F',
        phone: '9876543210',
        email: 'info@validtax.fake',
        address: '123 MG Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560001',
        bankName: 'HDFC Bank',
        bankAccountNumber: '123456789012',
        bankIfsc: 'HDFC0001234',
        bankBranch: 'Indiranagar',
      }
    );

    // ─── e) Company profile save with invalid fake PAN 'P0GPW1874N' ──────────────
    await executeBrowserRequest(
      "e) Company profile save with invalid fake PAN 'P0GPW1874N'",
      '/settings/company-profile',
      'POST',
      {
        name: 'Invalid PAN Corp',
        pan: 'P0GPW1874N',
      }
    );

    // ─── f) Company profile save with an oversized body ──────────────────────────
    const oversizedLogo = makeFakePngDataUrl(1500 * 1024);
    await executeBrowserRequest(
      'f) Company profile save with an oversized body',
      '/settings/company-profile',
      'POST',
      {
        name: 'Oversized Body Corp',
        logoUrl: oversizedLogo,
        signatureUrl: oversizedLogo,
      }
    );

  } finally {
    await browser.close();

    // 3. Cleanup created temporary tenant
    console.log('[CLEANUP] Removing test tenant and related data...');
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
    console.log('[CLEANUP] Done.');
  }

  console.log('\n========================================================================');
  console.log('  REPRODUCTION SUITE COMPLETE');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('Reproduction run failed:', err);
  process.exit(1);
});
