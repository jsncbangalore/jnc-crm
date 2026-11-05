const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const envPath = path.resolve(__dirname, '../apps/api/.env');
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      let key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

const jwtSecret = process.env.JWT_SECRET || 'dev_secret';
const prisma = new PrismaClient();
const artifactDir = path.resolve('C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824');

async function run() {
  console.log('====================================================');
  console.log('CAPTURING QA BUGS EVIDENCE AT 1536x730 & 390px');
  console.log('Target: jnc_crm_dev on localhost:3333');
  console.log('====================================================\n');

  const tenant = await prisma.tenant.findFirst({
    where: { status: 'active', deletedAt: null },
  });
  if (!tenant) throw new Error('Tenant not found');

  const user = await prisma.user.findFirst({
    where: { tenantId: tenant.id, isActive: true, deletedAt: null },
  });
  if (!user) throw new Error('User not found');

  const token = jwt.sign(
    {
      sub: user.id,
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      employeeCode: user.employeeCode,
      tokenVersion: user.tokenVersion || 0,
    },
    jwtSecret,
    { issuer: 'crm-api', audience: 'crm-client' }
  );

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const browser = await chromium.launch({ headless: true });

  async function createPage(viewport) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();

    // Route refresh token to seamlessly bootstrap staff session with real signed JWT token
    await page.route('**/api/v1/auth/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: token,
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
            tenantId: user.tenantId,
            name: user.name || 'Acme Tenant Admin',
            effectivePages: ['dashboard', 'invoices', 'quotations', 'leads', 'customers', 'suppliers', 'orders', 'ledger', 'settings'],
            tenant: {
              id: tenant.id,
              code: tenant.code,
              name: tenant.name,
            },
          },
        }),
      });
    });

    await page.addInitScript(({ token, user, tenant }) => {
      localStorage.setItem('crm_portal', 'staff');
      sessionStorage.setItem('crm_portal', 'staff');
      localStorage.setItem('crm_staff_refresh_token', 'valid-refresh-token');
      localStorage.setItem('crm_last_active', String(Date.now()));
      localStorage.setItem(
        'crm_cookie_consent',
        JSON.stringify({ choice: 'all', preferences: true, policyVersion: '2026.10.1', savedAt: new Date().toISOString() })
      );
      localStorage.setItem('crm_user', JSON.stringify({
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        name: user.name || 'Acme Tenant Admin',
        effectivePages: ['dashboard', 'invoices', 'quotations', 'leads', 'customers', 'suppliers', 'orders', 'ledger', 'settings'],
        tenant: { id: tenant.id, code: tenant.code, name: tenant.name }
      }));
    }, { token, user, tenant });

    return { context, page };
  }

  // ─────────────────────────────────────────────────────────────
  // 1. BUG B: LEDGER REPRODUCTION & VERIFICATION
  // Reproduce: Customer 'Test Party', Standard GST Invoice of 5000 with empty GSTIN.
  // ─────────────────────────────────────────────────────────────
  console.log('--- 1. Bug B: Ledger Verification ---');
  const partyName = 'Test Party ' + Date.now();
  const partyRes = await fetch('http://localhost:3333/api/v1/companies', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: partyName, phone: '+919876543210', state: 'Karnataka' }),
  });
  const createdParty = await partyRes.json();

  const invRes = await fetch('http://localhost:3333/api/v1/invoices/create-direct', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      docType: 'tax_invoice',
      customerId: createdParty.id,
      customerName: createdParty.name,
      customerPhone: '+919876543210',
      customerState: 'Karnataka',
      paymentTerms: 'Due on Receipt',
      lines: [{ description: 'Standard GST Product', quantity: 1, unitPrice: 5000, taxRate: 0 }],
    }),
  });
  const createdInv = await invRes.json();
  console.log(`Created "${partyName}" with 5000 invoice ${createdInv.invoiceNumber}`);

  // Desktop 1536x730
  const { page: p1536 } = await createPage({ width: 1536, height: 730 });
  await p1536.goto('http://localhost:5173/ledger', { waitUntil: 'networkidle' });
  await p1536.waitForTimeout(2000);

  // Search for the party
  const searchInput = p1536.locator('input[placeholder*="Search customer"]');
  if (await searchInput.isVisible()) {
    await searchInput.fill(partyName);
    await p1536.waitForTimeout(1000);
  }

  // Click party to view statement
  const partyItem = p1536.locator(`text="${partyName}"`).first();
  if (await partyItem.isVisible()) {
    await partyItem.click();
    await p1536.waitForTimeout(1500);
  }

  const bugB_desktop = path.join(artifactDir, 'evidence-bug-b-ledger-1536x730.png');
  await p1536.screenshot({ path: bugB_desktop });
  console.log('Saved:', bugB_desktop);

  // Mobile 390px
  const { page: p390 } = await createPage({ width: 390, height: 844 });
  await p390.goto('http://localhost:5173/ledger', { waitUntil: 'networkidle' });
  await p390.waitForTimeout(2000);
  const searchInputMobile = p390.locator('input[placeholder*="Search customer"]');
  if (await searchInputMobile.isVisible()) {
    await searchInputMobile.fill(partyName);
    await p390.waitForTimeout(1000);
  }
  const partyItemMobile = p390.locator(`text="${partyName}"`).first();
  if (await partyItemMobile.isVisible()) {
    await partyItemMobile.click();
    await p390.waitForTimeout(1500);
  }
  const bugB_mobile = path.join(artifactDir, 'evidence-bug-b-ledger-390px.png');
  await p390.screenshot({ path: bugB_mobile });
  console.log('Saved:', bugB_mobile);

  // ─────────────────────────────────────────────────────────────
  // 2. BUG A & D: RECORD RECEIPT WINDOW (Advance posting, bank account, date format '05 Nov 2026', reference rules)
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 2. Bug A & D: Record Receipt Verification ---');
  const recordReceiptBtn = p1536.locator('button:has-text("Record Payment"), button:has-text("Record Receipt")').first();
  if (await recordReceiptBtn.isVisible()) {
    await recordReceiptBtn.click();
    await p1536.waitForTimeout(1000);
  }

  const amtInput = p1536.locator('input[placeholder="0.00"]').first();
  if (await amtInput.isVisible()) {
    await amtInput.fill('5000');
  }

  const refInput = p1536.locator('#crm-payment-transaction-reference');
  if (await refInput.isVisible()) {
    await refInput.fill('NEFT98765432');
  }

  const bugAD_desktop = path.join(artifactDir, 'evidence-bug-a-d-receipt-1536x730.png');
  await p1536.screenshot({ path: bugAD_desktop });
  console.log('Saved:', bugAD_desktop);

  // Mobile receipt modal
  const recordReceiptBtnMobile = p390.locator('button:has-text("Record Payment"), button:has-text("Record Receipt")').first();
  if (await recordReceiptBtnMobile.isVisible()) {
    await recordReceiptBtnMobile.click();
    await p390.waitForTimeout(1000);
  }
  const amtInputMobile = p390.locator('input[placeholder="0.00"]').first();
  if (await amtInputMobile.isVisible()) {
    await amtInputMobile.fill('5000');
  }
  const bugAD_mobile = path.join(artifactDir, 'evidence-bug-a-d-receipt-390px.png');
  await p390.screenshot({ path: bugAD_mobile });
  console.log('Saved:', bugAD_mobile);

  // Close modals or create fresh pages for Bug C
  // ─────────────────────────────────────────────────────────────
  // 3. BUG C: CREATE DOCUMENT INLINE GSTIN ERROR
  // Shows invalid customer GSTIN inline at GSTIN field, scrolls & focuses, shown once
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 3. Bug C: Create Document Inline GSTIN Verification ---');
  const { page: pDoc1536 } = await createPage({ width: 1536, height: 730 });
  await pDoc1536.goto('http://localhost:5173/invoices', { waitUntil: 'networkidle' });
  await pDoc1536.waitForTimeout(1500);

  // Click Create Document
  const createDocBtn = pDoc1536.locator('button:has-text("Create Document"), button:has-text("Create Tax Invoice"), button:has-text("New Invoice")').first();
  if (await createDocBtn.isVisible()) {
    await createDocBtn.click();
    await pDoc1536.waitForTimeout(1000);
  }

  // Fill Customer Name
  const custNameInput = pDoc1536.locator('#invoiceCustomerName, input[name="cust_company_name"], input[placeholder*="Customer name"]').first();
  if (await custNameInput.isVisible()) {
    await custNameInput.fill('Acme Corp');
  }

  // Fill Invalid GSTIN
  const gstinInput = pDoc1536.locator('#customerGstinInput, input[name="cust_company_gstin"]').first();
  if (await gstinInput.isVisible()) {
    await gstinInput.fill('29INVALID0000');
  }

  // Fill Line Item
  const descInput = pDoc1536.locator('input[placeholder*="Item name or description"]').first();
  if (await descInput.isVisible()) {
    await descInput.fill('IT Consulting Services');
  }

  // Click Submit
  const submitDocBtn = pDoc1536.locator('button:has-text("Save & Generate Invoice"), button:has-text("Save & Generate")').first();
  if (await submitDocBtn.isVisible()) {
    await submitDocBtn.click();
    await pDoc1536.waitForTimeout(1000);
  }

  const bugC_desktop = path.join(artifactDir, 'evidence-bug-c-inline-gstin-1536x730.png');
  await pDoc1536.screenshot({ path: bugC_desktop });
  console.log('Saved:', bugC_desktop);

  // Mobile 390px
  const { page: pDoc390 } = await createPage({ width: 390, height: 844 });
  await pDoc390.goto('http://localhost:5173/invoices', { waitUntil: 'networkidle' });
  await pDoc390.waitForTimeout(1500);
  const createDocBtnMobile = pDoc390.locator('button:has-text("Create Document"), button:has-text("Create Tax Invoice"), button:has-text("New Invoice")').first();
  if (await createDocBtnMobile.isVisible()) {
    await createDocBtnMobile.click();
    await pDoc390.waitForTimeout(1000);
  }
  const custNameInputMobile = pDoc390.locator('#invoiceCustomerName, input[name="cust_company_name"], input[placeholder*="Customer name"]').first();
  await custNameInputMobile.scrollIntoViewIfNeeded();
  await custNameInputMobile.fill('Acme Corp');

  const gstinInputMobile = pDoc390.locator('#customerGstinInput, input[name="cust_company_gstin"]').first();
  await gstinInputMobile.scrollIntoViewIfNeeded();
  await gstinInputMobile.fill('29INVALID0000');

  const descInputMobile = pDoc390.locator('input[placeholder*="Item name or description"]').first();
  if (await descInputMobile.count() > 0) {
    await descInputMobile.fill('IT Consulting Services');
  }

  // Trigger submit to run validation and scroll to GSTIN inline error
  await pDoc390.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Save & Generate'));
    btn?.click();
  });
  await pDoc390.waitForTimeout(1500);

  const bugC_mobile = path.join(artifactDir, 'evidence-bug-c-inline-gstin-390px.png');
  await pDoc390.screenshot({ path: bugC_mobile });
  console.log('Saved:', bugC_mobile);

  await browser.close();
  await prisma.$disconnect();
  console.log('\n====================================================');
  console.log('ALL PLAYWRIGHT EVIDENCE SCREENSHOTS CAPTURED!');
  console.log('====================================================');
}

run().catch((err) => {
  console.error('Evidence capture failed:', err);
  process.exit(1);
});
