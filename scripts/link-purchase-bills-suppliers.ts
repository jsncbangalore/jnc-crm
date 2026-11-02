import { PrismaClient } from '@prisma/client';

export interface SupplierLinkReport {
  totalScanned: number;
  matchedByGstin: number;
  matchedByName: number;
  unmatched: number;
  alreadyLinked: number;
  totalUpdated: number;
  dryRun: boolean;
}

export async function runSupplierLinkMigration(
  prisma: PrismaClient,
  options: { dryRun?: boolean; tenantId?: string } = {}
): Promise<SupplierLinkReport> {
  const isDryRun = options.dryRun !== false; // default true if not specified
  const where: any = { deletedAt: null };
  if (options.tenantId) {
    where.tenantId = options.tenantId;
  }

  const allBills = await prisma.purchaseBill.findMany({ where });
  const suppliers = await prisma.supplier.findMany({
    where: { isActive: true, deletedAt: null },
  });

  // Build supplier lookup indexes per tenant
  const supplierByGstin = new Map<string, string>(); // `${tenantId}:${gstin}` -> supplierId
  const supplierByName = new Map<string, string>();  // `${tenantId}:${name.toLowerCase()}` -> supplierId

  for (const sup of suppliers) {
    if (sup.gstin && sup.gstin.trim()) {
      const gstinKey = `${sup.tenantId}:${sup.gstin.trim().toUpperCase()}`;
      if (!supplierByGstin.has(gstinKey)) {
        supplierByGstin.set(gstinKey, sup.id);
      }
    }
    const nameKey = `${sup.tenantId}:${sup.name.trim().toLowerCase()}`;
    if (!supplierByName.has(nameKey)) {
      supplierByName.set(nameKey, sup.id);
    }
  }

  let matchedByGstin = 0;
  let matchedByName = 0;
  let unmatched = 0;
  let alreadyLinked = 0;
  let totalUpdated = 0;

  const updates: Array<{ id: string; supplierId: string }> = [];

  for (const bill of allBills) {
    if (bill.supplierId) {
      alreadyLinked++;
      continue;
    }

    let targetSupplierId: string | undefined;

    // 1. Try GSTIN match
    if (bill.vendorGstin && bill.vendorGstin.trim()) {
      const gstinKey = `${bill.tenantId}:${bill.vendorGstin.trim().toUpperCase()}`;
      targetSupplierId = supplierByGstin.get(gstinKey);
      if (targetSupplierId) {
        matchedByGstin++;
      }
    }

    // 2. Fallback to exact vendor name match
    if (!targetSupplierId && bill.vendorName && bill.vendorName.trim()) {
      const nameKey = `${bill.tenantId}:${bill.vendorName.trim().toLowerCase()}`;
      targetSupplierId = supplierByName.get(nameKey);
      if (targetSupplierId) {
        matchedByName++;
      }
    }

    if (targetSupplierId) {
      updates.push({ id: bill.id, supplierId: targetSupplierId });
    } else {
      unmatched++;
    }
  }

  if (!isDryRun && updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) =>
        prisma.purchaseBill.update({
          where: { id: u.id },
          data: { supplierId: u.supplierId },
        })
      )
    );
    totalUpdated = updates.length;
  } else {
    totalUpdated = updates.length; // simulated in dry run
  }

  return {
    totalScanned: allBills.length,
    alreadyLinked,
    matchedByGstin,
    matchedByName,
    unmatched,
    totalUpdated: isDryRun ? 0 : totalUpdated,
    dryRun: isDryRun,
  };
}

async function main() {
  const isDryRun = !process.argv.includes('--execute');
  const prisma = new PrismaClient();
  try {
    console.log('====================================================');
    console.log('  SAFE DATA MIGRATION: LINK PURCHASE BILLS TO SUPPLIERS');
    console.log(`  Mode: ${isDryRun ? 'DRY RUN (no writes)' : 'EXECUTE'}`);
    console.log('====================================================\n');

    const result = await runSupplierLinkMigration(prisma, { dryRun: isDryRun });

    console.log('--- Migration Summary (Counts Only) ---');
    console.log(`Total Bills Scanned : ${result.totalScanned}`);
    console.log(`Already Linked       : ${result.alreadyLinked}`);
    console.log(`Matched by GSTIN     : ${result.matchedByGstin}`);
    console.log(`Matched by Name      : ${result.matchedByName}`);
    console.log(`Unmatched            : ${result.unmatched}`);
    console.log(`Updated Records      : ${result.totalUpdated}`);
    console.log('\n[COMPLETE] Migration helper executed safely.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
