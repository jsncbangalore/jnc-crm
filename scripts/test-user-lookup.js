const fs = require('fs');
const path = require('path');
const envPath = path.resolve('apps/api/.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(l => {
    const t = l.trim();
    if (t && !t.startsWith('#') && t.includes('=')) {
      const idx = t.indexOf('=');
      process.env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  });
}
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const u = await prisma.user.findFirst({
      where: { email: 'admin@zzclienttest.com' }
    });
    console.log('User status:', {
      failedLoginAttempts: u.failedLoginAttempts,
      lockoutUntil: u.lockoutUntil,
      isActive: u.isActive,
      passwordHashLen: u.passwordHash.length
    });
    const match = await bcrypt.compare('DevPassword@123', u.passwordHash);
    console.log('Password match:', match);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}
main();
