/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import {
  Injectable,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

export interface PlatformAuditLogParams {
  actor?: {
    id?: string;
    sub?: string;
    name?: string;
    email?: string;
    role?: string;
  };
  action: string;
  targetType?: string;
  targetId?: string;
  targetTenantId?: string;
  targetTenantCode?: string;
  summary: string;
  details?: any;
  outcome?: 'success' | 'denied' | 'failed';
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export function maskEmail(email: string | null | undefined): string {
  if (!email || typeof email !== 'string') return '';
  const trimmed = email.trim();
  const atIdx = trimmed.indexOf('@');
  if (atIdx <= 0) return '***';
  const userPart = trimmed.substring(0, atIdx);
  const domainPart = trimmed.substring(atIdx + 1);
  const maskedUser = userPart.length <= 1 ? `${userPart}***` : `${userPart[0]}***`;
  const dotIdx = domainPart.lastIndexOf('.');
  let maskedDomain = '';
  if (dotIdx > 0) {
    const domainName = domainPart.substring(0, dotIdx);
    const tld = domainPart.substring(dotIdx);
    maskedDomain = `${domainName[0]}***${tld}`;
  } else {
    maskedDomain = `${domainPart[0]}***`;
  }
  return `${maskedUser}@${maskedDomain}`;
}

const REDACTED_KEYS = new Set([
  'password',
  'temppassword',
  'adminpassword',
  'currentpassword',
  'newpassword',
  'passwordhash',
  'twofactorcode',
  'code',
  'otp',
  'otpcode',
  'backupcodes',
  'secret',
  'secretenc',
  'pendingsecretenc',
  'token',
  'stepuptoken',
  'setuptoken',
  'refreshtoken',
  'accesstoken',
  'trusteddevicetoken',
  'accountnumber',
  'bankaccount',
  'bankaccountnumber',
]);

export function sanitizeAuditData(data: any): any {
  if (data === null || data === undefined) return null;
  if (typeof data === 'string') {
    // Check if it's an email
    if (data.includes('@') && data.includes('.')) {
      const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/g;
      return data.replace(emailRegex, (match) => maskEmail(match));
    }
    return data;
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeAuditData(item));
  }
  if (typeof data === 'object') {
    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (REDACTED_KEYS.has(lowerKey)) {
        clean[key] = '[REDACTED]';
      } else if (lowerKey.includes('password') || lowerKey.includes('secret') || lowerKey.includes('token')) {
        clean[key] = '[REDACTED]';
      } else if (lowerKey.includes('email') && typeof value === 'string') {
        clean[key] = maskEmail(value);
      } else {
        clean[key] = sanitizeAuditData(value);
      }
    }
    return clean;
  }
  return data;
}

@Injectable()
export class PlatformAuditService {
  private readonly logger = new Logger(PlatformAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Computes SHA256 of row contents plus prevHash for tamper-evident hash chain
   */
  computeRowHash(
    prevHash: string | null | undefined,
    fields: {
      timestamp: Date;
      actorId?: string | null;
      actorName?: string | null;
      actorRole?: string | null;
      action: string;
      targetType?: string | null;
      targetId?: string | null;
      targetTenantId?: string | null;
      targetTenantCode?: string | null;
      summary: string;
      details?: string | null;
      outcome: string;
      ipAddress?: string | null;
      userAgent?: string | null;
      requestId?: string | null;
    },
  ): string {
    const pHash = prevHash || 'GENESIS';
    const rowString = [
      pHash,
      fields.timestamp.toISOString(),
      fields.actorId || '',
      fields.actorName || '',
      fields.actorRole || '',
      fields.action,
      fields.targetType || '',
      fields.targetId || '',
      fields.targetTenantId || '',
      fields.targetTenantCode || '',
      fields.summary,
      fields.details || '',
      fields.outcome,
      fields.ipAddress || '',
      fields.userAgent || '',
      fields.requestId || '',
    ].join('|');

    return crypto.createHash('sha256').update(rowString, 'utf8').digest('hex');
  }

  /**
   * Writes an audit row to PlatformAuditLog.
   * Can be passed a transaction client (tx) to ensure the write is part of the atomic transaction.
   */
  async recordLog(txOrPrisma: any, params: PlatformAuditLogParams) {
    const db = txOrPrisma || this.prisma;
    const timestamp = new Date();

    // Fetch latest row to link hash chain
    const latestRow = await db.platformAuditLog.findFirst({
      orderBy: { timestamp: 'desc' },
      select: { hash: true },
    });

    const prevHash = latestRow?.hash || 'GENESIS';

    const actorId = params.actor?.id || params.actor?.sub || null;
    const actorName = params.actor?.name || (params.actor?.email ? maskEmail(params.actor.email) : null);
    const actorRole = params.actor?.role || (actorId ? 'platform_super_admin' : null);

    const sanitizedDetailsObj = params.details ? sanitizeAuditData(params.details) : null;
    const detailsString = sanitizedDetailsObj ? JSON.stringify(sanitizedDetailsObj) : null;
    const outcome = params.outcome || 'success';

    const hash = this.computeRowHash(prevHash, {
      timestamp,
      actorId,
      actorName,
      actorRole,
      action: params.action,
      targetType: params.targetType || null,
      targetId: params.targetId || null,
      targetTenantId: params.targetTenantId || null,
      targetTenantCode: params.targetTenantCode || null,
      summary: params.summary,
      details: detailsString,
      outcome,
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
      requestId: params.requestId || null,
    });

    return db.platformAuditLog.create({
      data: {
        timestamp,
        actorId,
        actorName,
        actorRole,
        action: params.action,
        targetType: params.targetType || null,
        targetId: params.targetId || null,
        targetTenantId: params.targetTenantId || null,
        targetTenantCode: params.targetTenantCode || null,
        summary: params.summary,
        details: detailsString,
        outcome,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        requestId: params.requestId || null,
        prevHash,
        hash,
      },
    });
  }

  /**
   * Helper used by platform actions.
   * Runs the action inside a Prisma transaction, writes the audit row in the SAME transaction.
   * If the action fails, the transaction rolls back, and a 'failed' audit row is logged outside the transaction.
   */
  async executeWithAudit<T>(
    params: {
      actor?: any;
      action: string;
      targetType?: string;
      targetId?: string;
      targetTenantId?: string;
      targetTenantCode?: string;
      summary: string;
      details?: any;
      ipAddress?: string;
      userAgent?: string;
      requestId?: string;
    },
    operation: (tx: any) => Promise<{
      result: T;
      targetId?: string;
      targetTenantId?: string;
      targetTenantCode?: string;
      summary?: string;
      details?: any;
    }>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const opResult = await operation(tx);

          const finalTargetId = opResult.targetId || params.targetId;
          const finalTenantId = opResult.targetTenantId || params.targetTenantId;
          const finalTenantCode = opResult.targetTenantCode || params.targetTenantCode;
          const finalSummary = opResult.summary || params.summary;
          const finalDetails = opResult.details !== undefined ? opResult.details : params.details;

          await this.recordLog(tx, {
            ...params,
            targetId: finalTargetId,
            targetTenantId: finalTenantId,
            targetTenantCode: finalTenantCode,
            summary: finalSummary,
            details: finalDetails,
            outcome: 'success',
          });

          return opResult.result;
        },
        { timeout: 30000 },
      );
    } catch (error: any) {
      // Transaction rolled back! Log failure row outside transaction
      try {
        const isDenied =
          error?.status === 403 ||
          error instanceof ForbiddenException ||
          error?.name === 'ForbiddenException' ||
          (error?.response && error.response.statusCode === 403);

        await this.recordLog(this.prisma, {
          ...params,
          outcome: isDenied ? 'denied' : 'failed',
          details: {
            ...(typeof params.details === 'object' ? sanitizeAuditData(params.details) : {}),
            errorMessage: error?.message || 'Operation failed',
            statusCode: error?.status || 500,
          },
        });
      } catch (loggingErr) {
        this.logger.error('Failed to log failed audit entry', loggingErr);
      }
      throw error;
    }
  }

  /**
   * Verifies the cryptographic hash chain of PlatformAuditLog from genesis to latest.
   */
  async verifyHashChain() {
    const rows = await this.prisma.platformAuditLog.findMany({
      orderBy: { timestamp: 'asc' },
    });

    if (rows.length === 0) {
      return { valid: true, totalChecked: 0, message: 'No audit records to verify.' };
    }

    let expectedPrevHash = 'GENESIS';

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // 1. Check prevHash linkage
      if (i === 0) {
        if (row.prevHash !== 'GENESIS' && row.prevHash !== null) {
          return {
            valid: false,
            totalChecked: i,
            brokenRowId: row.id,
            brokenIndex: i,
            reason: `Genesis row prevHash corrupted. Expected 'GENESIS', found '${row.prevHash}'`,
          };
        }
      } else {
        if (row.prevHash !== expectedPrevHash) {
          return {
            valid: false,
            totalChecked: i,
            brokenRowId: row.id,
            brokenIndex: i,
            reason: `Hash chain break at row ${i} (${row.id}). Expected prevHash '${expectedPrevHash}', found '${row.prevHash}'`,
          };
        }
      }

      // 2. Recompute row hash and verify match
      const computedHash = this.computeRowHash(row.prevHash, {
        timestamp: row.timestamp,
        actorId: row.actorId,
        actorName: row.actorName,
        actorRole: row.actorRole,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        targetTenantId: row.targetTenantId,
        targetTenantCode: row.targetTenantCode,
        summary: row.summary,
        details: row.details,
        outcome: row.outcome,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        requestId: row.requestId,
      });

      if (computedHash !== row.hash) {
        return {
          valid: false,
          totalChecked: i,
          brokenRowId: row.id,
          brokenIndex: i,
          reason: `Row data tampered at row ${i} (${row.id}). Stored hash '${row.hash}' does not match computed hash '${computedHash}'`,
        };
      }

      expectedPrevHash = row.hash;
    }

    return {
      valid: true,
      totalChecked: rows.length,
      message: `Hash chain intact across all ${rows.length} records.`,
    };
  }
}
