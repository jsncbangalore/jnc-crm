/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const { Prisma } = require('@prisma/client');

const LIVE_SCRIPTS = [
  'scripts/live-reset-account.js',
  'scripts/live-status.js',
  'scripts/db-backup.js',
  'scripts/bootstrap-live.js',
  'scripts/dev-live.js',
  'scripts/db-preflight-live.js',
];

const models = Prisma.dmmf.datamodel.models;
const modelMap = {};
models.forEach(m => {
  const fields = new Set(m.fields.map(f => f.name));
  modelMap[m.name] = fields;
  modelMap[m.name.toLowerCase()] = { name: m.name, fields };
});

console.log('========================================================================');
console.log('PRISMA SCHEMA FIELD CHECK FOR LIVE SCRIPTS');
console.log('========================================================================');
console.log(`Loaded ${models.length} Prisma models from schema.`);

let hasError = false;

// Custom field validation for model calls found in live scripts
LIVE_SCRIPTS.forEach(scriptRelPath => {
  const fullPath = path.resolve(__dirname, '..', scriptRelPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`[CHECK FAIL] Script missing: ${scriptRelPath}`);
    hasError = true;
    return;
  }

  const code = fs.readFileSync(fullPath, 'utf8');
  console.log(`\nScanning ${scriptRelPath}...`);

  // Match pattern: prisma.<modelName>.<method>({ ... })
  const prismaCallRegex = /prisma\.([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\s*\(\s*(\{[\s\S]*?\})\s*\)/g;
  let match;

  while ((match = prismaCallRegex.exec(code)) !== null) {
    const rawModel = match[1];
    const method = match[2];
    const objectArg = match[3];

    const modelInfo = modelMap[rawModel.toLowerCase()];
    if (!modelInfo) {
      // Could be $transaction, $connect, etc.
      continue;
    }

    // Inspect fields in where: { ... } or data: { ... }
    const keysInObject = extractKeysFromObjectLiteral(objectArg);
    keysInObject.forEach(key => {
      // Ignore nested query operators like OR, AND, NOT, in
      if (['where', 'data', 'select', 'include', 'OR', 'AND', 'NOT', 'in', 'increment', 'decrement'].includes(key)) {
        return;
      }
      if (!modelInfo.fields.has(key)) {
        console.error(`[FIELD ERROR] In ${scriptRelPath}: Model "${modelInfo.name}" has no field "${key}".`);
        hasError = true;
      }
    });
  }
});

function extractKeysFromObjectLiteral(str) {
  const keys = new Set();
  // Regex to match property keys in JS objects: key: or 'key': or "key":
  const keyRegex = /(?:^|[\{,\s])([a-zA-Z0-9_]+)\s*:/g;
  let match;
  while ((match = keyRegex.exec(str)) !== null) {
    keys.add(match[1]);
  }
  return Array.from(keys);
}

console.log('------------------------------------------------------------------------');
if (hasError) {
  console.error('[CHECK FAILED] One or more live scripts reference non-existent Prisma fields.');
  process.exit(1);
} else {
  console.log('[CHECK PASSED] All live script Prisma queries use valid model field names.');
  process.exit(0);
}
