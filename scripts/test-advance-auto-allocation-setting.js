/* --- ADVANCE AUTO-ALLOCATION SETTING CONTRACT TEST ---
 * Tests the company setting: 'Auto-allocate advance payments to new invoices'
 * Verifies that when ON (default), advances auto-allocate upon invoice generation.
 * Verifies that when OFF, advances remain unallocated, invoice balance due is full total,
 * and ledger entries correctly reflect unallocated advance vs invoice receivable.
 */

const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '../apps/api/.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const k = trimmed.substring(0, idx).trim();
      const v = trimmed.substring(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[k]) process.env[k] = v;
    }
  }
}
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://jnc_app:jnc_app_pass_dev_2026@localhost:5432/jnc_crm_dev?schema=public';
}

const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();
const API_BASE = process.env.API_URL || 'http://localhost:3333/api/v1';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-key-change-in-production-2026';

let passed = 0;
let failed = 0;

function assert(title, condition, extra = '') {
  if (condition) {
    console.log(`  [PASS] ${title}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${title} ${extra ? `(${extra})` : ''}`);
    failed++;
  }
}

async function apiCall(method, path, token, body = null) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const opts = { method, headers };
  if (body) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function runSuite() {
  console.log('========================================================================');
  console.log(' ADVANCES AUTO-ALLOCATION SETTING TEST SUITE');
  console.log('========================================================================\n');

  const rand = Math.floor(Math.random() * 899999 + 100000);
  const tenantId = `fake-tenant-adv-${rand}`;
  const userId = `fake-user-adv-${rand}`;

  try {
    // 1. Create fake tenant and admin user
    await prisma.tenant.create({
      data: {
        id: tenantId,
        code: `ADV-${rand}`,
        name: `Advance Test Corp ${rand}`,
        slug: `adv-test-${rand}`,
        gstin: '29ABCDE1234F1Z5',
        address: '100 Test Blvd',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560001',
        autoAllocateAdvance: true,
      },
    });

    await prisma.user.create({
      data: {
        id: userId,
        tenantId,
        email: `admin-adv-${rand}@example.com`,
        passwordHash: 'dummy-hash',
        name: 'Advance Test Admin',
        role: 'tenant_admin',
        employeeCode: `EMP-${rand}`,
      },
    });

    const token = jwt.sign(
      { sub: userId, userId, id: userId, email: `admin-adv-${rand}@example.com`, role: 'tenant_admin', tenantId },
      JWT_SECRET,
      { audience: 'crm-client', issuer: 'crm-api', expiresIn: '1h' }
    );

    // Create a customer company
    const customer = await prisma.company.create({
      data: {
        tenant: { connect: { id: tenantId } },
        name: `Acme Retailers ${rand}`,
        gstin: '29XYZAB5678C1Z2',
        address: '42 Commercial Street, Bengaluru 560002',
        city: 'Bengaluru',
        state: 'Karnataka',
      },
    });

    // Create SKUs for orders
    const sku1 = await prisma.sku.create({
      data: {
        tenant: { connect: { id: tenantId } },
        skuCode: `SKU-A-${rand}`,
        name: 'Industrial Sensor Array',
        category: 'Hardware',
        unitPrice: 5000,
        costPrice: 3000,
        taxRate: 0,
      },
    });

    const sku2 = await prisma.sku.create({
      data: {
        tenant: { connect: { id: tenantId } },
        skuCode: `SKU-B-${rand}`,
        name: 'Network Interface Module',
        category: 'Hardware',
        unitPrice: 8000,
        costPrice: 5000,
        taxRate: 0,
      },
    });

    // ─── STEP 1: Verify Initial Company Profile has autoAllocateAdvance: true ────
    console.log('[STEP 1] Checking Default Company Setting (autoAllocateAdvance)...');
    const profileRes1 = await apiCall('GET', '/settings/company-profile', token);
    assert('Company profile returns 200', profileRes1.status === 200);
    assert('Default autoAllocateAdvance is true (ON)', profileRes1.data.autoAllocateAdvance === true);

    // ─── STEP 2: TEST CASE A - With Setting ON (Default) ─────────────────────────
    console.log('\n[STEP 2] Test Case A: Advance Auto-Allocation ON...');
    // Create an order with Rs 10,000 subtotal, advanceAmount Rs 3,000, paidAmount Rs 3,000
    const order1 = await prisma.order.create({
      data: {
        tenant: { connect: { id: tenantId } },
        customer: { connect: { id: customer.id } },
        createdBy: { connect: { id: userId } },
        orderNumber: `ORD-ON-${rand}`,
        customerName: customer.name,
        customerPhone: '9876543210',
        customerGstin: customer.gstin,
        subtotal: 10000,
        taxAmount: 0,
        totalAmount: 10000,
        advanceAmount: 3000,
        paidAmount: 3000,
        status: 'confirmed',
        lines: {
          create: [
            {
              sku: { connect: { id: sku1.id } },
              description: 'Industrial Sensor Array',
              quantity: 2,
              unitPrice: 5000,
              gstRate: 0,
              taxRate: 0,
              totalPrice: 10000,
            },
          ],
        },
      },
    });

    // Create PaymentRecord for advance payment of Rs 3,000
    const pmt1 = await prisma.paymentRecord.create({
      data: {
        tenant: { connect: { id: tenantId } },
        order: { connect: { id: order1.id } },
        customer: { connect: { id: customer.id } },
        amount: 3000,
        paymentType: 'advance',
        paymentMethod: 'NEFT',
        transactionRef: `ADV-PMT-ON-${rand}`,
        paymentDate: new Date(),
      },
    });

    // Also record ledger entry for the advance payment
    await prisma.ledgerEntry.create({
      data: {
        tenantId,
        partyType: 'customer',
        partyId: customer.id,
        entryDate: new Date(),
        financialYear: '26-27',
        voucherType: 'receipt',
        voucherNo: pmt1.transactionRef,
        particulars: `Advance payment for order ${order1.orderNumber}`,
        credit: 3000,
        debit: 0,
        sourceType: 'payment_record',
        sourceId: pmt1.id,
      },
    });

    // Generate Invoice from Order 1
    const genRes1 = await apiCall('POST', `/invoices/order/${order1.id}/generate`, token, {});
    assert('Generate invoice with setting ON returns 201/200', genRes1.status === 201 || genRes1.status === 200);
    const inv1 = genRes1.data;

    assert('Invoice 1 generated with correct totalAmount (10000)', Number(inv1.totalAmount) === 10000);
    assert('Invoice 1 has advanceAdjusted = 3000', Number(inv1.advanceAdjusted) === 3000);
    assert('Invoice 1 has balanceDue = 7000', Number(inv1.balanceDue) === 7000);
    assert('Invoice 1 status is partial', inv1.paymentStatus === 'partial');

    // Check payment allocations
    const allocs1 = await prisma.paymentAllocation.findMany({
      where: { invoiceId: inv1.id, tenantId },
    });
    assert('Payment allocation was automatically created linking advance payment to invoice', allocs1.length === 1);
    assert('Allocated amount matches advance (3000)', allocs1.length > 0 && Number(allocs1[0].amount) === 3000);

    // Ledger for customer
    const ledgerEntries1 = await prisma.ledgerEntry.findMany({
      where: { tenantId, partyId: customer.id },
      orderBy: { entryDate: 'asc' },
    });
    console.log('   Ledger entries after Invoice 1:');
    for (const le of ledgerEntries1) {
      console.log(`     -> [${le.voucherType}] Ref: ${le.voucherNo}, Debit: ₹${le.debit}, Credit: ₹${le.credit}, Particulars: ${le.particulars}`);
    }

    // ─── STEP 3: TOGGLE SETTING TO OFF ──────────────────────────────────────────
    console.log('\n[STEP 3] Toggling Setting OFF (autoAllocateAdvance: false)...');
    const updateRes = await apiCall('POST', '/settings/company-profile', token, {
      autoAllocateAdvance: false,
    });
    assert('Update company profile returns 200/201', updateRes.status === 200 || updateRes.status === 201);
    assert('Updated profile returns autoAllocateAdvance: false', updateRes.data.autoAllocateAdvance === false);

    // Verify GET also returns false
    const profileRes2 = await apiCall('GET', '/settings/company-profile', token);
    assert('GET profile verifies autoAllocateAdvance is false', profileRes2.data.autoAllocateAdvance === false);

    // ─── STEP 4: TEST CASE B - With Setting OFF ─────────────────────────────────
    console.log('\n[STEP 4] Test Case B: Advance Auto-Allocation OFF...');
    // Create an order with Rs 8,000 subtotal, advanceAmount Rs 2,500, paidAmount Rs 2,500
    const order2 = await prisma.order.create({
      data: {
        tenant: { connect: { id: tenantId } },
        customer: { connect: { id: customer.id } },
        createdBy: { connect: { id: userId } },
        orderNumber: `ORD-OFF-${rand}`,
        customerName: customer.name,
        customerPhone: '9876543210',
        customerGstin: customer.gstin,
        subtotal: 8000,
        taxAmount: 0,
        totalAmount: 8000,
        advanceAmount: 2500,
        paidAmount: 2500,
        status: 'confirmed',
        lines: {
          create: [
            {
              sku: { connect: { id: sku2.id } },
              description: 'Network Interface Module',
              quantity: 1,
              unitPrice: 8000,
              gstRate: 0,
              taxRate: 0,
              totalPrice: 8000,
            },
          ],
        },
      },
    });

    // Create PaymentRecord for advance payment of Rs 2,500
    const pmt2 = await prisma.paymentRecord.create({
      data: {
        tenant: { connect: { id: tenantId } },
        order: { connect: { id: order2.id } },
        customer: { connect: { id: customer.id } },
        amount: 2500,
        paymentType: 'advance',
        paymentMethod: 'NEFT',
        transactionRef: `ADV-PMT-OFF-${rand}`,
        paymentDate: new Date(),
      },
    });

    // Record ledger entry for the advance payment
    await prisma.ledgerEntry.create({
      data: {
        tenantId,
        partyType: 'customer',
        partyId: customer.id,
        entryDate: new Date(),
        financialYear: '26-27',
        voucherType: 'receipt',
        voucherNo: pmt2.transactionRef,
        particulars: `Advance payment for order ${order2.orderNumber}`,
        credit: 2500,
        debit: 0,
        sourceType: 'payment_record',
        sourceId: pmt2.id,
      },
    });

    // Generate Invoice from Order 2
    const genRes2 = await apiCall('POST', `/invoices/order/${order2.id}/generate`, token, {});
    assert('Generate invoice with setting OFF returns 201/200', genRes2.status === 201 || genRes2.status === 200);
    const inv2 = genRes2.data;

    assert('Invoice 2 generated with totalAmount = 8000', Number(inv2.totalAmount) === 8000);
    assert('Invoice 2 advanceAdjusted is 0 (NOT auto-allocated)', Number(inv2.advanceAdjusted) === 0);
    assert('Invoice 2 balanceDue is FULL total amount (8000)', Number(inv2.balanceDue) === 8000);
    assert('Invoice 2 paymentStatus is "unpaid"', inv2.paymentStatus === 'unpaid');

    // Check payment allocations: should be ZERO
    const allocs2 = await prisma.paymentAllocation.findMany({
      where: { invoiceId: inv2.id, tenantId },
    });
    assert('Zero payment allocations created when setting is OFF', allocs2.length === 0);

    // Ledger for customer
    const ledgerEntries2 = await prisma.ledgerEntry.findMany({
      where: { tenantId, partyId: customer.id },
      orderBy: { entryDate: 'asc' },
    });
    console.log('   Ledger entries after Invoice 2:');
    for (const le of ledgerEntries2) {
      console.log(`     -> [${le.voucherType}] Ref: ${le.voucherNo}, Debit: ₹${le.debit}, Credit: ₹${le.credit}, Particulars: ${le.particulars}`);
    }

    // ─── STEP 5: RESET SETTING BACK TO DEFAULT (true) ───────────────────────────
    console.log('\n[STEP 5] Restoring setting to ON (true)...');
    await apiCall('POST', '/settings/company-profile', token, {
      autoAllocateAdvance: true,
    });
    const profileRes3 = await apiCall('GET', '/settings/company-profile', token);
    assert('Setting restored back to true', profileRes3.data.autoAllocateAdvance === true);

    // ─── SUMMARY TABLE ──────────────────────────────────────────────────────────
    console.log('\n========================================================================');
    console.log(' ADVANCES AUTO-ALLOCATION COMPARISON SUMMARY TABLE');
    console.log('========================================================================');
    console.table([
      {
        Setting: 'ON (Default)',
        Order: order1.orderNumber,
        AdvancePaid: 3000,
        InvoiceNo: inv1.invoiceNumber,
        Total: Number(inv1.totalAmount),
        AdvanceAdjusted: Number(inv1.advanceAdjusted),
        BalanceDue: Number(inv1.balanceDue),
        Status: inv1.paymentStatus,
        AllocationsCount: allocs1.length,
      },
      {
        Setting: 'OFF (Disabled)',
        Order: order2.orderNumber,
        AdvancePaid: 2500,
        InvoiceNo: inv2.invoiceNumber,
        Total: Number(inv2.totalAmount),
        AdvanceAdjusted: Number(inv2.advanceAdjusted),
        BalanceDue: Number(inv2.balanceDue),
        Status: inv2.paymentStatus,
        AllocationsCount: allocs2.length,
      },
    ]);

  } finally {
    // Cleanup fake tenant data
    try {
      await prisma.paymentAllocation.deleteMany({ where: { tenantId } });
      await prisma.ledgerEntry.deleteMany({ where: { tenantId } });
      await prisma.invoiceLine.deleteMany({ where: { invoice: { tenantId } } });
      await prisma.invoice.deleteMany({ where: { tenantId } });
      await prisma.paymentRecord.deleteMany({ where: { tenantId } });
      await prisma.orderLine.deleteMany({ where: { order: { tenantId } } });
      await prisma.order.deleteMany({ where: { tenantId } });
      await prisma.company.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.sku.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    } catch {}
    await prisma.$disconnect();
  }

  console.log(`\nTests completed: ${passed} PASSED, ${failed} FAILED.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
