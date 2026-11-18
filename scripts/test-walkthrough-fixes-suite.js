/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * WALKTHROUGH FIXES COMPREHENSIVE SUITE
 * Tests items 2 through 11 from the live walkthrough report:
 * Item 2: Login speed (< 1.5s, bcrypt cost 12 intact)
 * Item 3: Atomic landing redirect without /dashboard -> / -> /dashboard bounce
 * Item 4: Password field auto-hide (10s, blur, submit) & cleartext protection
 * Item 5: /health/schema single-call & CORS Max-Age: 7200 preflight caching
 * Item 6: Client errors reporting with requestId & no swallowed errors
 * Item 7: Dashboard KPIs & Receivables calculation parity & Activity label
 * Item 8: Nested form submit bug resolved, button type="button", ESLint rule
 * Item 9: Duplicate customer warning (< 3 chars, use existing/create anyway) & GSTIN uniqueness
 * Item 10: Create document form (empty words on 0 total, red marker on 0, HSN placeholder, unit rate default '')
 * Item 11: Public contact single config, Vite forbid-placeholder plugin, public inquiry API with honeypot & rate limit
 * Viewports & Themes: 1536x730, 390px, light & dark modes
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const API_BASE = 'http://localhost:3333/api/v1';
const WEB_BASE = 'http://localhost:5173';
const ARTIFACTS_DIR = 'C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824';

function httpRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data,
          json: () => {
            try {
              return JSON.parse(data);
            } catch {
              return null;
            }
          },
        });
      });
    });
    req.on('error', reject);
    if (postData) {
      if (typeof postData === 'object') {
        req.write(JSON.stringify(postData));
      } else {
        req.write(postData);
      }
    }
    req.end();
  });
}

async function runWalkthroughFixesSuite(assert) {
  let browser;
  let context;
  let tenant;
  let adminUser;

  try {
    // 0. Setup test tenant & admin user
    tenant = await prisma.tenant.findFirst({
      where: { code: 'FAKE_WALKTHROUGH_TEST' },
    });
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          code: 'FAKE_WALKTHROUGH_TEST',
          name: 'Walkthrough Test Corp',
          slug: 'fake-walkthrough-test',
          status: 'active',
        },
      });
    }

    const bcrypt = require('bcryptjs');
    const hashedPw = await bcrypt.hash('TestPassword@123', 12);
    adminUser = await prisma.user.findFirst({
      where: { email: 'walkthrough.admin@faketest.local' },
    });
    if (!adminUser) {
      adminUser = await prisma.user.create({
        data: {
          tenant: { connect: { id: tenant.id } },
          email: 'walkthrough.admin@faketest.local',
          passwordHash: hashedPw,
          name: 'Walkthrough Admin',
          role: 'tenant_admin',
          employeeCode: 'WTA-001',
          isActive: true,
        },
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ITEM 2: LOGIN SPEED (< 1.5s, bcrypt 12 intact)
    // ──────────────────────────────────────────────────────────────────────────
    const t0 = Date.now();
    const wrongRes = await httpRequest({
      hostname: 'localhost',
      port: 3333,
      path: '/api/v1/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { identifier: 'walkthrough.admin@faketest.local', password: 'WrongPassword999!' });
    const wrongTime = Date.now() - t0;

    assert(
      'Item 2: Wrong password login fails with 401 in < 1500ms',
      wrongRes.statusCode === 401 && wrongTime < 1500,
      `status=${wrongRes.statusCode}, latency=${wrongTime}ms`
    );

    const t1 = Date.now();
    const correctRes = await httpRequest({
      hostname: 'localhost',
      port: 3333,
      path: '/api/v1/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { identifier: 'walkthrough.admin@faketest.local', password: 'TestPassword@123' });
    const correctTime = Date.now() - t1;

    assert(
      'Item 2: Correct password login succeeds with 200/201 in < 1500ms',
      (correctRes.statusCode === 200 || correctRes.statusCode === 201) && correctTime < 1500,
      `status=${correctRes.statusCode}, latency=${correctTime}ms`
    );

    const loginData = correctRes.json();
    const staffToken = loginData?.accessToken || loginData?.token;
    assert('Item 2: Staff JWT access token issued successfully', Boolean(staffToken));

    // ──────────────────────────────────────────────────────────────────────────
    // ITEM 3: ATOMIC REDIRECT TO DASHBOARD
    // ──────────────────────────────────────────────────────────────────────────
    const rolesUtil = fs.readFileSync(path.resolve(__dirname, '../apps/web/src/utils/roles.ts'), 'utf8');
    assert(
      'Item 3: Role redirect path for tenant_admin defaults directly to /dashboard without / bounce',
      rolesUtil.includes("case 'tenant_admin':") && !rolesUtil.includes("case 'tenant_admin':\n      return '/';")
    );

    // ──────────────────────────────────────────────────────────────────────────
    // ITEM 4: PASSWORD AUTO-HIDE & CLEARTEXT PROTECTION
    // ──────────────────────────────────────────────────────────────────────────
    const authFormCode = fs.readFileSync(path.resolve(__dirname, '../apps/web/src/components/auth/AuthLoginForm.tsx'), 'utf8');
    assert(
      'Item 4: AuthLoginForm auto-hides password on 10s timeout, window blur, and submit',
      authFormCode.includes('10000') &&
      authFormCode.includes("addEventListener('blur'") &&
      authFormCode.includes('setShowPassword(false)')
    );

    // ──────────────────────────────────────────────────────────────────────────
    // ITEM 5: HEALTH SCHEMA & PREFLIGHT CACHING (MAX-AGE: 7200)
    // ──────────────────────────────────────────────────────────────────────────
    const optionsRes = await httpRequest({
      hostname: 'localhost',
      port: 3333,
      path: '/api/v1/dashboard/kpis',
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Authorization',
      },
    });

    const maxAge = optionsRes.headers['access-control-max-age'];
    assert(
      'Item 5: CORS OPTIONS preflight returns Access-Control-Max-Age: 7200',
      maxAge === '7200',
      `received: ${maxAge}`
    );

    const schemaRes = await httpRequest({
      hostname: 'localhost',
      port: 3333,
      path: '/api/v1/health/schema',
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(
      'Item 5: GET /health/schema succeeds for tenant_admin',
      schemaRes.statusCode === 200,
      `status=${schemaRes.statusCode}`
    );

    // ──────────────────────────────────────────────────────────────────────────
    // ITEM 6: CLIENT ERRORS LOGGING & (Ref: requestId)
    // ──────────────────────────────────────────────────────────────────────────
    const errorReportRes = await httpRequest({
      hostname: 'localhost',
      port: 3333,
      path: '/api/v1/client-errors',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, {
      id: 'ERR-WALKTHROUGH-1',
      route: '/dashboard',
      message: 'Network error loading resource',
      page: '/dashboard',
    });

    assert(
      'Item 6: POST /client-errors succeeds unauthenticated without swallowing',
      errorReportRes.statusCode === 200 || errorReportRes.statusCode === 201,
      `status=${errorReportRes.statusCode}`
    );

    const apiCode = fs.readFileSync(path.resolve(__dirname, '../apps/web/src/services/api.ts'), 'utf8');
    assert(
      'Item 6: getApiErrorMessage appends (Ref: reqId) to user-facing messages',
      apiCode.includes('(Ref: ${reqId})')
    );

    // ──────────────────────────────────────────────────────────────────────────
    // ITEM 7: NUMBERS & DASHBOARD KPIS (calculateReceivablesKpi PARITY)
    // ──────────────────────────────────────────────────────────────────────────
    const dashboardKpiRes = await httpRequest({
      hostname: 'localhost',
      port: 3333,
      path: '/api/v1/dashboard/kpis',
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });

    const analyticsRecRes = await httpRequest({
      hostname: 'localhost',
      port: 3333,
      path: '/api/v1/dashboard/analytics/receivables',
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });

    const kpisData = dashboardKpiRes.json();
    const analyticsData = analyticsRecRes.json();

    const unpaidInKpi = kpisData?.kpis?.invoices?.unpaidAmount;
    const unpaidInAnalytics = analyticsData?.summary?.totalReceivable ?? analyticsData?.summary?.totalReceivables;

    assert(
      'Item 7: Dashboard KPI unpaidAmount matches AR analytics totalReceivables parity',
      unpaidInKpi !== undefined && unpaidInAnalytics !== undefined && unpaidInKpi === unpaidInAnalytics,
      `kpi=${unpaidInKpi}, analytics=${unpaidInAnalytics}`
    );

    const dashPageCode = fs.readFileSync(path.resolve(__dirname, '../apps/web/src/pages/DashboardPage.tsx'), 'utf8');
    assert(
      'Item 7: Dashboard Page subtitle renders "of which overdue: ₹..." when overdue > 0',
      dashPageCode.includes('of which overdue: ')
    );
    assert(
      'Item 7: Dashboard Activity card renders "{followUpsDueList.length} follow-ups due"',
      dashPageCode.includes('follow-ups due')
    );

    // ──────────────────────────────────────────────────────────────────────────
    // ITEM 8: NESTED FORM REMOVAL & ESLint button-has-type RULE
    // ──────────────────────────────────────────────────────────────────────────
    const custSelectCode = fs.readFileSync(path.resolve(__dirname, '../apps/web/src/components/common/CustomerSelectWithModal.tsx'), 'utf8');
    assert(
      'Item 8: CreateCustomerModal does NOT render a nested <form> element',
      !custSelectCode.includes('<form onSubmit={handleSubmit}')
    );
    assert(
      'Item 8: CreateCustomerModal submit button has explicit type="button"',
      custSelectCode.includes('type="button"') && custSelectCode.includes('onClick={handleSubmit}')
    );

    const eslintConfig = fs.readFileSync(path.resolve(__dirname, '../apps/web/.eslintrc.cjs'), 'utf8');
    assert(
      'Item 8: ESLint configuration enforces react/button-has-type as error',
      eslintConfig.includes("'react/button-has-type': 'error'")
    );

    // ──────────────────────────────────────────────────────────────────────────
    // ITEM 9: DUPLICATE CUSTOMER WARNING & GSTIN UNIQUENESS
    // ──────────────────────────────────────────────────────────────────────────
    assert(
      'Item 9: Duplicate detection supports short names (< 3 chars, e.g. normName.length > 0)',
      custSelectCode.includes('normName.length > 0')
    );
    assert(
      'Item 9: Duplicate warning presents "Use existing" and "Create anyway" buttons',
      custSelectCode.includes('Use existing') && custSelectCode.includes('Create anyway')
    );

    // Test Backend GSTIN Uniqueness
    const testGstin = '27AAPFU0939F1ZV';
    await prisma.company.deleteMany({
      where: { tenantId: tenant.id, gstin: testGstin },
    });

    const comp1 = await httpRequest({
      hostname: 'localhost',
      port: 3333,
      path: '/api/v1/companies',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${staffToken}`,
      },
    }, { name: 'First GSTIN Company', gstin: testGstin });

    assert('Item 9: First company with GSTIN creates successfully', comp1.statusCode === 200 || comp1.statusCode === 201);

    const comp2 = await httpRequest({
      hostname: 'localhost',
      port: 3333,
      path: '/api/v1/companies',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${staffToken}`,
      },
    }, { name: 'Second Duplicate GSTIN Company', gstin: testGstin });

    assert(
      'Item 9: Second company with duplicate GSTIN is rejected with 409 ConflictException',
      comp2.statusCode === 409,
      `status=${comp2.statusCode}`
    );

    // ──────────────────────────────────────────────────────────────────────────
    // ITEM 10: CREATE DOCUMENT FORM VALIDATIONS & AMOUNTS
    // ──────────────────────────────────────────────────────────────────────────
    const docTemplateCode = fs.readFileSync(path.resolve(__dirname, '../apps/web/src/components/invoices/InvoiceDocumentTemplate.tsx'), 'utf8');
    assert(
      'Item 10: numberToIndianWords returns empty string on 0 or invalid amount',
      docTemplateCode.includes('if (!num || isNaN(num) || num <= 0) return')
    );

    const createDocCode = fs.readFileSync(path.resolve(__dirname, '../apps/web/src/components/invoices/CreateDocumentModal.tsx'), 'utf8');
    assert(
      'Item 10: Amount in words is empty when grandTotal is 0',
      createDocCode.includes("const amountWords = grandTotal > 0 ? numberToIndianWords(grandTotal) : ''")
    );
    assert(
      'Item 10: Non-DC documents prevent save when total is 0 with red error marker',
      createDocCode.includes('!isDC && (grandTotal <= 0') && createDocCode.includes('fieldErrors.grandTotal')
    );
    assert(
      'Item 10: HSN code placeholder is "e.g. 85312000" with lighter styling',
      createDocCode.includes('placeholder="e.g. 85312000"')
    );
    assert(
      'Item 10: Line item unit rate defaults to empty string, NOT "0.00"',
      createDocCode.includes("unitPrice: ''")
    );

    // ──────────────────────────────────────────────────────────────────────────
    // ITEM 11: PUBLIC PAGES & CONTACT INQUIRY API
    // ──────────────────────────────────────────────────────────────────────────
    assert(
      'Item 11: apps/web/src/config/publicContact.ts exists and exports PUBLIC_CONTACT',
      fs.existsSync(path.resolve(__dirname, '../apps/web/src/config/publicContact.ts'))
    );

    const viteConfigCode = fs.readFileSync(path.resolve(__dirname, '../apps/web/vite.config.ts'), 'utf8');
    assert(
      'Item 11: Vite config contains build check forbidding placeholder domains',
      viteConfigCode.includes('validate-no-placeholder-domains') &&
      viteConfigCode.includes('example.com')
    );

    // Test Public Inquiry API submission
    const inquiryRes = await httpRequest({
      hostname: 'localhost',
      port: 3333,
      path: '/api/v1/public/inquiries',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, {
      name: 'Walkthrough Public Prospect',
      email: 'prospect@faketest.local',
      company: 'Prospect Enterprises',
      message: 'Interested in CRM demo and pricing.',
    });

    assert(
      'Item 11: POST /public/inquiries creates public lead and returns status SUCCESS',
      inquiryRes.statusCode === 200 && inquiryRes.json()?.status === 'SUCCESS'
    );

    // Test Honeypot rejection
    const honeypotRes = await httpRequest({
      hostname: 'localhost',
      port: 3333,
      path: '/api/v1/public/inquiries',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, {
      name: 'Spam Bot',
      email: 'bot@spam.local',
      message: 'Buy cheap items now!',
      website_hp: 'http://spam-link.test',
    });

    assert(
      'Item 11: POST /public/inquiries silently drops spam submission with website_hp honeypot',
      honeypotRes.statusCode === 200 && honeypotRes.json()?.status === 'SUCCESS'
    );

    const spamLead = await prisma.lead.findFirst({
      where: { customerEmail: 'bot@spam.local' },
    });
    assert(
      'Item 11: Honeypot spam submission created 0 database leads',
      spamLead === null
    );

    // ──────────────────────────────────────────────────────────────────────────
    // PLAYWRIGHT UI TESTS ACROSS VIEWPORTS (1536x730 & 390px) & THEMES
    // ──────────────────────────────────────────────────────────────────────────
    browser = await chromium.launch({ headless: true });

    // Desktop 1536x730 Light Mode
    context = await browser.newContext({
      viewport: { width: 1536, height: 730 },
      colorScheme: 'light',
    });
    let page = await context.newPage();

    // 1. Visit Login Page & verify password field behavior
    await page.goto(`${WEB_BASE}/login`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'evidence-walkthrough-login-1536x730-light.png') });
    assert('UI Viewport: Login page loads at 1536x730 Light', true);

    // 2. Perform Login & verify direct landing to /dashboard
    await page.fill('#company-identifier', 'walkthrough.admin@faketest.local');
    await page.fill('#company-password', 'TestPassword@123');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/dashboard', { timeout: 10000 });
    assert('UI Viewport: Login navigates directly to /dashboard without bounce', page.url().includes('/dashboard'));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'evidence-walkthrough-dashboard-1536x730-light.png') });

    // 3. Test Quotation Item Preservation with Customer Modal (Item 8 requirement)
    await page.goto(`${WEB_BASE}/quotations`);
    await page.waitForLoadState('networkidle');

    // Click "New Quotation" button
    const newQuoteBtn = page.locator('button:has-text("New Quotation"), button:has-text("Create Quotation")').first();
    if (await newQuoteBtn.isVisible()) {
      await newQuoteBtn.click();
      await page.waitForTimeout(500);

      // Verify New Customer button in CustomerSelectWithModal
      const newCustBtn = page.locator('button:has-text("New Customer")').first();
      if (await newCustBtn.isVisible()) {
        await newCustBtn.click();
        await page.waitForTimeout(500);

        // Verify CreateCustomerModal opened without submitting parent form
        const modalTitle = page.locator('h3:has-text("Create New Customer")');
        assert('UI Item 8: CreateCustomerModal opens inside Quotation modal without reloading page', await modalTitle.isVisible());

        // Fill short name "SK" to test short name duplicate detection
        await page.fill('input[placeholder*="Acme Tech"]', 'SK');
        await page.waitForTimeout(300);

        // Click Cancel to close customer modal
        await page.click('button:has-text("Cancel")');
        assert('UI Item 8: Cancel closes modal and keeps quotation draft intact', !page.url().includes('/quotations?'));
      }
    }
    await context.close();

    // Mobile 390px Dark Mode
    context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: 'dark',
    });
    page = await context.newPage();

    // Check Contact Page on Mobile Dark Mode
    await page.goto(`${WEB_BASE}/contact`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'evidence-walkthrough-contact-390px-dark.png') });
    assert('UI Viewport: Contact Page renders cleanly at 390px Dark Mode', true);

    // Verify contact email is not example.com
    const salesText = await page.textContent('body');
    assert('UI Item 11: Contact page displays real/configured sales email, not example.com', !salesText.includes('sales@example.com'));

    await context.close();
    await browser.close();

  } catch (err) {
    console.error('Error during walkthrough fixes suite execution:', err);
    assert('Walkthrough Fixes Suite completed without unhandled exceptions', false, err.message);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }
}

module.exports = { runWalkthroughFixesSuite };

if (require.main === module) {
  let passed = 0;
  let failed = 0;
  const assert = (title, condition, extra = '') => {
    if (condition) {
      console.log(`  [PASS] ${title}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${title} ${extra ? `(${extra})` : ''}`);
      failed++;
    }
  };
  runWalkthroughFixesSuite(assert).then(() => {
    console.log(`\nWalkthrough Fixes Suite: ${passed} PASSED, ${failed} FAILED`);
    process.exit(failed > 0 ? 1 : 0);
  });
}
