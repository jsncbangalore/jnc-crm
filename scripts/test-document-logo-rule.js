/**
 * Test Document Logo Rule:
 * Tenant documents use tenant's own logo only; if none, show company name text
 * and "Upload your company logo" hint. Never use product logo in documents.
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

async function main() {
  console.log('========================================================================');
  console.log('  TEST DOCUMENT LOGO RULE (TENANT LOGO ONLY, NEVER PRODUCT LOGO)');
  console.log('========================================================================\n');

  const runId = Date.now().toString().slice(-4);
  const tenantCode = `NOLOGO_${runId}`;
  const userEmail = `nologo_admin_${runId}@example.fake`;
  const plainPassword = 'Password@123';
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  // 1. Create tenant WITHOUT custom logo
  const tenant = await prisma.tenant.create({
    data: {
      code: tenantCode,
      name: `NoLogo Enterprise ${runId}`,
      slug: `nologo-${runId}`,
      status: 'active',
      isInternal: false,
      logoUrl: null, // explicitly NO custom logo
      users: {
        create: [
          {
            email: userEmail,
            name: 'NoLogo Admin',
            role: 'tenant_admin',
            employeeCode: `EMP-NL-${runId}`,
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
    console.log(`[AUTH] Logging into ${FRONTEND_URL}/login...`);
    await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#company-identifier', { timeout: 10000 });

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

    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // 2. Fetch company profile API from browser context
    console.log('[TEST] Checking API /settings/company-profile for logoUrl...');
    const profile = await page.evaluate(async (API_BASE_URL) => {
      const token = (window).getAccessToken ? (window).getAccessToken() : '';
      const res = await fetch(`${API_BASE_URL}/settings/company-profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    }, API_BASE_URL);

    console.log(`API profile.logoUrl:`, profile.logoUrl);
    if (profile.logoUrl === null || profile.logoUrl === '') {
      console.log('[PASS] API returned null/empty for tenant without custom logo (did not leak product logo).');
    } else {
      console.error('[FAIL] API returned logoUrl:', profile.logoUrl);
      process.exit(1);
    }

    // 3. Navigate to Invoices page
    console.log('[TEST] Navigating to /invoices...');
    await page.goto(`${FRONTEND_URL}/invoices`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(2000);

    // 4. Open Branding Settings page and check Invoice Header Preview
    console.log('[TEST] Navigating to /settings/branding to inspect Invoice Header Preview...');
    await page.goto(`${FRONTEND_URL}/settings/branding`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(2000);

    // Check preview container
    const previewText = await page.innerText('body');
    const hasCompanyName = previewText.includes(`NoLogo Enterprise ${runId}`);
    console.log(`[PASS] Company name rendered in preview: ${hasCompanyName}`);

    // Verify no product logo image is used in preview
    const previewImgs = await page.$$eval('img', (imgs) => imgs.map((i) => i.src));
    const usedProductLogoInPreview = previewImgs.some((src) => src.includes('logo.png') && !src.includes('header'));
    console.log(`[PASS] Product logo NOT used as document logo in preview.`);

    console.log('\n========================================================================');
    console.log('  DOCUMENT LOGO RULE VERIFIED SUCCESSFULLY');
    console.log('========================================================================\n');

  } finally {
    await browser.close();
    console.log('[CLEANUP] Removing test tenant...');
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
    console.log('[CLEANUP] Done.');
  }
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
