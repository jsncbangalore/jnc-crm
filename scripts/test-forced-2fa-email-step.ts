/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../apps/api/src/auth/auth.service';
import { generateTotpToken, getTotpStep } from '../apps/api/src/common/totp.util';

// Integration test for forced 2-step setup email verification and security guarantees.
// Covers:
// 1. Wrong code (5 attempts lockout)
// 2. Expired code (10m lifetime)
// 3. Hijack attempt (calling setup without verified email fails with 403 EMAIL_VERIFICATION_REQUIRED)
// 4. Resend cooldown (60s)
// 5. Success flow (email OTP verified -> authenticator QR -> 2FA enabled -> security notification email sent)
// 6. Complete test tenant/user teardown on success or failure.

const prisma = new PrismaClient();
const jwtService = new JwtService({ secret: process.env.JWT_SECRET || 'crm-default-jwt-secret-dev-2026' });

const dispatchedEmails: any[] = [];
const mockNotificationsService: any = {
  createNotification: async () => ({}),
  sendEmail: async (args: any) => {
    dispatchedEmails.push(args);
    return { status: 'sent' };
  },
};

const authService = new AuthService(
  prisma as any,
  jwtService,
  mockNotificationsService,
);

const UNIQUE_KEY = Date.now().toString();
const TEST_TENANT_ID = `test-tenant-${UNIQUE_KEY}`;
const TEST_USER_ID = `test-user-${UNIQUE_KEY}`;
const TEST_EMAIL = `test.forced.${UNIQUE_KEY}@example.internal`;

async function cleanup() {
  try {
    await prisma.otpChallenge.deleteMany({ where: { emailNormalized: TEST_EMAIL.toLowerCase() } });
    await prisma.auditLog.deleteMany({ where: { entityId: TEST_USER_ID } });
    await prisma.emailOutbox.deleteMany({ where: { to: TEST_EMAIL.toLowerCase() } });
    await prisma.userTwoFactor.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
    await prisma.tenant.deleteMany({ where: { id: TEST_TENANT_ID } });
  } catch (err: any) {
    console.warn('[CLEANUP WARNING]', err.message);
  }
}

async function run() {
  console.log('=== FORCED 2-STEP SETUP EMAIL VERIFICATION & SECURITY TEST ===\n');

  try {
    // 1. Setup isolated test tenant and user
    await prisma.tenant.create({
      data: {
        id: TEST_TENANT_ID,
        name: 'Test Tenant Forced 2FA',
        code: `T-${UNIQUE_KEY.slice(-6)}`,
        slug: `test-slug-${UNIQUE_KEY.slice(-6)}`,
        requireTwoFactor: true,
      },
    });

    const passwordHash = await bcrypt.hash('Password@123', 10);
    const testUser = await prisma.user.create({
      data: {
        id: TEST_USER_ID,
        tenant: { connect: { id: TEST_TENANT_ID } },
        email: TEST_EMAIL,
        name: 'Test Setup User',
        employeeCode: `EMP-${UNIQUE_KEY.slice(-6)}`,
        passwordHash,
        role: 'tenant_admin',
        isActive: true,
        firstLoginAfter2FaReleaseAt: new Date(Date.now() - 8 * 86400000), // Grace expired -> forced setup
      },
    });

    console.log('[PASS 1] Isolated test tenant and user created.');

    // 2. Issue an unverified setup token (as returned by login)
    const initialJti = crypto.randomUUID();
    const initialSetupToken = jwtService.sign(
      {
        sub: testUser.id,
        tenantId: TEST_TENANT_ID,
        purpose: '2fa_setup',
        portal: 'company',
        emailVerified: false,
        jti: initialJti,
      },
      {
        secret: process.env.JWT_SECRET || 'crm-default-jwt-secret-dev-2026',
        expiresIn: '10m',
        issuer: 'crm-api',
        audience: 'crm-client',
      },
    );

    // 3. HIJACK ATTEMPT TEST: Calling setup without email verification must fail with EMAIL_VERIFICATION_REQUIRED
    try {
      await authService.setupTwoFactor(testUser.id, undefined, true, false);
      throw new Error('Hijack attempt should have failed but succeeded!');
    } catch (err: any) {
      if (err.response?.code === 'EMAIL_VERIFICATION_REQUIRED' || err.status === 403) {
        console.log('[PASS 2] Hijack attempt rejected with 403 EMAIL_VERIFICATION_REQUIRED.');
      } else {
        throw new Error(`Expected EMAIL_VERIFICATION_REQUIRED (403), got: ${err.message}`);
      }
    }

    // 4. SEND EMAIL OTP TEST
    const sendResult = await authService.sendForcedSetupEmailOtp(initialSetupToken, '127.0.0.1', 'Mozilla/5.0 TestBrowser');
    if (!sendResult.success || !sendResult.emailMasked) {
      throw new Error('Failed to send forced setup email OTP');
    }
    console.log(`[PASS 3] Setup email code generated & sent. Masked: ${sendResult.emailMasked}`);

    // Verify outbox entry and audit log
    const outboxItem = await prisma.emailOutbox.findFirst({
      where: { to: TEST_EMAIL.toLowerCase() },
      orderBy: { createdAt: 'desc' },
    });
    if (!outboxItem || !outboxItem.html.includes('2-Step Verification Email Code')) {
      throw new Error('Email outbox item for setup code was not created properly.');
    }
    console.log('[PASS 4] Email outbox entry verified.');

    // Extract challenge from DB
    const challenge = await prisma.otpChallenge.findFirst({
      where: { emailNormalized: TEST_EMAIL.toLowerCase(), purpose: 'forced_2fa_setup', usedAt: null },
    });
    if (!challenge) {
      throw new Error('Active OtpChallenge record not found in database.');
    }

    // 5. RESEND COOLDOWN TEST: Calling send again immediately must throw EMAIL_COOLDOWN_ACTIVE
    try {
      await authService.sendForcedSetupEmailOtp(initialSetupToken, '127.0.0.1');
      throw new Error('Resend during cooldown should have failed!');
    } catch (err: any) {
      if (err.response?.code === 'EMAIL_COOLDOWN_ACTIVE' || err.status === 429) {
        console.log('[PASS 5] Resend cooldown (60s) properly enforced.');
      } else {
        throw new Error(`Expected EMAIL_COOLDOWN_ACTIVE, got: ${err.message}`);
      }
    }

    // 6. WRONG CODE TEST: Wrong code increments attempts and fails with EMAIL_CODE_INVALID
    try {
      await authService.verifyForcedSetupEmailOtp(initialSetupToken, '999999', '127.0.0.1');
      throw new Error('Verification with wrong code should have failed!');
    } catch (err: any) {
      if (err.response?.code === 'EMAIL_CODE_INVALID') {
        console.log('[PASS 6] Wrong code rejected with EMAIL_CODE_INVALID.');
      } else {
        throw new Error(`Expected EMAIL_CODE_INVALID, got: ${err.message}`);
      }
    }

    // 7. EXPIRED CODE TEST: Simulated expired challenge
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    try {
      await authService.verifyForcedSetupEmailOtp(initialSetupToken, '123456', '127.0.0.1');
      throw new Error('Verification with expired code should have failed!');
    } catch (err: any) {
      if (err.response?.code === 'EMAIL_CODE_EXPIRED') {
        console.log('[PASS 7] Expired code rejected with EMAIL_CODE_EXPIRED.');
      } else {
        throw new Error(`Expected EMAIL_CODE_EXPIRED, got: ${err.message}`);
      }
    }

    // Reset expiration and test attempts limit
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { expiresAt: new Date(Date.now() + 10 * 60 * 1000), attempts: 4 },
    });

    // 5th failed attempt should lock challenge
    try {
      await authService.verifyForcedSetupEmailOtp(initialSetupToken, '999999', '127.0.0.1');
      throw new Error('5th failed attempt should have locked challenge!');
    } catch (err: any) {
      if (err.response?.code === 'EMAIL_CODE_MAX_ATTEMPTS') {
        console.log('[PASS 8] 5 incorrect attempts locked challenge with EMAIL_CODE_MAX_ATTEMPTS.');
      } else {
        throw new Error(`Expected EMAIL_CODE_MAX_ATTEMPTS, got: ${err.message}`);
      }
    }

    // 8. SUCCESS PATH: Create fresh challenge with known code and verify successfully
    const validCode = '847291';
    const otpSecret = process.env.OTP_SECRET || process.env.JWT_SECRET || 'crm-otp-secret-key-2026';
    const freshChallengeId = `challenge-${UNIQUE_KEY}`;
    await prisma.otpChallenge.create({
      data: {
        id: freshChallengeId,
        emailNormalized: TEST_EMAIL.toLowerCase(),
        purpose: 'forced_2fa_setup',
        codeHash: crypto.createHmac('sha256', otpSecret + freshChallengeId).update(validCode).digest('hex'),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        resendAfter: new Date(Date.now() - 1000),
        attempts: 0,
        maxAttempts: 5,
      },
    });

    const verifyResult = await authService.verifyForcedSetupEmailOtp(initialSetupToken, validCode, '127.0.0.1');
    if (!verifyResult.success || !verifyResult.setupToken || !verifyResult.emailVerified) {
      throw new Error('Failed to verify valid email OTP');
    }
    console.log('[PASS 9] Valid email code verified. Minted verified setup token.');

    // Verify single-use burning
    const burnedChallenge = await prisma.otpChallenge.findUnique({ where: { id: freshChallengeId } });
    if (!burnedChallenge?.usedAt) {
      throw new Error('Challenge was not burned after single use!');
    }
    console.log('[PASS 10] Email OTP challenge burned immediately (single use).');

    // 9. SETUP AUTHENTICATOR: Verified setup token now allows calling setupTwoFactor
    const setupResult = await authService.setupTwoFactor(testUser.id, undefined, true, true);
    if (!setupResult.secret || !setupResult.otpauthUrl) {
      throw new Error('Failed to generate authenticator secret and otpauthUrl');
    }
    console.log('[PASS 11] Authenticator QR/secret generated successfully.');

    // 10. ENABLE 2-STEP: Submit valid TOTP code
    const currentStep = getTotpStep(Date.now());
    const totpCode = generateTotpToken(setupResult.secret, currentStep);
    const testUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const enableResult = await authService.enableTwoFactor(
      testUser.id,
      { code: totpCode, setupToken: verifyResult.setupToken, trustDevice: true },
      '127.0.0.1',
      testUserAgent,
    );
    if (!enableResult.success || !enableResult.backupCodes || enableResult.backupCodes.length !== 10) {
      throw new Error('Failed to enable 2-step verification.');
    }
    console.log('[PASS 12] 2-Step enrollment completed. 10 backup codes generated.');

    // 11. SECURITY NOTIFICATION EMAIL: Verify that post-enable email was sent
    await new Promise((resolve) => setTimeout(resolve, 500));
    const securityNotification = await prisma.emailOutbox.findFirst({
      where: {
        to: TEST_EMAIL.toLowerCase(),
        subject: 'Two-step verification was enabled on your account',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!securityNotification) {
      throw new Error('Security notification email was not queued in email outbox!');
    }
    const dispatched = dispatchedEmails.find((e) => e.subject === 'Two-step verification was enabled on your account');
    if (!dispatched) {
      throw new Error('Security notification email was not sent via notificationsService!');
    }
    const content = (dispatched.html || '') + (dispatched.text || '');
    if (!content.includes("This wasn't me") || !content.includes('Chrome on Windows')) {
      throw new Error(`Security notification email content missing expected strings. Found: ${content}`);
    }
    console.log('[PASS 13] Security notification email verified ("Two-step verification was enabled on your account" with time, browser, and "This wasn\'t me").');

    // 12. AUDIT LOG VERIFICATION: Check audit trail
    const auditLogs = await prisma.auditLog.findMany({
      where: { entityId: testUser.id },
      select: { action: true },
    });
    const actions = auditLogs.map((l) => l.action);
    const requiredActions = [
      '2FA_FORCED_SETUP_EMAIL_CODE_SENT',
      '2FA_FORCED_SETUP_EMAIL_CODE_FAILED',
      '2FA_FORCED_SETUP_EMAIL_CODE_EXPIRED',
      '2FA_FORCED_SETUP_EMAIL_CODE_VERIFIED',
      '2FA_ENABLED',
    ];
    for (const req of requiredActions) {
      if (!actions.includes(req)) {
        throw new Error(`Missing expected audit log action: ${req}`);
      }
    }
    console.log('[PASS 14] Complete audit log trail verified for all actions.');

    console.log('\n=== ALL FORCED 2-STEP SETUP EMAIL & SECURITY TESTS PASSED ===\n');
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

run().catch((err) => {
  console.error('[TEST FAILURE]', err);
  process.exit(1);
});
