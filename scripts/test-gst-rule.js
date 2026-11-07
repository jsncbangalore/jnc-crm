const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken');

const API_BASE = process.env.TEST_API_URL || 'http://localhost:3333/api/v1';

async function run() {
  console.log('=== TEST: GST RULE ENFORCEMENT (ITEM 7) ===');

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

  try {
    // 1. Attempt to create Tax Invoice with 0% GST without exemption -> MUST FAIL with 400
    console.log('1. Testing rejection: Creating Tax Invoice with taxRate: 0 and no exemption...');
    const failRes = await fetch(`${API_BASE}/invoices/create-direct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        docType: 'tax_invoice',
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone || '9876543210',
        customerState: customer.state || 'Karnataka',
        lines: [
          {
            description: 'Item Without GST Rate',
            quantity: 1,
            unitPrice: 5000,
            taxRate: 0,
          },
        ],
      }),
    });

    const failBody = await failRes.json();
    if (failRes.status !== 400) {
      throw new Error(`Expected 400 Bad Request, but got ${failRes.status}: ${JSON.stringify(failBody)}`);
    }
    console.log('✓ Successfully blocked 0% GST line without exemption (HTTP 400):', JSON.stringify(failBody.fieldErrors || failBody.message));

    // 2. Create Tax Invoice with 0% GST and explicit isExempt: true -> MUST SUCCEED and annotate description
    console.log('2. Testing acceptance: Creating Tax Invoice with taxRate: 0 and isExempt: true...');
    const passRes = await fetch(`${API_BASE}/invoices/create-direct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        docType: 'tax_invoice',
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone || '9876543210',
        customerState: customer.state || 'Karnataka',
        lines: [
          {
            description: 'Organic Fertilizer Compound',
            quantity: 2,
            unitPrice: 2500,
            taxRate: 0,
            isExempt: true,
          },
        ],
      }),
    });

    const passBody = await passRes.json();
    if (passRes.status !== 200 && passRes.status !== 201) {
      throw new Error(`Expected 200/201, but got ${passRes.status}: ${JSON.stringify(passBody)}`);
    }

    createdInvoiceIds.push(passBody.id);
    console.log(`✓ Successfully created exempt Tax Invoice #${passBody.invoiceNumber}`);

    // Verify printed description includes "(Exempt / Nil rated)"
    const invoiceInDb = await prisma.invoice.findUnique({
      where: { id: passBody.id },
      include: { lines: true },
    });

    const exemptLine = invoiceInDb.lines[0];
    console.log(`  Line description: "${exemptLine.description}"`);
    if (!exemptLine.description.includes('(Exempt / Nil rated)')) {
      throw new Error(`Expected line description to include "(Exempt / Nil rated)", found: "${exemptLine.description}"`);
    }
    console.log('✓ Verified line description contains "(Exempt / Nil rated)" for invoice printing');

    // 3. Create Delivery Challan with 0% taxRate -> MUST SUCCEED (challans don't require GST rate)
    console.log('3. Testing Delivery Challan with 0% taxRate...');
    const dcRes = await fetch(`${API_BASE}/invoices/create-direct`, {
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
            description: 'Material Transfer on Approval',
            quantity: 1,
            unitPrice: 1000,
            taxRate: 0,
          },
        ],
      }),
    });

    const dcBody = await dcRes.json();
    if (dcRes.status !== 200 && dcRes.status !== 201) {
      throw new Error(`Expected 200/201 for Delivery Challan, got ${dcRes.status}: ${JSON.stringify(dcBody)}`);
    }
    createdInvoiceIds.push(dcBody.id);
    console.log(`✓ Successfully created Delivery Challan #${dcBody.invoiceNumber}`);

    console.log('\n=== GST RULE TEST PASSED (100%) ===\n');
  } finally {
    // Cleanup
    if (createdInvoiceIds.length > 0) {
      console.log('Cleaning up test documents...');
      await prisma.invoiceLine.deleteMany({ where: { invoiceId: { in: createdInvoiceIds } } });
      await prisma.invoice.deleteMany({ where: { id: { in: createdInvoiceIds } } });
      console.log('Cleanup complete.');
    }
    await prisma.$disconnect();
  }
}

run().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});
