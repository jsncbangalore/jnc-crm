const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const records = await prisma.paymentRecord.findMany({
    where: {
      OR: [
        { notes: 'Automated E2E Payment Test' },
        { transactionRef: { startsWith: 'UTR-TEST-' } }
      ]
    }
  });
  console.log(`Deleting ${records.length} test payment records and associated ledger entries...`);
  for (const r of records) {
    await prisma.ledgerEntry.deleteMany({
      where: {
        OR: [
          { sourceId: r.id },
          { voucherNo: r.transactionRef }
        ]
      }
    });
    await prisma.paymentAllocation.deleteMany({ where: { paymentRecordId: r.id } });
    await prisma.paymentRecord.delete({ where: { id: r.id } });
  }

  await prisma.invoice.updateMany({
    where: { invoiceNumber: 'INV/25-26/001' },
    data: { balanceDue: 0, paymentStatus: 'paid' }
  });
  await prisma.invoice.updateMany({
    where: { invoiceNumber: 'INV/25-26/002' },
    data: { balanceDue: 0, paymentStatus: 'paid' }
  });
  await prisma.invoice.updateMany({
    where: { invoiceNumber: 'INV/25-26/003' },
    data: { balanceDue: 1180, paymentStatus: 'unpaid' }
  });
  await prisma.invoice.updateMany({
    where: { invoiceNumber: 'INV/26-27/001' },
    data: { balanceDue: 38651, paymentStatus: 'unpaid' }
  });
  await prisma.invoice.updateMany({
    where: { invoiceNumber: 'INV/26-27/002' },
    data: { balanceDue: 8225, paymentStatus: 'unpaid' }
  });
  await prisma.invoice.updateMany({
    where: { invoiceNumber: 'INV/26-27/003' },
    data: { balanceDue: 112442, paymentStatus: 'partially_paid' }
  });
  console.log('Customer A invoice balances accurately reset: 4 open invoices summing to 160,498.');
  await prisma.$disconnect();
}
check().catch(console.error);
