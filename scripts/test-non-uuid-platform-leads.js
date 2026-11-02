const assert = require('assert');
const { PrismaClient } = require('@prisma/client');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev?schema=public';
const prisma = new PrismaClient();

async function testNonUuidPlatformLeads() {
  console.log('=== TEST: PLATFORM_LEADS_TENANT_ID RESOLUTION (NON-UUID & UUID) ===\n');

  // Find an active tenant
  const tenant = await prisma.tenant.findFirst({ where: { status: 'active', deletedAt: null } });
  assert(tenant, 'Must have at least one active tenant in DB');
  console.log(`Active tenant in DB: ID="${tenant.id}", Code="${tenant.code}", Name="${tenant.name}"`);

  // Ensure tenant has code set
  const nonUuidCode = tenant.code || 'ACME-DEV-001';
  if (!tenant.code) {
    await prisma.tenant.update({ where: { id: tenant.id }, data: { code: nonUuidCode } });
  }

  // Helper resolving logic (matches WebhooksService.getDefaultTenant)
  async function resolveDefaultTenant(envVal) {
    const configured = envVal?.trim();
    if (configured) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(configured);
      const matched = await prisma.tenant.findFirst({
        where: isUuid
          ? { id: configured, status: 'active', deletedAt: null }
          : { OR: [{ code: configured }, { name: configured }], status: 'active', deletedAt: null },
      });
      if (matched) return matched;
    }
    return prisma.tenant.findFirst({
      where: { status: 'active', deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  // 1. Test with Non-UUID Code (e.g. ACME-DEV-001)
  console.log(`\nTesting non-UUID code: PLATFORM_LEADS_TENANT_ID="${nonUuidCode}"...`);
  const resolvedByCode = await resolveDefaultTenant(nonUuidCode);
  assert(resolvedByCode, 'Tenant should be resolved by code');
  assert.strictEqual(resolvedByCode.id, tenant.id, 'Resolved tenant ID must match tenant ID');
  console.log(`  ✓ Successfully resolved tenant via non-UUID code "${nonUuidCode}" -> ID: ${resolvedByCode.id}`);

  // 2. Test with genuine UUID
  console.log(`\nTesting UUID: PLATFORM_LEADS_TENANT_ID="${tenant.id}"...`);
  const resolvedByUuid = await resolveDefaultTenant(tenant.id);
  assert(resolvedByUuid, 'Tenant should be resolved by UUID');
  assert.strictEqual(resolvedByUuid.id, tenant.id, 'Resolved tenant ID must match');
  console.log(`  ✓ Successfully resolved tenant via UUID "${tenant.id}"`);

  // 3. Test non-existent non-UUID code falls back to first active without Postgres UUID syntax error
  console.log(`\nTesting unknown code: PLATFORM_LEADS_TENANT_ID="UNKNOWN-CODE-999"...`);
  const resolvedFallback = await resolveDefaultTenant('UNKNOWN-CODE-999');
  assert(resolvedFallback, 'Fallback should return default active tenant');
  console.log(`  ✓ Successfully handled unknown non-UUID code without crash -> fallback ID: ${resolvedFallback.id}`);

  console.log('\n✅ ALL PLATFORM_LEADS_TENANT_ID RESOLUTION TESTS PASSED.');
  await prisma.$disconnect();
}

testNonUuidPlatformLeads().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
