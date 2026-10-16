/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import {
  Controller,
  Get,
  Post,
  UseGuards,
  Res,
  Req,
  Query,
  HttpStatus,
  HttpCode,
  Body,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ScopedUser } from '../auth/scoping.service';
import { BackupService } from './backup.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

function checkDbAdminEnabled() {
  const enabled = process.env.ENABLE_INAPP_BACKUP === 'true' || process.env.ENABLE_DB_ADMIN_ENDPOINTS === 'true';
  if (!enabled) {
    throw new ForbiddenException('Database in-app backup endpoints are disabled. Set ENABLE_INAPP_BACKUP=true.');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new ForbiddenException('Database in-app backup endpoints are permanently refused and blocked in production.');
  }
}

async function checkBackupRateLimit(prisma: PrismaService, action: string) {
  const oneHourAgo = new Date(Date.now() - 3600000);
  const recent = await prisma.auditLog.findFirst({
    where: {
      action: { in: ['BACKUP_CREATE', 'BACKUP_RESTORE_DRILL', 'BACKUP_DOWNLOAD'] },
      timestamp: { gte: oneHourAgo },
    },
    orderBy: { timestamp: 'desc' },
  });
  if (recent && recent.timestamp) {
    const elapsedMs = Date.now() - new Date(recent.timestamp).getTime();
    const remainingMins = Math.ceil((3600000 - elapsedMs) / 60000);
    throw new HttpException(
      `Rate limit exceeded: only 1 database admin action allowed per hour. Try again in ${remainingMins} minutes.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

async function logBackupAudit(
  prisma: PrismaService,
  actor: any,
  action: string,
  entityId: string,
  ip?: string,
) {
  await prisma.auditLog.create({
    data: {
      tenantId: 'default-tenant-id',
      actorId: actor?.id || actor?.sub || 'platform-admin',
      actorName: actor?.name || actor?.email || 'Platform Super Admin',
      action,
      entityName: 'DatabaseBackup',
      entityId,
      ipAddress: ip || '127.0.0.1',
      afterState: JSON.stringify({ timestamp: new Date().toISOString() }),
    },
  }).catch(() => {});
}

@Controller('system/backup')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('platform_super_admin')
export class BackupController {
  constructor(
    private readonly backupService: BackupService,
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Diagnostic summary of backup health, counts, and directory paths
   */
  @Get('status')
  async getStatus() {
    return this.backupService.getStatus();
  }

  /**
   * Trigger an immediate manual backup (Local + Offsite Dispatch)
   */
  @Post('create')
  @HttpCode(HttpStatus.OK)
  async createBackup(
    @CurrentUser() user: ScopedUser,
    @Req() req: Request,
    @Body() body: any,
  ) {
    checkDbAdminEnabled();
    const token = (req.headers['x-step-up-token'] as string) || body?.stepUpToken;
    await this.authService.validateStepUp(user, token);
    await checkBackupRateLimit(this.prisma, 'BACKUP_CREATE');

    const result = await this.backupService.createBackup(user);
    const ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
    await logBackupAudit(this.prisma, user, 'BACKUP_CREATE', result?.filename || 'latest', ip);
    return result;
  }

  /**
   * Run an automated restore drill to prove backup restorability & data integrity
   */
  @Post('restore-drill')
  @HttpCode(HttpStatus.OK)
  async runRestoreDrill(
    @CurrentUser() user: ScopedUser,
    @Req() req: Request,
    @Body() body: any,
  ) {
    checkDbAdminEnabled();
    const token = (req.headers['x-step-up-token'] as string) || body?.stepUpToken;
    await this.authService.validateStepUp(user, token);
    await checkBackupRateLimit(this.prisma, 'BACKUP_RESTORE_DRILL');

    const result = await this.backupService.runRestoreDrill(body?.filename);
    const ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
    await logBackupAudit(this.prisma, user, 'BACKUP_RESTORE_DRILL', body?.filename || 'restore-drill', ip);
    return result;
  }

  /**
   * One-click download of the latest AES-256-GCM encrypted backup archive
   */
  @Get('download-latest')
  async downloadLatestBackup(
    @CurrentUser() user: ScopedUser,
    @Req() req: Request,
    @Query('stepUpToken') queryToken: string,
    @Res() res: Response,
  ) {
    checkDbAdminEnabled();
    const token = (req.headers['x-step-up-token'] as string) || queryToken;
    await this.authService.validateStepUp(user, token);
    await checkBackupRateLimit(this.prisma, 'BACKUP_DOWNLOAD');

    const { filename, buffer } = this.backupService.getLatestBackupFile();
    const ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
    await logBackupAudit(this.prisma, user, 'BACKUP_DOWNLOAD', filename, ip);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    return res.status(HttpStatus.OK).send(buffer);
  }
}
