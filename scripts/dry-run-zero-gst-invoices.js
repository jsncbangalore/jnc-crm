// Dry-run helper to list existing tax invoices with zero GST and analyze 0007, 0008, 0018
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- Scanning Tax Invoices with Zero GST in jnc_crm_dev ---');
  const invoices = await prisma.invoice.findMany({
    where: {
      docType: { in: ['tax_invoice', 'sez_invoice'] },
    },
    include: {
      lines: true,
    },
    orderBy: { invoiceNumber: 'asc' },
  });

  const zeroGstInvoices = [];

  for (const inv of invoices) {
    const totalGst = Number(inv.cgstAmount || 0) + Number(inv.sgstAmount || 0) + Number(inv.igstAmount || 0);
    const hasZeroRateLines = inv.lines.some((l) => Number(l.taxRate || 0) === 0);
    
    if (totalGst === 0 || hasZeroRateLines) {
      zeroGstInvoices.push({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        docType: inv.docType,
        customerName: inv.customerName,
        totalAmount: inv.totalAmount,
        totalGst,
        lineCount: inv.lines.length,
        lines: inv.lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          taxRate: l.taxRate,
          cgstAmount: l.cgstAmount,
          sgstAmount: l.sgstAmount,
          igstAmount: l.igstAmount,
        })),
        isVoided: inv.isVoided,
      });
    }
  }

  console.log(`Found ${zeroGstInvoices.length} tax invoice(s) with 0 GST or 0% rate lines:`);
  for (const inv of zeroGstInvoices) {
    console.log(`\n• Invoice #${inv.invoiceNumber} (ID: ${inv.id})`);
    console.log(`  Customer: ${inv.customerName}`);
    console.log(`  DocType: ${inv.docType}, Total: ₹${inv.totalAmount}, GST Total: ₹${inv.totalGst}, Voided: ${inv.isVoided}`);
    console.log(`  Lines:`);
    inv.lines.forEach((l, idx) => {
      console.log(`    [${idx + 1}] "${l.description}" - Qty: ${l.quantity}, Rate: ₹${l.unitPrice}, TaxRate: ${l.taxRate}% (CGST: ₹${l.cgstAmount}, SGST: ₹${l.sgstAmount}, IGST: ₹${l.igstAmount})`);
    });
  }

  // Specifically check 0007, 0008, 0018
  console.log('\n--- Specific Analysis: Invoices 0007, 0008, 0018 ---');
  const targetNumbers = ['0007', '0008', '0018'];
  const targets = await prisma.invoice.findMany({
    where: {
      OR: targetNumbers.map((num) => ({
        invoiceNumber: { contains: num },
      })),
    },
    include: { lines: true },
  });

  for (const t of targets) {
    console.log(`\nTarget match: ${t.invoiceNumber}`);
    console.log(`  DocType: ${t.docType}, Created: ${t.createdAt}, Voided: ${t.isVoided}`);
    console.log(`  Subtotal: ₹${t.subtotal}, Tax: ₹${Number(t.cgstAmount || 0) + Number(t.sgstAmount || 0) + Number(t.igstAmount || 0)}, Total: ₹${t.totalAmount}`);
    t.lines.forEach((l, idx) => {
      console.log(`  Line ${idx + 1}: ${l.description} | taxRate: ${l.taxRate}% | total: ₹${l.lineTotal}`);
    });
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
