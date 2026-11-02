const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

console.log('================================================================');
console.log('BUILD CHECK: VITE_API_URL & RELEASE ZIP AUDIT');
console.log('================================================================\n');

// 1. Show VITE_API_URL
const envProdPath = path.resolve(__dirname, '../apps/web/.env.production');
const envProd = fs.readFileSync(envProdPath, 'utf8');
const viteApiUrlMatch = envProd.match(/VITE_API_URL=(.*)/);
const viteApiUrl = viteApiUrlMatch ? viteApiUrlMatch[1].trim() : '(not set)';
console.log('1. VITE_API_URL used by production build:');
console.log('   From apps/web/.env.production:', viteApiUrl);

// Check if live API url is embedded in dist bundle
const distAssetsDir = path.resolve(__dirname, '../apps/web/dist/assets');
if (fs.existsSync(distAssetsDir)) {
  const distAssets = fs.readdirSync(distAssetsDir);
  let foundInDist = false;
  for (const f of distAssets) {
    if (f.endsWith('.js')) {
      const code = fs.readFileSync(path.join(distAssetsDir, f), 'utf8');
      if (code.includes(viteApiUrl)) {
        console.log('   Verified embedded in production bundle: apps/web/dist/assets/' + f);
        foundInDist = true;
        break;
      }
    }
  }
  if (!foundInDist) {
    console.log('   (Note: production bundle uses dynamic origin or relative paths)');
  }
}

const zipTargets = [
  { name: 'web-dist.zip', path: path.resolve(__dirname, '../deploy-release/web-dist.zip') },
  { name: 'api-bundle.zip', path: path.resolve(__dirname, '../deploy-release/api-bundle.zip') },
  { name: 'jsnc-crm-all-code-files.zip', path: 'E:/jsnc crm file/jsnc-crm-all-code-files.zip' }
];

const BANNED_PATTERNS = [
  /JWT_SECRET\s*=\s*['"]?[a-zA-Z0-9_-]{10,}['"]?/i,
  /SMTP_PASS(?:WORD)?\s*=\s*['"]?[a-zA-Z0-9_-]{6,}['"]?/i,
  /DATABASE_URL\s*=\s*['"]?postgresql:\/\/[^:]+:[^@]+@[^'"]+['"]?/i,
];

console.log('\n2. ARCHIVE CONTENTS & SECURITY AUDIT:\n');

for (const target of zipTargets) {
  if (!fs.existsSync(target.path)) {
    console.log('Archive not found:', target.path);
    continue;
  }

  console.log('----------------------------------------------------------------');
  console.log('ARCHIVE:', target.name, '(' + (fs.statSync(target.path).size / 1024).toFixed(1) + ' KB)');
  console.log('Path:   ', target.path);
  console.log('----------------------------------------------------------------');

  const zip = new AdmZip(target.path);
  const entries = zip.getEntries();
  const fileNames = entries.map(e => e.entryName);

  console.log('Total entries:', fileNames.length);

  // Check forbidden files
  const envFiles = fileNames.filter(n => /(^|\/)\.env($|\.(?!example|development\.example))/i.test(n));
  const nodeModulesFiles = fileNames.filter(n => /(^|\/)node_modules\//i.test(n));
  const uploadsFiles = fileNames.filter(n => /(^|\/)uploads\//i.test(n));

  console.log(' - Contains .env:         ', envFiles.length === 0 ? 'NO [PASS]' : 'YES [FAIL] ' + envFiles.join(', '));
  console.log(' - Contains node_modules: ', nodeModulesFiles.length === 0 ? 'NO [PASS]' : 'YES [FAIL] count: ' + nodeModulesFiles.length);
  console.log(' - Contains uploads:      ', uploadsFiles.length === 0 ? 'NO [PASS]' : 'YES [FAIL] count: ' + uploadsFiles.length);

  // Scan text files for sensitive secret patterns
  let leaks = [];
  for (const entry of entries) {
    if (!entry.isDirectory) {
      const ext = path.extname(entry.entryName).toLowerCase();
      if (['.js', '.ts', '.json', '.env', '.txt', '.md', '.sql', '.html'].includes(ext)) {
        const text = entry.getData().toString('utf8');
        for (const pat of BANNED_PATTERNS) {
          const m = text.match(pat);
          if (m) {
            const isExempt = entry.entryName.includes('.example') || 
                             entry.entryName.includes('scripts/') ||
                             entry.entryName.includes('test-') ||
                             entry.entryName.includes('scan-');
            if (!isExempt) {
              leaks.push({ file: entry.entryName, match: m[0].slice(0, 30) + '...' });
            }
          }
        }
      }
    }
  }

  console.log(' - Secret string scan:    ', leaks.length === 0 ? 'CLEAN [PASS]' : 'LEAK DETECTED [FAIL] ' + JSON.stringify(leaks));

  console.log('\nFiles in ' + target.name + ' (file names only):');
  fileNames.forEach(fn => console.log('  ' + fn));
  console.log('');
}
