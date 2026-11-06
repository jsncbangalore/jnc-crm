/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * rights: 'All rights reserved.'
 * ----------------------------------------------------- */

const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function loadDevEnv() {
  const envPath = path.resolve(__dirname, '../apps/api/.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.substring(0, idx).trim();
        let val = trimmed.substring(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadDevEnv();

const prisma = new PrismaClient();
const BASE_URL = process.env.BASE_URL || 'http://localhost:5174';
const API_URL = 'http://localhost:3333/api/v1';

async function runUnregisteredPartyTest() {
  console.log('========================================================================');
  console.log('PLAYWRIGHT TEST: UNREGISTERED PARTY ("sk"-like) PAYMENT & REGISTRATION FLOW');
  console.log(`Target Base URL: ${BASE_URL}`);
  console.log('========================================================================\n');

  let browser;
  let testTenant;
  let testInvoice;
  let createdCustomerId;

  try {
    // 1. Get dev tenant and user
    const adminUser = await prisma.user.findFirst({
      where: { role: 'tenant_admin' },
      include: { tenant: true },
    });
    if (!adminUser || !adminUser.tenant) {
      throw new Error('Tenant / Admin not found in dev database.');
    }
    testTenant = adminUser.tenant;

    const partyName = `SK Enterprises ${Date.now().toString().slice(-5)}`;
    console.log(`[1] Setting up unlinked invoice for party: "${partyName}"...`);

    // Create an unlinked invoice (customerId = null, companyId = null)
    testInvoice = await prisma.invoice.create({
      data: {
        tenant: { connect: { id: testTenant.id } },
        invoiceNumber: `INV-SK-${Date.now().toString().slice(-4)}`,
        docType: 'tax_invoice',
        invoiceDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 86400000),
        customerName: partyName,
        customerPhone: '+91 98765 43210',
        customerEmail: 'accounts@sk-enterprises.test',
        cgstAmount: 450,
        sgstAmount: 450,
        totalAmount: 5900,
        balanceDue: 5900,
        paymentStatus: 'unpaid',
        createdBy: { connect: { id: adminUser.id } },
        lines: {
          create: [
            {
              description: 'SK Inverter Module',
              quantity: 1,
              unitPrice: 5000,
              taxRate: 18,
              lineTotal: 5900,
            },
          ],
        },
      },
    });

    console.log(`    Created unlinked invoice: ${testInvoice.invoiceNumber} (ID: ${testInvoice.id})`);

    // 2. Direct Backend Check: Synthetic party 'not-linked' must be rejected with 409 LINKED_RECORD_MISSING
    console.log('[2] Testing API contract: synthetic "not-linked" customerId must return 409 LINKED_RECORD_MISSING...');
    
    // Create JWT for API call
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      {
        sub: adminUser.id,
        id: adminUser.id,
        email: adminUser.email,
        role: adminUser.role,
        tenantId: testTenant.id,
        tokenVersion: adminUser.tokenVersion,
        isPlatformAdmin: false,
      },
      process.env.JWT_SECRET || 'dev_jwt_secret_key_at_least_32_characters_long_for_security_12345',
      {
        expiresIn: '1h',
        issuer: process.env.JWT_ISSUER || 'crm-api',
        audience: process.env.JWT_AUDIENCE || 'crm-client',
      }
    );

    const apiRes = await fetch(`${API_URL}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        customerId: 'not-linked',
        invoiceId: testInvoice.id,
        amount: 5900,
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMethod: 'NEFT',
        transactionRef: 'UTR1234567890',
      }),
    });

    const apiBody = await apiRes.json();
    assert.strictEqual(apiRes.status, 409, `Expected HTTP 409, got ${apiRes.status}`);
    assert.strictEqual(apiBody.code, 'LINKED_RECORD_MISSING', `Expected LINKED_RECORD_MISSING, got ${apiBody.code}`);
    assert.strictEqual(apiBody.field, 'customerId', `Expected field customerId, got ${apiBody.field}`);
    assert.strictEqual(apiBody.message, 'This customer is not registered yet.', `Expected message 'This customer is not registered yet.', got '${apiBody.message}'`);

    console.log('    [PASS] Direct API call with "not-linked" rejected with 409 LINKED_RECORD_MISSING.');

    // 3. Launch browser and test UI Flow
    console.log('[3] Launching Playwright browser...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();

    const userWithPages = {
      id: adminUser.id,
      name: adminUser.name,
      email: adminUser.email,
      role: adminUser.role,
      tenantId: testTenant.id,
      tenant: { id: testTenant.id, name: testTenant.name, code: testTenant.code },
      effectivePages: ['invoices', 'orders', 'customers', 'ledger', 'dashboard'],
    };

    await page.addInitScript((u) => {
      localStorage.setItem('crm_user', JSON.stringify(u));
      localStorage.setItem('crm_portal', 'staff');
      localStorage.setItem('crm_staff_refresh_token', 'dev_mock_refresh_token');
      sessionStorage.setItem('crm_portal', 'staff');
      sessionStorage.setItem('crm_tab_user_id', u.id);
      sessionStorage.setItem('crm_tab_user_email', u.email);
    }, userWithPages);

    await page.route('**/api/v1/auth/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: token,
          refreshToken: 'dev_mock_refresh_token',
          user: userWithPages,
        }),
      });
    });

    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(userWithPages),
      });
    });

    // 4. Navigate directly to Invoices with auto-open for test invoice
    console.log(`[4] Navigating to /invoices?invoiceId=${testInvoice.id}&open=1...`);
    await page.goto(`${BASE_URL}/invoices?invoiceId=${testInvoice.id}&open=1`, { waitUntil: 'domcontentloaded' });

    // Wait for the Invoice Modal or table to appear
    console.log('[5] Waiting for invoice modal or table view...');
    const markAsPaidModalBtn = page.locator('button:has-text("Mark as fully paid")').first();
    await markAsPaidModalBtn.waitFor({ state: 'visible', timeout: 15000 });
    console.log('    Found "Mark as fully paid" action button.');

    // 5. Click "Mark as fully paid"
    console.log('[6] Clicking "Mark as fully paid"...');
    await markAsPaidModalBtn.click();
    await page.waitForTimeout(1000);
    const dialogCount = await page.locator('[role="dialog"]').count();
    console.log(`    Dialogs count: ${dialogCount}`);
    await page.screenshot({ path: 'scripts/evidence-debug-unregistered.png' });

    // 5. Verify the "Register this customer first" step is displayed
    console.log('[7] Verifying "Register this customer first" prompt in UnifiedRecordPaymentModal...');
    const regBanner = page.locator('text=Register this customer first');
    await regBanner.waitFor({ state: 'visible', timeout: 8000 });
    console.log('    [PASS] "Register this customer first" banner is displayed.');

    // Verify Customer Name is pre-filled with party name
    const nameInput = page.locator('input[placeholder*="e.g. Acme Corp"]');
    const nameVal = await nameInput.inputValue();
    assert.strictEqual(nameVal, partyName, `Expected pre-filled name "${partyName}", got "${nameVal}"`);
    console.log(`    [PASS] Customer name pre-filled correctly: "${nameVal}".`);

    // 6. Fill GSTIN and register customer
    console.log('[8] Submitting one-click registration & document linkage...');
    const uniqueGstin = `29SKENT${Date.now().toString().slice(-4)}1Z5`;
    const gstinInput = page.locator('input[placeholder*="29ABCDE1234F1Z5"]');
    await gstinInput.fill(uniqueGstin);

    // Fill reference for receipt to confirm typed data is preserved
    const refInput = page.locator('#crm-payment-transaction-reference');
    await refInput.waitFor({ state: 'visible', timeout: 5000 });
    await refInput.fill('UTRSK12345678');

    // Click Register & Link Customer button
    const regBtn = page.locator('button:has-text("Register & Link Customer")');
    await regBtn.click();

    // Verify success toast/message
    const successToast = page.locator('text=Customer registered and documents linked');
    await successToast.waitFor({ state: 'visible', timeout: 10000 });
    console.log('    [PASS] Customer registered and documents linked toast received.');

    // Verify that the customer was created and the invoice was linked in the database
    const updatedInvoice = await prisma.invoice.findUnique({
      where: { id: testInvoice.id },
      include: { company: true },
    });
    assert.ok(updatedInvoice.customerId || updatedInvoice.companyId, 'Invoice customerId should be updated to real company ID');
    const linkedCompany = updatedInvoice.company;
    assert.strictEqual(linkedCompany.name, partyName, 'Linked customer name matches');
    createdCustomerId = linkedCompany.id;
    console.log(`    [PASS] Database verification: invoice linked to newly registered Customer ID: ${createdCustomerId}.`);

    // 7. Verify typed receipt data was kept and complete the payment
    console.log('[9] Verifying typed receipt data preserved and submitting payment...');
    const currentRef = await refInput.inputValue();
    console.log(`    Preserved reference value: "${currentRef}"`);
    assert.strictEqual(currentRef, 'UTRSK12345678', 'Typed reference was preserved through customer registration');
    
    const recordReceiptBtn = page.locator('#payment-submit-btn');
    await recordReceiptBtn.scrollIntoViewIfNeeded();
    await recordReceiptBtn.click();

    // Wait for modal to close and success toast
    await page.waitForTimeout(1500);

    // Verify invoice balance in database
    const finalInvoice = await prisma.invoice.findUnique({
      where: { id: testInvoice.id },
    });
    console.log(`    Final Invoice Status: ${finalInvoice.paymentStatus} | Balance Due: ₹${finalInvoice.balanceDue}`);
    assert.ok(
      finalInvoice.balanceDue <= 0.01 || finalInvoice.paymentStatus === 'paid',
      'Invoice should be marked paid with balance 0'
    );
    console.log('    [PASS] Invoice successfully marked paid with zero balance.');

    console.log('\n========================================================================');
    console.log('UNREGISTERED PARTY PLAYWRIGHT TEST PASSED WITH 100% SUCCESS!');
    console.log('========================================================================\n');
  } finally {
    if (browser) await browser.close();

    // Cleanup test data
    console.log('Cleaning up test records...');
    try {
      if (testInvoice) {
        await prisma.paymentAllocation.deleteMany({ where: { invoiceId: testInvoice.id } });
        await prisma.invoiceLine.deleteMany({ where: { invoiceId: testInvoice.id } });
        await prisma.invoice.deleteMany({ where: { id: testInvoice.id } });
      }
      if (createdCustomerId) {
        await prisma.ledgerEntry.deleteMany({ where: { partyId: createdCustomerId } });
        await prisma.paymentRecord.deleteMany({ where: { customerId: createdCustomerId } });
        await prisma.contact.deleteMany({ where: { companyId: createdCustomerId } });
        await prisma.company.deleteMany({ where: { id: createdCustomerId } });
      }
      console.log('Cleanup completed cleanly.');
    } catch (e) {
      console.error('Cleanup error (ignored):', e.message);
    }
    await prisma.$disconnect();
  }
}

runUnregisteredPartyTest().catch((err) => {
  console.error('\n[FAIL] Test failed:', err);
  process.exit(1);
});
