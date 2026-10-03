const path = require('path');
const { assertNotProductionDb } = require('./safety-check');
assertNotProductionDb('reset_user_passwords');
const { PrismaClient } = require(path.resolve(__dirname, '../../../node_modules/@prisma/client'));
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function resetPasswords() {
  const defaultPassword = 'Admin@123456';
  const hash = await bcrypt.hash(defaultPassword, 10);

  console.log('🔄 Resetting passwords & unlocking accounts in Supabase DB...\n');

  // Clear AccountLockout table
  await prisma.accountLockout.deleteMany({});

  const users = await prisma.user.findMany();
  for (const user of users) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hash,
        failedLoginAttempts: 0,
        lockoutUntil: null,
        isActive: true,
      },
    });
    console.log(`✅ Updated: ${user.name}`);
    console.log(`   Username/Code: ${user.employeeCode} or Email: ${user.email}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Password set to: "${defaultPassword}"\n`);
  }
}

resetPasswords()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
