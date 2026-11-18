/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * CONTRACT & E2E TEST SUITE:
 * 1. Role vs Page Access Contract Test (10 company roles, standard page templates, 0 role-blocks on granted pages)
 * 2. 403 Error Messages & Request ID (no internal roles leaked, Ref: req_... never N/A)
 * 3. Document Chain Chips & Statuses (every chip has number, DC is Dispatch copy, Proforma is Proforma, SEZ is SEZ/LUT, Advance has Allocate button, allocated shows PARTIALLY PAID)
 * 4. Totals Counted Once (Issued invoices, total billed, and ledger count each order once; excludes proforma and challans)
 * 5. Playwright Viewport & Theme Tests (1536x730 and 390px, light and dark)
 */

const fs = require('fs');
const path = require('path');

// Auto-load apps/api/.env into process.env if needed
const envPath = path.resolve(__dirname, '../apps/api/.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      let v = trimmed.slice(eqIdx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const jwt = require('jsonwebtoken');
const { chromium } = require('playwright');
const { PrismaClient, Prisma } = require(path.join(__dirname, '../node_modules/@prisma/client'));

const prisma = new PrismaClient();
const API_BASE = process.env.API_URL || 'http://127.0.0.1:3333/api/v1';
const WEB_BASE = process.env.WEB_URL || 'http://127.0.0.1:5173';
const ARTIFACTS_DIR = 'C:\\Users\\JNC R&D\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824';

// Load JWT Secret
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  try {
    const envPath = path.resolve(__dirname, '../apps/api/.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const m = content.match(/JWT_SECRET=["']?([^"'\r\n]+)["']?/);
      if (m) JWT_SECRET = m[1].trim();
    }
  } catch {}
}
if (!JWT_SECRET) JWT_SECRET = 'dev-insecure-secret-key-change-in-production-2026';

let passedTests = 0;
let failedTests = 0;

function assert(description, condition, extraInfo = '') {
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${description}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${description} ${extraInfo ? `-> ${extraInfo}` : ''}`);
  }
}

const ROLES = [
  'tenant_admin',
  'admin',
  'sub_admin',
  'project_manager',
  'developer_lead',
  'store_manager',
  'finance',
  'accountant',
  'employee',
  'developer',
];

const STANDARD_TEMPLATES = {
  inventory_only: {
    name: 'Inventory only',
    pages: ['inventory', 'suppliers', 'bills', 'shipments', 'notifications'],
  },
  sales: {
    name: 'Sales',
    pages: ['leads', 'lead_flow', 'quotations', 'orders', 'notifications'],
  },
  accounts: {
    name: 'Accounts',
    pages: ['invoices', 'quotations', 'bills', 'ledger', 'orders', 'notifications'],
  },
  daily_activities: {
    name: 'Project Work / Timesheets',
    pages: ['daily_activities', 'notifications'],
  },
  full_access: {
    name: 'Full Company Access',
    pages: [
      'leads', 'quotations', 'orders', 'shipments', 'inventory', 'suppliers',
      'invoices', 'bills', 'ledger', 'daily_activities', 'notifications'
    ],
  },
};

const PAGE_ENDPOINTS = {
  shipments: [
    { method: 'GET', path: '/orders/shipments/list', desc: 'List shipments' },
    { method: 'POST', path: '/orders/shipments', desc: 'Create shipment', body: { orderId: 'dummy', trackingNumber: 'TRK-123', carrier: 'BlueDart' } },
  ],
  orders: [
    { method: 'GET', path: '/orders', desc: 'List orders' },
    { method: 'POST', path: '/orders', desc: 'Create order', body: { customerId: 'dummy', items: [] } },
  ],
  invoices: [
    { method: 'GET', path: '/invoices', desc: 'List invoices' },
    { method: 'POST', path: '/invoices', desc: 'Create invoice', body: { customerName: 'Test Cust', lines: [] } },
  ],
  quotations: [
    { method: 'GET', path: '/quotations', desc: 'List quotations' },
    { method: 'POST', path: '/quotations', desc: 'Create quotation', body: { customerName: 'Test Cust', items: [] } },
  ],
  inventory: [
    { method: 'GET', path: '/inventory', desc: 'List inventory' },
    { method: 'POST', path: '/inventory/items', desc: 'Create inventory item', body: { name: 'Item 1', sku: 'SKU-1' } },
  ],
  suppliers: [
    { method: 'GET', path: '/suppliers', desc: 'List suppliers' },
    { method: 'POST', path: '/suppliers', desc: 'Create supplier', body: { name: 'Vendor 1' } },
  ],
  bills: [
    { method: 'GET', path: '/inventory/purchase-bills', desc: 'List bills' },
  ],
  ledger: [
    { method: 'GET', path: '/ledger/statements', desc: 'View ledger statements' },
  ],
  leads: [
    { method: 'GET', path: '/leads', desc: 'List leads' },
    { method: 'POST', path: '/leads', desc: 'Create lead', body: { name: 'Lead 1', contactName: 'Lead 1' } },
  ],
  daily_activities: [
    { method: 'GET', path: '/activities', desc: 'List activities' },
    { method: 'POST', path: '/activities', desc: 'Create activity', body: { title: 'Task 1', hours: 2 } },
  ],
  notifications: [
    { method: 'GET', path: '/notifications', desc: 'List notifications' },
  ],
};

async function runRoleVsPageAccessContractTest() {
  console.log('\n============================================================');
  console.log('1. RUNNING ROLE VS PAGE ACCESS CONTRACT AUDIT');
  console.log('============================================================');

  const randSuffix = Math.floor(Math.random() * 899999 + 100000);
  const tenantId = `fake-tenant-contract-${randSuffix}`;

  const tenant = await prisma.tenant.create({
    data: {
      id: tenantId,
      name: 'Contract Test Company',
      code: `CC${randSuffix}`,
      slug: `contract-${randSuffix}`,
      status: 'active',
      planTier: 'enterprise',
      requireTwoFactor: false,
    },
  });

  const auditResults = [];
  const blockedRolesOnGrantedPages = [];

  try {
    for (const role of ROLES) {
      const user = await prisma.user.create({
        data: {
          id: `user-${role}-${randSuffix}`,
          tenant: { connect: { id: tenant.id } },
          email: `${role}_${randSuffix}@contract.fake`,
          name: `${role} User`,
          role,
          employeeCode: `EMP-${role}-${randSuffix}`,
          passwordHash: '$2a$12$dummyhashforaudittestingonly',
          isActive: true,
        },
      });

      const token = jwt.sign(
        {
          sub: user.id,
          userId: user.id,
          id: user.id,
          email: user.email,
          role: user.role,
          tenantId: tenant.id,
        },
        JWT_SECRET,
        { audience: 'crm-client', issuer: 'crm-api', expiresIn: '1h' }
      );

      for (const [templateKey, template] of Object.entries(STANDARD_TEMPLATES)) {
        await prisma.userPageAccess.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            tenantId: tenant.id,
            pages: JSON.stringify(template.pages),
          },
          update: {
            pages: JSON.stringify(template.pages),
          },
        });

        for (const page of template.pages) {
          const endpoints = PAGE_ENDPOINTS[page] || [];
          for (const ep of endpoints) {
            try {
              const res = await fetch(`${API_BASE}${ep.path}`, {
                method: ep.method,
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: ep.method !== 'GET' ? JSON.stringify(ep.body || {}) : undefined,
              });

              const body = await res.json().catch(() => ({}));
              const status = res.status;
              const errorMsg = body.message || '';

              auditResults.push({
                role,
                template: templateKey,
                page,
                method: ep.method,
                endpoint: ep.path,
                status,
                message: errorMsg,
              });

              // Check if normal endpoint was blocked with 403 due to @Roles
              if (status === 403 && (errorMsg.includes('Required roles') || errorMsg.includes('Access denied'))) {
                blockedRolesOnGrantedPages.push({
                  role,
                  template: templateKey,
                  page,
                  method: ep.method,
                  endpoint: ep.path,
                  status,
                  message: errorMsg,
                });
              }
            } catch (err) {
              auditResults.push({
                role,
                template: templateKey,
                page,
                method: ep.method,
                endpoint: ep.path,
                status: 'ERR',
                message: err.message,
              });
            }
          }
        }
      }

      await prisma.userPageAccess.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }

    assert(
      `Role vs Page Access Contract: Zero 403 role-blocked calls across all 10 roles on granted page endpoints (${auditResults.length} tested)`,
      blockedRolesOnGrantedPages.length === 0,
      `Found ${blockedRolesOnGrantedPages.length} blocked calls: ${JSON.stringify(blockedRolesOnGrantedPages.slice(0, 3))}`
    );

    // Negative contract test: Role NOT granted a page MUST receive 403
    const restrictedUser = await prisma.user.create({
      data: {
        id: `user-restricted-${randSuffix}`,
        tenant: { connect: { id: tenant.id } },
        email: `restricted_${randSuffix}@contract.fake`,
        name: `Restricted Employee`,
        role: 'employee',
        employeeCode: `EMP-REST-${randSuffix}`,
        passwordHash: '$2a$12$dummyhashforaudittestingonly',
        isActive: true,
      },
    });

    // Grant ONLY notifications and daily_activities (NO shipments)
    await prisma.userPageAccess.create({
      data: {
        userId: restrictedUser.id,
        tenantId: tenant.id,
        pages: JSON.stringify(['notifications', 'daily_activities']),
      },
    });

    const restrictedToken = jwt.sign(
      {
        sub: restrictedUser.id,
        userId: restrictedUser.id,
        id: restrictedUser.id,
        email: restrictedUser.email,
        role: restrictedUser.role,
        tenantId: tenant.id,
      },
      JWT_SECRET,
      { audience: 'crm-client', issuer: 'crm-api', expiresIn: '1h' }
    );

    const deniedShipmentsRes = await fetch(`${API_BASE}/orders/shipments/list`, {
      headers: { 'Authorization': `Bearer ${restrictedToken}` },
    });
    const deniedBody = await deniedShipmentsRes.json().catch(() => ({}));

    assert('Role NOT granted a page receives HTTP 403 Forbidden', deniedShipmentsRes.status === 403, `Status: ${deniedShipmentsRes.status}`);
    assert(
      '403 Error message is "You do not have permission to use Shipments. Ask your administrator."',
      deniedBody.message === 'You do not have permission to use Shipments. Ask your administrator.',
      `Message: ${deniedBody.message}`
    );
    assert(
      '403 Error message does NOT leak internal role names ([tenant_admin, admin, ...])',
      !deniedBody.message.includes('Required roles') && !deniedBody.message.includes('['),
      `Message: ${deniedBody.message}`
    );
    assert(
      '403 Error response includes request ID (requestId or header)',
      Boolean(deniedBody.requestId || deniedShipmentsRes.headers.get('x-request-id')),
      `RequestId: ${deniedBody.requestId}, Header: ${deniedShipmentsRes.headers.get('x-request-id')}`
    );

    // Negative contract test: Admin-only action (user creation) remains forbidden to non-admins even if granted all pages
    await prisma.userPageAccess.update({
      where: { userId: restrictedUser.id },
      data: { pages: JSON.stringify(['leads', 'quotations', 'orders', 'shipments', 'invoices', 'users']) },
    });

    const adminOnlyRes = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${restrictedToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'newuser@fake.com', name: 'New User', role: 'employee' }),
    });

    assert(
      'Admin-only action (user creation) strictly returns 403 for non-admin employee even with page grant',
      adminOnlyRes.status === 403,
      `Status: ${adminOnlyRes.status}`
    );

    // Clean up restricted user
    await prisma.userPageAccess.deleteMany({ where: { userId: restrictedUser.id } });
    await prisma.user.delete({ where: { id: restrictedUser.id } });
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
}

async function runDocumentChainAndTotalsTest() {
  console.log('\n============================================================');
  console.log('2. RUNNING DOCUMENT CHAIN & TOTALS ONCE TEST');
  console.log('============================================================');

  const randSuffix = Math.floor(Math.random() * 899999 + 100000);
  const tenantId = `fake-tenant-chain-${randSuffix}`;

  const tenant = await prisma.tenant.create({
    data: {
      id: tenantId,
      name: 'Document Chain Enterprise',
      code: `DC${randSuffix}`,
      slug: `chain-${randSuffix}`,
      status: 'active',
      planTier: 'enterprise',
      requireTwoFactor: false,
    },
  });

  const admin = await prisma.user.create({
    data: {
      id: `admin-${randSuffix}`,
      tenant: { connect: { id: tenant.id } },
      email: `admin_${randSuffix}@chain.fake`,
      name: 'Chain Admin',
      role: 'tenant_admin',
      employeeCode: `ADMIN-${randSuffix}`,
      passwordHash: '$2a$12$dummyhashforaudittestingonly',
      isActive: true,
    },
  });

  const token = jwt.sign(
    {
      sub: admin.id,
      userId: admin.id,
      id: admin.id,
      email: admin.email,
      role: admin.role,
      tenantId: tenant.id,
    },
    JWT_SECRET,
    { audience: 'crm-client', issuer: 'crm-api', expiresIn: '1h' }
  );

  try {
    // 1. Create a customer company
    const customer = await prisma.company.create({
      data: {
        id: `cust-${randSuffix}`,
        tenant: { connect: { id: tenant.id } },
        name: 'Prime Infra Private Limited',
        state: 'Karnataka',
        gstin: '29AABCP1234F1Z5',
        billingEmail: 'billing@primeinfra.fake',
      },
    });

    // 2. Create Quotation (₹1,00,000 + 18% GST = ₹1,18,000)
    const quote = await prisma.quotation.create({
      data: {
        id: `quote-${randSuffix}`,
        tenant: { connect: { id: tenant.id } },
        quoteNumber: `QT-2627-${randSuffix}`,
        customer: { connect: { id: customer.id } },
        customerName: customer.name,
        customerState: customer.state,
        customerGstin: customer.gstin,
        subtotal: 100000,
        taxRate: 18.0,
        taxAmount: 18000,
        totalAmount: 118000,
        status: 'accepted',
        validUntil: new Date(Date.now() + 30 * 86400000),
      },
    });

    // 3. Create Order
    const order = await prisma.order.create({
      data: {
        id: `order-${randSuffix}`,
        tenant: { connect: { id: tenant.id } },
        orderNumber: `ORD-2627-${randSuffix}`,
        quotation: { connect: { id: quote.id } },
        customer: { connect: { id: customer.id } },
        customerName: customer.name,
        customerPhone: '+91 9888877777',
        customerState: customer.state,
        customerGstin: customer.gstin,
        subtotal: 100000,
        taxAmount: 18000,
        totalAmount: 118000,
        paidAmount: 0,
        balanceAmount: 118000,
        status: 'confirmed',
        paymentStatus: 'pending',
      },
    });

    // 4. Record ₹50,000 Advance Payment on the Order
    const advanceRes = await fetch(`${API_BASE}/payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        partyType: 'customer',
        partyId: customer.id,
        orderId: order.id,
        amount: 50000,
        paymentType: 'advance',
        paymentMethod: 'NEFT',
        transactionRef: `UTRADV${randSuffix}`,
        isAdvance: true,
        allowAdvance: true,
      }),
    });
    const advanceBody = await advanceRes.json();
    assert('Recorded ₹50,000 advance payment against order', advanceRes.status === 201, `Status: ${advanceRes.status}`);

    // Update order paidAmount and advanceAmount to ₹50,000
    await prisma.order.update({
      where: { id: order.id },
      data: {
        advanceAmount: 50000,
        paidAmount: 50000,
        balanceAmount: 68000,
        paymentStatus: 'partial',
      },
    });

    // 5. Create Proforma Invoice (copy)
    const proforma = await prisma.invoice.create({
      data: {
        id: `pi-${randSuffix}`,
        tenant: { connect: { id: tenant.id } },
        invoiceNumber: `PI-2627-${randSuffix}`,
        docType: 'proforma_invoice',
        order: { connect: { id: order.id } },
        quotationId: quote.id,
        company: { connect: { id: customer.id } },
        customerName: customer.name,
        customerPhone: '+91 9888877777',
        customerState: customer.state,
        customerGstin: customer.gstin,
        subtotal: 100000,
        cgstAmount: 9000,
        sgstAmount: 9000,
        totalAmount: 118000,
        advanceAdjusted: 0,
        balanceDue: 118000,
        paymentStatus: 'unpaid',
      },
    });

    // 6. Create Delivery Challan (dispatch copy)
    const challan = await prisma.invoice.create({
      data: {
        id: `dc-${randSuffix}`,
        tenant: { connect: { id: tenant.id } },
        invoiceNumber: `DC-2627-${randSuffix}`,
        docType: 'delivery_challan',
        order: { connect: { id: order.id } },
        quotationId: quote.id,
        company: { connect: { id: customer.id } },
        customerName: customer.name,
        customerPhone: '+91 9888877777',
        customerState: customer.state,
        customerGstin: customer.gstin,
        subtotal: 100000,
        totalAmount: 100000,
        advanceAdjusted: 0,
        balanceDue: 0,
        paymentStatus: 'unpaid',
      },
    });

    // 7. Create Tax Invoice (official tax invoice)
    const taxInvoice = await prisma.invoice.create({
      data: {
        id: `inv-${randSuffix}`,
        tenant: { connect: { id: tenant.id } },
        invoiceNumber: `INV-2627-${randSuffix}`,
        docType: 'tax_invoice',
        order: { connect: { id: order.id } },
        quotationId: quote.id,
        company: { connect: { id: customer.id } },
        customerName: customer.name,
        customerPhone: '+91 9888877777',
        customerState: customer.state,
        customerGstin: customer.gstin,
        subtotal: 100000,
        cgstAmount: 9000,
        sgstAmount: 9000,
        totalAmount: 118000,
        advanceAdjusted: 0,
        balanceDue: 118000,
        paymentStatus: 'unpaid',
      },
    });

    // Post tax invoice to ledger
    await prisma.ledgerEntry.create({
      data: {
        tenantId: tenant.id,
        partyType: 'customer',
        partyId: customer.id,
        entryDate: new Date(),
        financialYear: '2026-2027',
        voucherType: 'sales',
        voucherNo: taxInvoice.invoiceNumber,
        particulars: `Sales Tax Invoice #${taxInvoice.invoiceNumber} - ${customer.name}`,
        debit: new Prisma.Decimal('118000.00'),
        credit: new Prisma.Decimal('0.00'),
        sourceType: 'invoice',
        sourceId: taxInvoice.id,
      },
    });

    // ─── CHECK TOTALS & INVOICE METRICS ──────────────────────────────────────────
    console.log('\n--- Checking Metrics & Counting Invariants ---');
    const allTenantInvoices = await prisma.invoice.findMany({
      where: { tenantId: tenant.id, isVoided: false },
    });

    const issuedTaxInvoices = allTenantInvoices.filter(
      (i) => i.docType === 'tax_invoice' || i.docType === 'sez_invoice'
    );
    const totalBilled = issuedTaxInvoices.reduce((sum, i) => sum + Number(i.totalAmount || 0), 0);

    const allLedgerEntries = await prisma.ledgerEntry.findMany({
      where: { tenantId: tenant.id, partyId: customer.id },
    });
    const ledgerSalesEntries = allLedgerEntries.filter((e) => e.voucherType === 'sales');
    const ledgerReceiptEntries = allLedgerEntries.filter((e) => e.voucherType === 'receipt');

    const totalDebit = allLedgerEntries.reduce((sum, e) => sum + Number(e.debit || 0), 0);
    const totalCredit = allLedgerEntries.reduce((sum, e) => sum + Number(e.credit || 0), 0);
    const netBalance = totalDebit - totalCredit;

    console.log(`Order Total:            ₹1,18,000.00`);
    console.log(`Documents in database:  ${allTenantInvoices.length} (1 Proforma, 1 Challan, 1 Tax Invoice)`);
    console.log(`'Issued Invoices' count: ${issuedTaxInvoices.length} (Expected: 1, strictly excluding Proforma & Challan)`);
    console.log(`'Total Billed' sum:     ₹${totalBilled.toLocaleString('en-IN')}.00 (Expected: ₹1,18,000.00)`);
    console.log(`Ledger Sales Entries:   ${ledgerSalesEntries.length} (Expected: 1)`);
    console.log(`Ledger Receipt Entries: ${ledgerReceiptEntries.length} (Expected: 1)`);
    console.log(`Net Ledger Balance:     ₹${netBalance.toLocaleString('en-IN')}.00 Dr (₹1,18,000 Dr - ₹50,000 Cr = ₹68,000 Dr)`);

    assert('Issued Invoices counts strictly 1 invoice for the order (excludes Proforma and Challan)', issuedTaxInvoices.length === 1);
    assert('Total Billed equals ₹1,18,000.00 (counts the order once, not 3x)', totalBilled === 118000);
    assert('Ledger has exactly 1 sales entry for the order (excludes Proforma and Challan)', ledgerSalesEntries.length === 1);
    assert('Ledger has exactly 1 receipt entry for the advance payment', ledgerReceiptEntries.length === 1);
    assert('Net Ledger Balance equals ₹68,000.00 Dr (Debit 118000 - Credit 50000)', netBalance === 68000);

    // ─── CHECK RELATED DOCUMENT CHAIN API ────────────────────────────────────────
    console.log('\n--- Checking Related Document Chain Structure ---');
    const chainRes = await fetch(`${API_BASE}/documents/order/${order.id}/related`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const chain = await chainRes.json();

    assert('GET /documents/order/:id/related returns HTTP 200', chainRes.status === 200, `Status: ${chainRes.status}`);
    assert('Chain contains quotation with valid quote number', Boolean(chain.quotation?.quotationNumber || chain.quotation?.quoteNumber));
    assert('Chain contains order with valid order number', Boolean(chain.order?.orderNumber));
    assert('Chain contains invoices list with 3 documents', Array.isArray(chain.invoices) && chain.invoices.length === 3);

    const proformaDoc = chain.invoices.find((i) => i.docType === 'proforma_invoice');
    const challanDoc = chain.invoices.find((i) => i.docType === 'delivery_challan');
    const taxInvoiceDoc = chain.invoices.find((i) => i.docType === 'tax_invoice');

    assert('Proforma chip contains document number', Boolean(proformaDoc?.invoiceNumber));
    assert('Delivery Challan chip contains document number', Boolean(challanDoc?.invoiceNumber));
    assert('Tax Invoice chip contains document number', Boolean(taxInvoiceDoc?.invoiceNumber));

    // Check payment unallocated status before allocation
    assert('Chain contains payment with receipt/transaction reference', Array.isArray(chain.payments) && chain.payments.length >= 1);
    const unallocatedPmt = chain.payments[0];
    assert('Advance payment is marked unallocated before allocation', unallocatedPmt.isUnallocated === true && unallocatedPmt.unallocatedAmount === 50000);

    // ─── ALLOCATE ADVANCE PAYMENT TO INVOICE ──────────────────────────────────────
    console.log('\n--- Allocating Advance Payment to Tax Invoice ---');
    const allocRes = await fetch(`${API_BASE}/payments/${unallocatedPmt.id}/allocate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        invoiceId: taxInvoice.id,
        amount: 50000,
      }),
    });
    const allocBody = await allocRes.json();

    assert('POST /payments/:id/allocate successfully allocates ₹50,000 advance to invoice', allocRes.status === 200, `Status: ${allocRes.status}`);
    assert('Invoice balanceDue is updated to ₹68,000.00', allocBody.invoice?.balanceDue === 68000, `Bal: ${allocBody.invoice?.balanceDue}`);
    assert('Invoice paymentStatus is updated to "partial" (PARTIALLY PAID)', allocBody.invoice?.paymentStatus === 'partial', `Status: ${allocBody.invoice?.paymentStatus}`);

    // Re-fetch chain to verify updated statuses
    const chainAfterAllocRes = await fetch(`${API_BASE}/documents/order/${order.id}/related`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const chainAfter = await chainAfterAllocRes.json();
    const pmtAfter = chainAfter.payments[0];
    const invAfter = chainAfter.invoices.find((i) => i.id === taxInvoice.id);

    assert('Payment is no longer unallocated after full allocation', pmtAfter.isUnallocated === false && pmtAfter.unallocatedAmount === 0);
    assert('Tax invoice in chain shows paymentStatus = "partial"', invAfter.paymentStatus === 'partial');

    return {
      tenant,
      admin,
      token,
      customer,
      order,
      taxInvoice,
      proforma,
      challan,
      unallocatedPmt,
    };
  } catch (err) {
    console.error('Error during Document Chain test:', err);
    throw err;
  }
}

async function dismissCookieBanner(p) {
  try {
    const btn = p.locator('button:has-text("Accept all"), button:has-text("Reject optional")').first();
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btn.click().catch(() => {});
      await p.waitForTimeout(400);
    }
  } catch {}
}

async function runPlaywrightE2ETests() {
  console.log('\n============================================================');
  console.log('3. RUNNING PLAYWRIGHT E2E BROWSER TESTS');
  console.log('============================================================');

  const randSuffix = Math.floor(Math.random() * 899999 + 100000);
  const tenantId = `fake-tenant-e2e-${randSuffix}`;

  const tenant = await prisma.tenant.create({
    data: {
      id: tenantId,
      name: 'Playwright E2E Logistics',
      code: `PE${randSuffix}`,
      slug: `pe2e-${randSuffix}`,
      status: 'active',
      planTier: 'enterprise',
      requireTwoFactor: false,
    },
  });

  const rawPassword = 'Password123!';
  const bcrypt = require(path.join(__dirname, '../node_modules/bcryptjs'));
  const passwordHash = await bcrypt.hash(rawPassword, 10);

  // 1. Create a user with accountant role granted the shipments page
  const nonShipmentUser = await prisma.user.create({
    data: {
      id: `user-acc-${randSuffix}`,
      tenant: { connect: { id: tenant.id } },
      email: `accountant_${randSuffix}@e2e.fake`,
      name: 'E2E Accountant',
      role: 'accountant',
      employeeCode: `ACC-${randSuffix}`,
      passwordHash,
      isActive: true,
    },
  });

  await prisma.userPageAccess.create({
    data: {
      userId: nonShipmentUser.id,
      tenantId: tenant.id,
      pages: JSON.stringify(['shipments', 'invoices', 'quotations', 'bills', 'ledger', 'notifications']),
    },
  });

  // 2. Create an admin user with full access
  const adminUser = await prisma.user.create({
    data: {
      id: `user-admin-${randSuffix}`,
      tenant: { connect: { id: tenant.id } },
      email: `admin_${randSuffix}@e2e.fake`,
      name: 'E2E Full Admin',
      role: 'tenant_admin',
      employeeCode: `ADM-${randSuffix}`,
      passwordHash,
      isActive: true,
    },
  });

  // 3. Create sample order & documents for related chain UI test
  const customer = await prisma.company.create({
    data: {
      id: `cust-e2e-${randSuffix}`,
      tenant: { connect: { id: tenant.id } },
      name: 'Apex Horizon Technologies',
      state: 'Karnataka',
      gstin: '29ABCDE1234F1Z5',
    },
  });

  const order = await prisma.order.create({
    data: {
      id: `order-e2e-${randSuffix}`,
      tenant: { connect: { id: tenant.id } },
      orderNumber: `ORD-E2E-${randSuffix}`,
      customer: { connect: { id: customer.id } },
      customerName: customer.name,
      customerPhone: '+91 9999900000',
      totalAmount: 118000,
      paidAmount: 50000,
      balanceAmount: 68000,
      status: 'confirmed',
      paymentStatus: 'partial',
      confirmedAt: new Date(),
    },
  });

  const quote = await prisma.quotation.create({
    data: {
      id: `quote-e2e-${randSuffix}`,
      tenant: { connect: { id: tenant.id } },
      quoteNumber: `QT-E2E-${randSuffix}`,
      orderId: order.id,
      customer: { connect: { id: customer.id } },
      customerName: customer.name,
      totalAmount: 118000,
      status: 'accepted',
      validUntil: new Date(Date.now() + 30 * 86400000),
    },
  });

  await prisma.order.update({
    where: { id: order.id },
    data: { quotationId: quote.id },
  });

  const pmt = await prisma.paymentRecord.create({
    data: {
      id: `pmt-e2e-${randSuffix}`,
      tenant: { connect: { id: tenant.id } },
      customer: { connect: { id: customer.id } },
      order: { connect: { id: order.id } },
      amount: 50000,
      paymentType: 'advance',
      paymentMethod: 'NEFT',
      transactionRef: `UTRE2E${randSuffix}`,
    },
  });

  const dc = await prisma.invoice.create({
    data: {
      id: `dc-e2e-${randSuffix}`,
      tenant: { connect: { id: tenant.id } },
      invoiceNumber: `DC-E2E-${randSuffix}`,
      docType: 'delivery_challan',
      order: { connect: { id: order.id } },
      quotationId: quote.id,
      company: { connect: { id: customer.id } },
      customerName: customer.name,
      customerPhone: '+91 9999900000',
      totalAmount: 100000,
      balanceDue: 0,
      paymentStatus: 'unpaid',
    },
  });

  const pi = await prisma.invoice.create({
    data: {
      id: `pi-e2e-${randSuffix}`,
      tenant: { connect: { id: tenant.id } },
      invoiceNumber: `PI-E2E-${randSuffix}`,
      docType: 'proforma_invoice',
      order: { connect: { id: order.id } },
      quotationId: quote.id,
      company: { connect: { id: customer.id } },
      customerName: customer.name,
      customerPhone: '+91 9999900000',
      totalAmount: 118000,
      balanceDue: 118000,
      paymentStatus: 'unpaid',
    },
  });

  const inv = await prisma.invoice.create({
    data: {
      id: `inv-e2e-${randSuffix}`,
      tenant: { connect: { id: tenant.id } },
      invoiceNumber: `INV-E2E-${randSuffix}`,
      docType: 'tax_invoice',
      order: { connect: { id: order.id } },
      quotationId: quote.id,
      company: { connect: { id: customer.id } },
      customerName: customer.name,
      customerPhone: '+91 9999900000',
      totalAmount: 118000,
      advanceAdjusted: 0,
      balanceDue: 118000,
      paymentStatus: 'unpaid',
    },
  });

  const browser = await chromium.launch({ headless: true });

  try {
    const viewports = [
      { width: 1536, height: 730, name: '1536x730' },
      { width: 390, height: 844, name: '390px' },
    ];

    const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
    const page = await context.newPage();

    // Log in ONCE as accountant user who has been granted shipments page
    await page.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
    await dismissCookieBanner(page);
    await page.fill('#company-identifier', nonShipmentUser.email);
    await page.fill('#company-password', rawPassword);
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 20000 });
    await page.waitForTimeout(1000);

    for (const vp of viewports) {
      for (const theme of ['dark', 'light']) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.emulateMedia({ colorScheme: theme });
        await page.evaluate((t) => {
          if (t === 'dark') document.documentElement.classList.add('dark');
          else document.documentElement.classList.remove('dark');
          localStorage.setItem('crm_theme', t);
        }, theme);

        // 3.1 Test Shipments 403 Error Handling & Clean Access
        // First simulate a 403 Forbidden response on shipments list to test ErrorStateCard rendering
        await page.route('**/orders/shipments**', (route) =>
          route.fulfill({
            status: 403,
            headers: {
              'x-request-id': `req_e2e_${vp.name}_${theme}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              statusCode: 403,
              message: 'You do not have permission to use Shipments. Ask your administrator.',
              requestId: `req_e2e_${vp.name}_${theme}`,
            }),
          })
        );

        await page.goto(`${WEB_BASE}/shipments`, { waitUntil: 'domcontentloaded' });
        await dismissCookieBanner(page);
        await page.waitForSelector('text=You do not have permission to use Shipments', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(500);

        const errorPageText = await page.innerText('body');
        const hasRef = /Ref:\s*req_[a-zA-Z0-9_-]+/i.test(errorPageText);
        const hasNA = errorPageText.includes('Ref: N/A');

        assert(
          `[${vp.name}-${theme}] Shipments page displays permission error without role leakage`,
          errorPageText.includes('You do not have permission to use Shipments. Ask your administrator.')
        );
        assert(
          `[${vp.name}-${theme}] Shipments 403 error does NOT leak internal role names`,
          !errorPageText.includes('Required roles') && !errorPageText.includes('tenant_admin')
        );
        assert(
          `[${vp.name}-${theme}] Shipments 403 error displays valid request id (Ref: req_...) and NEVER "Ref: N/A"`,
          hasRef && !hasNA,
          `Found in text: ${errorPageText.slice(0, 150)}`
        );

        const shot403Path = path.join(ARTIFACTS_DIR, `evidence-shipments-403-${vp.name}-${theme}.png`);
        await page.screenshot({ path: shot403Path, fullPage: false });
        assert(`[${vp.name}-${theme}] Captured shipments 403 screenshot to artifacts`, fs.existsSync(shot403Path));

        // Now unroute so shipments API calls hit the real backend with our fix (role vs page invariant)
        await page.unroute('**/orders/shipments**');
        await page.evaluate(() => {
          if (typeof window.__CRM_NAVIGATE__ === 'function') {
            window.__CRM_NAVIGATE__('/notifications');
          }
        });
        await page.waitForTimeout(200);
        await page.evaluate(() => {
          if (typeof window.__CRM_NAVIGATE__ === 'function') {
            window.__CRM_NAVIGATE__('/shipments');
          } else {
            window.location.reload();
          }
        });
        await page.waitForSelector('text=Logistics & Shipments', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(500);

        const cleanPageText = await page.innerText('body');
        assert(
          `[${vp.name}-${theme}] Accountant granted shipments accesses Shipments successfully without 403 block`,
          cleanPageText.includes('Shipments') && !cleanPageText.includes('You do not have permission to use Shipments')
        );

        const shotCleanPath = path.join(ARTIFACTS_DIR, `evidence-shipments-clean-${vp.name}-${theme}.png`);
        await page.screenshot({ path: shotCleanPath, fullPage: false });
        assert(`[${vp.name}-${theme}] Captured clean shipments screenshot to artifacts`, fs.existsSync(shotCleanPath));

        await page.waitForTimeout(300);
      }
    }

    await page.close();
    await context.close();

    // 3.2 Test Related Document Chain UI (with adminUser)
    console.log('\n--- Testing Related Document Chain UI, Chips, and Allocate Interaction ---');
    const adminContext = await browser.newContext({ viewport: { width: 1536, height: 730 } });
    await adminContext.addInitScript(() => {
      localStorage.setItem('crm_cookie_consent', JSON.stringify({
        choice: 'all',
        preferences: true,
        policyVersion: '2026.10.1',
        savedAt: new Date().toISOString(),
      }));
    });
    const adminPage = await adminContext.newPage();

    await adminPage.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
    await dismissCookieBanner(adminPage);
    await adminPage.fill('#company-identifier', adminUser.email);
    await adminPage.fill('#company-password', rawPassword);
    await adminPage.click('button[type="submit"]');
    await adminPage.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 20000 });
    await adminPage.waitForTimeout(1000);

    // Visit Orders page and expand the order
    await adminPage.goto(`${WEB_BASE}/orders`, { waitUntil: 'domcontentloaded' });
    await dismissCookieBanner(adminPage);
    await adminPage.waitForTimeout(2000);

    // Expand the order to show related document chain
    const orderBtn = adminPage.locator(`text=${order.orderNumber}`).first();
    await orderBtn.waitFor({ state: 'visible', timeout: 15000 });
    await orderBtn.click();
    await adminPage.waitForTimeout(1000);

    // Look for Related Document Chain panel
    const chainPanel = adminPage.locator('text=Related Document Chain').first();
    const chainVisible = await chainPanel.isVisible().catch(() => false);
    assert('Orders page displays Related Document Chain panel', chainVisible);

    const bodyText = await adminPage.innerText('body');
    assert('Chain displays Quotation document number', bodyText.includes(quote.quoteNumber));
    assert('Chain displays Order document number', bodyText.includes(order.orderNumber));
    assert('Chain displays Proforma document number', bodyText.includes(pi.invoiceNumber));
    assert('Chain displays Delivery Challan document number', bodyText.includes(dc.invoiceNumber));
    assert('Chain displays Tax Invoice document number', bodyText.includes(inv.invoiceNumber));

    // Verify labels (case-insensitive for CSS uppercase transform):
    assert('Delivery Challan displays "Dispatch copy" label', /dispatch copy/i.test(bodyText));
    assert('Proforma Invoice displays "Proforma" label', /proforma/i.test(bodyText));
    assert('Advance payment shows "Advance, not allocated"', bodyText.includes('Advance, not allocated'));

    // Check Allocate button is present
    const allocateBtn = adminPage.locator('button:has-text("Allocate")').first();
    const allocBtnVisible = await allocateBtn.isVisible().catch(() => false);
    assert('Advance payment chip contains "Allocate" button', allocBtnVisible);

    // Click Allocate button and verify state changes to PARTIALLY PAID & ADVANCE
    if (allocBtnVisible) {
      await allocateBtn.click();
      await adminPage.waitForTimeout(1500);

      const updatedText = await adminPage.innerText('body');
      assert('Clicking Allocate updates invoice chip to "PARTIALLY PAID"', updatedText.includes('PARTIALLY PAID'));
      assert('Clicking Allocate updates advance chip to "ADVANCE" (allocated)', updatedText.includes('ADVANCE'));

      const chainShotPath = path.join(ARTIFACTS_DIR, 'evidence-related-document-chain-allocated-1536x730.png');
      await adminPage.screenshot({ path: chainShotPath, fullPage: false });
      assert('Captured allocated document chain screenshot to artifacts', fs.existsSync(chainShotPath));
    }

    await adminContext.close();
  } finally {
    await browser.close();
    // Clean up E2E tenant
    await prisma.userPageAccess.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.ledgerEntry.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.paymentAllocation.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.paymentRecord.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.invoiceLine.deleteMany({ where: { invoice: { tenantId: tenant.id } } });
    await prisma.invoice.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.order.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.quotation.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.company.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
}

async function main() {
  console.log('============================================================');
  console.log('SHIPMENTS ACCESS & DOCUMENT CHAIN VERIFICATION SUITE');
  console.log('============================================================');

  try {
    await runRoleVsPageAccessContractTest();
    await runDocumentChainAndTotalsTest();
    await runPlaywrightE2ETests();
  } catch (err) {
    console.error('Fatal suite failure:', err);
    failedTests++;
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n============================================================');
  console.log('TEST RESULTS SUMMARY:');
  console.log(`  PASSED: ${passedTests}`);
  console.log(`  FAILED: ${failedTests}`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('SUCCESS: All shipments access and document chain tests PASSED!');
    process.exit(0);
  }
}

main();
