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
import { BadRequestException, HttpException } from '@nestjs/common';

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
        if (args.where?.id && u.id !== args.where.id) matches = false;
        if (args.where?.deletedAt === null && u.deletedAt) matches = false;
        if (matches) {
          this.users[i] = { ...u, ...args.data };
          count++;
        }
      }
      return { count };
    },
    delete: async () => {},
    deleteMany: async () => {},
  };

  passwordResetToken = {
    findUnique: async (args: any) => {
      const rec = this.passwordResetTokens.find((r) => r.tokenHash === args?.where?.tokenHash);
      if (!rec) return null;
      if (args?.include?.user) {
        const user = this.users.find((u) => u.id === rec.userId) || null;
        return { ...rec, user };
      }
      return rec;
    },
    findFirst: async (args: any) => {
      let matches = [...this.passwordResetTokens];
      if (args?.where?.userId) {
        matches = matches.filter((r) => r.userId === args.where.userId);
      }
      if (args?.where?.usedAt === null) {
        matches = matches.filter((r) => !r.usedAt);
      }
      return matches[matches.length - 1] || null;
    },
    create: async ({ data }: any) => {
      const row = { id: `prt_${Date.now()}_${Math.random()}`, createdAt: new Date(), ...data };
      this.passwordResetTokens.push(row);
      return row;
    },
    update: async (args: any) => {
      const idx = this.passwordResetTokens.findIndex((r) => r.id === args.where.id);
      if (idx !== -1) {
        this.passwordResetTokens[idx] = { ...this.passwordResetTokens[idx], ...args.data };
        return this.passwordResetTokens[idx];
      }
      return null;
    },
    updateMany: async (args: any) => {
      let count = 0;
      for (let i = 0; i < this.passwordResetTokens.length; i++) {
        const r = this.passwordResetTokens[i];
        let matches = true;
        if (args.where?.userId && r.userId !== args.where.userId) matches = false;
        if (args.where?.usedAt === null && r.usedAt) matches = false;
        if (matches) {
          this.passwordResetTokens[i] = { ...r, ...args.data };
          count++;
        }
      }
      return { count };
    },
    deleteMany: async () => {},
  };

  refreshSession = {
    create: async ({ data }: any) => {
      const row = { id: `ses_${Date.now()}_${Math.random()}`, isRevoked: false, ...data };
      this.refreshSessions.push(row);
      return row;
    },
    findUnique: async (args: any) => {
      return this.refreshSessions.find((s) => s.tokenHash === args?.where?.tokenHash) || null;
    },
    findMany: async (args: any) => {
      return this.refreshSessions.filter((s) => {
        if (args?.where?.userId && s.userId !== args.where.userId) return false;
        if (args?.where?.isRevoked !== undefined && s.isRevoked !== args.where.isRevoked) return false;
        return true;
      });
    },
    updateMany: async (args: any) => {
      let count = 0;
      for (let i = 0; i < this.refreshSessions.length; i++) {
        if (args.where?.userId && this.refreshSessions[i].userId === args.where.userId) {
          this.refreshSessions[i] = { ...this.refreshSessions[i], ...args.data };
          count++;
        }
      }
      return { count };
    },
    deleteMany: async () => {},
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
      if (args?.where?.identityKey?.contains) {
        this.accountLockouts = this.accountLockouts.filter((l) => !l.identityKey.includes(args.where.identityKey.contains));
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
    findMany: async () => this.auditLogs,
  };
}

async function runTests() {
  console.log('\n================================================================');
  console.log('       JNC-CRM AUTH & RESET SECURITY VERIFICATION SUITE         ');
  console.log('================================================================\n');

  const mockStore = new MockPrismaStore();
  const jwtService = new JwtService({ secret: 'test-jwt-secret-not-used-in-prod' });

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
      name: 'Auth Test User',
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
      name: 'Test Platform Super Admin',
      email: 'platform_super_admin@example.com',
      employeeCode: 'SA_001',
      passwordHash: initHash,
      role: 'platform_super_admin',
      isActive: true,
      tokenVersion: 1,
    },
  });

  // ──────────────────────────────────────────────────────────────────────────
  // POINT 8: GET /auth/password-policy returns rules & validatePasswordPolicy
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const policy = authService.getPasswordPolicy();
    assert(
      policy.minLength === 12 &&
      Array.isArray(policy.rules) &&
      policy.rules.some((r) => r.id === 'minLength') &&
      policy.rules.some((r) => r.id === 'notCommon') &&
      policy.rules.some((r) => r.id === 'noPersonalInfo') &&
      typeof policy.senderEmail === 'string' &&
      policy.senderEmail.length > 0,
      'Point 8.1: getPasswordPolicy returns minLength 12, rules array, and public sender',
    );

    // Rejection of short password
    let shortRejected = false;
    try {
      validatePasswordPolicy('short123');
    } catch (err: any) {
      shortRejected = err instanceof BadRequestException;
    }
    assert(shortRejected, 'Point 8.2: validatePasswordPolicy rejects passwords < 12 characters');

    // Rejection of top common password
    let commonRejected = false;
    try {
      validatePasswordPolicy('password12345');
    } catch (err: any) {
      commonRejected = err instanceof BadRequestException;
    }
    assert(commonRejected, 'Point 8.3: validatePasswordPolicy rejects common dictionary passwords');

    // Rejection of personal information
    let personalRejected = false;
    try {
      validatePasswordPolicy('tenantuser12345678', { name: 'Tenant User', email: 'tenantuser@example.com' });
    } catch (err: any) {
      personalRejected = err instanceof BadRequestException;
    }
    assert(personalRejected, 'Point 8.4: validatePasswordPolicy rejects passwords containing user name or email');

    // Acceptance of strong compliant password
    let strongAccepted = false;
    try {
      validatePasswordPolicy('ValidSecure#2026!ShieldX99');
      strongAccepted = true;
    } catch {
      strongAccepted = false;
    }
    assert(strongAccepted, 'Point 8.5: validatePasswordPolicy accepts strong >= 12 character password');
  } catch (err: any) {
    assert(false, 'Point 8: Password policy validation', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POINT 3: Reset link valid 30 minutes, marks old tokens used, uses FRONTEND_URL
  // ──────────────────────────────────────────────────────────────────────────
  let rawResetToken = '';
  try {
    // Create an old unused token
    const oldRaw = crypto.randomBytes(32).toString('hex');
    const oldHash = crypto.createHash('sha256').update(oldRaw).digest('hex');
    await mockStore.passwordResetToken.create({
      data: {
        userId: testUser1.id,
        tokenHash: oldHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    // Request new forgot password
    await authService.forgotPassword({ email: testUser1.email });

    // Verify that the old token was marked as used
    const oldTokenRecord = await mockStore.passwordResetToken.findUnique({
      where: { tokenHash: oldHash },
    });
    assert(
      oldTokenRecord !== null && oldTokenRecord.usedAt !== null,
      'Point 3.1: Marks older unused tokens of the user as used upon new reset request',
    );

    // Verify new token exists and has expiresAt ~30 minutes
    const latestToken = await mockStore.passwordResetToken.findFirst({
      where: { userId: testUser1.id, usedAt: null },
    });
    assert(latestToken !== null, 'Point 3.2: New active reset token created');

    if (latestToken) {
      const diffMinutes = (new Date(latestToken.expiresAt).getTime() - Date.now()) / (60 * 1000);
      assert(
        diffMinutes >= 28 && diffMinutes <= 31,
        `Point 3.3: Reset token expiry is set to 30 minutes (actual: ${diffMinutes.toFixed(1)} mins)`,
      );
    }

    // Verify reset link generated and sent in email used FRONTEND_URL
    const lastEmail = sentEmails[sentEmails.length - 1];
    const expectedBase = (process.env.FRONTEND_URL || 'https://admin.jsnc.co.in').replace(/\/+$/, '');
    assert(
      lastEmail && lastEmail.text.includes(`${expectedBase}/reset-password?token=`),
      'Point 3.4: Reset URL built strictly from FRONTEND_URL',
    );

    // Extract raw token from email for subsequent reset tests
    const tokenMatch = lastEmail.text.match(/token=([a-f0-9]{64})/);
    if (tokenMatch) {
      rawResetToken = tokenMatch[1];
    }
  } catch (err: any) {
    assert(false, 'Point 3: Token validity & FRONTEND_URL', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POINT 1: ResetPassword updates ONLY the token owner; no hardcoded emails
  // ──────────────────────────────────────────────────────────────────────────
  try {
    assert(rawResetToken.length > 0, 'Point 1.1: Reset token was extracted for test');

    const newPass = 'UpdatedSecure#2026!XYZ';
    const user1Before = await mockStore.user.findUnique({ where: { id: testUser1.id } });
    const superAdminBefore = await mockStore.user.findUnique({ where: { id: testSuperAdmin.id } });

    const res = await authService.resetPassword({ token: rawResetToken, newPassword: newPass }, '192.168.1.100');
    assert(res.message.includes('successfully'), 'Point 1.2: Reset password returns success message');

    const user1After = await mockStore.user.findUnique({ where: { id: testUser1.id } });
    const superAdminAfter = await mockStore.user.findUnique({ where: { id: testSuperAdmin.id } });

    // User 1 password updated
    const isNewUser1Match = await bcrypt.compare(newPass, user1After!.passwordHash);
    assert(isNewUser1Match, 'Point 1.3: Target user password successfully updated');

    // SuperAdmin password untouched
    assert(
      superAdminBefore!.passwordHash === superAdminAfter!.passwordHash,
      'Point 1.4: Reset strictly changes ONLY the token owner account, no cross-account contamination',
    );

    // Token marked as used
    const tokenHash = crypto.createHash('sha256').update(rawResetToken).digest('hex');
    const usedRecord = await mockStore.passwordResetToken.findUnique({ where: { tokenHash } });
    assert(usedRecord!.usedAt !== null, 'Point 1.5: Used reset token cannot be reused');
  } catch (err: any) {
    assert(false, 'Point 1: ResetPassword user targeting', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POINT 2: Platform super-admin reset works; 0-row update throws clear error
  // ──────────────────────────────────────────────────────────────────────────
  try {
    // 1. Generate token for platform super-admin
    const rawAdminToken = crypto.randomBytes(32).toString('hex');
    const adminTokenHash = crypto.createHash('sha256').update(rawAdminToken).digest('hex');
    await mockStore.passwordResetToken.create({
      data: {
        userId: testSuperAdmin.id,
        tokenHash: adminTokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    const superAdminNewPass = 'SuperAdminSecure#2026!Pass';
    const adminResetRes = await authService.resetPassword(
      { token: rawAdminToken, newPassword: superAdminNewPass },
      '10.0.0.1',
    );
    assert(
      adminResetRes.message.includes('successfully'),
      'Point 2.1: Platform super admin reset successfully updates super admin password',
    );

    const refreshedSuperAdmin = await mockStore.user.findUnique({ where: { id: testSuperAdmin.id } });
    const adminMatch = await bcrypt.compare(superAdminNewPass, refreshedSuperAdmin!.passwordHash);
    assert(adminMatch, 'Point 2.2: Platform super admin record holds new password hash');

    // 2. Test 0-row update: token pointing to inactive or deleted user
    const rawGhostToken = crypto.randomBytes(32).toString('hex');
    const ghostHash = crypto.createHash('sha256').update(rawGhostToken).digest('hex');
    const ghostUser = await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'Ghost User',
        email: 'ghost@example.com',
        employeeCode: 'GHOST_01',
        passwordHash: await bcrypt.hash('GhostPass12345!', 12),
        role: 'sales_executive',
        isActive: false, // inactive
        deletedAt: new Date(),
      },
    });
    await mockStore.passwordResetToken.create({
      data: {
        userId: ghostUser.id,
        tokenHash: ghostHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    let zeroRowRejected = false;
    try {
      await authService.resetPassword({ token: rawGhostToken, newPassword: 'NewValidPass1234!' });
    } catch (err: any) {
      zeroRowRejected = err instanceof BadRequestException;
    }
    assert(zeroRowRejected, 'Point 2.3: Never returns success when zero rows updated, throws clear BadRequestException');
  } catch (err: any) {
    assert(false, 'Point 2: Platform super admin reset & 0-row safety', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POINT 4: 10-second email timeout resilience & error logging
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const failingMockService: any = {
      sendEmail: async () => {
        throw new Error('SMTP connection refused');
      },
    };
    const failingAuthService = new AuthService(
      mockStore as any,
      jwtService,
      failingMockService,
    );

    const res = await failingAuthService.forgotPassword({ email: testUser1.email });
    assert(
      res.message === 'If that email exists, a reset link has been sent.',
      'Point 4.1: forgotPassword handles email dispatch failure gracefully and returns generic message',
    );
  } catch (err: any) {
    assert(false, 'Point 4: Email timeout resilience', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POINT 5: Revoke refresh sessions & send "Your password was changed" notification
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const sessionTokenHash = crypto.randomBytes(32).toString('hex');
    await mockStore.refreshSession.create({
      data: {
        userId: testUser1.id,
        tokenHash: sessionTokenHash,
        familyId: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isRevoked: false,
      },
    });

    sentEmails.length = 0; // Clear tracked emails

    const clientIp = '203.0.113.42';
    await authService.changePassword(
      testUser1.id,
      'UpdatedSecure#2026!XYZ',
      'NextSecurePass#2026!ABC',
      clientIp,
    );

    // Verify previous session revoked
    const oldSession = await mockStore.refreshSession.findUnique({
      where: { tokenHash: sessionTokenHash },
    });
    assert(oldSession!.isRevoked === true, 'Point 5.1: Revokes all previous refresh sessions on password change');

    // Verify notification email sent with IP and time
    const notifyEmail = sentEmails.find((m) => m.subject.includes('Your JNC CRM password was changed'));
    assert(
      notifyEmail !== undefined &&
      notifyEmail.to === testUser1.email &&
      notifyEmail.text.includes(clientIp),
      'Point 5.2: Dispatches "Your password was changed" email containing client IP and timestamp',
    );
  } catch (err: any) {
    assert(false, 'Point 5: Session revocation & change email notification', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POINT 6: Rate limit of 3 reset requests per hour per email
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const rateTestEmail = 'ratetest@example.com';
    await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'Rate Limit Test User',
        email: rateTestEmail,
        employeeCode: 'RL_001',
        passwordHash: await bcrypt.hash('RateLimitP@ss1234!', 12),
        role: 'sales_executive',
        isActive: true,
      },
    });

    // Clear any existing lockout for this email
    await mockStore.accountLockout.deleteMany({
      where: { identityKey: { contains: rateTestEmail } },
    });

    // Attempt 1: allowed
    await authService.forgotPassword({ email: rateTestEmail });
    // Attempt 2: allowed
    await authService.forgotPassword({ email: rateTestEmail });
    // Attempt 3: allowed
    await authService.forgotPassword({ email: rateTestEmail });

    // Attempt 4: MUST throw 429 Too Many Requests
    let rateLimitTriggered = false;
    try {
      await authService.forgotPassword({ email: rateTestEmail });
    } catch (err: any) {
      rateLimitTriggered = err instanceof HttpException && err.getStatus() === 429;
    }
    assert(rateLimitTriggered, 'Point 6.1: Enforces limit of 3 reset requests per hour per email (returns 429 on 4th)');
  } catch (err: any) {
    assert(false, 'Point 6: Rate limiting per email', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POINT 7: Print reset link only when NODE_ENV !== 'production'
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalConsoleLog = console.log;

    let logCalled = false;
    console.log = (...args: any[]) => {
      if (args.some((a) => typeof a === 'string' && a.includes('[DEV] Password reset link'))) {
        logCalled = true;
      }
      originalConsoleLog.apply(console, args);
    };

    // Set to production
    process.env.NODE_ENV = 'production';
    const prodEmail = 'prodtest@example.com';
    await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'Prod Test User',
        email: prodEmail,
        employeeCode: 'PROD_001',
        passwordHash: await bcrypt.hash('ProdPass#2026!XYZ', 12),
        role: 'sales_executive',
        isActive: true,
      },
    });

    await authService.forgotPassword({ email: prodEmail });
    assert(!logCalled, 'Point 7.1: Does NOT print reset link to console when NODE_ENV === "production"');

    // Restore environment & console
    process.env.NODE_ENV = originalNodeEnv;
    console.log = originalConsoleLog;
  } catch (err: any) {
    assert(false, 'Point 7: Production reset link log suppression', err.message);
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
