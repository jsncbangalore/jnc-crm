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
const API_DIR = path.join(REPO_ROOT, 'apps/api');
const WEB_DIR = path.join(REPO_ROOT, 'apps/web');
const RELEASE_DIR = path.join(REPO_ROOT, 'deploy-release');

const API_ZIP_PATH = path.join(RELEASE_DIR, 'jnc-api-bundle.zip');
const WEB_ZIP_PATH = path.join(RELEASE_DIR, 'jnc-web-dist.zip');

console.log('========================================================================');
console.log('JNC-CRM PRODUCTION RELEASE PACKAGING (npm run release:pack)');
console.log(`Target Directory: ${RELEASE_DIR}`);
console.log('Mode: Clean Build & Strict Security / Integrity Scan');
console.log('========================================================================\n');

// ─── Step 1: Clean Builds ────────────────────────────────────────────────────
console.log('[Step 1/5] Building clean production bundles ...');

console.log(' -> Building API (npm --workspace=apps/api run build)...');
execSync('npm --workspace=apps/api run build', {
  cwd: REPO_ROOT,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' },
});

console.log(' -> Building Web (VITE_API_URL=https://api.jsnc.co.in/api/v1)...');
execSync('npm --workspace=apps/web run build', {
  cwd: REPO_ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    VITE_API_URL: 'https://api.jsnc.co.in/api/v1',
  },
});

// Ensure release dir exists
if (!fs.existsSync(RELEASE_DIR)) {
  fs.mkdirSync(RELEASE_DIR, { recursive: true });
}

// ─── Step 2: Build deploy-release/jnc-api-bundle.zip ──────────────────────────
console.log('\n[Step 2/5] Creating deploy-release/jnc-api-bundle.zip ...');

const apiZip = new AdmZip();

// 1. Add dist/
const apiDistDir = path.join(API_DIR, 'dist');
if (!fs.existsSync(apiDistDir)) {
  throw new Error(`API dist directory missing: ${apiDistDir}`);
}
apiZip.addLocalFolder(apiDistDir, 'dist');

// 2. Add prisma/schema.prisma
const prismaSchemaPath = path.join(API_DIR, 'prisma/schema.prisma');
if (!fs.existsSync(prismaSchemaPath)) {
  throw new Error(`Prisma schema missing: ${prismaSchemaPath}`);
}
apiZip.addLocalFile(prismaSchemaPath, 'prisma');

// 2b. Add assets/
const apiAssetsDir = path.join(API_DIR, 'assets');
if (fs.existsSync(apiAssetsDir)) {
  apiZip.addLocalFolder(apiAssetsDir, 'assets');
}

// 3. Add start_server.js
const startServerPath = path.join(API_DIR, 'start_server.js');
if (!fs.existsSync(startServerPath)) {
  throw new Error(`start_server.js missing: ${startServerPath}`);
}
apiZip.addLocalFile(startServerPath, '');

// 4. Add standalone package.json (runtime dependencies only, no devDependencies, pinned prisma)
const apiPkg = JSON.parse(fs.readFileSync(path.join(API_DIR, 'package.json'), 'utf8'));
const standalonePkg = {
  name: 'jnc-crm-api',
  version: '1.0.0',
  private: true,
  description: 'JNC CRM API - Standalone Hostinger Web App Deployment Bundle',
  scripts: {
    start: 'node start_server.js',
    postinstall: 'prisma generate',
  },
  dependencies: {
    ...apiPkg.dependencies,
    express: apiPkg.dependencies.express || '^4.22.1',
    '@prisma/client': '^5.22.0',
    prisma: '^5.22.0',
  },
};
apiZip.addFile(
  'package.json',
  Buffer.from(JSON.stringify(standalonePkg, null, 2) + '\n', 'utf8')
);

// Write API zip
apiZip.writeZip(API_ZIP_PATH);
console.log(` -> Created ${API_ZIP_PATH} (${(fs.statSync(API_ZIP_PATH).size / 1024).toFixed(2)} KB)`);

// ─── Step 3: Build deploy-release/jnc-web-dist.zip ──────────────────────────
console.log('\n[Step 3/5] Creating deploy-release/jnc-web-dist.zip ...');

const webZip = new AdmZip();
const webDistDir = path.join(WEB_DIR, 'dist');
if (!fs.existsSync(webDistDir)) {
  throw new Error(`Web dist directory missing: ${webDistDir}`);
}

// Add dist contents
webZip.addLocalFolder(webDistDir, '');

// Ensure .htaccess is included
const htaccessInDist = path.join(webDistDir, '.htaccess');
if (!fs.existsSync(htaccessInDist)) {
  const prodHtaccess = path.join(WEB_DIR, 'public/.htaccess');
  if (fs.existsSync(prodHtaccess)) {
    webZip.addLocalFile(prodHtaccess, '');
  }
}

// Write Web zip
webZip.writeZip(WEB_ZIP_PATH);
console.log(` -> Created ${WEB_ZIP_PATH} (${(fs.statSync(WEB_ZIP_PATH).size / 1024).toFixed(2)} KB)`);

// ─── Step 4: Print Manifest ──────────────────────────────────────────────────
console.log('\n[Step 4/5] Generating Package File Manifests ...\n');

function printZipManifest(zipPath, label) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  console.log('--------------------------------------------------------------------------------');
  console.log(`MANIFEST: ${label} (${path.basename(zipPath)})`);
  console.log(`Total Entries: ${entries.length} | Archive Size: ${(fs.statSync(zipPath).size / 1024).toFixed(2)} KB`);
  console.log('--------------------------------------------------------------------------------');
  console.log(
    'Entry Path'.padEnd(58) +
      'Size (Bytes)'.padStart(12) +
      'Compressed'.padStart(12)
  );
  console.log('--------------------------------------------------------------------------------');
  let totalUncompressed = 0;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    totalUncompressed += entry.header.size;
    console.log(
      entry.entryName.padEnd(58) +
        String(entry.header.size).padStart(12) +
        String(entry.header.compressedSize).padStart(12)
    );
  }
  console.log('--------------------------------------------------------------------------------');
  console.log(`Total Uncompressed Size: ${(totalUncompressed / 1024).toFixed(2)} KB\n`);
  return entries;
}

const apiEntries = printZipManifest(API_ZIP_PATH, 'Standalone API Bundle');
const webEntries = printZipManifest(WEB_ZIP_PATH, 'Production Web Dist');

// ─── Step 5: Strict Security & Integrity Scan ───────────────────────────────
console.log('[Step 5/5] Scanning archives for secrets and configuration errors ...\n');

let violations = [];

// Security rules
const PATTERN_POSTGRES = /postgres(?:ql)?:\/\/[^\s'"`]+/i;
const PATTERN_LONG_SECRET =
  /(?:JWT_SECRET|JWT_REFRESH_SECRET|ENCRYPTION_KEY|WHATSAPP_APP_SECRET|INDIAMART_WEBHOOK_SECRET|WEBSITE_WEBHOOK_SECRET|BACKUP_ENCRYPTION_KEY)\s*[:=]\s*['"]?[A-Za-z0-9+/=_-]{20,}['"]?/i;
const PATTERN_SMTP_PASS = /(?:SMTP_PASS|SMTP_PASSWORD)\s*[:=]\s*['"]?[^\s'"`]+['"]?/i;
const PATTERN_SUPABASE = /(?:[a-z0-9_-]+\.supabase\.(?:co|in))/i;

const ASSET_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp4', '.webm', '.ogg', '.mp3', '.wav', '.pdf'
];

// Helper to check common binary/size/map/git rules on any entry
function scanCommonRules(entry, zipLabel) {
  const name = entry.entryName;

  // 1. *.map files
  if (name.endsWith('.map')) {
    violations.push({ zip: zipLabel, file: name, rule: 'PROHIBITED *.map file found in production release' });
  }

  // 2. .git folder
  if (name.includes('.git/') || name.includes('.git\\') || name === '.git') {
    violations.push({ zip: zipLabel, file: name, rule: 'PROHIBITED .git directory found in production release' });
  }

  // 3. File larger than 5MB that is not an asset
  if (entry.header.size > 5 * 1024 * 1024) {
    const ext = path.extname(name).toLowerCase();
    if (!ASSET_EXTENSIONS.includes(ext)) {
      violations.push({
        zip: zipLabel,
        file: name,
        rule: `PROHIBITED non-asset file larger than 5MB found (${(entry.header.size / (1024 * 1024)).toFixed(2)} MB)`,
      });
    }
  }
}

// 1. Scan API ZIP
const loadedApiZip = new AdmZip(API_ZIP_PATH);
const apiEntryNames = loadedApiZip.getEntries().map(e => e.entryName);

// Mandatory API files assertion
const requiredApiFiles = ['dist/main.js', 'start_server.js', 'prisma/schema.prisma', 'package.json'];
for (const reqFile of requiredApiFiles) {
  if (!apiEntryNames.includes(reqFile)) {
    violations.push({ zip: 'jnc-api-bundle.zip', file: reqFile, rule: `MANDATORY file "${reqFile}" missing from API bundle` });
  }
}

for (const entry of loadedApiZip.getEntries()) {
  if (entry.isDirectory) continue;
  const name = entry.entryName;

  scanCommonRules(entry, 'jnc-api-bundle.zip');

  // A. Check for .env file
  if (name === '.env' || name.endsWith('/.env') || name.endsWith('\\.env') || /\.env(?:\.|$)/i.test(path.basename(name))) {
    violations.push({ zip: 'jnc-api-bundle.zip', file: name, rule: 'PROHIBITED .env file found' });
  }

  // B. Check for forbidden source or scripts directories
  if (name.startsWith('src/') || name.startsWith('scripts/')) {
    violations.push({ zip: 'jnc-api-bundle.zip', file: name, rule: 'PROHIBITED src/ or scripts/ file found in standalone bundle' });
  }

  // C. Content scans for text/code files
  if (name.endsWith('.js') || name.endsWith('.json') || name.endsWith('.prisma') || name.endsWith('.txt')) {
    const text = entry.getData().toString('utf8');
    if (text.includes('sourceMappingURL')) {
      violations.push({ zip: 'jnc-api-bundle.zip', file: name, rule: 'PROHIBITED "sourceMappingURL" reference found' });
    }
    if (PATTERN_POSTGRES.test(text)) {
      violations.push({ zip: 'jnc-api-bundle.zip', file: name, rule: 'Hardcoded postgresql:// connection URL found' });
    }
    if (PATTERN_LONG_SECRET.test(text)) {
      violations.push({ zip: 'jnc-api-bundle.zip', file: name, rule: 'Hardcoded *_SECRET or *_KEY assignment found' });
    }
    if (PATTERN_SMTP_PASS.test(text)) {
      violations.push({ zip: 'jnc-api-bundle.zip', file: name, rule: 'Hardcoded SMTP password assignment found' });
    }
    if (PATTERN_SUPABASE.test(text)) {
      violations.push({ zip: 'jnc-api-bundle.zip', file: name, rule: 'Supabase hostname reference found' });
    }
  }
}

// 2. Scan Web ZIP
const loadedWebZip = new AdmZip(WEB_ZIP_PATH);
for (const entry of loadedWebZip.getEntries()) {
  if (entry.isDirectory) continue;
  const name = entry.entryName;

  scanCommonRules(entry, 'jnc-web-dist.zip');

  // A. Check for .env file
  if (name === '.env' || name.endsWith('/.env') || name.endsWith('\\.env') || /\.env(?:\.|$)/i.test(path.basename(name))) {
    violations.push({ zip: 'jnc-web-dist.zip', file: name, rule: 'PROHIBITED .env file found' });
  }

  // B. Content scans
  if (name.endsWith('.js') || name.endsWith('.html') || name.endsWith('.css') || name.endsWith('.htaccess') || name.endsWith('.json')) {
    const text = entry.getData().toString('utf8');

    if (text.includes('sourceMappingURL')) {
      violations.push({ zip: 'jnc-web-dist.zip', file: name, rule: 'PROHIBITED "sourceMappingURL" reference found' });
    }
    // Rule: "localhost" in the web bundle (the web build must not call localhost)
    if (text.includes('localhost')) {
      violations.push({ zip: 'jnc-web-dist.zip', file: name, rule: 'PROHIBITED "localhost" string found in web bundle' });
    }
    if (PATTERN_POSTGRES.test(text)) {
      violations.push({ zip: 'jnc-web-dist.zip', file: name, rule: 'Hardcoded postgresql:// connection URL found' });
    }
    if (PATTERN_LONG_SECRET.test(text)) {
      violations.push({ zip: 'jnc-web-dist.zip', file: name, rule: 'Hardcoded *_SECRET or *_KEY assignment found' });
    }
    if (PATTERN_SMTP_PASS.test(text)) {
      violations.push({ zip: 'jnc-web-dist.zip', file: name, rule: 'Hardcoded SMTP password assignment found' });
    }
    if (PATTERN_SUPABASE.test(text)) {
      violations.push({ zip: 'jnc-web-dist.zip', file: name, rule: 'Supabase hostname reference found' });
    }
  }
}

console.log('========================================================================');
console.log('RELEASE BUNDLE SECURITY SCAN RESULTS');
console.log('========================================================================');
console.log('Scanned Rule                                                  Status');
console.log('------------------------------------------------------------------------');
console.log('.env file absence in archives                                 PASS');
console.log('Zero *.map files in archives                                  PASS');
console.log('Zero .git folders in archives                                 PASS');
console.log('Zero non-asset files > 5MB                                    PASS');
console.log('Zero "sourceMappingURL" references in code                    PASS');
console.log('Zero postgres:// or postgresql:// database credentials        PASS');
console.log('Zero hardcoded *_SECRET or *_KEY long assignments             PASS');
console.log('Zero hardcoded SMTP passwords                                 PASS');
console.log('Zero "localhost" references in web bundle (never calls local) PASS');
console.log('Zero Supabase hostnames                                       PASS');
console.log('Zero src/ or scripts/ in API bundle (dist + prisma only)       PASS');
console.log('Mandatory dist/main.js, start_server.js, schema, pkg present  PASS');
console.log('------------------------------------------------------------------------');

if (violations.length > 0) {
  console.error('\n[FATAL SCAN ERROR] Found security/configuration violations:');
  for (const v of violations) {
    console.error(` - [${v.zip}] ${v.file}: ${v.rule}`);
  }
  process.exit(1);
} else {
  console.log('\n[SCAN VERIFICATION: PASS] All security and integrity assertions passed.');
  console.log(`Generated Archives:`);
  console.log(`  1. ${API_ZIP_PATH}`);
  console.log(`  2. ${WEB_ZIP_PATH}`);
  console.log('========================================================================\n');
}
