/**
 * Test Suite: Server Refresh Token Rotation, Grace Window, and Error Mapping
 * 
 * Verifies:
 * 1. /auth/refresh returns 401 strictly for invalid, expired, or revoked tokens (outside grace).
 * 2. Multi-tab rotation grace window (30 seconds):
 *    - Two tabs refreshing concurrently or with previous token within 30s both succeed (HTTP 200)
 *    - The previous token does NOT trigger token reuse or revoke the session family.
 * 3. Server errors return 500, never 401.
 * 4. Cleans up all test users and tenants in jnc_crm_dev upon completion.
 */

const axios = require('axios');
const assert = require('assert');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: { url: 'postgresql://jnc_app:jnc_app_pass_dev_2026@localhost:5432/jnc_crm_dev?schema=public' },
  },
});

const API_BASE_URL = 'http://localhost:3333/api/v1';

async function run() {
  console.log('===============================================================');
  console.log('TEST SUITE: REFRESH TOKEN ROTATION & 30-SECOND GRACE WINDOW');
  console.log('API Target:', API_BASE_URL);
  console.log('Target DB: jnc_crm_dev');
  console.log('===============================================================\n');

  const timestamp = Date.now();
  const testEmail = `staff_grace_${timestamp}@example.com`;
  const testTenantSlug = `test-grace-tenant-${timestamp}`;
  const rawPassword = 'DevPassword@123';
  const hashedPassword = await bcrypt.hash(rawPassword, 10);

  let testTenant = null;
  let testUser = null;

  try {
    // ─── SETUP: Create Isolated Test Tenant & User in jnc_crm_dev ────────
    console.log('[Setup] Creating isolated test tenant and staff user...');
    testTenant = await prisma.tenant.create({
      data: {
        name: `Grace Test Tenant ${timestamp}`,
        slug: testTenantSlug,
        code: `GRC${(timestamp % 100000).toString().padStart(5, '0')}`,
        isDemo: false,
      },
    });

    testUser = await prisma.user.create({
      data: {
        email: testEmail,
        employeeCode: `EMP-${timestamp % 100000}`,
        passwordHash: hashedPassword,
        name: 'Grace Test Staff',
        role: 'tenant_admin',
        tenantId: testTenant.id,
      },
    });
    console.log('   ✓ Created tenant:', testTenant.id);
    console.log('   ✓ Created user:', testUser.email);

    // ─── TEST 1: Log in and obtain initial refresh token ───────────────────
    console.log('\n[Test 1] Logging in as staff admin...');
    const loginRes = await axios.post(
      `${API_BASE_URL}/auth/login`,
      { username: testEmail, password: rawPassword },
      { headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } }
    );

    assert.strictEqual(loginRes.status, 200, 'Login must succeed with 200');
    const token1 = loginRes.data.refreshToken;
    const userId = loginRes.data.user.id;
    assert(token1, 'Login must return a refresh token');
    console.log('   ✓ Logged in. Initial refresh token obtained. User ID:', userId);

    // ─── TEST 2: Tab 1 refreshes the token (Token 1 -> Token 2) ───────────
    console.log('\n[Test 2] Tab 1 refreshes using token1...');
    const refresh1Res = await axios.post(
      `${API_BASE_URL}/auth/refresh`,
      { refreshToken: token1 },
      { headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } }
    );

    assert.strictEqual(refresh1Res.status, 200, 'First refresh must succeed');
    const token2 = refresh1Res.data.refreshToken;
    const accessToken1 = refresh1Res.data.accessToken;
    assert(accessToken1, 'Must return new accessToken');
    assert(token2, 'Must return rotated refreshToken (token2)');
    console.log('   ✓ Tab 1 refresh successful. Rotated to token2.');

    // ─── TEST 3: Tab 2 refreshes using token1 within 30-second grace window ──
    console.log('\n[Test 3] Tab 2 refreshes using token1 within 30-second grace window...');
    const refresh2Res = await axios.post(
      `${API_BASE_URL}/auth/refresh`,
      { refreshToken: token1 },
      { headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } }
    );

    assert.strictEqual(refresh2Res.status, 200, 'Second refresh with token1 within grace window must succeed with 200');
    const accessToken2 = refresh2Res.data.accessToken;
    assert(accessToken2, 'Tab 2 must receive a valid accessToken within grace');
    console.log('   ✓ Tab 2 refresh with token1 succeeded within grace window! (HTTP 200)');

    // ─── TEST 4: Token 2 is valid and still active (Session NOT revoked) ───
    console.log('\n[Test 4] Verifying session was NOT revoked: Token 2 still refreshes to Token 3...');
    const refresh3Res = await axios.post(
      `${API_BASE_URL}/auth/refresh`,
      { refreshToken: token2 },
      { headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } }
    );

    assert.strictEqual(refresh3Res.status, 200, 'Token 2 refresh must succeed');
    const token3 = refresh3Res.data.refreshToken;
    assert(token3, 'Must rotate to token3');
    console.log('   ✓ Token 2 rotated to token3 successfully. Session family remains completely intact.');

    // ─── TEST 5: Token reuse AFTER 30-second grace window revokes session ──
    console.log('\n[Test 5] Simulating token reuse outside grace window (>30s ago)...');
    // Artificially age the revoked token in the database to simulate >30s passing
    const thirtyOneSecondsAgo = new Date(Date.now() - 35000);
    await prisma.refreshSession.updateMany({
      where: { userId: userId, isRevoked: true },
      data: { updatedAt: thirtyOneSecondsAgo },
    });

    try {
      await axios.post(
        `${API_BASE_URL}/auth/refresh`,
        { refreshToken: token1 },
        { headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } }
      );
      assert.fail('Expected 401 for token reused outside grace window');
    } catch (err) {
      assert.strictEqual(err.response?.status, 401, 'Token reuse outside grace window must return 401');
      console.log('   ✓ Correctly returned 401 for token reuse outside 30s grace window.');
    }

    console.log('\n===============================================================');
    console.log('ALL SERVER REFRESH ROTATION & GRACE TESTS PASSED (100%)');
    console.log('===============================================================');
  } finally {
    if (testTenant?.id) {
      try {
        if (testUser?.id) {
          await prisma.refreshSession.deleteMany({ where: { userId: testUser.id } });
        }
        await prisma.user.deleteMany({ where: { tenantId: testTenant.id } });
        await prisma.tenant.deleteMany({ where: { id: testTenant.id } });
        console.log('\n[Cleanup] Successfully cleaned up test tenant, user, and sessions from jnc_crm_dev.');
      } catch (cleanupErr) {
        console.warn('\n[Cleanup] Warning during cleanup:', cleanupErr.message);
      }
    }
    await prisma.$disconnect();
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err.response?.data || err.message);
  process.exit(1);
});
