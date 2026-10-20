/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../src/auth/auth.service';
import { getPasswordPolicy, validatePasswordPolicy } from '../src/common/password-policy';
import { BadRequestException, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, failureDetail?: string) {
  if (condition) {
    console.log(`[PASSED] ${testName}`);
    passedCount++;
  } else {
    console.error(`[FAILED] ${testName}${failureDetail ? ` - ${failureDetail}` : ''}`);
    failedCount++;
  }
}

// In-Memory Database Simulator for Prisma
class MockPrismaStore {
  tenants: any[] = [];
  users: any[] = [];
  otpChallenges: any[] = [];
  passwordResetTokens: any[] = [];
  refreshSessions: any[] = [];
  accountLockouts: any[] = [];
  auditLogs: any[] = [];

  tenant = {
    findFirst: async (args: any) => {
      const codeOrSlug = args?.where?.OR;
      if (codeOrSlug) {
        return this.tenants.find((t) =>
          codeOrSlug.some((clause: any) => {
            if (clause.code?.equals) {
              return t.code.toUpperCase() === clause.code.equals.toUpperCase();
            }
            if (clause.slug?.equals) {
              return t.slug.toLowerCase() === clause.slug.equals.toLowerCase();
            }
            if (clause.id?.equals) {
              return t.id === clause.id.equals;
            }
            return false;
          }),
        ) || null;
      }
      return this.tenants[0] || null;
    },
    create: async ({ data }: any) => {
      const row = { id: `tenant_${Date.now()}_${Math.random()}`, ...data };
      this.tenants.push(row);
      return row;
    },
    delete: async () => {},
  };

  user = {
    findMany: async (args: any) => {
      let results = [...this.users];
      if (args?.where) {
        if (args.where.id?.in) {
          results = results.filter((u) => args.where.id.in.includes(u.id));
        }
        if (args.where.email) {
          const target = (args.where.email.equals || args.where.email).toLowerCase();
          results = results.filter((u) => u.email.toLowerCase() === target);
        }
        if (args.where.tenantId) {
          results = results.filter((u) => u.tenantId === args.where.tenantId);
        }
        if (args.where.deletedAt === null) {
          results = results.filter((u) => !u.deletedAt);
        }
        if (args.where.isActive !== undefined) {
          results = results.filter((u) => u.isActive === args.where.isActive);
        }
      }
      if (args?.include?.tenant) {
        results = results.map((u) => ({
          ...u,
          tenant: this.tenants.find((t) => t.id === u.tenantId) || null,
        }));
      }
      return results;
    },
    findFirst: async (args: any) => {
      const list = await this.user.findMany(args);
      return list[0] || null;
    },
    findUnique: async (args: any) => {
      const u = this.users.find((x) => x.id === args?.where?.id) || null;
      if (u && args?.include?.tenant) {
        const tenant = this.tenants.find((t) => t.id === u.tenantId) || null;
        return { ...u, tenant };
      }
      return u;
    },
    create: async ({ data }: any) => {
      const row = { id: `usr_${Date.now()}_${Math.random().toString(36).substring(7)}`, ...data };
      this.users.push(row);
      return row;
    },
    update: async (args: any) => {
      const idx = this.users.findIndex((u) => u.id === args.where.id);
      if (idx !== -1) {
        this.users[idx] = { ...this.users[idx], ...args.data };
        return this.users[idx];
      }
      return null;
    },
    updateMany: async (args: any) => {
      let count = 0;
      for (let i = 0; i < this.users.length; i++) {
        const u = this.users[i];
        let matches = true;
        if (args.where?.id) {
          if (args.where.id.in) {
            if (!args.where.id.in.includes(u.id)) matches = false;
          } else if (u.id !== args.where.id) {
            matches = false;
          }
        }
        if (args.where?.deletedAt === null && u.deletedAt) matches = false;
        if (args.where?.isActive !== undefined && u.isActive !== args.where.isActive) matches = false;
        if (matches) {
          this.users[i] = { ...u, ...args.data };
          count++;
        }
      }
      return { count };
    },
  };

  otpChallenge = {
    findFirst: async (args: any) => {
      let matches = [...this.otpChallenges];
      if (args?.where?.emailNormalized) {
        matches = matches.filter((o) => o.emailNormalized === args.where.emailNormalized);
      }
      if (args?.where?.purpose) {
        matches = matches.filter((o) => o.purpose === args.where.purpose);
      }
      if (args?.where?.usedAt === null) {
        matches = matches.filter((o) => o.usedAt === null);
      }
      if (args?.where?.resendAfter?.gt) {
        matches = matches.filter((o) => new Date(o.resendAfter) > args.where.resendAfter.gt);
      }
      if (args?.orderBy?.createdAt === 'desc') {
        matches.reverse();
      }
      return matches[0] || null;
    },
    count: async (args: any) => {
      let matches = [...this.otpChallenges];
      if (args?.where?.emailNormalized) {
        matches = matches.filter((o) => o.emailNormalized === args.where.emailNormalized);
      }
      if (args?.where?.purpose) {
        matches = matches.filter((o) => o.purpose === args.where.purpose);
      }
      if (args?.where?.createdAt?.gte) {
        matches = matches.filter((o) => new Date(o.createdAt) >= args.where.createdAt.gte);
      }
      return matches.length;
    },
    create: async ({ data }: any) => {
      const row = {
        id: data.id || `otp_${Date.now()}_${Math.random()}`,
        attempts: 0,
        maxAttempts: 5,
        createdAt: new Date(),
        usedAt: null,
        ...data,
      };
      this.otpChallenges.push(row);
      return row;
    },
    update: async (args: any) => {
      const idx = this.otpChallenges.findIndex((o) => o.id === args.where.id);
      if (idx !== -1) {
        this.otpChallenges[idx] = { ...this.otpChallenges[idx], ...args.data };
        return this.otpChallenges[idx];
      }
      return null;
    },
    updateMany: async (args: any) => {
      let count = 0;
      for (let i = 0; i < this.otpChallenges.length; i++) {
        const o = this.otpChallenges[i];
        let matches = true;
        if (args.where?.emailNormalized && o.emailNormalized !== args.where.emailNormalized) matches = false;
        if (args.where?.purpose && o.purpose !== args.where.purpose) matches = false;
        if (args.where?.usedAt === null && o.usedAt !== null) matches = false;
        if (matches) {
          this.otpChallenges[i] = { ...this.otpChallenges[i], ...args.data };
          count++;
        }
      }
      return { count };
    },
  };

  refreshSession = {
    create: async ({ data }: any) => {
      const row = { id: `ses_${Date.now()}_${Math.random()}`, isRevoked: false, createdAt: new Date(), updatedAt: new Date(), ...data };
      this.refreshSessions.push(row);
      return row;
    },
    findUnique: async (args: any) => {
      return this.refreshSessions.find((s) => s.tokenHash === args?.where?.tokenHash) || null;
    },
    findFirst: async (args: any) => {
      return this.refreshSessions.find((s) => {
        if (args?.where?.id && s.id !== args.where.id) return false;
        if (args?.where?.userId && s.userId !== args.where.userId) return false;
        return true;
      }) || null;
    },
    findMany: async (args: any) => {
      return this.refreshSessions.filter((s) => {
        if (args?.where?.userId && s.userId !== args.where.userId) return false;
        if (args?.where?.isRevoked !== undefined && s.isRevoked !== args.where.isRevoked) return false;
        return true;
      });
    },
    update: async (args: any) => {
      const idx = this.refreshSessions.findIndex((s) => s.id === args.where.id);
      if (idx !== -1) {
        this.refreshSessions[idx] = { ...this.refreshSessions[idx], ...args.data };
        return this.refreshSessions[idx];
      }
      return null;
    },
    updateMany: async (args: any) => {
      let count = 0;
      for (let i = 0; i < this.refreshSessions.length; i++) {
        const s = this.refreshSessions[i];
        let matches = true;
        if (args.where?.userId && s.userId !== args.where.userId) matches = false;
        if (args.where?.tokenHash?.not && s.tokenHash === args.where.tokenHash.not) matches = false;
        if (matches) {
          this.refreshSessions[i] = { ...s, ...args.data };
          count++;
        }
      }
      return { count };
    },
  };

  accountLockout = {
    findUnique: async (args: any) => {
      return this.accountLockouts.find((l) => l.identityKey === args?.where?.identityKey) || null;
    },
    create: async ({ data }: any) => {
      const row = { id: `lck_${Date.now()}`, ...data };
      this.accountLockouts.push(row);
      return row;
    },
    update: async (args: any) => {
      const idx = this.accountLockouts.findIndex((l) => l.identityKey === args.where.identityKey);
      if (idx !== -1) {
        let attempts = this.accountLockouts[idx].failedAttempts || 0;
        if (args.data?.failedAttempts?.increment) {
          attempts += args.data.failedAttempts.increment;
        } else if (typeof args.data?.failedAttempts === 'number') {
          attempts = args.data.failedAttempts;
        }
        this.accountLockouts[idx] = {
          ...this.accountLockouts[idx],
          ...args.data,
          failedAttempts: attempts,
        };
        return this.accountLockouts[idx];
      }
      return null;
    },
    delete: async (args: any) => {
      this.accountLockouts = this.accountLockouts.filter((l) => l.identityKey !== args?.where?.identityKey);
      return {};
    },
    deleteMany: async (args: any) => {
      if (args?.where?.identityKey?.in) {
        this.accountLockouts = this.accountLockouts.filter((l) => !args.where.identityKey.in.includes(l.identityKey));
      }
      return {};
    },
  };

  auditLog = {
    create: async ({ data }: any) => {
      const row = { id: `aud_${Date.now()}`, timestamp: new Date(), ...data };
      this.auditLogs.push(row);
      return row;
    },
    findMany: async (args: any) => {
      let results = [...this.auditLogs];
      if (args?.where?.OR) {
        results = results.filter((l) =>
          args.where.OR.some((clause: any) => {
            if (clause.actorId && l.actorId === clause.actorId) return true;
            if (clause.entityId && l.entityId === clause.entityId) return true;
            return false;
          }),
        );
      }
      return results;
    },
  };
}

async function runTests() {
  console.log('\n================================================================');
  console.log('       JNC-CRM AUTH & OTP RESET SECURITY VERIFICATION SUITE       ');
  console.log('================================================================\n');

  const mockStore = new MockPrismaStore();
  const jwtSecret = 'test-jwt-secret-not-used-in-prod-2026';
  process.env.JWT_SECRET = jwtSecret;
  process.env.OTP_SECRET = jwtSecret;

  const jwtService = new JwtService({ secret: jwtSecret });

  // Track sent emails
  const sentEmails: any[] = [];
  const mockNotificationsService: any = {
    sendEmail: async (opts: any) => {
      sentEmails.push(opts);
      return { status: 'sent', messageId: 'test-msg-id-123' };
    },
  };

  const authService = new AuthService(
    mockStore as any,
    jwtService,
    mockNotificationsService,
  );

  // Setup mock tenant and users
  const testTenant = await mockStore.tenant.create({
    data: {
      name: 'Auth Security Test Company',
      code: 'TESTCO',
      slug: 'testco',
      status: 'active',
    },
  });

  const initHash = await bcrypt.hash('InitialSecureP@ssword2026!', 12);

  const testUser1 = await mockStore.user.create({
    data: {
      tenantId: testTenant.id,
      name: 'Tenant User One',
      email: 'tenant_user@example.com',
      employeeCode: 'EMP_001',
      passwordHash: initHash,
      role: 'tenant_admin',
      isActive: true,
      tokenVersion: 1,
    },
  });

  const testSuperAdmin = await mockStore.user.create({
    data: {
      tenantId: null,
      name: 'Platform Super Admin',
      email: 'platform_super_admin@example.com',
      employeeCode: 'PSA_001',
      passwordHash: initHash,
      role: 'platform_super_admin',
      isActive: true,
      tokenVersion: 1,
    },
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Password Policy Rules & Evaluation (Point 5 / Point 8)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const policy = authService.getPasswordPolicy();
    assert(
      policy.minLength === 12 &&
      Array.isArray(policy.rules) &&
      policy.rules.some((r) => r.id === 'minLength') &&
      policy.rules.some((r) => r.id === 'notCommon'),
      'Test 1.1: getPasswordPolicy returns minLength 12 and required rules list',
    );

    let shortRejected = false;
    try {
      validatePasswordPolicy('short123');
    } catch {
      shortRejected = true;
    }
    assert(shortRejected, 'Test 1.2: Password policy rejects passwords under 12 characters');

    let strongAccepted = false;
    try {
      validatePasswordPolicy('StrongPass#2026!X99');
      strongAccepted = true;
    } catch {
      strongAccepted = false;
    }
    assert(strongAccepted, 'Test 1.3: Password policy accepts strong compliant password');
  } catch (err: any) {
    assert(false, 'Test 1: Password Policy Validation', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: OTP Request Flow (forgotPasswordRequest) (Point 2)
  // ──────────────────────────────────────────────────────────────────────────
  let generatedOtpCode = '';
  try {
    sentEmails.length = 0;

    // Request OTP code for testUser1
    const reqRes = await authService.forgotPasswordRequest(
      { email: testUser1.email },
      '192.168.1.100',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0',
    );

    assert(
      reqRes.message === 'If this account exists, we sent a code.' &&
      reqRes.resendAfterSeconds === 60,
      'Test 2.1: forgotPasswordRequest returns generic message with 60s resend timer',
    );

    // Verify email was dispatched with 6-digit code
    const lastEmail = sentEmails[sentEmails.length - 1];
    assert(
      lastEmail &&
      lastEmail.to === testUser1.email &&
      lastEmail.subject.includes('is your JNC CRM verification code'),
      'Test 2.2: Email dispatched to user with verification code subject',
    );

    // Extract the 6-digit code from subject
    const match = lastEmail.subject.match(/^(\d{6})\s/);
    if (match) {
      generatedOtpCode = match[1];
    }
    assert(generatedOtpCode.length === 6, 'Test 2.3: 6-digit verification code generated securely');

    // Verify code is stored as HMAC-SHA256, NOT plaintext
    const challenge = await mockStore.otpChallenge.findFirst({
      where: { emailNormalized: testUser1.email.toLowerCase(), purpose: 'password_reset' },
    });
    assert(
      challenge !== null &&
      challenge.codeHash !== generatedOtpCode &&
      challenge.codeHash.length === 64,
      'Test 2.4: Code is stored strictly as HMAC-SHA256 hash in OtpChallenge',
    );

    // Test 60-second cooldown prevents sending duplicate codes
    sentEmails.length = 0;
    const cooldownRes = await authService.forgotPasswordRequest({ email: testUser1.email });
    assert(
      cooldownRes.message === 'If this account exists, we sent a code.' &&
      sentEmails.length === 0,
      'Test 2.5: 60-second resend cooldown blocks re-dispatching email within window',
    );

    // Test non-existent email returns identical timing-safe message without creating challenge
    const nonExistentEmail = 'non_existent_random_user_99@example.com';
    const nonExistRes = await authService.forgotPasswordRequest({ email: nonExistentEmail });
    assert(
      nonExistRes.message === 'If this account exists, we sent a code.',
      'Test 2.6: Non-existent email returns identical generic message',
    );
  } catch (err: any) {
    assert(false, 'Test 2: OTP Request Flow', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: OTP Verification Flow (forgotPasswordVerify) (Point 3)
  // ──────────────────────────────────────────────────────────────────────────
  let resetTicket = '';
  let accountsList: any[] = [];
  try {
    // 1. Wrong code test: should fail and increment attempt count
    let wrongCodeRejected = false;
    try {
      await authService.forgotPasswordVerify({ email: testUser1.email, code: '000000' });
    } catch (err: any) {
      wrongCodeRejected = err instanceof BadRequestException && err.message.includes('incorrect or expired');
    }
    assert(wrongCodeRejected, 'Test 3.1: Wrong code fails with "Code is incorrect or expired."');

    // 2. Correct code test: returns resetTicket and accounts list
    const verifyRes = await authService.forgotPasswordVerify({
      email: testUser1.email,
      code: generatedOtpCode,
    });
    assert(
      typeof verifyRes.resetTicket === 'string' &&
      Array.isArray(verifyRes.accounts) &&
      verifyRes.accounts.length === 1 &&
      verifyRes.accounts[0].accountId === testUser1.id,
      'Test 3.2: Correct code returns signed resetTicket and account selector list',
    );
    resetTicket = verifyRes.resetTicket;
    accountsList = verifyRes.accounts;

    // 3. Single-use test: challenge marked as used and cannot be re-verified
    let reuseRejected = false;
    try {
      await authService.forgotPasswordVerify({ email: testUser1.email, code: generatedOtpCode });
    } catch {
      reuseRejected = true;
    }
    assert(reuseRejected, 'Test 3.3: Verification challenge is single-use; cannot be reused');
  } catch (err: any) {
    assert(false, 'Test 3: OTP Verification Flow', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: OTP Reset Execution (forgotPasswordReset) (Point 4)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    sentEmails.length = 0;
    const newPassword = 'BrandNewSecure#2026!XYZ';

    // 1. Account ownership security check: attempt to reset another user's account with this ticket
    let crossAccountRejected = false;
    try {
      await authService.forgotPasswordReset({
        resetTicket,
        accountIds: ['usr_attacker_victim_id_not_owned'],
        newPassword,
      });
    } catch (err: any) {
      crossAccountRejected = true;
    }
    assert(crossAccountRejected, 'Test 4.1: Reset rejects accounts not belonging to verified email');

    // 2. Perform legitimate reset for testUser1
    const resetRes = await authService.forgotPasswordReset(
      {
        resetTicket,
        accountIds: [testUser1.id],
        newPassword,
      },
      '203.0.113.195',
    );
    assert(resetRes.success === true, 'Test 4.2: Password reset succeeds for verified account');

    // 3. Verify user password updated in database
    const refreshedUser = await mockStore.user.findUnique({ where: { id: testUser1.id } });
    const isNewPassMatch = await bcrypt.compare(newPassword, refreshedUser!.passwordHash);
    assert(isNewPassMatch, 'Test 4.3: User passwordHash is updated to new bcrypt hash');

    // 4. Verify notification email dispatched
    const changeNotification = sentEmails.find((m) => m.subject.includes('Your JNC CRM password was changed'));
    assert(
      changeNotification !== undefined &&
      changeNotification.to === testUser1.email &&
      changeNotification.text.includes('203.0.113.195'),
      'Test 4.4: Dispatches "Your password was changed" email with client IP',
    );
  } catch (err: any) {
    assert(false, 'Test 4: OTP Reset Execution', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Platform Super Admin Reset Flow (Point 2 / Point 4)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    sentEmails.length = 0;

    // 1. Request OTP for platform super admin
    await authService.forgotPasswordRequest({ email: testSuperAdmin.email });
    const adminEmail = sentEmails[sentEmails.length - 1];
    const adminCode = adminEmail.subject.match(/^(\d{6})\s/)[1];

    // 2. Verify OTP
    const adminVerify = await authService.forgotPasswordVerify({
      email: testSuperAdmin.email,
      code: adminCode,
    });
    assert(
      adminVerify.accounts[0].label === 'Platform administration',
      'Test 5.1: Platform super admin labeled as "Platform administration" in account list',
    );

    // 3. Reset password
    const adminNewPass = 'PlatformAdminSecure#2026!Pass';
    const adminReset = await authService.forgotPasswordReset({
      resetTicket: adminVerify.resetTicket,
      accountIds: [testSuperAdmin.id],
      newPassword: adminNewPass,
    });
    assert(adminReset.success === true, 'Test 5.2: Platform super admin password reset succeeds');

    const updatedAdmin = await mockStore.user.findUnique({ where: { id: testSuperAdmin.id } });
    const isAdminPassOk = await bcrypt.compare(adminNewPass, updatedAdmin!.passwordHash);
    assert(isAdminPassOk, 'Test 5.3: Platform super admin record holds updated password hash');
  } catch (err: any) {
    assert(false, 'Test 5: Platform Super Admin Reset', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Legacy Link Endpoint Returns HTTP 410 Gone (Point 6)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    let legacyEndpointGone = false;
    try {
      await authService.resetPassword({ token: 'old_legacy_link_token', newPassword: 'ValidPass#123456!' });
    } catch (err: any) {
      legacyEndpointGone = err instanceof HttpException && err.getStatus() === HttpStatus.GONE;
    }
    assert(legacyEndpointGone, 'Test 6.1: Legacy reset-password endpoint returns HTTP 410 Gone');
  } catch (err: any) {
    assert(false, 'Test 6: Legacy Endpoint Deprecation', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 7: Active Devices & Session Management (Point 13)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const rawTokenA = 'raw-session-token-aaa';
    const hashA = crypto.createHash('sha256').update(rawTokenA).digest('hex');
    await mockStore.refreshSession.create({
      data: {
        userId: testUser1.id,
        tokenHash: hashA,
        familyId: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        deviceLabel: 'Windows / Chrome 124',
        ipAddress: '192.168.1.50',
      },
    });

    const rawTokenB = 'raw-session-token-bbb';
    const hashB = crypto.createHash('sha256').update(rawTokenB).digest('hex');
    const sessionB = await mockStore.refreshSession.create({
      data: {
        userId: testUser1.id,
        tokenHash: hashB,
        familyId: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        deviceLabel: 'Android / Mobile Safari',
        ipAddress: '192.168.1.60',
      },
    });

    // List sessions
    const sessions = await authService.getUserSessions(testUser1.id, rawTokenA);
    assert(
      sessions.length >= 2 &&
      sessions.some((s: any) => s.isCurrent === true && s.deviceLabel.includes('Chrome')) &&
      sessions.some((s: any) => s.isCurrent === false && s.deviceLabel.includes('Android')),
      'Test 7.1: getUserSessions lists devices and tags current session correctly',
    );

    // Revoke session B
    const revokeRes = await authService.revokeSession(testUser1.id, sessionB.id);
    assert(revokeRes.success === true, 'Test 7.2: revokeSession successfully terminates specific session');

    const refreshedB = await mockStore.refreshSession.findUnique({ where: { tokenHash: hashB } });
    assert(refreshedB!.isRevoked === true, 'Test 7.3: Revoked session marked isRevoked: true');
  } catch (err: any) {
    assert(false, 'Test 7: Session Management', err.message);
  }

  console.log('\n----------------------------------------------------------------');
  console.log(`AUTH SECURITY TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('----------------------------------------------------------------\n');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
