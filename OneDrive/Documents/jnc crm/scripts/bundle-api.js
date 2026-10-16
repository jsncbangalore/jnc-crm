/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const apiDir = path.join(repoRoot, 'apps/api');
const targetBundleDir = path.join(repoRoot, 'deploy-bundle/api');

console.log('========================================================================');
console.log('JNC-CRM API DEPLOYMENT BUNDLER');
console.log(`Source: ${apiDir}`);
console.log(`Target: ${targetBundleDir}`);
console.log('========================================================================\n');

// 1. Ensure dist exists
const distDir = path.join(apiDir, 'dist');
if (!fs.existsSync(distDir) || !fs.existsSync(path.join(distDir, 'main.js'))) {
  console.error('[BUNDLE ERROR] apps/api/dist/main.js not found. Please run `npm run build` first.');
  process.exit(1);
}

// 2. Clean and create bundle directory
if (fs.existsSync(targetBundleDir)) {
  fs.rmSync(targetBundleDir, { recursive: true, force: true });
}
fs.mkdirSync(targetBundleDir, { recursive: true });

// Helper to copy directory recursively
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 3. Copy dist/
console.log('[1/4] Copying compiled dist/ ...');
copyDirSync(distDir, path.join(targetBundleDir, 'dist'));

// 4. Copy prisma/schema.prisma
console.log('[2/4] Copying prisma/schema.prisma ...');
const targetPrismaDir = path.join(targetBundleDir, 'prisma');
fs.mkdirSync(targetPrismaDir, { recursive: true });
fs.copyFileSync(path.join(apiDir, 'prisma/schema.prisma'), path.join(targetPrismaDir, 'schema.prisma'));

// 5. Copy start_server.js
console.log('[3/4] Copying start_server.js ...');
fs.copyFileSync(path.join(apiDir, 'start_server.js'), path.join(targetBundleDir, 'start_server.js'));

// 6. Generate standalone package.json
console.log('[4/4] Generating standalone package.json ...');
const srcPackage = JSON.parse(fs.readFileSync(path.join(apiDir, 'package.json'), 'utf8'));

// Runtime dependencies required by the API
const bundleDependencies = {
  ...srcPackage.dependencies,
  express: srcPackage.dependencies.express || '^4.22.1',
  '@prisma/client': '^5.22.0',
  prisma: '^5.22.0', // pinned to @prisma/client version and placed in dependencies (not devDependencies)
};

const bundlePackageJson = {
  name: 'jnc-crm-api',
  version: '1.0.0',
  private: true,
  description: 'JNC CRM API - Standalone Hostinger Web App Deployment Bundle',
  scripts: {
    start: 'node start_server.js',
    postinstall: 'prisma generate',
  },
  dependencies: bundleDependencies,
};

fs.writeFileSync(
  path.join(targetBundleDir, 'package.json'),
  JSON.stringify(bundlePackageJson, null, 2) + '\n',
  'utf8'
);

console.log('\n========================================================================');
console.log('BUNDLE GENERATION COMPLETE');
console.log(`Bundle Location: ${targetBundleDir}`);
console.log('Contents:');
console.log(` - dist/ (${fs.readdirSync(path.join(targetBundleDir, 'dist')).length} top-level entries)`);
console.log(' - prisma/schema.prisma');
console.log(' - start_server.js');
console.log(` - package.json (${Object.keys(bundleDependencies).length} runtime dependencies, prisma pinned to ^5.22.0)`);
console.log('========================================================================\n');
