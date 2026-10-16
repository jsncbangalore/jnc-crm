/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');

let Client;
try {
  Client = require('pg').Client;
} catch {
  Client = require('C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824/scratch/pg-runner/node_modules/pg').Client;
}

const secretsPath = 'C:\\dev\\jnc-secrets\\live.env';
const secrets = {};

if (fs.existsSync(secretsPath)) {
  const envContent = fs.readFileSync(secretsPath, 'utf8');
  envContent.split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const idx = line.indexOf('=');
    if (idx !== -1) {
      let k = line.substring(0, idx).trim();
      let v = line.substring(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.substring(1, v.length - 1);
      }
      secrets[k] = v;
    }
  });
}

const EXPECTED_PROJECT_REF = process.env.EXPECTED_PROJECT_REF || process.env.TEST_NEW_PROJECT_REF || secrets.NEW_PROJECT_REF || 'aybysdzuwwtqhnzhgiwp';
const OLD_PROJECT_REF = process.env.OLD_PROJECT_REF || secrets.OLD_PROJECT_REF || 'hbzlelktcfagwvmyusvw';
let directUrl = process.env.DIRECT_URL || process.env.TEST_DIRECT_URL || secrets.DIRECT_URL;

if (!directUrl) {
  console.error('[PREFLIGHT FAIL] DIRECT_URL is missing in environment or secrets file');
  process.exit(1);
}

// Strictly parse project ref from connection string username
let actualRef;
try {
  const parsedUrl = new URL(directUrl);
  const username = parsedUrl.username || '';
  const match = username.match(/^[^.]+\.([a-z0-9_-]+)$/i);

  if (!match || !match[1]) {
    console.error(`[PROJECT REF REFUSAL] Connection string username "${username}" has no project ref. Format must be "postgres.<ref>". Execution refused.`);
    process.exit(1);
  }

  actualRef = match[1];

  if (actualRef === OLD_PROJECT_REF) {
    console.error(`[PROJECT REF REFUSAL] Connection string username has OLD_PROJECT_REF "${actualRef}". Refusing execution on old database.`);
    process.exit(1);
  }

  if (actualRef !== EXPECTED_PROJECT_REF) {
    console.error(`[PROJECT REF REFUSAL] Connection string project ref "${actualRef}" does not match expected NEW_PROJECT_REF "${EXPECTED_PROJECT_REF}". Execution refused.`);
    process.exit(1);
  }
} catch (err) {
  console.error(`[PROJECT REF REFUSAL] Connection string URL invalid: ${err.message}`);
  process.exit(1);
}

const parsedUrl = new URL(directUrl);
const host = parsedUrl.hostname;
const port = parsedUrl.port || '5432';
const dbName = parsedUrl.pathname.replace(/^\//, '') || 'postgres';

if (!directUrl.includes('sslmode=')) {
  directUrl += (directUrl.includes('?') ? '&' : '?') + 'sslmode=require';
}

async function runPreflight() {
  const cleanUrl = directUrl.replace(/[\?\&]sslmode=[^&]+/g, '');
  const client = new Client({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    
    const tablesRes = await client.query(`
      SELECT count(*)::int AS count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE';
    `);
    const tableCount = tablesRes.rows[0].count;
    const isEmpty = tableCount === 0 ? 'yes' : 'no';

    const verRes = await client.query('SELECT version();');
    const versionStr = verRes.rows[0].version.split(' ')[0] + ' ' + verRes.rows[0].version.split(' ')[1];

    const maskedHost = host.replace(/^[a-zA-Z0-9_-]+/, (m) => m.substring(0, 4) + '***' + m.substring(m.length - 4));

    console.log('========================================================================');
    console.log('JNC-CRM DATABASE PREFLIGHT CHECK (LIVE SUPABASE)');
    console.log('========================================================================');
    console.log(`Host:             ${maskedHost}`);
    console.log(`Port:             ${port}`);
    console.log(`Database:         ${dbName}`);
    console.log(`Project Ref:      ${actualRef}`);
    console.log(`empty:            ${isEmpty} (Public Tables Count: ${tableCount})`);
    console.log(`PostgreSQL Ver:   ${versionStr}`);
    console.log('========================================================================');

    await client.end();
  } catch (err) {
    console.error(`[PREFLIGHT FAIL] Connection error: ${err.message}`);
    process.exit(1);
  }
}

runPreflight();
