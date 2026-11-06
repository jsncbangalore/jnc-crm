import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

// Load DATABASE_URL safely from apps/api/.env
const envPath = path.join(process.cwd(), 'apps', 'api', '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

const prisma = new PrismaClient();

async function runInvoiceSeriesReconciliation() {
  console.log('===============================================================');
  console.log('        INVOICE NUMBERS & SERIES AUDIT (DRY RUN)              ');
  console.log('===============================================================\n');

  try {
    const tenants = await prisma.tenant.findMany({
      select: { id: true, name: true, invoicePrefix: true },
    });

    for (const tenant of tenants) {
      console.log(`\n--- Tenant: ${tenant.name} (${tenant.id}) ---`);
      const officialPrefix = tenant.invoicePrefix?.trim().toUpperCase() || 'INV';
      console.log(`Configured Official Prefix: "${officialPrefix}"`);

      const invoices = await prisma.invoice.findMany({
        where: { tenantId: tenant.id },
        select: {
          id: true,
          invoiceNumber: true,
          docType: true,
          invoiceDate: true,
          totalAmount: true,
          isVoided: true,
          voidReason: true,
        },
        orderBy: { invoiceDate: 'asc' },
      });

      console.log(`Total Invoices on Record: ${invoices.length}`);
      if (invoices.length === 0) {
        console.log('No invoices found for this tenant.');
        continue;
      }

      const standardSlashRegex = /^([A-Z0-9_\-]+)\/(\d+)\/(\d{2}-\d{2})$/i;
      const hyphenRegex = /^([A-Z0-9_\-]+)-(\d+)$/i;

      const parsedInvoices = invoices.map((inv) => {
        const num = inv.invoiceNumber.trim();
        let prefix = '';
        let sequenceNum: number | null = null;
        let fy = '';
        let isManualFormat = false;

        const slashMatch = num.match(standardSlashRegex);
        if (slashMatch) {
          prefix = slashMatch[1].toUpperCase();
          sequenceNum = parseInt(slashMatch[2], 10);
          fy = slashMatch[3];
          if (prefix !== officialPrefix && prefix !== 'INV' && prefix !== 'SEZ') {
            isManualFormat = true;
          }
        } else {
          const hypMatch = num.match(hyphenRegex);
          if (hypMatch) {
            prefix = hypMatch[1].toUpperCase();
            sequenceNum = parseInt(hypMatch[2], 10);
            isManualFormat = true;
          } else {
            isManualFormat = true;
            prefix = 'MANUAL';
          }
        }

        return {
          ...inv,
          parsedPrefix: prefix,
          sequenceNum,
          fy,
          isManualFormat,
        };
      });

      const groups = new Map<string, typeof parsedInvoices>();
      for (const item of parsedInvoices) {
        const key = item.fy ? `${item.parsedPrefix}/${item.fy}` : item.parsedPrefix;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(item);
      }

      let totalManualCount = 0;
      let totalGapsCount = 0;

      for (const [seriesKey, items] of groups.entries()) {
        const manualItems = items.filter((i) => i.isManualFormat);
        totalManualCount += manualItems.length;

        const seqItems = items.filter((i) => i.sequenceNum !== null);
        let min = 0;
        let max = 0;
        const gaps: Array<{ num: number; reason: string }> = [];

        if (seqItems.length > 0) {
          const seqs = seqItems.map((i) => i.sequenceNum!);
          min = Math.min(...seqs);
          max = Math.max(...seqs);

          const presentMap = new Map<number, typeof items[0]>();
          seqItems.forEach((i) => presentMap.set(i.sequenceNum!, i));

          for (let n = min; n <= max; n++) {
            if (!presentMap.has(n)) {
              gaps.push({ num: n, reason: 'DELETED_OR_MISSING' });
            } else {
              const entry = presentMap.get(n)!;
              if (entry.isVoided) {
                gaps.push({ num: n, reason: `VOIDED (${entry.voidReason || 'No reason specified'})` });
              }
            }
          }
        }
        totalGapsCount += gaps.length;

        console.log(`\n  Series [${seriesKey}]:`);
        console.log(`    Total documents : ${items.length}`);
        console.log(`    Active / Voided : ${items.filter((i) => !i.isVoided).length} / ${items.filter((i) => i.isVoided).length}`);
        console.log(`    Sequence Range  : #${min} -> #${max}`);
        if (manualItems.length > 0) {
          console.log(`    [FLAG] Manual format detected on ${manualItems.length} document(s). Examples: ${manualItems.slice(0, 3).map((m) => m.invoiceNumber).join(', ')}`);
        } else {
          console.log(`    [OK] Standard series format compliant.`);
        }

        if (gaps.length > 0) {
          console.log(`    [GAP] ${gaps.length} sequence gap(s) found:`);
          for (const g of gaps.slice(0, 10)) {
            console.log(`      - #${g.num}: ${g.reason}`);
          }
          if (gaps.length > 10) {
            console.log(`      ... and ${gaps.length - 10} more gaps.`);
          }
        } else {
          console.log(`    [OK] Continuous sequence: No gaps detected.`);
        }
      }

      console.log(`\nTenant Summary:`);
      console.log(`  - Flagged manual documents : ${totalManualCount}`);
      console.log(`  - Sequence gaps detected   : ${totalGapsCount}`);
      console.log(`  - DocumentSeries state     : Safe (No existing invoice numbers altered).`);
    }

    console.log('\n===============================================================');
    console.log('Reconciliation dry run finished cleanly without modifying data.');
    console.log('===============================================================\n');
  } catch (err) {
    console.error('Error executing series reconciliation:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runInvoiceSeriesReconciliation();
