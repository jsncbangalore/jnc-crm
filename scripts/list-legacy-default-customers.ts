/**
 * Dry-run helper to list legacy documents (invoices, orders, quotations)
 * that carry old default customer names (such as "Valued Client") so they can be linked by hand.
 *
 * Usage:
 *   npx ts-node scripts/list-legacy-default-customers.ts
 */

import * as fs from 'fs';
import * as path from 'path';

if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(process.cwd(), 'apps/api/.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        process.env[key] = value;
      }
    }
  }
}

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('========================================================================');
  console.log('  LEGACY DEFAULT CUSTOMER AUDIT REPORT (DRY-RUN)');
  console.log('========================================================================\n');

  // 1. Invoices
  const legacyInvoices = await prisma.invoice.findMany({
    where: {
      OR: [
        { customerName: { contains: 'Valued Client', mode: 'insensitive' } },
        { customerName: '' },
      ],
    },
    select: {
      id: true,
      invoiceNumber: true,
      tenantId: true,
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      invoiceDate: true,
      totalAmount: true,
      balanceDue: true,
      customerId: true,
      companyId: true,
    },
    orderBy: { invoiceDate: 'desc' },
  });

  // 2. Orders
  const legacyOrders = await prisma.order.findMany({
    where: {
      OR: [
        { customerName: { contains: 'Valued Client', mode: 'insensitive' } },
        { customerName: '' },
      ],
    },
    select: {
      id: true,
      orderNumber: true,
      tenantId: true,
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      confirmedAt: true,
      totalAmount: true,
      customerId: true,
    },
    orderBy: { confirmedAt: 'desc' },
  });

  // 3. Quotations
  const legacyQuotations = await prisma.quotation.findMany({
    where: {
      OR: [
        { customerName: { contains: 'Valued Client', mode: 'insensitive' } },
        { customerName: '' },
      ],
    },
    select: {
      id: true,
      quoteNumber: true,
      tenantId: true,
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      createdAt: true,
      totalAmount: true,
      customerId: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`[SUMMARY]`);
  console.log(`- Invoices with default name:   ${legacyInvoices.length}`);
  console.log(`- Orders with default name:     ${legacyOrders.length}`);
  console.log(`- Quotations with default name: ${legacyQuotations.length}`);
  console.log(`- Total affected documents:     ${legacyInvoices.length + legacyOrders.length + legacyQuotations.length}\n`);

  if (legacyInvoices.length > 0) {
    console.log('--- INVOICES TO LINK BY HAND ---');
    legacyInvoices.forEach((inv, i) => {
      console.log(
        `  ${i + 1}. [${inv.invoiceNumber}] Date: ${inv.invoiceDate.toISOString().slice(0, 10)} | Amount: ₹${inv.totalAmount} | Balance: ₹${inv.balanceDue} | Name: "${inv.customerName}" | Phone: ${inv.customerPhone} | ID: ${inv.id}`
      );
    });
    console.log('');
  }

  if (legacyOrders.length > 0) {
    console.log('--- ORDERS TO LINK BY HAND ---');
    legacyOrders.forEach((ord, i) => {
      console.log(
        `  ${i + 1}. [${ord.orderNumber}] Date: ${ord.confirmedAt.toISOString().slice(0, 10)} | Amount: ₹${ord.totalAmount} | Name: "${ord.customerName}" | Phone: ${ord.customerPhone} | ID: ${ord.id}`
      );
    });
    console.log('');
  }

  if (legacyQuotations.length > 0) {
    console.log('--- QUOTATIONS TO LINK BY HAND ---');
    legacyQuotations.forEach((qtn, i) => {
      console.log(
        `  ${i + 1}. [${qtn.quoteNumber}] Date: ${qtn.createdAt.toISOString().slice(0, 10)} | Amount: ₹${qtn.totalAmount} | Name: "${qtn.customerName}" | Phone: ${qtn.customerPhone} | ID: ${qtn.id}`
      );
    });
    console.log('');
  }

  console.log('------------------------------------------------------------------------');
  console.log('  Dry-run complete. No database changes were made.');
  console.log('  Use the Customers page or Link Customer action to associate these to registered companies.');
  console.log('========================================================================\n');
}

main()
  .catch((err) => {
    console.error('Error running audit:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
