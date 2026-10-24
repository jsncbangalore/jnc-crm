/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

// Helper to mask credentials in connection string
function maskDatabaseUrl(rawUrl?: string): string {
  if (!rawUrl) return '[NOT CONFIGURED]';
  return rawUrl.replace(/:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)(\?.*)?/, (_match, user, _pass, host, port, db) => {
    const maskedUser = user.length > 3 ? user.slice(0, 3) + '***' : '***';
    return `postgresql://${maskedUser}:***@${host}:${port}/${db}`;
  });
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

async function runPreflight() {
  console.log('========================================================================');
  console.log('DATABASE PRODUCTION MIGRATION READ-ONLY PREFLIGHT (migration:preflight)');
  console.log('========================================================================\n');

  const maskedUrl = maskDatabaseUrl(process.env.DATABASE_URL);
  console.log(`Database Target: ${maskedUrl}`);
  console.log(`Execution Mode:  STRICTLY READ-ONLY (No writes, no mutations)\n`);

  try {
    // ─── 1. Check Pending Migrations ──────────────────────────────────────────
    console.log('--- 1. Migration History & Pending Migrations ---');
    const migrationsDir = path.resolve(__dirname, '../apps/api/prisma/migrations');
    const localMigrationFolders = fs
      .readdirSync(migrationsDir)
      .filter((f) => fs.statSync(path.join(migrationsDir, f)).isDirectory())
      .sort();

    let appliedMigrationNames: Set<string> = new Set();
    try {
      const appliedRows = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
        'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name;'
      );
      appliedMigrationNames = new Set(appliedRows.map((r) => r.migration_name));
      console.log(`Applied migrations recorded in DB: ${appliedRows.length}`);
    } catch {
      console.log('Notice: _prisma_migrations table not found or not yet initialized.');
    }

    const pendingMigrations = localMigrationFolders.filter((name) => !appliedMigrationNames.has(name));

    if (pendingMigrations.length === 0) {
      console.log('  [UP TO DATE] Database schema is fully up to date with local migrations.\n');
    } else {
      console.log(`  [PENDING] ${pendingMigrations.length} migration(s) waiting to be deployed:`);
      pendingMigrations.forEach((m, idx) => {
        console.log(`    ${idx + 1}. ${m}`);
      });
      console.log('');
    }

    // ─── 2. Row Counts of Altered & Target Tables ─────────────────────────────
    console.log('--- 2. Row Counts of Affected Tables ---');
    const targetTables = [
      { name: 'User', role: 'Altered (adds photoUrl, lastPasswordChangeAt, 2FA timestamp)' },
      { name: 'RefreshSession', role: 'Altered (adds userAgent, ipAddress, lastUsedAt, deviceLabel)' },
      { name: 'MailAccount', role: 'Altered (adds encryption column, updates existing rows)' },
      { name: 'Tenant', role: 'Altered (adds requireTwoFactor column)' },
      { name: 'WebFormSettings', role: 'New table to be created' },
      { name: 'OtpChallenge', role: 'New table to be created' },
      { name: 'ResetTicket', role: 'New table to be created' },
      { name: 'EmailOutbox', role: 'New table to be created' },
      { name: 'UserTwoFactor', role: 'New table to be created' },
      { name: 'TrustedDevice', role: 'New table to be created' },
      { name: 'LoginTicket', role: 'New table to be created' },
    ];

    for (const table of targetTables) {
      try {
        const regCheck = await prisma.$queryRawUnsafe<Array<{ exists: string | null }>>(
          `SELECT to_regclass('public."${table.name}"')::text AS exists;`
        );

        if (regCheck[0]?.exists) {
          const countRows = await prisma.$queryRawUnsafe<Array<{ count: bigint | number | string }>>(
            `SELECT count(*) AS count FROM "${table.name}";`
          );
          const count = countRows[0]?.count?.toString() || '0';
          console.log(`  - Table "${table.name}": ${count} row(s) [${table.role}]`);
        } else {
          console.log(`  - Table "${table.name}": Table does not exist yet [${table.role}]`);
        }
      } catch (err: any) {
        console.log(`  - Table "${table.name}": Query error (${err?.message || 'unknown'})`);
      }
    }
    console.log('');

    // ─── 3. Unique Index Duplicate Key Pre-checks ──────────────────────────────
    console.log('--- 3. Unique Constraint & Duplicate Value Checks ---');
    const uniqueIndexChecks = [
      { table: 'WebFormSettings', column: 'tenantId', indexName: 'WebFormSettings_tenantId_key' },
      { table: 'ResetTicket', column: 'jti', indexName: 'ResetTicket_jti_key' },
      { table: 'UserTwoFactor', column: 'userId', indexName: 'UserTwoFactor_userId_key' },
      { table: 'TrustedDevice', column: 'tokenHash', indexName: 'TrustedDevice_tokenHash_key' },
      { table: 'LoginTicket', column: 'jti', indexName: 'LoginTicket_jti_key' },
    ];

    let totalDuplicatesFound = 0;

    for (const check of uniqueIndexChecks) {
      try {
        const regCheck = await prisma.$queryRawUnsafe<Array<{ exists: string | null }>>(
          `SELECT to_regclass('public."${check.table}"')::text AS exists;`
        );

        if (regCheck[0]?.exists) {
          const dupes = await prisma.$queryRawUnsafe<Array<{ val: string; count: bigint | number | string }>>(
            `SELECT "${check.column}" AS val, count(*) AS count FROM "${check.table}" GROUP BY "${check.column}" HAVING count(*) > 1 LIMIT 5;`
          );

          if (dupes.length > 0) {
            totalDuplicatesFound += dupes.length;
            console.error(`  [VIOLATION] ${check.table} has ${dupes.length} duplicate value(s) on column "${check.column}". This will break index "${check.indexName}"!`);
          } else {
            console.log(`  [PASS] Index "${check.indexName}": 0 duplicates found in existing table.`);
          }
        } else {
          console.log(`  [PASS] Index "${check.indexName}": Target table "${check.table}" is brand-new (0 rows, safe to create).`);
        }
      } catch (err: any) {
        console.log(`  [NOTICE] Index check for "${check.indexName}": ${err?.message || 'skipped'}`);
      }
    }

    if (totalDuplicatesFound === 0) {
      console.log('  [PASS] All planned unique constraints are clean and safe to deploy.\n');
    } else {
      console.error(`  [FAIL] ${totalDuplicatesFound} duplicate conflict(s) detected!\n`);
    }

    // ─── 4. Row-Level Security (RLS) Status on Public Tables ───────────────────
    console.log('--- 4. Row-Level Security (RLS) Status on Public Tables ---');
    try {
      const rlsRows = await prisma.$queryRawUnsafe<Array<{ table_name: string; rls_enabled: boolean }>>(`
        SELECT
          c.relname AS table_name,
          c.relrowsecurity AS rls_enabled
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND c.relname NOT LIKE '_prisma%'
        ORDER BY c.relname;
      `);

      let unshieldedCount = 0;
      console.log(`Public user tables scanned: ${rlsRows.length}`);
      rlsRows.forEach((r) => {
        if (r.rls_enabled) {
          console.log(`  [RLS ON]  ${r.table_name}`);
        } else {
          unshieldedCount++;
          console.log(`  [RLS OFF] ${r.table_name} (Requires lockdown)`);
        }
      });

      console.log('');
      if (unshieldedCount > 0) {
        console.log(`  [WARNING] ${unshieldedCount} table(s) do not currently have RLS enabled.`);
        console.log(`  -> Follow the Runbook step to re-run deploy/supabase-lockdown.sql after migration.\n`);
      } else {
        console.log('  [PASS] 100% of public tables have Row-Level Security enabled.\n');
      }
    } catch (err: any) {
      console.log(`  Could not query RLS catalog: ${err?.message || 'unknown error'}\n`);
    }

    console.log('========================================================================');
    console.log('PREFLIGHT COMPLETED: READ-ONLY AUDIT FINISHED SAFELY');
    console.log('========================================================================\n');
  } catch (globalErr: any) {
    console.error('Preflight error occurred while executing read-only check:');
    console.error(globalErr?.message || globalErr);
  } finally {
    await prisma.$disconnect();
  }
}

runPreflight();
