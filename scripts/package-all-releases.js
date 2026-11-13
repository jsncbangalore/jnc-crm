/**
 * Package All Release & Source Archives
 *
 * Generates:
 * 1. deploy-release/web-dist.zip (Production Frontend build)
 * 2. deploy-release/api-bundle.zip (Production Backend build)
 * 3. deploy-release/crm-full-deploy.zip (Combined Production Frontend + Backend deployment package)
 * 4. deploy-release/frontend-source.zip (Clean Frontend source code)
 * 5. deploy-release/backend-source.zip (Clean Backend source code)
 * 6. deploy-release/crm-full-source.zip (Complete clean project source code)
 */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const REPO_ROOT = path.resolve(__dirname, '..');
const RELEASE_DIR = path.join(REPO_ROOT, 'deploy-release');
if (!fs.existsSync(RELEASE_DIR)) fs.mkdirSync(RELEASE_DIR, { recursive: true });

console.log('========================================================================');
console.log('PACKAGING FRONTEND & BACKEND RELEASE & SOURCE ZIP ARCHIVES');
console.log(`Destination: ${RELEASE_DIR}`);
console.log('========================================================================\n');

// 1. Verify Production deploy zips exist
const apiBundlePath = path.join(RELEASE_DIR, 'api-bundle.zip');
const webDistPath = path.join(RELEASE_DIR, 'web-dist.zip');

if (!fs.existsSync(apiBundlePath) || !fs.existsSync(webDistPath)) {
  console.log('Production build zips missing, running release-pack first...');
  const { execSync } = require('child_process');
  execSync('node scripts/release-pack.js', { cwd: REPO_ROOT, stdio: 'inherit' });
}

// 2. Create deploy-release/crm-full-deploy.zip
console.log('[1/4] Creating deploy-release/crm-full-deploy.zip (Combined Deployment)...');
const fullDeployZip = new AdmZip();

// Add api-bundle contents under backend/
const apiZip = new AdmZip(apiBundlePath);
for (const entry of apiZip.getEntries()) {
  if (entry.isDirectory) continue;
  fullDeployZip.addFile(`backend/${entry.entryName}`, entry.getData());
}

// Add web-dist contents under frontend/
const webZip = new AdmZip(webDistPath);
for (const entry of webZip.getEntries()) {
  if (entry.isDirectory) continue;
  fullDeployZip.addFile(`frontend/${entry.entryName}`, entry.getData());
}

// Add Deployment README
const deployReadme = `# JNC CRM - Production Deployment Package

## Contents:
- \`frontend/\`: Compiled production static web assets ready for Hostinger, Apache, Nginx, or Vercel/Netlify. Contains \`.htaccess\` with strict security headers (no \`wasm-unsafe-eval\`).
- \`backend/\`: Standalone Node.js NestJS API bundle with \`dist/\`, \`prisma/\`, and production runner \`start_server.js\`.

## Quick Start:

### 1. Frontend:
Upload the contents of \`frontend/\` to your web server document root (e.g. \`public_html\`).

### 2. Backend:
1. Upload \`backend/\` to your Node.js hosting server (Render, Hostinger VPS, AWS, etc.).
2. Run \`npm install --production\` to install runtime dependencies.
3. Configure your production environment variables (DATABASE_URL, JWT_SECRET, etc.).
4. Start with: \`node start_server.js\`.
`;

fullDeployZip.addFile('README.md', Buffer.from(deployReadme, 'utf8'));
const fullDeployPath = path.join(RELEASE_DIR, 'crm-full-deploy.zip');
fullDeployZip.writeZip(fullDeployPath);
console.log(`  ✓ Created ${fullDeployPath} (${(fs.statSync(fullDeployPath).size / 1024 / 1024).toFixed(2)} MB)`);

// Helper to recursively collect files ignoring patterns
function getFilesRecursive(dir, baseDir = dir, ignores = []) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
    const fullPath = path.join(dir, item.name);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

    const shouldIgnore = ignores.some((ign) => {
      if (typeof ign === 'string') {
        return relPath === ign || relPath.startsWith(ign + '/') || item.name === ign;
      }
      return ign.test(relPath) || ign.test(item.name);
    });

    if (shouldIgnore) continue;

    if (item.isDirectory()) {
      results = results.concat(getFilesRecursive(fullPath, baseDir, ignores));
    } else {
      results.push({ fullPath, relPath });
    }
  }
  return results;
}

const COMMON_IGNORES = [
  'node_modules',
  'dist',
  '.git',
  '.DS_Store',
  'Thumbs.db',
  /\.env(\.local|\.development)?$/,
  /.*\.log$/,
  'coverage',
  '.turbo',
  'evidence',
];

// 3. Create deploy-release/frontend-source.zip
console.log('\n[2/4] Creating deploy-release/frontend-source.zip (Frontend Source Code)...');
const frontendSourceZip = new AdmZip();
const webSrcFiles = getFilesRecursive(path.join(REPO_ROOT, 'apps/web'), path.join(REPO_ROOT, 'apps/web'), COMMON_IGNORES);
for (const file of webSrcFiles) {
  frontendSourceZip.addLocalFile(file.fullPath, path.dirname(file.relPath) === '.' ? '' : path.dirname(file.relPath));
}
const frontendSourcePath = path.join(RELEASE_DIR, 'frontend-source.zip');
frontendSourceZip.writeZip(frontendSourcePath);
console.log(`  ✓ Created ${frontendSourcePath} (${(fs.statSync(frontendSourcePath).size / 1024 / 1024).toFixed(2)} MB, ${webSrcFiles.length} files)`);

// 4. Create deploy-release/backend-source.zip
console.log('\n[3/4] Creating deploy-release/backend-source.zip (Backend Source Code)...');
const backendSourceZip = new AdmZip();
const apiSrcFiles = getFilesRecursive(path.join(REPO_ROOT, 'apps/api'), path.join(REPO_ROOT, 'apps/api'), COMMON_IGNORES);
for (const file of apiSrcFiles) {
  backendSourceZip.addLocalFile(file.fullPath, path.dirname(file.relPath) === '.' ? '' : path.dirname(file.relPath));
}
const backendSourcePath = path.join(RELEASE_DIR, 'backend-source.zip');
backendSourceZip.writeZip(backendSourcePath);
console.log(`  ✓ Created ${backendSourcePath} (${(fs.statSync(backendSourcePath).size / 1024 / 1024).toFixed(2)} MB, ${apiSrcFiles.length} files)`);

// 5. Create deploy-release/crm-full-source.zip
console.log('\n[4/4] Creating deploy-release/crm-full-source.zip (Full Codebase Source Archive)...');
const fullSourceZip = new AdmZip();
const FULL_IGNORES = [
  ...COMMON_IGNORES,
  'deploy-release',
  'deploy-bundle',
  'scratch',
  '.system_generated',
];
const fullSrcFiles = getFilesRecursive(REPO_ROOT, REPO_ROOT, FULL_IGNORES);
for (const file of fullSrcFiles) {
  fullSourceZip.addLocalFile(file.fullPath, path.dirname(file.relPath) === '.' ? '' : path.dirname(file.relPath));
}
const fullSourcePath = path.join(RELEASE_DIR, 'crm-full-source.zip');
fullSourceZip.writeZip(fullSourcePath);
console.log(`  ✓ Created ${fullSourcePath} (${(fs.statSync(fullSourcePath).size / 1024 / 1024).toFixed(2)} MB, ${fullSrcFiles.length} files)`);

console.log('\n========================================================================');
console.log('ALL ZIP FILES SUCCESSFULLY GENERATED IN deploy-release/');
console.log('========================================================================\n');
console.log('Generated Files:');
console.log(`  1. Frontend Production Build : ${webDistPath} (${(fs.statSync(webDistPath).size / 1024).toFixed(1)} KB)`);
console.log(`  2. Backend Production Build  : ${apiBundlePath} (${(fs.statSync(apiBundlePath).size / 1024 / 1024).toFixed(2)} MB)`);
console.log(`  3. Full Combined Production  : ${fullDeployPath} (${(fs.statSync(fullDeployPath).size / 1024 / 1024).toFixed(2)} MB)`);
console.log(`  4. Frontend Source Archive   : ${frontendSourcePath} (${(fs.statSync(frontendSourcePath).size / 1024 / 1024).toFixed(2)} MB)`);
console.log(`  5. Backend Source Archive    : ${backendSourcePath} (${(fs.statSync(backendSourcePath).size / 1024 / 1024).toFixed(2)} MB)`);
console.log(`  6. Full Project Source       : ${fullSourcePath} (${(fs.statSync(fullSourcePath).size / 1024 / 1024).toFixed(2)} MB)`);
