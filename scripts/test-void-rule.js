const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken');

const API_BASE = process.env.TEST_API_URL || 'http://localhost:3333/api/v1';

async function run() {
  console.log('=== TEST: VOID RULE INVARIANT (ITEM 6) ===');

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

  let createdInvId = null;
  let createdPaymentId = null;

  const customer = await prisma.company.findFirst({
    where: { tenantId, deletedAt: null },
  });
  if (!customer) throw new Error('No registered customer found');

  try {
    console.log(`1. Creating a temporary test invoice for customer ${customer.name}...`);
    const invRes = await fetch(`${API_BASE}/invoices/create-direct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        docType: 'tax_invoice',
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone || '+91 98765 43210',
        customerState: customer.state || 'Karnataka',
        lines: [
          {
            description: 'Void Rule Test Unit',
            quantity: 1,
            unitPrice: 10000,
            taxRate: 18,
          },
        ],
      }),
    });

    if (!invRes.ok) {
      const err = await invRes.json();
      throw new Error(`Failed to create test invoice: ${JSON.stringify(err)}`);
    }

    const invData = await invRes.json();
    createdInvId = invData.id;
    console.log(`Created invoice ${invData.invoiceNumber} (ID: ${createdInvId}, Total: ₹${invData.totalAmount})`);

    console.log('2. Recording payment allocation of ₹5,000 (partial payment)...');
    const payRes = await fetch(`${API_BASE}/invoices/${createdInvId}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        amount: 5000,
        paymentMethod: 'bank_transfer',
        transactionRef: 'UTRSYNTH998822',
      }),
    });

    if (!payRes.ok) {
      const err = await payRes.json();
      throw new Error(`Failed to record payment: ${JSON.stringify(err)}`);
    }
    const payData = await payRes.json();
    createdPaymentId = payData.id;
    console.log(`Payment recorded successfully (ID: ${createdPaymentId}). Invoice is now partially paid.`);

    console.log('3. Attempting to void invoice WITHOUT reversePayments flag...');
    const voidBlockedRes = await fetch(`${API_BASE}/invoices/${createdInvId}/void`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        reason: 'Attempting void on paid invoice',
        reversePayments: false,
      }),
    });

    const blockedJson = await voidBlockedRes.json();
    console.log(`Response status: ${voidBlockedRes.status}`);
    console.log(`Response body: ${JSON.stringify(blockedJson)}`);

    if (voidBlockedRes.status !== 400) {
      throw new Error(`Expected HTTP 400 Bad Request, but got ${voidBlockedRes.status}`);
    }
    if (!blockedJson.message?.includes('Reverse the payments first')) {
      throw new Error(`Expected message to contain 'Reverse the payments first', got: ${blockedJson.message}`);
    }
    console.log('✓ Invariant 1 Verified: Voiding blocked with "Reverse the payments first".');

    console.log('4. Now voiding invoice WITH reversePayments: true...');
    const voidSuccessRes = await fetch(`${API_BASE}/invoices/${createdInvId}/void`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        reason: 'Authorized cancellation with payment reversal',
        reversePayments: true,
      }),
    });

    if (!voidSuccessRes.ok) {
      const err = await voidSuccessRes.json();
      throw new Error(`Failed to void with reversePayments: ${JSON.stringify(err)}`);
    }

    const voidSuccessData = await voidSuccessRes.json();
    console.log(`Void result: isVoided = ${voidSuccessData.isVoided}, paymentStatus = ${voidSuccessData.paymentStatus}`);

    if (!voidSuccessData.isVoided) {
      throw new Error('Expected isVoided to be true');
    }
    if (voidSuccessData.paymentStatus !== 'void') {
      throw new Error(`Expected paymentStatus to be 'void', got: ${voidSuccessData.paymentStatus}`);
    }
    console.log('✓ Invariant 2 Verified: Invoice successfully voided in single transaction, paymentStatus is strictly "void" and never "partial".');

    console.log('\n=== ALL VOID RULE TESTS (ITEM 6) PASSED! ===');
  } finally {
    console.log('Cleaning up temporary test records...');
    if (createdInvId) {
      await prisma.paymentAllocation.deleteMany({ where: { invoiceId: createdInvId } });
      await prisma.invoiceLine.deleteMany({ where: { invoiceId: createdInvId } });
      await prisma.invoice.deleteMany({ where: { id: createdInvId } });
    }
    if (createdPaymentId) {
      await prisma.paymentRecord.deleteMany({ where: { id: createdPaymentId } });
    }
    await prisma.$disconnect();
    console.log('Cleanup complete.');
  }
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
