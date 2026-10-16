/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const secretsPath = 'C:\\dev\\jnc-secrets\\live.env';
if (!fs.existsSync(secretsPath)) {
  console.error('[BACKUP FAIL] Missing secrets file C:\\dev\\jnc-secrets\\live.env');
  process.exit(1);
}

const envContent = fs.readFileSync(secretsPath, 'utf8');
const secrets = {};
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

const EXPECTED_PROJECT_REF = process.env.TEST_NEW_PROJECT_REF || secrets.NEW_PROJECT_REF || 'aybysdzuwwtqhnzhgiwp';
const OLD_PROJECT_REF = secrets.OLD_PROJECT_REF || 'hbzlelktcfagwvmyusvw';
const directUrl = process.env.TEST_DIRECT_URL || secrets.DIRECT_URL;

if (!directUrl) {
  console.error('[BACKUP FAIL] DIRECT_URL missing in environment/live.env');
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

let pgDumpAvailable = false;
try {
  execSync('pg_dump --version', { stdio: 'pipe' });
  pgDumpAvailable = true;
} catch (e) {
  pgDumpAvailable = false;
}

const backupsDir = 'C:\\dev\\jnc-secrets\\backups';
if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFilename = `jnc-backup-${timestamp}.sql`;
const backupFilePath = path.join(backupsDir, backupFilename);

console.log('========================================================================');
console.log(`JNC-CRM DATABASE BACKUP UTILITY (Project Ref: ${actualRef})`);
console.log('========================================================================');

if (!pgDumpAvailable) {
  console.log('[NOTICE] PostgreSQL client tools (pg_dump) are NOT installed on this PC.');
  console.log(' -> Backup file was NOT created.');
  console.log(' -> INSTALLATION INSTRUCTIONS (Windows):');
  console.log('    1. Download PostgreSQL Command Line Tools or PostgreSQL Installer:');
  console.log('       https://www.postgresql.org/download/windows/');
  console.log('    2. Ensure pg_dump.exe is added to your System PATH.');
  console.log('    3. Re-run `npm run db:backup` to generate an unencrypted SQL dump.');
  console.log('========================================================================');
  process.exit(0);
}

try {
  const cleanUrl = directUrl.replace(/[\?\&]sslmode=[^&]+/g, '');
  execSync(`pg_dump "${cleanUrl}" > "${backupFilePath}"`, { stdio: 'pipe' });
  const stats = fs.statSync(backupFilePath);
  console.log(`[PASS] Backup created successfully!`);
  console.log(` -> Path: ${backupFilePath}`);
  console.log(` -> Size: ${stats.size} bytes (${(stats.size / 1024).toFixed(2)} KB)`);
  console.log('========================================================================');
} catch (err) {
  console.error(`[BACKUP FAIL] pg_dump execution failed: ${err.message}`);
  process.exit(1);
}
