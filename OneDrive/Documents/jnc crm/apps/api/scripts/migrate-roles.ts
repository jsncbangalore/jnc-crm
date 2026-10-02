/**
 * Idempotent Role & Tenant Migration Script (Phase 1 Item 5)
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/migrate-roles.ts [--dry-run]
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';

// Pre-load .env
try {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.substring(0, idx).trim();
        let val = trimmed.substring(idx + 1).trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.substring(1, val.length - 1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    });
  }
} catch (e) {}

import { assertNotProductionDb } from './safety-check';

assertNotProductionDb('migrate-roles');

const prisma = new PrismaClient();
const isDryRun = process.argv.includes('--dry-run');

function generateSecurePassword(length = 16): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()_+';
  let pass = '';
  for (let i = 0; i < length; i++) {
    pass += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return pass;
}

async function main() {
  console.log('--------------------------------------------------');
  console.log(`Starting Role Migration [dryRun = ${isDryRun}]`);
  console.log('--------------------------------------------------\n');

  const summary = {
    jncTenantAction: 'none',
    jncTenantId: '',
    bossUserUpdated: false,
    platformAdminCreated: false,
    platformAdminEmail: '',
    platformAdminCode: '',
    legacySuperAdminsConverted: 0,
  };

  // Ensure Tenant.isInternal column exists in database
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "isInternal" BOOLEAN NOT NULL DEFAULT false;`);
  } catch (e) {
    console.warn('[Schema] Failed to execute raw ALTER TABLE:', e);
  }

  // 1. Ensure Tenant with code 'JNC' exists
  let jncTenant = await prisma.tenant.findFirst({
    where: {
      OR: [
        { code: 'JNC' },
        { code: 'JNC-ORG-001' },
        { id: 'default-tenant-id' },
      ],
    },
  });

  if (!jncTenant) {
    summary.jncTenantAction = 'create';
    console.log('[Tenant] No JNC tenant found. Creating tenant with code JNC...');
    if (!isDryRun) {
      jncTenant = await prisma.tenant.create({
        data: {
          code: 'JNC',
          name: 'JSNC Network & Power Solutions',
          slug: 'jnc',
          status: 'active',
          planTier: 'enterprise',
          maxUsers: 100,
          city: 'Bengaluru',
          state: 'Karnataka',
          invoicePrefix: 'JNC-INV',
        },
      });
      summary.jncTenantId = jncTenant.id;
    }
  } else {
    summary.jncTenantId = jncTenant.id;
    if (jncTenant.code !== 'JNC') {
      summary.jncTenantAction = `update code from ${jncTenant.code} to JNC`;
      console.log(`[Tenant] Updating tenant ${jncTenant.id} code to JNC...`);
      if (!isDryRun) {
        jncTenant = await prisma.tenant.update({
          where: { id: jncTenant.id },
          data: {
            code: 'JNC',
            slug: 'jnc',
            name: jncTenant.name || 'JSNC Network & Power Solutions',
            isInternal: true,
          },
        });
      }
    } else {
      summary.jncTenantAction = 'already exists (code: JNC)';
      console.log(`[Tenant] JNC tenant verified: ${jncTenant.id} (code: JNC)`);
    }

    // Ensure isInternal column exists and update JNC tenant
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "isInternal" BOOLEAN NOT NULL DEFAULT false;`);
    } catch (e) {}

    if (jncTenant && !jncTenant.isInternal) {
      console.log(`[Tenant] Marking JNC tenant (${jncTenant.id}) as internal (isInternal = true)...`);
      if (!isDryRun) {
        jncTenant = await prisma.tenant.update({
          where: { id: jncTenant.id },
          data: { isInternal: true },
        });
      }
    }
  }

  // 2. Move Boss Account JNC-SA-001 into the JNC tenant as tenant_admin
  const boss = await prisma.user.findFirst({
    where: {
      OR: [
        { employeeCode: 'JNC-SA-001' },
        { email: 'Jayarajjnc@gmail.com' },
        { email: 'owner@jncnetwork.com' },
      ],
    },
  });

  if (boss) {
    const needsUpdate = boss.role !== 'tenant_admin' || boss.tenantId !== jncTenant?.id;
    if (needsUpdate) {
      console.log(`[Boss User] Moving user ${boss.employeeCode} (${boss.email}) to role tenant_admin in tenant ${jncTenant?.id}...`);
      if (!isDryRun && jncTenant) {
        await prisma.user.update({
          where: { id: boss.id },
          data: {
            role: 'tenant_admin',
            tenantId: jncTenant.id,
          },
        });
      }
      summary.bossUserUpdated = true;
    } else {
      console.log(`[Boss User] ${boss.employeeCode} (${boss.email}) is already tenant_admin in JNC tenant.`);
    }
  } else {
    console.log('[Boss User] Notice: User JNC-SA-001 not found.');
  }

  // 3. Create platform_super_admin user with tenantId = null
  const platformEmail = (process.env.PLATFORM_ADMIN_EMAIL || 'platform@jsnc.co.in').trim().toLowerCase();
  const platformCode = (process.env.PLATFORM_ADMIN_CODE || 'PSA-001').trim().toUpperCase();
  summary.platformAdminEmail = platformEmail;
  summary.platformAdminCode = platformCode;

  const existingPlatformUser = await prisma.user.findFirst({
    where: {
      OR: [
        { role: 'platform_super_admin' },
        { email: platformEmail },
        { employeeCode: platformCode },
      ],
    },
  });

  if (!existingPlatformUser) {
    const tempPassword = generateSecurePassword(16);
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    console.log(`[Platform Owner] Creating platform_super_admin with tenantId = null (${platformEmail})...`);

    if (!isDryRun) {
      await prisma.user.create({
        data: {
          employeeCode: platformCode,
          name: 'Platform Super Administrator',
          email: platformEmail,
          passwordHash,
          role: 'platform_super_admin',
          tenantId: null,
          isActive: true,
          mustResetPassword: true,
          tokenVersion: 0,
        },
      });
    }

    console.log('\n=============================================================');
    console.log('🚨 NEW PLATFORM SUPER ADMIN CREATED (ONE-TIME DISPLAY)');
    console.log('=============================================================');
    console.log(`  Email:             ${platformEmail}`);
    console.log(`  Employee Code:     ${platformCode}`);
    console.log(`  Temporary Password: ${tempPassword}`);
    console.log('  Must Reset Pass:   true');
    console.log('=============================================================\n');
    summary.platformAdminCreated = true;
  } else {
    console.log(`[Platform Owner] Platform admin exists: ${existingPlatformUser.employeeCode} (${existingPlatformUser.email})`);
    if (existingPlatformUser.role !== 'platform_super_admin' || existingPlatformUser.tenantId !== null) {
      console.log(`[Platform Owner] Ensuring existing user ${existingPlatformUser.email} has role=platform_super_admin and tenantId=null...`);
      if (!isDryRun) {
        await prisma.user.update({
          where: { id: existingPlatformUser.id },
          data: {
            role: 'platform_super_admin',
            tenantId: null,
          },
        });
      }
    }
  }

  // 4. Convert every remaining legacy role 'super_admin' to tenant_admin
  const remainingSuperAdmins = await prisma.user.findMany({
    where: {
      role: 'super_admin',
    },
  });

  if (remainingSuperAdmins.length > 0) {
    console.log(`[Legacy Migration] Found ${remainingSuperAdmins.length} users with legacy role 'super_admin'.`);
    for (const legacyUser of remainingSuperAdmins) {
      const assignedTenantId = legacyUser.tenantId || jncTenant?.id;
      console.log(`  -> Converting ${legacyUser.employeeCode} (${legacyUser.email}) to tenant_admin (tenantId: ${assignedTenantId})...`);
      if (!isDryRun && assignedTenantId) {
        await prisma.user.update({
          where: { id: legacyUser.id },
          data: {
            role: 'tenant_admin',
            tenantId: assignedTenantId,
          },
        });
      }
      summary.legacySuperAdminsConverted++;
    }
  } else {
    console.log('[Legacy Migration] Zero remaining legacy super_admin roles found.');
  }

  console.log('\n--------------------------------------------------');
  console.log('Migration Summary');
  console.log('--------------------------------------------------');
  console.log(JSON.stringify(summary, null, 2));
  console.log('--------------------------------------------------\n');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
