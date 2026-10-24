/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const REPO_ROOT = path.resolve(__dirname, '..');
const API_DIR = path.join(REPO_ROOT, 'apps/api');
const WEB_DIR = path.join(REPO_ROOT, 'apps/web');
const RELEASE_DIR = path.join(REPO_ROOT, 'deploy-release');

if (!fs.existsSync(RELEASE_DIR)) {
  fs.mkdirSync(RELEASE_DIR, { recursive: true });
}

console.log('Packaging Frontend and Backend Zip Files...');

// 1. Frontend Dist (Production build)
console.log('1. Packing web-dist.zip...');
const webDistZip = new AdmZip();
const webDistDir = path.join(WEB_DIR, 'dist');
if (fs.existsSync(webDistDir)) {
  webDistZip.addLocalFolder(webDistDir, '');
  const htaccess = path.join(WEB_DIR, 'public/.htaccess');
  if (fs.existsSync(htaccess)) {
    webDistZip.addLocalFile(htaccess, '');
  }
  const webDistPath = path.join(RELEASE_DIR, 'web-dist.zip');
  webDistZip.writeZip(webDistPath);
  console.log(` -> Created ${webDistPath} (${(fs.statSync(webDistPath).size / (1024 * 1024)).toFixed(2)} MB)`);
}

// 2. Backend Bundle (Production standalone bundle)
console.log('2. Packing api-bundle.zip...');
const apiBundleZip = new AdmZip();
const apiDistDir = path.join(API_DIR, 'dist');
if (fs.existsSync(apiDistDir)) {
  apiBundleZip.addLocalFolder(apiDistDir, 'dist');
  const schemaPath = path.join(API_DIR, 'prisma/schema.prisma');
  if (fs.existsSync(schemaPath)) apiBundleZip.addLocalFile(schemaPath, 'prisma');
  const assetsDir = path.join(API_DIR, 'assets');
  if (fs.existsSync(assetsDir)) apiBundleZip.addLocalFolder(assetsDir, 'assets');
  const startServer = path.join(API_DIR, 'start_server.js');
  if (fs.existsSync(startServer)) apiBundleZip.addLocalFile(startServer, '');

  const apiPkg = JSON.parse(fs.readFileSync(path.join(API_DIR, 'package.json'), 'utf8'));
  const standalonePkg = {
    name: 'crm-api',
    version: '1.0.0',
    private: true,
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
  apiBundleZip.addFile('package.json', Buffer.from(JSON.stringify(standalonePkg, null, 2) + '\n', 'utf8'));

  const apiBundlePath = path.join(RELEASE_DIR, 'api-bundle.zip');
  apiBundleZip.writeZip(apiBundlePath);
  console.log(` -> Created ${apiBundlePath} (${(fs.statSync(apiBundlePath).size / 1024).toFixed(2)} KB)`);
}

// Helper to recursively add files excluding node_modules, dist, etc.
function addSourceFolder(zip, sourceDir, zipPrefix, excludes) {
  function walk(currentDir, currentPrefix) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryName = entry.name;
      if (excludes.includes(entryName)) continue;
      if (entryName.startsWith('.git') && entryName !== '.gitignore') continue;

      const fullPath = path.join(currentDir, entryName);
      const zipPath = currentPrefix ? `${currentPrefix}/${entryName}` : entryName;

      if (entry.isDirectory()) {
        walk(fullPath, zipPath);
      } else if (entry.isFile()) {
        zip.addLocalFile(fullPath, currentPrefix);
      }
    }
  }
  walk(sourceDir, zipPrefix);
}

// 3. Frontend Source (Clean source code)
console.log('3. Packing frontend-source.zip...');
const webSrcZip = new AdmZip();
addSourceFolder(webSrcZip, WEB_DIR, '', ['node_modules', 'dist', '.vite', '.turbo', '.cache']);
const webSrcPath = path.join(RELEASE_DIR, 'frontend-source.zip');
webSrcZip.writeZip(webSrcPath);
console.log(` -> Created ${webSrcPath} (${(fs.statSync(webSrcPath).size / (1024 * 1024)).toFixed(2)} MB)`);

// 4. Backend Source (Clean source code)
console.log('4. Packing backend-source.zip...');
const apiSrcZip = new AdmZip();
addSourceFolder(apiSrcZip, API_DIR, '', ['node_modules', 'dist', 'backups', '.turbo', '.cache', 'dev.db']);
const apiSrcPath = path.join(RELEASE_DIR, 'backend-source.zip');
apiSrcZip.writeZip(apiSrcPath);
console.log(` -> Created ${apiSrcPath} (${(fs.statSync(apiSrcPath).size / (1024 * 1024)).toFixed(2)} MB)`);

console.log('\nAll zip files successfully created in deploy-release/ directory:');
fs.readdirSync(RELEASE_DIR).forEach((f) => {
  const s = fs.statSync(path.join(RELEASE_DIR, f));
  console.log(` - ${f} (${(s.size / 1024).toFixed(1)} KB)`);
});
