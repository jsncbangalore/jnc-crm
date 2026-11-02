const fs = require('fs');
const path = require('path');

const envPath = path.resolve('apps/api/.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const acmeTenants = await prisma.$queryRaw`
    SELECT id, name, code FROM "Tenant"
    WHERE name ILIKE '%Acme%' OR code = 'ACME'
  `;
  console.log('Acme tenants in dev db:', acmeTenants);

  const allTenants = await prisma.$queryRaw`
    SELECT id, name, code FROM "Tenant"
  `;
  console.log('All tenants in dev db:', allTenants);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
