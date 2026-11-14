/**
 * Automated test for Topic 5:
 * Customer Required on Quotations
 *
 * 1. Select existing customer or 'Create customer' with explicit confirmation (name, mobile, optional GSTIN) creating record in same transaction.
 * 2. Store customerId on quotation; prevent free-typed non-existent parties.
 * 3. Reject placeholder blacklisted names.
 * 4. Conversion to order carries customerId forward.
 */

import * as fs from 'fs';
import * as path from 'path';

// Load env
if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(process.cwd(), 'apps/api/.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        process.env[key] = value;
      }
    }
  }
}

import { PrismaClient } from '@prisma/client';
import jsonwebtoken from 'jsonwebtoken';

const jwt: any = (jsonwebtoken as any).default || jsonwebtoken;

const prisma = new PrismaClient();
const API_BASE = 'http://localhost:3333/api/v1';

async function main() {
  console.log('========================================================================');
  console.log('  TOPIC 5: CUSTOMER REQUIRED ON QUOTATIONS API TEST SUITE');
  console.log('========================================================================\n');

  const adminUser = await prisma.user.findFirst({
    where: { role: 'tenant_admin', isActive: true },
    select: { id: true, email: true, tenantId: true, role: true, employeeCode: true },
  });

  if (!adminUser || !adminUser.tenantId) {
    throw new Error('No tenant_admin user found with tenantId');
  }

  const jwtSecret = process.env.JWT_SECRET || 'dev-secret';
  const token = jwt.sign(
    {
      sub: adminUser.id,
      tenantId: adminUser.tenantId,
      org_id: adminUser.tenantId,
      email: adminUser.email,
      role: adminUser.role,
      employee_code: adminUser.employeeCode,
    },
    jwtSecret,
    {
      expiresIn: '1h',
      issuer: 'crm-api',
      audience: 'crm-client',
    }
  );

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string, details?: any) {
    if (condition) {
      passed++;
      console.log(`[PASS] ${desc}`);
    } else {
      failed++;
      console.error(`[FAIL] ${desc}`, details || '');
    }
  }

  // Ensure a test SKU exists
  let testSku = await prisma.sku.findFirst({
    where: { tenantId: adminUser.tenantId },
  });
  if (!testSku) {
    testSku = await prisma.sku.create({
      data: {
        tenantId: adminUser.tenantId,
        skuCode: 'TEST-SKU-Q5',
        name: 'Quotation Test Product',
        category: 'General',
        costPrice: 1000,
        unitPrice: 1500,
        taxRate: 18.0,
      },
    });
  }

  const createdCompanyIds: string[] = [];
  const createdQuotationIds: string[] = [];
  const createdOrderIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Reject placeholder customer name
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Testing rejection of placeholder names on quotations ---');
    const resPlaceholder = await fetch(`${API_BASE}/quotations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerName: 'Valued Client',
        customerPhone: '9876543210',
        lines: [{ skuId: testSku.id, name: testSku.name, quantity: 1, unitPrice: 1500 }],
      }),
    });
    const dataPlaceholder: any = await resPlaceholder.json();
    assert(
      resPlaceholder.status === 400,
      'Quotation with placeholder name "Valued Client" is rejected with HTTP 400',
      dataPlaceholder
    );
    assert(
      JSON.stringify(dataPlaceholder).toLowerCase().includes('valued client'),
      'Error message clearly cites disallowed placeholder customer name'
    );

    // -------------------------------------------------------------------------
    // TEST 2: Reject free-typed non-existent customer name without confirmation
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Testing rejection of non-existent customer name without confirmation ---');
    const nonExistentName = `Unregistered Test Party ${Date.now()}`;
    const resNoConfirm = await fetch(`${API_BASE}/quotations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerName: nonExistentName,
        customerPhone: '9876543210',
        lines: [{ skuId: testSku.id, name: testSku.name, quantity: 1, unitPrice: 1500 }],
      }),
    });
    const dataNoConfirm: any = await resNoConfirm.json();
    assert(
      resNoConfirm.status === 400,
      'Quotation with non-existent customer without confirmCreateCustomer is rejected with HTTP 400',
      dataNoConfirm
    );
    assert(
      typeof dataNoConfirm.message === 'string' &&
        dataNoConfirm.message.includes('registered customer account is required'),
      'Error explains registered customer account is required on quotations'
    );

    // -------------------------------------------------------------------------
    // TEST 3: Create quotation with explicit confirmCreateCustomer: true
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Testing inline customer creation with confirmCreateCustomer: true ---');
    const newCustomerName = `AutoCreated Corp ${Date.now()}`;
    const newCustomerPhone = '9876543211';
    const resWithConfirm = await fetch(`${API_BASE}/quotations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerName: newCustomerName,
        customerPhone: newCustomerPhone,
        customerEmail: 'autocreated@example.com',
        customerGstin: '29AAAAA0000A1ZY',
        confirmCreateCustomer: true,
        lines: [{ skuId: testSku.id, name: testSku.name, quantity: 2, unitPrice: 1500 }],
      }),
    });
    const dataWithConfirm: any = await resWithConfirm.json();
    assert(
      resWithConfirm.status === 201,
      'Quotation creation succeeds with confirmCreateCustomer: true',
      dataWithConfirm
    );
    assert(
      Boolean(dataWithConfirm.customerId),
      `Quotation has customerId persisted: ${dataWithConfirm.customerId}`
    );

    if (dataWithConfirm.id) createdQuotationIds.push(dataWithConfirm.id);
    if (dataWithConfirm.customerId) {
      createdCompanyIds.push(dataWithConfirm.customerId);

      // Verify the company and primary contact were created in the database
      const createdCo = await prisma.company.findUnique({
        where: { id: dataWithConfirm.customerId },
        include: { contacts: true },
      });
      assert(
        createdCo !== null && createdCo.name === newCustomerName,
        'Customer Company record was created in the database in the same transaction'
      );
      assert(
        Boolean(createdCo?.contacts.some((c) => c.phone === newCustomerPhone)),
        'Customer Primary Contact record was created in the database in the same transaction'
      );
    }

    // -------------------------------------------------------------------------
    // TEST 4: Create quotation selecting existing customer by customerId
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Testing quotation creation with existing customerId ---');
    const existingCompany = await prisma.company.create({
      data: {
        tenantId: adminUser.tenantId,
        name: `Pre-existing Client ${Date.now()}`,
        billingEmail: 'preexisting@example.com',
        createdById: adminUser.id,
      },
    });
    createdCompanyIds.push(existingCompany.id);

    const resWithCustomerId = await fetch(`${API_BASE}/quotations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerId: existingCompany.id,
        customerName: existingCompany.name,
        customerPhone: '9876543212',
        lines: [{ skuId: testSku.id, name: testSku.name, quantity: 3, unitPrice: 1500 }],
      }),
    });
    const dataWithCustomerId: any = await resWithCustomerId.json();
    assert(
      resWithCustomerId.status === 201,
      'Quotation creation with explicit customerId succeeds',
      dataWithCustomerId
    );
    assert(
      dataWithCustomerId.customerId === existingCompany.id,
      'Quotation customerId matches selected customer company ID'
    );
    if (dataWithCustomerId.id) createdQuotationIds.push(dataWithCustomerId.id);

    // -------------------------------------------------------------------------
    // TEST 5: Create quotation matching existing customer by name
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Testing quotation creation matching existing customer by name ---');
    const resByName = await fetch(`${API_BASE}/quotations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerName: existingCompany.name,
        customerPhone: '9876543213',
        lines: [{ skuId: testSku.id, name: testSku.name, quantity: 1, unitPrice: 1500 }],
      }),
    });
    const dataByName: any = await resByName.json();
    assert(
      resByName.status === 201,
      'Quotation creation succeeds when customer name matches existing company in master',
      dataByName
    );
    assert(
      dataByName.customerId === existingCompany.id,
      'Quotation customerId is automatically linked to matching existing company'
    );
    if (dataByName.id) createdQuotationIds.push(dataByName.id);

    // -------------------------------------------------------------------------
    // TEST 6: Quotation conversion to order preserves customerId
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Testing quotation conversion to order carries customerId ---');
    const resConvert = await fetch(`${API_BASE}/quotations/${dataWithCustomerId.id}/convert-to-order`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });
    const dataConvert: any = await resConvert.json();
    assert(
      resConvert.status === 201,
      'Quotation successfully converts to order',
      dataConvert
    );
    assert(
      dataConvert.customerId === existingCompany.id,
      `Converted order has customerId preserved: ${dataConvert.customerId}`
    );
    if (dataConvert.id) createdOrderIds.push(dataConvert.id);

    // -------------------------------------------------------------------------
    // TEST 7: Invalid customerId yields 400
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Testing invalid customerId yields 400 ---');
    const fakeCustomerId = '00000000-0000-0000-0000-000000000000';
    const resFakeCust = await fetch(`${API_BASE}/quotations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerId: fakeCustomerId,
        customerName: 'Fake Customer Corp',
        customerPhone: '9876543214',
        lines: [{ skuId: testSku.id, name: testSku.name, quantity: 1, unitPrice: 1500 }],
      }),
    });
    const dataFakeCust: any = await resFakeCust.json();
    assert(
      resFakeCust.status === 400,
      'Non-existent customerId is rejected with HTTP 400',
      dataFakeCust
    );
  } finally {
    // Clean up created records
    console.log('\n--- Cleaning up test records ---');
    if (createdOrderIds.length > 0) {
      await prisma.orderLine.deleteMany({ where: { orderId: { in: createdOrderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    }
    if (createdQuotationIds.length > 0) {
      await prisma.quotationLine.deleteMany({ where: { quotationId: { in: createdQuotationIds } } });
      await prisma.statusHistory.deleteMany({ where: { entityId: { in: createdQuotationIds } } });
      await prisma.quotation.deleteMany({ where: { id: { in: createdQuotationIds } } });
    }
    if (createdCompanyIds.length > 0) {
      await prisma.contact.deleteMany({ where: { companyId: { in: createdCompanyIds } } });
      await prisma.company.deleteMany({ where: { id: { in: createdCompanyIds } } });
    }
    await prisma.$disconnect();
  }

  console.log('\n========================================================================');
  console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test script crashed:', err);
  process.exit(1);
});
