/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.resolve(ROOT, 'apps/web/public');
const SEARCH_DIRS = [
  path.resolve(ROOT, 'apps/web/src'),
  path.resolve(ROOT, 'apps/web/index.html'),
];

console.log('[TEST] Checking that every file in apps/web/public is actively referenced...');

const publicFiles = fs.readdirSync(PUBLIC_DIR)
  .filter((file) => {
    const fullPath = path.join(PUBLIC_DIR, file);
    return fs.statSync(fullPath).isFile() && !file.startsWith('.htaccess');
  });

assert(publicFiles.length > 0, 'Public directory should contain assets');

// Read all source content
let combinedSource = '';
function collectSource(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    for (const child of fs.readdirSync(filePath)) {
      collectSource(path.join(filePath, child));
    }
  } else if (/\.(tsx?|jsx?|html|json|css)$/.test(filePath)) {
    combinedSource += '\n' + fs.readFileSync(filePath, 'utf8');
  }
}

for (const p of SEARCH_DIRS) {
  collectSource(p);
}

const unreferenced = [];
for (const file of publicFiles) {
  if (!combinedSource.includes(file)) {
    unreferenced.push(file);
  }
}

if (unreferenced.length > 0) {
  console.error('[FAIL] Found unreferenced files in apps/web/public:', unreferenced);
  process.exit(1);
}

console.log(`[PASS] All ${publicFiles.length} asset files in apps/web/public are actively referenced:`);
for (const file of publicFiles) {
  console.log(`  ✓ ${file}`);
}
process.exit(0);
