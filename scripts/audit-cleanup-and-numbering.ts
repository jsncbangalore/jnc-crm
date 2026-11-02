import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: { url: 'postgresql://jnc_app:jnc_app_pass_dev_2026@localhost:5432/jnc_crm_dev' }
  }
});

async function main() {
  console.log('========================================================================');
  console.log('DOCUMENT SERIES TABLE');
  console.log('========================================================================');
  const docSeries = await prisma.documentSeries.findMany({
    select: {
      id: true,
      tenantId: true,
      docType: true,
      financialYear: true,
      prefix: true,
      nextNumber: true
    },
    orderBy: [{ docType: 'asc' }, { financialYear: 'asc' }]
  });
  console.table(docSeries);

  console.log('\n========================================================================');
  console.log('NUMBERING REPORT: GAPS AND DUPLICATES PER SERIES');
  console.log('========================================================================');

  const invoices = await prisma.invoice.findMany({
    select: { id: true, invoiceNumber: true, docType: true, totalAmount: true, balanceDue: true, customerName: true, tenantId: true }
  });

  for (const s of docSeries) {
    const matching = invoices.filter(i => i.tenantId === s.tenantId && i.docType === s.docType && i.invoiceNumber.includes(s.financialYear));
    const invNumbers = matching.map(i => i.invoiceNumber);

    const seqs: number[] = [];
    const seqMap = new Map<number, string[]>();
    for (const no of invNumbers) {
      const match = no.match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        seqs.push(num);
        if (!seqMap.has(num)) seqMap.set(num, []);
        seqMap.get(num)!.push(no);
      }
    }
    seqs.sort((a, b) => a - b);

    const duplicates: string[] = [];
    for (const [num, list] of seqMap.entries()) {
      if (list.length > 1) {
        duplicates.push(`Sequence ${num} [${list.join(', ')}]`);
      }
    }

    // Only look at gaps up to min(nextNumber - 1, 100) to avoid giant dumps if corrupted
    const maxSeq = s.nextNumber - 1;
    const gaps: string[] = [];
    if (maxSeq > 0 && maxSeq < 1000) {
      for (let i = 1; i <= maxSeq; i++) {
        if (!seqMap.has(i)) {
          gaps.push(String(i).padStart(4, '0'));
        }
      }
    } else if (maxSeq >= 1000) {
      gaps.push(`Anomaly: nextNumber=${s.nextNumber} (requires reset/investigation)`);
    }

    console.log(`Series: ${s.docType.padEnd(16)} | FY: ${s.financialYear} | Prefix: ${s.prefix.padEnd(5)} | nextNumber: ${String(s.nextNumber).padEnd(6)} | Tenant: ${s.tenantId}`);
    console.log(`  Existing (${invNumbers.length}): ${invNumbers.join(', ') || 'None'}`);
    console.log(`  Duplicates: ${duplicates.length > 0 ? duplicates.join(', ') : '0 duplicates'}`);
    console.log(`  Gaps: ${gaps.length > 0 ? (gaps.length > 15 ? `${gaps.slice(0, 10).join(', ')} ... [${gaps.length} total gaps]` : gaps.join(', ')) : '0 gaps'}`);
    console.log('');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
