const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('[ERROR] This utility cannot be executed in production.');
    process.exit(1);
  }

  const platformEmail = process.env.PLATFORM_EMAIL?.trim();
  const platformPassword = process.env.PLATFORM_PASSWORD?.trim();
  const ownerEmail = process.env.OWNER_EMAIL?.trim();
  const ownerPassword = process.env.OWNER_PASSWORD?.trim();

  if (!platformEmail || !platformPassword || !ownerEmail || !ownerPassword) {
    console.error('[ERROR] Error: PLATFORM_EMAIL, PLATFORM_PASSWORD, OWNER_EMAIL, and OWNER_PASSWORD environment variables are required.');
    process.exit(1);
  }

  const platformPass = await bcrypt.hash(platformPassword, 10);
  const ownerPass = await bcrypt.hash(ownerPassword, 10);

  // 1. Platform Super Admin
  const superAdmin = await prisma.user.updateMany({
    where: { OR: [{ role: 'platform_super_admin' }, { employeeCode: 'SYS-SUP-001' }] },
    data: {
      email: platformEmail,
      passwordHash: platformPass,
      mustResetPassword: false,
      isActive: true,
      failedLoginAttempts: 0,
      lockoutUntil: null,
    },
  });
  console.log(`Updated ${superAdmin.count} platform super admin records.`);

  // 2. Company Owner
  const owner = await prisma.user.updateMany({
    where: { OR: [{ role: 'tenant_admin' }, { employeeCode: 'EMP-ADM-001' }] },
    data: {
      email: ownerEmail,
      passwordHash: ownerPass,
      mustResetPassword: false,
      isActive: true,
      failedLoginAttempts: 0,
      lockoutUntil: null,
    },
  });
  console.log(`Updated ${owner.count} company owner records.`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
