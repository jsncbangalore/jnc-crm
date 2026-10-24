/**
 * Test Meta & WhatsApp Webhook Handshake and Lead Ingestion
 * 
 * Verifies:
 * 1. Authentication as tenant admin
 * 2. Authenticated GET /api/v1/webhooks/config endpoint
 * 3. Meta hub.challenge GET handshake on /api/v1/webhooks/meta/:key (HTTP 200, text/plain, raw challenge)
 * 4. WhatsApp hub.challenge GET handshake on /api/v1/webhooks/whatsapp/:key (HTTP 200, text/plain, raw challenge)
 * 5. Rejection cases:
 *    - Invalid verify token -> HTTP 403
 *    - Unknown tenant webhook key -> HTTP 404
 *    - Missing challenge / mode -> HTTP 400
 * 6. Meta Lead Ads POST webhook payload ingestion (HTTP 200, returns leadId)
 * 7. Lead deduplication / idempotency handling (HTTP 200, DUPLICATE_IGNORED)
 * 8. Database verification of captured lead
 */

const assert = require('assert');
const { PrismaClient } = require('@prisma/client');

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:3333/api/v1';
const prisma = new PrismaClient();

const PASS = '\x1b[32m[PASS]\x1b[0m';
const FAIL = '\x1b[31m[FAIL]\x1b[0m';
const INFO = '\x1b[36m[INFO]\x1b[0m';

let passedCount = 0;
let totalCount = 0;

function check(label, condition, detail = '') {
  totalCount++;
  if (condition) {
    passedCount++;
    console.log(`${PASS} ${label} ${detail}`);
  } else {
    console.error(`${FAIL} ${label} ${detail}`);
    throw new Error(`Assertion failed: ${label} - ${detail}`);
  }
}

async function run() {
  console.log(`\n======================================================`);
  console.log(`  META & WHATSAPP WEBHOOK HANDSHAKE VERIFICATION SUITE`);
  console.log(`======================================================\n`);

  try {
    // ----------------------------------------------------
    // STEP 1: Login as Tenant Admin
    // ----------------------------------------------------
    console.log(`${INFO} Step 1: Authenticating as tenant admin...`);
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: process.env.TEST_USER_EMAIL || 'test@example.com',
        password: process.env.TEST_USER_PASSWORD || '',
      }),
    });

    check('Admin login HTTP 200 OK', loginRes.status === 200, `(Status: ${loginRes.status})`);
    const loginData = await loginRes.json();
    const token = loginData.accessToken;
    const jwtPayload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
    const tenantId = jwtPayload.tenantId || jwtPayload.org_id;
    check('Access token returned', Boolean(token && token.length > 20));
    check('Tenant ID identified from JWT claims', Boolean(tenantId), `(TenantId: ${tenantId})`);

    // ----------------------------------------------------
    // STEP 2: Fetch Tenant Webhook Configuration
    // ----------------------------------------------------
    console.log(`\n${INFO} Step 2: Calling GET /api/v1/webhooks/config...`);
    const configRes = await fetch(`${API_BASE}/webhooks/config`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    check('Config endpoint HTTP 200 OK', configRes.status === 200, `(Status: ${configRes.status})`);
    const config = await configRes.json();

    check('Config returns hasWebhookKey = true', config.hasWebhookKey === true);
    check(
      'Config returns valid webhookKey starting with whk_',
      typeof config.webhookKey === 'string' && config.webhookKey.startsWith('whk_'),
      `(Key: ${config.webhookKey.slice(0, 10)}...)`
    );
    check(
      'Config returns verifyToken',
      typeof config.verifyToken === 'string' && config.verifyToken.length > 0,
      `(Token: ${config.verifyToken})`
    );
    check('Config returns tenant metadata', Boolean(config.tenantCode && config.tenantName));
    check('Config returns live statistics object', typeof config.stats === 'object');

    const webhookKey = config.webhookKey;
    const verifyToken = config.verifyToken;

    // ----------------------------------------------------
    // STEP 3: Test Meta hub.challenge GET Handshake
    // ----------------------------------------------------
    console.log(`\n${INFO} Step 3: Testing Meta hub.challenge GET Handshake on /webhooks/meta/:key...`);
    const testChallenge1 = '10000000001';
    const metaHandshakeUrl = `${API_BASE}/webhooks/meta/${webhookKey}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=${testChallenge1}`;
    
    const metaHandshakeRes = await fetch(metaHandshakeUrl);
    const metaContentType = metaHandshakeRes.headers.get('content-type') || '';
    const metaBody = await metaHandshakeRes.text();

    check('Meta handshake HTTP 200 OK', metaHandshakeRes.status === 200, `(Status: ${metaHandshakeRes.status})`);
    check(
      'Meta handshake Content-Type is text/plain',
      metaContentType.startsWith('text/plain'),
      `(Content-Type: ${metaContentType})`
    );
    check(
      'Meta handshake body is exact challenge string (no JSON, no quotes)',
      metaBody === testChallenge1,
      `(Received: "${metaBody}")`
    );

    // ----------------------------------------------------
    // STEP 4: Test WhatsApp hub.challenge GET Handshake
    // ----------------------------------------------------
    console.log(`\n${INFO} Step 4: Testing WhatsApp hub.challenge GET Handshake on /webhooks/whatsapp/:key...`);
    const testChallenge2 = '55667788990';
    const waHandshakeUrl = `${API_BASE}/webhooks/whatsapp/${webhookKey}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=${testChallenge2}`;
    
    const waHandshakeRes = await fetch(waHandshakeUrl);
    const waContentType = waHandshakeRes.headers.get('content-type') || '';
    const waBody = await waHandshakeRes.text();

    check('WhatsApp handshake HTTP 200 OK', waHandshakeRes.status === 200, `(Status: ${waHandshakeRes.status})`);
    check(
      'WhatsApp handshake Content-Type is text/plain',
      waContentType.startsWith('text/plain'),
      `(Content-Type: ${waContentType})`
    );
    check(
      'WhatsApp handshake body is exact challenge string',
      waBody === testChallenge2,
      `(Received: "${waBody}")`
    );

    // ----------------------------------------------------
    // STEP 5: Test Rejection Cases
    // ----------------------------------------------------
    console.log(`\n${INFO} Step 5: Testing Rejection Cases...`);

    // 5a. Wrong verify token -> 403 Forbidden
    const wrongTokenUrl = `${API_BASE}/webhooks/meta/${webhookKey}?hub.mode=subscribe&hub.verify_token=WRONG_SECRET_TOKEN&hub.challenge=12345`;
    const wrongTokenRes = await fetch(wrongTokenUrl);
    check(
      'Rejection: Incorrect verify token returns HTTP 403 Forbidden',
      wrongTokenRes.status === 403,
      `(Status: ${wrongTokenRes.status})`
    );

    // 5b. Unknown / invalid tenant key -> 404 Not Found
    const invalidKeyUrl = `${API_BASE}/webhooks/meta/whk_invalid_key_nonexistent_9999?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=12345`;
    const invalidKeyRes = await fetch(invalidKeyUrl);
    check(
      'Rejection: Invalid tenant key returns HTTP 404 Not Found',
      invalidKeyRes.status === 404,
      `(Status: ${invalidKeyRes.status})`
    );

    // 5c. Missing challenge / mode -> 400 Bad Request
    const missingChallengeUrl = `${API_BASE}/webhooks/meta/${webhookKey}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}`;
    const missingChallengeRes = await fetch(missingChallengeUrl);
    check(
      'Rejection: Missing hub.challenge returns HTTP 400 Bad Request',
      missingChallengeRes.status === 400,
      `(Status: ${missingChallengeRes.status})`
    );

    // ----------------------------------------------------
    // STEP 6: Test Meta Lead Ad POST Webhook Ingestion
    // ----------------------------------------------------
    console.log(`\n${INFO} Step 6: Testing Meta Lead Ad Ingestion via POST /webhooks/meta/:key...`);
    const uniqueLeadId = `leadgen_test_${Date.now()}`;
    const testPhone = '1000000000';
    const testEmail = `meta_ad_lead_${Date.now()}@example.com`;
    const testName = 'Priya Sharma (Meta Lead Ad Test)';

    const metaLeadPayload = {
      object: 'page',
      entry: [
        {
          id: '108492048593021',
          time: Math.floor(Date.now() / 1000),
          changes: [
            {
              field: 'leadgen',
              value: {
                leadgen_id: uniqueLeadId,
                page_id: '108492048593021',
                form_id: '294820194850123',
                created_time: Math.floor(Date.now() / 1000),
                ad_id: 'ad_campaign_4455',
                full_name: testName,
                phone_number: testPhone,
                email: testEmail,
              },
            },
          ],
        },
      ],
    };

    const postRes = await fetch(`${API_BASE}/webhooks/meta/${webhookKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metaLeadPayload),
    });

    check('Meta Lead POST returns HTTP 200 OK', postRes.status === 200, `(Status: ${postRes.status})`);
    const postData = await postRes.json();
    check('Meta Lead POST returns SUCCESS status', postData.status === 'SUCCESS', `(Status: ${postData.status})`);
    check('Meta Lead POST returns created leadId', Boolean(postData.leadId), `(LeadId: ${postData.leadId})`);

    // ----------------------------------------------------
    // STEP 7: Verify Database Record
    // ----------------------------------------------------
    console.log(`\n${INFO} Step 7: Verifying Lead in Database via Prisma...`);
    const createdLead = await prisma.lead.findUnique({
      where: { id: postData.leadId },
    });

    check('Lead exists in database', Boolean(createdLead));
    check('Lead belongs to target tenant', createdLead?.tenantId === tenantId, `(Tenant: ${createdLead?.tenantId})`);
    check('Lead source is "meta"', createdLead?.source === 'meta', `(Source: ${createdLead?.source})`);
    check('Customer name matches payload', createdLead?.customerName === testName, `(Name: ${createdLead?.customerName})`);
    check(
      'Raw payload contains leadgen_id',
      createdLead?.rawPayload?.includes(uniqueLeadId) === true
    );

    // ----------------------------------------------------
    // STEP 8: Test Idempotent Duplicate Protection
    // ----------------------------------------------------
    console.log(`\n${INFO} Step 8: Testing Lead Deduplication / Idempotency...`);
    const duplicateRes = await fetch(`${API_BASE}/webhooks/meta/${webhookKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metaLeadPayload),
    });

    check('Duplicate POST returns HTTP 200 OK', duplicateRes.status === 200);
    const duplicateData = await duplicateRes.json();
    check(
      'Duplicate POST is flagged as DUPLICATE_IGNORED',
      duplicateData.status === 'DUPLICATE_IGNORED',
      `(Status: ${duplicateData.status})`
    );
    check(
      'Duplicate POST returns same leadId',
      duplicateData.leadId === postData.leadId,
      `(LeadId: ${duplicateData.leadId})`
    );

    // ----------------------------------------------------
    // SUMMARY
    // ----------------------------------------------------
    console.log(`\n======================================================`);
    console.log(`  ALL ${passedCount}/${totalCount} TESTS PASSED SUCCESSFULLY!`);
    console.log(`======================================================\n`);
    process.exit(0);
  } catch (err) {
    console.error(`\n${FAIL} Test suite failed:`, err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

run();
