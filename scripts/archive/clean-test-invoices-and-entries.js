const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev' }
  }
});

async function main() {
  console.log('========================================================================');
  console.log('CLEANING TEST INVOICES & ARTIFACTS FROM DEV DATABASE');
  console.log('========================================================================\n');

  // 1. Get BEFORE status via API
  const loginRes = await fetch('http://127.0.0.1:3333/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'SecurePass123!' })
  });
  const { accessToken } = await loginRes.json();

  const kpiBefore = await fetch('http://127.0.0.1:3333/api/v1/dashboard/kpis', {
    headers: { Authorization: `Bearer ${accessToken}` }
  }).then(r => r.json());
  const receivableBefore = kpiBefore.kpis?.invoices?.unpaidAmount;
  console.log(`[BEFORE] Dashboard Total Receivable: ₹${Number(receivableBefore).toLocaleString('en-IN')} (${receivableBefore})`);

  // 2. Delete test ledger entries (particulars matching test strings)
  const testLedgers = await prisma.ledgerEntry.deleteMany({
    where: {
      OR: [
        { particulars: { in: ['nathing', 'uyg', '8uyg'] } },
        { particulars: { contains: 'apple', mode: 'insensitive' } },
        { voucherNo: { in: ['CN/26-27/0003', 'OB/26-27/0001', 'm', 'INV/26-27/0008'] } }
      ]
    }
  });
  console.log(`Deleted ${testLedgers.count} test ledger entries.`);

  // 3. Delete test invoices and related lines / allocations / ledger entries
  const testInvoices = await prisma.invoice.findMany({
    where: {
      OR: [
        { invoiceNumber: 'INV/26-27/0008' },
        { invoiceNumber: 'INV/26-27/0015' },
        { invoiceNumber: { in: ['INV/26-27/0002', 'INV/26-27/0004', 'INV/26-27/0007'] } },
        { invoiceNumber: { in: ['SEZ/INV/26-27/0004', 'SEZ/INV/26-27/0006'] } },
        { invoiceNumber: { in: ['PI/INV/26-27/0001', 'PI/INV/26-27/0002'] } },
        { invoiceNumber: { in: ['DC/INV/26-27/0004', 'DC/INV/26-27/0006'] } },
        { invoiceNumber: { in: ['CN/INV/26-27/0004', 'CN/INV/26-27/0006'] } },
      ]
    },
    select: { id: true, invoiceNumber: true, totalAmount: true }
  });

  console.log(`Found ${testInvoices.length} test invoices to delete:`, testInvoices.map(i => `${i.invoiceNumber} (₹${i.totalAmount})`));

  if (testInvoices.length > 0) {
    const invIds = testInvoices.map(i => i.id);
    await prisma.paymentAllocation.deleteMany({ where: { invoiceId: { in: invIds } } });
    await prisma.invoiceLine.deleteMany({ where: { invoiceId: { in: invIds } } });
    await prisma.ledgerEntry.deleteMany({ where: { sourceType: 'invoice', sourceId: { in: invIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invIds } } });
    console.log(`Successfully deleted ${testInvoices.length} test invoices, lines, and allocations.`);
  }

  // 4. Also clean any test products / skus with "apple"
  const appleProducts = await prisma.product.findMany({
    where: { name: { contains: 'apple', mode: 'insensitive' } },
    select: { id: true, name: true }
  });
  if (appleProducts.length > 0) {
    const prodIds = appleProducts.map(p => p.id);
    await prisma.sku.deleteMany({ where: { productId: { in: prodIds } } });
    await prisma.product.deleteMany({ where: { id: { in: prodIds } } });
    console.log(`Deleted ${appleProducts.length} apple products.`);
  }

  // 5. Get AFTER status via API
  const kpiAfter = await fetch('http://127.0.0.1:3333/api/v1/dashboard/kpis', {
    headers: { Authorization: `Bearer ${accessToken}` }
  }).then(r => r.json());
  const receivableAfter = kpiAfter.kpis?.invoices?.unpaidAmount;
  console.log(`\n[AFTER] Dashboard Total Receivable: ₹${Number(receivableAfter).toLocaleString('en-IN')} (${receivableAfter})`);

  const drop = receivableBefore - receivableAfter;
  console.log(`[DIFFERENCE] Total Receivable Dropped By: ₹${Number(drop).toLocaleString('en-IN')} (${drop})`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
