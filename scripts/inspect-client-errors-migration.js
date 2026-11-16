const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRawUnsafe('SELECT id, migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name LIKE \'%client_errors%\' ORDER BY started_at ASC');
  console.log(rows);
  await prisma.$disconnect();
}

main().catch(console.error);
