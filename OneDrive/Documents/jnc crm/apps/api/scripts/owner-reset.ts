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

function generateRandomSecurePassword(): string {
  // Generate random bytes and assemble a password meeting policy (>= 12 chars, symbols, upper, lower, digits)
  const randomSuffix = crypto.randomBytes(12).toString('base64url');
  return `Jnc#Admin${randomSuffix}9!`;
}

async function main() {
  assertNotProductionDb('owner:reset');

  const prisma = new PrismaClient();

  try {
    const targetEmail = (process.env.OWNER_EMAIL || 'tenantadmin@jsnc.co.in').trim().toLowerCase();

    // 1. Find or create internal JNC tenant
    let internalTenant = await prisma.tenant.findFirst({
      where: { isInternal: true, deletedAt: null },
    });

    if (!internalTenant) {
      internalTenant = await prisma.tenant.findUnique({
        where: { code: 'JNC' },
      });
    }

    if (!internalTenant) {
      internalTenant = await prisma.tenant.create({
        data: {
          code: 'JNC',
          slug: 'jnc',
          name: 'JNC Network & Power Solutions',
          isInternal: true,
          status: 'active',
          isOnboarded: true,
        },
      });
    } else if (!internalTenant.isInternal || internalTenant.status !== 'active') {
      internalTenant = await prisma.tenant.update({
        where: { id: internalTenant.id },
        data: { isInternal: true, status: 'active', deletedAt: null },
      });
    }

    // 2. Find owner user
    let owner: any = null;
    if (process.env.OWNER_EMAIL) {
      owner = await prisma.user.findFirst({
        where: {
          tenantId: internalTenant.id,
          email: { equals: targetEmail, mode: 'insensitive' },
          deletedAt: null,
        },
      });
    }

    if (!owner) {
      owner = await prisma.user.findFirst({
        where: {
          tenantId: internalTenant.id,
          role: 'tenant_admin',
          deletedAt: null,
        },
      });
    }

    if (!owner) {
      owner = await prisma.user.findFirst({
        where: {
          tenantId: internalTenant.id,
          email: { equals: targetEmail, mode: 'insensitive' },
          deletedAt: null,
        },
      });
    }

    // 3. Password selection & validation
    let finalPassword = '';
    let isGenerated = false;
    const envPassword = process.env.OWNER_PASSWORD;

    if (envPassword && envPassword.trim().length > 0) {
      const emailForPolicy = owner?.email || targetEmail;
      const nameForPolicy = owner?.name || 'JNC Tenant Admin';
      try {
        validatePasswordPolicy(envPassword, {
          email: emailForPolicy,
          name: nameForPolicy,
        });
      } catch (err: any) {
        console.error(`\n[ERROR] Provided OWNER_PASSWORD failed validation: ${err.message}\n`);
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

    // 4. Create or update user
    if (!owner) {
      owner = await prisma.user.create({
        data: {
          tenantId: internalTenant.id,
          email: targetEmail,
          name: 'JNC Tenant Admin',
          role: 'tenant_admin',
          employeeCode: 'EMP-JNC-001',
          passwordHash,
          isActive: true,
          mustResetPassword: false,
          tokenVersion: 1,
          failedLoginAttempts: 0,
          lockoutUntil: null,
        },
      });
    } else {
      owner = await prisma.user.update({
        where: { id: owner.id },
        data: {
          role: 'tenant_admin',
          passwordHash,
          isActive: true,
          deletedAt: null,
          mustResetPassword: false,
          tokenVersion: (owner.tokenVersion || 0) + 1,
          failedLoginAttempts: 0,
          lockoutUntil: null,
        },
      });
    }

    // 5. Clear AccountLockout rows
    const lockKeys = [
      `${owner.email.toLowerCase()}:${internalTenant.id}`,
      owner.email.toLowerCase(),
      `${owner.employeeCode.toLowerCase()}:${internalTenant.id}`,
      targetEmail,
      `${targetEmail}:${internalTenant.id}`,
    ];

    await prisma.accountLockout.deleteMany({
      where: {
        identityKey: { in: lockKeys },
      },
    }).catch(() => {});

    // 6. Print once to console
    console.log('\n========================================================================');
    console.log('JNC OWNER ACCOUNT CREDENTIALS (LOCAL ONLY)');
    console.log('========================================================================');
    console.log(`Company Code:   ${internalTenant.code}`);
    console.log(`Email:          ${owner.email}`);
    console.log(`Employee Code:  ${owner.employeeCode}`);
    if (isGenerated) {
      console.log(`Password:       (generated securely - never printed to console)`);
    } else {
      console.log(`Password:       (set from environment - never printed to console)`);
    }
    console.log('========================================================================\n');
  } catch (err: any) {
    console.error(`\n[ERROR] owner:reset failed: ${err.message}\n`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
