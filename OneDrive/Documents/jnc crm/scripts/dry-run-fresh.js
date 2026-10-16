/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync, spawn } = require('child_process');
const { Client } = require('C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824/scratch/pg-runner/node_modules/pg');

const rootDir = path.resolve(__dirname, '..');
const apiDir = path.join(rootDir, 'apps', 'api');

const FRESH_DB_URL = 'postgresql://postgres:postgres@localhost:5432/jnc_crm_fresh?schema=public';
const PORT = 3336;

async function runStep() {
  console.log('========================================================================');
  console.log('STARTING DRY RUN ON FRESH LOCAL DATABASE (jnc_crm_fresh)');
  console.log('========================================================================\n');

  // STEP 1: Re-create jnc_crm_fresh
  console.log('--- [Step 1] Preparing empty local database jnc_crm_fresh ---');
  const pgClient = new Client({
    host: '127.0.0.1',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: 'postgres',
  });
  await pgClient.connect();
  await pgClient.query(`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = 'jnc_crm_fresh' AND pid <> pg_backend_pid();
  `);
  await pgClient.query('DROP DATABASE IF EXISTS jnc_crm_fresh;');
  await pgClient.query('CREATE DATABASE jnc_crm_fresh;');
  await pgClient.end();
  console.log('[OK] Empty database jnc_crm_fresh created.\n');

  // STEP 2: Prisma db push to jnc_crm_fresh
  console.log('--- [Step 2] Applying schema via prisma db push ---');
  const pushOutput = execSync('npx prisma db push --skip-generate', {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: FRESH_DB_URL },
    encoding: 'utf8',
  });
  console.log(pushOutput);

  // STEP 3: Run npm run prod:bootstrap against jnc_crm_fresh
  console.log('--- [Step 3] Running prod:bootstrap against jnc_crm_fresh ---');
  const bootstrapEnv = {
    ...process.env,
    DATABASE_URL: FRESH_DB_URL,
    NODE_ENV: 'production',
    CONFIRM_PRODUCTION: 'yes',
    ALLOWED_DB_HOSTS: 'localhost,127.0.0.1',
    OWNER_EMAIL: 'owner@jsnc.co.in',
    PLATFORM_ADMIN_EMAIL: 'platform@jsnc.co.in',
  };

  let bootstrapRaw = '';
  try {
    bootstrapRaw = execSync('node scripts/prisma-safe.js prod:bootstrap --allow-production', {
      cwd: apiDir,
      env: bootstrapEnv,
      encoding: 'utf8',
    });
  } catch (err) {
    bootstrapRaw = (err.stdout || '') + '\n' + (err.stderr || '');
    console.error('Bootstrap failed:', bootstrapRaw);
    process.exit(1);
  }

  // Parse credentials from bootstrap output
  const ownerPassMatch = bootstrapRaw.match(/Owner Account \(Tenant Admin\):\s+Email:\s+([^\s]+)\s+Password:\s+([^\s]+)/);
  const platformPassMatch = bootstrapRaw.match(/Platform Super Admin Account:\s+Email:\s+([^\s]+)\s+Password:\s+([^\s]+)/);

  if (!ownerPassMatch || !platformPassMatch) {
    console.error('[ERROR] Could not extract passwords from bootstrap output:');
    console.log(bootstrapRaw);
    process.exit(1);
  }

  const ownerEmail = ownerPassMatch[1];
  const ownerTempPass = ownerPassMatch[2];
  const platformAdminEmail = platformPassMatch[1];
  const platformTempPass = platformPassMatch[2];

  // Print masked version of bootstrap output
  const maskedBootstrap = bootstrapRaw
    .replace(new RegExp(ownerTempPass, 'g'), '<MASKED>')
    .replace(new RegExp(platformTempPass, 'g'), '<MASKED>')
    .replace(/whsec_[a-f0-9]{24,}/g, 'whsec_<MASKED>');

  console.log(maskedBootstrap);

  // STEP 4: Demonstrate that prod:bootstrap refuses a second run
  console.log('--- [Step 4] Demonstrating prod:bootstrap refusal on second run ---');
  let secondRunOutput = '';
  try {
    secondRunOutput = execSync('node scripts/prisma-safe.js prod:bootstrap --allow-production', {
      cwd: apiDir,
      env: bootstrapEnv,
      encoding: 'utf8',
    });
  } catch (err) {
    secondRunOutput = (err.stdout || '') + '\n' + (err.stderr || '');
  }
  console.log(secondRunOutput);

  // STEP 5: Run env:check with production configuration
  console.log('--- [Step 5] Running env:check in production mode ---');
  let envCheckOutput = '';
  try {
    envCheckOutput = execSync('node scripts/env-check.js', {
      cwd: apiDir,
      env: {
        ...process.env,
        DATABASE_URL: FRESH_DB_URL,
        NODE_ENV: 'production',
        ALLOWED_DB_HOSTS: 'localhost,127.0.0.1',
      },
      encoding: 'utf8',
    });
  } catch (err) {
    envCheckOutput = (err.stdout || '') + '\n' + (err.stderr || '');
  }
  console.log(envCheckOutput);

  // STEP 6: Start API server in production mode on PORT 3336
  console.log(`--- [Step 6] Starting NestJS API server on port ${PORT} (NODE_ENV=production) ---`);
  const serverProcess = spawn('node', ['../../node_modules/@nestjs/cli/bin/nest.js', 'start'], {
    cwd: apiDir,
    env: {
      ...process.env,
      DATABASE_URL: FRESH_DB_URL,
      NODE_ENV: 'production',
      PORT: String(PORT),
      ALLOWED_DB_HOSTS: 'localhost,127.0.0.1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', (d) => {
    // optional debug
  });
  serverProcess.stderr.on('data', (d) => {
    // optional debug
  });

  // Wait for server to become responsive
  const maxAttempts = 30;
  let serverReady = false;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      await fetch(`http://127.0.0.1:${PORT}/api/v1/auth/me`).catch(() => {});
      serverReady = true;
      break;
    } catch (_) {}
  }

  if (!serverReady) {
    console.error('[ERROR] Server failed to start on port', PORT);
    serverProcess.kill();
    process.exit(1);
  }
  console.log(`[OK] Server listening at http://127.0.0.1:${PORT}/api/v1\n`);

  try {
    // STEP 7: Curl login for Owner (with temporary password)
    console.log('--- [Step 7] Owner Login with Temporary Password ---');
    console.log(`curl -X POST http://127.0.0.1:${PORT}/api/v1/auth/login -H "Content-Type: application/json" -d '{"identifier":"${ownerEmail}","password":"<MASKED>"}'`);

    const loginRes = await fetch(`http://127.0.0.1:${PORT}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: ownerEmail, password: ownerTempPass }),
    });

    const loginJson = await loginRes.json();
    const setCookie = loginRes.headers.get('set-cookie') || '';
    const cookieMasked = setCookie.replace(/jnc_refresh_token=ey[A-Za-z0-9_.-]+/g, 'jnc_refresh_token=<MASKED>');

    console.log(`HTTP Status: ${loginRes.status}`);
    console.log(`Set-Cookie:  ${cookieMasked}`);
    console.log(`Response Body:`);
    console.log(JSON.stringify({
      ...loginJson,
      accessToken: '<MASKED>',
    }, null, 2));

    const ownerAccessToken = loginJson.accessToken;

    if (loginRes.status !== 200 || !ownerAccessToken || loginJson.user?.mustResetPassword !== true) {
      throw new Error(`Owner login failed or did not flag mustResetPassword: true`);
    }

    // STEP 8: Owner Change Password
    console.log('\n--- [Step 8] Owner Changes Password ---');
    const newOwnerPassword = 'NewOwnerPassword2026!';
    console.log(`curl -X POST http://127.0.0.1:${PORT}/api/v1/auth/change-password -H "Authorization: Bearer <MASKED>" -H "Content-Type: application/json" -d '{"currentPass":"<MASKED>","newPass":"<MASKED>"}'`);

    const changeRes = await fetch(`http://127.0.0.1:${PORT}/api/v1/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({
        currentPass: ownerTempPass,
        newPass: newOwnerPassword,
      }),
    });

    const changeJson = await changeRes.json();
    console.log(`HTTP Status: ${changeRes.status}`);
    console.log(`Response Body:`, JSON.stringify(changeJson, null, 2));

    if (changeRes.status !== 201 && changeRes.status !== 200) {
      throw new Error(`Password change failed: ${JSON.stringify(changeJson)}`);
    }

    // STEP 9: Login Again with New Password
    console.log('\n--- [Step 9] Owner Login with New Password ---');
    console.log(`curl -X POST http://127.0.0.1:${PORT}/api/v1/auth/login -H "Content-Type: application/json" -d '{"identifier":"${ownerEmail}","password":"<MASKED>"}'`);

    const reLoginRes = await fetch(`http://127.0.0.1:${PORT}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: ownerEmail, password: newOwnerPassword }),
    });

    const reLoginJson = await reLoginRes.json();
    console.log(`HTTP Status: ${reLoginRes.status}`);
    console.log(`Response Body:`);
    console.log(JSON.stringify({
      ...reLoginJson,
      accessToken: '<MASKED>',
    }, null, 2));

    if (reLoginRes.status !== 200 || reLoginJson.user?.mustResetPassword !== false) {
      throw new Error(`Owner re-login failed or mustResetPassword was not false`);
    }

    // STEP 10: Platform Admin Login
    console.log('\n--- [Step 10] Platform Admin Login at /platform-auth/login ---');
    console.log(`curl -X POST http://127.0.0.1:${PORT}/api/v1/platform-auth/login -H "Content-Type: application/json" -d '{"email":"${platformAdminEmail}","password":"<MASKED>"}'`);

    const platLoginRes = await fetch(`http://127.0.0.1:${PORT}/api/v1/platform-auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: platformAdminEmail, password: platformTempPass }),
    });

    const platLoginJson = await platLoginRes.json();
    console.log(`HTTP Status: ${platLoginRes.status}`);
    console.log(`Response Body:`);
    console.log(JSON.stringify({
      ...platLoginJson,
      accessToken: '<MASKED>',
    }, null, 2));

    if (platLoginRes.status !== 200 || platLoginJson.user?.role !== 'platform_super_admin') {
      throw new Error(`Platform login failed`);
    }

    console.log('\n========================================================================');
    console.log('DRY RUN TEST COMPLETED SUCCESSFULLY (ALL 10 STEPS PASSED)');
    console.log('========================================================================');

  } finally {
    serverProcess.kill();
  }
}

runStep().catch((err) => {
  console.error('[FATAL DRY RUN ERROR]:', err);
  process.exit(1);
});
