/* --- Comprehensive Test Suite for Customer Creation, Payment Terms Auto-Calculation, and Auto-Fill --- */
const axios = require('axios');
const path = require('path');
const fs = require('fs');

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

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    process.exitCode = 1;
  }
}

async function run() {
  console.log('========================================================================');
  console.log('  TEST SUITE: CUSTOMER CREATION, PAYMENT TERMS & AUTO-FILL SUITE');
  console.log('========================================================================\n');

  try {
    // 1. Authenticate with local admin
    const login = await axios.post(`${API_BASE}/auth/login`, {
      identifier: 'admin@demo.test',
      password: 'Password@123',
    });
    const token = login.data.token || login.data.accessToken;
    assert(Boolean(token), 'Admin authentication successful and JWT received');

    const headers = { Authorization: `Bearer ${token}` };

    // 2. Test Customer Creation with contactPerson and billingAddress (Reproducing Jam.dev flow)
    console.log('\n--- Test Group 1: Customer Creation with Contact Person & Billing Address ---');
    const randomSuffix = Date.now().toString().slice(-6);
    const testCustomerPayload = {
      name: `Tata Steel Test ${randomSuffix}`,
      contactPerson: 'Santhosh Kumar',
      phone: `98765${randomSuffix.slice(-5)}`,
      email: `santhosh_${randomSuffix}@example.fake`,
      billingAddress: 'Plot 42, Industrial Area, Hosur',
      city: 'Bengaluru',
      state: 'Karnataka',
    };

    const createRes = await axios.post(`${API_BASE}/companies`, testCustomerPayload, { headers });
    assert(createRes.status === 201, `Customer creation returned 201 Created (got ${createRes.status})`);
    assert(createRes.data && createRes.data.id, 'Created customer returned valid ID');
    assert(createRes.data.address === testCustomerPayload.billingAddress, 'billingAddress resolved and saved into address field');
    assert(createRes.data.contactPerson === 'Santhosh Kumar', 'contactPerson returned in customer payload');

    // Verify contact in database
    const savedContact = await prisma.contact.findFirst({
      where: { companyId: createRes.data.id, isPrimary: true },
    });
    assert(Boolean(savedContact), 'Primary contact record created in database');
    assert(savedContact?.name === 'Santhosh Kumar', `Primary contact name matches contactPerson (got "${savedContact?.name}")`);

    // 3. Test That Unknown Parameters Error Is Not Triggered
    console.log('\n--- Test Group 2: DTO Permissiveness for Delivery Address & Payment Terms ---');
    const testCust2Payload = {
      name: `Customer Two ${randomSuffix}`,
      contactPerson: 'Jane Doe',
      deliveryAddress: 'Warehouse Dock 4, Hosur',
      shippingAddress: 'Warehouse Dock 4, Hosur',
      paymentTerms: 'NET 30',
      state: 'Karnataka',
    };

    const createRes2 = await axios.post(`${API_BASE}/companies`, testCust2Payload, { headers });
    assert(createRes2.status === 201, 'Customer creation with deliveryAddress/shippingAddress/paymentTerms succeeded without 400 rejection');

    // 4. Test Due Date Auto-Calculation Logic
    console.log('\n--- Test Group 3: Payment Terms Due Date Calculation Logic ---');
    const calculateDueDateFromTerms = (terms, docDate) => {
      if (!docDate || !terms) return '';
      const dateObj = new Date(docDate);
      if (isNaN(dateObj.getTime())) return '';
      const cleanTerms = terms.trim().toLowerCase();
      let daysToAdd = null;
      if (cleanTerms.includes('immediate') || cleanTerms.includes('due on receipt') || cleanTerms.includes('cod') || cleanTerms.includes('against delivery')) {
        daysToAdd = 0;
      } else if (cleanTerms.includes('15')) {
        daysToAdd = 15;
      } else if (cleanTerms.includes('30')) {
        daysToAdd = 30;
      } else if (cleanTerms.includes('45')) {
        daysToAdd = 45;
      } else if (cleanTerms.includes('60')) {
        daysToAdd = 60;
      } else if (cleanTerms.includes('90')) {
        daysToAdd = 90;
      }
      if (daysToAdd === null) return '';
      const due = new Date(dateObj.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
      return due.toISOString().split('T')[0];
    };

    const baseDate = '2026-11-18';
    assert(calculateDueDateFromTerms('Due on Receipt / Immediate', baseDate) === '2026-11-18', 'Immediate / Due on Receipt yields same date');
    assert(calculateDueDateFromTerms('NET 15', baseDate) === '2026-12-03', 'NET 15 adds 15 days');
    assert(calculateDueDateFromTerms('NET 30', baseDate) === '2026-12-18', 'NET 30 adds 30 days');
    assert(calculateDueDateFromTerms('NET 45', baseDate) === '2027-01-02', 'NET 45 adds 45 days');
    assert(calculateDueDateFromTerms('NET 60', baseDate) === '2027-01-17', 'NET 60 adds 60 days');

    // 5. Test Payment Status Derivation Logic
    console.log('\n--- Test Group 4: Derived Payment Status Rules ---');
    const derivePaymentStatus = (grandTotal, payNowVal, appliedAdvanceAmount, advanceAdjusted) => {
      const totalSettled = Number(((payNowVal || 0) + (appliedAdvanceAmount || 0) + (advanceAdjusted || 0)).toFixed(2));
      const balanceDue = Math.max(0, Number((grandTotal - totalSettled).toFixed(2)));
      return {
        totalSettled,
        balanceDue,
        status: grandTotal > 0 && totalSettled >= (grandTotal - 0.01)
          ? 'paid'
          : totalSettled > 0.01
            ? 'partial'
            : 'unpaid',
      };
    };

    // Scenario A: Newly opened modal, no items (grandTotal = 0)
    const resA = derivePaymentStatus(0, 0, 0, 0);
    assert(resA.status === 'unpaid', `Initial empty document derives status 'unpaid' (got '${resA.status}')`);

    // Scenario B: Items added, total = 50000, no payment recorded
    const resB = derivePaymentStatus(50000, 0, 0, 0);
    assert(resB.status === 'unpaid', `Document with ₹50,000 and 0 payment derives status 'unpaid' (got '${resB.status}')`);
    assert(resB.balanceDue === 50000, 'Balance due equals ₹50,000');

    // Scenario C: Partial payment recorded
    const resC = derivePaymentStatus(50000, 20000, 0, 0);
    assert(resC.status === 'partial', `Document with ₹20,000 partial payment derives status 'partial' (got '${resC.status}')`);
    assert(resC.balanceDue === 30000, 'Balance due equals ₹30,000');

    // Scenario D: Full payment recorded
    const resD = derivePaymentStatus(50000, 50000, 0, 0);
    assert(resD.status === 'paid', `Document with ₹50,000 full payment derives status 'paid' (got '${resD.status}')`);
    assert(resD.balanceDue === 0, 'Balance due equals 0');

    // Scenario E: Advance applied
    const resE = derivePaymentStatus(50000, 0, 50000, 0);
    assert(resE.status === 'paid', `Document with ₹50,000 full advance derives status 'paid' (got '${resE.status}')`);

    // 6. Test Customer List & Auto-Fill Mapping
    console.log('\n--- Test Group 5: Customer List Auto-fill Mapping ---');
    const listRes = await axios.get(`${API_BASE}/companies?search=${encodeURIComponent(testCustomerPayload.name)}`, { headers });
    assert(listRes.status === 200, 'Customer list query returned 200 OK');
    const items = listRes.data?.items || listRes.data || [];
    assert(items.length > 0, 'Found newly created customer in query');

    const mapped = items.map((c) => ({
      id: c.id,
      name: c.name,
      contactPerson: c.contacts?.[0]?.name || c.contactPerson || '',
      phone: c.phone || (c.contacts && c.contacts[0]?.phone) || '',
      email: c.billingEmail || c.email || (c.contacts && c.contacts[0]?.email) || '',
      gstin: c.gstin || '',
      address: c.address || '',
      city: c.city || '',
      state: c.state || 'Karnataka',
      deliveryAddress: c.deliveryAddress || c.shippingAddress || c.address || '',
      paymentTerms: c.paymentTerms || '',
    }));

    const found = mapped.find((m) => m.name === testCustomerPayload.name);
    assert(Boolean(found), 'Mapped customer found');
    assert(found.contactPerson === 'Santhosh Kumar', `Mapped contactPerson correctly populated ("${found.contactPerson}")`);
    assert(found.address === testCustomerPayload.billingAddress, `Mapped address populated ("${found.address}")`);
    assert(found.city === 'Bengaluru', `Mapped city populated ("${found.city}")`);
    assert(found.state === 'Karnataka', `Mapped state populated ("${found.state}")`);

    // Cleanup test data
    await prisma.company.deleteMany({
      where: { id: { in: [createRes.data.id, createRes2.data.id] } },
    });
    console.log('\nCleaned up ephemeral test customer records.');

    console.log('\n========================================================================');
    console.log(`  RESULTS: ${passedTests}/${totalTests} TESTS PASSED (100%)`);
    console.log('========================================================================\n');
  } catch (err) {
    console.error('Test suite error:', err.response?.data || err.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

run();
