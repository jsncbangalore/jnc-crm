const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const SOURCE_ROOT = path.resolve(__dirname, '..');
const DEST_DIR = 'E:\\jsnc crm file';

console.log('================================================================');
console.log('EXPORTING CLEAN CODEBASE (FRONTEND & BACKEND)');
console.log('Source:     ', SOURCE_ROOT);
console.log('Destination:', DEST_DIR);
console.log('================================================================\n');

if (!fs.existsSync(DEST_DIR)) {
  fs.mkdirSync(DEST_DIR, { recursive: true });
}

// Ignore directories
const IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.gemini',
  '.vscode',
  '.idea',
  'backups',
  'deploy-bundle',
  'deploy-release',
  'zips',
  'scratch',
  'purchase-documents',
  'data',
  'coverage',
  '.turbo',
  '.next',
  'test-results',
  'logs',
  'evidence',
]);

// Ignore file extensions
const IGNORE_EXTENSIONS = new Set([
  '.zip',
  '.tar',
  '.gz',
  '.tgz',
  '.exe',
  '.log',
  '.tmp',
  '.pdf',
]);

let fileCount = 0;
let totalBytes = 0;

function shouldCopyFile(srcPath, relPath) {
  const stat = fs.statSync(srcPath);
  if (stat.isDirectory()) {
    const dirName = path.basename(srcPath);
    if (IGNORE_DIRS.has(dirName)) return false;
    return true;
  }

  const ext = path.extname(srcPath).toLowerCase();
  if (IGNORE_EXTENSIONS.has(ext)) return false;

  const fileName = path.basename(srcPath);
  // Ignore specific sensitive local environment files with live credentials
  if (fileName === '.env' || fileName === '.env.development' || fileName === '.env.test' || fileName === 'DumpStack.log') return false;

  // In scripts folder, ignore loose screenshot PNGs (keep only code files)
  if (relPath.startsWith('scripts' + path.sep) && ext === '.png') return false;

  return true;
}

function copyRecursive(src, dest, relBase = '') {
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const relPath = relBase ? path.join(relBase, entry.name) : entry.name;
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) {
        continue;
      }
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      copyRecursive(srcPath, destPath, relPath);
    } else if (entry.isFile()) {
      if (!shouldCopyFile(srcPath, relPath)) {
        continue;
      }
      const parentDir = path.dirname(destPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.copyFileSync(srcPath, destPath);
      fileCount++;
      totalBytes += fs.statSync(srcPath).size;
    }
  }
}

// Explicit components to copy (all frontend and backend code, configs, and scripts)
const ITEMS_TO_COPY = [
  'apps',
  'packages',
  'scripts',
  'deploy',
  'marketing-site',
  'docs',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'brand.lock.json',
  'vitest.config.mjs',
  'README.md',
  '.gitignore',
  '.env.development.example',
  '.env.example',
  'docker-compose.dev.yml',
  'render.yaml',
  'start-all.bat',
  'start-api.bat',
  'start-web.bat',
  'DEPLOYMENT_GUIDE.md',
  'POSTGRES_MIGRATION_GUIDE.md',
  'SECURITY.md',
  'ROLES_AND_PERMISSIONS_NOTES.md',
];

console.log('1. Copying clean code files directly into ' + DEST_DIR + '...');

for (const item of ITEMS_TO_COPY) {
  const src = path.join(SOURCE_ROOT, item);
  const dest = path.join(DEST_DIR, item);

  if (!fs.existsSync(src)) {
    console.log(`  [SKIP] ${item} does not exist in root.`);
    continue;
  }

  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    // Wipe target directory first to prevent stale leftover files
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
    }
    fs.mkdirSync(dest, { recursive: true });
    copyRecursive(src, dest, item);
    console.log(`  [OK] Cleanly copied directory: ${item}`);
  } else {
    fs.copyFileSync(src, dest);
    fileCount++;
    totalBytes += stat.size;
    console.log(`  [OK] Copied file: ${item}`);
  }
}

console.log(`\nDirect copy completed: ${fileCount} files (${(totalBytes / (1024 * 1024)).toFixed(2)} MB).\n`);

// 2. Create clean standalone ZIP files in DEST_DIR
console.log('2. Creating named ZIP file: jsnc-crm-all-code-files.zip in ' + DEST_DIR + '...');
const zip = new AdmZip();
const zipPath = path.join(DEST_DIR, 'jsnc-crm-all-code-files.zip');

for (const item of ITEMS_TO_COPY) {
  const itemPath = path.join(DEST_DIR, item);
  if (!fs.existsSync(itemPath)) continue;

  const stat = fs.statSync(itemPath);
  if (stat.isDirectory()) {
    zip.addLocalFolder(itemPath, item);
  } else {
    zip.addLocalFile(itemPath, '');
  }
}

zip.writeZip(zipPath);
const zipSize = fs.statSync(zipPath).size;
console.log(`  [OK] Successfully created: ${zipPath}`);
console.log(`  [OK] Archive Size: ${(zipSize / (1024 * 1024)).toFixed(2)} MB`);

// Also provide jnc-crm-all-code.zip for convenience
const altZipPath = path.join(DEST_DIR, 'jnc-crm-all-code.zip');
fs.copyFileSync(zipPath, altZipPath);
console.log(`  [OK] Also copied to: ${altZipPath}`);

// 3. Verify ZIP contents to confirm zero build files (dist, node_modules) are present
console.log('\n3. Verifying archive integrity...');
const verifyZip = new AdmZip(zipPath);
const entries = verifyZip.getEntries();
let hasBuildFiles = false;
let frontendCount = 0;
let backendCount = 0;

for (const entry of entries) {
  const name = entry.entryName;
  if (name.includes('node_modules/') || name.includes('/dist/') || name.startsWith('dist/')) {
    hasBuildFiles = true;
    console.error(`  [WARN] Unexpected build file inside ZIP: ${name}`);
  }
  if (name.startsWith('apps/web/')) frontendCount++;
  if (name.startsWith('apps/api/')) backendCount++;
}

console.log(`  Total files in archive: ${entries.length}`);
console.log(`  Frontend files (apps/web): ${frontendCount}`);
console.log(`  Backend files (apps/api): ${backendCount}`);
console.log(`  Build files present (node_modules, dist): ${hasBuildFiles ? 'YES (ERROR)' : 'NO (CLEAN)'}`);

if (hasBuildFiles) {
  console.error('\n[ERROR] Build files found in archive!');
  process.exit(1);
}

console.log('\n================================================================');
console.log('EXPORT FINISHED SUCCESSFULLY!');
console.log(`Location: ${DEST_DIR}`);
console.log(`ZIP:      ${zipPath}`);
console.log('================================================================');
