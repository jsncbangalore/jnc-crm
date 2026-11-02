const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkNumbers() {
  const invs = await prisma.invoice.findMany({
    select: { invoiceNumber: true, docType: true, createdAt: true },
    orderBy: { invoiceNumber: 'asc' }
  });
  console.log('Invoices count:', invs.length);
  invs.forEach(i => console.log(`  ${i.docType}: ${i.invoiceNumber}`));
  await prisma.$disconnect();
}
checkNumbers().catch(console.error);
