const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev' } }
});

async function main() {
  const leads = await prisma.lead.findMany({
    orderBy: { createdAt: 'desc' }
  });
  console.log(`Total leads in DB: ${leads.length}`);
  for (const l of leads) {
    console.log(`- ${l.leadNumber} (id=${l.id}): status=${l.status}, email=${l.email}, phone=${l.phone}, tenantId=${l.tenantId}`);
  }
  await prisma.$disconnect();
}
main().catch(console.error);
