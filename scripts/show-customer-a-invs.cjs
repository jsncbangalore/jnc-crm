const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function showInvs() {
  const invs = await prisma.invoice.findMany({
    where: { customerName: 'Customer A' },
    select: { id: true, invoiceNumber: true, totalAmount: true, balanceDue: true, paymentStatus: true, createdAt: true }
  });
  console.log('Customer A invoices:', invs);
  await prisma.$disconnect();
}
showInvs().catch(console.error);
