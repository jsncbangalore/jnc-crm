/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function generateReportX() {
  const rootDir = path.resolve(__dirname, '..');
  const targetDir = path.join(rootDir, 'evidence');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const reportPath = path.join(targetDir, 'report-2026-10-08x.txt');
  const now = new Date().toISOString();

  let content = `================================================================================
CRM GOVERNANCE, SECURITY & REHEARSAL VERIFICATION REPORT X
GENERATED AT: ${now}
WORKING DIRECTORY: ${rootDir}
================================================================================

`;

  // SECTION 1: FOLDER GUARD VERIFICATION
  content += `--------------------------------------------------------------------------------
SECTION 1: FOLDER GUARD REFUSAL VERIFICATION
--------------------------------------------------------------------------------
`;
  try {
    const refusalOutput = execSync('node scripts/live-reset-account.js --role owner --rehearse', {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    content += refusalOutput + '\n';
  } catch (err) {
    content += (err.stdout || '') + (err.stderr || err.message) + '\n';
  }

  // SECTION 2: REPORT HONESTY DISCLOSURE
  content += `--------------------------------------------------------------------------------
SECTION 2: REPORT HONESTY DISCLOSURE & DATA ORIGIN AUDIT
SUMMARY (not a command output)
--------------------------------------------------------------------------------
SUMMARY (not a command output):
In report-2026-10-08w.txt, the output for live-reset-account rehearsal printed values
such as 'admin@example.com', 'EMP001', 'ORG-001', and IDs like 'usr-owner-0000-...'.
These values came from a MOCK FALLBACK in the script that triggered because the live
database connection to aws-0-ap-south-1.pooler.supabase.com was unreachable / unauthenticated.
The mock values did NOT reflect real records in the database.

AUDIT CLASSIFICATION:
- Rehearsal Fallback Output in report-2026-10-08w.txt: NOT FROM A COMMAND (MOCK GENERATED)
- Actual Live Read Execution: NOT RUN (prevented by network authentication guard and explicit directive "Do not touch any live database: no writes, no migrations").

`;

  // SECTION 3: LIVE RESET ACCOUNT REHEARSAL & STATEMENT LOGGING
  content += `--------------------------------------------------------------------------------
SECTION 3: LIVE RESET ACCOUNT TRANSACTION & REHEARSAL VERIFICATION
--------------------------------------------------------------------------------
`;
  try {
    const resetOutput = execSync('node scripts/live-reset-account.js --role owner --rehearse', {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    content += resetOutput + '\n';
  } catch (err) {
    content += (err.stdout || '') + (err.stderr || err.message) + '\n';
  }
  content += `LIVE WRITE EXECUTION STATUS: NOT RUN (Strict directive: no writes against live database).\n\n`;

  // SECTION 4: PURCHASEBILL MIGRATION & RLS AUDIT
  content += `--------------------------------------------------------------------------------
SECTION 4: PURCHASEBILL MIGRATION & RLS AUDIT
--------------------------------------------------------------------------------
`;
  try {
    const rlsOutput = execSync('node scripts/live-rls-check.js', {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    content += rlsOutput + '\n';
  } catch (err) {
    content += (err.stdout || '') + (err.stderr || err.message) + '\n';
  }

  // SECTION 5: STAGING COMMANDS & PROJECT REF REFUSAL GUARDS
  content += `--------------------------------------------------------------------------------
SECTION 5: STAGING ENVIRONMENT COMMANDS & PROJECT REF REFUSAL TESTS
--------------------------------------------------------------------------------
`;
  // Test A: Staging command with Live DB URL
  content += `--- TEST A: Staging command (staging:migrate) executed with Live DB URL ---\n`;
  try {
    const testA = execSync('cmd.exe /c "set TEST_DB_URL=postgresql://postgres.aybysdzuwwtqhnzhgiwp:pass@aws-0-ap-south-1.pooler.supabase.com:6543/postgres && node scripts/staging-cmd.js migrate staging"', {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    content += testA + '\n';
  } catch (err) {
    content += (err.stdout || '') + (err.stderr || err.message) + '\n';
  }

  // Test B: Live command with Staging DB URL
  content += `--- TEST B: Live command executed with Staging DB URL ---\n`;
  try {
    const testB = execSync('cmd.exe /c "set TEST_DB_URL=postgresql://postgres.staging-ref-001:pass@aws-0-ap-south-1.pooler.supabase.com:6543/postgres && node scripts/staging-cmd.js migrate live"', {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    content += testB + '\n';
  } catch (err) {
    content += (err.stdout || '') + (err.stderr || err.message) + '\n';
  }

  // SECTION 6: INVENTORY CLEAR-ALL CONFIRMATION & RATE LIMITING
  content += `--------------------------------------------------------------------------------
SECTION 6: INVENTORY CLEAR-ALL CONFIRMATION & PERSISTENT RATE LIMITING
--------------------------------------------------------------------------------
`;
  try {
    const clearOutput = execSync('node scripts/test-clear-all.js', {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    content += clearOutput + '\n';
  } catch (err) {
    content += (err.stdout || '') + (err.stderr || err.message) + '\n';
  }

  // SECTION 7: GIT REMOTE & HISTORY PURGE PLAN
  content += `--------------------------------------------------------------------------------
SECTION 7: GIT REMOTE VERIFICATION & HISTORY PURGE PLAN
--------------------------------------------------------------------------------
GENERATED BY SCRIPT git-remote-check AT ${now}
Git Remotes Output:
`;
  try {
    const remoteOutput = execSync('git remote -v', { cwd: rootDir, encoding: 'utf8' });
    content += (remoteOutput || '(No remote repositories configured)') + '\n';
  } catch (err) {
    content += (err.stdout || err.message) + '\n';
  }

  content += `\nGit Log Check for apps/api/data/purchase_bills.json:\n`;
  try {
    const logOutput = execSync('git log --all --oneline -- apps/api/data/purchase_bills.json', { cwd: rootDir, encoding: 'utf8' });
    content += logOutput + '\n';
  } catch (err) {
    content += (err.stdout || err.message) + '\n';
  }

  content += `SUMMARY (not a command output):
PROPOSED GIT HISTORY PURGE COMMANDS (Awaiting explicit user confirmation "yes"):

Before Check:
  git log --all --oneline -- apps/api/data/purchase_bills.json

Filter Execution:
  git filter-repo --path apps/api/data/purchase_bills.json --invert-paths --force

After Check:
  git log --all --oneline -- apps/api/data/purchase_bills.json

STATUS: WAITING FOR USER CONFIRMATION "yes" BEFORE EXECUTING FILTER REPO.

`;

  // SECTION 8: RELEASE PACK & SECURITY MANIFEST
  content += `--------------------------------------------------------------------------------
SECTION 8: RELEASE PACK & SECURITY MANIFEST VERIFICATION
--------------------------------------------------------------------------------
`;
  try {
    const packOutput = execSync('node scripts/release-pack.js', {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    content += packOutput + '\n';
  } catch (err) {
    content += (err.stdout || '') + (err.stderr || err.message) + '\n';
  }

  content += `================================================================================
END OF EVIDENCE REPORT X
================================================================================
`;

  fs.writeFileSync(reportPath, content, 'utf8');
  const bytes = fs.statSync(reportPath).size;
  console.log(`Report written to ${reportPath} (${bytes} bytes).`);
  return { reportPath, bytes };
}

generateReportX();
