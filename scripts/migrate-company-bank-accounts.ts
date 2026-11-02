/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Migration Helper: Moves existing Tenant banking fields into CompanyBankAccount records.
 * Supports:
 *   --dry-run   (Default: reports actions without writing to database)
 *   --confirm   (Executes actual data migration)
 */

import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

// Local encryption helper matching encryption.util.ts
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getKey(): Buffer {
  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey) {
    const fallbackSecret = process.env.JWT_SECRET || 'dev_master_fallback_encryption_secret_key_32bytes!!';
    return crypto.createHash('sha256').update(fallbackSecret).digest();
  }
  try {
    const key = Buffer.from(rawKey, 'base64');
    if (key.length === 32) return key;
  } catch {}
  return crypto.createHash('sha256').update(rawKey).digest();
}

function encryptAtRest(plainText: string | null | undefined): string | null {
  if (!plainText) return null;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

async function main() {
  const args = process.argv.slice(2);
  const isConfirm = args.includes('--confirm');
  const isDryRun = args.includes('--dry-run') || !isConfirm;

  console.log(`[MIGRATE-BANK-ACCOUNTS] Mode: ${isDryRun ? 'DRY-RUN (Safe mode, no changes)' : 'CONFIRM (Executing live writes)'}`);

  const prisma = new PrismaClient();

  try {
    const tenants = await prisma.tenant.findMany({
      where: {
        OR: [
          { bankAccountNumber: { not: null } },
          { bankName: { not: null } },
        ],
      },
      select: {
        id: true,
        name: true,
        code: true,
        bankName: true,
        bankAccountNumber: true,
        bankIfsc: true,
        bankBranch: true,
        bankUpi: true,
      },
    });

    console.log(`[MIGRATE-BANK-ACCOUNTS] Found ${tenants.length} tenants with legacy banking fields.`);

    let plannedCount = 0;
    let skippedCount = 0;

    for (const t of tenants) {
      const existing = await prisma.companyBankAccount.findFirst({
        where: { tenantId: t.id },
      });

      if (existing) {
        console.log(`  - [SKIP] Tenant ${t.name} (${t.code}): Already has ${existing.label || 'bank account'}.`);
        skippedCount++;
        continue;
      }

      const rawAccount = t.bankAccountNumber ? String(t.bankAccountNumber).replace(/\s+/g, '') : '000000000';
      const last4 = rawAccount.length >= 4 ? rawAccount.slice(-4) : rawAccount.padStart(4, '0');
      const bName = t.bankName || 'Primary Business Bank';
      const ifsc = (t.bankIfsc || 'ABCD0001234').toUpperCase();
      const label = `${bName} (••••${last4})`;

      console.log(`  + [PLAN] Tenant ${t.name} (${t.code}): Create CompanyBankAccount "${label}", IFSC=${ifsc}, default=true`);
      plannedCount++;

      if (!isDryRun) {
        const encrypted = encryptAtRest(rawAccount);
        await prisma.companyBankAccount.create({
          data: {
            tenantId: t.id,
            label,
            bankName: bName,
            accountNumber: encrypted || rawAccount,
            accountNumberLast4: last4,
            ifsc,
            branch: t.bankBranch || null,
            upiId: t.bankUpi || null,
            isDefault: true,
            isDocumentDefault: true,
            isActive: true,
          },
        });
        console.log(`    -> [COMMITTED] Successfully created CompanyBankAccount for Tenant ${t.name}`);
      }
    }

    console.log(`[MIGRATE-BANK-ACCOUNTS] Finished. Planned: ${plannedCount}, Skipped: ${skippedCount}.`);
    if (isDryRun && plannedCount > 0) {
      console.log(`[MIGRATE-BANK-ACCOUNTS] Run with --confirm to apply changes.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('[MIGRATE-BANK-ACCOUNTS ERROR]', e);
  process.exit(1);
});
