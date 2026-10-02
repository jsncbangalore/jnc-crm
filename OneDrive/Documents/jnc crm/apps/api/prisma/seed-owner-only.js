const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 [1/3] Purging ALL data from database (CASCADE)...');

  try {
    // Truncate all tables in PostgreSQL with CASCADE
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE 
        "Tenant",
        "AccountLockout"
      CASCADE;
    `);
    console.log('✅ All previous organizations, client accounts, test leads, and dummy users successfully wiped.');
  } catch (err) {
    console.log('Fallback sequential deletion:', err.message);
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

  // ─── [2/3] Seed SINGLE Master CRM Owner Organization ─────────────────────
  console.log('🏢 [2/3] Creating Master JNC Organization (Platform Owner)...');
  
  const masterOrg = await prisma.tenant.create({
    data: {
      id: 'default-tenant-id',
      code: 'JNC-ORG-001',
      name: 'JSNC Network & Power Solutions',
      slug: 'jsnc',
      status: 'active',
      planTier: 'enterprise',
      maxUsers: 100,
      state: 'Karnataka',
      city: 'Bengaluru',
      currency: 'INR',
      invoicePrefix: 'JNC-INV',
      lutBondNo: 'AD290525013648T',
      lutValidity: 'From: 10/05/2025 To: 09/05/2026',
    },
  });

  console.log('✅ Master Organization created:', masterOrg.code, `(${masterOrg.name})`);

  // ─── [3/3] Seed ONLY the Single Master Super Admin / Owner User ───────────
  console.log('👑 [3/3] Creating Master Super Admin / Owner Account...');
  const ownerPasswordHash = await bcrypt.hash('Password123!', 10);

  const ownerUser = await prisma.user.create({
    data: {
      tenantId: masterOrg.id,
      employeeCode: 'JNC-SA-001',
      name: 'Jayaraj (JNC Owner)',
      email: 'Jayarajjnc@gmail.com',
      role: 'super_admin',
      phone: '9845012345',
      isActive: true,
      mustResetPassword: false,
      passwordHash: ownerPasswordHash,
    },
  });

  // Seed standard master distribution hub
  await prisma.warehouse.create({
    data: {
      tenantId: masterOrg.id,
      code: 'BLR-MAIN',
      name: 'Bengaluru Central Distribution Hub',
      address: '14, Electronics City Phase 1',
      city: 'Bengaluru',
      isActive: true,
    },
  });

  console.log('\n======================================================');
  console.log('🎉 CLEAN DATABASE INITIALIZED WITH ONLY THE MASTER OWNER!');
  console.log('======================================================');
  console.log('Organization Code: JNC-ORG-001');
  console.log('User ID / Code:    JNC-SA-001');
  console.log('Email:             Jayarajjnc@gmail.com');
  console.log('Password:          Password123!');
  console.log('Role:              super_admin (Master Platform Owner)');
  console.log('Landing Route:     /platform/companies');
  console.log('======================================================\n');
}

main()
  .catch((e) => {
    console.error('❌ Reset Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
