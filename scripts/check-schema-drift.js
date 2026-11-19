#!/usr/bin/env node
/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Schema Drift Guard (npm run check:schema-drift)
 *
 * Verifies that apps/api/prisma/schema.prisma does not contain any unmigrated
 * datamodel changes compared to the migration history in apps/api/prisma/migrations.
 *
 * 1. Creates a throwaway shadow database on localhost PostgreSQL.
 * 2. Applies all migration files in order to the shadow database.
 * 3. Compares the resulting database structure with schema.prisma using:
 *    prisma migrate diff --from-migrations ... --to-schema-datamodel ... --exit-code
 * 4. Exits with code 0 if 100% in sync; exits with code 1 and prints missing changes if drifted.
 * 5. Drops the throwaway shadow database in all cases.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const { assertLocalhostDatabase } = require('./db-safety-guard');

// Ensure environment variables are loaded
const envFile = path.resolve(__dirname, '..', 'apps', 'api', '.env');
if (!process.env.DATABASE_URL && fs.existsSync(envFile)) {
  const content = fs.readFileSync(envFile, 'utf8');
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (t && !t.startsWith('#') && t.includes('=')) {
      const idx = t.indexOf('=');
      const k = t.slice(0, idx).trim();
      const v = t.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const baseDbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev?schema=public';
assertLocalhostDatabase(baseDbUrl, process.argv);

async function main() {
  console.log('========================================================================');
  console.log('PRISMA SCHEMA DRIFT GUARD (npm run check:schema-drift)');
  console.log('========================================================================');

  const rootDir = path.resolve(__dirname, '..');
  const migrationsDir = path.resolve(rootDir, 'apps', 'api', 'prisma', 'migrations');
  const schemaFile = path.resolve(rootDir, 'apps', 'api', 'prisma', 'schema.prisma');
  const prismaBin = path.resolve(rootDir, 'node_modules', 'prisma', 'build', 'index.js');

  if (!fs.existsSync(migrationsDir)) {
    console.error(`[SCHEMA DRIFT FAIL] Migrations directory not found: ${migrationsDir}`);
    process.exit(1);
  }
  if (!fs.existsSync(schemaFile)) {
    console.error(`[SCHEMA DRIFT FAIL] Schema file not found: ${schemaFile}`);
    process.exit(1);
  }

  const shadowDbName = `jnc_crm_drift_shadow_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const parsed = new URL(baseDbUrl);
  parsed.pathname = '/postgres';
  const adminUrl = parsed.toString();

  parsed.pathname = `/${shadowDbName}`;
  parsed.searchParams.set('schema', 'public');
  const shadowDbUrl = parsed.toString();

  const adminClient = new PrismaClient({ datasources: { db: { url: adminUrl } } });

  console.log(`[1/3] Provisioning shadow database: ${shadowDbName}...`);
  try {
    await adminClient.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${shadowDbName}" WITH (FORCE)`);
    await adminClient.$executeRawUnsafe(`CREATE DATABASE "${shadowDbName}"`);
  } catch (err) {
    console.error(`[SCHEMA DRIFT FAIL] Could not create shadow database: ${err.message}`);
    await adminClient.$disconnect();
    process.exit(1);
  } finally {
    await adminClient.$disconnect();
  }

  let driftExitCode = 0;
  let driftOutput = '';

  console.log('[2/3] Comparing migration history with schema.prisma datamodel...');
  try {
    const cmd = `node "${prismaBin}" migrate diff --from-migrations "${migrationsDir}" --to-schema-datamodel "${schemaFile}" --shadow-database-url "${shadowDbUrl}" --exit-code`;
    const out = execSync(cmd, {
      cwd: rootDir,
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: shadowDbUrl, DIRECT_URL: shadowDbUrl },
    });
    driftOutput = out.toString().trim();
  } catch (err) {
    driftExitCode = err.status || 1;
    driftOutput = (err.stdout ? err.stdout.toString() : '') + (err.stderr ? err.stderr.toString() : '');
  }

  console.log(`[3/3] Dropping shadow database: ${shadowDbName}...`);
  const cleanupClient = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    await cleanupClient.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${shadowDbName}" WITH (FORCE)`);
  } catch (cleanupErr) {
    console.warn(`[CLEANUP WARNING] Failed to drop ${shadowDbName}: ${cleanupErr.message}`);
  } finally {
    await cleanupClient.$disconnect();
  }

  console.log('------------------------------------------------------------------------');
  if (driftExitCode === 0) {
    console.log('[SCHEMA DRIFT PASS] Zero drift detected!');
    console.log('All model fields, relations, and indexes in schema.prisma are fully covered by migrations.');
    console.log('========================================================================\n');
    process.exit(0);
  } else {
    console.error('[SCHEMA DRIFT FAIL] Unmigrated changes detected in schema.prisma!\n');
    console.error('The following changes exist in schema.prisma but have NO corresponding migration file:');
    console.error(driftOutput || 'Unspecified schema difference detected.');
    console.error('\nAction Required:');
    console.error('  Generate and test a migration before deploying or releasing:');
    console.error('  npx prisma migrate dev --name <migration_name>');
    console.error('========================================================================\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[SCHEMA DRIFT FATAL]', err);
  process.exit(1);
});
