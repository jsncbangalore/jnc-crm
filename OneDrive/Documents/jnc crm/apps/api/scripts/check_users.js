const path = require('path');
const { PrismaClient } = require(path.resolve(__dirname, '../../../node_modules/@prisma/client'));
const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany({
    include: { tenant: true }
  });
  console.log(users.map(u => ({
    id: u.id,
    name: u.name,
    employeeCode: u.employeeCode,
    email: u.email,
    role: u.role,
    tenantId: u.tenantId,
    tenantCode: u.tenant ? u.tenant.code : null,
    tenantName: u.tenant ? u.tenant.name : null,
  })));
}

check().finally(() => prisma.$disconnect());
