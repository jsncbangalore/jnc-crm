/* --- STEP 1: REPRODUCE COMPANY PROFILE & GST PAGE SAVE ISSUES ---
 * Tests:
 * 1. API endpoint POST /settings/company-profile with website variants, valid GSTIN & empty PAN, invalid pincode, email, phone.
 * 2. Problem 2 reproduction: successful save -> leave -> return; failed save -> leave -> return; trace data loss.
 * 3. Playwright UI reproduction of banner, field highlight, and form state after leaving.
 */

const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { chromium } = require('playwright');
const { PrismaClient } = require(path.join(__dirname, '../node_modules/@prisma/client'));

const prisma = new PrismaClient();
const API_BASE = process.env.API_URL || 'http://localhost:3333/api/v1';
const WEB_BASE = process.env.WEB_URL || 'http://localhost:5173';

async function main() {
  console.log('================================================================');
  console.log('STEP 1: REPRODUCTION FOR COMPANY BRANDING & GST PAGE SAVE');
  console.log('================================================================\n');

  const randSuffix = Math.floor(100000 + Math.random() * 900000);
  const tenantId = `fake-tenant-repro-${randSuffix}`;
  const userId = `fake-user-admin-${randSuffix}`;
  const jwtSecret = process.env.JWT_SECRET || 'crm-jwt-secret-key-2026';

  // 1. Create fake tenant and admin user
  console.log(`[SETUP] Creating fake tenant (${tenantId}) and fake admin user (${userId})...`);
  const tenant = await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `TEN-${randSuffix}`,
      name: `Repro Tenant ${randSuffix}`,
      slug: `repro-${randSuffix}`,
      status: 'active',
      planTier: 'enterprise',
      requireTwoFactor: false,
    },
  });

  const passwordHash = await bcrypt.hash('DevPassword@123', 10);
  const adminUser = await prisma.user.create({
    data: {
      id: userId,
      tenantId: tenant.id,
      email: `admin_${randSuffix}@example.fake`,
      name: 'Repro Admin',
      role: 'tenant_admin',
      employeeCode: `EC-ADMIN-${randSuffix}`,
      passwordHash: passwordHash,
      isActive: true,
    },
  });

  // Grant branding page access
  await prisma.userPageAccess.create({
    data: {
      tenant: { connect: { id: tenant.id } },
      user: { connect: { id: adminUser.id } },
      pages: JSON.stringify(['branding', 'audit_logs', 'mail_settings', 'invoices', 'quotations']),
    },
  });

  const token = jwt.sign(
    {
      sub: adminUser.id,
      userId: adminUser.id,
      id: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
      tenantId: tenant.id,
    },
    jwtSecret,
    {
      audience: 'crm-client',
      issuer: 'crm-api',
      expiresIn: '1h',
    }
  );

  console.log('[SETUP] Token generated successfully.\n');

  // Helper for API calls
  async function apiCall(method, endpoint, body = null) {
    const url = `${API_BASE}${endpoint}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);
    let resBody;
    const text = await res.text();
    try {
      resBody = JSON.parse(text);
    } catch {
      resBody = text;
    }

    console.log('----------------------------------------------------------------');
    console.log(`METHOD:  ${method}`);
    console.log(`URL:     ${url}`);
    console.log(`STATUS:  ${res.status} ${res.statusText}`);
    console.log(`REQUEST BODY:`);
    console.log(JSON.stringify(body, null, 2));
    console.log(`RESPONSE BODY:`);
    console.log(JSON.stringify(resBody, null, 2));
    console.log('----------------------------------------------------------------\n');

    return { status: res.status, body: resBody };
  }

  try {
    console.log('=== PART 1: TESTING WEBSITE, GSTIN, PAN, PINCODE, EMAIL, PHONE ===\n');

    // Test 1: website = 'www.example.com'
    console.log('TEST 1.1: Website = "www.example.com"');
    await apiCall('POST', '/settings/company-profile', {
      name: 'Repro Company',
      website: 'www.example.com',
    });

    // Test 2: website = 'example.com'
    console.log('TEST 1.2: Website = "example.com"');
    await apiCall('POST', '/settings/company-profile', {
      name: 'Repro Company',
      website: 'example.com',
    });

    // Test 3: website = 'http://example.com'
    console.log('TEST 1.3: Website = "http://example.com"');
    await apiCall('POST', '/settings/company-profile', {
      name: 'Repro Company',
      website: 'http://example.com',
    });

    // Test 4: website = 'https://example.com'
    console.log('TEST 1.4: Website = "https://example.com"');
    await apiCall('POST', '/settings/company-profile', {
      name: 'Repro Company',
      website: 'https://example.com',
    });

    // Test 5: website = '' (empty)
    console.log('TEST 1.5: Website = "" (empty)');
    await apiCall('POST', '/settings/company-profile', {
      name: 'Repro Company',
      website: '',
    });

    // Test 6: valid GSTIN and empty PAN
    console.log('TEST 1.6: Valid GSTIN ("29AABCU9603R1Z2") and empty PAN ("")');
    await apiCall('POST', '/settings/company-profile', {
      name: 'Repro Company',
      gstin: '29AABCU9603R1Z2',
      pan: '',
    });

    // Test 7: invalid pincode ('123' and 'abcdef')
    console.log('TEST 1.7: Invalid Pincode ("123")');
    await apiCall('POST', '/settings/company-profile', {
      name: 'Repro Company',
      pincode: '123',
    });

    // Test 8: invalid email ('notanemail')
    console.log('TEST 1.8: Invalid Email ("notanemail")');
    await apiCall('POST', '/settings/company-profile', {
      name: 'Repro Company',
      email: 'notanemail',
    });

    // Test 9: invalid phone ('123')
    console.log('TEST 1.9: Invalid Phone ("123")');
    await apiCall('POST', '/settings/company-profile', {
      name: 'Repro Company',
      phone: '123',
    });

    console.log('=== PART 2: REPRODUCING PROBLEM 2 (SAVE -> LEAVE -> COME BACK) ===\n');

    // 2.1 Fill and SAVE profile successfully
    console.log('TEST 2.1: Fill and SAVE profile successfully with all valid fields');
    const validProfile = {
      name: 'Acme Test Corp',
      phone: '+919876543210',
      email: 'billing@acmetest.example.com',
      address: '123 Innovation Boulevard, Tech Park',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
      website: 'https://acmetest.example.com',
      gstin: '29AABCU9603R1Z2',
      pan: 'AABCU9603R',
      invoicePrefix: 'INV',
    };
    const saveRes1 = await apiCall('POST', '/settings/company-profile', validProfile);
    console.log(`Save result: ${saveRes1.status}`);

    // Verify DB state after save
    let dbTenant = await prisma.tenant.findUnique({ where: { id: tenant.id } });
    console.log('[DB STATE AFTER VALID SAVE]:', {
      name: dbTenant.name,
      phone: dbTenant.phone,
      email: dbTenant.email,
      address: dbTenant.address,
      city: dbTenant.city,
      state: dbTenant.state,
      pincode: dbTenant.pincode,
      website: dbTenant.website,
      gstin: dbTenant.gstin,
      pan: dbTenant.pan,
    });

    // 2.2 Leave the page (navigate to audit-logs / mail-accounts)
    console.log('\nTEST 2.2: User leaves the page (calls other endpoint, e.g. GET /settings/mail-accounts)');
    await apiCall('GET', '/settings/mail-accounts');

    // 2.3 Come back to branding page: GET /settings/company-profile
    console.log('TEST 2.3: User comes back (calls GET /settings/company-profile)');
    const getRes1 = await apiCall('GET', '/settings/company-profile');
    console.log('[FIELDS RETURNED ON RETURN]:', {
      name: getRes1.body?.name,
      phone: getRes1.body?.phone,
      email: getRes1.body?.email,
      address: getRes1.body?.address,
      city: getRes1.body?.city,
      state: getRes1.body?.state,
      pincode: getRes1.body?.pincode,
      website: getRes1.body?.website,
      gstin: getRes1.body?.gstin,
      pan: getRes1.body?.pan,
    });

    // 2.4 FAILED SAVE: User edits website to 'www.example.com' and attempts save
    console.log('\nTEST 2.4: User edits website to "www.example.com" and attempts save');
    const failedPayload = {
      ...validProfile,
      website: 'www.example.com',
      address: '999 Modified Address (Unsaved)',
    };
    const saveRes2 = await apiCall('POST', '/settings/company-profile', failedPayload);
    console.log(`Failed save result: ${saveRes2.status} (Expected 400)`);

    // Check DB state right after failed save
    dbTenant = await prisma.tenant.findUnique({ where: { id: tenant.id } });
    console.log('[DB STATE AFTER FAILED SAVE]:', {
      address: dbTenant.address,
      website: dbTenant.website,
    });

    // 2.5 User leaves after failed save and comes back
    console.log('\nTEST 2.5: User leaves after failed save (GET /settings/audit-logs) and comes back');
    await apiCall('GET', '/settings/audit-logs');
    const getRes2 = await apiCall('GET', '/settings/company-profile');
    console.log('[FIELDS RETURNED ON RETURN AFTER FAILED SAVE]:', {
      name: getRes2.body?.name,
      address: getRes2.body?.address,
      website: getRes2.body?.website,
    });

    // 2.6 What happens if a save is performed with empty fields (e.g. form submitted while empty)?
    console.log('\nTEST 2.6: Submitting empty fields or only name');
    // Notice in BrandingSettingsPage.tsx lines 389-410:
    // address: address.trim() || undefined
    // If address is empty string, it sends undefined, BUT what if user explicitly clears it?
    // And what does updateCompanyProfile do if someone sends empty string?
    console.log('Sending { name: "Acme Test Corp", address: "" }...');
    const blankSaveRes = await apiCall('POST', '/settings/company-profile', {
      name: 'Acme Test Corp',
      address: '',
    });
    dbTenant = await prisma.tenant.findUnique({ where: { id: tenant.id } });
    console.log('[DB STATE AFTER SENDING address: ""]:', {
      address: dbTenant.address,
    });

    console.log('=== PART 3: PLAYWRIGHT BROWSER REPRODUCTION ===\n');
    console.log('[PLAYWRIGHT] Launching browser...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1536, height: 730 },
    });
    const page = await context.newPage();

    console.log(`[PLAYWRIGHT] Logging in as ${adminUser.email}...`);
    await page.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[name="username"], #company-identifier', { timeout: 10000 });
    await page.fill('input[name="username"], #company-identifier', adminUser.email);
    await page.fill('input[name="password"], #company-password', 'DevPassword@123');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    await page.waitForTimeout(1000);

    console.log('[PLAYWRIGHT] Navigating to /settings/branding...');
    await page.goto(`${WEB_BASE}/settings/branding`, { waitUntil: 'networkidle' });
    console.log('[PLAYWRIGHT] Current page URL:', page.url());
    console.log('[PLAYWRIGHT] Page title:', await page.title());
    await page.waitForTimeout(1000);

    // Type website 'www.example.com'
    console.log('[PLAYWRIGHT] Typing website "www.example.com"...');
    const websiteInput = page.locator('input[data-testid="input-website"]');
    await websiteInput.fill('www.example.com');

    // Also fill company name
    const companyNameInput = page.locator('input[name="brandingCompanyName"]');
    await companyNameInput.fill('Playwright Test Corp');

    // Click "Save All Settings"
    console.log('[PLAYWRIGHT] Clicking Save All Settings...');
    const saveButton = page.locator('button[data-testid="btn-save-branding"]');
    await saveButton.click();
    await page.waitForTimeout(1500);

    // Check banner text
    const banner = page.locator('[data-testid="bottom-branding-feedback"]');
    const bannerText = await banner.textContent().catch(() => 'NONE');
    console.log(`[PLAYWRIGHT BANNER TEXT]: "${bannerText.trim()}"`);

    // Check if input-website has red border or error class
    const websiteClasses = await websiteInput.getAttribute('class');
    console.log(`[PLAYWRIGHT WEBSITE CLASS]: "${websiteClasses}"`);

    // Check if error message is under website field
    const websiteError = page.locator('[data-testid="error-website"]');
    const websiteErrorCount = await websiteError.count();
    const websiteErrorText = websiteErrorCount > 0 ? await websiteError.textContent() : 'NOT FOUND';
    console.log(`[PLAYWRIGHT WEBSITE ERROR UNDER FIELD]: "${websiteErrorText.trim()}"`);

    // Check which element has focus
    const focusedTagName = await page.evaluate(() => document.activeElement ? `${document.activeElement.tagName} id=${document.activeElement.id}` : 'NONE');
    console.log(`[PLAYWRIGHT ACTIVE/FOCUSED ELEMENT]: ${focusedTagName}`);

    // Take screenshot of reproduction
    const screenshotPath = path.join(__dirname, '../repro-settings-save.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`[PLAYWRIGHT SCREENSHOT SAVED]: ${screenshotPath}`);

    await browser.close();

  } finally {
    // Clean up
    console.log('\n[CLEANUP] Deleting fake tenant and user...');
    await prisma.userPageAccess.deleteMany({ where: { userId: adminUser.id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: adminUser.id } }).catch(() => {});
    await prisma.tenant.deleteMany({ where: { id: tenant.id } }).catch(() => {});
    await prisma.$disconnect();
    console.log('[CLEANUP] Done.\n');
  }
}

main().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});
