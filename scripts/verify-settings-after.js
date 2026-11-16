/**
 * Verify settings save and error responses in browser (Playwright) after fix
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
const API_BASE_URL = 'http://localhost:3333/api/v1';

// Helper to generate valid PNG base64 of target byte size with magic bytes
function generateFakePngBase64(targetBytes) {
  const header = 'data:image/png;base64,';
  const magic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const rawBytes = Math.floor((targetBytes * 3) / 4);
  const buf = Buffer.alloc(rawBytes, 0x58); // fill with 'X'
  magic.copy(buf, 0); // copy real PNG magic bytes to start of buffer
  return header + buf.toString('base64');
}

async function main() {
  console.log('========================================================================');
  console.log('  VERIFY SETTINGS FIXES (AFTER FIX) WITH BROWSER & PLAYWRIGHT');
  console.log('========================================================================\n');

  // 1. Seed dedicated test tenant and user in DB
  const runId = Date.now().toString().slice(-4);
  const tenantCode = `SETFIX_${runId}`;
  const userEmail = `admin_setfix_${runId}@example.fake`;
  const plainPassword = 'Password@123';
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  const tenant = await prisma.tenant.create({
    data: {
      code: tenantCode,
      name: `Settings Fix Corp ${runId}`,
      slug: `settings-fix-${runId}`,
      status: 'active',
      isInternal: false,
      users: {
        create: [
          {
            email: userEmail,
            name: 'Fix Admin User',
            role: 'tenant_admin',
            employeeCode: `EMP-FIX-${runId}`,
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
    // 2. Perform UI login in browser
    console.log(`[AUTH] Navigating to ${FRONTEND_URL}/login...`);
    await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#company-identifier', { timeout: 10000 });

    // Accept cookies
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

    console.log(`[AUTH] Logging in with ${userEmail}...`);
    await page.fill('#company-identifier', userEmail);
    await page.fill('#company-password', plainPassword);
    await page.click('button[type="submit"]');

    // Wait until logged in
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const token = await page.evaluate(() => {
      return (window).getAccessToken ? (window).getAccessToken() : null;
    });

    if (!token) {
      throw new Error('Failed to retrieve in-memory access token after login');
    }
    console.log(`[AUTH] Successfully authenticated. In-memory access token present.\n`);

    // Helper inside browser context to run fetch and record results
    const executeInBrowser = async (testName, endpoint, method, body) => {
      return page.evaluate(
        async ({ testName, endpoint, method, body, API_BASE_URL }) => {
          const token = (window).getAccessToken ? (window).getAccessToken() : '';
          const url = `${API_BASE_URL}${endpoint}`;
          const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          };

          const result = {
            testName,
            status: null,
            statusText: '',
            corsHeaders: {},
            body: null,
            error: null,
          };

          try {
            const resp = await fetch(url, {
              method,
              headers,
              body: body ? JSON.stringify(body) : undefined,
            });

            result.status = resp.status;
            result.statusText = resp.statusText;
            for (const [key, value] of resp.headers.entries()) {
              if (key.toLowerCase().includes('cors') || key.toLowerCase().includes('access-control')) {
                result.corsHeaders[key] = value;
              }
            }
            try {
              result.body = await resp.json();
            } catch {
              result.body = await resp.text();
            }
          } catch (err) {
            result.status = 0;
            result.error = err.name + ': ' + err.message;
          }

          return result;
        },
        { testName, endpoint, method, body, API_BASE_URL }
      );
    };

    // ─── TEST (a): signatory save with NO images ───────────────────────────
    console.log('------------------------------------------------------------------------');
    console.log('TEST (a): signatory save with NO images');
    const resA = await executeInBrowser('a', '/invoices/settings/signatory', 'POST', {
      companyName: 'Acme Test Corp',
      signatoryName: 'John Doe',
      signatoryDesignation: 'Director',
      signatureImage: null,
      stampImage: null,
    });
    console.log(`HTTP Status : ${resA.status} ${resA.statusText}`);
    console.log(`CORS Headers:`, resA.corsHeaders);
    console.log(`Body        :`, JSON.stringify(resA.body));
    console.log(`Error       :`, resA.error || 'None');

    // ─── TEST (b): signatory save with 400 KB signature + 400 KB stamp ─────
    console.log('\n------------------------------------------------------------------------');
    console.log('TEST (b): signatory save with 400 KB signature and 400 KB stamp');
    const sig400k = generateFakePngBase64(400 * 1024);
    const stamp400k = generateFakePngBase64(400 * 1024);
    const resB = await executeInBrowser('b', '/invoices/settings/signatory', 'POST', {
      companyName: 'Acme Test Corp',
      signatoryName: 'John Doe',
      signatoryDesignation: 'Director',
      signatureImage: sig400k,
      stampImage: stamp400k,
    });
    console.log(`HTTP Status : ${resB.status} ${resB.statusText}`);
    console.log(`CORS Headers:`, resB.corsHeaders);
    console.log(`Body        :`, typeof resB.body === 'object' ? JSON.stringify(resB.body).slice(0, 200) + '...' : resB.body);
    console.log(`Error       :`, resB.error || 'None');

    // ─── TEST (c): signatory save with 1.9 MB images ───────────────────────
    console.log('\n------------------------------------------------------------------------');
    console.log('TEST (c): signatory save with 1.9 MB images');
    const sig19m = generateFakePngBase64(1.9 * 1024 * 1024);
    const stamp19m = generateFakePngBase64(1.9 * 1024 * 1024);
    const resC = await executeInBrowser('c', '/invoices/settings/signatory', 'POST', {
      companyName: 'Acme Test Corp',
      signatoryName: 'John Doe',
      signatoryDesignation: 'Director',
      signatureImage: sig19m,
      stampImage: stamp19m,
    });
    console.log(`HTTP Status : ${resC.status} ${resC.statusText}`);
    console.log(`CORS Headers:`, resC.corsHeaders);
    console.log(`Body        :`, typeof resC.body === 'object' ? JSON.stringify(resC.body).slice(0, 200) + '...' : resC.body);
    console.log(`Error       :`, resC.error || 'None');

    // ─── TEST (d): company profile save with valid fake PAN & GSTIN ─────────
    console.log('\n------------------------------------------------------------------------');
    console.log('TEST (d): company profile save with valid fake PAN and matching GSTIN');
    const validPan = 'ABCDE1234F';
    // 29ABCDE1234F1ZW is valid Karnataka GSTIN with matching PAN ABCDE1234F and checksum W
    const validGstin = '29ABCDE1234F1ZW';
    const resD = await executeInBrowser('d', '/settings/company-profile', 'POST', {
      name: 'Valid Corp Ltd',
      pan: validPan,
      gstin: validGstin,
    });
    console.log(`HTTP Status : ${resD.status} ${resD.statusText}`);
    console.log(`CORS Headers:`, resD.corsHeaders);
    console.log(`Body        :`, JSON.stringify(resD.body));
    console.log(`Error       :`, resD.error || 'None');

    // ─── TEST (e): company profile save with invalid fake PAN 'P0GPW1874N' ──
    console.log('\n------------------------------------------------------------------------');
    console.log("TEST (e): company profile save with invalid fake PAN 'P0GPW1874N'");
    const resE = await executeInBrowser('e', '/settings/company-profile', 'POST', {
      name: 'Invalid Pan Corp',
      pan: 'P0GPW1874N',
    });
    console.log(`HTTP Status : ${resE.status} ${resE.statusText}`);
    console.log(`CORS Headers:`, resE.corsHeaders);
    console.log(`Body        :`, JSON.stringify(resE.body));
    console.log(`Error       :`, resE.error || 'None');

    // ─── TEST (f): company profile save with oversized body (> 6 MB) ───────
    console.log('\n------------------------------------------------------------------------');
    console.log('TEST (f): company profile save with oversized body (> 6 MB)');
    const oversizedLogo = generateFakePngBase64(7 * 1024 * 1024);
    const resF = await executeInBrowser('f', '/settings/company-profile', 'POST', {
      name: 'Oversized Corp',
      logoUrl: oversizedLogo,
    });
    console.log(`HTTP Status : ${resF.status} ${resF.statusText}`);
    console.log(`CORS Headers:`, resF.corsHeaders);
    console.log(`Body        :`, JSON.stringify(resF.body));
    console.log(`Error       :`, resF.error || 'None');

  } finally {
    await browser.close();
    console.log('\n[CLEANUP] Cleaning up test tenant from DB...');
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
    console.log('[CLEANUP] Done.\n');
  }
}

main().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
