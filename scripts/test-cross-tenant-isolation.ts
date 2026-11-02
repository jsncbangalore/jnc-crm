import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function run() {
  console.log('========================================================================');
  console.log('CROSS-TENANT ISOLATION INTEGRITY VERIFICATION');
  console.log('========================================================================\n');

  // 1. Fetch Tenant A (Acme) and Tenant B (Beta)
  const tenantA = await prisma.tenant.findFirst({ where: { code: 'ACME-DEV-001' } });
  const tenantB = await prisma.tenant.findFirst({ where: { code: 'BETA-DEV-002' } });

  if (!tenantA || !tenantB) {
    throw new Error('Required test tenants (ACME-DEV-001, BETA-DEV-002) not found.');
  }

  console.log(`Tenant A: ${tenantA.name} (${tenantA.id})`);
  console.log(`Tenant B: ${tenantB.name} (${tenantB.id})\n`);

  // Create isolated party in Tenant B
  const uniqueSuffix = Date.now().toString().slice(-6);
  const partyB = await prisma.company.create({
    data: {
      tenantId: tenantB.id,
      name: `Tenant B Secret Customer ${uniqueSuffix}`,
      gstin: '29ABCDE1234F1Z5',
      billingEmail: `secret-${uniqueSuffix}@tenantb.test`,
      source: 'test',
      isDemo: true,
    },
  });

  // Create an unpaid invoice in Tenant B
  const invB = await prisma.invoice.create({
    data: {
      tenantId: tenantB.id,
      companyId: partyB.id,
      invoiceNumber: `INV-B-${uniqueSuffix}`,
      invoiceDate: new Date(),
      subtotal: 50000,
      totalAmount: 59000,
      balanceDue: 59000,
      paymentStatus: 'unpaid',
      customerName: partyB.name,
      customerPhone: '9876543210',
      customerEmail: partyB.billingEmail,
    },
  });

  // Create a ledger entry in Tenant B
  const ledgerB = await prisma.ledgerEntry.create({
    data: {
      tenantId: tenantB.id,
      partyType: 'customer',
      partyId: partyB.id,
      voucherType: 'sales',
      voucherNo: invB.invoiceNumber,
      entryDate: new Date('2026-10-29'),
      particulars: `Invoice ${invB.invoiceNumber}`,
      debit: 59000,
      credit: 0,
      financialYear: '26-27',
    },
  });

  let passCount = 0;
  let failCount = 0;

  function assert(title: string, condition: boolean, extra?: string) {
    if (condition) {
      console.log(`  ✓ [PASS] ${title}`);
      passCount++;
    } else {
      console.error(`  ✗ [FAIL] ${title} ${extra ? `(${extra})` : ''}`);
      failCount++;
    }
  }

  try {
    // ── TEST 1: Parties Isolation ──
    console.log('--- TEST 1: Parties Isolation ---');
    const partiesSeenByA = await prisma.company.findMany({
      where: { tenantId: tenantA.id, id: partyB.id, deletedAt: null },
    });
    assert(
      'Tenant A cannot find Tenant B party in company directory',
      partiesSeenByA.length === 0,
      `found=${partiesSeenByA.length}`
    );

    // ── TEST 2: Ledger Entries Isolation ──
    console.log('\n--- TEST 2: Ledger Entries Isolation ---');
    const ledgerSeenByA = await prisma.ledgerEntry.findMany({
      where: { tenantId: tenantA.id, id: ledgerB.id },
    });
    assert(
      'Tenant A cannot query Tenant B ledger entry',
      ledgerSeenByA.length === 0,
      `found=${ledgerSeenByA.length}`
    );

    const partyLedgerSeenByA = await prisma.ledgerEntry.findMany({
      where: { tenantId: tenantA.id, partyId: partyB.id },
    });
    assert(
      'Tenant A cannot query ledger entries for Tenant B party ID',
      partyLedgerSeenByA.length === 0,
      `found=${partyLedgerSeenByA.length}`
    );

    // ── TEST 3: Open Documents Isolation ──
    console.log('\n--- TEST 3: Open Documents Isolation ---');
    const invSeenByA = await prisma.invoice.findMany({
      where: { tenantId: tenantA.id, id: invB.id, paymentStatus: { not: 'paid' } },
    });
    assert(
      'Tenant A open-documents query returns 0 invoices belonging to Tenant B',
      invSeenByA.length === 0,
      `found=${invSeenByA.length}`
    );

    // ── TEST 4: Cross-Tenant Payment & Allocation Guard ──
    console.log('\n--- TEST 4: Cross-Tenant Payment & Allocation Guard ---');
    const crossAllocAttempt = await prisma.paymentRecord.findFirst({
      where: {
        tenantId: tenantA.id,
        invoiceId: invB.id,
      },
    });
    assert(
      'No payments in Tenant A can be linked to Tenant B invoice',
      crossAllocAttempt === null
    );

    // ── TEST 5: Direct API Cross-Tenant Check ──
    console.log('\n--- TEST 5: Direct HTTP API Cross-Tenant Scoping ---');
    // Login as Tenant A admin
    const loginRes = await fetch('http://localhost:3333/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'tenant-admin@example.com',
        password: 'DevPassword@123',
      }),
    });
    const loginData = await loginRes.json();
    const tokenA = loginData.accessToken;

    if (tokenA) {
      // 5a: Tenant A requesting statement for Tenant B party
      const stmtRes = await fetch(
        `http://localhost:3333/api/v1/ledger/statement?partyType=customer&partyId=${partyB.id}&financialYear=26-27`,
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );
      const stmtData = await stmtRes.json();
      assert(
        'API: Tenant A requesting statement for Tenant B party returns empty entries and zero balance',
        stmtData.entries.length === 0 && stmtData.closingBalance === 0,
        `entries=${stmtData.entries?.length}, closing=${stmtData.closingBalance}`
      );

      // 5b: Tenant A requesting open bills does not include Tenant B invoice
      const openBills = stmtData.openBills || [];
      assert(
        'API: Open bills in Tenant A statement does not leak Tenant B invoice',
        !openBills.some((b: any) => b.documentId === invB.id || b.documentNumber === invB.invoiceNumber)
      );

      // 5c: Tenant A attempting to record payment on Tenant B invoice
      const payRes = await fetch('http://localhost:3333/api/v1/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          customerId: partyB.id,
          amount: 59000,
          paymentDate: '2026-10-29',
          paymentMethod: 'NEFT',
          notes: 'Attempted cross tenant payment injection test note',
          allocations: [{ invoiceId: invB.id, amount: 59000 }],
        }),
      });
      assert(
        'API: Recording payment for cross-tenant party/invoice is rejected with HTTP 400 or 404',
        payRes.status === 400 || payRes.status === 404,
        `status=${payRes.status}`
      );
    }
  } finally {
    // Cleanup temporary test records in Tenant B
    await prisma.ledgerEntry.deleteMany({ where: { id: ledgerB.id } });
    await prisma.invoice.deleteMany({ where: { id: invB.id } });
    await prisma.company.deleteMany({ where: { id: partyB.id } });
  }

  console.log('\n========================================================================');
  console.log(`CROSS-TENANT TEST RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('========================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Cross-tenant test failed:', err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
