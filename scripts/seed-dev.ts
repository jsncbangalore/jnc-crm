/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev?schema=public',
    },
  },
});

export async function seedDevData() {
  console.log('[SEED-DEV] Starting development database seeding with fake test entities...');

  const passHash = await bcrypt.hash('DevPassword@123', 10);

  // 1. Create 3 Companies / Tenants
  const tenantConfigs = [
    { code: 'DEMO-DEV-001', name: 'Demo Company', slug: 'demo-company' },
    { code: 'BETA-DEV-002', name: 'Beta Logistics Systems', slug: 'beta-logistics' },
    { code: 'GAMMA-DEV-003', name: 'Gamma Tech Industries', slug: 'gamma-tech' },
  ];

  const tenants: any[] = [];
  for (const tc of tenantConfigs) {
    const t = await prisma.tenant.upsert({
      where: { code: tc.code },
      update: {
        name: tc.name,
        isDemo: true,
        bankName: 'HDFC Bank Ltd',
        bankAccountNumber: '50200012345678',
        bankIfsc: 'HDFC0001234',
        lutBondNo: 'AD290324001234F',
        lutValidity: '2027-03-31',
      },
      create: {
        code: tc.code,
        name: tc.name,
        slug: tc.slug,
        isDemo: true,
        status: 'active',
        planTier: 'enterprise',
        maxUsers: 50,
        currency: 'INR',
        phone: '+1-555-0100',
        email: `info@${tc.slug}.example.com`,
        website: `https://${tc.slug}.example.com`,
        address: '100 Innovation Park, Tech Zone',
        city: 'Metropolis',
        state: 'Karnataka',
        gstin: '29AABCU9603R1Z2',
        bankName: 'HDFC Bank Ltd',
        bankAccountNumber: '50200012345678',
        bankIfsc: 'HDFC0001234',
        lutBondNo: 'AD290324001234F',
        lutValidity: '2027-03-31',
      },
    });
    tenants.push(t);
  }

  const primaryTenant = tenants[0];

  // 2. Users for each role
  const roleUsers = [
    { role: 'platform_admin', email: 'platform-admin@example.com', name: 'Platform Super Admin', code: 'EMP-PLT-01' },
    { role: 'tenant_admin', email: 'tenant-admin@example.com', name: 'Demo Tenant Admin', code: 'EMP-ADM-01' },
    { role: 'tenant_admin', email: 'admin@example.com', name: 'Demo Administrator', code: 'EMP-ADM-00' },
    { role: 'sales', email: 'sales-agent@example.com', name: 'Alex Salesperson', code: 'EMP-SLS-01' },
    { role: 'finance', email: 'finance-lead@example.com', name: 'Fiona Finance Officer', code: 'EMP-FIN-01' },
    { role: 'employee', email: 'regular-employee@example.com', name: 'Eddie Employee', code: 'EMP-EMP-01' },
    { role: 'store_manager', email: 'store-manager@example.com', name: 'Sam Store Manager', code: 'EMP-STR-01' },
    // Dev box accounts
    { role: 'platform_admin', email: 'platform-admin@seed.dev', name: 'Platform Super Admin', code: 'EMP-PLT-SD' },
    { role: 'tenant_admin', email: 'tenant-admin@seed.dev', name: 'Demo Tenant Admin', code: 'EMP-ADM-SD' },
    { role: 'tenant_admin', email: 'admin@seed.dev', name: 'Demo Administrator', code: 'EMP-ADM-S0' },
    { role: 'sales', email: 'sales-agent@seed.dev', name: 'Alex Salesperson', code: 'EMP-SLS-SD' },
  ];

  const users: Record<string, any> = {};
  for (const ru of roleUsers) {
    const u = await prisma.user.upsert({
      where: {
        tenantId_email: {
          tenantId: primaryTenant.id,
          email: ru.email,
        },
      },
      update: { role: ru.role, name: ru.name },
      create: {
        tenantId: primaryTenant.id,
        employeeCode: ru.code,
        name: ru.name,
        email: ru.email,
        role: ru.role,
        phone: '+1-555-0123',
        isActive: true,
        mustResetPassword: false,
        passwordHash: passHash,
      },
    });
    users[ru.role] = u;
  }

  // Grant sales agent permissions to leads, quotations, and orders
  await prisma.userPageAccess.upsert({
    where: { userId: users['sales'].id },
    update: { pages: JSON.stringify(['leads', 'quotations', 'orders']) },
    create: {
      userId: users['sales'].id,
      tenantId: primaryTenant.id,
      pages: JSON.stringify(['leads', 'quotations', 'orders']),
    },
  });

  // 2b. Tenant Admin for Company B (Beta Logistics Systems)
  const betaTenant = tenants[1];
  await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: betaTenant.id,
        email: 'beta-admin@example.com',
      },
    },
    update: { role: 'tenant_admin', name: 'Beta Tenant Admin' },
    create: {
      tenantId: betaTenant.id,
      employeeCode: 'BETA-ADM-01',
      name: 'Beta Tenant Admin',
      email: 'beta-admin@example.com',
      role: 'tenant_admin',
      phone: '+1-555-0124',
      isActive: true,
      mustResetPassword: false,
      passwordHash: passHash,
    },
  });

  await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: betaTenant.id,
        email: 'beta-admin@seed.dev',
      },
    },
    update: { role: 'tenant_admin', name: 'Beta Tenant Admin' },
    create: {
      tenantId: betaTenant.id,
      employeeCode: 'BETA-ADM-SD',
      name: 'Beta Tenant Admin',
      email: 'beta-admin@seed.dev',
      role: 'tenant_admin',
      phone: '+1-555-0124',
      isActive: true,
      mustResetPassword: false,
      passwordHash: passHash,
    },
  });

  // 3. Customers (Company model & Contact model)
  const customerA = await prisma.company.upsert({
    where: { id: 'cust-comp-001' },
    update: { isDemo: true, source: 'demo' },
    create: {
      id: 'cust-comp-001',
      tenantId: primaryTenant.id,
      name: 'Omni Retail Ventures Ltd',
      industry: 'Retail Solutions',
      gstin: '29AABCO0001R1Z1',
      address: '42 Commercial Boulevard, Block 4',
      city: 'Bengaluru',
      state: 'Karnataka',
      billingEmail: 'billing@omni-retail.example.com',
      isDemo: true,
      source: 'demo',
      createdById: users['sales'].id,
    },
  });

  const customerB = await prisma.company.upsert({
    where: { id: 'cust-comp-002' },
    update: { isDemo: true, source: 'demo' },
    create: {
      id: 'cust-comp-002',
      tenantId: primaryTenant.id,
      name: 'Global SEZ Exporters Inc',
      industry: 'Export Manufacturing',
      gstin: '29AABCG0002R1Z2',
      address: 'Zone 5, SEZ Export Corridor',
      city: 'Bengaluru',
      state: 'Karnataka',
      billingEmail: 'accounts@global-sez.example.com',
      isDemo: true,
      source: 'demo',
      createdById: users['sales'].id,
    },
  });

  const contactA = await prisma.contact.upsert({
    where: { id: 'cust-contact-001' },
    update: {},
    create: {
      id: 'cust-contact-001',
      tenantId: primaryTenant.id,
      companyId: customerA.id,
      name: 'Charles Customer',
      email: 'charles@omni-retail.example.com',
      phone: '+1-555-0155',
      designation: 'Procurement Director',
    },
  });

  // 4. Suppliers
  const supplierA = await prisma.supplier.upsert({
    where: { id: 'supp-001' },
    update: { isDemo: true, source: 'demo' },
    create: {
      id: 'supp-001',
      tenantId: primaryTenant.id,
      name: 'Apex Raw Metals & Cables',
      contactPerson: 'Sarah Supplier',
      email: 'contact@apex-metals.example.com',
      phone: '+1-555-0188',
      gstin: '29AABCA9999R1Z8',
      address: '77 Foundry Street',
      city: 'Hubballi',
      isActive: true,
      isDemo: true,
      source: 'demo',
    },
  });

  // 5. Warehouse & Products / SKUs
  const warehouse = await prisma.warehouse.upsert({
    where: {
      tenantId_code: {
        tenantId: primaryTenant.id,
        code: 'DEV-WH-01',
      },
    },
    update: {},
    create: {
      tenantId: primaryTenant.id,
      code: 'DEV-WH-01',
      name: 'Central Distribution Hub',
      city: 'Bengaluru',
      address: '10 Industrial Area, Peenya',
      isActive: true,
    },
  });

  const productA = await prisma.product.upsert({
    where: { id: 'prod-dev-001' },
    update: {},
    create: {
      id: 'prod-dev-001',
      tenantId: primaryTenant.id,
      name: 'Heavy Duty Power Inverter 5kVA',
      category: 'Power Systems',
      description: 'Industrial grade sine wave power inverter unit',
    },
  });

  const skuA = await prisma.sku.upsert({
    where: {
      tenantId_skuCode: {
        tenantId: primaryTenant.id,
        skuCode: 'SKU-INV-5K',
      },
    },
    update: {},
    create: {
      tenantId: primaryTenant.id,
      productId: productA.id,
      skuCode: 'SKU-INV-5K',
      name: 'Power Inverter 5kVA - Standard',
      category: 'Electronics',
      packageType: 'Box',
      hsnCode: '85044090',
      taxRate: 18,
      unitPrice: 50000,
      costPrice: 28000,
      reorderPoint: 5,
      reorderQty: 20,
    },
  });

  // 6. Lead
  const leadA = await prisma.lead.upsert({
    where: { id: 'lead-dev-001' },
    update: {},
    create: {
      id: 'lead-dev-001',
      tenantId: primaryTenant.id,
      leadNumber: 'LD-DEV-001',
      companyId: customerA.id,
      contactId: contactA.id,
      customerName: 'Omni Retail Ventures Ltd',
      customerPhone: '+1-555-0155',
      customerEmail: 'charles@omni-retail.example.com',
      productName: 'Heavy Duty Power Inverter 5kVA',
      status: 'qualified',
      source: 'manual',
      estimatedValue: 250000,
      assignedToId: users['sales'].id,
      createdById: users['sales'].id,
    },
  });

  // Clean prior transactional records for primaryTenant to guarantee clean idempotent state
  await prisma.paymentAllocation.deleteMany({ where: { tenantId: primaryTenant.id } });
  await prisma.paymentRecord.deleteMany({ where: { tenantId: primaryTenant.id } });
  await prisma.supplierPayment.deleteMany({ where: { tenantId: primaryTenant.id } });
  await prisma.ledgerEntry.deleteMany({ where: { tenantId: primaryTenant.id } });
  await prisma.partyOpeningBalance.deleteMany({ where: { tenantId: primaryTenant.id } });
  await prisma.invoiceLine.deleteMany({ where: { invoice: { tenantId: primaryTenant.id } } });
  await prisma.invoice.deleteMany({ where: { tenantId: primaryTenant.id } });
  await prisma.purchaseBill.deleteMany({ where: { tenantId: primaryTenant.id } });
  await prisma.orderLine.deleteMany({ where: { order: { tenantId: primaryTenant.id } } });
  await prisma.order.deleteMany({ where: { tenantId: primaryTenant.id } });
  await prisma.quotationLine.deleteMany({ where: { quotation: { tenantId: primaryTenant.id } } });
  await prisma.quotation.deleteMany({ where: { tenantId: primaryTenant.id } });

  // 7. Quotation
  const quotationA = await prisma.quotation.upsert({
    where: {
      tenantId_quoteNumber: {
        tenantId: primaryTenant.id,
        quoteNumber: 'QT/26-27/0001',
      },
    },
    update: {},
    create: {
      tenantId: primaryTenant.id,
      quoteNumber: 'QT/26-27/0001',
      customerId: customerA.id,
      customerName: customerA.name,
      customerPhone: '+1-555-0155',
      customerEmail: 'charles@omni-retail.example.com',
      customerGstin: customerA.gstin,
      customerAddress: customerA.address,
      customerState: customerA.state,
      leadId: leadA.id,
      contactId: contactA.id,
      createdById: users['sales'].id,
      status: 'sent',
      subtotal: 100000,
      taxRate: 18,
      taxAmount: 18000,
      totalAmount: 118000,
      validUntil: new Date('2026-11-15'),
      notes: 'Standard 1-year warranty included.',
      terms: 'Payment 50% advance, balance on dispatch.',
      lines: {
        create: [
          {
            skuId: skuA.id,
            quantity: 2,
            unitPrice: 50000,
            discount: 0,
            totalPrice: 100000,
            hsnCode: '85044090',
            description: 'Heavy Duty Power Inverter 5kVA Unit',
            gstRate: 18,
          },
        ],
      },
    },
  });

  // 8. Order
  const orderA = await prisma.order.upsert({
    where: {
      tenantId_orderNumber: {
        tenantId: primaryTenant.id,
        orderNumber: 'SO/26-27/0001',
      },
    },
    update: {},
    create: {
      tenantId: primaryTenant.id,
      orderNumber: 'SO/26-27/0001',
      customerId: customerA.id,
      quotationId: quotationA.id,
      contactId: contactA.id,
      createdById: users['sales'].id,
      status: 'confirmed',
      paymentStatus: 'pending',
      advancePercent: 50.0,
      advanceAmount: 59000,
      paidAmount: 0,
      balanceAmount: 118000,
      subtotal: 100000,
      taxAmount: 18000,
      totalAmount: 118000,
      customerName: customerA.name,
      customerPhone: '+1-555-0155',
      customerEmail: 'charles@omni-retail.example.com',
      customerGstin: customerA.gstin,
      customerAddress: customerA.address,
      customerState: customerA.state,
      shippingAddress: customerA.address,
      notes: 'Urgent commercial delivery requested',
      lines: {
        create: [
          {
            skuId: skuA.id,
            quantity: 2,
            unitPrice: 50000,
            discount: 0,
            totalPrice: 100000,
            hsnCode: '85044090',
            description: 'Heavy Duty Power Inverter 5kVA Unit',
            gstRate: 18,
          },
        ],
      },
    },
  });

  // 9. Invoices of each document type: tax_invoice, sez_invoice, proforma, delivery_challan, credit_note
  const invoiceConfigs = [
    { number: 'INV/26-27/0001', type: 'tax_invoice', amount: 118000, isSez: false, customer: customerA },
    { number: 'SEZ/26-27/0001', type: 'sez_invoice', amount: 100000, isSez: true, customer: customerB },
    { number: 'PF/26-27/0001', type: 'proforma', amount: 118000, isSez: false, customer: customerA },
    { number: 'DC/26-27/0001', type: 'delivery_challan', amount: 100000, isSez: false, customer: customerA },
    { number: 'CN/26-27/0001', type: 'credit_note', amount: 11800, isSez: false, customer: customerA },
  ];

  for (const ic of invoiceConfigs) {
    await prisma.invoice.upsert({
      where: {
        tenantId_invoiceNumber: {
          tenantId: primaryTenant.id,
          invoiceNumber: ic.number,
        },
      },
      update: {},
      create: {
        tenantId: primaryTenant.id,
        invoiceNumber: ic.number,
        docType: ic.type,
        companyId: ic.customer.id,
        customerId: ic.customer.id,
        orderId: orderA.id,
        quotationId: quotationA.id,
        createdById: users['finance'].id,
        invoiceDate: new Date('2026-10-18'),
        dueDate: new Date('2026-11-18'),
        customerName: ic.customer.name,
        customerPhone: '+1-555-0155',
        customerEmail: ic.customer.billingEmail,
        customerGstin: ic.customer.gstin,
        customerState: ic.customer.state,
        billingAddress: ic.customer.address,
        deliveryAddress: ic.customer.address,
        isSez: ic.isSez,
        subtotal: 100000,
        cgstAmount: ic.isSez ? 0 : 9000,
        sgstAmount: ic.isSez ? 0 : 9000,
        igstAmount: 0,
        totalAmount: ic.amount,
        balanceDue: ic.type === 'proforma' ? 0 : ic.amount,
        lines: {
          create: [
            {
              skuId: skuA.id,
              description: 'Heavy Duty Power Inverter 5kVA Unit',
              quantity: 2,
              unitPrice: 50000,
              taxRate: ic.isSez ? 0 : 18,
              lineTotal: ic.amount,
              hsnCode: '85044090',
            },
          ],
        },
      },
    });

    // Automatically post ledger entry for seeded invoice / credit note
    if (ic.type === 'tax_invoice' || ic.type === 'sez_invoice') {
      await prisma.ledgerEntry.create({
        data: {
          tenantId: primaryTenant.id,
          partyType: 'customer',
          partyId: ic.customer.id,
          entryDate: new Date('2026-10-18'),
          financialYear: '26-27',
          voucherType: 'sales',
          voucherNo: ic.number,
          particulars: `Sales ${ic.type} #${ic.number}`,
          debit: ic.amount,
          credit: 0,
          sourceType: 'invoice',
          createdById: users['finance'].id,
        },
      });
    } else if (ic.type === 'credit_note') {
      await prisma.ledgerEntry.create({
        data: {
          tenantId: primaryTenant.id,
          partyType: 'customer',
          partyId: ic.customer.id,
          entryDate: new Date('2026-10-18'),
          financialYear: '26-27',
          voucherType: 'credit_note',
          voucherNo: ic.number,
          particulars: `Credit Note #${ic.number}`,
          debit: 0,
          credit: ic.amount,
          sourceType: 'credit_note',
          createdById: users['finance'].id,
        },
      });
    }
  }

  // 10. Purchase Bill from Supplier
  await prisma.purchaseBill.upsert({
    where: {
      id: 'pb-dev-001',
    },
    update: {},
    create: {
      id: 'pb-dev-001',
      tenantId: primaryTenant.id,
      supplierId: supplierA.id,
      invoiceNumber: 'BILL/26-27/0001',
      vendorName: supplierA.name,
      vendorGstin: supplierA.gstin,
      vendorAddress: supplierA.address,
      dueDate: new Date('2026-11-12'),
      subtotal: 50000,
      totalTax: 9000,
      grandTotal: 59000,
      paymentStatus: 'unpaid',
      createdById: users['finance'].id,
    },
  });

  // Post supplier purchase bill ledger entry
  await prisma.ledgerEntry.create({
    data: {
      tenantId: primaryTenant.id,
      partyType: 'supplier',
      partyId: supplierA.id,
      entryDate: new Date('2026-10-18'),
      financialYear: '26-27',
      voucherType: 'purchase',
      voucherNo: 'BILL/26-27/0001',
      particulars: `Purchase Bill #BILL/26-27/0001`,
      debit: 0,
      credit: 59000,
      sourceType: 'purchase_bill',
      createdById: users['finance'].id,
    },
  });

  // 11. Payment & Ledger Entries
  const firstInvoice = await prisma.invoice.findFirst({
    where: { invoiceNumber: 'INV/26-27/0001' },
  });

  const paymentRecord = await prisma.paymentRecord.create({
    data: {
      tenantId: primaryTenant.id,
      customerId: customerA.id,
      orderId: orderA.id,
      invoiceId: firstInvoice?.id,
      amount: 50000,
      paymentType: 'receipt',
      paymentMethod: 'NEFT',
      transactionRef: 'TXN-DEV-BANK-88912',
      paymentDate: new Date('2026-10-20'),
      notes: 'Initial invoice settlement payment',
      recordedById: users['finance'].id,
    },
  });

  if (firstInvoice) {
    await prisma.invoice.update({
      where: { id: firstInvoice.id },
      data: {
        balanceDue: Number((firstInvoice.totalAmount - 50000).toFixed(2)),
        paymentStatus: 'partial',
      },
    });

    await prisma.paymentAllocation.create({
      data: {
        tenantId: primaryTenant.id,
        paymentType: 'customer_receipt',
        paymentRecordId: paymentRecord.id,
        invoiceId: firstInvoice.id,
        amount: 50000,
      },
    });
  }

  await prisma.ledgerEntry.create({
    data: {
      tenantId: primaryTenant.id,
      partyType: 'customer',
      partyId: customerA.id,
      entryDate: new Date('2026-10-20'),
      financialYear: '26-27',
      voucherType: 'receipt',
      voucherNo: 'REC/26-27/0001',
      particulars: 'Payment received via NEFT TXN-DEV-BANK-88912',
      credit: 50000,
      debit: 0,
      sourceType: 'payment_record',
      createdById: users['finance'].id,
    },
  });

  // 12. Seed Authoritative DocumentSeries for All Types (4-digit format, PF prefix for proforma)
  const seriesToSeed = [
    { docType: 'tax_invoice', prefix: 'INV', nextNumber: 2 },
    { docType: 'sez_invoice', prefix: 'SEZ', nextNumber: 2 },
    { docType: 'proforma', prefix: 'PF', nextNumber: 2 },
    { docType: 'delivery_challan', prefix: 'DC', nextNumber: 2 },
    { docType: 'credit_note', prefix: 'CN', nextNumber: 2 },
    { docType: 'receipt', prefix: 'REC', nextNumber: 2 },
    { docType: 'quotation', prefix: 'QT', nextNumber: 2 },
    { docType: 'order', prefix: 'SO', nextNumber: 2 },
  ];

  for (const s of seriesToSeed) {
    await prisma.documentSeries.upsert({
      where: {
        tenantId_docType_financialYear: {
          tenantId: primaryTenant.id,
          docType: s.docType,
          financialYear: '26-27',
        },
      },
      update: { prefix: s.prefix, nextNumber: s.nextNumber },
      create: {
        tenantId: primaryTenant.id,
        docType: s.docType,
        financialYear: '26-27',
        prefix: s.prefix,
        nextNumber: s.nextNumber,
      },
    });
  }

  // 13. Seed Customer A and Supplier A Ledger Fixtures
  try {
    const { execSync } = require('child_process');
    execSync('node node_modules/ts-node/dist/bin.js --project apps/api/tsconfig.json scripts/seed-ledger-fixture.ts', {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    });
  } catch (err: any) {
    console.warn('[SEED-DEV] Notice: Ledger fixtures seeding step:', err.message);
  }

  console.log('[SEED-DEV] Dev database seeded successfully with 3 companies, all roles, documents, and payments!');
}

if (require.main === module) {
  seedDevData()
    .catch((e) => {
      console.error('[SEED-DEV ERROR]', e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
