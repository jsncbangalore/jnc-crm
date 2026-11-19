const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const deleted = await prisma.$executeRawUnsafe(`DELETE FROM "_prisma_migrations" WHERE migration_name = '20261106120000_add_client_errors'`);
  console.log('Deleted obsolete migration rows:', deleted);
  await prisma.$disconnect();
}

main().catch(console.error);
