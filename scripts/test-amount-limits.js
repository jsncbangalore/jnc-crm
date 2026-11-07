const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken');

const API_BASE = process.env.TEST_API_URL || 'http://localhost:3333/api/v1';

async function run() {
  console.log('=== TEST: AMOUNT LIMITS INVARIANT (ITEM 8) ===');

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

  const createdInvoiceIds = [];
  const createdQuoteIds = [];

  try {
    // 1. Invoices: Document total > 10 Crore (e.g. 15 Crore) -> MUST BE REJECTED
    console.log('1. Testing Invoice total > 10 Crore rejection (15 Crore)...');
    const over10CrRes = await fetch(`${API_BASE}/invoices/create-direct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        docType: 'delivery_challan',
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone || '9876543210',
        customerState: customer.state || 'Karnataka',
        lines: [
          {
            description: 'Mega Industrial Turbine',
            quantity: 1,
            unitPrice: 150000000, // 15 Crore
            taxRate: 0,
          },
        ],
      }),
    });

    const over10CrBody = await over10CrRes.json();
    if (over10CrRes.status !== 400) {
      throw new Error(`Expected 400 for invoice > 10 Crore, got ${over10CrRes.status}: ${JSON.stringify(over10CrBody)}`);
    }
    console.log('✓ Successfully rejected invoice exceeding 10 Crore ceiling (HTTP 400):', over10CrBody.message);

    // 2. Invoices: Document total > 1 Crore (e.g. 2 Crore) WITHOUT confirmedHighAmount -> MUST REQUEST CONFIRMATION
    console.log('2. Testing Invoice total > 1 Crore without confirmedHighAmount (2 Crore)...');
    const unconfirmedHighRes = await fetch(`${API_BASE}/invoices/create-direct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        docType: 'delivery_challan',
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone || '9876543210',
        customerState: customer.state || 'Karnataka',
        lines: [
          {
            description: 'Substation Transformer',
            quantity: 2,
            unitPrice: 10000000, // 2 Crore total
            taxRate: 0,
          },
        ],
      }),
    });

    const unconfirmedBody = await unconfirmedHighRes.json();
    if (unconfirmedHighRes.status !== 400) {
      throw new Error(`Expected 400 requiring confirmation for > 1 Crore, got ${unconfirmedHighRes.status}: ${JSON.stringify(unconfirmedBody)}`);
    }
    if (!unconfirmedBody.message?.includes('confirmedHighAmount')) {
      throw new Error(`Expected message to require confirmedHighAmount, got: ${unconfirmedBody.message}`);
    }
    console.log('✓ Successfully blocked unconfirmed high amount invoice:', unconfirmedBody.message);

    // 3. Invoices: Document total > 1 Crore WITH confirmedHighAmount: true -> MUST SUCCEED
    console.log('3. Testing Invoice total > 1 Crore with confirmedHighAmount: true...');
    const confirmedHighRes = await fetch(`${API_BASE}/invoices/create-direct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        docType: 'delivery_challan',
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone || '9876543210',
        customerState: customer.state || 'Karnataka',
        confirmedHighAmount: true,
        lines: [
          {
            description: 'Substation Transformer High Value',
            quantity: 2,
            unitPrice: 10000000, // 2 Crore total
            taxRate: 0,
          },
        ],
      }),
    });

    const confirmedBody = await confirmedHighRes.json();
    if (confirmedHighRes.status !== 200 && confirmedHighRes.status !== 201) {
      throw new Error(`Expected 200/201 for confirmed invoice, got ${confirmedHighRes.status}: ${JSON.stringify(confirmedBody)}`);
    }
    createdInvoiceIds.push(confirmedBody.id);
    console.log(`✓ Successfully issued confirmed high amount invoice #${confirmedBody.invoiceNumber} for ₹${confirmedBody.totalAmount}`);

    // 4. Quotations: Quotation total > 10 Crore -> MUST BE REJECTED
    console.log('4. Testing Quotation total > 10 Crore rejection (12 Crore)...');
    const over10CrQuoteRes = await fetch(`${API_BASE}/quotations`, {
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
            name: 'Turnkey Refinery Line',
            quantity: 1,
            unitPrice: 120000000, // 12 Crore
            gstRate: 0,
          },
        ],
      }),
    });

    const over10CrQuoteBody = await over10CrQuoteRes.json();
    if (over10CrQuoteRes.status !== 400) {
      throw new Error(`Expected 400 for quotation > 10 Crore, got ${over10CrQuoteRes.status}: ${JSON.stringify(over10CrQuoteBody)}`);
    }
    console.log('✓ Successfully rejected quotation exceeding 10 Crore ceiling (HTTP 400):', over10CrQuoteBody.message);

    // 5. Quotations: Quotation > 1 Crore without confirmedHighAmount -> MUST REQUEST CONFIRMATION
    console.log('5. Testing Quotation total > 1 Crore without confirmedHighAmount (1.5 Crore)...');
    const unconfirmedQuoteRes = await fetch(`${API_BASE}/quotations`, {
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
            name: 'Industrial Generator System',
            quantity: 1,
            unitPrice: 15000000, // 1.5 Crore
            gstRate: 0,
          },
        ],
      }),
    });

    const unconfirmedQuoteBody = await unconfirmedQuoteRes.json();
    if (unconfirmedQuoteRes.status !== 400) {
      throw new Error(`Expected 400 requiring confirmation for quote > 1 Crore, got ${unconfirmedQuoteRes.status}: ${JSON.stringify(unconfirmedQuoteBody)}`);
    }
    console.log('✓ Successfully blocked unconfirmed high amount quotation:', unconfirmedQuoteBody.message);

    // 6. Quotations: Quotation > 1 Crore with confirmedHighAmount: true -> MUST SUCCEED
    console.log('6. Testing Quotation total > 1 Crore with confirmedHighAmount: true...');
    const confirmedQuoteRes = await fetch(`${API_BASE}/quotations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        customerName: customer.name,
        customerPhone: customer.phone || '9876543210',
        customerId: customer.id,
        confirmedHighAmount: true,
        lines: [
          {
            name: 'Industrial Generator System Confirmed',
            quantity: 1,
            unitPrice: 15000000, // 1.5 Crore
            gstRate: 0,
          },
        ],
      }),
    });

    const confirmedQuoteBody = await confirmedQuoteRes.json();
    if (confirmedQuoteRes.status !== 200 && confirmedQuoteRes.status !== 201) {
      throw new Error(`Expected 200/201 for confirmed quotation, got ${confirmedQuoteRes.status}: ${JSON.stringify(confirmedQuoteBody)}`);
    }
    createdQuoteIds.push(confirmedQuoteBody.id);
    console.log(`✓ Successfully created confirmed high amount quotation #${confirmedQuoteBody.quoteNumber} for ₹${confirmedQuoteBody.totalAmount}`);

    console.log('\n=== AMOUNT LIMITS TEST PASSED (100%) ===\n');
  } finally {
    // Cleanup
    if (createdInvoiceIds.length > 0) {
      console.log('Cleaning up test invoices...');
      await prisma.invoiceLine.deleteMany({ where: { invoiceId: { in: createdInvoiceIds } } });
      await prisma.invoice.deleteMany({ where: { id: { in: createdInvoiceIds } } });
    }
    if (createdQuoteIds.length > 0) {
      console.log('Cleaning up test quotations...');
      await prisma.quotationLine.deleteMany({ where: { quotationId: { in: createdQuoteIds } } });
      await prisma.statusHistory.deleteMany({ where: { entityType: 'Quotation', entityId: { in: createdQuoteIds } } });
      await prisma.quotation.deleteMany({ where: { id: { in: createdQuoteIds } } });
    }
    console.log('Cleanup complete.');
    await prisma.$disconnect();
  }
}

run().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});
