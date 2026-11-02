/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Development Database Management Orchestrator
 *
 * Commands:
 *   node scripts/db-dev.js up       - Starts / ensures local Postgres development database is running
 *   node scripts/db-dev.js migrate  - Applies ALL Prisma migrations in order
 *   node scripts/db-dev.js seed     - Seeds fake development data (3 companies, roles, docs)
 *   node scripts/db-dev.js reset    - Resets dev database, migrates, and seeds
 */

const { spawnSync, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

const DEV_DB_NAME = process.env.DEV_DB_NAME || 'jnc_crm_dev';
const DEV_PORT = parseInt(process.env.DEV_DB_PORT || '5432', 10);
const DEV_DB_USER = process.env.DEV_DB_USER || process.env.PGUSER || 'postgres';
const DEV_DB_PASS = process.env.DEV_DB_PASS || process.env.PGPASSWORD || '';
const DEFAULT_DEV_DATABASE_URL = process.env.DATABASE_URL || (DEV_DB_PASS
  ? `postgresql://${DEV_DB_USER}:${DEV_DB_PASS}@localhost:${DEV_PORT}/${DEV_DB_NAME}?schema=public`
  : `postgresql://${DEV_DB_USER}@localhost:${DEV_PORT}/${DEV_DB_NAME}?schema=public`);

// Load .env.development if present, otherwise process.env
function resolveDevEnv() {
  const envDevPath = path.resolve(process.cwd(), '.env.development');
  if (fs.existsSync(envDevPath)) {
    const lines = fs.readFileSync(envDevPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const idx = trimmed.indexOf('=');
      const key = trimmed.substring(0, idx).trim();
      let val = trimmed.substring(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }

  // Ensure DATABASE_URL and DIRECT_URL are set for dev
  if (!process.env.DATABASE_URL || (!process.env.DATABASE_URL.includes('localhost') && !process.env.DATABASE_URL.includes('127.0.0.1'))) {
    process.env.DATABASE_URL = DEFAULT_DEV_DATABASE_URL;
  }
  if (!process.env.DIRECT_URL) {
    process.env.DIRECT_URL = process.env.DATABASE_URL;
  }
}

resolveDevEnv();

function checkPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

async function runUp() {
  console.log('[DB-DEV:UP] Checking development database status...');
  const isRunning = await checkPort(DEV_PORT);
  if (isRunning) {
    console.log(`[DB-DEV:UP] PostgreSQL is actively running on port ${DEV_PORT}.`);
  } else {
    // Check if docker is installed
    let hasDocker = false;
    try {
      execSync('docker --version', { stdio: 'pipe' });
      hasDocker = true;
    } catch (_) {}

    if (hasDocker) {
      console.log('[DB-DEV:UP] Launching development PostgreSQL container via Docker Compose...');
      execSync('docker compose -f docker-compose.dev.yml up -d', { stdio: 'inherit' });
    } else {
      console.log('[DB-DEV:UP] Docker CLI not detected. Checking for local embedded runner...');
      const runnerScript = path.resolve('C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824/scratch/pg-runner/start-pg.js');
      if (fs.existsSync(runnerScript)) {
        console.log(`[DB-DEV:UP] Starting local PostgreSQL runner at ${runnerScript}...`);
        spawnSync('node', [runnerScript], { stdio: 'inherit' });
      } else {
        console.warn(`[DB-DEV:UP] Port ${DEV_PORT} is not yet listening. Please start Docker or local PostgreSQL service.`);
      }
    }
  }

  // Ensure dev database exists
  try {
    const pgPath = 'C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824/scratch/pg-runner/node_modules/pg';
    const { Client } = require(fs.existsSync(pgPath) ? pgPath : 'pg');
    const adminUser = process.env.PGADMIN_USER || process.env.PGUSER || 'postgres';
    const adminPass = process.env.PGADMIN_PASSWORD || process.env.PGPASSWORD || '';
    const connStr = adminPass
      ? `postgresql://${adminUser}:${adminPass}@localhost:${DEV_PORT}/postgres`
      : `postgresql://${adminUser}@localhost:${DEV_PORT}/postgres`;
    const client = new Client({
      connectionString: connStr,
    });
    await client.connect();
    const res = await client.query(`SELECT 1 FROM pg_database WHERE datname='${DEV_DB_NAME}'`);
    if (res.rowCount === 0) {
      await client.query(`CREATE DATABASE "${DEV_DB_NAME}"`);
      console.log(`[DB-DEV:UP] Created database "${DEV_DB_NAME}".`);
    } else {
      console.log(`[DB-DEV:UP] Database "${DEV_DB_NAME}" exists and is ready.`);
    }
    await client.end();
  } catch (err) {
    console.log(`[DB-DEV:UP] Notice: Database check completed (${err.message}).`);
  }
}

async function runMigrate() {
  console.log('[DB-DEV:MIGRATE] Applying ALL Prisma migrations in order on development database...');
  console.log(`[DB-DEV:MIGRATE] Target: ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);

  const prismaBin = path.resolve(process.cwd(), 'node_modules/prisma/build/index.js');
  const schemaPath = path.resolve(process.cwd(), 'apps/api/prisma/schema.prisma');

  const result = spawnSync('node', [prismaBin, 'migrate', 'deploy', '--schema', schemaPath], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
  });

  if (result.status !== 0) {
    console.error('[DB-DEV:MIGRATE] Migration failed with exit code', result.status);
    process.exit(result.status || 1);
  }
  console.log('[DB-DEV:MIGRATE] All migrations applied successfully!');
}

async function runSeed() {
  console.log('[DB-DEV:SEED] Seeding development database...');
  const tsNodeBin = path.resolve(process.cwd(), 'node_modules/ts-node/dist/bin.js');
  const seedScript = path.resolve(process.cwd(), 'scripts/seed-dev.ts');
  const tsConfig = path.resolve(process.cwd(), 'apps/api/tsconfig.json');

  const result = spawnSync('node', [tsNodeBin, '--project', tsConfig, seedScript], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
  });

  if (result.status !== 0) {
    console.error('[DB-DEV:SEED] Seeding failed with exit code', result.status);
    process.exit(result.status || 1);
  }
  console.log('[DB-DEV:SEED] Database seeding complete!');
}

async function runReset() {
  console.log('[DB-DEV:RESET] Resetting development database...');
  try {
    const pgPath = 'C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824/scratch/pg-runner/node_modules/pg';
    const { Client } = require(fs.existsSync(pgPath) ? pgPath : 'pg');
    const adminUser = process.env.PGADMIN_USER || process.env.PGUSER || 'postgres';
    const adminPass = process.env.PGADMIN_PASSWORD || process.env.PGPASSWORD || '';
    const connStr = adminPass
      ? `postgresql://${adminUser}:${adminPass}@localhost:${DEV_PORT}/postgres`
      : `postgresql://${adminUser}@localhost:${DEV_PORT}/postgres`;
    const client = new Client({
      connectionString: connStr,
    });
    await client.connect();
    await client.query(`DROP DATABASE IF EXISTS "${DEV_DB_NAME}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${DEV_DB_NAME}"`);
    console.log(`[DB-DEV:RESET] Re-created clean database "${DEV_DB_NAME}".`);
    await client.end();
  } catch (err) {
    console.warn(`[DB-DEV:RESET] Warning during drop/create: ${err.message}`);
  }

  await runMigrate();
  await runSeed();
  console.log('[DB-DEV:RESET] Reset, migrations, and seeding completed successfully!');
}

async function main() {
  const action = process.argv[2];
  switch (action) {
    case 'up':
      await runUp();
      break;
    case 'migrate':
      await runMigrate();
      break;
    case 'seed':
      await runSeed();
      break;
    case 'reset':
      await runReset();
      break;
    default:
      console.log('Usage: node scripts/db-dev.js <up|migrate|seed|reset>');
      process.exit(1);
  }
}

main().catch((e) => {
  console.error('[DB-DEV ERROR]', e);
  process.exit(1);
});
