/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, UsePipes, ValidationPipe, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ScopedUser } from '../auth/scoping.service';
import { CompaniesService, CreateCompanyDto, UpdateCompanyDto, CreateContactDto, RegisterAndLinkCustomerDto, MergeCustomerDto } from './companies.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { validateUploadedFile } from '../common/file-validator';
import { parseExcelSafely } from '../common/safe-excel-parser';

import { PageAccess } from '../auth/page-access.decorator';

@Controller('companies')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@PageAccess('leads', 'ledger', 'invoices', 'orders', 'quotations')
export class CompaniesController {
  constructor(private companiesService: CompaniesService) {}

  @Get('unified-customers')
  @PageAccess('ledger', 'leads', 'invoices', 'orders')
  async getUnifiedCustomers(
    @CurrentUser() user: ScopedUser,
    @Query('search') search?: string,
    @Query('includeArchived') includeArchived?: boolean,
  ) {
    return this.companiesService.getUnifiedCustomers(user, { search, includeArchived });
  }

  @Post('register-and-link')
  @PageAccess('ledger', 'leads', 'invoices', 'orders')
  @Roles('tenant_admin', 'admin', 'sub_admin', 'employee')
  async registerAndLink(
    @Body() dto: RegisterAndLinkCustomerDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.companiesService.registerAndLink(dto, user);
  }

  @Post('merge')
  @PageAccess('ledger', 'leads', 'invoices', 'orders')
  @Roles('tenant_admin', 'admin', 'sub_admin')
  async mergeCustomers(
    @Body() dto: MergeCustomerDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.companiesService.mergeCustomers(dto, user);
  }

  @Post(':id/archive')
  @PageAccess('ledger', 'leads', 'invoices', 'orders')
  @Roles('tenant_admin', 'admin', 'sub_admin')
  async archiveCompany(
    @Param('id') id: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.companiesService.archive(id, user);
  }

  @Post(':id/unarchive')
  @PageAccess('ledger', 'leads', 'invoices', 'orders')
  @Roles('tenant_admin', 'admin', 'sub_admin')
  async unarchiveCompany(
    @Param('id') id: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.companiesService.unarchive(id, user);
  }

  @Get()
  @PageAccess('leads', 'quotations', 'orders', 'invoices', 'ledger')
  async getCompanies(@CurrentUser() user: ScopedUser, @Query('search') search?: string) {
    return this.companiesService.findAll(user, { search });
  }

  @Get(':id')
  @PageAccess('leads', 'quotations', 'orders', 'invoices', 'ledger')
  async getCompany(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.companiesService.findOne(id, user);
  }

  @Post()
  @PageAccess('leads', 'quotations', 'orders', 'invoices', 'ledger')
  @Roles('tenant_admin', 'admin', 'sub_admin', 'employee')
  async createCompany(@Body() dto: CreateCompanyDto, @CurrentUser() user: ScopedUser) {
    return this.companiesService.create(dto, user);
  }

  @Patch(':id')
  @PageAccess('leads', 'quotations', 'orders', 'invoices', 'ledger')
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

  @Get(':id/contacts')
  @PageAccess('leads', 'quotations', 'orders', 'invoices')
  async getContacts(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.companiesService.getContacts(id, user);
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

  @Post('import-preview')
  @Roles('tenant_admin', 'admin', 'sub_admin')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    }),
  )
  async importPreview(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: any,
    @CurrentUser() user: ScopedUser,
  ) {
    let records: any[] = [];
    if (file) {
      records = parseExcelSafely(file, { maxSizeBytes: 50 * 1024 * 1024, maxRows: 5000, maxColumns: 100 });
    } else if (body && (Array.isArray(body.records) || Array.isArray(body.rows))) {
      records = body.records || body.rows || [];
    } else {
      throw new BadRequestException('Spreadsheet file or records array is required');
    }

    return {
      success: true,
      count: records.length,
      records: records,
    };
  }
}

