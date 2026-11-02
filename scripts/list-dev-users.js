const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev'
    }
  }
});

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true, employeeCode: true, tenantId: true }
  });
  console.log('Users in dev db:');
  for (const u of users) {
    console.log(`- ${u.email} (${u.role}, code: ${u.employeeCode}, tenant: ${u.tenantId})`);
  }
  await prisma.$disconnect();
}
main().catch(console.error);
