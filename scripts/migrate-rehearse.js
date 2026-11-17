/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');

const envFile = path.resolve('apps/api/.env');
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

const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const { assertLocalhostDatabase } = require('./db-safety-guard');
const { main: runBackup } = require('./db-backup');
const { restoreCopy } = require('./db-restore-copy');

async function dropDatabase(dbName) {
  const envUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev?schema=public';
  const parsed = new URL(envUrl);
  parsed.pathname = '/postgres';
  const p = new PrismaClient({ datasources: { db: { url: parsed.toString() } } });
  try {
    await p.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    console.log(` [CLEANUP] Dropped rehearsal database: ${dbName}`);
  } catch (err) {
    console.warn(` [CLEANUP WARNING] Failed to drop ${dbName}: ${err.message}`);
  } finally {
    await p.$disconnect();
  }
}

async function rehearse() {
  const envUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev?schema=public';
  assertLocalhostDatabase(envUrl, process.argv);

  console.log('========================================================================');
  console.log('CRM MIGRATION REHEARSAL SUITE');
  console.log('========================================================================');

  const rehearsalDb = `jnc_crm_rehearsal_${Date.now()}`;
  let testPassed = false;
  let testError = null;

  try {
    // 1. Create a fresh backup
    console.log(' [STEP 1/4] Creating pre-rehearsal backup...');
    const { filePath: backupFile } = await runBackup();

    // 2. Restore into throwaway database
    console.log(` [STEP 2/4] Restoring to rehearsal database: ${rehearsalDb}...`);
    const { dbUrl } = await restoreCopy(backupFile, rehearsalDb);

    // 3. Run pending migrations
    console.log(' [STEP 3/4] Rehearsing Prisma migrations on throwaway database...');
    const env = {
      ...process.env,
      DATABASE_URL: dbUrl,
      DIRECT_URL: dbUrl,
    };
    execSync('node "./node_modules/prisma/build/index.js" migrate deploy --schema=apps/api/prisma/schema.prisma', {
      env,
      stdio: 'pipe',
    });

    // 4. Smoke checks on the rehearsal database
    console.log(' [STEP 4/4] Executing smoke checks on migrated copy...');
    const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const appliedRows = await prisma.$queryRawUnsafe(
        'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at ASC'
      );
      const failed = appliedRows.filter(r => !r.finished_at || r.rolled_back_at);
      if (failed.length > 0) {
        throw new Error(`Found ${failed.length} uncompleted or failed migration(s): ${failed.map(f => f.migration_name).join(', ')}`);
      }

      const tenantCount = await prisma.tenant.count();
      const userCount = await prisma.user.count();
      const invoiceCount = await prisma.invoice.count();
      const quotationCount = await prisma.quotation.count();
      const skuCount = await prisma.sku.count();

      console.log('   -> Migrations applied   :', appliedRows.length);
      console.log('   -> Tenants in database  :', tenantCount);
      console.log('   -> Users in database    :', userCount);
      console.log('   -> Invoices in database :', invoiceCount);
      console.log('   -> Quotations in db     :', quotationCount);
      console.log('   -> SKUs in database     :', skuCount);

      testPassed = true;
    } finally {
      await prisma.$disconnect();
    }
  } catch (err) {
    testError = err;
    testPassed = false;
  } finally {
    // Drop the copy database
    await dropDatabase(rehearsalDb);
  }

  console.log('========================================================================');
  if (testPassed) {
    console.log(' [REHEARSAL REPORT] RESULT: PASS');
    console.log(' -> All migrations apply cleanly on the copy database without errors.');
    console.log(' -> Safe to apply migrations to live production database.');
    console.log('========================================================================');
    return { ok: true };
  } else {
    console.error(' [REHEARSAL REPORT] RESULT: FAIL');
    console.error(` -> Migration rehearsal failed: ${testError?.message}`);
    console.error(' -> DO NOT apply migrations to production until this failure is resolved.');
    console.log('========================================================================');
    if (require.main === module) process.exit(1);
    throw testError;
  }
}

if (require.main === module) {
  rehearse().catch(() => process.exit(1));
}

module.exports = { rehearse };
