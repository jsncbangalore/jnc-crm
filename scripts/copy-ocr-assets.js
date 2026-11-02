// Copies the OCR engine files from node_modules into apps/web/public/ocr so the
// browser loads them from OUR site (the production CSP blocks public CDNs).
// Safe to run many times. Run automatically before dev and build.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'apps', 'web', 'public', 'ocr');
fs.mkdirSync(path.join(out, 'core'), { recursive: true });

function find(rel) {
  for (const base of [root, path.join(root, 'apps', 'web')]) {
    const p = path.join(base, 'node_modules', rel);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const worker = find('tesseract.js/dist/worker.min.js');
if (!worker) {
  console.error('[ocr] tesseract.js not installed. Run npm install first.');
  process.exit(1);
}
fs.copyFileSync(worker, path.join(out, 'worker.min.js'));

const coreDir = find('tesseract.js-core');
if (!coreDir) {
  console.error('[ocr] tesseract.js-core not found.');
  process.exit(1);
}
let n = 0;
for (const f of fs.readdirSync(coreDir)) {
  if (/^tesseract-core.*\.(js|wasm)$/.test(f)) {
    fs.copyFileSync(path.join(coreDir, f), path.join(out, 'core', f));
    n++;
  }
}
console.log(`[ocr] copied worker + ${n} core files to apps/web/public/ocr`);
