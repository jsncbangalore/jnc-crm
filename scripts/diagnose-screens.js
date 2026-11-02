const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

function loadDevEnv() {
  const envPath = path.resolve(__dirname, '../.env.development');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.substring(0, idx).trim();
        let val = trimmed.substring(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadDevEnv();

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

const API_BASE = 'http://localhost:3333/api/v1';

async function main() {
  console.log('========================================================================');
  console.log('DIAGNOSING ALL SPECIFIED SCREENS ON DEVELOPMENT DATABASE');
  console.log('Target API:', API_BASE);
  console.log('========================================================================\n');

  await prisma.$connect();
  const tenant = await prisma.tenant.findFirst({
    where: { name: { contains: 'Acme Corporation' } },
  });
  if (!tenant) throw new Error('Acme tenant not found');

  const admin = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: 'tenant_admin' },
  });
  if (!admin) throw new Error('Tenant admin not found');

  const customer = await prisma.company.findFirst({
    where: { tenantId: tenant.id },
  });
  if (!customer) throw new Error('Customer not found');

  const jwtSecret = process.env.JWT_SECRET || 'dev_jwt_secret_key_at_least_32_characters_long_for_security_12345';
  const token = jwt.sign(
    {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      tenantId: tenant.id,
    },
    jwtSecret,
    {
      issuer: 'crm-api',
      audience: 'crm-client',
      expiresIn: '1h',
    }
  );

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const results = [];

  async function checkEndpoint(name, method, url, body = null) {
    process.stdout.write(`Testing [${name}] ... `);
    try {
      const res = await fetch(`${API_BASE}${url}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      let json = null;
      const text = await res.text();
      try {
        json = JSON.parse(text);
      } catch (_) {
        json = text;
      }

      if (res.ok) {
        console.log(`OK (${res.status})`);
        results.push({ name, status: 'PASS', code: res.status, error: null });
        return { ok: true, data: json };
      } else {
        const errorMsg = typeof json === 'object' ? JSON.stringify(json) : json;
        console.log(`FAILED (${res.status}) -> ${errorMsg}`);
        results.push({ name, status: 'FAIL', code: res.status, error: errorMsg });
        return { ok: false, error: errorMsg };
      }
    } catch (e) {
      console.log(`ERROR -> ${e.message}`);
      results.push({ name, status: 'ERROR', code: 0, error: e.message });
      return { ok: false, error: e.message };
    }
  }

  // 1. Quotations List
  await checkEndpoint('Quotations List', 'GET', '/quotations');

  // 2. Quotations Create
  let createdQuotationId = null;
  const quoteRes = await checkEndpoint('Quotations Create', 'POST', '/quotations', {
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: '+919876543210',
    customerEmail: 'billing@example.internal',
    customerState: 'Karnataka',
    taxRate: 18,
    lines: [
      {
        name: 'Test High Capacity Sensor Line',
        quantity: 5,
        unitPrice: 1000,
      },
    ],
  });
  if (quoteRes.ok && quoteRes.data && quoteRes.data.id) {
    createdQuotationId = quoteRes.data.id;
  }

  // 3. Orders List & Convert
  await checkEndpoint('Orders List', 'GET', '/orders');

  let createdOrderId = null;
  if (createdQuotationId) {
    // Accept quotation
    await checkEndpoint('Quotation Accept', 'PATCH', `/quotations/${createdQuotationId}/status`, {
      status: 'accepted',
    });

    const orderRes = await checkEndpoint('Convert to Order', 'POST', `/quotations/${createdQuotationId}/convert-to-order`, {});
    if (orderRes.ok && orderRes.data && orderRes.data.id) {
      createdOrderId = orderRes.data.id;
    }
  }

  // 4. Shipments List
  await checkEndpoint('Shipments List', 'GET', '/orders/shipments/list');

  // 5. Invoices List
  await checkEndpoint('Invoices List', 'GET', '/invoices');

  // 6. Invoices Create for all Document Types
  const docTypes = [
    { type: 'tax_invoice', label: 'Tax Invoice' },
    { type: 'sez_invoice', label: 'SEZ Invoice' },
    { type: 'proforma_invoice', label: 'Proforma Invoice' },
    { type: 'delivery_challan', label: 'Delivery Challan' },
    { type: 'credit_note', label: 'Credit Note' },
  ];

  let createdInvoiceId = null;
  for (const doc of docTypes) {
    const invRes = await checkEndpoint(`Invoice Create (${doc.label})`, 'POST', '/invoices/create-direct', {
      docType: doc.type,
      companyId: customer.id,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: '+919876543210',
      customerEmail: 'billing@example.internal',
      customerState: 'Karnataka',
      customerGstin: doc.type === 'sez_invoice' ? '29AABCG0002R1Z2' : '29AABCO0001R1Z1',
      isSez: doc.type === 'sez_invoice',
      paymentTerms: 'NET 30',
      lines: [
        {
          description: `${doc.label} Component Testing Line`,
          hsnCode: '8534',
          quantity: 2,
          unitPrice: 2000,
          taxRate: doc.type === 'sez_invoice' ? 0 : 18,
        },
      ],
    });
    if (invRes.ok && invRes.data && invRes.data.id && !createdInvoiceId) {
      createdInvoiceId = invRes.data.id;
    }
  }

  // Test validation error handling on Document Create (MUST return 400 with fieldErrors, NOT 500)
  process.stdout.write('Testing [Create-Document 500 Prevention & Field Errors] ... ');
  const badCreateRes = await fetch(`${API_BASE}/invoices/create-direct`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      customerName: '', // empty name
      lines: [], // empty lines
    }),
  });
  const badCreateJson = await badCreateRes.json().catch(() => null);
  if (badCreateRes.status === 400 && badCreateJson?.fieldErrors) {
    console.log(`OK (400) -> Returned structured field errors: ${Object.keys(badCreateJson.fieldErrors).join(', ')}`);
    results.push({ name: 'Create-Doc Error Handling (No 500)', status: 'PASS', code: 400, error: null });
  } else {
    console.log(`FAIL (${badCreateRes.status}) -> ${JSON.stringify(badCreateJson)}`);
    results.push({ name: 'Create-Doc Error Handling (No 500)', status: 'FAIL', code: badCreateRes.status, error: JSON.stringify(badCreateJson) });
  }

  // 7. Branding and GST
  await checkEndpoint('Branding and GST Profile', 'GET', '/settings/branding');

  // 8. Ledger Parties & Statement
  await checkEndpoint('Ledger Parties List', 'GET', '/ledger/parties?type=customer');
  await checkEndpoint('Ledger Party Statement', 'GET', `/ledger/statement?partyId=${customer.id}&partyType=customer`);

  // 9. Customer Account
  await checkEndpoint('Customer Account List', 'GET', '/companies');
  await checkEndpoint('Customer Account Details', 'GET', `/companies/${customer.id}`);

  // 10. Payments List & Record
  await checkEndpoint('Payments List', 'GET', '/payments');
  await checkEndpoint('Payments Record', 'POST', '/ledger/payments', {
    partyType: 'customer',
    partyId: customer.id,
    partyName: customer.name,
    amount: 1000,
    paymentMethod: 'neft',
    reference: `DIAG-PAY-${Date.now()}`,
    date: new Date().toISOString(),
    sendReceiptEmail: false,
    autoAllocate: true,
  });

  console.log('\n========================================================================');
  console.log('DIAGNOSTIC SUMMARY TABLE');
  console.log('========================================================================');
  console.log('Screen / Operation                        | Status | Code | Message');
  console.log('------------------------------------------|--------|------|----------------');
  for (const r of results) {
    const errSummary = r.error ? r.error.slice(0, 40) : 'None';
    console.log(`${r.name.padEnd(41)} | ${r.status.padEnd(6)} | ${String(r.code).padEnd(4)} | ${errSummary}`);
  }
  console.log('========================================================================\n');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('[DIAGNOSTIC FATAL]', e);
  process.exit(1);
});
