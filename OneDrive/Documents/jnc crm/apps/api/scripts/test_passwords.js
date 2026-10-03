const path = require('path');
const { assertNotProductionDb } = require('./safety-check');
assertNotProductionDb('test_passwords');
const { PrismaClient } = require(path.resolve(__dirname, '../../../node_modules/@prisma/client'));
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

const COMMON_PASSWORDS = [
  'Admin@123',
  'Password@123',
  'Jnc@2024',
  'JNC@2024',
  '123456',
  'admin',
  'password',
  'SuperAdmin@123',
  'Jayaraj@123',
  'Punith@123',
  'Santhosh@123',
  'Sanketh@123'
];

async function testPasswords() {
  const users = await prisma.user.findMany();
  for (const user of users) {
    console.log(`\nTesting user: ${user.name} (${user.employeeCode} / ${user.email})`);
    let found = false;
    for (const pwd of COMMON_PASSWORDS) {
      const match = await bcrypt.compare(pwd, user.passwordHash);
      if (match) {
        console.log(`  ✅ MATCH FOUND! Password is: "${pwd}"`);
        found = true;
        break;
      }
    }
    if (!found) {
      console.log(`  ❌ None of common passwords matched.`);
    }
  }
}

testPasswords()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
