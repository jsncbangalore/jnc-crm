const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev' }
  }
});

async function main() {
  const cols = await prisma.$queryRawUnsafe(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'PaymentRecord'`);
  console.log('PaymentRecord columns:', cols);
  const suppCols = await prisma.$queryRawUnsafe(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'SupplierPayment'`);
  console.log('SupplierPayment columns:', suppCols);
  await prisma.$disconnect();
}
main().catch(console.error);
