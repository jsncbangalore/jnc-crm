const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken');

const API_BASE = process.env.TEST_API_URL || 'http://localhost:3333/api/v1';

async function run() {
  console.log('=== TEST: QUOTATION DATA INTEGRITY (ITEM 9) ===');

  const admin = await prisma.user.findFirst({
    where: { role: 'tenant_admin', isActive: true },
  });
  if (!admin) throw new Error('No tenant_admin found');

  const tenantId = admin.tenantId;

  const token = jwt.sign(
    {
      sub: admin.id,
      tenantId,
      org_id: tenantId,
      email: admin.email,
      role: admin.role,
      employee_code: admin.employeeCode,
    },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '1h', issuer: 'crm-api', audience: 'crm-client' }
  );

  const customer = await prisma.company.findFirst({
    where: { tenantId, deletedAt: null },
  });
  if (!customer) throw new Error('No registered customer found');

  const createdQuoteIds = [];

  try {
    // 1. Attempt to create quotation with 0 lines -> MUST FAIL (HTTP 400)
    console.log('1. Testing rejection: Creating quotation with empty lines array...');
    const emptyLinesRes = await fetch(`${API_BASE}/quotations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        customerName: customer.name,
        customerPhone: customer.phone || '9876543210',
        customerId: customer.id,
        lines: [],
      }),
    });

    const emptyLinesBody = await emptyLinesRes.json();
    if (emptyLinesRes.status !== 400) {
      throw new Error(`Expected 400 Bad Request for empty lines, got ${emptyLinesRes.status}: ${JSON.stringify(emptyLinesBody)}`);
    }
    console.log('✓ Successfully blocked quotation creation with 0 item lines (HTTP 400):', emptyLinesBody.message);

    // 2. Create valid quotation and verify createdBy attribution
    console.log('2. Creating valid quotation and verifying creator attribution...');
    const validRes = await fetch(`${API_BASE}/quotations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        customerName: customer.name,
        customerPhone: customer.phone || '9876543210',
        customerId: customer.id,
        lines: [
          {
            name: 'Audio Interface Unit',
            quantity: 2,
            unitPrice: 15000,
            gstRate: 18,
          },
        ],
      }),
    });

    const validBody = await validRes.json();
    if (validRes.status !== 200 && validRes.status !== 201) {
      throw new Error(`Expected 200/201, got ${validRes.status}: ${JSON.stringify(validBody)}`);
    }
    createdQuoteIds.push(validBody.id);
    console.log(`✓ Created quotation #${validBody.quoteNumber}`);

    if (validBody.createdById !== admin.id) {
      throw new Error(`Expected createdById to be ${admin.id}, got: ${validBody.createdById}`);
    }
    if (!validBody.createdBy || !validBody.createdBy.name) {
      throw new Error(`Expected createdBy relation with name, got: ${JSON.stringify(validBody.createdBy)}`);
    }
    console.log(`✓ Verified creator attribution: ${validBody.createdBy.name} (${validBody.createdBy.employeeCode || validBody.createdById})`);

    // 3. Test sending or approving a quotation that has 0 lines
    console.log('3. Testing status update restriction: Quotation with 0 lines cannot be sent or approved...');
    // Create a temporary quotation with 0 lines directly in DB to simulate legacy/imported state
    const orphanQuote = await prisma.quotation.create({
      data: {
        tenantId,
        quoteNumber: 'QTN-TEST-ZERO-01',
        customerName: 'Zero Line Test Client',
        customerPhone: '9876543210',
        status: 'draft',
        totalAmount: 50000,
        subtotal: 50000,
        taxAmount: 0,
        validUntil: new Date(),
      },
    });
    createdQuoteIds.push(orphanQuote.id);

    const sendRes = await fetch(`${API_BASE}/quotations/${orphanQuote.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        status: 'sent',
      }),
    });

    const sendBody = await sendRes.json();
    if (sendRes.status !== 400) {
      throw new Error(`Expected 400 Bad Request when sending 0-line quotation, got ${sendRes.status}: ${JSON.stringify(sendBody)}`);
    }
    if (!sendBody.message?.includes('zero item lines')) {
      throw new Error(`Expected error message to mention zero item lines, got: ${sendBody.message}`);
    }
    console.log('✓ Successfully blocked sending quotation with zero lines (HTTP 400):', sendBody.message);

    console.log('\n=== QUOTATION DATA INTEGRITY TEST PASSED (100%) ===\n');
  } finally {
    if (createdQuoteIds.length > 0) {
      console.log('Cleaning up test quotations...');
      await prisma.quotationLine.deleteMany({ where: { quotationId: { in: createdQuoteIds } } });
      await prisma.statusHistory.deleteMany({ where: { entityType: 'Quotation', entityId: { in: createdQuoteIds } } });
      await prisma.quotation.deleteMany({ where: { id: { in: createdQuoteIds } } });
      console.log('Cleanup complete.');
    }
    await prisma.$disconnect();
  }
}

run().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});
