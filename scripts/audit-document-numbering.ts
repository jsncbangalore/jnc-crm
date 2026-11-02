import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev',
    },
  },
});

interface SeriesAudit {
  name: string;
  totalRecords: number;
  distinctNumbers: number;
  duplicates: string[];
  years: Record<string, {
    count: number;
    numbers: string[];
    minSeq?: number;
    maxSeq?: number;
    expectedCount?: number;
    gaps: number[];
  }>;
}

function parseSequence(numStr: string): { prefix: string; fy?: string; seq: number } | null {
  // Typical formats:
  // INV/26-27/0001, REC/26-27/0001, ACME-DEV-001-LD-00001, PB/25-26/001, ORD/25-26/0001
  const parts = numStr.split('/');
  if (parts.length === 3) {
    const seq = parseInt(parts[2], 10);
    return isNaN(seq) ? null : { prefix: parts[0], fy: parts[1], seq };
  }
  const match = numStr.match(/^(.*?)(\d+)$/);
  if (match) {
    return { prefix: match[1], seq: parseInt(match[2], 10) };
  }
  return null;
}

async function auditSeries() {
  console.log('================================================================================');
  console.log('REAL DATABASE DOCUMENT NUMBERING AUDIT — ALL SERIES & YEARS');
  console.log('Database: jnc_crm_dev | Target: PostgreSQL Local Daemon');
  console.log('Timestamp:', new Date().toISOString());
  console.log('================================================================================\n');

  // 1. DocumentSeries Table Configuration
  const configuredSeries = await prisma.documentSeries.findMany({
    include: { tenant: { select: { code: true, name: true } } },
    orderBy: [{ financialYear: 'asc' }, { docType: 'asc' }],
  });
  console.log(`--- 1. DocumentSeries Configured Counters (Total: ${configuredSeries.length}) ---`);
  for (const s of configuredSeries) {
    console.log(
      `Tenant: ${s.tenant?.code || s.tenantId} | DocType: ${s.docType.padEnd(16)} | FY: ${s.financialYear} | Prefix: ${s.prefix.padEnd(5)} | nextNumber: ${s.nextNumber}`
    );
  }

  // 2. Invoices (tax_invoice, sez_invoice, credit_note, delivery_challan, etc.)
  const invoices = await prisma.invoice.findMany({
    select: { id: true, invoiceNumber: true, docType: true, tenantId: true },
    orderBy: { invoiceNumber: 'asc' },
  });

  console.log(`\n--- 2. Invoices Audit (Total: ${invoices.length}) ---`);
  auditCollection('Invoices', invoices.map((i) => i.invoiceNumber));

  // 3. Orders
  const orders = await prisma.order.findMany({
    select: { id: true, orderNumber: true, createdAt: true, tenantId: true },
    orderBy: { orderNumber: 'asc' },
  });
  console.log(`\n--- 3. Orders Audit (Total: ${orders.length}) ---`);
  auditCollection('Orders', orders.map((o) => o.orderNumber));

  // 4. Quotations
  const quotations = await prisma.quotation.findMany({
    select: { id: true, quoteNumber: true, createdAt: true, tenantId: true },
    orderBy: { quoteNumber: 'asc' },
  });
  console.log(`\n--- 4. Quotations Audit (Total: ${quotations.length}) ---`);
  auditCollection('Quotations', quotations.map((q) => q.quoteNumber));

  // 5. Ledger Entries (Vouchers)
  const ledgerEntries = await prisma.ledgerEntry.findMany({
    select: { id: true, voucherNo: true, voucherType: true, tenantId: true },
    orderBy: { voucherNo: 'asc' },
  });
  console.log(`\n--- 5. Ledger Vouchers Audit (Total: ${ledgerEntries.length}) ---`);
  auditCollection('Ledger Entries', ledgerEntries.map((l) => l.voucherNo));

  // 6. Leads Numbering
  const leads = await prisma.lead.findMany({
    select: { id: true, leadNumber: true, createdAt: true, tenantId: true },
    orderBy: { leadNumber: 'asc' },
  });
  console.log(`\n--- 6. Leads Audit (Total: ${leads.length}) ---`);
  auditCollection('Leads', leads.map((l) => l.leadNumber));

  await prisma.$disconnect();
}

function auditCollection(title: string, numbers: string[]) {
  const dupes: string[] = [];
  const seen = new Set<string>();
  for (const n of numbers) {
    if (seen.has(n)) dupes.push(n);
    seen.add(n);
  }

  console.log(`Count: ${numbers.length} | Unique: ${seen.size} | Duplicates: ${dupes.length === 0 ? 'NONE' : dupes.join(', ')}`);

  // Group by prefix/format
  const groups: Record<string, number[]> = {};
  for (const n of numbers) {
    const parts = n.split('/');
    if (parts.length === 3) {
      const groupKey = `${parts[0]}/${parts[1]}`;
      const seq = parseInt(parts[2], 10);
      if (!groups[groupKey]) groups[groupKey] = [];
      if (!isNaN(seq)) groups[groupKey].push(seq);
    } else {
      const match = n.match(/^(.*?)(\d+)$/);
      if (match) {
        const groupKey = match[1];
        const seq = parseInt(match[2], 10);
        if (!groups[groupKey]) groups[groupKey] = [];
        groups[groupKey].push(seq);
      } else {
        if (!groups['OTHER']) groups['OTHER'] = [];
      }
    }
  }

  for (const [grp, seqs] of Object.entries(groups)) {
    seqs.sort((a, b) => a - b);
    const min = seqs[0];
    const max = seqs[seqs.length - 1];
    const gaps: number[] = [];
    for (let i = min; i <= max; i++) {
      if (!seqs.includes(i)) gaps.push(i);
    }
    console.log(
      `  • Series [${grp}]: Count=${seqs.length}, Min=${min}, Max=${max}, Gaps=${gaps.length === 0 ? 'NONE' : gaps.slice(0, 10).join(', ') + (gaps.length > 10 ? `... (+${gaps.length - 10} more)` : '')}`
    );
  }
}

auditSeries().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
