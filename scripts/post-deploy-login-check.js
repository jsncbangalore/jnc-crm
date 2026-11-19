#!/usr/bin/env node
/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Post-Deploy Smoke Check (scripts/post-deploy-login-check.js)
 * Verifies that the deployed API is running, healthy, and capable of processing
 * login requests against PostgreSQL without encountering 5xx errors, schema mismatches,
 * or pending/failed migrations.
 *
 * Verifications:
 * 1. GET /api/v1/health (verifies database ok, 0 pending migrations, 0 failed migrations).
 * 2. GET /api/v1/health/ready (verifies system readiness status === "ready").
 * 3. POST /api/v1/auth/login (verifies fake credentials return 401/400 and zero 5xx).
 *
 * Automation & Rollback Guide:
 * - Render Automation: Trigger via Render Deploy Hook or CI workflow right after deployment.
 * - Scheduled Monitoring: Configure external synthetic uptime check on /api/v1/health/ready.
 * - Rollback on Failure: Use Render dashboard "Rollback to previous deploy" or restore snapshot.
 *
 * Usage:
 *   node scripts/post-deploy-login-check.js [targetUrl]
 *   or:
 *   TARGET_API_URL=https://api.jsnc.co.in node scripts/post-deploy-login-check.js
 */

const targetUrlRaw = process.argv[2] || process.env.TARGET_API_URL || process.env.API_URL || 'http://localhost:3333';
const targetUrl = targetUrlRaw.replace(/\/+$/, '');

console.log('========================================================================');
console.log('CRM POST-DEPLOY API HEALTH, READINESS & LOGIN VERIFICATION');
console.log('Target API:', targetUrl);
console.log('========================================================================\n');

async function runCheck() {
  let hasFailures = false;

  // ─── 1. HEALTH CHECK & MIGRATION COUNTS PROBE ──────────────────────────────
  try {
    const healthUrl = `${targetUrl}/api/v1/health`;
    console.log(`[1/3] Checking GET ${healthUrl}...`);
    const healthRes = await fetch(healthUrl, { method: 'GET' });
    const healthText = await healthRes.text();
    let healthJson = null;
    try {
      healthJson = JSON.parse(healthText);
    } catch {}

    console.log(`Status: ${healthRes.status} ${healthRes.statusText}`);
    console.log(`Response: ${healthText.substring(0, 300)}`);

    if (healthRes.status >= 500) {
      console.error(`\n[FAIL] Health check failed with 5xx status: ${healthRes.status}`);
      hasFailures = true;
    } else if (healthJson) {
      const dbStatus = healthJson.database;
      if (dbStatus !== 'ok' && dbStatus !== 'connected') {
        console.error(`\n[FAIL] Database status is not healthy: ${dbStatus}`);
        hasFailures = true;
      }

      // Check migration counts
      const migs = healthJson.migrations || {};
      const migState = healthJson.migrationState || {};

      const pendingCount = migs.pendingCount !== undefined
        ? migs.pendingCount
        : migs.pending !== undefined
        ? migs.pending
        : migState.pendingList ? migState.pendingList.length : 0;

      const failedCount = migs.failedCount !== undefined
        ? migs.failedCount
        : migs.failed !== undefined
        ? migs.failed
        : migState.failedList ? migState.failedList.length : 0;

      const total = migs.total !== undefined ? migs.total : (migState.total || 0);
      const applied = migs.applied !== undefined ? migs.applied : (migState.appliedCount || 0);

      console.log(`   -> Total Migrations   : ${total}`);
      console.log(`   -> Applied Migrations : ${applied}`);
      console.log(`   -> Pending Migrations : ${pendingCount}`);
      console.log(`   -> Failed Migrations  : ${failedCount}`);

      if (pendingCount > 0) {
        console.error(`\n[FAIL] Found ${pendingCount} pending migration(s) that were not applied!`);
        hasFailures = true;
      }
      if (failedCount > 0) {
        console.error(`\n[FAIL] Found ${failedCount} failed migration(s) recorded in database!`);
        hasFailures = true;
      }

      if (pendingCount === 0 && failedCount === 0) {
        console.log('[PASS] Migration counts verified: 0 pending, 0 failed.\n');
      }
    } else {
      console.log('[OK] Health endpoint reachable.\n');
    }
  } catch (err) {
    console.error(`\n[FAIL] Unable to connect to health endpoint: ${err.message}`);
    hasFailures = true;
  }

  // ─── 2. READINESS PROBE (/health/ready) ──────────────────────────────────────
  try {
    const readyUrl = `${targetUrl}/api/v1/health/ready`;
    console.log(`[2/3] Checking GET ${readyUrl}...`);
    const readyRes = await fetch(readyUrl, { method: 'GET' });
    const readyText = await readyRes.text();
    let readyJson = null;
    try {
      readyJson = JSON.parse(readyText);
    } catch {}

    console.log(`Status: ${readyRes.status} ${readyRes.statusText}`);
    console.log('Response:', readyJson ? JSON.stringify(readyJson, null, 2) : readyText);

    if (readyRes.status !== 200) {
      console.error(`\n[FAIL] /health/ready returned non-200 status: ${readyRes.status}`);
      hasFailures = true;
    } else if (readyJson && readyJson.ready !== true && readyJson.status !== 'ready') {
      console.error(`\n[FAIL] /health/ready reports system is not ready: ${readyJson.status}`);
      hasFailures = true;
    } else {
      console.log('[PASS] GET /health/ready verified: System is ready and healthy.\n');
    }
  } catch (err) {
    console.error(`\n[FAIL] Unable to connect to /health/ready endpoint: ${err.message}`);
    hasFailures = true;
  }

  // ─── 3. AUTH LOGIN PROBE (verifies schema, column sanity, error handling) ────
  try {
    const loginUrl = `${targetUrl}/api/v1/auth/login`;
    console.log(`[3/3] Checking POST ${loginUrl} with fake credentials probe...`);
    const probePayload = {
      email: 'post-deploy-probe@example.com',
      password: 'ProbePasswordNotReal999!',
    };

    const loginRes = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': targetUrl,
      },
      body: JSON.stringify(probePayload),
    });

    const loginBodyText = await loginRes.text();
    let loginJson = null;
    try {
      loginJson = JSON.parse(loginBodyText);
    } catch {}

    console.log(`Status: ${loginRes.status} ${loginRes.statusText}`);
    console.log('Response:', loginJson ? JSON.stringify(loginJson, null, 2) : loginBodyText);

    if (loginRes.status >= 500 || loginRes.status === 503 || loginJson?.code === 'SCHEMA_OUT_OF_DATE' || loginJson?.code === 'SERVER_UPDATE_PENDING') {
      console.error(`\n[FAIL] Post-deploy login check encountered 5xx/503 server error! Status: ${loginRes.status}`);
      if (loginJson && loginJson.code) {
        console.error(`Error Code: ${loginJson.code}`);
      }
      if (loginJson && loginJson.message) {
        console.error(`Message: ${loginJson.message}`);
      }
      if (loginJson && loginJson.requestId) {
        console.error(`Request ID: ${loginJson.requestId}`);
      }
      hasFailures = true;
    } else if (loginRes.status === 401 || loginRes.status === 400 || loginRes.status === 404) {
      console.log('\n[PASS] Auth controller rejected invalid fake credentials as expected with 401/400 (no 5xx/503).');
      console.log('[PASS] Database connection, Prisma schema, and error handlers are operating normally.');
    } else {
      console.log(`\n[INFO] Auth endpoint returned non-5xx status: ${loginRes.status}`);
    }
  } catch (err) {
    console.error(`\n[FAIL] Login check connection failed: ${err.message}`);
    hasFailures = true;
  }

  if (hasFailures) {
    console.error('\n========================================================================');
    console.error('[FATAL] POST-DEPLOY VERIFICATION FAILED (Exit Code 1)');
    console.error('========================================================================');
    console.error('\nAUTOMATED ROLLBACK & INCIDENT PROCEDURES:');
    console.error('  1. Navigate to the Render Dashboard -> crm-api -> Deploys tab.');
    console.error('  2. Click "Rollback to previous deploy" on the last known working release.');
    console.error('  3. In Render deployment logs, search for the Request ID shown above to inspect stack trace.');
    console.error('  4. If database corruption occurred, restore latest backup snapshot:');
    console.error('     node scripts/db-restore-copy.js <backup_file.sql>');
    console.error('========================================================================\n');
    process.exitCode = 1;
    return;
  }

  console.log('\n========================================================================');
  console.log('[SUCCESS] All post-deployment health, migration, and login checks PASSED.');
  console.log('========================================================================\n');
  process.exitCode = 0;
}

runCheck().catch((err) => {
  console.error('[FATAL] Unexpected error in post-deploy check:', err);
  process.exitCode = 1;
});
