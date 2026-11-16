const fs = require('fs');
const path = require('path');
const envPath = path.resolve(__dirname, '../apps/api/.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Querying orphan ProjectStockPosition rows with no matching SKU in Sku table...');
  const orphans = await prisma.$queryRawUnsafe(`
    SELECT p.id, p."tenantId", p.project, p."itemCode", p."partValue", p.quantity, p."createdAt"
    FROM "ProjectStockPosition" p
    LEFT JOIN "Sku" s ON p."tenantId" = s."tenantId" AND p."itemCode" = s."skuCode"
    WHERE s.id IS NULL
    ORDER BY p."createdAt" DESC
  `);
  console.log(`Found ${orphans.length} orphan project-stock row(s):`);
  console.table(orphans);
}

main().catch(console.error).finally(() => prisma.$disconnect());
