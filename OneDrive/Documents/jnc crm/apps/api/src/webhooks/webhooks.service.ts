/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { LeadsService } from '../leads/leads.service';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

function stripHtml(val?: any): string | undefined {
  if (val === null || val === undefined) return undefined;
  if (typeof val !== 'string') return String(val);
  return val.replace(/<[^>]*>/g, '').trim();
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private leadsService: LeadsService,
    private prisma: PrismaService,
  ) {}

  /**
   * Process inbound IndiaMART CRM push / pull lead payload with idempotency
   */
  async processIndiaMartLead(payload: any) {
    this.logger.log(`Received IndiaMART webhook payload: ${JSON.stringify(payload)}`);

    // Natural idempotency key: query_id or SENDER_MOBILE+SUBJECT
    const queryId = payload.QUERY_ID || payload.query_id || payload.UNIQUE_QUERY_ID || payload.unique_query_id;
    if (queryId) {
      const existing = await this.prisma.lead.findFirst({
        where: {
          rawPayload: { contains: String(queryId) },
          source: 'indiamart',
          deletedAt: null,
        },
      });
      if (existing) {
        this.logger.log(`IndiaMART redelivery ignored for queryId=${queryId}. Existing lead: ${existing.leadNumber}`);
        return { isDuplicate: true, lead: existing };
      }
    }

    // Normalize IndiaMART schema
    const customerName = stripHtml(payload.SENDER_NAME || payload.sender_name || payload.name) || 'IndiaMART Prospect';
    const customerPhone = stripHtml(payload.SENDER_MOBILE || payload.sender_mobile || payload.mobile || payload.phone) || '';
    const customerEmail = stripHtml(payload.SENDER_EMAIL || payload.sender_email || payload.email);
    const city = stripHtml(payload.SENDER_CITY || payload.sender_city || payload.city);
    const companyName = stripHtml(payload.GLUSR_USR_COMPANYNAME || payload.company_name || payload.company);
    const productName = stripHtml(payload.PRODUCT_NAME || payload.product_name || payload.subject || payload.SUBJECT);
    const queryMessage = stripHtml(payload.QUERY_MESSAGE || payload.query_message || payload.message || payload.query);

    if (!customerPhone) {
      this.logger.warn('IndiaMART webhook missing customer phone number');
    }

    try {
      const lead = await this.leadsService.createLead({
        customerName,
        customerPhone: customerPhone || '9999999999',
        customerEmail,
        city,
        companyName,
        productName,
        productCategory: productName,
        queryMessage: queryMessage || `Inquiry from IndiaMART regarding ${productName || 'products'}`,
        source: 'indiamart',
        rawPayload: JSON.stringify(payload),
      });
      return { isDuplicate: false, lead };
    } catch (err: any) {
      if (err?.message?.includes('Duplicate lead detected')) {
        // Redelivery / duplicate phone fallback
        const existing = await this.prisma.lead.findFirst({
          where: {
            customerPhone: { contains: customerPhone.replace(/[^0-9]/g, '').slice(-10) },
            deletedAt: null,
          },
        });
        return { isDuplicate: true, lead: existing };
      }
      throw err;
    }
  }

  /**
   * Process inbound WhatsApp message with Meta Message ID Idempotency
   */
  async processWhatsAppLead(payload: any) {
    this.logger.log(`Received WhatsApp inbound webhook payload: ${JSON.stringify(payload)}`);

    let customerPhone = '';
    let customerName = 'WhatsApp Lead';
    let queryMessage = '';
    let messageId = '';

    // Handle standard Meta Cloud API webhook structure
    if (payload.entry && payload.entry[0]?.changes && payload.entry[0]?.changes[0]?.value) {
      const value = payload.entry[0].changes[0].value;
      const contact = value.contacts?.[0];
      const message = value.messages?.[0];

      customerPhone = contact?.wa_id || message?.from || '';
      customerName = contact?.profile?.name || 'WhatsApp Customer';
      queryMessage = message?.text?.body || message?.caption || 'Inbound WhatsApp Inquiry';
      messageId = message?.id || '';
    } 
    // Handle BSP payloads (WATI, Interakt, AiSensy, Gupshup)
    else {
      customerPhone = payload.waId || payload.phone || payload.sender || payload.from || payload.mobileNumber || '';
      customerName = payload.senderName || payload.name || payload.userName || 'WhatsApp Prospect';
      queryMessage = payload.text || payload.message || payload.body || 'WhatsApp Message Inquiry';
      messageId = payload.messageId || payload.id || payload.msgId || '';
    }

    // Natural Idempotency Check: Meta message ID
    if (messageId) {
      const existing = await this.prisma.lead.findFirst({
        where: {
          rawPayload: { contains: messageId },
          source: 'whatsapp',
          deletedAt: null,
        },
      });
      if (existing) {
        this.logger.log(`WhatsApp redelivery ignored for messageId=${messageId}. Existing lead: ${existing.leadNumber}`);
        return { isDuplicate: true, lead: existing };
      }
    }

    try {
      const lead = await this.leadsService.createLead({
        customerName: stripHtml(customerName) || 'WhatsApp Lead',
        customerPhone: stripHtml(customerPhone) || '919999999999',
        queryMessage: stripHtml(queryMessage) || 'Inbound WhatsApp Inquiry',
        source: 'whatsapp',
        productCategory: 'General Inquiry',
        rawPayload: JSON.stringify(payload),
      });
      return { isDuplicate: false, lead };
    } catch (err: any) {
      if (err?.message?.includes('Duplicate lead detected')) {
        const existing = await this.prisma.lead.findFirst({
          where: {
            customerPhone: { contains: customerPhone.replace(/[^0-9]/g, '').slice(-10) },
            deletedAt: null,
          },
        });
        return { isDuplicate: true, lead: existing };
      }
      throw err;
    }
  }

  /**
   * Process inbound website contact / RFQ form submission
   * Supports Honeypot detection (silent ignore) & Shared Secret verification
   */
  async processWebsiteLead(payload: any, tokenHeader?: string) {
    this.logger.log(`Received Website form submission: ${JSON.stringify(payload)}`);

    // 1. Honeypot check: If bot filled hidden honeypot fields, silently discard
    const honeypotValues = [
      payload._hp_company_trap,
      payload.website_url_hp,
      payload.hp_fax,
      payload.hp_title,
    ].filter(Boolean);

    if (honeypotValues.length > 0) {
      this.logger.warn(`Bot detected via honeypot field: ${JSON.stringify(honeypotValues)}. Silently dropping.`);
      return { isBot: true, isDuplicate: false, lead: null };
    }

    // 2. Shared secret token validation (protects against internet bots scraping open POST endpoints)
    const configuredToken = process.env.WEBSITE_WEBHOOK_SECRET || process.env.WEBSITE_SUBMISSION_SECRET;
    if (!configuredToken) {
      this.logger.error('CRITICAL: WEBSITE_WEBHOOK_SECRET environment variable is not configured on server.');
      throw new UnauthorizedException('Website submission webhook secret token is not configured on server.');
    }

    const providedToken = tokenHeader || payload.websiteToken || payload._secret_token || payload.token;

    const configuredHash = crypto.createHash('sha256').update(configuredToken).digest();
    const providedHash = crypto.createHash('sha256').update(providedToken || '').digest();
    if (!providedToken || !crypto.timingSafeEqual(configuredHash, providedHash)) {
      this.logger.warn(`Website inquiry token mismatch or missing: provided="${providedToken}"`);
      throw new UnauthorizedException('Invalid or missing website submission token.');
    }

    // 3. Natural idempotency check: RFQ ID / reference number
    const submissionId = payload.submissionId || payload.rfqId || payload.requestId;
    if (submissionId) {
      const existing = await this.prisma.lead.findFirst({
        where: {
          rawPayload: { contains: String(submissionId) },
          source: 'web',
          deletedAt: null,
        },
      });
      if (existing) {
        this.logger.log(`Website form redelivery ignored for submissionId=${submissionId}`);
        return { isBot: false, isDuplicate: true, lead: existing };
      }
    }

    try {
      const lead = await this.leadsService.createLead({
        customerName: stripHtml(payload.name || payload.customerName) || 'Web Inquiry',
        customerPhone: stripHtml(payload.phone || payload.customerPhone) || '',
        customerEmail: stripHtml(payload.email || payload.customerEmail),
        city: stripHtml(payload.city),
        companyName: stripHtml(payload.company || payload.companyName),
        productCategory: stripHtml(payload.category || payload.productCategory),
        productName: stripHtml(payload.product || payload.productName),
        quantity: payload.quantity ? Number(payload.quantity) : 1,
        estimatedValue: payload.estimatedValue ? Number(payload.estimatedValue) : 0,
        queryMessage: stripHtml(payload.message || payload.queryMessage) || 'Website contact form submission',
        source: 'web',
        rawPayload: JSON.stringify(payload),
      });
      return { isBot: false, isDuplicate: false, lead };
    } catch (err: any) {
      if (err?.message?.includes('Duplicate lead detected')) {
        const phone = payload.phone || payload.customerPhone || '';
        const existing = await this.prisma.lead.findFirst({
          where: {
            customerPhone: { contains: phone.replace(/[^0-9]/g, '').slice(-10) },
            deletedAt: null,
          },
        });
        return { isBot: false, isDuplicate: true, lead: existing };
      }
      throw err;
    }
  }
}
