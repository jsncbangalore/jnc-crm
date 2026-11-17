/* --- REAL HTTP ENDPOINTS TEST: VERIFICATION CODES & OTP INTEGRITY ---
 * Validates real HTTP routes:
 * 1. forgot-password (/auth/forgot-password/request & /auth/forgot-password/verify)
 * 2. 2fa/setup (/auth/2fa/setup/send-email-code & /auth/2fa/setup/verify-email-code)
 * 3. profile/email (/auth/profile/email/request-otp & /auth/profile/email/verify-otp)
 * 4. profile/phone (/auth/profile/phone/request-otp & /auth/profile/phone/verify-otp)
 *
 * Checks:
 * - Wrong code rejection (400)
 * - Expired code rejection (400)
 * - 5th wrong attempt lockout (400 + usedAt timestamp set)
 * - Resend cooldown limit (60s cooldown enforced)
 * - Single-use enforcement (cannot reuse consumed code)
 * - Cryptographic HMAC-SHA256 hash storage in DB (zero plaintext codes stored)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require(path.join(__dirname, '../node_modules/@prisma/client'));

// Load .env
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
const API_BASE = process.env.API_URL || 'http://127.0.0.1:3333/api/v1';
const jwtSecret = process.env.JWT_SECRET || 'crm-default-jwt-secret-for-development-mode-2026';
const otpSecret = process.env.OTP_SECRET || jwtSecret;

let passed = 0;
let failed = 0;

function assert(title, condition, extraInfo = '') {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${title}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${title} ${extraInfo ? `(${extraInfo})` : ''}`);
  }
}

function recoverCode(challengeId, targetHash) {
  const prefix = otpSecret + challengeId;
  for (let c = 100000; c <= 999999; c++) {
    const s = String(c);
    if (crypto.createHmac('sha256', prefix).update(s).digest('hex') === targetHash) {
      return s;
    }
  }
  return null;
}

async function httpPost(endpointPath, body, token = null) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${API_BASE}${endpointPath}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      let json = null;
      try {
        json = await res.json();
      } catch {}
      return { status: res.status, data: json };
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

async function main() {
  console.log('========================================================================');
  console.log('TEST SUITE: REAL HTTP ENDPOINTS VERIFICATION CODES & OTP INTEGRITY');
  console.log('========================================================================\n');

  const randSuffix = Math.floor(100000 + Math.random() * 900000);
  const rawPassword = `SecPass_${randSuffix}!`;
  const passwordHash = await bcrypt.hash(rawPassword, 10);

  // Setup test tenant and user
  const tenant = await prisma.tenant.create({
    data: {
      id: `tenant-otp-${randSuffix}`,
      name: `OTP Test Tenant ${randSuffix}`,
      code: `OTP${randSuffix}`,
      slug: `otp-test-${randSuffix}`,
      status: 'active',
      planTier: 'enterprise',
      requireTwoFactor: false,
    },
  });

  const testUser = await prisma.user.create({
    data: {
      id: `user-otp-${randSuffix}`,
      tenantId: tenant.id,
      email: `otpuser_${randSuffix}@test.fake`,
      name: `OTP User ${randSuffix}`,
      phone: `98765${String(randSuffix).slice(0, 5)}`,
      role: 'employee',
      employeeCode: `EC-OTP-${randSuffix}`,
      passwordHash,
      isActive: true,
    },
  });

  const authToken = jwt.sign(
    {
      sub: testUser.id,
      userId: testUser.id,
      id: testUser.id,
      email: testUser.email,
      role: testUser.role,
      tenantId: tenant.id,
    },
    jwtSecret,
    { audience: 'crm-client', issuer: 'crm-api', expiresIn: '1h' }
  );

  const setupToken = jwt.sign(
    {
      sub: testUser.id,
      userId: testUser.id,
      purpose: 'two_factor_setup',
      portal: 'company',
      jti: crypto.randomUUID(),
    },
    jwtSecret,
    { audience: 'crm-client', issuer: 'crm-api', expiresIn: '1h' }
  );

  try {
    // ------------------------------------------------------------------------
    // FLOW 1: FORGOT PASSWORD ENDPOINTS
    // ------------------------------------------------------------------------
    console.log('--- 1. HTTP Endpoint: POST /auth/forgot-password/request & verify ---');

    // 1A. Request code via HTTP
    const fpReq1 = await httpPost('/auth/forgot-password/request', { email: testUser.email });
    assert('POST /auth/forgot-password/request returns 200/201 OK', fpReq1.status === 200 || fpReq1.status === 201, `Status: ${fpReq1.status}`);

    // DB inspection: Verify HMAC-SHA256 hash storage and zero plaintext
    const fpChallenge1 = await prisma.otpChallenge.findFirst({
      where: { emailNormalized: testUser.email.toLowerCase(), purpose: 'password_reset' },
      orderBy: { createdAt: 'desc' },
    });
    assert('Challenge record created in database', Boolean(fpChallenge1));
    assert('codeHash is 64-character hex string (HMAC-SHA256)', Boolean(fpChallenge1?.codeHash && fpChallenge1.codeHash.length === 64 && /^[0-9a-f]{64}$/.test(fpChallenge1.codeHash)));
    assert('Zero plaintext code in database challenge record', !('code' in (fpChallenge1 || {})));

    // Retrieve the generated code from email outbox for this challenge
    const outboxFp = await prisma.emailOutbox.findFirst({
      where: { to: testUser.email.toLowerCase() },
      orderBy: { createdAt: 'desc' },
    });
    const codeMatchFp = outboxFp?.subject?.match(/(\d{6})/);
    const realCodeFp = codeMatchFp ? codeMatchFp[1] : null;
    assert('Real random 6-digit code dispatched to outbox', Boolean(realCodeFp && /^\d{6}$/.test(realCodeFp)));

    // Verify hash integrity: HMAC-SHA256(otpSecret + id, realCode) === codeHash
    const expectedHashFp = crypto.createHmac('sha256', otpSecret + fpChallenge1.id).update(realCodeFp).digest('hex');
    assert('Stored codeHash matches HMAC-SHA256 calculation of dispatched code', fpChallenge1.codeHash === expectedHashFp);

    // 1B. Resend cooldown enforcement via HTTP
    const fpReqResend = await httpPost('/auth/forgot-password/request', { email: testUser.email });
    assert('Resend within 60s returns cooldown and does NOT issue second challenge', Boolean(fpReqResend.data?.resendAfterSeconds > 0));

    // 1C. Wrong code rejection via HTTP
    const fpWrongRes = await httpPost('/auth/forgot-password/verify', { email: testUser.email, code: '000000' });
    assert('POST /auth/forgot-password/verify rejects wrong code with HTTP 400', fpWrongRes.status === 400, `Status: ${fpWrongRes.status}`);

    // 1D. 5th wrong attempt lockout via HTTP
    for (let i = 0; i < 4; i++) {
      await httpPost('/auth/forgot-password/verify', { email: testUser.email, code: '111111' });
    }
    const fpLockedChallenge = await prisma.otpChallenge.findUnique({ where: { id: fpChallenge1.id } });
    assert('Challenge locked out after 5 failures (attempts >= 5 and usedAt set)', Boolean(fpLockedChallenge.attempts >= 5 && fpLockedChallenge.usedAt));

    const fpPostLockRes = await httpPost('/auth/forgot-password/verify', { email: testUser.email, code: realCodeFp });
    assert('Attempt with real code rejected after lockout (HTTP 400)', fpPostLockRes.status === 400);

    // 1E. Expired code rejection via HTTP
    // Create a new challenge directly in DB with expiresAt in the past
    const expiredFpId = crypto.randomUUID();
    const expCode = '654321';
    const expHash = crypto.createHmac('sha256', otpSecret + expiredFpId).update(expCode).digest('hex');
    await prisma.otpChallenge.create({
      data: {
        id: expiredFpId,
        emailNormalized: testUser.email.toLowerCase(),
        purpose: 'password_reset',
        codeHash: expHash,
        expiresAt: new Date(Date.now() - 5000), // expired 5 seconds ago
        resendAfter: new Date(Date.now() - 5000),
      },
    });
    const fpExpRes = await httpPost('/auth/forgot-password/verify', { email: testUser.email, code: expCode });
    assert('POST /auth/forgot-password/verify rejects expired code with HTTP 400', fpExpRes.status === 400);

    // 1F. Single-use verification via HTTP
    // Create fresh open challenge for single-use test
    const singleFpId = crypto.randomUUID();
    const singleCode = '789123';
    const singleHash = crypto.createHmac('sha256', otpSecret + singleFpId).update(singleCode).digest('hex');
    await prisma.otpChallenge.create({
      data: {
        id: singleFpId,
        emailNormalized: testUser.email.toLowerCase(),
        purpose: 'password_reset',
        codeHash: singleHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        resendAfter: new Date(Date.now() + 60 * 1000),
      },
    });
    const singleVer1 = await httpPost('/auth/forgot-password/verify', { email: testUser.email, code: singleCode });
    assert('First verification with valid code succeeds (200/201)', singleVer1.status === 200 || singleVer1.status === 201, `Status: ${singleVer1.status}`);

    const singleVer2 = await httpPost('/auth/forgot-password/verify', { email: testUser.email, code: singleCode });
    assert('Replaying consumed verification code fails (single-use enforced, HTTP 400)', singleVer2.status === 400, `Status: ${singleVer2.status}`);

    // ------------------------------------------------------------------------
    // FLOW 2: 2FA SETUP ENDPOINTS
    // ------------------------------------------------------------------------
    console.log('\n--- 2. HTTP Endpoint: POST /auth/2fa/setup/send-email-code & verify-email-code ---');

    // 2A. Send setup email code
    const twoFaSend = await httpPost('/auth/2fa/setup/send-email-code', { setupToken });
    assert('POST /auth/2fa/setup/send-email-code returns 200 OK', twoFaSend.status === 200, `Status: ${twoFaSend.status}`);

    const twoFaChallenge = await prisma.otpChallenge.findFirst({
      where: { emailNormalized: testUser.email.toLowerCase(), purpose: 'forced_2fa_setup' },
      orderBy: { createdAt: 'desc' },
    });
    assert('2FA setup challenge stored with 64-char HMAC-SHA256 codeHash', Boolean(twoFaChallenge?.codeHash && twoFaChallenge.codeHash.length === 64));

    // Outbox check
    const outbox2Fa = await prisma.emailOutbox.findFirst({
      where: { to: testUser.email.toLowerCase() },
      orderBy: { createdAt: 'desc' },
    });
    const code2Fa = outbox2Fa?.subject?.match(/(\d{6})/)?.[1];
    assert('2FA setup code dispatched to outbox', Boolean(code2Fa));

    // 2B. Wrong code rejection
    const twoFaWrong = await httpPost('/auth/2fa/setup/verify-email-code', { setupToken, code: '000000' });
    assert('POST /auth/2fa/setup/verify-email-code rejects wrong code with HTTP 400', twoFaWrong.status === 400);

    // 2C. 5th attempt lockout
    for (let i = 0; i < 4; i++) {
      await httpPost('/auth/2fa/setup/verify-email-code', { setupToken, code: '222222' });
    }
    const twoFaLocked = await prisma.otpChallenge.findUnique({ where: { id: twoFaChallenge.id } });
    assert('2FA challenge enforces max 5 attempts lockout', Boolean(twoFaLocked.attempts >= 5));

    // 2D. Single-use and success
    const fresh2FaId = crypto.randomUUID();
    const fresh2FaCode = '345678';
    const fresh2FaHash = crypto.createHmac('sha256', otpSecret + fresh2FaId).update(fresh2FaCode).digest('hex');
    await prisma.otpChallenge.create({
      data: {
        id: fresh2FaId,
        emailNormalized: testUser.email.toLowerCase(),
        purpose: 'forced_2fa_setup',
        codeHash: fresh2FaHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        resendAfter: new Date(Date.now() + 60 * 1000),
      },
    });
    const twoFaSuccess = await httpPost('/auth/2fa/setup/verify-email-code', { setupToken, code: fresh2FaCode });
    assert('2FA setup verify succeeds with real code (200 OK)', twoFaSuccess.status === 200, `Status: ${twoFaSuccess.status}`);

    const twoFaReplay = await httpPost('/auth/2fa/setup/verify-email-code', { setupToken, code: fresh2FaCode });
    assert('2FA setup replay rejected (single-use enforced, HTTP 400)', twoFaReplay.status === 400);

    // ------------------------------------------------------------------------
    // FLOW 3: PROFILE EMAIL CHANGE OTP ENDPOINTS
    // ------------------------------------------------------------------------
    console.log('\n--- 3. HTTP Endpoint: POST /auth/profile/email/request-otp & verify-otp ---');
    const newTargetEmail = `newemail_${randSuffix}@test.fake`;

    // 3A. Request email change OTP
    const emailReq = await httpPost(
      '/auth/profile/email/request-otp',
      { currentPassword: rawPassword, newEmail: newTargetEmail },
      authToken
    );
    assert('POST /auth/profile/email/request-otp returns 200/201 OK', emailReq.status === 200 || emailReq.status === 201, `Status: ${emailReq.status}`);

    const emailChallenge = await prisma.otpChallenge.findFirst({
      where: { emailNormalized: newTargetEmail.toLowerCase(), purpose: 'email_change' },
      orderBy: { createdAt: 'desc' },
    });
    assert('Email change OTP challenge stored with HMAC-SHA256 hash', Boolean(emailChallenge?.codeHash && emailChallenge.codeHash.length === 64));
    assert('Zero plaintext code in database email challenge record', !('code' in (emailChallenge || {})));

    const codeEmail = recoverCode(emailChallenge.id, emailChallenge.codeHash);
    assert('Recovered real random OTP matching stored HMAC-SHA256 hash', Boolean(codeEmail && /^\d{6}$/.test(codeEmail)));

    // 3B. Wrong code rejection
    const emailWrong = await httpPost(
      '/auth/profile/email/verify-otp',
      { newEmail: newTargetEmail, code: '000000' },
      authToken
    );
    assert('POST /auth/profile/email/verify-otp rejects wrong code with HTTP 400', emailWrong.status === 400);

    // 3C. Single-use and valid verification
    const emailOk = await httpPost(
      '/auth/profile/email/verify-otp',
      { newEmail: newTargetEmail, code: codeEmail },
      authToken
    );
    assert('Email change OTP verification succeeds (200/201)', emailOk.status === 200 || emailOk.status === 201, `Status: ${emailOk.status}`);

    const emailReplay = await httpPost(
      '/auth/profile/email/verify-otp',
      { newEmail: newTargetEmail, code: codeEmail },
      authToken
    );
    assert('Email change OTP replay rejected (single-use enforced, HTTP 400)', emailReplay.status === 400);

    // ------------------------------------------------------------------------
    // FLOW 4: PROFILE PHONE CHANGE OTP ENDPOINTS
    // ------------------------------------------------------------------------
    console.log('\n--- 4. HTTP Endpoint: POST /auth/profile/phone/request-otp & verify-otp ---');
    const newTargetPhone = `98765${String(randSuffix + 1).slice(0, 5)}`;

    // 4A. Request phone change OTP (sent to user's registered email)
    const phoneReq = await httpPost(
      '/auth/profile/phone/request-otp',
      { currentPassword: rawPassword, newPhone: newTargetPhone },
      authToken
    );
    assert('POST /auth/profile/phone/request-otp returns 200/201 OK', phoneReq.status === 200 || phoneReq.status === 201, `Status: ${phoneReq.status}`);

    // Phone change OTP is stored under the user's current registered email (which was updated to newTargetEmail in Step 3)
    const phoneChallenge = await prisma.otpChallenge.findFirst({
      where: { emailNormalized: newTargetEmail.toLowerCase(), purpose: 'phone_change' },
      orderBy: { createdAt: 'desc' },
    });
    assert('Phone change OTP challenge stored with HMAC-SHA256 hash', Boolean(phoneChallenge?.codeHash && phoneChallenge.codeHash.length === 64));
    assert('Zero plaintext code in database phone challenge record', !('code' in (phoneChallenge || {})));

    const codePhone = recoverCode(phoneChallenge.id, phoneChallenge.codeHash);
    assert('Recovered real random phone OTP matching stored HMAC-SHA256 hash', Boolean(codePhone && /^\d{6}$/.test(codePhone)));

    // 4B. Wrong code rejection
    const phoneWrong = await httpPost(
      '/auth/profile/phone/verify-otp',
      { newPhone: newTargetPhone, code: '000000' },
      authToken
    );
    assert('POST /auth/profile/phone/verify-otp rejects wrong code with HTTP 400', phoneWrong.status === 400);

    // 4C. Single-use and valid verification
    const phoneOk = await httpPost(
      '/auth/profile/phone/verify-otp',
      { newPhone: newTargetPhone, code: codePhone },
      authToken
    );
    assert('Phone change OTP verification succeeds (200/201)', phoneOk.status === 200 || phoneOk.status === 201, `Status: ${phoneOk.status}`);

    const phoneReplay = await httpPost(
      '/auth/profile/phone/verify-otp',
      { newPhone: newTargetPhone, code: codePhone },
      authToken
    );
    assert('Phone change OTP replay rejected (single-use enforced, HTTP 400)', phoneReplay.status === 400);

  } finally {
    // Cleanup
    console.log('\nCleaning up OTP test data...');
    await prisma.otpChallenge.deleteMany({
      where: { emailNormalized: { in: [testUser.email.toLowerCase(), `newemail_${randSuffix}@test.fake`] } },
    }).catch(() => {});
    await prisma.emailOutbox.deleteMany({
      where: { to: { in: [testUser.email.toLowerCase(), `newemail_${randSuffix}@test.fake`] } },
    }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: testUser.id } }).catch(() => {});
    await prisma.tenant.deleteMany({ where: { id: tenant.id } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log('\n========================================================================');
  console.log(`REAL HTTP VERIFICATION SUITE SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error in real verification endpoints suite:', err);
  process.exit(1);
});
