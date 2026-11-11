const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const password = 'Password@123456';
  const passwordHash = await bcrypt.hash(password, 10);

  // 1. Prepare Tenant
  let tenant = await prisma.tenant.findFirst({
    where: { code: 'TEST-CORP-001' }
  });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        code: 'TEST-CORP-001',
        name: 'Test Corporation',
        slug: 'test-corp-001',
        planTier: 'enterprise',
        requireTwoFactor: true,
      }
    });
  } else {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { requireTwoFactor: true }
    });
  }

  // 10 days ago for expired grace period (grace period is 7 days)
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

  // 2. Prepare Company Admin (tenant_admin) with expired grace period
  const companyAdminEmail = 'company-admin-test@example.internal';
  let companyAdmin = await prisma.user.findFirst({
    where: { email: companyAdminEmail, tenantId: tenant.id }
  });
  if (companyAdmin) {
    await prisma.user.update({
      where: { id: companyAdmin.id },
      data: {
        passwordHash,
        role: 'tenant_admin',
        isActive: true,
        firstLoginAfter2FaReleaseAt: tenDaysAgo,
        failedLoginAttempts: 0,
        lockoutUntil: null,
      }
    });
    // Remove any existing 2FA so they are forced to setup
    await prisma.userTwoFactor.deleteMany({ where: { userId: companyAdmin.id } });
  } else {
    companyAdmin = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        employeeCode: 'EMP-CORP-001',
        name: 'Company Admin Test',
        email: companyAdminEmail,
        passwordHash,
        role: 'tenant_admin',
        isActive: true,
        firstLoginAfter2FaReleaseAt: tenDaysAgo,
      }
    });
  }

  // 3. Prepare Platform Owner (platform_super_admin) with expired grace period
  const platformOwnerEmail = 'platform-owner-test@example.internal';
  let platformOwner = await prisma.user.findFirst({
    where: { email: platformOwnerEmail, tenantId: null, role: 'platform_super_admin' }
  });
  if (platformOwner) {
    await prisma.user.update({
      where: { id: platformOwner.id },
      data: {
        passwordHash,
        role: 'platform_super_admin',
        isActive: true,
        firstLoginAfter2FaReleaseAt: tenDaysAgo,
        failedLoginAttempts: 0,
        lockoutUntil: null,
      }
    });
    // Remove any existing 2FA
    await prisma.userTwoFactor.deleteMany({ where: { userId: platformOwner.id } });
  } else {
    platformOwner = await prisma.user.create({
      data: {
        tenantId: null,
        employeeCode: 'PSA-CORP-001',
        name: 'Platform Owner Test',
        email: platformOwnerEmail,
        passwordHash,
        role: 'platform_super_admin',
        isActive: true,
        firstLoginAfter2FaReleaseAt: tenDaysAgo,
      }
    });
  }

  console.log('Seeded test users successfully:');
  console.log('Company Admin:', companyAdminEmail, 'Tenant:', tenant.code, 'firstLoginAfter2FaReleaseAt:', tenDaysAgo.toISOString());
  console.log('Platform Owner:', platformOwnerEmail, 'firstLoginAfter2FaReleaseAt:', tenDaysAgo.toISOString());
}

main().catch(console.error).finally(() => prisma.$disconnect());
