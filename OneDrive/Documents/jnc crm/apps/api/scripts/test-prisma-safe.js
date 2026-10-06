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

// DATABASE_URL test cases
const cases = {
  'fake supabase': "postgresql://user:pass@aws-0-ap-southeast-1.pooler.supabase.com:5432/fake_db",
  'fake amazonaws': "postgresql://user:pass@mydb.us-east-1.rds.amazonaws.com:5432/fake_db",
  'empty': "",
  'garbage': "not-a-url",
  'trailing space': "postgresql://user:pass@localhost:5432/fake_db ",
  'quoted': "\"postgresql://user:pass@localhost:5432/fake_db\"",
  'localhost': "postgresql://user:pass@localhost:5432/fake_db",
  // env wins over .env test case
  'env wins over .env': "postgresql://user:pass@aws-0-ap-southeast-1.pooler.supabase.com:5432/fake_db",
};

function run(action, envVars) {
  const result = spawnSync('node', [path.join(__dirname, 'prisma-safe.js'), action], {
    env: { ...process.env, ...envVars },
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  const firstLine = (result.stdout || result.stderr).split(/\r?\n/).find(l=>l.trim().length>0) || '';
  return { code: result.status, line: firstLine.trim() };
}

function runDirectTs(action, scriptFile, envVars) {
  const result = spawnSync('node', [require.resolve('ts-node/dist/bin.js'), '--transpile-only', path.join(__dirname, '..', scriptFile)], {
    env: { ...process.env, ...envVars },
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
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
  for (const [caseName, url] of Object.entries(cases)) {
    // For the special env-wins case, we also need .env to contain localhost; we assume it does.
    const env = { DATABASE_URL: url };
    // Run via wrapper
    const res = run(action, env);
    rows.push({ action, case: caseName, code: res.code, line: res.line });
    // For direct ts-node test on scripts that exist
    if (['owner:reset','seed-test','setup-dev'].includes(action)) {
      const scriptFile = `${action.replace(':','-')}.ts`; // owner-reset.ts etc.
      const res2 = runDirectTs(action, scriptFile, env);
      rows.push({ action: `${action} (direct)`, case: caseName, code: res2.code, line: res2.line });
    }
  }
}
printTable(rows);
