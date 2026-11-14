/**
 * Automated test for Topic 4:
 * 1. Blacklisted placeholder customer names rejected across Company creation, Quotations, and Orders.
 * 2. Unlinked invoice linking and bulk linking.
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
import * as jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const API_BASE = 'http://localhost:3333/api/v1';

async function main() {
  console.log('========================================================================');
  console.log('  TOPIC 4: PLACEHOLDER NAMES & UNLINKED INVOICES API TEST SUITE');
  console.log('========================================================================\n');

  // Find admin user and tenant
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

  // 1. Test company creation rejects blacklisted placeholder names
  console.log('\n--- 1. Company Creation Placeholder Rejections ---');
  const blacklistedNames = ['Valued Client', 'Walk-in', 'Customer', 'Test', 'NA', '-', 'Unknown'];

  for (const pName of blacklistedNames) {
    const res = await fetch(`${API_BASE}/companies`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: pName,
        phone: '9876543210',
      }),
    });
    const data = await res.json().catch(() => ({}));
    assert(
      res.status === 400,
      `API rejects creating customer with placeholder name "${pName}" (Status: ${res.status})`
    );
  }

  // 2. Test quotation creation rejects blacklisted placeholder customer name
  console.log('\n--- 2. Quotation Creation Placeholder Rejections ---');
  for (const pName of ['Valued Client', 'Walk-in Customer']) {
    const res = await fetch(`${API_BASE}/quotations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerName: pName,
        customerPhone: '9876543210',
        lines: [
          {
            name: 'Test Product',
            quantity: 1,
            unitPrice: 1000,
          },
        ],
      }),
    });
    const data = await res.json().catch(() => ({}));
    assert(
      res.status === 400,
      `API rejects quotation with placeholder customer "${pName}" (Status: ${res.status})`
    );
  }

  // 3. Test order creation rejects blacklisted placeholder customer name
  console.log('\n--- 3. Order Creation Placeholder Rejections ---');
  for (const pName of ['Valued Client', 'Customer']) {
    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerName: pName,
        customerPhone: '9876543210',
        lines: [
          {
            name: 'Test Product',
            quantity: 1,
            unitPrice: 1000,
          },
        ],
      }),
    });
    assert(
      res.status === 400,
      `API rejects order with placeholder customer "${pName}" (Status: ${res.status})`
    );
  }

  // 4. Test creating a legitimate customer
  console.log('\n--- 4. Create Legitimate Customer & Unlinked Invoices Linking ---');
  const legitRes = await fetch(`${API_BASE}/companies`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Alpha Quantum Labs Pvt Ltd',
      phone: '9845012345',
      city: 'Bangalore',
      state: 'Karnataka',
    }),
  });
  assert(legitRes.status === 201 || legitRes.status === 200, `Created legitimate customer Alpha Quantum Labs (Status: ${legitRes.status})`);
  const legitCustomer = await legitRes.json();
  const legitCustomerId = legitCustomer.id;

  // Create two unlinked test invoices directly in DB
  const inv1 = await prisma.invoice.create({
    data: {
      tenantId: adminUser.tenantId,
      invoiceNumber: `TEST-UNLINK-${Date.now()}-1`,
      invoiceDate: new Date(),
      customerName: 'Unlinked Ambiguous Party',
      customerPhone: '9888888888',
      totalAmount: 12000,
      balanceDue: 12000,
      subtotal: 10000,
      docType: 'tax_invoice',
      paymentStatus: 'unpaid',
      createdById: adminUser.id,
    },
  });

  const inv2 = await prisma.invoice.create({
    data: {
      tenantId: adminUser.tenantId,
      invoiceNumber: `TEST-UNLINK-${Date.now()}-2`,
      invoiceDate: new Date(),
      customerName: 'Unlinked Ambiguous Party',
      customerPhone: '9888888888',
      totalAmount: 15000,
      balanceDue: 15000,
      subtotal: 12500,
      docType: 'tax_invoice',
      paymentStatus: 'unpaid',
      createdById: adminUser.id,
    },
  });

  // 5. Test single invoice link
  console.log('\n--- 5. Single Invoice Link to Customer ---');
  const linkRes = await fetch(`${API_BASE}/invoices/${inv1.id}/link-customer`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      customerId: legitCustomerId,
    }),
  });
  assert(linkRes.status === 200, `Successfully linked single invoice ${inv1.invoiceNumber} to ${legitCustomer.name} (Status: ${linkRes.status})`);
  const inv1Updated = await prisma.invoice.findUnique({ where: { id: inv1.id } });
  assert(
    inv1Updated?.customerId === legitCustomerId && inv1Updated?.customerName === 'Alpha Quantum Labs Pvt Ltd',
    `Invoice 1 in DB has customerId and updated customerName matching target company`
  );

  // 6. Test bulk linking invoices
  console.log('\n--- 6. Bulk Invoices Link to Customer ---');
  const bulkRes = await fetch(`${API_BASE}/invoices/bulk-link-customer`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      invoiceIds: [inv2.id],
      customerId: legitCustomerId,
    }),
  });
  assert(bulkRes.status === 201 || bulkRes.status === 200, `Bulk linked invoices (Status: ${bulkRes.status})`);
  const bulkData = await bulkRes.json();
  assert(bulkData.count === 1, `Bulk link returned count: ${bulkData.count}`);

  const inv2Updated = await prisma.invoice.findUnique({ where: { id: inv2.id } });
  assert(
    inv2Updated?.customerId === legitCustomerId,
    `Invoice 2 in DB linked to target customer via bulk endpoint`
  );

  // 7. Cleanup test data
  console.log('\n--- 7. Cleanup Test Data ---');
  await prisma.invoice.deleteMany({
    where: { id: { in: [inv1.id, inv2.id] } },
  });
  await prisma.company.deleteMany({
    where: { id: legitCustomerId },
  });
  console.log('[CLEANUP] Deleted test invoices and test company.');

  console.log('\n========================================================================');
  console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('========================================================================');

  if (failed > 0) process.exit(1);
}

main()
  .catch((err) => {
    console.error('Fatal error during test:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
