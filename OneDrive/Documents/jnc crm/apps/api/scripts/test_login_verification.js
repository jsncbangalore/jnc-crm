const path = require('path');
const { assertNotProductionDb } = require('./safety-check');
assertNotProductionDb('test_login_verification');
const { PrismaClient } = require(path.resolve(__dirname, '../../../node_modules/@prisma/client'));
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function testLogin() {
  const user = await prisma.user.findFirst({ where: { employeeCode: 'JNC-SA-001' } });
  if (!user) {
    console.error('User JNC-SA-001 not found!');
    return;
  }
  const match = await bcrypt.compare('Admin@123456', user.passwordHash);
  console.log('Login Test for JNC-SA-001 with "Admin@123456":', match ? '✅ SUCCESS' : '❌ FAILED');
}

testLogin()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
