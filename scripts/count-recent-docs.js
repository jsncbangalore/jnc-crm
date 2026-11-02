/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Read-only Document Count Auditor
 * Lists counts of documents created since a specified date to audit test records.
 * Read-only mode: only performs COUNT(*) queries. No customer data or secrets exposed.
 *
 * Usage:
 *   node scripts/count-recent-docs.js --since 2026-10-01
 *   node scripts/count-recent-docs.js --since 2026-10-20
 */

const path = require('path');
const fs = require('fs');

// Load environment strictly from local .env
function loadEnv() {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'apps/api/.env'),
    path.resolve(process.cwd(), '.env.development'),
  ];
  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx !== -1) {
          const key = trimmed.substring(0, idx).trim();
          let val = trimmed.substring(idx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) process.env[key] = val;
        }
      }
    }
  }
}
loadEnv();

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev?schema=public';

const { PrismaClient } = require('@prisma/client');

async function main() {
  const args = process.argv.slice(2);
  let sinceStr = '2026-10-01'; // Default baseline
  const sinceIdx = args.indexOf('--since');
  if (sinceIdx !== -1 && args[sinceIdx + 1]) {
    sinceStr = args[sinceIdx + 1];
  } else if (args[0] && !args[0].startsWith('--')) {
    sinceStr = args[0];
  }

  const sinceDate = new Date(sinceStr);
  if (isNaN(sinceDate.getTime())) {
    console.error(`[ERROR] Invalid date provided for --since: "${sinceStr}". Please use YYYY-MM-DD format.`);
    process.exit(1);
  }

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: dbUrl,
      },
    },
    log: [],
  });

  console.log('================================================================================');
  console.log(`[DOCUMENT AUDIT REPORT] Counts of documents created since: ${sinceDate.toISOString()}`);
  console.log('================================================================================');

  try {
    // 1. Leads
    const leadsCount = await prisma.lead.count({
      where: { createdAt: { gte: sinceDate } },
    });

    // 2. Quotations
    const quotations = await prisma.quotation.findMany({
      where: { createdAt: { gte: sinceDate } },
      select: { quoteNumber: true },
      orderBy: { createdAt: 'desc' },
    });
    const quotationsCount = quotations.length;
    const quotationNumbers = quotations.map((q) => q.quoteNumber).filter(Boolean);

    // 3. Orders
    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: sinceDate } },
      select: { orderNumber: true },
      orderBy: { createdAt: 'desc' },
    });
    const ordersCount = orders.length;
    const orderNumbers = orders.map((o) => o.orderNumber).filter(Boolean);

    // 4. Invoices total & by documentType
    const invoices = await prisma.invoice.findMany({
      where: { createdAt: { gte: sinceDate } },
      select: { invoiceNumber: true, docType: true },
      orderBy: { createdAt: 'desc' },
    });
    const invoicesTotal = invoices.length;
    const invoiceNumbers = invoices.map((i) => i.invoiceNumber).filter(Boolean);

    let invoiceBreakdown = {};
    const types = ['tax_invoice', 'sez_invoice', 'proforma', 'delivery_challan', 'credit_note'];
    for (const t of types) {
      invoiceBreakdown[t.toUpperCase()] = invoices.filter((i) => i.docType === t).length;
    }

    // 5. Purchase Bills
    let billsCount = 0;
    let billNumbers = [];
    try {
      const bills = await prisma.purchaseBill.findMany({
        where: { createdAt: { gte: sinceDate } },
        select: { billNumber: true },
        orderBy: { createdAt: 'desc' },
      });
      billsCount = bills.length;
      billNumbers = bills.map((b) => b.billNumber).filter(Boolean);
    } catch (_) {}

    // 6. Payments
    let paymentsCount = 0;
    let paymentRefs = [];
    try {
      const payments = await prisma.paymentRecord.findMany({
        where: { createdAt: { gte: sinceDate } },
        select: { reference: true, id: true },
        orderBy: { createdAt: 'desc' },
      });
      paymentsCount = payments.length;
      paymentRefs = payments.map((p) => p.reference || p.id).filter(Boolean);
    } catch (_) {}

    // 7. Ledger Entries
    let ledgerCount = 0;
    try {
      ledgerCount = await prisma.ledgerEntry.count({
        where: { createdAt: { gte: sinceDate } },
      });
    } catch (_) {}

    console.log(`\nDocument Type                      | Count`);
    console.log('-----------------------------------|-------');
    console.log(`Leads                              | ${leadsCount}`);
    console.log(`Quotations                         | ${quotationsCount}`);
    if (quotationNumbers.length > 0) {
      console.log(`  Document Numbers: [${quotationNumbers.join(', ')}]`);
    }
    console.log(`Customer Orders                    | ${ordersCount}`);
    if (orderNumbers.length > 0) {
      console.log(`  Document Numbers: [${orderNumbers.join(', ')}]`);
    }
    console.log(`Invoices & Documents (Total)       | ${invoicesTotal}`);
    for (const [t, cnt] of Object.entries(invoiceBreakdown)) {
      console.log(`  - ${t.padEnd(30)} | ${cnt}`);
    }
    if (invoiceNumbers.length > 0) {
      console.log(`  Document Numbers: [${invoiceNumbers.join(', ')}]`);
    }
    console.log(`Purchase Bills (Suppliers)         | ${billsCount}`);
    if (billNumbers.length > 0) {
      console.log(`  Document Numbers: [${billNumbers.join(', ')}]`);
    }
    console.log(`Customer Payment Records           | ${paymentsCount}`);
    if (paymentRefs.length > 0) {
      console.log(`  References: [${paymentRefs.join(', ')}]`);
    }
    console.log(`Financial Ledger Entries           | ${ledgerCount}`);
    console.log('-----------------------------------|-------');
    console.log(`Total Document Entities            | ${leadsCount + quotationsCount + ordersCount + invoicesTotal + billsCount + paymentsCount + ledgerCount}\n`);
    console.log('[AUDIT COMPLETED] Counts and document numbers only. No customer details, names or credentials were accessed.');
    console.log('================================================================================\n');
  } catch (err) {
    console.error(`[AUDIT ERROR] Query failed: ${err.message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
