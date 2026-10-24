import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.log('[WARN] Demo seed is strictly disabled when NODE_ENV is production. Aborting.');
    return;
  }

  if (process.env.SEED_DEMO !== 'yes') {
    console.log('[INFO] Demo seed skipped. Set SEED_DEMO=yes to seed generic demo data.');
    return;
  }

  console.log('[SEED] Seeding generic demo environment with fake example.com entities...');

  // 1. Demo Tenant
  const demoTenant = await prisma.tenant.upsert({
    where: { code: 'DEMO-ORG-001' },
    update: {},
    create: {
      code: 'DEMO-ORG-001',
      name: 'Acme Technologies Demo',
      slug: 'acme-demo',
      status: 'active',
      planTier: 'enterprise',
      maxUsers: 25,
      currency: 'INR',
      phone: '+1-555-0199',
      email: 'contact@example.com',
      website: 'https://example.com',
    },
  });

  const demoPassHash = await bcrypt.hash('DemoPassword123!', 10);

  // 2. Demo Users
  const demoAdmin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      tenantId: demoTenant.id,
      employeeCode: 'EMP-001',
      name: 'Demo Administrator',
      email: 'admin@example.com',
      role: 'tenant_admin',
      phone: '+1-555-0101',
      isActive: true,
      mustResetPassword: false,
      passwordHash: demoPassHash,
    },
  });

  const demoAgent = await prisma.user.upsert({
    where: { email: 'sales@example.com' },
    update: {},
    create: {
      tenantId: demoTenant.id,
      employeeCode: 'EMP-002',
      name: 'Demo Sales Agent',
      email: 'sales@example.com',
      role: 'sales_agent',
      phone: '+1-555-0102',
      isActive: true,
      mustResetPassword: false,
      passwordHash: demoPassHash,
    },
  });

  // 3. Demo Warehouse
  const demoWh = await prisma.warehouse.upsert({
    where: { code: 'DEMO-WH-01' },
    update: {},
    create: {
      tenantId: demoTenant.id,
      code: 'DEMO-WH-01',
      name: 'Demo Central Warehouse',
      city: 'Demo City',
      address: '100 Example Way',
      isActive: true,
    },
  });

  // 4. Demo Products & SKUs
  const demoProd = await prisma.product.upsert({
    where: { id: 'demo-prod-001' },
    update: {},
    create: {
      id: 'demo-prod-001',
      tenantId: demoTenant.id,
      name: 'Standard Control Unit A1',
      category: 'Electronics',
      description: 'Generic industrial electronic controller unit for demo testing',
    },
  });

  await prisma.sku.upsert({
    where: { skuCode: 'SKU-DEMO-001' },
    update: {},
    create: {
      tenantId: demoTenant.id,
      productId: demoProd.id,
      skuCode: 'SKU-DEMO-001',
      name: 'Main Processing Board',
      category: 'PCBA',
      unit: 'PCS',
      minStockLevel: 10,
    },
  });

  // 5. Demo Leads
  await prisma.lead.upsert({
    where: { leadNumber: 'LEAD-DEMO-001' },
    update: {},
    create: {
      tenantId: demoTenant.id,
      leadNumber: 'LEAD-DEMO-001',
      source: 'website',
      status: 'new',
      contactName: 'Jane Smith',
      companyName: 'Apex Sample Industries',
      email: 'lead.smith@example.com',
      phone: '+1-555-0188',
      assignedToId: demoAgent.id,
      createdById: demoAdmin.id,
    },
  });

  console.log('[OK] Generic demo seed completed successfully.');
}

main()
  .catch((e) => {
    console.error('[ERROR] Demo seed error:', e.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
