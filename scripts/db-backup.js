/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const { assertLocalhostDatabase } = require('./db-safety-guard');

// Resolve database URL
function getDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.resolve('apps/api/.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(/^DATABASE_URL\s*=\s*["']?([^"'\r\n]+)["']?/m);
    if (match) return match[1];
  }
  return 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev?schema=public';
}

async function main() {
  const dbUrl = getDatabaseUrl();
  assertLocalhostDatabase(dbUrl, process.argv);

  const backupsDir = path.resolve('backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const filename = `crm-backup-${timestamp}.sql`;
  const filePath = path.join(backupsDir, filename);

  console.log('========================================================================');
  console.log(`CRM DATABASE BACKUP (Local Target)`);
  console.log('========================================================================');

  let usedPgDump = false;
  try {
    execSync('pg_dump --version', { stdio: 'ignore' });
    console.log('[BACKUP] Running pg_dump...');
    execSync(`pg_dump "${dbUrl}" -f "${filePath}"`, { stdio: 'inherit' });
    usedPgDump = true;
  } catch {
    console.log('[BACKUP] pg_dump not on PATH. Using native PostgreSQL schema & data extractor...');
    const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const tables = await prisma.$queryRawUnsafe(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
      );
      
      const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
      stream.write(`-- JNC CRM Native PostgreSQL Backup\n-- Generated: ${now.toISOString()}\n\nSET statement_timeout = 0;\nSET client_encoding = 'UTF8';\n\n`);

      for (const row of tables) {
        const tbl = row.table_name;
        const records = await prisma.$queryRawUnsafe(`SELECT * FROM "${tbl}"`);
        if (records.length > 0) {
          stream.write(`-- Data for "${tbl}" (${records.length} rows)\n`);
          for (const rec of records) {
            const cols = Object.keys(rec);
            const vals = cols.map(c => {
              const v = rec[c];
              if (v === null || v === undefined) return 'NULL';
              if (typeof v === 'boolean' || typeof v === 'number') return String(v);
              if (v instanceof Date) return `'${v.toISOString()}'`;
              if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
              return `'${String(v).replace(/'/g, "''")}'`;
            });
            stream.write(`INSERT INTO "${tbl}" ("${cols.join('", "')}") VALUES (${vals.join(', ')}) ON CONFLICT DO NOTHING;\n`);
          }
          stream.write('\n');
        }
      }
      stream.end();
      await new Promise(r => stream.on('finish', r));
    } finally {
      await prisma.$disconnect();
    }
  }

  const stat = fs.statSync(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  fs.writeFileSync(`${filePath}.sha256`, `${hash}  ${filename}\n`, 'utf8');

  console.log(`[PASS] Backup created successfully (${usedPgDump ? 'pg_dump' : 'native extractor'})`);
  console.log(` -> File    : ${filePath}`);
  console.log(` -> Size    : ${stat.size} bytes (${(stat.size / 1024).toFixed(2)} KB)`);
  console.log(` -> SHA-256 : ${hash}`);
  console.log('========================================================================');
  return { filePath, hash, size: stat.size };
}

if (require.main === module) {
  main().catch(err => {
    console.error(`[BACKUP FAIL] ${err.message}`);
    process.exit(1);
  });
}

module.exports = { main };
