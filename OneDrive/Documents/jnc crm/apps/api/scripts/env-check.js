/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim();
        let val = trimmed.substring(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

// Load env file from command argument or default to apps/api/.env
const targetEnv = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, '../.env');

loadEnvFile(targetEnv);

console.log('========================================================================');
console.log('JNC-CRM ENVIRONMENT HEALTH & SECURITY CHECK (env:check)');
console.log(`Source File: ${targetEnv} (exists: ${fs.existsSync(targetEnv)})`);
console.log('Mode: Unified Validator Shared with Server Startup Guard');
console.log('========================================================================\n');

// Load unified validator from compiled dist/ or via ts-node in development
let envModule;
try {
  envModule = require('../dist/common/env-validation');
} catch (e) {
  try {
    require('ts-node/register');
    envModule = require('../src/common/env-validation');
  } catch (err) {
    console.error('Fatal: Failed to load env-validation module:', err.message);
    process.exit(1);
  }
}

const { validateEnvironment, ENV_CATALOG } = envModule;

const result = validateEnvironment(process.env, { exitOnError: false, verbose: true });

console.log('--- REQUIRED RUNTIME VARIABLES ---');
const required = ENV_CATALOG.filter((c) => c.category === 'REQUIRED');
for (const item of required) {
  const isMissing = result.missingVariables.includes(item.key);
  const isInvalid = result.invalidVariables.some((inv) => inv.includes(item.key));
  if (isMissing) {
    console.log(`[MISSING] ${item.key.padEnd(22)}: NOT SET (${item.description})`);
  } else if (isInvalid) {
    console.log(`[INVALID] ${item.key.padEnd(22)}: FAILED VALIDATION`);
  } else {
    let displayVal = item.isSecret ? '<MASKED>' : process.env[item.key];
    if (item.key === 'DATABASE_URL') {
      try {
        const parsed = new URL(process.env.DATABASE_URL);
        displayVal = `${parsed.protocol}//***@${parsed.hostname}:${parsed.port || 5432}${parsed.pathname}`;
      } catch {
        displayVal = '<MASKED>';
      }
    }
    console.log(`[OK]      ${item.key.padEnd(22)}: ${displayVal}`);
  }
}

console.log('\n--- FEATURE-GATED VARIABLES (503/404 when disabled) ---');
const gated = ENV_CATALOG.filter((c) => c.category === 'FEATURE-GATED');
for (const item of gated) {
  const status = result.featureGatedStatus[item.key];
  if (status === 'enabled') {
    console.log(`[ENABLED]  ${item.key.padEnd(26)}: CONFIGURED (<MASKED>)`);
  } else {
    console.log(`[DISABLED] ${item.key.padEnd(26)}: NOT CONFIGURED (Routes return 503/404)`);
  }
}

if (result.warnings.length > 0) {
  console.log('\n--- WARNINGS & DEPRECATIONS ---');
  result.warnings.forEach((w) => console.log(`[WARN] ${w}`));
}

if (result.invalidVariables.length > 0) {
  console.log('\n--- VALIDATION ERRORS ---');
  result.invalidVariables.forEach((e) => console.log(`[ERROR] ${e}`));
}

console.log('\n------------------------------------------------------------------------');
if (result.isValid) {
  console.log('[RESULT: PASS] All required environment variables and secrets are configured and valid.');
  console.log('========================================================================');
  process.exit(0);
} else {
  console.error(`[RESULT: FAIL] ${result.missingVariables.length} missing and ${result.invalidVariables.length} invalid variable(s).`);
  console.log('========================================================================');
  process.exit(1);
}
