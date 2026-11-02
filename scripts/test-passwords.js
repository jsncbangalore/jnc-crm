const bcrypt = require('bcryptjs');
const hash = '$2a$12$P6O/8Qr/u4w5x3p0k0iWgej3rXwK0J1YqQ7B.i4H0C2H1U9P0O0K6'; // let's fetch full hash from db
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: { url: 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev' }
  }
});
async function test() {
  const u = await prisma.user.findFirst({ where: { email: 'admin@example.com' } });
  const passwords = [
    'DevPassword@123',
    'DemoPassword123!',
    'Password@123',
    'Admin@123',
    'Admin123!',
    'DevPassword123!',
    'JncCrm2026!'
  ];
  for (const p of passwords) {
    const match = await bcrypt.compare(p, u.passwordHash);
    console.log(p, '=>', match);
    if (match) break;
  }
  await prisma.$disconnect();
}
test();
