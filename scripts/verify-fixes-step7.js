/* --- Verification Script for Quotations, Invoices, Stock Atomicity, and Health Schema --- */
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(process.cwd(), 'apps/api/.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        process.env[match[1]] = value;
      }
    }
  }
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const API_BASE = 'http://localhost:3333/api/v1';

async function main() {
  console.log('========================================================================');
  console.log('  STEP 7: VERIFICATION OF BUG FIXES (RAW AFTER OUTPUTS)');
  console.log('========================================================================\n');

  const runId = Date.now().toString().slice(-4);
  const tenantCode = `VERIFY_T_${runId}`;
  const adminEmail = `admin_verify_${runId}@example.fake`;
  const employeeEmail = `emp_verify_${runId}@example.fake`;
  const plainPassword = 'Password@123';
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  let tenant = null;

  try {
    tenant = await prisma.tenant.create({
      data: {
        code: tenantCode,
        name: `Verify Tenant Corp ${runId}`,
        slug: `verify-tenant-${runId}`,
        status: 'active',
        isInternal: false,
        address: '123 Tech Park, 4th Block',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560001',
        gstin: '29ABCDE1234F1ZW',
        pan: 'ABCDE1234F',
        users: {
          create: [
            {
              email: adminEmail,
              name: 'Admin User',
              role: 'tenant_admin',
              employeeCode: `EMP-ADM-${runId}`,
              passwordHash,
            },
            {
              email: employeeEmail,
              name: 'Employee User',
              role: 'employee',
              employeeCode: `EMP-STF-${runId}`,
              passwordHash,
            },
          ],
        },
        bankAccounts: {
          create: [
            {
              label: 'Primary Account',
              bankName: 'HDFC Bank',
              accountNumber: '123456789012',
              accountNumberLast4: '9012',
              ifsc: 'HDFC0001234',
              branch: 'Koramangala',
              isDefault: true,
              isDocumentDefault: true,
            },
          ],
        },
      },
      include: { users: true, bankAccounts: true },
    });

    console.log(`[SETUP] Created test tenant: ${tenant.id} (${tenantCode})`);

    // 1. Log in as admin to get auth token
    const adminLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: plainPassword }),
    });
    const adminLoginData = await adminLoginRes.json();
    const adminToken = adminLoginData.token || adminLoginData.accessToken;

    // 2. Log in as employee to get non-admin auth token
    const empLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: employeeEmail, password: plainPassword }),
    });
    const empLoginData = await empLoginRes.json();
    const empToken = empLoginData.token || empLoginData.accessToken;

    // Create a customer/company for quotations
    const custRes = await fetch(`${API_BASE}/companies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Acme Technologies Pvt Ltd',
        phone: '9876543210',
        email: 'billing@acme.example.com',
        state: 'Karnataka',
        city: 'Bengaluru',
      }),
    });
    const custData = await custRes.json();
    const customerId = custData.id;

    // ------------------------------------------------------------------------
    // CASE 1: QUOTATION
    // ------------------------------------------------------------------------
    console.log('\n------------------------------------------------------------------------');
    console.log('CASE 1: QUOTATION CREATION WITH AND WITHOUT UNIT FIELD');
    console.log('------------------------------------------------------------------------');

    console.log('\n[1A-AFTER] POST /quotations WITH unit: "NOS" in line item');
    console.log('Request Method: POST');
    console.log(`Request URL: ${API_BASE}/quotations`);
    const qtnWithUnitPayload = {
      customerId,
      customerName: 'Acme Technologies Pvt Ltd',
      customerPhone: '9876543210',
      customerEmail: 'billing@acme.example.com',
      lines: [
        {
          name: 'Industrial Sensor Module',
          description: 'Industrial Sensor Module',
          quantity: 5,
          unitPrice: 1500,
          taxRate: 18,
          unit: 'NOS',
        },
      ],
    };
    console.log('Request Body:', JSON.stringify(qtnWithUnitPayload, null, 2));
    const qtnWithUnitRes = await fetch(`${API_BASE}/quotations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(qtnWithUnitPayload),
    });
    const qtnWithUnitData = await qtnWithUnitRes.json();
    console.log(`HTTP Status: ${qtnWithUnitRes.status} ${qtnWithUnitRes.statusText}`);
    console.log('Response Body:', JSON.stringify(qtnWithUnitData, null, 2));

    console.log('\n[1B-AFTER] POST /quotations WITHOUT unit in line item');
    console.log('Request Method: POST');
    console.log(`Request URL: ${API_BASE}/quotations`);
    const qtnWithoutUnitPayload = {
      customerId,
      customerName: 'Acme Technologies Pvt Ltd',
      customerPhone: '9876543210',
      customerEmail: 'billing@acme.example.com',
      lines: [
        {
          name: 'Standard Calibration Service',
          description: 'Standard Calibration Service',
          quantity: 2,
          unitPrice: 2000,
          taxRate: 18,
        },
      ],
    };
    console.log('Request Body:', JSON.stringify(qtnWithoutUnitPayload, null, 2));
    const qtnWithoutUnitRes = await fetch(`${API_BASE}/quotations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(qtnWithoutUnitPayload),
    });
    const qtnWithoutUnitData = await qtnWithoutUnitRes.json();
    console.log(`HTTP Status: ${qtnWithoutUnitRes.status} ${qtnWithoutUnitRes.statusText}`);
    console.log('Response Body:', JSON.stringify(qtnWithoutUnitData, null, 2));

    // ------------------------------------------------------------------------
    // CASE 2: INVOICE GSTIN
    // ------------------------------------------------------------------------
    console.log('\n------------------------------------------------------------------------');
    console.log('CASE 2: INVOICE SAVE WITH VALID AND INVALID GSTIN');
    console.log('------------------------------------------------------------------------');

    console.log('\n[2A-AFTER] POST /invoices/create-direct with Valid GSTIN (29ABCDE1234F1ZW)');
    console.log('Request Method: POST');
    console.log(`Request URL: ${API_BASE}/invoices/create-direct`);
    const invValidPayload = {
      docType: 'tax_invoice',
      customerName: 'Gamma Enterprises',
      customerGstin: '29ABCDE1234F1ZW',
      customerState: 'Karnataka',
      invoiceDate: '2026-11-14',
      lines: [
        {
          description: 'Fiber Optic Cable',
          quantity: 10,
          unitPrice: 500,
          taxRate: 18,
        },
      ],
    };
    console.log('Request Body:', JSON.stringify(invValidPayload, null, 2));
    const invValidRes = await fetch(`${API_BASE}/invoices/create-direct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(invValidPayload),
    });
    const invValidData = await invValidRes.json();
    console.log(`HTTP Status: ${invValidRes.status} ${invValidRes.statusText}`);
    console.log('Response Body:', JSON.stringify(invValidData, null, 2));

    console.log('\n[2B-AFTER] POST /invoices/create-direct with Invalid GSTIN (29ABCDE1234F1Z9)');
    console.log('Request Method: POST');
    console.log(`Request URL: ${API_BASE}/invoices/create-direct`);
    const invInvalidPayload = {
      docType: 'tax_invoice',
      customerName: 'Gamma Enterprises',
      customerGstin: '29ABCDE1234F1Z9',
      customerState: 'Karnataka',
      invoiceDate: '2026-11-14',
      lines: [
        {
          description: 'Fiber Optic Cable',
          quantity: 10,
          unitPrice: 500,
          taxRate: 18,
        },
      ],
    };
    console.log('Request Body:', JSON.stringify(invInvalidPayload, null, 2));
    const invInvalidRes = await fetch(`${API_BASE}/invoices/create-direct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(invInvalidPayload),
    });
    const invInvalidData = await invInvalidRes.json();
    console.log(`HTTP Status: ${invInvalidRes.status} ${invInvalidRes.statusText}`);
    console.log('Response Body:', JSON.stringify(invInvalidData, null, 2));

    console.log('\n[2C-AFTER] POST /invoices/create-direct with Incomplete 14-char GSTIN (29ABCDE1234F1Z)');
    console.log('Request Method: POST');
    console.log(`Request URL: ${API_BASE}/invoices/create-direct`);
    const inv14Payload = {
      docType: 'tax_invoice',
      customerName: 'Gamma Enterprises',
      customerGstin: '29ABCDE1234F1Z',
      customerState: 'Karnataka',
      invoiceDate: '2026-11-14',
      lines: [
        {
          description: 'Fiber Optic Cable',
          quantity: 10,
          unitPrice: 500,
          taxRate: 18,
        },
      ],
    };
    console.log('Request Body:', JSON.stringify(inv14Payload, null, 2));
    const inv14Res = await fetch(`${API_BASE}/invoices/create-direct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(inv14Payload),
    });
    const inv14Data = await inv14Res.json();
    console.log(`HTTP Status: ${inv14Res.status} ${inv14Res.statusText}`);
    console.log('Response Body:', JSON.stringify(inv14Data, null, 2));

    // ------------------------------------------------------------------------
    // CASE 3: BILL COMPONENT PURCHASE & SKU ATOMICITY
    // ------------------------------------------------------------------------
    console.log('\n------------------------------------------------------------------------');
    console.log('CASE 3: BILL COMPONENT PURCHASE & SKU ATOMICITY');
    console.log('------------------------------------------------------------------------');

    console.log('\n[3A-AFTER] POST /inventory/project-stock/atomic-purchase with Valid SKU (COMP-RES-10K)');
    console.log('Request Method: POST');
    console.log(`Request URL: ${API_BASE}/inventory/project-stock/atomic-purchase`);
    const stockValidPayload = {
      skuCode: 'COMP-RES-10K',
      name: '10K Ohm Resistor',
      project: 'Project Alpha',
      quantity: 100,
      unit: 'Nos',
      unitPrice: 2.5,
      taxRate: 18,
      supplierName: 'Chip Components India',
    };
    console.log('Request Body:', JSON.stringify(stockValidPayload, null, 2));
    const stockValidRes = await fetch(`${API_BASE}/inventory/project-stock/atomic-purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(stockValidPayload),
    });
    const stockValidData = await stockValidRes.json();
    console.log(`HTTP Status: ${stockValidRes.status} ${stockValidRes.statusText}`);
    console.log('Response Body:', JSON.stringify(stockValidData, null, 2));

    console.log('\n[3B-AFTER] POST /inventory/project-stock/atomic-purchase with Invalid SKU (!@#$%^&*)');
    console.log('Request Method: POST');
    console.log(`Request URL: ${API_BASE}/inventory/project-stock/atomic-purchase`);
    const stockInvalidPayload = {
      skuCode: '!@#$%^&*',
      name: 'Faulty Component',
      project: 'Project Alpha',
      quantity: 50,
      unit: 'Nos',
      unitPrice: 10,
      taxRate: 18,
    };
    console.log('Request Body:', JSON.stringify(stockInvalidPayload, null, 2));
    const stockInvalidRes = await fetch(`${API_BASE}/inventory/project-stock/atomic-purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(stockInvalidPayload),
    });
    const stockInvalidData = await stockInvalidRes.json();
    console.log(`HTTP Status: ${stockInvalidRes.status} ${stockInvalidRes.statusText}`);
    console.log('Response Body:', JSON.stringify(stockInvalidData, null, 2));

    const orphanCount = await prisma.projectStockPosition.count({
      where: { itemCode: '!@#$%^&*' },
    });
    console.log(`Orphan Project Stock Positions with itemCode '!@#$%^&*': ${orphanCount}`);

    // ------------------------------------------------------------------------
    // CASE 4: HEALTH CHECK
    // ------------------------------------------------------------------------
    console.log('\n------------------------------------------------------------------------');
    console.log('CASE 4: HEALTH CHECK (GET /health/schema)');
    console.log('------------------------------------------------------------------------');

    console.log('\n[4A-AFTER] GET /health/schema with Non-Admin (role="employee") Token');
    console.log('Request Method: GET');
    console.log(`Request URL: ${API_BASE}/health/schema`);
    const healthNonAdminRes = await fetch(`${API_BASE}/health/schema`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${empToken}`,
      },
    });
    const healthNonAdminData = await healthNonAdminRes.json();
    console.log(`HTTP Status: ${healthNonAdminRes.status} ${healthNonAdminRes.statusText}`);
    console.log('Response Body:', JSON.stringify(healthNonAdminData, null, 2));

    console.log('\n[4B-AFTER] GET /health/schema with Admin (role="tenant_admin") Token');
    console.log('Request Method: GET');
    console.log(`Request URL: ${API_BASE}/health/schema`);
    const healthAdminRes = await fetch(`${API_BASE}/health/schema`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    const healthAdminData = await healthAdminRes.json();
    console.log(`HTTP Status: ${healthAdminRes.status} ${healthAdminRes.statusText}`);
    console.log('Response Body:', JSON.stringify(healthAdminData, null, 2));

  } finally {
    if (tenant) {
      console.log(`\n[CLEANUP] Cleaning up test tenant ${tenant.id}...`);
      await prisma.projectStockPosition.deleteMany({ where: { project: 'Project Alpha' } }).catch(() => {});
      await prisma.sku.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {});
      await prisma.quotationLine.deleteMany({ where: { quotation: { tenantId: tenant.id } } }).catch(() => {});
      await prisma.quotation.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {});
      await prisma.invoiceLine.deleteMany({ where: { invoice: { tenantId: tenant.id } } }).catch(() => {});
      await prisma.invoice.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {});
      await prisma.companyBankAccount.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {});
      await prisma.user.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {});
      await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
      console.log('[CLEANUP] Done.');
    }
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
