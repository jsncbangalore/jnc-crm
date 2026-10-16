/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const AdmZip = require('adm-zip');

const REPO_ROOT = path.resolve(__dirname, '..');
const ZIP_PATH = path.join(REPO_ROOT, 'deploy-release/jnc-api-bundle.zip');
const TEST_DIR = path.join(REPO_ROOT, 'deploy-release/test-bundle-engines');

function getDirSize(d) {
  let total = 0;
  try {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) total += getDirSize(p);
      else if (e.isFile()) total += fs.statSync(p).size;
    }
  } catch {}
  return total;
}

function findEngines(dir) {
  if (!fs.existsSync(dir)) return [];
  let res = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        res = res.concat(findEngines(p));
      } else if (e.name.includes('query_engine')) {
        const sz = fs.statSync(p).size;
        res.push({
          file: e.name,
          relativePath: path.relative(TEST_DIR, p),
          bytes: sz,
          mb: (sz / 1024 / 1024).toFixed(2) + ' MB',
        });
      }
    }
  } catch {}
  return res;
}

async function run() {
  console.log('========================================================================');
  console.log('TEST 2: STANDALONE BUNDLE EXTRACTION & PRISMA ENGINE AUDIT');
  console.log(`Zip Source: ${ZIP_PATH}`);
  console.log(`Target Dir: ${TEST_DIR}`);
  console.log('========================================================================\n');

  if (!fs.existsSync(ZIP_PATH)) {
    throw new Error(`Zip does not exist at ${ZIP_PATH}`);
  }

  // 1. Extract zip
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });

  console.log('[1/4] Extracting jnc-api-bundle.zip ...');
  const zip = new AdmZip(ZIP_PATH);
  zip.extractAllTo(TEST_DIR, true);

  // 2. Run npm install --omit=dev
  console.log('\n[2/4] Running npm install --omit=dev (standalone runtime dependencies) ...');
  execSync('npm install --omit=dev', {
    cwd: TEST_DIR,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });

  // 3. Scan for Prisma Query Engine binaries
  console.log('\n[3/4] Scanning for query engine binary files ...');
  const clientDir = path.join(TEST_DIR, 'node_modules/.prisma/client');
  const enginesDir = path.join(TEST_DIR, 'node_modules/@prisma/engines');

  const clientEngines = findEngines(clientDir);
  const cliEngines = findEngines(enginesDir);
  const allEngines = [...clientEngines, ...cliEngines];

  console.log('\n------------------------------------------------------------------------');
  console.log('PRISMA QUERY ENGINES DETECTED IN STANDALONE BUNDLE');
  console.log('------------------------------------------------------------------------');
  console.log('Binary File Name                            Size (Bytes)   Size (MB)   Location');
  console.log('---------------------------------------------------------------------------------');
  for (const eng of allEngines) {
    console.log(
      `${eng.file.padEnd(44)} ${String(eng.bytes).padStart(12)}  ${eng.mb.padStart(10)}   ${eng.relativePath}`
    );
  }
  console.log('---------------------------------------------------------------------------------');

  // 4. Calculate total node_modules size
  console.log('\n[4/4] Calculating total size of installed node_modules ...');
  const nmDir = path.join(TEST_DIR, 'node_modules');
  const totalNmBytes = getDirSize(nmDir);
  const totalNmMb = (totalNmBytes / 1024 / 1024).toFixed(2);
  console.log(` -> Total node_modules size: ${totalNmMb} MB (${totalNmBytes} bytes)`);

  // 5. Clean up test extraction to preserve disk space
  console.log('\n[Cleanup] Removing temporary test extraction folder ...');
  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
  } catch {
    try {
      require('child_process').execSync(`rmdir /s /q "${TEST_DIR}" 2>nul`);
    } catch {}
  }
  console.log(' -> Cleaned up successfully.');

  console.log('\n========================================================================');
  console.log('PRISMA ENGINES AUDIT RESULTS');
  console.log('========================================================================');
  console.log(`Total Engine Binaries Found : ${allEngines.length}`);
  console.log(`Total node_modules Size    : ${totalNmMb} MB`);
  console.log('========================================================================\n');
}

run().catch((err) => {
  console.error('[FATAL AUDIT ERROR]', err);
  try {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {}
  process.exit(1);
});
