const { Client } = require('pg');

async function test() {
  const client = new Client({ connectionString: 'postgresql://jnc_app:jnc_app_pass_dev_2026@localhost:5432/jnc_crm_dev' });
  await client.connect();

  const roleRes = await client.query("SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls FROM pg_roles WHERE rolname = 'jnc_app'");
  console.log('Role Privileges:', roleRes.rows[0]);

  try {
    await client.query('CREATE TABLE ddl_test_table (id int)');
    console.log('UNEXPECTED: DDL succeeded');
  } catch (err) {
    console.log('DDL Blocked as expected:', err.code, err.message);
  }

  // Verify DML works
  const dmlRes = await client.query('SELECT count(*) FROM "Tenant"');
  console.log('DML Select works: Count =', dmlRes.rows[0].count);

  await client.end();
}

test().catch(console.error);
