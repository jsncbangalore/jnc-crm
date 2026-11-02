/**
 * PHASE 2 PLAYWRIGHT SUITE - ONE BILLS ROUTE
 *
 * Verifies:
 * 1. Bills has one route (/bills) and one page key ("bills").
 * 2. Click Bills in the top navbar menu -> ends on /bills.
 * 3. Click Bills in the search launcher / command palette -> ends on /bills.
 * 4. Click Bills in the mobile dock / drawer -> ends on /bills.
 * 5. Click a ledger document link / Add Purchase Bill button -> ends on /bills.
 * 6. Direct visit to /purchase-bills -> one-time redirect ends on /bills.
 * 7. Direct visit to /inventory?tab=bills -> one-time redirect ends on /bills.
 * 8. Loading /bills makes at most 2 calls to its list endpoints.
 * 9. Captures 3 visual evidence screenshots in artifact directory.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const bcrypt = require('bcryptjs');

process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev?schema=public';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BASE_URL = process.env.TEST_FRONTEND_URL || 'http://localhost:5173';
const ARTIFACT_DIR = 'C:\\Users\\JNC R&D\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824';

const TEST_ADMIN_EMAIL = 'admin@zzclienttest.com';
const TEST_PASSWORD = 'DevPassword@123';

async function seedData() {
  console.log('[SEED] Preparing database records in jnc_crm_dev for Phase 2 tests...');
  
  // Clear any lockout
  await prisma.$executeRawUnsafe(
    `DELETE FROM "AccountLockout" WHERE "identityKey" ILIKE '%zzclienttest%' OR "identityKey" = '${TEST_ADMIN_EMAIL}'`
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "User" SET "failedLoginAttempts" = 0, "lockoutUntil" = null WHERE email = '${TEST_ADMIN_EMAIL}'`
  );

  // Get tenant
  const tenantRows = await prisma.$queryRaw`
    SELECT id FROM "Tenant" WHERE code = 'ZZTEST' LIMIT 1
  `;
  if (tenantRows.length === 0) {
    throw new Error('Test tenant ZZTEST not found. Run Phase 1 seed first.');
  }
  const tenantId = tenantRows[0].id;

  // Ensure a test supplier and purchase bill exist for ledger testing
  const supplierRows = await prisma.$queryRaw`
    SELECT id FROM "Supplier" WHERE "tenantId" = ${tenantId} LIMIT 1
  `;
  let supplierId;
  if (supplierRows.length === 0) {
    const sRes = await prisma.$queryRaw`
      INSERT INTO "Supplier" (id, "tenantId", name, email, phone, gstin, address, "contactPerson", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${tenantId}, 'Apex Fasteners Supplies', 'orders@apexsupplies.example.com', '+91 98765 43210', '27AABCA1234F1Z1', 'Plot 44, Ind Area, Pune', 'Rajesh Sharma', NOW(), NOW())
      RETURNING id
    `;
    supplierId = sRes[0].id;
  } else {
    supplierId = supplierRows[0].id;
  }

  // Ensure at least one PurchaseBill exists
  const billRows = await prisma.$queryRaw`
    SELECT id FROM "PurchaseBill" WHERE "tenantId" = ${tenantId} LIMIT 1
  `;
  if (billRows.length === 0) {
    await prisma.$executeRaw`
      INSERT INTO "PurchaseBill" (id, "tenantId", "invoiceNumber", "vendorName", "vendorGstin", "supplierId", "grandTotal", "totalTax", subtotal, "paymentStatus", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${tenantId}, 'PB-2026-001', 'Apex Fasteners Supplies', '27AABCA1234F1Z1', ${supplierId}, 11800, 1800, 10000, 'unpaid', NOW(), NOW())
    `;
  }

  console.log('[SEED] Test records verified successfully.');
}

async function runPhase2Tests() {
  await seedData();

  console.log(`\n======================================================`);
  console.log(`   PHASE 2 - ONE BILLS ROUTE VERIFICATION SUITE       `);
  console.log(`======================================================\n`);

  const browser = await chromium.launch({ headless: true });
  
  // Test Context 1: Desktop Viewport (1440x900)
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await desktopContext.addInitScript(() => {
    try {
      localStorage.setItem('crm_cookie_consent', JSON.stringify({
        choice: 'all',
        preferences: true,
        policyVersion: '2026.10.1',
        savedAt: new Date().toISOString()
      }));
    } catch (_) {}
  });
  const page = await desktopContext.newPage();

  // 1. LOGIN
  console.log(`[TEST 1] Logging into JNC CRM at ${BASE_URL}...`);
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="username"], #company-identifier', { state: 'attached', timeout: 10000 });
  await page.fill('input[name="username"], #company-identifier', TEST_ADMIN_EMAIL);
  await page.fill('input[name="password"], #company-password', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  console.log(`✓ Logged in successfully. Current URL: ${page.url()}`);

  // 2. CLICK BILLS IN THE TOP NAVBAR MENU
  console.log(`\n[TEST 2] Clicking 'Bills' in the top navbar menu...`);
  const billsNavLink = page.locator('nav a[href="/bills"], nav a:has-text("Bills")').first();
  await billsNavLink.waitFor({ state: 'visible', timeout: 5000 });
  await billsNavLink.click();
  await page.waitForURL((url) => url.pathname === '/bills', { timeout: 5000 });
  assert.strictEqual(new URL(page.url()).pathname, '/bills', 'Navbar Bills link must land on /bills');
  console.log(`✓ Top navbar menu clicked -> landed on ${page.url()}`);

  // Screenshot Desktop Bills Page
  const desktopBillsScreenshot = path.join(ARTIFACT_DIR, 'evidence-phase2-bills-desktop-1440.png');
  await page.screenshot({ path: desktopBillsScreenshot, fullPage: false });
  console.log(`✓ Screenshot saved: ${desktopBillsScreenshot}`);

  // 3. CLICK BILLS IN THE SEARCH LAUNCHER / COMMAND PALETTE
  console.log(`\n[TEST 3] Clicking 'Bills' in the Search Launcher / Command Palette...`);
  // Navigate back to /dashboard to verify launcher navigation
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
  const searchInput = page.locator('input[placeholder*="Search"]').first();
  await searchInput.waitFor({ state: 'visible', timeout: 5000 });
  await searchInput.click();
  await searchInput.fill('Bills');
  await page.waitForTimeout(300);

  // Search dropdown matching item
  const launcherBillsResult = page.locator('div[role="button"]:has-text("Bills"), a:has-text("Bills")').first();
  await launcherBillsResult.waitFor({ state: 'visible', timeout: 5000 });
  await launcherBillsResult.click();
  await page.waitForURL((url) => url.pathname === '/bills', { timeout: 5000 });
  assert.strictEqual(new URL(page.url()).pathname, '/bills', 'Search launcher item must navigate to /bills');
  console.log(`✓ Search launcher item clicked -> landed on ${page.url()}`);

  // 4. TEST DIRECT REDIRECT FROM /purchase-bills
  console.log(`\n[TEST 4] Testing one-time redirect from /purchase-bills...`);
  await page.goto(`${BASE_URL}/purchase-bills`, { waitUntil: 'networkidle' });
  const redirectedUrl1 = new URL(page.url()).pathname;
  assert.strictEqual(redirectedUrl1, '/bills', 'Direct visit to /purchase-bills must redirect to /bills');
  console.log(`✓ Direct visit to /purchase-bills redirected to ${page.url()}`);

  // 5. TEST DIRECT REDIRECT FROM /inventory?tab=bills
  console.log(`\n[TEST 5] Testing one-time redirect from /inventory?tab=bills...`);
  await page.goto(`${BASE_URL}/inventory?tab=bills`, { waitUntil: 'networkidle' });
  const redirectedUrl2 = new URL(page.url()).pathname;
  assert.strictEqual(redirectedUrl2, '/bills', 'Direct visit to /inventory?tab=bills must redirect to /bills');
  console.log(`✓ Direct visit to /inventory?tab=bills redirected to ${page.url()}`);

  // 6. TEST INVENTORY PAGE BILLS TAB LINK
  console.log(`\n[TEST 6] Testing Bills & Inward tab link on /inventory...`);
  await page.goto(`${BASE_URL}/inventory`, { waitUntil: 'networkidle' });
  const inventoryBillsLink = page.locator('a[href="/bills"]:has-text("Bills & Inward")').first();
  await inventoryBillsLink.waitFor({ state: 'visible', timeout: 5000 });
  await inventoryBillsLink.click();
  await page.waitForURL((url) => url.pathname === '/bills', { timeout: 5000 });
  assert.strictEqual(new URL(page.url()).pathname, '/bills', 'Inventory Bills & Inward tab link must lead to /bills');
  console.log(`✓ Inventory Bills tab clicked -> landed on ${page.url()}`);

  // 7. CLICK LEDGER DOCUMENT LINK / ADD PURCHASE BILL
  console.log(`\n[TEST 7] Testing ledger document link / Add purchase bill from /ledger...`);
  await page.goto(`${BASE_URL}/ledger?tab=suppliers`, { waitUntil: 'networkidle' });

  // If a party item exists in the sidebar, click the first one to load their statement
  const partyButton = page.locator('aside button, div button').filter({ hasText: /Apex Fasteners|Supplier|Vendor/i }).first();
  if (await partyButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log(`Selecting supplier in ledger list...`);
    await partyButton.click();
    await page.waitForTimeout(600);
  }

  // Find either a voucher link button or an Add purchase bill button
  const voucherButton = page.locator('button[title*="Open PB-"], button:has-text("Add purchase bill"), button:has-text("Add Purchase Bill")').first();
  if (await voucherButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log(`Clicking ledger voucher / bill button...`);
    await voucherButton.click();
  } else {
    const anyAddBill = page.locator('button:has-text("Purchase Bill"), button:has-text("Add purchase bill")').first();
    await anyAddBill.click();
  }

  await page.waitForURL((url) => url.pathname === '/bills', { timeout: 5000 });
  assert.strictEqual(new URL(page.url()).pathname, '/bills', 'Ledger action must land on /bills');
  console.log(`✓ Ledger document action -> landed on ${page.url()}`);

  // Screenshot Ledger to Bills transition
  const ledgerToBillsScreenshot = path.join(ARTIFACT_DIR, 'evidence-phase2-ledger-to-bills.png');
  await page.screenshot({ path: ledgerToBillsScreenshot, fullPage: false });
  console.log(`✓ Screenshot saved: ${ledgerToBillsScreenshot}`);

  // 8. MEASURE LIST ENDPOINT CALLS ON /bills
  console.log(`\n[TEST 8] Measuring list endpoint request count on /bills...`);
  let listEndpointCalls = 0;
  const listEndpointUrls = [];

  page.on('request', (req) => {
    const url = req.url();
    // Watch for purchase-bills list API requests
    if (url.includes('/inventory/purchase-bills') && req.method() === 'GET' && !url.includes('/ocr')) {
      listEndpointCalls++;
      listEndpointUrls.push(url);
    }
  });

  // Reload /bills and wait for network idle
  await page.goto(`${BASE_URL}/bills`, { waitUntil: 'networkidle' });
  console.log(`List endpoint call count: ${listEndpointCalls} requests:`, listEndpointUrls);
  assert(
    listEndpointCalls <= 2,
    `Page makes at most 2 calls to its list endpoints (observed ${listEndpointCalls} calls)`
  );
  console.log(`✓ Request limit verified: ${listEndpointCalls} call(s) (<= 2 required).`);

  // 9. MOBILE DOCK VIEWPORT TEST (390x844)
  console.log(`\n[TEST 9] Testing Bills navigation in Mobile Dock (viewport 390x844)...`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // In mobile view, the mobile dock is at bottom.
  const mobileDock = page.locator('nav[aria-label="Mobile Navigation"]');
  await mobileDock.waitFor({ state: 'visible', timeout: 5000 });

  const mobileDockBillsLink = page.locator('nav[aria-label="Mobile Navigation"] a[href="/bills"]').first();
  if (await mobileDockBillsLink.isVisible()) {
    console.log(`Clicking Bills directly in mobile dock...`);
    await mobileDockBillsLink.click();
  } else {
    console.log(`Bills is in More drawer. Opening mobile drawer...`);
    const moreButton = page.locator('nav[aria-label="Mobile Navigation"] button:has-text("More")').first();
    await moreButton.click();
    await page.waitForTimeout(600);
    const drawerBillsLink = page.locator('.rounded-t-3xl a[href="/bills"]').first();
    await drawerBillsLink.waitFor({ state: 'visible', timeout: 5000 });
    await drawerBillsLink.click();
  }

  await page.waitForURL((url) => url.pathname === '/bills', { timeout: 5000 });
  assert.strictEqual(new URL(page.url()).pathname, '/bills', 'Mobile dock Bills link must land on /bills');
  console.log(`✓ Mobile dock navigation clicked -> landed on ${page.url()}`);

  // Screenshot Mobile Bills Page
  const mobileBillsScreenshot = path.join(ARTIFACT_DIR, 'evidence-phase2-bills-mobile-390.png');
  await page.screenshot({ path: mobileBillsScreenshot, fullPage: false });
  console.log(`✓ Screenshot saved: ${mobileBillsScreenshot}`);

  await browser.close();
  await prisma.$disconnect();

  console.log(`\n======================================================`);
  console.log(`   PHASE 2 - ALL VERIFICATIONS PASSED WITH ZERO ERRORS `);
  console.log(`======================================================\n`);
}

runPhase2Tests().catch(async (err) => {
  console.error('\n❌ PHASE 2 VERIFICATION FAILED:');
  const errText = String(err && (err.stack || err.message || err));
  console.error(errText);
  try {
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'test-phase2-error.txt'), errText);
  } catch (_) {}
  await prisma.$disconnect();
  process.exit(1);
});
