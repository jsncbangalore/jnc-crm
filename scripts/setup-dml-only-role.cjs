const { PrismaClient } = require('@prisma/client');

async function main() {
  console.log('--- CONFIGURING JNC_APP AS NOBYPASSRLS DML-ONLY ROLE ---');
  const superPrisma = new PrismaClient({
    datasources: { db: { url: 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev' } }
  });

  // 1. Enforce NOBYPASSRLS on jnc_app
  await superPrisma.$executeRawUnsafe(`ALTER ROLE jnc_app WITH NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;`);

  // 2. Revoke DDL grants on public schema
  await superPrisma.$executeRawUnsafe(`REVOKE CREATE ON SCHEMA public FROM jnc_app;`);

  // 3. Grant DML-only (SELECT, INSERT, UPDATE, DELETE) on tables and USAGE/SELECT on sequences
  await superPrisma.$executeRawUnsafe(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM jnc_app;`);
  await superPrisma.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO jnc_app;`);
  await superPrisma.$executeRawUnsafe(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO jnc_app;`);
  await superPrisma.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO jnc_app;`);
  await superPrisma.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO jnc_app;`);

  // 4. Create explicit RML/DML policies for jnc_app across all public tables
  await superPrisma.$executeRawUnsafe(`
    DO $$
    DECLARE
      tbl RECORD;
    BEGIN
      FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS jnc_app_dml_policy ON public.%I;', tbl.tablename);
        EXECUTE format('CREATE POLICY jnc_app_dml_policy ON public.%I FOR ALL TO jnc_app USING (true) WITH CHECK (true);', tbl.tablename);
      END LOOP;
    END $$;
  `);

  // 5. Verify role attributes
  const roleInfo = await superPrisma.$queryRawUnsafe(`
    SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls
    FROM pg_roles
    WHERE rolname = 'jnc_app';
  `);
  console.log('Updated jnc_app Role Attributes:');
  console.table(roleInfo);

  // 6. Test DDL attempt fails with jnc_app
  const appPrisma = new PrismaClient({
    datasources: { db: { url: 'postgresql://jnc_app:jnc_app_pass_dev_2026@localhost:5432/jnc_crm_dev' } }
  });

  let ddlBlocked = false;
  try {
    await appPrisma.$executeRawUnsafe(`CREATE TABLE test_ddl_fail (id int);`);
  } catch (err) {
    ddlBlocked = true;
    console.log(`✓ Verified DDL is blocked for jnc_app: ${err.message}`);
  }

  if (!ddlBlocked) {
    throw new Error('Security violation: jnc_app was able to execute DDL CREATE TABLE!');
  }

  // 7. Test DML works properly
  const userCount = await appPrisma.user.count();
  console.log(`✓ Verified DML SELECT works for jnc_app: ${userCount} users found.`);

  await superPrisma.$disconnect();
  await appPrisma.$disconnect();
  console.log('--- JNC_APP ROLE SETUP COMPLETE & VERIFIED ---');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
