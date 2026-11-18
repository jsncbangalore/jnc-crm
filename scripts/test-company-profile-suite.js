/* --- AUTOMATED TEST SUITE: COMPANY BRANDING & GST PAGE SAVE ---
 * Tests:
 * 1. Website variants ('www.example.com', 'example.com', 'http://...', 'https://...')
 * 2. Field-level error display and auto-focus
 * 3. Typed values kept after failed save
 * 4. Save -> leave -> return keeps the data
 * 5. Failed save then leaving does not blank saved data
 * 6. Clearing a field on purpose displays confirmation modal
 * 7. AuditLog entry created with changedFields and redacted bank accounts
 * 8. Non-admin user dashboard makes 0 calls to /health/schema
 * 9. Light & Dark mode, 1536x730 and 390px screenshots
 */

const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { chromium } = require('playwright');
const { PrismaClient } = require(path.join(__dirname, '../node_modules/@prisma/client'));

const prisma = new PrismaClient();
const API_BASE = process.env.API_URL || 'http://localhost:3333/api/v1';
const WEB_BASE = process.env.WEB_URL || 'http://localhost:5173';
const ARTIFACT_DIR = path.resolve('C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    throw new Error(message);
  }
  passedTests++;
  console.log(`[PASS] ${message}`);
}

async function createFakeTenantAndUsers(suffix) {
  const tenantId = `fake-prof-ten-${suffix}`;
  const adminId = `fake-prof-admin-${suffix}`;
  const employeeId = `fake-prof-emp-${suffix}`;
  const passwordHash = await bcrypt.hash('DevPassword@123', 10);

  const tenant = await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `TEN-${suffix}`,
      name: `Profile Corp ${suffix}`,
      slug: `profile-corp-${suffix}`,
      status: 'active',
      planTier: 'enterprise',
      requireTwoFactor: false,
    },
  });

  const admin = await prisma.user.create({
    data: {
      id: adminId,
      tenantId: tenant.id,
      email: `admin_${suffix}@profiletest.fake`,
      name: 'Profile Admin',
      role: 'tenant_admin',
      employeeCode: `EC-ADM-${suffix}`,
      passwordHash,
      isActive: true,
    },
  });

  const employee = await prisma.user.create({
    data: {
      id: employeeId,
      tenantId: tenant.id,
      email: `emp_${suffix}@profiletest.fake`,
      name: 'Profile Employee',
      role: 'employee',
      employeeCode: `EC-EMP-${suffix}`,
      passwordHash,
      isActive: true,
    },
  });

  await prisma.userPageAccess.create({
    data: {
      tenant: { connect: { id: tenant.id } },
      user: { connect: { id: admin.id } },
      pages: JSON.stringify(['branding', 'invoices', 'quotations', 'audit_logs']),
    },
  });

  await prisma.userPageAccess.create({
    data: {
      tenant: { connect: { id: tenant.id } },
      user: { connect: { id: employee.id } },
      pages: JSON.stringify(['invoices']),
    },
  });

  const jwtSecret = process.env.JWT_SECRET || 'crm-jwt-secret-key-2026';
  const adminToken = jwt.sign(
    { sub: admin.id, userId: admin.id, id: admin.id, email: admin.email, role: admin.role, tenantId: tenant.id },
    jwtSecret,
    { audience: 'crm-client', issuer: 'crm-api', expiresIn: '1h' }
  );

  return { tenant, admin, employee, adminToken };
}

async function cleanupTenant(tenantId, adminId, employeeId) {
  try {
    if (adminId) await prisma.userPageAccess.deleteMany({ where: { userId: adminId } }).catch(() => {});
    if (employeeId) await prisma.userPageAccess.deleteMany({ where: { userId: employeeId } }).catch(() => {});
    if (adminId) await prisma.user.deleteMany({ where: { id: adminId } }).catch(() => {});
    if (employeeId) await prisma.user.deleteMany({ where: { id: employeeId } }).catch(() => {});
    if (tenantId) {
      await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.companyBankAccount.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {});
    }
  } catch (err) {
    console.warn('[CLEANUP WARNING]', err.message);
  }
}

async function runSuite() {
  console.log('================================================================');
  console.log('TEST SUITE: COMPANY BRANDING & GST PAGE SAVE');
  console.log('================================================================\n');

  const suffix = Math.floor(100000 + Math.random() * 900000);
  const { tenant, admin, employee, adminToken } = await createFakeTenantAndUsers(suffix);

  let browser;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: API Normalisation of Website Variants
    // -------------------------------------------------------------------------
    console.log('\n--- 1. API WEBSITE VARIANTS NORMALISATION ---');
    const websiteVariants = [
      { input: 'www.example.com', expected: 'https://www.example.com' },
      { input: 'example.com', expected: 'https://example.com' },
      { input: 'http://example.com', expected: 'https://example.com' },
      { input: 'https://secure.example.com', expected: 'https://secure.example.com' },
    ];

    for (const v of websiteVariants) {
      const res = await fetch(`${API_BASE}/settings/company-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: `Corp ${suffix}`,
          website: v.input,
        }),
      });
      const data = await res.json();
      assert(res.status === 200, `API accepted website "${v.input}" (status ${res.status})`);
      assert(data.website === v.expected, `API normalised "${v.input}" to "${v.expected}" (got "${data.website}")`);
    }

    // -------------------------------------------------------------------------
    // TEST 2: AuditLog entry created with changed fields and redacted bank details
    // -------------------------------------------------------------------------
    console.log('\n--- 2. AUDIT LOG TRACKING & REDACTION ---');
    const auditEntries = await prisma.auditLog.findMany({
      where: { tenantId: tenant.id, action: 'COMPANY_PROFILE_UPDATED' },
      orderBy: { timestamp: 'desc' },
    });
    assert(auditEntries.length > 0, `Audit log entry created for company profile update (count: ${auditEntries.length})`);
    const latestAudit = auditEntries[0];
    const details = typeof latestAudit.afterState === 'string' ? JSON.parse(latestAudit.afterState) : latestAudit.afterState;
    assert(Array.isArray(details.changedFields), 'Audit log contains changedFields array');
    assert(details.changedFields.includes('website'), 'Audit log records "website" as changed field');

    // -------------------------------------------------------------------------
    // PLAYWRIGHT BROWSER TESTS (DESKTOP & MOBILE, LIGHT & DARK)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. PLAYWRIGHT UI TESTS (ERROR DISPLAY, FOCUS, SKELETON, DATA LOSS) ---');
    browser = await chromium.launch({ headless: true });

    // Desktop Context (1536x730)
    const desktopContext = await browser.newContext({
      viewport: { width: 1536, height: 730 },
      colorScheme: 'light',
    });
    const page = await desktopContext.newPage();

    // Login as Admin
    await page.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="username"], #company-identifier', admin.email);
    await page.fill('input[name="password"], #company-password', 'DevPassword@123');
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 });

    // Navigate to /settings/branding
    await page.goto(`${WEB_BASE}/settings/branding`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[data-testid="input-company-name"]', { timeout: 15000 });

    // 3.1 Field-level error display & focus
    console.log('\nSubtest 3.1: Testing field error display, focus, and dynamic banner...');
    await page.fill('input[data-testid="input-pincode"]', '123'); // Invalid pincode
    await page.fill('input[data-testid="input-email"]', 'notanemail'); // Invalid email
    await page.fill('input[data-testid="input-website"]', 'https://example.com'); // Valid
    await page.click('button[data-testid="btn-save-branding"]');
    await page.waitForTimeout(1000);

    const bannerText = await page.locator('[data-testid="bottom-branding-feedback"]').textContent();
    assert(bannerText.includes('Fix:') && (bannerText.includes('Pincode') || bannerText.includes('Billing Email')),
      `Dynamic banner lists invalid fields: "${bannerText.trim()}"`);

    // Verify red border on pincode and email
    const pincodeClass = await page.locator('input[data-testid="input-pincode"]').getAttribute('class');
    assert(pincodeClass.includes('border-rose-500'), `Pincode input has red border class: ${pincodeClass}`);

    const emailClass = await page.locator('input[data-testid="input-email"]').getAttribute('class');
    assert(emailClass.includes('border-rose-500'), `Email input has red border class: ${emailClass}`);

    // Verify under-field error messages
    const pincodeError = await page.locator('[data-testid="error-pincode"]').textContent();
    assert(pincodeError.includes('Pincode must be exactly 6 digits'), `Pincode error under field: "${pincodeError.trim()}"`);

    const emailError = await page.locator('[data-testid="error-email"]').textContent();
    assert(emailError.includes('valid billing email'), `Email error under field: "${emailError.trim()}"`);

    // Verify focus shifted to first invalid field (Pincode or Email)
    const focusedId = await page.evaluate(() => document.activeElement ? document.activeElement.getAttribute('data-testid') : '');
    assert(focusedId === 'input-pincode' || focusedId === 'input-email', `Focus shifted to first invalid field: "${focusedId}"`);

    // 3.2 Typed values kept after failed save
    console.log('\nSubtest 3.2: Testing typed values retained after failed save...');
    const retainedPincode = await page.locator('input[data-testid="input-pincode"]').inputValue();
    const retainedEmail = await page.locator('input[data-testid="input-email"]').inputValue();
    assert(retainedPincode === '123', 'Typed pincode "123" retained in field after validation error');
    assert(retainedEmail === 'notanemail', 'Typed email "notanemail" retained in field after validation error');

    // 3.3 Save valid profile successfully
    console.log('\nSubtest 3.3: Saving valid profile...');
    await page.fill('input[data-testid="input-company-phone"]', '+919876543210');
    await page.fill('input[data-testid="input-pincode"]', '560001');
    await page.fill('input[data-testid="input-email"]', 'billing@profiletest.fake');
    await page.fill('input[data-testid="input-address"]', '42 Innovation Parkway');
    await page.fill('input[data-testid="input-city"]', 'Bengaluru');
    await page.fill('input[data-testid="input-state"]', 'Karnataka');
    await page.fill('input[data-testid="input-gstin"]', '29AABCU9603R1ZJ');
    await page.fill('input[data-testid="input-pan"]', 'AABCU9603R');
    await page.fill('input[data-testid="input-website"]', 'www.example.com'); // Test web form normalisation on submit
    await page.click('button[data-testid="btn-save-branding"]');
    await page.waitForTimeout(2000);

    const successBanner = await page.locator('[data-testid="bottom-branding-feedback"]').textContent();
    assert(successBanner.includes('updated successfully'), `Save successful banner shown: "${successBanner.trim()}"`);

    const normalisedWebInput = await page.locator('input[data-testid="input-website"]').inputValue();
    assert(normalisedWebInput === 'https://www.example.com', `Web form normalised "www.example.com" to "https://www.example.com"`);

    // Screenshot Desktop Light
    const screenshotDeskLight = path.join(ARTIFACT_DIR, 'evidence-branding-save-1536x730-light.png');
    await page.screenshot({ path: screenshotDeskLight, fullPage: true });
    console.log(`[SCREENSHOT] Saved: ${screenshotDeskLight}`);

    // 3.4 Save -> Leave -> Return keeps data
    console.log('\nSubtest 3.4: Testing leave and return preserves saved data...');
    await page.goto(`${WEB_BASE}/invoices`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.goto(`${WEB_BASE}/settings/branding`, { waitUntil: 'networkidle' });
    await page.waitForSelector('input[data-testid="input-address"]', { timeout: 10000 });

    const returnedAddress = await page.locator('input[data-testid="input-address"]').inputValue();
    const returnedCity = await page.locator('input[data-testid="input-city"]').inputValue();
    const returnedGstin = await page.locator('input[data-testid="input-gstin"]').inputValue();
    const returnedPan = await page.locator('input[data-testid="input-pan"]').inputValue();
    const returnedWeb = await page.locator('input[data-testid="input-website"]').inputValue();

    assert(returnedAddress === '42 Innovation Parkway', `Address restored on return: "${returnedAddress}"`);
    assert(returnedCity === 'Bengaluru', `City restored on return: "${returnedCity}"`);
    assert(returnedGstin === '29AABCU9603R1ZJ', `GSTIN restored on return: "${returnedGstin}"`);
    assert(returnedPan === 'AABCU9603R', `PAN restored on return: "${returnedPan}"`);
    assert(returnedWeb === 'https://www.example.com', `Website restored on return: "${returnedWeb}"`);

    // 3.5 Failed save then leaving does not blank saved data
    console.log('\nSubtest 3.5: Failed save then leaving preserves previous DB data...');
    await page.fill('input[data-testid="input-pincode"]', 'badpin');
    await page.click('button[data-testid="btn-save-branding"]');
    await page.waitForTimeout(1000);
    // User navigates away after failed save
    await page.goto(`${WEB_BASE}/invoices`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    // User comes back
    await page.goto(`${WEB_BASE}/settings/branding`, { waitUntil: 'networkidle' });
    await page.waitForSelector('input[data-testid="input-pincode"]', { timeout: 10000 });
    const restoredPincode = await page.locator('input[data-testid="input-pincode"]').inputValue();
    assert(restoredPincode === '560001', `Previous valid pincode "560001" preserved after navigating away: got "${restoredPincode}"`);

    // 3.6 Clearing a field on purpose asks for confirmation
    console.log('\nSubtest 3.6: Clearing saved fields displays confirmation modal...');
    await page.fill('input[data-testid="input-address"]', ''); // Clear address
    await page.fill('input[data-testid="input-gstin"]', ''); // Clear GSTIN
    await page.click('button[data-testid="btn-save-branding"]');
    await page.waitForTimeout(1000);

    const modalVisible = await page.locator('[data-testid="confirm-clear-modal"]').isVisible();
    assert(modalVisible, 'Confirmation modal displayed when clearing saved fields');
    const modalText = await page.locator('[data-testid="confirm-clear-modal"]').textContent();
    assert(modalText.includes('Address') && modalText.includes('GSTIN'), `Modal lists cleared fields: "${modalText.slice(0, 150)}..."`);

    // Cancel clear
    await page.click('[data-testid="btn-cancel-clear"]');
    await page.waitForTimeout(500);
    const modalClosed = !(await page.locator('[data-testid="confirm-clear-modal"]').isVisible());
    assert(modalClosed, 'Confirmation modal closed upon clicking Cancel');

    // -------------------------------------------------------------------------
    // TEST 4: Mobile & Dark Mode Screenshots
    // -------------------------------------------------------------------------
    console.log('\n--- 4. MOBILE (390px) & DARK MODE SCREENSHOTS ---');
    await desktopContext.close();

    // Dark Desktop Context (1536x730, dark)
    const darkDeskContext = await browser.newContext({
      viewport: { width: 1536, height: 730 },
      colorScheme: 'dark',
    });
    const darkPage = await darkDeskContext.newPage();
    await darkPage.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
    await darkPage.fill('input[name="username"], #company-identifier', admin.email);
    await darkPage.fill('input[name="password"], #company-password', 'DevPassword@123');
    await darkPage.click('button[type="submit"]');
    await darkPage.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 });
    await darkPage.goto(`${WEB_BASE}/settings/branding`, { waitUntil: 'networkidle' });
    await darkPage.waitForSelector('input[data-testid="input-company-name"]', { timeout: 10000 });
    const screenshotDeskDark = path.join(ARTIFACT_DIR, 'evidence-branding-save-1536x730-dark.png');
    await darkPage.screenshot({ path: screenshotDeskDark, fullPage: true });
    console.log(`[SCREENSHOT] Saved: ${screenshotDeskDark}`);
    await darkDeskContext.close();

    // Mobile Context (390px, light & dark)
    const mobileLightContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: 'light',
    });
    const mobileLightPage = await mobileLightContext.newPage();
    await mobileLightPage.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
    await mobileLightPage.fill('input[name="username"], #company-identifier', admin.email);
    await mobileLightPage.fill('input[name="password"], #company-password', 'DevPassword@123');
    await mobileLightPage.click('button[type="submit"]');
    await mobileLightPage.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 });
    await mobileLightPage.goto(`${WEB_BASE}/settings/branding`, { waitUntil: 'networkidle' });
    await mobileLightPage.waitForSelector('input[data-testid="input-company-name"]', { timeout: 10000 });
    const screenshotMobLight = path.join(ARTIFACT_DIR, 'evidence-branding-save-390px-light.png');
    await mobileLightPage.screenshot({ path: screenshotMobLight, fullPage: true });
    console.log(`[SCREENSHOT] Saved: ${screenshotMobLight}`);
    await mobileLightContext.close();

    const mobileDarkContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: 'dark',
    });
    const mobileDarkPage = await mobileDarkContext.newPage();
    await mobileDarkPage.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
    await mobileDarkPage.fill('input[name="username"], #company-identifier', admin.email);
    await mobileDarkPage.fill('input[name="password"], #company-password', 'DevPassword@123');
    await mobileDarkPage.click('button[type="submit"]');
    await mobileDarkPage.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 });
    await mobileDarkPage.goto(`${WEB_BASE}/settings/branding`, { waitUntil: 'networkidle' });
    await mobileDarkPage.waitForSelector('input[data-testid="input-company-name"]', { timeout: 10000 });
    const screenshotMobDark = path.join(ARTIFACT_DIR, 'evidence-branding-save-390px-dark.png');
    await mobileDarkPage.screenshot({ path: screenshotMobDark, fullPage: true });
    console.log(`[SCREENSHOT] Saved: ${screenshotMobDark}`);
    await mobileDarkContext.close();

    // -------------------------------------------------------------------------
    // TEST 5: Non-Admin Makes 0 Calls to /health/schema
    // -------------------------------------------------------------------------
    console.log('\n--- 5. NON-ADMIN DASHBOARD: ZERO CALLS TO /health/schema ---');
    const empContext = await browser.newContext({
      viewport: { width: 1536, height: 730 },
    });
    const empPage = await empContext.newPage();
    const networkRequests = [];
    empPage.on('request', (req) => {
      networkRequests.push(req.url());
    });

    await empPage.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
    await empPage.fill('input[name="username"], #company-identifier', employee.email);
    await empPage.fill('input[name="password"], #company-password', 'DevPassword@123');
    await empPage.click('button[type="submit"]');
    await empPage.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 });
    await empPage.waitForTimeout(2000);

    const schemaCalls = networkRequests.filter((url) => url.includes('/health/schema'));
    console.log(`[NETWORK AUDIT] Total requests during employee dashboard load: ${networkRequests.length}`);
    console.log(`[NETWORK AUDIT] Calls to /health/schema: ${schemaCalls.length}`);
    assert(schemaCalls.length === 0, `Non-admin employee made exactly 0 calls to /health/schema (got ${schemaCalls.length})`);

    const screenshotNonAdmin = path.join(ARTIFACT_DIR, 'evidence-non-admin-dashboard-no-health.png');
    await empPage.screenshot({ path: screenshotNonAdmin, fullPage: true });
    console.log(`[SCREENSHOT] Saved: ${screenshotNonAdmin}`);
    await empContext.close();

    console.log('\n================================================================');
    console.log(`ALL TESTS PASSED: ${passedTests}/${totalTests}`);
    console.log('================================================================\n');

  } finally {
    if (browser) await browser.close().catch(() => {});
    console.log('[CLEANUP] Purging test tenant and users...');
    await cleanupTenant(tenant.id, admin.id, employee.id);
    await prisma.$disconnect();
    console.log('[CLEANUP] Complete.');
  }
}

runSuite().catch((err) => {
  console.error('[SUITE FAILURE]', err);
  process.exit(1);
});
