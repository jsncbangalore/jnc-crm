/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import * as assert from 'assert';
import * as crypto from 'crypto';
import {
  isPublicInquiryRoute,
  extractPublicKey,
  parseExactOrigin,
  handlePublicCors,
  resolveCompanyByKey,
} from '../apps/api/src/common/public-cors';
import {
  getAllowedCorsOrigins,
  isAllowedOrigin,
} from '../apps/api/src/common/cors-config';

let passed = 0;
let failed = 0;

function it(desc: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res
        .then(() => {
          console.log(`  [PASS] ${desc}`);
          passed++;
        })
        .catch((err: any) => {
          console.error(`  [FAIL] ${desc}: ${err.message}`);
          failed++;
        });
    }
    console.log(`  [PASS] ${desc}`);
    passed++;
  } catch (err: any) {
    console.error(`  [FAIL] ${desc}: ${err.message}`);
    failed++;
  }
}

// Mock Express Response helper
function createMockResponse() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body: any = null;
  let ended = false;

  const res: any = {
    statusCode,
    headers,
    setHeader(name: string, value: any) {
      headers[name.toLowerCase()] = String(value);
      return res;
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    removeHeader(name: string) {
      delete headers[name.toLowerCase()];
    },
    status(code: number) {
      res.statusCode = code;
      statusCode = code;
      return res;
    },
    type(t: string) {
      headers['content-type'] = t;
      return res;
    },
    send(data: any) {
      body = data;
      ended = true;
      return res;
    },
    end(data?: any) {
      if (data !== undefined) body = data;
      ended = true;
      return res;
    },
    _getBody: () => body,
    _isEnded: () => ended,
    _getStatusCode: () => statusCode,
  };
  return res;
}

// Mock Prisma for testing
function createMockPrisma(tenants: Record<string, any>, settings: Record<string, any>) {
  return {
    tenant: {
      findFirst: async ({ where }: any) => {
        const orConditions = where?.OR || [];
        for (const t of Object.values(tenants)) {
          for (const cond of orConditions) {
            if (
              (cond.webhookKeyHash && cond.webhookKeyHash === t.webhookKeyHash) ||
              (cond.webhookKeyHash && cond.webhookKeyHash === t.rawKey)
            ) {
              if (t.status === 'active' && t.deletedAt === null) {
                return t;
              }
            }
          }
        }
        return null;
      },
    },
    webFormSettings: {
      findUnique: async ({ where }: any) => {
        return settings[where?.tenantId] || null;
      },
    },
  };
}

async function runTests() {
  console.log('========================================================================');
  console.log('PUBLIC ENDPOINTS DEDICATED CORS & ORIGIN VERIFICATION TEST SUITE');
  console.log('========================================================================\n');

  // Test Fixtures
  const validKey = 'whk_test_key_sample_12345';
  const validKeyHash = crypto.createHash('sha256').update(validKey).digest('hex');
  const emptyOriginKey = 'whk_empty_origins_key_67890';
  const emptyOriginKeyHash = crypto.createHash('sha256').update(emptyOriginKey).digest('hex');

  const mockTenants = {
    tenant1: {
      id: 'tenant-uuid-1',
      rawKey: validKey,
      webhookKeyHash: validKeyHash,
      status: 'active',
      deletedAt: null,
    },
    tenant2: {
      id: 'tenant-uuid-2',
      rawKey: emptyOriginKey,
      webhookKeyHash: emptyOriginKeyHash,
      status: 'active',
      deletedAt: null,
    },
  };

  const mockSettings = {
    'tenant-uuid-1': {
      allowedOrigins: ['https://client.example.com', 'https://shop.example.org:8443'],
    },
    'tenant-uuid-2': {
      allowedOrigins: [], // Empty allowlist
    },
  };

  const mockPrisma = createMockPrisma(mockTenants, mockSettings);

  console.log('--- 1. Route Detection (isPublicInquiryRoute) ---');
  it('Identifies /api/v1/public-inquiry as public route', () => {
    assert.strictEqual(isPublicInquiryRoute('/api/v1/public-inquiry'), true);
  });
  it('Identifies /api/v1/public-inquiry?key=abc as public route', () => {
    assert.strictEqual(isPublicInquiryRoute('/api/v1/public-inquiry?key=abc'), true);
  });
  it('Identifies /api/v1/webhooks/inquiry-info as public route', () => {
    assert.strictEqual(isPublicInquiryRoute('/api/v1/webhooks/inquiry-info'), true);
  });
  it('Identifies /api/v1/webhooks/inquiry-info/:key as public route', () => {
    assert.strictEqual(isPublicInquiryRoute('/api/v1/webhooks/inquiry-info/whk_123'), true);
  });
  it('Identifies /api/v1/webhooks/website/:key as public route', () => {
    assert.strictEqual(isPublicInquiryRoute('/api/v1/webhooks/website/whk_123'), true);
  });
  it('Rejects logged-in /api/v1/auth/login as non-public route', () => {
    assert.strictEqual(isPublicInquiryRoute('/api/v1/auth/login'), false);
  });
  it('Rejects logged-in /api/v1/invoices as non-public route', () => {
    assert.strictEqual(isPublicInquiryRoute('/api/v1/invoices'), false);
  });
  it('Rejects logged-in /api/v1/leads as non-public route', () => {
    assert.strictEqual(isPublicInquiryRoute('/api/v1/leads'), false);
  });

  console.log('\n--- 2. Public Key Extraction (extractPublicKey) ---');
  it('Extracts key from query parameter ?key=...', () => {
    const req: any = { query: { key: 'whk_from_query' } };
    assert.strictEqual(extractPublicKey(req), 'whk_from_query');
  });
  it('Extracts key from x-tenant-key header', () => {
    const req: any = { query: {}, headers: { 'x-tenant-key': 'whk_from_header' } };
    assert.strictEqual(extractPublicKey(req), 'whk_from_header');
  });
  it('Extracts key from path /webhooks/website/:key', () => {
    const req: any = { query: {}, headers: {}, originalUrl: '/api/v1/webhooks/website/whk_from_path' };
    assert.strictEqual(extractPublicKey(req), 'whk_from_path');
  });
  it('Extracts key from path /webhooks/inquiry-info/:key', () => {
    const req: any = { query: {}, headers: {}, originalUrl: '/api/v1/webhooks/inquiry-info/whk_from_info' };
    assert.strictEqual(extractPublicKey(req), 'whk_from_info');
  });
  it('Returns undefined when key is missing', () => {
    const req: any = { query: {}, headers: {}, originalUrl: '/api/v1/public-inquiry' };
    assert.strictEqual(extractPublicKey(req), undefined);
  });

  console.log('\n--- 3. Exact Origin Parsing (parseExactOrigin) ---');
  it('Parses exact HTTPS origin without trailing slash', () => {
    assert.strictEqual(parseExactOrigin('https://client.example.com/'), 'https://client.example.com');
  });
  it('Preserves custom port in exact origin', () => {
    assert.strictEqual(parseExactOrigin('https://client.example.com:8443/form'), 'https://client.example.com:8443');
  });
  it('Returns null for malformed origin string', () => {
    assert.strictEqual(parseExactOrigin('not-a-valid-url'), null);
  });

  console.log('\n--- 4. Public CORS Middleware Behavior ---');

  await it('Case 1: Allowed origin with valid key returns 200/204 with exact CORS headers', async () => {
    const req: any = {
      method: 'OPTIONS',
      originalUrl: `/api/v1/public-inquiry?key=${validKey}`,
      headers: {
        origin: 'https://client.example.com',
      },
    };
    const res = createMockResponse();
    let nextCalled = false;
    await handlePublicCors(req, res, () => { nextCalled = true; }, mockPrisma);

    assert.strictEqual(res._getStatusCode(), 204);
    assert.strictEqual(res.getHeader('Access-Control-Allow-Origin'), 'https://client.example.com');
    assert.strictEqual(res.getHeader('Access-Control-Allow-Methods'), 'GET, POST, OPTIONS');
    assert.strictEqual(res.getHeader('Access-Control-Allow-Credentials'), undefined);
    assert.strictEqual(nextCalled, false); // preflight ends immediately
  });

  await it('Case 2: POST request from allowed origin calls next() with CORS header and no credentials', async () => {
    const req: any = {
      method: 'POST',
      originalUrl: `/api/v1/public-inquiry?key=${validKey}`,
      headers: {
        origin: 'https://client.example.com',
      },
    };
    const res = createMockResponse();
    let nextCalled = false;
    await handlePublicCors(req, res, () => { nextCalled = true; }, mockPrisma);

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(res.getHeader('Access-Control-Allow-Origin'), 'https://client.example.com');
    assert.strictEqual(res.getHeader('Access-Control-Allow-Credentials'), undefined);
  });

  await it('Case 3: Other / unlisted origin with valid key is blocked (403 without CORS header)', async () => {
    const req: any = {
      method: 'POST',
      originalUrl: `/api/v1/public-inquiry?key=${validKey}`,
      headers: {
        origin: 'https://unauthorized-evil.example.com',
      },
    };
    const res = createMockResponse();
    let nextCalled = false;
    await handlePublicCors(req, res, () => { nextCalled = true; }, mockPrisma);

    assert.strictEqual(res._getStatusCode(), 403);
    assert.strictEqual(res.getHeader('Access-Control-Allow-Origin'), undefined);
    assert.strictEqual(nextCalled, false);
  });

  await it('Case 4: Empty allowedOrigins list rejects browser requests from any origin', async () => {
    const req: any = {
      method: 'POST',
      originalUrl: `/api/v1/public-inquiry?key=${emptyOriginKey}`,
      headers: {
        origin: 'https://some-client.example.com',
      },
    };
    const res = createMockResponse();
    let nextCalled = false;
    await handlePublicCors(req, res, () => { nextCalled = true; }, mockPrisma);

    assert.strictEqual(res._getStatusCode(), 403);
    assert.strictEqual(res.getHeader('Access-Control-Allow-Origin'), undefined);
    assert.strictEqual(nextCalled, false);
  });

  await it('Case 5: Server-to-server call without Origin header stays allowed with key', async () => {
    const req: any = {
      method: 'POST',
      originalUrl: `/api/v1/public-inquiry?key=${validKey}`,
      headers: {}, // No Origin header (curl / backend script)
    };
    const res = createMockResponse();
    let nextCalled = false;
    await handlePublicCors(req, res, () => { nextCalled = true; }, mockPrisma);

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(res.getHeader('Access-Control-Allow-Origin'), undefined);
    assert.strictEqual(res.getHeader('Access-Control-Allow-Credentials'), undefined);
  });

  await it('Case 6: Missing key returns plain 404 "This form is not available" without CORS headers', async () => {
    const req: any = {
      method: 'GET',
      originalUrl: '/api/v1/public-inquiry',
      headers: {
        origin: 'https://client.example.com',
      },
    };
    const res = createMockResponse();
    let nextCalled = false;
    await handlePublicCors(req, res, () => { nextCalled = true; }, mockPrisma);

    assert.strictEqual(res._getStatusCode(), 404);
    assert.strictEqual(res._getBody(), 'This form is not available');
    assert.strictEqual(res.getHeader('Access-Control-Allow-Origin'), undefined);
    assert.strictEqual(nextCalled, false);
  });

  await it('Case 7: Unknown key returns plain 404 "This form is not available" without data or CORS headers', async () => {
    const req: any = {
      method: 'POST',
      originalUrl: '/api/v1/public-inquiry?key=whk_non_existent_fake_key_999',
      headers: {
        origin: 'https://client.example.com',
      },
    };
    const res = createMockResponse();
    let nextCalled = false;
    await handlePublicCors(req, res, () => { nextCalled = true; }, mockPrisma);

    assert.strictEqual(res._getStatusCode(), 404);
    assert.strictEqual(res._getBody(), 'This form is not available');
    assert.strictEqual(res.getHeader('Access-Control-Allow-Origin'), undefined);
    assert.strictEqual(nextCalled, false);
  });

  await it('Case 8: Responses never allow credentials or set cookies', async () => {
    const req: any = {
      method: 'POST',
      originalUrl: `/api/v1/public-inquiry?key=${validKey}`,
      headers: {
        origin: 'https://client.example.com',
      },
    };
    const res = createMockResponse();
    await handlePublicCors(req, res, () => {}, mockPrisma);

    // Try setting credentials or cookie to verify enforcement
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Set-Cookie', 'session=insecure');

    assert.strictEqual(res.getHeader('Access-Control-Allow-Credentials'), undefined);
    assert.strictEqual(res.getHeader('Set-Cookie'), undefined);
  });

  console.log('\n--- 5. Main App ALLOWED_ORIGINS Preservation ---');
  it('ALLOWED_ORIGINS for main app does not contain client marketing websites', () => {
    const mainOrigins = getAllowedCorsOrigins();
    assert.strictEqual(
      mainOrigins.some((o) => o.includes('client.example.com')),
      false,
      'Client website origin must not appear in main ALLOWED_ORIGINS'
    );
  });

  console.log('\n========================================================================');
  console.log(`TOTAL PUBLIC CORS ASSERTIONS: ${passed + failed}`);
  console.log(`PASSED:                       ${passed}`);
  console.log(`FAILED:                       ${failed}`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('[PASS] ALL PUBLIC CORS & ISOLATED ORIGIN ASSERTIONS PASSED!\n');
    process.exit(0);
  }
}

runTests().catch((e) => {
  console.error('[FATAL]', e);
  process.exit(1);
});
