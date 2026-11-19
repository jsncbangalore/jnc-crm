/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Render Pre-Deployment Guard (scripts/render-predeploy-guard.js)
 *
 * Executed by Render preDeployCommand before activating a new web service release.
 * Refuses deployment if:
 * 1. Required connection string is missing.
 * 2. Database project ref does not match expected target (prevents deploying to old/wrong DB).
 * 3. Database is unreachable or refuses connection.
 * 4. Migrations fail during execution or remain unapplied / failed in _prisma_migrations.
 *
 * NOTE: Schema drift checking (which requires creating a temporary shadow database)
 * is kept strictly in CI, `npm run release:verify`, and `npm run test:all`.
 * It is omitted from Render pre-deploy because managed Postgres providers may forbid `CREATE DATABASE`.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

console.log('========================================================================');
console.log('RENDER PRE-DEPLOYMENT SAFETY & MIGRATION GUARD');
console.log('========================================================================');

const targetUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const expectedRef = process.env.NEW_PROJECT_REF || process.env.EXPECTED_PROJECT_REF;
const oldRef = process.env.OLD_PROJECT_REF;

if (!targetUrl) {
  console.error('[PRE-DEPLOY FAIL] Required environment variable "DIRECT_URL" (or "DATABASE_URL") is missing or empty.');
  process.exit(1);
}

// ─── CHECK 1: PROJECT REF VALIDATION (when project refs are configured) ───────
if (expectedRef) {
  let actualRef = null;
  try {
    const parsedUrl = new URL(targetUrl);
    const username = parsedUrl.username || '';
    const matchUser = username.match(/^[^.]+\.([a-z0-9_-]+)$/i);
    const matchHost = parsedUrl.hostname.match(/^db\.([a-z0-9_-]+)\.supabase\.co$/i);

    actualRef = matchUser && matchUser[1] ? matchUser[1] : matchHost && matchHost[1] ? matchHost[1] : null;

    if (!actualRef) {
      console.error(`[PRE-DEPLOY FAIL] Connection string username "${username}" has no project ref. Format must be "postgres.<ref>". Execution refused.`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`[PRE-DEPLOY FAIL] Invalid connection string format: ${err.message}`);
    process.exit(1);
  }

  if (oldRef && actualRef === oldRef) {
    console.error(`[PRE-DEPLOY FAIL] Connection string has OLD_PROJECT_REF "${actualRef}". Refusing deployment to old database.`);
    process.exit(1);
  }

  if (actualRef !== expectedRef) {
    console.error(`[PRE-DEPLOY FAIL] Connection string project ref "${actualRef}" does not match expected NEW_PROJECT_REF "${expectedRef}". Execution refused.`);
    process.exit(1);
  }

  console.log(`[PASS] Database project ref verified: "${actualRef}" matches expected "${expectedRef}".`);
} else {
  console.log('[INFO] No NEW_PROJECT_REF configured; skipping Supabase project-ref check.');
}

async function runPredeployChecks() {
  const rootDir = path.resolve(__dirname, '..');
  const prismaBin = path.resolve(rootDir, 'node_modules', 'prisma', 'build', 'index.js');
  const schemaFile = path.resolve(rootDir, 'apps', 'api', 'prisma', 'schema.prisma');
  const migrationsDir = path.resolve(rootDir, 'apps', 'api', 'prisma', 'migrations');

  // ─── CHECK 2: DATABASE REACHABILITY ──────────────────────────────────────────
  console.log('\n[1/3] Verifying database connectivity & reachability...');
  const prisma = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    console.log('[PASS] Target database is reachable and accepting queries.');
  } catch (err) {
    console.error('\n[PRE-DEPLOY FAIL] Target database is UNREACHABLE or refused connection!');
    console.error(`Detail: ${err.message}`);
    console.error('Check network connectivity, firewall rules, and credentials.');
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }

  // ─── CHECK 3: RUN PENDING MIGRATIONS VIA PRISMA MIGRATE DEPLOY ───────────────
  console.log('\n[2/3] Applying pending Prisma database migrations...');
  try {
    execSync(`node "${prismaBin}" migrate deploy --schema="${schemaFile}"`, {
      cwd: rootDir,
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: targetUrl, DIRECT_URL: targetUrl },
    });
    console.log('[PASS] Prisma migrate deploy executed successfully.');
  } catch (err) {
    console.error('\n[PRE-DEPLOY FAIL] Prisma migrate deploy encountered an error while applying migrations!');
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }

  // ─── CHECK 4: VERIFY ALL MIGRATIONS IN _prisma_migrations ARE APPLIED ────────
  console.log('\n[3/3] Verifying migration table state in target database...');
  try {
    const tableExists = await prisma.$queryRawUnsafe(`
      SELECT to_regclass('public._prisma_migrations')::text as regclass;
    `);
    if (!tableExists || !tableExists[0] || !tableExists[0].regclass) {
      console.error('\n[PRE-DEPLOY FAIL] Migration tracking table "_prisma_migrations" not found in target database!');
      await prisma.$disconnect();
      process.exit(1);
    }

    const appliedRows = await prisma.$queryRawUnsafe(`
      SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at ASC;
    `);

    const failed = appliedRows.filter((r) => !r.finished_at || r.rolled_back_at);
    if (failed.length > 0) {
      console.error(`\n[PRE-DEPLOY FAIL] Detected ${failed.length} uncompleted or rolled back migration(s) in database:`);
      failed.forEach((f) => console.error(`  - ${f.migration_name} (finished: ${f.finished_at}, rolled_back: ${f.rolled_back_at})`));
      console.error('Fix or resolve migration failures in the database before proceeding.');
      await prisma.$disconnect();
      process.exit(1);
    }

    // Compare with disk migrations count
    const diskMigrations = fs.existsSync(migrationsDir)
      ? fs.readdirSync(migrationsDir).filter((f) => fs.statSync(path.join(migrationsDir, f)).isDirectory() && !f.startsWith('.'))
      : [];

    const appliedNames = new Set(appliedRows.map((r) => r.migration_name));
    const unapplied = diskMigrations.filter((m) => !appliedNames.has(m));

    if (unapplied.length > 0) {
      console.error(`\n[PRE-DEPLOY FAIL] ${unapplied.length} migration(s) present on disk but NOT recorded in database:`);
      unapplied.forEach((m) => console.error(`  - ${m}`));
      console.error('All migrations must be fully applied before web service can start.');
      await prisma.$disconnect();
      process.exit(1);
    }

    console.log(`[PASS] All ${appliedRows.length} migration(s) verified applied with 0 failed and 0 pending.`);
  } catch (err) {
    console.error(`\n[PRE-DEPLOY FAIL] Could not query migration state: ${err.message}`);
    await prisma.$disconnect();
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n========================================================================');
  console.log('[PRE-DEPLOY SUCCESS] All pre-deployment guards passed cleanly.');
  console.log('Target database is reachable, migrations deployed with 0 pending and 0 failed.');
  console.log('Ready to proceed with application start.');
  console.log('========================================================================\n');
  process.exit(0);
}

runPredeployChecks().catch((err) => {
  console.error('[PRE-DEPLOY FATAL]', err);
  process.exit(1);
});
