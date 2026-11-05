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
import { Throttle, SkipThrottle } from '@nestjs/throttler';
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
  if (h1.length !== h2.length || h1.length === 0) return false;
  return crypto.timingSafeEqual(h1, h2);
}

function extractWebhookDedupeId(payload: any, defaultSource: string): string {
  const entry = payload?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  if (value?.messages?.[0]?.id) {
    return `wa_msg_${value.messages[0].id}`;
  }
  if (value?.leadgen_id) {
    return `meta_lead_${value.leadgen_id}`;
  }
  if (payload?.leadgen_id) {
    return `meta_lead_${payload.leadgen_id}`;
  }
  if (payload?.messageId || payload?.id) {
    return `${defaultSource}_${payload.messageId || payload.id}`;
  }
  const contentStr = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
  return `hash_${crypto.createHash('sha256').update(contentStr).digest('hex').slice(0, 32)}`;
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

    const configuredToken = process.env.INDIAMART_WEBHOOK_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev_indiamart_secret' : undefined);
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
    req: Request,
    res: Response,
  ) {
    // Prevent response from setting cookies or redirecting
    res.removeHeader('Set-Cookie');
    res.removeHeader('set-cookie');

    // Extract query parameters robustly (supports both flat 'hub.mode' and nested qs parsing)
    const q = req.query as any;
    const mode = q?.['hub.mode'] || q?.hub?.mode || q?.mode;
    const challenge = q?.['hub.challenge'] || q?.hub?.challenge || q?.challenge;
    const verifyToken = q?.['hub.verify_token'] || q?.hub?.verify_token || q?.verify_token || q?.verifyToken;

    if (!mode || !challenge || !verifyToken) {
      return res.status(HttpStatus.BAD_REQUEST).type('text/plain').send('Bad Request: Missing required hub parameters');
    }

    if (mode !== 'subscribe') {
      return res.status(HttpStatus.BAD_REQUEST).type('text/plain').send('Bad Request: Expected hub.mode=subscribe');
    }

    // 1. Resolve tenant by key (supports both direct webhookKey match and SHA-256 hash match)
    let tenant: any = null;
    try {
      tenant = await this.webhooksService.findTenantByWebhookKey(key);
    } catch (err: any) {
      if (err instanceof NotFoundException) {
        return res.status(HttpStatus.NOT_FOUND).type('text/plain').send('Not Found: Unknown tenant webhook key');
      }
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).type('text/plain').send('Service Unavailable: Webhook database service unavailable');
    }

    if (!tenant) {
      return res.status(HttpStatus.NOT_FOUND).type('text/plain').send('Not Found: Unknown tenant webhook key');
    }

    // 2. Resolve acceptable verification tokens: strictly per-tenant token in production (NO shared-token fallback)
    const perTenantToken = await this.webhooksService.getTenantVerifyToken(tenant.id);
    const isProd = process.env.NODE_ENV === 'production';
    const acceptableTokens = isProd
      ? [perTenantToken].filter((t): t is string => Boolean(t && t.trim().length > 0))
      : [
          perTenantToken,
          process.env.WHATSAPP_VERIFY_TOKEN,
          process.env.META_VERIFY_TOKEN,
        ].filter((t): t is string => Boolean(t && t.trim().length > 0));

    const isTokenValid = Boolean(verifyToken && acceptableTokens.some((t) => timingSafeTokenMatch(verifyToken, t)));

    if (isTokenValid) {
      this.logger.log(`Meta webhook verified successfully for tenant ${tenant.code}. Returning hub.challenge.`);
      await this.webhooksService.logWebhookDelivery(tenant.id, 'whatsapp', 'HANDSHAKE', {
        summary: 'Webhook verification handshake successful',
        statusCode: 200,
      });
      return res.status(HttpStatus.OK).type('text/plain').send(String(challenge));
    } else {
      this.logger.warn(`Meta verification token mismatch for tenant ${tenant.code}`);
      await this.webhooksService.logWebhookDelivery(tenant.id, 'whatsapp', 'ERROR', {
        error: 'Verification token mismatch',
        statusCode: 403,
      });
      return res.status(HttpStatus.FORBIDDEN).type('text/plain').send('Forbidden: Token mismatch');
    }
  }

  /**
   * Meta Lead Ads & WhatsApp Webhook Keyed Handshake
   */
  @SkipThrottle()
  @Get('meta/:key')
  @Public()
  async verifyMetaWebhookWithKey(
    @Param('key') key: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.handleMetaVerificationHandshake(key, req, res);
  }

  @SkipThrottle()
  @Get('whatsapp/:key')
  @Public()
  async verifyWhatsAppWebhookWithKey(
    @Param('key') key: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.handleMetaVerificationHandshake(key, req, res);
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
    let tenant: any = null;
    try {
      tenant = await this.webhooksService.findTenantByWebhookKey(key);
    } catch {
      throw new NotFoundException('Unknown tenant webhook key');
    }

    if (!tenant) {
      throw new NotFoundException('Unknown tenant webhook key');
    }

    // 2. Validate X-Hub-Signature-256 against META_APP_SECRET
    const appSecret = process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET;
    if (signatureHeader) {
      if (!appSecret) {
        this.logger.warn(`Signature header present but META_APP_SECRET is not configured.`);
        throw new ServiceUnavailableException('META_APP_SECRET is not configured on server');
      }
      const parts = signatureHeader.split('=');
      const signatureHash = parts.length === 2 && parts[0] === 'sha256' ? parts[1] : signatureHeader;

      const rawBuffer = req.rawBody || Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload));
      const computedHmac = crypto.createHmac('sha256', appSecret).update(rawBuffer).digest('hex');

      const sigBuffer = Buffer.from(signatureHash, 'hex');
      const computedBuffer = Buffer.from(computedHmac, 'hex');

      // Strict length check before crypto.timingSafeEqual to prevent RangeError
      if (sigBuffer.length !== computedBuffer.length || sigBuffer.length === 0) {
        this.logger.warn(`Meta signature length mismatch (${sigBuffer.length} vs ${computedBuffer.length}) for tenant ${tenant.code}`);
        await this.webhooksService.logWebhookDelivery(tenant.id, defaultSource, 'ERROR', {
          error: 'Invalid signature length or format',
          statusCode: 401,
        });
        throw new UnauthorizedException('Invalid X-Hub-Signature-256 signature');
      }

      const isValid = crypto.timingSafeEqual(sigBuffer, computedBuffer);
      if (!isValid) {
        this.logger.warn(`Meta signature verification failed for tenant ${tenant.code}`);
        await this.webhooksService.logWebhookDelivery(tenant.id, defaultSource, 'ERROR', {
          error: 'Invalid X-Hub-Signature-256 signature',
          statusCode: 401,
        });
        throw new UnauthorizedException('Invalid X-Hub-Signature-256 signature');
      }
    }

    // 3. Persist incoming delivery to database BEFORE replying 200 (dedupe id enforced in DB)
    const dedupeId = extractWebhookDedupeId(payload, defaultSource);
    const { isDuplicate, delivery } = await this.webhooksService.recordInboundDelivery(
      tenant.id,
      defaultSource,
      payload,
      dedupeId,
    );

    if (isDuplicate) {
      return {
        status: 'ACCEPTED',
        message: 'Delivery already recorded (idempotent ignore)',
        dedupeId,
      };
    }

    // 4. Process delivery asynchronously with exponential back-off
    setImmediate(async () => {
      try {
        await this.webhooksService.processPendingDelivery(delivery.id);
      } catch (err: any) {
        this.logger.error(`Error processing async ${defaultSource} inbound webhook: ${err.message}`);
      }
    });

    return {
      status: 'ACCEPTED',
      message: 'Webhook received and recorded',
      deliveryId: delivery.id,
      dedupeId,
    };
  }

  /**
   * Meta Lead Ads Inbound Webhook
   */
  @SkipThrottle()
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
  @SkipThrottle()
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
   * Test webhook handshake by simulating Meta's GET verification request
   */
  @Post('test-handshake')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async testWebhookHandshake(
    @CurrentUser() user: ScopedUser,
    @Body() body: { url?: string; verifyToken?: string },
  ) {
    const tenantId = requireTenantId(user);
    return this.webhooksService.testHandshake(tenantId, body.url, body.verifyToken);
  }

  /**
   * Retrieve last 20 deliveries for current tenant
   */
  @Get('deliveries')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async getWebhookDeliveries(@CurrentUser() user: ScopedUser) {
    const tenantId = requireTenantId(user);
    return this.webhooksService.getRecentDeliveries(tenantId, 20);
  }

  /**
   * Save Page Access Token and WhatsApp credentials securely
   */
  @Post('save-meta-credentials')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async saveMetaCredentials(
    @CurrentUser() user: ScopedUser,
    @Body() body: { pageAccessToken?: string; wabaId?: string; phoneNumberId?: string },
  ) {
    const tenantId = requireTenantId(user);
    if (body.pageAccessToken && body.pageAccessToken.trim()) {
      await this.webhooksService.saveTenantPageAccessToken(tenantId, body.pageAccessToken.trim());
    }
    return { status: 'SUCCESS', message: 'Credentials saved securely' };
  }

  /**
   * Facebook Lead Ads: Generate OAuth Dialog URL
   */
  @Get('facebook/oauth-url')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async getFacebookOAuthUrl(
    @CurrentUser() user: ScopedUser,
    @Query('redirectUri') redirectUri?: string,
  ) {
    const tenantId = requireTenantId(user);
    const url = this.webhooksService.getFacebookOAuthUrl(tenantId, redirectUri);
    return { url, graphVersion: this.webhooksService.getGraphVersion() };
  }

  /**
   * Facebook Lead Ads: Connect Facebook Page
   * Exchanges token, retrieves pages, calls subscribed_apps with leadgen,
   * and securely persists encrypted credentials.
   */
  @Post('facebook/connect-page')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async connectFacebookPage(
    @CurrentUser() user: ScopedUser,
    @Body() body: { accessToken: string; pageId?: string },
  ) {
    const tenantId = requireTenantId(user);
    if (!body.accessToken || !body.accessToken.trim()) {
      throw new BadRequestException('Access token is required');
    }
    return this.webhooksService.connectFacebookPage(
      tenantId,
      body.accessToken.trim(),
      body.pageId,
    );
  }

  /**
   * Facebook Lead Ads: Get Page Connection Status & Configuration Checklist
   */
  @Get('facebook/status')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async getFacebookPageStatus(@CurrentUser() user: ScopedUser) {
    const tenantId = requireTenantId(user);
    return this.webhooksService.getFacebookPageConnectionStatus(tenantId);
  }

  /**
   * Facebook Lead Ads: Disconnect Facebook Page
   */
  @Post('facebook/disconnect')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async disconnectFacebookPage(@CurrentUser() user: ScopedUser) {
    const tenantId = requireTenantId(user);
    await this.webhooksService.disconnectFacebookPage(tenantId);
    return { status: 'SUCCESS', message: 'Facebook Page disconnected successfully' };
  }

  /**
   * Website Contact Form & RFQ Keyed Inbound
   */
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Get('inquiry-info')
  @Public()
  async getPublicInquiryInfo(@Query('key') queryKey?: string) {
    return this.webhooksService.getInquiryInfo(queryKey);
  }

  @Get('inquiry-info')
  @Public()
  async getPublicInquiryInfoFallback() {
    throw new NotFoundException('This form is not available');
  }

  @Get('inquiry-info/:key')
  @Public()
  async getPublicInquiryInfoByKey(@Param('key') key: string) {
    return this.webhooksService.getInquiryInfo(key);
  }

  @Post('website')
  @Public()
  @HttpCode(HttpStatus.OK)
  async handleWebsiteContactFormFallback() {
    throw new NotFoundException('This form is not available');
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

    const publicReference = `REF-${Date.now().toString().slice(-6)}`;

    return {
      status: 'SUCCESS',
      isDuplicate: result.isDuplicate,
      message: result.isDuplicate ? 'Inquiry registered' : 'Website inquiry registered',
      referenceNumber: publicReference,
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
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (provider === 'meta' || provider === 'whatsapp') {
      return this.handleMetaVerificationHandshake(key, req, res);
    }
    await this.webhooksService.findTenantByWebhookKey(key);
    throw new NotFoundException(`Unsupported webhook verification provider '${provider}'. Supported: meta, whatsapp`);
  }
}
