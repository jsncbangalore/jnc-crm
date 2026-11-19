#!/usr/bin/env node
/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');

/**
 * Read-only audit script to scan filesystem for any legacy un-migrated uploads.
 * Reports counts and file types only. Performs ZERO deletions or writes.
 */
function scanMigratableUploads() {
  const rootDir = path.resolve(__dirname, '../../');
  console.log('[AUDIT] Scanning workspace for legacy un-migrated upload files (read-only)...');

  const targets = [
    { name: 'apps/web/public/uploads', dir: path.join(rootDir, 'apps/web/public/uploads') },
    { name: 'apps/api/apps/web/public/uploads', dir: path.join(rootDir, 'apps/api/apps/web/public/uploads') },
    { name: 'uploads/branding', dir: path.join(rootDir, 'uploads/branding') },
    { name: 'legacy uploads', dir: path.join(rootDir, 'uploads') },
    { name: 'purchase-documents', dir: path.join(rootDir, 'purchase-documents') },
  ];

  let totalFiles = 0;
  let totalBytes = 0;
  const countsByExt = {};
  const findings = [];

  for (const target of targets) {
    if (!fs.existsSync(target.dir)) {
      findings.push({ target: target.name, exists: false, count: 0, bytes: 0 });
      continue;
    }

    let dirCount = 0;
    let dirBytes = 0;

    function walk(currentDir) {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          const stats = fs.statSync(fullPath);
          dirCount++;
          dirBytes += stats.size;
          totalFiles++;
          totalBytes += stats.size;

          const ext = path.extname(entry.name).toLowerCase() || 'no-ext';
          countsByExt[ext] = (countsByExt[ext] || 0) + 1;
        }
      }
    }

    try {
      walk(target.dir);
    } catch (err) {
      console.warn(`[WARN] Could not traverse ${target.dir}: ${err.message}`);
    }

    findings.push({ target: target.name, exists: true, count: dirCount, bytes: dirBytes });
  }

  console.log('\n--- SCAN RESULTS ---');
  for (const f of findings) {
    console.log(`- ${f.target.padEnd(35)}: ${f.exists ? `${f.count} files (${(f.bytes / 1024).toFixed(1)} KB)` : 'DOES NOT EXIST (Clean)'}`);
  }

  console.log('\n--- BREAKDOWN BY EXTENSION ---');
  if (Object.keys(countsByExt).length === 0) {
    console.log('No migratable upload files found.');
  } else {
    for (const [ext, count] of Object.entries(countsByExt)) {
      console.log(`- ${ext.padEnd(10)}: ${count} file(s)`);
    }
  }

  console.log(`\nTOTAL MIGRATABLE FILES: ${totalFiles} (${(totalBytes / 1024).toFixed(1)} KB)`);
  console.log('STATUS: Read-only scan completed. Zero files modified.');

  return {
    totalFiles,
    totalBytes,
    countsByExt,
    findings,
  };
}

if (require.main === module) {
  scanMigratableUploads();
}

module.exports = { scanMigratableUploads };
