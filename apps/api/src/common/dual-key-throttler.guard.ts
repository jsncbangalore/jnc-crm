/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import * as crypto from 'crypto';

/**
 * Dual-Key Throttler Guard
 * Tracks both the client IP address and the hashed account identifier (email/username/employeeCode)
 * to prevent distributed brute-force attacks across accounts and IP pools.
 *
 * Rate Limit Fairness:
 * - Server errors (5xx) must NOT count against the rate limit or account lockout.
 * - When blocked, sets the standard HTTP 'Retry-After' header and provides a clear countdown message.
 */
@Injectable()
export class DualKeyThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const rawIp = req.ips?.length ? req.ips[0] : (req.ip || req.socket?.remoteAddress || '127.0.0.1');

    // Extract identifier if present in request body (e.g. login, reset, forgot-password)
    const body = req.body || {};
    const rawId = (
      body.email ||
      body.identifier ||
      body.username ||
      body.employeeCode ||
      body.lookup ||
      body.resetTicket ||
      body.flowId ||
      body.loginTicket ||
      ''
    ).toString().trim().toLowerCase();

    if (rawId) {
      const idHash = crypto.createHash('sha256').update(rawId).digest('hex').slice(0, 16);
      return `${rawIp}:${idHash}`;
    }

    return rawIp;
  }

  async handleRequest(requestProps: any): Promise<boolean> {
    const { context, limit, ttl, throttler, generateKey, getTracker } = requestProps;
    const { req, res } = this.getRequestResponse(context);

    const tracker = await getTracker(req, context);
    const key = generateKey(context, tracker, throttler.name);

    // Register a listener on res 'finish' to refund/decrement the hit if the server encountered a 5xx error!
    // Server errors (5xx) must NOT count against the rate limit!
    if (res && typeof res.on === 'function') {
      res.on('finish', () => {
        if (res.statusCode >= 500) {
          try {
            const storage = (this.storageService as any).storage;
            if (storage && typeof storage.get === 'function') {
              const entry = storage.get(key);
              if (entry && entry.totalHits) {
                const currentHits = entry.totalHits.get(throttler.name) || 0;
                if (currentHits > 0) {
                  entry.totalHits.set(throttler.name, currentHits - 1);
                  if (entry.totalHits.get(throttler.name) <= limit) {
                    entry.isBlocked = false;
                    entry.blockExpiresAt = 0;
                  }
                }
              }
            }
          } catch {}
        }
      });
    }

    return super.handleRequest(requestProps);
  }

  protected async throwThrottlingException(context: ExecutionContext, throttlerLimitDetail: any): Promise<void> {
    const { res } = this.getRequestResponse(context);
    const seconds = throttlerLimitDetail?.timeToBlockExpire || Math.ceil((throttlerLimitDetail?.ttl || 900000) / 1000);
    const retrySeconds = Math.max(1, seconds);
    const minutes = Math.max(1, Math.ceil(retrySeconds / 60));

    // Always set standard Retry-After header
    if (res && typeof res.header === 'function') {
      res.header('Retry-After', String(retrySeconds));
    }

    const errMessage = `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
    const exception: any = new ThrottlerException(errMessage);
    exception.retryAfter = retrySeconds;
    exception.timeToBlockExpire = retrySeconds;
    throw exception;
  }
}
