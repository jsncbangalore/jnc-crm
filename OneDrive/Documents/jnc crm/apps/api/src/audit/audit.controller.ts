/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PageAccess } from '../auth/page-access.decorator';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AuditService } from './audit.service';

@Controller('audit-logs')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@PageAccess('audit_logs')
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Get()
  @Roles('platform_super_admin', 'tenant_admin', 'admin')
  async getLogs(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('entityName') entityName?: string,
    @Query('actorId') actorId?: string,
    @Query('search') search?: string,
  ) {
    return this.auditService.getLogs({ page, limit, entityName, actorId, search });
  }
}
