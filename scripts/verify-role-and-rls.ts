import { PrismaClient } from '@prisma/client';

async function test() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: 'postgresql://jnc_app:jnc_app_pass_dev_2026@localhost:5432/jnc_crm_dev?schema=public',
      },
    },
  });
  await prisma.$connect();

  const roleRes: any[] = await prisma.$queryRawUnsafe(
    "SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls FROM pg_roles WHERE rolname = 'jnc_app'"
  );
  console.log('Role Privileges:', roleRes[0]);

  try {
    await prisma.$executeRawUnsafe('CREATE TABLE ddl_test_table (id int)');
    console.log('UNEXPECTED: DDL succeeded');
  } catch (err: any) {
    console.log('DDL Blocked as expected:', err?.code, err?.meta?.message || err?.message);
  }

  // Verify DML works
  const dmlRes: any[] = await prisma.$queryRawUnsafe('SELECT count(*) FROM "Tenant"');
  console.log('DML Select works: Count =', dmlRes[0].count);

  await prisma.$disconnect();
}

test().catch(console.error);
