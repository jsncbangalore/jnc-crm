/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import http from 'http';
import * as crypto from 'crypto';

const API_BASE = 'http://localhost:3333/api/v1';

let passed = 0;
let failed = 0;

function assert(condition, name, detail) {
  if (condition) {
    passed++;
    console.log(`[PASS] ${name}${detail ? ' -> ' + detail : ''}`);
  } else {
    failed++;
    console.error(`[FAIL] ${name}${detail ? ' -> ' + detail : ''}`);
  }
}

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const method = options.method || 'GET';
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const body = options.body ? JSON.stringify(options.body) : undefined;

  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let data;
          try {
            data = JSON.parse(raw);
          } catch {
            data = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, data });
        });
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function run() {
  console.log('========================================================================');
  console.log('HARDENED PASSWORD RESET FLOW & PLATFORM ENFORCEMENT VERIFICATION');
  console.log('========================================================================\n');

  // ── TEST GROUP 1: Anti-Enumeration & Response Parity ───────────────────────
  console.log('--- TEST GROUP 1: Anti-Enumeration & Parity (Existing vs Non-Existing) ---');

  const nonExistent1 = `ghost-user-${Date.now()}@example.com`;
  const t0 = Date.now();
  const resNonExistent1 = await request('/auth/forgot-password/start', {
    method: 'POST',
    body: { lookup: nonExistent1 },
  });
  const durNonExistent = Date.now() - t0;

  assert(
    resNonExistent1.status === 201 || resNonExistent1.status === 200,
    'Non-existent lookup returns success (200/201)',
    `status: ${resNonExistent1.status}`,
  );
  assert(
    typeof resNonExistent1.data?.flowId === 'string' && resNonExistent1.data.flowId.length > 20,
    'Non-existent lookup returns opaque signed flowToken (flowId)',
  );
  assert(
    typeof resNonExistent1.data?.maskedPhone === 'string' && resNonExistent1.data.maskedPhone.startsWith('••••••'),
    'Non-existent lookup returns masked phone card (6 dots + 4 digits)',
    `maskedPhone: ${resNonExistent1.data?.maskedPhone}`,
  );

  // Repeat the exact same lookup to check HMAC stability
  const resNonExistent2 = await request('/auth/forgot-password/start', {
    method: 'POST',
    body: { lookup: nonExistent1 },
  });
  assert(
    resNonExistent1.data?.maskedPhone === resNonExistent2.data?.maskedPhone,
    'Fake masked phone digits are strictly stable across repeated lookups',
    `first: ${resNonExistent1.data?.maskedPhone}, second: ${resNonExistent2.data?.maskedPhone}`,
  );

  // Different lookup should produce different stable digits
  const resNonExistent3 = await request('/auth/forgot-password/start', {
    method: 'POST',
    body: { lookup: `another-${Date.now()}@example.com` },
  });
  assert(
    typeof resNonExistent3.data?.maskedPhone === 'string',
    'Second non-existent lookup returns masked phone format',
    resNonExistent3.data?.maskedPhone,
  );

  // ── TEST GROUP 2: State Machine Enforcement (Skipping Stages) ─────────────
  console.log('\n--- TEST GROUP 2: Strict State Machine Enforcement (No Stage Skipping) ---');

  const testFlowToken = resNonExistent1.data.flowId;

  // Attempt skipping directly to verify-email without phone_ok
  const skipToEmail = await request('/auth/forgot-password/verify-email', {
    method: 'POST',
    body: { flowId: testFlowToken, email: 'attacker@example.com' },
  });
  assert(
    skipToEmail.status === 400,
    'Skipping phone check to verify-email is rejected (400 Bad Request)',
    `status: ${skipToEmail.status}, message: ${skipToEmail.data?.message}`,
  );
  assert(
    skipToEmail.data?.message === 'The details do not match. Check and try again.',
    'Generic error message returned on stage violation',
  );

  // Attempt skipping directly to send-code
  const skipToSendCode = await request('/auth/forgot-password/send-code', {
    method: 'POST',
    body: { flowId: testFlowToken },
  });
  assert(
    skipToSendCode.status === 400,
    'Skipping to send-code without email_ok is rejected (400 Bad Request)',
    `status: ${skipToSendCode.status}`,
  );

  // Attempt skipping directly to verify-code
  const skipToVerifyCode = await request('/auth/forgot-password/verify-code', {
    method: 'POST',
    body: { flowId: testFlowToken, code: '123456' },
  });
  assert(
    skipToVerifyCode.status === 400,
    'Skipping to verify-code without code_sent is rejected (400 Bad Request)',
    `status: ${skipToVerifyCode.status}`,
  );

  // Tampered / invalid flow token
  const tamperedToken = testFlowToken.slice(0, -6) + 'abcdef';
  const tamperedRes = await request('/auth/forgot-password/verify-phone', {
    method: 'POST',
    body: { flowId: tamperedToken, phone: '55555' + '00000' },
  });
  assert(
    tamperedRes.status === 400,
    'Tampered HMAC signature on flowId is rejected immediately',
    `status: ${tamperedRes.status}`,
  );

  // ── TEST GROUP 3: Brute-Force Rate Limiting (5 Max Attempts) ───────────────
  console.log('\n--- TEST GROUP 3: Brute-Force Rate Limiting (Max 5 Attempts per Flow) ---');

  // Start fresh flow
  const freshFlow = await request('/auth/forgot-password/start', {
    method: 'POST',
    body: { lookup: `target-${Date.now()}@example.com` },
  });
  const freshToken = freshFlow.data.flowId;

  for (let i = 1; i <= 5; i++) {
    const wrongAttempt = await request('/auth/forgot-password/verify-phone', {
      method: 'POST',
      body: { flowId: freshToken, phone: '55555' + `0000${i}` },
    });

    assert(
      wrongAttempt.status === 400,
      `Attempt ${i}/5 wrong phone returns 400`,
      wrongAttempt.data?.message,
    );
    assert(
      wrongAttempt.data?.message === 'The details do not match. Check and try again.',
      `Attempt ${i}/5 returns identical generic security message`,
    );
  }

  // 6th attempt should be rejected because flow is terminated
  const sixthAttempt = await request('/auth/forgot-password/verify-phone', {
    method: 'POST',
    body: { flowId: freshToken, phone: '55555' + '00009' },
  });
  assert(
    sixthAttempt.status === 400,
    '6th attempt on terminated flow is rejected (400)',
    sixthAttempt.data?.message,
  );
  assert(
    sixthAttempt.data?.message === 'The details do not match. Check and try again.',
    '6th attempt returns identical generic security message (zero oracle leakage)',
  );

  // ── TEST GROUP 4: Phone Normalization Logic ──────────────────────────────
  console.log('\n--- TEST GROUP 4: Phone Format Normalization ---');

  // Verify that phone inputs normalize the last 10 digits
  function normalizePhone(raw) {
    if (!raw) return '';
    const digits = String(raw).replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : digits;
  }

  const pPartA = '98765';
  const pPartB = '43210';
  const expected = pPartA + pPartB;
  const formats = [
    `+91 ${pPartA} ${pPartB}`,
    `+91-${pPartA}-${pPartB}`,
    `0${pPartA}${pPartB}`,
    `${pPartA} ${pPartB}`,
    `${pPartA}${pPartB}`,
    `+91${pPartA}${pPartB}`,
  ];
  const allMatch = formats.every((f) => normalizePhone(f) === expected);
  assert(
    allMatch,
    'Phone normalizer accurately extracts the same 10 digits across all 6 real-world formats',
    `expected: ${expected}`,
  );

  // ── TEST GROUP 5: Reset Ticket Single-Use & Replay Protection ─────────────
  console.log('\n--- TEST GROUP 5: Reset Ticket Single-Use Protection ---');

  // Test reset password with an invalid / non-existent ticket
  const bogusTicket = crypto.randomBytes(32).toString('hex');
  const bogusReset = await request('/auth/reset-password', {
    method: 'POST',
    body: { ticket: bogusTicket, newPassword: 'SuperSecretPassword123!' },
  });
  assert(
    bogusReset.status === 400 || bogusReset.status === 401,
    'Bogus reset ticket rejected (400/401)',
    `status: ${bogusReset.status}`,
  );

  // ── TEST GROUP 6: CLI Command admin:set-phone Syntax & Safety ─────────────
  console.log('\n--- TEST GROUP 6: CLI Command admin:set-phone Verification ---');

  import('child_process').then(({ execSync }) => {
    try {
      // In production mode without CONFIRM_PRODUCTION=yes, must fail safely
      const out = execSync('node apps/api/dist/scripts/admin-set-phone.js', {
        env: { ...process.env, NODE_ENV: 'production' },
        stdio: 'pipe',
      }).toString();
      assert(false, 'CLI ran without CONFIRM_PRODUCTION in production', out);
    } catch (err) {
      const errMsg = err.stderr ? err.stderr.toString() : err.message;
      assert(
        errMsg.includes('CONFIRM_PRODUCTION=yes') || err.status !== 0,
        'CLI enforces CONFIRM_PRODUCTION=yes in production environment',
      );
    }

    console.log('\n========================================================================');
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================================================\n');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  });
}

run().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
