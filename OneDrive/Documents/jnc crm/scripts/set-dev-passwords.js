const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const platformPass = await bcrypt.hash('Jsnc@2024jsn', 10);
  const ownerPass = await bcrypt.hash('Jsnc@2024jsn', 10);

  // 1. Platform Super Admin -> jayarajjnc@gmail.com
  const superAdmin = await prisma.user.updateMany({
    where: { OR: [{ role: 'platform_super_admin' }, { employeeCode: 'SYS-SUP-001' }] },
    data: {
      email: 'jayarajjnc@gmail.com',
      passwordHash: platformPass,
      mustResetPassword: false,
      isActive: true,
      failedLoginAttempts: 0,
      lockoutUntil: null,
    },
  });
  console.log(`Updated ${superAdmin.count} platform super admin records to jayarajjnc@gmail.com.`);

  // 2. Company Owner -> santhoshs0815@gmail.com
  const owner = await prisma.user.updateMany({
    where: { OR: [{ employeeCode: 'JNC-SA-001' }, { employeeCode: 'EMP-ADM-001' }] },
    data: {
      email: 'santhoshs0815@gmail.com',
      passwordHash: ownerPass,
      mustResetPassword: false,
      isActive: true,
      failedLoginAttempts: 0,
      lockoutUntil: null,
    },
  });
  console.log(`Updated ${owner.count} company owner records to santhoshs0815@gmail.com.`);

  await prisma.$disconnect();
}

main().catch(console.error);
