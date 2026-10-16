/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Res, UseInterceptors, UploadedFile, BadRequestException, NotFoundException } from '@nestjs/common';
import { PageAccess } from '../auth/page-access.decorator';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ScopedUser } from '../auth/scoping.service';
import { InvoicingService } from './invoicing.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { validateUploadedFile } from '../common/file-validator';
import { requireTenantId } from '../common/tenant.util';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  CreateDirectInvoiceDto,
  UpdateInvoiceDto,
  CompanyProfileDto,
  SignatorySettingsDto,
  GenerateFromOrderDto,
  VoidInvoiceDto,
  RecordInvoicePaymentDto,
  EmailInvoiceDto,
  DirectPrintDto,
} from './dto/invoicing.dto';


@Controller('invoices')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@PageAccess('invoices')
export class InvoicingController {
  constructor(private invoicingService: InvoicingService) {}

  @Get()
  async getInvoices(
    @CurrentUser() user: ScopedUser,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('docType') docType?: string,
  ) {
    return this.invoicingService.findAll(user, { page, limit, search, status, docType });
  }

  @Get('generate-number')
  @Roles('platform_super_admin', 'tenant_admin', 'admin', 'sub_admin', 'employee')
  async getNextNumber(
    @CurrentUser() user: ScopedUser,
    @Query('docType') docType?: string,
    @Query('prefix') prefix?: string,
  ) {
    const number = await this.invoicingService.getNextDocumentNumber(docType || 'tax_invoice', prefix, user);
    return { number };
  }

  @Post('create-direct')
  @Roles('platform_super_admin', 'tenant_admin', 'admin', 'sub_admin', 'employee')
  async createDirect(
    @Body() body: CreateDirectInvoiceDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.invoicingService.createDirectDocument(user, body as any);
  }

  @Get('company-profile')
  async getCompanyProfile(@CurrentUser() user: ScopedUser) {
    return this.invoicingService.getCompanyProfile(user);
  }

  @Post('company-profile')
  @Roles('platform_super_admin', 'tenant_admin', 'admin')
  async updateCompanyProfile(
    @Body() body: CompanyProfileDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.invoicingService.updateCompanyProfile(user, body);
  }

  @Get('settings/company-profile')
  async getSettingsCompanyProfile(@CurrentUser() user: ScopedUser) {
    return this.invoicingService.getCompanyProfile(user);
  }

  @Post('settings/company-profile')
  @Roles('platform_super_admin', 'tenant_admin', 'admin')
  async updateSettingsCompanyProfile(
    @Body() body: CompanyProfileDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.invoicingService.updateCompanyProfile(user, body);
  }

  @Get('settings/signatory')
  async getSignatorySettings(@CurrentUser() user: ScopedUser) {
    return this.invoicingService.getSignatorySettings(user);
  }

  @Post('settings/signatory')
  @Roles('platform_super_admin', 'tenant_admin', 'admin')
  async updateSignatorySettings(
    @Body() body: SignatorySettingsDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.invoicingService.updateSignatorySettings(user, body);
  }

  @Get('printers')
  async getInstalledPrinters() {
    return this.invoicingService.getInstalledPrinters();
  }

  @Get(':id')
  async getInvoice(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.invoicingService.findOne(id, user);
  }

  @Get(':id/pdf')
  async downloadPdf(
    @Param('id') id: string,
    @Query('templateType') templateType: string,
    @CurrentUser() user: ScopedUser,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.invoicingService.getPdf(id, user, templateType);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    res.end(buffer);
  }

  @Post(':id/print-direct')
  @Roles('platform_super_admin', 'tenant_admin', 'admin', 'sub_admin', 'employee')
  async printDirect(
    @Param('id') id: string,
    @Body() body: DirectPrintDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.invoicingService.directPrintInvoice(id, user, body);
  }

  @Post('order/:orderId/generate')
  @Roles('platform_super_admin', 'tenant_admin', 'admin', 'sub_admin', 'employee')
  async generateFromOrder(
    @Param('orderId') orderId: string,
    @Body() body: GenerateFromOrderDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.invoicingService.generateInvoiceForOrder(orderId, user, body);
  }

  @Patch(':id')
  @Roles('platform_super_admin', 'tenant_admin', 'admin', 'sub_admin', 'employee')
  async updateInvoice(
    @Param('id') id: string,
    @Body() body: UpdateInvoiceDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.invoicingService.updateDocument(id, user, body);
  }

  @Patch(':id/void')
  @Roles('platform_super_admin', 'tenant_admin', 'admin')
  async voidInvoice(
    @Param('id') id: string,
    @Body() body: VoidInvoiceDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.invoicingService.voidInvoice(id, body?.reason || '', user);
  }

  @Post(':id/payments')
  @Roles('platform_super_admin', 'tenant_admin', 'admin', 'sub_admin', 'employee')
  async recordPayment(
    @Param('id') id: string,
    @Body() body: RecordInvoicePaymentDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.invoicingService.recordPayment(id, body, user);
  }

  @Post(':id/email')
  async emailInvoice(
    @Param('id') id: string,
    @Body() body: EmailInvoiceDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.invoicingService.emailInvoice(id, user, body);
  }

  @Post('documents')
  @Roles('platform_super_admin', 'tenant_admin', 'admin', 'sub_admin', 'employee')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  async uploadInvoiceDocument(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: ScopedUser,
  ) {
    if (!file) throw new BadRequestException('File is required');
    validateUploadedFile(file, 'document_or_image', 10 * 1024 * 1024);

    const tenantId = requireTenantId(user);
    const tenantDir = path.resolve(process.cwd(), '../../invoices-documents', tenantId);
    if (!fs.existsSync(tenantDir)) fs.mkdirSync(tenantDir, { recursive: true });

    const ext = path.extname(file.originalname).toLowerCase();
    const docId = crypto.randomUUID();
    const randomName = `${docId}${ext}`;
    const destinationPath = path.resolve(tenantDir, randomName);
    fs.writeFileSync(destinationPath, file.buffer);

    return {
      success: true,
      id: docId,
      filename: randomName,
      originalName: file.originalname,
      downloadUrl: `/api/v1/invoices/documents/${docId}/download`,
    };
  }

  @Get('documents/:id/download')
  async downloadInvoiceDocument(
    @Param('id') id: string,
    @CurrentUser() user: ScopedUser,
    @Res() res: Response,
  ) {
    const tenantId = requireTenantId(user);
    const sanitizedId = path.basename(id);
    const possibleDirs = [
      path.resolve(process.cwd(), '../../invoices-documents', tenantId),
      path.resolve(process.cwd(), '../invoices-documents', tenantId),
      path.resolve(process.cwd(), 'invoices-documents', tenantId),
    ];

    let foundPath = '';
    for (const dir of possibleDirs) {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        const match = files.find((f) => f.startsWith(sanitizedId));
        if (match) {
          foundPath = path.resolve(dir, match);
          break;
        }
      }
    }

    if (!foundPath || !fs.existsSync(foundPath)) {
      throw new NotFoundException('Document not found');
    }

    const cleanFilename = path.basename(foundPath);
    res.setHeader('Content-Disposition', `attachment; filename="${cleanFilename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.sendFile(foundPath);
  }
}

