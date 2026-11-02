import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev',
    },
  },
});

async function main() {
  console.log('================================================================================');
  console.log('PUBLIC WEB FORM DEDUPLICATION & PRIVACY VERIFICATION TEST');
  console.log('Target API: http://localhost:3333/api/v1/inquiry | Database: jnc_crm_dev');
  console.log('Timestamp:', new Date().toISOString());
  console.log('================================================================================\n');

  // Find active tenant with website key
  const tenant = await prisma.tenant.findFirst({
    where: { code: 'ACME-DEV-001' },
  });
  if (!tenant) throw new Error('ACME-DEV-001 tenant not found');

  // Fetch or create webhook key on tenant
  const key = 'whv_' + crypto.randomBytes(16).toString('hex');
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { webhookKeyHash: keyHash },
  });

  // Ensure web form settings are enabled
  await prisma.systemSetting.upsert({
    where: { key: `web_form_settings:${tenant.id}` },
    create: {
      key: `web_form_settings:${tenant.id}`,
      value: JSON.stringify({ isEnabled: true, allowedOrigins: [] }),
    },
    update: {
      value: JSON.stringify({ isEnabled: true, allowedOrigins: [] }),
    },
  });

  const testPhone = '98' + Math.floor(10000000 + Math.random() * 89999999).toString();
  const testEmail = `contact_${Date.now()}@example.com`;

  console.log(`[TEST DATA] Target Phone: +91 ${testPhone} | Target Email: ${testEmail}`);

  // 1. Initial Submission
  console.log('\n--- 1. Initial Inquiry Submission ---');
  const res1 = await fetch(`http://localhost:3333/api/v1/public-inquiry?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Rohan Sharma',
      phone: `+91 ${testPhone}`,
      email: testEmail,
      company: 'Rohan Industrial Corp',
      message: 'Need 5 units of industrial amplifiers',
    }),
  });
  const data1 = await res1.json();
  console.log(`Initial submission response: HTTP ${res1.status}`, data1);

  // 2. Submission with same phone but DIFFERENT email (MUST NOT be duplicate!)
  console.log('\n--- 2. Submission with SAME Phone but DIFFERENT Email ---');
  const diffEmail = `different_${Date.now()}@example.com`;
  const res2 = await fetch(`http://localhost:3333/api/v1/public-inquiry?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Pooja Sharma',
      phone: `0${testPhone}`, // different formatting, same 10 digits
      email: diffEmail,
      company: 'Pooja Logistics',
      message: 'Need 2 speakers',
    }),
  });
  const data2 = await res2.json();
  console.log(`Same phone, diff email response: HTTP ${res2.status}`, data2);

  // 3. Submission with matching exact 10-digit phone AND exact email (IS Duplicate Contact)
  console.log('\n--- 3. Submission with EXACT Same Phone AND Email (Duplicate) ---');
  const res3 = await fetch(`http://localhost:3333/api/v1/public-inquiry?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Rohan Sharma (Followup)',
      phone: `+91-${testPhone}`,
      email: testEmail.toUpperCase(), // Case insensitive match
      company: 'Rohan Industrial Corp',
      message: 'Urgent follow-up regarding amplifier quotation',
    }),
  });
  const data3 = await res3.json();
  console.log(`Duplicate submission response: HTTP ${res3.status}`, data3);

  // 4. Verify in Database
  console.log('\n--- 4. Database Audit of Created Leads ---');
  const createdLeads = await prisma.lead.findMany({
    where: {
      tenantId: tenant.id,
      customerPhone: { contains: testPhone },
    },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`Total Leads Created in DB for this phone: ${createdLeads.length}`);
  for (const l of createdLeads) {
    console.log(`  • Lead ${l.leadNumber}: Name="${l.customerName}", Email="${l.customerEmail}", Category="${l.productCategory}"`);
  }

  // 5. Assertions
  console.log('\n================================================================================');
  console.log('PUBLIC FORM PRIVACY & DEDUPLICATION REPORT');
  console.log('================================================================================');

  let passed = true;
  function assert(label: string, cond: boolean) {
    if (cond) {
      console.log(`[PASS] ${label}`);
    } else {
      console.error(`[FAIL] ${label}`);
      passed = false;
    }
  }

  assert('Different email was NOT flagged as duplicate (exact phone AND email required)', data2.isDuplicate === false);
  assert('Matching exact phone AND email WAS recognized as duplicate contact', data3.isDuplicate === true);
  assert('Public response NEVER returned existing internal lead number', !data3.leadNumber && !data1.leadNumber);
  assert('Public response provided safe public reference number', Boolean(data3.referenceNumber));
  assert('Merged nothing silently: duplicate created an explicit actionable repeat lead in DB', createdLeads.length === 3);

  if (passed) {
    console.log('\n>>> PUBLIC FORM RULES: 100% VERIFIED AND PASSING <<<\n');
  } else {
    console.error('\n>>> TEST FAILED <<<\n');
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
