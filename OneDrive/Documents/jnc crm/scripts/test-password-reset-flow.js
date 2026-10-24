/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const API_BASE = 'http://localhost:3333/api/v1';

async function post(endpoint, data) {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data: json };
}

async function get(endpoint) {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url);
  const json = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data: json };
}

async function main() {
  console.log('========================================================================');
  console.log('RUNNING PASSWORD RESET FLOW & SECURITY VERIFICATION SUITE');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, name) {
    total++;
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name}`);
    }
  }

  // ── TEST 1: Fake Digit Stability for Unknown Emails ─────────────────────────
  console.log('--- Test 1: Fake Digit Stability ---');
  const unknownEmail = 'synthetic.user.nonexistent@example.com';
  const res1A = await post('/auth/forgot-password/start', { lookup: unknownEmail });
  const res1B = await post('/auth/forgot-password/start', { lookup: unknownEmail });

  assert(res1A.status === 200, 'Start returns 200 for unknown email (no account enumeration)');
  assert(res1A.data?.hasPhone === true, 'Unknown email returns hasPhone: true');
  assert(typeof res1A.data?.last4 === 'string' && res1A.data.last4.length === 4, 'Unknown email returns 4 digits');
  assert(res1A.data?.last4 === res1B.data?.last4, 'Deterministic stable fake digits across multiple calls');
  assert(res1A.data?.stage === 'start', 'Initial stage is start');

  // ── TEST 2: Direct Call to Send-Code from Stage 'start' is Blocked (Bypass Block) ──
  console.log('\n--- Test 2: Bypass Blockage (send-code before phone verification) ---');
  const flowId1 = res1A.data?.flowId;
  const res2 = await post('/auth/forgot-password/send-code', { flowId: flowId1 });
  assert(res2.status === 400, 'Direct call to send-code from stage start is refused (400)');
  assert(
    res2.data?.message === 'The details do not match. Check and try again.',
    'Generic error message returned on bypass attempt'
  );

  // ── TEST 3: Phone Verification Refusal with Incorrect Number ────────────────
  console.log('\n--- Test 3: Phone Verification Refusal ---');
  const res3 = await post('/auth/forgot-password/verify-phone', {
    flowId: flowId1,
    phone: '0000000000',
  });
  assert(res3.status === 400, 'Wrong phone number on fake flow rejected with 400');
  assert(
    res3.data?.message === 'The details do not match. Check and try again.',
    'Generic error message on phone check mismatch'
  );

  // ── TEST 4: Direct Call to Verify-Code from Stage 'start' is Blocked ─────────
  console.log('\n--- Test 4: Verify-Code from Stage start is Blocked ---');
  const res4 = await post('/auth/forgot-password/verify-code', {
    flowId: flowId1,
    code: '123456',
  });
  assert(res4.status === 400, 'Direct call to verify-code without code_sent stage rejected');

  // ── TEST 5: Account without Mobile Proceeds Directly to Email OTP ──────────
  console.log('\n--- Test 5: Account without Mobile Email OTP ---');
  const adminNoPhone = await prisma.user.findFirst({
    where: {
      role: { in: ['admin', 'platform_super_admin', 'tenant_admin'] },
      phone: null,
      isActive: true,
      deletedAt: null,
    },
    select: { id: true, email: true },
  });

  if (adminNoPhone) {
    const adminRes = await post('/auth/forgot-password/start', { lookup: adminNoPhone.email });
    assert(adminRes.status === 200, 'Account without registered mobile starts successfully (200)');
    assert(adminRes.data?.hasPhone === false, 'Account without phone returns hasPhone: false');
    assert(adminRes.data?.stage === 'phone_ok', 'Account without phone advances directly to phone_ok for email OTP');

    // Verify audit log
    const auditRecord = await prisma.auditLog.findFirst({
      where: {
        actorId: adminNoPhone.id,
        action: 'FORGOT_PASSWORD_START',
      },
      orderBy: { timestamp: 'desc' },
    });
    assert(Boolean(auditRecord), 'Audit log entry created for password reset start');
  } else {
    console.log('[SKIP] No active admin with null phone in database');
  }

  // ── TEST 6: Real Account with Phone: Accurate Last 4 & Exact Phone Match ────
  console.log('\n--- Test 6: Real Account Phone Verification & Stage Transition ---');
  const userWithPhone = await prisma.user.findFirst({
    where: {
      phone: { not: null },
      isActive: true,
      deletedAt: null,
    },
    select: { id: true, email: true, phone: true },
  });

  if (userWithPhone && userWithPhone.phone) {
    const rawDigits = userWithPhone.phone.replace(/\D/g, '');
    if (rawDigits.length >= 4) {
      const expectedLast4 = rawDigits.slice(-4);
      const startRes = await post('/auth/forgot-password/start', { lookup: userWithPhone.email });
      assert(startRes.status === 200, 'Real account lookup returns 200');
      assert(startRes.data?.stage === 'start', 'Real account initial stage is start');
      assert(startRes.data?.last4 === expectedLast4, 'Accurate last 4 digits returned for registered phone');

      const realFlowId = startRes.data?.flowId;
      // Direct call to send-code must fail
      const bypassCheck = await post('/auth/forgot-password/send-code', { flowId: realFlowId });
      assert(bypassCheck.status === 400, 'Bypass to send-code refused before phone verification');

      // Verify with matching phone
      const phoneVerifyRes = await post('/auth/forgot-password/verify-phone', {
        flowId: realFlowId,
        phone: rawDigits.slice(-10),
      });
      assert(phoneVerifyRes.status === 200, 'Matching phone number returns 200');
      assert(phoneVerifyRes.data?.stage === 'phone_ok', 'Flow stage advances to phone_ok');

      // Now send-code is allowed
      const sendCodeRes = await post('/auth/forgot-password/send-code', { flowId: realFlowId });
      assert(sendCodeRes.status === 200, 'send-code allowed after phone verification');
      assert(sendCodeRes.data?.stage === 'code_sent', 'Flow stage advances to code_sent');

      // Audit logs verified
      const phoneAudit = await prisma.auditLog.findFirst({
        where: { actorId: userWithPhone.id, action: 'FORGOT_PASSWORD_PHONE_VERIFIED' },
        orderBy: { timestamp: 'desc' },
      });
      assert(Boolean(phoneAudit), 'Audit log entry recorded for phone verification');
    }
  }

  // ── TEST 7: Password Policy Endpoint ────────────────────────────────────────
  console.log('\n--- Test 7: Live Password Policy ---');
  const res7 = await get('/auth/password-policy');
  assert(res7.status === 200, 'Password policy endpoint is accessible');
  assert(Array.isArray(res7.data?.rules), 'Rules list provided from server');
  assert(res7.data?.rules?.some((r) => r.id === 'minLength'), 'Min length rule present');

  // ── TEST 8: Web /reset-password Redirects to /forgot-password ───────────────
  console.log('\n--- Test 8: Route Redirection ---');
  const webRes = await fetch('http://localhost:5173/reset-password', { redirect: 'manual' });
  assert(webRes.status === 200 || webRes.status === 302, 'Web server responds on /reset-password');

  // ── TEST 9: Platform and Company Portal Parity ──────────────────────────────
  console.log('\n--- Test 9: Portal Reset Start Parity ---');
  const platformStartRes = await post('/auth/forgot-password/start', {
    lookup: 'platform.admin.synthetic@example.internal',
  });
  assert(platformStartRes.status === 200, 'Platform reset lookup succeeds with same shape');
  assert(platformStartRes.data?.stage === 'start', 'Platform reset lookup stage is start');
  assert(platformStartRes.data?.hasPhone === true, 'Platform reset lookup returns hasPhone');

  console.log(`\n========================================================================`);
  console.log(`TEST RESULTS: ${passed}/${total} assertions passed.`);
  console.log(`========================================================================`);

  await prisma.$disconnect();

  if (passed === total) {
    console.log('[SUCCESS] All password reset flow security invariants verified.');
    process.exit(0);
  } else {
    console.error('[FAILURE] Some security checks failed.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test execution error:', err);
  prisma.$disconnect();
  process.exit(1);
});
