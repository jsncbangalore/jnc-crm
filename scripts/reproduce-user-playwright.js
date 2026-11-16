const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const path = require('path');

const prisma = new PrismaClient();
const API_URL = 'http://localhost:3333/api/v1';
const WEB_URL = 'http://localhost:5173';
const ARTIFACT_DIR = 'C:\\Users\\JNC R&D\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824';

async function runPlaywrightRepro() {
  console.log('========================================================================');
  console.log('PLAYWRIGHT END-TO-END REPRODUCTION OF USER ACCESS BUG');
  console.log('========================================================================\n');

  const stamp = Date.now();
  const testTenantCode = `PWREPRO${stamp % 10000}`;
  const testTenantId = `pw-repro-tenant-${stamp}`;

  let browser;
  try {
    // 1. Create fake tenant
    const tenant = await prisma.tenant.create({
      data: {
        id: testTenantId,
        code: testTenantCode,
        name: `Playwright Repro Tenant`,
        slug: `pw-repro-${stamp}`,
        status: 'active',
        maxUsers: 20,
      },
    });

    // 2. Create fake admin
    const adminHash = await bcrypt.hash('Admin@12345678', 10);
    const adminUser = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        employeeCode: `${testTenantCode}-ADM-001`,
        name: 'Admin User',
        email: `admin-${stamp}@pw.test`,
        passwordHash: adminHash,
        role: 'tenant_admin',
        isActive: true,
        mustResetPassword: false,
      },
    });

    // 3. Admin logs in to get token
    const adminLoginRes = await axios.post(`${API_URL}/auth/login`, {
      identifier: adminUser.email,
      password: 'Admin@12345678',
      companyCode: tenant.code,
    });
    const adminToken = adminLoginRes.data.accessToken;

    // 4. Create user via API with Accounts template
    // Accounts (6 pages): invoices, quotations, bills, ledger, orders, notifications
    const createRes = await axios.post(
      `${API_URL}/users`,
      {
        name: 'Accountant User',
        email: `acct-${stamp}@pw.test`,
        phone: '9876543210',
        role: 'employee',
        pages: ['invoices', 'quotations', 'bills', 'ledger', 'orders', 'notifications'],
        homePage: 'invoices',
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    const tempPassword = createRes.data.tempPassword;
    console.log(`[SETUP] Created user: acct-${stamp}@pw.test with temp password: ${tempPassword}`);

    // 5. Launch browser
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    // Navigate to login page
    console.log('[BROWSER] Navigating to login page...');
    await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle' });

    // Fill login form
    console.log('[BROWSER] Filling login form...');
    // Click have company code if present
    const haveCompanyBtn = page.locator('text="+ Have a company code?"');
    if (await haveCompanyBtn.isVisible()) {
      await haveCompanyBtn.click();
      await page.fill('input#company-code-input', tenant.code);
    }
    await page.fill('input#company-identifier', `acct-${stamp}@pw.test`);
    await page.fill('input#company-password', tempPassword);
    await page.click('button[type="submit"]');

    // Wait for force password reset page
    console.log('[BROWSER] Waiting for password reset screen...');
    await page.waitForSelector('input#current-temporary-password', { timeout: 10000 });
    console.log('[BROWSER] Reached password reset screen successfully.');

    // Complete password reset
    await page.fill('input#current-temporary-password', tempPassword);
    await page.fill('input#new-permanent-password', 'NewSecurePassword@1234');
    await page.fill('input#confirm-permanent-password', 'NewSecurePassword@1234');
    await page.click('button[type="submit"]');

    // Wait for navigation after password reset
    await page.waitForTimeout(3000);
    console.log('[BROWSER] Current URL after password reset:', page.url());

    // Inspect visible menu items
    const navItems = await page.$$eval('#nav-tabs-container nav a', (els) => els.map((el) => el.innerText.trim()));
    console.log('[BROWSER] Visible Navbar Tabs:', JSON.stringify(navItems));

    // Check if No Access banner is shown
    const noAccessText = await page.$eval('body', (el) => {
      const match = el.innerText.match(/No Access.*/i);
      return match ? match[0] : null;
    });
    console.log('[BROWSER] No Access on screen:', noAccessText);

    // Save screenshot
    const screenshotPath = path.join(ARTIFACT_DIR, 'repro-user-access-before.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`[BROWSER] Screenshot saved to: ${screenshotPath}`);

    // Also navigate directly to /invoices
    console.log('[BROWSER] Direct navigation to /invoices...');
    await page.goto(`${WEB_URL}/invoices`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const invoicesNoAccess = await page.$eval('body', (el) => {
      const match = el.innerText.match(/No Access.*/i);
      return match ? match[0] : null;
    });
    console.log('[BROWSER] On /invoices, screen shows:', invoicesNoAccess);

    const invoicesNavItems = await page.$$eval('#nav-tabs-container nav a', (els) => els.map((el) => el.innerText.trim()));
    console.log('[BROWSER] On /invoices, Visible Navbar Tabs:', JSON.stringify(invoicesNavItems));

  } catch (err) {
    console.error('Playwright repro error:', err);
  } finally {
    if (browser) await browser.close();
    // Cleanup
    console.log('\n[CLEANUP] Cleaning up throwaway tenant...');
    await prisma.userPageAccess.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.user.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.team.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.tenant.deleteMany({ where: { id: testTenantId } });
    await prisma.$disconnect();
    console.log('[CLEANUP] Done.');
  }
}

runPlaywrightRepro();
