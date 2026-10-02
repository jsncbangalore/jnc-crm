import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 [1/4] Performing full clean database reset...');

  // Safe deletion in reverse dependency order
  const deleteOperations = [
    () => prisma.auditLog.deleteMany({}),
    () => prisma.messageLog.deleteMany({}),
    () => prisma.paymentRecord.deleteMany({}),
    () => prisma.invoiceItem.deleteMany({}),
    () => prisma.invoice.deleteMany({}),
    () => prisma.shipmentItem.deleteMany({}),
    () => prisma.shipment.deleteMany({}),
    () => prisma.orderItem.deleteMany({}),
    () => prisma.order.deleteMany({}),
    () => prisma.quotationItem.deleteMany({}),
    () => prisma.quotation.deleteMany({}),
    () => prisma.leadActivity.deleteMany({}),
    () => prisma.leadShare.deleteMany({}),
    () => prisma.lead.deleteMany({}),
    () => prisma.contact.deleteMany({}),
    () => prisma.company.deleteMany({}),
    () => prisma.stockMovement.deleteMany({}),
    () => prisma.stockTransferItem.deleteMany({}),
    () => prisma.stockTransfer.deleteMany({}),
    () => prisma.locationBin.deleteMany({}),
    () => prisma.warehouse.deleteMany({}),
    () => prisma.skuPriceHistory.deleteMany({}),
    () => prisma.sku.deleteMany({}),
    () => prisma.product.deleteMany({}),
    () => prisma.supplier.deleteMany({}),
    () => prisma.customObjectRecord.deleteMany({}),
    () => prisma.customField.deleteMany({}),
    () => prisma.customObject.deleteMany({}),
    () => prisma.projectDailyLog.deleteMany({}),
    () => prisma.projectStockPosition.deleteMany({}),
    () => prisma.projectAssignment.deleteMany({}),
    () => prisma.dailyActivity.deleteMany({}),
    () => prisma.projectMilestone.deleteMany({}),
    () => prisma.projectTask.deleteMany({}),
    () => prisma.project.deleteMany({}),
    () => prisma.automationStep.deleteMany({}),
    () => prisma.automationRule.deleteMany({}),
    () => prisma.mailAccount.deleteMany({}),
    () => prisma.accountLockout.deleteMany({}),
    () => prisma.user.deleteMany({}),
    () => prisma.team.deleteMany({}),
    () => prisma.tenant.deleteMany({}),
  ];

  for (const op of deleteOperations) {
    try {
      await op();
    } catch (err: any) {
      console.warn('Delete step notice:', err?.message || err);
    }
  }

  console.log('✅ Database purged cleanly.');

  // ─── [2/4] Seed Fresh Isolated Organizations ──────────────────────────────
  console.log('🏢 [2/4] Seeding isolated organizations (Tenants)...');
  const org1 = await prisma.tenant.create({
    data: {
      code: 'JNC',
      name: 'JS Network Communication',
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

  console.log('✅ Organizations seeded:', [org1.code, org2.code, org3.code]);

  // ─── [3/4] Seed Clean User Accounts ──────────────────────────────────────
  console.log('👥 [3/4] Seeding role-aware user accounts...');
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
      warehouseId: 'BLR-MAIN',
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
      warehouseId: 'BLR-MAIN',
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
      warehouseId: 'BLR-MAIN',
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

  console.log(`✅ ${users.length} Canonical Users seeded with Password123!`);

  // ─── [4/4] Seed Standard Warehouses, Suppliers & Automation ───────────────
  console.log('📦 [4/4] Seeding Warehouses, Suppliers, SKUs & Automation Rules...');

  // Warehouses
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

  // Location Bins
  await prisma.locationBin.createMany({
    data: [
      { warehouseId: wh1.id, binCode: 'BLR-A-01-B01', aisle: 'A', rack: '01', shelf: 'B', bin: '01' },
      { warehouseId: wh1.id, binCode: 'BLR-A-01-B02', aisle: 'A', rack: '01', shelf: 'B', bin: '02' },
      { warehouseId: wh2.id, binCode: 'JSNC-R1-S1-B1', aisle: 'R1', rack: '01', shelf: 'S1', bin: '01' },
    ],
  });

  // Suppliers
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

  // Standard Products & SKUs
  const prod1 = await prisma.product.create({
    data: {
      tenantId: org1.id,
      category: 'Power Electronics',
      brand: 'Schneider Electric',
      modelName: 'Smart-UPS RT 10kVA Online',
      description: 'High-density, double-conversion on-line power protection with scalable runtime.',
      hsnCode: '85044090',
      basePrice: 145000,
      isActive: true,
    },
  });

  await prisma.sku.create({
    data: {
      tenantId: org1.id,
      productId: prod1.id,
      skuCode: 'UPS-SRT10KXLI',
      name: 'APC Smart-UPS RT 10000VA 230V',
      gstRate: 18,
      purchasePrice: 110000,
      sellingPrice: 145000,
      stockQuantity: 15,
      reorderPoint: 4,
      safetyStock: 2,
    },
  });

  const prod2 = await prisma.product.create({
    data: {
      tenantId: org2.id,
      category: 'Industrial IoT',
      brand: 'Cisco',
      modelName: 'Catalyst IE3400 Heavy Duty Switch',
      description: 'Full Gigabit Ethernet switch built for demanding industrial automation environments.',
      hsnCode: '85176290',
      basePrice: 85000,
      isActive: true,
    },
  });

  await prisma.sku.create({
    data: {
      tenantId: org2.id,
      productId: prod2.id,
      skuCode: 'CSCO-IE3400-8P',
      name: 'Cisco IE-3400 8-Port PoE+ Rugged Switch',
      gstRate: 18,
      purchasePrice: 65000,
      sellingPrice: 85000,
      stockQuantity: 28,
      reorderPoint: 5,
      safetyStock: 3,
    },
  });

  // Canonical Automation Rules
  const rules = [
    {
      tenantId: org1.id,
      name: 'New Lead Auto-Welcome & Lead Score Assessment',
      triggerEvent: 'lead_created',
      conditionJson: '{}',
      actionType: 'send_email',
      actionPayloadJson: JSON.stringify({
        recipient: 'lead',
        subject: 'Thank you for your inquiry with JNC Network',
        body: 'Dear {{customerName}},\n\nThank you for reaching out to JNC Network & Power Solutions. A dedicated product specialist will assist you shortly.',
      }),
      isActive: true,
    },
    {
      tenantId: org1.id,
      name: 'Order Confirmed: Stock Reservation & Proforma Dispatch',
      triggerEvent: 'order_confirmed',
      conditionJson: '{}',
      actionType: 'send_email',
      actionPayloadJson: JSON.stringify({
        recipient: 'customer',
        subject: 'Order Confirmed: {{orderNumber}} — JNC Network & Power',
        body: 'Thank you for your order {{orderNumber}}. Your proforma invoice is ready and stock is reserved.',
      }),
      isActive: true,
    },
    {
      tenantId: org2.id,
      name: 'JSNC Inbound Inquiries: Real-time Sales Rep Routing',
      triggerEvent: 'lead_created',
      conditionJson: '{}',
      actionType: 'send_email',
      actionPayloadJson: JSON.stringify({
        recipient: 'sales_team',
        subject: '[New Inbound Lead] {{customerName}} - {{productName}}',
        body: 'A new inbound lead has been captured from {{source}}. Please contact immediately.',
      }),
      isActive: true,
    },
  ];

  for (const r of rules) {
    await prisma.automationRule.create({
      data: r,
    });
  }

  console.log('\n🎉 ALL STORED DATA PURGED & CANONICAL SEED COMPLETED SUCCESSFULLY!');
}

main()
  .catch((e) => {
    console.error('❌ Reset & Seed Failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
