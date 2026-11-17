/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';
import { extractClientIp } from '../audit/audit.service';

@Injectable()
export class ImpersonationAuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();

    return next.handle().pipe(
      tap(async () => {
        try {
          const user = req.user;
          if (user && user.isImpersonating) {
            const method = (req.method || 'GET').toUpperCase();
            if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
              const url = req.originalUrl || req.url || '';
              const actorId = user.id || user.sub;
              const platformAdminId = user.impersonatorAdminId || 'platform-admin';
              const tenantId = user.tenantId;

              if (tenantId) {
                await this.prisma.auditLog.create({
                  data: {
                    tenantId,
                    actorId,
                    actorName: `${user.name || user.email} (impersonated by ${platformAdminId})`,
                    action: `IMPERSONATED_${method}`,
                    entityName: 'ImpersonatedOperation',
                    entityId: req.params?.id || 'N/A',
                    afterState: JSON.stringify({
                      platformAdminId,
                      impersonatedUserId: actorId,
                      method,
                      path: url,
                    }),
                    ipAddress: extractClientIp(req),
                  },
                });
              }
            }
          }
        } catch (e) {
          // Never fail the user request due to audit logging
        }
      }),
    );
  }
}
