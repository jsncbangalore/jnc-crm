/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { PrismaClient } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../apps/api/src/auth/auth.service';

const DEV_DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev?schema=public';
process.env.DATABASE_URL = DEV_DATABASE_URL;

const prisma = new PrismaClient({
  datasources: {
    db: { url: DEV_DATABASE_URL },
  },
});
const jwtService = new JwtService({ secret: process.env.JWT_SECRET || 'test-jwt-secret-crm-2026' });
const mockNotificationsService = {
  dispatchNotification: async () => {},
  sendEmail: async () => {},
} as any;
const authService = new AuthService(prisma as any, jwtService, mockNotificationsService);

const ENV_MODES: Array<string | undefined> = ['production', 'staging', 'development', 'test', undefined];

const FORBIDDEN_PASSWORDS = [
  'admin',
  'password',
  'Admin@123',
  'DemoPassword123!',
  'secret123',
];

async function runBackdoorRemovalTests() {
  console.log('========================================================================');
  console.log('TEST: LOGIN BACKDOOR & DEV FALLBACK REMOVAL VERIFICATION');
  console.log('Verifying backdoors fail across ALL NODE_ENV modes (production, staging, dev, test, unset)');
  console.log('Verifying seeded fake account succeeds ONLY with seed password');
  console.log('========================================================================\n');

  const originalEnv = process.env.NODE_ENV;
  const mockReq = { ip: '127.0.0.1', headers: {}, socket: { remoteAddress: '127.0.0.1' } } as any;

  try {
    for (const envMode of ENV_MODES) {
      if (envMode === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = envMode;
      }
      console.log(`\n--- Testing under NODE_ENV = ${envMode ?? 'UNSET'} ---`);

      // 1. Test 'admin' alias removal with various passwords
      for (const pass of ['DevPassword@123', ...FORBIDDEN_PASSWORDS]) {
        try {
          await authService.login({ identifier: 'admin', password: pass } as any, mockReq);
          throw new Error(`CRITICAL VULNERABILITY: Login succeeded with identifier 'admin' and password '${pass}' under NODE_ENV=${envMode}!`);
        } catch (err: any) {
          if (err instanceof UnauthorizedException || err.message?.includes('Invalid') || err.status === 401) {
            // Expected
          } else {
            throw err;
          }
        }
      }
      console.log(`✓ 'admin' alias rejected for all passwords under NODE_ENV=${envMode ?? 'UNSET'}`);

      // 2. Test forbidden passwords on real seeded user (tenant-admin@example.com)
      for (const pass of FORBIDDEN_PASSWORDS) {
        try {
          await authService.login({ identifier: 'tenant-admin@example.com', password: pass } as any, mockReq);
          throw new Error(`CRITICAL VULNERABILITY: Login succeeded for tenant-admin with forbidden password '${pass}' under NODE_ENV=${envMode}!`);
        } catch (err: any) {
          if (err instanceof UnauthorizedException || err.message?.includes('Invalid') || err.status === 401) {
            // Expected
          } else {
            throw err;
          }
        }
      }
      console.log(`✓ Dev fallback passwords (${FORBIDDEN_PASSWORDS.join(', ')}) strictly rejected under NODE_ENV=${envMode ?? 'UNSET'}`);

      // Reset any lockout from failed attempts so valid login can be tested
      await prisma.accountLockout.deleteMany({}).catch(() => {});
      await prisma.user.updateMany({
        where: { email: 'tenant-admin@example.com' },
        data: { failedLoginAttempts: 0, lockoutUntil: null },
      }).catch(() => {});

      // 3. Test genuine seeded account with valid seed password
      const validResult: any = await authService.login(
        { identifier: 'tenant-admin@example.com', password: 'DevPassword@123' } as any,
        mockReq,
      );
      if (!validResult || (!validResult.accessToken && !validResult.requiresTwoFactor && !validResult.requiresCompanySelection)) {
        throw new Error(`Genuine seeded login failed for valid seed password under NODE_ENV=${envMode}!`);
      }
      console.log(`✓ Seeded fake account logs in successfully with seed password under NODE_ENV=${envMode ?? 'UNSET'}`);
    }

    console.log('\n========================================================================');
    console.log('[PASS] ALL LOGIN BACKDOOR & FALLBACK REMOVAL TESTS PASSED SUCCESSFULLY!');
    console.log('========================================================================\n');
  } finally {
    process.env.NODE_ENV = originalEnv;
    await prisma.$disconnect();
  }
}

runBackdoorRemovalTests().catch((err) => {
  console.error('\n[FAIL] Backdoor removal test failed:', err);
  process.exit(1);
});
