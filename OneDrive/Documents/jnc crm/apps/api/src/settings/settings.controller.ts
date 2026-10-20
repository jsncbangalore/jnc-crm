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
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
  Query,
  Req,
  Headers,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { validateUploadedFile } from '../common/file-validator';
import * as jwt from 'jsonwebtoken';

import { SettingsService } from './settings.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ScopedUser } from '../auth/scoping.service';
import { requireTenantId } from '../common/tenant.util';
import {
  UpdateBrandingDto,
  UpdateCompanyProfileDto,
  CreateMailAccountDto,
  UpdateMailAccountDto,
  DetectMailProviderDto,
  TestMailAccountDto,
  UpdateWebFormSettingsDto,
} from './dto/settings.dto';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * GET /settings/branding
   * Tenant-aware endpoint to fetch company branding on app boot / pages.
   */
  @Get('branding')
  async getBranding(
    @Query('tenantId') queryTenantId?: string,
    @Headers('x-tenant-id') headerTenantId?: string,
    @Req() req?: any,
  ) {
    let tenantId = queryTenantId || headerTenantId;
    if (!tenantId && req?.headers?.authorization) {
      try {
        const token = req.headers.authorization.replace(/^Bearer\s+/i, '');
        const decoded: any = jwt.decode(token);
        if (decoded?.tenantId) {
          tenantId = decoded.tenantId;
        }
      } catch {}
    }
    return this.settingsService.getBranding(tenantId);
  }

  /**
   * GET /settings/branding/logo
   * Public tenant branding logo with Cross-Origin-Resource-Policy: cross-origin
   */
  @Get('branding/logo')
  async getBrandingLogoDefault(@Res() res: Response) {
    return this.settingsService.servePublicBrandingImage('logo', undefined, res);
  }

  @Get('branding/logo/:tenantKey')
  async getBrandingLogo(@Param('tenantKey') tenantKey: string, @Res() res: Response) {
    return this.settingsService.servePublicBrandingImage('logo', tenantKey, res);
  }

  @Post('branding/logo')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('platform_super_admin', 'tenant_admin', 'admin')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    }),
  )
  async uploadBrandingLogo(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: ScopedUser,
  ) {
    if (!file) throw new BadRequestException('Logo image file is required');
    validateUploadedFile(file, 'document_or_image', 5 * 1024 * 1024);

    return this.settingsService.uploadLogo(file, user);
  }

  @Post('branding/favicon')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('platform_super_admin', 'tenant_admin', 'admin')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
    }),
  )
  async uploadBrandingFavicon(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: ScopedUser,
  ) {
    if (!file) throw new BadRequestException('Favicon file is required');
    validateUploadedFile(file, 'document_or_image', 2 * 1024 * 1024);

    return this.settingsService.uploadFavicon(file, user);
  }


  /**
   * GET /settings/branding/stamp
   * Public tenant branding stamp with Cross-Origin-Resource-Policy: cross-origin
   */
  @Get('branding/stamp')
  async getBrandingStampDefault(@Res() res: Response) {
    return this.settingsService.servePublicBrandingImage('stamp', undefined, res);
  }

  @Get('branding/stamp/:tenantKey')
  async getBrandingStamp(@Param('tenantKey') tenantKey: string, @Res() res: Response) {
    return this.settingsService.servePublicBrandingImage('stamp', tenantKey, res);
  }

  /**
   * POST /settings/branding
   * Admin / Super Admin only endpoint to update company branding.
   */
  @Post('branding')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('tenant_admin', 'admin')
  @HttpCode(HttpStatus.OK)
  async updateBranding(
    @Body() body: UpdateBrandingDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.settingsService.updateBranding(user, body);
  }

  /**
   * GET /settings/company-profile
   * Fetch company invoicing, address, tax & bank details
   */
  @Get('company-profile')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('tenant_admin', 'admin')
  async getCompanyProfile(@CurrentUser() user: ScopedUser) {
    return this.settingsService.getCompanyProfile(user);
  }

  /**
   * POST /settings/company-profile
   * Save complete company invoicing, address, tax, bank & signatory details
   */
  @Post('company-profile')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('tenant_admin', 'admin')
  @HttpCode(HttpStatus.OK)
  async updateCompanyProfile(
    @Body() body: UpdateCompanyProfileDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.settingsService.updateCompanyProfile(user, body);
  }

  // --- SUPER ADMIN DYNAMIC MAIL ACCOUNTS ENDPOINTS ---

  @Get('mail-accounts')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('platform_super_admin', 'tenant_admin')
  async getMailAccounts(@CurrentUser() user: ScopedUser) {
    return this.settingsService.getMailAccounts(user);
  }

  @Post('mail-accounts')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('platform_super_admin', 'tenant_admin')
  async createMailAccount(
    @Body() body: CreateMailAccountDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.settingsService.createMailAccount(user, body);
  }

  @Put('mail-accounts/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('platform_super_admin', 'tenant_admin')
  async updateMailAccount(
    @Param('id') id: string,
    @Body() body: UpdateMailAccountDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.settingsService.updateMailAccount(user, id, body);
  }

  @Delete('mail-accounts/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('platform_super_admin', 'tenant_admin')
  async deleteMailAccount(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.settingsService.deleteMailAccount(user, id);
  }

  @Post('mail-accounts/detect')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('platform_super_admin', 'tenant_admin')
  @HttpCode(HttpStatus.OK)
  async detectMailProvider(@Body() body: DetectMailProviderDto) {
    return this.settingsService.detectMailProvider(body.email);
  }

  @Post('mail-accounts/test')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('platform_super_admin', 'tenant_admin')
  @HttpCode(HttpStatus.OK)
  async testMailAccount(
    @CurrentUser() user: ScopedUser,
    @Body() body: TestMailAccountDto,
  ) {
    return this.settingsService.testMailAccount(user, body);
  }

  @Get('mail-accounts/:id/domain-health')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('platform_super_admin', 'tenant_admin')
  async getDomainHealth(
    @Param('id') id: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.settingsService.getDomainHealth(user, id);
  }

  /**
   * GET /settings/web-form
   * Retrieve tenant-specific web form settings (tenant_admin, admin, platform_super_admin)
   */
  @Get('web-form')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('tenant_admin', 'admin', 'platform_super_admin')
  async getWebFormSettings(@CurrentUser() user: ScopedUser) {
    const tenantId = requireTenantId(user);
    return this.settingsService.getWebFormSettings(tenantId);
  }

  /**
   * PUT /settings/web-form
   * Update tenant-specific web form settings (tenant_admin or admin only)
   */
  @Put('web-form')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('tenant_admin', 'admin')
  async updateWebFormSettings(
    @CurrentUser() user: ScopedUser,
    @Body() body: UpdateWebFormSettingsDto,
  ) {
    return this.settingsService.updateWebFormSettings(user, body);
  }
}
