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
  BadRequestException,
  UnauthorizedException,
  HttpException,
  Query,
} from '@nestjs/common';
import { PlatformService, CreateTenantDto, UpdateTenantDto } from './platform.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PageAccess } from '../auth/page-access.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  ResetTenantAdminPasswordDto,
  CreatePlatformAdminDto,
  TogglePlatformAdminActiveDto,
  PermanentDeleteTenantDto,
} from './dto/platform-admin.dto';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformAuditService } from './platform-audit.service';

function extractStepUpToken(req: any, body?: any): string | undefined {
  return (
    (req?.headers?.['x-step-up-token'] as string) ||
    body?.stepUpToken
  );
}

@Controller('platform/tenants')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('platform_super_admin')
@PageAccess('platform_companies')
export class PlatformController {
  constructor(
    private readonly platformService: PlatformService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async listTenants(@Query('includeDeactivated') includeDeactivated?: string) {
    return this.platformService.listTenants(includeDeactivated === 'true');
  }

  @Get(':id')
  async getTenant(@Param('id') id: string) {
    return this.platformService.getTenant(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createTenant(
    @Body() dto: CreateTenantDto,
    @CurrentUser() user: any,
    @Req() req: any,
  ) {
    const ip = req?.ip || req?.connection?.remoteAddress || '127.0.0.1';
    return this.platformService.createTenant(dto, user, ip);
  }

  @Put(':id')
  async updateTenant(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
    @CurrentUser() user: any,
    @Req() req: any,
  ) {
    if (dto.status === 'suspended' || dto.status === 'deactivated') {
      const token = extractStepUpToken(req, dto);
      await this.authService.validateStepUp(user, token);
    }
    const ip = req?.ip || req?.connection?.remoteAddress || '127.0.0.1';
    return this.platformService.updateTenant(id, dto, user, ip);
  }

  @Delete(':id')
  async deleteTenant(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Req() req: any,
  ) {
    const token = extractStepUpToken(req);
    await this.authService.validateStepUp(user, token);
    const ip = req?.ip || req?.connection?.remoteAddress || '127.0.0.1';
    return this.platformService.deleteTenant(id, user, ip);
  }

  @Get(':id/row-counts')
  async getTenantRowCounts(@Param('id') id: string) {
    return this.platformService.getTenantRowCounts(id);
  }

  @Delete(':id/permanent')
  @Roles('platform_super_admin')
  async permanentDeleteTenant(
    @Param('id') id: string,
    @Body() dto: PermanentDeleteTenantDto,
    @CurrentUser() user: any,
    @Req() req: any,
  ) {
    const token = extractStepUpToken(req, dto) || dto.twoFactorCode || dto.stepUpToken;
    if (!token || !token.trim()) {
      throw new UnauthorizedException('Two-step verification code is required for permanent deletion.');
    }
    await this.authService.validateStepUpOr2Fa(user, token.trim());
    const ip = req?.ip || req?.connection?.remoteAddress || '127.0.0.1';
    return this.platformService.permanentDeleteTenant(id, dto, user, ip);
  }

  @Post(':id/impersonate')
  async impersonateTenant(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Req() req: any,
  ) {
    const token = extractStepUpToken(req);
    await this.authService.validateStepUp(user, token);
    const ip = req?.ip || req?.connection?.remoteAddress || '127.0.0.1';
    return this.platformService.impersonateTenant(id, user, ip);
  }

  @Post(':id/impersonate-exit')
  async exitImpersonateTenant(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Req() req: any,
  ) {
    const ip = req?.ip || req?.connection?.remoteAddress || '127.0.0.1';
    return this.platformService.exitImpersonation(id, user, ip);
  }

  @Post(':id/reset-admin-password')
  async resetTenantAdminPassword(
    @Param('id') id: string,
    @Body() dto: ResetTenantAdminPasswordDto,
    @CurrentUser() user: any,
    @Req() req: any,
  ) {
    const token = extractStepUpToken(req, dto);
    await this.authService.validateStepUp(user, token);
    const ip = req?.ip || req?.connection?.remoteAddress || '127.0.0.1';
    return this.platformService.resetTenantAdminPassword(id, dto, user, ip);
  }

  @Get(':id/users')
  async listTenantUsers(@Param('id') id: string) {
    return this.platformService.listTenantUsers(id);
  }

  @Post(':id/users')
  @HttpCode(HttpStatus.CREATED)
  async addTenantUser(
    @Param('id') id: string,
    @Body() dto: { name: string; email: string; phone?: string; role?: string; employeeCode?: string; password?: string },
    @CurrentUser() user: any,
    @Req() req: any,
  ) {
    const ip = req?.ip || req?.connection?.remoteAddress || '127.0.0.1';
    return this.platformService.addTenantUser(id, dto, user, ip);
  }

  @Delete(':id/users/:userId')
  async deleteTenantUser(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: any,
    @Req() req: any,
  ) {
    const ip = req?.ip || req?.connection?.remoteAddress || '127.0.0.1';
    return this.platformService.deleteTenantUser(id, userId, user, ip);
  }
}

@Controller('platform/admins')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('platform_super_admin')
@PageAccess('platform_admins')
export class PlatformAdminsController {
  constructor(
    private readonly platformService: PlatformService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async listPlatformAdmins() {
    return this.platformService.listPlatformAdmins();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createPlatformAdmin(
    @Body() dto: CreatePlatformAdminDto,
    @CurrentUser() actor: any,
    @Req() req: any,
  ) {
    const token = extractStepUpToken(req, dto);
    await this.authService.validateStepUp(actor, token);
    const ip = req?.ip || req?.connection?.remoteAddress || '127.0.0.1';
    return this.platformService.createPlatformAdmin(dto, actor, ip);
  }

  @Patch(':id/toggle-active')
  async toggleActive(
    @Param('id') id: string,
    @Body() body: TogglePlatformAdminActiveDto,
    @CurrentUser() actor: any,
    @Req() req: any,
  ) {
    const token = extractStepUpToken(req, body);
    await this.authService.validateStepUp(actor, token);
    const ip = req?.ip || req?.connection?.remoteAddress || '127.0.0.1';
    return this.platformService.togglePlatformAdminActive(id, body?.isActive, actor, ip);
  }

  @Post(':id/reset-password')
  async resetPassword(
    @Param('id') id: string,
    @CurrentUser() actor: any,
    @Req() req: any,
  ) {
    const ip = req?.ip || req?.connection?.remoteAddress || '127.0.0.1';
    return this.platformService.resetPlatformAdminUserPassword(id, actor, ip);
  }

  @Delete(':id')
  async deletePlatformAdmin(
    @Param('id') id: string,
    @CurrentUser() actor: any,
    @Req() req: any,
  ) {
    const token = extractStepUpToken(req);
    await this.authService.validateStepUp(actor, token);
    const ip = req?.ip || req?.connection?.remoteAddress || '127.0.0.1';
    return this.platformService.deletePlatformAdmin(id, actor, ip);
  }
}

@Controller('platform')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('platform_super_admin')
@PageAccess('platform_companies')
export class PlatformMailTestController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly platformService: PlatformService,
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    private readonly auditService: PlatformAuditService,
  ) {}

  @Get('recent-signins')
  async getRecentSignIns() {
    return this.authService.getRecentSignIns(null, 50);
  }

  @Get('system-info')
  async getSystemInfo() {
    return this.platformService.getSystemInfo();
  }

  @Get('mail-status')
  async getMailStatus() {
    return this.notificationsService.getMailStatus();
  }

  @Post('mail-test')
  @Roles('platform_super_admin')
  async sendMailTest(@CurrentUser() user: any, @Req() req: any) {
    const userEmail = user?.email;
    if (!userEmail) {
      throw new BadRequestException('Signed-in user email is required to send test email');
    }

    // Database-backed rate limiting: 5 tests per hour
    const identityKey = `platform_mail_test:${user?.id || req?.ip || 'anonymous'}`;
    const now = new Date();
    const windowMs = 60 * 60 * 1000; // 1 hour
    const maxTests = 5;

    const record = await this.prisma.accountLockout.findUnique({
      where: { identityKey },
    });

    if (record) {
      const elapsed = now.getTime() - new Date(record.lastAttemptAt).getTime();
      if (elapsed > windowMs) {
        await this.prisma.accountLockout.update({
          where: { identityKey },
          data: { failedAttempts: 1, lastAttemptAt: now, lockedUntil: null },
        });
      } else {
        if (record.failedAttempts >= maxTests) {
          throw new HttpException('Rate limit exceeded: maximum 5 test emails per hour', HttpStatus.TOO_MANY_REQUESTS);
        }
        await this.prisma.accountLockout.update({
          where: { identityKey },
          data: { failedAttempts: { increment: 1 }, lastAttemptAt: now },
        });
      }
    } else {
      await this.prisma.accountLockout.create({
        data: { identityKey, failedAttempts: 1, lastAttemptAt: now },
      });
    }

    const reqId = req?.headers?.['x-request-id'] || req?.id;
    const ip = req?.ip || req?.connection?.remoteAddress || '127.0.0.1';
    try {
      const res = await this.notificationsService.sendTestMail(userEmail, reqId);
      await this.auditService.recordLog(this.prisma, {
        actor: user,
        action: 'PLATFORM_MAIL_TEST',
        targetType: 'MailNotification',
        summary: `Dispatched test email to ${userEmail}`,
        details: { to: userEmail, reqId, status: res?.status || 'sent' },
        outcome: 'success',
        ipAddress: ip,
        requestId: reqId,
      });
      return res;
    } catch (err: any) {
      await this.auditService.recordLog(this.prisma, {
        actor: user,
        action: 'PLATFORM_MAIL_TEST',
        targetType: 'MailNotification',
        summary: `Failed to dispatch test email to ${userEmail}`,
        details: { to: userEmail, reqId, error: err?.message || 'Mail test failed' },
        outcome: 'failed',
        ipAddress: ip,
        requestId: reqId,
      });
      throw err;
    }
  }
}

