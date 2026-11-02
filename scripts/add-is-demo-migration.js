const { Client } = require('C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824/scratch/pg-runner/node_modules/pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function main() {
  const client = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev' });
  await client.connect();

  const migrationName = '20261029200000_add_is_demo_and_party_source';
  const migrationDir = path.resolve(__dirname, `../apps/api/prisma/migrations/${migrationName}`);
  if (!fs.existsSync(migrationDir)) {
    fs.mkdirSync(migrationDir, { recursive: true });
  }

  const sql = `
-- AlterTable Tenant
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable Company
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'manual';

-- AlterTable Supplier
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'manual';

-- Mark seeded demo tenants and parties
UPDATE "Tenant" SET "isDemo" = true WHERE code IN ('ACME-DEV-001', 'BETA-DEV-002', 'GAMMA-DEV-003');
UPDATE "Company" SET "isDemo" = true, "source" = 'demo' WHERE name IN ('Acme Logistics Ltd', 'Omni Retail Ventures Ltd', 'Global SEZ Exporters Inc', 'Customer A');
UPDATE "Supplier" SET "isDemo" = true, "source" = 'demo' WHERE name IN ('Apex Raw Metals & Cables', 'Supplier A');
`;

  fs.writeFileSync(path.join(migrationDir, 'migration.sql'), sql, 'utf8');

  await client.query(sql);
  console.log('Executed migration SQL successfully');

  // Check if already in _prisma_migrations
  const check = await client.query(`SELECT 1 FROM "_prisma_migrations" WHERE migration_name = $1`, [migrationName]);
  if (check.rowCount === 0) {
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    await client.query(`
      INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES ($1, $2, NOW(), $3, NULL, NULL, NOW(), 1)
    `, [crypto.randomUUID(), checksum, migrationName]);
    console.log(`Recorded ${migrationName} in _prisma_migrations`);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
