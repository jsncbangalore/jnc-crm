/**
 * E.164 Phone Normalization Migration Helper
 * 
 * Scans phone numbers across Lead, Contact, Supplier, User, and Tenant.
 * Defaults to DRY RUN (counts only).
 * Use --apply to execute the database update.
 * 
 * Strictly targets local jnc_crm_dev database.
 */

const { PrismaClient } = require('@prisma/client');
const path = require('path');

// Normalization function matching shared-validation
function cleanPhone(raw) {
  if (!raw) return '';
  return String(raw).replace(/[\s\-\(\)\.]/g, '').trim();
}

function normalizeToE164(phone, defaultCountry = '+91') {
  if (!phone) return '';
  const cleaned = cleanPhone(phone);
  if (!cleaned) return '';

  if (cleaned.startsWith('+')) {
    const digitsOnly = cleaned.slice(1).replace(/\D/g, '');
    if (cleaned.startsWith('+91')) {
      const national = cleaned.slice(3).replace(/\D/g, '');
      return `+91${national.slice(-10)}`;
    }
    return `+${digitsOnly}`;
  }

  const digits = cleaned.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `${defaultCountry}${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `${defaultCountry}${digits}`;
  }
  if (digits.length > 10 && (defaultCountry === '+91' || defaultCountry === '91')) {
    return `${defaultCountry.startsWith('+') ? defaultCountry : `+${defaultCountry}`}${digits.slice(-10)}`;
  }
  const prefix = defaultCountry.startsWith('+') ? defaultCountry : `+${defaultCountry}`;
  return `${prefix}${digits}`;
}

function isStrictE164(phone) {
  if (!phone) return false;
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

async function run() {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const isDryRun = !isApply || args.includes('--dry-run');

  const databaseUrl = process.env.DATABASE_URL || 'postgresql://jnc_app:jnc_app_pass_dev_2026@localhost:5432/jnc_crm_dev?schema=public';
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } }
  });

  console.log('='.repeat(70));
  console.log(`E.164 PHONE NUMBER MIGRATION HELPER`);
  console.log(`Database : jnc_crm_dev`);
  console.log(`Mode     : ${isDryRun ? 'DRY RUN (Counts only, no writes)' : 'APPLY (Writing changes to database)'}`);
  console.log('='.repeat(70));

  const tables = [
    { name: 'Lead', model: prisma.lead, field: 'customerPhone', idField: 'id', required: true },
    { name: 'Contact', model: prisma.contact, field: 'phone', idField: 'id', required: true },
    { name: 'Supplier', model: prisma.supplier, field: 'phone', idField: 'id', required: false },
    { name: 'User', model: prisma.user, field: 'phone', idField: 'id', required: false },
    { name: 'Tenant', model: prisma.tenant, field: 'phone', idField: 'id', required: false }
  ];

  const results = [];

  for (const table of tables) {
    let records = [];
    try {
      records = await table.model.findMany({
        select: { [table.idField]: true, [table.field]: true }
      });
    } catch (err) {
      console.error(`Error querying ${table.name}:`, err.message);
      continue;
    }

    let total = records.length;
    let nullOrEmpty = 0;
    let alreadyE164 = 0;
    let needingConversion = 0;
    let invalid = 0;
    const toUpdate = [];

    for (const r of records) {
      const val = r[table.field];
      if (!val || String(val).trim() === '') {
        nullOrEmpty++;
        continue;
      }

      if (isStrictE164(val)) {
        alreadyE164++;
      } else {
        const normalized = normalizeToE164(val);
        if (isStrictE164(normalized)) {
          needingConversion++;
          toUpdate.push({ id: r[table.idField], oldPhone: val, newPhone: normalized });
        } else {
          invalid++;
        }
      }
    }

    let appliedCount = 0;
    if (isApply && toUpdate.length > 0) {
      for (const item of toUpdate) {
        await table.model.update({
          where: { [table.idField]: item.id },
          data: { [table.field]: item.newPhone }
        });
        appliedCount++;
      }
    }

    results.push({
      Table: table.name,
      Field: table.field,
      TotalScanned: total,
      NullOrEmpty: nullOrEmpty,
      AlreadyE164: alreadyE164,
      NeedingConversion: needingConversion,
      Invalid: invalid,
      Applied: isApply ? appliedCount : 0
    });
  }

  console.log('\n--- SCAN RESULTS ---');
  console.table(results);

  const totalScanned = results.reduce((acc, r) => acc + r.TotalScanned, 0);
  const totalAlreadyE164 = results.reduce((acc, r) => acc + r.AlreadyE164, 0);
  const totalNeeding = results.reduce((acc, r) => acc + r.NeedingConversion, 0);
  const totalInvalid = results.reduce((acc, r) => acc + r.Invalid, 0);

  console.log(`Summary:`);
  console.log(`  Total Scanned      : ${totalScanned}`);
  console.log(`  Already E.164      : ${totalAlreadyE164}`);
  console.log(`  Needing Conversion : ${totalNeeding}`);
  console.log(`  Invalid/Unmatched  : ${totalInvalid}`);

  if (isDryRun) {
    console.log('\n[DRY RUN COMPLETE] No records were modified.');
    console.log('To apply these conversions, run: node scripts/migrate-phones-to-e164.js --apply');
  } else {
    console.log(`\n[APPLY COMPLETE] Successfully converted ${totalNeeding} records to E.164 format.`);
  }

  await prisma.$disconnect();
}

run().catch((err) => {
  console.error('Fatal error during phone migration:', err);
  process.exit(1);
});
