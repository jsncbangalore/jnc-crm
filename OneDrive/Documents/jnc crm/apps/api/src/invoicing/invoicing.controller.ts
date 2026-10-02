/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Res } from '@nestjs/common';
import { PageAccess } from '../auth/page-access.decorator';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ScopedUser } from '../auth/scoping.service';
import { InvoicingService } from './invoicing.service';

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
  @Roles('super_admin', 'admin', 'sub_admin', 'employee')
  async getNextNumber(
    @Query('docType') docType?: string,
    @Query('prefix') prefix?: string,
  ) {
    const number = await this.invoicingService.getNextDocumentNumber(docType || 'tax_invoice', prefix);
    return { number };
  }

  @Post('create-direct')
  @Roles('super_admin', 'admin', 'sub_admin', 'employee')
  async createDirect(
    @Body() body: any,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.invoicingService.createDirectDocument(user, body);
  }

  @Get('company-profile')
  async getCompanyProfile(@CurrentUser() user: ScopedUser) {
    return this.invoicingService.getCompanyProfile(user);
  }

  @Post('company-profile')
  @Roles('super_admin', 'tenant_admin', 'admin')
  async updateCompanyProfile(
    @Body() body: any,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.invoicingService.updateCompanyProfile(user, body);
  }

  @Get('settings/company-profile')
  async getSettingsCompanyProfile(@CurrentUser() user: ScopedUser) {
    return this.invoicingService.getCompanyProfile(user);
  }

  @Post('settings/company-profile')
  @Roles('super_admin', 'tenant_admin', 'admin')
  async updateSettingsCompanyProfile(
    @Body() body: any,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.invoicingService.updateCompanyProfile(user, body);
  }

  @Get('settings/signatory')
  async getSignatorySettings(@CurrentUser() user: ScopedUser) {
    return this.invoicingService.getSignatorySettings(user);
  }

  @Post('settings/signatory')
  @Roles('super_admin', 'tenant_admin', 'admin')
  async updateSignatorySettings(
    @Body() body: {
      signatoryName?: string;
      signatoryDesignation?: string;
      signatureImage?: string | null;
      stampImage?: string | null;
    },
    @CurrentUser() user: ScopedUser,
  ) {
    return this.invoicingService.updateSignatorySettings(user, body);
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
    });
    res.end(buffer);
  }

  @Post('order/:orderId/generate')
  @Roles('super_admin', 'admin', 'sub_admin', 'employee')
  async generateFromOrder(
    @Param('orderId') orderId: string,
    @Body() body: { paymentTerms?: string; dueDate?: string; notes?: string },
    @CurrentUser() user: ScopedUser,
  ) {
    return this.invoicingService.generateInvoiceForOrder(orderId, user, body);
  }

  @Patch(':id')
  @Roles('super_admin', 'admin', 'sub_admin', 'employee')
  async updateInvoice(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.invoicingService.updateDocument(id, user, body);
  }

  @Patch(':id/void')
  @Roles('super_admin', 'admin')
  async voidInvoice(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.invoicingService.voidInvoice(id, reason, user);
  }

  @Post(':id/payments')
  @Roles('super_admin', 'admin', 'sub_admin', 'employee')
  async recordPayment(
    @Param('id') id: string,
    @Body() body: {
      amount: number;
      paymentType?: string;
      paymentMethod?: string;
      transactionRef?: string;
      paymentDate?: string;
      notes?: string;
    },
    @CurrentUser() user: ScopedUser,
  ) {
    return this.invoicingService.recordPayment(id, body, user);
  }

  @Post(':id/email')
  async emailInvoice(
    @Param('id') id: string,
    @Body() body: { recipientEmail?: string; customNote?: string; templateType?: string },
    @CurrentUser() user: ScopedUser,
  ) {
    return this.invoicingService.emailInvoice(id, user, body);
  }
}
