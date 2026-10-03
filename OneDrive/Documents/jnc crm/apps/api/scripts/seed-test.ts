/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import * as path from 'path';
import * as fs from 'fs';

// Pre-load .env.test or .env
const testEnvPath = path.resolve(__dirname, '../.env.test');
const defaultEnvPath = path.resolve(__dirname, '../.env');
const targetEnv = fs.existsSync(testEnvPath) ? testEnvPath : defaultEnvPath;

if (fs.existsSync(targetEnv)) {
  const envContent = fs.readFileSync(targetEnv, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.substring(0, idx).trim();
      let val = trimmed.substring(idx + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.substring(1, val.length - 1);
      }
      process.env[key] = val;
    }
  });
}

import { assertNotProductionDb } from './safety-check';

// Strict safety check: Refuse to run if pointed to production Supabase
assertNotProductionDb('seed-test');

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export async function seedTestDatabase() {
  console.log('========================================================================');
  console.log('[TEST SEED] Seeding Isolated Multi-Tenant Test Environment');
  console.log(`Database URL: ${process.env.DATABASE_URL?.replace(/:[^:]*@/, ':***@')}`);
  console.log('========================================================================\n');

  const hashedPw = await bcrypt.hash('TestPassword123!', 10);

  // 1. Create Tenant A and Tenant B
  console.log('1. Upserting Tenants A & B...');
  const tenantA = await prisma.tenant.upsert({
    where: { code: 'TENTA' },
    update: {
      name: 'Tenant A Industrial Corp',
      status: 'active',
      isInternal: false,
    },
    create: {
      id: 'test-tenant-a-id',
      code: 'TENTA',
      name: 'Tenant A Industrial Corp',
      slug: 'tenant-a-corp',
      status: 'active',
      planTier: 'enterprise',
      maxUsers: 50,
      currency: 'INR',
      isInternal: false,
    },
  });

  const tenantB = await prisma.tenant.upsert({
    where: { code: 'TENTB' },
    update: {
      name: 'Tenant B Logistics Ltd',
      status: 'active',
      isInternal: false,
    },
    create: {
      id: 'test-tenant-b-id',
      code: 'TENTB',
      name: 'Tenant B Logistics Ltd',
      slug: 'tenant-b-logistics',
      status: 'active',
      planTier: 'enterprise',
      maxUsers: 50,
      currency: 'INR',
      isInternal: false,
    },
  });

  // 2. Teams
  console.log('2. Creating Teams...');
  const teamA = await prisma.team.upsert({
    where: { id: 'team-a-sales' },
    update: {
      allowedPages: JSON.stringify(['leads', 'orders']),
    },
    create: {
      id: 'team-a-sales',
      tenantId: tenantA.id,
      name: 'Sales Operations Alpha',
      allowedPages: JSON.stringify(['leads', 'orders']), // No dashboard page to verify route redirection
    },
  });

  const teamB = await prisma.team.upsert({
    where: { id: 'team-b-ops' },
    update: {
      allowedPages: JSON.stringify(['dashboard', 'leads', 'invoices']),
    },
    create: {
      id: 'team-b-ops',
      tenantId: tenantB.id,
      name: 'Operations Beta',
      allowedPages: JSON.stringify(['dashboard', 'leads', 'invoices']),
    },
  });

  // 3. Seed Users of each role for each Tenant
  console.log('3. Seeding All Roles for Tenant A & Tenant B...');
  const roles = [
    'tenant_admin',
    'admin',
    'sub_admin',
    'employee',
    'store_manager',
    'project_manager',
    'developer_lead',
    'developer',
  ];

  for (const role of roles) {
    // Tenant A User
    await prisma.user.upsert({
      where: {
        tenantId_email: {
          tenantId: tenantA.id,
          email: `${role}.a@example.com`,
        },
      },
      update: {
        role,
        isActive: true,
        passwordHash: hashedPw,
        tokenVersion: 0,
        teamId: role === 'employee' ? teamA.id : null,
      },
      create: {
        tenantId: tenantA.id,
        email: `${role}.a@example.com`,
        name: `Tenant A ${role.replace('_', ' ').toUpperCase()}`,
        employeeCode: `A-${role.substring(0, 3).toUpperCase()}`,
        role,
        passwordHash: hashedPw,
        isActive: true,
        tokenVersion: 0,
        teamId: role === 'employee' ? teamA.id : null,
      },
    });

    // Tenant B User
    await prisma.user.upsert({
      where: {
        tenantId_email: {
          tenantId: tenantB.id,
          email: `${role}.b@example.com`,
        },
      },
      update: {
        role,
        isActive: true,
        passwordHash: hashedPw,
        tokenVersion: 0,
        teamId: role === 'employee' ? teamB.id : null,
      },
      create: {
        tenantId: tenantB.id,
        email: `${role}.b@example.com`,
        name: `Tenant B ${role.replace('_', ' ').toUpperCase()}`,
        employeeCode: `B-${role.substring(0, 3).toUpperCase()}`,
        role,
        passwordHash: hashedPw,
        isActive: true,
        tokenVersion: 0,
        teamId: role === 'employee' ? teamB.id : null,
      },
    });
  }

  // Cross-tenant duplicate email user: same email in Tenant A and Tenant B
  await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: tenantA.id,
        email: 'shared.consultant@example.com',
      },
    },
    update: { isActive: true, passwordHash: hashedPw },
    create: {
      tenantId: tenantA.id,
      email: 'shared.consultant@example.com',
      name: 'Shared Consultant (Tenant A)',
      employeeCode: 'TA-CONS-01',
      role: 'employee',
      passwordHash: hashedPw,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: tenantB.id,
        email: 'shared.consultant@example.com',
      },
    },
    update: { isActive: true, passwordHash: hashedPw },
    create: {
      tenantId: tenantB.id,
      email: 'shared.consultant@example.com',
      name: 'Shared Consultant (Tenant B)',
      employeeCode: 'TB-CONS-01',
      role: 'employee',
      passwordHash: hashedPw,
      isActive: true,
    },
  });

  // 4. Companies & Contacts (Explicit tenantId on Contacts)
  console.log('4. Seeding Companies and Contacts...');
  const companyA = await prisma.company.upsert({
    where: { id: 'comp-a-001' },
    update: { name: 'Acme Motors Pvt Ltd' },
    create: {
      id: 'comp-a-001',
      tenantId: tenantA.id,
      name: 'Acme Motors Pvt Ltd',
      gstin: '29ABCDE1234F1Z5',
      industry: 'Automotive',
      city: 'Bangalore',
      billingEmail: 'accounts@acmemotors.com',
    },
  });

  const contactA = await prisma.contact.upsert({
    where: { id: 'contact-a-001' },
    update: { tenantId: tenantA.id, companyId: companyA.id },
    create: {
      id: 'contact-a-001',
      tenantId: tenantA.id, // Strictly scoped
      companyId: companyA.id,
      name: 'Ramesh Sharma',
      phone: '+91 9845011111',
      email: 'ramesh@acmemotors.com',
      designation: 'Procurement Manager',
      isPrimary: true,
    },
  });

  const companyB = await prisma.company.upsert({
    where: { id: 'comp-b-001' },
    update: { name: 'Zenith Logistics Ltd' },
    create: {
      id: 'comp-b-001',
      tenantId: tenantB.id,
      name: 'Zenith Logistics Ltd',
      gstin: '27AABCT8888P1ZZ',
      industry: 'Logistics',
      city: 'Mumbai',
      billingEmail: 'billing@zenithlogistics.com',
    },
  });

  const contactB = await prisma.contact.upsert({
    where: { id: 'contact-b-001' },
    update: { tenantId: tenantB.id, companyId: companyB.id },
    create: {
      id: 'contact-b-001',
      tenantId: tenantB.id, // Strictly scoped
      companyId: companyB.id,
      name: 'Anita Patel',
      phone: '+91 9820022222',
      email: 'anita@zenithlogistics.com',
      designation: 'VP Operations',
      isPrimary: true,
    },
  });

  // 5. Leads
  console.log('5. Seeding Leads...');
  await prisma.lead.upsert({
    where: {
      tenantId_leadNumber: {
        tenantId: tenantA.id,
        leadNumber: 'TENTA-LD-00001',
      },
    },
    update: { customerName: 'Ramesh Sharma' },
    create: {
      id: 'lead-a-001',
      tenantId: tenantA.id,
      leadNumber: 'TENTA-LD-00001',
      source: 'web',
      status: 'qualified',
      customerName: 'Ramesh Sharma',
      customerPhone: '+91 9845011111',
      customerEmail: 'ramesh@acmemotors.com',
      companyId: companyA.id,
      contactId: contactA.id,
      estimatedValue: 150000,
    },
  });

  await prisma.lead.upsert({
    where: {
      tenantId_leadNumber: {
        tenantId: tenantB.id,
        leadNumber: 'TENTB-LD-00001',
      },
    },
    update: { customerName: 'Anita Patel' },
    create: {
      id: 'lead-b-001',
      tenantId: tenantB.id,
      leadNumber: 'TENTB-LD-00001',
      source: 'indiamart',
      status: 'contacted',
      customerName: 'Anita Patel',
      customerPhone: '+91 9820022222',
      customerEmail: 'anita@zenithlogistics.com',
      companyId: companyB.id,
      contactId: contactB.id,
      estimatedValue: 280000,
    },
  });

  // 6. Suppliers & Inventory (Warehouses, Products, SKUs)
  console.log('6. Seeding Suppliers & Inventory...');
  const supplierA = await prisma.supplier.upsert({
    where: { id: 'supp-a-001' },
    update: { name: 'Alpha Component Supply' },
    create: {
      id: 'supp-a-001',
      tenantId: tenantA.id,
      name: 'Alpha Component Supply',
      contactPerson: 'Suresh Kumar',
      phone: '+91 9800012345',
      city: 'Bangalore',
    },
  });

  const supplierB = await prisma.supplier.upsert({
    where: { id: 'supp-b-001' },
    update: { name: 'Beta Precision Instruments' },
    create: {
      id: 'supp-b-001',
      tenantId: tenantB.id,
      name: 'Beta Precision Instruments',
      contactPerson: 'Meera Deshmukh',
      phone: '+91 9800067890',
      city: 'Pune',
    },
  });

  const warehouseA = await prisma.warehouse.upsert({
    where: { id: 'wh-a-001' },
    update: { name: 'Warehouse Alpha Main' },
    create: {
      id: 'wh-a-001',
      tenantId: tenantA.id,
      code: 'WH-A-MAIN',
      name: 'Warehouse Alpha Main',
      city: 'Bangalore',
    },
  });

  const warehouseB = await prisma.warehouse.upsert({
    where: { id: 'wh-b-001' },
    update: { name: 'Warehouse Beta West' },
    create: {
      id: 'wh-b-001',
      tenantId: tenantB.id,
      code: 'WH-B-WEST',
      name: 'Warehouse Beta West',
      city: 'Mumbai',
    },
  });

  const productA = await prisma.product.upsert({
    where: { id: 'prod-a-001' },
    update: { name: 'Precision Step Motor' },
    create: {
      id: 'prod-a-001',
      tenantId: tenantA.id,
      name: 'Precision Step Motor',
      category: 'Electronics',
    },
  });

  const skuA = await prisma.sku.upsert({
    where: {
      tenantId_skuCode: {
        tenantId: tenantA.id,
        skuCode: 'SKU-A-MOT-01',
      },
    },
    update: { unitPrice: 3200 },
    create: {
      id: 'sku-a-001',
      tenantId: tenantA.id,
      productId: productA.id,
      skuCode: 'SKU-A-MOT-01',
      name: 'NEMA 23 High Torque Stepper',
      category: 'Motors',
      unitPrice: 3200,
      costPrice: 2100,
      taxRate: 18,
      preferredSupplierId: supplierA.id,
    },
  });

  const productB = await prisma.product.upsert({
    where: { id: 'prod-b-001' },
    update: { name: 'Industrial Optical Sensor' },
    create: {
      id: 'prod-b-001',
      tenantId: tenantB.id,
      name: 'Industrial Optical Sensor',
      category: 'Sensors',
    },
  });

  const skuB = await prisma.sku.upsert({
    where: {
      tenantId_skuCode: {
        tenantId: tenantB.id,
        skuCode: 'SKU-B-SNS-01',
      },
    },
    update: { unitPrice: 4800 },
    create: {
      id: 'sku-b-001',
      tenantId: tenantB.id,
      productId: productB.id,
      skuCode: 'SKU-B-SNS-01',
      name: 'Laser Distance Sensor 10m',
      category: 'Sensors',
      unitPrice: 4800,
      costPrice: 3100,
      taxRate: 18,
      preferredSupplierId: supplierB.id,
    },
  });

  // 7. Quotations, Orders, Invoices
  console.log('7. Seeding Quotations, Orders & Invoices...');
  const quoteA = await prisma.quotation.upsert({
    where: {
      tenantId_quoteNumber: {
        tenantId: tenantA.id,
        quoteNumber: 'QT-A-2026-001',
      },
    },
    update: { totalAmount: 18880 },
    create: {
      id: 'quote-a-001',
      tenantId: tenantA.id,
      quoteNumber: 'QT-A-2026-001',
      contactId: contactA.id,
      status: 'approved',
      subtotal: 16000,
      taxRate: 18,
      taxAmount: 2880,
      totalAmount: 18880,
      validUntil: new Date(Date.now() + 30 * 86400000),
    },
  });

  const orderA = await prisma.order.upsert({
    where: {
      tenantId_orderNumber: {
        tenantId: tenantA.id,
        orderNumber: 'ORD-A-2026-001',
      },
    },
    update: { totalAmount: 18880 },
    create: {
      id: 'order-a-001',
      tenantId: tenantA.id,
      orderNumber: 'ORD-A-2026-001',
      quotationId: quoteA.id,
      contactId: contactA.id,
      status: 'confirmed',
      paymentStatus: 'pending',
      subtotal: 16000,
      taxAmount: 2880,
      totalAmount: 18880,
      customerName: 'Acme Motors Pvt Ltd',
      customerPhone: '+91 9845011111',
    },
  });

  await prisma.invoice.upsert({
    where: { id: 'inv-a-001' },
    update: { totalAmount: 18880 },
    create: {
      id: 'inv-a-001',
      tenantId: tenantA.id,
      invoiceNumber: 'INV-A-2026-001',
      orderId: orderA.id,
      companyId: companyA.id,
      customerName: 'Acme Motors Pvt Ltd',
      customerPhone: '+91 9845011111',
      customerGstin: '29ABCDE1234F1Z5',
      subtotal: 16000,
      cgstAmount: 1440,
      sgstAmount: 1440,
      totalAmount: 18880,
      paymentStatus: 'unpaid',
    },
  });

  const quoteB = await prisma.quotation.upsert({
    where: {
      tenantId_quoteNumber: {
        tenantId: tenantB.id,
        quoteNumber: 'QT-B-2026-001',
      },
    },
    update: { totalAmount: 28320 },
    create: {
      id: 'quote-b-001',
      tenantId: tenantB.id,
      quoteNumber: 'QT-B-2026-001',
      contactId: contactB.id,
      status: 'approved',
      subtotal: 24000,
      taxRate: 18,
      taxAmount: 4320,
      totalAmount: 28320,
      validUntil: new Date(Date.now() + 30 * 86400000),
    },
  });

  const orderB = await prisma.order.upsert({
    where: {
      tenantId_orderNumber: {
        tenantId: tenantB.id,
        orderNumber: 'ORD-B-2026-001',
      },
    },
    update: { totalAmount: 28320 },
    create: {
      id: 'order-b-001',
      tenantId: tenantB.id,
      orderNumber: 'ORD-B-2026-001',
      quotationId: quoteB.id,
      contactId: contactB.id,
      status: 'confirmed',
      paymentStatus: 'pending',
      subtotal: 24000,
      taxAmount: 4320,
      totalAmount: 28320,
      customerName: 'Zenith Logistics Ltd',
      customerPhone: '+91 9820022222',
    },
  });

  await prisma.invoice.upsert({
    where: { id: 'inv-b-001' },
    update: { totalAmount: 28320 },
    create: {
      id: 'inv-b-001',
      tenantId: tenantB.id,
      invoiceNumber: 'INV-B-2026-001',
      orderId: orderB.id,
      companyId: companyB.id,
      customerName: 'Zenith Logistics Ltd',
      customerPhone: '+91 9820022222',
      customerGstin: '27AABCT8888P1ZZ',
      subtotal: 24000,
      cgstAmount: 2160,
      sgstAmount: 2160,
      totalAmount: 28320,
      paymentStatus: 'unpaid',
    },
  });

  console.log('\n========================================================================');
  console.log('[SUCCESS] Test seed complete: 2 tenants, all roles, teams, leads,');
  console.log('companies, contacts (with tenantId), quotations, orders, invoices,');
  console.log('suppliers, and inventory successfully prepared!');
  console.log('========================================================================\n');
}

if (require.main === module) {
  seedTestDatabase()
    .catch((err) => {
      console.error('[SEED FAILED]:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
