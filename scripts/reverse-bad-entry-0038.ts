import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://jnc_app:jnc_app_pass_dev_2026@localhost:5432/jnc_crm_dev' } }
});

async function main() {
  console.log('--- REVERSING BAD ENTRY REC/26-27/0038 ---');

  const origLedger = await prisma.ledgerEntry.findFirst({
    where: { voucherNo: 'REC/26-27/0038' }
  });

  if (!origLedger) {
    console.error('Original LedgerEntry REC/26-27/0038 not found!');
    process.exit(1);
  }

  const origPayment = await prisma.paymentRecord.findUnique({
    where: { id: origLedger.sourceId || '' }
  });

  if (!origPayment) {
    console.error('Original PaymentRecord not found!');
    process.exit(1);
  }

  console.log('Original Ledger:', origLedger.id, origLedger.voucherNo, 'Credit:', origLedger.credit);
  console.log('Original Payment:', origPayment.id, origPayment.transactionRef, 'Amount:', origPayment.amount);

  // Check if reversal already exists
  const existingLedgerRev = await prisma.ledgerEntry.findFirst({
    where: { reversalOfId: origLedger.id }
  });

  if (existingLedgerRev) {
    console.log('Reversal already exists:', existingLedgerRev.id, existingLedgerRev.voucherNo);
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    // 1. Create reversal PaymentRecord
    const revPayment = await tx.paymentRecord.create({
      data: {
        tenantId: origPayment.tenantId,
        customerId: origPayment.customerId,
        amount: -origPayment.amount,
        paymentType: 'reversal',
        paymentMethod: origPayment.paymentMethod,
        transactionRef: `REV-${origPayment.transactionRef || origPayment.id.slice(0, 8)}`,
        paymentDate: new Date(),
        notes: 'Reversal of erroneous entry REC/26-27/0038: invalid gibberish reference [tyhhsdh]',
        recordedById: origPayment.recordedById,
        reversalOfId: origPayment.id,
      }
    });

    // 2. Create reversal LedgerEntry (Voucher REV/26-27/0001)
    const revLedger = await tx.ledgerEntry.create({
      data: {
        tenantId: origLedger.tenantId,
        partyType: origLedger.partyType,
        partyId: origLedger.partyId,
        entryDate: new Date(),
        financialYear: origLedger.financialYear,
        voucherType: 'reversal',
        voucherNo: 'REV/26-27/0001',
        particulars: 'Reversal of REC/26-27/0038: Erroneous test receipt [tyhhsdh]',
        debit: origLedger.credit, // Debit ₹5,00,00,000 to offset original credit
        credit: origLedger.debit, // 0.00
        sourceType: 'payment_reversal',
        sourceId: revPayment.id,
        reversalOfId: origLedger.id,
        createdById: origLedger.createdById,
      }
    });

    return { revPayment, revLedger };
  });

  console.log('Reversal successfully created:');
  console.log('PaymentRecord Reversal ID:', result.revPayment.id, 'Amount:', result.revPayment.amount);
  console.log('LedgerEntry Reversal ID:', result.revLedger.id, 'Voucher:', result.revLedger.voucherNo, 'Debit:', result.revLedger.debit);

  // Check Acme Logistics balance
  const entries = await prisma.ledgerEntry.findMany({
    where: { partyId: origLedger.partyId }
  });
  const totalDebit = entries.reduce((s, e) => s + Number(e.debit), 0);
  const totalCredit = entries.reduce((s, e) => s + Number(e.credit), 0);
  console.log('Acme Logistics new balance:');
  console.log(`Total Debit: ${totalDebit}, Total Credit: ${totalCredit}, Net: ${totalDebit - totalCredit}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
