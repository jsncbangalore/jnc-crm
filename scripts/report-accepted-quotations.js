// Read-only report of stored 'accepted' quotations across all tenants
// Safe, read-only script: NEVER executes updates or writes
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runReport() {
  console.log('================================================================');
  console.log('   READ-ONLY AUDIT REPORT: STORED "accepted" QUOTATIONS');
  console.log('================================================================\n');

  try {
    // 1. Group by status
    const statusSummary = await prisma.quotation.groupBy({
      by: ['status'],
      _count: { id: true },
      _sum: { totalAmount: true },
    });

    console.log('Current Quotation Status Distribution in Database:');
    console.table(
      statusSummary.map((s) => ({
        Status: s.status,
        Count: s._count.id,
        'Total Value (₹)': Number(s._sum.totalAmount || 0).toLocaleString('en-IN'),
      }))
    );

    // 2. Query any quotations with legacy 'accepted' status
    const acceptedQuotes = await prisma.quotation.findMany({
      where: { status: 'accepted' },
      select: {
        id: true,
        quoteNumber: true,
        tenantId: true,
        customerName: true,
        status: true,
        totalAmount: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    console.log(`\nFound ${acceptedQuotes.length} quotation(s) with status "accepted":`);
    if (acceptedQuotes.length > 0) {
      console.table(
        acceptedQuotes.map((q) => ({
          ID: q.id,
          'Quote #': q.quoteNumber,
          Customer: q.customerName || 'N/A',
          Tenant: q.tenantId,
          Total: `₹${Number(q.totalAmount || 0).toLocaleString('en-IN')}`,
          Created: q.createdAt.toISOString().slice(0, 10),
        }))
      );
    } else {
      console.log('✓ None found! All quotations currently in database already use standard statuses.\n');
    }

    // 3. Status History audit for 'accepted'
    const acceptedHistoryCount = await prisma.statusHistory.count({
      where: {
        entityType: 'Quotation',
        OR: [{ toStatus: 'accepted' }, { fromStatus: 'accepted' }],
      },
    });
    console.log(`StatusHistory records referencing 'accepted': ${acceptedHistoryCount}`);

    console.log('\n================================================================');
    console.log('Migration Plan File Available at:');
    console.log('  apps/api/prisma/migrations/20261107140000_canonicalize_quotation_status_approved/migration.sql');
    console.log('NOTE: Per safety rules, do NOT run on live database without authorization.');
    console.log('================================================================\n');
  } catch (err) {
    console.error('Error generating report:', err);
  } finally {
    await prisma.$disconnect();
  }
}

runReport();
