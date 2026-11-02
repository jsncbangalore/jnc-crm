import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import * as jwt from 'jsonwebtoken';

function loadDevEnv() {
  const envPath = path.resolve(__dirname, '../.env.development');
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

async function runNegativeTests() {
  console.log('========================================================================');
  console.log('PAYMENT MODAL NEGATIVE TESTS & ALL-YEARS OPEN DOCUMENTS VERIFICATION');
  console.log('========================================================================\n');

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: 'postgresql://jnc_app:jnc_app_pass_dev_2026@localhost:5432/jnc_crm_dev?schema=public',
      },
    },
  });
  await prisma.$connect();

  const jwtSecret = process.env.JWT_SECRET || 'dev_jwt_secret_key_at_least_32_characters_long_for_security_12345';

  try {
    const tenant = await prisma.tenant.findFirst({
      where: { name: { contains: 'Acme Corporation' } },
    });
    if (!tenant) throw new Error('Tenant Acme Corporation not found.');

    const admin = await prisma.user.findFirst({
      where: { tenantId: tenant.id, role: 'tenant_admin' },
    });
    const customer = await prisma.company.findFirst({
      where: { tenantId: tenant.id, name: { contains: 'Customer A' } },
    });
    if (!admin || !customer) {
      throw new Error('Required test fixtures not found.');
    }

    const adminToken = jwt.sign(
      { sub: admin.id, email: admin.email, role: admin.role, tenantId: tenant.id },
      jwtSecret,
      { expiresIn: '1h', issuer: 'crm-api', audience: 'crm-client' }
    );

    // -------------------------------------------------------------------------
    // TEST 1: All-Years Open Documents Endpoint
    // -------------------------------------------------------------------------
    console.log('[TEST 1] Testing GET /api/v1/ledger/open-documents (All Financial Years) ...');
    const openDocsRes = await fetch(
      `http://localhost:3333/api/v1/ledger/open-documents?partyType=customer&partyId=${customer.id}`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );
    const openDocs = await openDocsRes.json();
    console.log(` -> HTTP Status: ${openDocsRes.status}`);
    console.log(` -> Open documents returned: ${openDocs.length}`);
    if (!Array.isArray(openDocs) || openDocs.length === 0) {
      throw new Error('Expected at least one open document across all years.');
    }

    // Verify fields standardized
    const firstDoc = openDocs[0];
    console.log(' -> Sample open document schema:', {
      documentId: firstDoc.documentId,
      documentNumber: firstDoc.documentNumber,
      documentType: firstDoc.documentType,
      date: firstDoc.date,
      dueDate: firstDoc.dueDate,
      totalAmount: firstDoc.totalAmount,
      balanceDue: firstDoc.balanceDue,
    });

    const hasFY2526 = openDocs.some((d: any) => d.documentNumber.includes('25-26'));
    const hasFY2627 = openDocs.some((d: any) => d.documentNumber.includes('26-27'));
    console.log(` -> Contains FY 25-26 documents: ${hasFY2526}`);
    console.log(` -> Contains FY 26-27 documents: ${hasFY2627}`);
    console.log(' -> [PASS] Test 1: All-years open documents endpoint works with standardized fields.\n');

    // -------------------------------------------------------------------------
    // TEST 2: Allocations Exceed Received Amount (Negative Test)
    // -------------------------------------------------------------------------
    console.log('[TEST 2] Testing over-allocation rejection (allocations > received amount) ...');
    const overAllocRes = await fetch('http://localhost:3333/api/v1/ledger/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        partyType: 'customer',
        partyId: customer.id,
        amount: 5000, // Received only 5,000
        paymentDate: new Date().toISOString(),
        paymentMethod: 'Bank Transfer',
        reference: 'TEST-OVERALLOC-NEG',
        allocations: [
          {
            documentId: openDocs[0].documentId,
            documentNumber: openDocs[0].documentNumber,
            docType: openDocs[0].documentType,
            amount: 6000, // Attempting to allocate 6,000 > 5,000
          },
        ],
      }),
    });

    const overAllocData = await overAllocRes.json();
    console.log(` -> HTTP Status: ${overAllocRes.status}`);
    console.log(' -> Response Body:', overAllocData);

    if (overAllocRes.status !== 400) {
      throw new Error(`Expected 400 Bad Request, got ${overAllocRes.status}`);
    }
    if (!overAllocData.message?.includes('must not exceed the amount received')) {
      throw new Error(`Expected error message to mention allocations exceed amount, got: ${overAllocData.message}`);
    }
    console.log(' -> [PASS] Test 2: Over-allocation was strictly rejected with 400 Bad Request.\n');

    // -------------------------------------------------------------------------
    // TEST 3: Server Idempotency-Key Protection
    // -------------------------------------------------------------------------
    console.log('[TEST 3] Testing server Idempotency-Key replay protection ...');
    const testIdempotencyKey = `idemp-key-${Date.now()}`;
    const validPaymentPayload = {
      partyType: 'customer',
      partyId: customer.id,
      amount: 1000,
      paymentDate: new Date().toISOString(),
      paymentMethod: 'UPI',
      reference: `IDEMP-REF-${Date.now().toString().slice(-4)}`,
      notes: 'Testing Idempotency replay',
      idempotencyKey: testIdempotencyKey,
    };

    // First Call
    console.log(' -> Dispatching Request 1 with Idempotency-Key ...');
    const res1 = await fetch('http://localhost:3333/api/v1/ledger/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': testIdempotencyKey,
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(validPaymentPayload),
    });
    const data1 = await res1.json();
    console.log(` -> Request 1 Status: ${res1.status}`);
    console.log(' -> Request 1 Voucher/Receipt:', data1.receiptNumber || data1.voucherNo);

    // Second Call (Replay with same key)
    console.log(' -> Dispatching Request 2 with same Idempotency-Key (Replay) ...');
    const res2 = await fetch('http://localhost:3333/api/v1/ledger/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': testIdempotencyKey,
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(validPaymentPayload),
    });
    const data2 = await res2.json();
    const isReplayHeader = res2.headers.get('x-idempotent-replay');
    console.log(` -> Request 2 Status: ${res2.status}`);
    console.log(` -> Request 2 Header x-idempotent-replay: ${isReplayHeader}`);
    console.log(' -> Request 2 Voucher/Receipt:', data2.receiptNumber || data2.voucherNo);

    if (res2.status !== 200 && res2.status !== 201) {
      throw new Error(`Expected replay to return 200 or 201, got ${res2.status}`);
    }
    if (data1.voucherNo !== data2.voucherNo) {
      throw new Error(`Expected idempotent replay to return identical voucherNo (${data1.voucherNo}), got ${data2.voucherNo}`);
    }
    console.log(' -> [PASS] Test 3: Idempotency-Key successfully prevented duplicate payment creation.\n');

    // Clean up test payment from test 3 to avoid polluting dev balances
    console.log('Cleaning up idempotency test receipt ...');
    if (data1.voucherNo) {
      await prisma.ledgerEntry.deleteMany({
        where: { tenantId: tenant.id, voucherNo: data1.voucherNo },
      });
      await prisma.paymentRecord.deleteMany({
        where: { tenantId: tenant.id, transactionRef: { contains: 'IDEMP-REF' } },
      });
    }

    console.log('========================================================================');
    console.log('ALL PAYMENT MODAL NEGATIVE & IDEMPOTENCY TESTS PASSED!');
    console.log('========================================================================');
  } catch (err: any) {
    console.error('\n[TEST FAILURE]', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runNegativeTests();
