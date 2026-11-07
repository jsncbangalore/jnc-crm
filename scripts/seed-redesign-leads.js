const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const adminUser = await prisma.user.findFirst({ where: { email: 'admin@example.com' } });
  if (!adminUser) throw new Error('No admin user found');
  const tenantId = adminUser.tenantId;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

  const users = await prisma.user.findMany({ where: { tenantId } });
  const salesUser = users.find((u) => u.role === 'employee' || u.role === 'sub_admin') || adminUser;

  console.log(`Seeding leads for tenant ${tenant.name} (${tenantId})...`);

  // Clean old test leads created for this redesign
  await prisma.lead.deleteMany({
    where: {
      tenantId,
      customerName: { startsWith: '[Demo] ' },
    },
  });

  const now = new Date();
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
  const overdueFollowUp = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const todayFollowUp = new Date();
  todayFollowUp.setHours(15, 30, 0, 0);
  const tomorrowFollowUp = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const demoLeads = [
    {
      customerName: '[Demo] Aarav Sharma',
      companyName: 'Apex Solar Technologies',
      customerPhone: '+91 98765 43210',
      customerEmail: 'aarav@apexsolar.dev.local',
      city: 'Bengaluru',
      state: 'Karnataka',
      productCategory: 'Solar Inverters',
      productName: 'Hybrid 5kVA Solar Inverter',
      quantity: 2,
      unit: 'Units',
      estimatedValue: 185000,
      urgency: 'urgent',
      status: 'new',
      source: 'indiamart',
      nextFollowUpAt: overdueFollowUp, // Overdue follow-up requirement
      lastActivityAt: yesterday,
      ownerDisplayName: salesUser.name || 'Sales Rep',
      assignedToId: salesUser.id,
      leadNumber: 'LD/26-27/0001',
    },
    {
      customerName: '[Demo] Priya Nair',
      companyName: 'Greenfield Eco Solutions',
      customerPhone: '', // Missing phone requirement!
      customerEmail: 'priya@greenfield.dev.local',
      city: 'Kochi',
      state: 'Kerala',
      productCategory: 'Solar Panels',
      productName: 'Monocrystalline 540W Tier-1 Panels',
      quantity: 50,
      unit: 'Pieces',
      estimatedValue: 620000,
      urgency: 'high',
      status: 'new',
      source: 'web',
      nextFollowUpAt: todayFollowUp, // Today follow-up
      lastActivityAt: now,
      ownerDisplayName: adminUser.name || 'Admin',
      assignedToId: adminUser.id,
      leadNumber: 'LD/26-27/0002',
    },
    {
      customerName: '[Demo] Rohan Verma',
      companyName: 'Horizon Electric Works',
      customerPhone: '+91 98234 56789',
      customerEmail: 'rohan@horizonelec.dev.local',
      city: 'Pune',
      state: 'Maharashtra',
      productCategory: 'Industrial Transformers',
      productName: 'Step-Down Distribution Transformer 250kVA',
      quantity: 1,
      unit: 'Unit',
      estimatedValue: 450000,
      urgency: 'standard',
      status: 'contacted',
      source: 'whatsapp',
      nextFollowUpAt: tomorrowFollowUp,
      lastActivityAt: twoDaysAgo,
      ownerDisplayName: salesUser.name || 'Sales Rep',
      assignedToId: salesUser.id,
      leadNumber: 'LD/26-27/0003',
    },
    {
      customerName: '[Demo] Vikram Patel',
      companyName: 'Nova Power Systems',
      customerPhone: '+91 97123 45678',
      customerEmail: 'vikram@novapower.dev.local',
      city: 'Ahmedabad',
      state: 'Gujarat',
      productCategory: 'Battery Energy Storage',
      productName: 'Lithium Ferro Phosphate 48V 200Ah Rack',
      quantity: 4,
      unit: 'Units',
      estimatedValue: 320000,
      urgency: 'urgent',
      status: 'qualified',
      source: 'facebook_lead_ads',
      nextFollowUpAt: todayFollowUp,
      lastActivityAt: yesterday,
      ownerDisplayName: salesUser.name || 'Sales Rep',
      assignedToId: salesUser.id,
      leadNumber: 'LD/26-27/0004',
    },
    {
      customerName: '[Demo] Kavita Deshmukh',
      companyName: 'Surya Renewable EPC',
      customerPhone: '+91 96543 21098',
      customerEmail: 'kavita@suryarenew.dev.local',
      city: 'Nagpur',
      state: 'Maharashtra',
      productCategory: 'Solar Inverters',
      productName: 'Grid-Tied 50kW String Inverter',
      quantity: 1,
      unit: 'Unit',
      estimatedValue: 275000,
      urgency: 'standard',
      status: 'quoted',
      source: 'instagram_lead_ads',
      nextFollowUpAt: tomorrowFollowUp,
      lastActivityAt: yesterday,
      ownerDisplayName: adminUser.name || 'Admin',
      assignedToId: adminUser.id,
      leadNumber: 'LD/26-27/0005',
    },
    {
      customerName: '[Demo] Manoj Iyer',
      companyName: 'Southern Precision Grid',
      customerPhone: '+91 94455 66778',
      customerEmail: 'manoj@southprecision.dev.local',
      city: 'Chennai',
      state: 'Tamil Nadu',
      productCategory: 'HT Switchgear',
      productName: 'Vacuum Circuit Breaker 11kV 630A',
      quantity: 2,
      unit: 'Units',
      estimatedValue: 580000,
      urgency: 'standard',
      status: 'won',
      source: 'manual',
      nextFollowUpAt: null,
      lastActivityAt: twoDaysAgo,
      ownerDisplayName: salesUser.name || 'Sales Rep',
      assignedToId: salesUser.id,
      leadNumber: 'LD/26-27/0006',
    },
    {
      customerName: '[Demo] Sneha Sen',
      companyName: 'Eastern Infrastructure Corp',
      customerPhone: '+91 93311 22334',
      customerEmail: 'sneha@easterninfra.dev.local',
      city: 'Kolkata',
      state: 'West Bengal',
      productCategory: 'Cables & Conductors',
      productName: 'Armoured XLPE Aluminium 3.5C 185 sqmm',
      quantity: 500,
      unit: 'Meters',
      estimatedValue: 290000,
      urgency: 'standard',
      status: 'lost',
      lostReason: 'Price too high', // Lost reason requirement!
      source: 'web',
      nextFollowUpAt: null,
      lastActivityAt: twoDaysAgo,
      ownerDisplayName: salesUser.name || 'Sales Rep',
      assignedToId: salesUser.id,
      leadNumber: 'LD/26-27/0007',
    },
  ];

  for (const item of demoLeads) {
    let company = await prisma.company.findFirst({
      where: { tenantId, name: item.companyName },
    });
    if (!company) {
      company = await prisma.company.create({
        data: {
          tenantId,
          name: item.companyName,
          city: item.city,
        },
      });
    }

    const created = await prisma.lead.create({
      data: {
        tenantId,
        leadNumber: item.leadNumber,
        customerName: item.customerName,
        customerPhone: item.customerPhone,
        customerEmail: item.customerEmail,
        city: item.city,
        state: item.state,
        companyId: company.id,
        productCategory: item.productCategory,
        productName: item.productName,
        quantity: item.quantity,
        unit: item.unit,
        estimatedValue: item.estimatedValue,
        urgency: item.urgency,
        status: item.status,
        source: item.source,
        lostReason: item.lostReason || null,
        nextFollowUpAt: item.nextFollowUpAt,
        lastActivityAt: item.lastActivityAt,
        ownerDisplayName: item.ownerDisplayName,
        assignedToId: item.assignedToId,
        createdById: adminUser.id,
      },
    });

    if (item.status === 'quoted' || item.status === 'won') {
      await prisma.quotation.create({
        data: {
          tenantId,
          quoteNumber: `QTN/26-27/009${created.leadNumber.slice(-1)}`,
          leadId: created.id,
          customerName: item.customerName,
          customerPhone: item.customerPhone,
          customerEmail: item.customerEmail,
          status: item.status === 'won' ? 'converted' : 'sent',
          subtotal: item.estimatedValue,
          taxAmount: item.estimatedValue * 0.18,
          totalAmount: item.estimatedValue * 1.18,
          validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      });
    }
  }

  console.log(`Successfully seeded ${demoLeads.length} demo leads with full attributes!`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
