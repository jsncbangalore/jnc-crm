/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PageAccess } from '../auth/page-access.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { PlatformAuditService, maskEmail } from './platform-audit.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { Response, Request } from 'express';

function extractStepUpToken(req: any): string | undefined {
  return (
    (req?.headers?.['x-step-up-token'] as string) ||
    req?.query?.stepUpToken ||
    req?.body?.stepUpToken
  );
}

@Controller('platform/audit-logs')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('platform_super_admin')
@PageAccess('platform_audit_logs')
export class PlatformAuditController {
  constructor(
    private readonly auditService: PlatformAuditService,
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Cryptographic integrity verification endpoint
   */
  @Get('verify')
  async verifyChain() {
    return this.auditService.verifyHashChain();
  }

  /**
   * CSV export with mandatory 2-step verification step-up token
   * Max 10,000 rows. Action itself is logged.
   */
  @Get('export')
  async exportCsv(
    @CurrentUser() user: any,
    @Req() req: Request,
    @Res() res: Response,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('actor') actor?: string,
    @Query('action') action?: string,
    @Query('tenantCode') tenantCode?: string,
    @Query('outcome') outcome?: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
  ) {
    const token = extractStepUpToken(req);
    if (!token) {
      throw new ForbiddenException('Step-up authentication required: x-step-up-token must be provided.');
    }
    await this.authService.validateStepUp(user, token);

    const where: any = {};

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = new Date(startDate);
      if (endDate) where.timestamp.lte = new Date(endDate);
    }

    if (action && action.trim()) {
      where.action = action.trim();
    }

    if (tenantCode && tenantCode.trim()) {
      where.targetTenantCode = { contains: tenantCode.trim(), mode: 'insensitive' };
    }

    if (outcome && outcome.trim()) {
      where.outcome = outcome.trim();
    }

    if (actor && actor.trim()) {
      const a = actor.trim();
      where.OR = [
        { actorName: { contains: a, mode: 'insensitive' } },
        { actorId: a },
      ];
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { summary: { contains: q, mode: 'insensitive' } },
        { targetTenantCode: { contains: q, mode: 'insensitive' } },
        { actorName: { contains: q, mode: 'insensitive' } },
        { action: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (category) {
      if (category === 'security') {
        where.action = {
          in: [
            'PLATFORM_LOGIN_SUCCESS',
            'PLATFORM_LOGIN_FAILED',
            'PLATFORM_ACCOUNT_LOCKED',
            'PLATFORM_2FA_VERIFY',
            'PLATFORM_2FA_CODE_SENT',
            'PLATFORM_2FA_SETUP_INITIATED',
            'PLATFORM_2FA_ENABLED',
            'PLATFORM_STEP_UP_SUCCESS',
            'PLATFORM_STEP_UP_FAILED',
            'RESET_TENANT_ADMIN_PASSWORD',
            'RESET_PLATFORM_ADMIN_PASSWORD',
            'PLATFORM_SESSION_CONFLICT',
          ],
        };
      } else if (category === 'company') {
        where.action = {
          in: [
            'CREATE_TENANT',
            'UPDATE_TENANT',
            'SUSPEND_TENANT',
            'ACTIVATE_TENANT',
            'CHANGE_PLAN',
            'CHANGE_SEAT_LIMIT',
            'DELETE_TENANT',
            'PERMANENT_DELETE_TENANT',
            'IMPERSONATION_START',
            'IMPERSONATION_END',
            'CREATE_TENANT_USER',
            'DELETE_TENANT_USER',
          ],
        };
      }
    }

    const rows = await this.prisma.platformAuditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: 10000,
    });

    const ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
    const reqId = (req.headers['x-request-id'] as string) || (req as any)?.id;

    // Log the export action itself
    await this.auditService.recordLog(this.prisma, {
      actor: user,
      action: 'PLATFORM_AUDIT_EXPORT',
      targetType: 'PlatformAuditLog',
      summary: `Exported ${rows.length} platform audit log entries to CSV`,
      details: {
        exportedRows: rows.length,
        filters: { startDate, endDate, actor, action, tenantCode, outcome, category },
      },
      outcome: 'success',
      ipAddress: ip,
      requestId: reqId,
    });

    // Generate CSV
    const headers = [
      'Timestamp (UTC)',
      'Action',
      'Actor Name',
      'Actor Role',
      'Company Code',
      'Target Type',
      'Target ID',
      'Outcome',
      'Summary',
      'IP Address',
      'Request ID',
      'Previous Hash',
      'Record Hash',
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const csvLines = [headers.join(',')];
    for (const r of rows) {
      csvLines.push(
        [
          escapeCsv(r.timestamp.toISOString()),
          escapeCsv(r.action),
          escapeCsv(r.actorName || 'System'),
          escapeCsv(r.actorRole || 'system'),
          escapeCsv(r.targetTenantCode || '-'),
          escapeCsv(r.targetType || '-'),
          escapeCsv(r.targetId || '-'),
          escapeCsv(r.outcome),
          escapeCsv(r.summary),
          escapeCsv(r.ipAddress || '-'),
          escapeCsv(r.requestId || '-'),
          escapeCsv(r.prevHash || 'GENESIS'),
          escapeCsv(r.hash),
        ].join(','),
      );
    }

    const csvContent = csvLines.join('\r\n');
    const dateStr = new Date().toISOString().split('T')[0];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="platform-audit-logs-${dateStr}.csv"`);
    res.setHeader('Content-Length', Buffer.byteLength(csvContent, 'utf8'));
    return res.status(HttpStatus.OK).send(csvContent);
  }

  /**
   * Paginated list of PlatformAuditLog records with comprehensive filtering and search
   */
  @Get()
  async listLogs(
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('actor') actor?: string,
    @Query('action') action?: string,
    @Query('tenantCode') tenantCode?: string,
    @Query('outcome') outcome?: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
  ) {
    const page = Math.max(1, parseInt(pageStr || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitStr || '25', 10) || 25));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = new Date(startDate);
      if (endDate) where.timestamp.lte = new Date(endDate);
    }

    if (action && action.trim()) {
      where.action = action.trim();
    }

    if (tenantCode && tenantCode.trim()) {
      where.targetTenantCode = { contains: tenantCode.trim(), mode: 'insensitive' };
    }

    if (outcome && outcome.trim()) {
      where.outcome = outcome.trim();
    }

    if (actor && actor.trim()) {
      const a = actor.trim();
      where.OR = [
        { actorName: { contains: a, mode: 'insensitive' } },
        { actorId: a },
      ];
    }

    if (category) {
      if (category === 'security') {
        where.action = {
          in: [
            'PLATFORM_LOGIN_SUCCESS',
            'PLATFORM_LOGIN_FAILED',
            'PLATFORM_ACCOUNT_LOCKED',
            'PLATFORM_2FA_VERIFY',
            'PLATFORM_2FA_CODE_SENT',
            'PLATFORM_2FA_SETUP_INITIATED',
            'PLATFORM_2FA_ENABLED',
            'PLATFORM_STEP_UP_SUCCESS',
            'PLATFORM_STEP_UP_FAILED',
            'RESET_TENANT_ADMIN_PASSWORD',
            'RESET_PLATFORM_ADMIN_PASSWORD',
            'PLATFORM_SESSION_CONFLICT',
          ],
        };
      } else if (category === 'company') {
        where.action = {
          in: [
            'CREATE_TENANT',
            'UPDATE_TENANT',
            'SUSPEND_TENANT',
            'ACTIVATE_TENANT',
            'CHANGE_PLAN',
            'CHANGE_SEAT_LIMIT',
            'DELETE_TENANT',
            'PERMANENT_DELETE_TENANT',
            'IMPERSONATION_START',
            'IMPERSONATION_END',
            'CREATE_TENANT_USER',
            'DELETE_TENANT_USER',
          ],
        };
      }
    }

    if (search && search.trim()) {
      const q = search.trim();
      const searchConditions = [
        { summary: { contains: q, mode: 'insensitive' } },
        { targetTenantCode: { contains: q, mode: 'insensitive' } },
        { actorName: { contains: q, mode: 'insensitive' } },
        { action: { contains: q, mode: 'insensitive' } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchConditions }];
        delete where.OR;
      } else {
        where.OR = searchConditions;
      }
    }

    const [logs, total] = await Promise.all([
      this.prisma.platformAuditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.platformAuditLog.count({ where }),
    ]);

    return {
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Detail of a single PlatformAuditLog entry
   */
  @Get(':id')
  async getLogDetail(@Param('id') id: string) {
    const log = await this.prisma.platformAuditLog.findUnique({
      where: { id },
    });
    if (!log) {
      throw new NotFoundException('Platform audit log record not found');
    }
    return log;
  }
}
