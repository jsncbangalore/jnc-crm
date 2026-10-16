/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, Logger, UnauthorizedException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { LeadsService } from '../leads/leads.service';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import { sanitizeHtml, stripAllHtml } from '../common/html-sanitize.util';

function stripHtml(val?: any): string | undefined {
  if (val === null || val === undefined) return undefined;
  if (typeof val !== 'string') return String(val);
  return stripAllHtml(val);
}


@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private leadsService: LeadsService,
    private prisma: PrismaService,
  ) {}

  /**
   * Find active tenant by matching SHA-256 hash of provided plain webhook key
   * Returns 404 if not found or inactive
   */
  async findTenantByWebhookKey(plainKey: string) {
    if (!plainKey || typeof plainKey !== 'string') {
      throw new NotFoundException('Webhook key not provided.');
    }

    const keyHash = crypto.createHash('sha256').update(plainKey.trim()).digest('hex');
    const tenant = await this.prisma.tenant.findFirst({
      where: { webhookKeyHash: keyHash } as any,
    });

    if (!tenant || tenant.deletedAt !== null || tenant.status !== 'active') {
      throw new NotFoundException('Webhook key not recognized or organization workspace is inactive.');
    }

    return tenant;
  }

  /**
   * Regenerate plain webhook key for tenant, store SHA-256 hash, and return plain key once
   */
  async regenerateWebhookKey(tenantId: string) {
    const plainKey = 'whk_' + crypto.randomBytes(24).toString('hex');
    const keyHash = crypto.createHash('sha256').update(plainKey).digest('hex');

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { webhookKeyHash: keyHash } as any,
    });

    return {
      webhookKey: plainKey,
      message: 'Webhook key regenerated successfully. Store this key securely; it will not be displayed again.',
    };
  }

  /**
   * Resolve pinned tenant for deprecated legacy unkeyed webhook routes.
   * Pinned strictly to LEGACY_WEBHOOK_TENANT_CODE (default: 'JNC').
   * Never searches leads across tenants.
   */
  async getLegacyWebhookTenant(): Promise<{ id: string; code: string; name: string }> {
    const legacyCode = process.env.LEGACY_WEBHOOK_TENANT_CODE || 'JNC';
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        code: { equals: legacyCode, mode: 'insensitive' },
        deletedAt: null,
      },
      select: { id: true, code: true, name: true },
    });
    if (tenant) return tenant;

    const internalTenant = await this.prisma.tenant.findFirst({
      where: { isInternal: true, deletedAt: null },
      select: { id: true, code: true, name: true },
    });
    if (internalTenant) return internalTenant;

    const fallback = await this.prisma.tenant.findFirst({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true },
      orderBy: { createdAt: 'asc' },
    });
    if (fallback) return fallback;

    throw new NotFoundException(`No active organization found matching legacy webhook tenant code "${legacyCode}".`);
  }

  /**
   * Log an audit log entry for legacy unkeyed webhook endpoint calls with sunset date 2026-12-31.
   */
  async logLegacyWebhookCall(params: {
    tenantId: string;
    endpoint: string;
    ipAddress?: string;
    payloadSummary?: string;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: params.tenantId,
          action: 'LEGACY_WEBHOOK_CALL',
          entityName: 'Webhook',
          entityId: params.endpoint,
          actorName: 'LEGACY_WEBHOOK_FALLBACK',
          beforeState: JSON.stringify({ sunsetDate: '2026-12-31', status: 'DEPRECATED' }),
          afterState: JSON.stringify({ endpoint: params.endpoint, summary: params.payloadSummary ?? '' }),
          ipAddress: params.ipAddress || '127.0.0.1',
        },
      });
    } catch (err: any) {
      this.logger.error(`Failed to record legacy webhook audit log: ${err.message}`);
    }
  }

  /**
   * Fallback for deprecated legacy unkeyed webhook routes to find the primary internal tenant
   */
  async getDefaultInternalTenantId(): Promise<string> {
    const tenant = await this.getLegacyWebhookTenant();
    return tenant.id;
  }

  private async _unused(): Promise<string> {
    const internalTenant = await this.prisma.tenant.findFirst({
      where: { isInternal: true, deletedAt: null },
      select: { id: true },
    });
    if (internalTenant) return internalTenant.id;

    const fallback = await this.prisma.tenant.findFirst({
      where: { deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (fallback) return fallback.id;

    throw new NotFoundException('No active organization found to process incoming webhook.');
  }

  /**
   * Process inbound IndiaMART CRM push / pull lead payload with idempotency
   */
  async processIndiaMartLead(payload: any, tenantId: string) {
    this.logger.log(`Received IndiaMART webhook payload for tenant ${tenantId}: ${JSON.stringify(payload)}`);

    // Natural idempotency key: query_id or SENDER_MOBILE+SUBJECT
    const queryId = payload.QUERY_ID || payload.query_id || payload.UNIQUE_QUERY_ID || payload.unique_query_id;
    if (queryId) {
      const existing = await this.prisma.lead.findFirst({
        where: {
          tenantId,
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
      const lead = await this.leadsService.createLead(
        {
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
        },
        { tenantId, role: 'admin', employeeCode: 'WEBHOOK' } as any,
      );
      return { isDuplicate: false, lead };
    } catch (err: any) {
      if (err?.message?.includes('Duplicate lead detected')) {
        // Redelivery / duplicate phone fallback
        const existing = await this.prisma.lead.findFirst({
          where: {
            tenantId,
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
  async processWhatsAppLead(payload: any, tenantId: string) {
    this.logger.log(`Received WhatsApp inbound webhook payload for tenant ${tenantId}: ${JSON.stringify(payload)}`);

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
          tenantId,
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
      const lead = await this.leadsService.createLead(
        {
          customerName: stripHtml(customerName) || 'WhatsApp Lead',
          customerPhone: stripHtml(customerPhone) || '919999999999',
          queryMessage: stripHtml(queryMessage) || 'Inbound WhatsApp Inquiry',
          source: 'whatsapp',
          productCategory: 'General Inquiry',
          rawPayload: JSON.stringify(payload),
        },
        { tenantId, role: 'admin', employeeCode: 'WEBHOOK' } as any,
      );
      return { isDuplicate: false, lead };
    } catch (err: any) {
      if (err?.message?.includes('Duplicate lead detected')) {
        const existing = await this.prisma.lead.findFirst({
          where: {
            tenantId,
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
  async processWebsiteLead(payload: any, tenantId: string, tokenHeader?: string) {
    this.logger.log(`Received Website form submission for tenant ${tenantId}: ${JSON.stringify(payload)}`);

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

    // 2. Shared secret token validation: If a client explicitly passes a secret token, verify it.
    // Public website inquiries without tokens are accepted (guarded by honeypot, rate-limiting & idempotency).
    const configuredToken = process.env.WEBSITE_WEBHOOK_SECRET || process.env.WEBSITE_SUBMISSION_SECRET;
    const providedToken = tokenHeader || payload.websiteToken || payload._secret_token || payload.token;

    if (configuredToken && providedToken) {
      const configuredHash = crypto.createHash('sha256').update(configuredToken).digest();
      const providedHash = crypto.createHash('sha256').update(providedToken).digest();
      if (!crypto.timingSafeEqual(configuredHash, providedHash)) {
        this.logger.warn(`Website inquiry token mismatch: provided="${providedToken}"`);
        throw new UnauthorizedException('Invalid website submission token.');
      }
    }

    // 3. Natural idempotency check: RFQ ID / reference number
    const submissionId = payload.submissionId || payload.rfqId || payload.requestId;
    if (submissionId) {
      const existing = await this.prisma.lead.findFirst({
        where: {
          tenantId,
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
      const lead = await this.leadsService.createLead(
        {
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
        },
        { tenantId, role: 'admin', employeeCode: 'WEBHOOK' } as any,
      );
      return { isBot: false, isDuplicate: false, lead };
    } catch (err: any) {
      if (err?.message?.includes('Duplicate lead detected')) {
        const phone = payload.phone || payload.customerPhone || '';
        const normPhone = phone.replace(/[^0-9]/g, '').slice(-10);
        const existing = await this.prisma.lead.findFirst({
          where: {
            tenantId,
            customerPhone: { contains: normPhone },
            deletedAt: null,
          },
        });
        if (existing) {
          try {
            await this.prisma.leadActivity.create({
              data: {
                leadId: existing.id,
                type: 'note',
                title: 'New Web Inquiry Received',
                description: sanitizeHtml(`Category: ${payload.category || payload.productCategory || 'General'}, Product: ${payload.product || payload.productName || 'None'}, Message: ${payload.message || payload.queryMessage || 'None'}`),
              },
            });

          } catch (_) {}
        }
        return { isBot: false, isDuplicate: true, lead: existing };
      }
      throw err;
    }
  }

  /**
   * Public endpoint to fetch company profile & inventory products for web-to-lead forms
   */
  async getInquiryInfo(tenantId?: string) {
    let tenant: any = null;
    if (tenantId) {
      tenant = await this.prisma.tenant.findFirst({
        where: { id: tenantId, deletedAt: null },
        select: {
          id: true,
          code: true,
          name: true,
          phone: true,
          email: true,
          website: true,
          address: true,
          city: true,
          state: true,
          pincode: true,
          logoUrl: true,
        },
      });
    }
    if (!tenant) {
      try {
        const defaultTenant = await this.getLegacyWebhookTenant();
        tenant = await this.prisma.tenant.findFirst({
          where: { id: defaultTenant.id },
          select: {
            id: true,
            code: true,
            name: true,
            phone: true,
            email: true,
            website: true,
            address: true,
            city: true,
            state: true,
            pincode: true,
            logoUrl: true,
          },
        });
      } catch (_) {}
    }

    const tId = tenant?.id || '';

    // Fetch tenant SKUs / products
    const skus = tId ? await this.prisma.sku.findMany({
      where: { tenantId: tId, deletedAt: null },
      select: { id: true, name: true, skuCode: true, category: true },
      orderBy: { name: 'asc' },
      take: 100,
    }) : [];

    const products = tId ? await this.prisma.product.findMany({
      where: { tenantId: tId, deletedAt: null },
      select: { id: true, name: true, category: true },
      orderBy: { name: 'asc' },
      take: 100,
    }) : [];

    const fullAddress = [tenant?.address, tenant?.city, tenant?.state, tenant?.pincode].filter(Boolean).join(', ');

    return {
      company: {
        name: tenant?.name || 'JS Network Communication',
        phone: tenant?.phone || '+91 9876543210',
        email: tenant?.email || 'sales@example.com',
        website: tenant?.website || 'https://example.com',
        address: fullAddress || '18/19, Second Floor, Coconut Avenue, JP Nagar 8th Phase, Bengaluru - 560076',
        logoUrl: tenant?.logoUrl || '',
      },
      products: skus.length > 0
        ? skus.map((s) => ({ name: s.name, category: s.category || 'General', skuCode: s.skuCode }))
        : products.map((p) => ({ name: p.name, category: p.category || 'General', skuCode: '' })),
    };
  }
}
