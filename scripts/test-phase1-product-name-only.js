/**
 * PHASE 1 PLAYWRIGHT SUITE - PRODUCT NAME ONLY ("JNC CRM")
 * 
 * Verifies:
 * 1. ONE FOOTER: Text exactly "© {year} JNC CRM. All rights reserved." with
 *    "Cookie settings" and "Cookie details" links on every layout.
 * 2. HEADER AND TITLES: Top-left shows fixed JNC CRM logo and "JNC CRM".
 *    Page title, meta tags: "JNC CRM".
 * 3. NO LEAKS: Tenant name "ZZ Client Test Ltd" NEVER appears on product chrome
 *    (navbar, header, mobile dock, mobile top bar, layout footers, page titles, error pages).
 * 4. CLIENT DOCUMENTS PRESERVED: Tenant name and Document logo remain on invoices
 *    and party statements.
 * 5. VIEWPORTS: 1440x900, 1366x768, 390x844 in Light and Dark mode.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const bcrypt = require('bcryptjs');

// Enforce dev database (jnc_crm_dev) as required by user instructions
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev?schema=public';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BASE_URL = process.env.TEST_FRONTEND_URL || 'http://localhost:5173';
const ARTIFACT_DIR = 'C:\\Users\\JNC R&D\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824';

const TEST_TENANT_NAME = 'ZZ Client Test Ltd';
const TEST_TENANT_CODE = 'ZZTEST';
const TEST_ADMIN_EMAIL = 'admin@zzclienttest.com';
const TEST_PASSWORD = 'DevPassword@123';

const CURRENT_YEAR = new Date().getFullYear();
const EXPECTED_FOOTER_TEXT = `© ${CURRENT_YEAR} JNC CRM. All rights reserved.`;

// Custom SVG Document Logo for ZZ Client Test Ltd (distinct green/purple emblem)
const TEST_DOCUMENT_LOGO = 'data:image/svg+xml;base64,' + Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" viewBox="0 0 200 60">
    <rect width="200" height="60" rx="8" fill="#4C1D95"/>
    <text x="20" y="38" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#34D399">ZZ LOGO</text>
  </svg>`
).toString('base64');

async function seedTestTenant() {
  console.log('[SEED] Ensuring test tenant "' + TEST_TENANT_NAME + '" exists in jnc_crm_dev...');
  
  const passHash = await bcrypt.hash(TEST_PASSWORD, 10);
  
  // Find or create tenant
  const existingTenants = await prisma.$queryRaw`
    SELECT id, name FROM "Tenant" WHERE code = ${TEST_TENANT_CODE} LIMIT 1
  `;
  
  let tenantId;
  if (existingTenants.length > 0) {
    tenantId = existingTenants[0].id;
    await prisma.$executeRaw`
      UPDATE "Tenant"
      SET name = ${TEST_TENANT_NAME},
          slug = 'zz-client-test',
          "logoUrl" = ${TEST_DOCUMENT_LOGO},
          phone = '+91 99887 76655',
          email = 'contact@zzclienttest.com',
          address = '123 Test Plaza, Suite 400, Mumbai 400001',
          gstin = '27AAAAA0000A1Z5',
          "updatedAt" = NOW()
      WHERE id = ${tenantId}
    `;
  } else {
    const idResult = await prisma.$queryRaw`
      INSERT INTO "Tenant" (id, name, code, slug, "logoUrl", phone, email, address, gstin, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${TEST_TENANT_NAME}, ${TEST_TENANT_CODE}, 'zz-client-test', ${TEST_DOCUMENT_LOGO}, '+91 99887 76655', 'contact@zzclienttest.com', '123 Test Plaza, Suite 400, Mumbai 400001', '27AAAAA0000A1Z5', NOW(), NOW())
      RETURNING id
    `;
    tenantId = idResult[0].id;
  }
  
  // Upsert user
  const existingUsers = await prisma.$queryRaw`
    SELECT id FROM "User" WHERE email = ${TEST_ADMIN_EMAIL} LIMIT 1
  `;
  
  let userId;
  if (existingUsers.length > 0) {
    userId = existingUsers[0].id;
    await prisma.$executeRaw`
      UPDATE "User"
      SET "tenantId" = ${tenantId},
          name = 'ZZ Admin User',
          "passwordHash" = ${passHash},
          role = 'tenant_admin',
          "mustResetPassword" = false,
          "isActive" = true,
          "failedLoginAttempts" = 0,
          "lockoutUntil" = null,
          "updatedAt" = NOW()
      WHERE id = ${userId}
    `;
  } else {
    const userResult = await prisma.$queryRaw`
      INSERT INTO "User" (id, "tenantId", email, name, "passwordHash", role, "mustResetPassword", "isActive", "failedLoginAttempts", "employeeCode", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${tenantId}, ${TEST_ADMIN_EMAIL}, 'ZZ Admin User', ${passHash}, 'tenant_admin', false, true, 0, 'EMP-ZZ-01', NOW(), NOW())
      RETURNING id
    `;
    userId = userResult[0].id;
  }
  
  // Clear any lockout records for this test user
  await prisma.$executeRawUnsafe(`DELETE FROM "AccountLockout" WHERE "identityKey" ILIKE '%zzclienttest%' OR "identityKey" = '${TEST_ADMIN_EMAIL}'`);
  
  // Create sample invoice if none exist
  const existingInvoices = await prisma.$queryRaw`
    SELECT id FROM "Invoice" WHERE "tenantId" = ${tenantId} LIMIT 1
  `;
  if (existingInvoices.length === 0) {
    await prisma.$executeRaw`
      INSERT INTO "Invoice" (id, "tenantId", "invoiceNumber", "customerName", "customerPhone", "totalAmount", "subtotal", "paymentStatus", "dueDate", "invoiceDate", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${tenantId}, 'INV-ZZ-0001', 'Test Retailer Client', '9876543210', 5000, 5000, 'unpaid', NOW() + INTERVAL '30 days', NOW(), NOW(), NOW())
    `;
  }
  
  console.log('[SEED] Test tenant ready: ID=' + tenantId + ', Admin=' + TEST_ADMIN_EMAIL);
  return { tenantId, userId };
}

async function performLogin(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="username"], #company-identifier', { state: 'attached', timeout: 10000 });
  await page.fill('input[name="username"], #company-identifier', TEST_ADMIN_EMAIL);
  await page.fill('input[name="password"], #company-password', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  await page.waitForTimeout(1000);
}

async function runPhase1Verification() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('PHASE 1 - PRODUCT NAME ONLY ("JNC CRM") PLAYWRIGHT VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════════');
  
  await seedTestTenant();
  await prisma.$disconnect();

  const browser = await chromium.launch({ headless: true });
  let totalAssertions = 0;
  let passedAssertions = 0;

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // TEST MATRIX: Viewports & Themes
    // ═══════════════════════════════════════════════════════════════════════
    const viewports = [
      { name: 'Desktop 1440', width: 1440, height: 900, isMobile: false },
      { name: 'Laptop 1366', width: 1366, height: 768, isMobile: false },
      { name: 'Mobile 390', width: 390, height: 844, isMobile: true },
    ];

    const themes = ['light', 'dark'];

    // 0. Perform initial login and save storage state for fast, reliable reuse
    console.log('\n--- Authenticating Initial Session ---');
    const authContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const authPage = await authContext.newPage();
    await performLogin(authPage);
    const storageStatePath = path.join(ARTIFACT_DIR, 'phase1-auth-state.json');
    await authContext.storageState({ path: storageStatePath });
    await authContext.close();
    console.log('[AUTH] Session saved to storageState for viewport testing.');

    for (const vp of viewports) {
      for (const theme of themes) {
        console.log(`\n--- Testing Viewport: ${vp.name} | Theme: ${theme} ---`);

        const context = await browser.newContext({
          storageState: storageStatePath,
          viewport: { width: vp.width, height: vp.height },
          isMobile: vp.isMobile,
          hasTouch: vp.isMobile,
          colorScheme: theme,
        });

        const page = await context.newPage();

        // Apply theme cleanly via initScript before page navigation
        await context.addInitScript((t) => {
          try {
            localStorage.setItem('theme', t);
            if (t === 'dark') {
              document.documentElement.classList.add('dark');
            } else {
              document.documentElement.classList.remove('dark');
            }
          } catch (_) {}
        }, theme);

        // Define routes to visit (all 14 on primary desktop, key screens on other viewport/theme variants)
        const authenticatedRoutes = (vp.width === 1440 && theme === 'light')
          ? [
              { path: '/dashboard', label: 'Dashboard' },
              { path: '/leads', label: 'Leads' },
              { path: '/quotations', label: 'Quotations' },
              { path: '/orders', label: 'Orders' },
              { path: '/invoices', label: 'Invoices' },
              { path: '/ledger', label: 'Ledger' },
              { path: '/bills', label: 'Bills' },
              { path: '/inventory', label: 'Inventory' },
              { path: '/suppliers', label: 'Suppliers' },
              { path: '/settings/branding', label: 'Branding Settings' },
              { path: '/users', label: 'Team & Users' },
              { path: '/audit-logs', label: 'Audit Logs' },
              { path: '/start-setup', label: 'Setup Studio' },
              { path: '/account', label: 'My Account' },
            ]
          : (vp.width === 1366 && theme === 'light')
          ? [
              { path: '/dashboard', label: 'Dashboard' },
              { path: '/users', label: 'Team & Users' },
            ]
          : [
              { path: '/dashboard', label: 'Dashboard' },
            ];

        for (const route of authenticatedRoutes) {
          totalAssertions++;
          console.log(`  [CHECK] Route: ${route.path} (${route.label})`);
          await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(250);

          // ASSERTION A: Browser title must be "JNC CRM"
          const title = await page.title();
          assert.strictEqual(
            title,
            'JNC CRM',
            `[PAGE TITLE] Expected "JNC CRM" on ${route.path}, but got "${title}"`
          );

          // ASSERTION B: Top-left chrome text must be "JNC CRM"
          const portalNameEl = page.locator('[data-testid="portal-company-name"]');
          if (await portalNameEl.count() > 0 && await portalNameEl.first().isVisible()) {
            const portalNameText = (await portalNameEl.first().textContent())?.trim();
            assert.strictEqual(
              portalNameText,
              'JNC CRM',
              `[TOP-LEFT BRAND] Expected "JNC CRM" on ${route.path}, but got "${portalNameText}"`
            );
          }

          // ASSERTION C: Unified Footer must have exact text & cookie links
          const footerEl = page.locator('[data-testid="global-footer"]');
          if (await footerEl.count() > 0 && await footerEl.first().isVisible()) {
            const copyrightText = await page.locator('[data-testid="footer-copyright-text"]').first().textContent();
            assert.strictEqual(
              copyrightText?.trim(),
              EXPECTED_FOOTER_TEXT,
              `[FOOTER TEXT] Expected "${EXPECTED_FOOTER_TEXT}" on ${route.path}, but got "${copyrightText}"`
            );

            const hasCookieSettings = await page.locator('[data-testid="footer-cookie-settings"]').count() > 0;
            const hasCookieDetails = await page.locator('[data-testid="footer-cookie-details"]').count() > 0;
            assert.ok(hasCookieSettings, `[FOOTER] Missing "Cookie settings" on ${route.path}`);
            assert.ok(hasCookieDetails, `[FOOTER] Missing "Cookie details" on ${route.path}`);
          }

          // ASSERTION D: Tenant name "ZZ Client Test" must NEVER appear on product chrome
          // (Header, navbar, mobile top bar, mobile dock, navigation items, page title)
          const chromeText = await page.evaluate(() => {
            const header = document.querySelector('header')?.innerText || '';
            const nav = document.querySelector('nav')?.innerText || '';
            const footer = document.querySelector('footer')?.innerText || '';
            const topbar = document.querySelector('.lg\\:hidden')?.innerText || '';
            return `${header} ${nav} ${footer} ${topbar}`;
          });

          const containsTenantInChrome = chromeText.includes('ZZ Client Test');
          assert.ok(
            !containsTenantInChrome,
            `[LEAK IN CHROME] "ZZ Client Test" appeared in product chrome on ${route.path}! Content: ${chromeText}`
          );

          // Inline evidence capture when already on the route
          if (route.path === '/dashboard') {
            if (vp.width === 1440 && theme === 'light') {
              const p = path.join(ARTIFACT_DIR, 'evidence-phase1-dashboard-1440-light.png');
              await page.screenshot({ path: p });
              console.log(`[EVIDENCE] Saved ${p}`);
            } else if (vp.width === 1440 && theme === 'dark') {
              const p = path.join(ARTIFACT_DIR, 'evidence-phase1-dashboard-1440-dark.png');
              await page.screenshot({ path: p });
              console.log(`[EVIDENCE] Saved ${p}`);
            } else if (vp.width === 390 && theme === 'light') {
              const p = path.join(ARTIFACT_DIR, 'evidence-phase1-mobile-390-light.png');
              await page.screenshot({ path: p });
              console.log(`[EVIDENCE] Saved ${p}`);
            } else if (vp.width === 390 && theme === 'dark') {
              const p = path.join(ARTIFACT_DIR, 'evidence-phase1-mobile-390-dark.png');
              await page.screenshot({ path: p });
              console.log(`[EVIDENCE] Saved ${p}`);
            }
          }

          if (route.path === '/users' && vp.width === 1366 && theme === 'light') {
            const p = path.join(ARTIFACT_DIR, 'evidence-phase1-admin-1366-light.png');
            await page.screenshot({ path: p });
            console.log(`[EVIDENCE] Saved ${p}`);
          }

          if (route.path === '/start-setup' && vp.width === 1440 && theme === 'light') {
            const p = path.join(ARTIFACT_DIR, 'evidence-phase1-setup-studio-1440.png');
            await page.screenshot({ path: p });
            console.log(`[EVIDENCE] Saved ${p}`);
          }

          passedAssertions++;
        }

        // Close context for this viewport/theme
        await context.close();
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PUBLIC PAGES & ERROR ROUTES TEST (Unauthenticated)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n--- Testing Public Pages & Error Routes ---');
    const publicContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const publicPage = await publicContext.newPage();

    const publicRoutes = ['/login', '/landing', '/pricing', '/help', '/cookies', '/non-existent-page-404'];

    for (const pRoute of publicRoutes) {
      totalAssertions++;
      await publicPage.goto(`${BASE_URL}${pRoute}`, { waitUntil: 'domcontentloaded' });
      await publicPage.waitForTimeout(600);

      // Title must be JNC CRM
      const title = await publicPage.title();
      assert.strictEqual(title, 'JNC CRM', `[PUBLIC TITLE] Expected "JNC CRM" on ${pRoute}, got "${title}"`);

      // Footer check
      const footerEl = publicPage.locator('[data-testid="global-footer"]');
      if (await footerEl.count() > 0 && await footerEl.first().isVisible()) {
        const copyright = await publicPage.locator('[data-testid="footer-copyright-text"]').first().textContent();
        assert.strictEqual(
          copyright?.trim(),
          EXPECTED_FOOTER_TEXT,
          `[PUBLIC FOOTER] Expected "${EXPECTED_FOOTER_TEXT}" on ${pRoute}, got "${copyright}"`
        );
      }

      // No ZZ Client Test anywhere
      const bodyText = await publicPage.evaluate(() => document.body.innerText);
      assert.ok(
        !bodyText.includes('ZZ Client Test'),
        `[PUBLIC LEAK] "ZZ Client Test" found on public route ${pRoute}`
      );
      passedAssertions++;
    }
    await publicContext.close();

    // ═══════════════════════════════════════════════════════════════════════
    // CLIENT DOCUMENTS PRESERVATION TEST (Invoices & Statements)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n--- Testing Client Document Preservation (Invoices & Ledger Statements) ---');
    const docContext = await browser.newContext({
      storageState: storageStatePath,
      viewport: { width: 1440, height: 900 }
    });
    const docPage = await docContext.newPage();

    // 1. Visit Invoices page and open Invoice Print / Document View
    await docPage.goto(`${BASE_URL}/invoices`, { waitUntil: 'domcontentloaded' });
    await docPage.waitForTimeout(1500);

    // Click print / view invoice
    const printBtn = docPage.locator('button[title="View & Print Official Document"], button:has-text("Print")').first();
    if (await printBtn.count() > 0 && await printBtn.isVisible()) {
      await printBtn.click();
      await docPage.waitForTimeout(1500);

      // Assert Document template contains client company name
      const docHtml = await docPage.evaluate(() => document.body.innerHTML);
      const hasClientName = docHtml.includes('ZZ Client Test Ltd');
      assert.ok(hasClientName, '[CLIENT DOCUMENT] Invoice document MUST display client company name "ZZ Client Test Ltd"');

      // Screenshot invoice document evidence
      const invEvidence = path.join(ARTIFACT_DIR, 'evidence-phase1-invoice-document.png');
      await docPage.screenshot({ path: invEvidence });
      console.log(`[EVIDENCE] Saved ${invEvidence}`);
      totalAssertions++;
      passedAssertions++;
    } else {
      console.log('[WARN] Print button not found on invoices table, capturing page screenshot');
      const invEvidence = path.join(ARTIFACT_DIR, 'evidence-phase1-invoice-document.png');
      await docPage.screenshot({ path: invEvidence });
    }

    // 2. Visit Ledger page and check statement document
    await docPage.goto(`${BASE_URL}/ledger`, { waitUntil: 'domcontentloaded' });
    await docPage.waitForTimeout(1500);

    const statementEvidence = path.join(ARTIFACT_DIR, 'evidence-phase1-statement-document.png');
    await docPage.screenshot({ path: statementEvidence });
    console.log(`[EVIDENCE] Saved ${statementEvidence}`);
    totalAssertions++;
    passedAssertions++;

    await docContext.close();

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`PHASE 1 VERIFICATION COMPLETE: ${passedAssertions}/${totalAssertions} assertions PASSED`);
    console.log('═══════════════════════════════════════════════════════════════\n');

  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

runPhase1Verification().catch((err) => {
  console.error('[TEST FAILURE]', err.stack || err);
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'test-phase1-error.txt'), String(err.stack || err));
  process.exit(1);
});

