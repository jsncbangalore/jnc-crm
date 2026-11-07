/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Controller, Get, Req, Res, HttpStatus, ForbiddenException } from '@nestjs/common';
import { Response, Request } from 'express';
import { Public } from '../auth/page-access.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { getMigrationStatus } from '../common/migration-status.util';

export const API_VERSION = '1.2.0';
const STARTED_AT = new Date().toISOString();

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Public()
  getHealth() {
    return {
      status: 'ok',
      version: API_VERSION,
      apiVersion: API_VERSION,
      commitId: process.env.GIT_COMMIT_HASH || process.env.RENDER_GIT_COMMIT || 'unknown',
      buildTime: process.env.BUILD_TIME || STARTED_AT,
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      features: [
        'auth',
        'rbac',
        'password-reset-flow',
        'two-factor-auth',
        'device-sessions',
        'web-form-settings',
        'meta-whatsapp-webhooks',
        'indiamart-webhooks',
      ],
    };
  }

  @Get('ready')
  @Public()
  async getReady(@Res({ passthrough: true }) res: Response) {
    const status = await getMigrationStatus(this.prisma);
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
          pending: status.pending,
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
  async getSchemaStatus(@Req() req: Request) {
    const user = (req as any).user;
    if (!user || (!['admin', 'tenant_admin', 'super_admin', 'platform_super_admin'].includes(user.role) && !user.isPlatformAdmin)) {
      throw new ForbiddenException('Admin access required to view schema migration status');
    }

    const status = await getMigrationStatus(this.prisma);
    if (!status.isReady) {
      return {
        status: 'pending_update',
        ok: false,
        pendingCount: status.pending.length,
        missingMigrations: status.pending,
        applied: status.applied,
        total: status.total,
      };
    }

    return {
      status: 'ok',
      ok: true,
      pendingCount: 0,
      missingMigrations: [],
      applied: status.applied,
      total: status.total,
    };
  }
}
