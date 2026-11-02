const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: { url: 'postgresql://jnc_app:jnc_app_pass_dev_2026@localhost:5432/jnc_crm_dev' }
  }
});

async function clean() {
  const entries = await prisma.ledgerEntry.findMany({
    where: {
      OR: [
        { voucherNo: { contains: '0007' } },
        { voucherNo: { contains: '0008' } },
        { voucherNo: { contains: '0009' } },
        { particulars: { contains: 'E2E Isolated' } },
        { debit: 1180 },
        { debit: 2360 },
      ]
    }
  });
  console.log('Test ledger entries found:', entries.length);
  for (const e of entries) {
    console.log('Deleting entry:', e.id, e.partyName, e.debit, e.credit, e.narration);
    await prisma.ledgerEntry.delete({ where: { id: e.id } });
  }

  // Also clean any payment records created during tests
  const testPayments = await prisma.paymentRecord.findMany({
    where: {
      OR: [
        { transactionRef: { contains: 'UTR-E2E' } },
        { transactionRef: { contains: 'UTR-DUP' } },
        { notes: { contains: 'E2E' } }
      ]
    }
  });
  console.log('Test payments found:', testPayments.length);
  for (const p of testPayments) {
    await prisma.paymentAllocation.deleteMany({ where: { paymentRecordId: p.id } });
    await prisma.paymentRecord.delete({ where: { id: p.id } });
  }

  console.log('Cleanup complete.');
  await prisma.$disconnect();
}

clean().catch(console.error);
