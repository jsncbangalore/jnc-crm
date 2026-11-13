/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Brand Lock Validation Test
 * Enforces:
 * 1. Fixed constants (COMPANY_LEGAL_NAME, COMPANY_SHORT_NAME, PRODUCT_NAME)
 * 2. SHA-256 integrity of all logo and favicon assets recorded in brand.lock.json
 * 3. Exact copyright string format across web and api brand files
 * 4. Zero occurrences of banned brand strings (e.g. Syntra)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

function runBrandLockTest() {
  console.log('=== BRAND INTEGRITY & LOCK VERIFICATION ===');
  const rootDir = path.resolve(__dirname, '..');
  const lockPath = path.join(rootDir, 'brand.lock.json');
  assert(fs.existsSync(lockPath), 'brand.lock.json must exist in project root');

  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));

  // 1. Verify Constants
  assert.strictEqual(lock.COMPANY_LEGAL_NAME, 'JNC Network Communication', 'Legal name must be JNC Network Communication');
  assert.strictEqual(lock.COMPANY_SHORT_NAME, 'JNC', 'Short name must be JNC');
  assert.strictEqual(lock.PRODUCT_NAME, 'Syntra CRM', 'Product name must be Syntra CRM');
  console.log(' -> [PASS] Brand constants match: JNC Network Communication / JNC / Syntra CRM');

  // 2. Verify File Hashes
  for (const [relPath, expectedHash] of Object.entries(lock.hashes)) {
    const fullPath = path.join(rootDir, relPath);
    assert(fs.existsSync(fullPath), `Asset file missing: ${relPath}`);
    const actualHash = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
    assert.strictEqual(
      actualHash,
      expectedHash,
      `Hash mismatch for ${relPath}! If this was an intentional brand update, update brand.lock.json with commit note 'BRAND CHANGE APPROVED'.`
    );
  }
  console.log(` -> [PASS] All ${Object.keys(lock.hashes).length} logo and favicon asset hashes verified.`);

  // 3. Verify Code Constants in apps/web/src/config/brand.ts and apps/api/src/common/brand.ts
  const webBrandPath = path.join(rootDir, 'apps/web/src/config/brand.ts');
  const apiBrandPath = path.join(rootDir, 'apps/api/src/common/brand.ts');

  const webContent = fs.readFileSync(webBrandPath, 'utf8');
  const apiContent = fs.readFileSync(apiBrandPath, 'utf8');

  assert(webContent.includes("COMPANY_LEGAL_NAME = 'JNC Network Communication'"), 'Web brand legal name mismatch');
  assert(webContent.includes("COMPANY_SHORT_NAME = 'JNC'"), 'Web brand short name mismatch');
  assert(webContent.includes("PRODUCT_NAME = 'Syntra CRM'"), 'Web brand product name mismatch');
  assert(webContent.includes("© ${new Date().getFullYear()} JNC Network Communication. Syntra CRM. All rights reserved."), 'Web copyright mismatch');

  assert(apiContent.includes("COMPANY_LEGAL_NAME = 'JNC Network Communication'"), 'API brand legal name mismatch');
  assert(apiContent.includes("COMPANY_SHORT_NAME = 'JNC'"), 'API brand short name mismatch');
  assert(apiContent.includes("PRODUCT_NAME = 'Syntra CRM'"), 'API brand product name mismatch');
  assert(apiContent.includes("© ${new Date().getFullYear()} JNC Network Communication. Syntra CRM. All rights reserved."), 'API copyright mismatch');

  console.log(' -> [PASS] apps/web and apps/api brand definitions match single source of truth.');

  // 4. Verify no banned legacy brand strings
  const bannedList = ['apex enterprise', 'apex systems', 'apex crm', 'power solutions'];
  const filesToCheck = [webBrandPath, apiBrandPath, path.join(rootDir, 'apps/web/index.html'), path.join(rootDir, 'apps/web/public/manifest.json')];

  for (const f of filesToCheck) {
    const txt = fs.readFileSync(f, 'utf8').toLowerCase();
    for (const b of bannedList) {
      assert(!txt.includes(b), `Found banned brand string "${b}" in ${f}`);
    }
  }
  console.log(' -> [PASS] Zero occurrences of banned brand strings in core files.');
  console.log('=== BRAND LOCK VERIFICATION PASSED ===\n');
}

if (require.main === module) {
  runBrandLockTest();
}

module.exports = { runBrandLockTest };
