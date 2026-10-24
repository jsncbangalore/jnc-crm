/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Controller, Get, Post, Patch, Body, Param, Query, Res, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { PageAccess } from '../auth/page-access.decorator';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ScopedUser } from '../auth/scoping.service';
import { LeadsService } from './leads.service';
import { CreateLeadDto, UpdateLeadStatusDto, CreateLeadActivityDto, ShareLeadDto, ImportLeadsDto } from './dto/create-lead.dto';
import { validateUploadedFile } from '../common/file-validator';
import { sanitizeRowForImport } from '../common/csv-sanitize.util';
import { FileInterceptor } from '@nestjs/platform-express';
import * as Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Response } from 'express';

@Controller('leads')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@PageAccess('leads')
export class LeadsController {
  constructor(private leadsService: LeadsService) {}

  @Post()
  @Roles('tenant_admin', 'admin', 'sub_admin', 'employee')
  async createLead(@Body() dto: CreateLeadDto, @CurrentUser() user: ScopedUser) {
    return this.leadsService.createLead(dto, user);
  }

  @Get()
  async getLeads(
    @CurrentUser() user: ScopedUser,
    @Query('status') status?: string,
    @Query('source') source?: string,
    @Query('assignedToId') assignedToId?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.leadsService.findAll(user, {
      status,
      source,
      assignedToId,
      search,
      startDate,
      endDate,
      page,
      limit,
    });
  }

  @Get('template-csv')
  downloadTemplate(@Res() res: Response) {
    const csvContent = `company_name,contact_name,phone,email,product_interest,city,estimated_value,assigned_to,source\n`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="leads_import_template.csv"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(csvContent);
  }

  @Get(':id')
  async getLead(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.leadsService.findOne(id, user);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateLeadStatusDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.leadsService.updateStatus(id, dto, user);
  }

  @Post(':id/activities')
  async addActivity(
    @Param('id') id: string,
    @Body() dto: CreateLeadActivityDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.leadsService.addActivity(id, dto, user);
  }

  @Post(':id/share')
  @Roles('tenant_admin', 'admin', 'sub_admin', 'employee')
  async shareLead(
    @Param('id') id: string,
    @Body() dto: ShareLeadDto,
    @CurrentUser() user: ScopedUser,
  ) {
    if (!dto.targetUserId) {
      throw new BadRequestException('targetUserId is required for sharing.');
    }
    return this.leadsService.shareLead(id, dto.targetUserId, user);
  }

  /**
   * Bulk Excel / CSV Upload Preview with 30-Day Duplicate Evaluation
   * 50MB file size limit + XLSX / CSV support
   */
  @Post('import-preview')
  @Roles('tenant_admin', 'admin', 'sub_admin')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    }),
  )
  async previewSpreadsheet(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: ScopedUser,
  ) {
    if (!file) {
      throw new BadRequestException('Spreadsheet file is required');
    }

    validateUploadedFile(file, 'spreadsheet', 50 * 1024 * 1024);

    let records: any[] = [];
    const lowerName = file.originalname.toLowerCase();

    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
      try {
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        records = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
      } catch (err: any) {
        throw new BadRequestException(`Excel parsing error: ${err.message}`);
      }
    } else {
      const csvContent = file.buffer.toString('utf-8');
      const parseResult = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
      if (parseResult.errors.length > 0 && parseResult.data.length === 0) {
        throw new BadRequestException(`CSV parse error: ${parseResult.errors[0].message}`);
      }
      records = parseResult.data;
    }

    const sanitized = records.map((r) => sanitizeRowForImport(r));
    return this.leadsService.previewImport(sanitized, user);
  }

  /**
   * Bulk JSON preview evaluation
   */
  @Post('import-preview-json')
  @Roles('tenant_admin', 'admin', 'sub_admin')
  async previewJson(
    @Body() body: ImportLeadsDto,
    @CurrentUser() user: ScopedUser,
  ) {
    if (!body.records || !Array.isArray(body.records)) {
      throw new BadRequestException('Records array is required');
    }
    const sanitized = body.records.map((r) => sanitizeRowForImport(r));
    return this.leadsService.previewImport(sanitized, user);
  }

  /**
   * Bulk Commit approved rows
   */
  @Post('import-commit')
  @Roles('tenant_admin', 'admin', 'sub_admin')
  async commitImport(
    @Body() body: ImportLeadsDto,
    @CurrentUser() user: ScopedUser,
  ) {
    if (!body.records || !Array.isArray(body.records)) {
      throw new BadRequestException('Records array is required');
    }
    const sanitized = body.records.map((r) => sanitizeRowForImport(r));
    return this.leadsService.commitImport(sanitized, user);
  }
}
