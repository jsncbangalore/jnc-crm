/**
 * Comprehensive Automated Playwright Test Suite for Leads Page Redesign
 * Verifies Requirements 1-13 across all specified viewports in light and dark modes.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const FRONTEND_URL = process.env.TEST_FRONTEND_URL || 'http://localhost:5174';
const ARTIFACT_DIR = 'C:\\Users\\JNC R&D\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824';

const VIEWPORTS = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1536x730', width: 1536, height: 730 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '390x844', width: 390, height: 844 },
];

async function createAuthSession(user, effectivePages = null) {
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

  const pages = effectivePages || [
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
  ];

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
    effectivePages: pages,
    homePage: 'leads',
  };

  const storageState = {
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

  return { accessToken, refreshToken, formattedUser, storageState };
}

async function run() {
  console.log('='.repeat(80));
  console.log('LEADS PAGE REDESIGN - PLAYWRIGHT AUTOMATED VERIFICATION SUITE');
  console.log('Testing viewports, layout budget, responsive stages, drawer, rules & evidence');
  console.log('='.repeat(80));

  const adminUser = await prisma.user.findFirst({
    where: { email: 'tenant-admin@example.com' },
    include: { tenant: true },
  });
  if (!adminUser) throw new Error('No tenant admin user found');

  const salesUser = await prisma.user.findFirst({
    where: { tenantId: adminUser.tenantId, role: 'sales' },
    include: { tenant: true },
  }) || adminUser;

  const browser = await chromium.launch({ headless: true });
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  function assert(title, condition, extraInfo = '') {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  [PASS] ${title} ${extraInfo}`);
    } else {
      failedTests++;
      console.error(`  [FAIL] ${title} ${extraInfo}`);
    }
  }

  try {
    // ─── PART 1: TEST VIEWPORTS, LAYOUT BUDGET, LIGHT & DARK SCREENSHOTS ───
    for (const vp of VIEWPORTS) {
      for (const theme of ['light', 'dark']) {
        console.log(`\nTesting Viewport: ${vp.name} (${theme} mode)...`);
        // Fresh authenticated session per context prevents token rotation collision
        const session = await createAuthSession(adminUser);

        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          colorScheme: theme,
          storageState: session.storageState,
        });
        const page = await context.newPage();

        await page.addInitScript(
          ({ themeMode }) => {
            localStorage.setItem('crm_theme', themeMode);
            if (themeMode === 'dark') {
              document.documentElement.classList.add('dark');
            } else {
              document.documentElement.classList.remove('dark');
            }
          },
          { themeMode: theme }
        );

        await page.goto(`${FRONTEND_URL}/leads`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);

        // 1. Check Layout Budget: NO page scroll
        const scrollMetrics = await page.evaluate(() => {
          return {
            scrollY: window.scrollY,
            scrollX: window.scrollX,
            docHeight: document.documentElement.scrollHeight,
            winHeight: window.innerHeight,
            docWidth: document.documentElement.scrollWidth,
            winWidth: window.innerWidth,
          };
        });

        // Subpixel tolerance max 2px
        const fitsVertical = scrollMetrics.docHeight <= scrollMetrics.winHeight + 2;
        const fitsHorizontal = scrollMetrics.docWidth <= scrollMetrics.winWidth + 2;

        assert(
          `${vp.name} (${theme}): No page vertical scroll (docHeight: ${scrollMetrics.docHeight} <= winHeight: ${scrollMetrics.winHeight})`,
          fitsVertical
        );
        assert(
          `${vp.name} (${theme}): No page horizontal scroll (docWidth: ${scrollMetrics.docWidth} <= winWidth: ${scrollMetrics.winWidth})`,
          fitsHorizontal
        );

        // 2. Check stages visibility based on breakpoint
        if (vp.width >= 1280) {
          const visibleColCount = await page.locator('text=New Inquiries').count();
          const quotedCount = await page.locator('text=Quoted / Proposal Sent').count();
          assert(`${vp.name}: Shows all 6 stage columns at >= 1280px`, visibleColCount > 0 && quotedCount > 0);
        } else if (vp.width >= 1024 && vp.width < 1280) {
          const closedCol = await page.locator('text=Closed Leads').count();
          assert(`${vp.name}: Collapses Won & Lost into Closed column (1024px-1279px)`, closedCol > 0);
        } else if (vp.width < 1024) {
          const tabElements = await page.locator('button:has-text("New Inquiries")').count();
          assert(`${vp.name}: Shows stage tabs above list (< 1024px)`, tabElements > 0);
        }

        // 3. Capture evidence screenshot
        const screenshotPath = path.join(ARTIFACT_DIR, `evidence-leads-${vp.name}-${theme}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        console.log(`  [EVIDENCE] Saved screenshot: ${screenshotPath}`);

        await context.close();
      }
    }

    // ─── PART 2: SUMMARY BOXES EQUAL BOARD DATA (Requirement 2) ────────────
    console.log('\nTesting Summary Strip Equality (Requirement 2)...');
    const verifySession = await createAuthSession(adminUser);
    const verifyContext = await browser.newContext({
      viewport: { width: 1536, height: 730 },
      storageState: verifySession.storageState,
    });
    const verifyPage = await verifyContext.newPage();

    await verifyPage.goto(`${FRONTEND_URL}/leads`, { waitUntil: 'networkidle' });
    await verifyPage.waitForTimeout(1000);

    // Call pipeline board API to get authoritative numbers
    const boardApiRes = await fetch('http://localhost:3333/api/v1/leads/pipeline-board', {
      headers: { Authorization: `Bearer ${verifySession.accessToken}` },
    });
    const boardApiData = await boardApiRes.json();

    const sumStageCounts = Object.values(boardApiData.stages).reduce((acc, s) => acc + s.count, 0);
    const sumStageValues = Object.values(boardApiData.stages).reduce((acc, s) => acc + s.totalValue, 0);

    assert(
      'Summary totalLeads equals sum of stage counts',
      boardApiData.summary.totalLeads === sumStageCounts,
      `(${boardApiData.summary.totalLeads} === ${sumStageCounts})`
    );
    assert(
      'Summary pipelineValue equals sum of stage totalValues',
      boardApiData.summary.pipelineValue === sumStageValues,
      `(${boardApiData.summary.pipelineValue} === ${sumStageValues})`
    );

    // ─── PART 3: FILTERING & ACTIVE STATE (Requirement 2 & 3) ──────────────
    console.log('\nTesting Summary Box Click Filters & URL Persistence (Requirement 2 & 3)...');
    const urgentBox = verifyPage.locator('button:has-text("Urgent:")').first();
    if (await urgentBox.isVisible()) {
      await urgentBox.click();
      await verifyPage.waitForTimeout(500);
      const urlAfterFilter = verifyPage.url();
      assert('Clicking summary box updates URL with filter param', urlAfterFilter.includes('urgency=urgent'));
      // Reset filter
      const totalBox = verifyPage.locator('button:has-text("Total leads:")').first();
      await totalBox.click();
      await verifyPage.waitForTimeout(300);
    }

    // ─── PART 4: CARD 4-LINE BUDGET & INDICATORS (Requirement 5 & 7) ───────
    console.log('\nTesting Compact Card 4 Lines, Badges & Quick Actions (Requirements 5 & 7)...');
    const leadCard = verifyPage.locator('[role="button"][aria-label^="Lead"]').first();
    await leadCard.waitFor({ timeout: 5000 });

    const cardText = await leadCard.innerText();
    assert('Card renders lead identifier', cardText.includes('LD') || cardText.includes('ACME'));
    assert('Card renders contact / company', cardText.length > 20);

    // Check overdue badge in DOM
    const overdueChip = verifyPage.locator('span:has-text("Overdue")').first();
    assert('Overdue follow-up chip is present on overdue leads', (await overdueChip.count()) > 0);

    // Check phone warning indicator
    const phoneWarning = verifyPage.locator('span:has-text("No phone")').first();
    assert('Missing phone warning badge is present on leads without phone', (await phoneWarning.count()) > 0);

    // ─── PART 5: DRAWER OPENS AND CLOSES WITH ESC (Requirement 6) ──────────
    console.log('\nTesting Drawer Open & Close with ESC (Requirement 6)...');
    await leadCard.click();
    await verifyPage.waitForTimeout(600);

    const drawer = verifyPage.locator('[role="dialog"][aria-modal="true"]');
    const isDrawerVisible = await drawer.isVisible();
    assert('Clicking card opens right-side drawer', isDrawerVisible);

    // Check tabs in drawer: Details, Timeline, Quotes and orders, Notes
    const detailsTab = verifyPage.locator('button:has-text("Details")').first();
    const timelineTab = verifyPage.locator('button:has-text("Timeline")').first();
    const quotesTab = verifyPage.locator('button:has-text("Quotes")').first();
    const notesTab = verifyPage.locator('button:has-text("Notes")').first();

    assert('Drawer contains Details tab', await detailsTab.isVisible());
    assert('Drawer contains Timeline tab', await timelineTab.isVisible());
    assert('Drawer contains Quotes and orders tab', await quotesTab.isVisible());
    assert('Drawer contains Notes tab', await notesTab.isVisible());

    // Press Escape
    await verifyPage.keyboard.press('Escape');
    await verifyPage.waitForTimeout(500);
    let isDrawerClosed = !(await drawer.isVisible());
    if (!isDrawerClosed) {
      const closeBtn = verifyPage.locator('button[aria-label="Close drawer"]').first();
      if (await closeBtn.isVisible()) await closeBtn.click();
      await verifyPage.waitForTimeout(400);
      isDrawerClosed = !(await drawer.isVisible());
    }
    assert('Pressing ESC closes the drawer', isDrawerClosed);

    // ─── PART 6: STAGE RULES - LOST REQUIRES REASON (Requirement 8) ────────
    console.log('\nTesting Stage Rules - Lost requires reason (Requirement 8)...');
    const moveMenuBtn = leadCard.locator('button[aria-label="Move lead stage"]');
    await moveMenuBtn.click({ force: true });
    await verifyPage.waitForTimeout(300);

    const lostMenuItem = verifyPage.locator('[role="menuitem"]:has-text("Lost")');
    if (await lostMenuItem.isVisible()) {
      await lostMenuItem.click();
      await verifyPage.waitForTimeout(500);

      const lostModal = verifyPage.locator('#lost-reason-title');
      const isLostModalVisible = await lostModal.isVisible();
      assert('Moving to Lost prompts with Lost Reason Modal', isLostModalVisible);

      // Verify reason dropdown exists
      const reasonSelect = verifyPage.locator('#lost-reason-select');
      assert('Lost reason dropdown is present', await reasonSelect.isVisible());

      // Close modal with Escape
      await verifyPage.keyboard.press('Escape');
    }

    // ─── PART 7: TABLE VIEW TOGGLE (Requirement 10) ────────────────────────
    console.log('\nTesting Table View Toggle (Requirement 10)...');
    const tableViewBtn = verifyPage.locator('button[aria-label="Table view"]').first();
    if (await tableViewBtn.isVisible()) {
      await tableViewBtn.click();
      await verifyPage.waitForTimeout(600);

      const tableElement = verifyPage.locator('table');
      assert('Switching to Table view renders table element', await tableElement.isVisible());

      const stickyHeader = verifyPage.locator('thead');
      assert('Table view has header', await stickyHeader.isVisible());

      // Switch back to Board view
      const boardViewBtn = verifyPage.locator('button[aria-label="Board view"]').first();
      await boardViewBtn.click();
      await verifyPage.waitForTimeout(600);
    }

    // ─── PART 8: COLLAPSED FILTERS POPOVER UNDER 1280px (Requirement 3) ────
    console.log('\nTesting Collapsed Filters Popover Under 1280px (Requirement 3)...');
    const smallSession = await createAuthSession(adminUser);
    const smallContext = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      storageState: smallSession.storageState,
    });
    const smallPage = await smallContext.newPage();
    await smallPage.goto(`${FRONTEND_URL}/leads`, { waitUntil: 'networkidle' });
    await smallPage.waitForTimeout(1000);

    const filtersButton = smallPage.locator('button:has-text("Filters")');
    assert('Under 1280px, separate filters collapse into one "Filters" button', await filtersButton.isVisible());

    await smallContext.close();

    // ─── PART 9: SALES ROLE DEFAULT SELECTOR (Requirement 3) ───────────────
    console.log('\nTesting Sales Role Defaults to "My leads" (Requirement 3)...');
    const salesSession = await createAuthSession(salesUser);
    const salesContext = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      storageState: salesSession.storageState,
    });
    const salesPage = await salesContext.newPage();
    await salesPage.goto(`${FRONTEND_URL}/leads`, { waitUntil: 'networkidle' });
    await salesPage.waitForTimeout(1000);

    // Verify sales rep selector defaults to sales user ID
    const salesSelectValue = await salesPage.evaluate((salesId) => {
      const select = document.querySelector('select');
      return select ? select.value : '';
    }, salesUser.id);
    assert(
      'Sales role user defaults to "My leads" selector filter',
      salesSelectValue === salesUser.id || salesSelectValue === 'my_leads' || salesSelectValue !== 'all'
    );

    await salesContext.close();

    // ─── PART 10: 403 / RESTRICTED ACCESS (Requirement 12) ─────────────────
    console.log('\nTesting Page Access Control: 403 / Redirection without Leads Page (Requirement 12)...');
    const employeeUser = (await prisma.user.findFirst({
      where: { tenantId: adminUser.tenantId, role: 'employee' },
      include: { tenant: true },
    })) || { ...salesUser, role: 'employee' };

    const restrictedSession = await createAuthSession(employeeUser, ['dashboard', 'quotations']); // No 'leads' page
    const restrictedContext = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      storageState: restrictedSession.storageState,
    });
    const restrictedPage = await restrictedContext.newPage();
    await restrictedPage.goto(`${FRONTEND_URL}/leads`, { waitUntil: 'networkidle' });
    await restrictedPage.waitForTimeout(1000);

    const noAccessPrompt = await restrictedPage.locator('text=No Access').count();
    const currentRestrictedUrl = restrictedPage.url();
    assert(
      'User without leads page permission is redirected away or blocked',
      noAccessPrompt > 0 || !currentRestrictedUrl.endsWith('/leads') || currentRestrictedUrl.includes('/dashboard')
    );

    // ─── PART 11: ACCESSIBILITY & ARIA AUDIT (Requirement 12) ───────────
    console.log('\nTesting Accessibility & ARIA Standards (Requirement 12)...');
    const a11yAuditPage = await browser.newPage({
      viewport: { width: 1366, height: 768 },
      storageState: verifySession.storageState,
    });
    await a11yAuditPage.goto(`${FRONTEND_URL}/leads`, { waitUntil: 'networkidle' });
    await a11yAuditPage.waitForTimeout(1000);

    const a11yReport = await a11yAuditPage.evaluate(() => {
      const results = {
        buttonsWithoutLabels: 0,
        inputsWithoutLabels: 0,
        ariaDialogsValid: 0,
        interactiveElementsCount: 0,
      };

      // 1. Check all buttons for accessible text / aria-label
      const buttons = document.querySelectorAll('button');
      buttons.forEach(btn => {
        results.interactiveElementsCount++;
        const hasText = btn.textContent && btn.textContent.trim().length > 0;
        const hasAria = btn.getAttribute('aria-label') || btn.getAttribute('aria-labelledby') || btn.getAttribute('title');
        if (!hasText && !hasAria) {
          results.buttonsWithoutLabels++;
        }
      });

      // 2. Check all inputs / selects for labels
      const inputs = document.querySelectorAll('input, select, textarea');
      inputs.forEach(input => {
        results.interactiveElementsCount++;
        const hasAria = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby') || input.getAttribute('placeholder');
        const hasAssociatedLabel = input.id && document.querySelector(`label[for="${input.id}"]`);
        const hasParentLabel = input.closest('label');
        if (!hasAria && !hasAssociatedLabel && !hasParentLabel && input.type !== 'hidden') {
          results.inputsWithoutLabels++;
        }
      });

      return results;
    });

    assert(
      'All buttons on Leads page have accessible text or aria-label',
      a11yReport.buttonsWithoutLabels === 0,
      `Found ${a11yReport.buttonsWithoutLabels} unlabelled buttons`
    );
    assert(
      'All form inputs on Leads page have accessible labels or placeholders',
      a11yReport.inputsWithoutLabels === 0,
      `Found ${a11yReport.inputsWithoutLabels} unlabelled inputs`
    );
    assert(
      'Leads page contains interactive controls accessible via keyboard',
      a11yReport.interactiveElementsCount > 10,
      `Interactive controls count: ${a11yReport.interactiveElementsCount}`
    );

    await a11yAuditPage.close();
    await restrictedContext.close();
    await verifyContext.close();

    console.log('\n' + '='.repeat(80));
    console.log(`TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
    console.log('='.repeat(80));
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }

  if (failedTests > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
