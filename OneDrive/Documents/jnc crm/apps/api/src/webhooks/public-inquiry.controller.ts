/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Query,
  Headers,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WebhooksService } from './webhooks.service';
import { LeadsService } from '../leads/leads.service';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeHtml, stripAllHtml } from '../common/html-sanitize.util';

@Controller('public-inquiry')
export class PublicInquiryController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly leadsService: LeadsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async getInfo(@Query('key') key?: string) {
    if (key) {
      const tenant = await this.webhooksService.findTenantByWebhookKey(key);
      return this.webhooksService.getInquiryInfo(tenant.id);
    }
    return this.webhooksService.getInquiryInfo();
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post()
  @HttpCode(HttpStatus.OK)
  async submitInquiry(
    @Body() body: any,
    @Query('key') queryKey?: string,
    @Headers('x-tenant-key') headerKey?: string,
  ) {
    let tenantId: string;
    const key = queryKey || headerKey || body?.key;

    if (key) {
      const tenant = await this.webhooksService.findTenantByWebhookKey(key);
      tenantId = tenant.id;
    } else {
      const defaultTenant = await this.prisma.tenant.findFirst({
        where: { deletedAt: null, status: 'active' },
        orderBy: { isInternal: 'desc' },
      });
      tenantId = defaultTenant?.id || 'default-tenant';
    }

    // Deterministic Stored XSS Immunization on all public inputs
    const sanitizedName = stripAllHtml(body?.name || body?.customerName) || 'Public Inquirer';
    const sanitizedPhone = stripAllHtml(body?.phone || body?.customerPhone) || '9999999999';
    const sanitizedEmail = stripAllHtml(body?.email || body?.customerEmail);
    const sanitizedCompany = stripAllHtml(body?.company || body?.companyName);
    const sanitizedCity = stripAllHtml(body?.city);
    const sanitizedProductCategory = stripAllHtml(body?.productCategory || body?.category) || 'General Inquiry';
    const sanitizedProductName = stripAllHtml(body?.productName || body?.product);
    const sanitizedMessage = sanitizeHtml(body?.message || body?.notes || body?.queryMessage) || 'Public inquiry received';

    const result = await this.leadsService.createLead(
      {
        customerName: sanitizedName,
        customerPhone: sanitizedPhone,
        customerEmail: sanitizedEmail,
        companyName: sanitizedCompany,
        city: sanitizedCity,
        productCategory: sanitizedProductCategory,
        productName: sanitizedProductName,
        queryMessage: sanitizedMessage,
        source: 'web',
        quantity: body?.quantity ? Number(body.quantity) : 1,
        estimatedValue: body?.estimatedValue ? Number(body.estimatedValue) : 0,
      },
      { tenantId, role: 'admin', employeeCode: 'PUBLIC_INQUIRY' } as any,
    );

    return {
      status: 'SUCCESS',
      message: 'Inquiry registered successfully',
      leadId: result.id,
      leadNumber: result.leadNumber,
      lead: result,
    };
  }
}
