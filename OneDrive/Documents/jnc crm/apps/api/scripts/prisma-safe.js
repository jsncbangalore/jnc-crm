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

const action = process.argv[2];
const extraArgs = process.argv.slice(3);

function loadEnvFile(filePath) {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim();
        let val = trimmed.substring(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

if (action === 'db-push-test' || action === 'test-phase3' || action === 'seed-test' || action === 'test-data-visibility' || action === 'test-login-system') {
  // Load .env.test first for test actions
  const envTestPath = path.resolve(__dirname, '..', '.env.test');
  loadEnvFile(envTestPath);
} else {
  // Load .env
  const envPath = path.resolve(__dirname, '..', '.env');
  loadEnvFile(envPath);
}

const dbUrl = process.env.DATABASE_URL || '';
const isProd = dbUrl.includes(PROD_HOST);
const hasAllowProd = extraArgs.includes('--allow-production') || process.argv.includes('--allow-production');

function resolveBin(pkgSubpath) {
  try {
    return require.resolve(pkgSubpath, { paths: [__dirname, path.resolve(__dirname, '..'), path.resolve(__dirname, '../../..')] });
  } catch {
    return null;
  }
}

const tsNodeBin = resolveBin('ts-node/dist/bin.js');
const prismaBin = resolveBin('prisma/build/index.js');

function runNodeOrNpx(binPath, npxCmd, args, cwd) {
  if (binPath && fs.existsSync(binPath)) {
    return spawnSync(process.execPath, [binPath, ...args], {
      stdio: 'inherit',
      shell: false,
      env: process.env,
      cwd,
    });
  }
  return spawnSync('npx', [npxCmd, ...args], {
    stdio: 'inherit',
    shell: true,
    env: process.env,
    cwd,
  });
}

if (action === 'db-push-test') {
  if (isProd) {
    console.error('\n[SECURITY ERROR] db:push:test refused to run on production database!');
    console.error(`Host: ${PROD_HOST}`);
    console.error('db:push:test can NEVER run against the production database under any circumstances.\n');
    process.exit(1);
  }

  console.log(`[Safe Prisma] Running db push against test database...`);
  const result = runNodeOrNpx(
    prismaBin,
    'prisma',
    ['db', 'push', '--skip-generate', ...extraArgs],
    path.resolve(__dirname, '..')
  );
  process.exit(result.status ?? 0);
} else if (action === 'test-phase3') {
  if (isProd) {
    console.error('\n[SECURITY ERROR] test:phase3 refused to run on production database!');
    console.error(`Host: ${PROD_HOST}`);
    console.error('test:phase3 can NEVER run against the production database under any circumstances.\n');
    process.exit(1);
  }

  console.log(`[Safe Test Runner] Launching Phase 3 test suite against test database...`);
  const result = runNodeOrNpx(
    tsNodeBin,
    'ts-node',
    ['--transpile-only', 'scripts/test-phase3.ts', ...extraArgs],
    path.resolve(__dirname, '..')
  );
  process.exit(result.status ?? 0);
} else if (action === 'seed-test') {
  if (isProd) {
    console.error('\n[SECURITY ERROR] db:seed:test refused to run on production database!');
    console.error(`Host: ${PROD_HOST}`);
    console.error('db:seed:test can NEVER run against the production database under any circumstances.\n');
    process.exit(1);
  }

  console.log(`[Safe Test Runner] Seeding test database...`);
  const result = runNodeOrNpx(
    tsNodeBin,
    'ts-node',
    ['--transpile-only', 'scripts/seed-test.ts', ...extraArgs],
    path.resolve(__dirname, '..')
  );
  process.exit(result.status ?? 0);
} else if (action === 'migrate-prod') {
  if (isProd && !hasAllowProd) {
    console.error('\n[SECURITY ERROR] migrate:prod refused to run on production database without --allow-production!');
    console.error(`Host: ${PROD_HOST}`);
    console.error('To run migrations on production, you must explicitly pass: npm run migrate:prod -- --allow-production\n');
    process.exit(1);
  }

  console.log(`[Safe Prisma] Running prisma migrate deploy...`);
  const result = runNodeOrNpx(
    prismaBin,
    'prisma',
    ['migrate', 'deploy'],
    path.resolve(__dirname, '..')
  );
} else if (action === 'setup-dev') {
  if (isProd) {
    console.error('\n[SECURITY ERROR] db:setup:dev refused to run on production database!');
    console.error(`Host: ${PROD_HOST}`);
    console.error('db:setup:dev can NEVER run against the production database under any circumstances.\n');
    process.exit(1);
  }

  console.log(`[Safe Prisma] Synchronizing dev database schema via db push...`);
  const pushResult = runNodeOrNpx(
    prismaBin,
    'prisma',
    ['db', 'push', '--skip-generate'],
    path.resolve(__dirname, '..')
  );
  if (pushResult.status !== 0) {
    process.exit(pushResult.status ?? 1);
  }

  console.log(`[Safe Prisma] Initializing JNC internal tenant and admins...`);
  const setupResult = runNodeOrNpx(
    tsNodeBin,
    'ts-node',
    ['--transpile-only', 'scripts/setup-dev-db.ts'],
    path.resolve(__dirname, '..')
  );
  process.exit(setupResult.status ?? 0);
} else if (action === 'test-data-visibility') {
  if (isProd) {
    console.error('\n[SECURITY ERROR] test-data-visibility refused to run on production database!');
    process.exit(1);
  }
  const result = runNodeOrNpx(
    tsNodeBin,
    'ts-node',
    ['--transpile-only', 'scripts/test-data-visibility.ts', ...extraArgs],
    path.resolve(__dirname, '..')
  );
  process.exit(result.status ?? 0);
} else if (action === 'test-login-system') {
  if (isProd) {
    console.error('\n[SECURITY ERROR] test-login-system refused to run on production database!');
    process.exit(1);
  }
  const result = runNodeOrNpx(
    tsNodeBin,
    'ts-node',
    ['--transpile-only', 'scripts/test-login-system.ts', ...extraArgs],
    path.resolve(__dirname, '..')
  );
  process.exit(result.status ?? 0);
} else if (action === 'audit-scoping') {
  const result = runNodeOrNpx(
    tsNodeBin,
    'ts-node',
    ['--transpile-only', 'scripts/audit-scoping.ts', ...extraArgs],
    path.resolve(__dirname, '..')
  );
  process.exit(result.status ?? 0);
} else {
  console.error(`Unknown action: ${action}. Valid actions: db-push-test, test-phase3, seed-test, setup-dev, migrate-prod, test-data-visibility, test-login-system, audit-scoping`);
  process.exit(1);
}
