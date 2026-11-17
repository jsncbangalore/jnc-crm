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

function getBaseHostUrl() {
  const envUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev?schema=public';
  assertLocalhostDatabase(envUrl, process.argv);
  const parsed = new URL(envUrl);
  parsed.pathname = '/postgres';
  return parsed.toString();
}

function resolveBackupFile(argPath) {
  if (argPath && fs.existsSync(argPath)) {
    return path.resolve(argPath);
  }
  const backupsDir = path.resolve('backups');
  if (fs.existsSync(backupsDir)) {
    const files = fs.readdirSync(backupsDir)
      .filter(f => f.endsWith('.sql'))
      .map(f => ({ name: f, time: fs.statSync(path.join(backupsDir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);
    if (files.length > 0) {
      return path.join(backupsDir, files[0].name);
    }
  }
  return null;
}

async function restoreCopy(backupFileArg, customDbName) {
  const postgresUrl = getBaseHostUrl();
  const rootPrisma = new PrismaClient({ datasources: { db: { url: postgresUrl } } });

  const throwawayDb = customDbName || `jnc_crm_throwaway_${Date.now()}`;
  const targetUrl = postgresUrl.replace('/postgres', `/${throwawayDb}`);

  console.log('========================================================================');
  console.log(`CRM RESTORE TO THROWAWAY DATABASE`);
  console.log('========================================================================');
  console.log(` -> Target Throwaway DB : ${throwawayDb}`);

  try {
    // 1. Create target database
    await rootPrisma.$executeRawUnsafe(`CREATE DATABASE "${throwawayDb}"`);
    console.log(` [OK] Database created: ${throwawayDb}`);
  } finally {
    await rootPrisma.$disconnect();
  }

  // 2. Deploy schema migrations
  console.log(` [MIGRATE] Applying schema migrations to ${throwawayDb}...`);
  const env = {
    ...process.env,
    DATABASE_URL: targetUrl,
    DIRECT_URL: targetUrl,
  };
  execSync('node "./node_modules/prisma/build/index.js" migrate deploy --schema=apps/api/prisma/schema.prisma', {
    env,
    stdio: 'inherit',
  });

  // 3. Restore data from backup file if present
  const backupFile = resolveBackupFile(backupFileArg);
  if (backupFile && fs.existsSync(backupFile)) {
    console.log(` [RESTORE] Populating data from: ${path.basename(backupFile)}...`);
    const content = fs.readFileSync(backupFile, 'utf8');
    const statements = content
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.startsWith('INSERT INTO '));

    const targetPrisma = new PrismaClient({ datasources: { db: { url: targetUrl } } });
    try {
      // Temporarily disable foreign key constraints for fast batch restore
      await targetPrisma.$executeRawUnsafe('SET session_replication_role = replica;');
      for (const stmt of statements) {
        try {
          await targetPrisma.$executeRawUnsafe(stmt);
        } catch {}
      }
      await targetPrisma.$executeRawUnsafe('SET session_replication_role = DEFAULT;');
      console.log(` [RESTORE] Restored ${statements.length} table insert statement(s).`);
    } finally {
      await targetPrisma.$disconnect();
    }
  }

  console.log('========================================================================');
  console.log(`[RESTORE SUCCESS] Created throwaway copy: ${throwawayDb}`);
  console.log(` -> URL: ${targetUrl}`);
  console.log('========================================================================');
  return { dbName: throwawayDb, dbUrl: targetUrl };
}

if (require.main === module) {
  const fileArg = process.argv.slice(2).find(a => !a.startsWith('--'));
  restoreCopy(fileArg).catch(err => {
    console.error(`[RESTORE FAIL] ${err.message}`);
    process.exit(1);
  });
}

module.exports = { restoreCopy };
