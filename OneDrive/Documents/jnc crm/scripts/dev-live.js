/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const secretsPath = 'C:\\dev\\secrets\\live.env';
if (!fs.existsSync(secretsPath)) {
  console.error('[DEV:LIVE FAIL] Missing secrets file C:\\dev\\secrets\\live.env');
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
const databaseUrl = process.env.TEST_DATABASE_URL || secrets.DATABASE_URL;

if (!databaseUrl) {
  console.error('[DEV:LIVE FAIL] DATABASE_URL missing in environment/live.env');
  process.exit(1);
}

// Strictly parse project ref from connection string username
let actualRef;
try {
  const parsedUrl = new URL(databaseUrl);
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

// If running in test probe mode, exit 0 after assertion success
if (process.env.TEST_PROBE_MODE === 'true') {
  console.log(`[PROJECT REF ASSERTION OK] Connected to live database (Ref: ${actualRef}).`);
  process.exit(0);
}

const envVars = { ...process.env, ...secrets };

// RED BANNER WARNING
console.log('\x1b[41m\x1b[37m\x1b[1m========================================================================\x1b[0m');
console.log(`\x1b[41m\x1b[37m\x1b[1m WARNING: CONNECTED TO THE LIVE DATABASE (ref ${actualRef})            \x1b[0m`);
console.log('\x1b[41m\x1b[37m\x1b[1m DESTRUCTIVE COMMANDS (db push, migrate reset, wipe, seed) ARE BLOCKED  \x1b[0m');
console.log('\x1b[41m\x1b[37m\x1b[1m========================================================================\x1b[0m\n');

envVars.BLOCK_DESTRUCTIVE_SCRIPTS = 'true';
envVars.PORT = envVars.PORT || '3333';
envVars.VITE_API_URL = envVars.VITE_API_URL || 'http://localhost:3333/api/v1';

const rootDir = path.resolve(__dirname, '..');

console.log('\x1b[33m[Dev Live] Starting NestJS API server ...\x1b[0m');
const apiProc = spawn('npm', ['--workspace=apps/api', 'run', 'start:dev'], {
  cwd: rootDir,
  env: envVars,
  stdio: 'inherit',
  shell: true,
});

console.log('\x1b[36m[Dev Live] Starting Vite Web dev server ...\x1b[0m');
const webProc = spawn('npm', ['--workspace=apps/web', 'run', 'dev'], {
  cwd: rootDir,
  env: envVars,
  stdio: 'inherit',
  shell: true,
});

function cleanup() {
  console.log('\n[Dev Live] Terminating live dev servers ...');
  if (apiProc) apiProc.kill();
  if (webProc) webProc.kill();
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
