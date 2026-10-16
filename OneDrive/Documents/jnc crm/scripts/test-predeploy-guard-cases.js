/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SECRETS_DIR = 'C:\\dev\\jnc-secrets';
const TEMP_SECRETS_DIR = 'C:\\dev\\jnc-secrets_TEMP_BACKUP';

let renamed = false;

try {
  // 1. Rename C:\dev\jnc-secrets if it exists
  if (fs.existsSync(SECRETS_DIR)) {
    fs.renameSync(SECRETS_DIR, TEMP_SECRETS_DIR);
    renamed = true;
    console.log(`[INFO] Temporarily renamed ${SECRETS_DIR} to ${TEMP_SECRETS_DIR}`);
  }

  console.log('\n=== TESTING RENDER PRE-DEPLOY GUARD WITH ONLY ENVIRONMENT VARIABLES ===\n');

  // Case 1: Missing Required Variable
  console.log('--- TEST 1: Missing Required Variable (no DIRECT_URL) ---');
  try {
    const res = execSync('node scripts/render-predeploy-guard.js', {
      cwd: ROOT,
      env: { ...process.env, DIRECT_URL: '', NEW_PROJECT_REF: '' },
      encoding: 'utf8',
    });
    console.log(res);
  } catch (err) {
    console.log(err.stdout || err.message);
  }

  // Case 2: Missing Project Ref in connection string
  console.log('\n--- TEST 2: Missing Project Ref in connection string username ---');
  try {
    const res = execSync('node scripts/render-predeploy-guard.js', {
      cwd: ROOT,
      env: {
        ...process.env,
        DIRECT_URL: 'postgresql://postgres:password@localhost:5432/postgres',
        NEW_PROJECT_REF: 'aybysdzuwwtqhnzhgiwp',
      },
      encoding: 'utf8',
    });
    console.log(res);
  } catch (err) {
    console.log(err.stdout || err.message);
  }

  // Case 3: Wrong Project Ref
  console.log('\n--- TEST 3: Wrong Project Ref (connection has wrongref vs expected aybysdzuwwtqhnzhgiwp) ---');
  try {
    const res = execSync('node scripts/render-predeploy-guard.js', {
      cwd: ROOT,
      env: {
        ...process.env,
        DIRECT_URL: 'postgresql://postgres.wrongref:password@db.wrongref.supabase.co:5432/postgres',
        NEW_PROJECT_REF: 'aybysdzuwwtqhnzhgiwp',
        OLD_PROJECT_REF: 'hbzlelktcfagwvmyusvw',
      },
      encoding: 'utf8',
    });
    console.log(res);
  } catch (err) {
    console.log(err.stdout || err.message);
  }

  // Case 4: Correct Project Ref (Stops at connection, does not connect)
  console.log('\n--- TEST 4: Correct Project Ref (aybysdzuwwtqhnzhgiwp) ---');
  try {
    const res = execSync('node scripts/render-predeploy-guard.js', {
      cwd: ROOT,
      env: {
        ...process.env,
        DIRECT_URL: 'postgresql://postgres.aybysdzuwwtqhnzhgiwp:password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres',
        NEW_PROJECT_REF: 'aybysdzuwwtqhnzhgiwp',
        OLD_PROJECT_REF: 'hbzlelktcfagwvmyusvw',
      },
      encoding: 'utf8',
    });
    console.log(res);
  } catch (err) {
    console.log(err.stdout || err.message);
  }

} finally {
  // Always restore secrets directory
  if (renamed && fs.existsSync(TEMP_SECRETS_DIR)) {
    fs.renameSync(TEMP_SECRETS_DIR, SECRETS_DIR);
    console.log(`\n[INFO] Restored ${TEMP_SECRETS_DIR} back to ${SECRETS_DIR}`);
  }
}
