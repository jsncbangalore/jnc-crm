/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const request = require('supertest');
const http = require('http');

async function runCorsTests() {
  console.log('========================================================================');
  console.log('TEST 4: CROSS-SUBDOMAIN CORS & PRODUCTION COOKIE VERIFICATION');
  console.log('Target API: http://localhost:3333');
  console.log('Allowed Origin: https://admin.example.com');
  console.log('Blocked Origin: https://evil.example');
  console.log('========================================================================\n');

  const serverUrl = 'http://localhost:3333';

  // 1. Preflight OPTIONS request with allowed origin
  console.log('[1/4] Preflight OPTIONS request with Origin: https://admin.example.com ...');
  const preflightRes = await request(serverUrl)
    .options('/api/v1/platform-auth/login')
    .set('Origin', 'https://admin.example.com')
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'Content-Type, X-Requested-With');

  console.log('HTTP Status:', preflightRes.status);
  console.log('Access-Control-Allow-Origin:', preflightRes.headers['access-control-allow-origin']);
  console.log('Access-Control-Allow-Credentials:', preflightRes.headers['access-control-allow-credentials']);
  console.log('Access-Control-Allow-Methods:', preflightRes.headers['access-control-allow-methods']);
  console.log('Access-Control-Allow-Headers:', preflightRes.headers['access-control-allow-headers']);

  // 2. Request with disallowed origin https://evil.example
  console.log('\n[2/4] Request with Disallowed Origin: https://evil.example ...');
  const evilRes = await request(serverUrl)
    .options('/api/v1/platform-auth/login')
    .set('Origin', 'https://evil.example')
    .set('Access-Control-Request-Method', 'POST');

  console.log('HTTP Status:', evilRes.status);
  console.log('Access-Control-Allow-Origin:', evilRes.headers['access-control-allow-origin'] || '(NONE - Header Absent)');
  console.log('Access-Control-Allow-Credentials:', evilRes.headers['access-control-allow-credentials'] || '(NONE - Header Absent)');

  // 3. POST Login with allowed origin https://admin.example.com
  console.log('\n[3/4] POST Login request with Origin: https://admin.example.com ...');
  const loginRes = await request(serverUrl)
    .post('/api/v1/platform-auth/login')
    .set('Origin', 'https://admin.example.com')
    .set('X-Requested-With', 'XMLHttpRequest')
    .set('Content-Type', 'application/json')
    .send({
      email: 'platform@example.com',
      password: 'type-your-own-long-password',
    });

  console.log('HTTP Status:', loginRes.status);
  console.log('Access-Control-Allow-Origin:', loginRes.headers['access-control-allow-origin']);
  console.log('Access-Control-Allow-Credentials:', loginRes.headers['access-control-allow-credentials']);
  console.log('Vary Header:', loginRes.headers['vary']);
  console.log('Set-Cookie Header:', loginRes.headers['set-cookie']);

  // 4. Production Mode Set-Cookie Attributes Verification
  console.log('\n[4/4] Production Mode Set-Cookie Attributes Verification (NODE_ENV=production) ...');
  // Demonstrate cookie generation in production mode
  const { NestFactory } = require('@nestjs/core');
  const cookieParser = require('cookie-parser');
  const { AppModule } = require('../apps/api/dist/app.module');
  const { corsOriginCallback } = require('../apps/api/dist/common/cors-config');
  const helmet = require('helmet');

  // Set production environment temporarily for cookie options generator check
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  // Instantiate headless app
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.enableCors({
    origin: corsOriginCallback,
    credentials: true,
  });
  await app.init();
  const httpServer = app.getHttpServer();

  const prodRes = await request(httpServer)
    .post('/api/v1/platform-auth/login')
    .set('Origin', 'https://admin.example.com')
    .set('X-Requested-With', 'XMLHttpRequest')
    .set('Content-Type', 'application/json')
    .send({
      email: 'platform@example.com',
      password: 'type-your-own-long-password',
    });

  const prodCookies = prodRes.headers['set-cookie'] || [];
  console.log('Production Set-Cookie Headers:');
  prodCookies.forEach((c) => console.log(' -> ' + c));

  // Also test staff login cookie in production mode
  const prodStaffRes = await request(httpServer)
    .post('/api/v1/auth/login')
    .set('Origin', 'https://admin.example.com')
    .set('X-Requested-With', 'XMLHttpRequest')
    .set('Content-Type', 'application/json')
    .send({
      identifier: 'tenantadmin@example.com',
      password: 'type-your-own-long-password',
    });

  const prodStaffCookies = prodStaffRes.headers['set-cookie'] || [];
  console.log('Production Staff Set-Cookie Headers:');
  prodStaffCookies.forEach((c) => console.log(' -> ' + c));

  await app.close();
  process.env.NODE_ENV = prevEnv;

  // Assertions
  const allowOriginMatch = preflightRes.headers['access-control-allow-origin'] === 'https://admin.example.com';
  const allowCredsMatch = preflightRes.headers['access-control-allow-credentials'] === 'true';
  const evilBlocked = evilRes.headers['access-control-allow-origin'] === undefined;
  const prodCookieMatch = prodCookies.some((c) =>
    c.includes('HttpOnly') &&
    c.includes('Secure') &&
    c.includes('SameSite=Strict') &&
    c.includes('Path=/api/v1/platform-auth')
  );

  console.log('\n========================================================================');
  console.log('CROSS-SUBDOMAIN ASSERTIONS SUMMARY');
  console.log('========================================================================');
  console.log('1. Allowed Origin exact match (https://admin.example.com)  :', allowOriginMatch ? 'PASS' : 'FAIL');
  console.log('2. Allow-Credentials is true                              :', allowCredsMatch ? 'PASS' : 'FAIL');
  console.log('3. Disallowed Origin (https://evil.example) gets NO CORS  :', evilBlocked ? 'PASS' : 'FAIL');
  console.log('4. Production Set-Cookie: HttpOnly; Secure; SameSite=Strict; Path :', prodCookieMatch ? 'PASS' : 'FAIL');
  console.log('========================================================================\n');

  console.log('WHY SameSite=Strict WORKS BETWEEN admin.example.com AND api.example.com:');
  console.log('Under the Public Suffix List, both admin.example.com and api.example.com share the exact same effective top-level domain plus one (eTLD+1), which is example.com.');
  console.log('Because browser cookie specifications define a "site" strictly as scheme plus eTLD+1, cross-subdomain requests within the same apex domain are classified as same-site rather than cross-site, allowing SameSite=Strict cookies to be safely sent and received.');
  console.log('========================================================================\n');
}

runCorsTests().catch((err) => {
  console.error('Fatal CORS test error:', err);
  process.exit(1);
});
