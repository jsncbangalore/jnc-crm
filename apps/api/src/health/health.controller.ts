/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Controller, Get, Req, Res, HttpStatus, ForbiddenException, UseGuards } from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Public } from '../auth/page-access.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { getMigrationStatus } from '../common/migration-status.util';
import { NotificationsService } from '../notifications/notifications.service';

export const API_VERSION = '1.2.0';
const STARTED_AT = new Date().toISOString();

function resolveApiCommitId(): string {
  if (process.env.GIT_COMMIT) return process.env.GIT_COMMIT.trim();
  if (process.env.RENDER_GIT_COMMIT) return process.env.RENDER_GIT_COMMIT.trim();
  if (process.env.GIT_COMMIT_HASH) return process.env.GIT_COMMIT_HASH.trim();
  try {
    const { execSync } = require('child_process');
    const out = execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (out && out.trim()) return out.trim();
  } catch {}
  return 'local-dev';
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get('live')
  @Public()
  getLive() {
    return {
      status: 'ok',
      version: API_VERSION,
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
    };
  }

  @Get()
  @Public()
  async getHealth() {
    let database = false;
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      database = true;
    } catch {
      database = false;
    }

    let migrationCounts = {
      total: 0,
      applied: 0,
      pendingCount: 0,
      failedCount: 0,
    };

    let migrationStatusObj: any = null;
    try {
      migrationStatusObj = await getMigrationStatus(this.prisma);
      migrationCounts = {
        total: migrationStatusObj.total,
        applied: migrationStatusObj.applied,
        pendingCount: migrationStatusObj.pending.length,
        failedCount: (migrationStatusObj.failedList || []).length,
      };
    } catch {}

    const isHealthy =
      database &&
      migrationCounts.pendingCount === 0 &&
      migrationCounts.failedCount === 0;

    const isProd = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';

    if (isProd) {
      return {
        status: isHealthy ? 'ok' : 'degraded',
        version: API_VERSION,
        database: database ? 'ok' : 'down',
        migrations: {
          total: migrationCounts.total,
          applied: migrationCounts.applied,
          pending: migrationCounts.pendingCount,
          failed: migrationCounts.failedCount,
        },
      };
    }

    let emailHealth: any = { status: 'ok' };
    try {
      emailHealth = await this.notificationsService.getEmailHealthStatus();
    } catch {}

    return {
      status: isHealthy ? 'ok' : 'degraded',
      email: emailHealth.status,
      version: API_VERSION,
      commitId: resolveApiCommitId(),
      database: database ? 'ok' : 'down',
      features: ['c2pa', 'auth', 'audit'],
      migrations: {
        total: migrationCounts.total,
        applied: migrationCounts.applied,
        pending: migrationCounts.pendingCount,
        failed: migrationCounts.failedCount,
      },
    };
  }

  @Get('platform')
  @UseGuards(AuthGuard('jwt'))
  async getPlatformHealth(@Req() req: Request) {
    const user = (req as any).user;
    if (!user || (!['platform_super_admin', 'platform_admin', 'super_admin'].includes(user.role) && !user.isPlatformAdmin)) {
      throw new ForbiddenException('Platform administrator access required');
    }

    let database = false;
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      database = true;
    } catch {
      database = false;
    }

    let migrationCounts = {
      total: 0,
      applied: 0,
      pendingCount: 0,
      failedCount: 0,
    };

    let migrationStatusObj: any = null;
    try {
      migrationStatusObj = await getMigrationStatus(this.prisma);
      migrationCounts = {
        total: migrationStatusObj.total,
        applied: migrationStatusObj.applied,
        pendingCount: migrationStatusObj.pending.length,
        failedCount: (migrationStatusObj.failedList || []).length,
      };
    } catch {}

    let emailHealth: any = { status: 'ok' };
    try {
      emailHealth = await this.notificationsService.getEmailHealthStatus();
    } catch {}

    const isHealthy =
      database &&
      migrationCounts.pendingCount === 0 &&
      migrationCounts.failedCount === 0 &&
      emailHealth.status !== 'down';

    return {
      status: isHealthy ? 'ok' : 'degraded',
      version: API_VERSION,
      commitId: resolveApiCommitId(),
      database: database ? 'ok' : 'down',
      migrations: {
        total: migrationCounts.total,
        applied: migrationCounts.applied,
        pending: migrationCounts.pendingCount,
        failed: migrationCounts.failedCount,
      },
      migrationDetails: migrationStatusObj,
      emailDiagnostics: emailHealth,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @Public()
  async getReady(@Res({ passthrough: true }) res: Response) {
    const status = await getMigrationStatus(this.prisma);
    const isProd = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';

    if (!status.isReady) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return {
        status: 'not_ready',
        ready: false,
        message: 'Server update pending: database migrations not fully applied.',
        migrations: {
          total: status.total,
          applied: status.applied,
          pendingCount: status.pending.length,
          ...(isProd ? {} : { pending: status.pending }),
        },
      };
    }

    return {
      status: 'ready',
      ready: true,
      migrations: {
        total: status.total,
        applied: status.applied,
      },
    };
  }

  @Get('schema')
  @UseGuards(AuthGuard('jwt'))
  async getSchemaStatus(@Req() req: Request) {
    const user = (req as any).user;
    if (!user || (!['admin', 'administrator', 'tenant_admin', 'super_admin', 'platform_super_admin', 'platform_admin'].includes(user.role) && !user.isPlatformAdmin)) {
      throw new ForbiddenException('Admin access required to view schema migration status');
    }

    const status = await getMigrationStatus(this.prisma);
    if (!status.isReady) {
      return {
        status: 'pending_update',
        ok: false,
        pendingCount: status.pending.length,
        failedCount: (status.failedList || []).length,
        missingMigrations: status.pending,
        failedMigrations: status.failedList || [],
        applied: status.applied,
        total: status.total,
      };
    }

    return {
      status: 'ok',
      ok: true,
      pendingCount: 0,
      failedCount: 0,
      missingMigrations: [],
      failedMigrations: [],
      applied: status.applied,
      total: status.total,
    };
  }
}
