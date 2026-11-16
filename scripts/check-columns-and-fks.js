const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const qlCols = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'QuotationLine' AND column_name = 'unit'
  `);
  console.log('QuotationLine.unit column:', qlCols);

  const fkRows = await prisma.$queryRawUnsafe(`
    SELECT tc.constraint_name, rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_name = 'QuotationLine' AND tc.constraint_name LIKE '%quotationId%'
  `);
  console.log('QuotationLine.quotationId foreign key:', fkRows);
  await prisma.$disconnect();
}

main().catch(console.error);
