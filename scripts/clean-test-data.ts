import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning test/fixture records from application database...');

  // 1. Remove QT-E2E-* quotations
  const qts = await prisma.quotation.findMany({
    where: { quoteNumber: { startsWith: 'QT-E2E' } },
    select: { id: true, quoteNumber: true },
  });
  if (qts.length > 0) {
    const qtIds = qts.map((q) => q.id);
    await prisma.quotationLine.deleteMany({ where: { quotationId: { in: qtIds } } });
    const delQts = await prisma.quotation.deleteMany({ where: { id: { in: qtIds } } });
    console.log(`Deleted ${delQts.count} QT-E2E quotations and lines.`);
  }

  // 2. Remove PAY-DEV-* ledger entries and payment records
  const delLedgers = await prisma.ledgerEntry.deleteMany({
    where: {
      OR: [
        { voucherNo: { startsWith: 'PAY-DEV' } },
        { particulars: { contains: 'PAY-DEV' } },
        { particulars: { contains: 'TXN-DEV-BANK' } },
      ],
    },
  });
  console.log(`Deleted ${delLedgers.count} PAY-DEV ledger entries.`);

  // 2b. Remove test runner payments (E2E and DIAG fixtures)
  const delTestPayments = await prisma.paymentRecord.deleteMany({
    where: {
      OR: [
        { transactionRef: { startsWith: 'TEST-CUST' } },
        { transactionRef: { startsWith: 'DIAG-PAY' } },
        { transactionRef: { contains: 'E2E' } },
      ],
    },
  });
  console.log(`Deleted ${delTestPayments.count} test runner payment records.`);

  const delTestPaymentLedgers = await prisma.ledgerEntry.deleteMany({
    where: {
      OR: [
        { particulars: { contains: 'TEST-CUST' } },
        { particulars: { contains: 'DIAG-PAY' } },
        { particulars: { contains: 'E2E' } },
        { voucherNo: { in: ['bba438c4', '6a2d1b07', 'cc266b09', 'REC/26-27/0001', 'REC/26-27/0002', 'REC/26-27/0003', 'REC/26-27/0004', 'REC/26-27/0005', 'REC/26-27/0006', 'REC/26-27/0007'] } },
      ],
    },
  });
  console.log(`Deleted ${delTestPaymentLedgers.count} test runner payment ledger entries.`);

  // 2c. Remove test chain documents (*-8635*, *-1255*, *-4383*)
  const testChainInvs = await prisma.invoice.findMany({
    where: {
      OR: [
        { invoiceNumber: { contains: '8635' } },
        { invoiceNumber: { contains: '1255' } },
        { invoiceNumber: { contains: '4383' } },
      ],
    },
    select: { id: true },
  });
  if (testChainInvs.length > 0) {
    const invIds = testChainInvs.map((i) => i.id);
    await prisma.invoiceLine.deleteMany({ where: { invoiceId: { in: invIds } } });
    await prisma.ledgerEntry.deleteMany({ where: { sourceType: 'invoice', sourceId: { in: invIds } } });
    const del = await prisma.invoice.deleteMany({ where: { id: { in: invIds } } });
    console.log(`Deleted ${del.count} test chain invoices.`);
  }

  // 3. Remove "Dev Anand Test Customer" invoices & dev fixture invoices (*-DEV-*)
  const devInvoices = await prisma.invoice.findMany({
    where: {
      OR: [
        { customerName: { contains: 'Dev Anand' } },
        { invoiceNumber: { contains: '-DEV-' } },
      ],
    },
    select: { id: true, invoiceNumber: true },
  });
  if (devInvoices.length > 0) {
    const invIds = devInvoices.map((i) => i.id);
    await prisma.invoiceLine.deleteMany({ where: { invoiceId: { in: invIds } } });
    await prisma.ledgerEntry.deleteMany({ where: { sourceType: 'invoice', sourceId: { in: invIds } } });
    const delInvs = await prisma.invoice.deleteMany({ where: { id: { in: invIds } } });
    console.log(`Deleted ${delInvs.count} dev fixture & test customer invoices.`);
  }

  // 3b. Normalize partyId in ledgerEntry to canonical company/supplier IDs
  const companies = await prisma.company.findMany({ where: { deletedAt: null } });
  for (const c of companies) {
    if (c.gstin) {
      const updated = await prisma.ledgerEntry.updateMany({
        where: { partyId: c.gstin },
        data: { partyId: c.id },
      });
      if (updated.count > 0) console.log(`Normalized ${updated.count} ledger entries from GSTIN ${c.gstin} to company ${c.id} (${c.name})`);
    }
  }

  const suppliers = await prisma.supplier.findMany({ where: { deletedAt: null } });
  for (const s of suppliers) {
    if (s.gstin) {
      const updated = await prisma.ledgerEntry.updateMany({
        where: { partyId: s.gstin },
        data: { partyId: s.id },
      });
      if (updated.count > 0) console.log(`Normalized ${updated.count} ledger entries from GSTIN ${s.gstin} to supplier ${s.id} (${s.name})`);
    }
  }

  const devCompanies = await prisma.company.findMany({
    where: { name: { contains: 'Dev Anand' } },
    select: { id: true },
  });
  if (devCompanies.length > 0) {
    const compIds = devCompanies.map((c) => c.id);
    const delComps = await prisma.company.deleteMany({ where: { id: { in: compIds } } });
    console.log(`Deleted ${delComps.count} Dev Anand Test Customer companies.`);
  }

  // 4. Remove bill-fixture-*
  const fixtureBills = await prisma.purchaseBill.findMany({
    where: {
      OR: [
        { invoiceNumber: { startsWith: 'bill-fixture' } },
        { vendorName: { contains: 'fixture' } },
      ],
    },
    select: { id: true },
  });
  if (fixtureBills.length > 0) {
    const billIds = fixtureBills.map((b) => b.id);
    await prisma.paymentAllocation.deleteMany({ where: { purchaseBillId: { in: billIds } } });
    const delBills = await prisma.purchaseBill.deleteMany({ where: { id: { in: billIds } } });
    console.log(`Deleted ${delBills.count} fixture purchase bills.`);
  }

  // 5. Clean test logins from audit log of the real tenant
  const delTestAudits = await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorName: { contains: 'e2e' } },
        { actorName: { contains: 'test-runner' } },
        { afterState: { contains: 'e2e-test' } },
      ],
    },
  });
  console.log(`Deleted ${delTestAudits.count} test audit log entries.`);

  console.log('Cleanup completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
