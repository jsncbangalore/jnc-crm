/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { PageAccess } from '../auth/page-access.decorator';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ScopedUser } from '../auth/scoping.service';
import { SuppliersService, CreateSupplierDto } from './suppliers.service';

@Controller('suppliers')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@PageAccess('suppliers')
export class SuppliersController {
  constructor(private suppliersService: SuppliersService) {}

  @Post()
  @Roles('tenant_admin', 'admin', 'sub_admin')
  create(@Body() dto: CreateSupplierDto, @CurrentUser() user: ScopedUser) {
    return this.suppliersService.create(dto, user);
  }

  @Get()
  findAll(
    @CurrentUser() user: ScopedUser,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.suppliersService.findAll(user, {
      search,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.suppliersService.findOne(id, user);
  }

  @Patch(':id')
  @Roles('tenant_admin', 'admin', 'sub_admin')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateSupplierDto>,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.suppliersService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles('tenant_admin', 'admin')
  delete(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.suppliersService.delete(id, user);
  }
}
