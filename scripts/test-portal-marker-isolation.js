/* --- TEST PORTAL MARKER ISOLATION SUITE ---
 * Verifies:
 * 1. crm_portal is strictly per-tab (sessionStorage only) and NEVER in localStorage
 * 2. Platform tab open -> company login in another tab -> reload platform tab -> stays on platform console
 * 3. Company tab open -> platform login in another tab -> reload company tab -> stays on company workspace
 * 4. Reload company tab while platform tab is signed in
 * 5. Neither tab leaks cookies or corrupts the other's portal marker
 */

const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { chromium } = require('playwright');
const { PrismaClient } = require(path.join(__dirname, '../node_modules/@prisma/client'));

// Ensure DATABASE_URL is set
const envFile = path.join(__dirname, '../apps/api/.env');
if (fs.existsSync(envFile)) {
  const content = fs.readFileSync(envFile, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const k = trimmed.substring(0, idx).trim();
        let v = trimmed.substring(idx + 1).trim();
        v = v.replace(/^["']|["']$/g, '');
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
}

const prisma = new PrismaClient();
const API_BASE = process.env.API_URL || 'http://localhost:3333/api/v1';
const WEB_BASE = process.env.WEB_URL || 'http://localhost:5173';

const createdTenantIds = [];
const createdUserIds = [];

async function cleanup() {
  try {
    if (createdUserIds.length > 0) {
      await prisma.userPageAccess.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {});
    }
    if (createdTenantIds.length > 0) {
      await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } }).catch(() => {});
    }
  } catch (e) {
    console.warn('Cleanup warning:', e.message);
  }
}

async function createTestTenantAndUser(label, role = 'tenant_admin') {
  const rand = Math.random().toString(36).substring(2, 8);
  const tenantId = `tenant-portal-${label.toLowerCase()}-${rand}`;
  const userId = `user-portal-${label.toLowerCase()}-${rand}`;
  const email = `${label.toLowerCase()}-${rand}@testcrm.internal`;
  const password = `TestPass123!${rand}`;
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
  console.log('TEST PORTAL MARKER PER-TAB ISOLATION (PLAYWRIGHT)');
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
    const platUser = await createTestTenantAndUser('Portal_Plat', 'platform_super_admin');
    const compUser = await createTestTenantAndUser('Portal_Comp', 'tenant_admin');

    const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
    const tabPlatform = await context.newPage();
    const tabCompany = await context.newPage();

    // 1. Open Platform Tab and login
    console.log('[STEP 1] Login to Platform Admin in Tab 1');
    await performLogin(tabPlatform, platUser.email, platUser.password, true);
    await tabPlatform.goto(`${WEB_BASE}/platform/companies`, { waitUntil: 'domcontentloaded' });
    await tabPlatform.waitForTimeout(1000);

    const platPortal = await tabPlatform.evaluate(() => sessionStorage.getItem('crm_portal'));
    const platLocalPortal = await tabPlatform.evaluate(() => localStorage.getItem('crm_portal'));
    assert(platPortal === 'platform', 'Platform tab has sessionStorage crm_portal === "platform"');
    assert(platLocalPortal === null, 'Platform tab has localStorage crm_portal === null (never in localStorage)');
    assert(tabPlatform.url().includes('/platform/companies'), 'Platform tab is on /platform/companies');

    // 2. Open Company Tab and login
    console.log('\n[STEP 2] Login to Company Portal in Tab 2');
    await performLogin(tabCompany, compUser.email, compUser.password, false);
    await tabCompany.waitForTimeout(1000);

    const compPortal = await tabCompany.evaluate(() => sessionStorage.getItem('crm_portal'));
    const compLocalPortal = await tabCompany.evaluate(() => localStorage.getItem('crm_portal'));
    assert(compPortal === 'staff', 'Company tab has sessionStorage crm_portal === "staff"');
    assert(compLocalPortal === null, 'Company tab has localStorage crm_portal === null (never in localStorage)');
    assert(!tabCompany.url().includes('/platform'), 'Company tab is in company workspace');

    // 3. Reload Platform Tab while Company Tab is signed in
    console.log('\n[STEP 3] Reload Platform Tab while Company is active');
    await tabPlatform.bringToFront();
    await tabPlatform.reload({ waitUntil: 'domcontentloaded' });
    await tabPlatform.waitForTimeout(1500);

    const platReloadUrl = tabPlatform.url();
    const platReloadPortal = await tabPlatform.evaluate(() => sessionStorage.getItem('crm_portal'));
    const platReloadLocal = await tabPlatform.evaluate(() => localStorage.getItem('crm_portal'));
    assert(platReloadUrl.includes('/platform/companies'), `Platform tab stays on platform console after reload (actual: ${platReloadUrl})`);
    assert(platReloadPortal === 'platform', 'Platform tab retained crm_portal === "platform" in sessionStorage');
    assert(platReloadLocal === null, 'Platform tab localStorage crm_portal is still strictly null');

    // 4. Reload Company Tab while Platform Tab is signed in
    console.log('\n[STEP 4] Reload Company Tab while Platform is active');
    await tabCompany.bringToFront();
    await tabCompany.reload({ waitUntil: 'domcontentloaded' });
    await tabCompany.waitForTimeout(1500);

    const compReloadUrl = tabCompany.url();
    const compReloadPortal = await tabCompany.evaluate(() => sessionStorage.getItem('crm_portal'));
    const compReloadLocal = await tabCompany.evaluate(() => localStorage.getItem('crm_portal'));
    assert(!compReloadUrl.includes('/platform'), `Company tab stays in company workspace after reload (actual: ${compReloadUrl})`);
    assert(compReloadPortal === 'staff', 'Company tab retained crm_portal === "staff" in sessionStorage');
    assert(compReloadLocal === null, 'Company tab localStorage crm_portal is still strictly null');

    // 5. Reverse check: Reload Company Tab first, then Platform Tab
    console.log('\n[STEP 5] Reverse reload sequence');
    await tabCompany.reload({ waitUntil: 'domcontentloaded' });
    await tabCompany.waitForTimeout(1000);
    assert(!tabCompany.url().includes('/platform'), 'Company tab remains on company portal');

    await tabPlatform.bringToFront();
    await tabPlatform.reload({ waitUntil: 'domcontentloaded' });
    await tabPlatform.waitForTimeout(1000);
    assert(tabPlatform.url().includes('/platform/companies'), 'Platform tab remains on platform console');

    // 6. Verify zero blocking modals in either tab
    const platModal = await tabPlatform.evaluate(() => document.body.innerText.includes('Session Changed') && document.body.innerText.includes('Reload'));
    const compModal = await tabCompany.evaluate(() => document.body.innerText.includes('Session Changed') && document.body.innerText.includes('Reload'));
    assert(!platModal, 'Platform tab showed zero blocking modals');
    assert(!compModal, 'Company tab showed zero blocking modals');

    await context.close();

    console.log(`\n================================================================`);
    console.log(`PORTAL MARKER ISOLATION RESULTS: ${passedTests}/${totalTests} PASSED`);
    console.log(`================================================================`);
    return { passedTests, totalTests };
  } finally {
    await browser.close();
    await cleanup();
  }
}

if (require.main === module) {
  main()
    .then(({ passedTests, totalTests }) => {
      process.exit(passedTests === totalTests ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal test error:', err);
      process.exit(1);
    });
}

module.exports = { main };
