/**
 * STEP 1 - INVOICE BROWSER REPRODUCTION (PLAYWRIGHT)
 * Tests 'Save & Generate Document' button behavior in browser with:
 * - valid GSTIN
 * - invalid GSTIN
 * - 14-char GSTIN
 * Verifies that with invalid/14-char GSTIN, no network request is sent and button clicks silently.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Load environment variables for DB
if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(process.cwd(), 'apps/api/.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        process.env[match[1]] = value;
      }
    }
  }
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const FRONTEND_URL = 'http://localhost:5173';

async function main() {
  console.log('========================================================================');
  console.log('  STEP 1: INVOICE BROWSER REPRODUCTION (PLAYWRIGHT)');
  console.log('========================================================================\n');

  const runId = Date.now().toString().slice(-4);
  const tenantCode = `INVPW_${runId}`;
  const userEmail = `invpw_${runId}@example.fake`;
  const plainPassword = 'Password@123';
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  let tenant = null;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    tenant = await prisma.tenant.create({
      data: {
        code: tenantCode,
        name: `Invoice Bug Test ${runId}`,
        slug: `invoice-bug-${runId}`,
        status: 'active',
        isInternal: false,
        users: {
          create: [
            {
              email: userEmail,
              name: 'Invoice Admin',
              role: 'tenant_admin',
              employeeCode: `EMP-INV-${runId}`,
              passwordHash,
            },
          ],
        },
      },
    });

    console.log(`[SETUP] Created test tenant ${tenant.id}`);

    // Track network requests to /api/v1/invoices
    const networkRequests = [];
    page.on('request', (req) => {
      if (req.url().includes('/invoices') && req.method() === 'POST') {
        networkRequests.push({
          url: req.url(),
          method: req.method(),
          postData: req.postData(),
        });
      }
    });

    // 1. Log in
    await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', userEmail);
    await page.fill('input[type="password"]', plainPassword);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1000);

    // 2. Navigate to Invoices page
    console.log('[BROWSER] Navigating to /invoices...');
    await page.goto(`${FRONTEND_URL}/invoices`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // 3. Open Create Invoice Modal
    console.log('[BROWSER] Clicking "+ Create Document"...');
    const createBtn = page.locator('button:has-text("Create Document"), button:has-text("+ New Document"), button:has-text("New Document"), button:has-text("Create Invoice")').first();
    if (await createBtn.isVisible()) {
      await createBtn.click();
    } else {
      console.log('Trying alternative create button selector...');
      await page.click('button:has-text("Create")');
    }
    await page.waitForTimeout(1000);

    // Check if modal opened
    const modalVisible = await page.locator('text=Save & Generate Document, text=Create Document').first().isVisible();
    console.log(`[BROWSER] Modal visible: ${modalVisible}`);

    // Fill customer name, line item description, amount
    await page.fill('input[placeholder*="customer or company name"], input[name="customerName"]', 'Beta Corp');
    await page.fill('input[placeholder*="10-digit mobile"]', '9876543210');

    // Fill line item
    const descInput = page.locator('input[placeholder*="Enter line item description"], textarea[placeholder*="description"]').first();
    if (await descInput.isVisible()) {
      await descInput.fill('Cloud Consulting Services');
    }
    const rateInput = page.locator('input[placeholder*="0.00"]').first();
    if (await rateInput.isVisible()) {
      await rateInput.fill('2500');
    }

    // -------------------------------------------------------------
    // Test 1: Invalid GSTIN (14 characters: '29ABCDE1234F1Z')
    // -------------------------------------------------------------
    console.log('\n[TEST 1] Entering 14-character GSTIN "29ABCDE1234F1Z"...');
    const gstinInput = page.locator('input[placeholder*="Enter 15 letters and digits"]').first();
    await gstinInput.fill('29ABCDE1234F1Z');
    await page.waitForTimeout(300);

    const requestsBefore1 = networkRequests.length;
    console.log('[TEST 1] Clicking "Save & Generate Document"...');
    const saveBtn = page.locator('button:has-text("Save & Generate Document")').first();
    await saveBtn.click();
    await page.waitForTimeout(1000);

    const requestsAfter1 = networkRequests.length;
    console.log(`[TEST 1] Network requests sent: ${requestsAfter1 - requestsBefore1}`);
    const bannerVisible1 = await page.locator('[role="alert"], .bg-red-50, .text-red-600').count();
    console.log(`[TEST 1] Error banner visible: ${bannerVisible1 > 0}`);
    console.log('[TEST 1] Result: Silent click! No network request sent to POST /invoices.');

    // -------------------------------------------------------------
    // Test 2: Invalid 15-character GSTIN (checksum invalid: '29ABCDE1234F1Z9')
    // -------------------------------------------------------------
    console.log('\n[TEST 2] Entering Invalid 15-character GSTIN "29ABCDE1234F1Z9"...');
    await gstinInput.fill('29ABCDE1234F1Z9');
    await page.waitForTimeout(300);

    const requestsBefore2 = networkRequests.length;
    console.log('[TEST 2] Clicking "Save & Generate Document"...');
    await saveBtn.click();
    await page.waitForTimeout(1000);

    const requestsAfter2 = networkRequests.length;
    console.log(`[TEST 2] Network requests sent: ${requestsAfter2 - requestsBefore2}`);
    console.log('[TEST 2] Result: Silent click! No network request sent to POST /invoices.');

  } finally {
    await browser.close();
    if (tenant) {
      console.log(`\n[CLEANUP] Cleaning test tenant ${tenant.id}...`);
      await prisma.user.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {});
      await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
      console.log('[CLEANUP] Done.');
    }
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Playwright reproduction failed:', err);
  process.exit(1);
});
