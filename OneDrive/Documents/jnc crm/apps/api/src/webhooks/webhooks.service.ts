/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import {
  Injectable,
  Logger,
  UnauthorizedException,
  NotFoundException,
  ServiceUnavailableException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { LeadsService } from '../leads/leads.service';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import { sanitizeHtml, stripAllHtml } from '../common/html-sanitize.util';
import {
  DEFAULT_WEB_FORM_FIELDS,
  WebFormSettingsData,
  getFallbackWebFormSettings,
} from '../settings/web-form-settings.util';
import { parseExactOrigin } from '../common/public-cors';

function stripHtml(val?: any): string | undefined {
  if (val === null || val === undefined) return undefined;
  if (typeof val !== 'string') return String(val);
  return stripAllHtml(val);
}


@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private static webhookKeyCache = new Map<string, string>();

  constructor(
    private leadsService: LeadsService,
    private prisma: PrismaService,
  ) {}

  /**
   * Find active tenant by matching provided plain webhook key (via SHA-256 hash)
   * or direct hash match.
   * Returns 404 if not found or inactive.
   */
  async findTenantByWebhookKey(plainKey: string) {
    if (!plainKey || typeof plainKey !== 'string') {
      throw new NotFoundException('Webhook key not provided.');
    }

    const trimmedKey = plainKey.trim();
    const keyHash = crypto.createHash('sha256').update(trimmedKey).digest('hex');

    const tenant = await this.prisma.tenant.findFirst({
      where: {
        OR: [
          { webhookKeyHash: keyHash },
          { webhookKeyHash: trimmedKey },
        ],
      } as any,
    });

    if (!tenant || tenant.deletedAt !== null || tenant.status !== 'active') {
      throw new NotFoundException('Webhook key not recognized or organization workspace is inactive.');
    }

    return tenant;
  }

  /**
   * Regenerate plain webhook key for tenant, store key in DB, and return plain key
   */
  async regenerateWebhookKey(tenantId: string) {
    const plainKey = 'whk_' + crypto.randomBytes(24).toString('hex');

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { webhookKeyHash: plainKey } as any,
    });

    WebhooksService.webhookKeyCache.set(tenantId, plainKey);

    return {
      webhookKey: plainKey,
      message: 'Webhook key regenerated successfully. Store this key securely; it will not be displayed again.',
    };
  }

  /**
   * Get tenant webhook configuration and live ingestion statistics.
   * Auto-generates a key for the tenant if not yet set or if legacy non-whk hash.
   */
  async getTenantWebhookConfig(tenantId: string) {
    let tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, code: true, name: true, webhookKeyHash: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }

    let activeKey = WebhooksService.webhookKeyCache.get(tenantId);

    // Auto-generate key if not set or if legacy non-whk key
    if (!tenant.webhookKeyHash || !tenant.webhookKeyHash.startsWith('whk_')) {
      const generated = await this.regenerateWebhookKey(tenantId);
      activeKey = generated.webhookKey;
      tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, code: true, name: true, webhookKeyHash: true },
      });
    } else if (!activeKey) {
      activeKey = tenant.webhookKeyHash;
      WebhooksService.webhookKeyCache.set(tenantId, activeKey);
    }

    const [whatsappCount, indiamartCount, websiteCount, lastLead] = await Promise.all([
      this.prisma.lead.count({ where: { tenantId, source: { in: ['whatsapp', 'meta'] }, deletedAt: null } }),
      this.prisma.lead.count({ where: { tenantId, source: 'indiamart', deletedAt: null } }),
      this.prisma.lead.count({ where: { tenantId, source: 'web', deletedAt: null } }),
      this.prisma.lead.findFirst({
        where: { tenantId, source: { in: ['whatsapp', 'meta', 'indiamart', 'web'] }, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true, source: true, createdAt: true, customerName: true },
      }),
    ]);

    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN || 'crm_meta_verify_secret_2026';

    return {
      hasWebhookKey: !!tenant?.webhookKeyHash,
      webhookKey: activeKey,
      verifyToken,
      tenantCode: tenant?.code,
      tenantName: tenant?.name,
      isWhatsAppConfigured: Boolean(process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN),
      isIndiaMartConfigured: Boolean(process.env.INDIAMART_WEBHOOK_SECRET),
      stats: {
        whatsappCount,
        indiamartCount,
        websiteCount,
        lastLeadAt: lastLead?.createdAt || null,
        lastLeadSource: lastLead?.source || null,
        lastLeadName: lastLead?.customerName || null,
      },
    };
  }

  /**
   * Resolve pinned tenant for deprecated legacy unkeyed webhook routes.
   * Pinned strictly to LEGACY_WEBHOOK_TENANT_CODE or first internal tenant.
   * Never searches leads across tenants.
   */
  async getLegacyWebhookTenant(): Promise<{ id: string; code: string; name: string }> {
    const legacyCode = process.env.LEGACY_WEBHOOK_TENANT_CODE;
    if (legacyCode && legacyCode.trim()) {
      const tenant = await this.prisma.tenant.findFirst({
        where: {
          code: { equals: legacyCode.trim(), mode: 'insensitive' },
          deletedAt: null,
        },
        select: { id: true, code: true, name: true },
      });
      if (tenant) return tenant;
    }

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

    throw new NotFoundException('No active organization found to process incoming webhook.');
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
          customerPhone: customerPhone || '',
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
   * Process inbound Meta / WhatsApp payload with idempotency
   */
  async processMetaOrWhatsAppLead(payload: any, tenantId: string, defaultSource: 'meta' | 'whatsapp' = 'meta') {
    this.logger.log(`Received ${defaultSource} inbound webhook payload for tenant ${tenantId}: ${JSON.stringify(payload)}`);

    let customerPhone = '';
    let customerName = '';
    let customerEmail = '';
    let queryMessage = '';
    let messageId = '';
    let leadSource = defaultSource;

    // 1. Meta Webhook format (WhatsApp or Lead Ads)
    if (payload?.entry && payload.entry[0]?.changes && payload.entry[0]?.changes[0]?.value) {
      const change = payload.entry[0].changes[0];
      const value = change.value;

      if (change.field === 'leadgen' || value.leadgen_id) {
        leadSource = 'meta';
        messageId = String(value.leadgen_id || payload.entry[0].id || '');
        customerName = value.name || value.full_name || 'Meta Lead Ads Prospect';
        customerPhone = value.phone_number || value.phone || '';
        customerEmail = value.email || '';
        queryMessage = `Inquiry via Facebook/Instagram Lead Ad (Form ID: ${value.form_id || 'N/A'}, Page ID: ${value.page_id || 'N/A'})`;
      } else {
        leadSource = 'whatsapp';
        const contact = value.contacts?.[0];
        const message = value.messages?.[0];
        customerPhone = contact?.wa_id || message?.from || '';
        customerName = contact?.profile?.name || 'WhatsApp Customer';
        queryMessage = message?.text?.body || message?.caption || 'Inbound WhatsApp Inquiry';
        messageId = message?.id || '';
      }
    } 
    // 2. Direct / BSP / Sample payload format
    else {
      customerPhone = payload.customerPhone || payload.phone || payload.mobile || payload.waId || payload.sender || payload.from || '';
      customerName = payload.customerName || payload.name || payload.senderName || (defaultSource === 'whatsapp' ? 'WhatsApp Prospect' : 'Meta Lead Prospect');
      customerEmail = payload.customerEmail || payload.email || '';
      queryMessage = payload.queryMessage || payload.message || payload.text || `Inbound inquiry via ${defaultSource.toUpperCase()}`;
      messageId = String(payload.messageId || payload.id || payload.leadgen_id || '');
      if (payload.source) leadSource = payload.source;
    }

    if (!customerPhone) customerPhone = '';
    if (!customerName) customerName = leadSource === 'whatsapp' ? 'WhatsApp Lead' : 'Meta Lead';
    if (!queryMessage) queryMessage = `Inbound lead captured via ${leadSource}`;

    // Natural Idempotency Check
    if (messageId) {
      const existing = await this.prisma.lead.findFirst({
        where: {
          tenantId,
          rawPayload: { contains: messageId },
          deletedAt: null,
        },
      });
      if (existing) {
        this.logger.log(`${leadSource} redelivery ignored for messageId=${messageId}. Existing lead: ${existing.leadNumber}`);
        return { isDuplicate: true, lead: existing };
      }
    }

    try {
      const lead = await this.leadsService.createLead(
        {
          customerName: stripHtml(customerName) || 'Inbound Lead',
          customerPhone: stripHtml(customerPhone),
          customerEmail: stripHtml(customerEmail),
          queryMessage: stripHtml(queryMessage),
          source: leadSource,
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

  async processWhatsAppLead(payload: any, tenantId: string) {
    return this.processMetaOrWhatsAppLead(payload, tenantId, 'whatsapp');
  }

  /**
   * Helper to retrieve tenant WebFormSettings (with graceful fallback store if table unmigrated)
   */
  async getWebFormSettingsForTenant(tenantId: string): Promise<WebFormSettingsData> {
    try {
      const record = await (this.prisma as any).webFormSettings?.findUnique({
        where: { tenantId },
      });
      if (record) {
        return {
          ...record,
          products: Array.isArray(record.products) ? record.products : JSON.parse(record.products || '[]'),
          fields: typeof record.fields === 'object' ? record.fields : JSON.parse(record.fields || '{}'),
          allowedOrigins: Array.isArray(record.allowedOrigins) ? record.allowedOrigins : JSON.parse(record.allowedOrigins || '[]'),
        };
      }
    } catch {}
    return getFallbackWebFormSettings(tenantId);
  }

  /**
   * Process inbound website contact / RFQ form submission
   * Strictly tenant-scoped: NO default fallback, NO invented fake phone/name/product.
   * Enforces origin validation, honeypot detection, required field checks, and idempotency.
   */
  async processWebsiteLead(payload: any, tenantId: string, req?: any) {
    this.logger.log(`Received Website form submission for tenant ${tenantId}`);

    // 1. Fetch tenant form configuration
    const settings = await this.getWebFormSettingsForTenant(tenantId);
    if (!settings.isEnabled) {
      throw new NotFoundException('This form is not available');
    }

    // 2. Origin check: compare exact origins (scheme, host, port)
    const allowedOrigins = (settings.allowedOrigins || [])
      .map((o) => parseExactOrigin(o))
      .filter((o): o is string => Boolean(o));

    const reqOrigin = (req?.headers?.origin || '').toString().trim();
    if (reqOrigin) {
      const incomingOrigin = parseExactOrigin(reqOrigin);
      const isAllowed = incomingOrigin && allowedOrigins.length > 0 && allowedOrigins.includes(incomingOrigin);
      if (!isAllowed) {
        this.logger.warn(`Website lead rejected for tenant ${tenantId}: Origin '${reqOrigin}' is not allowed`);
        throw new ForbiddenException('Origin not permitted by form configuration.');
      }
    }

    // 3. Honeypot check: silently drop bot submissions
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

    // 4. Clean inputs with stripAllHtml (no invented defaults!)
    const customerName = stripAllHtml(payload.name || payload.customerName || '').trim();
    const customerPhone = stripAllHtml(payload.phone || payload.customerPhone || '').trim();
    const customerEmail = stripAllHtml(payload.email || payload.customerEmail || '').trim();
    const companyName = stripAllHtml(payload.company || payload.companyName || '').trim();
    const city = stripAllHtml(payload.city || '').trim();
    const productName = stripAllHtml(payload.product || payload.productName || payload.productCategory || payload.category || '').trim();
    const queryMessage = stripAllHtml(payload.message || payload.queryMessage || payload.notes || '').trim();

    // 5. Enforce required fields based on tenant's fields configuration
    const fields = settings.fields || DEFAULT_WEB_FORM_FIELDS;
    if (fields.name?.required && !customerName) {
      throw new BadRequestException('Name is required.');
    }
    if (fields.phone?.required && !customerPhone) {
      throw new BadRequestException('Phone number is required.');
    }
    if (fields.email?.required && !customerEmail) {
      throw new BadRequestException('Email address is required.');
    }
    if (fields.company?.required && !companyName) {
      throw new BadRequestException('Company name is required.');
    }
    if (fields.city?.required && !city) {
      throw new BadRequestException('City is required.');
    }
    if (fields.product?.required && !productName) {
      throw new BadRequestException('Product selection is required.');
    }
    if (fields.message?.required && !queryMessage) {
      throw new BadRequestException('Message is required.');
    }

    // 6. Natural Idempotency check
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

    // 7. Duplicate phone check within tenant
    if (customerPhone) {
      const normPhone = customerPhone.replace(/[^0-9]/g, '').slice(-10);
      if (normPhone.length >= 7) {
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
                description: `Product: ${productName || 'None'}, Note: ${queryMessage || 'None'}`,
              },
            });
          } catch {}
          return { isBot: false, isDuplicate: true, lead: existing };
        }
      }
    }

    // 8. Create lead in database strictly under tenantId
    const lead = await this.leadsService.createLead(
      {
        customerName: customerName || 'Website Visitor',
        customerPhone: customerPhone || '',
        customerEmail: customerEmail || undefined,
        companyName: companyName || undefined,
        city: city || undefined,
        productName: productName || undefined,
        productCategory: productName || 'Website Inquiry',
        quantity: payload.quantity ? Number(payload.quantity) : 1,
        estimatedValue: payload.estimatedValue ? Number(payload.estimatedValue) : 0,
        queryMessage: queryMessage || (productName ? `Inquiry for ${productName}` : 'Website contact submission'),
        source: 'web',
        rawPayload: JSON.stringify(payload),
      },
      { tenantId, role: 'admin', employeeCode: 'WEB_FORM' } as any,
    );

    return { isBot: false, isDuplicate: false, lead };
  }

  /**
   * Public endpoint to fetch tenant-configured web-to-lead form settings
   * MUST require a valid tenant key. Returns 404 if no key, invalid key, or form disabled.
   * NEVER returns internal IDs, keys, or fallback company data.
   */
  async getInquiryInfo(key?: string) {
    if (!key || typeof key !== 'string' || !key.trim()) {
      throw new NotFoundException('This form is not available');
    }

    const tenant = await this.findTenantByWebhookKey(key.trim());
    const settings = await this.getWebFormSettingsForTenant(tenant.id);

    if (!settings || !settings.isEnabled) {
      throw new NotFoundException('This form is not available');
    }

    return {
      companyName: tenant.name,
      logoUrl: settings.logoUrl || tenant.logoUrl || '',
      phone: tenant.phone || '',
      email: tenant.email || '',
      website: tenant.website || '',
      brandColor: settings.brandColor || '#2563eb',
      headline: settings.headline || 'Request a Quote',
      description: settings.description || '',
      submitButtonText: settings.submitButtonText || 'Submit Inquiry',
      thankYouTitle: settings.thankYouTitle || 'Thank You!',
      thankYouMessage: settings.thankYouMessage || 'Your inquiry has been received. Our team will contact you soon.',
      redirectUrl: settings.redirectUrl || null,
      products: Array.isArray(settings.products) ? settings.products : [],
      fields: settings.fields || DEFAULT_WEB_FORM_FIELDS,
      allowedOrigins: Array.isArray(settings.allowedOrigins) ? settings.allowedOrigins : [],
      isEnabled: true,
    };
  }
}

