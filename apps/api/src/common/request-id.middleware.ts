/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

export function maskSensitiveUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl;
  let masked = rawUrl.replace(
    /(\/webhooks\/(?:meta|whatsapp|indiamart|website|meta-oauth)\/)([a-zA-Z0-9_-]+)/g,
    (_, prefix, key) => {
      const kMask = key.length > 8 ? `${key.slice(0, 4)}••••${key.slice(-4)}` : '••••••••';
      return `${prefix}${kMask}`;
    }
  );
  masked = masked.replace(/([?&](?:hub\.verify_token|token|secret|access_token)=)([^&]+)/gi, '$1••••••••');
  masked = masked.replace(/(wh[kv]_)[a-f0-9]{4,}([a-f0-9]{4})/gi, '$1••••$2');
  return masked;
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request & { id?: string }, res: Response, next: NextFunction) {
    const rawId = req.headers['x-request-id'];
    const requestId = typeof rawId === 'string' && rawId.trim().length > 0
      ? rawId.trim()
      : crypto.randomUUID();

    req.headers['x-request-id'] = requestId;
    req.id = requestId;
    res.setHeader('X-Request-Id', requestId);

    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const status = res.statusCode;
      const safeUrl = maskSensitiveUrl(req.originalUrl || req.url);
      this.logger.log(`[${requestId}] ${req.method} ${safeUrl} ${status} - ${duration}ms`);
    });

    next();
  }
}

export function requestIdMiddleware(req: Request & { id?: string }, res: Response, next: NextFunction) {
  const rawId = req.headers['x-request-id'];
  const requestId = typeof rawId === 'string' && rawId.trim().length > 0
    ? rawId.trim()
    : crypto.randomUUID();

  req.headers['x-request-id'] = requestId;
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const safeUrl = maskSensitiveUrl(req.originalUrl || req.url);
    Logger.log(`[${requestId}] ${req.method} ${safeUrl} ${status} - ${duration}ms`, 'HTTP');
  });

  next();
}
