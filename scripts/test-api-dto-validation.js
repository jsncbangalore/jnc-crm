/**
 * API DTO Validation Contract Test Suite
 * 
 * Directly tests API endpoints with invalid names, phones, and quantities across:
 * - Customers (Companies)
 * - Customer Contacts
 * - Suppliers
 * - Quotations
 * - Orders
 * - Users
 * - Leads
 * 
 * Asserts every endpoint responds with HTTP 400 Bad Request.
 */

const http = require('http');
const jwt = require('jsonwebtoken');

const API_PORT = process.env.PORT || 3333;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_dev_crm_test_key_32bytes!!';

// Create a valid dev admin auth token
const devToken = jwt.sign(
  {
    sub: '84e8d1c9-5cb2-46ec-98a8-d7b7e0a6e872',
    email: 'admin@seed.dev',
    role: 'tenant_admin',
    tenantId: '55051b53-7872-430e-b700-f7e6281e9ffe',
  },
  JWT_SECRET,
  {
    expiresIn: '1h',
    algorithm: 'HS256',
    issuer: 'crm-api',
    audience: 'crm-client',
  }
);

function apiPost(endpoint, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request(
      `http://localhost:${API_PORT}${endpoint}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          Authorization: `Bearer ${devToken}`,
          Accept: 'application/json',
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = body;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.write(data);
    req.end();
  });
}

async function run() {
  console.log('='.repeat(70));
  console.log('API DTO VALIDATION CONTRACT TEST SUITE (Direct HTTP POST)');
  console.log(`Target: http://localhost:${API_PORT}`);
  console.log('='.repeat(70));

  const testCases = [
    // 1. Customers (Companies)
    {
      entity: 'Customer (Company)',
      endpoint: '/api/v1/companies',
      description: 'Bad name with illegal symbols (@#$%)',
      payload: { name: 'Acme Corp @#$%^&*', industry: 'Manufacturing' },
      expectedStatus: 400,
    },
    {
      entity: 'Customer (Company)',
      endpoint: '/api/v1/companies',
      description: 'Bad name too short (< 2 chars)',
      payload: { name: 'A' },
      expectedStatus: 400,
    },

    // 2. Customer Contacts
    {
      entity: 'Customer Contact',
      endpoint: '/api/v1/companies/9860d2ba-feed-46b0-8850-d3103ddd034d/contacts',
      description: 'Bad contact name with digits ("John123")',
      payload: { name: 'John123', email: 'john@example.com', phone: '9876543210' },
      expectedStatus: 400,
    },
    {
      entity: 'Customer Contact',
      endpoint: '/api/v1/companies/9860d2ba-feed-46b0-8850-d3103ddd034d/contacts',
      description: 'Bad contact phone ("12345")',
      payload: { name: 'John Doe', email: 'john@example.com', phone: '12345' },
      expectedStatus: 400,
    },

    // 3. Suppliers
    {
      entity: 'Supplier',
      endpoint: '/api/v1/suppliers',
      description: 'Bad contact person with digits ("Supplier123")',
      payload: { name: 'Global Supply Co', contactPerson: 'Supplier123', phone: '9876543210' },
      expectedStatus: 400,
    },
    {
      entity: 'Supplier',
      endpoint: '/api/v1/suppliers',
      description: 'Bad supplier phone ("not-a-valid-phone")',
      payload: { name: 'Global Supply Co', contactPerson: 'Supplier Person', phone: 'not-a-valid-phone' },
      expectedStatus: 400,
    },

    // 4. Quotations
    {
      entity: 'Quotation',
      endpoint: '/api/v1/quotations',
      description: 'Bad line item quantity (zero: 0)',
      payload: {
        leadId: '9860d2ba-feed-46b0-8850-d3103ddd034d',
        items: [{ name: 'Industrial Valve', quantity: 0, unitPrice: 500 }],
      },
      expectedStatus: 400,
    },
    {
      entity: 'Quotation',
      endpoint: '/api/v1/quotations',
      description: 'Bad line item quantity (negative: -5)',
      payload: {
        leadId: '9860d2ba-feed-46b0-8850-d3103ddd034d',
        items: [{ name: 'Industrial Valve', quantity: -5, unitPrice: 500 }],
      },
      expectedStatus: 400,
    },

    // 5. Orders
    {
      entity: 'Order',
      endpoint: '/api/v1/orders',
      description: 'Bad line item quantity (zero: 0)',
      payload: {
        companyId: '9860d2ba-feed-46b0-8850-d3103ddd034d',
        items: [{ name: 'Standard Sku', quantity: 0, unitPrice: 100 }],
      },
      expectedStatus: 400,
    },
    {
      entity: 'Order',
      endpoint: '/api/v1/orders',
      description: 'Bad line item quantity (negative: -10)',
      payload: {
        companyId: '9860d2ba-feed-46b0-8850-d3103ddd034d',
        items: [{ name: 'Standard Sku', quantity: -10, unitPrice: 100 }],
      },
      expectedStatus: 400,
    },

    // 6. Users
    {
      entity: 'User',
      endpoint: '/api/v1/users',
      description: 'Bad user name with digits ("Admin99")',
      payload: { name: 'Admin99', email: 'testadmin99@example.com', role: 'sales' },
      expectedStatus: 400,
    },
    {
      entity: 'User',
      endpoint: '/api/v1/users',
      description: 'Bad user phone ("555")',
      payload: { name: 'Jane Doe', email: 'janedoe@example.com', phone: '555', role: 'sales' },
      expectedStatus: 400,
    },

    // 7. Leads
    {
      entity: 'Lead',
      endpoint: '/api/v1/leads',
      description: 'Bad lead customer name with digits ("Buyer123")',
      payload: { customerName: 'Buyer123', customerPhone: '9876543210' },
      expectedStatus: 400,
    },
    {
      entity: 'Lead',
      endpoint: '/api/v1/leads',
      description: 'Bad lead customer phone ("invalid-phone")',
      payload: { customerName: 'Valid Lead Name', customerPhone: 'invalid-phone' },
      expectedStatus: 400,
    },
    {
      entity: 'Lead',
      endpoint: '/api/v1/leads',
      description: 'Bad lead quantity (negative: -25)',
      payload: { customerName: 'Valid Lead Name', customerPhone: '9876543210', quantity: -25 },
      expectedStatus: 400,
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    try {
      const res = await apiPost(tc.endpoint, tc.payload);
      if (res.status === tc.expectedStatus) {
        passed++;
        console.log(`[PASS] ${tc.entity.padEnd(20)} | ${tc.description.padEnd(45)} | HTTP ${res.status}`);
      } else {
        failed++;
        console.error(`[FAIL] ${tc.entity.padEnd(20)} | ${tc.description.padEnd(45)} | Expected ${tc.expectedStatus}, got ${res.status}`);
        console.error('       Response body:', JSON.stringify(res.body));
      }
    } catch (err) {
      failed++;
      console.error(`[ERR ] ${tc.entity} | ${tc.description}:`, err.message);
    }
  }

  console.log('\n' + '-'.repeat(70));
  console.log(`Total DTO Tests: ${testCases.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log('-'.repeat(70));

  if (failed > 0) {
    process.exit(1);
  }
}

run();
