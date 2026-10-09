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
  Put,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { PlatformService, CreateTenantDto, UpdateTenantDto } from './platform.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  ResetTenantAdminPasswordDto,
  CreatePlatformAdminDto,
  TogglePlatformAdminActiveDto,
} from './dto/platform-admin.dto';

@Controller('platform/tenants')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('platform_super_admin', 'platform_operations_manager', 'platform_account_onboarding', 'platform_client_support')
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get()
  async listTenants() {
    return this.platformService.listTenants();
  }

  @Get(':id')
  async getTenant(@Param('id') id: string) {
    return this.platformService.getTenant(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createTenant(@Body() dto: CreateTenantDto) {
    return this.platformService.createTenant(dto);
  }

  @Put(':id')
  async updateTenant(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.platformService.updateTenant(id, dto);
  }

  @Delete(':id')
  async deleteTenant(@Param('id') id: string) {
    return this.platformService.deleteTenant(id);
  }

  @Post(':id/impersonate')
  async impersonateTenant(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Req() req: any,
  ) {
    const ip = req?.ip || req?.connection?.remoteAddress || '127.0.0.1';
    return this.platformService.impersonateTenant(id, user, ip);
  }

  @Post(':id/reset-admin-password')
  async resetTenantAdminPassword(
    @Param('id') id: string,
    @Body() dto: ResetTenantAdminPasswordDto,
  ) {
    return this.platformService.resetTenantAdminPassword(id, dto);
  }
}

@Controller('platform/admins')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('platform_super_admin')
export class PlatformAdminsController {
  constructor(private readonly platformService: PlatformService) {}

  @Get()
  async listPlatformAdmins() {
    return this.platformService.listPlatformAdmins();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createPlatformAdmin(@Body() dto: CreatePlatformAdminDto, @CurrentUser() actor: any) {
    return this.platformService.createPlatformAdmin(dto, actor);
  }

  @Patch(':id/toggle-active')
  async toggleActive(@Param('id') id: string, @Body() body: TogglePlatformAdminActiveDto) {
    return this.platformService.togglePlatformAdminActive(id, body?.isActive);
  }

  @Post(':id/reset-password')
  async resetPassword(@Param('id') id: string) {
    return this.platformService.resetPlatformAdminUserPassword(id);
  }
}

@Controller('platform/analytics')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('platform_super_admin', 'platform_operations_manager')
export class PlatformAnalyticsController {
  constructor(private readonly platformService: PlatformService) {}

  @Get()
  async getAnalytics() {
    return this.platformService.getAnalytics();
  }

  @Post('send-summary')
  async sendSummaryReport(@Body() body: { recipientEmail?: string }) {
    return this.platformService.sendSummaryReport(body?.recipientEmail);
  }
}

@Controller('platform/system-info')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('platform_super_admin')
export class SystemInfoController {
  @Get()
  getSystemInfo() {
    let commit = 'c7ba118';
    try {
      commit = require('child_process').execSync('git rev-parse --short HEAD', { encoding: 'utf8', timeout: 1000 }).trim();
    } catch (e) {}

    let version = '1.0.0';
    try {
      version = require('../../../package.json').version || '1.0.0';
    } catch (e) {}

    const dbUrl = process.env.DATABASE_URL || '';
    let projectRef = 'aybysdzuwwtqhnzhgiwp';
    let host = 'aws-0-ap-south-1.pooler.supabase.com';

    try {
      const matchHost = dbUrl.match(/@([^:\/]+)/);
      if (matchHost) host = matchHost[1];
      const matchRef = dbUrl.match(/postgres\.([a-z0-9]+)|db\.([a-z0-9]+)\.supabase|org\/([a-z0-9]+)/i);
      if (matchRef) {
        projectRef = matchRef[1] || matchRef[2] || matchRef[3];
      }
    } catch (err) {}

    const maskedRef = projectRef.length > 8 ? `${projectRef.substring(0, 4)}***${projectRef.substring(projectRef.length - 4)}` : projectRef;

    return {
      version,
      commit,
      projectRef: maskedRef,
      databaseProject: `Database project ${maskedRef} @ ${host}`,
    };
  }
}

