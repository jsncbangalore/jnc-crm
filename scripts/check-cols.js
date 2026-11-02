const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({ datasources: { db: { url: 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev?schema=public' } } });

async function run() {
  await p.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneVerified" BOOLEAN NOT NULL DEFAULT false');
  await p.$executeRawUnsafe('ALTER TABLE "UserTwoFactor" ADD COLUMN IF NOT EXISTS "pendingSecretEnc" TEXT');
  const c1 = await p.$queryRawUnsafe(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'User' AND column_name LIKE 'phone%'`);
  const c2 = await p.$queryRawUnsafe(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'UserTwoFactor'`);
  console.log('User phone cols:', c1);
  console.log('UserTwoFactor cols:', c2);
  await p.$disconnect();
}

run().catch(console.error);
