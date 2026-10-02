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
  Req,
} from '@nestjs/common';
import { PlatformService, CreateTenantDto, UpdateTenantDto } from './platform.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('platform/tenants')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('super_admin', 'platform_super_admin')
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
    @Body() dto: { newPassword?: string; adminEmail?: string; sendEmail?: boolean; appUrl?: string },
  ) {
    return this.platformService.resetTenantAdminPassword(id, dto);
  }
}

