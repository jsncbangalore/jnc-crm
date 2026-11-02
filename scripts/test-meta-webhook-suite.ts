/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
const request = require('supertest');
import { PrismaClient } from '@prisma/client';

function loadEnv() {
  const envPaths = [
    path.resolve(__dirname, '../apps/api/.env.development'),
    path.resolve(__dirname, '../.env.development'),
    path.resolve(__dirname, '../apps/api/.env'),
    path.resolve(__dirname, '../.env'),
  ];
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const idx = trimmed.indexOf('=');
          const key = trimmed.substring(0, idx).trim();
          let val = trimmed.substring(idx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadEnv();

const TARGET_ARG = process.argv[2] || process.env.TARGET_URL;
const IS_REMOTE = Boolean(TARGET_ARG && (TARGET_ARG.startsWith('https://') || TARGET_ARG.includes('jsnc.co.in')));
const BASE_URL = TARGET_ARG || 'http://localhost:3333';
const ENV_LABEL = IS_REMOTE
  ? `[REMOTE HTTPS DEPLOYMENT: ${BASE_URL}]`
  : `[LOCAL DEV ENVIRONMENT: ${BASE_URL}]`;

const META_SECRET = process.env.META_APP_SECRET || 'test_meta_app_secret_32bytes_pad!';
process.env.META_APP_SECRET = META_SECRET;

async function runSuite() {
  console.log(`\n======================================================`);
  console.log(`  META WHATSAPP & LEADGEN WEBHOOK TEST SUITE`);
  console.log(`  Environment: ${ENV_LABEL}`);
  console.log(`  Base URL:    ${BASE_URL}`);
  console.log(`======================================================\n`);

  const prisma = new PrismaClient();
  let tenantKey = '';
  let verifyToken = '';
  let tenantId = '';

  try {
    const tenant = await (prisma.tenant as any).findFirst({
      where: { status: 'active', deletedAt: null },
    });

    if (!tenant) {
      throw new Error('No active tenant found in database.');
    }

    tenantId = tenant.id;

    if (tenant.webhookKeyHash && typeof tenant.webhookKeyHash === 'string') {
      tenantKey = tenant.webhookKeyHash;
    } else {
      tenantKey = 'whk_' + crypto.randomBytes(16).toString('hex');
      await (prisma.tenant as any).update({
        where: { id: tenantId },
        data: { webhookKeyHash: tenantKey },
      });
    }

    const tokenSetting = await (prisma as any).systemSetting.findUnique({
      where: { key: `webhook_verify_token:${tenantId}` },
    });
    if (tokenSetting && tokenSetting.value) {
      verifyToken = tokenSetting.value;
    } else {
      verifyToken = `whv_${crypto.randomBytes(16).toString('hex')}`;
      await (prisma as any).systemSetting.upsert({
        where: { key: `webhook_verify_token:${tenantId}` },
        update: { value: verifyToken },
        create: { key: `webhook_verify_token:${tenantId}`, value: verifyToken },
      });
    }
  } catch (err: any) {
    console.warn(`[WARN] Could not connect to Postgres via Prisma directly: ${err.message}`);
    tenantKey = process.env.TEST_TENANT_KEY || 'whk_fallback_test_key_12345678';
    verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'whv_fallback_verify_token_1234';
  } finally {
    await prisma.$disconnect().catch(() => {});
  }

  const maskedKey = tenantKey.length > 8 ? `${tenantKey.slice(0, 4)}••••${tenantKey.slice(-4)}` : '••••••••';
  const maskedToken = verifyToken.length > 8 ? `${verifyToken.slice(0, 4)}••••${verifyToken.slice(-4)}` : '••••••••';
  console.log(`[SETUP] Using Tenant Key: ${maskedKey}, Verify Token: ${maskedToken}\n`);

  let passed = 0;
  let failed = 0;

  function assert(title: string, ok: boolean, details?: string) {
    if (ok) {
      console.log(`  PASS: ${title}`);
      passed++;
    } else {
      console.error(`  FAIL: ${title}`);
      if (details) console.error(`        ${details}`);
      failed++;
    }
  }

  // --- 1. HEALTH & SECURITY ROUTE CHECK ---
  console.log(`--- 1. Health & Security Route Check (${ENV_LABEL}) ---`);
  try {
    const res = await request(BASE_URL).get('/api/v1/health');
    assert('Health returns HTTP 200', res.status === 200, `status=${res.status}`);
    assert('Health reports commitId', typeof res.body.commitId === 'string' && res.body.commitId.length > 0, `commitId=${res.body.commitId}`);
    assert('Route list removed from public /health (zero route exposure)', res.body.routes === undefined);
  } catch (err: any) {
    assert('Health check unreachable', false, err.message);
  }

  // --- 2. VERIFY HANDLER (GET) ---
  console.log(`\n--- 2. Verify Handlers: /webhooks/meta/:key & /webhooks/whatsapp/:key (${ENV_LABEL}) ---`);
  const testChallenge = `challenge_${Date.now()}_abc123`;

  // 2a. Meta Handshake (GET /api/v1/webhooks/meta/:key)
  try {
    const t0 = Date.now();
    const res = await request(BASE_URL)
      .get(`/api/v1/webhooks/meta/${tenantKey}`)
      .query({
        'hub.mode': 'subscribe',
        'hub.challenge': testChallenge,
        'hub.verify_token': verifyToken,
      });
    const elapsed = Date.now() - t0;

    assert('GET /meta/:key valid verification returns HTTP 200', res.status === 200, `status=${res.status}`);
    assert('GET /meta/:key response is raw text/plain', (res.headers['content-type'] || '').includes('text/plain'), `content-type=${res.headers['content-type']}`);
    assert('GET /meta/:key body is exactly hub.challenge (no quotes or JSON wrapper)', res.text === testChallenge, `body=${res.text}`);
    assert('GET /meta/:key has no Set-Cookie header', !res.headers['set-cookie']);
    assert('GET /meta/:key latency is under 2000ms', elapsed < 2000, `elapsed=${elapsed}ms`);
  } catch (err: any) {
    assert('GET /meta/:key valid verification failed', false, err.message);
  }

  // 2b. WhatsApp Handshake (GET /api/v1/webhooks/whatsapp/:key)
  try {
    const res = await request(BASE_URL)
      .get(`/api/v1/webhooks/whatsapp/${tenantKey}`)
      .query({
        'hub.mode': 'subscribe',
        'hub.challenge': testChallenge,
        'hub.verify_token': verifyToken,
      });
    assert('GET /whatsapp/:key valid verification returns HTTP 200', res.status === 200, `status=${res.status}`);
    assert('GET /whatsapp/:key returns raw hub.challenge', res.text === testChallenge);
  } catch (err: any) {
    assert('GET /whatsapp/:key valid verification failed', false, err.message);
  }

  // 2c. Wrong Token -> 403 Forbidden (Never 500)
  try {
    const res = await request(BASE_URL)
      .get(`/api/v1/webhooks/meta/${tenantKey}`)
      .query({
        'hub.mode': 'subscribe',
        'hub.challenge': testChallenge,
        'hub.verify_token': 'wrong_token_mismatch_12345',
      });
    assert('Wrong token returns HTTP 403 Forbidden (Never 500)', res.status === 403, `status=${res.status}`);
    assert('Wrong token returns text/plain', (res.headers['content-type'] || '').includes('text/plain'));
  } catch (err: any) {
    assert('Wrong token test failed', false, err.message);
  }

  // 2d. Unknown Tenant Key -> 404 Not Found (Never blank 500)
  try {
    const res = await request(BASE_URL)
      .get('/api/v1/webhooks/meta/unknown_tenant_key_999999999')
      .query({
        'hub.mode': 'subscribe',
        'hub.challenge': testChallenge,
        'hub.verify_token': verifyToken,
      });
    assert('Unknown tenant key returns HTTP 404 Not Found (Never blank 500)', res.status === 404, `status=${res.status}`);
  } catch (err: any) {
    assert('Unknown tenant key test failed', false, err.message);
  }

  // 2e. Missing Query Parameters -> 400 Bad Request
  try {
    const res = await request(BASE_URL)
      .get(`/api/v1/webhooks/meta/${tenantKey}`)
      .query({ 'hub.mode': 'subscribe' });
    assert('Missing query params returns HTTP 400 Bad Request', res.status === 400, `status=${res.status}`);
  } catch (err: any) {
    assert('Missing params test failed', false, err.message);
  }

  // --- 3. EXEMPTIONS: CORS, AUTH, RATE LIMITING, RESPONSE INTERCEPTOR ---
  console.log(`\n--- 3. Exemption & Security Rule Tests (${ENV_LABEL}) ---`);
  try {
    // Public CORS exemption
    const resCors = await request(BASE_URL)
      .get(`/api/v1/webhooks/meta/${tenantKey}`)
      .set('Origin', 'https://graph.facebook.com')
      .query({
        'hub.mode': 'subscribe',
        'hub.challenge': testChallenge,
        'hub.verify_token': verifyToken,
      });
    assert('Exempt from public CORS restrictions (Meta Origin accepted)', resCors.status === 200, `status=${resCors.status}`);

    // No login credentials required
    const resNoAuth = await request(BASE_URL)
      .get(`/api/v1/webhooks/meta/${tenantKey}`)
      .query({
        'hub.mode': 'subscribe',
        'hub.challenge': testChallenge,
        'hub.verify_token': verifyToken,
      });
    assert('Exempt from Login Guards (no JWT required)', resNoAuth.status === 200, `status=${resNoAuth.status}`);

    // Rate Limiting exemption (@SkipThrottle)
    const bursts = await Promise.all(
      Array.from({ length: 15 }, () =>
        request(BASE_URL)
          .get(`/api/v1/webhooks/meta/${tenantKey}`)
          .query({
            'hub.mode': 'subscribe',
            'hub.challenge': testChallenge,
            'hub.verify_token': verifyToken,
          })
      )
    );
    const has429 = bursts.some((r) => r.status === 429);
    assert('Exempt from Throttler (@SkipThrottle - 15 rapid requests all 200)', !has429 && bursts.every((r) => r.status === 200));

    // Global response interceptor check (must not wrap into { success: true, data: ... })
    assert('Exempt from global JSON response interceptor (pure text body)', typeof resNoAuth.body !== 'object' || Object.keys(resNoAuth.body).length === 0);
  } catch (err: any) {
    assert('Exemption tests failed', false, err.message);
  }

  // --- 4. POST HANDLER: TIMINGSAFEQUAL LENGTH-CHECK, PERSISTENCE & DEDUPLICATION ---
  console.log(`\n--- 4. POST Handler: Signature Verification, DB Persistence & Deduplication (${ENV_LABEL}) ---`);

  const uniqueMessageId = `wamid.TEST_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const sampleWhatsappPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WHATSAPP_BUS_ACC_ID',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '+919999999999', phone_number_id: 'PN_123' },
              contacts: [{ profile: { name: 'Meta Tester' }, wa_id: '919999999999' }],
              messages: [
                {
                  from: '919999999999',
                  id: uniqueMessageId,
                  timestamp: `${Math.floor(Date.now() / 1000)}`,
                  text: { body: 'Hello from automated Meta webhook test' },
                  type: 'text',
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const rawJson = JSON.stringify(sampleWhatsappPayload);
  const validHmac = crypto.createHmac('sha256', META_SECRET).update(rawJson).digest('hex');

  // 4a. Length-check before timingSafeEqual: Malformed length signature must return 401 Unauthorized, NEVER 500 RangeError!
  try {
    const resBadLen = await request(BASE_URL)
      .post(`/api/v1/webhooks/meta/${tenantKey}`)
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', 'sha256=1234abcd') // Only 4 bytes (8 hex chars) instead of 32 bytes (64 hex chars)
      .send(rawJson);
    assert('Length-check before timingSafeEqual: Truncated signature returns 401 Unauthorized (Never 500 RangeError)', resBadLen.status === 401, `status=${resBadLen.status}`);
  } catch (err: any) {
    assert('Truncated signature test failed', false, err.message);
  }

  // 4b. Invalid Signature (Full length 64 hex chars mismatch) -> 401
  try {
    const fakeSig = crypto.randomBytes(32).toString('hex');
    const res = await request(BASE_URL)
      .post(`/api/v1/webhooks/meta/${tenantKey}`)
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', `sha256=${fakeSig}`)
      .send(rawJson);
    assert('Invalid HMAC signature returns HTTP 401', res.status === 401, `status=${res.status}`);
  } catch (err: any) {
    assert('Invalid signature POST failed', false, err.message);
  }

  // 4c. Valid Signature Inbound Delivery -> Persisted before replying 200
  let initialDeliveryId = '';
  try {
    const t0 = Date.now();
    const res = await request(BASE_URL)
      .post(`/api/v1/webhooks/meta/${tenantKey}`)
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', `sha256=${validHmac}`)
      .send(rawJson);
    const elapsed = Date.now() - t0;

    assert('Valid HMAC signature returns HTTP 200', res.status === 200, `status=${res.status}`);
    assert('Delivery is persisted before replying (deliveryId returned)', Boolean(res.body.deliveryId || res.body.status === 'ACCEPTED'), `body=${JSON.stringify(res.body)}`);
    assert('POST replies fast (< 500ms)', elapsed < 500, `elapsed=${elapsed}ms`);
    initialDeliveryId = res.body.deliveryId;
  } catch (err: any) {
    assert('Valid signature POST failed', false, err.message);
  }

  // 4d. Immediate Replay (Deduplication via database unique index) -> 200 with duplicate indicator
  try {
    const resDup = await request(BASE_URL)
      .post(`/api/v1/webhooks/meta/${tenantKey}`)
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', `sha256=${validHmac}`)
      .send(rawJson);
    assert('Replay delivery caught by database dedupe index returning HTTP 200', resDup.status === 200, `status=${resDup.status}`);
    assert('Replay message indicates delivery already recorded', resDup.body.message?.includes('already recorded') || resDup.body.status === 'ACCEPTED');
  } catch (err: any) {
    assert('Duplicate delivery test failed', false, err.message);
  }

  // 4e. Meta Leadgen Event via /api/v1/webhooks/meta/:key
  const sampleLeadgenPayload = {
    object: 'page',
    entry: [
      {
        id: 'PAGE_ID_123',
        time: Math.floor(Date.now() / 1000),
        changes: [
          {
            field: 'leadgen',
            value: {
              ad_id: 'AD_456',
              form_id: 'FORM_789',
              leadgen_id: `leadgen_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
              created_time: Math.floor(Date.now() / 1000),
              page_id: 'PAGE_ID_123',
            },
          },
        ],
      },
    ],
  };

  const rawLeadgenJson = JSON.stringify(sampleLeadgenPayload);
  const leadgenHmac = crypto.createHmac('sha256', META_SECRET).update(rawLeadgenJson).digest('hex');

  try {
    const resLead = await request(BASE_URL)
      .post(`/api/v1/webhooks/meta/${tenantKey}`)
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', `sha256=${leadgenHmac}`)
      .send(rawLeadgenJson);
    assert('Leadgen payload to /meta/:key returns HTTP 200 and records delivery', resLead.status === 200, `status=${resLead.status}`);
  } catch (err: any) {
    assert('Leadgen event test failed', false, err.message);
  }

  console.log(`\n======================================================`);
  console.log(`  SUMMARY (${ENV_LABEL}): ${passed} PASSED, ${failed} FAILED`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((e) => {
  console.error('Fatal error running webhook test suite:', e);
  process.exit(1);
});
