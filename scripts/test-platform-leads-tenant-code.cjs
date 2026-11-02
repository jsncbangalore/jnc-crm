const assert = require('assert');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://jnc_app:jnc_app_pass_dev_2026@localhost:5432/jnc_crm_dev' } }
});

async function main() {
  console.log('========================================================================');
  console.log('TEST: PLATFORM_LEADS_TENANT_ID WITH NON-UUID CODE RESOLUTION');
  console.log('========================================================================\n');

  // 1. Verify tenant with code ACME-DEV-001 exists
  const tenant = await prisma.tenant.findUnique({
    where: { code: 'ACME-DEV-001' }
  });
  assert(tenant, 'Tenant with code ACME-DEV-001 must exist');
  console.log(`1. Found Target Tenant: "${tenant.name}" (Code: ${tenant.code}, UUID: ${tenant.id})`);

  // 2. Submit public demo request to API
  const testEmail = `demo-tester-${Date.now()}@example.com`;
  console.log(`2. Submitting public demo request with email: ${testEmail}...`);

  const res = await fetch('http://127.0.0.1:3333/api/v1/public/demo-request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'http://localhost:5173'
    },
    body: JSON.stringify({
      name: 'Non-UUID Code Tester',
      email: testEmail,
      phone: '+919876543210',
      companyName: 'Acme Non-UUID Tests Inc',
      companySize: '11-50',
      message: 'Testing PLATFORM_LEADS_TENANT_ID non-UUID tenant code resolution'
    })
  });

  const body = await res.json();
  console.log(`API Response Status: ${res.status}`);
  console.log('API Response Body:', body);

  assert.ok(res.status === 200 || res.status === 201, `Expected 200/201, got ${res.status}`);
  assert.strictEqual(body.status, 'SUCCESS', 'Response status must be SUCCESS');

  // 3. Verify in database that lead was inserted under tenant.id
  const createdLead = await prisma.lead.findFirst({
    where: {
      customerEmail: testEmail,
      tenantId: tenant.id
    }
  });

  assert(createdLead, `Lead with email ${testEmail} must exist in tenant ${tenant.id}`);
  console.log(`3. Verified in DB: Lead created successfully!`);
  console.log(`   - Lead ID:     ${createdLead.id}`);
  console.log(`   - Lead Number: ${createdLead.leadNumber}`);
  console.log(`   - Tenant ID:   ${createdLead.tenantId} (Matches ACME-DEV-001 UUID)`);

  // Cleanup test lead
  await prisma.lead.delete({ where: { id: createdLead.id } });
  console.log('4. Cleaned up test lead fixture.');

  await prisma.$disconnect();
  console.log('\n========================================================================');
  console.log('✓ PLATFORM_LEADS_TENANT_ID NON-UUID CODE RESOLUTION TEST PASSED!');
  console.log('========================================================================\n');
}

main().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
