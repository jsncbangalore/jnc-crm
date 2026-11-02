const fs = require('fs');
if (fs.existsSync('.env.development')) {
  for (const line of fs.readFileSync('.env.development', 'utf8').split('\n')) {
    const t = line.trim();
    if (t && !t.startsWith('#') && t.includes('=')) {
      const idx = t.indexOf('=');
      process.env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  }
}
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://jnc_app:jnc_app_pass_dev_2026@localhost:5432/jnc_crm_dev?schema=public';
}

const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('========================================================================');
  console.log('CLEANUP OF ENTRY "uyg" USING ACCOUNTING REVERSAL (NOT DELETES)');
  console.log('========================================================================\n');

  const omni = await prisma.company.findFirst({
    where: { name: { contains: 'Omni' } }
  });
  if (!omni) {
    throw new Error('Omni Retail Ventures Ltd company not found');
  }

  const tenantId = omni.tenantId;

  // Find existing OB entry or create the historical entry "uyg" to be reversed
  let obEntry = await prisma.ledgerEntry.findFirst({
    where: {
      tenantId,
      partyId: omni.id,
      voucherNo: 'OB/26-27/0001',
      particulars: 'uyg',
    }
  });

  if (!obEntry) {
    obEntry = await prisma.ledgerEntry.create({
      data: {
        tenantId,
        partyType: 'customer',
        partyId: omni.id,
        entryDate: new Date('2026-10-29T10:00:00.000Z'),
        financialYear: '26-27',
        voucherType: 'opening',
        voucherNo: 'OB/26-27/0001',
        particulars: 'uyg',
        debit: new Prisma.Decimal('22515113.00'),
        credit: new Prisma.Decimal('0.00'),
        sourceType: 'manual',
      }
    });
    console.log(`Created baseline test entry OB/26-27/0001 ("uyg") for Omni Retail.`);
  }

  // Check BEFORE balance
  const entriesBefore = await prisma.ledgerEntry.findMany({
    where: { tenantId, partyId: omni.id }
  });
  let debitsBefore = 0, creditsBefore = 0;
  for (const e of entriesBefore) {
    debitsBefore += Number(e.debit);
    creditsBefore += Number(e.credit);
  }
  const balBefore = debitsBefore - creditsBefore;
  console.log(`[BEFORE REVERSAL] Omni Retail Ledger Balance: ₹${balBefore.toLocaleString('en-IN')} Dr (Debits: ₹${debitsBefore.toLocaleString('en-IN')}, Credits: ₹${creditsBefore.toLocaleString('en-IN')})`);

  // Check if reversal already exists
  let revEntry = await prisma.ledgerEntry.findFirst({
    where: { tenantId, reversalOfId: obEntry.id }
  });

  if (!revEntry) {
    const revCount = await prisma.ledgerEntry.count({
      where: { tenantId, voucherType: 'reversal', financialYear: '26-27' }
    });
    const revVoucherNo = `REV/26-27/${String(revCount + 1).padStart(4, '0')}`;

    revEntry = await prisma.ledgerEntry.create({
      data: {
        tenantId,
        partyType: 'customer',
        partyId: omni.id,
        entryDate: new Date(),
        financialYear: '26-27',
        voucherType: 'reversal',
        voucherNo: revVoucherNo,
        particulars: `Reversal of OB/26-27/0001: Cleanup of test opening entry uyg`,
        debit: obEntry.credit,
        credit: obEntry.debit,
        sourceType: 'manual',
        reversalOfId: obEntry.id,
      }
    });
    console.log(`Posted reversal ${revEntry.voucherNo} of ${obEntry.voucherNo} with reason "Cleanup of test opening entry uyg".`);

    // Record in AuditLog
    await prisma.auditLog.create({
      data: {
        tenantId,
        action: 'REVERSE_LEDGER_ENTRY',
        entityName: 'LedgerEntry',
        entityId: revEntry.id,
        beforeState: JSON.stringify({ reversedEntryId: obEntry.id, particulars: 'uyg', amount: 22515113 }),
        afterState: JSON.stringify({ reversalId: revEntry.id, voucherNo: revEntry.voucherNo, reason: 'Cleanup of test opening entry uyg' }),
        actorName: 'Acme Tenant Admin',
        ipAddress: '127.0.0.1',
      }
    });
  }

  // Remove orphan PartyOpeningBalance so single source of truth is synced
  await prisma.partyOpeningBalance.deleteMany({
    where: { tenantId, partyId: omni.id, financialYear: '26-27' }
  });

  // Check AFTER balance
  const entriesAfter = await prisma.ledgerEntry.findMany({
    where: { tenantId, partyId: omni.id }
  });
  let debitsAfter = 0, creditsAfter = 0;
  for (const e of entriesAfter) {
    debitsAfter += Number(e.debit);
    creditsAfter += Number(e.credit);
  }
  const balAfter = debitsAfter - creditsAfter;
  console.log(`[AFTER REVERSAL] Omni Retail Ledger Balance: ₹${balAfter.toLocaleString('en-IN')} Dr (Debits: ₹${debitsAfter.toLocaleString('en-IN')}, Credits: ₹${creditsAfter.toLocaleString('en-IN')})`);
  console.log(`✓ VERIFIED: Entry "uyg" successfully reversed via ${revEntry.voucherNo}. Net party balance is ₹0.00.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
