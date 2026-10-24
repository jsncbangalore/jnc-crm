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
    primaryTenantAction: 'none',
    primaryTenantId: '',
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

  const primaryCode = (process.env.PRIMARY_TENANT_CODE || 'PRIMARY').trim().toUpperCase();
  const primaryName = (process.env.PRIMARY_TENANT_NAME || 'Primary Organization').trim();
  const primaryPrefix = (process.env.PRIMARY_INVOICE_PREFIX || 'INV').trim();

  // 1. Ensure Tenant exists
  let primaryTenant = await prisma.tenant.findFirst({
    where: {
      OR: [
        { code: primaryCode },
        { id: 'default-tenant-id' },
      ],
    },
  });

  if (!primaryTenant) {
    summary.primaryTenantAction = 'create';
    console.log(`[Tenant] No primary tenant found. Creating tenant with code ${primaryCode}...`);
    if (!isDryRun) {
      primaryTenant = await prisma.tenant.create({
        data: {
          code: primaryCode,
          name: primaryName,
          slug: primaryCode.toLowerCase(),
          status: 'active',
          planTier: 'enterprise',
          maxUsers: 100,
          city: '',
          state: 'Karnataka',
          invoicePrefix: primaryPrefix,
        },
      });
      summary.primaryTenantId = primaryTenant.id;
    }
  } else {
    summary.primaryTenantId = primaryTenant.id;
    if (primaryTenant.code !== primaryCode) {
      summary.primaryTenantAction = `update code from ${primaryTenant.code} to ${primaryCode}`;
      console.log(`[Tenant] Updating tenant ${primaryTenant.id} code to ${primaryCode}...`);
      if (!isDryRun) {
        primaryTenant = await prisma.tenant.update({
          where: { id: primaryTenant.id },
          data: {
            code: primaryCode,
            slug: primaryCode.toLowerCase(),
            name: primaryTenant.name || primaryName,
            isInternal: true,
          },
        });
      }
    } else {
      summary.primaryTenantAction = `already exists (code: ${primaryCode})`;
      console.log(`[Tenant] Primary tenant verified: ${primaryTenant.id} (code: ${primaryCode})`);
    }

    // Ensure isInternal column exists and update primary tenant
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "isInternal" BOOLEAN NOT NULL DEFAULT false;`);
    } catch (e) {}

    if (primaryTenant && !primaryTenant.isInternal) {
      console.log(`[Tenant] Marking primary tenant (${primaryTenant.id}) as internal (isInternal = true)...`);
      if (!isDryRun) {
        primaryTenant = await prisma.tenant.update({
          where: { id: primaryTenant.id },
          data: { isInternal: true },
        });
      }
    }
  }

  // 2. Move Admin / Owner Account into the primary tenant as tenant_admin
  const boss = await prisma.user.findFirst({
    where: {
      OR: [
        { role: 'tenant_admin' },
        { role: 'admin' },
      ],
    },
  });

  if (boss) {
    const needsUpdate = boss.role !== 'tenant_admin' || boss.tenantId !== primaryTenant?.id;
    if (needsUpdate) {
      console.log(`[Admin User] Moving user ${boss.employeeCode} (${boss.email}) to role tenant_admin in tenant ${primaryTenant?.id}...`);
      if (!isDryRun && primaryTenant) {
        await prisma.user.update({
          where: { id: boss.id },
          data: {
            role: 'tenant_admin',
            tenantId: primaryTenant.id,
          },
        });
      }
      summary.bossUserUpdated = true;
    } else {
      console.log(`[Admin User] ${boss.employeeCode} (${boss.email}) is already tenant_admin in primary tenant.`);
    }
  } else {
    console.log('[Admin User] Notice: Existing admin user not found.');
  }

  // 3. Create platform_super_admin user with tenantId = null
  const platformEmail = (process.env.PLATFORM_ADMIN_EMAIL || 'platform@example.com').trim().toLowerCase();
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
    console.log('[NOTICE] NEW PLATFORM SUPER ADMIN CREATED (ONE-TIME DISPLAY)');
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
      const assignedTenantId = legacyUser.tenantId || primaryTenant?.id;
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
