/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { validatePasswordPolicy } from '../src/common/password-policy';
import { assertNotProductionDb } from './safety-check';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', 'host.docker.internal'];

function assertStrictlyLocalDb(contextName: string) {
  const rawUrl = process.env.DATABASE_URL || '';
  const dbUrl = rawUrl.trim().replace(/^['\"]|['\"]$/g, '');
  if (!dbUrl) {
    console.error(`\n[SECURITY ERROR] ${contextName} requires DATABASE_URL.\n`);
    process.exit(1);
  }
  try {
    const parsed = new URL(dbUrl);
    const hostname = parsed.hostname.toLowerCase();
    if (!LOCAL_HOSTS.includes(hostname)) {
      console.error(`\n[SECURITY REFUSAL] ${contextName} refused: database host "${hostname}" is not a local database. Strictly local databases only.\n`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`\n[SECURITY ERROR] ${contextName} has invalid DATABASE_URL: ${err.message}\n`);
    process.exit(1);
  }
}

function generateRandomSecurePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const all = upper + lower + digits + symbols;
  let pwd = '';
  pwd += upper[crypto.randomInt(0, upper.length)];
  pwd += lower[crypto.randomInt(0, lower.length)];
  pwd += digits[crypto.randomInt(0, digits.length)];
  pwd += symbols[crypto.randomInt(0, symbols.length)];
  for (let i = 4; i < 20; i++) {
    pwd += all[crypto.randomInt(0, all.length)];
  }
  return pwd.split('').sort(() => 0.5 - Math.random()).join('');
}

async function main() {
  assertStrictlyLocalDb('platform:reset');
  assertNotProductionDb('platform:reset');

  const prisma = new PrismaClient();

  try {
    const targetEmail = (process.env.PLATFORM_ADMIN_EMAIL || 'platform@jsnc.co.in').trim().toLowerCase();

    // 1. Find platform_super_admin user (tenantId null)
    let platformAdmin = await prisma.user.findFirst({
      where: {
        role: 'platform_super_admin',
        tenantId: null,
        email: { equals: targetEmail, mode: 'insensitive' },
      },
    });

    if (!platformAdmin) {
      platformAdmin = await prisma.user.findFirst({
        where: {
          role: 'platform_super_admin',
          tenantId: null,
        },
      });
    }

    if (!platformAdmin) {
      platformAdmin = await prisma.user.findFirst({
        where: {
          email: { equals: targetEmail, mode: 'insensitive' },
          tenantId: null,
        },
      });
    }

    // 2. Password selection & validation
    let finalPassword = '';
    let isGenerated = false;
    const envPassword = process.env.PLATFORM_PASSWORD;

    if (envPassword && envPassword.trim().length > 0) {
      try {
        validatePasswordPolicy(envPassword, {
          email: targetEmail,
          name: 'Platform Super Admin',
        });
      } catch (err: any) {
        console.error(`\n[ERROR] Provided PLATFORM_PASSWORD failed validation: ${err.message}\n`);
        process.exit(1);
      }
      finalPassword = envPassword;
      isGenerated = false;
    } else {
      finalPassword = generateRandomSecurePassword();
      validatePasswordPolicy(finalPassword);
      isGenerated = true;
    }

    const passwordHash = await bcrypt.hash(finalPassword, 12);

    // 3. Create or update user
    if (!platformAdmin) {
      platformAdmin = await prisma.user.create({
        data: {
          tenantId: null,
          email: targetEmail,
          name: 'Platform Super Admin',
          role: 'platform_super_admin',
          employeeCode: 'ADM-PLATFORM-001',
          passwordHash,
          isActive: true,
          mustResetPassword: false,
          tokenVersion: 1,
          failedLoginAttempts: 0,
          lockoutUntil: null,
        },
      });
    } else {
      platformAdmin = await prisma.user.update({
        where: { id: platformAdmin.id },
        data: {
          email: targetEmail,
          role: 'platform_super_admin',
          tenantId: null,
          passwordHash,
          isActive: true,
          deletedAt: null,
          mustResetPassword: false,
          tokenVersion: (platformAdmin.tokenVersion || 0) + 1,
          failedLoginAttempts: 0,
          lockoutUntil: null,
        },
      });
    }

    // 4. Clear AccountLockout rows
    const lockKeys = [
      `platform-email:${targetEmail}`,
      `platform-email:${platformAdmin.email?.toLowerCase()}`,
      `platform-ip:127.0.0.1`,
      `platform-ip:unknown`,
      targetEmail,
      platformAdmin.email?.toLowerCase(),
      platformAdmin.employeeCode?.toLowerCase(),
    ].filter(Boolean);

    await prisma.accountLockout.deleteMany({
      where: {
        identityKey: { in: lockKeys },
      },
    }).catch(() => {});

    // 5. Output details
    console.log(`Email:         ${platformAdmin.email}`);
    console.log(`Employee Code: ${platformAdmin.employeeCode}`);
    if (isGenerated) {
      console.log(`Password:      ${finalPassword}`);
    }
  } catch (err: any) {
    console.error(`\n[ERROR] platform:reset failed: ${err.message}\n`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
