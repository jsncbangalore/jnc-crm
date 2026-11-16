#!/usr/bin/env node
/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const path = require('path');
const fs = require('fs');

// Load environment variables strictly from application root or .env.development
const envPath = fs.existsSync(path.resolve(__dirname, '../.env.development'))
  ? path.resolve(__dirname, '../.env.development')
  : fs.existsSync(path.resolve(__dirname, '../apps/api/.env.development'))
    ? path.resolve(__dirname, '../apps/api/.env.development')
    : path.resolve(__dirname, '../apps/api/.env');

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const k = trimmed.substring(0, idx).trim();
      let v = trimmed.substring(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (process.env[k] === undefined) {
        process.env[k] = v;
      }
    }
  });
}

const dbUrl = process.env.DATABASE_URL || '';
let parsedDb;
try {
  parsedDb = new URL(dbUrl);
} catch {
  console.error('[FATAL] DATABASE_URL is missing or invalid.');
  process.exit(1);
}

const dbHost = parsedDb.hostname.toLowerCase();
const dbName = parsedDb.pathname.replace(/^\//, '');
const isLocal = ['localhost', '127.0.0.1', '::1'].includes(dbHost);
const isDevDb = dbName.startsWith('jnc_crm_dev');

if (!isLocal || !isDevDb) {
  console.error(`\n========================================================================`);
  console.error(`[FATAL] dev:demo-seed REFUSED TO RUN.`);
  console.error(`DATABASE_URL host: '${dbHost}', database: '${dbName}'`);
  console.error(`This script only runs against a local development database starting with 'jnc_crm_dev'.`);
  console.error(`========================================================================\n`);
  process.exit(1);
}

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seed() {
  console.log('========================================================================');
  console.log('STARTING DEV DEMO SEED (Local database: jnc_crm_dev)');
  console.log('========================================================================');

  try {
    // 1. Provision Demo Tenant
    console.log('[1/6] Upserting Demo Tenant: Demo Company (DEMO-001)...');
    let tenant = await prisma.tenant.findFirst({
      where: {
        OR: [{ slug: 'demo-company' }, { code: 'DEMO-001' }],
      },
    });

    const tenantData = {
      name: 'Demo Company',
      slug: 'demo-company',
      code: 'DEMO-001',
      status: 'active',
      planTier: 'enterprise',
      isDemo: true,
      gstin: '29ABCDE1234F1Z5',
      pan: 'ABCDE1234F',
      email: 'billing@demo.test',
      phone: '9876543210',
      address: '123 Tech Boulevard, Electronic City',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560100',
      currency: 'INR',
      lutBondNo: 'LUT/DEMO/2026/01',
      lutValidity: '2026-2027',
      invoicePrefix: 'DEMO-INV',
      bankName: 'Demo State Bank of India',
      bankAccountNumber: '987654321000',
      bankIfsc: 'SBIN0001234',
      bankBranch: 'Electronic City',
      bankUpi: 'democompany@okaxis',
    };

    if (tenant) {
      tenant = await prisma.tenant.update({
        where: { id: tenant.id },
        data: tenantData,
      });
    } else {
      tenant = await prisma.tenant.create({
        data: tenantData,
      });
    }
    console.log(` -> Demo Tenant ready: id=${tenant.id}`);

    // Bank Account
    console.log('[2/6] Upserting Demo Bank Account...');
    const existingBank = await prisma.companyBankAccount.findFirst({
      where: { tenantId: tenant.id, accountNumber: '987654321000' },
    });
    if (!existingBank) {
      await prisma.companyBankAccount.create({
        data: {
          tenantId: tenant.id,
          label: 'Primary Current Account',
          bankName: 'Demo State Bank of India',
          holderName: 'Demo Company Private Limited',
          accountNumber: '987654321000',
          accountNumberLast4: '1000',
          ifsc: 'SBIN0001234',
          branch: 'Electronic City',
          upiId: 'democompany@okaxis',
          isDefault: true,
          isDocumentDefault: true,
          isActive: true,
        },
      });
    }

    // 2. Provision Demo Users
    console.log('[3/6] Upserting 6 Demo Users...');
    const defaultPasswordHash = await bcrypt.hash('DemoPassword@123', 10);

    const demoUsers = [
      {
        email: 'platform_owner@demo.test',
        name: 'Demo Platform Owner',
        employeeCode: 'DEMO-PO-01',
        role: 'platform_super_admin',
        tenantId: null,
        pages: null,
        homePage: 'platform_companies',
      },
      {
        email: 'admin@demo.test',
        name: 'Demo Company Admin',
        employeeCode: 'DEMO-ADM-01',
        role: 'tenant_admin',
        tenantId: tenant.id,
        pages: ['dashboard', 'leads', 'quotations', 'orders', 'invoices', 'bills', 'inventory', 'reports', 'users', 'settings', 'branding', 'notifications'],
        homePage: 'dashboard',
      },
      {
        email: 'sales@demo.test',
        name: 'Demo Sales Rep',
        employeeCode: 'DEMO-SLS-01',
        role: 'employee',
        tenantId: tenant.id,
        pages: ['leads', 'lead_flow', 'quotations', 'orders', 'notifications'],
        homePage: 'leads',
      },
      {
        email: 'accountant@demo.test',
        name: 'Demo Accountant',
        employeeCode: 'DEMO-ACC-01',
        role: 'accountant',
        tenantId: tenant.id,
        pages: ['invoices', 'quotations', 'bills', 'ledger', 'orders', 'notifications'],
        homePage: 'invoices',
      },
      {
        email: 'store@demo.test',
        name: 'Demo Store Manager',
        employeeCode: 'DEMO-STR-01',
        role: 'store_manager',
        tenantId: tenant.id,
        pages: ['inventory', 'suppliers', 'bills', 'shipments', 'notifications'],
        homePage: 'inventory',
      },
      {
        email: 'viewer@demo.test',
        name: 'Demo Readonly Viewer',
        employeeCode: 'DEMO-VIW-01',
        role: 'employee',
        tenantId: tenant.id,
        pages: ['leads', 'quotations', 'invoices', 'notifications'],
        homePage: 'leads',
      },
    ];

    for (const u of demoUsers) {
      let user = await prisma.user.findFirst({
        where: { email: u.email },
      });

      const userData = {
        name: u.name,
        email: u.email,
        employeeCode: u.employeeCode,
        role: u.role,
        tenantId: u.tenantId,
        passwordHash: defaultPasswordHash,
        isDemo: true,
        isActive: true,
        mustResetPassword: false,
        firstLoginAfter2FaReleaseAt: new Date(),
      };

      if (user) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: userData,
        });
      } else {
        user = await prisma.user.create({
          data: userData,
        });
      }

      if (u.pages && u.tenantId) {
        await prisma.userPageAccess.upsert({
          where: { userId: user.id },
          update: {
            pages: JSON.stringify({ pages: u.pages, homePage: u.homePage }),
            tenantId: u.tenantId,
          },
          create: {
            userId: user.id,
            tenantId: u.tenantId,
            pages: JSON.stringify({ pages: u.pages, homePage: u.homePage }),
          },
        });
      }
      console.log(` -> User ready: ${u.email} (${u.role}) -> homePage: ${u.homePage}`);
    }

    // 3. Provision Sample Customer Company
    console.log('[4/6] Upserting Sample Customer...');
    let customer = await prisma.company.findFirst({
      where: { tenantId: tenant.id, name: 'Acme Test Customer' },
    });
    const customerData = {
      tenantId: tenant.id,
      name: 'Acme Test Customer',
      gstin: '29XYZAB5678C1Z2',
      industry: 'Manufacturing',
      state: 'Karnataka',
      city: 'Bengaluru',
      address: '45 Industrial Area, Phase 2',
      billingEmail: 'accounts@acmetest.test',
      isDemo: true,
      source: 'demo',
    };
    if (customer) {
      customer = await prisma.company.update({
        where: { id: customer.id },
        data: customerData,
      });
    } else {
      customer = await prisma.company.create({
        data: customerData,
      });
    }

    // 4. Provision Sample SKUs
    console.log('[5/6] Upserting Sample SKUs...');
    let sku1 = await prisma.sku.findFirst({
      where: { tenantId: tenant.id, skuCode: 'DEMO-SKU-001' },
    });
    if (!sku1) {
      sku1 = await prisma.sku.create({
        data: {
          tenantId: tenant.id,
          skuCode: 'DEMO-SKU-001',
          name: 'Precision Hydraulic Valve',
          category: 'Valves',
          unitPrice: 1500,
          costPrice: 950,
          taxRate: 18.0,
          reorderPoint: 50,
          reorderQty: 200,
        },
      });
    }

    let sku2 = await prisma.sku.findFirst({
      where: { tenantId: tenant.id, skuCode: 'DEMO-SKU-002' },
    });
    if (!sku2) {
      sku2 = await prisma.sku.create({
        data: {
          tenantId: tenant.id,
          skuCode: 'DEMO-SKU-002',
          name: 'Stainless Steel Flange 4-inch',
          category: 'Fittings',
          unitPrice: 850,
          costPrice: 500,
          taxRate: 18.0,
          reorderPoint: 30,
          reorderQty: 100,
        },
      });
    }

    // 5. Provision Sample Leads
    console.log('[6/6] Upserting Sample Leads, Quotation, and Invoice...');
    const lead1 = await prisma.lead.findFirst({
      where: { leadNumber: 'DEMO-LEAD-001' },
    });
    if (!lead1) {
      await prisma.lead.create({
        data: {
          tenant: { connect: { id: tenant.id } },
          leadNumber: 'DEMO-LEAD-001',
          customerName: 'Rohit Sharma',
          customerPhone: '9876543211',
          customerEmail: 'rohit@clientdemo.test',
          city: 'Bengaluru',
          state: 'Karnataka',
          productCategory: 'Valves',
          productName: 'Precision Hydraulic Valve',
          quantity: 10,
          unit: 'NOS',
          estimatedValue: 15000,
          status: 'qualified',
          source: 'manual',
          company: { connect: { id: customer.id } },
        },
      });
    }

    // Sample Quotation
    let quo = await prisma.quotation.findFirst({
      where: { tenantId: tenant.id, quoteNumber: 'DEMO-QUO-001' },
    });
    if (!quo) {
      quo = await prisma.quotation.create({
        data: {
          tenant: { connect: { id: tenant.id } },
          quoteNumber: 'DEMO-QUO-001',
          customer: { connect: { id: customer.id } },
          customerName: customer.name,
          customerPhone: '9876543211',
          customerEmail: 'accounts@acmetest.test',
          customerGstin: customer.gstin,
          customerAddress: customer.address,
          customerState: customer.state,
          status: 'sent',
          subtotal: 15000,
          taxRate: 18.0,
          taxAmount: 2700,
          totalAmount: 17700,
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          notes: 'Standard 30-day payment term applies.',
          lines: {
            create: [
              {
                sku: { connect: { id: sku1.id } },
                description: 'Precision Hydraulic Valve',
                unit: 'NOS',
                quantity: 10,
                unitPrice: 1500,
                gstRate: 18.0,
                totalPrice: 15000,
              },
            ],
          },
        },
      });
    }

    // Sample Invoice
    let inv = await prisma.invoice.findFirst({
      where: { tenantId: tenant.id, invoiceNumber: 'DEMO-INV-001' },
    });
    if (!inv) {
      inv = await prisma.invoice.create({
        data: {
          tenant: { connect: { id: tenant.id } },
          invoiceNumber: 'DEMO-INV-001',
          docType: 'tax_invoice',
          quotationId: quo.id,
          company: { connect: { id: customer.id } },
          customerName: customer.name,
          customerPhone: '9876543211',
          customerEmail: customer.billingEmail,
          customerGstin: customer.gstin,
          customerState: customer.state,
          billingAddress: customer.address,
          deliveryAddress: customer.address,
          subtotal: 15000,
          cgstAmount: 1350,
          sgstAmount: 1350,
          igstAmount: 0,
          totalAmount: 17700,
          balanceDue: 17700,
          paymentStatus: 'unpaid',
          lines: {
            create: [
              {
                sku: { connect: { id: sku1.id } },
                description: 'Precision Hydraulic Valve',
                unit: 'NOS',
                quantity: 10,
                unitPrice: 1500,
                taxRate: 18.0,
                cgstRate: 9.0,
                cgstAmount: 1350,
                sgstRate: 9.0,
                sgstAmount: 1350,
                lineTotal: 15000,
              },
            ],
          },
        },
      });
    }

    console.log('\n========================================================================');
    console.log('[PASS] DEV DEMO SEED COMPLETED SUCCESSFULLY!');
    console.log('  Tenant : Demo Company (DEMO-001)');
    console.log('  Users  : 6 demo accounts created/updated (@demo.test)');
    console.log('  Data   : Customer, SKUs, Leads, Quotation, and Invoice ready');
    console.log('========================================================================\n');
  } catch (err) {
    console.error('\n[FAIL] Demo seed failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
