const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const migrationsDir = path.resolve('apps/api/prisma/migrations');
  const diskMigrations = fs.readdirSync(migrationsDir).filter(f => fs.statSync(path.join(migrationsDir, f)).isDirectory()).sort();
  
  const appliedInDb = await p.$queryRawUnsafe('SELECT id, migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at ASC');
  const appliedMap = new Map(appliedInDb.map(r => [r.migration_name, r]));
  
  const rows = await p.$queryRawUnsafe("SELECT id, migration_name, started_at, finished_at FROM _prisma_migrations WHERE migration_name = '20261106120000_client_errors'");
  console.log('Duplicates for 20261106120000_client_errors:', rows);
  console.log('\nDetailed Migration List:');
  console.log('----------------------------------------------------------------------------------------');
  console.log('IDX | STATUS  | MIGRATION NAME');
  console.log('----------------------------------------------------------------------------------------');
  
  diskMigrations.forEach((m, idx) => {
    const record = appliedMap.get(m);
    let status = 'UNKNOWN';
    if (!record) {
      status = 'PENDING ';
    } else if (record.rolled_back_at) {
      status = 'ROLLED_BK';
    } else if (record.finished_at) {
      status = 'APPLIED ';
    } else {
      status = 'FAILED  ';
    }
    console.log(`${String(idx + 1).padStart(3, ' ')} | ${status} | ${m}`);
  });
  
  for (const r of appliedInDb) {
    if (!diskMigrations.includes(r.migration_name)) {
      console.log(`--- | GHOST(DB) | ${r.migration_name} (in DB but NOT on disk)`);
    }
  }
}

main().catch(console.error).finally(() => p.$disconnect());
