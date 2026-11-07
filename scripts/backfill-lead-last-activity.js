/**
 * Lead lastActivityAt and ownerDisplayName Backfill & Numbering Audit Helper
 * Supports --dry-run (default) and --execute.
 * Run: node --env-file=apps/api/.env scripts/backfill-lead-last-activity.js [--dry-run|--execute]
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const isExecute = process.argv.includes('--execute');
  const isDryRun = !isExecute || process.argv.includes('--dry-run');

  console.log(`\n======================================================`);
  console.log(`Lead Backfill & Numbering Audit Helper [${isDryRun ? 'DRY RUN' : 'EXECUTE'}]`);
  console.log(`======================================================\n`);

  const leads = await prisma.lead.findMany({
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      activities: { select: { id: true, createdAt: true, completedAt: true } },
    },
  });

  console.log(`Found ${leads.length} leads in database.\n`);

  // 1. Audit Lead Numbering Formats
  const numberingStats = {
    documentSeries: 0, // e.g. LD/26-27/0001
    tenantCodeWithPadding: 0, // e.g. ACME-DEV-001-LD-00030
    tenantCodeShort: 0, // e.g. LD-DEV-001 or ACME-LD-001
    other: 0,
    examples: {
      documentSeries: [],
      tenantCodeWithPadding: [],
      tenantCodeShort: [],
      other: [],
    },
  };

  for (const lead of leads) {
    const num = lead.leadNumber || '';
    if (/^[A-Z]+\/\d{2}-\d{2}\/\d+$/i.test(num)) {
      numberingStats.documentSeries++;
      if (numberingStats.examples.documentSeries.length < 3) numberingStats.examples.documentSeries.push(num);
    } else if (/-LD-\d{4,}/i.test(num) || /LD-\d{4,}/i.test(num)) {
      numberingStats.tenantCodeWithPadding++;
      if (numberingStats.examples.tenantCodeWithPadding.length < 3) numberingStats.examples.tenantCodeWithPadding.push(num);
    } else if (/-LD-\d+/i.test(num) || /^LD-[A-Z0-9-]+$/i.test(num)) {
      numberingStats.tenantCodeShort++;
      if (numberingStats.examples.tenantCodeShort.length < 3) numberingStats.examples.tenantCodeShort.push(num);
    } else {
      numberingStats.other++;
      if (numberingStats.examples.other.length < 3) numberingStats.examples.other.push(num);
    }
  }

  console.log('--- LEAD NUMBERING FORMAT AUDIT ---');
  console.log(`1. DocumentSeries (e.g. LD/26-27/0001): ${numberingStats.documentSeries} leads. Samples:`, numberingStats.examples.documentSeries);
  console.log(`2. Padded format (e.g. ACME-DEV-001-LD-00030): ${numberingStats.tenantCodeWithPadding} leads. Samples:`, numberingStats.examples.tenantCodeWithPadding);
  console.log(`3. Short format (e.g. LD-DEV-001): ${numberingStats.tenantCodeShort} leads. Samples:`, numberingStats.examples.tenantCodeShort);
  if (numberingStats.other > 0) {
    console.log(`4. Other formats: ${numberingStats.other} leads. Samples:`, numberingStats.examples.other);
  }
  console.log('-------------------------------------\n');

  // 2. Compute lastActivityAt and ownerDisplayName
  let updateCount = 0;
  const updates = [];

  for (const lead of leads) {
    const timestamps = [];

    // From Lead's own creation and update
    if (lead.createdAt) timestamps.push(new Date(lead.createdAt).getTime());
    if (lead.updatedAt) timestamps.push(new Date(lead.updatedAt).getTime());

    // From LeadActivity
    if (lead.activities && lead.activities.length > 0) {
      for (const act of lead.activities) {
        if (act.completedAt) timestamps.push(new Date(act.completedAt).getTime());
        if (act.createdAt) timestamps.push(new Date(act.createdAt).getTime());
      }
    }

    // From StatusHistory
    const statusHistories = await prisma.statusHistory.findMany({
      where: {
        entityType: 'lead',
        entityId: lead.id,
      },
      select: { changedAt: true },
    });
    for (const sh of statusHistories) {
      if (sh.changedAt) timestamps.push(new Date(sh.changedAt).getTime());
    }

    // From MessageLog
    const messageLogs = await prisma.messageLog.findMany({
      where: {
        relatedEntityType: 'lead',
        relatedEntityId: lead.id,
      },
      select: { sentAt: true },
    });
    for (const ml of messageLogs) {
      if (ml.sentAt) timestamps.push(new Date(ml.sentAt).getTime());
    }

    const maxTs = timestamps.length > 0 ? Math.max(...timestamps) : Date.now();
    const calculatedLastActivityAt = new Date(maxTs);

    const ownerName = lead.assignedTo?.name || (lead.assignedTo?.email ? lead.assignedTo.email.split('@')[0] : 'Unassigned');

    const needsActivityUpdate = !lead.lastActivityAt || Math.abs(new Date(lead.lastActivityAt).getTime() - maxTs) > 1000;
    const needsOwnerUpdate = !lead.ownerDisplayName || lead.ownerDisplayName !== ownerName;

    if (needsActivityUpdate || needsOwnerUpdate) {
      updateCount++;
      updates.push({
        id: lead.id,
        leadNumber: lead.leadNumber,
        customerName: lead.customerName,
        currentLastActivityAt: lead.lastActivityAt,
        newLastActivityAt: calculatedLastActivityAt,
        currentOwner: lead.ownerDisplayName,
        newOwner: ownerName,
      });

      if (!isDryRun) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            lastActivityAt: calculatedLastActivityAt,
            ownerDisplayName: ownerName,
          },
        });
      }
    }
  }

  console.log(`Leads evaluated: ${leads.length}`);
  console.log(`Leads needing update: ${updateCount}`);
  if (updates.length > 0) {
    console.log('\nSample updates (first 5):');
    console.table(updates.slice(0, 5).map(u => ({
      leadNumber: u.leadNumber,
      customer: u.customerName,
      lastActivity: u.newLastActivityAt.toISOString(),
      owner: u.newOwner,
    })));
  }

  if (isDryRun) {
    console.log(`\n[DRY RUN COMPLETE] No records were modified. Pass --execute to write changes.`);
  } else {
    console.log(`\n[EXECUTE COMPLETE] Successfully updated ${updateCount} leads in database.`);
  }
}

main()
  .catch((e) => {
    console.error('Backfill error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
