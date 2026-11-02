import { PrismaClient } from '@prisma/client';

export interface CustomerLinkReport {
  totalScanned: number;
  alreadyLinked: number;
  matchedByGstin: number;
  matchedByName: number;
  unmatched: number;
  totalUpdated: number;
  dryRun: boolean;
}

export async function runCustomerLinkMigration(
  prisma: PrismaClient,
  options: { dryRun?: boolean; tenantId?: string } = {}
): Promise<CustomerLinkReport> {
  const isDryRun = options.dryRun !== false;
  const where: any = {};
  if (options.tenantId) {
    where.tenantId = options.tenantId;
  }

  const allInvoices = await prisma.invoice.findMany({ where });
  const companies = await prisma.company.findMany({
    where: { deletedAt: null },
  });

  // Build company lookup indexes per tenant
  const companyByGstin = new Map<string, string>(); // `${tenantId}:${gstin}` -> companyId
  const companyByName = new Map<string, string>();  // `${tenantId}:${name.toLowerCase()}` -> companyId

  for (const comp of companies) {
    if (comp.gstin && comp.gstin.trim()) {
      const gstinKey = `${comp.tenantId}:${comp.gstin.trim().toUpperCase()}`;
      if (!companyByGstin.has(gstinKey)) {
        companyByGstin.set(gstinKey, comp.id);
      }
    }
    const nameKey = `${comp.tenantId}:${comp.name.trim().toLowerCase()}`;
    if (!companyByName.has(nameKey)) {
      companyByName.set(nameKey, comp.id);
    }
  }

  let matchedByGstin = 0;
  let matchedByName = 0;
  let unmatched = 0;
  let alreadyLinked = 0;

  const updates: Array<{ id: string; companyId: string }> = [];

  for (const inv of allInvoices) {
    if (inv.companyId) {
      alreadyLinked++;
      continue;
    }

    let targetCompanyId: string | undefined;

    // 1. Group / match by customer GSTIN
    if (inv.customerGstin && inv.customerGstin.trim()) {
      const gstinKey = `${inv.tenantId}:${inv.customerGstin.trim().toUpperCase()}`;
      targetCompanyId = companyByGstin.get(gstinKey);
      if (targetCompanyId) {
        matchedByGstin++;
      }
    }

    // 2. Fallback to exact customer name
    if (!targetCompanyId && inv.customerName && inv.customerName.trim()) {
      const nameKey = `${inv.tenantId}:${inv.customerName.trim().toLowerCase()}`;
      targetCompanyId = companyByName.get(nameKey);
      if (targetCompanyId) {
        matchedByName++;
      }
    }

    if (targetCompanyId) {
      updates.push({ id: inv.id, companyId: targetCompanyId });
    } else {
      unmatched++;
    }
  }

  if (!isDryRun && updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) =>
        prisma.invoice.update({
          where: { id: u.id },
          data: { companyId: u.companyId },
        })
      )
    );
  }

  return {
    totalScanned: allInvoices.length,
    alreadyLinked,
    matchedByGstin,
    matchedByName,
    unmatched,
    totalUpdated: isDryRun ? 0 : updates.length,
    dryRun: isDryRun,
  };
}

async function main() {
  const isDryRun = !process.argv.includes('--execute');
  const prisma = new PrismaClient();
  try {
    console.log('====================================================');
    console.log('  SAFE DATA MIGRATION: LINK INVOICES TO CUSTOMERS');
    console.log(`  Mode: ${isDryRun ? 'DRY RUN (no writes)' : 'EXECUTE'}`);
    console.log('====================================================\n');

    const result = await runCustomerLinkMigration(prisma, { dryRun: isDryRun });

    console.log('--- Migration Summary (Counts Only) ---');
    console.log(`Total Invoices Scanned : ${result.totalScanned}`);
    console.log(`Already Linked          : ${result.alreadyLinked}`);
    console.log(`Matched by GSTIN        : ${result.matchedByGstin}`);
    console.log(`Matched by Name         : ${result.matchedByName}`);
    console.log(`Unmatched               : ${result.unmatched}`);
    console.log(`Updated Records         : ${result.totalUpdated}`);
    console.log('\n[COMPLETE] Customer link helper executed safely.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
  });
}
