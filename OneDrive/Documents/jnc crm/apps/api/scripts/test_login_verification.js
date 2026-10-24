const path = require('path');
const { assertNotProductionDb } = require('./safety-check');
assertNotProductionDb('test_login_verification');
const { PrismaClient } = require(path.resolve(__dirname, '../../../node_modules/@prisma/client'));
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function testLogin() {
  const code = process.env.TEST_EMPLOYEE_CODE || 'ADM-001';
  const user = await prisma.user.findFirst({ where: { employeeCode: code } });
  if (!user) {
    console.error(`User ${code} not found!`);
    return;
  }
  const match = await bcrypt.compare('Admin@123456', user.passwordHash);
  console.log(`Login Test for ${code} with "Admin@123456":`, match ? '[PASS] SUCCESS' : '[FAIL] FAILED');
}

testLogin()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
