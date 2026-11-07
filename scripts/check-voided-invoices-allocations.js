const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkVoidedInvoices() {
  console.log('=== READ-ONLY AUDIT: VOIDED INVOICES & ALLOCATIONS ===\n');

  const voidedInvoices = await prisma.invoice.findMany({
    where: { isVoided: true },
    include: {
      allocations: {
        include: {
          paymentRecord: true,
        },
      },
      tenant: { select: { code: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Total voided invoices found: ${voidedInvoices.length}\n`);

  let invalidAllocCount = 0;
  let invalidStatusCount = 0;

  for (const inv of voidedInvoices) {
    const activeAllocations = (inv.allocations || []).filter((a) => {
      const amt = Number(a.amount || 0);
      if (amt <= 0) return false;
      const pr = a.paymentRecord;
      if (!pr) return false;
      if (pr.reversalOfId) return false;
      return true;
    });

    const activeAllocSum = activeAllocations.reduce((sum, a) => sum + Number(a.amount || 0), 0);

    const hasAllocIssue = activeAllocSum > 0;
    const hasStatusIssue = inv.paymentStatus === 'partial' || inv.paymentStatus === 'partly_paid' || inv.paymentStatus === 'paid';

    if (hasAllocIssue) invalidAllocCount++;
    if (hasStatusIssue) invalidStatusCount++;

    console.log(`Invoice: ${inv.invoiceNumber} (${inv.docType})`);
    console.log(`  Tenant: ${inv.tenant?.name || inv.tenantId}`);
    console.log(`  Status: Void (isVoided = true) | paymentStatus: "${inv.paymentStatus}"`);
    console.log(`  Total: ₹${inv.totalAmount} | Active Allocations: ₹${activeAllocSum} (${activeAllocations.length} records)`);
    if (hasAllocIssue) {
      console.log(`  ⚠️ VIOLATION: Voided invoice has ${activeAllocations.length} active allocation(s) totaling ₹${activeAllocSum}!`);
    }
    if (hasStatusIssue) {
      console.log(`  ⚠️ VIOLATION: Voided invoice paymentStatus reads "${inv.paymentStatus}" instead of "void"!`);
    }
    console.log('----------------------------------------------------');
  }

  console.log('\n=== AUDIT SUMMARY ===');
  console.log(`Voided invoices with active allocations: ${invalidAllocCount}`);
  console.log(`Voided invoices with non-void paymentStatus: ${invalidStatusCount}`);

  if (invalidAllocCount === 0 && invalidStatusCount === 0) {
    console.log('✓ All voided invoices conform strictly to the Void Invariant!');
  }

  await prisma.$disconnect();
}

checkVoidedInvoices().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
