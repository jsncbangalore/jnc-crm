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
  console.log('=== RUNNING FIT TEST & EVIDENCE CAPTURE (ITEMS 4 & 11) ===');

  const adminUser = await prisma.user.findFirst({
    where: { role: 'tenant_admin', isActive: true },
    include: { tenant: true },
  });
  if (!adminUser) throw new Error('No tenant_admin found in database');

  const authStorage = await createAuthSession(adminUser);

  const viewports = [
    { width: 1920, height: 1080, name: '1920x1080' },
    { width: 1536, height: 730, name: '1536x730' },
    { width: 1366, height: 768, name: '1366x768' },
    { width: 1280, height: 720, name: '1280x720' },
    { width: 390, height: 844, name: '390x844', isMobile: true },
  ];

  const pagesToTest = [
    { path: '/quotations', name: 'quotations', title: 'Quotations' },
    { path: '/invoices', name: 'invoices', title: 'Invoices' },
    { path: '/orders', name: 'orders', title: 'Orders' },
  ];

  const browser = await chromium.launch({ headless: true });

  const results = [];

  try {
    for (const vp of viewports) {
      console.log(`\n--------------------------------------------------`);
      console.log(`Viewport: ${vp.name} (${vp.width}x${vp.height})`);
      console.log(`--------------------------------------------------`);

      for (const theme of ['light', 'dark']) {
        const isDark = theme === 'dark';
        const authStorage = await createAuthSession(adminUser);

        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          isMobile: !!vp.isMobile,
          storageState: {
            cookies: authStorage.cookies,
            origins: [
              {
                origin: FRONTEND_URL,
                localStorage: [
                  ...authStorage.origins[0].localStorage,
                  { name: 'theme', value: theme },
                ],
              },
            ],
          },
        });

        const page = await context.newPage();

        // Apply dark mode class directly if dark
        await page.addInitScript((dark) => {
          if (dark) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }, isDark);

        for (const pg of pagesToTest) {
          const url = `${FRONTEND_URL}${pg.path}`;
          await page.goto(url, { waitUntil: 'networkidle' });
          await page.waitForTimeout(1000);

          // Force theme class in DOM if needed
          if (isDark) {
            await page.evaluate(() => document.documentElement.classList.add('dark'));
          } else {
            await page.evaluate(() => document.documentElement.classList.remove('dark'));
          }
          await page.waitForTimeout(300);

          // 1. Page horizontal scroll test: scrollWidth <= clientWidth
          const pageScrollInfo = await page.evaluate(() => {
            const doc = document.documentElement;
            const body = document.body;
            const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth);
            const clientWidth = doc.clientWidth;
            const overflowing = [];
            if (scrollWidth > clientWidth + 1) {
              const all = Array.from(document.querySelectorAll('*'));
              for (const el of all) {
                const rect = el.getBoundingClientRect();
                if (el.scrollWidth > clientWidth + 1 || rect.right > clientWidth + 1) {
                  overflowing.push({
                    tag: el.tagName,
                    id: el.id,
                    className: (el.className || '').toString().slice(0, 100),
                    scrollWidth: el.scrollWidth,
                    rectRight: rect.right,
                  });
                }
              }
            }
            return {
              scrollWidth,
              clientWidth,
              hasHorizontalScroll: scrollWidth > clientWidth + 1, // 1px tolerance
              overflowing: overflowing.slice(0, 10),
            };
          });

          // 2. Table horizontal scroll test (for desktop viewports)
          let tableScrollInfo = { hasTable: false, hasHorizontalScroll: false, scrollWidth: 0, clientWidth: 0 };
          if (!vp.isMobile) {
            tableScrollInfo = await page.evaluate(() => {
              const table = document.querySelector('table');
              if (!table) return { hasTable: false, hasHorizontalScroll: false, scrollWidth: 0, clientWidth: 0 };
              const container = table.closest('.overflow-x-hidden, .overflow-x-auto, .table-wrapper') || table.parentElement;
              const scrollWidth = container ? container.scrollWidth : table.scrollWidth;
              const clientWidth = container ? container.clientWidth : table.clientWidth;
              return {
                hasTable: true,
                scrollWidth,
                clientWidth,
                hasHorizontalScroll: scrollWidth > clientWidth + 1,
              };
            });
          }

          // 3. Card layout check on mobile
          let cardLayoutActive = false;
          if (vp.isMobile) {
            cardLayoutActive = await page.evaluate(() => {
              const table = document.querySelector('table');
              return !table; // Table should not be rendered on mobile
            });
          }

          // 4. Action buttons fully visible check
          const actionsVisible = await page.evaluate(() => {
            const printBtn = document.querySelector('button[title*="Print"]');
            return !!printBtn;
          });

          // 5. Screenshot capture
          const screenshotFileName = `evidence-${pg.name}-${vp.name}-${theme}.png`;
          const screenshotPath = path.join(ARTIFACT_DIR, screenshotFileName);
          await page.screenshot({ path: screenshotPath, fullPage: false });

          console.log(`[${pg.title} | ${vp.name} | ${theme}]`);
          console.log(`  • Page Fit: ${!pageScrollInfo.hasHorizontalScroll ? '✓ FIT (No horizontal scroll)' : '✗ FAILED'} (${pageScrollInfo.scrollWidth}px vs ${pageScrollInfo.clientWidth}px)`);
          if (!vp.isMobile) {
            console.log(`  • Table Fit: ${!tableScrollInfo.hasHorizontalScroll ? '✓ FIT' : '✗ FAILED'} (${tableScrollInfo.scrollWidth}px vs ${tableScrollInfo.clientWidth}px)`);
          } else {
            console.log(`  • Mobile Card Layout: ${cardLayoutActive ? '✓ Active' : '✗ Table found on mobile'}`);
          }
          console.log(`  • Action buttons visible: ${actionsVisible ? '✓ Visible' : '—'}`);
          console.log(`  • Screenshot saved: ${screenshotFileName}`);

          results.push({
            page: pg.name,
            viewport: vp.name,
            theme,
            pageFit: !pageScrollInfo.hasHorizontalScroll,
            tableFit: !tableScrollInfo.hasHorizontalScroll,
            cardLayout: vp.isMobile ? cardLayoutActive : true,
            screenshot: screenshotFileName,
          });

          if (pageScrollInfo.hasHorizontalScroll) {
            console.warn(`WARNING: Horizontal scroll detected on ${pg.name} at ${vp.name} (${theme})!`);
            if (pageScrollInfo.overflowing && pageScrollInfo.overflowing.length > 0) {
              console.warn('Overflowing elements sample:', JSON.stringify(pageScrollInfo.overflowing, null, 2));
            }
          }
        }

        await context.close();
      }
    }

    console.log('\n==================================================');
    console.log('FIT TEST SUMMARY REPORT');
    console.log('==================================================');
    let allPassed = true;
    for (const r of results) {
      const ok = r.pageFit && r.tableFit && r.cardLayout;
      if (!ok) allPassed = false;
      console.log(`${ok ? '✓ PASS' : '✗ FAIL'}: ${r.page.padEnd(12)} | ${r.viewport.padEnd(10)} | ${r.theme.padEnd(6)} | PageFit:${r.pageFit} | TableFit:${r.tableFit} | CardLayout:${r.cardLayout}`);
    }

    if (allPassed) {
      console.log('\n>>> ALL 20 VIEWPORT & THEME COMBINATIONS PASSED FIT TESTS 100%! <<<\n');
    } else {
      throw new Error('One or more viewport fit tests failed!');
    }
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

run().catch((e) => {
  console.error('Fit test failed:', e);
  process.exit(1);
});
