/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding JNC-CRM database...');

  // ─── Tenant ─────────────────────────────────────────────────────────────
  const jncTenant = await prisma.tenant.upsert({
    where: { code: 'JNC' },
    update: {},
    create: {
      code: 'JNC',
      name: 'JS Network Communication',
      slug: 'jnc',
      status: 'active',
      planTier: 'enterprise',
      maxUsers: 50,
      currency: 'INR',
    },
  });
  const defaultTenantId = jncTenant.id;

  // ─── Users ──────────────────────────────────────────────────────────────
  const hash = async (p: string) => bcrypt.hash(p, 10);
  const initialAdminPass = process.env.INITIAL_ADMIN_PASSWORD || 'Jnc#Boss' + Math.floor(1000 + Math.random() * 9000) + '!';
  const initialEmpPass = process.env.INITIAL_EMP_PASSWORD || 'Jnc#Emp' + Math.floor(1000 + Math.random() * 9000) + '!';

  const boss = await prisma.user.upsert({
    where: { tenantId_employeeCode: { tenantId: defaultTenantId, employeeCode: 'JNC-SA-001' } },
    update: { mustResetPassword: false, role: 'tenant_admin', email: 'santhoshs0815@gmail.com' },
    create: {
      tenantId: defaultTenantId,
      employeeCode: 'JNC-SA-001',
      name: 'JNC Network Owner',
      email: 'santhoshs0815@gmail.com',
      passwordHash: await hash(initialAdminPass),
      role: 'tenant_admin',
      isActive: true,
      mustResetPassword: false,
    },
  });

  const admin = await prisma.user.upsert({
    where: { tenantId_employeeCode: { tenantId: defaultTenantId, employeeCode: 'JNC-ADM-001' } },
    update: { mustResetPassword: true, email: 'admin@jncnetwork.com' },
    create: {
      tenantId: defaultTenantId,
      employeeCode: 'JNC-ADM-001',
      name: 'Rajesh Kumar (Admin)',
      email: 'admin@jncnetwork.com',
      passwordHash: await hash(initialAdminPass),
      role: 'admin',
      isActive: true,
      mustResetPassword: true,
    },
  });

  const emp1 = await prisma.user.upsert({
    where: { tenantId_employeeCode: { tenantId: defaultTenantId, employeeCode: 'JNC-EMP-001' } },
    update: { mustResetPassword: true, email: 'priya@jncnetwork.com' },
    create: {
      tenantId: defaultTenantId,
      employeeCode: 'JNC-EMP-001',
      name: 'Priya Sharma',
      email: 'priya@jncnetwork.com',
      phone: '9876543210',
      passwordHash: await hash(initialEmpPass),
      role: 'employee',
      isActive: true,
      mustResetPassword: true,
    },
  });

  const emp2 = await prisma.user.upsert({
    where: { tenantId_employeeCode: { tenantId: defaultTenantId, employeeCode: 'JNC-EMP-002' } },
    update: { mustResetPassword: true, email: 'arjun@jncnetwork.com' },
    create: {
      tenantId: defaultTenantId,
      employeeCode: 'JNC-EMP-002',
      name: 'Arjun Mehta',
      email: 'arjun@jncnetwork.com',
      phone: '9876543211',
      passwordHash: await hash(initialEmpPass),
      role: 'employee',
      isActive: true,
      mustResetPassword: true,
    },
  });

  const superAdmin = await prisma.user.upsert({
    where: { id: 'seed-platform-super-admin-id' },
    update: { mustResetPassword: false, role: 'platform_super_admin', email: 'jayarajjnc@gmail.com' },
    create: {
      id: 'seed-platform-super-admin-id',
      tenantId: null,
      employeeCode: 'SYS-SUP-001',
      name: 'Platform Administrator',
      email: 'jayarajjnc@gmail.com',
      passwordHash: await hash(initialAdminPass),
      role: 'platform_super_admin',
      isActive: true,
      mustResetPassword: false,
    },
  });

  console.log('✅ Users seeded');

  // ─── Suppliers ───────────────────────────────────────────────────────────
  const sup1 = await prisma.supplier.upsert({
    where: { id: 'seed-supplier-1' },
    update: {},
    create: {
      id: 'seed-supplier-1',
      tenantId: defaultTenantId,
      name: 'Mouser Electronics India',
      contactPerson: 'Suresh Patil',
      email: 'india@mouser.com',
      phone: '022-48978900',
      city: 'Mumbai',
      leadTimeDays: 7,
      isActive: true,
    },
  });

  const sup2 = await prisma.supplier.upsert({
    where: { id: 'seed-supplier-2' },
    update: {},
    create: {
      id: 'seed-supplier-2',
      tenantId: defaultTenantId,
      name: 'Arrow Electronics India',
      contactPerson: 'Divya Nair',
      email: 'india@arrow.com',
      phone: '080-49567800',
      city: 'Bengaluru',
      leadTimeDays: 5,
      isActive: true,
    },
  });

  const sup3 = await prisma.supplier.upsert({
    where: { id: 'seed-supplier-3' },
    update: {},
    create: {
      id: 'seed-supplier-3',
      tenantId: defaultTenantId,
      name: 'Robu.in Components',
      contactPerson: 'Kiran Tiwari',
      email: 'support@robu.in',
      phone: '9988776655',
      city: 'Pune',
      leadTimeDays: 3,
      isActive: true,
    },
  });

  console.log('✅ Suppliers seeded');

  // ─── Warehouse ───────────────────────────────────────────────────────────
  const wh1 = await prisma.warehouse.upsert({
    where: { tenantId_code: { tenantId: defaultTenantId, code: 'BLR-MAIN' } },
    update: {},
    create: {
      tenantId: defaultTenantId,
      code: 'BLR-MAIN',
      name: 'Bengaluru Main Warehouse',
      address: '14, Electronics City Phase 1',
      city: 'Bengaluru',
      isActive: true,
    },
  });

  const bin1 = await prisma.locationBin.upsert({
    where: { warehouseId_binCode: { warehouseId: wh1.id, binCode: 'BLR-A-01-B01' } },
    update: {},
    create: {
      warehouseId: wh1.id,
      binCode: 'BLR-A-01-B01',
      zone: 'A',
      rack: '01',
      shelf: 'B01',
    },
  });

  console.log('✅ Warehouse seeded');

  // ─── Products & SKUs ─────────────────────────────────────────────────────
  const prod1 = await prisma.product.upsert({
    where: { id: 'seed-product-1' },
    update: {},
    create: {
      id: 'seed-product-1',
      tenantId: defaultTenantId,
      name: 'Microcontrollers',
      category: 'ICs & Semiconductors',
    },
  });

  const prod2 = await prisma.product.upsert({
    where: { id: 'seed-product-2' },
    update: {},
    create: {
      id: 'seed-product-2',
      tenantId: defaultTenantId,
      name: 'Capacitors',
      category: 'Passive Components',
    },
  });

  const prod3 = await prisma.product.upsert({
    where: { id: 'seed-product-3' },
    update: {},
    create: {
      id: 'seed-product-3',
      tenantId: defaultTenantId,
      name: 'Resistors',
      category: 'Passive Components',
    },
  });

  const sku1 = await prisma.sku.upsert({
    where: { tenantId_skuCode: { tenantId: defaultTenantId, skuCode: 'ATM328P-PU' } },
    update: {},
    create: {
      tenantId: defaultTenantId,
      skuCode: 'ATM328P-PU',
      productId: prod1.id,
      name: 'ATmega328P-PU DIP28',
      category: 'Microcontrollers',
      packageType: 'DIP-28',
      unitPrice: 145.0,
      costPrice: 110.0,
      reorderPoint: 200,
      reorderQty: 1000,
      preferredSupplierId: sup1.id,
    },
  });

  const sku2 = await prisma.sku.upsert({
    where: { tenantId_skuCode: { tenantId: defaultTenantId, skuCode: 'ESP32-WROOM-32' } },
    update: {},
    create: {
      tenantId: defaultTenantId,
      skuCode: 'ESP32-WROOM-32',
      productId: prod1.id,
      name: 'ESP32-WROOM-32 Wi-Fi+BT Module',
      category: 'Microcontrollers',
      packageType: 'SMD Module',
      unitPrice: 280.0,
      costPrice: 210.0,
      reorderPoint: 150,
      reorderQty: 500,
      preferredSupplierId: sup2.id,
    },
  });

  const sku3 = await prisma.sku.upsert({
    where: { tenantId_skuCode: { tenantId: defaultTenantId, skuCode: 'CAP-100UF-25V' } },
    update: {},
    create: {
      tenantId: defaultTenantId,
      skuCode: 'CAP-100UF-25V',
      productId: prod2.id,
      name: '100µF 25V Electrolytic Capacitor',
      category: 'Passive Components',
      packageType: 'Through-Hole',
      unitPrice: 3.5,
      costPrice: 1.8,
      reorderPoint: 5000,
      reorderQty: 20000,
      preferredSupplierId: sup3.id,
    },
  });

  const sku4 = await prisma.sku.upsert({
    where: { tenantId_skuCode: { tenantId: defaultTenantId, skuCode: 'RES-10K-0805' } },
    update: {},
    create: {
      tenantId: defaultTenantId,
      skuCode: 'RES-10K-0805',
      productId: prod3.id,
      name: '10kOhm 0805 SMD Resistor 1%',
      category: 'Passive Components',
      packageType: 'SMD 0805',
      unitPrice: 0.5,
      costPrice: 0.2,
      reorderPoint: 10000,
      reorderQty: 50000,
      preferredSupplierId: sup3.id,
    },
  });

  console.log('✅ SKUs seeded');

  // ─── Stock Items ──────────────────────────────────────────────────────────
  for (const { skuId, qty } of [
    { skuId: sku1.id, qty: 500 },
    { skuId: sku2.id, qty: 300 },
    { skuId: sku3.id, qty: 12000 },
    { skuId: sku4.id, qty: 8000 },  // below reorder point of 10000
  ]) {
    const existing = await prisma.stockItem.findFirst({ where: { skuId, warehouseId: wh1.id } });
    if (!existing) {
      await prisma.stockItem.create({
        data: {
          skuId,
          warehouseId: wh1.id,
          binId: bin1.id,
          quantityOnHand: qty,
          quantityReserved: 0,
          batchNo: `BATCH-2026-001`,
        },
      });
    }
  }

  console.log('✅ Stock items seeded');

  // ─── Sample Leads ─────────────────────────────────────────────────────────
  const leads = [
    {
      leadNumber: 'JNC-LD-00001',
      source: 'indiamart',
      status: 'new',
      customerName: 'Deepak Electronics Pvt Ltd',
      customerPhone: '9876123456',
      customerEmail: 'purchase@deepakelec.com',
      city: 'Chennai',
      productCategory: 'Microcontrollers',
      productName: 'ATmega328P',
      quantity: 500,
      estimatedValue: 72500,
      queryMessage: 'Need 500 pcs ATmega328P-PU, please quote best price',
      assignedToId: emp1.id,
    },
    {
      leadNumber: 'JNC-LD-00002',
      source: 'whatsapp',
      status: 'contacted',
      customerName: 'Srinivas Automation',
      customerPhone: '9866543210',
      city: 'Hyderabad',
      productCategory: 'Passive Components',
      queryMessage: 'Need bulk resistors and capacitors for PCB manufacturing',
      assignedToId: emp2.id,
    },
    {
      leadNumber: 'JNC-LD-00003',
      source: 'web',
      status: 'qualified',
      customerName: 'Raj IoT Solutions',
      customerPhone: '8891234567',
      customerEmail: 'iot@rajsolutions.in',
      city: 'Pune',
      productCategory: 'Microcontrollers',
      productName: 'ESP32',
      quantity: 200,
      estimatedValue: 56000,
      queryMessage: 'Looking for ESP32 modules for a production run of IoT devices',
      assignedToId: emp1.id,
    },
    {
      leadNumber: 'JNC-LD-00004',
      source: 'manual',
      status: 'won',
      customerName: 'Bharat PCB Manufacturing',
      customerPhone: '9812345678',
      customerEmail: 'orders@bharatpcb.com',
      city: 'Mumbai',
      productCategory: 'Passive Components',
      quantity: 50000,
      estimatedValue: 25000,
      assignedToId: emp2.id,
    },
  ];

  for (const leadData of leads) {
    const existing = await prisma.lead.findFirst({
      where: { leadNumber: leadData.leadNumber, tenantId: defaultTenantId },
    });
    if (!existing) {
      await prisma.lead.create({
        data: {
          ...leadData,
          tenantId: defaultTenantId,
        },
      });
    }
  }

  console.log('✅ Sample leads seeded');

  // ─── Canonical Automation Rules (Multi-Step Pipelines) ──────────────────────
  const rules = [
    {
      name: 'New Lead: Round-Robin Task Creation',
      triggerEvent: 'lead_created',
      conditionJson: '{}',
      steps: [
        {
          stepOrder: 1,
          stepType: 'create_in_app_task',
          config: JSON.stringify({
            recipient: 'assigned_employee',
            title: 'Follow up on new lead: {{customerName}}',
            description: 'Contact via phone or official email — do NOT send automated WhatsApp.',
          }),
        },
      ],
      isActive: true,
    },
    {
      name: 'Inbound IndiaMART Lead: Urgent Sales Notification',
      triggerEvent: 'lead_created',
      conditionJson: JSON.stringify([{ field: 'source', operator: 'equals', value: 'indiamart' }]),
      steps: [
        {
          stepOrder: 1,
          stepType: 'send_email',
          config: JSON.stringify({
            recipient: 'assigned_employee',
            subject: '[IndiaMART Lead] {{customerName}} - {{productName}}',
            body: 'New urgent IndiaMART inquiry received from {{customerName}}. Contact immediately.',
          }),
        },
      ],
      isActive: true,
    },
    {
      name: 'Inbound WhatsApp Inquiry: Lead Capture Task',
      triggerEvent: 'lead_created',
      conditionJson: JSON.stringify([{ field: 'source', operator: 'equals', value: 'whatsapp' }]),
      steps: [
        {
          stepOrder: 1,
          stepType: 'create_in_app_task',
          config: JSON.stringify({
            recipient: 'assigned_employee',
            title: 'Inbound WhatsApp Inquiry: {{customerName}}',
            description: 'Customer reached out via WhatsApp. Follow up manually via phone or official email.',
          }),
        },
      ],
      isActive: true,
    },
    {
      name: 'Website High-Value RFQ: Immediate Quotation Alert',
      triggerEvent: 'lead_created',
      conditionJson: JSON.stringify([{ field: 'source', operator: 'equals', value: 'web' }]),
      steps: [
        {
          stepOrder: 1,
          stepType: 'send_email',
          config: JSON.stringify({
            recipient: 'assigned_employee',
            subject: '[Website RFQ] High-priority quotation request from {{customerName}}',
            body: 'Website quotation requested by {{customerName}} for {{productName}}.',
          }),
        },
      ],
      isActive: true,
    },
    {
      name: 'Lead 24h Inactivity SLA: Multi-Step Escalation Pipeline',
      triggerEvent: 'followup_overdue',
      conditionJson: JSON.stringify([{ field: 'inactivePeriodHours', operator: 'equals', value: '24' }]),
      steps: [
        {
          stepOrder: 1,
          stepType: 'create_in_app_task',
          config: JSON.stringify({
            recipient: 'assigned_employee',
            title: '24h SLA Warning: Outreach Required for {{customerName}}',
            description: 'No sales activity recorded on Lead {{leadNumber}} for 24h. Please follow up immediately.',
          }),
        },
        {
          stepOrder: 2,
          stepType: 'wait_then_continue',
          config: JSON.stringify({ duration_hours: 48 }),
        },
        {
          stepOrder: 3,
          stepType: 'reassign_record',
          config: JSON.stringify({ mode: 'round_robin' }),
        },
      ],
      isActive: true,
    },
    {
      name: 'Lead 48h Stalled SLA: Management Escalation',
      triggerEvent: 'followup_overdue',
      conditionJson: JSON.stringify([{ field: 'inactivePeriodHours', operator: 'equals', value: '48' }]),
      steps: [
        {
          stepOrder: 1,
          stepType: 'send_email',
          config: JSON.stringify({
            recipient: 'admin',
            subject: '[SLA Escalation] Lead {{leadNumber}} Stalled for 48 Hours',
            body: 'Lead {{leadNumber}} ({{customerName}}) has received no rep activity in 48 hours.',
          }),
        },
      ],
      isActive: true,
    },
    {
      name: 'Quotation Approved: Order Preparation Task',
      triggerEvent: 'quotation_approved',
      conditionJson: '{}',
      steps: [
        {
          stepOrder: 1,
          stepType: 'create_in_app_task',
          config: JSON.stringify({
            recipient: 'assigned_employee',
            title: 'Quotation {{quotationNumber}} Approved: Generate Proforma Order',
            description: 'Client approved quotation. Prepare sales order and dispatch plan.',
          }),
        },
      ],
      isActive: true,
    },
    {
      name: 'Order Confirmed: Proforma Invoice & Dispatch Prep',
      triggerEvent: 'order_confirmed',
      conditionJson: '{}',
      steps: [
        {
          stepOrder: 1,
          stepType: 'send_email',
          config: JSON.stringify({
            recipient: 'customer',
            subject: 'Order Confirmed: {{orderNumber}} — JNC Network & Power',
            body: 'Thank you for your order {{orderNumber}}. Your proforma invoice is ready and stock is reserved.',
          }),
        },
      ],
      isActive: true,
    },
    {
      name: 'Payment Cleared: Warehouse Packaging Task',
      triggerEvent: 'payment_received',
      conditionJson: '{}',
      steps: [
        {
          stepOrder: 1,
          stepType: 'create_in_app_task',
          config: JSON.stringify({
            recipient: 'assigned_employee',
            title: 'Payment Cleared: Package Order {{orderNumber}} for Dispatch',
            description: 'Customer payment received in full. Initiate warehouse packing and box sealing.',
          }),
        },
      ],
      isActive: true,
    },
    {
      name: 'Order Dispatched: Tracking & Logistics Notification',
      triggerEvent: 'order_dispatched',
      conditionJson: '{}',
      steps: [
        {
          stepOrder: 1,
          stepType: 'send_email',
          config: JSON.stringify({
            recipient: 'customer',
            subject: 'Your JNC Shipment has Departed — Order {{orderNumber}}',
            body: 'Your consignment has been dispatched via {{courierName}}. Tracking: {{trackingNumber}}.',
          }),
        },
      ],
      isActive: true,
    },
    {
      name: 'Order Delivered: Customer Delivery Confirmation',
      triggerEvent: 'order_delivered',
      conditionJson: '{}',
      steps: [
        {
          stepOrder: 1,
          stepType: 'send_sms',
          config: JSON.stringify({
            recipient: 'customer',
            message: 'JNC Network: Order {{orderNumber}} has been delivered. Thank you for choosing JNC!',
          }),
        },
      ],
      isActive: true,
    },
    {
      name: 'Overdue Payment SLA: Automated Statement & Finance Alert',
      triggerEvent: 'payment_overdue',
      conditionJson: '{}',
      steps: [
        {
          stepOrder: 1,
          stepType: 'send_email',
          config: JSON.stringify({
            recipient: 'customer',
            subject: 'Payment Overdue Notice: Invoice {{invoiceNumber}}',
            body: 'Payment for invoice {{invoiceNumber}} (Total: INR {{grandTotal}}) is past due.',
          }),
        },
      ],
      isActive: true,
    },
    {
      name: 'Low Stock Threshold: Nightly Automated Reorder Digest',
      triggerEvent: 'stock_low',
      conditionJson: '{}',
      steps: [
        {
          stepOrder: 1,
          stepType: 'send_email',
          config: JSON.stringify({
            recipient: 'admin',
            subject: '[Low Stock Alert] SKU {{skuCode}} below reorder threshold',
            body: 'Item {{name}} ({{skuCode}}) has reached reorder level {{reorderPoint}}.',
          }),
        },
      ],
      isActive: true,
    },
  ];

  // Clear existing rules and re-seed clean multi-step definitions
  await prisma.automationRule.deleteMany({});
  for (const rule of rules) {
    const { steps: ruleSteps, ...ruleData } = rule;
    const created = await prisma.automationRule.create({
      data: {
        ...ruleData,
        tenantId: defaultTenantId,
        actionType: ruleSteps[0]?.stepType,
        actionPayloadJson: ruleSteps[0]?.config,
        steps: {
          create: ruleSteps,
        },
      },
    });
  }

  console.log(`✅ ${rules.length} Canonical Multi-Step Automation Rules seeded successfully`);
  console.log('\n🎉 Database seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
