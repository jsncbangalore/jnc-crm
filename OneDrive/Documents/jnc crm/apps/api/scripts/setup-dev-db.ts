/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const PROD_HOST = 'aws-0-ap-southeast-1.pooler.supabase.com';

function generateSecurePassword(): string {
  // Generate a cryptographically secure random password with upper, lower, digit, special char
  const randomBytes = crypto.randomBytes(12).toString('base64url');
  return `Jnc!${randomBytes}9#`;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL || '';
  if (dbUrl.includes(PROD_HOST)) {
    console.error('\n[SECURITY ERROR] setup-dev-db refused to run on production database!');
    console.error(`Host: ${PROD_HOST}\n`);
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    console.log('\n========================================================================');
    console.log('[DEV DATABASE SETUP] Initializing development database environment...');
    console.log('========================================================================\n');

    // 1. Create or update JNC Tenant
    const jncTenant = await prisma.tenant.upsert({
      where: { code: 'JNC' },
      update: {
        name: 'JNC Corp',
        isInternal: true,
        status: 'active',
      },
      create: {
        code: 'JNC',
        name: 'JNC Corp',
        isInternal: true,
        status: 'active',
      },
    });
    console.log(`[OK] Internal Tenant verified: [${jncTenant.code}] ${jncTenant.name} (ID: ${jncTenant.id})`);

    // 2. Generate random one-time passwords
    const tenantAdminPassword = generateSecurePassword();
    const superAdminPassword = generateSecurePassword();

    const tenantAdminHash = await bcrypt.hash(tenantAdminPassword, 10);
    const superAdminHash = await bcrypt.hash(superAdminPassword, 10);

    // 3. Upsert JNC Tenant Admin
    const tenantAdminEmail = 'tenantadmin@jsnc.co.in';
    const tenantAdmin = await prisma.user.upsert({
      where: { email: tenantAdminEmail },
      update: {
        name: 'JNC Tenant Admin',
        role: 'tenant_admin',
        tenantId: jncTenant.id,
        employeeCode: 'EMP-JNC-001',
        passwordHash: tenantAdminHash,
        isActive: true,
        deletedAt: null,
      },
      create: {
        email: tenantAdminEmail,
        name: 'JNC Tenant Admin',
        role: 'tenant_admin',
        tenantId: jncTenant.id,
        employeeCode: 'EMP-JNC-001',
        passwordHash: tenantAdminHash,
        isActive: true,
      },
    });
    console.log(`[OK] Tenant Admin verified: ${tenantAdmin.email} (Tenant: ${jncTenant.code})`);

    // 4. Upsert Platform Super Admin
    const superAdminEmail = 'superadmin@jsnc.co.in';
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
    console.log('1. JNC Tenant Admin:');
    console.log(`   Email:    ${tenantAdminEmail}`);
    console.log(`   Password: ${tenantAdminPassword}`);
    console.log(`   Role:     tenant_admin`);
    console.log(`   Tenant:   JNC (isInternal: true)`);
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
