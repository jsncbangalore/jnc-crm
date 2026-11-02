/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { PrismaClient } from '@prisma/client';
import { PaymentsService } from '../apps/api/src/payments/payments.service';
import { DocumentSeriesService } from '../apps/api/src/common/document-series.service';
import { ScopedUser } from '../apps/api/src/auth/scoping.service';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://jnc_app:jnc_app_pass_dev_2026@localhost:5432/jnc_crm_dev?schema=public',
    },
  },
});

async function run() {
  console.log('=== IDEMPOTENCY LOST RESPONSE & RETRY TEST ===');
  const now = Date.now();
  const tenantId = 'tenant-test-idempotency-' + now;
  const testUser: ScopedUser = {
    id: 'user-test-' + now,
    employeeCode: 'EMP-001',
    role: 'tenant_admin',
    tenantId,
  };

  try {
    // 1. Setup tenant & dummy customer
    console.log('[1/5] Setting up synthetic tenant and customer...');
    await prisma.tenant.create({
      data: {
        id: tenantId,
        code: 'TIDEM' + now.toString().slice(-4),
        slug: 'tenant-idem-' + now,
        name: 'Synthetic Test Enterprise',
        email: 'billing@internal-test.local',
        phone: '9876543210',
        gstin: '29AAAAA0000A1Z5',
        bankName: 'Test Bank',
        bankAccountNumber: '123456789012',
        bankIfsc: 'TEST0001234',
      },
    });

    const testDbUser = await prisma.user.create({
      data: {
        tenantId,
        email: `tester-${now}@internal-test.local`,
        name: 'Synthetic Test User',
        role: 'tenant_admin',
        employeeCode: 'EMP-' + now.toString().slice(-4),
        passwordHash: 'dummy-hash-test',
      },
    });

    testUser.id = testDbUser.id;
    testUser.employeeCode = testDbUser.employeeCode;

    const customer = await prisma.company.create({
      data: {
        tenantId,
        name: 'Test Customer Client Ltd',
        gstin: '29ABCDE1234F1Z5',
        billingEmail: 'customer@internal-test.local',
      },
    });

    const docSeriesService = new DocumentSeriesService(prisma as any);
    const mockAudit: any = { log: async () => {} };
    const paymentsService = new PaymentsService(
      prisma as any,
      mockAudit,
      docSeriesService
    );

    // 2. First call with Idempotency Key
    const idempotencyKey = 'idem-key-' + now;
    console.log(`[2/5] Recording payment with Idempotency-Key: ${idempotencyKey}...`);

    const paymentDto: any = {
      partyType: 'customer',
      customerId: customer.id,
      amount: 1500,
      paymentMethod: 'NEFT',
      reference: 'NEFT88234912',
      paymentDate: new Date().toISOString().slice(0, 10),
      notes: 'Initial attempt',
      isAdvance: true,
      allowAdvance: true,
      idempotencyKey,
    };

    const firstResult = await paymentsService.record(paymentDto, testUser);
    console.log('First Call Result Receipt Number:', firstResult.receiptNumber);

    // 3. Simulating lost response: client retries with the exact same Idempotency Key
    console.log('[3/5] Simulating lost network response: Retrying with identical Idempotency-Key...');
    const secondResult = await paymentsService.record(paymentDto, testUser);
    console.log('Second Call Result Receipt Number:', secondResult.receiptNumber);

    // 4. Assert both results match
    if (firstResult.receiptNumber !== secondResult.receiptNumber) {
      throw new Error(`Receipt numbers do not match! First: ${firstResult.receiptNumber}, Second: ${secondResult.receiptNumber}`);
    }
    console.log('✔ Retried request returned the exact original result.');

    // 5. Verify database records: EXACTLY ONE PaymentRecord must exist
    console.log('[4/5] Verifying database records count...');
    const records = await prisma.paymentRecord.findMany({
      where: { tenantId, customerId: customer.id },
    });

    console.log(`Database contains ${records.length} payment record(s) for customer.`);
    if (records.length !== 1) {
      throw new Error(`FAILURE: Expected exactly 1 payment record, found ${records.length}! Duplicate write detected.`);
    }
    console.log('✔ Exactly one payment record exists in database. No duplicate write occurred.');

    // 6. Test checkIdempotency endpoint logic ('Check if it was saved')
    console.log('[5/5] Checking idempotency lookup function ("Check if it was saved")...');
    const checkStatus = await paymentsService.checkIdempotency(idempotencyKey, testUser);
    console.log('Check Idempotency Status:', checkStatus);
    if (!checkStatus.found || !checkStatus.exists) {
      throw new Error('FAILURE: Idempotency check returned found: false for processed key.');
    }
    console.log('✔ Idempotency check confirmed payment exists with status "completed".');

    console.log('\n========================================');
    console.log('ALL IDEMPOTENCY TESTS PASSED SUCCESSFULLY!');
    console.log('========================================\n');
  } finally {
    // Clean up synthetic test data
    await prisma.paymentRecord.deleteMany({ where: { tenantId } });
    await prisma.systemSetting.deleteMany({ where: { key: { startsWith: `idempotency:payment:${tenantId}` } } });
    await prisma.company.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  }
}

run().catch((err) => {
  console.error('\n❌ IDEMPOTENCY TEST FAILED:\n', err);
  process.exit(1);
});
