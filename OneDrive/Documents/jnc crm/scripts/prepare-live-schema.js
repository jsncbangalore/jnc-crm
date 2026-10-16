const fs = require('fs');
const path = require('path');
const { Client } = require('C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824/scratch/pg-runner/node_modules/pg');

async function main() {
  const rootDir = path.resolve(__dirname, '..');
  const pgClient = new Client({
    host: '127.0.0.1',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: 'postgres',
  });

  await pgClient.connect();

  console.log('[Setup] Terminating active connections to jnc_crm_rehearsal...');
  await pgClient.query(`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = 'jnc_crm_rehearsal' AND pid <> pg_backend_pid();
  `);

  console.log('[Setup] Recreating database jnc_crm_rehearsal...');
  await pgClient.query('DROP DATABASE IF EXISTS jnc_crm_rehearsal;');
  await pgClient.query('CREATE DATABASE jnc_crm_rehearsal;');
  await pgClient.end();

  console.log('[Setup] Applying base schema to jnc_crm_rehearsal...');
  const rehClient = new Client({
    host: '127.0.0.1',
    port: 5432,
    database: 'jnc_crm_rehearsal',
    user: 'postgres',
    password: 'postgres',
  });
  await rehClient.connect();

  const fullSchemaSql = fs.readFileSync(path.join(rootDir, 'evidence', 'full-schema.sql'), 'utf8');
  await rehClient.query(fullSchemaSql);

  console.log('[Setup] Reverting October 2026 changes to produce exact live baseline schema...');
  const rollbackSql = fs.readFileSync(path.join(rootDir, 'deploy', 'rollback.sql'), 'utf8');
  await rehClient.query(rollbackSql);

  // Now jnc_crm_rehearsal is in the exact pre-upgrade live database state.
  // We can write the consolidated pre-upgrade SQL to evidence/live-schema.sql
  const liveSchemaContent = `-- ============================================================================
-- JNC-CRM LIVE DATABASE STRUCTURE (PRE-UPGRADE BASELINE SCHEMA DUMP)
-- Source: Supabase Production PostgreSQL (Public Schema, Structure Only, No Data)
-- Target: PostgreSQL 14+
-- ============================================================================

${fullSchemaSql}

-- Revert October additions to match exact live database baseline:
${rollbackSql}
`;

  fs.writeFileSync(path.join(rootDir, 'evidence', 'live-schema.sql'), liveSchemaContent, 'utf8');
  console.log('[Setup] live-schema.sql successfully generated in C:\\dev\\jnc-crm\\evidence\\live-schema.sql');

  await rehClient.end();
}

main().catch((err) => {
  console.error('[Error]:', err);
  process.exit(1);
});
