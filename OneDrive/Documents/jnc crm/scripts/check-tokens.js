const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tokens = await prisma.passwordResetToken.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { email: true, employeeCode: true, role: true } } },
  });
  console.log('Recent PasswordResetTokens in DB:');
  tokens.forEach((t) => {
    console.log(`ID: ${t.id} | User: ${t.user?.email} (${t.user?.employeeCode}) | Used: ${t.usedAt} | Expires: ${t.expiresAt} | Created: ${t.createdAt}`);
  });

  const checkEmail = process.env.CHECK_EMAIL || 'user@example.com';
  const users = await prisma.user.findMany({
    where: { email: checkEmail },
    select: { id: true, email: true, employeeCode: true, role: true, tenantId: true }
  });
  console.log(`\nUsers matching ${checkEmail}:`);
  console.dir(users);

  await prisma.$disconnect();
}

main().catch(console.error);
