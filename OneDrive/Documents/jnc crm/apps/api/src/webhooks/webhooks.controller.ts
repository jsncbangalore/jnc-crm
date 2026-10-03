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
  Headers,
  Logger,
  UnauthorizedException,
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WebhooksService } from './webhooks.service';
import { Response, Request } from 'express';
import * as crypto from 'crypto';

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

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private webhooksService: WebhooksService) {}

  /**
   * IndiaMART Push Endpoint: Protected with shared secret token
   * Generous webhook rate limit: 60 req/min
   */
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('indiamart')
  @HttpCode(HttpStatus.OK)
  async handleIndiaMartPush(
    @Body() payload: any,
    @Headers('x-indiamart-token') tokenHeader?: string,
    @Query('token') queryToken?: string,
  ) {
    checkPayloadSize(payload);

    const configuredToken = process.env.INDIAMART_WEBHOOK_SECRET;
    if (!configuredToken) {
      this.logger.error('CRITICAL: INDIAMART_WEBHOOK_SECRET environment variable is not configured on server.');
      throw new UnauthorizedException('IndiaMART webhook secret is not configured on server.');
    }

    const providedToken = tokenHeader || queryToken;

    if (!timingSafeTokenMatch(providedToken, configuredToken)) {
      this.logger.warn(`Unauthorized IndiaMART push attempt: invalid or missing token.`);
      throw new UnauthorizedException('Invalid or missing IndiaMART webhook secret token.');
    }

    // 24h replay/expiration check if timestamp present
    const ts = payload?.QUERY_TIME || payload?.TIMESTAMP || payload?.timestamp;
    if (ts) {
      const parsed = new Date(ts).getTime();
      if (!isNaN(parsed) && (Date.now() - parsed > 24 * 3600 * 1000 || parsed - Date.now() > 5 * 60 * 1000)) {
        throw new BadRequestException('Webhook payload timestamp expired or invalid.');
      }
    }

    const result = await this.webhooksService.processIndiaMartLead(payload);
    return {
      status: result.isDuplicate ? 'DUPLICATE_IGNORED' : 'SUCCESS',
      message: result.isDuplicate ? 'Lead already recorded (idempotent ignore)' : 'Lead captured successfully',
      leadId: result.lead?.id,
    };
  }

  /**
   * Meta WhatsApp Cloud API Webhook Verification Handshake
   * Handles GET request with hub.mode, hub.verify_token, and hub.challenge
   */
  @Get('whatsapp')
  verifyWhatsAppWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.challenge') challenge: string,
    @Query('hub.verify_token') verifyToken: string,
    @Res() res: Response,
  ) {
    this.logger.log(`WhatsApp verification handshake received: mode=${mode}, challenge=${challenge}, verify_token=${verifyToken}`);

    const configuredToken = process.env.WHATSAPP_VERIFY_TOKEN;
    if (!configuredToken) {
      this.logger.error('CRITICAL: WHATSAPP_VERIFY_TOKEN environment variable is not configured on server.');
      return res.status(HttpStatus.UNAUTHORIZED).send('WhatsApp verify token is not configured on server.');
    }

    if (mode === 'subscribe') {
      if (verifyToken && verifyToken === configuredToken) {
        this.logger.log('WhatsApp webhook verified successfully. Returning hub.challenge.');
        return res.status(HttpStatus.OK).send(challenge || 'OK');
      } else {
        this.logger.warn(`WhatsApp verification token mismatch: received="${verifyToken}", expected configured token`);
        return res.status(HttpStatus.FORBIDDEN).send('Forbidden: Token mismatch');
      }
    }

    return res.status(HttpStatus.OK).send(challenge || 'OK');
  }

  /**
   * Meta WhatsApp Webhook Inbound: Verified via X-Hub-Signature-256 HMAC-SHA256
   * Constant-time comparison using crypto.timingSafeEqual over raw request body.
   */
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('whatsapp')
  @HttpCode(HttpStatus.OK)
  async handleWhatsAppInbound(
    @Req() req: Request & { rawBody?: Buffer },
    @Body() payload: any,
    @Headers('x-hub-signature-256') signatureHeader?: string,
  ) {
    checkPayloadSize(payload);

    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) {
      this.logger.error('CRITICAL: WHATSAPP_APP_SECRET environment variable is not configured on server.');
      throw new UnauthorizedException('WhatsApp webhook secret is not configured on server.');
    }

    if (!signatureHeader) {
      this.logger.warn('WhatsApp webhook rejected: Missing X-Hub-Signature-256 header');
      throw new UnauthorizedException('Missing X-Hub-Signature-256 header');
    }

    // Expecting format: "sha256=<hex-digest>"
    const parts = signatureHeader.split('=');
    const signatureHash = parts.length === 2 && parts[0] === 'sha256' ? parts[1] : signatureHeader;

    // Use rawBody buffer or stringified body as fallback
    const rawBuffer = req.rawBody || Buffer.from(JSON.stringify(payload));
    const computedHmac = crypto.createHmac('sha256', appSecret).update(rawBuffer).digest('hex');

    // Constant-time comparison to prevent timing attacks
    const sigBuffer = Buffer.from(signatureHash, 'hex');
    const computedBuffer = Buffer.from(computedHmac, 'hex');

    let isValid = false;
    if (sigBuffer.length === computedBuffer.length && sigBuffer.length > 0) {
      isValid = crypto.timingSafeEqual(sigBuffer, computedBuffer);
    }

    if (!isValid) {
      this.logger.warn(`WhatsApp signature verification failed. Computed: ${computedHmac}, Received: ${signatureHash}`);
      throw new UnauthorizedException('Invalid X-Hub-Signature-256 signature');
    }

    const result = await this.webhooksService.processWhatsAppLead(payload);
    return {
      status: result.isDuplicate ? 'DUPLICATE_IGNORED' : 'SUCCESS',
      message: result.isDuplicate ? 'WhatsApp message already processed' : 'WhatsApp lead captured',
      leadId: result.lead?.id,
    };
  }

  /**
   * Website Contact Form & RFQ: Protected with honeypot bot trap & secret token
   */
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('website')
  @HttpCode(HttpStatus.OK)
  async handleWebsiteContactForm(
    @Body() payload: any,
    @Headers('x-website-token') tokenHeader?: string,
  ) {
    const result = await this.webhooksService.processWebsiteLead(payload, tokenHeader);

    // If bot detected via honeypot, return silent 200 OK without revealing it was caught
    if (result.isBot) {
      return { status: 'SUCCESS', message: 'Inquiry registered' };
    }

    return {
      status: result.isDuplicate ? 'DUPLICATE_IGNORED' : 'SUCCESS',
      message: result.isDuplicate ? 'Inquiry already registered' : 'Website inquiry registered',
      leadId: result.lead?.id,
    };
  }
}
