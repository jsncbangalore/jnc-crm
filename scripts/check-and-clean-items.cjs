const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function find() {
  const inv = await prisma.invoice.findUnique({
    where: { id: '4a0c6447-4a49-422a-81c7-ef9c66ef3d8b' },
    include: { lines: true }
  });
  console.log('Invoice 0008:', {
    number: inv.invoiceNumber,
    customerName: inv.customerName,
    isSez: inv.isSez,
    total: inv.totalAmount,
    lines: inv.lines
  });
  await prisma.$disconnect();
}
find().catch(console.error);
