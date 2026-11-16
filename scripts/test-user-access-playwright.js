const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

// Ensure DATABASE_URL is set
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

const prisma = new PrismaClient();
const API_URL = 'http://localhost:3333/api/v1';
const WEB_URL = 'http://localhost:5173';
const ARTIFACT_DIR = 'C:\\Users\\JNC R&D\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824';

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  details: [],
};

function record(name, pass, extra = '') {
  results.total++;
  if (pass) {
    results.passed++;
    console.log(`  [PASS] ${name}`);
  } else {
    results.failed++;
    console.error(`  [FAIL] ${name} ${extra}`);
  }
  results.details.push({ name, pass, extra });
}

async function loginInBrowser(page, companyCode, email, password) {
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle' });
  if (companyCode) {
    const haveCompanyBtn = page.locator('text="+ Have a company code?"');
    if (await haveCompanyBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await haveCompanyBtn.click();
      await page.fill('input#company-code-input', companyCode);
    }
  }
  await page.fill('input#company-identifier', email);
  await page.fill('input#company-password', password);
  await page.click('button[type="submit"]');
}

async function completePasswordResetIfPresent(page, tempPassword, newPassword) {
  try {
    const selector = 'input#current-temporary-password';
    await page.waitForSelector(selector, { timeout: 8000 });
    await page.fill('input#current-temporary-password', tempPassword);
    await page.fill('input#new-permanent-password', newPassword);
    await page.fill('input#confirm-permanent-password', newPassword);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(3000);
  } catch (e) {
    // Password reset was not required
  }
}

async function runAllTests() {
  console.log('========================================================================');
  console.log('PLAYWRIGHT USER ACCESS, TEMPLATES & DEAD-END REGRESSION TEST SUITE');
  console.log('========================================================================\n');

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    console.error('Failed to launch browser:', err);
    process.exit(1);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SUITE 1: Accounts Template E2E & Browser Landing Verification
  // ──────────────────────────────────────────────────────────────────────────
  const stamp1 = Date.now();
  const tenant1Id = `pw-acct-test-${stamp1}`;
  const tenant1Code = `ACCT${stamp1 % 10000}`;
  let context1;
  try {
    console.log('[TEST 1] Accounts Template (6 pages) -> Browser Login -> Password Reset -> Invoices Landing Page');
    const tenant = await prisma.tenant.create({
      data: {
        id: tenant1Id,
        code: tenant1Code,
        name: 'Accounts Test Tenant',
        slug: `acct-slug-${stamp1}`,
        status: 'active',
        maxUsers: 10,
      },
    });

    const adminHash = await bcrypt.hash('AdminPassword@123', 10);
    const adminUser = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        employeeCode: `${tenant1Code}-ADM-01`,
        name: 'Admin Boss',
        email: `admin-${stamp1}@test.local`,
        passwordHash: adminHash,
        role: 'tenant_admin',
        isActive: true,
        mustResetPassword: false,
      },
    });

    const adminLoginRes = await axios.post(`${API_URL}/auth/login`, {
      identifier: adminUser.email,
      password: 'AdminPassword@123',
      companyCode: tenant.code,
    });
    const adminToken = adminLoginRes.data.accessToken;

    // Create user with Accounts template via API (simulating form submission)
    const userEmail = `accounts-clerk-${stamp1}@test.local`;
    const createRes = await axios.post(
      `${API_URL}/users`,
      {
        name: 'Accounts Clerk',
        email: userEmail,
        phone: '9876543210',
        role: 'employee',
        pages: ['invoices', 'quotations', 'bills', 'ledger', 'orders', 'notifications'],
        homePage: 'invoices',
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    const tempPasswordText = createRes.data.tempPassword;
    const returnedUser = createRes.data.user;

    // Assert Form Safety: API returns saved landing page and effective pages in response
    record('Form Safety: API returns saved homePage', returnedUser.homePage === 'invoices');
    record('Form Safety: API returns 6 granted pages', Array.isArray(returnedUser.pages) && returnedUser.pages.length === 6);

    const userPage = await browser.newPage();
    await userPage.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle' });
    const haveCompanyBtn = userPage.locator('text="+ Have a company code?"');
    if (await haveCompanyBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await haveCompanyBtn.click();
      await userPage.fill('input#company-code-input', tenant1Code);
    }
    await userPage.fill('input#company-identifier', userEmail);
    await userPage.fill('input#company-password', tempPasswordText);
    await userPage.click('button[type="submit"]');

    // Wait for password reset screen
    await userPage.waitForSelector('input#current-temporary-password', { timeout: 10000 });
    await userPage.fill('input#current-temporary-password', tempPasswordText);
    await userPage.fill('input#new-permanent-password', 'SecurePermanentPass@987654321');
    await userPage.fill('input#confirm-permanent-password', 'SecurePermanentPass@987654321');
    await userPage.click('button:has-text("Update Password"), button[type="submit"]');

    // Wait for password update to complete and navigate to workspace
    await userPage.waitForTimeout(4000);

    // Check URL: user must land on /invoices
    const finalUrl = userPage.url();
    record('User lands on /invoices after password reset', finalUrl.includes('/invoices'), `Actual URL: ${finalUrl}`);

    // Verify NO "No Access" error banner is visible
    const bodyText = await userPage.innerText('body');
    const hasNoAccess = /No Access: You do not have access to Invoices/i.test(bodyText) || /No Access Granted/i.test(bodyText);
    record('User never lands on "No Access" screen', !hasNoAccess, `Found text: ${hasNoAccess ? 'No Access' : 'Clean'}`);

    // Verify visible navbar tabs include the Accounts pages
    const visibleTabs = await userPage.$$eval('#nav-tabs-container nav a', els => els.map(el => el.innerText.trim()));
    const hasQuotationsTab = visibleTabs.includes('Quotations');
    const hasOrdersTab = visibleTabs.includes('Orders');
    const hasInvoicesTab = visibleTabs.includes('Invoices');
    const hasLedgerTab = visibleTabs.includes('Ledger');
    const hasBillsTab = visibleTabs.includes('Bills');
    record('Visible navbar contains all 5 visible navigation tabs from Accounts template',
      hasQuotationsTab && hasOrdersTab && hasInvoicesTab && hasLedgerTab && hasBillsTab,
      `Visible tabs: ${JSON.stringify(visibleTabs)}`
    );

    // Capture screenshot of authenticated screen
    const screenshotPath = path.join(ARTIFACT_DIR, 'accounts-template-verified.png');
    await userPage.screenshot({ path: screenshotPath, fullPage: true });

    await userPage.close();

  } catch (err) {
    record('TEST 1 Accounts Template E2E', false, err.message);
  } finally {
    if (context1) await context1.close();
    // Cleanup tenant 1
    await prisma.userPageAccess.deleteMany({ where: { tenantId: tenant1Id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { tenantId: tenant1Id } }).catch(() => {});
    await prisma.tenant.deleteMany({ where: { id: tenant1Id } }).catch(() => {});
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SUITE 2: Standard Templates x Allowed Landing Pages Matrix
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 2] Standard Templates x Allowed Landing Pages Matrix');
  const stamp2 = Date.now();
  const tenant2Id = `pw-matrix-test-${stamp2}`;
  const tenant2Code = `MTX${stamp2 % 10000}`;
  try {
    const tenant = await prisma.tenant.create({
      data: {
        id: tenant2Id,
        code: tenant2Code,
        name: 'Matrix Test Tenant',
        slug: `matrix-slug-${stamp2}`,
        status: 'active',
        maxUsers: 50,
      },
    });

    const adminHash = await bcrypt.hash('AdminPassword@123', 10);
    const admin = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        employeeCode: `${tenant2Code}-ADM-01`,
        name: 'Matrix Admin',
        email: `admin-${stamp2}@matrix.test`,
        passwordHash: adminHash,
        role: 'tenant_admin',
        isActive: true,
        mustResetPassword: false,
      },
    });

    const adminLoginRes = await axios.post(`${API_URL}/auth/login`, {
      identifier: admin.email,
      password: 'AdminPassword@123',
      companyCode: tenant.code,
    });
    const adminToken = adminLoginRes.data.accessToken;

    const templatesToTest = [
      { key: 'inventory_only', name: 'Inventory Manager', pages: ['inventory', 'suppliers', 'bills', 'shipments', 'notifications'], landing: 'inventory', role: 'store_manager' },
      { key: 'sales', name: 'Sales Representative', pages: ['leads', 'lead_flow', 'quotations', 'orders', 'notifications'], landing: 'leads', role: 'employee' },
      { key: 'daily_activities', name: 'Project Worker', pages: ['daily_activities', 'notifications'], landing: 'daily_activities', role: 'developer' },
      { key: 'full_access', name: 'Full Operator', pages: ['dashboard', 'leads', 'quotations', 'orders', 'invoices'], landing: 'dashboard', role: 'admin' },
    ];

    for (const tpl of templatesToTest) {
      const uEmail = `matrix-${tpl.key}-${stamp2}@matrix.test`;
      const createRes = await axios.post(
        `${API_URL}/users`,
        {
          name: tpl.name,
          email: uEmail,
          phone: '9876543210',
          role: tpl.role,
          pages: tpl.pages,
          homePage: tpl.landing,
        },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      const tempPass = createRes.data.tempPassword;

      // Login via API to verify auth responses
      const loginRes = await axios.post(`${API_URL}/auth/login`, {
        identifier: uEmail,
        password: tempPass,
        companyCode: tenant.code,
      });

      const userToken = loginRes.data.accessToken;
      const redirectPath = loginRes.data.redirectPath;
      const meRes = await axios.get(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      const effectivePages = meRes.data.effectivePages || [];
      const homePage = meRes.data.homePage;

      const hasLanding = effectivePages.includes(tpl.landing);
      record(`Template ${tpl.key} grants landing page '${tpl.landing}' in effectivePages`, hasLanding);
      record(`Template ${tpl.key} preserves homePage '${tpl.landing}'`, homePage === tpl.landing);
      record(`Template ${tpl.key} resolves valid redirectPath`, redirectPath && redirectPath.length > 1, `redirectPath: ${redirectPath}`);
    }
  } catch (err) {
    record('TEST 2 Templates Matrix', false, err.message);
  } finally {
    // Cleanup tenant 2
    await prisma.userPageAccess.deleteMany({ where: { tenantId: tenant2Id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { tenantId: tenant2Id } }).catch(() => {});
    await prisma.tenant.deleteMany({ where: { id: tenant2Id } }).catch(() => {});
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SUITE 3: Team Only, Personal Only, and Both Precedence
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 3] Team Only, Personal Only, and Both (Precedence Rules)');
  const stamp3 = Date.now();
  const tenant3Id = `pw-team-test-${stamp3}`;
  const tenant3Code = `TEAM${stamp3 % 10000}`;
  try {
    const tenant = await prisma.tenant.create({
      data: {
        id: tenant3Id,
        code: tenant3Code,
        name: 'Team Fallback Tenant',
        slug: `team-slug-${stamp3}`,
        status: 'active',
        maxUsers: 10,
      },
    });

    const userPassHash = await bcrypt.hash('Password@123', 10);

    // Create a Team with allowedPages ['ledger', 'bills']
    const team = await prisma.team.create({
      data: {
        tenantId: tenant.id,
        name: 'Finance Desk Team',
        allowedPages: JSON.stringify(['ledger', 'bills']),
      },
    });

    // Case A: Team ONLY (no personal UserPageAccess record)
    const userTeamOnly = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        teamId: team.id,
        employeeCode: `${tenant3Code}-TO-01`,
        name: 'Team Only User',
        email: `teamonly-${stamp3}@team.test`,
        passwordHash: userPassHash,
        role: 'employee',
        isActive: true,
        mustResetPassword: false,
      },
    });

    // Case B: Personal ONLY (no team)
    const userPersonalOnly = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        teamId: null,
        employeeCode: `${tenant3Code}-PO-01`,
        name: 'Personal Only User',
        email: `personalonly-${stamp3}@team.test`,
        passwordHash: userPassHash,
        role: 'employee',
        isActive: true,
        mustResetPassword: false,
      },
    });
    await prisma.userPageAccess.create({
      data: {
        tenantId: tenant.id,
        userId: userPersonalOnly.id,
        pages: JSON.stringify({
          pages: ['invoices', 'quotations', 'bills', 'ledger', 'orders', 'notifications'],
          homePage: 'invoices',
        }),
      },
    });

    // Case C: BOTH (assigned to team, but also has personal UserPageAccess)
    const userBoth = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        teamId: team.id,
        employeeCode: `${tenant3Code}-BO-01`,
        name: 'Both User',
        email: `both-${stamp3}@team.test`,
        passwordHash: userPassHash,
        role: 'employee',
        isActive: true,
        mustResetPassword: false,
      },
    });
    await prisma.userPageAccess.create({
      data: {
        tenantId: tenant.id,
        userId: userBoth.id,
        pages: JSON.stringify({
          pages: ['invoices', 'quotations'],
          homePage: 'invoices',
        }),
      },
    });

    // Query /auth/login for Case A
    const loginA = await axios.post(`${API_URL}/auth/login`, {
      identifier: userTeamOnly.email,
      password: 'Password@123',
      companyCode: tenant.code,
    });
    record('Team only user receives team allowedPages',
      JSON.stringify(loginA.data.user.effectivePages.sort()) === JSON.stringify(['bills', 'ledger'])
    );

    // Query /auth/login for Case B
    const loginB = await axios.post(`${API_URL}/auth/login`, {
      identifier: userPersonalOnly.email,
      password: 'Password@123',
      companyCode: tenant.code,
    });
    record('Personal only user receives personal UserPageAccess pages',
      loginB.data.user.effectivePages.includes('invoices') && loginB.data.user.effectivePages.includes('quotations')
    );

    // Query /auth/login for Case C
    const loginC = await axios.post(`${API_URL}/auth/login`, {
      identifier: userBoth.email,
      password: 'Password@123',
      companyCode: tenant.code,
    });
    record('User with both team & personal: personal pages take precedence',
      JSON.stringify(loginC.data.user.effectivePages.sort()) === JSON.stringify(['invoices', 'quotations'])
    );

  } catch (err) {
    record('TEST 3 Team Fallback', false, err.message);
  } finally {
    // Cleanup tenant 3
    await prisma.userPageAccess.deleteMany({ where: { tenantId: tenant3Id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { tenantId: tenant3Id } }).catch(() => {});
    await prisma.team.deleteMany({ where: { tenantId: tenant3Id } }).catch(() => {});
    await prisma.tenant.deleteMany({ where: { id: tenant3Id } }).catch(() => {});
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SUITE 4: Dead-End Elimination & Landing Page Rejection
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 4] Dead-End Elimination & API Landing Page Validation');
  const stamp4 = Date.now();
  const tenant4Id = `pw-deadend-test-${stamp4}`;
  const tenant4Code = `DEAD${stamp4 % 10000}`;
  try {
    const tenant = await prisma.tenant.create({
      data: {
        id: tenant4Id,
        code: tenant4Code,
        name: 'DeadEnd Test Tenant',
        slug: `deadend-slug-${stamp4}`,
        status: 'active',
        maxUsers: 10,
      },
    });

    const adminHash = await bcrypt.hash('AdminPassword@123', 10);
    const admin = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        employeeCode: `${tenant4Code}-ADM-01`,
        name: 'DeadEnd Admin',
        email: `admin-${stamp4}@deadend.test`,
        passwordHash: adminHash,
        role: 'tenant_admin',
        isActive: true,
        mustResetPassword: false,
      },
    });

    const adminLoginRes = await axios.post(`${API_URL}/auth/login`, {
      identifier: admin.email,
      password: 'AdminPassword@123',
      companyCode: tenant.code,
    });
    const adminToken = adminLoginRes.data.accessToken;

    // Test: API rejects a landing page that is NOT in granted pages
    let rejectedWith400 = false;
    let errorMessage = '';
    try {
      await axios.post(
        `${API_URL}/users`,
        {
          name: 'Invalid Landing User',
          email: `invalid-landing-${stamp4}@deadend.test`,
          phone: '9876543210',
          role: 'employee',
          pages: ['leads', 'orders'],
          homePage: 'invoices', // NOT in ['leads', 'orders']
        },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
    } catch (err) {
      if (err.response && err.response.status === 400) {
        rejectedWith400 = true;
        errorMessage = err.response.data.message;
      }
    }
    record('API rejects landing page outside granted pages with HTTP 400', rejectedWith400, `Message: ${errorMessage}`);

    // Test: User with 0 pages redirects to root "/" clean screen
    const zeroUser = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        employeeCode: `${tenant4Code}-ZR-01`,
        name: 'Zero User',
        email: `zero-${stamp4}@deadend.test`,
        passwordHash: adminHash,
        role: 'employee',
        isActive: true,
        mustResetPassword: false,
      },
    });
    const zeroLogin = await axios.post(`${API_URL}/auth/login`, {
      identifier: zeroUser.email,
      password: 'AdminPassword@123',
      companyCode: tenant.code,
    });
    record('User with 0 pages receives redirectPath "/" (clean No Access screen)', zeroLogin.data.redirectPath === '/');

  } catch (err) {
    record('TEST 4 Dead-End Elimination', false, err.message);
  } finally {
    // Cleanup tenant 4
    await prisma.userPageAccess.deleteMany({ where: { tenantId: tenant4Id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { tenantId: tenant4Id } }).catch(() => {});
    await prisma.tenant.deleteMany({ where: { id: tenant4Id } }).catch(() => {});
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SUITE 5: Dynamic Permission Refresh via /auth/me
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 5] Dynamic Permission Refresh via /auth/me');
  const stamp5 = Date.now();
  const tenant5Id = `pw-dyn-test-${stamp5}`;
  const tenant5Code = `DYN${stamp5 % 10000}`;
  try {
    const tenant = await prisma.tenant.create({
      data: {
        id: tenant5Id,
        code: tenant5Code,
        name: 'Dynamic Refresh Tenant',
        slug: `dyn-slug-${stamp5}`,
        status: 'active',
        maxUsers: 10,
      },
    });

    const userPassHash = await bcrypt.hash('Password@123', 10);
    const dynUser = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        employeeCode: `${tenant5Code}-DYN-01`,
        name: 'Dynamic User',
        email: `dyn-${stamp5}@dyn.test`,
        passwordHash: userPassHash,
        role: 'employee',
        isActive: true,
        mustResetPassword: false,
      },
    });

    const userAccess = await prisma.userPageAccess.create({
      data: {
        tenantId: tenant.id,
        userId: dynUser.id,
        pages: JSON.stringify({
          pages: ['invoices'],
          homePage: 'invoices',
        }),
      },
    });

    // 1. User logs in
    const loginRes = await axios.post(`${API_URL}/auth/login`, {
      identifier: dynUser.email,
      password: 'Password@123',
      companyCode: tenant.code,
    });
    const userToken = loginRes.data.accessToken;

    const meBefore = await axios.get(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    record('Initial permissions contain only invoices',
      meBefore.data.effectivePages.includes('invoices') && !meBefore.data.effectivePages.includes('bills')
    );

    // 2. Admin edits permissions in the DB (simulating admin action)
    await prisma.userPageAccess.update({
      where: { id: userAccess.id },
      data: {
        pages: JSON.stringify({
          pages: ['invoices', 'bills', 'shipments'],
          homePage: 'invoices',
        }),
      },
    });

    // 3. User makes a request to /auth/me
    const meAfter = await axios.get(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    record('GET /auth/me returns fresh permissions without requiring a new login',
      meAfter.data.effectivePages.includes('bills') && meAfter.data.effectivePages.includes('shipments')
    );

  } catch (err) {
    record('TEST 5 Dynamic Permission Refresh', false, err.message);
  } finally {
    // Cleanup tenant 5
    await prisma.userPageAccess.deleteMany({ where: { tenantId: tenant5Id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { tenantId: tenant5Id } }).catch(() => {});
    await prisma.tenant.deleteMany({ where: { id: tenant5Id } }).catch(() => {});
  }

  if (browser) await browser.close();

  console.log('\n========================================================================');
  console.log(`TEST RESULTS SUMMARY: ${results.passed} PASSED / ${results.total} TOTAL (${results.failed} FAILED)`);
  console.log('========================================================================\n');

  if (results.failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
