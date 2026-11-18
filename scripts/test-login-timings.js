/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const API_BASE = 'http://localhost:3333/api/v1';

async function measure() {
  console.log('--- Measuring Local Authentication & Verification Timings ---');

  // 1. Password login for valid test user
  const t0 = performance.now();
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: 'smoke-user@syntracrm.local',
      password: 'NewSecret#Password2026!',
    }),
  });
  const t1 = performance.now();
  const loginTime = Math.round(t1 - t0);
  const loginData = await loginRes.json();
  console.log(`[LOGIN TIMING] POST /auth/login: ${loginTime} ms (Status: ${loginRes.status})`);

  // 2. 2FA Email Code Dispatch (if ticket returned)
  let emailDispatchTime = 0;
  let verifyTime = 0;
  if (loginData.loginTicket) {
    const t2 = performance.now();
    const emailRes = await fetch(`${API_BASE}/auth/login/send-2fa-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginTicket: loginData.loginTicket }),
    });
    const t3 = performance.now();
    emailDispatchTime = Math.round(t3 - t2);
    console.log(`[2FA DISPATCH TIMING] POST /auth/login/send-2fa-email: ${emailDispatchTime} ms`);
  }

  // 3. Lightweight Liveness Check Timing
  const t4 = performance.now();
  const liveRes = await fetch(`${API_BASE}/health/live`);
  const t5 = performance.now();
  const liveTime = Math.round(t5 - t4);
  console.log(`[HEALTH LIVE TIMING] GET /health/live: ${liveTime} ms (Status: ${liveRes.status})`);

  // 4. Readiness Check Timing
  const t6 = performance.now();
  const readyRes = await fetch(`${API_BASE}/health/ready`);
  const t7 = performance.now();
  const readyTime = Math.round(t7 - t6);
  console.log(`[HEALTH READY TIMING] GET /health/ready: ${readyTime} ms (Status: ${readyRes.status})`);

  return {
    loginTime,
    emailDispatchTime,
    liveTime,
    readyTime,
  };
}

measure().catch(console.error);
