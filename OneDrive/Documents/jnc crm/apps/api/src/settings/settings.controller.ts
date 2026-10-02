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
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ScopedUser } from '../auth/scoping.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * GET /settings/branding
   * Public endpoint to fetch company branding on app boot / pages.
   */
  @Get('branding')
  async getBranding() {
    return this.settingsService.getBranding();
  }

  /**
   * POST /settings/branding
   * Admin / Super Admin only endpoint to update company branding.
   */
  @Post('branding')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin', 'admin', 'tenant_admin')
  @HttpCode(HttpStatus.OK)
  async updateBranding(
    @Body()
    body: {
      companyDisplayName?: string;
      companyPhone?: string;
      companyLogoUrl?: string | null;
    },
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
  @Roles('super_admin', 'admin', 'tenant_admin')
  async getCompanyProfile(@CurrentUser() user: ScopedUser) {
    return this.settingsService.getCompanyProfile(user);
  }

  /**
   * POST /settings/company-profile
   * Save complete company invoicing, address, tax, bank & signatory details
   */
  @Post('company-profile')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin', 'admin', 'tenant_admin')
  @HttpCode(HttpStatus.OK)
  async updateCompanyProfile(
    @Body() body: any,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.settingsService.updateCompanyProfile(user, body);
  }

  // --- SUPER ADMIN DYNAMIC MAIL ACCOUNTS ENDPOINTS ---

  @Get('mail-accounts')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  async getMailAccounts(@CurrentUser() user: ScopedUser) {
    return this.settingsService.getMailAccounts(user);
  }

  @Post('mail-accounts')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  async createMailAccount(
    @Body()
    body: {
      name: string;
      email: string;
      senderName?: string;
      smtpHost: string;
      smtpPort?: number;
      smtpUser: string;
      smtpPass: string;
      isSecure?: boolean;
      purpose?: string;
    },
    @CurrentUser() user: ScopedUser,
  ) {
    return this.settingsService.createMailAccount(user, body);
  }

  @Put('mail-accounts/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  async updateMailAccount(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      email?: string;
      senderName?: string;
      smtpHost?: string;
      smtpPort?: number;
      smtpUser?: string;
      smtpPass?: string;
      isSecure?: boolean;
      purpose?: string;
      isActive?: boolean;
    },
    @CurrentUser() user: ScopedUser,
  ) {
    return this.settingsService.updateMailAccount(user, id, body);
  }

  @Delete('mail-accounts/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  async deleteMailAccount(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.settingsService.deleteMailAccount(user, id);
  }
}
