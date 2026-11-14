/* --- API TESTS FOR TOPIC 3: AMOUNT LIMITS AND TYPED CONFIRMATIONS --- */
import * as fs from 'fs';
if (fs.existsSync('apps/api/.env')) {
  const envContent = fs.readFileSync('apps/api/.env', 'utf-8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const k = trimmed.slice(0, idx).trim();
      const v = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[k]) process.env[k] = v;
    }
  }
}
import { PrismaClient } from '@prisma/client';

const API_BASE = 'http://localhost:3333/api/v1';
const prisma = new PrismaClient();

async function runTests() {
  console.log('========================================================================');
  console.log('TOPIC 3 API TEST: AMOUNT LIMITS & HIGH VALUE CONFIRMATIONS');
  console.log('========================================================================\n');

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

  const admin = await prisma.user.findFirst({
    where: { role: 'tenant_admin', isActive: true },
  });
  if (!admin) throw new Error('No tenant_admin found');

  const tenantId = admin.tenantId;

  const jwt = await import('jsonwebtoken');
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

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // Create temporary test customer
  const testCustomer = await prisma.company.create({
    data: {
      tenantId,
      name: `Test Amount Limit Corp ${Date.now()}`,
    },
  });

  try {
    // A) Test 2000000000 (> 10 Crore)
    const resHuge = await fetch(`${API_BASE}/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerId: testCustomer.id,
        partyType: 'customer',
        amount: 2000000000,
        paymentMethod: 'NEFT',
        reference: 'TXN-HUGE-001',
      }),
    });
    const dataHuge: any = await resHuge.json();
    console.log('DEBUG resHuge:', resHuge.status, dataHuge);
    assert(
      resHuge.status === 400 && JSON.stringify(dataHuge).includes('10 Crore'),
      'API rejects amount 2000000000 (exceeds 10 Crore limit) with 400 and clear message'
    );

    // B) Test 0
    const resZero = await fetch(`${API_BASE}/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerId: testCustomer.id,
        partyType: 'customer',
        amount: 0,
        paymentMethod: 'NEFT',
        reference: 'TXN-ZERO-001',
      }),
    });
    const dataZero: any = await resZero.json();
    console.log('DEBUG resZero:', resZero.status, dataZero);
    assert(
      resZero.status === 400 && JSON.stringify(dataZero).includes('greater than zero'),
      'API rejects amount 0 (must be greater than zero) with 400 and clear message'
    );

    // C) Test Negative (-500)
    const resNeg = await fetch(`${API_BASE}/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerId: testCustomer.id,
        partyType: 'customer',
        amount: -500,
        paymentMethod: 'NEFT',
        reference: 'TXN-NEG-001',
      }),
    });
    const dataNeg: any = await resNeg.json();
    assert(
      resNeg.status === 400,
      'API rejects negative amount (-500) with 400'
    );

    // D) Test 12.345 (> 2 decimals)
    const res3Dec = await fetch(`${API_BASE}/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerId: testCustomer.id,
        partyType: 'customer',
        amount: 12.345,
        paymentMethod: 'NEFT',
        reference: 'TXN-DEC-001',
      }),
    });
    const data3Dec: any = await res3Dec.json();
    console.log('DEBUG res3Dec:', res3Dec.status, data3Dec);
    assert(
      res3Dec.status === 400 && JSON.stringify(data3Dec).includes('decimal places'),
      'API rejects amount 12.345 (> 2 decimal places) with 400 and clear message'
    );

    // E) Test high value > 10 Lakh (₹15,00,000) WITHOUT typed confirmation
    const res15LakhNoConfirm = await fetch(`${API_BASE}/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerId: testCustomer.id,
        partyType: 'customer',
        amount: 1500000,
        paymentMethod: 'NEFT',
        reference: 'NEFT12345678A',
      }),
    });
    const data15LakhNoConfirm: any = await res15LakhNoConfirm.json();
    console.log('DEBUG res15LakhNoConfirm:', res15LakhNoConfirm.status, data15LakhNoConfirm);
    assert(
      res15LakhNoConfirm.status === 400 &&
        JSON.stringify(data15LakhNoConfirm).includes('High-value confirmation required') &&
        JSON.stringify(data15LakhNoConfirm).includes('typing the exact amount'),
      'API rejects amount > 10 Lakh (₹15,00,000) when typed confirmation is missing'
    );

    // F) Test high value > 10 Lakh with WRONG typed confirmation ('10000')
    const res15LakhWrongConfirm = await fetch(`${API_BASE}/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerId: testCustomer.id,
        partyType: 'customer',
        amount: 1500000,
        paymentMethod: 'NEFT',
        reference: 'NEFT12345678B',
        typedConfirmation: '10000',
      }),
    });
    assert(
      res15LakhWrongConfirm.status === 400,
      'API rejects amount > 10 Lakh when typed confirmation does not match exact amount'
    );

    // G) Test high value > 10 Lakh with CORRECT typed confirmation ('1500000')
    const res15LakhCorrect = await fetch(`${API_BASE}/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerId: testCustomer.id,
        partyType: 'customer',
        amount: 1500000,
        paymentMethod: 'NEFT',
        reference: 'NEFT12345678C',
        typedConfirmation: '1500000',
      }),
    });
    const data15LakhCorrect: any = await res15LakhCorrect.json();
    console.log('DEBUG res15LakhCorrect:', res15LakhCorrect.status, data15LakhCorrect);
    assert(
      res15LakhCorrect.status === 201 || res15LakhCorrect.status === 200,
      'API accepts amount > 10 Lakh when exact amount is confirmed by typing'
    );

    console.log('\n========================================================================');
    console.log(`API TEST SUMMARY: ${passed} passed, ${failed} failed`);
    console.log('========================================================================');

    if (failed > 0) process.exit(1);
  } finally {
    // Cleanup created test records
    await prisma.paymentRecord.deleteMany({
      where: { customerId: testCustomer.id },
    });
    await prisma.company.deleteMany({
      where: { id: testCustomer.id },
    });
    await prisma.$disconnect();
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
