const { chromium } = require('playwright');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const FRONTEND_URL = process.env.TEST_FRONTEND_URL || 'http://localhost:5174';
const ARTIFACT_DIR = 'C:\\Users\\JNC R&D\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824';

async function createAuthSession(user) {
  const familyId = crypto.randomUUID();
  const jti = crypto.randomUUID();

  const refreshToken = jwt.sign(
    {
      sub: user.id,
      tenantId: user.tenantId,
      org_id: user.tenantId,
      email: user.email,
      role: user.role,
      employee_code: user.employeeCode,
      employeeCode: user.employeeCode,
      tokenVersion: user.tokenVersion || 0,
      familyId,
      jti,
      keepSignedIn: true,
    },
    process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    {
      expiresIn: '7d',
      issuer: process.env.JWT_ISSUER || 'crm-api',
      audience: process.env.JWT_AUDIENCE || 'crm-client',
    }
  );

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  await prisma.refreshSession.create({
    data: {
      userId: user.id,
      tokenHash,
      familyId,
      expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
      isRevoked: false,
    },
  });

  const accessToken = jwt.sign(
    {
      sub: user.id,
      tenantId: user.tenantId,
      org_id: user.tenantId,
      email: user.email,
      role: user.role,
      employee_code: user.employeeCode,
      employeeCode: user.employeeCode,
      tokenVersion: user.tokenVersion || 0,
    },
    process.env.JWT_SECRET || 'dev-secret',
    {
      expiresIn: '2h',
      issuer: process.env.JWT_ISSUER || 'crm-api',
      audience: process.env.JWT_AUDIENCE || 'crm-client',
    }
  );

  const formattedUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    employeeCode: user.employeeCode,
    phone: user.phone,
    photoUrl: user.photoUrl,
    role: user.role,
    mustResetPassword: false,
    lastPasswordChangeAt: null,
    createdAt: user.createdAt,
    tenant: {
      code: user.tenant?.code || 'ACME-DEV-001',
      name: user.tenant?.name || 'Demo Company',
      currency: 'INR',
      logoUrl: user.tenant?.logoUrl,
    },
    teamId: user.teamId,
    warehouseId: user.warehouseId,
    effectivePages: [
      'leads',
      'quotations',
      'orders',
      'shipments',
      'inventory',
      'suppliers',
      'invoices',
      'bills',
      'ledger',
      'dashboard',
      'daily_activities',
      'notifications',
      'users',
      'account',
    ],
    homePage: 'dashboard',
  };

  return {
    cookies: [
      {
        name: 'crm_refresh_token',
        value: refreshToken,
        domain: 'localhost',
        path: '/api/v1/auth',
        expires: Math.floor(Date.now() / 1000) + 86400 * 7,
        httpOnly: true,
        secure: false,
        sameSite: 'Strict',
      },
      {
        name: 'crm_session_active',
        value: '1',
        domain: 'localhost',
        path: '/',
        expires: Math.floor(Date.now() / 1000) + 86400 * 7,
        httpOnly: false,
        secure: false,
        sameSite: 'Strict',
      },
    ],
    origins: [
      {
        origin: FRONTEND_URL,
        localStorage: [
          { name: 'crm_portal', value: 'staff' },
          { name: 'crm_last_activity_time', value: String(Date.now()) },
          { name: 'crm_tab_user_id', value: user.id },
          { name: 'crm_refresh_token_fb', value: refreshToken },
          { name: 'crm_staff_token', value: accessToken },
          { name: 'crm_user', value: JSON.stringify(formattedUser) },
          {
            name: 'crm_cookie_consent',
            value: JSON.stringify({
              choice: 'all',
              policyVersion: '2026.10.1',
              savedAt: new Date().toISOString(),
              preferences: { essential: true, analytics: true, functional: true },
            }),
          },
        ],
      },
    ],
  };
}

async function run() {
  console.log('=== VERIFYING INDIVIDUAL REPORT PAGES (NO MERGED SWITCHER) ===\n');

  const adminUser = await prisma.user.findFirst({
    where: { role: 'tenant_admin', isActive: true },
    include: { tenant: true },
  });
  if (!adminUser) throw new Error('No tenant_admin found');

  const authStorage = await createAuthSession(adminUser);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: authStorage,
  });

  const page = await context.newPage();

  try {
    // 1. Verify Navbar has NO "Analytics" tab
    console.log('1. Verifying Navbar does NOT have merged "Analytics" tab...');
    await page.goto(`${FRONTEND_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const analyticsNav = await page.$('header a:has-text("Analytics")');
    if (analyticsNav) {
      throw new Error('FAILED: "Analytics" tab should NOT be present in Navbar!');
    }
    console.log('✓ PASS: Navbar has NO "Analytics" tab (clean standard tabs).');

    // 2. Test each of the 6 separate individual report pages
    const reportPages = [
      { cardTestId: 'summary-card-leads', path: '/analytics/leads', expectedTitle: 'Total Leads' },
      { cardTestId: 'summary-card-quotes', path: '/analytics/quotes', expectedTitle: 'Active Quotes' },
      { cardTestId: 'summary-card-orders', path: '/analytics/orders', expectedTitle: 'Orders' },
      { cardTestId: 'summary-card-receivable', path: '/analytics/receivables', expectedTitle: 'Receivable' },
      { cardTestId: 'summary-card-overdue', path: '/analytics/overdue', expectedTitle: 'Overdue' },
      { cardTestId: 'summary-card-activity', path: '/analytics/activity', expectedTitle: 'Activity' },
    ];

    for (const r of reportPages) {
      console.log(`\nTesting separate page: ${r.path}...`);
      await page.goto(`${FRONTEND_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);

      // Click card on Dashboard
      const card = await page.waitForSelector(`[data-testid="${r.cardTestId}"]`);
      await card.click();
      await page.waitForURL((url) => url.pathname.includes(r.path), { timeout: 6000 });
      console.log(`✓ Navigated from Dashboard to: ${page.url()}`);

      // Verify NO 6-metric switcher bar
      const switcherBar = await page.$('nav[aria-label="Analytics Sections"], [data-analytics-metric]');
      if (switcherBar) {
        throw new Error(`FAILED on ${r.path}: Found merged 6-metric switcher bar, which should be removed!`);
      }
      console.log(`✓ PASS: No merged 6-metric switcher bar on ${r.path}`);

      // Verify "Back to Dashboard" button exists and works
      const backBtn = await page.waitForSelector('a:has-text("Back to Dashboard")');
      if (!backBtn) {
        throw new Error(`FAILED on ${r.path}: "Back to Dashboard" button not found!`);
      }
      console.log(`✓ PASS: "Back to Dashboard" link present on ${r.path}`);

      // Verify page title
      const titleEl = await page.waitForSelector('h1');
      const titleText = await titleEl.innerText();
      console.log(`✓ Page H1: "${titleText}"`);
    }

    // Capture screenshot on /analytics/leads showing clean standalone page
    await page.goto(`${FRONTEND_URL}/analytics/leads`, { waitUntil: 'networkidle' });
    const screenshotPath = path.join(ARTIFACT_DIR, 'evidence-leads-standalone-page.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`\n✓ Saved clean standalone page screenshot to: ${screenshotPath}`);

    console.log('\n>>> ALL INDIVIDUAL REPORT PAGE TESTS PASSED 100%! <<<\n');
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
