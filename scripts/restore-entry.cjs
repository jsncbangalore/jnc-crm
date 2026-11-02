const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: { url: 'postgresql://jnc_app:jnc_app_pass_dev_2026@localhost:5432/jnc_crm_dev' }
  }
});

async function main() {
  await prisma.ledgerEntry.create({
    data: {
      id: '711839ef-df6f-4442-aace-67c402e8242d',
      tenantId: '55051b53-7872-430e-b700-f7e6281e9ffe',
      partyId: 'cust-comp-fixture-a',
      partyType: 'customer',
      financialYear: '26-27',
      voucherType: 'receipt',
      voucherNo: 'REC/26-27/0008',
      particulars: 'Receipt against INV/26-27/003 (Ref: PAY-SETTLE-UTR-01)',
      entryDate: new Date('2026-09-15T00:00:00.000Z'),
      debit: 0,
      credit: 1000,
      sourceType: 'payment_record'
    }
  });
  console.log('Restored credit ledger entry for REC/26-27/0008.');
  await prisma.$disconnect();
}
main().catch(console.error);
