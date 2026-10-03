/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ScopedUser } from '../auth/scoping.service';
import { CompaniesService, CreateCompanyDto, UpdateCompanyDto, CreateContactDto } from './companies.service';

@Controller('companies')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class CompaniesController {
  constructor(private companiesService: CompaniesService) {}

  @Get()
  async getCompanies(@CurrentUser() user: ScopedUser, @Query('search') search?: string) {
    return this.companiesService.findAll(user, { search });
  }

  @Get(':id')
  async getCompany(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.companiesService.findOne(id, user);
  }

  @Post()
  @Roles('tenant_admin', 'admin', 'sub_admin', 'employee')
  async createCompany(@Body() dto: CreateCompanyDto, @CurrentUser() user: ScopedUser) {
    return this.companiesService.create(dto, user);
  }

  @Patch(':id')
  @Roles('tenant_admin', 'admin', 'sub_admin', 'employee')
  async updateCompany(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.companiesService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles('tenant_admin', 'admin')
  async deleteCompany(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.companiesService.delete(id, user);
  }

  @Post(':id/contacts')
  @Roles('tenant_admin', 'admin', 'sub_admin', 'employee')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async addContact(
    @Param('id') id: string,
    @Body() dto: CreateContactDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.companiesService.addContact(id, dto, user);
  }
}
