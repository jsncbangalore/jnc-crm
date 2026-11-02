/**
 * Seed Customer A and Supplier A fixtures into development database
 * Matches exact figures from scripts/test-ledger-suite.ts:
 * Customer A:
 *   FY 25-26: debit 18,359.00, credit 17,179.00, closing 1,180.00 Dr
 *   FY 26-27: opening 1,180.00 Dr, sales 38,651 + 8,225 + 1,13,442, closing 1,61,498.00 Dr
 * Supplier A:
 *   FY 26-27: closing 1,61,498.00 Cr (payable)
 */

import { PrismaClient, Prisma } from '@prisma/client';

const DEV_DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: DEV_DATABASE_URL } } });

async function seedLedgerFixtures() {
  console.log('--- SEEDING LEDGER FIXTURE: Customer A and Supplier A ---');

  const tenant = await prisma.tenant.findFirst({
    where: { code: 'ACME-DEV-001' },
  });
  if (!tenant) throw new Error('Tenant ACME-DEV-001 not found.');
  const tenantId = tenant.id;

  const adminUser = await prisma.user.findFirst({
    where: { tenantId, email: 'tenant-admin@example.com' },
  });
  const userId = adminUser?.id;

  // 1. Create or update Customer A
  console.log('Creating Company: Customer A...');
  const customerA = await prisma.company.upsert({
    where: { id: 'cust-comp-fixture-a' },
    create: {
      id: 'cust-comp-fixture-a',
      tenantId,
      name: 'Customer A',
      gstin: '29ABCDE1234F1Z5',
      address: 'Plot 101, Industrial Area Phase 1',
      city: 'Bengaluru',
      state: 'Karnataka',
      billingEmail: 'billing@customer-a.example',
      isDemo: true,
      source: 'demo',
      createdById: userId,
    },
    update: {
      name: 'Customer A',
      gstin: '29ABCDE1234F1Z5',
      billingEmail: 'billing@customer-a.example',
      isDemo: true,
      source: 'demo',
    },
  });

  await prisma.contact.upsert({
    where: { id: 'contact-cust-fixture-a' },
    create: {
      id: 'contact-cust-fixture-a',
      tenantId,
      companyId: customerA.id,
      name: 'Primary Contact A',
      email: 'billing@customer-a.example',
      phone: '+91-98765-43210',
      isPrimary: true,
      createdById: userId,
    },
    update: {
      phone: '+91-98765-43210',
      email: 'billing@customer-a.example',
    },
  });

  // 2. Clear old fixture ledger entries, invoices, and payments for Customer A
  await prisma.paymentAllocation.deleteMany({
    where: { paymentRecord: { customerId: customerA.id } },
  });
  await prisma.paymentRecord.deleteMany({
    where: { tenantId, customerId: customerA.id },
  });
  await prisma.ledgerEntry.deleteMany({
    where: { tenantId, partyType: 'customer', partyId: customerA.id },
  });
  await prisma.invoice.deleteMany({
    where: { tenantId, companyId: customerA.id },
  });

  // 3. Post Customer A transactions
  // FY 25-26:
  // 3 Nov 2025: sales 16,650.00
  const inv1 = await prisma.invoice.create({
    data: {
      id: 'inv-fixture-001',
      tenantId,
      companyId: customerA.id,
      invoiceNumber: 'INV/25-26/001',
      docType: 'tax_invoice',
      customerName: 'Customer A',
      customerGstin: '29ABCDE1234F1Z5',
      customerPhone: '+91-98765-43210',
      invoiceDate: new Date('2025-11-03T10:00:00Z'),
      dueDate: new Date('2025-12-03T10:00:00Z'),
      subtotal: 14110.17,
      totalAmount: 16650.0,
      balanceDue: 0,
      paymentStatus: 'paid',
      createdById: userId,
    },
  });
  await prisma.ledgerEntry.create({
    data: {
      tenantId,
      partyType: 'customer',
      partyId: customerA.id,
      entryDate: new Date('2025-11-03T10:00:00Z'),
      financialYear: '25-26',
      voucherType: 'sales',
      voucherNo: 'INV/25-26/001',
      particulars: 'Sales Tax Invoice #INV/25-26/001 - Customer A',
      debit: new Prisma.Decimal(16650.0),
      credit: new Prisma.Decimal(0),
      sourceType: 'invoice',
      sourceId: inv1.id,
      createdById: userId,
    },
  });

  // 2 Dec 2025: sales 529.00
  const inv2 = await prisma.invoice.create({
    data: {
      id: 'inv-fixture-002',
      tenantId,
      companyId: customerA.id,
      invoiceNumber: 'INV/25-26/002',
      docType: 'tax_invoice',
      customerName: 'Customer A',
      customerGstin: '29ABCDE1234F1Z5',
      customerPhone: '+91-98765-43210',
      invoiceDate: new Date('2025-12-02T10:00:00Z'),
      dueDate: new Date('2026-01-02T10:00:00Z'),
      subtotal: 448.31,
      totalAmount: 529.0,
      balanceDue: 0,
      paymentStatus: 'paid',
      createdById: userId,
    },
  });
  await prisma.ledgerEntry.create({
    data: {
      tenantId,
      partyType: 'customer',
      partyId: customerA.id,
      entryDate: new Date('2025-12-02T10:00:00Z'),
      financialYear: '25-26',
      voucherType: 'sales',
      voucherNo: 'INV/25-26/002',
      particulars: 'Sales Tax Invoice #INV/25-26/002 - Customer A',
      debit: new Prisma.Decimal(529.0),
      credit: new Prisma.Decimal(0),
      sourceType: 'invoice',
      sourceId: inv2.id,
      createdById: userId,
    },
  });

  // 17 Feb 2026: receipt 17,179.00
  await prisma.ledgerEntry.create({
    data: {
      tenantId,
      partyType: 'customer',
      partyId: customerA.id,
      entryDate: new Date('2026-02-17T10:00:00Z'),
      financialYear: '25-26',
      voucherType: 'receipt',
      voucherNo: 'REC/25-26/001',
      particulars: 'Receipt #REC/25-26/001 [NEFT-001]',
      debit: new Prisma.Decimal(0),
      credit: new Prisma.Decimal(17179.0),
      sourceType: 'payment_record',
      createdById: userId,
    },
  });

  // 18 Mar 2026: sales 1,180.00 (Unpaid)
  const inv3 = await prisma.invoice.create({
    data: {
      id: 'inv-fixture-003',
      tenantId,
      companyId: customerA.id,
      invoiceNumber: 'INV/25-26/003',
      docType: 'tax_invoice',
      customerName: 'Customer A',
      customerGstin: '29ABCDE1234F1Z5',
      customerPhone: '+91-98765-43210',
      invoiceDate: new Date('2026-03-18T10:00:00Z'),
      dueDate: new Date('2026-04-18T10:00:00Z'),
      subtotal: 1000.0,
      totalAmount: 1180.0,
      balanceDue: 1180.0,
      paymentStatus: 'unpaid',
      createdById: userId,
    },
  });
  await prisma.ledgerEntry.create({
    data: {
      tenantId,
      partyType: 'customer',
      partyId: customerA.id,
      entryDate: new Date('2026-03-18T10:00:00Z'),
      financialYear: '25-26',
      voucherType: 'sales',
      voucherNo: 'INV/25-26/003',
      particulars: 'Sales Tax Invoice #INV/25-26/003 - Customer A',
      debit: new Prisma.Decimal(1180.0),
      credit: new Prisma.Decimal(0),
      sourceType: 'invoice',
      sourceId: inv3.id,
      createdById: userId,
    },
  });

  // FY 26-27:
  // 5 Aug 2026: sales 38,651.00
  const inv4 = await prisma.invoice.create({
    data: {
      id: 'inv-fixture-004',
      tenantId,
      companyId: customerA.id,
      invoiceNumber: 'INV/26-27/001',
      docType: 'tax_invoice',
      customerName: 'Customer A',
      customerGstin: '29ABCDE1234F1Z5',
      customerPhone: '+91-98765-43210',
      invoiceDate: new Date('2026-08-05T10:00:00Z'),
      dueDate: new Date('2026-09-05T10:00:00Z'),
      subtotal: 32755.08,
      totalAmount: 38651.0,
      balanceDue: 38651.0,
      paymentStatus: 'unpaid',
      createdById: userId,
    },
  });
  await prisma.ledgerEntry.create({
    data: {
      tenantId,
      partyType: 'customer',
      partyId: customerA.id,
      entryDate: new Date('2026-08-05T10:00:00Z'),
      financialYear: '26-27',
      voucherType: 'sales',
      voucherNo: 'INV/26-27/001',
      particulars: 'Sales Tax Invoice #INV/26-27/001 - Customer A',
      debit: new Prisma.Decimal(38651.0),
      credit: new Prisma.Decimal(0),
      sourceType: 'invoice',
      sourceId: inv4.id,
      createdById: userId,
    },
  });

  // 5 Aug 2026: sales 8,225.00
  const inv5 = await prisma.invoice.create({
    data: {
      id: 'inv-fixture-005',
      tenantId,
      companyId: customerA.id,
      invoiceNumber: 'INV/26-27/002',
      docType: 'tax_invoice',
      customerName: 'Customer A',
      customerGstin: '29ABCDE1234F1Z5',
      customerPhone: '+91-98765-43210',
      invoiceDate: new Date('2026-08-05T10:00:00Z'),
      dueDate: new Date('2026-09-05T10:00:00Z'),
      subtotal: 6970.34,
      totalAmount: 8225.0,
      balanceDue: 8225.0,
      paymentStatus: 'unpaid',
      createdById: userId,
    },
  });
  await prisma.ledgerEntry.create({
    data: {
      tenantId,
      partyType: 'customer',
      partyId: customerA.id,
      entryDate: new Date('2026-08-05T10:00:00Z'),
      financialYear: '26-27',
      voucherType: 'sales',
      voucherNo: 'INV/26-27/002',
      particulars: 'Sales Tax Invoice #INV/26-27/002 - Customer A',
      debit: new Prisma.Decimal(8225.0),
      credit: new Prisma.Decimal(0),
      sourceType: 'invoice',
      sourceId: inv5.id,
      createdById: userId,
    },
  });

  // 24 Aug 2026: sales 1,13,442.00
  const inv6 = await prisma.invoice.create({
    data: {
      id: 'inv-fixture-006',
      tenantId,
      companyId: customerA.id,
      invoiceNumber: 'INV/26-27/003',
      docType: 'tax_invoice',
      customerName: 'Customer A',
      customerGstin: '29ABCDE1234F1Z5',
      customerPhone: '+91-98765-43210',
      invoiceDate: new Date('2026-08-24T10:00:00Z'),
      dueDate: new Date('2026-09-24T10:00:00Z'),
      subtotal: 96137.29,
      totalAmount: 113442.0,
      balanceDue: 113442.0,
      paymentStatus: 'unpaid',
      createdById: userId,
    },
  });
  await prisma.ledgerEntry.create({
    data: {
      tenantId,
      partyType: 'customer',
      partyId: customerA.id,
      entryDate: new Date('2026-08-24T10:00:00Z'),
      financialYear: '26-27',
      voucherType: 'sales',
      voucherNo: 'INV/26-27/003',
      particulars: 'Sales Tax Invoice #INV/26-27/003 - Customer A',
      debit: new Prisma.Decimal(113442.0),
      credit: new Prisma.Decimal(0),
      sourceType: 'invoice',
      sourceId: inv6.id,
      createdById: userId,
    },
  });

  // 4. Create or update Supplier A
  console.log('Creating Supplier: Supplier A...');
  const supplierA = await prisma.supplier.upsert({
    where: { id: 'supp-fixture-a' },
    create: {
      id: 'supp-fixture-a',
      tenantId,
      name: 'Supplier A',
      gstin: '29XYZAB9876C1Z3',
      address: 'Plot 202, Tech Corridor Phase 2',
      city: 'Bengaluru',
      email: 'billing@supplier-a.example',
      phone: '+91-98765-12345',
      leadTimeDays: 30,
      isActive: true,
      isDemo: true,
      source: 'demo',
      createdById: userId,
    },
    update: {
      name: 'Supplier A',
      gstin: '29XYZAB9876C1Z3',
      email: 'billing@supplier-a.example',
      phone: '+91-98765-12345',
      isDemo: true,
      source: 'demo',
    },
  });

  await prisma.ledgerEntry.deleteMany({
    where: { tenantId, partyType: 'supplier', partyId: supplierA.id },
  });
  await prisma.purchaseBill.deleteMany({
    where: { tenantId, supplierId: supplierA.id },
  });

  // FY 25-26 Supplier transactions
  const bill1 = await prisma.purchaseBill.create({
    data: {
      id: 'bill-fixture-001',
      tenantId,
      supplierId: supplierA.id,
      invoiceNumber: 'PB/25-26/001',
      vendorName: 'Supplier A',
      vendorGstin: '29XYZAB9876C1Z3',
      grandTotal: 16650.0,
      subtotal: 14110.17,
      totalTax: 2539.83,
      paymentStatus: 'paid',
      createdById: userId,
    },
  });
  await prisma.ledgerEntry.create({
    data: {
      tenantId,
      partyType: 'supplier',
      partyId: supplierA.id,
      entryDate: new Date('2025-11-03T10:00:00Z'),
      financialYear: '25-26',
      voucherType: 'purchase',
      voucherNo: 'PB/25-26/001',
      particulars: 'Purchase Bill #PB/25-26/001 - Supplier A',
      debit: new Prisma.Decimal(0),
      credit: new Prisma.Decimal(16650.0),
      sourceType: 'purchase_bill',
      sourceId: bill1.id,
      createdById: userId,
    },
  });

  const bill2 = await prisma.purchaseBill.create({
    data: {
      id: 'bill-fixture-002',
      tenantId,
      supplierId: supplierA.id,
      invoiceNumber: 'PB/25-26/002',
      vendorName: 'Supplier A',
      vendorGstin: '29XYZAB9876C1Z3',
      grandTotal: 529.0,
      subtotal: 448.31,
      totalTax: 80.69,
      paymentStatus: 'paid',
      createdById: userId,
    },
  });
  await prisma.ledgerEntry.create({
    data: {
      tenantId,
      partyType: 'supplier',
      partyId: supplierA.id,
      entryDate: new Date('2025-12-02T10:00:00Z'),
      financialYear: '25-26',
      voucherType: 'purchase',
      voucherNo: 'PB/25-26/002',
      particulars: 'Purchase Bill #PB/25-26/002 - Supplier A',
      debit: new Prisma.Decimal(0),
      credit: new Prisma.Decimal(529.0),
      sourceType: 'purchase_bill',
      sourceId: bill2.id,
      createdById: userId,
    },
  });

  // Supplier payment 17,179.00
  await prisma.ledgerEntry.create({
    data: {
      tenantId,
      partyType: 'supplier',
      partyId: supplierA.id,
      entryDate: new Date('2026-02-17T10:00:00Z'),
      financialYear: '25-26',
      voucherType: 'payment',
      voucherNo: 'PAY/25-26/001',
      particulars: 'Payment #PAY/25-26/001 [NEFT-SUPP-001]',
      debit: new Prisma.Decimal(17179.0),
      credit: new Prisma.Decimal(0),
      sourceType: 'payment_record',
      createdById: userId,
    },
  });

  // Supplier bill 1,180.00
  const bill3 = await prisma.purchaseBill.create({
    data: {
      id: 'bill-fixture-003',
      tenantId,
      supplierId: supplierA.id,
      invoiceNumber: 'PB/25-26/003',
      vendorName: 'Supplier A',
      vendorGstin: '29XYZAB9876C1Z3',
      grandTotal: 1180.0,
      subtotal: 1000.0,
      totalTax: 180.0,
      paymentStatus: 'unpaid',
      createdById: userId,
    },
  });
  await prisma.ledgerEntry.create({
    data: {
      tenantId,
      partyType: 'supplier',
      partyId: supplierA.id,
      entryDate: new Date('2026-03-18T10:00:00Z'),
      financialYear: '25-26',
      voucherType: 'purchase',
      voucherNo: 'PB/25-26/003',
      particulars: 'Purchase Bill #PB/25-26/003 - Supplier A',
      debit: new Prisma.Decimal(0),
      credit: new Prisma.Decimal(1180.0),
      sourceType: 'purchase_bill',
      sourceId: bill3.id,
      createdById: userId,
    },
  });

  // FY 26-27 Supplier bills: 38,651 + 8,225 + 1,13,442
  const bill4 = await prisma.purchaseBill.create({
    data: {
      id: 'bill-fixture-004',
      tenantId,
      supplierId: supplierA.id,
      invoiceNumber: 'PB/26-27/001',
      vendorName: 'Supplier A',
      vendorGstin: '29XYZAB9876C1Z3',
      grandTotal: 38651.0,
      subtotal: 32755.08,
      totalTax: 5895.92,
      paymentStatus: 'unpaid',
      createdById: userId,
    },
  });
  await prisma.ledgerEntry.create({
    data: {
      tenantId,
      partyType: 'supplier',
      partyId: supplierA.id,
      entryDate: new Date('2026-08-05T10:00:00Z'),
      financialYear: '26-27',
      voucherType: 'purchase',
      voucherNo: 'PB/26-27/001',
      particulars: 'Purchase Bill #PB/26-27/001 - Supplier A',
      debit: new Prisma.Decimal(0),
      credit: new Prisma.Decimal(38651.0),
      sourceType: 'purchase_bill',
      sourceId: bill4.id,
      createdById: userId,
    },
  });

  const bill5 = await prisma.purchaseBill.create({
    data: {
      id: 'bill-fixture-005',
      tenantId,
      supplierId: supplierA.id,
      invoiceNumber: 'PB/26-27/002',
      vendorName: 'Supplier A',
      vendorGstin: '29XYZAB9876C1Z3',
      grandTotal: 8225.0,
      subtotal: 6970.34,
      totalTax: 1254.66,
      paymentStatus: 'unpaid',
      createdById: userId,
    },
  });
  await prisma.ledgerEntry.create({
    data: {
      tenantId,
      partyType: 'supplier',
      partyId: supplierA.id,
      entryDate: new Date('2026-08-05T10:00:00Z'),
      financialYear: '26-27',
      voucherType: 'purchase',
      voucherNo: 'PB/26-27/002',
      particulars: 'Purchase Bill #PB/26-27/002 - Supplier A',
      debit: new Prisma.Decimal(0),
      credit: new Prisma.Decimal(8225.0),
      sourceType: 'purchase_bill',
      sourceId: bill5.id,
      createdById: userId,
    },
  });

  const bill6 = await prisma.purchaseBill.create({
    data: {
      id: 'bill-fixture-006',
      tenantId,
      supplierId: supplierA.id,
      invoiceNumber: 'PB/26-27/003',
      vendorName: 'Supplier A',
      vendorGstin: '29XYZAB9876C1Z3',
      grandTotal: 113442.0,
      subtotal: 96137.29,
      totalTax: 17304.71,
      paymentStatus: 'unpaid',
      createdById: userId,
    },
  });
  await prisma.ledgerEntry.create({
    data: {
      tenantId,
      partyType: 'supplier',
      partyId: supplierA.id,
      entryDate: new Date('2026-08-24T10:00:00Z'),
      financialYear: '26-27',
      voucherType: 'purchase',
      voucherNo: 'PB/26-27/003',
      particulars: 'Purchase Bill #PB/26-27/003 - Supplier A',
      debit: new Prisma.Decimal(0),
      credit: new Prisma.Decimal(113442.0),
      sourceType: 'purchase_bill',
      sourceId: bill6.id,
      createdById: userId,
    },
  });

  console.log('✓ Customer A and Supplier A fixtures seeded successfully into dev database!');
}

seedLedgerFixtures()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
