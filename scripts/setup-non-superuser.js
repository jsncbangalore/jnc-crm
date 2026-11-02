const { PrismaClient } = require('@prisma/client');

async function setupNonSuperuser() {
  console.log('--- SETTING UP NON-SUPERUSER DATABASE ROLE ---');
  const superPrisma = new PrismaClient({
    datasources: { db: { url: 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev' } }
  });

  await superPrisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'jnc_app') THEN
        CREATE ROLE jnc_app WITH LOGIN PASSWORD 'jnc_app_pass_dev_2026' NOSUPERUSER NOCREATEDB NOCREATEROLE;
      ELSE
        ALTER ROLE jnc_app WITH LOGIN PASSWORD 'jnc_app_pass_dev_2026' NOSUPERUSER NOCREATEDB NOCREATEROLE;
      END IF;
    END
    $$;
  `);

  await superPrisma.$executeRawUnsafe(`GRANT ALL PRIVILEGES ON DATABASE jnc_crm_dev TO jnc_app;`);
  await superPrisma.$executeRawUnsafe(`GRANT ALL ON SCHEMA public TO jnc_app;`);
  await superPrisma.$executeRawUnsafe(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO jnc_app;`);
  await superPrisma.$executeRawUnsafe(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO jnc_app;`);
  await superPrisma.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO jnc_app;`);
  await superPrisma.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO jnc_app;`);

  await superPrisma.$executeRawUnsafe(`ALTER ROLE jnc_app SET search_path TO public;`);
  const tables = await superPrisma.$queryRawUnsafe(`SELECT schemaname, tablename, tableowner FROM pg_tables WHERE schemaname = 'public' LIMIT 5;`);
  console.log('Public tables sample:', tables);
  await superPrisma.$disconnect();

  // Test connecting as jnc_app using Prisma
  const appPrisma = new PrismaClient({
    datasources: { db: { url: 'postgresql://jnc_app:jnc_app_pass_dev_2026@localhost:5432/jnc_crm_dev' } }
  });

  const userInfo = await appPrisma.$queryRawUnsafe(`SELECT current_user, usesuper FROM pg_user WHERE usename = current_user;`);
  console.log('Connected as:', userInfo[0]);
  if (userInfo[0].usesuper) {
    throw new Error('Expected jnc_app to be NON-SUPERUSER, but usesuper is true!');
  }
  console.log('✓ Verified: jnc_app is a NON-SUPERUSER database role (usesuper = false)!');

  await superPrisma.$executeRawUnsafe(`ALTER ROLE jnc_app WITH NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;`);
  const rlsTables = await superPrisma.$queryRawUnsafe(`SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true;`);
  console.log('Tables with RLS enabled:', rlsTables.length);

  const superUsers = await superPrisma.user.findMany();
  console.log('Superuser saw users:', superUsers.length);
  const appUsers = await appPrisma.user.findMany();
  console.log('jnc_app (non-superuser with BYPASSRLS) saw users:', appUsers.length);

  await appPrisma.$disconnect();
}

setupNonSuperuser().catch(err => {
  console.error(err);
  process.exit(1);
});
