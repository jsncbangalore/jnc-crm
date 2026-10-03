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

export function sanitizeObject(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeObject(item));
  }

  if (typeof data === 'object') {
    // If it's a Date or Buffer, return as is
    if (data instanceof Date || Buffer.isBuffer(data)) {
      return data;
    }

    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        continue; // strip sensitive key completely
      }
      cleaned[key] = sanitizeObject(value);
    }
    return cleaned;
  }

  return data;
}

@Injectable()
export class SanitizeResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => sanitizeObject(data)),
    );
  }
}
