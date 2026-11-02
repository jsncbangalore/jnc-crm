const { Client } = require('C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824/scratch/pg-runner/node_modules/pg');
const fs = require('fs');
const path = require('path');

async function main() {
  const client = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev' });
  await client.connect();

  // 1. Clean failed migration row
  await client.query(`DELETE FROM "_prisma_migrations" WHERE migration_name = '20261029170000_add_webhook_deliveries'`);

  // 2. Read migration SQL and execute
  const sql = fs.readFileSync(path.resolve(__dirname, '../apps/api/prisma/migrations/20261029170000_add_webhook_deliveries/migration.sql'), 'utf8');
  await client.query(sql);
  console.log('Applied migration SQL successfully');

  // 3. Grant table permissions to jnc_app
  await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "webhook_deliveries" TO jnc_app;`);
  await client.query(`DROP POLICY IF EXISTS jnc_app_dml_policy ON public."webhook_deliveries";`);
  await client.query(`CREATE POLICY jnc_app_dml_policy ON public."webhook_deliveries" FOR ALL TO jnc_app USING (true) WITH CHECK (true);`);
  console.log('Granted DML permissions to jnc_app on webhook_deliveries');

  // 4. Record successful migration in _prisma_migrations
  const migrationName = '20261029170000_add_webhook_deliveries';
  const crypto = require('crypto');
  const checksum = crypto.createHash('sha256').update(sql).digest('hex');
  await client.query(`
    INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
    VALUES ($1, $2, NOW(), $3, NULL, NULL, NOW(), 1)
  `, [crypto.randomUUID(), checksum, migrationName]);
  console.log('Recorded migration in _prisma_migrations');

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
