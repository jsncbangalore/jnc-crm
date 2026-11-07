// Dry-run helper to report existing quotations with zero lines or no creator in jnc_crm_dev
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- Scanning Quotations for Zero Lines or Missing Creator in jnc_crm_dev ---');
  const quotations = await prisma.quotation.findMany({
    include: {
      lines: true,
      createdBy: { select: { id: true, name: true, employeeCode: true } },
    },
    orderBy: { quoteNumber: 'asc' },
  });

  const zeroLinesQuotes = [];
  const noCreatorQuotes = [];

  for (const q of quotations) {
    if (!q.lines || q.lines.length === 0) {
      zeroLinesQuotes.push({
        id: q.id,
        quoteNumber: q.quoteNumber,
        customerName: q.customerName,
        totalAmount: q.totalAmount,
        status: q.status,
        createdById: q.createdById,
        creator: q.createdBy?.name || 'None',
      });
    }

    if (!q.createdById || !q.createdBy) {
      noCreatorQuotes.push({
        id: q.id,
        quoteNumber: q.quoteNumber,
        customerName: q.customerName,
        totalAmount: q.totalAmount,
        status: q.status,
        createdById: q.createdById,
        lineCount: q.lines ? q.lines.length : 0,
      });
    }
  }

  console.log(`\nTotal quotations in database: ${quotations.length}`);
  console.log(`Quotations with 0 item lines: ${zeroLinesQuotes.length}`);
  if (zeroLinesQuotes.length > 0) {
    for (const q of zeroLinesQuotes) {
      console.log(`  • Quote #${q.quoteNumber} (ID: ${q.id})`);
      console.log(`    Customer: ${q.customerName}, Status: ${q.status}, Total: ₹${q.totalAmount}`);
      console.log(`    Creator: ${q.creator} (${q.createdById || 'No createdById'})`);
    }
  } else {
    console.log('  No quotations found with zero item lines.');
  }

  console.log(`\nQuotations with missing creator (createdById is null): ${noCreatorQuotes.length}`);
  if (noCreatorQuotes.length > 0) {
    for (const q of noCreatorQuotes) {
      console.log(`  • Quote #${q.quoteNumber} (ID: ${q.id})`);
      console.log(`    Customer: ${q.customerName}, Status: ${q.status}, Lines: ${q.lineCount}, Total: ₹${q.totalAmount}`);
    }
  } else {
    console.log('  All quotations have a valid creator assigned.');
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
