/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROD_HOST = 'aws-0-ap-southeast-1.pooler.supabase.com';
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', 'host.docker.internal'];

const action = process.argv[2];
const extraArgs = process.argv.slice(3);

function loadEnvFile(filePath) {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim();
        let val = trimmed.substring(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith('\'') && val.endsWith('\''))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

// Load environment based on action (match script names)
if (['db-push-test','test-phase3','seed-test','test-visibility','test-login','test-security','owner:reset','owner:reset','owner-reset','test-login-system','test-data-visibility'].includes(action)) {
  const envTestPath = path.resolve(__dirname, '..', '.env.test');
  loadEnvFile(envTestPath);
} else {
  const envPath = path.resolve(__dirname, '..', '.env');
  loadEnvFile(envPath);
}

// Resolve effective DATABASE_URL (process env wins, trim whitespace/quotes)
const rawUrl = process.env.DATABASE_URL || '';
const dbUrl = rawUrl.trim().replace(/^['\"]|['\"]$/g, '');
const hasAllowProd = extraArgs.includes('--allow-production') || process.argv.includes('--allow-production');

// Print DB info
if (dbUrl) {
  try {
    const parsed = new URL(dbUrl);
    console.log(`[Database] ${parsed.pathname.replace(/^\//, '')} @ ${parsed.hostname}`);
  } catch (_) {
    console.log(`[Database] ${dbUrl}`);
  }
} else {
  console.log('[Database] (none)');
}

function assertLocalDatabase(contextName) {
  if (!dbUrl) return; // nothing to check
  try {
    const hostname = new URL(dbUrl).hostname;
    const isLocal = LOCAL_HOSTS.includes(hostname);
    if (!isLocal && !hasAllowProd) {
      console.error(`\n[SECURITY ERROR] ${contextName} refused to run on non‑local database host ${hostname}. Pass --allow-production to override.`);
      process.exit(1);
    }
    if (contextName === 'migrate-prod' && process.env.CONFIRM_PRODUCTION !== 'yes') {
      console.error('\n[SECURITY ERROR] migrate:prod requires CONFIRM_PRODUCTION=yes environment variable.');
      process.exit(1);
    }
  } catch (e) {
    console.error(`\n[SECURITY ERROR] ${contextName} has invalid DATABASE_URL: ${e.message}`);
    process.exit(1);
  }
}

// Known actions mapping (script name -> execution details)
const knownActions = {
  'db-push-dev': { type: 'prisma', args: ['db','push','--skip-generate'] },
  'db-push-test': { type: 'prisma', args: ['db','push','--skip-generate'] },
  'test-phase3': { type: 'ts-node', file: 'scripts/test-phase3.ts' },
  'seed-test': { type: 'ts-node', file: 'scripts/seed-test.ts' },
  'test-visibility': { type: 'ts-node', file: 'scripts/test-data-visibility.ts' },
  'test-login': { type: 'ts-node', file: 'scripts/test-login-system.ts' },
  'test-security': { type: 'ts-node', file: 'scripts/test-security.ts' },
  'owner:reset': { type: 'ts-node', file: 'scripts/owner-reset.ts' },
  'migrate-prod': { type: 'prisma', args: ['migrate','deploy'] },
  'setup-dev': { type: 'prisma', args: ['db','push','--skip-generate'] },
};

function resolveBin(pkgSubpath) {
  try {
    return require.resolve(pkgSubpath, { paths: [__dirname, path.resolve(__dirname, '..'), path.resolve(__dirname, '../../..')] });
  } catch (_) { return null; }
}

const prismaBin = resolveBin('prisma/build/index.js');
const tsNodeBin = resolveBin('ts-node/dist/bin.js');

function runAction(name) {
  const entry = knownActions[name];
  if (!entry) {
    console.error(`[SECURITY ERROR] Unknown action: ${name}. Known actions: ${Object.keys(knownActions).join(', ')}`);
    process.exit(1);
  }
  // Guard
  assertLocalDatabase(name);

  if (entry.type === 'prisma') {
    if (!prismaBin) { console.error('Prisma binary not found'); process.exit(1); }
    console.log(`[Safe Prisma] Running ${name}...`);
    const result = spawnSync(process.execPath, [prismaBin, ...entry.args, ...extraArgs], { stdio: 'inherit', env: process.env, cwd: path.resolve(__dirname, '..') });
    process.exit(result.status ?? 0);
  } else if (entry.type === 'ts-node') {
    if (!tsNodeBin) { console.error('ts-node binary not found'); process.exit(1); }
    console.log(`[Safe Script] Running ${name}...`);
    const scriptPath = path.resolve(__dirname, '..', entry.file);
    const result = spawnSync(process.execPath, [tsNodeBin, '--transpile-only', scriptPath, ...extraArgs], { stdio: 'inherit', env: process.env, cwd: path.resolve(__dirname, '..') });
    process.exit(result.status ?? 0);
  }
}

if (knownActions[action]) {
  runAction(action);
} else {
  console.error(`[SECURITY ERROR] Unknown action: ${action}. Known actions: ${Object.keys(knownActions).join(', ')}`);
  process.exit(1);
}
