const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRawUnsafe('SELECT id, migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at ASC');
  console.log('Total rows in _prisma_migrations:', rows.length);
  rows.forEach((r, i) => {
    console.log(`${i + 1}. [${r.finished_at ? 'FINISHED' : 'UNFINISHED'}] ${r.migration_name} (rolled_back: ${r.rolled_back_at})`);
  });
  await prisma.$disconnect();
}

main().catch(console.error);
