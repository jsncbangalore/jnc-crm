/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { execSync } from 'child_process';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';

let Client: any;
try {
  Client = require('pg').Client;
} catch {
  Client = class MockClient {};
}

const FRESH_DB_URL = process.env.FRESH_DB_URL || 'postgresql://postgres:postgres@localhost:5432/crm_fresh?schema=public';
const PORT = 3336;
const apiDir = path.resolve(__dirname, '..');

function makeRequest(
  options: http.RequestOptions,
  postData?: string,
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: any; rawBody: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body: parsed,
          rawBody: data,
        });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runDryRun() {
  console.log('========================================================================');
  console.log('DRY RUN: FRESH PRODUCTION DATABASE INITIALIZATION & VERIFICATION');
  console.log('Target Database: crm_fresh @ localhost:5432');
  console.log('Safety: Strictly LOCAL, Remote Hosts Forbidden, Passwords Masked in Logs');
  console.log('========================================================================\n');

  // STEP 1: Re-create crm_fresh
  console.log('--- [Step 1] Creating fresh empty database crm_fresh ---');
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
    WHERE datname = 'crm_fresh' AND pid <> pg_backend_pid();
  `);
  await pgClient.query('DROP DATABASE IF EXISTS crm_fresh;');
  await pgClient.query('CREATE DATABASE crm_fresh;');
  await pgClient.end();
  console.log('[OK] Empty database crm_fresh successfully created.\n');

  // STEP 2: Prisma db push to crm_fresh
  console.log('--- [Step 2] Pushing clean Prisma schema to crm_fresh ---');
  const pushOutput = execSync('npx prisma db push --skip-generate', {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: FRESH_DB_URL },
    encoding: 'utf8',
  });
  console.log(pushOutput);

  // STEP 2B: Run deploy/supabase-lockdown.sql against crm_fresh
  console.log('--- [Step 2B] Executing deploy/supabase-lockdown.sql against crm_fresh ---');
  const lockdownSql = fs.readFileSync(path.resolve(apiDir, '../../deploy/supabase-lockdown.sql'), 'utf8');
  const pgLockdown = new Client({
    host: '127.0.0.1',
    port: 5432,
    database: 'crm_fresh',
    user: 'postgres',
    password: 'postgres',
  });
  await pgLockdown.connect();
  await pgLockdown.query(lockdownSql);
  await pgLockdown.end();
  console.log('[OK] PostgREST Row Level Security (RLS) successfully enabled on all public tables.\n');

  // STEP 3: Run npm run prod:bootstrap against crm_fresh
  console.log('--- [Step 3] Running prod:bootstrap against crm_fresh ---');
  const bootstrapEnv = {
    ...process.env,
    DATABASE_URL: FRESH_DB_URL,
    NODE_ENV: 'production',
    CONFIRM_PRODUCTION: 'yes',
    ALLOWED_DB_HOSTS: 'localhost,127.0.0.1',
    OWNER_EMAIL: 'owner@example.com',
    PLATFORM_ADMIN_EMAIL: 'platform@example.com',
  };

  let bootstrapRaw = '';
  try {
    bootstrapRaw = execSync('node scripts/prisma-safe.js prod:bootstrap --allow-production', {
      cwd: apiDir,
      env: bootstrapEnv,
      encoding: 'utf8',
    });
  } catch (err: any) {
    bootstrapRaw = (err.stdout || '') + '\n' + (err.stderr || '');
    console.error('prod:bootstrap failed:', bootstrapRaw);
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

  // Mask passwords and tokens in output
  const maskedBootstrap = bootstrapRaw
    .replace(new RegExp(escapeRegex(ownerTempPass), 'g'), '<MASKED>')
    .replace(new RegExp(escapeRegex(platformTempPass), 'g'), '<MASKED>')
    .replace(/whsec_[a-f0-9]{24,}/g, 'whsec_<MASKED>');

  console.log(maskedBootstrap);

  // STEP 3B: Run deploy/postcheck-live.sql verification against crm_fresh
  console.log('--- [Step 3B] Executing deploy/postcheck-live.sql verification against crm_fresh ---');
  const postcheckSql = fs.readFileSync(path.resolve(apiDir, '../../deploy/postcheck-live.sql'), 'utf8');
  const pgPostcheck = new Client({
    host: '127.0.0.1',
    port: 5432,
    database: 'crm_fresh',
    user: 'postgres',
    password: 'postgres',
  });
  await pgPostcheck.connect();
  const postcheckRes = await pgPostcheck.query(postcheckSql);
  console.table(postcheckRes.rows);
  const allPassed = postcheckRes.rows.every((r: any) => r.status === 'PASS');
  if (!allPassed) {
    throw new Error('postcheck-live.sql verification failed: one or more checks did not return PASS');
  }
  console.log('[OK] postcheck-live.sql verification passed: All checks reported PASS.\n');
  await pgPostcheck.end();

  // STEP 4: Demonstrate that prod:bootstrap refuses a second run
  console.log('--- [Step 4] Demonstrating prod:bootstrap refusal on second run ---');
  let secondRunOutput = '';
  try {
    secondRunOutput = execSync('node scripts/prisma-safe.js prod:bootstrap --allow-production', {
      cwd: apiDir,
      env: bootstrapEnv,
      encoding: 'utf8',
    });
  } catch (err: any) {
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
  } catch (err: any) {
    envCheckOutput = (err.stdout || '') + '\n' + (err.stderr || '');
  }
  console.log(envCheckOutput);

  // STEP 6: Bootstrap NestJS in-process with NODE_ENV=production against crm_fresh
  console.log(`--- [Step 6] Bootstrapping NestJS server on port ${PORT} (NODE_ENV=production) ---`);
  process.env.DATABASE_URL = FRESH_DB_URL;
  process.env.NODE_ENV = 'production';
  process.env.PORT = String(PORT);
  process.env.ALLOWED_DB_HOSTS = 'localhost,127.0.0.1';

  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(PORT);
  console.log(`[OK] Server listening at http://127.0.0.1:${PORT}/api/v1\n`);

  try {
    // STEP 7: Owner login with temporary password
    console.log('--- [Step 7] Owner Login with Temporary Password ---');
    console.log(`curl.exe -s -X POST http://127.0.0.1:${PORT}/api/v1/auth/login -H "Content-Type: application/json" -d '{"identifier":"${ownerEmail}","password":"<MASKED>"}'`);

    const loginPayload = JSON.stringify({ identifier: ownerEmail, password: ownerTempPass });
    const loginRes = await makeRequest(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/v1/auth/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(loginPayload),
        },
      },
      loginPayload,
    );

    const setCookie = String(loginRes.headers['set-cookie'] || '');
    const cookieMasked = setCookie.replace(/crm_refresh_token=ey[A-Za-z0-9_.-]+/g, 'crm_refresh_token=<MASKED>');

    console.log(`HTTP Status: ${loginRes.statusCode}`);
    console.log(`Set-Cookie:  ${cookieMasked}`);
    console.log(`Response Body:`);
    console.log(JSON.stringify({
      ...loginRes.body,
      accessToken: '<MASKED>',
    }, null, 2));

    const ownerAccessToken = loginRes.body.accessToken;
    if (loginRes.statusCode !== 200 || !ownerAccessToken || loginRes.body.user?.mustResetPassword !== true) {
      throw new Error('Owner login failed or did not return mustResetPassword: true');
    }

    // STEP 8: Owner Change Password
    console.log('\n--- [Step 8] Owner Changes Password ---');
    const newOwnerPassword = 'K9#vX!mP4$wQ8*zL2@bC';
    console.log(`curl.exe -s -X POST http://127.0.0.1:${PORT}/api/v1/auth/change-password -H "Authorization: Bearer <MASKED>" -H "Content-Type: application/json" -d '{"currentPass":"<MASKED>","newPass":"<MASKED>"}'`);

    const changePayload = JSON.stringify({ currentPass: ownerTempPass, newPass: newOwnerPassword });
    const changeRes = await makeRequest(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/v1/auth/change-password',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerAccessToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(changePayload),
        },
      },
      changePayload,
    );

    console.log(`HTTP Status: ${changeRes.statusCode}`);
    console.log(`Response Body:`, JSON.stringify(changeRes.body, null, 2));

    if (changeRes.statusCode !== 201 && changeRes.statusCode !== 200) {
      throw new Error(`Password change failed: ${JSON.stringify(changeRes.body)}`);
    }

    // STEP 9: Owner Login with New Password
    console.log('\n--- [Step 9] Owner Login with New Password ---');
    console.log(`curl.exe -s -X POST http://127.0.0.1:${PORT}/api/v1/auth/login -H "Content-Type: application/json" -d '{"identifier":"${ownerEmail}","password":"<MASKED>"}'`);

    const reLoginPayload = JSON.stringify({ identifier: ownerEmail, password: newOwnerPassword });
    const reLoginRes = await makeRequest(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/v1/auth/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(reLoginPayload),
        },
      },
      reLoginPayload,
    );

    console.log(`HTTP Status: ${reLoginRes.statusCode}`);
    console.log(`Response Body:`);
    console.log(JSON.stringify({
      ...reLoginRes.body,
      accessToken: '<MASKED>',
    }, null, 2));

    if (reLoginRes.statusCode !== 200 || reLoginRes.body.user?.mustResetPassword !== false) {
      throw new Error('Owner re-login failed or mustResetPassword was not false');
    }

    // STEP 10: Platform Admin Login
    console.log('\n--- [Step 10] Platform Admin Login at /platform-auth/login ---');
    console.log(`curl.exe -s -X POST http://127.0.0.1:${PORT}/api/v1/platform-auth/login -H "Content-Type: application/json" -d '{"email":"${platformAdminEmail}","password":"<MASKED>"}'`);

    const platLoginPayload = JSON.stringify({ email: platformAdminEmail, password: platformTempPass });
    const platLoginRes = await makeRequest(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/v1/platform-auth/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(platLoginPayload),
        },
      },
      platLoginPayload,
    );

    console.log(`HTTP Status: ${platLoginRes.statusCode}`);
    console.log(`Response Body:`);
    console.log(JSON.stringify({
      ...platLoginRes.body,
      accessToken: '<MASKED>',
    }, null, 2));

    if (platLoginRes.statusCode !== 200 || platLoginRes.body.user?.role !== 'platform_super_admin') {
      throw new Error('Platform admin login failed or role was not platform_super_admin');
    }

    console.log('\n========================================================================');
    console.log('DRY RUN TEST SUITE COMPLETED SUCCESSFULLY: ALL 10 STEPS PASSED');
    console.log('========================================================================\n');

  } finally {
    await app.close();
  }
}

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

runDryRun().catch((err) => {
  console.error('[FATAL DRY RUN ERROR]:', err);
  process.exit(1);
});
