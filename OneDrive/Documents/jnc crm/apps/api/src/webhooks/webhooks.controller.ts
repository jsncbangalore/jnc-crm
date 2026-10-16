/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Query,
  Res,
  Req,
  Param,
  Headers,
  Logger,
  UseGuards,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WebhooksService } from './webhooks.service';
import { Response, Request } from 'express';
import * as crypto from 'crypto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ScopedUser } from '../auth/scoping.service';
import { requireTenantId } from '../common/tenant.util';

function timingSafeTokenMatch(provided?: string, expected?: string): boolean {
  if (!provided || !expected) return false;
  const h1 = crypto.createHash('sha256').update(provided).digest();
  const h2 = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(h1, h2);
}

function checkPayloadSize(payload: any, maxBytes: number = 100 * 1024) {
  const size = Buffer.byteLength(typeof payload === 'string' ? payload : JSON.stringify(payload || ''));
  if (size > maxBytes) {
    throw new PayloadTooLargeException(`Webhook payload exceeds maximum size limit of ${maxBytes / 1024}KB.`);
  }
}

function stripClientTenantKeys(payload: any) {
  if (payload && typeof payload === 'object') {
    delete payload.tenantId;
    delete payload.tenant_id;
    delete payload.companyCode;
    delete payload.company_code;
    delete payload.orgId;
    delete payload.org_id;
  }
  return payload;
}

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private webhooksService: WebhooksService) {}

  /**
   * Regenerate tenant webhook key (tenant_admin or admin only). Plain key displayed once.
   */
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('tenant_admin', 'admin')
  @HttpCode(HttpStatus.OK)
  @Post('regenerate-key')
  async regenerateWebhookKey(@CurrentUser() user: ScopedUser) {
    const tenantId = requireTenantId(user);
    return this.webhooksService.regenerateWebhookKey(tenantId);
  }

  // ─── TENANT-KEYED WEBHOOK ROUTES (/webhooks/<provider>/<key>) ──────────────

  /**
   * IndiaMART Keyed Push Endpoint: Scoped to specific tenant by webhookKey
   */
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('indiamart/:key')
  @HttpCode(HttpStatus.OK)
  async handleIndiaMartPushWithKey(
    @Param('key') key: string,
    @Body() payload: any,
    @Headers('x-indiamart-token') tokenHeader?: string,
    @Query('token') queryToken?: string,
  ) {
    checkPayloadSize(payload);
    stripClientTenantKeys(payload);

    // 1. Resolve tenant by key hash (returns 404 if not found)
    const tenant = await this.webhooksService.findTenantByWebhookKey(key);

    const configuredToken = process.env.INDIAMART_WEBHOOK_SECRET;
    if (!configuredToken) {
      this.logger.warn('IndiaMART webhook integration is not configured on server (INDIAMART_WEBHOOK_SECRET unset).');
      throw new ServiceUnavailableException('IndiaMART webhook integration is not configured on this server.');
    }

    const providedToken = tokenHeader || queryToken;
    if (!timingSafeTokenMatch(providedToken, configuredToken)) {
      this.logger.warn(`Unauthorized IndiaMART push attempt for tenant ${tenant.code}: invalid or missing token.`);
      throw new UnauthorizedException('Invalid or missing IndiaMART webhook secret token.');
    }

    const ts = payload?.QUERY_TIME || payload?.TIMESTAMP || payload?.timestamp;
    if (ts) {
      const parsed = new Date(ts).getTime();
      if (!isNaN(parsed) && (Date.now() - parsed > 24 * 3600 * 1000 || parsed - Date.now() > 5 * 60 * 1000)) {
        throw new BadRequestException('Webhook payload timestamp expired or invalid.');
      }
    }

    const result = await this.webhooksService.processIndiaMartLead(payload, tenant.id);
    return {
      status: result.isDuplicate ? 'DUPLICATE_IGNORED' : 'SUCCESS',
      message: result.isDuplicate ? 'Lead already recorded (idempotent ignore)' : 'Lead captured successfully',
      leadId: result.lead?.id,
    };
  }

  /**
   * Meta WhatsApp Cloud API Keyed Verification Handshake
   */
  @Get('whatsapp/:key')
  async verifyWhatsAppWebhookWithKey(
    @Param('key') key: string,
    @Query('hub.mode') mode: string,
    @Query('hub.challenge') challenge: string,
    @Query('hub.verify_token') verifyToken: string,
    @Res() res: Response,
  ) {
    // 1. Resolve tenant by key hash (returns 404 if not found)
    await this.webhooksService.findTenantByWebhookKey(key);

    const configuredToken = process.env.WHATSAPP_VERIFY_TOKEN;
    if (!configuredToken) {
      this.logger.warn('WhatsApp webhook verification is not configured on server (WHATSAPP_VERIFY_TOKEN unset).');
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).send('WhatsApp webhook integration is not configured on this server.');
    }

    if (mode === 'subscribe') {
      if (verifyToken && verifyToken === configuredToken) {
        this.logger.log('WhatsApp webhook verified successfully for tenant key. Returning hub.challenge.');
        return res.status(HttpStatus.OK).send(challenge || 'OK');
      } else {
        this.logger.warn(`WhatsApp verification token mismatch: received="${verifyToken}"`);
        return res.status(HttpStatus.FORBIDDEN).send('Forbidden: Token mismatch');
      }
    }

    return res.status(HttpStatus.OK).send(challenge || 'OK');
  }

  /**
   * Meta WhatsApp Webhook Keyed Inbound
   */
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('whatsapp/:key')
  @HttpCode(HttpStatus.OK)
  async handleWhatsAppInboundWithKey(
    @Param('key') key: string,
    @Req() req: Request & { rawBody?: Buffer },
    @Body() payload: any,
    @Headers('x-hub-signature-256') signatureHeader?: string,
  ) {
    checkPayloadSize(payload);
    stripClientTenantKeys(payload);

    // 1. Resolve tenant by key hash (returns 404 if not found)
    const tenant = await this.webhooksService.findTenantByWebhookKey(key);

    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) {
      this.logger.warn('WhatsApp webhook integration is not configured on server (WHATSAPP_APP_SECRET unset).');
      throw new ServiceUnavailableException('WhatsApp webhook integration is not configured on this server.');
    }

    if (!signatureHeader) {
      this.logger.warn(`WhatsApp webhook rejected for tenant ${tenant.code}: Missing signature`);
      throw new UnauthorizedException('Missing X-Hub-Signature-256 header');
    }

    const parts = signatureHeader.split('=');
    const signatureHash = parts.length === 2 && parts[0] === 'sha256' ? parts[1] : signatureHeader;

    const rawBuffer = req.rawBody || Buffer.from(JSON.stringify(payload));
    const computedHmac = crypto.createHmac('sha256', appSecret).update(rawBuffer).digest('hex');

    const sigBuffer = Buffer.from(signatureHash, 'hex');
    const computedBuffer = Buffer.from(computedHmac, 'hex');

    let isValid = false;
    if (sigBuffer.length === computedBuffer.length && sigBuffer.length > 0) {
      isValid = crypto.timingSafeEqual(sigBuffer, computedBuffer);
    }

    if (!isValid) {
      this.logger.warn(`WhatsApp signature verification failed for tenant ${tenant.code}`);
      throw new UnauthorizedException('Invalid X-Hub-Signature-256 signature');
    }

    const result = await this.webhooksService.processWhatsAppLead(payload, tenant.id);
    return {
      status: result.isDuplicate ? 'DUPLICATE_IGNORED' : 'SUCCESS',
      message: result.isDuplicate ? 'WhatsApp message already processed' : 'WhatsApp lead captured',
      leadId: result.lead?.id,
    };
  }

  /**
   * Website Contact Form & RFQ Keyed Inbound
   */
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Get('inquiry-info')
  async getPublicInquiryInfo() {
    return this.webhooksService.getInquiryInfo();
  }

  @Get('inquiry-info/:key')
  async getPublicInquiryInfoByKey(@Param('key') key: string) {
    const tenant = await this.webhooksService.findTenantByWebhookKey(key);
    return this.webhooksService.getInquiryInfo(tenant.id);
  }

  @Post('website/:key')
  @HttpCode(HttpStatus.OK)
  async handleWebsiteContactFormWithKey(
    @Param('key') key: string,
    @Body() payload: any,
    @Headers('x-website-token') tokenHeader?: string,
  ) {
    // 1. Resolve tenant by key hash (returns 404 if not found)
    const tenant = await this.webhooksService.findTenantByWebhookKey(key);

    stripClientTenantKeys(payload);
    const result = await this.webhooksService.processWebsiteLead(payload, tenant.id, tokenHeader);
    if (result.isBot) {
      return { status: 'SUCCESS', message: 'Inquiry registered' };
    }

    return {
      status: 'SUCCESS',
      isDuplicate: result.isDuplicate,
      message: result.isDuplicate ? 'Inquiry registered (existing contact updated)' : 'Website inquiry registered',
      leadId: result.lead?.id || result.lead?.leadNumber,
    };
  }

  /**
   * Catch-all generic provider keyed endpoint: /webhooks/:provider/:key
   */
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post(':provider/:key')
  @HttpCode(HttpStatus.OK)
  async handleGenericWebhook(
    @Param('provider') provider: string,
    @Param('key') key: string,
    @Body() payload: any,
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-indiamart-token') indiamartToken?: string,
    @Headers('x-website-token') websiteToken?: string,
    @Headers('x-hub-signature-256') hubSig?: string,
    @Query('token') queryToken?: string,
  ) {
    if (provider === 'indiamart') {
      return this.handleIndiaMartPushWithKey(key, payload, indiamartToken, queryToken);
    }
    if (provider === 'whatsapp') {
      return this.handleWhatsAppInboundWithKey(key, req, payload, hubSig);
    }
    if (provider === 'website') {
      return this.handleWebsiteContactFormWithKey(key, payload, websiteToken);
    }
    // Verify key first to return 404 for unknown key before checking provider
    await this.webhooksService.findTenantByWebhookKey(key);
    throw new NotFoundException(`Unsupported webhook provider '${provider}'. Supported: indiamart, whatsapp, website`);
  }
}
