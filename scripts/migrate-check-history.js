/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Migration History Integrity Guard (Read-Only)
 *
 * Checks _prisma_migrations against the migrations folder on disk:
 * 1. Rows with finished_at NULL (in-progress or failed).
 * 2. Rows with rolled_back_at set.
 * 3. Duplicate migration names.
 * 4. Migrations in folder not in table (pending).
 * 5. Migrations in table not in folder (ghost/orphaned).
 *
 * Strictly READ-ONLY. Never executes INSERT, UPDATE, DELETE, or DDL.
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

function getMigrationFolders() {
  const dir = path.resolve('apps/api/prisma/migrations');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((file) => {
    const fullPath = path.join(dir, file);
    return fs.statSync(fullPath).isDirectory() && fs.existsSync(path.join(fullPath, 'migration.sql'));
  });
}

function getDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.resolve('apps/api/.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(/^DATABASE_URL\s*=\s*["']?([^"'\r\n]+)["']?/m);
    if (match) return match[1];
  }
  return 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev?schema=public';
}

function maskDbUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return 'postgresql://***@localhost:5432/***';
  }
}

async function checkMigrationHistory() {
  const dbUrl = getDatabaseUrl();
  const maskedUrl = maskDbUrl(dbUrl);

  console.log('========================================================================');
  console.log('PRISMA MIGRATION HISTORY INTEGRITY GUARD (READ-ONLY)');
  console.log('========================================================================');
  console.log(`Target Database : ${maskedUrl}`);

  const diskMigrations = getMigrationFolders().sort();
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

  let dbRows = [];
  try {
    dbRows = await prisma.$queryRawUnsafe(
      'SELECT id, migration_name, started_at, finished_at, rolled_back_at, applied_steps_count FROM "_prisma_migrations" ORDER BY started_at ASC'
    );
  } catch (err) {
    console.error(`[ERROR] Failed to query _prisma_migrations: ${err.message}`);
    await prisma.$disconnect();
    if (require.main === module) process.exit(1);
    throw err;
  } finally {
    await prisma.$disconnect();
  }

  const diskSet = new Set(diskMigrations);
  const dbCountsByName = new Map();
  dbRows.forEach((r) => {
    dbCountsByName.set(r.migration_name, (dbCountsByName.get(r.migration_name) || 0) + 1);
  });

  const incompleteRows = dbRows.filter((r) => r.finished_at === null);
  const rolledBackRows = dbRows.filter((r) => r.rolled_back_at !== null);
  const duplicateNames = [...dbCountsByName.entries()].filter(([, count]) => count > 1).map(([name]) => name);
  const pendingOnDisk = diskMigrations.filter((m) => !dbCountsByName.has(m));
  const ghostsInDb = dbRows.filter((r) => !diskSet.has(r.migration_name));

  console.log(`Migrations on Disk       : ${diskMigrations.length}`);
  console.log(`Records in Database      : ${dbRows.length}`);
  console.log('------------------------------------------------------------------------');

  const hasIssues =
    incompleteRows.length > 0 ||
    rolledBackRows.length > 0 ||
    duplicateNames.length > 0 ||
    ghostsInDb.length > 0;

  if (incompleteRows.length > 0) {
    console.error(`[ALERT] Incomplete / Failed migrations (finished_at IS NULL): ${incompleteRows.length}`);
    incompleteRows.forEach((r) => console.error(`   - ID: ${r.id} | Name: ${r.migration_name} | Started: ${r.started_at}`));
  } else {
    console.log('[OK] Incomplete migrations (finished_at IS NULL) : 0');
  }

  if (rolledBackRows.length > 0) {
    console.error(`[ALERT] Rolled back migrations: ${rolledBackRows.length}`);
    rolledBackRows.forEach((r) => console.error(`   - ID: ${r.id} | Name: ${r.migration_name} | RolledBackAt: ${r.rolled_back_at}`));
  } else {
    console.log('[OK] Rolled back migrations                      : 0');
  }

  if (duplicateNames.length > 0) {
    console.error(`[ALERT] Duplicate migration records: ${duplicateNames.length}`);
    duplicateNames.forEach((name) => console.error(`   - Duplicate name: ${name} (${dbCountsByName.get(name)} rows)`));
  } else {
    console.log('[OK] Duplicate migration records                 : 0');
  }

  if (ghostsInDb.length > 0) {
    console.error(`[ALERT] Ghost migrations in DB (missing on disk)   : ${ghostsInDb.length}`);
    ghostsInDb.forEach((r) => console.error(`   - ID: ${r.id} | Ghost Name: ${r.migration_name}`));
  } else {
    console.log('[OK] Ghost migrations in DB (missing on disk)    : 0');
  }

  if (pendingOnDisk.length > 0) {
    console.log(`[INFO] Pending migrations to apply on disk        : ${pendingOnDisk.length}`);
    pendingOnDisk.forEach((name) => console.log(`   + Pending: ${name}`));
  } else {
    console.log('[OK] Pending migrations on disk                  : 0');
  }

  console.log('------------------------------------------------------------------------');

  if (hasIssues) {
    console.error('STATUS: ANOMALIES DETECTED (DEPLOYMENT MUST NOT PROCEED)');
    console.error('========================================================================');
    console.error('[RESOLUTION INSTRUCTIONS FOR GHOST OR FAILED ROWS]:');
    console.error(' 1. NEVER hand-edit or manually delete rows in the live database.');
    console.error(' 2. Take a full live database backup first: npm run db:backup');
    console.error(' 3. Obtain user / administrator approval for resolution strategy.');
    console.error(' 4. Use the official Prisma CLI recovery command:');
    console.error('    - To record as already applied:');
    console.error('      npx prisma migrate resolve --applied <migration_name>');
    console.error('    - To record as rolled back:');
    console.error('      npx prisma migrate resolve --rolled-back <migration_name>');
    console.error('========================================================================\n');
    if (require.main === module) process.exit(1);
    return { clean: false, incompleteRows, rolledBackRows, duplicateNames, ghostsInDb, pendingOnDisk };
  } else {
    console.log('STATUS: CLEAN (Zero anomalies detected. Migration history is valid.)');
    console.log('========================================================================\n');
    return { clean: true, incompleteRows: [], rolledBackRows: [], duplicateNames: [], ghostsInDb: [], pendingOnDisk };
  }
}

if (require.main === module) {
  checkMigrationHistory().catch(() => process.exit(1));
}

module.exports = { checkMigrationHistory };
