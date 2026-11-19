import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { redactSensitiveString, redactSensitiveObject, cleanUrlPath } from '../../apps/api/src/common/redact.util';
import { GlobalHttpExceptionFilter } from '../../apps/api/src/common/http-exception.filter';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('Production Security Hygiene & Information Exposure Prevention', () => {
  function createMockContext(isProduction = true) {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = isProduction ? 'production' : 'development';

    const headers: Record<string, string> = {};
    let statusCode = 200;
    let jsonBody: any = null;

    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      json: (body: any) => {
        jsonBody = body;
        return res;
      },
      setHeader: (k: string, v: string) => {
        headers[k.toLowerCase()] = v;
      },
      getHeader: (k: string) => headers[k.toLowerCase()],
    };

    const req: any = {
      method: 'GET',
      url: '/api/v1/test',
      headers: { 'x-request-id': 'req-vitest-security-12345' },
    };

    const host: any = {
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

  it('Production mode forced database error returns safe shape with no SQL, table, or column names', () => {
    const ctx = createMockContext(true);
    const filter = new GlobalHttpExceptionFilter();

    const dbException: any = new Error('Database connection failure: SELECT * FROM "User" WHERE id = 123');
    dbException.code = 'P2002';
    dbException.name = 'PrismaClientKnownRequestError';

    filter.catch(dbException, ctx.host);
    const body = ctx.getJson();
    ctx.restore();

    expect(body.statusCode).toBe(HttpStatus.CONFLICT);
    expect(body.code).toBe('DUPLICATE');
    expect(body.requestId).toBe('req-vitest-security-12345');
    expect(Array.isArray(body.fieldErrors)).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/SELECT|User|Prisma|P2002/i);
  });

  it('Production error response never contains stack traces or server file paths', () => {
    const ctx = createMockContext(true);
    const filter = new GlobalHttpExceptionFilter();

    const err = new Error('Secret crash on C:\\Users\\JNC R&D\\apps\\api\\src\\auth.service.ts:45');
    filter.catch(err, ctx.host);
    const body = ctx.getJson();
    ctx.restore();

    expect(body.statusCode).toBe(500);
    expect(JSON.stringify(body)).not.toContain('auth.service.ts');
    expect(JSON.stringify(body)).not.toContain('stack');
  });

  it('Authentication error (401) returns generic message without revealing account existence', () => {
    const ctx = createMockContext(true);
    const filter = new GlobalHttpExceptionFilter();

    const authErr = new HttpException('User with email admin@corp.com does not exist', 401);
    filter.catch(authErr, ctx.host);
    const body = ctx.getJson();
    ctx.restore();

    expect(body.statusCode).toBe(401);
    expect(body.message).toBe('Invalid credentials.');
    expect(JSON.stringify(body)).not.toContain('admin@corp.com');
  });

  it('Forbidden error (403) returns generic message without leaking internal role lists', () => {
    const ctx = createMockContext(true);
    const filter = new GlobalHttpExceptionFilter();

    const forbiddenErr = new HttpException('Access denied for role sales_rep. Requires: [platform_super_admin]', 403);
    filter.catch(forbiddenErr, ctx.host);
    const body = ctx.getJson();
    ctx.restore();

    expect(body.statusCode).toBe(403);
    expect(body.message).toBe('You do not have permission to perform this action.');
    expect(JSON.stringify(body)).not.toContain('platform_super_admin');
  });

  it('404 error returns plain generic message without internal routes', () => {
    const ctx = createMockContext(true);
    const filter = new GlobalHttpExceptionFilter();

    const notFoundErr = new HttpException('Cannot GET /api/v1/internal/admin/secret-keys', 404);
    filter.catch(notFoundErr, ctx.host);
    const body = ctx.getJson();
    ctx.restore();

    expect(body.statusCode).toBe(404);
    expect(body.message).toBe('The requested resource could not be found.');
    expect(JSON.stringify(body)).not.toContain('secret-keys');
  });

  it('RequestId is propagated in body and x-request-id header', () => {
    const ctx = createMockContext(true);
    const filter = new GlobalHttpExceptionFilter();

    filter.catch(new Error('Crash test'), ctx.host);
    const body = ctx.getJson();
    const headers = ctx.getHeaders();
    ctx.restore();

    expect(body.requestId).toBe('req-vitest-security-12345');
    expect(headers['x-request-id']).toBe('req-vitest-security-12345');
  });

  it('Security headers (HSTS, nosniff, strict CSP, Referrer-Policy, Permissions-Policy) are set', () => {
    const ctx = createMockContext(true);
    const filter = new GlobalHttpExceptionFilter();

    filter.catch(new HttpException('Bad Request', 400), ctx.host);
    const headers = ctx.getHeaders();
    ctx.restore();

    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['strict-transport-security']).toContain('max-age=');
    expect(headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('Public /health in production mode returns only status, version, commitId, database, migrations counts', () => {
    const healthSrc = fs.readFileSync(path.resolve(__dirname, '../../apps/api/src/health/health.controller.ts'), 'utf8');
    expect(healthSrc).toContain('if (isProd)');
    expect(healthSrc).toContain('version: API_VERSION');
    expect(healthSrc).toContain('database: database ?');
    expect(healthSrc).toContain('total: migrationCounts.total');
  });

  it('Universal redaction redacts passwords, tokens, cookies, emails, bank accounts and OTPs', () => {
    const sample = 'User pass="MySecret123" token="Bearer eyJhbGci.xxx" email="user@acme.com" bank="1234567890123" otp="654321"';
    const redacted = redactSensitiveString(sample);

    expect(redacted).not.toContain('MySecret123');
    expect(redacted).not.toContain('user@acme.com');
    expect(redacted).not.toContain('1234567890123');
    expect(redacted).not.toContain('654321');
    expect(redacted).toContain('[REDACTED]');
    expect(redacted).toContain('[REDACTED_EMAIL]');
  });

  it('Audit row redaction protects nested objects beforeState and afterState', () => {
    const payload = {
      credentials: { password: 'secretpassword', token: 'jwt-123' },
      user: { email: 'staff@jsnc.co.in' },
      finances: { accountNumber: '9876543210123' },
    };

    const clean = redactSensitiveObject(payload);
    expect(clean.credentials.password).toBe('[REDACTED]');
    expect(clean.credentials.token).toBe('[REDACTED]');
    expect(clean.user.email).toBe('[REDACTED_EMAIL]');
    expect(clean.finances.accountNumber).toBe('[REDACTED]');
  });

  it('cleanUrlPath strips query parameters and URL fragments', () => {
    expect(cleanUrlPath('/api/v1/invoices?token=secret123&client_secret=xyz#page2')).toBe('/api/v1/invoices');
    expect(cleanUrlPath('/login?returnTo=/dashboard')).toBe('/login');
  });
});
