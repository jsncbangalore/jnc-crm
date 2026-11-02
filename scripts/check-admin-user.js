const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev'
    }
  }
});

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: 'admin@example.com' }
  });
  console.log('admin@example.com status:', {
    isActive: user.isActive,
    failedAttempts: user.failedLoginAttempts,
    lockoutUntil: user.lockoutUntil,
    passwordHash: user.passwordHash?.substring(0, 15)
  });
  await prisma.$disconnect();
}
main().catch(console.error);
