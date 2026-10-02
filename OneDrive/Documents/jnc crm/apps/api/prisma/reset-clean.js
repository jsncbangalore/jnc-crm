const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 [1/3] Truncating all stored records from all tables (CASCADE)...');

  try {
    // Truncate all tables in PostgreSQL with CASCADE
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE 
        "Tenant",
        "AccountLockout"
      CASCADE;
    `);
    console.log('✅ TRUNCATE CASCADE executed successfully.');
  } catch (err) {
    console.log('Fallback to sequential table deletion:', err.message);
    const models = [
      'stockItem', 'stockMovement', 'stockTransfer', 'locationBin', 'warehouse',
      'sku', 'product', 'supplier', 'invoiceLine', 'invoice', 'shipment', 'order',
      'quotation', 'leadActivity', 'leadShare', 'lead', 'contact', 'company',
      'auditLog', 'messageLog', 'paymentRecord', 'customObjectRecord', 'customField',
      'customObject', 'projectDailyLog', 'projectStockPosition', 'projectAssignment',
      'project', 'automationStep', 'automationRule', 'mailAccount', 'accountLockout',
      'user', 'team', 'tenant'
    ];
    for (const m of models) {
      if (prisma[m]) {
        try { await prisma[m].deleteMany({}); } catch (e) {}
      }
    }
  }

  // ─── [2/3] Seed Fresh Isolated Organizations (Tenants) ────────────────────
  console.log('🏢 [2/3] Seeding fresh isolated organizations...');
  
  const org1 = await prisma.tenant.create({
    data: {
      id: 'default-tenant-id',
      code: 'JNC-ORG-001',
      name: 'JNC Network Communication',
      slug: 'jnc',
      status: 'active',
      planTier: 'enterprise',
      maxUsers: 50,
      state: 'Karnataka',
      city: 'Bengaluru',
      currency: 'INR',
      invoicePrefix: 'JNC-INV',
      lutBondNo: 'AD290525013648T',
      lutValidity: 'From: 10/05/2025 To: 09/05/2026',
    },
  });

  const org2 = await prisma.tenant.create({
    data: {
      id: '10d7b5be-6b47-46f4-a3ac-536fb8f54d1d',
      code: 'JNC-JSNC-001',
      name: 'jsnc',
      slug: 'jsnc',
      status: 'active',
      planTier: 'professional',
      maxUsers: 25,
      state: 'Karnataka',
      city: 'Bengaluru',
      currency: 'INR',
      invoicePrefix: 'JSNC-INV',
    },
  });

  const org3 = await prisma.tenant.create({
    data: {
      id: '9de686e2-6124-4713-aeff-ae51738ceb2f',
      code: 'JNC-SK-001',
      name: 'santhosh',
      slug: 'sk',
      status: 'active',
      planTier: 'standard',
      maxUsers: 10,
      state: 'Karnataka',
      city: 'Bengaluru',
      currency: 'INR',
      invoicePrefix: 'SK-INV',
    },
  });

  console.log('✅ Organizations created:', org1.code, org2.code, org3.code);

  // ─── [3/3] Seed Clean User Accounts ──────────────────────────────────────
  console.log('👥 [3/3] Seeding fresh user accounts with Password123! ...');
  const defaultPasswordHash = await bcrypt.hash('Password123!', 10);

  const users = [
    {
      tenantId: org1.id,
      employeeCode: 'JNC-SA-001',
      name: 'Jayaraj',
      email: 'Jayarajjnc@gmail.com',
      role: 'super_admin',
      phone: '9845012345',
      isActive: true,
      mustResetPassword: false,
    },
    {
      tenantId: org2.id,
      employeeCode: 'JNC-JSNC-001-SA-001',
      name: 'santhosh kumar',
      email: 'santhosh1508sk@gmail.com',
      role: 'tenant_admin',
      phone: '9952385331',
      isActive: true,
      mustResetPassword: false,
    },
    {
      tenantId: org3.id,
      employeeCode: 'JNC-SK-SA-001',
      name: 'santhosh',
      email: 'santhoshs0815@gmail.com',
      role: 'tenant_admin',
      phone: '9952385331',
      isActive: true,
      mustResetPassword: false,
    },
    {
      tenantId: org2.id,
      employeeCode: 'JNC-EMP-001',
      name: 'Sanketh',
      email: 'sankethk259@gmail.com',
      role: 'employee',
      phone: '8123597541',
      isActive: true,
      mustResetPassword: false,
    },
    {
      tenantId: org2.id,
      employeeCode: 'JNC-EMP-002',
      name: 'Punith',
      email: 'punithnikkam@gmail.com',
      role: 'employee',
      phone: '9876543211',
      isActive: true,
      mustResetPassword: false,
    },
    {
      tenantId: org1.id,
      employeeCode: 'JNC-DEV-001',
      name: 'Santhosh Dev',
      email: 'santhoshs0815@gmail.com',
      role: 'developer',
      phone: '9952385331',
      isActive: true,
      mustResetPassword: false,
    },
  ];

  for (const u of users) {
    await prisma.user.create({
      data: {
        ...u,
        passwordHash: defaultPasswordHash,
      },
    });
  }

  // Seed Warehouses
  const wh1 = await prisma.warehouse.create({
    data: {
      tenantId: org1.id,
      code: 'BLR-MAIN',
      name: 'Bengaluru Central Distribution Hub',
      address: '14, Electronics City Phase 1',
      city: 'Bengaluru',
      isActive: true,
    },
  });

  const wh2 = await prisma.warehouse.create({
    data: {
      tenantId: org2.id,
      code: 'JSNC-BLR-01',
      name: 'JSNC Electronic Logistics Hub',
      address: '22, Peenya Industrial Area',
      city: 'Bengaluru',
      isActive: true,
    },
  });

  // Seed Suppliers
  await prisma.supplier.createMany({
    data: [
      {
        id: 'seed-supplier-1',
        tenantId: org1.id,
        name: 'Mouser Electronics India',
        contactPerson: 'Suresh Patil',
        email: 'india@mouser.com',
        phone: '022-48978900',
        city: 'Mumbai',
        leadTimeDays: 7,
        isActive: true,
      },
      {
        id: 'seed-supplier-2',
        tenantId: org1.id,
        name: 'Arrow Electronics India',
        contactPerson: 'Divya Nair',
        email: 'india@arrow.com',
        phone: '080-49567800',
        city: 'Bengaluru',
        leadTimeDays: 5,
        isActive: true,
      },
      {
        id: 'seed-supplier-3',
        tenantId: org2.id,
        name: 'Robu.in Components',
        contactPerson: 'Kiran Tiwari',
        email: 'support@robu.in',
        phone: '9988776655',
        city: 'Pune',
        leadTimeDays: 3,
        isActive: true,
      },
    ],
  });

  console.log('✅ Fresh warehouses and suppliers seeded.');
  console.log('\n🎉 ALL STORED DATA PURGED & CANONICAL SEED COMPLETED SUCCESSFULLY!');
}

main()
  .catch((e) => {
    console.error('❌ Reset error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
