/**
 * STEP 1 - REPRODUCE BUGS (READ-ONLY BEFORE FIX)
 * Local jnc_crm_dev only. Fake data only. Clean up created tenant.
 * Tests:
 * 1. Quotation: lines containing `unit` vs quotation without `unit`
 * 2. Invoice: valid GSTIN, invalid GSTIN, 14-character GSTIN
 * 3. Bill / SKU: valid skuCode, empty skuCode, 'JNC-25-/2026'
 * 4. Health schema: non-admin user GET /health/schema
 */

const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Load environment variables for DB
if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(process.cwd(), 'apps/api/.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
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
  console.log('  STEP 1: REPRODUCE BUG RECORDINGS (RAW BEFORE FIX)');
  console.log('========================================================================\n');

  const runId = Date.now().toString().slice(-4);
  const tenantCode = `REPRO_T_${runId}`;
  const adminEmail = `admin_repro_${runId}@example.fake`;
  const employeeEmail = `emp_repro_${runId}@example.fake`;
  const plainPassword = 'Password@123';
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  let tenant = null;

  try {
    // Create temporary tenant with complete company profile and bank account
    tenant = await prisma.tenant.create({
      data: {
        code: tenantCode,
        name: `Repro Tenant Corp ${runId}`,
        slug: `repro-tenant-${runId}`,
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

    // Log in as employee to get non-admin token
    const empLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: employeeEmail, password: plainPassword }),
    });
    const empLoginData = await empLoginRes.json();
    const empToken = empLoginData.token || empLoginData.accessToken;

    // Create a customer/company for quotations and invoices
    const custRes = await fetch(`${API_BASE}/companies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Alpha Test Technologies',
        phone: '9876543210',
        email: 'billing@alphatest.fake',
        state: 'Karnataka',
        city: 'Bengaluru',
      }),
    });
    const custData = await custRes.json();
    const customerId = custData.id;

    console.log(`[SETUP] Created customer: ${customerId}\n`);

    // ------------------------------------------------------------------------
    // CASE 1: QUOTATION
    // ------------------------------------------------------------------------
    console.log('------------------------------------------------------------------------');
    console.log('CASE 1: QUOTATION SAVE');
    console.log('------------------------------------------------------------------------');

    // 1A. Quotation with lines containing `unit`
    const quoteWithUnitBody = {
      customerId,
      customerName: 'Alpha Test Technologies',
      customerPhone: '9876543210',
      shippingAddress: 'Bengaluru, Karnataka',
      taxRate: 18,
      lines: [
        {
          name: 'Industrial Ethernet Switch 8-Port',
          quantity: 2,
          unitPrice: 3500,
          unit: 'NOS',
          discount: 0,
          hsnCode: '851762',
        },
      ],
    };

    console.log('\n[1A] POST /quotations with line containing `unit: "NOS"`');
    console.log('Request Method: POST');
    console.log(`Request URL: ${API_BASE}/quotations`);
    console.log('Request Body:', JSON.stringify(quoteWithUnitBody, null, 2));

    const quoteWithUnitRes = await fetch(`${API_BASE}/quotations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(quoteWithUnitBody),
    });

    const quoteWithUnitData = await quoteWithUnitRes.json();
    console.log(`HTTP Status: ${quoteWithUnitRes.status} ${quoteWithUnitRes.statusText}`);
    console.log('Response Body:', JSON.stringify(quoteWithUnitData, null, 2));

    // 1B. Quotation without `unit`
    const quoteWithoutUnitBody = {
      customerId,
      customerName: 'Alpha Test Technologies',
      customerPhone: '9876543210',
      shippingAddress: 'Bengaluru, Karnataka',
      taxRate: 18,
      lines: [
        {
          name: 'Industrial Ethernet Switch 8-Port',
          quantity: 2,
          unitPrice: 3500,
          discount: 0,
          hsnCode: '851762',
        },
      ],
    };

    console.log('\n[1B] POST /quotations without `unit`');
    console.log('Request Method: POST');
    console.log(`Request URL: ${API_BASE}/quotations`);
    console.log('Request Body:', JSON.stringify(quoteWithoutUnitBody, null, 2));

    const quoteWithoutUnitRes = await fetch(`${API_BASE}/quotations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(quoteWithoutUnitBody),
    });

    const quoteWithoutUnitData = await quoteWithoutUnitRes.json();
    console.log(`HTTP Status: ${quoteWithoutUnitRes.status} ${quoteWithoutUnitRes.statusText}`);
    console.log('Response Body (keys):', Object.keys(quoteWithoutUnitData));
    if (quoteWithoutUnitData.id) console.log(`Created Quotation ID: ${quoteWithoutUnitData.id}, QuoteNumber: ${quoteWithoutUnitData.quoteNumber}`);

    // ------------------------------------------------------------------------
    // CASE 2: INVOICE SAVE (POST /invoices/create-direct)
    // ------------------------------------------------------------------------
    console.log('\n------------------------------------------------------------------------');
    console.log('CASE 2: INVOICE SAVE (VALID GSTIN vs INVALID GSTIN vs 14-CHAR GSTIN)');
    console.log('------------------------------------------------------------------------');

    // 2A. Valid GSTIN (29ABCDE1234F1ZW)
    const validGstin = '29ABCDE1234F1ZW';
    const invoiceValidBody = {
      docType: 'tax_invoice',
      invoiceNumber: `INV-${runId}-001`,
      invoiceDate: new Date().toISOString().slice(0, 10),
      customerName: 'Alpha Test Technologies',
      customerPhone: '9876543210',
      customerGstin: validGstin,
      billingAddress: 'Bengaluru, Karnataka',
      lines: [
        {
          description: 'Network Consulting & Setup',
          quantity: 1,
          unitPrice: 5000,
          taxRate: 18,
          hsnCode: '998313',
        },
      ],
    };

    console.log('\n[2A] POST /invoices/create-direct with VALID GSTIN (29ABCDE1234F1ZW)');
    console.log('Request Method: POST');
    console.log(`Request URL: ${API_BASE}/invoices/create-direct`);
    console.log('Request Body:', JSON.stringify(invoiceValidBody, null, 2));

    const invValidRes = await fetch(`${API_BASE}/invoices/create-direct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(invoiceValidBody),
    });

    const invValidData = await invValidRes.json();
    console.log(`HTTP Status: ${invValidRes.status} ${invValidRes.statusText}`);
    console.log('Response Body (keys):', Object.keys(invValidData));
    if (invValidData.id) console.log(`Created Invoice ID: ${invValidData.id}, InvoiceNumber: ${invValidData.invoiceNumber}`);

    // 2B. Invalid GSTIN (checksum / structure invalid)
    const invalidGstin = '29ABCDE1234F1Z9'; // wrong check digit
    const invoiceInvalidBody = {
      ...invoiceValidBody,
      invoiceNumber: `INV-${runId}-002`,
      customerGstin: invalidGstin,
    };

    console.log('\n[2B] POST /invoices/create-direct with INVALID GSTIN (29ABCDE1234F1Z9 - wrong checksum)');
    console.log('Request Method: POST');
    console.log(`Request URL: ${API_BASE}/invoices/create-direct`);
    console.log('Request Body:', JSON.stringify(invoiceInvalidBody, null, 2));

    const invInvalidRes = await fetch(`${API_BASE}/invoices/create-direct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(invoiceInvalidBody),
    });

    const invInvalidData = await invInvalidRes.json();
    console.log(`HTTP Status: ${invInvalidRes.status} ${invInvalidRes.statusText}`);
    console.log('Response Body:', JSON.stringify(invInvalidData, null, 2));

    // 2C. 14-character GSTIN
    const shortGstin = '29ABCDE1234F1Z';
    const invoiceShortBody = {
      ...invoiceValidBody,
      invoiceNumber: `INV-${runId}-003`,
      customerGstin: shortGstin,
    };

    console.log('\n[2C] POST /invoices/create-direct with 14-CHAR GSTIN (29ABCDE1234F1Z - incomplete length)');
    console.log('Request Method: POST');
    console.log(`Request URL: ${API_BASE}/invoices/create-direct`);
    console.log('Request Body:', JSON.stringify(invoiceShortBody, null, 2));

    const invShortRes = await fetch(`${API_BASE}/invoices/create-direct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(invoiceShortBody),
    });

    const invShortData = await invShortRes.json();
    console.log(`HTTP Status: ${invShortRes.status} ${invShortRes.statusText}`);
    console.log('Response Body:', JSON.stringify(invShortData, null, 2));

    // ------------------------------------------------------------------------
    // CASE 3: BILL / SKU (SAVE COMPONENT TO STOCK)
    // ------------------------------------------------------------------------
    console.log('\n------------------------------------------------------------------------');
    console.log('CASE 3: BILL / SKU SAVE');
    console.log('------------------------------------------------------------------------');

    // 3A. Valid skuCode
    const validSkuCode = `SKU-VAL-${runId}`;
    console.log(`\n[3A] Valid SKU Code: "${validSkuCode}"`);
    console.log(`POST /inventory/skus with skuCode: "${validSkuCode}"`);
    const skuValidRes = await fetch(`${API_BASE}/inventory/skus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        skuCode: validSkuCode,
        name: 'Relay Module 5V',
        category: 'Electronics',
        unitPrice: 120,
        costPrice: 80,
        taxRate: 18,
        packageType: 'NOS',
      }),
    });
    const skuValidData = await skuValidRes.json();
    console.log(`SKU HTTP Status: ${skuValidRes.status} ${skuValidRes.statusText}`);
    console.log('SKU Response:', JSON.stringify(skuValidData, null, 2));

    console.log(`POST /inventory/project-stock for "${validSkuCode}"`);
    const stockValidRes = await fetch(`${API_BASE}/inventory/project-stock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        project: 'Project Alpha',
        reference: `PUR-${runId}-001`,
        quantity: 10,
        itemCode: validSkuCode,
        partValue: 'Relay Module 5V',
        package: 'NOS',
        unit: 'NOS',
        bomQtyPerUnit: 1,
        batchQty: 10,
        plannedRequirement: 10,
        openingStock: 0,
        inflow: 10,
        outflow: 0,
      }),
    });
    const stockValidData = await stockValidRes.json();
    console.log(`Stock HTTP Status: ${stockValidRes.status} ${stockValidRes.statusText}`);
    console.log('Stock Response (keys):', Object.keys(stockValidData));

    // 3B. Empty skuCode
    console.log('\n[3B] Empty SKU Code: ""');
    console.log('POST /inventory/skus with skuCode: ""');
    const skuEmptyRes = await fetch(`${API_BASE}/inventory/skus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        skuCode: '',
        name: 'Relay Module 12V',
        category: 'Electronics',
        unitPrice: 150,
        costPrice: 95,
        taxRate: 18,
        packageType: 'NOS',
      }),
    });
    const skuEmptyData = await skuEmptyRes.json();
    console.log(`SKU HTTP Status: ${skuEmptyRes.status} ${skuEmptyRes.statusText}`);
    console.log('SKU Response:', JSON.stringify(skuEmptyData, null, 2));

    // 3C. skuCode = 'JNC-25-/2026'
    const bugSkuCode = 'JNC-25-/2026';
    console.log(`\n[3C] Problem SKU Code: "${bugSkuCode}"`);
    console.log(`POST /inventory/skus with skuCode: "${bugSkuCode}"`);
    const skuBugRes = await fetch(`${API_BASE}/inventory/skus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        skuCode: bugSkuCode,
        name: 'Power Converter 24V',
        category: 'Power',
        unitPrice: 850,
        costPrice: 600,
        taxRate: 18,
        packageType: 'NOS',
      }),
    });
    const skuBugData = await skuBugRes.json();
    console.log(`SKU HTTP Status: ${skuBugRes.status} ${skuBugRes.statusText}`);
    console.log('SKU Response Body:', JSON.stringify(skuBugData, null, 2));

    console.log(`Right after SKU failure/execution, POST /inventory/project-stock with itemCode: "${bugSkuCode}" (Current UI behavior)`);
    const stockBugRes = await fetch(`${API_BASE}/inventory/project-stock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        project: 'Project Alpha',
        reference: `PUR-${runId}-002`,
        quantity: 5,
        itemCode: bugSkuCode,
        partValue: 'Power Converter 24V',
        package: 'NOS',
        unit: 'NOS',
        bomQtyPerUnit: 1,
        batchQty: 5,
        plannedRequirement: 5,
        openingStock: 0,
        inflow: 5,
        outflow: 0,
      }),
    });
    const stockBugData = await stockBugRes.json();
    console.log(`Stock HTTP Status: ${stockBugRes.status} ${stockBugRes.statusText}`);
    console.log('Stock Response (keys):', Object.keys(stockBugData));
    if (stockBugData.id) {
      console.log(`ORPHAN STOCK ROW CREATED! Stock ID: ${stockBugData.id}, itemCode: ${stockBugData.itemCode} (no matching SKU row)`);
    }

    // ------------------------------------------------------------------------
    // CASE 4: HEALTH CHECK
    // ------------------------------------------------------------------------
    console.log('\n------------------------------------------------------------------------');
    console.log('CASE 4: HEALTH CHECK (GET /health/schema FOR NON-ADMIN)');
    console.log('------------------------------------------------------------------------');

    console.log(`\n[4A] GET /health/schema with Non-Admin (role="employee") Token`);
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

    console.log(`\n[4B] GET /health/schema with Admin (role="tenant_admin") Token`);
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
      console.log(`\n[CLEANUP] Deleting test tenant ${tenant.id}...`);
      await prisma.projectStockPosition.deleteMany({ where: { project: 'Project Alpha' } }).catch(() => {});
      await prisma.quotationLine.deleteMany({ where: { quotation: { tenantId: tenant.id } } }).catch(() => {});
      await prisma.quotation.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {});
      await prisma.invoiceLine.deleteMany({ where: { invoice: { tenantId: tenant.id } } }).catch(() => {});
      await prisma.invoice.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {});
      await prisma.company.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {});
      await prisma.sku.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {});
      await prisma.companyBankAccount.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {});
      await prisma.user.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {});
      await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
      console.log('[CLEANUP] Done.');
    }
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Reproduction script failed:', err);
  process.exit(1);
});
