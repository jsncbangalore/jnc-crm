import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import * as jwt from 'jsonwebtoken';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3333/api/v1';

// Read env for JWT secret and DB
const envPath = path.resolve(__dirname, '../apps/api/.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const jwtSecret = process.env.JWT_SECRET || 'dev_secret';
const prisma = new PrismaClient();

async function main() {
  console.log('====================================================');
  console.log('SERVER-SIDE RECEIPT REJECTION TESTS (jnc_crm_dev)');
  console.log('Target: ' + API_BASE);
  console.log('====================================================\n');

  // Verify DB connection to localhost
  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1')) {
    console.error('REFUSING TO RUN: Database is not localhost!');
    process.exit(1);
  }

  // Get active tenant and user
  const tenant = await prisma.tenant.findFirst({
    where: { status: 'active', deletedAt: null },
  });
  if (!tenant) {
    throw new Error('No active tenant found in dev DB');
  }

  const user = await prisma.user.findFirst({
    where: { tenantId: tenant.id, isActive: true, deletedAt: null },
  });
  if (!user) {
    throw new Error('No active user found in dev DB');
  }

  const customer = await prisma.company.findFirst({
    where: { tenantId: tenant.id, deletedAt: null },
  });
  if (!customer) {
    throw new Error('No customer company found in dev DB');
  }

  // Find or create a bank account belonging to this tenant
  let tenantBankAccount = await prisma.companyBankAccount.findFirst({
    where: { tenantId: tenant.id, isActive: true },
  });
  if (!tenantBankAccount) {
    tenantBankAccount = await prisma.companyBankAccount.create({
      data: {
        tenantId: tenant.id,
        bankName: 'HDFC Bank',
        label: 'Current Account',
        accountNumber: '123456789012',
        accountNumberLast4: '9012',
        ifsc: 'HDFC0001234',
        isDefault: true,
      },
    });
  }

  // Generate test JWT for User
  const token = jwt.sign(
    {
      sub: user.id,
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      employeeCode: user.employeeCode,
      tokenVersion: user.tokenVersion || 0,
    },
    jwtSecret,
    { issuer: 'crm-api', audience: 'crm-client', expiresIn: '1h' }
  );

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  let testFailures: string[] = [];

  // ─── TEST 1: referenceNumber is rejected with 400 Bad Request (forbidNonWhitelisted) ───
  console.log('Test 1: Sending forbidden alias "referenceNumber"...');
  const payloadTest1 = {
    partyType: 'customer',
    customerId: customer.id,
    amount: 100,
    paymentMethod: 'NEFT',
    reference: 'NEFT9988776655',
    referenceNumber: 'NEFT9988776655', // FORBIDDEN ALIAS
    notes: 'Testing alias rejection',
    idempotencyKey: `test-alias-${Date.now()}`,
  };

  try {
    const res = await fetch(`${API_BASE}/payments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(payloadTest1),
    });
    const data: any = await res.json();
    if (res.status === 400) {
      console.log(`[PASS] Server returned 400 Bad Request for "referenceNumber": ${JSON.stringify(data.message || data.error)}`);
    } else {
      console.error(`[FAIL] Expected 400 but got ${res.status}: ${JSON.stringify(data)}`);
      testFailures.push(`Test 1 expected 400 but got ${res.status}`);
    }
  } catch (err: any) {
    console.error('[FAIL] Network or execution error on Test 1:', err.message);
    testFailures.push(`Test 1 error: ${err.message}`);
  }

  // ─── TEST 2: UPI receipt with bad reference is rejected with 400 ───
  console.log('\nTest 2: Sending UPI receipt with invalid reference (bad length/non-12 digits)...');
  const payloadTest2 = {
    partyType: 'customer',
    customerId: customer.id,
    amount: 100,
    paymentMethod: 'UPI',
    reference: 'INVALID123', // BAD UPI REFERENCE (must be exactly 12 digits)
    notes: 'Testing UPI reference validation',
    idempotencyKey: `test-upi-${Date.now()}`,
  };

  try {
    const res = await fetch(`${API_BASE}/payments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(payloadTest2),
    });
    const data: any = await res.json();
    if (res.status === 400 && (data.message || '').toLowerCase().includes('12')) {
      console.log(`[PASS] Server returned 400 Bad Request for bad UPI reference: "${data.message}"`);
    } else if (res.status === 400) {
      console.log(`[PASS] Server returned 400 Bad Request for bad UPI reference: ${JSON.stringify(data.message)}`);
    } else {
      console.error(`[FAIL] Expected 400 for bad UPI reference but got ${res.status}: ${JSON.stringify(data)}`);
      testFailures.push(`Test 2 expected 400 but got ${res.status}`);
    }
  } catch (err: any) {
    console.error('[FAIL] Network or execution error on Test 2:', err.message);
    testFailures.push(`Test 2 error: ${err.message}`);
  }

  // ─── TEST 3: bankAccountId from another tenant is rejected with 400 ───
  console.log('\nTest 3: Sending bankAccountId from another tenant or invalid UUID...');
  const fakeOtherTenantBankId = '00000000-0000-0000-0000-000000000099';
  const payloadTest3 = {
    partyType: 'customer',
    customerId: customer.id,
    amount: 100,
    paymentMethod: 'NEFT',
    reference: 'NEFT1122334455',
    bankAccountId: fakeOtherTenantBankId, // Belongs to another tenant or not found in this tenant
    notes: 'Testing cross-tenant bankAccount isolation',
    idempotencyKey: `test-bank-${Date.now()}`,
  };

  try {
    const res = await fetch(`${API_BASE}/payments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(payloadTest3),
    });
    const data: any = await res.json();
    if (res.status === 400 && (data.message || '').includes('organization')) {
      console.log(`[PASS] Server returned 400 Bad Request for cross-tenant bankAccountId: "${data.message}"`);
    } else if (res.status === 400) {
      console.log(`[PASS] Server returned 400 Bad Request: ${JSON.stringify(data.message)}`);
    } else {
      console.error(`[FAIL] Expected 400 for cross-tenant bankAccountId but got ${res.status}: ${JSON.stringify(data)}`);
      testFailures.push(`Test 3 expected 400 but got ${res.status}`);
    }
  } catch (err: any) {
    console.error('[FAIL] Network or execution error on Test 3:', err.message);
    testFailures.push(`Test 3 error: ${err.message}`);
  }

  // ─── TEST 4: Canonical valid payload succeeds ───
  console.log('\nTest 4: Sending valid canonical receipt payload...');
  const payloadTest4 = {
    partyType: 'customer',
    customerId: customer.id,
    amount: 100,
    paymentMethod: 'NEFT',
    reference: `NEFT${Date.now().toString().slice(-10)}`,
    bankAccountId: tenantBankAccount.id,
    notes: 'Valid payment receipt with canonical keys',
    isAdvance: true,
    allowAdvance: true,
    confirmDuplicate: true,
    idempotencyKey: `test-valid-${Date.now()}`,
  };

  try {
    const res = await fetch(`${API_BASE}/payments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(payloadTest4),
    });
    const data: any = await res.json();
    if (res.status === 200 || res.status === 201) {
      console.log(`[PASS] Valid canonical receipt recorded successfully (ID: ${data.id})`);
    } else {
      console.error(`[FAIL] Expected 200/201 but got ${res.status}: ${JSON.stringify(data)}`);
      testFailures.push(`Test 4 expected 200/201 but got ${res.status}`);
    }
  } catch (err: any) {
    console.error('[FAIL] Network or execution error on Test 4:', err.message);
    testFailures.push(`Test 4 error: ${err.message}`);
  }

  await prisma.$disconnect();

  console.log('\n====================================================');
  if (testFailures.length === 0) {
    console.log('ALL SERVER-SIDE RECEIPT REJECTION TESTS PASSED (4/4)!');
    console.log('====================================================');
  } else {
    console.error(`SERVER-SIDE TESTS FAILED with ${testFailures.length} failure(s):`);
    for (const f of testFailures) console.error('  - ' + f);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Fatal error in server test:', e);
  process.exit(1);
});
