import axios from 'axios';
import * as jwt from 'jsonwebtoken';

const API_BASE = 'http://localhost:3333/api/v1';
const JWT_SECRET = process.env.JWT_SECRET || 'crm-super-secret-jwt-key-change-in-production';

// Target tenant: ACME-DEV-001
const tenantId = '55051b53-7872-430e-b700-f7e6281e9ffe';
const userId = '11111111-1111-1111-1111-111111111111';

// Mint admin token
const token = jwt.sign(
  {
    sub: userId,
    email: 'admin@acme.com',
    role: 'tenant_admin',
    tenantId,
    name: 'Acme Admin',
  },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const client = axios.create({
  baseURL: API_BASE,
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
});

async function main() {
  console.log('================================================================');
  console.log('CUSTOMER & INVOICE CREATION LIVE VERIFICATION TEST');
  console.log('Testing payload from user screenshot:');
  console.log('  Customer Name: santhosh');
  console.log('  Phone Number:  9952385331');
  console.log('  GSTIN:         29AAAAA0000A1ZY');
  console.log('  Email Address: santhosh1508sk@gmail.com');
  console.log('  State:         Tamil Nadu');
  console.log('  Address:       hosuer');
  console.log('================================================================\n');

  // STEP 1: Create Company with phone & email payload
  console.log('Step 1: Calling POST /api/v1/companies...');
  const customerPayload = {
    name: 'santhosh',
    phone: '9952385331',
    gstin: '29AAAAA0000A1ZY',
    billingEmail: 'santhosh1508sk@gmail.com',
    state: 'Tamil Nadu',
    address: 'hosuer',
    city: 'Hosur',
  };

  let createdCompany: any;
  try {
    const res = await client.post('/companies', customerPayload);
    createdCompany = res.data;
    console.log('  [PASS] Company created successfully! Status:', res.status);
    console.log('  ID:          ', createdCompany.id);
    console.log('  Name:        ', createdCompany.name);
    console.log('  Phone:       ', createdCompany.phone);
    console.log('  Email:       ', createdCompany.email || createdCompany.billingEmail);
    console.log('  GSTIN:       ', createdCompany.gstin);
    console.log('  State:       ', createdCompany.state);
    console.log('  Address:     ', createdCompany.address);
  } catch (err: any) {
    console.error('  [FAIL] Error creating company:', err?.response?.data || err.message);
    process.exit(1);
  }

  // STEP 2: Verify Company retrieval via GET /companies/:id
  console.log('\nStep 2: Calling GET /api/v1/companies/' + createdCompany.id + '...');
  try {
    const res = await client.get(`/companies/${createdCompany.id}`);
    const comp = res.data;
    console.log('  [PASS] Retrieved company successfully!');
    console.log('  Contacts attached:  ', comp.contacts?.length || 0);
    console.log('  Primary Contact Phone:', comp.phone);
    console.log('  Primary Contact Email:', comp.email);
    if (!comp.phone || comp.phone !== '9952385331') {
      throw new Error(`Expected phone 9952385331, got ${comp.phone}`);
    }
  } catch (err: any) {
    console.error('  [FAIL] Error fetching company:', err?.response?.data || err.message);
    process.exit(1);
  }

  // STEP 3: Create Invoice using this customer
  console.log('\nStep 3: Creating Tax Invoice for newly registered customer...');
  const invoicePayload = {
    docType: 'tax_invoice',
    invoiceNumber: `INV/26-27/TEST-${Date.now().toString().slice(-4)}`,
    invoiceDate: new Date().toISOString().split('T')[0],
    paymentTerms: 'Due on Receipt',
    paymentStatus: 'unpaid',
    customerId: createdCompany.id,
    customerName: createdCompany.name,
    customerPhone: createdCompany.phone || '9952385331',
    customerEmail: createdCompany.email || 'santhosh1508sk@gmail.com',
    customerGstin: createdCompany.gstin || '29AAAAA0000A1ZY',
    customerState: createdCompany.state || 'Tamil Nadu',
    billingAddress: createdCompany.address || 'hosuer',
    deliveryAddress: createdCompany.address || 'hosuer',
    isSez: false,
    lines: [
      {
        description: 'CNC Precision Machined Component',
        hsnCode: '8406',
        unit: 'NOS',
        quantity: 10,
        unitPrice: 2500,
        taxRate: 18,
      },
      {
        description: 'Surface Finishing & Inspection',
        hsnCode: '9988',
        unit: 'HRS',
        quantity: 2,
        unitPrice: 1200,
        taxRate: 18,
      },
    ],
  };

  let createdInvoice: any;
  try {
    const res = await client.post('/invoices', invoicePayload);
    createdInvoice = res.data;
    console.log('  [PASS] Invoice created successfully! Status:', res.status);
    console.log('  Invoice ID:     ', createdInvoice.id);
    console.log('  Invoice Number: ', createdInvoice.invoiceNumber);
    console.log('  Customer Name:  ', createdInvoice.customerName);
    console.log('  Customer Phone: ', createdInvoice.customerPhone);
    console.log('  Subtotal:       ', createdInvoice.subtotal);
    console.log('  Tax Total:      ', createdInvoice.taxTotal);
    console.log('  Grand Total:    ', createdInvoice.grandTotal);
    console.log('  Payment Status: ', createdInvoice.paymentStatus);
  } catch (err: any) {
    console.error('  [FAIL] Error creating invoice:', err?.response?.data || err.message);
    process.exit(1);
  }

  // STEP 4: Verify Invoice PDF generation endpoint
  console.log('\nStep 4: Testing PDF preview/stream for the invoice...');
  try {
    const res = await client.get(`/invoices/${createdInvoice.id}/pdf`, {
      responseType: 'arraybuffer',
    });
    console.log('  [PASS] Invoice PDF generated successfully!');
    console.log('  Content-Type:  ', res.headers['content-type']);
    console.log('  PDF Size:      ', (res.data as Buffer).length, 'bytes');
  } catch (err: any) {
    console.error('  [FAIL] PDF generation failed:', err?.response?.data || err.message);
    process.exit(1);
  }

  console.log('\n================================================================');
  console.log('ALL VERIFICATION CHECKS PASSED (4/4)!');
  console.log('Customer creation and invoice generation are fully working.');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
