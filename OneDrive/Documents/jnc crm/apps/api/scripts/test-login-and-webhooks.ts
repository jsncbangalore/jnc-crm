/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import * as http from 'http';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import * as cookieParser from 'cookie-parser';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const TEST_PORT = 3335;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}/api/v1`;
const TEST_EMAIL = 'tenantadmin@jsnc.co.in';
const TEST_PASSWORD = 'TestPassword#2026!SecureKey';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${message}`);
  }
}

function makeRequest(
  options: http.RequestOptions,
  postData?: string,
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: any; rawBody: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body: parsed,
          rawBody: data,
        });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function main() {
  console.log('========================================================================');
  console.log('JNC-CRM TEST SUITE: LOGIN RESPONSE, COOKIES & KEYED WEBHOOKS');
  console.log('========================================================================\n');

  const prisma = new PrismaClient({
    datasources: { db: { url: 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev' } },
  });

  // Ensure test user has known password and active status
  console.log('[Setup] Preparing test user credentials in local database...');
  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, salt);

  let internalTenant = await prisma.tenant.findFirst({ where: { isInternal: true, deletedAt: null } });
  if (!internalTenant) {
    internalTenant = await prisma.tenant.findFirst({ where: { deletedAt: null } });
  }

  const existingUser = await prisma.user.findFirst({
    where: { email: TEST_EMAIL, deletedAt: null },
  });

  if (existingUser) {
    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        passwordHash,
        isActive: true,
        mustResetPassword: false,
        failedLoginAttempts: 0,
        lockoutUntil: null,
      },
    });
  } else {
    await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        name: 'Tenant Admin Test',
        employeeCode: 'EMP-TEST-001',
        role: 'tenant_admin',
        passwordHash,
        tenantId: internalTenant?.id,
        isActive: true,
      },
    });
  }

  // Boot NestJS application on test port
  console.log(`[Setup] Bootstrapping NestJS test instance on port ${TEST_PORT}...`);
  const app = await NestFactory.create(AppModule, { logger: ['warn', 'error'] });
  app.use(cookieParser());
  app.use((req: any, res: any, next: any) => {
    const url = (req.originalUrl || req.url || '').toLowerCase();
    const isPrivateFileDownload =
      url.includes('/download') ||
      url.includes('/export') ||
      url.includes('/pdf') ||
      url.includes('/uploads');

    if (isPrivateFileDownload) {
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else {
      res.setHeader(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate',
      );
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    next();
  });
  app.setGlobalPrefix('api/v1');
  await app.listen(TEST_PORT);
  console.log(`[Setup] Server running at ${BASE_URL}\n`);

  try {
    // ─── TEST GROUP 1: CACHE HEADERS ON UNPROTECTED / AUTH ROUTES ────────────
    console.log('--- TEST GROUP 1: Cache Control & Privacy Headers ---');
    {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: '/api/v1/auth/me',
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      assert(res.statusCode === 401, `/auth/me unauthenticated returns 401 Unauthorized (Actual: ${res.statusCode})`);
      const cacheControl = (res.headers['cache-control'] || '') as string;
      assert(cacheControl.includes('no-store'), `Cache-Control includes 'no-store' (Actual: "${cacheControl}")`);
      assert(res.headers['pragma'] === 'no-cache', `Pragma header is 'no-cache'`);
      assert(res.headers['expires'] === '0', `Expires header is '0'`);
    }

    // ─── TEST GROUP 2: LOGIN ENDPOINT RESPONSE BODY & STATUS CODE ────────────
    console.log('\n--- TEST GROUP 2: Login Response Sanitization & Status Code ---');
    let refreshCookie = '';
    let accessToken = '';

    {
      const payload = JSON.stringify({
        identifier: TEST_EMAIL,
        password: TEST_PASSWORD,
        companyCode: internalTenant?.code || 'JNC',
      });

      const res = await makeRequest(
        {
          hostname: '127.0.0.1',
          port: TEST_PORT,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        payload,
      );

      assert(res.statusCode === 200, `/auth/login returns HTTP 200 OK (Actual: ${res.statusCode})`);
      assert(!!res.body.accessToken, `Response contains accessToken (<MASKED>)`);
      accessToken = res.body.accessToken;

      assert(res.body.refreshToken === undefined, `CRITICAL: refreshToken is strictly OMITTED from response body`);

      // Check strictly allowed fields on user object
      const user = res.body.user;
      assert(!!user, `Response body contains user object`);

      const allowedFields = new Set([
        'id',
        'name',
        'email',
        'employeeCode',
        'role',
        'mustResetPassword',
        'tenant',
        'teamId',
        'warehouseId',
        'isImpersonating',
        'impersonatedTenantName',
        'impersonatedTenantCode',
      ]);

      const userKeys = Object.keys(user || {});
      const forbiddenFound = userKeys.filter((k) => !allowedFields.has(k));
      assert(
        forbiddenFound.length === 0,
        `User object contains ONLY permitted fields (Forbidden found: [${forbiddenFound.join(', ')}])`,
      );

      // Explicitly check forbidden fields
      assert(user?.failedLoginAttempts === undefined, `user.failedLoginAttempts is not returned`);
      assert(user?.lockoutUntil === undefined, `user.lockoutUntil is not returned`);
      assert(user?.tokenVersion === undefined, `user.tokenVersion is not returned`);
      assert(user?.createdById === undefined, `user.createdById is not returned`);
      assert(user?.deletedAt === undefined, `user.deletedAt is not returned`);
      assert(user?.createdAt === undefined, `user.createdAt is not returned`);
      assert(user?.updatedAt === undefined, `user.updatedAt is not returned`);
      assert(user?.lastLoginAt === undefined, `user.lastLoginAt is not returned`);
      assert(user?.teamRef === undefined, `user.teamRef is not returned`);
      assert(user?.phone === undefined, `user.phone is not returned`);

      // Extract cookie
      const rawCookies = res.headers['set-cookie'];
      const cookieStr = Array.isArray(rawCookies) ? rawCookies.join('; ') : rawCookies || '';
      refreshCookie = cookieStr;

      assert(cookieStr.includes('jnc_refresh_token='), `Set-Cookie header sets 'jnc_refresh_token'`);
      assert(cookieStr.toLowerCase().includes('httponly'), `Cookie has 'HttpOnly' flag`);
      assert(cookieStr.toLowerCase().includes('samesite=strict'), `Cookie has 'SameSite=Strict' flag`);
      assert(cookieStr.includes('Path=/api/v1/auth'), `Cookie has path restricted to '/api/v1/auth'`);
    }

    // ─── TEST GROUP 3: COOKIE SECURE FLAG ACROSS ENVIRONMENTS ────────────────
    console.log('\n--- TEST GROUP 3: Cookie Secure Flag (Dev vs Production/Staging) ---');
    {
      // 1. Current NODE_ENV=development: secure flag should NOT be set on localhost
      const currentSecure = refreshCookie.toLowerCase().includes('secure;');
      assert(
        !currentSecure || process.env.NODE_ENV === 'production',
        `In development mode, Cookie does not enforce Secure over http (Secure present: ${currentSecure})`,
      );

      // 2. Set NODE_ENV=production and test login cookie
      process.env.NODE_ENV = 'production';
      const payload = JSON.stringify({
        identifier: TEST_EMAIL,
        password: TEST_PASSWORD,
        companyCode: internalTenant?.code || 'JNC',
      });

      const prodRes = await makeRequest(
        {
          hostname: '127.0.0.1',
          port: TEST_PORT,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        payload,
      );

      const prodCookies = prodRes.headers['set-cookie'];
      const prodCookieStr = Array.isArray(prodCookies) ? prodCookies.join('; ') : prodCookies || '';
      assert(
        prodCookieStr.toLowerCase().includes('secure'),
        `In production/staging mode, Set-Cookie header carries 'Secure' flag (Actual: "${prodCookieStr.split(';').slice(0, 4).join(';')}")`,
      );

      // Reset NODE_ENV
      process.env.NODE_ENV = 'development';
    }

    // ─── TEST GROUP 4: SILENT REFRESH TOKEN ROTATION ────────────────────────
    console.log('\n--- TEST GROUP 4: Silent Token Refresh Endpoint ---');
    {
      const cookieVal = refreshCookie.split(';')[0]; // "jnc_refresh_token=..."
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: '/api/v1/auth/refresh',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Cookie: cookieVal,
        },
      });

      assert(res.statusCode === 200, `/auth/refresh returns HTTP 200 OK (Actual: ${res.statusCode})`);
      assert(!!res.body.accessToken, `Refreshed response contains new accessToken (<MASKED>)`);
      assert(res.body.refreshToken === undefined, `refreshToken is strictly OMITTED from /auth/refresh response body`);
      assert(!!res.body.user && res.body.user.email === TEST_EMAIL, `Refreshed response contains sanitized user object`);

      const newCookies = res.headers['set-cookie'];
      const newCookieStr = Array.isArray(newCookies) ? newCookies.join('; ') : newCookies || '';
      assert(newCookieStr.includes('jnc_refresh_token='), `/auth/refresh issues rotated refresh token via Set-Cookie`);
    }

    // ─── TEST GROUP 5: WEBHOOK KEYS & SCOPING ────────────────────────────────
    console.log('\n--- TEST GROUP 5: Webhook Key Authentication, 404s & Tenant Scoping ---');
    {
      // 1. Unknown / invalid key returns 404
      const resUnknownKey = await makeRequest({
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: '/api/v1/webhooks/indiamart/non-existent-webhook-key-12345',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      assert(
        resUnknownKey.statusCode === 404,
        `/webhooks/indiamart/<unknown-key> returns 404 Not Found (Actual: ${resUnknownKey.statusCode})`,
      );

      const resUnknownWhatsApp = await makeRequest({
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: '/api/v1/webhooks/whatsapp/invalid-key-999',
        method: 'GET',
      });
      assert(
        resUnknownWhatsApp.statusCode === 404,
        `/webhooks/whatsapp/<unknown-key> GET handshake returns 404 Not Found (Actual: ${resUnknownWhatsApp.statusCode})`,
      );

      // 2. Regenerate Webhook Key for tenant
      const resRegen = await makeRequest({
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: '/api/v1/webhooks/regenerate-key',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      assert(resRegen.statusCode === 200, `POST /webhooks/regenerate-key returns 200 OK (Actual: ${resRegen.statusCode})`);
      assert(typeof resRegen.body.webhookKey === 'string' && resRegen.body.webhookKey.startsWith('whk_'), `Plain webhook key returned once: ${resRegen.body.webhookKey ? resRegen.body.webhookKey.slice(0, 10) + '...<MASKED>' : 'null'}`);

      const plainKey = resRegen.body.webhookKey;

      // 3. Verify key is stored as SHA-256 hash in database
      const keyHash = crypto.createHash('sha256').update(plainKey).digest('hex');
      const tenantInDb = await prisma.tenant.findUnique({
        where: { id: internalTenant?.id },
        select: { webhookKeyHash: true },
      });
      assert(
        tenantInDb?.webhookKeyHash === keyHash,
        `Tenant in DB stores SHA-256 hash of key (plain key is never stored in DB)`,
      );

      // 4. Inbound IndiaMART lead with newly generated key
      process.env.INDIAMART_WEBHOOK_SECRET = 'im-test-secret-2026';
      const indiaMartPayload = JSON.stringify({
        QUERY_ID: 'TEST-QUERY-' + Date.now(),
        SENDER_NAME: 'Automated Test Prospect',
        SENDER_MOBILE: '9' + Math.floor(100000000 + Math.random() * 900000000),
        SENDER_EMAIL: `prospect.test.${Date.now()}@example.com`,
        PRODUCT_NAME: 'Industrial Switch',
      });

      const resIndiaMartValid = await makeRequest(
        {
          hostname: '127.0.0.1',
          port: TEST_PORT,
          path: `/api/v1/webhooks/indiamart/${plainKey}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-indiamart-token': 'im-test-secret-2026',
            'Content-Length': Buffer.byteLength(indiaMartPayload),
          },
        },
        indiaMartPayload,
      );

      assert(
        resIndiaMartValid.statusCode === 200,
        `POST /webhooks/indiamart/<valid-key> returns 200 OK (Actual: ${resIndiaMartValid.statusCode})`,
      );
      assert(
        resIndiaMartValid.body.status === 'SUCCESS',
        `Lead created successfully via keyed webhook (status: ${resIndiaMartValid.body.status})`,
      );

      // 5. Verify lead in database has tenantId strictly scoped to this tenant
      if (resIndiaMartValid.body.leadId) {
        const createdLead = await prisma.lead.findUnique({
          where: { id: resIndiaMartValid.body.leadId },
          select: { id: true, tenantId: true, customerName: true },
        });
        assert(
          createdLead?.tenantId === internalTenant?.id,
          `Created lead has tenantId strictly scoped to owning tenant (${createdLead?.tenantId})`,
        );
      }
    }

    // ─── TEST GROUP 6: LOGOUT AND CLEAR-SITE-DATA ────────────────────────────
    console.log('\n--- TEST GROUP 6: Logout & Clear-Site-Data Headers ---');
    {
      const cookieVal = refreshCookie.split(';')[0];
      const resLogout = await makeRequest({
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: '/api/v1/auth/logout',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Cookie: cookieVal,
        },
      });

      assert(resLogout.statusCode === 200 || resLogout.statusCode === 201, `Logout endpoint returns 200/201 (Actual: ${resLogout.statusCode})`);
      assert(
        resLogout.headers['clear-site-data'] === '"cache", "storage"',
        `Logout response carries Clear-Site-Data: "cache", "storage"`,
      );
      const cacheHeader = (resLogout.headers['cache-control'] || '') as string;
      assert(cacheHeader.includes('no-store'), `Logout response carries Cache-Control: no-store`);

      const logoutCookies = resLogout.headers['set-cookie'];
      const logoutCookieStr = Array.isArray(logoutCookies) ? logoutCookies.join('; ') : logoutCookies || '';
      assert(
        logoutCookieStr.includes('jnc_refresh_token=;') &&
          (logoutCookieStr.includes('1970') || logoutCookieStr.includes('Max-Age=0')),
        `Logout response clears refresh cookie from browser`,
      );
    }

    // ─── TEST GROUP 7: LEGACY WEBHOOKS PINNING & ISOLATION (TWO TENANTS SAME PHONE) ───
    console.log('\n--- TEST GROUP 7: Legacy Webhooks Pinning, Isolation & Audit Log ---');
    {
      // 1. Ensure Tenant B exists
      const tenantB = await prisma.tenant.upsert({
        where: { code: 'TEST_TENANT_B' },
        create: {
          code: 'TEST_TENANT_B',
          name: 'Beta Industrial Client Ltd',
          slug: 'beta-industrial',
          status: 'active',
          isInternal: false,
        },
        update: {},
      });

      const sharedPhone = '9' + Math.floor(100000000 + Math.random() * 900000000);

      // 2. Insert existing lead in Tenant B with shared phone
      const betaLead = await prisma.lead.upsert({
        where: { id: 'beta-test-lead-same-phone' },
        create: {
          id: 'beta-test-lead-same-phone',
          tenantId: tenantB.id,
          leadNumber: 'TB-LD-99999',
          customerName: 'Beta Client Contact',
          customerPhone: sharedPhone,
          source: 'manual',
          status: 'new',
        },
        update: { customerPhone: sharedPhone },
      });
      assert(betaLead.tenantId === tenantB.id, 'Tenant B contains an existing lead with shared phone number');

      // 3. Post to unkeyed legacy route /webhooks/indiamart with the SAME phone number
      const legacyPayload = JSON.stringify({
        QUERY_ID: 'LEGACY-QUERY-' + Date.now(),
        SENDER_NAME: 'JNC Inbound Customer',
        SENDER_MOBILE: sharedPhone,
        PRODUCT_NAME: 'Talkback System Unit',
      });

      const resLegacy = await makeRequest(
        {
          hostname: '127.0.0.1',
          port: TEST_PORT,
          path: '/api/v1/webhooks/indiamart',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-indiamart-token': 'im-test-secret-2026',
            'Content-Length': Buffer.byteLength(legacyPayload),
          },
        },
        legacyPayload,
      );

      assert(resLegacy.statusCode === 200, `Legacy /webhooks/indiamart returns 200 OK (Actual: ${resLegacy.statusCode})`);
      assert(resLegacy.body.status === 'SUCCESS', `Legacy webhook succeeds for JNC without cross-tenant collision`);

      // 4. Verify created lead is strictly owned by JNC tenant
      if (resLegacy.body.leadId) {
        const createdLead = await prisma.lead.findUnique({
          where: { id: resLegacy.body.leadId },
          select: { id: true, tenantId: true, customerPhone: true },
        });
        assert(
          createdLead?.tenantId === internalTenant?.id,
          `Legacy route creates lead strictly pinned to JNC tenant (${createdLead?.tenantId})`,
        );
        assert(createdLead?.customerPhone === sharedPhone, `Lead recorded with customer phone ${sharedPhone}`);
      }

      // 5. Verify Tenant B's lead was completely untouched
      const betaLeadAfter = await prisma.lead.findUnique({
        where: { id: 'beta-test-lead-same-phone' },
        select: { id: true, tenantId: true, customerName: true },
      });
      assert(betaLeadAfter?.tenantId === tenantB.id, `Tenant B lead remains strictly isolated in Tenant B`);
      assert(betaLeadAfter?.customerName === 'Beta Client Contact', `Tenant B lead was untouched by legacy call`);

      // 6. Verify AuditLog entry recorded with 2026-12-31 sunset date
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          tenantId: internalTenant?.id,
          action: 'LEGACY_WEBHOOK_CALL',
        },
        orderBy: { timestamp: 'desc' },
      });
      assert(auditLog !== null, `AuditLog entry recorded for legacy unkeyed webhook call`);
      assert(auditLog?.beforeState?.includes('2026-12-31'), `AuditLog records sunset date 2026-12-31`);
      assert(auditLog?.actorName === 'LEGACY_WEBHOOK_FALLBACK', `AuditLog records actor as LEGACY_WEBHOOK_FALLBACK`);
    }
  } finally {
    await app.close();
    await prisma.$disconnect();
  }

  console.log('\n========================================================================');
  console.log(`TEST RESULTS: ${passedTests} / ${totalTests} PASSED (Failed: ${totalTests - passedTests})`);
  console.log('========================================================================');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[FATAL ERROR]:', err);
  process.exit(1);
});
