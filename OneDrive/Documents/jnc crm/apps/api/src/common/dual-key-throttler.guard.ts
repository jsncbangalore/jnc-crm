/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import * as crypto from 'crypto';

/**
 * Dual-Key Throttler Guard
 * Tracks both the client IP address and the hashed account identifier (email/username/employeeCode)
 * to prevent distributed brute-force attacks across accounts and IP pools.
 */
@Injectable()
export class DualKeyThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const rawIp = req.ips?.length ? req.ips[0] : (req.ip || req.socket?.remoteAddress || '127.0.0.1');

    // Extract identifier if present in request body (e.g. login, reset, forgot-password)
    const body = req.body || {};
    const rawId = (body.email || body.identifier || body.username || body.employeeCode || '').toString().trim().toLowerCase();

    if (rawId) {
      const idHash = crypto.createHash('sha256').update(rawId).digest('hex').slice(0, 16);
      return `${rawIp}:${idHash}`;
    }

    return rawIp;
  }
}
