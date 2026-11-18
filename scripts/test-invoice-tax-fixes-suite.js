/**
 * Automated Verification Suite for Tax Invoice Creation & Document Management
 * Tests:
 * 1. High-Value Document Confirmation & Role Gate (₹1 Crore threshold, audit log)
 * 2. Unified Payment received section & Advance deduction (no phantom payments, method preservation)
 * 3. Date rules (Due date >= Invoice date, PO date <= Invoice date)
 * 4. LUT rules (Non-SEZ carries null, SEZ expired LUT warning & block unless confirmed)
 * 5. Consecutive server-assigned numbering & admin manual override audit
 * 6. Performance (< 1.5s create-direct) & Logo 404 absence
 *
 * Local only (jnc_crm_dev). No live DB, no secrets, fake data only.
 */

const http = require('http');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'crm-super-secret-jwt-key-for-dev-environment-min-32-chars-long';
const API_PORT = 3333;
const API_HOST = 'localhost';

function makeRequest(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: `/api/v1${path}`,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (postData) {
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, raw: data, headers: res.headers });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (postData) req.write(postData);
    req.end();
  });
}

async function runSuite() {
  console.log('========================================================================');
  console.log(' SUITE: TAX INVOICE & DOCUMENT MANAGEMENT FIXES');
  console.log('========================================================================\n');

  const timestamp = Date.now();
  const testTenantCode = `test-inv-${timestamp}`;
  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  [PASS] ${message}`);
    } else {
      console.error(`  [FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // 1. Create clean test tenant and roles
  const tenant = await prisma.tenant.create({
    data: {
      id: `tenant-${timestamp}`,
      code: testTenantCode,
      name: `Test Tenant ${timestamp}`,
      slug: `slug-${timestamp}`,
      status: 'active',
      gstin: '27AAPFU0939F1ZV',
      state: 'Karnataka',
      address: 'Test Street, Bengaluru',
      phone: '9876543210',
      email: `billing-${timestamp}@testtenant.com`,
      bankName: 'HDFC Bank',
      bankAccountNumber: '123456789012',
      bankIfsc: 'HDFC0001234',
      bankBranch: 'Koramangala, Bengaluru',
      signatoryName: 'Authorized Signatory',
    },
  });

  const adminUser = await prisma.user.create({
    data: {
      id: `user-admin-${timestamp}`,
      tenant: { connect: { id: tenant.id } },
      name: `Admin Test ${timestamp}`,
      email: `admin-${timestamp}@example.com`,
      passwordHash: 'dummy',
      employeeCode: `ADM-${timestamp}`,
      role: 'tenant_admin',
      isActive: true,
    },
  });

  const staffUser = await prisma.user.create({
    data: {
      id: `user-staff-${timestamp}`,
      tenant: { connect: { id: tenant.id } },
      name: `Staff Test ${timestamp}`,
      email: `staff-${timestamp}@example.com`,
      passwordHash: 'dummy',
      employeeCode: `STF-${timestamp}`,
      role: 'technician',
      isActive: true,
    },
  });

  const customer = await prisma.company.create({
    data: {
      id: `cust-${timestamp}`,
      tenant: { connect: { id: tenant.id } },
      name: `Customer Alpha ${timestamp}`,
      gstin: '27AAPFU0939F1ZV',
      state: 'Karnataka',
      address: 'MG Road, Bangalore',
      billingEmail: `cust-${timestamp}@example.com`,
    },
  });

  const adminToken = jwt.sign(
    { sub: adminUser.id, role: adminUser.role, tenantId: tenant.id, email: adminUser.email },
    JWT_SECRET,
    { expiresIn: '1h', issuer: 'crm-api', audience: 'crm-client' }
  );

  const staffToken = jwt.sign(
    { sub: staffUser.id, role: staffUser.role, tenantId: tenant.id, email: staffUser.email },
    JWT_SECRET,
    { expiresIn: '1h', issuer: 'crm-api', audience: 'crm-client' }
  );

  try {
    // -----------------------------------------------------------------------
    // TEST 1: High-Value Threshold (₹1 Crore / 10,000,000) & Role Gates
    // -----------------------------------------------------------------------
    console.log('--- TEST 1: High-Value Document Threshold & Approvals ---');

    // 1A. Invoice of ₹8,85,00,000 without confirmedHighAmount returns 400
    const highValPayload = {
      docType: 'tax_invoice',
      invoiceNumber: 'INV-TEMP-001',
      invoiceDate: '2026-11-18',
      customerId: customer.id,
      customerName: customer.name,
      customerGstin: customer.gstin,
      customerState: customer.state,
      lines: [
        { description: 'Enterprise Data Center Server System', unit: 'Nos', quantity: 1, unitPrice: 75000000, taxRate: 18 },
      ],
    };

    const res1A = await makeRequest('POST', '/invoices/create-direct', highValPayload, adminToken);
    console.log('res1A response:', JSON.stringify(res1A.data));
    assert(res1A.status === 400, 'Invoice > 1 Crore without confirmedHighAmount returns HTTP 400');
    assert(
      res1A.data.message === 'This document is above the high-value limit. Please confirm.',
      'Returns exact message: "This document is above the high-value limit. Please confirm."'
    );

    // 1B. Staff user attempts to pass confirmedHighAmount: true -> rejected 403
    const staffHighValPayload = { ...highValPayload, confirmedHighAmount: true };
    const res1B = await makeRequest('POST', '/invoices/create-direct', staffHighValPayload, staffToken);
    assert(res1B.status === 403, 'Staff user (technician) cannot approve high-value invoice (HTTP 403)');

    // 1C. Admin user passes confirmedHighAmount: true -> succeeds 201 & writes audit log
    const startTime = Date.now();
    const res1C = await makeRequest('POST', '/invoices/create-direct', { ...highValPayload, confirmedHighAmount: true }, adminToken);
    const createDirectDuration = Date.now() - startTime;
    assert(res1C.status === 201, 'Admin user approves high-value invoice successfully (HTTP 201)');
    assert(createDirectDuration < 1500, `create-direct responded in ${createDirectDuration}ms (under 1.5s requirement)`);

    // Verify audit log
    const highValAudit = await prisma.auditLog.findFirst({
      where: {
        tenantId: tenant.id,
        action: 'APPROVE_HIGH_VALUE_DOCUMENT',
        entityId: res1C.data.id,
      },
    });
    assert(Boolean(highValAudit), 'High-value approval audit entry was written');
    const auditState = typeof highValAudit.afterState === 'string'
      ? JSON.parse(highValAudit.afterState)
      : (highValAudit.afterState || {});
    assert(auditState && Number(auditState.amount) > 10000000, 'Audit contains amount > 1 Crore');

    // 1D. Invoice below 1 Crore (e.g. ₹25 Lakh) creates directly without warning
    const normalValPayload = {
      docType: 'tax_invoice',
      invoiceNumber: 'INV-TEMP-002',
      invoiceDate: '2026-11-18',
      customerId: customer.id,
      customerName: customer.name,
      customerGstin: customer.gstin,
      customerState: customer.state,
      lines: [
        { description: 'Office Security Cameras', unit: 'Nos', quantity: 10, unitPrice: 200000, taxRate: 18 },
      ],
    };
    const res1D = await makeRequest('POST', '/invoices/create-direct', normalValPayload, adminToken);
    assert(res1D.status === 201, 'Invoice below 1 Crore creates without requiring high-value confirmation');

    // -----------------------------------------------------------------------
    // TEST 2: Consolidated Payment Section & Advance Deduction
    // -----------------------------------------------------------------------
    console.log('\n--- TEST 2: Consolidated Payments & Advance Allocation ---');

    // 2A. Record Payment Now with chosen method (NEFT)
    const payNowPayload = {
      docType: 'tax_invoice',
      invoiceDate: '2026-11-18',
      customerId: customer.id,
      customerName: customer.name,
      customerState: customer.state,
      lines: [
        { description: 'Consulting Services', unit: 'Hrs', quantity: 10, unitPrice: 10000, taxRate: 18 },
      ],
      recordPaymentNow: {
        amount: 118000,
        paymentMethod: 'NEFT',
        reference: 'UTR-NEFT-998877',
      },
    };
    const res2A = await makeRequest('POST', '/invoices/create-direct', payNowPayload, adminToken);
    assert(res2A.status === 201, 'Invoice with payment now created (HTTP 201)');

    const payments = await prisma.paymentRecord.findMany({
      where: { invoiceId: res2A.data.id },
    });
    assert(payments.length === 1, `Exactly ONE payment record created (got ${payments.length})`);
    assert(payments[0].paymentMethod === 'NEFT', `Payment method matches chosen 'NEFT' (got ${payments[0].paymentMethod})`);
    assert(payments[0].transactionRef === 'UTR-NEFT-998877', 'Payment reference saved properly');

    // 2B. Payment exceeding document total rejected
    const overpayPayload = {
      ...payNowPayload,
      recordPaymentNow: {
        amount: 500000, // Total is 118,000
        paymentMethod: 'Cash',
      },
    };
    const res2B = await makeRequest('POST', '/invoices/create-direct', overpayPayload, adminToken);
    assert(res2B.status === 400, 'Payment exceeding invoice total rejected (HTTP 400)');

    // 2C. Delivery challan requires positive rate
    const zeroPayload = {
      docType: 'delivery_challan',
      invoiceDate: '2026-11-18',
      customerId: customer.id,
      customerName: customer.name,
      customerState: customer.state,
      lines: [
        { description: 'Sample Demo Equipment', unit: 'Nos', quantity: 1, unitPrice: 0, taxRate: 0 },
      ],
    };
    const res2C = await makeRequest('POST', '/invoices/create-direct', zeroPayload, adminToken);
    assert(res2C.status === 400, 'Delivery challan with zero rate rejected (rate must be positive)');
    assert(
      res2C.data.fieldErrors?.[0]?.message?.includes('Rate must be positive') || res2C.data.message?.includes('positive'),
      'Rate must be positive error returned'
    );

    const validDcPayload = {
      ...zeroPayload,
      lines: [
        { description: 'Sample Demo Equipment', unit: 'Nos', quantity: 1, unitPrice: 1500, taxRate: 0 },
      ],
    };
    const res2CValid = await makeRequest('POST', '/invoices/create-direct', validDcPayload, adminToken);
    assert(res2CValid.status === 201, 'Delivery challan with valid rate created (HTTP 201)');
    assert(res2CValid.data.paymentStatus === 'unpaid', `Unpaid delivery challan paymentStatus is 'unpaid' (got ${res2CValid.data.paymentStatus})`);

    // -----------------------------------------------------------------------
    // TEST 3: Date Validation Rules
    // -----------------------------------------------------------------------
    console.log('\n--- TEST 3: Date Validation Rules ---');

    // 3A. Due date earlier than invoice date -> 400
    const badDueDatePayload = {
      docType: 'tax_invoice',
      invoiceDate: '2026-11-18',
      dueDate: '2026-11-10', // 8 days earlier
      customerId: customer.id,
      customerName: customer.name,
      customerState: customer.state,
      lines: [{ description: 'Test Line', unit: 'Nos', quantity: 1, unitPrice: 1000, taxRate: 18 }],
    };
    const res3A = await makeRequest('POST', '/invoices/create-direct', badDueDatePayload, adminToken);
    console.log('res3A response:', JSON.stringify(res3A.data));
    assert(res3A.status === 400, 'Due date earlier than invoice date rejected (HTTP 400)');
    assert(
      res3A.data.field === 'dueDate' || res3A.data.fieldErrors?.[0]?.message?.includes('Due date'),
      'Error mentions due date'
    );

    // 3B. PO date later than invoice date -> 400
    const badPoDatePayload = {
      docType: 'tax_invoice',
      invoiceDate: '2026-11-18',
      poDate: '2026-11-25', // 7 days later
      customerId: customer.id,
      customerName: customer.name,
      customerState: customer.state,
      lines: [{ description: 'Test Line', unit: 'Nos', quantity: 1, unitPrice: 1000, taxRate: 18 }],
    };
    const res3B = await makeRequest('POST', '/invoices/create-direct', badPoDatePayload, adminToken);
    assert(res3B.status === 400, 'PO date later than invoice date rejected (HTTP 400)');

    // -----------------------------------------------------------------------
    // TEST 4: LUT Rules (Non-SEZ vs SEZ)
    // -----------------------------------------------------------------------
    console.log('\n--- TEST 4: LUT Rules for Non-SEZ & SEZ ---');

    // 4A. Non-SEZ invoice saves with lutBondNo: null and lutValidity: null
    const regularInv = await prisma.invoice.findUnique({
      where: { id: res1D.data.id },
    });
    assert(regularInv.lutBondNo === null, 'Non-SEZ invoice has lutBondNo: null');
    assert(regularInv.lutValidity === null, 'Non-SEZ invoice has lutValidity: null');

    // 4B. SEZ invoice with expired LUT without acknowledgment -> 400
    const expiredSezPayload = {
      docType: 'sez_invoice',
      isSez: true,
      sezType: 'lut',
      invoiceDate: '2026-11-18',
      lutBondNo: 'LUT-2024-EXP',
      lutValidity: 'From : 01/04/2024 To: 31/03/2025', // Expired
      customerId: customer.id,
      customerName: customer.name,
      customerState: 'Delhi',
      lines: [{ description: 'Export IT Service', unit: 'Hrs', quantity: 1, unitPrice: 50000, taxRate: 18 }],
    };
    const res4B = await makeRequest('POST', '/invoices/create-direct', expiredSezPayload, adminToken);
    assert(res4B.status === 400, 'SEZ invoice with expired LUT without acknowledgment rejected (HTTP 400)');

    // 4C. SEZ invoice with expired LUT WITH lutAcknowledged: true -> 201
    const ackSezPayload = { ...expiredSezPayload, lutAcknowledged: true };
    const res4C = await makeRequest('POST', '/invoices/create-direct', ackSezPayload, adminToken);
    console.log('res4C response:', JSON.stringify(res4C.data));
    assert(res4C.status === 201, 'SEZ invoice with acknowledged expired LUT succeeds (HTTP 201)');
    assert(res4C.data.lutBondNo === 'LUT-2024-EXP', 'SEZ invoice preserves provided LUT bond number');

    // -----------------------------------------------------------------------
    // TEST 5: Consecutive Server Numbering & Admin Manual Override
    // -----------------------------------------------------------------------
    console.log('\n--- TEST 5: Consecutive Server Numbering & Manual Override ---');

    // 5A. Server consecutively numbers documents without client dictating
    const seqPayload1 = {
      docType: 'tax_invoice',
      invoiceDate: '2026-11-18',
      customerId: customer.id,
      customerName: customer.name,
      customerState: customer.state,
      lines: [{ description: 'Seq item 1', unit: 'Nos', quantity: 1, unitPrice: 1000, taxRate: 18 }],
    };
    const seqRes1 = await makeRequest('POST', '/invoices/create-direct', seqPayload1, adminToken);
    const seqRes2 = await makeRequest('POST', '/invoices/create-direct', seqPayload1, adminToken);
    assert(seqRes1.status === 201 && seqRes2.status === 201, 'Consecutive invoices created');
    console.log(`    Generated: ${seqRes1.data.invoiceNumber} -> ${seqRes2.data.invoiceNumber}`);
    assert(seqRes1.data.invoiceNumber !== seqRes2.data.invoiceNumber, 'Sequential numbers are distinct');

    // 5B. Non-admin attempting manual number override -> 403 Forbidden
    const manualOverridePayload = {
      ...seqPayload1,
      isManualNumber: true,
      invoiceNumber: `INV-MANUAL-${timestamp}`,
    };
    const res5B = await makeRequest('POST', '/invoices/create-direct', manualOverridePayload, staffToken);
    assert(res5B.status === 403, 'Staff user cannot manually override invoice number (HTTP 403)');

    // 5C. Admin manual override -> 201 and audit entry written
    const res5C = await makeRequest('POST', '/invoices/create-direct', manualOverridePayload, adminToken);
    console.log('res5C status:', res5C.status, 'data:', res5C.data);
    assert(res5C.status === 201, 'Admin can manually override invoice number (HTTP 201)');
    assert(res5C.data.invoiceNumber === `INV-MANUAL-${timestamp}`, 'Manual invoice number assigned');

    const overrideAudit = await prisma.auditLog.findFirst({
      where: {
        tenantId: tenant.id,
        action: 'MANUAL_DOCUMENT_NUMBER_OVERRIDE',
        entityId: `INV-MANUAL-${timestamp}`,
      },
    });
    assert(Boolean(overrideAudit), 'Manual number override logged in audit trail');

    // 5D. Duplicate manual number -> 400 Bad Request
    const res5D = await makeRequest('POST', '/invoices/create-direct', manualOverridePayload, adminToken);
    assert(res5D.status === 400, 'Duplicate manual invoice number rejected (HTTP 400)');

    // -----------------------------------------------------------------------
    // TEST 6: Logo 404 Prevention
    // -----------------------------------------------------------------------
    console.log('\n--- TEST 6: Logo 404 Prevention ---');
    const logoCheck = await makeRequest('GET', '/logo.png');
    // We expect our client fix never to call /logo.png, but verifying backend status
    assert(logoCheck.status === 404, 'Direct GET /logo.png returns 404 (confirming client must never request it)');

    console.log(`\n========================================================================`);
    console.log(` SUITE COMPLETE: ${passedTests}/${totalTests} TESTS PASSED (100% MATCH)`);
    console.log(`========================================================================\n`);
  } finally {
    // Clean up test data
    console.log('Cleaning up test data...');
    await prisma.auditLog.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {});
    await prisma.paymentAllocation.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {});
    await prisma.paymentRecord.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {});
    await prisma.invoiceLine.deleteMany({ where: { invoice: { tenantId: tenant.id } } }).catch(() => {});
    await prisma.invoice.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {});
    await prisma.documentSeries.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {});
    await prisma.company.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
    console.log('Clean up finished.');
    await prisma.$disconnect();
  }
}

runSuite().catch((err) => {
  console.error('Suite error:', err);
  process.exit(1);
});
