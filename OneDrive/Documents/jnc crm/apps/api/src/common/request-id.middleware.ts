/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

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
      // Log method, url, status, duration and request ID — NEVER sensitive body/credentials
      this.logger.log(`[${requestId}] ${req.method} ${req.originalUrl} ${status} - ${duration}ms`);
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
    Logger.log(`[${requestId}] ${req.method} ${req.originalUrl} ${status} - ${duration}ms`, 'HTTP');
  });

  next();
}
