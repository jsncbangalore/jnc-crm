const pgPath = require('fs').existsSync('C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824/scratch/pg-runner/node_modules/pg')
  ? 'C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824/scratch/pg-runner/node_modules/pg'
  : 'pg';
const { Client } = require(pgPath);

async function main() {
  const c = new Client('postgresql://postgres:postgres@localhost:5432/postgres');
  await c.connect();
  const res = await c.query("SELECT 1 FROM pg_roles WHERE rolname = 'jnc_app'");
  if (res.rowCount === 0) {
    await c.query("CREATE ROLE jnc_app WITH LOGIN SUPERUSER PASSWORD 'jnc_app_pass_dev_2026'");
    console.log('Created role jnc_app');
  } else {
    await c.query("ALTER ROLE jnc_app WITH SUPERUSER PASSWORD 'jnc_app_pass_dev_2026'");
    console.log('Updated role jnc_app');
  }
  await c.end();
}

main().catch(console.error);
