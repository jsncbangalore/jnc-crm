const fs = require('fs');
const path = require('path');

// 1. Load env
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
      process.env[key] = val;
    }
  }
}

const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

async function run() {
  console.log('\n======================================================');
  console.log('QA Test: Lead Phone Validation Runs ONLY When Changed');
  console.log('Target Database: jnc_crm_dev');
  console.log('======================================================\n');

  // 1. Locate the exact legacy lead
  const targetLeadId = '7069f1f4-86c7-4a4d-bf38-2df395213498';
  let lead = await prisma.lead.findUnique({
    where: { id: targetLeadId },
  });

  if (!lead) {
    // If not found by ID, try find by phone
    lead = await prisma.lead.findFirst({
      where: { customerPhone: '+915289541841' },
    });
  }

  assert(Boolean(lead), `Located legacy lead in jnc_crm_dev: ${lead?.customerName} (${lead?.customerPhone})`);
  const tenantId = lead.tenantId;

  // 2. Find an active user in this tenant to authenticate
  let user = await prisma.user.findFirst({
    where: { tenantId, isActive: true, deletedAt: null },
  });

  if (!user) {
    user = await prisma.user.findFirst({
      where: { isActive: true, deletedAt: null },
    });
  }

  assert(Boolean(user), `Found active user for auth: ${user.email} (${user.role})`);

  // Generate valid JWT token matching JwtStrategy
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
    process.env.JWT_SECRET || 'dev-secret',
    {
      issuer: process.env.JWT_ISSUER || 'crm-api',
      audience: process.env.JWT_AUDIENCE || 'crm-client',
      expiresIn: '1h',
    }
  );

  const apiBase = 'http://localhost:3333/api/v1';

  // 3. TEST STEP A: Open and save lead WITHOUT touching phone field (phone is untouched legacy: +915289541841)
  console.log('\n--- Step A: Save lead WITHOUT changing legacy phone (+915289541841) ---');
  const resA = await fetch(`${apiBase}/leads/${lead.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customerName: 'santhosh kumar verified',
      customerPhone: '+915289541841', // Exact same legacy phone number
      city: 'Bengaluru',
    }),
  });

  const dataA = await resA.json();
  assert(resA.status === 200, `Untouched legacy phone saves with HTTP 200 OK (actual: ${resA.status})`);
  assert(dataA.customerPhone === '+915289541841', `Stored phone preserved as '+915289541841' without validation error`);

  // 4. TEST STEP B: Change phone to invalid value (e.g. '12345' short number)
  console.log('\n--- Step B: Change phone to invalid short value (\'12345\') ---');
  const resB = await fetch(`${apiBase}/leads/${lead.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customerPhone: '12345',
    }),
  });

  const dataB = await resB.json();
  assert(resB.status === 400, `Invalid phone change rejected with HTTP 400 Bad Request (actual: ${resB.status})`);
  assert(
    dataB.message && dataB.message.includes('10-digit mobile number'),
    `Rejection message specifies 10-digit mobile requirement: "${dataB.message}"`
  );

  // 5. TEST STEP C: Change phone to invalid Indian mobile (e.g. starting with digit 5: '5555555555')
  console.log('\n--- Step C: Change phone to invalid starting digit (\'5555555555\') ---');
  const resC = await fetch(`${apiBase}/leads/${lead.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customerPhone: '5555555555',
    }),
  });

  const dataC = await resC.json();
  assert(resC.status === 400, `Invalid starting digit 5 rejected with HTTP 400 Bad Request (actual: ${resC.status})`);
  assert(
    dataC.message && (dataC.message.includes('6, 7, 8, or 9') || dataC.message.includes('10-digit mobile')),
    `Rejection message indicates invalid start digit: "${dataC.message}"`
  );

  // 6. TEST STEP D: Change phone to valid mobile ('9876543210')
  console.log('\n--- Step D: Change phone to valid mobile (\'9876543210\') ---');
  const resD = await fetch(`${apiBase}/leads/${lead.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customerPhone: '9876543210',
    }),
  });

  const dataD = await resD.json();
  assert(resD.status === 200, `Valid phone change saved with HTTP 200 OK (actual: ${resD.status})`);
  assert(dataD.customerPhone === '+919876543210', `Valid phone normalized and saved as '+919876543210'`);

  // 7. Revert lead back to initial phone to leave DB clean
  console.log('\n--- Clean-up: Reverting lead back to original legacy phone ---');
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      customerName: 'santhosh kumar',
      customerPhone: '+915289541841',
    },
  });
  console.log('  Clean-up completed: lead phone restored to +915289541841.');

  console.log(`\nQA Test Results: ${passed} Passed, ${failed} Failed.`);
  if (failed > 0) process.exit(1);
}

run()
  .catch((err) => {
    console.error('Test execution error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
