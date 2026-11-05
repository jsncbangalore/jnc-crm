const fs = require('fs');
const path = require('path');

// Load environment variables from apps/api/.env
const envPath = path.resolve(__dirname, '../apps/api/.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const result = await prisma.$queryRaw`SELECT current_database() as db, 1 as ok`;
  console.log('Database connected successfully:', result);

  const legacyLead = await prisma.lead.findFirst({
    where: { customerPhone: '+915289541841' },
    select: { id: true, leadNumber: true, customerName: true, customerPhone: true, tenantId: true },
  });
  console.log('Legacy lead found in dev DB:', legacyLead);
}

run()
  .catch((err) => {
    console.error('Database connection error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
