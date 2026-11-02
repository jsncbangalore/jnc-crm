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
import { Response, Request } from 'express';

@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    if (response && response.setHeader) {
      const url = (request.originalUrl || request.url || '').toLowerCase();

      // Check if this is a private file download / export / PDF endpoint
      const isPrivateFileDownload =
        url.includes('/download') ||
        url.includes('/export') ||
        url.includes('/pdf') ||
        url.includes('/uploads');

      if (isPrivateFileDownload) {
        response.setHeader('Cache-Control', 'private, no-store');
        response.setHeader('Pragma', 'no-cache');
        response.setHeader('Expires', '0');
      } else {
        // All API routes containing personal or business data (/auth, /users, /settings, /platform, /leads, etc.)
        response.setHeader(
          'Cache-Control',
          'no-store, no-cache, must-revalidate, proxy-revalidate',
        );
        response.setHeader('Pragma', 'no-cache');
        response.setHeader('Expires', '0');
      }
    }

    return next.handle();
  }
}
