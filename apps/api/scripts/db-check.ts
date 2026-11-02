import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

try {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const idx = line.indexOf('=');
      if (idx > 0 && !line.trim().startsWith('#')) {
        const k = line.substring(0, idx).trim();
        let v = line.substring(idx + 1).trim();
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
} catch (e) {}

import { assertNotProductionDb } from './safety-check';

assertNotProductionDb('db-check');

const prisma = new PrismaClient();

async function main() {
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@') : 'not set');

  const uCols: any = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'User' AND column_name IN ('tokenVersion', 'mustResetPassword');
  `);
  console.log('User columns:', uCols);

  const tCols: any = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'Tenant' AND column_name IN ('isInternal', 'code');
  `);
  console.log('Tenant columns:', tCols);

  const tenants: any = await prisma.$queryRawUnsafe(`
    SELECT id, code, name, "isInternal" FROM "Tenant";
  `);
  console.log('Tenants in DB:', tenants);

  const users: any = await prisma.$queryRawUnsafe(`
    SELECT id, email, "employeeCode", role, "tenantId", "tokenVersion", "mustResetPassword" FROM "User"
    WHERE role IN ('platform_super_admin', 'tenant_admin');
  `);
  console.log('Admin Users in DB:', users);

  try {
    const migrations: any = await prisma.$queryRawUnsafe(`SELECT * FROM "_prisma_migrations";`);
    console.log('Prisma migrations in DB:', migrations);
  } catch (err: any) {
    console.log('Prisma migrations table error:', err.message);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
