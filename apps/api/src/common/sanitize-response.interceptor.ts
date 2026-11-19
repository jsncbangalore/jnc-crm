/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

const SENSITIVE_KEYS = new Set([
  'passwordhash',
  'smtppass',
  'imappass',
  'webhooksecret',
  'tokenhash',
  'resettokenhash',
  'encryptionkey',
  'backupencryptionkey',
  'appsecret',
]);

export function sanitizeObject(data: any, seen = new WeakSet(), depth = 0): any {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== 'object') {
    return data;
  }

  // If it's a Date, Buffer, Stream, or Express Response/Request, return as is
  if (
    data instanceof Date ||
    Buffer.isBuffer(data) ||
    depth > 20 ||
    seen.has(data) ||
    typeof data.pipe === 'function' ||
    typeof data.setHeader === 'function'
  ) {
    return data;
  }

  seen.add(data);

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeObject(item, seen, depth + 1));
  }

  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      continue; // strip sensitive key completely
    }
    cleaned[key] = sanitizeObject(value, seen, depth + 1);
  }
  return cleaned;
}

@Injectable()
export class SanitizeResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<any>();
    const res = http.getResponse<any>();

    const requestId =
      (req?.headers?.['x-request-id'] as string) ||
      req?.id ||
      (typeof req?.id === 'string' ? req.id : undefined);

    if (requestId && res && typeof res.setHeader === 'function') {
      res.setHeader('x-request-id', requestId);
    }

    return next.handle().pipe(
      map((data) => {
        const cleaned = sanitizeObject(data);
        if (
          cleaned &&
          typeof cleaned === 'object' &&
          !Array.isArray(cleaned) &&
          !Buffer.isBuffer(cleaned) &&
          !(cleaned instanceof Date) &&
          requestId &&
          cleaned.requestId === undefined
        ) {
          cleaned.requestId = requestId;
        }
        return cleaned;
      }),
    );
  }
}
