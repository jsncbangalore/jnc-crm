const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

async function rehearseMigration() {
  console.log('========================================================================');
  console.log('MIGRATION REHEARSAL ON THROWAWAY DATABASE');
  console.log('========================================================================\n');

  // Connect to dev DB using PrismaClient
  const devPrisma = new PrismaClient({
    datasources: {
      db: {
        url: 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev?schema=public',
      },
    },
  });

  const throwawayDb = 'throwaway_client_errors_rehearsal';

  console.log('[1] Connected to local PostgreSQL.');

  try {
    // Terminate existing connections to throwaway database if any
    try {
      await devPrisma.$executeRawUnsafe(`
        SELECT pg_terminate_backend(pid) 
        FROM pg_stat_activity 
        WHERE datname = '${throwawayDb}' AND pid <> pg_backend_pid();
      `);
      await devPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${throwawayDb};`);
    } catch (_) {}

    await devPrisma.$executeRawUnsafe(`CREATE DATABASE ${throwawayDb};`);
    console.log(`[2] Created clean throwaway database "${throwawayDb}".`);

    // Connect to throwaway database
    const throwawayPrisma = new PrismaClient({
      datasources: {
        db: {
          url: `postgresql://postgres:postgres@localhost:5432/${throwawayDb}?schema=public`,
        },
      },
    });

    try {
      // Create prerequisite minimal tables (Tenant and User) so foreign keys succeed
      console.log('[3] Setting up prerequisite minimal Tenant and User tables in throwaway DB...');
      await throwawayPrisma.$executeRawUnsafe(`
        CREATE TABLE "Tenant" (
          "id" TEXT PRIMARY KEY,
          "name" TEXT NOT NULL,
          "code" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await throwawayPrisma.$executeRawUnsafe(`
        CREATE TABLE "User" (
          "id" TEXT PRIMARY KEY,
          "email" TEXT UNIQUE NOT NULL,
          "name" TEXT NOT NULL,
          "tenantId" TEXT REFERENCES "Tenant"("id") ON DELETE CASCADE,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Read and execute migration SQL
      const migrationPath = path.resolve(
        __dirname,
        '../apps/api/prisma/migrations/20261106120000_client_errors/migration.sql'
      );
      const sql = fs.readFileSync(migrationPath, 'utf8');

      console.log('[4] Executing migration SQL from: apps/api/prisma/migrations/20261106120000_client_errors/migration.sql');
      console.log('--- MIGRATION SQL ---');
      console.log(sql.trim());
      console.log('---------------------\n');

      // Strip SQL line comments first, then split into executable statements
      const cleanSql = sql
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n');

      const statements = cleanSql
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const statement of statements) {
        await throwawayPrisma.$executeRawUnsafe(statement);
      }

      console.log('[5] Migration SQL applied successfully.');

      // Verify table structure
      const cols = await throwawayPrisma.$queryRawUnsafe(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'ClientError'
        ORDER BY ordinal_position;
      `);

      console.log(`[6] Verified table "ClientError" structure (${cols.length} columns):`);
      cols.forEach((r) => {
        console.log(`    - ${r.column_name}: ${r.data_type} (nullable: ${r.is_nullable})`);
      });

      // Verify indexes
      const idxs = await throwawayPrisma.$queryRawUnsafe(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'ClientError';
      `);
      console.log(`[7] Verified indexes (${idxs.length} indexes):`);
      idxs.forEach((r) => {
        console.log(`    - ${r.indexname}`);
      });

      // Verify foreign keys
      const fks = await throwawayPrisma.$queryRawUnsafe(`
        SELECT conname, pg_get_constraintdef(oid) as def
        FROM pg_constraint
        WHERE conrelid = '"ClientError"'::regclass AND contype = 'f';
      `);
      console.log(`[8] Verified foreign keys (${fks.length} FK constraints):`);
      fks.forEach((r) => {
        console.log(`    - ${r.conname}: ${r.def}`);
      });

      // Insert and query a test record
      await throwawayPrisma.$executeRawUnsafe(`
        INSERT INTO "Tenant" ("id", "name", "code") VALUES ('t-1', 'Test Tenant', 'TT');
      `);
      await throwawayPrisma.$executeRawUnsafe(`
        INSERT INTO "User" ("id", "email", "name", "tenantId") VALUES ('u-1', 'test@example.com', 'Test User', 't-1');
      `);
      await throwawayPrisma.$executeRawUnsafe(`
        INSERT INTO "ClientError" ("id", "tenantId", "userId", "route", "page", "message", "buildVersion")
        VALUES ('ERR-TEST-001', 't-1', 'u-1', '/invoices', 'InvoicesPage', 'Test client error', '1.0.0');
      `);

      const inserted = await throwawayPrisma.$queryRawUnsafe(`
        SELECT id, "tenantId", "userId", route, page, message, "buildVersion", "createdAt"
        FROM "ClientError"
        WHERE id = 'ERR-TEST-001';
      `);

      console.log(`[9] Test record inserted & retrieved successfully:`, inserted[0]);

      console.log('\n[PASS] Migration rehearsal passed with zero errors.');
    } finally {
      await throwawayPrisma.$disconnect();
    }
  } finally {
    // Drop throwaway database cleanly
    try {
      await devPrisma.$executeRawUnsafe(`
        SELECT pg_terminate_backend(pid) 
        FROM pg_stat_activity 
        WHERE datname = '${throwawayDb}' AND pid <> pg_backend_pid();
      `);
      await devPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${throwawayDb};`);
      console.log(`[10] Cleaned up and dropped throwaway database "${throwawayDb}".`);
    } catch (e) {
      console.error('Error dropping throwaway db:', e.message);
    }
    await devPrisma.$disconnect();
  }
}

rehearseMigration().catch((err) => {
  console.error('[FAIL] Migration rehearsal failed:', err);
  process.exit(1);
});
