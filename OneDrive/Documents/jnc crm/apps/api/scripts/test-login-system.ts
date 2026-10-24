/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthService } from '../src/auth/auth.service';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`[PASS] ${testName}${detail ? ' -> ' + detail : ''}`);
  } else {
    failed++;
    console.error(`[FAIL] ${testName}${detail ? ' -> ' + detail : ''}`);
  }
}

async function runLoginTests() {
  console.log('========================================================================');
  console.log('LOGIN REDESIGN & MULTI-COMPANY SELECTION TEST SUITE');
  console.log('========================================================================\n');

  const jwtService = new JwtService({ secret: 'test-secret-32-chars-long-minimum!' });

  const passwordHash = await bcrypt.hash('CorrectPass@123', 10);
  const wrongPasswordHash = await bcrypt.hash('OtherPass@123', 10);

  // Mock tenants
  const tenantAlpha = { id: 'tenant-alpha', code: 'ALPHA', name: 'Alpha Corp', slug: 'alpha', status: 'active' };
  const tenantBeta = { id: 'tenant-beta', code: 'BETA', name: 'Beta Ltd', slug: 'beta', status: 'active' };
  const tenantSuspended = { id: 'tenant-susp', code: 'SUSP', name: 'Suspended Org', slug: 'susp', status: 'suspended' };

  // Mock users
  const userAlpha = {
    id: 'user-alpha',
    tenantId: 'tenant-alpha',
    tenant: tenantAlpha,
    email: 'shared@example.com',
    employeeCode: 'EMP-A',
    role: 'employee',
    passwordHash,
    isActive: true,
    deletedAt: null,
    tokenVersion: 1,
  };

  const userBeta = {
    id: 'user-beta',
    tenantId: 'tenant-beta',
    tenant: tenantBeta,
    email: 'shared@example.com',
    employeeCode: 'EMP-B',
    role: 'employee',
    passwordHash,
    isActive: true,
    deletedAt: null,
    tokenVersion: 1,
  };

  const platformAdmin = {
    id: 'user-platform-admin',
    tenantId: null,
    tenant: null,
    email: 'superadmin@example.com',
    employeeCode: 'PSA-001',
    role: 'platform_super_admin',
    passwordHash,
    isActive: true,
    deletedAt: null,
    tokenVersion: 1,
  };

  const deactivatedUser = {
    id: 'user-deactivated',
    tenantId: 'tenant-alpha',
    tenant: tenantAlpha,
    email: 'inactive@example.com',
    employeeCode: 'INACT-001',
    role: 'employee',
    passwordHash,
    isActive: false,
    deletedAt: null,
    tokenVersion: 1,
  };

  const suspendedTenantUser = {
    id: 'user-suspended-tenant',
    tenantId: 'tenant-susp',
    tenant: tenantSuspended,
    email: 'susp@example.com',
    employeeCode: 'SUSP-001',
    role: 'employee',
    passwordHash,
    isActive: true,
    deletedAt: null,
    tokenVersion: 1,
  };

  const usedTokens = new Set<string>();

  // Mock PrismaService
  const mockPrisma: any = {
    accountLockout: {
      findUnique: async () => null,
      delete: async () => ({}),
      upsert: async () => ({ failedAttempts: 1 }),
      update: async () => ({}),
    },
    usedSelectionToken: {
      findUnique: async ({ where }: any) => (usedTokens.has(where.jti) ? { jti: where.jti } : null),
      create: async ({ data }: any) => { usedTokens.add(data.jti); return data; },
    },
    user: {
      findMany: async ({ where }: any) => {
        const results = [];
        const rawEmail = where.OR?.[0]?.email?.equals;
        if (rawEmail === 'shared@example.com') {
          if (!where.tenantId || where.tenantId === 'tenant-alpha') results.push(userAlpha);
          if (!where.tenantId || where.tenantId === 'tenant-beta') results.push(userBeta);
        }
        if (rawEmail === 'superadmin@example.com') {
          results.push(platformAdmin);
        }
        if (rawEmail === 'inactive@example.com') {
          results.push(deactivatedUser);
        }
        if (rawEmail === 'susp@example.com') {
          results.push(suspendedTenantUser);
        }
        return results;
      },
      findFirst: async ({ where }: any) => {
        if (where.role === 'platform_super_admin' && where.email?.equals === 'superadmin@example.com') {
          return platformAdmin;
        }
        if (where.id?.in) {
          if (where.id.in.includes('user-alpha') && where.tenantId === 'tenant-alpha') return userAlpha;
          if (where.id.in.includes('user-beta') && where.tenantId === 'tenant-beta') return userBeta;
        }
        return null;
      },
      update: async () => ({}),
    },
    tenant: {
      findFirst: async ({ where }: any) => {
        const code = where.OR?.[0]?.code?.equals;
        if (code === 'ALPHA') return tenantAlpha;
        if (code === 'BETA') return tenantBeta;
        return null;
      },
    },
    auditLog: {
      create: async () => ({}),
    },
    refreshSession: {
      create: async () => ({}),
      update: async () => ({}),
      updateMany: async () => ({ count: 0 }),
      findUnique: async () => null,
      deleteMany: async () => ({ count: 0 }),
    },
  };

  const authService = new AuthService(mockPrisma, jwtService);

  // ─── Test 1: Single matching company -> logs in directly ────────────────────
  console.log('--- 1. SINGLE COMPANY LOGIN ---');
  const singleResult = await authService.login({
    identifier: 'shared@example.com',
    password: 'CorrectPass@123',
    companyCode: 'ALPHA',
  });
  assert(
    !!singleResult.accessToken && !!singleResult.refreshToken && singleResult.user.id === 'user-alpha',
    'Login with company code ALPHA logs in directly to Alpha Corp',
  );

  // ─── Test 2: Multi-company: same email + password in 2 companies, no code ────
  console.log('\n--- 2. MULTI-COMPANY SELECTION TRIGGER ---');
  const multiResult = await authService.login({
    identifier: 'shared@example.com',
    password: 'CorrectPass@123',
  });
  assert(
    multiResult.requiresCompanySelection === true &&
    Array.isArray(multiResult.companies) &&
    multiResult.companies.length === 2 &&
    !multiResult.accessToken &&
    !!multiResult.selectionToken,
    'No companyCode + 2 matches returns requiresCompanySelection, 2 companies, and selectionToken (no access token)',
  );

  // ─── Test 3: Select company with valid selectionToken ──────────────────────
  console.log('\n--- 3. SELECT COMPANY FLOW ---');
  const selectResult = await authService.selectCompany({
    selectionToken: multiResult.selectionToken,
    companyCode: 'BETA',
  });
  assert(
    !!selectResult.accessToken && selectResult.user.id === 'user-beta',
    'select-company returns tokens for Beta Ltd',
  );

  // ─── Test 4: Reused selectionToken is rejected ────────────────────────────
  console.log('\n--- 4. SINGLE-USE SELECTION TOKEN ---');
  let tokenReused = false;
  try {
    await authService.selectCompany({
      selectionToken: multiResult.selectionToken,
      companyCode: 'BETA',
    });
  } catch (e: any) {
    if (e instanceof UnauthorizedException) tokenReused = true;
  }
  assert(tokenReused, 'Reused selectionToken is rejected with UnauthorizedException');

  // ─── Test 5: Wrong password on multi-tenant email -> generic error ──────────
  console.log('\n--- 5. WRONG PASSWORD TIMING & GENERIC ERROR ---');
  let wrongPassGeneric = false;
  try {
    await authService.login({
      identifier: 'shared@example.com',
      password: 'WrongPassword@999',
    });
  } catch (e: any) {
    if (e instanceof UnauthorizedException && e.message === 'Invalid credentials.') {
      wrongPassGeneric = true;
    }
  }
  assert(wrongPassGeneric, 'Wrong password returns generic "Invalid credentials." without company list');

  // ─── Test 6: platform_super_admin on /auth/login -> generic error ───────────
  console.log('\n--- 6. PLATFORM ADMIN BLOCKED ON /auth/login ---');
  let psaBlockedOnStaff = false;
  try {
    await authService.login({
      identifier: 'superadmin@example.com',
      password: 'CorrectPass@123',
    });
  } catch (e: any) {
    if (e instanceof UnauthorizedException && e.message === 'Invalid credentials.') {
      psaBlockedOnStaff = true;
    }
  }
  assert(psaBlockedOnStaff, 'platform_super_admin on /auth/login returns generic "Invalid credentials."');

  // ─── Test 7: platform_super_admin on /platform-auth/login -> logs in ───────
  console.log('\n--- 7. PLATFORM ADMIN ON /platform-auth/login ---');
  const psaResult = await authService.platformLogin({
    email: 'superadmin@example.com',
    password: 'CorrectPass@123',
  });
  assert(
    !!psaResult.accessToken && psaResult.user.role === 'platform_super_admin',
    'platform_super_admin logs in successfully via /platform-auth/login',
  );

  // ─── Test 8: Tenant user on /platform-auth/login -> generic error ──────────
  console.log('\n--- 8. TENANT USER BLOCKED ON /platform-auth/login ---');
  let tenantBlockedOnPlatform = false;
  try {
    await authService.platformLogin({
      email: 'shared@example.com',
      password: 'CorrectPass@123',
    });
  } catch (e: any) {
    if (e instanceof UnauthorizedException && e.message === 'Invalid credentials.') {
      tenantBlockedOnPlatform = true;
    }
  }
  assert(tenantBlockedOnPlatform, 'Tenant user on /platform-auth/login returns generic "Invalid credentials."');

  // ─── Test 9: Deactivated user is rejected ─────────────────────────────────
  console.log('\n--- 9. DEACTIVATED USER REJECTED ---');
  let deactivatedBlocked = false;
  try {
    await authService.login({
      identifier: 'inactive@example.com',
      password: 'CorrectPass@123',
    });
  } catch (e: any) {
    if (e instanceof UnauthorizedException && e.message.includes('deactivated')) {
      deactivatedBlocked = true;
    }
  }
  assert(deactivatedBlocked, 'Deactivated user is rejected with clear deactivation message');

  // ─── Test 10: Suspended company user is rejected ──────────────────────────
  console.log('\n--- 10. SUSPENDED COMPANY USER REJECTED ---');
  let suspendedBlocked = false;
  try {
    await authService.login({
      identifier: 'susp@example.com',
      password: 'CorrectPass@123',
    });
  } catch (e: any) {
    if (e instanceof UnauthorizedException && e.message.includes('suspended')) {
      suspendedBlocked = true;
    }
  }
  assert(suspendedBlocked, 'Suspended company user is rejected with suspended status message');

  // ─── Final Summary ─────────────────────────────────────────────────────────
  console.log('\n========================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED, 0 SKIPPED`);
  console.log('========================================================================\n');

  if (failed > 0) process.exit(1);
}

runLoginTests().catch((e) => {
  console.error('Test runner fatal error:', e);
  process.exit(1);
});
