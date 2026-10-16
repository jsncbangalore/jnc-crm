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

/**
 * Strips client-supplied tenant identifiers from request bodies across company-scoped routes.
 * Guarantees that client payloads cannot override the server-verified JWT tenant context.
 */
@Injectable()
export class StripTenantPayloadInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const url = req?.originalUrl || req?.url || '';

    const isPlatformRoute = url.includes('/platform') || url.includes('/platform-auth');

    // On company-scoped routes, strip any client-supplied tenant identifier
    if (!isPlatformRoute && req?.body && typeof req.body === 'object') {
      delete req.body.tenantId;
      delete req.body.tenant_id;
      delete req.body.orgId;
      delete req.body.org_id;
    }

    return next.handle();
  }
}
