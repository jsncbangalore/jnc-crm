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
import { CompaniesService, CreateCompanyDto, UpdateCompanyDto, CreateContactDto } from './companies.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { validateUploadedFile } from '../common/file-validator';
import { sanitizeRowForImport } from '../common/csv-sanitize.util';
import * as Papa from 'papaparse';
import * as XLSX from 'xlsx';


import { PageAccess } from '../auth/page-access.decorator';

@Controller('companies')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@PageAccess('leads')
export class CompaniesController {
  constructor(private companiesService: CompaniesService) {}

  @Get()
  @PageAccess('leads', 'quotations', 'orders', 'invoices')
  async getCompanies(@CurrentUser() user: ScopedUser, @Query('search') search?: string) {
    return this.companiesService.findAll(user, { search });
  }

  @Get(':id')
  @PageAccess('leads', 'quotations', 'orders', 'invoices')
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
      validateUploadedFile(file, 'spreadsheet', 50 * 1024 * 1024);
      const lowerName = file.originalname.toLowerCase();
      if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        records = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      } else {
        const csvContent = file.buffer.toString('utf-8');
        const parseResult = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
        records = parseResult.data;
      }
    } else if (body && (Array.isArray(body.records) || Array.isArray(body.rows))) {
      records = body.records || body.rows || [];
    } else {
      throw new BadRequestException('Spreadsheet file or records array is required');
    }

    const sanitized = records.map((r) => sanitizeRowForImport(r));
    return {
      success: true,
      count: sanitized.length,
      records: sanitized,
    };
  }
}

