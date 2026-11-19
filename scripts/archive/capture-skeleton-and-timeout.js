/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const path = require('path');
const { chromium } = require('playwright');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const WEB_BASE = 'http://localhost:5173';
const ARTIFACT_DIR = path.resolve(
  process.env.APPDATA || 'C:\\Users\\JNC R&D',
  '..\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824'
);

const COMPANY_ADMIN_EMAIL = 'company-admin-test@example.internal';
const TEST_PASSWORD = 'Password@123456';
const TEST_TENANT_CODE = 'TEST-CORP-001';

async function main() {
  console.log('[SKELETON & TIMEOUT] Preparing database...');
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, salt);

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

  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { name: '1536x730', width: 1536, height: 730 },
    { name: '390px', width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    console.log(`\n--- Capturing Skeleton and Timeout at ${vp.name} ---`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
    });
    const page = await context.newPage();

    // 1. Intercept setup call and delay it by 15s to capture skeleton and timeout
    await page.route('**/auth/2fa/setup', async (route) => {
      console.log(`  [INTERCEPT] Holding setup response for 12s...`);
      await new Promise((r) => setTimeout(r, 12000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUrl: 'otpauth://totp/CRM:admin@example.internal?secret=JBSWY3DPEHPK3PXP&issuer=CRM',
        }),
      });
    });

    await page.goto(`${WEB_BASE}/login`, { waitUntil: 'networkidle' });
    await page.fill('#company-identifier', COMPANY_ADMIN_EMAIL);
    await page.fill('#company-password', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for skeleton loader to be visible
    console.log('  Waiting for QR skeleton loader...');
    const skeleton = page.locator('[data-testid="qr-skeleton"]');
    await skeleton.waitFor({ state: 'visible', timeout: 5000 });

    const skeletonPath = path.join(ARTIFACT_DIR, `evidence-qr-skeleton-${vp.name}.png`);
    await page.screenshot({ path: skeletonPath, fullPage: false });
    console.log(`  -> Saved QR skeleton screenshot: ${skeletonPath}`);

    // Wait for 10-second timeout error state to appear
    console.log('  Waiting for 10s timeout error state...');
    await page.waitForSelector('text=We couldn\'t generate your setup key in time. Please check your network connection.', {
      timeout: 15000,
    });
    await page.waitForSelector('button:has-text("Try again")');
    await page.waitForSelector('button:has-text("Sign in again")');

    const timeoutPath = path.join(ARTIFACT_DIR, `evidence-setup-timeout-${vp.name}.png`);
    await page.screenshot({ path: timeoutPath, fullPage: false });
    console.log(`  -> Saved timeout screenshot: ${timeoutPath}`);

    await context.close();
  }

  await browser.close();
  await prisma.$disconnect();
  console.log('[SKELETON & TIMEOUT] Finished capturing states.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
