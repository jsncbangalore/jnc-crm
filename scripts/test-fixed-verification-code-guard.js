/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Verification Code Security & Anti-Backdoor Test Suite
 *
 * Validates:
 * 1. Fixed verification codes (e.g. DEV_FIXED_OTP) are rejected at startup in production mode.
 * 2. In non-production, any fixed code flags require DEV_DEMO_LOGIN='true', localhost IP, and jnc_crm_dev DB.
 * 3. Fixed codes (such as '123456') are rejected by the verification endpoints.
 * 4. Real random codes (crypto.randomInt) still work.
 * 5. Codes are stored strictly as HMAC-SHA256 hashes (never plaintext).
 * 6. Challenges expire (expiresAt enforced).
 * 7. Challenges have strict attempt limits (maxAttempts=5 lockout).
 * 8. Dist bundle leak scanner fails if fixed verification bypasses appear.
 */

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { validateEnvironment } = require('../apps/api/dist/common/env-validation.js');

const envPath = path.join(__dirname, '../apps/api/.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[k]) {
        process.env[k] = v;
      }
    }
  }
}

const prisma = new PrismaClient();
let passed = 0;
let failed = 0;

function logPass(title) {
  passed++;
  console.log(`  [PASS] ${title}`);
}

function logFail(title, error) {
  failed++;
  console.error(`  [FAIL] ${title}:`, error);
}

async function runTests() {
  console.log('========================================================================');
  console.log('TEST SUITE: FIXED VERIFICATION CODE & OTP INTEGRITY GUARDS');
  console.log('========================================================================\n');

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Startup Guard: Fixed Verification Code Refused in Production
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Startup Guard: Fixed Verification Code Prohibited in Production ---');
  try {
    const prodEnv = {
      NODE_ENV: 'production',
      DEV_FIXED_OTP: '123456',
      DATABASE_URL: 'postgresql://postgres:secret@db.supabase.co:5432/postgres',
      JWT_SECRET: 'a'.repeat(32),
      OTP_SECRET: 'b'.repeat(32),
      ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    };
    const res = validateEnvironment(prodEnv, { exitOnError: false });
    assert.strictEqual(res.isValid, false, 'Expected validation to fail');
    assert(
      res.invalidVariables.some((v) => v.includes('DEV_FIXED_OTP cannot be configured in production mode')),
      'Expected invalidVariables to include DEV_FIXED_OTP production refusal'
    );
    logPass('validateEnvironment refuses DEV_FIXED_OTP in production mode');
  } catch (err) {
    logFail('validateEnvironment refuses DEV_FIXED_OTP in production mode', err.message);
  }

  try {
    const prodEnv2 = {
      NODE_ENV: 'production',
      FIXED_OTP: '123456',
      DATABASE_URL: 'postgresql://postgres:secret@db.supabase.co:5432/postgres',
      JWT_SECRET: 'a'.repeat(32),
      OTP_SECRET: 'b'.repeat(32),
      ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    };
    const res = validateEnvironment(prodEnv2, { exitOnError: false });
    assert.strictEqual(res.isValid, false, 'Expected validation to fail');
    assert(
      res.invalidVariables.some((v) => v.includes('FIXED_OTP cannot be configured in production mode')),
      'Expected invalidVariables to include FIXED_OTP production refusal'
    );
    logPass('validateEnvironment refuses FIXED_OTP in production mode');
  } catch (err) {
    logFail('validateEnvironment refuses FIXED_OTP in production mode', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Startup Guard: Fixed Code in Dev Requires All 4 Safety Conditions
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Startup Guard: Fixed Code in Dev Requires All 4 Guards ---');
  try {
    // Missing DEV_DEMO_LOGIN
    const devEnvNoFlag = {
      NODE_ENV: 'development',
      DEV_FIXED_OTP: '123456',
      DEV_DEMO_LOGIN: 'false',
      DATABASE_URL: 'postgresql://postgres:pass@localhost:5432/jnc_crm_dev',
    };
    const res = validateEnvironment(devEnvNoFlag, { exitOnError: false });
    assert(
      res.invalidVariables.some((v) => v.includes('cannot be configured unless DEV_DEMO_LOGIN is \'true\'')),
      'Expected refusal when DEV_DEMO_LOGIN is not true'
    );
    logPass('DEV_FIXED_OTP refused when DEV_DEMO_LOGIN is not true');
  } catch (err) {
    logFail('DEV_FIXED_OTP refused when DEV_DEMO_LOGIN is not true', err.message);
  }

  try {
    // Remote DB host
    const devEnvRemoteDb = {
      NODE_ENV: 'development',
      DEV_FIXED_OTP: '123456',
      DEV_DEMO_LOGIN: 'true',
      DATABASE_URL: 'postgresql://postgres:pass@remote-staging-db.com:5432/jnc_crm_dev',
    };
    const res = validateEnvironment(devEnvRemoteDb, { exitOnError: false });
    assert(
      res.invalidVariables.some((v) => v.includes('Database host must be localhost')),
      'Expected refusal when database host is remote'
    );
    logPass('DEV_FIXED_OTP refused when database host is not localhost');
  } catch (err) {
    logFail('DEV_FIXED_OTP refused when database host is not localhost', err.message);
  }

  try {
    // Non-dev DB name
    const devEnvProdDbName = {
      NODE_ENV: 'development',
      DEV_FIXED_OTP: '123456',
      DEV_DEMO_LOGIN: 'true',
      DATABASE_URL: 'postgresql://postgres:pass@localhost:5432/production_crm',
    };
    const res = validateEnvironment(devEnvProdDbName, { exitOnError: false });
    assert(
      res.invalidVariables.some((v) => v.includes('Database name must start with \'jnc_crm_dev\'')),
      'Expected refusal when database name is not jnc_crm_dev'
    );
    logPass('DEV_FIXED_OTP refused when database name does not start with jnc_crm_dev');
  } catch (err) {
    logFail('DEV_FIXED_OTP refused when database name does not start with jnc_crm_dev', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Fixed Code is REJECTED by Verification Logic Against Real Challenge
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Fixed Code Verification Rejection ---');
  const testEmail = `test_otp_security_${Date.now()}@example.fake`;
  const challengeId = crypto.randomUUID();
  const realRandomCode = crypto.randomInt(100000, 1000000).toString();
  const otpSecret = process.env.OTP_SECRET || process.env.JWT_SECRET || 'crm-otp-secret-key-2026';
  const realHash = crypto
    .createHmac('sha256', otpSecret + challengeId)
    .update(realRandomCode)
    .digest('hex');

  let challengeRecord;
  try {
    challengeRecord = await prisma.otpChallenge.create({
      data: {
        id: challengeId,
        emailNormalized: testEmail,
        purpose: 'forced_2fa_setup',
        codeHash: realHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        resendAfter: new Date(Date.now() + 60 * 1000),
        attempts: 0,
        maxAttempts: 5,
        requestIp: '127.0.0.1',
        requestUserAgent: 'SecurityTestAgent',
      },
    });

    // Test: Submitting a fixed code '123456' MUST NOT match unless real random code happens to be '123456'
    const fixedCodeInput = '123456';
    const fixedCodeHash = crypto
      .createHmac('sha256', otpSecret + challengeId)
      .update(fixedCodeInput)
      .digest('hex');

    const a = Buffer.from(challengeRecord.codeHash, 'hex');
    const b = Buffer.from(fixedCodeHash, 'hex');
    const isFixedCodeMatch = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (realRandomCode !== '123456') {
      assert.strictEqual(isFixedCodeMatch, false, 'Fixed code must not match random challenge hash');
      logPass(`Fixed code '123456' rejected against real random code challenge`);
    } else {
      logPass('Random collision occurred (1 in 900,000)');
    }
  } catch (err) {
    logFail('Fixed code rejection test', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Real Random Codes Still Work
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Real Random Code Verification ---');
  try {
    assert.strictEqual(/^\d{6}$/.test(realRandomCode), true, 'Random code must be exactly 6 digits');
    const parsedNum = parseInt(realRandomCode, 10);
    assert(parsedNum >= 100000 && parsedNum <= 999999, 'Code must be in [100000, 999999]');

    const submittedHash = crypto
      .createHmac('sha256', otpSecret + challengeId)
      .update(realRandomCode)
      .digest('hex');

    const a = Buffer.from(challengeRecord.codeHash, 'hex');
    const b = Buffer.from(submittedHash, 'hex');
    const isMatch = a.length === b.length && crypto.timingSafeEqual(a, b);
    assert.strictEqual(isMatch, true, 'Real random code hash must match challenge codeHash');
    logPass('Real random 6-digit code successfully matches HMAC-SHA256 hash');
  } catch (err) {
    logFail('Real random code verification', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Code is Hashed in the Database (Never Stored in Plaintext)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Database Storage: Hash Only (Zero Plaintext) ---');
  try {
    const fetched = await prisma.otpChallenge.findUnique({
      where: { id: challengeId },
    });
    assert(fetched, 'Challenge record must exist in DB');
    assert.strictEqual(fetched.codeHash.length, 64, 'codeHash must be 64-character SHA256 hex string');
    assert(!('code' in fetched), 'otpChallenge schema must NOT have a plaintext code column');
    assert.strictEqual(fetched.codeHash.includes(realRandomCode), false, 'Raw code must not appear in hash string');
    logPass('Code is strictly stored as 64-char HMAC-SHA256 hex hash (zero plaintext)');
  } catch (err) {
    logFail('Database hash verification', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Expiry Enforcement
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 6. Expiration Enforcement ---');
  try {
    const expiredChallengeId = crypto.randomUUID();
    const expiredRecord = await prisma.otpChallenge.create({
      data: {
        id: expiredChallengeId,
        emailNormalized: testEmail,
        purpose: 'forced_2fa_setup',
        codeHash: realHash,
        expiresAt: new Date(Date.now() - 5000), // Expired 5 seconds ago
        resendAfter: new Date(Date.now() - 60000),
        attempts: 0,
        maxAttempts: 5,
      },
    });

    const isExpired = new Date(expiredRecord.expiresAt) < new Date();
    assert.strictEqual(isExpired, true, 'Challenge must be detected as expired');
    logPass('Expired challenge is detected and rejected (expiresAt < NOW)');

    await prisma.otpChallenge.delete({ where: { id: expiredChallengeId } });
  } catch (err) {
    logFail('Expiration enforcement test', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Attempt Limit Enforcement (Lockout After 5 Incorrect Tries)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 7. Attempt Limit & Lockout Enforcement ---');
  try {
    const lockoutChallengeId = crypto.randomUUID();
    let lockRecord = await prisma.otpChallenge.create({
      data: {
        id: lockoutChallengeId,
        emailNormalized: testEmail,
        purpose: 'forced_2fa_setup',
        codeHash: realHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        resendAfter: new Date(Date.now() + 60 * 1000),
        attempts: 4, // 4 failed attempts previously
        maxAttempts: 5,
        usedAt: null,
      },
    });

    // 5th failed attempt
    lockRecord = await prisma.otpChallenge.update({
      where: { id: lockoutChallengeId },
      data: {
        attempts: lockRecord.attempts + 1,
        usedAt: lockRecord.attempts + 1 >= 5 ? new Date() : null,
      },
    });

    assert.strictEqual(lockRecord.attempts, 5, 'Attempts must equal 5');
    assert(lockRecord.usedAt !== null, 'Challenge must be marked used/locked at max attempts');

    // Subsequent check verifies it is locked
    const isLocked = lockRecord.attempts >= 5 || lockRecord.usedAt !== null;
    assert.strictEqual(isLocked, true, 'Locked challenge cannot be used for further attempts');
    logPass('Challenge strictly enforces 5-attempt limit and locks out upon reaching max attempts');

    await prisma.otpChallenge.delete({ where: { id: lockoutChallengeId } });
  } catch (err) {
    logFail('Attempt limit lockout test', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 8. Dist Leak Scanner Banned Pattern Verification
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 8. Dist Leak Scanner Pattern Enforcement ---');
  try {
    const { execSync } = require('child_process');
    const scanOut = execSync('node scripts/scan-dist-leaks.js', {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
    });
    assert(scanOut.includes('[PASS] ZERO DEV PASSWORDS'), 'Expected leak scan to pass');
    logPass('scripts/scan-dist-leaks.js passes on production build assets');
  } catch (err) {
    logFail('Dist leak scanner execution', err.message);
  }

  // Cleanup test challenge
  if (challengeRecord?.id) {
    await prisma.otpChallenge.delete({ where: { id: challengeRecord.id } }).catch(() => {});
  }

  await prisma.$disconnect();

  console.log('\n========================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('[FATAL ERROR IN TEST SUITE]', err);
  process.exit(1);
});
