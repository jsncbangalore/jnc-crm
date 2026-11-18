/**
 * Read-only script to audit invoice numbering consistency, gaps, duplicates, and formats.
 * Reports counts and gap sequences only (no customer names, no personal data).
 * Safe for auditing production or staging databases.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== Invoice Numbering Consistency Audit (Read-Only) ===\n');

  try {
    const tenants = await prisma.tenant.findMany({
      select: { id: true, code: true },
    });

    console.log(`Found ${tenants.length} tenants. Auditing invoice sequences...\n`);

    let totalInvoicesAudited = 0;
    let totalDuplicatesFound = 0;
    let totalGapsFound = 0;
    let companiesWithIssues = 0;

    for (const t of tenants) {
      const invoices = await prisma.invoice.findMany({
        where: { tenantId: t.id },
        select: {
          id: true,
          invoiceNumber: true,
          docType: true,
          paymentStatus: true,
          isVoided: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      if (invoices.length === 0) continue;
      totalInvoicesAudited += invoices.length;

      // Group by docType
      const byType = {};
      for (const inv of invoices) {
        const type = inv.docType || 'tax_invoice';
        if (!byType[type]) byType[type] = [];
        byType[type].push(inv);
      }

      let tenantHasIssues = false;
      const tenantIssues = [];

      for (const [type, list] of Object.entries(byType)) {
        // 1. Check duplicates
        const seen = new Map();
        const duplicates = [];
        for (const item of list) {
          const num = item.invoiceNumber.trim();
          if (seen.has(num)) {
            duplicates.push(num);
          } else {
            seen.set(num, 1);
          }
        }

        if (duplicates.length > 0) {
          tenantHasIssues = true;
          totalDuplicatesFound += duplicates.length;
          tenantIssues.push(`[${type}] ${duplicates.length} duplicate numbers found`);
        }

        // 2. Format classification & gap detection for numeric suffixes
        const sequenceNumbers = [];
        let formatCount = { standard: 0, legacy: 0, other: 0 };

        for (const item of list) {
          const num = item.invoiceNumber.trim();
          // Match standard series: e.g. INV-2627-0001 or INV-0001
          const match = num.match(/(?:INV|PRO|DC|CN|PO)-(?:[0-9]{4}-)?([0-9]+)$/i);
          if (match) {
            const seq = parseInt(match[1], 10);
            if (!isNaN(seq)) sequenceNumbers.push(seq);
            if (num.match(/(?:INV|PRO|DC|CN|PO)-[0-9]{4}-[0-9]{4,}/i)) {
              formatCount.standard++;
            } else {
              formatCount.legacy++;
            }
          } else {
            formatCount.other++;
          }
        }

        // Check sequence gaps if we have numeric sequences
        if (sequenceNumbers.length > 1) {
          sequenceNumbers.sort((a, b) => a - b);
          const gaps = [];
          for (let i = 0; i < sequenceNumbers.length - 1; i++) {
            const current = sequenceNumbers[i];
            const next = sequenceNumbers[i + 1];
            if (next - current > 1) {
              for (let missing = current + 1; missing < next; missing++) {
                gaps.push(missing);
              }
            }
          }

          if (gaps.length > 0) {
            tenantHasIssues = true;
            totalGapsFound += gaps.length;
            tenantIssues.push(
              `[${type}] ${gaps.length} sequence gaps detected (Min: ${sequenceNumbers[0]}, Max: ${sequenceNumbers[sequenceNumbers.length - 1]})`
            );
          }
        }

        // Check mixed formats
        const formatTypesUsed = Object.values(formatCount).filter((c) => c > 0).length;
        if (formatTypesUsed > 1) {
          tenantIssues.push(
            `[${type}] Mixed format series: Standard (${formatCount.standard}), Legacy (${formatCount.legacy}), Other (${formatCount.other})`
          );
        }
      }

      if (tenantHasIssues) {
        companiesWithIssues++;
        console.log(`Company ID [${t.id.slice(0, 8)}...] (${t.code || 'default'}):`);
        for (const iss of tenantIssues) {
          console.log(`  - ${iss}`);
        }
      }
    }

    console.log('\n--- AUDIT SUMMARY ---');
    console.log(`Total invoices audited:        ${totalInvoicesAudited}`);
    console.log(`Total duplicate numbers:       ${totalDuplicatesFound}`);
    console.log(`Total sequence gaps:           ${totalGapsFound}`);
    console.log(`Companies with audit notices:  ${companiesWithIssues}`);
    console.log('=== Audit Complete ===');
  } catch (err) {
    console.error('Audit failed with error:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
