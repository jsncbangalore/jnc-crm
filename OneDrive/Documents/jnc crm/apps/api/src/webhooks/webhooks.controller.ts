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
import { Public, PageAccess } from '../auth/page-access.decorator';

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
  @PageAccess('lead_setup')
  @Roles('tenant_admin', 'admin')
  @HttpCode(HttpStatus.OK)
  @Post('regenerate-key')
  async regenerateWebhookKey(@CurrentUser() user: ScopedUser) {
    const tenantId = requireTenantId(user);
    return this.webhooksService.regenerateWebhookKey(tenantId);
  }

  /**
   * Get tenant webhook configuration and live ingestion statistics
   */
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @PageAccess('lead_setup')
  @Roles('tenant_admin', 'admin', 'platform_super_admin')
  @Get('config')
  async getWebhookConfig(@CurrentUser() user: ScopedUser) {
    const tenantId = requireTenantId(user);
    return this.webhooksService.getTenantWebhookConfig(tenantId);
  }

  // ─── TENANT-KEYED WEBHOOK ROUTES (/webhooks/<provider>/<key>) ──────────────

  /**
   * IndiaMART Keyed Push Endpoint: Scoped to specific tenant by webhookKey
   */
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('indiamart/:key')
  @Public()
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
   * Helper to handle Meta / WhatsApp hub.challenge GET verification handshake
   */
  private async handleMetaVerificationHandshake(
    key: string,
    mode: string,
    challenge: string,
    verifyToken: string,
    res: Response,
  ) {
    // 1. Resolve tenant by key (supports both direct webhookKey match and SHA-256 hash match)
    // Throws 404 NotFoundException if not found
    const tenant = await this.webhooksService.findTenantByWebhookKey(key);

    const acceptableTokens = [
      process.env.WHATSAPP_VERIFY_TOKEN,
      process.env.META_VERIFY_TOKEN,
    ].filter((t): t is string => Boolean(t && t.trim().length > 0));

    if (mode === 'subscribe') {
      if (!challenge) {
        return res.status(HttpStatus.BAD_REQUEST).type('text/plain').send('Bad Request: Missing hub.challenge');
      }
      const isTokenValid = Boolean(verifyToken && acceptableTokens.some((t) => timingSafeTokenMatch(verifyToken, t)));
      if (isTokenValid) {
        this.logger.log(`Meta webhook verified successfully for tenant ${tenant.code}. Returning hub.challenge.`);
        return res.status(HttpStatus.OK).type('text/plain').send(String(challenge));
      } else {
        this.logger.warn(`Meta verification token mismatch for tenant ${tenant.code}: received="${verifyToken}"`);
        return res.status(HttpStatus.FORBIDDEN).type('text/plain').send('Forbidden: Token mismatch');
      }
    }

    return res.status(HttpStatus.BAD_REQUEST).type('text/plain').send('Bad Request: Expected hub.mode=subscribe');
  }

  /**
   * Meta Lead Ads & WhatsApp Webhook Keyed Handshake
   */
  @Get('meta/:key')
  @Public()
  async verifyMetaWebhookWithKey(
    @Param('key') key: string,
    @Query('hub.mode') mode: string,
    @Query('hub.challenge') challenge: string,
    @Query('hub.verify_token') verifyToken: string,
    @Res() res: Response,
  ) {
    return this.handleMetaVerificationHandshake(key, mode, challenge, verifyToken, res);
  }

  @Get('whatsapp/:key')
  @Public()
  async verifyWhatsAppWebhookWithKey(
    @Param('key') key: string,
    @Query('hub.mode') mode: string,
    @Query('hub.challenge') challenge: string,
    @Query('hub.verify_token') verifyToken: string,
    @Res() res: Response,
  ) {
    return this.handleMetaVerificationHandshake(key, mode, challenge, verifyToken, res);
  }

  /**
   * Helper to process inbound Meta Lead Ads or WhatsApp Cloud API webhook payloads
   */
  private async processMetaOrWhatsAppInbound(
    key: string,
    req: Request & { rawBody?: Buffer },
    payload: any,
    signatureHeader?: string,
    defaultSource: 'meta' | 'whatsapp' = 'meta',
  ) {
    checkPayloadSize(payload);
    stripClientTenantKeys(payload);

    // 1. Resolve tenant by key hash (returns 404 if not found)
    const tenant = await this.webhooksService.findTenantByWebhookKey(key);

    const appSecret = process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET;
    if (signatureHeader && appSecret) {
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
        this.logger.warn(`Meta signature verification failed for tenant ${tenant.code}`);
        throw new UnauthorizedException('Invalid X-Hub-Signature-256 signature');
      }
    }

    const result = await this.webhooksService.processMetaOrWhatsAppLead(payload, tenant.id, defaultSource);
    return {
      status: result.isDuplicate ? 'DUPLICATE_IGNORED' : 'SUCCESS',
      message: result.isDuplicate ? 'Payload already processed (idempotent ignore)' : 'Lead captured successfully',
      leadId: result.lead?.id,
    };
  }

  /**
   * Meta Lead Ads Inbound Webhook
   */
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Post('meta/:key')
  @Public()
  @HttpCode(HttpStatus.OK)
  async handleMetaInboundWithKey(
    @Param('key') key: string,
    @Req() req: Request & { rawBody?: Buffer },
    @Body() payload: any,
    @Headers('x-hub-signature-256') signatureHeader?: string,
  ) {
    return this.processMetaOrWhatsAppInbound(key, req, payload, signatureHeader, 'meta');
  }

  /**
   * Meta WhatsApp Webhook Keyed Inbound
   */
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Post('whatsapp/:key')
  @Public()
  @HttpCode(HttpStatus.OK)
  async handleWhatsAppInboundWithKey(
    @Param('key') key: string,
    @Req() req: Request & { rawBody?: Buffer },
    @Body() payload: any,
    @Headers('x-hub-signature-256') signatureHeader?: string,
  ) {
    return this.processMetaOrWhatsAppInbound(key, req, payload, signatureHeader, 'whatsapp');
  }

  /**
   * Website Contact Form & RFQ Keyed Inbound
   */
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Get('inquiry-info')
  @Public()
  async getPublicInquiryInfo(@Query('key') queryKey?: string) {
    if (!queryKey) {
      throw new NotFoundException('This form is not available');
    }
    return this.webhooksService.getInquiryInfo(queryKey);
  }

  @Get('inquiry-info/:key')
  @Public()
  async getPublicInquiryInfoByKey(@Param('key') key: string) {
    return this.webhooksService.getInquiryInfo(key);
  }

  @Post('website/:key')
  @Public()
  @HttpCode(HttpStatus.OK)
  async handleWebsiteContactFormWithKey(
    @Param('key') key: string,
    @Req() req: Request,
    @Body() payload: any,
  ) {
    // 1. Resolve tenant by key hash (returns 404 if not found)
    const tenant = await this.webhooksService.findTenantByWebhookKey(key);

    stripClientTenantKeys(payload);
    const result = await this.webhooksService.processWebsiteLead(payload, tenant.id, req);
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
  @Public()
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
    if (provider === 'whatsapp' || provider === 'meta') {
      return this.handleMetaInboundWithKey(key, req, payload, hubSig);
    }
    if (provider === 'website') {
      return this.handleWebsiteContactFormWithKey(key, payload, websiteToken);
    }
    // Verify key first to return 404 for unknown key before checking provider
    await this.webhooksService.findTenantByWebhookKey(key);
    throw new NotFoundException(`Unsupported webhook provider '${provider}'. Supported: indiamart, whatsapp, meta, website`);
  }

  /**
   * Generic provider verification handshake endpoint: GET /webhooks/:provider/:key
   */
  @Get(':provider/:key')
  @Public()
  async handleGenericWebhookGet(
    @Param('provider') provider: string,
    @Param('key') key: string,
    @Query('hub.mode') mode: string,
    @Query('hub.challenge') challenge: string,
    @Query('hub.verify_token') verifyToken: string,
    @Res() res: Response,
  ) {
    if (provider === 'meta' || provider === 'whatsapp') {
      return this.handleMetaVerificationHandshake(key, mode, challenge, verifyToken, res);
    }
    await this.webhooksService.findTenantByWebhookKey(key);
    throw new NotFoundException(`Unsupported webhook verification provider '${provider}'. Supported: meta, whatsapp`);
  }
}
