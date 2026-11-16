#!/usr/bin/env node
/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const path = require('path');
const fs = require('fs');

// Load environment variables strictly from application root or .env.development
const envPath = fs.existsSync(path.resolve(__dirname, '../.env.development'))
  ? path.resolve(__dirname, '../.env.development')
  : fs.existsSync(path.resolve(__dirname, '../apps/api/.env.development'))
    ? path.resolve(__dirname, '../apps/api/.env.development')
    : path.resolve(__dirname, '../apps/api/.env');

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const k = trimmed.substring(0, idx).trim();
      let v = trimmed.substring(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (process.env[k] === undefined) {
        process.env[k] = v;
      }
    }
  });
}

const dbUrl = process.env.DATABASE_URL || '';
let parsedDb;
try {
  parsedDb = new URL(dbUrl);
} catch {
  console.error('[FATAL] DATABASE_URL is missing or invalid.');
  process.exit(1);
}

const dbHost = parsedDb.hostname.toLowerCase();
const dbName = parsedDb.pathname.replace(/^\//, '');
const isLocal = ['localhost', '127.0.0.1', '::1'].includes(dbHost);
const isDevDb = dbName.startsWith('jnc_crm_dev');

if (!isLocal || !isDevDb) {
  console.error(`\n========================================================================`);
  console.error(`[FATAL] dev:demo-reset REFUSED TO RUN.`);
  console.error(`DATABASE_URL host: '${dbHost}', database: '${dbName}'`);
  console.error(`This script only runs against a local development database starting with 'jnc_crm_dev'.`);
  console.error(`========================================================================\n`);
  process.exit(1);
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function reset() {
  console.log('========================================================================');
  console.log('RESETTING DEV DEMO DATA (Local database: jnc_crm_dev)');
  console.log('========================================================================');

  try {
    // 1. Find demo tenant
    const demoTenant = await prisma.tenant.findFirst({
      where: {
        OR: [{ slug: 'demo-company' }, { code: 'DEMO-001' }],
      },
    });

    if (demoTenant) {
      console.log(`[1/3] Deleting demo tenant '${demoTenant.name}' (id=${demoTenant.id})...`);
      // Delete child records that might hang off demo tenant
      await prisma.emailOutbox.deleteMany({ where: { tenantId: demoTenant.id } }).catch(() => {});
      await prisma.invoiceLine.deleteMany({ where: { invoice: { tenantId: demoTenant.id } } }).catch(() => {});
      await prisma.invoice.deleteMany({ where: { tenantId: demoTenant.id } }).catch(() => {});
      await prisma.quotationLine.deleteMany({ where: { quotation: { tenantId: demoTenant.id } } }).catch(() => {});
      await prisma.quotation.deleteMany({ where: { tenantId: demoTenant.id } }).catch(() => {});
      await prisma.lead.deleteMany({ where: { tenantId: demoTenant.id } }).catch(() => {});
      await prisma.sku.deleteMany({ where: { tenantId: demoTenant.id } }).catch(() => {});
      await prisma.companyBankAccount.deleteMany({ where: { tenantId: demoTenant.id } }).catch(() => {});
      await prisma.company.deleteMany({ where: { tenantId: demoTenant.id } }).catch(() => {});
      await prisma.userPageAccess.deleteMany({ where: { tenantId: demoTenant.id } }).catch(() => {});
      await prisma.user.deleteMany({ where: { tenantId: demoTenant.id } }).catch(() => {});
      await prisma.tenant.delete({ where: { id: demoTenant.id } });
      console.log(' -> Demo tenant and associated data deleted.');
    } else {
      console.log('[1/3] No demo tenant found (already clean).');
    }

    // 2. Delete any leftover demo users (e.g. platform owner or users with @demo.test)
    console.log('[2/3] Cleaning up remaining demo users (@demo.test or isDemo: true)...');
    const demoUsers = await prisma.user.findMany({
      where: {
        OR: [
          { email: { endsWith: '@demo.test' } },
          { isDemo: true },
        ],
      },
      select: { id: true, email: true },
    });

    for (const u of demoUsers) {
      await prisma.userPageAccess.deleteMany({ where: { userId: u.id } }).catch(() => {});
      await prisma.refreshSession.deleteMany({ where: { userId: u.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
      console.log(` -> Deleted demo user: ${u.email}`);
    }

    console.log('[3/3] Demo reset complete.');
    console.log('\n========================================================================');
    console.log('[PASS] DEV DEMO DATA SUCCESSFULLY RESET');
    console.log('========================================================================\n');
  } catch (err) {
    console.error('\n[FAIL] Demo reset failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

reset();
