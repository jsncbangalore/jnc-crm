/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { PageAccess } from '../auth/page-access.decorator';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ScopedUser } from '../auth/scoping.service';
import { QuotationsService, CreateQuotationDto } from './quotations.service';

@Controller('quotations')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@PageAccess('quotations')
export class QuotationsController {
  constructor(private quotationsService: QuotationsService) {}

  @Post()
  @Roles('tenant_admin', 'admin', 'sub_admin', 'employee')
  create(@Body() dto: CreateQuotationDto, @CurrentUser() user: ScopedUser) {
    return this.quotationsService.create(dto, user);
  }

  @Get()
  findAll(
    @CurrentUser() user: ScopedUser,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.quotationsService.findAll(user, { status, search, page, limit });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.quotationsService.findOne(id, user);
  }

  @Patch(':id/status')
  @Roles('tenant_admin', 'admin', 'sub_admin', 'employee')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
    @CurrentUser() user: ScopedUser,
  ) {
    return this.quotationsService.updateStatus(id, body.status, user);
  }

  @Post(':id/convert-to-order')
  @Roles('tenant_admin', 'admin', 'sub_admin', 'employee')
  convertToOrder(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.quotationsService.convertToOrder(id, user);
  }
}
