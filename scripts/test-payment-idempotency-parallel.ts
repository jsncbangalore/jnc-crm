import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev',
    },
  },
});

async function main() {
  console.log('================================================================================');
  console.log('TRUE PARALLEL PAYMENT IDEMPOTENCY TEST (10 SIMULTANEOUS REQUESTS -> 1 PAYMENT)');
  console.log('Database: jnc_crm_dev | Target API: http://localhost:3333');
  console.log('Timestamp:', new Date().toISOString());
  console.log('================================================================================\n');

  // 1. Authenticate as Tenant Admin
  const loginRes = await fetch('http://localhost:3333/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'tenant-admin@example.com',
      password: 'DevPassword@123',
    }),
  });
  if (!loginRes.ok) {
    throw new Error(`Failed to login: ${loginRes.status} ${await loginRes.text()}`);
  }
  const loginData = await loginRes.json();
  const token = loginData.accessToken;
  const tenantId = loginData.user?.tenantId || loginData.tenant?.id || '55051b53-7872-430e-b700-f7e6281e9ffe';
  console.log(`[AUTH] Authenticated as Tenant Admin. Tenant ID: ${tenantId}`);

  // 2. Find a Customer
  const customer = await prisma.company.findFirst({
    where: { tenantId, deletedAt: null },
  });
  if (!customer) {
    throw new Error('No customer found for tenant in database');
  }
  console.log(`[SETUP] Using Customer: ${customer.name} (${customer.id})`);

  // 3. Generate dynamic random idempotency key
  const randomSuffix = crypto.randomBytes(6).toString('hex');
  const idempotencyKey = `idem_parallel_${Date.now()}_${randomSuffix}`;
  console.log(`[TEST KEY] Idempotency Key: "${idempotencyKey}"`);

  // Pre-test DB count
  const initialPaymentCount = await prisma.paymentRecord.count({
    where: { tenantId, customerId: customer.id },
  });

  // 4. Prepare 10 simultaneous requests
  const paymentAmount = 2500;
  const payload = {
    partyType: 'customer',
    customerId: customer.id,
    amount: paymentAmount,
    paymentMethod: 'NEFT',
    transactionRef: `UTR_${randomSuffix.toUpperCase()}`,
    notes: `Parallel Test Payment ${randomSuffix}`,
    idempotencyKey,
  };

  console.log(`\nFiring 10 TRUE SIMULTANEOUS HTTP requests in parallel with Promise.all...`);
  const startTime = Date.now();

  const requests = Array.from({ length: 10 }, (_, index) => {
    return fetch('http://localhost:3333/api/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'idempotency-key': idempotencyKey,
        'x-idempotency-key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    }).then(async (res) => {
      const status = res.status;
      const data = await res.json().catch(() => ({}));
      return { index: index + 1, status, data };
    });
  });

  const results = await Promise.all(requests);
  const durationMs = Date.now() - startTime;
  console.log(`All 10 parallel requests completed in ${durationMs}ms.\n`);

  // 5. Evaluate HTTP responses
  console.log('--- Individual Request Results ---');
  const paymentIds = new Set<string>();
  const receiptNumbers = new Set<string>();
  let successfulRequests = 0;

  for (const r of results) {
    const pId = r.data?.payment?.id;
    const rNo = r.data?.receiptNumber || r.data?.payment?.transactionRef;
    if (pId) paymentIds.add(pId);
    if (rNo) receiptNumbers.add(rNo);

    const isSuccess = r.status >= 200 && r.status < 300;
    if (isSuccess) successfulRequests++;

    console.log(
      `Request #${String(r.index).padStart(2, '0')}: HTTP ${r.status} | Payment ID: ${pId || 'NONE'} | Receipt: ${rNo || 'NONE'}`
    );
  }

  // 6. Inspect Database directly
  console.log('\n--- Direct Database Verification ---');
  const finalPaymentCount = await prisma.paymentRecord.count({
    where: { tenantId, customerId: customer.id },
  });
  const netPaymentsCreated = finalPaymentCount - initialPaymentCount;
  console.log(`Pre-test Payments in DB: ${initialPaymentCount}`);
  console.log(`Post-test Payments in DB: ${finalPaymentCount}`);
  console.log(`Net Payments Created: ${netPaymentsCreated}`);

  // Query exact payment in DB
  const createdPayment = await prisma.paymentRecord.findFirst({
    where: {
      tenantId,
      customerId: customer.id,
      notes: { contains: randomSuffix },
    },
    include: { allocations: true },
  });

  // Query idempotency setting in DB
  const dbKey = `idempotency:payment:${tenantId}:${idempotencyKey}`;
  const idemSetting = await prisma.systemSetting.findUnique({
    where: { key: dbKey },
  });

  console.log(`Idempotency row in SystemSetting (${dbKey}): ${idemSetting ? 'PRESENT' : 'MISSING'}`);
  if (idemSetting) {
    const parsed = JSON.parse(idemSetting.value);
    console.log(`SystemSetting stored Payment ID: ${parsed?.result?.payment?.id}`);
  }

  // 7. Rigorous Assertions
  console.log('\n================================================================================');
  console.log('PARALLEL IDEMPOTENCY ASSERTION REPORT');
  console.log('================================================================================');

  let passed = true;

  function assert(label: string, condition: boolean) {
    if (condition) {
      console.log(`[PASS] ${label}`);
    } else {
      console.error(`[FAIL] ${label}`);
      passed = false;
    }
  }

  assert('All 10 simultaneous requests returned HTTP 2xx success', successfulRequests === 10);
  assert('All 10 responses returned the exact same unique payment ID', paymentIds.size === 1);
  assert('All 10 responses returned the exact same receipt number', receiptNumbers.size === 1);
  assert('Exactly ONE (1) payment record was created in the database', netPaymentsCreated === 1);
  assert('Created payment in DB matches the returned payment ID', createdPayment?.id === Array.from(paymentIds)[0]);
  assert('Unique (tenantId, key) row exists in SystemSetting table', Boolean(idemSetting));

  if (passed) {
    console.log('\n>>> TRUE PARALLEL IDEMPOTENCY TEST: 100% PASSED (10 requests, 1 payment) <<<\n');
  } else {
    console.error('\n>>> TEST FAILED: Idempotency violation detected! <<<\n');
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error in parallel test:', err);
  process.exit(1);
});
