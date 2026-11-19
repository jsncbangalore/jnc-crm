/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateSupportCode, isSupportCodeHidden } from '../../apps/api/src/common/support-code.util';
import { generateSupportCode as generateWebSupportCode, isSupportCodeHidden as isWebSupportCodeHidden } from '../../apps/web/src/utils/supportCode';
import { getApiErrorMessage } from '../../apps/web/src/services/api';
import { parseApiError } from '../../apps/web/src/components/common/ErrorStateCard';
import { HealthController } from '../../apps/api/src/health/health.controller';
import * as migrationUtil from '../../apps/api/src/common/migration-status.util';

describe('Public Leak Prevention & Support Code Unit Suite', () => {
  describe('Support Code Generation & Consistency', () => {
    it('generates a 7-character support code with format XXX-XXX', () => {
      const code = generateSupportCode('req_87654321-abcd-ef01-2345-6789abcdef01');
      expect(code).toMatch(/^[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}$/);
    });

    it('backend and frontend generate the exact same deterministic support code for a given requestId', () => {
      const reqId = 'd169d300-3490-410a-9bc6-35368a5c37c2';
      const apiCode = generateSupportCode(reqId);
      const webCode = generateWebSupportCode(reqId);
      expect(apiCode).toBe(webCode);
      expect(apiCode.length).toBe(7);
      expect(apiCode).not.toContain('0');
      expect(apiCode).not.toContain('O');
      expect(apiCode).not.toContain('1');
      expect(apiCode).not.toContain('I');
      expect(apiCode).not.toContain('L');
    });

    it('generates non-colliding distinct support codes for different request IDs', () => {
      const code1 = generateSupportCode('req_11111111');
      const code2 = generateSupportCode('req_22222222');
      expect(code1).not.toBe(code2);
    });

    it('respects support code hidden configuration flag', () => {
      expect(isSupportCodeHidden()).toBe(false);
      expect(isWebSupportCodeHidden()).toBe(false);
    });
  });

  describe('Friendly Error Messages Mapping', () => {
    it('maps network errors to plain sentence without technical details', () => {
      const msg = getApiErrorMessage({ code: 'ERR_NETWORK' });
      expect(msg).toBe('Could not reach the server. Check your internet and try again.');
    });

    it('maps 500 error on login to specific friendly sentence', () => {
      const msg = getApiErrorMessage({
        config: { url: '/api/v1/auth/login' },
        response: { status: 500, data: { message: 'Internal Server Error' } },
      });
      expect(msg).toBe('We could not sign you in right now. Please try again in a few minutes.');
      expect(msg).not.toContain('Ref:');
      expect(msg).not.toMatch(/[a-f0-9]{8}-[a-f0-9]{4}/);
    });

    it('maps 500 error on generic app routes to safe plain sentence', () => {
      const msg = getApiErrorMessage({
        config: { url: '/api/v1/invoices' },
        response: { status: 500, data: { message: 'Prisma Client error column not found' } },
      });
      expect(msg).toBe('We could not complete your request right now. Please try again in a few minutes.');
      expect(msg).not.toContain('Prisma');
      expect(msg).not.toContain('column');
    });

    it('maps 503 and schema errors to friendly maintenance sentence', () => {
      const msg503 = getApiErrorMessage({
        response: { status: 503, data: { code: 'SCHEMA_OUT_OF_DATE' } },
      });
      expect(msg503).toBe('The system is being updated. Please try again in a few minutes.');
    });

    it('maps 429 rate limit to friendly countdown message', () => {
      const msg429 = getApiErrorMessage({
        response: { status: 429, headers: { 'retry-after': '900' } },
      });
      expect(msg429).toBe('Too many attempts. Please wait 15 minutes.');
    });

    it('parseApiError derives short support code and strips UUIDs from visible text', () => {
      const err = {
        response: {
          status: 500,
          data: {
            code: 'INTERNAL',
            requestId: 'c345a901-b234-4567-8901-23456789abcd',
          },
        },
      };
      const parsed = parseApiError(err);
      expect(parsed.message).toBe('We could not complete your request right now. Please try again in a few minutes.');
      expect(parsed.supportCode).toMatch(/^[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}$/);
      expect(parsed.message).not.toContain(parsed.referenceId);
    });
  });

  describe('Public /health Privacy Lockdown', () => {
    it('public /health returns strictly status, version, database, and migrations', async () => {
      const mockPrisma = {
        $queryRawUnsafe: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
      } as any;
      const mockNotifications = {
        getEmailHealthStatus: vi.fn().mockResolvedValue({ status: 'ok', provider: 'resend', host: 'smtp.internal.local' }),
      } as any;

      vi.spyOn(migrationUtil, 'getMigrationStatus').mockResolvedValue({
        total: 28,
        applied: 28,
        pending: [],
        failedList: [],
        isReady: true,
      });

      const controller = new HealthController(mockPrisma, mockNotifications);
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      let res: any;
      try {
        res = await controller.getHealth();
      } finally {
        process.env.NODE_ENV = prevEnv;
      }

      expect(res).toEqual({
        status: 'ok',
        version: '1.2.0',
        database: 'ok',
        migrations: {
          total: 28,
          applied: 28,
          pending: 0,
          failed: 0,
        },
      });

      // Verify no technical or sensitive fields leaked to public caller
      const resKeys = Object.keys(res);
      expect(resKeys.sort()).toEqual(['database', 'migrations', 'status', 'version'].sort());
      expect((res as any).emailDiagnostics).toBeUndefined();
      expect((res as any).commitId).toBeUndefined();
      expect((res as any).features).toBeUndefined();
      expect((res as any).uptime).toBeUndefined();
    });
  });

  describe('Build ID Normalization & Mismatch Parity', () => {
    it('normalizes commit hashes: 7-character trimmed lowercase comparison prevents false warning when IDs are equal', () => {
      const webCommit = 'A5D7C81f302e ';
      const apiCommit = 'a5d7c81987ba';

      const cleanWeb = webCommit.trim().toLowerCase().slice(0, 7);
      const cleanApi = apiCommit.trim().toLowerCase().slice(0, 7);

      expect(cleanWeb).toBe('a5d7c81');
      expect(cleanApi).toBe('a5d7c81');
      expect(cleanWeb === cleanApi).toBe(true);
    });

    it('detects real build mismatch only when first 7 characters differ', () => {
      const webCommit = 'a5d7c81';
      const apiCommit = 'b9f2e34';

      const cleanWeb = webCommit.trim().toLowerCase().slice(0, 7);
      const cleanApi = apiCommit.trim().toLowerCase().slice(0, 7);

      expect(cleanWeb !== cleanApi).toBe(true);
    });
  });
});
