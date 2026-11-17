/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Deploy Safety & Release Verification Automated Test Suite
 *
 * Verifies:
 * 1. Health endpoint reports the right migration counts (applied, pending, failed) & DB connectivity.
 * 2. Production web build strictly fails when VITE_API_URL is missing.
 * 3. Database backup and restore-copy scripts refuse to run against non-local databases.
 * 4. Migration rehearsal script correctly reports a deliberately broken migration as failed and cleans up.
 * 5. release:verify scanner fails when a forbidden dev/demo string is injected into dist.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function fetchJson(urlStr) {
  return new Promise((resolve, reject) => {
    http.get(urlStr, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${data.substring(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

async function runDeploySafetySuite(assertFn) {
  const assert = assertFn || ((title, condition, info = '') => {
    if (condition) {
      console.log(`  [PASS] ${title}`);
    } else {
      console.error(`  [FAIL] ${title} (${info})`);
      throw new Error(`Assertion failed: ${title}`);
    }
  });

  console.log('\n--- 1. Health Endpoint Migration State & Database Connectivity ---');
  try {
    const health = await fetchJson('http://localhost:3333/api/v1/health');
    assert('Health returns 200 OK', health.status === 200);
    assert('Health reports database connected', health.body.database === 'connected');
    const migrationsDir = path.resolve('apps/api/prisma/migrations');
    const expectedMigrations = fs.existsSync(migrationsDir)
      ? fs.readdirSync(migrationsDir).filter(f => fs.statSync(path.join(migrationsDir, f)).isDirectory() && !f.startsWith('.')).length
      : 33;
    assert(`Health reports total migrations === ${expectedMigrations}`, health.body.migrationState?.total === expectedMigrations);
    assert(`Health reports applied count === ${expectedMigrations}`, health.body.migrationState?.appliedCount === expectedMigrations);
    assert('Health reports pending list is empty', Array.isArray(health.body.migrationState?.pendingList) && health.body.migrationState.pendingList.length === 0);
    assert('Health reports failed list is empty', Array.isArray(health.body.migrationState?.failedList) && health.body.migrationState.failedList.length === 0);
    assert('Health commitId is valid and not unknown', Boolean(health.body.commitId && health.body.commitId !== 'unknown'));
  } catch (err) {
    assert('Health endpoint verification', false, err.message);
  }

  console.log('\n--- 2. Production Web Build Refusal When VITE_API_URL Missing ---');
  const webBuildProc = spawnSync('node', ['../../node_modules/vite/bin/vite.js', 'build', '--mode', 'production'], {
    cwd: path.resolve('apps/web'),
    env: {
      ...process.env,
      VITE_API_URL: '',
      VITE_API_BASE_URL: '',
    },
    encoding: 'utf8',
    shell: true,
  });

  const buildFailed = webBuildProc.status !== 0;
  const buildErrLog = (webBuildProc.stderr || '') + (webBuildProc.stdout || '');
  const mentionsMissingUrl = buildErrLog.includes('Missing required environment variable: VITE_API_URL') ||
                            buildErrLog.includes('VITE_API_URL');
  assert('Production web build fails without VITE_API_URL', buildFailed && mentionsMissingUrl, `exit: ${webBuildProc.status}`);

  console.log('\n--- 3. Localhost Safety Guards on Backup & Restore Scripts ---');
  // Test backup refusal on remote DB
  const backupGuardProc = spawnSync('node', ['scripts/db-backup.js'], {
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://postgres:secret@remote-production-db.company.com:5432/live_db',
    },
    encoding: 'utf8',
  });
  const backupRefused = backupGuardProc.status !== 0 && (backupGuardProc.stderr + backupGuardProc.stdout).includes('[SAFETY REFUSAL]');
  assert('db-backup.js refuses to run on non-local database without flag', backupRefused);

  // Test restore-copy refusal on remote DB
  const restoreGuardProc = spawnSync('node', ['scripts/db-restore-copy.js'], {
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://postgres:secret@remote-production-db.company.com:5432/live_db',
    },
    encoding: 'utf8',
  });
  const restoreRefused = restoreGuardProc.status !== 0 && (restoreGuardProc.stderr + restoreGuardProc.stdout).includes('[SAFETY REFUSAL]');
  assert('db-restore-copy.js refuses to run on non-local database without flag', restoreRefused);

  console.log('\n--- 4. Migration Rehearsal Reports Deliberately Broken Migration As Failed ---');
  // Create a temporary broken migration file in a new timestamped folder
  const testMigName = `20991231235959_broken_test_migration_${Date.now()}`;
  const testMigDir = path.resolve('apps/api/prisma/migrations', testMigName);
  try {
    fs.mkdirSync(testMigDir, { recursive: true });
    // Write invalid SQL that fails execution
    fs.writeFileSync(path.join(testMigDir, 'migration.sql'), 'CREATE TABLE "Broken" (id INT INVALID_SYNTAX_ERROR);', 'utf8');

    const rehearseProc = spawnSync('node', ['scripts/migrate-rehearse.js'], {
      encoding: 'utf8',
    });
    const rehearseFailed = rehearseProc.status !== 0;
    const rehearseLog = rehearseProc.stderr + rehearseProc.stdout;
    const reportedFail = rehearseLog.includes('[REHEARSAL REPORT] RESULT: FAIL');
    assert('migrate-rehearse.js detects broken migration and reports RESULT: FAIL', rehearseFailed && reportedFail);
  } finally {
    // Always cleanup the temporary test migration folder
    if (fs.existsSync(testMigDir)) {
      fs.rmSync(testMigDir, { recursive: true, force: true });
    }
  }

  console.log('\n--- 5. release:verify / dist Scanner Fails On Injected Forbidden String ---');
  const distDir = path.resolve('apps/web/dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
  const injectedFile = path.join(distDir, '_test_injected_leak.js');
  try {
    fs.writeFileSync(injectedFile, 'console.log("dev-demo-login test leak DevPassword");', 'utf8');
    const scanProc = spawnSync('node', ['scripts/scan-dist-leaks.js'], {
      encoding: 'utf8',
    });
    const scanFailed = scanProc.status !== 0;
    const scanLog = scanProc.stderr + scanProc.stdout;
    const caught = scanLog.includes('dev-demo-login') || scanLog.includes('Forbidden string found');
    assert('Dist leak scanner fails when forbidden string is present in dist', scanFailed && caught);
  } finally {
    if (fs.existsSync(injectedFile)) {
      fs.unlinkSync(injectedFile);
    }
  }

  console.log('\n============================================================');
  console.log('  DEPLOY SAFETY & RELEASE VERIFICATION SUITE: ALL TESTS PASSED');
  console.log('============================================================\n');
}

if (require.main === module) {
  runDeploySafetySuite().catch(err => {
    console.error(`Deploy safety suite failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { runDeploySafetySuite };
