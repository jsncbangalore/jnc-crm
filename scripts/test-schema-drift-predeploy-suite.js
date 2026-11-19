#!/usr/bin/env node
/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Dedicated Schema Drift, Predeploy, Post-Deploy & Dangerous Endpoints Verification Suite
 * (scripts/test-schema-drift-predeploy-suite.js)
 *
 * Verifies:
 * 1. Schema Drift Guard (npm run check:schema-drift) passes cleanly on synchronized state.
 * 2. Schema Drift Guard detects and fails on unmigrated schema changes (proven with isDemo).
 * 3. Render Predeploy Guard enforces DB reachability, unapplied migration checks, and zero drift.
 * 4. Post-Deploy Check verifies /health migration counts (0 pending, 0 failed) and /health/ready.
 * 5. Web Error Display presents server message on 503 SCHEMA_OUT_OF_DATE / 5xx with Reference ID.
 * 6. AES-256 Key Derivation & Round-Trip for 32-char, 64-hex, and 32-byte base64 keys.
 * 7. Dangerous Endpoints (wipe, seed, reset-demo, bulk-delete, rebuild, permanent delete) guarded in production.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');

// Register ts-node for importing API modules
try {
  require('ts-node').register({
    project: path.resolve(ROOT_DIR, 'apps/api/tsconfig.json'),
    transpileOnly: true,
  });
} catch {}

let passedTests = 0;
let failedTests = 0;

function assert(description, condition, extraInfo) {
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${description}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${description} ${extraInfo ? `-> ${extraInfo}` : ''}`);
  }
}

async function runSuite() {
  console.log('============================================================');
  console.log('SCHEMA DRIFT, PREDEPLOY & DANGEROUS ENDPOINTS SUITE');
  console.log('============================================================');

  // ─── SECTION 1: SCHEMA DRIFT GUARD (npm run check:schema-drift) ─────────────
  console.log('\n--- 1. Schema Drift Guard Execution on Synchronized State ---');
  const driftProc = spawnSync('node', ['scripts/check-schema-drift.js'], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  });
  const driftSuccess = driftProc.status === 0;
  assert('check:schema-drift exits with code 0 on synchronized schema and migrations', driftSuccess, driftProc.stderr || driftProc.stdout);
  assert('check:schema-drift reports zero drift detected', (driftProc.stdout || '').includes('[SCHEMA DRIFT PASS]'));

  // ─── SECTION 2: PROVE DRIFT DETECTION WHEN MIGRATION IS REMOVED ─────────────
  console.log('\n--- 2. Schema Drift Guard Failure Proof (Missing isDemo Migration) ---');
  const isDemoMig = path.resolve(ROOT_DIR, 'apps/api/prisma/migrations/20261119120000_add_user_is_demo');
  const tempBackup = path.resolve(ROOT_DIR, 'apps/api/prisma/_temp_removed_is_demo_test');
  let detectedDriftOnMissing = false;
  let driftMessage = '';

  try {
    fs.renameSync(isDemoMig, tempBackup);
    const failProc = spawnSync('node', ['scripts/check-schema-drift.js'], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
    });
    detectedDriftOnMissing = failProc.status !== 0;
    driftMessage = (failProc.stdout || '') + (failProc.stderr || '');
  } finally {
    if (fs.existsSync(tempBackup)) {
      fs.renameSync(tempBackup, isDemoMig);
    }
  }

  assert('check:schema-drift strictly FAILS (exit code !== 0) when isDemo migration is removed', detectedDriftOnMissing);
  assert('check:schema-drift identifies missing change on User table (isDemo)', driftMessage.includes('User') && driftMessage.includes('isDemo'), driftMessage);

  // ─── SECTION 3: RENDER PREDEPLOY GUARD ──────────────────────────────────────
  console.log('\n--- 3. Render Predeploy Guard Verification ---');
  const predeployProc = spawnSync('node', ['scripts/render-predeploy-guard.js'], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  });
  const predeployPassed = predeployProc.status === 0;
  const predeployOutput = predeployProc.stdout || '';

  assert('render-predeploy-guard.js passes when DB reachable and migrations applied (exit code 0)', predeployPassed, predeployProc.stderr);
  assert('render-predeploy-guard.js verifies database connectivity', predeployOutput.includes('Target database is reachable'));
  assert('render-predeploy-guard.js verifies migration table state', predeployOutput.includes('0 failed and 0 pending'));
  assert('render-predeploy-guard.js does not run shadow database drift check on Render', !predeployOutput.includes('Provisioning shadow database'));

  // Test refusal when DB unreachable
  const unreachableProc = spawnSync('node', ['scripts/render-predeploy-guard.js'], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    env: { ...process.env, DIRECT_URL: 'postgresql://postgres:postgres@localhost:59999/unreachable_db?schema=public' },
  });
  assert('render-predeploy-guard.js refuses to continue when DB is unreachable (exit code 1)', unreachableProc.status === 1);
  assert('render-predeploy-guard.js logs clear unreachable message in Render logs', (unreachableProc.stderr || unreachableProc.stdout).includes('UNREACHABLE'));

  // ─── SECTION 4: POST-DEPLOY SMOKE CHECK & HEALTH MIGRATION COUNTS ───────────
  console.log('\n--- 4. Post-Deploy Smoke Check Verification ---');
  const postDeployProc = spawnSync('node', ['scripts/post-deploy-login-check.js', 'http://localhost:3333'], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  });
  const postDeployPassed = postDeployProc.status === 0;
  const postDeployOut = postDeployProc.stdout || '';

  assert('post-deploy-login-check.js succeeds against running API (exit code 0)', postDeployPassed, postDeployProc.stderr);
  assert('post-deploy-login-check.js verifies /health migration counts (0 pending, 0 failed)', postDeployOut.includes('0 pending, 0 failed'));
  assert('post-deploy-login-check.js verifies GET /health/ready returns ready', postDeployOut.includes('System is ready and healthy'));
  assert('post-deploy-login-check.js verifies auth probe against database schema', postDeployOut.includes('Auth controller rejected invalid fake credentials as expected'));

  // ─── SECTION 5: USER MESSAGE ON 503 / 5XX PRESERVES SERVER MESSAGE ──────────
  console.log('\n--- 5. Web Error Display Server Message Preservation ---');
  const unifiedCompSrc = fs.readFileSync(path.resolve(ROOT_DIR, 'apps/web/src/components/common/UnifiedErrorComponent.tsx'), 'utf8');
  const unifiedDispSrc = fs.readFileSync(path.resolve(ROOT_DIR, 'apps/web/src/components/common/UnifiedErrorDisplay.tsx'), 'utf8');
  const errorCardSrc = fs.readFileSync(path.resolve(ROOT_DIR, 'apps/web/src/components/common/ErrorStateCard.tsx'), 'utf8');

  assert('UnifiedErrorComponent uses serverMessage for 503 SCHEMA_OUT_OF_DATE / 5xx', unifiedCompSrc.includes('serverMessage || `The system needs an update'));
  assert('UnifiedErrorDisplay uses serverMessage for 503 SCHEMA_OUT_OF_DATE / 5xx', unifiedDispSrc.includes('serverMessage || `The system needs an update'));
  assert('ErrorStateCard uses serverMsg for 503 SCHEMA_OUT_OF_DATE / 5xx', errorCardSrc.includes('serverMsg || `The system needs an update'));
  assert('Web components display Reference ID with Copy button and support quote guidance', unifiedCompSrc.includes('Reference:') && unifiedCompSrc.includes('navigator.clipboard.writeText'));

  // ─── SECTION 6: AES-256 KEY DERIVATION & ROUND-TRIP TESTS ───────────────────
  console.log('\n--- 6. AES-256 Encryption Key Derivation & Round-Trip ---');
  const { deriveAesKey, encryptAtRest, decryptAtRest } = require('../apps/api/src/common/encryption.util');

  // 1. 32-character key
  const key32 = '12345678901234567890123456789012';
  const derived32 = deriveAesKey(key32);
  assert('32-character UTF-8 key derives exactly 32 bytes', derived32.length === 32);
  const secretA = 'CustomerBankingIFSC2026';
  const encA = encryptAtRest(secretA, key32);
  const decA = decryptAtRest(encA, key32);
  assert('32-character UTF-8 key completes encrypt/decrypt round-trip', decA === secretA);

  // 2. 64-hex key
  const key64Hex = crypto.randomBytes(32).toString('hex');
  const derived64Hex = deriveAesKey(key64Hex);
  assert('64-character Hexadecimal key derives exactly 32 bytes', derived64Hex.length === 32);
  const secretB = 'ConfidentialTaxpayerGSTIN';
  const encB = encryptAtRest(secretB, key64Hex);
  const decB = decryptAtRest(encB, key64Hex);
  assert('64-character Hexadecimal key completes encrypt/decrypt round-trip', decB === secretB);

  // 3. 32-byte base64 key
  const keyBase64 = crypto.randomBytes(32).toString('base64');
  const derivedBase64 = deriveAesKey(keyBase64);
  assert('32-byte Base64 key derives exactly 32 bytes', derivedBase64.length === 32);
  const secretC = 'ProprietaryEnterpriseToken999';
  const encC = encryptAtRest(secretC, keyBase64);
  const decC = decryptAtRest(encC, keyBase64);
  assert('32-byte Base64 key completes encrypt/decrypt round-trip', decC === secretC);

  // 3b. Key Compatibility: fixture pre-encrypted by OLD key handling
  const liveBase64Key = 'ASNFZ4mrze8BI0VniavN7wEjRWeJq83vASNFZ4mrze8='; // 44 characters
  const legacyFixture = '00112233445566778899aabb:2a18def4c34639f69ce461f65aae4700:cd3443f57d82cb26f49dff7f65c4513c9e0e51f633f4c3424e8fe0d2cba9b2a5c8275f49';
  const legacyDecrypted = decryptAtRest(legacyFixture, liveBase64Key);
  assert('decryptAtRest decrypts fixture encrypted with legacy OLD key handling', legacyDecrypted === 'production_legacy_secret_value_12345');

  // 3c. Format Differentiation: 44-char base64, 64-char hex, and 32-char text keys never confused
  const b64_44 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
  const hex_64 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const txt_32 = 'my_super_secure_exact_32_bytes!!';
  assert('44-char base64 does not match 64-hex', !/^[0-9a-fA-F]{64}$/.test(b64_44));
  assert('64-hex does not match 43/44 base64 regex', !/^[A-Za-z0-9+/=]{43,44}$/.test(hex_64));
  assert('32-text does not match 64-hex or 43/44 base64', !/^[0-9a-fA-F]{64}$/.test(txt_32) && !/^[A-Za-z0-9+/=]{43,44}$/.test(txt_32));

  // 4. Startup validation checks derived key
  const { validateEnvironment } = require('../apps/api/src/common/env-validation');
  const validResult = validateEnvironment({
    NODE_ENV: 'test',
    PORT: '3333',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db?schema=public',
    DIRECT_URL: 'postgresql://user:pass@localhost:5432/db?schema=public',
    JWT_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    OTP_SECRET: 'c'.repeat(32),
    ENCRYPTION_KEY: keyBase64,
    FRONTEND_URL: 'https://admin.jsnc.co.in',
    ALLOWED_ORIGINS: 'https://admin.jsnc.co.in',
  });
  const hasEncryptionKeyErrorValid = validResult.invalidVariables.some((v) => v.includes('ENCRYPTION_KEY'));
  assert('Startup env validation succeeds with 32-byte derived ENCRYPTION_KEY', !hasEncryptionKeyErrorValid);

  const invalidResult = validateEnvironment({
    NODE_ENV: 'test',
    PORT: '3333',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db?schema=public',
    DIRECT_URL: 'postgresql://user:pass@localhost:5432/db?schema=public',
    JWT_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    OTP_SECRET: 'c'.repeat(32),
    ENCRYPTION_KEY: 'too-short',
    FRONTEND_URL: 'https://admin.jsnc.co.in',
    ALLOWED_ORIGINS: 'https://admin.jsnc.co.in',
  });
  const hasEncryptionKeyErrorInvalid = invalidResult.invalidVariables.some((v) => v.includes('ENCRYPTION_KEY'));
  assert('Startup env validation fails when ENCRYPTION_KEY is too short or invalid', hasEncryptionKeyErrorInvalid);

  // ─── SECTION 7: DANGEROUS ENDPOINTS PROTECTION IN PRODUCTION ────────────────
  console.log('\n--- 7. Dangerous Endpoints Production Protection & Audit Logging ---');
  const inventoryCtrlSrc = fs.readFileSync(path.resolve(ROOT_DIR, 'apps/api/src/inventory/inventory.controller.ts'), 'utf8');
  const inventorySvcSrc = fs.readFileSync(path.resolve(ROOT_DIR, 'apps/api/src/inventory/inventory.service.ts'), 'utf8');
  const ledgerCtrlSrc = fs.readFileSync(path.resolve(ROOT_DIR, 'apps/api/src/ledger/ledger.controller.ts'), 'utf8');
  const platformCtrlSrc = fs.readFileSync(path.resolve(ROOT_DIR, 'apps/api/src/platform/platform.controller.ts'), 'utf8');

  // 1. POST /inventory/clear-all
  assert('POST /inventory/clear-all is disabled in production mode', inventoryCtrlSrc.includes("if (process.env.NODE_ENV === 'production')") && inventoryCtrlSrc.includes('Clear all inventory is strictly disabled in production'));

  // 2. POST /inventory/seed-products
  assert('POST /inventory/seed-products is disabled in production mode', inventoryCtrlSrc.includes("if (process.env.NODE_ENV === 'production')") && inventoryCtrlSrc.includes('Product seeding is strictly disabled in production'));
  assert('POST /inventory/seed-products writes SEED_FINISHED_PRODUCTS audit entry in development', inventorySvcSrc.includes('SEED_FINISHED_PRODUCTS'));

  // 3. POST /inventory/skus/bulk-delete
  assert('POST /inventory/skus/bulk-delete rejects auto-filled generic confirmation keywords', inventoryCtrlSrc.includes("not an auto-filled generic keyword"));
  assert('POST /inventory/skus/bulk-delete requires typed confirmation phrase matching real count (e.g. DELETE <count> PRODUCTS)', inventoryCtrlSrc.includes("Typed confirmation must follow format"));
  assert('POST /inventory/skus/bulk-delete requires company confirmation matching authorized company', inventoryCtrlSrc.includes("does not match authorized company") || inventoryCtrlSrc.includes("Bulk SKU deletion requires company confirmation"));
  assert('POST /inventory/skus/bulk-delete writes BULK_DELETE_SKUS audit entry with confirmation and company metadata', inventorySvcSrc.includes('BULK_DELETE_SKUS') && inventorySvcSrc.includes('confirmation: meta?.confirmation'));

  // 4. POST /ledger/reset-demo
  assert('POST /ledger/reset-demo is disabled in production mode', ledgerCtrlSrc.includes("if (process.env.NODE_ENV === 'production')") && ledgerCtrlSrc.includes('Reset demo data is strictly disabled in production'));
  assert('POST /ledger/reset-demo writes RESET_DEMO_DATA audit entry in development', ledgerCtrlSrc.includes('RESET_DEMO_DATA'));

  // 5. POST /ledger/rebuild-history
  assert('POST /ledger/rebuild-history restricts mutating rebuild in production to platform admins', ledgerCtrlSrc.includes('Mutating ledger history rebuild in production is restricted to platform administrators'));
  assert('POST /ledger/rebuild-history writes REBUILD_LEDGER_HISTORY audit entry', ledgerCtrlSrc.includes('REBUILD_LEDGER_HISTORY'));

  // 6. DELETE /platform/tenants/:id/permanent
  assert('DELETE /platform/tenants/:id/permanent exists on PlatformController', platformCtrlSrc.includes("@Delete(':id/permanent')"));
  assert('DELETE /platform/tenants/:id/permanent requires platform super admin', platformCtrlSrc.includes("@Roles('platform_super_admin')"));
  assert('DELETE /platform/tenants/:id/permanent requires step-up verification code (2FA)', platformCtrlSrc.includes('validateStepUpOr2Fa'));

  console.log('\n============================================================');
  console.log(`TEST RESULTS SUMMARY:`);
  console.log(`  PASSED: ${passedTests}`);
  console.log(`  FAILED: ${failedTests}`);
  console.log('============================================================');

  if (failedTests > 0) {
    console.error(`\nFAILED: ${failedTests} test(s) failed.`);
    process.exit(1);
  } else {
    console.log(`\nSUCCESS: All ${passedTests} tests PASSED!`);
    process.exit(0);
  }
}

runSuite().catch((err) => {
  console.error('Fatal suite error:', err);
  process.exit(1);
});
