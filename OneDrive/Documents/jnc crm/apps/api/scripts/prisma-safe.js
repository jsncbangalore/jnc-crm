/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', 'host.docker.internal'];

function extractSupabaseProjectRef(urlStr) {
  if (!urlStr) return null;
  try {
    const parsed = new URL(urlStr);
    const user = decodeURIComponent(parsed.username || '');
    if (user.includes('.')) {
      const parts = user.split('.');
      return parts.slice(1).join('.').toLowerCase();
    }
    const host = parsed.hostname.toLowerCase();
    if (host.endsWith('.supabase.co')) {
      const parts = host.split('.');
      if (parts.length >= 3 && parts[0] === 'db') {
        return parts[1].toLowerCase();
      }
    }
  } catch (_) {
    const matchUser = urlStr.match(/:\/\/([^:/@]+)(?::[^@]*)?@/);
    if (matchUser && matchUser[1].includes('.')) {
      return matchUser[1].split('.').slice(1).join('.').toLowerCase();
    }
    const matchDirectHost = urlStr.match(/@db\.([a-z0-9_-]+)\.supabase\.co/i);
    if (matchDirectHost) {
      return matchDirectHost[1].toLowerCase();
    }
  }
  return null;
}

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

// Load environment based on action (only test actions use .env.test; dev/ops use .env)
const isTestAction = [
  'db-push-test',
  'seed-test',
  'test-phase3',
  'test-visibility',
  'test-login',
  'test-security',
  'test-login-system',
  'test-data-visibility',
  'test-customer-list-scope',
].includes(action);

if (isTestAction) {
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
    const parsed = new URL(dbUrl);
    const hostname = parsed.hostname.toLowerCase();
    const isLocal = LOCAL_HOSTS.includes(hostname);

    const blockedRefs = (process.env.BLOCKED_DB_PROJECT_REFS || '')
      .split(',')
      .map(r => r.trim().toLowerCase())
      .filter(Boolean);

    const allowedRefs = (process.env.ALLOWED_DB_PROJECT_REFS || '')
      .split(',')
      .map(r => r.trim().toLowerCase())
      .filter(Boolean);

    const allowedHosts = (process.env.ALLOWED_DB_HOSTS || '')
      .split(',')
      .map(h => h.trim().toLowerCase())
      .filter(Boolean);

    const projectRef = extractSupabaseProjectRef(dbUrl);
    const isSupabase = hostname.endsWith('supabase.com') || hostname.endsWith('supabase.co');

    // 1. If project reference is present (Supabase pooler / direct)
    if (projectRef) {
      // BLOCKED_DB_PROJECT_REFS always wins!
      if (blockedRefs.includes(projectRef)) {
        console.error(`\n[SECURITY ERROR] ${contextName} refused: project reference "${projectRef}" is in BLOCKED_DB_PROJECT_REFS.`);
        process.exit(1);
      }
      // Must be explicitly allowed
      if (!allowedRefs.includes(projectRef)) {
        console.error(`\n[SECURITY ERROR] ${contextName} refused: project reference "${projectRef}" is not in ALLOWED_DB_PROJECT_REFS.`);
        process.exit(1);
      }
    } else if (isSupabase) {
      // Supabase pooler/direct connection requires project ref in username
      console.error(`\n[SECURITY ERROR] ${contextName} refused: Supabase connection requires project reference in user name (postgres.<project-ref>), but none was found.`);
      process.exit(1);
    } else if (!isLocal && !allowedHosts.includes(hostname)) {
      console.error(`\n[SECURITY ERROR] ${contextName} refused: database host "${hostname}" is neither local nor in ALLOWED_DB_HOSTS, and no project reference was provided.`);
      process.exit(1);
    }

    if (contextName === 'prod:bootstrap') {
      if (process.env.NODE_ENV !== 'production') {
        console.error('\n[SECURITY ERROR] prod:bootstrap requires NODE_ENV=production.');
        process.exit(1);
      }
      if (!projectRef && !allowedHosts.includes(hostname) && !isLocal) {
        console.error(`\n[SECURITY ERROR] prod:bootstrap refused: neither allowed project reference nor allowed host declared.`);
        process.exit(1);
      }
      if (!hasAllowProd) {
        console.error('\n[SECURITY ERROR] prod:bootstrap requires --allow-production flag.');
        process.exit(1);
      }
      if (process.env.CONFIRM_PRODUCTION !== 'yes') {
        console.error('\n[SECURITY ERROR] prod:bootstrap requires CONFIRM_PRODUCTION=yes environment variable.');
        process.exit(1);
      }
      return;
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
  'platform:reset': { type: 'ts-node', file: 'scripts/platform-reset.ts' },
  'migrate-prod': { type: 'prisma', args: ['migrate','deploy'] },
  'setup-dev': { type: 'prisma', args: ['db','push','--skip-generate'] },
  'seed-staging': { type: 'ts-node', file: 'scripts/seed-staging.ts' },
  'test-customer-list-scope': { type: 'ts-node', file: 'scripts/test-customer-list-scope.ts' },
  'prod:bootstrap': { type: 'ts-node', file: 'scripts/prod-bootstrap.ts' },
  'dry-run-fresh': { type: 'ts-node', file: 'scripts/dry-run-fresh.ts' },
};

function resolveBin(pkgSubpath) {
  try {
    return require.resolve(pkgSubpath, { paths: [__dirname, path.resolve(__dirname, '..'), path.resolve(__dirname, '../../..')] });
  } catch (_) { return null; }
}

const prismaBin = resolveBin('prisma/build/index.js');
const tsNodeBin = resolveBin('ts-node/dist/bin.js');

function isPrismaClientGenerated() {
  const possiblePaths = [
    path.resolve(__dirname, '../../../node_modules/.prisma/client/index.js'),
    path.resolve(__dirname, '../../node_modules/.prisma/client/index.js'),
    path.resolve(__dirname, '../node_modules/.prisma/client/index.js'),
    path.resolve(__dirname, '../../../node_modules/@prisma/client/index.js'),
  ];
  return possiblePaths.some((p) => fs.existsSync(p));
}

function ensurePrismaClient() {
  if (!isPrismaClientGenerated()) {
    console.log('[Safe Prisma] Prisma Client is missing. Generating Prisma Client automatically...');
    if (!prismaBin) {
      console.error('[SECURITY ERROR] Cannot generate Prisma Client: prisma binary not found.');
      process.exit(1);
    }
    const genResult = spawnSync(process.execPath, [prismaBin, 'generate'], {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..'),
      env: process.env,
    });
    if (genResult.status !== 0) {
      console.error('[SECURITY ERROR] Failed to automatically generate Prisma Client.');
      process.exit(genResult.status ?? 1);
    }
  }
}

function runAction(name) {
  const entry = knownActions[name];
  if (!entry) {
    console.error(`[SECURITY ERROR] Unknown action: ${name}. Known actions: ${Object.keys(knownActions).join(', ')}`);
    process.exit(1);
  }
  // Guard
  assertLocalDatabase(name);

  if (extraArgs.includes('--check-only') || process.argv.includes('--check-only')) {
    console.log(`[Safe Guard] ${name} host check passed.`);
    process.exit(0);
  }

  // Ensure Prisma Client is generated before executing any DB/Prisma action
  ensurePrismaClient();

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
