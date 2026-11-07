const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
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
      'lead_flow',
      'lead_setup',
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
      'custom_objects',
      'automation',
      'audit_logs',
      'users',
      'teams',
      'branding',
      'mail_settings',
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
  console.log('--- STARTING ANALYTICS NAV & SWITCHER VERIFICATION ---');
  const user = await prisma.user.findFirst({
    where: { role: 'tenant_admin', isActive: true },
    include: { tenant: true },
  });

  if (!user) {
    throw new Error('No active TENANT_ADMIN user found in database');
  }

  const storageState = await createAuthSession(user);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState,
  });
  const page = await context.newPage();

  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('favicon') && !text.includes('Failed to load resource')) {
        errors.push(text);
      }
    }
  });

  try {
    console.log('1. Navigating to Dashboard to verify Navbar has Analytics tab...');
    await page.goto(`${FRONTEND_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    console.log('2. Finding Analytics tab in Navbar...');
    const analyticsNav = await page.waitForSelector('header a[href="/analytics/leads"], header nav a:has-text("Analytics")', { timeout: 8000 });
    console.log('Found Analytics tab in navbar! Clicking it...');
    await analyticsNav.click();

    await page.waitForURL((url) => url.pathname.includes('/analytics/leads'), { timeout: 8000 });
    console.log('Navigated successfully to:', page.url());

    const metricItems = [
      { id: 'leads', path: '/analytics/leads', title: 'Total Leads' },
      { id: 'quotes', path: '/analytics/quotes', title: 'Active Quotes' },
      { id: 'orders', path: '/analytics/orders', title: 'Orders Active' },
      { id: 'receivables', path: '/analytics/receivables', title: 'Receivable' },
      { id: 'overdue', path: '/analytics/overdue', title: 'Overdue' },
      { id: 'activity', path: '/analytics/activity', title: 'Activity' },
    ];

    console.log('3. Verifying switcher bar & clicking across all 6 sections...');
    for (const item of metricItems) {
      console.log(`Checking metric item: ${item.title} -> ${item.path}`);
      const link = await page.waitForSelector(`a[data-analytics-metric="${item.id}"]`, { timeout: 6000 });
      await link.click();
      await page.waitForURL((url) => url.pathname.includes(item.path), { timeout: 6000 });
      
      // Wait for React to apply aria-current="page" to the newly active link
      await page.waitForSelector(`a[data-analytics-metric="${item.id}"][aria-current="page"]`, { timeout: 6000 });
      console.log(`✓ Page ${item.path} loaded & link marked aria-current="page"`);
      await page.waitForTimeout(300);
    }

    // Take screenshot on /analytics/leads
    await page.click('a[data-analytics-metric="leads"]');
    await page.waitForTimeout(500);
    const screenshotPath = path.join(ARTIFACT_DIR, 'evidence-analytics-switcher-bar.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log('Saved evidence screenshot to:', screenshotPath);

    console.log('Checking for runtime errors...');
    const criticalErrors = errors.filter(e => !e.includes('ResizeObserver') && !e.includes('Failed to load'));
    if (criticalErrors.length > 0) {
      console.error('Console errors detected:', criticalErrors);
      throw new Error(`Console errors found: ${criticalErrors.join(', ')}`);
    }

    console.log('--- ALL ANALYTICS VERIFICATIONS PASSED SUCCESSFULLY! ---');
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
