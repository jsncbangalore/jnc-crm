/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const { spawnSync } = require('child_process');
const path = require('path');

// Actions to test (must match wrapper script names)
const actions = [
  'owner:reset',
  'seed-test',
  'setup-dev',
  'db-push-dev',
  'db-push-test',
  'test-phase3',
  'test-login',
  'test-security',
];

const OLD_REF = 'prj-old-live-2026';
const NEW_REF = 'prj-new-live-2026';
const DUAL_REF = 'prj-dual-conflict';

// DATABASE_URL, ALLOWED_DB_HOSTS, and project reference test cases
const testCases = [
  // The 5 Required Project Reference Tests:
  {
    name: 'same host with the old ref -> refused',
    url: `postgresql://postgres.${OLD_REF}:pass@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`,
    allowedHosts: '',
    blockedRefs: OLD_REF,
    allowedRefs: NEW_REF,
  },
  {
    name: 'same host with the new ref -> allowed',
    url: `postgresql://postgres.${NEW_REF}:pass@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`,
    allowedHosts: '',
    blockedRefs: OLD_REF,
    allowedRefs: NEW_REF,
  },
  {
    name: 'different host with the old ref -> refused',
    url: `postgresql://postgres.${OLD_REF}:pass@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`,
    allowedHosts: '',
    blockedRefs: OLD_REF,
    allowedRefs: NEW_REF,
  },
  {
    name: 'missing ref -> refused',
    url: 'postgresql://postgres:pass@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres',
    allowedHosts: '',
    blockedRefs: OLD_REF,
    allowedRefs: NEW_REF,
  },
  {
    name: 'ref in both lists -> refused',
    url: `postgresql://postgres.${DUAL_REF}:pass@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`,
    allowedHosts: '',
    blockedRefs: `${OLD_REF},${DUAL_REF}`,
    allowedRefs: `${NEW_REF},${DUAL_REF}`,
  },

  // General Host & Local Tests:
  { name: 'localhost', url: 'postgresql://user:pass@localhost:5432/fake_db', allowedHosts: '', blockedRefs: '', allowedRefs: '' },
  { name: 'host in list passes', url: 'postgresql://user:pass@staging-db.jnc-crm.internal:5432/staging_db', allowedHosts: 'staging-db.jnc-crm.internal', blockedRefs: '', allowedRefs: '' },
  { name: 'host not in list refused', url: 'postgresql://user:pass@unauthorized-host.net:5432/db', allowedHosts: 'staging-db.jnc-crm.internal', blockedRefs: '', allowedRefs: '' },
  { name: 'empty', url: '', allowedHosts: '', blockedRefs: '', allowedRefs: '' },
  { name: 'garbage', url: 'not-a-url', allowedHosts: '', blockedRefs: '', allowedRefs: '' },
];

function run(action, envVars) {
  const result = spawnSync('node', [path.join(__dirname, 'prisma-safe.js'), action, '--check-only'], {
    env: { ...process.env, ...envVars },
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  const firstLine = (result.stdout || result.stderr).split(/\r?\n/).find(l=>l.trim().length>0) || '';
  return { code: result.status, line: firstLine.trim() };
}

function runDirectTs(action, scriptFile, envVars) {
  const result = spawnSync(
    'node',
    [
      require.resolve('ts-node/dist/bin.js'),
      '--transpile-only',
      '-e',
      `const { assertLocalDatabase } = require('./scripts/assertLocalDatabase'); assertLocalDatabase('${action}'); console.log('[Direct Guard] Passed');`,
    ],
    {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, ...envVars },
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    },
  );
  const firstLine = (result.stdout || result.stderr).split(/\r?\n/).find(l=>l.trim().length>0) || '';
  return { code: result.status, line: firstLine.trim() };
}

function printTable(rows) {
  console.log('action | case | exit code | first output line');
  console.log('-------|------|-----------|-------------------');
  rows.forEach(r=> console.log(`${r.action} | ${r.case} | ${r.code} | ${r.line}`));
}

let rows = [];
for (const action of actions) {
  for (const tc of testCases) {
    const env = {
      DATABASE_URL: tc.url,
      ALLOWED_DB_HOSTS: tc.allowedHosts || '',
      BLOCKED_DB_PROJECT_REFS: tc.blockedRefs || '',
      ALLOWED_DB_PROJECT_REFS: tc.allowedRefs || '',
    };
    // Run via wrapper
    const res = run(action, env);
    rows.push({ action, case: tc.name, code: res.code, line: res.line });
    // For direct ts-node test on scripts that exist
    if (['owner:reset','seed-test','setup-dev'].includes(action)) {
      const scriptFile = `scripts/${action.replace(':','-')}.ts`;
      const res2 = runDirectTs(action, scriptFile, env);
      rows.push({ action: `${action} (direct)`, case: tc.name, code: res2.code, line: res2.line });
    }
  }
}
printTable(rows);
