/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const https = require('https');
const AdmZip = require('adm-zip');

const TOOLS_DIR = path.resolve('tools/postgres-bin');
const ZIP_PATH = path.join(TOOLS_DIR, 'pg-binaries.zip');
const PG_URL = 'https://get.enterprisedb.com/postgresql/postgresql-18.7-1-windows-x64-binaries.zip';

async function main() {
  if (fs.existsSync(path.join(TOOLS_DIR, 'pg_dump.exe'))) {
    console.log('[PG TOOLS] pg_dump.exe already present in', TOOLS_DIR);
    return;
  }

  if (!fs.existsSync(TOOLS_DIR)) {
    fs.mkdirSync(TOOLS_DIR, { recursive: true });
  }

  console.log(`[PG TOOLS] Downloading PostgreSQL 18 binaries archive from EnterpriseDB...`);
  const fileStream = fs.createWriteStream(ZIP_PATH);

  await new Promise((resolve, reject) => {
    https.get(PG_URL, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download: HTTP ${res.statusCode}`));
      }
      let downloaded = 0;
      const total = parseInt(res.headers['content-length'] || '0', 10);
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (total > 0 && downloaded % (20 * 1024 * 1024) < chunk.length) {
          console.log(`   Downloaded ${(downloaded / (1024 * 1024)).toFixed(1)} MB / ${(total / (1024 * 1024)).toFixed(1)} MB...`);
        }
      });
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
    }).on('error', reject);
  });

  console.log('[PG TOOLS] Download complete. Extracting client binaries (pg_dump, pg_restore, psql)...');
  const zip = new AdmZip(ZIP_PATH);
  const zipEntries = zip.getEntries();

  const neededFiles = ['pg_dump.exe', 'pg_restore.exe', 'psql.exe'];
  const neededDlls = ['libpq.dll', 'libssl-3-x64.dll', 'libcrypto-3-x64.dll', 'zlib1.dll', 'libiconv-2.dll', 'libintl-9.dll', 'libwinpthread-1.dll', 'liblz4.dll', 'libzstd.dll'];

  for (const entry of zipEntries) {
    const entryName = path.basename(entry.entryName);
    if (neededFiles.includes(entryName) || neededDlls.includes(entryName)) {
      if (entry.entryName.includes('/bin/')) {
        console.log(`   Extracting ${entryName}...`);
        fs.writeFileSync(path.join(TOOLS_DIR, entryName), entry.getData());
      }
    }
  }

  // Cleanup archive to save space
  try {
    fs.unlinkSync(ZIP_PATH);
  } catch {}

  console.log('[PG TOOLS] Successfully setup PostgreSQL 18 client tools in:', TOOLS_DIR);
}

if (require.main === module) {
  main().catch(err => {
    console.error(`[PG TOOLS ERROR] ${err.message}`);
    process.exit(1);
  });
}

module.exports = { main, TOOLS_DIR };
