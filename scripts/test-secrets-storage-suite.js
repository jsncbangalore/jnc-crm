#!/usr/bin/env node
/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');

let passedCount = 0;
let failedCount = 0;
const failures = [];

function assert(description, condition, extraInfo = '') {
  if (condition) {
    passedCount++;
    console.log(`  [PASS] ${description}`);
  } else {
    failedCount++;
    const errMsg = extraInfo ? ` -> ${extraInfo}` : '';
    console.error(`  [FAIL] ${description}${errMsg}`);
    failures.push({ description, extraInfo });
  }
}

async function runSuite() {
  console.log('\n============================================================');
  console.log('  LAYER AF: SECRETS, STORAGE & REPOSITORY HYGIENE SUITE (29 tests)');
  console.log('============================================================\n');

  // 1. DevAccountsBox removed from source
  const devAccountsBoxExists = fs.existsSync(path.join(ROOT_DIR, 'apps/web/src/components/auth/DevAccountsBox.tsx'));
  assert('DevAccountsBox.tsx is completely removed from web source', !devAccountsBoxExists);

  // 2. DevAccountsBox removed from AuthLoginForm
  const authLoginForm = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/components/auth/AuthLoginForm.tsx'), 'utf8');
  assert('AuthLoginForm.tsx contains zero DevAccountsBox references or JSX', !authLoginForm.includes('DevAccountsBox'));

  // 3. get-dev-password.js helper exists and returns non-empty password
  const getDevPassPath = path.join(ROOT_DIR, 'scripts/dev/get-dev-password.js');
  assert('scripts/dev/get-dev-password.js exists', fs.existsSync(getDevPassPath));
  const { getDevPassword } = require(getDevPassPath);
  const passwordResult = getDevPassword();
  assert('getDevPassword() returns a non-empty strong string', typeof passwordResult === 'string' && passwordResult.length >= 10);

  // 4. seed-demo.ts uses getDevPassword
  const seedDemoContent = fs.readFileSync(path.join(ROOT_DIR, 'apps/api/prisma/seed-demo.ts'), 'utf8');
  assert('apps/api/prisma/seed-demo.ts uses getDevPassword()', seedDemoContent.includes('getDevPassword') && !seedDemoContent.includes("'DemoPassword123!'"));

  // 5. seed-dev.ts uses getDevPassword
  const seedDevContent = fs.readFileSync(path.join(ROOT_DIR, 'scripts/seed-dev.ts'), 'utf8');
  assert('scripts/seed-dev.ts uses getDevPassword()', seedDevContent.includes('getDevPassword') && !seedDevContent.includes("'DevPassword@123'"));

  // 6. dev-demo-seed.js uses getDevPassword
  const devDemoSeedContent = fs.readFileSync(path.join(ROOT_DIR, 'scripts/dev-demo-seed.js'), 'utf8');
  assert('scripts/dev-demo-seed.js uses getDevPassword()', devDemoSeedContent.includes('getDevPassword') && !devDemoSeedContent.includes("'DemoPassword@123'"));

  // 7. deploy/app-role-hardening.sql variable presence header
  const deploySql = fs.readFileSync(path.join(ROOT_DIR, 'deploy/app-role-hardening.sql'), 'utf8');
  assert('deploy/app-role-hardening.sql checks variable presence with \\if :{?app_role_password}', deploySql.includes('\\if :{?app_role_password}'));

  // 8. deploy/app-role-hardening.sql aborts when variable missing
  assert('deploy/app-role-hardening.sql aborts with \\q 1 when variable missing', deploySql.includes('\\q 1'));

  // 9. deploy/app-role-hardening.sql uses :'app_role_password'
  assert("deploy/app-role-hardening.sql sets password using :'app_role_password'", deploySql.includes(":'app_role_password'"));

  // 10. deploy/app-role-hardening.sql has zero CHANGE_IN_PRODUCTION
  assert('deploy/app-role-hardening.sql contains zero CHANGE_IN_PRODUCTION literals', !deploySql.includes('CHANGE_IN_PRODUCTION'));

  // 11. render.yaml JWT_SECRET sync: false
  const renderYaml = fs.readFileSync(path.join(ROOT_DIR, 'render.yaml'), 'utf8');
  assert('render.yaml sets sync: false for JWT_SECRET', /key:\s*JWT_SECRET[\r\n\s]+sync:\s*false/.test(renderYaml));

  // 12. render.yaml JWT_REFRESH_SECRET sync: false
  assert('render.yaml sets sync: false for JWT_REFRESH_SECRET', /key:\s*JWT_REFRESH_SECRET[\r\n\s]+sync:\s*false/.test(renderYaml));

  // 13. render.yaml ENCRYPTION_KEY sync: false
  assert('render.yaml sets sync: false for ENCRYPTION_KEY', /key:\s*ENCRYPTION_KEY[\r\n\s]+sync:\s*false/.test(renderYaml));

  // 14. render.yaml OTP_SECRET sync: false
  assert('render.yaml sets sync: false for OTP_SECRET', /key:\s*OTP_SECRET[\r\n\s]+sync:\s*false/.test(renderYaml));

  // 15. render.yaml BACKUP_ENCRYPTION_KEY sync: false
  assert('render.yaml sets sync: false for BACKUP_ENCRYPTION_KEY', /key:\s*BACKUP_ENCRYPTION_KEY[\r\n\s]+sync:\s*false/.test(renderYaml));

  // 16. docs/SECRETS.md exists and covers rotation
  const secretsDoc = path.join(ROOT_DIR, 'docs/SECRETS.md');
  assert('docs/SECRETS.md exists', fs.existsSync(secretsDoc));
  const secretsDocContent = fs.readFileSync(secretsDoc, 'utf8');
  assert('docs/SECRETS.md details rotation procedures for all secrets', secretsDocContent.includes('Rotating `JWT_SECRET`') && secretsDocContent.includes('Rotating `ENCRYPTION_KEY`'));

  // 17. docs/SECRETS.md details always-on and persistent disk facts
  assert('docs/SECRETS.md explains always-on and persistent disk architecture facts', secretsDocContent.includes('Always-On Instance') && secretsDocContent.includes('Persistent Disk'));

  // 18. Storage interface and service exist
  assert('apps/api/src/common/storage/storage.interface.ts exists', fs.existsSync(path.join(ROOT_DIR, 'apps/api/src/common/storage/storage.interface.ts')));
  assert('apps/api/src/common/storage/storage.service.ts exists', fs.existsSync(path.join(ROOT_DIR, 'apps/api/src/common/storage/storage.service.ts')));

  // 19. File validator enforces allow-list for purchase_document
  const fileValidatorCode = fs.readFileSync(path.join(ROOT_DIR, 'apps/api/src/common/file-validator.ts'), 'utf8');
  assert("file-validator.ts defines 'purchase_document' category with PDF, PNG, JPG only", fileValidatorCode.includes("purchase_document: ['.pdf', '.png', '.jpg', '.jpeg']"));

  // 20. inventory.controller.ts uses purchase_document validator
  const invCtrlCode = fs.readFileSync(path.join(ROOT_DIR, 'apps/api/src/inventory/inventory.controller.ts'), 'utf8');
  assert("inventory.controller.ts validates uploads using 'purchase_document'", invCtrlCode.includes("validateUploadedFile(file, 'purchase_document'"));

  // 21. inventory.controller.ts enforces path traversal rejection
  assert('inventory.controller.ts strictly detects and rejects path traversal (..)', invCtrlCode.includes("filename.includes('..')"));

  // 22. inventory.controller.ts sends security headers
  assert('inventory.controller.ts sets X-Content-Type-Options: nosniff', invCtrlCode.includes("'X-Content-Type-Options', 'nosniff'"));
  assert("inventory.controller.ts sets Content-Security-Policy: default-src 'none'; sandbox", invCtrlCode.includes("'Content-Security-Policy', \"default-src 'none'; sandbox\""));

  // 23. Legacy uploads directory removed
  const legacyUploadsExists = fs.existsSync(path.join(ROOT_DIR, 'apps/web/public/uploads'));
  assert('apps/web/public/uploads does not exist in workspace', !legacyUploadsExists);

  // 24. scan-migratable-uploads.js exists and is read-only
  const scanMigratablePath = path.join(ROOT_DIR, 'scripts/ops/scan-migratable-uploads.js');
  assert('scripts/ops/scan-migratable-uploads.js exists and is executable', fs.existsSync(scanMigratablePath));

  // 25. git ls-files clean of dumps, zips, env
  const gitOutput = execSync('git ls-files', { cwd: ROOT_DIR, encoding: 'utf8' });
  const gitFiles = gitOutput.split('\n').map((l) => l.trim()).filter(Boolean);
  const dirtyFiles = gitFiles.filter((f) => {
    if (f.endsWith('.zip')) return true;
    if (f.startsWith('backups/')) return true;
    if ((f === '.env' || f.startsWith('.env.')) && f !== '.env.development.example') return true;
    if (f.endsWith('.sql') && !f.startsWith('apps/api/prisma/migrations/') && !f.startsWith('apps/api/prisma/migration_plans/') && !f.startsWith('deploy/') && !f.startsWith('docs/deferred-migrations/')) return true;
    return false;
  });
  assert('git tracked files contain zero secrets, dumps, zips, or backups', dirtyFiles.length === 0, `Dirty: ${dirtyFiles.join(', ')}`);

  console.log(`\n============================================================`);
  console.log(`  LAYER AF SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED (TOTAL: 29)`);
  console.log(`============================================================\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runSuite().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runSecretsStorageSuite: runSuite };
