/**
 * SCRIPT: REPRODUCE & VERIFY LEAD DEDUPLICATION WITH NETWORK LOG
 * 
 * Demonstrates:
 * 1. Concurrent public form submissions with identical phone number
 * 2. Detailed network log of both requests and responses
 * 3. Proves root cause fix: duplicate lead creation is eliminated (deduplicated into activity note)
 * 4. Verifies database contains exactly ONE lead record for that contact
 */

const axios = require('axios');
const assert = require('assert');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://jnc_app:jnc_app_pass_dev_2026@localhost:5432/jnc_crm_dev?schema=public',
    },
  },
});

const API_BASE = 'http://127.0.0.1:3333/api/v1';

async function main() {
  console.log('========================================================================');
  console.log('LEAD DEDUPLICATION & NETWORK CONCURRENCY VERIFICATION');
  console.log('========================================================================\n');

  await prisma.$connect();

  const testPhone = `+91999${Date.now().toString().slice(-7)}`;
  const testEmail = `lead.dedup.${Date.now()}@example.com`;
  const leadPayload = {
    name: 'Concurrent Lead Tester',
    phone: testPhone,
    email: testEmail,
    message: 'Rapid duplicate submission test from network',
  };

  console.log(`[NETWORK LOG] Preparing concurrent submissions for phone: ${testPhone}`);
  console.log(`[NETWORK LOG] POST ${API_BASE}/public/demo-request`);

  // Issue 2 concurrent submissions simultaneously
  const timestampStart = Date.now();
  console.log(`[NETWORK REQ 1] --> POST /public/demo-request at t=${timestampStart}ms`);
  console.log(`[NETWORK REQ 2] --> POST /public/demo-request at t=${timestampStart}ms`);

  const [res1, res2] = await Promise.all([
    axios.post(`${API_BASE}/public/demo-request`, leadPayload, {
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    }),
    axios.post(`${API_BASE}/public/demo-request`, leadPayload, {
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    }),
  ]);

  const timestampEnd = Date.now();
  console.log(`\n[NETWORK RES 1] <-- Status ${res1.status} (${timestampEnd - timestampStart}ms):`);
  console.log('   Data:', JSON.stringify(res1.data));
  console.log(`[NETWORK RES 2] <-- Status ${res2.status} (${timestampEnd - timestampStart}ms):`);
  console.log('   Data:', JSON.stringify(res2.data));

  assert.strictEqual(res1.status, 200, 'Request 1 should return 200 OK');
  assert.strictEqual(res2.status, 200, 'Request 2 should return 200 OK');

  // Verify Lead records in database
  console.log('\n[DATABASE AUDIT] Querying database for leads with phone:', testPhone);
  const leadsInDb = await prisma.lead.findMany({
    where: { customerPhone: testPhone },
    include: { activities: true },
  });

  console.log(` -> Found ${leadsInDb.length} lead row(s) in database.`);
  leadsInDb.forEach((lead, idx) => {
    console.log(`   [Row ${idx + 1}] ID: ${lead.id}, Number: ${lead.leadNumber}, Status: ${lead.status}, CreatedAt: ${lead.createdAt.toISOString()}`);
    console.log(`      Activities: ${lead.activities.length} attached`);
    lead.activities.forEach((act, aIdx) => {
      console.log(`        Act ${aIdx + 1}: ${act.type} - ${act.title} - ${act.description}`);
    });
  });

  // Strict Assertion: Exactly ONE Lead record must exist
  assert.strictEqual(
    leadsInDb.length,
    1,
    `Root cause fix failed: Expected exactly 1 lead in database, found ${leadsInDb.length}`
  );
  console.log('\n -> [PASS] PROVED: Concurrency deduplication eliminated duplicate lead row.');

  // Clean up test data
  console.log('\n[CLEANUP] Removing test lead and activities ...');
  if (leadsInDb.length > 0) {
    const leadId = leadsInDb[0].id;
    await prisma.leadActivity.deleteMany({ where: { leadId } }).catch(() => {});
    await prisma.lead.deleteMany({ where: { id: leadId } }).catch(() => {});
  }
  await prisma.$disconnect();
  console.log(' -> Cleanup complete.');

  console.log('\n========================================================================');
  console.log('LEAD DEDUPLICATION VERIFICATION PASSED (EXIT CODE 0)');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('\n[FATAL ERROR IN LEAD DEDUP TEST]', err);
  process.exit(1);
});
