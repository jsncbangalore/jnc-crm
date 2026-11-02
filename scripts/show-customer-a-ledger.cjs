const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function showLedger() {
  const cust = await prisma.company.findFirst({ where: { name: 'Customer A' } });
  const entries = await prisma.ledgerEntry.findMany({ where: { partyId: cust.id } });
  console.log('Customer id:', cust.id);
  let debitSum = 0;
  let creditSum = 0;
  for (const e of entries) {
    console.log(e.voucherType, e.voucherNo, 'Dr:', Number(e.debit), 'Cr:', Number(e.credit));
    debitSum += Number(e.debit);
    creditSum += Number(e.credit);
  }
  console.log('Total Debit:', debitSum, 'Total Credit:', creditSum, 'Balance:', debitSum - creditSum);
  await prisma.$disconnect();
}
showLedger().catch(console.error);
