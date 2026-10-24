/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { assertNotProductionDb } from './safety-check';

function generateSecurePassword(): string {
  // Generate a cryptographically secure random password with upper, lower, digit, special char
  const randomBytes = crypto.randomBytes(12).toString('base64url');
  return `Dev!${randomBytes}9#`;
}

async function main() {
  assertNotProductionDb('setup-dev-db');

  const prisma = new PrismaClient();

  try {
    console.log('\n========================================================================');
    console.log('[DEV DATABASE SETUP] Initializing development database environment...');
    console.log('========================================================================\n');

    const defaultCode = (process.env.DEFAULT_TENANT_CODE || 'DEMO').toUpperCase();
    const defaultName = process.env.PRODUCT_NAME || 'Demo Workspace';

    // 1. Create or update Default Tenant
    const defaultTenant = await prisma.tenant.upsert({
      where: { code: defaultCode },
      update: {
        name: defaultName,
        isInternal: true,
        status: 'active',
      },
      create: {
        code: defaultCode,
        name: defaultName,
        isInternal: true,
        status: 'active',
      },
    });
    console.log(`[OK] Internal Tenant verified: [${defaultTenant.code}] ${defaultTenant.name} (ID: ${defaultTenant.id})`);

    // 2. Generate random one-time passwords
    const tenantAdminPassword = generateSecurePassword();
    const superAdminPassword = generateSecurePassword();

    const tenantAdminHash = await bcrypt.hash(tenantAdminPassword, 10);
    const superAdminHash = await bcrypt.hash(superAdminPassword, 10);

    // 3. Upsert Tenant Admin
    const tenantAdminEmail = (process.env.DEV_TENANT_ADMIN_EMAIL || 'tenantadmin@example.com').toLowerCase();
    const tenantAdmin = await prisma.user.upsert({
      where: { email: tenantAdminEmail },
      update: {
        name: 'Workspace Admin',
        role: 'tenant_admin',
        tenantId: defaultTenant.id,
        employeeCode: `EMP-${defaultCode}-001`,
        passwordHash: tenantAdminHash,
        isActive: true,
        deletedAt: null,
      },
      create: {
        email: tenantAdminEmail,
        name: 'Workspace Admin',
        role: 'tenant_admin',
        tenantId: defaultTenant.id,
        employeeCode: `EMP-${defaultCode}-001`,
        passwordHash: tenantAdminHash,
        isActive: true,
      },
    });
    console.log(`[OK] Tenant Admin verified: ${tenantAdmin.email} (Tenant: ${defaultTenant.code})`);

    // 4. Upsert Platform Super Admin
    const superAdminEmail = (process.env.DEV_SUPERADMIN_EMAIL || 'superadmin@example.com').toLowerCase();
    const superAdmin = await prisma.user.upsert({
      where: { email: superAdminEmail },
      update: {
        name: 'Platform Super Admin',
        role: 'platform_super_admin',
        tenantId: null,
        employeeCode: 'PSA-001',
        passwordHash: superAdminHash,
        isActive: true,
        deletedAt: null,
      },
      create: {
        email: superAdminEmail,
        name: 'Platform Super Admin',
        role: 'platform_super_admin',
        tenantId: null,
        employeeCode: 'PSA-001',
        passwordHash: superAdminHash,
        isActive: true,
      },
    });
    console.log(`[OK] Platform Super Admin verified: ${superAdmin.email} (Cross-tenant Platform Owner)`);

    // 5. Print credentials ONCE to console
    console.log('\n========================================================================');
    console.log('CRITICAL: DEVELOPMENT CREDENTIALS GENERATED (PRINTED ONCE - SAVE THESE NOW)');
    console.log('========================================================================');
    console.log('1. Workspace Admin:');
    console.log(`   Email:    ${tenantAdminEmail}`);
    console.log(`   Password: ${tenantAdminPassword}`);
    console.log(`   Role:     tenant_admin`);
    console.log(`   Tenant:   ${defaultCode} (isInternal: true)`);
    console.log('------------------------------------------------------------------------');
    console.log('2. Platform Super Admin:');
    console.log(`   Email:    ${superAdminEmail}`);
    console.log(`   Password: ${superAdminPassword}`);
    console.log(`   Role:     platform_super_admin`);
    console.log(`   Tenant:   null (Platform Scope)`);
    console.log('========================================================================\n');
  } catch (err: any) {
    console.error('[!] Failed to set up dev database:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}
