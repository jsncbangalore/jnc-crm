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

@Controller('public-inquiry')
export class PublicInquiryController {
  constructor(
    private readonly webhooksService: WebhooksService,
  ) {}

  @Get()
  async getInfo(@Query('key') key?: string) {
    if (!key || typeof key !== 'string' || !key.trim()) {
      throw new NotFoundException('This form is not available');
    }
    return this.webhooksService.getInquiryInfo(key.trim());
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post()
  @HttpCode(HttpStatus.OK)
  async submitInquiry(
    @Req() req: Request,
    @Body() body: any,
    @Query('key') queryKey?: string,
    @Headers('x-tenant-key') headerKey?: string,
  ) {
    const key = queryKey || headerKey || body?.key;
    if (!key || typeof key !== 'string' || !key.trim()) {
      throw new NotFoundException('This form is not available');
    }

    const tenant = await this.webhooksService.findTenantByWebhookKey(key.trim());
    stripClientTenantKeys(body);
    const result = await this.webhooksService.processWebsiteLead(body, tenant.id, req);

    if (result.isBot) {
      return { status: 'SUCCESS', message: 'Inquiry registered' };
    }

    return {
      status: 'SUCCESS',
      message: result.isDuplicate ? 'Inquiry registered (existing contact updated)' : 'Inquiry registered successfully',
      leadId: result.lead?.id,
      leadNumber: result.lead?.leadNumber,
      isDuplicate: result.isDuplicate,
    };
  }
}
