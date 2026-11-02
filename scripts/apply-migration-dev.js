const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev?schema=public' } },
});

async function main() {
  const sql = fs.readFileSync(
    path.join(__dirname, '../apps/api/prisma/migrations/20261030211500_add_2fa_pending_and_phone_verification/migration.sql'),
    'utf8'
  );
  console.log('[MIGRATE] Applying migration to jnc_crm_dev...');
  const stmts = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('--'));
  for (const stmt of stmts) {
    await prisma.$executeRawUnsafe(stmt);
  }

  // Record in _prisma_migrations so Prisma migration parity is maintained
  const migrationName = '20261030211500_add_2fa_pending_and_phone_verification';
  const crypto = require('crypto');
  const checksum = crypto.createHash('sha256').update(sql).digest('hex');
  await prisma.$executeRawUnsafe(`
    INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
    VALUES (gen_random_uuid(), '${checksum}', NOW(), '${migrationName}', NULL, NULL, NOW(), 1)
    ON CONFLICT ("migration_name") DO NOTHING
  `).catch((err) => console.log('Migration record notice:', err.message));

  console.log('[MIGRATE] Migration applied successfully to jnc_crm_dev.');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
