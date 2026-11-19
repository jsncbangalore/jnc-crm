const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function delete0008() {
  const inv = await prisma.invoice.findFirst({
    where: { invoiceNumber: 'INV/26-27/0008' },
    include: { lines: true, allocations: true, payments: true }
  });
  if (inv) {
    console.log(`Found invoice ${inv.invoiceNumber} (${inv.id}). Deleting allocations, payments, lines, ledger entries...`);
    await prisma.paymentAllocation.deleteMany({ where: { invoiceId: inv.id } });
    await prisma.ledgerEntry.deleteMany({
      where: {
        OR: [
          { sourceId: inv.id },
          { voucherNo: inv.invoiceNumber }
        ]
      }
    });
    await prisma.invoiceLine.deleteMany({ where: { invoiceId: inv.id } });
    await prisma.invoice.delete({ where: { id: inv.id } });
    console.log('Successfully deleted test invoice INV/26-27/0008 and its lines!');
  } else {
    console.log('Invoice INV/26-27/0008 not found.');
  }

  // Also check if any other product has name 'apple'
  const appleProducts = await prisma.product.findMany({
    where: { name: { contains: 'apple', mode: 'insensitive' } }
  });
  for (const p of appleProducts) {
    await prisma.sku.deleteMany({ where: { productId: p.id } });
    await prisma.product.delete({ where: { id: p.id } });
    console.log(`Deleted product: ${p.name}`);
  }

  await prisma.$disconnect();
}
delete0008().catch(console.error);
