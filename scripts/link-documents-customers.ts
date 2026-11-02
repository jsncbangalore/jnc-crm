/**
 * Data Migration Helper: Link Quotations, Orders, Invoices, and PaymentRecords to Customer (Company)
 *
 * Rules:
 * - Match priority:
 *    1. GSTIN (exact match, uppercase)
 *    2. Phone (exact 10-digit match)
 *    3. Exact Name (case-insensitive trimmed match)
 * - Dry-run by default. Pass --execute to commit updates.
 * - Idempotent: Skips documents already having customerId.
 * - Security/Privacy: Prints counts of linked, ambiguous, and unlinked records only. Never prints customer names, phones, or GSTINs.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TableSummary {
  tableName: string;
  totalScanned: number;
  alreadyLinked: number;
  newlyLinked: number;
  ambiguous: number;
  unlinked: number;
}

export async function linkDocumentsToCustomers(execute: boolean = false) {
  console.log('========================================================================');
  console.log(`CUSTOMER MASTER LINKAGE HELPER [MODE: ${execute ? 'EXECUTE' : 'DRY-RUN'}]`);
  console.log('========================================================================\n');

  try {
    const tenants = await prisma.tenant.findMany({ select: { id: true } });

    for (const tenant of tenants) {
      const tenantId = tenant.id;

      // Pre-fetch all companies and contacts for this tenant
      const companies = await prisma.company.findMany({
        where: { tenantId, deletedAt: null },
        include: {
          contacts: { where: { deletedAt: null } },
        },
      });

      const summaries: TableSummary[] = [];

      // ─── 1. Quotations ───────────────────────────────────────────────────────
      const quotes = await prisma.quotation.findMany({
        where: { tenantId, deletedAt: null },
        include: { lead: true, contact: true },
      });

      const quoteSummary: TableSummary = {
        tableName: 'Quotation',
        totalScanned: quotes.length,
        alreadyLinked: 0,
        newlyLinked: 0,
        ambiguous: 0,
        unlinked: 0,
      };

      for (const q of quotes) {
        if (q.customerId) {
          quoteSummary.alreadyLinked++;
          continue;
        }

        const gstin = q.customerGstin?.trim().toUpperCase();
        const phone = (q.customerPhone || q.lead?.customerPhone || q.contact?.phone || '').replace(/\D/g, '');
        const name = (q.customerName || q.lead?.customerName || q.contact?.name || '').trim().toLowerCase();

        const match = findMatch(companies, gstin, phone, name);
        if (match.status === 'matched' && match.companyId) {
          quoteSummary.newlyLinked++;
          if (execute) {
            await prisma.quotation.update({
              where: { id: q.id },
              data: { customerId: match.companyId },
            });
          }
        } else if (match.status === 'ambiguous') {
          quoteSummary.ambiguous++;
        } else {
          quoteSummary.unlinked++;
        }
      }
      summaries.push(quoteSummary);

      // ─── 2. Orders ───────────────────────────────────────────────────────────
      const orders = await prisma.order.findMany({
        where: { tenantId, deletedAt: null },
        include: { contact: true },
      });

      const orderSummary: TableSummary = {
        tableName: 'Order',
        totalScanned: orders.length,
        alreadyLinked: 0,
        newlyLinked: 0,
        ambiguous: 0,
        unlinked: 0,
      };

      for (const ord of orders) {
        if (ord.customerId) {
          orderSummary.alreadyLinked++;
          continue;
        }

        const gstin = ord.customerGstin?.trim().toUpperCase();
        const phone = (ord.customerPhone || ord.contact?.phone || '').replace(/\D/g, '');
        const name = ord.customerName?.trim().toLowerCase();

        const match = findMatch(companies, gstin, phone, name);
        if (match.status === 'matched' && match.companyId) {
          orderSummary.newlyLinked++;
          if (execute) {
            await prisma.order.update({
              where: { id: ord.id },
              data: { customerId: match.companyId },
            });
          }
        } else if (match.status === 'ambiguous') {
          orderSummary.ambiguous++;
        } else {
          orderSummary.unlinked++;
        }
      }
      summaries.push(orderSummary);

      // ─── 3. Invoices ─────────────────────────────────────────────────────────
      const invoices = await prisma.invoice.findMany({
        where: { tenantId },
      });

      const invoiceSummary: TableSummary = {
        tableName: 'Invoice',
        totalScanned: invoices.length,
        alreadyLinked: 0,
        newlyLinked: 0,
        ambiguous: 0,
        unlinked: 0,
      };

      for (const inv of invoices) {
        if (inv.customerId || inv.companyId) {
          invoiceSummary.alreadyLinked++;
          if (execute && !inv.customerId && inv.companyId) {
            await prisma.invoice.update({
              where: { id: inv.id },
              data: { customerId: inv.companyId },
            });
          }
          continue;
        }

        const gstin = inv.customerGstin?.trim().toUpperCase();
        const phone = (inv.customerPhone || '').replace(/\D/g, '');
        const name = inv.customerName?.trim().toLowerCase();

        const match = findMatch(companies, gstin, phone, name);
        if (match.status === 'matched' && match.companyId) {
          invoiceSummary.newlyLinked++;
          if (execute) {
            await prisma.invoice.update({
              where: { id: inv.id },
              data: { customerId: match.companyId, companyId: match.companyId },
            });
          }
        } else if (match.status === 'ambiguous') {
          invoiceSummary.ambiguous++;
        } else {
          invoiceSummary.unlinked++;
        }
      }
      summaries.push(invoiceSummary);

      // ─── 4. PaymentRecords ───────────────────────────────────────────────────
      const payments = await prisma.paymentRecord.findMany({
        where: { tenantId },
        include: { order: true, invoice: true },
      });

      const paymentSummary: TableSummary = {
        tableName: 'PaymentRecord',
        totalScanned: payments.length,
        alreadyLinked: 0,
        newlyLinked: 0,
        ambiguous: 0,
        unlinked: 0,
      };

      for (const p of payments) {
        if (p.customerId) {
          paymentSummary.alreadyLinked++;
          continue;
        }

        // Direct inheritance from linked invoice or order
        let targetCompanyId = p.invoice?.customerId || p.invoice?.companyId || p.order?.customerId;
        if (targetCompanyId) {
          paymentSummary.newlyLinked++;
          if (execute) {
            await prisma.paymentRecord.update({
              where: { id: p.id },
              data: { customerId: targetCompanyId },
            });
          }
          continue;
        }

        const gstin = p.invoice?.customerGstin?.trim().toUpperCase() || p.order?.customerGstin?.trim().toUpperCase();
        const phone = (p.invoice?.customerPhone || p.order?.customerPhone || '').replace(/\D/g, '');
        const name = (p.invoice?.customerName || p.order?.customerName || '').trim().toLowerCase();

        const match = findMatch(companies, gstin, phone, name);
        if (match.status === 'matched' && match.companyId) {
          paymentSummary.newlyLinked++;
          if (execute) {
            await prisma.paymentRecord.update({
              where: { id: p.id },
              data: { customerId: match.companyId },
            });
          }
        } else if (match.status === 'ambiguous') {
          paymentSummary.ambiguous++;
        } else {
          paymentSummary.unlinked++;
        }
      }
      summaries.push(paymentSummary);

      // Print clean counts table
      console.log(`Tenant Summary [${tenantId}]:`);
      console.table(summaries);
    }

    console.log('\n[DONE] Customer linkage scan completed.');
    if (!execute) {
      console.log('Dry run complete. No database changes were made. Use --execute to persist links.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

function findMatch(
  companies: any[],
  gstin?: string,
  phone?: string,
  name?: string
): { status: 'matched' | 'ambiguous' | 'unlinked'; companyId?: string } {
  // 1. Match by GSTIN
  if (gstin && gstin.length === 15) {
    const matches = companies.filter((c) => c.gstin && c.gstin.trim().toUpperCase() === gstin);
    if (matches.length === 1) return { status: 'matched', companyId: matches[0].id };
    if (matches.length > 1) return { status: 'ambiguous' };
  }

  // 2. Match by 10-digit Phone
  if (phone && phone.length >= 10) {
    const last10 = phone.slice(-10);
    const matches = companies.filter((c) => {
      const cPhone = ((c as any).phone || '').replace(/\D/g, '');
      if (cPhone.slice(-10) === last10) return true;
      return c.contacts?.some((con: any) => (con.phone || '').replace(/\D/g, '').slice(-10) === last10);
    });
    if (matches.length === 1) return { status: 'matched', companyId: matches[0].id };
    if (matches.length > 1) return { status: 'ambiguous' };
  }

  // 3. Match by exact trimmed name (case-insensitive)
  if (name && name.length >= 2) {
    const matches = companies.filter((c) => c.name.trim().toLowerCase() === name);
    if (matches.length === 1) return { status: 'matched', companyId: matches[0].id };
    if (matches.length > 1) return { status: 'ambiguous' };
  }

  return { status: 'unlinked' };
}

const isExecute = process.argv.includes('--execute');
linkDocumentsToCustomers(isExecute).catch((err) => {
  console.error('Error running customer linkage helper:', err);
  process.exit(1);
});
