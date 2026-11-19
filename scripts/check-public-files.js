#!/usr/bin/env node
/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Public File Hygiene Scanner
 * Scans the web upload folder (apps/web/dist) before uploading to the web host.
 * Fails if any disallowed, temporary, backup, or sensitive files are present.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const WEB_DIST = path.join(ROOT_DIR, 'apps', 'web', 'dist');

const FORBIDDEN_EXTENSIONS = new Set([
  '.zip',
  '.sql',
  '.env',
  '.bak',
  '.backup',
  '.log',
  '.map',
  '.dump',
  '.tar',
  '.gz',
  '.tgz',
  '.7z',
  '.rar',
  '.ts',
  '.tsx',
]);

const FORBIDDEN_FILE_NAMES = new Set([
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'node_modules',
  '.git',
  '.gitignore',
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  'brand.lock.json',
  'super admin.txt',
]);

// Whitelist of expected file extensions in a clean Vite production build
const ALLOWED_BUILD_EXTENSIONS = new Set([
  '.html',
  '.js',
  '.mjs',
  '.css',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  '.json', // only manifest or brand assets if part of web build
  '.txt',  // robots.txt
  '.xml',  // sitemap.xml
  '.webmanifest',
  '',      // .htaccess has no extension
]);

function collectAllFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Check for forbidden directory names
      const dirName = entry.name.toLowerCase();
      if (dirName === 'node_modules' || dirName === '.git' || dirName === 'test-results' || dirName === 'backups') {
        results.push({ path: fullPath, error: `Forbidden directory "${entry.name}" found in web dist.` });
      } else {
        results.push(...collectAllFiles(fullPath));
      }
    } else {
      results.push({ path: fullPath });
    }
  }
  return results;
}

function checkPublicFiles(distDir = WEB_DIST) {
  const violations = [];

  if (!fs.existsSync(distDir)) {
    console.log(`[INFO] Public directory does not exist yet (run npm --workspace=apps/web run build first): ${distDir}`);
    return violations;
  }

  const items = collectAllFiles(distDir);
  for (const item of items) {
    if (item.error) {
      violations.push(item.error);
      continue;
    }

    const filename = path.basename(item.path);
    const lowerName = filename.toLowerCase();
    const ext = path.extname(lowerName);
    const relPath = path.relative(distDir, item.path);

    // 1. Forbidden exact filenames
    if (FORBIDDEN_FILE_NAMES.has(lowerName)) {
      violations.push(`Forbidden file found: ${relPath}`);
      continue;
    }

    // 2. Dotfiles (except allowed .htaccess)
    if (filename.startsWith('.') && filename !== '.htaccess') {
      violations.push(`Sensitive dotfile found: ${relPath}`);
      continue;
    }

    // 3. Forbidden extensions
    if (FORBIDDEN_EXTENSIONS.has(ext)) {
      violations.push(`Disallowed extension "${ext}" in: ${relPath}`);
      continue;
    }

    // 4. Backup or test-result filename patterns
    if (
      lowerName.includes('backup') ||
      lowerName.includes('test-result') ||
      lowerName.includes('.dump') ||
      lowerName.startsWith('evidence-')
    ) {
      violations.push(`Backup or test artifact found in public web dist: ${relPath}`);
      continue;
    }

    // 5. Allowed extension whitelist
    if (!ALLOWED_BUILD_EXTENSIONS.has(ext)) {
      violations.push(`Unrecognized or non-build file extension "${ext}" in: ${relPath}`);
    }
  }

  return violations;
}

function run() {
  console.log('========================================================================');
  console.log('PUBLIC FILE HYGIENE SCANNER');
  console.log('Scanning upload target:', WEB_DIST);
  console.log('========================================================================\n');

  const violations = checkPublicFiles(WEB_DIST);
  if (violations.length > 0) {
    console.error(`[FAIL] Public file hygiene check FAILED with ${violations.length} violation(s):\n`);
    for (const v of violations) {
      console.error(`  - ${v}`);
    }
    console.error('\n[FATAL] apps/web/dist contains forbidden, sensitive, or non-build files!');
    process.exit(1);
  }

  console.log('[PASS] Public file hygiene check passed: Zero forbidden files, zero backups, zero sensitive extensions.');
  process.exit(0);
}

if (require.main === module) {
  run();
}

module.exports = { checkPublicFiles };
