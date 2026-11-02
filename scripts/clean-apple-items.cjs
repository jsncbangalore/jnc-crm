process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev?schema=public';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: 'apple', mode: 'insensitive' } },
        { description: { contains: 'apple', mode: 'insensitive' } }
      ]
    },
    include: { skus: true }
  });
  console.log(`Found ${products.length} apple products:`, products.map(p => ({ id: p.id, name: p.name })));

  const skus = await prisma.sku.findMany({
    where: {
      OR: [
        { skuCode: { contains: 'apple', mode: 'insensitive' } },
        { name: { contains: 'apple', mode: 'insensitive' } }
      ]
    }
  });
  console.log(`Found ${skus.length} apple skus:`, skus.map(s => ({ id: s.id, skuCode: s.skuCode, name: s.name })));

  const invoiceLines = await prisma.invoiceLine.findMany({
    where: {
      OR: [
        { description: { contains: 'apple', mode: 'insensitive' } }
      ]
    }
  });
  console.log(`Found ${invoiceLines.length} apple invoice lines:`, invoiceLines.map(l => ({ id: l.id, description: l.description })));

  if (skus.length > 0) {
    const skuIds = skus.map(s => s.id);
    await prisma.invoiceLine.deleteMany({ where: { skuId: { in: skuIds } } });
    await prisma.quotationLine.deleteMany({ where: { skuId: { in: skuIds } } });
    await prisma.orderLine.deleteMany({ where: { skuId: { in: skuIds } } });
    await prisma.stockItem.deleteMany({ where: { skuId: { in: skuIds } } });
    await prisma.sku.deleteMany({ where: { id: { in: skuIds } } });
    console.log(`Deleted ${skuIds.length} apple skus.`);
  }

  if (products.length > 0) {
    const prodIds = products.map(p => p.id);
    await prisma.product.deleteMany({ where: { id: { in: prodIds } } });
    console.log(`Deleted ${prodIds.length} apple products.`);
  }

  if (invoiceLines.length > 0) {
    const lineIds = invoiceLines.map(l => l.id);
    await prisma.invoiceLine.deleteMany({ where: { id: { in: lineIds } } });
    console.log(`Deleted ${lineIds.length} apple invoice lines.`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
