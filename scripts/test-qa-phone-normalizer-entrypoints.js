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
const {
  normalizeToE164,
  comparePhoneNumbers,
  cleanPhone,
  formatToE164,
} = require(path.resolve(__dirname, '../packages/shared-validation/dist/index.js'));

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
  console.log('\n===================================================================');
  console.log('QA Test: Universal Phone Normalizer Across Webhooks & Duplicates');
  console.log('Target Database: jnc_crm_dev (NO DATA CONVERSION)');
  console.log('===================================================================\n');

  // --- 1. Unit Normalizer Invariance Tests ---
  console.log('--- 1. Testing Core Phone Normalizer Function ---');
  const f1 = normalizeToE164('9876543210');
  const f2 = normalizeToE164('+91 98765 43210');
  const f3 = normalizeToE164('+919876543210');
  const f4 = normalizeToE164('09876543210');
  const f5 = normalizeToE164('+91-98765-43210');

  assert(f1 === '+919876543210', `'9876543210' normalizes to '+919876543210'`);
  assert(f2 === '+919876543210', `'+91 98765 43210' normalizes to '+919876543210'`);
  assert(f3 === '+919876543210', `'+919876543210' normalizes to '+919876543210'`);
  assert(f4 === '+919876543210', `'09876543210' normalizes to '+919876543210'`);
  assert(f5 === '+919876543210', `'+91-98765-43210' normalizes to '+919876543210'`);

  assert(comparePhoneNumbers('9876543210', '+91 98765 43210') === true, `comparePhoneNumbers matches '9876543210' with '+91 98765 43210'`);
  assert(comparePhoneNumbers('+91 98765 43210', '+919876543210') === true, `comparePhoneNumbers matches '+91 98765 43210' with '+919876543210'`);
  assert(comparePhoneNumbers('9876543210', '+919876543210') === true, `comparePhoneNumbers matches '9876543210' with '+919876543210'`);

  // --- 2. Database Integration & Duplicate Matching Across Entry Points ---
  console.log('\n--- 2. Setting up Benchmark Stored Lead in jnc_crm_dev ---');
  const tenant = await prisma.tenant.findFirst({ where: { status: 'active', deletedAt: null } });
  assert(Boolean(tenant), `Active tenant found: ${tenant?.name} (${tenant?.id})`);

  const user = await prisma.user.findFirst({
    where: { tenantId: tenant.id, isActive: true, deletedAt: null },
  });
  assert(Boolean(user), `Active tenant user found: ${user?.email}`);

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

  const testPhoneBenchmark = '+91 98765 43210'; // stored with spaces
  const testEmailBenchmark = 'benchmark-person@test.com';

  // Clean any previous test residue
  await prisma.lead.deleteMany({
    where: { customerEmail: testEmailBenchmark },
  });

  // Create initial benchmark lead stored as '+91 98765 43210'
  const benchmarkLead = await prisma.lead.create({
    data: {
      tenantId: tenant.id,
      leadNumber: `QA-TEST-${Date.now().toString().slice(-5)}`,
      customerName: 'Benchmark Person',
      customerPhone: testPhoneBenchmark, // deliberately stored with space formatting
      customerEmail: testEmailBenchmark,
      source: 'manual',
      status: 'new',
    },
  });
  console.log(`  Created benchmark lead ${benchmarkLead.leadNumber} with stored phone "${benchmarkLead.customerPhone}".`);

  const apiBase = 'http://localhost:3333/api/v1';

  // --- 3. Entry Point: Forms / Standard API (POST /leads) ---
  console.log('\n--- 3. Testing Duplicate Detection via POST /leads (10 digits: "9876543210") ---');
  const resApi1 = await fetch(`${apiBase}/leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customerName: 'Benchmark Person Duplicate Attempt Alpha',
      customerPhone: '9876543210', // 10 plain digits
      customerEmail: testEmailBenchmark,
    }),
  });

  const dataApi1 = await resApi1.json();
  assert(
    resApi1.status === 409 && dataApi1.code === 'DUPLICATE_WARNING',
    `POST /leads rejects duplicate 10 digits '9876543210' with 409 Conflict (actual: ${resApi1.status})`
  );

  console.log('\n--- Testing Duplicate Detection via POST /leads (E.164: "+919876543210") ---');
  const resApi2 = await fetch(`${apiBase}/leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customerName: 'Benchmark Person Duplicate Attempt Beta',
      customerPhone: '+919876543210', // exact E164 without space
      customerEmail: testEmailBenchmark,
    }),
  });

  const dataApi2 = await resApi2.json();
  assert(
    resApi2.status === 409 && dataApi2.code === 'DUPLICATE_WARNING',
    `POST /leads rejects duplicate E164 '+919876543210' with 409 Conflict (actual: ${resApi2.status})`
  );

  // --- 4. Entry Point: IndiaMART Webhook ---
  console.log('\n--- 4. Testing IndiaMART Webhook Duplicate Matching ---');
  // Initialize unique webhook key for tenant
  const crypto = require('crypto');
  const plainKey = 'qa_wh_key_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const keyHash = crypto.createHash('sha256').update(plainKey).digest('hex');
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { webhookKeyHash: keyHash },
  });

  const resImart = await fetch(`${apiBase}/webhooks/indiamart/${plainKey}?token=dev_indiamart_secret`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      SENDER_NAME: 'Benchmark Person Duplicate',
      SENDER_MOBILE: '9876543210', // plain digits matching stored '+91 98765 43210'
      SENDER_EMAIL: testEmailBenchmark,
      QUERY_MESSAGE: 'IndiaMART quote request for security equipment',
    }),
  });

  const dataImart = await resImart.json();
  console.log('  IndiaMART response:', resImart.status, dataImart);
  assert(
    resImart.status === 200 && dataImart.status === 'DUPLICATE_IGNORED',
    `IndiaMART webhook matched duplicate across '9876543210' and stored '${testPhoneBenchmark}' (status: ${dataImart.status})`
  );

  // --- 5. Entry Point: Meta Webhook ---
  console.log('\n--- 5. Testing Meta Lead Ads Webhook Duplicate Matching ---');
  const resMeta = await fetch(`${apiBase}/webhooks/meta/${plainKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Benchmark Person Duplicate',
      phone: '+919876543210', // compact E164 matching stored '+91 98765 43210'
      email: testEmailBenchmark,
      source: 'facebook_lead_ads',
    }),
  });

  const dataMeta = await resMeta.json();
  console.log('  Meta response:', resMeta.status, dataMeta);
  assert(
    resMeta.status === 200 && dataMeta.status === 'ACCEPTED',
    `Meta webhook accepted payload for async processing (deliveryId: ${dataMeta.deliveryId})`
  );

  // Allow async delivery processing
  await new Promise((r) => setTimeout(r, 800));
  const metaAudit = await prisma.auditLog.findFirst({
    where: {
      tenantId: tenant.id,
      action: 'WEBHOOK_DELIVERY',
    },
    orderBy: { timestamp: 'desc' },
  });
  const metaAuditState = metaAudit && typeof metaAudit.afterState === 'string' ? JSON.parse(metaAudit.afterState) : (metaAudit?.afterState || {});
  assert(
    metaAuditState.status === 'DUPLICATE' && metaAuditState.summary?.includes('Duplicate phone lead match'),
    `Meta webhook detected duplicate phone match in background processing (audit status: ${metaAuditState.status})`
  );

  // --- 6. Entry Point: WhatsApp Webhook ---
  console.log('\n--- 6. Testing WhatsApp Webhook Duplicate Matching ---');
  const resWa = await fetch(`${apiBase}/webhooks/whatsapp/${plainKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      customerPhone: '9876543210', // 10 digits
      name: 'Benchmark Person Duplicate',
      message: 'Hello WhatsApp inquiry',
      source: 'whatsapp',
    }),
  });

  const dataWa = await resWa.json();
  console.log('  WhatsApp response:', resWa.status, dataWa);
  assert(
    resWa.status === 200 && dataWa.status === 'ACCEPTED',
    `WhatsApp webhook accepted payload for async processing (deliveryId: ${dataWa.deliveryId})`
  );

  // Allow async delivery processing
  await new Promise((r) => setTimeout(r, 800));
  const waAudit = await prisma.auditLog.findFirst({
    where: {
      tenantId: tenant.id,
      action: 'WEBHOOK_DELIVERY',
    },
    orderBy: { timestamp: 'desc' },
  });
  const waAuditState = waAudit && typeof waAudit.afterState === 'string' ? JSON.parse(waAudit.afterState) : (waAudit?.afterState || {});
  assert(
    waAuditState.status === 'DUPLICATE' && waAuditState.summary?.includes('Duplicate phone lead match'),
    `WhatsApp webhook detected duplicate phone match in background processing (audit status: ${waAuditState.status})`
  );

  // --- 7. Entry Point: Website Form Webhook ---
  console.log('\n--- 7. Testing Website Form Webhook Duplicate Matching ---');
  const resWeb = await fetch(`${apiBase}/webhooks/website/${plainKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Benchmark Person Duplicate',
      phone: '9876543210', // 10 digits matching stored '+91 98765 43210'
      email: testEmailBenchmark,
      message: 'Website contact form submission',
    }),
  });

  const dataWeb = await resWeb.json();
  console.log('  Website response:', resWeb.status, dataWeb);
  assert(
    resWeb.status === 200 && dataWeb.isDuplicate === true,
    `Website webhook marked isDuplicate: true across '9876543210' and stored '${testPhoneBenchmark}'`
  );

  // --- 8. Clean up Benchmark Lead & Verify Stored Data Unchanged ---
  console.log('\n--- 8. Clean-up & Verification of Database State ---');
  await prisma.lead.delete({
    where: { id: benchmarkLead.id },
  });
  console.log('  Cleaned up temporary benchmark lead.');

  // Confirm legacy lead +915289541841 remains untouched in dev DB
  const legacyLead = await prisma.lead.findFirst({
    where: { customerPhone: '+915289541841' },
  });
  assert(
    Boolean(legacyLead),
    `Dev database stored data intact: legacy lead '+915289541841' unchanged (not converted)`
  );

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
