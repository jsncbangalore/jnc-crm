const { chromium } = require('playwright');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const FRONTEND_URL = process.env.TEST_FRONTEND_URL || 'http://localhost:5174';

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
      'purchase_bills',
      'ledger',
      'dashboard',
      'daily_activities',
      'notifications',
      'users',
      'account',
    ],
    homePage: 'leads',
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
  console.log('=== VERIFYING COOKIE LINKS REMOVAL AND 3 ALLOWED LOCATIONS ===');
  const browser = await chromium.launch({ headless: true });

  try {
    // 1. Verify Public Pages contain the cookie links in footer
    const publicPages = ['/landing', '/login', '/forgot-password'];
    const pubPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    for (const p of publicPages) {
      console.log(`Checking public page: ${p}`);
      await pubPage.goto(`${FRONTEND_URL}${p}`, { waitUntil: 'domcontentloaded' });
      const cookieSettings = await pubPage.waitForSelector('[data-testid="footer-cookie-settings"]', { timeout: 5000 });
      const cookieDetails = await pubPage.waitForSelector('[data-testid="footer-cookie-details"]', { timeout: 5000 });
      if (!cookieSettings || !cookieDetails) {
        throw new Error(`Expected footer cookie links on public page ${p}`);
      }
      console.log(`✓ Public page ${p} correctly retains footer cookie links.`);
    }
    await pubPage.close();

    // 2. Verify Signed-in Pages do NOT contain cookie links in footer
    const user = await prisma.user.findFirst({
      where: { role: 'tenant_admin', isActive: true },
      include: { tenant: true },
    });
    if (!user) throw new Error('No tenant_admin user found');

    const storageState = await createAuthSession(user);
    const authContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      storageState,
    });
    const authPage = await authContext.newPage();

    const signedInPages = ['/dashboard', '/leads', '/quotations', '/invoices'];
    for (const p of signedInPages) {
      console.log(`Checking signed-in page: ${p}`);
      await authPage.goto(`${FRONTEND_URL}${p}`, { waitUntil: 'domcontentloaded' });
      await authPage.waitForTimeout(800);

      // Check footer has copyright
      const copyright = await authPage.waitForSelector('[data-testid="footer-copyright-text"]', { timeout: 5000 });
      if (!copyright) throw new Error(`Missing copyright on signed-in page ${p}`);

      // Assert NO cookie links in footer
      const cookieSettingsCount = await authPage.locator('footer [data-testid="footer-cookie-settings"]').count();
      const cookieDetailsCount = await authPage.locator('footer [data-testid="footer-cookie-details"]').count();
      if (cookieSettingsCount > 0 || cookieDetailsCount > 0) {
        throw new Error(`Signed-in page ${p} STILL contains cookie links in footer! (settings: ${cookieSettingsCount}, details: ${cookieDetailsCount})`);
      }
      console.log(`✓ Signed-in page ${p} clean: footer has copyright but ZERO cookie links.`);
    }

    // 3. Verify Allowed Location 2: Avatar Menu has 'Privacy and cookies'
    console.log('Checking Allowed Location 2: Avatar dropdown menu...');
    await authPage.goto(`${FRONTEND_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
    const profileBtn = await authPage.waitForSelector('header button:has([data-testid="user-avatar"]), header button[title*="Profile"], header button:has(.rounded-full)', { timeout: 5000 });
    await profileBtn.click();
    const avatarPrivacyItem = await authPage.waitForSelector('[data-testid="avatar-menu-privacy-cookies"]', { timeout: 5000 });
    const avatarItemText = await avatarPrivacyItem.innerText();
    if (!avatarItemText.includes('Privacy and cookies')) {
      throw new Error(`Unexpected text in avatar menu item: ${avatarItemText}`);
    }
    console.log('✓ Avatar menu contains "Privacy and cookies" link.');

    // 4. Verify Allowed Location 3: My Account page has 'Privacy and cookies'
    console.log('Checking Allowed Location 3: My Account Privacy and cookies tab...');
    await authPage.goto(`${FRONTEND_URL}/account`, { waitUntil: 'domcontentloaded' });
    const accountTab = await authPage.waitForSelector('[data-testid="account-tab-privacy-cookies"]', { timeout: 5000 });
    await accountTab.click();
    const manageCookiesBtn = await authPage.waitForSelector('[data-testid="account-manage-cookies-btn"]', { timeout: 5000 });
    if (!manageCookiesBtn) throw new Error('Missing Manage Cookie Preferences button in My Account');
    console.log('✓ My Account correctly has dedicated "Privacy and cookies" tab & management button.');

    console.log('\n=== ALL COOKIE LINKS REQUIREMENTS (ITEM 5) PASSED! ===');
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
