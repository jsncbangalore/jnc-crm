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
  Req,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { WebhooksService } from './webhooks.service';

function stripClientTenantKeys(payload: any) {
  if (payload && typeof payload === 'object') {
    delete payload.tenantId;
    delete payload.tenant_id;
    delete payload.companyCode;
    delete payload.company_code;
    delete payload.orgId;
    delete payload.org_id;
  }
}

import { Public } from '../auth/page-access.decorator';

@Controller(['public-inquiry', 'public/inquiries'])
@Public()
export class PublicInquiryController {
  constructor(
    private readonly webhooksService: WebhooksService,
  ) {}

  @Get()
  async getInfo(@Query('key') key?: string) {
    return this.webhooksService.getInquiryInfo(key?.trim());
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post()
  @HttpCode(HttpStatus.OK)
  async submitInquiry(
    @Req() req: Request,
    @Body() body: any,
    @Query('key') queryKey?: string,
    @Headers('x-tenant-key') headerKey?: string,
  ) {
    // 1. Honeypot check
    const honeypot = body?.website_hp || body?._hp_company_trap || body?.website_url_hp || body?.hp_fax || body?.hp_title;
    if (honeypot) {
      return { status: 'SUCCESS', message: 'Inquiry registered' };
    }

    const rawKey = queryKey || headerKey || body?.key;

    // 2. Direct public contact inquiry path (no tenant key required)
    if (!rawKey || typeof rawKey !== 'string' || !rawKey.trim()) {
      const name = (body?.name || body?.customerName || '').trim();
      const email = (body?.email || body?.customerEmail || '').trim().toLowerCase();
      const message = (body?.message || body?.queryMessage || '').trim();
      const phone = (body?.phone || body?.customerPhone || '').trim() || '0000000000';
      const company = (body?.company || body?.companyName || '').trim();
      const topic = (body?.topic || 'sales').trim();

      if (!name || !email || !message) {
        throw new BadRequestException('Name, email, and message are required.');
      }

      const tenant = await this.webhooksService.getDefaultTenant();
      if (!tenant) {
        throw new NotFoundException('Inquiry submission service currently unavailable');
      }

      const lead = await this.webhooksService.createPublicInquiryLead({
        tenantId: tenant.id,
        name,
        email,
        phone,
        company,
        topic,
        message,
      });

      return {
        status: 'SUCCESS',
        message: 'Inquiry registered successfully',
        referenceNumber: `REF-${Date.now().toString().slice(-6)}`,
        leadId: lead?.id,
      };
    }

    // 3. Webhook / Widget lead path with tenant key
    const tenant = await this.webhooksService.findTenantByWebhookKey(rawKey.trim());
    if (!tenant) {
      throw new NotFoundException('This form is not available');
    }

    stripClientTenantKeys(body);
    const result = await this.webhooksService.processWebsiteLead(body, tenant.id, req);

    if (result.isBot) {
      return { status: 'SUCCESS', message: 'Inquiry registered' };
    }

    const publicReference = `REF-${Date.now().toString().slice(-6)}`;

    return {
      status: 'SUCCESS',
      message: result.isDuplicate ? 'Inquiry registered' : 'Inquiry registered successfully',
      referenceNumber: publicReference,
      isDuplicate: result.isDuplicate,
    };
  }
}
