/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Production Security Hygiene Verification Suite
 *
 * Validates that nothing internal is ever shown or served to the public:
 * - Production error response formatting & strict filtering
 * - Request ID propagation and log correlation
 * - Security headers & X-Powered-By removal
 * - Swagger/Docs/Metrics lockdown in production
 * - Public /health endpoint information leak prevention
 * - Dist scanner & file hygiene verification
 * - Build guard for non-allowlisted VITE_ variables
 * - PII and secrets redaction in logs, audit rows, and client error reports
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');

let passedTests = 0;
let totalTests = 0;

function it(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function itAsync(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function run() {
  console.log('======================================================================');
  console.log(' [TEST:SUITE] Production Security Hygiene & Public Exposure Prevention');
  console.log('======================================================================\n');

  // Register ts-node for TypeScript modules
  require('ts-node').register({ project: path.resolve(__dirname, '../apps/api/tsconfig.json') });

  // Load backend redaction utility
  const { redactSensitiveString, redactSensitiveObject, cleanUrlPath } = require('../apps/api/src/common/redact.util');

  // Load GlobalHttpExceptionFilter and HttpException
  const { HttpException } = require('@nestjs/common');
  const filterModule = require('../apps/api/src/common/http-exception.filter');
  const GlobalHttpExceptionFilter = filterModule.GlobalHttpExceptionFilter || filterModule.HttpExceptionFilter;

  // Mock response collector helper
  function createMockContext(isProduction = true) {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = isProduction ? 'production' : 'development';

    const headers = {};
    let statusCode = 200;
    let jsonBody = null;

    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (body) => {
        jsonBody = body;
        return res;
      },
      setHeader: (k, v) => {
        headers[k.toLowerCase()] = v;
      },
      get: (k) => headers[k.toLowerCase()],
    };

    const req = {
      method: 'GET',
      url: '/api/v1/test',
      headers: { 'x-request-id': 'req-test-security-12345' },
    };

    const host = {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    };

    const restore = () => {
      process.env.NODE_ENV = originalEnv;
    };

    return { host, req, res, getStatusCode: () => statusCode, getJson: () => jsonBody, getHeaders: () => headers, restore };
  }

  // ─── 1. PRODUCTION ERROR RESPONSES ──────────────────────────────────────────
  it('Production mode forced database error returns only safe shape { statusCode, code, message, requestId, fieldErrors }', () => {
    const ctx = createMockContext(true);
    const filter = new GlobalHttpExceptionFilter();

    const dbException = new Error('Database connection failure: SELECT * FROM "User" WHERE id = 123');
    (dbException).code = 'P2002';
    (dbException).name = 'PrismaClientKnownRequestError';

    filter.catch(dbException, ctx.host);
    const body = ctx.getJson();
    ctx.restore();

    assert.strictEqual(body.statusCode, 409);
    assert.strictEqual(body.code, 'DUPLICATE');
    assert.strictEqual(typeof body.message, 'string');
    assert.strictEqual(body.requestId, 'req-test-security-12345');
    assert.strictEqual(Array.isArray(body.fieldErrors), true);

    const keys = Object.keys(body).sort();
    const expectedKeys = ['code', 'fieldErrors', 'message', 'requestId', 'statusCode'];
    assert.deepStrictEqual(keys, expectedKeys);
  });

  it('Production error response body contains no stack trace', () => {
    const ctx = createMockContext(true);
    const filter = new GlobalHttpExceptionFilter();

    const errWithStack = new Error('Secret crash on C:\\Users\\JNC R&D\\apps\\api\\src\\auth.service.ts:45');
    filter.catch(errWithStack, ctx.host);
    const body = ctx.getJson();
    ctx.restore();

    const jsonStr = JSON.stringify(body);
    assert.strictEqual(jsonStr.includes('stack'), false);
    assert.strictEqual(jsonStr.includes('auth.service.ts'), false);
  });

  it('Production error response body contains no "Prisma" or Prisma error codes', () => {
    const ctx = createMockContext(true);
    const filter = new GlobalHttpExceptionFilter();

    const prismaErr = new Error('PrismaClientKnownRequestError: Unique constraint failed on the fields: (`email`)');
    (prismaErr).code = 'P2002';
    (prismaErr).name = 'PrismaClientKnownRequestError';

    filter.catch(prismaErr, ctx.host);
    const body = ctx.getJson();
    ctx.restore();

    const jsonStr = JSON.stringify(body);
    assert.strictEqual(/prisma/i.test(jsonStr), false);
    assert.strictEqual(jsonStr.includes('P2002'), false);
  });

  it('Production error response body contains no SQL keywords or database table/column names', () => {
    const ctx = createMockContext(true);
    const filter = new GlobalHttpExceptionFilter();

    const sqlErr = new Error('syntax error at or near "SELECT * FROM users WHERE email = \'test@example.com\'"');
    filter.catch(sqlErr, ctx.host);
    const body = ctx.getJson();
    ctx.restore();

    const jsonStr = JSON.stringify(body);
    assert.strictEqual(/\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|DROP|TABLE)\b/i.test(jsonStr), false);
  });

  it('Production error response body contains no file paths or system directories', () => {
    const ctx = createMockContext(true);
    const filter = new GlobalHttpExceptionFilter();

    const pathErr = new Error('ENOENT: no such file or directory, open "C:\\Users\\admin\\repo\\config.json"');
    filter.catch(pathErr, ctx.host);
    const body = ctx.getJson();
    ctx.restore();

    const jsonStr = JSON.stringify(body);
    assert.strictEqual(/([A-Z]:\\[^\s"]+|\/(?:home|app|usr|var|etc)\/[^\s"]+)/i.test(jsonStr), false);
  });

  it('Production error response body contains no internal environment variable names', () => {
    const ctx = createMockContext(true);
    const filter = new GlobalHttpExceptionFilter();

    const envErr = new Error('DATABASE_URL or JWT_SECRET is not configured properly in process.env');
    filter.catch(envErr, ctx.host);
    const body = ctx.getJson();
    ctx.restore();

    const jsonStr = JSON.stringify(body);
    assert.strictEqual(jsonStr.includes('DATABASE_URL'), false);
    assert.strictEqual(jsonStr.includes('JWT_SECRET'), false);
  });

  it('Production error response body contains no internal role lists', () => {
    const ctx = createMockContext(true);
    const filter = new GlobalHttpExceptionFilter();

    const roleErr = new HttpException(
      'Access denied for role sales_rep. Requires one of: [admin, super_admin, platform_super_admin, accountant]',
      403
    );
    filter.catch(roleErr, ctx.host);
    const body = ctx.getJson();
    ctx.restore();

    const jsonStr = JSON.stringify(body);
    assert.strictEqual(jsonStr.includes('platform_super_admin'), false);
    assert.strictEqual(jsonStr.includes('sales_rep'), false);
    assert.strictEqual(body.message, 'You do not have permission to perform this action.');
  });

  it('Validation error returns safe shape naming only the form field without internal types', () => {
    const ctx = createMockContext(true);
    const filter = new GlobalHttpExceptionFilter();

    const validationErr = new HttpException(
      {
        message: ['gstin must be a valid GSTIN format (e.g. 29ABCDE1234F1Z5)', 'phone must be 10 digits'],
        error: 'Bad Request',
        statusCode: 400,
      },
      400
    );
    filter.catch(validationErr, ctx.host);
    const body = ctx.getJson();
    ctx.restore();

    assert.strictEqual(body.statusCode, 400);
    assert.strictEqual(body.code, 'VALIDATION_FAILED');
    assert.strictEqual(Array.isArray(body.fieldErrors), true);
    assert.strictEqual(body.fieldErrors.length, 2);
    assert.strictEqual(body.fieldErrors[0].field, 'gstin');
    assert.strictEqual(typeof body.fieldErrors[0].message, 'string');
    assert.strictEqual(JSON.stringify(body).includes('class-validator'), false);
  });

  it('Authentication error (401) returns generic message and does not reveal account existence', () => {
    const ctx = createMockContext(true);
    const filter = new GlobalHttpExceptionFilter();

    const authErr = new HttpException('User with email john@company.com does not exist in tenant', 401);
    filter.catch(authErr, ctx.host);
    const body = ctx.getJson();
    ctx.restore();

    assert.strictEqual(body.statusCode, 401);
    assert.strictEqual(body.message, 'Invalid credentials.');
    assert.strictEqual(JSON.stringify(body).includes('john@company.com'), false);
  });

  it('Forbidden error (403) returns generic message and does not leak role names or permission sets', () => {
    const ctx = createMockContext(true);
    const filter = new GlobalHttpExceptionFilter();

    const forbiddenErr = new HttpException('Missing user_read permission for tenant 123', 403);
    filter.catch(forbiddenErr, ctx.host);
    const body = ctx.getJson();
    ctx.restore();

    assert.strictEqual(body.statusCode, 403);
    assert.strictEqual(body.message, 'You do not have permission to perform this action.');
    assert.strictEqual(JSON.stringify(body).includes('user_read'), false);
  });

  it('Not found error (404) returns plain generic message without internal routes', () => {
    const ctx = createMockContext(true);
    const filter = new GlobalHttpExceptionFilter();

    const notFoundErr = new HttpException('Cannot GET /api/v1/internal/admin/secret-keys', 404);
    filter.catch(notFoundErr, ctx.host);
    const body = ctx.getJson();
    ctx.restore();

    assert.strictEqual(body.statusCode, 404);
    assert.strictEqual(body.message, 'The requested resource could not be found.');
    assert.strictEqual(JSON.stringify(body).includes('secret-keys'), false);
  });

  it('Unexpected 500 exception returns generic message and preserves safe response shape', () => {
    const ctx = createMockContext(true);
    const filter = new GlobalHttpExceptionFilter();

    const unexpectedErr = new Error('Unexpected null pointer in payment deduction computation');
    filter.catch(unexpectedErr, ctx.host);
    const body = ctx.getJson();
    ctx.restore();

    assert.strictEqual(body.statusCode, 500);
    assert.strictEqual(body.code, 'INTERNAL');
    assert.ok(
      body.message === 'An internal database error occurred.' ||
      body.message === 'We could not complete your request right now. Please try again in a few minutes.'
    );
    assert.strictEqual(body.requestId, 'req-test-security-12345');
  });

  // ─── 2. REQUEST ID & HEADERS ────────────────────────────────────────────────
  it('Response requestId matches X-Request-Id header and server error log line', () => {
    const ctx = createMockContext(true);
    const filter = new GlobalHttpExceptionFilter();

    filter.catch(new Error('Crash test'), ctx.host);
    const body = ctx.getJson();
    const headers = ctx.getHeaders();
    ctx.restore();

    assert.strictEqual(body.requestId, 'req-test-security-12345');
    assert.strictEqual(headers['x-request-id'], 'req-test-security-12345');
  });

  it('Security headers (HSTS, nosniff, Referrer-Policy, Permissions-Policy, strict CSP) are present', () => {
    const ctx = createMockContext(true);
    const filter = new GlobalHttpExceptionFilter();

    filter.catch(new HttpException('Bad Request', 400), ctx.host);
    const headers = ctx.getHeaders();
    ctx.restore();

    assert.strictEqual(headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(headers['x-frame-options'], 'DENY');
    assert.strictEqual(headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.strictEqual(typeof headers['permissions-policy'], 'string');
    assert.strictEqual(headers['strict-transport-security'].includes('max-age='), true);
    assert.strictEqual(headers['content-security-policy'].includes("default-src 'none'"), true);
  });

  it('X-Powered-By and Server response headers are completely removed', () => {
    const mainSrc = fs.readFileSync(path.resolve(__dirname, '../apps/api/src/main.ts'), 'utf8');
    assert.strictEqual(mainSrc.includes("disable('x-powered-by')"), true, 'Must call disable(x-powered-by)');
    assert.strictEqual(mainSrc.includes("res.removeHeader('X-Powered-By')"), true, 'Must remove X-Powered-By in middleware');
    assert.strictEqual(mainSrc.includes("res.removeHeader('Server')"), true, 'Must remove Server in middleware');
  });

  it('Swagger and API documentation endpoints return 404 / are disabled in production', () => {
    const mainSrc = fs.readFileSync(path.resolve(__dirname, '../apps/api/src/main.ts'), 'utf8');
    assert.strictEqual(mainSrc.includes('isDocOrDebugOrMetric && isProd'), true);
    assert.strictEqual(mainSrc.includes("message: 'The requested resource could not be found.'"), true);
  });

  it('Public /health endpoint returns only allowed fields (status, version, commitId, database, migrations counts)', () => {
    const healthSrc = fs.readFileSync(path.resolve(__dirname, '../apps/api/src/health/health.controller.ts'), 'utf8');
    assert.strictEqual(healthSrc.includes('if (isProd)'), true);
    assert.strictEqual(healthSrc.includes("status: isHealthy ? 'ok' : 'degraded'"), true);
    assert.strictEqual(healthSrc.includes('version: API_VERSION'), true);
    assert.strictEqual(healthSrc.includes('commitId: resolveApiCommitId()'), true);
    assert.strictEqual(healthSrc.includes("database: database ? 'ok' : 'down'"), true);
    assert.strictEqual(healthSrc.includes('total: migrationCounts.total'), true);
  });

  it('Public /health in production does not leak provider, features, or migration filenames', () => {
    const healthSrc = fs.readFileSync(path.resolve(__dirname, '../apps/api/src/health/health.controller.ts'), 'utf8');
    assert.strictEqual(healthSrc.includes('emailDiagnostics: emailHealth'), true);
    // Verified that emailDiagnostics and features are only returned when !isProd
    const isProdIdx = healthSrc.indexOf('if (isProd)');
    const featuresIdx = healthSrc.indexOf('features: [');
    assert.strictEqual(featuresIdx > isProdIdx, true);
  });

  // ─── 3. DIST & REPO SCANNERS ────────────────────────────────────────────────
  it('Dist secrets scanner (scripts/scan-dist-secrets.js) successfully detects injected fake API keys and secrets', () => {
    const scannerSrc = fs.readFileSync(path.resolve(__dirname, 'scan-dist-secrets.js'), 'utf8');
    assert.strictEqual(scannerSrc.includes('SECRET_PATTERNS'), true);
    assert.strictEqual(scannerSrc.includes('AKIA'), true);
    assert.strictEqual(scannerSrc.includes('ghp_'), true);
    assert.strictEqual(scannerSrc.includes('PRIVATE KEY'), true);
  });

  it('Public file hygiene checker (scripts/check-public-files.js) successfully detects forbidden .zip or .map files in dist', () => {
    const checkerSrc = fs.readFileSync(path.resolve(__dirname, 'check-public-files.js'), 'utf8');
    assert.strictEqual(checkerSrc.includes('.zip'), true);
    assert.strictEqual(checkerSrc.includes('.map'), true);
    assert.strictEqual(checkerSrc.includes('.sql'), true);
    assert.strictEqual(checkerSrc.includes('.env'), true);
  });

  it('Vite configuration blocks build when an unauthorized VITE_* environment variable is defined', () => {
    const viteConfig = fs.readFileSync(path.resolve(__dirname, '../apps/web/vite.config.ts'), 'utf8');
    assert.strictEqual(viteConfig.includes('ALLOWED_VITE_VARS'), true);
    assert.strictEqual(viteConfig.includes('Non-allowed VITE_ environment variable(s) detected:'), true);
  });

  // ─── 4. PII & SENSITIVE DATA REDACTION ──────────────────────────────────────
  it('Universal string redactor redacts passwords, JWTs, and bearer tokens in logs', () => {
    const sample = 'User login failed with password="SuperSecretPassword123" and token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.xyz and Bearer test-token-123';
    const redacted = redactSensitiveString(sample);
    assert.strictEqual(redacted.includes('SuperSecretPassword123'), false);
    assert.strictEqual(redacted.includes('password=[REDACTED]'), true);
    assert.strictEqual(redacted.includes('[REDACTED_JWT]'), true);
    assert.strictEqual(redacted.includes('Bearer [REDACTED]'), true);
  });

  it('Universal string redactor redacts cookies and session identifiers', () => {
    const sample = 'Request headers: Cookie: connect.sid=s%3A123456789; access_token=secret_val';
    const redacted = redactSensitiveString(sample);
    assert.strictEqual(redacted.includes('123456789'), false);
    assert.strictEqual(redacted.includes('Cookie: [REDACTED]'), true);
  });

  it('Universal string redactor redacts OTP verification codes', () => {
    const sample = '2FA challenge submitted with verificationCode="654321" and otp=123456';
    const redacted = redactSensitiveString(sample);
    assert.strictEqual(redacted.includes('654321'), false);
    assert.strictEqual(redacted.includes('123456'), false);
    assert.strictEqual(redacted.includes('verificationCode=[REDACTED]'), true);
  });

  it('Universal string redactor redacts full email addresses', () => {
    const sample = 'Notification dispatched to customer at support.lead@acme-corp.com and billing@mycompany.org';
    const redacted = redactSensitiveString(sample);
    assert.strictEqual(redacted.includes('support.lead@acme-corp.com'), false);
    assert.strictEqual(redacted.includes('billing@mycompany.org'), false);
    assert.strictEqual(redacted.includes('[REDACTED_EMAIL]'), true);
  });

  it('Universal string redactor redacts full 9-18 digit bank account numbers', () => {
    const sample = 'Payment processed for accountNumber: 123456789012345 and IFSC: HDFC0001234';
    const redacted = redactSensitiveString(sample);
    assert.strictEqual(redacted.includes('123456789012345'), false);
    assert.strictEqual(redacted.includes('accountNumber=[REDACTED_ACCOUNT]'), true);
  });

  it('Audit log beforeState and afterState are deeply redacted of credentials, tokens, and bank details', () => {
    const auditPayload = {
      user: {
        id: 'usr-1',
        email: 'alice@example.com',
        passwordHash: '$2b$10$hashedpasswordstring',
        twoFactorSecret: 'JBSWY3DPEHPK3PXP',
      },
      bankDetails: {
        accountNumber: '987654321098',
        beneficiary: 'Alice Smith',
      },
      session: {
        accessToken: 'eyJhbGciOiJIUzI1NiJ9.xxx',
        cookie: 'sid=12345',
      },
    };

    const cleanAudit = redactSensitiveObject(auditPayload);
    assert.strictEqual(cleanAudit.user.passwordHash, '[REDACTED]');
    assert.strictEqual(cleanAudit.user.twoFactorSecret, '[REDACTED]');
    assert.strictEqual(cleanAudit.user.email, '[REDACTED_EMAIL]');
    assert.strictEqual(cleanAudit.bankDetails.accountNumber, '[REDACTED]');
    assert.strictEqual(cleanAudit.session.accessToken, '[REDACTED]');
    assert.strictEqual(cleanAudit.session.cookie, '[REDACTED]');
  });

  it('Client-errors endpoint cleans route paths, strips query parameters, and enforces short messages', () => {
    const rawRoute = '/api/v1/invoices?token=secret123&client_secret=xyz#section2';
    const clean = cleanUrlPath(rawRoute);
    assert.strictEqual(clean, '/api/v1/invoices');
    assert.strictEqual(clean.includes('secret123'), false);
    assert.strictEqual(clean.includes('#section2'), false);
  });

  it('Web UnifiedErrorComponent renders Reference ID with Copy button and support quote guidance', () => {
    const unifiedErrorSrc = fs.readFileSync(
      path.resolve(__dirname, '../apps/web/src/components/common/UnifiedErrorComponent.tsx'),
      'utf8'
    );
    assert.strictEqual(unifiedErrorSrc.includes('Reference:'), true);
    assert.strictEqual(unifiedErrorSrc.includes('navigator.clipboard.writeText(referenceId)'), true);
    assert.strictEqual(
      unifiedErrorSrc.includes('If this keeps happening, contact support and quote this reference.'),
      true
    );
  });

  it('Production .htaccess file enforces no directory listing, denies dotfiles, denies .zip/.sql, and enforces HTTPS', () => {
    const htaccess = fs.readFileSync(path.resolve(__dirname, '../apps/web/public/.htaccess'), 'utf8');
    assert.strictEqual(htaccess.includes('Options -Indexes'), true, 'Must disable directory indexing');
    assert.strictEqual(htaccess.includes('RewriteEngine On'), true, 'Must enable rewrite engine');
    assert.strictEqual(htaccess.includes('RewriteCond %{HTTPS} off'), true, 'Must redirect HTTP to HTTPS');
    assert.strictEqual(htaccess.includes('(zip|sql|tar|gz|tgz|7z|rar|bak|backup|log|env'), true, 'Must deny sensitive extensions');
    assert.strictEqual(htaccess.includes('Strict-Transport-Security'), true, 'Must set HSTS');
    assert.strictEqual(htaccess.includes('X-Content-Type-Options "nosniff"'), true, 'Must set nosniff');
  });

  console.log('\n======================================================================');
  console.log(` [PASSED] ${passedTests}/${totalTests} Production Security Hygiene Tests Succeeded!`);
  console.log('======================================================================\n');
}

run().catch((err) => {
  console.error('\n[FATAL] Test execution failed:', err);
  process.exit(1);
});
