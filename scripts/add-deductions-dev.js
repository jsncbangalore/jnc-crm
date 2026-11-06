const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev?schema=public' } }
});

async function main() {
  await prisma.$executeRawUnsafe('ALTER TABLE "PaymentRecord" ADD COLUMN IF NOT EXISTS "deductions" JSONB');
  await prisma.$executeRawUnsafe('ALTER TABLE "SupplierPayment" ADD COLUMN IF NOT EXISTS "deductions" JSONB');
  console.log('Columns added successfully to jnc_crm_dev');
  await prisma.$disconnect();
}
main().catch(console.error);
