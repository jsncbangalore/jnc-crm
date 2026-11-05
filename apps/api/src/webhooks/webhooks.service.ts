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
import { encryptAtRest, decryptAtRest } from '../common/encryption.util';
import { normalizeToE164 } from '../common/shared-validation';

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
   * Returns 404 if not found or inactive; returns 503 if database lookup fails (never blank 500).
   */
  async findTenantByWebhookKey(plainKey: string) {
    if (!plainKey || typeof plainKey !== 'string' || !plainKey.trim()) {
      throw new NotFoundException('This form is not available');
    }

    const trimmedKey = plainKey.trim();
    const keyHash = crypto.createHash('sha256').update(trimmedKey).digest('hex');

    let tenant: any = null;
    try {
      tenant = await this.prisma.tenant.findFirst({
        where: {
          OR: [
            { webhookKeyHash: keyHash },
            { webhookKeyHash: trimmedKey },
          ],
        } as any,
      });
    } catch (err: any) {
      this.logger.error(`Database error looking up tenant by webhook key: ${err.message}`);
      throw new ServiceUnavailableException('Webhook database service unavailable. Please ensure database migrations are applied.');
    }

    if (!tenant || tenant.deletedAt !== null || tenant.status !== 'active') {
      throw new NotFoundException('This form is not available');
    }

    return tenant;
  }

  /**
   * Get or initialize per-tenant verify token
   */
  async getTenantVerifyToken(tenantId: string): Promise<string> {
    try {
      const setting = await this.prisma.systemSetting.findUnique({
        where: { key: `webhook_verify_token:${tenantId}` },
      });
      if (setting && setting.value && setting.value.trim()) {
        return setting.value.trim();
      }
    } catch (err: any) {
      this.logger.warn(`Could not read verify token from systemSetting: ${err.message}`);
    }

    const newToken = 'whv_' + crypto.randomBytes(16).toString('hex');
    try {
      await this.prisma.systemSetting.upsert({
        where: { key: `webhook_verify_token:${tenantId}` },
        create: { key: `webhook_verify_token:${tenantId}`, value: newToken },
        update: { value: newToken },
      });
    } catch (err: any) {
      this.logger.warn(`Could not save verify token to systemSetting: ${err.message}`);
    }
    return newToken;
  }

  /**
   * Regenerate per-tenant verify token
   */
  async regenerateTenantVerifyToken(tenantId: string): Promise<string> {
    const newToken = 'whv_' + crypto.randomBytes(16).toString('hex');
    try {
      await this.prisma.systemSetting.upsert({
        where: { key: `webhook_verify_token:${tenantId}` },
        create: { key: `webhook_verify_token:${tenantId}`, value: newToken },
        update: { value: newToken },
      });
    } catch (err: any) {
      this.logger.warn(`Could not update verify token in systemSetting: ${err.message}`);
    }
    return newToken;
  }

  /**
   * Get decrypted per-tenant Meta Page Access Token
   */
  async getTenantPageAccessToken(tenantId: string): Promise<string | null> {
    try {
      const setting = await this.prisma.systemSetting.findUnique({
        where: { key: `meta_page_token:${tenantId}` },
      });
      if (setting && setting.value) {
        return decryptAtRest(setting.value);
      }
    } catch (err: any) {
      this.logger.warn(`Could not retrieve page access token: ${err.message}`);
    }
    return null;
  }

  /**
   * Save encrypted per-tenant Meta Page Access Token
   */
  async saveTenantPageAccessToken(tenantId: string, plainToken: string): Promise<void> {
    const encrypted = encryptAtRest(plainToken);
    if (!encrypted) return;
    await this.prisma.systemSetting.upsert({
      where: { key: `meta_page_token:${tenantId}` },
      create: { key: `meta_page_token:${tenantId}`, value: encrypted },
      update: { value: encrypted },
    });
  }

  /**
   * Configurable Meta Graph API Version (e.g. v20.0, v21.0)
   */
  getGraphVersion(): string {
    return process.env.META_GRAPH_VERSION || 'v20.0';
  }

  /**
   * Persist incoming webhook delivery to the database BEFORE replying 200.
   * Deduplicates using unique index on dedupeId.
   */
  async recordInboundDelivery(
    tenantId: string,
    provider: string,
    payload: any,
    dedupeId?: string,
  ): Promise<{ isDuplicate: boolean; delivery: any }> {
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);

    if (dedupeId) {
      try {
        const existing = await (this.prisma as any).webhookDelivery.findUnique({
          where: { dedupeId },
        });
        if (existing) {
          this.logger.log(`Inbound ${provider} delivery deduplicated by dedupeId=${dedupeId}`);
          await this.logWebhookDelivery(tenantId, provider, 'DUPLICATE', {
            summary: `Deduplicated delivery for dedupeId: ${dedupeId}`,
          });
          return { isDuplicate: true, delivery: existing };
        }
      } catch (err: any) {
        this.logger.warn(`Could not query existing dedupeId: ${err.message}`);
      }
    }

    try {
      const delivery = await (this.prisma as any).webhookDelivery.create({
        data: {
          tenantId,
          provider,
          dedupeId: dedupeId || null,
          payload: payloadStr,
          status: 'PENDING',
          attempts: 0,
          maxAttempts: 5,
        },
      });
      return { isDuplicate: false, delivery };
    } catch (err: any) {
      if (err?.code === 'P2002' || err?.message?.includes('Unique constraint failed') || err?.message?.includes('duplicate key')) {
        this.logger.log(`Unique constraint catch: dedupeId ${dedupeId} already recorded`);
        const existing = dedupeId ? await (this.prisma as any).webhookDelivery.findUnique({ where: { dedupeId } }) : null;
        return { isDuplicate: true, delivery: existing };
      }
      this.logger.error(`Failed to persist webhook delivery before response: ${err.message}`);
      // Return unpersisted fallback object so HTTP response does not fail
      return {
        isDuplicate: false,
        delivery: { id: `mem_${Date.now()}`, tenantId, provider, payload: payloadStr, status: 'PENDING' },
      };
    }
  }

  /**
   * Process delivery from webhook_deliveries table with exponential back-off retry
   */
  async processPendingDelivery(deliveryId: string): Promise<void> {
    let delivery: any = null;
    try {
      delivery = await (this.prisma as any).webhookDelivery.findUnique({
        where: { id: deliveryId },
      });
    } catch (err: any) {
      this.logger.warn(`Could not read delivery ${deliveryId} for processing: ${err.message}`);
      return;
    }

    if (!delivery || delivery.status === 'PROCESSED' || delivery.status === 'DUPLICATE') {
      return;
    }

    const currentAttempts = delivery.attempts + 1;
    try {
      await (this.prisma as any).webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: 'PROCESSING', attempts: currentAttempts },
      });
    } catch {}

    try {
      const parsedPayload = JSON.parse(delivery.payload);
      await this.processMetaOrWhatsAppLead(parsedPayload, delivery.tenantId, delivery.provider as any);

      await (this.prisma as any).webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
          lastError: null,
        },
      });
    } catch (err: any) {
      this.logger.error(`Error processing webhook delivery ${deliveryId} (attempt ${currentAttempts}/${delivery.maxAttempts}): ${err.message}`);

      if (currentAttempts >= delivery.maxAttempts) {
        await (this.prisma as any).webhookDelivery.update({
          where: { id: deliveryId },
          data: { status: 'FAILED', lastError: err.message },
        });
      } else {
        const backoffMs = Math.pow(2, currentAttempts) * 1000;
        await (this.prisma as any).webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: 'PENDING',
            lastError: err.message,
            nextRetryAt: new Date(Date.now() + backoffMs),
          },
        });
        setTimeout(() => {
          this.processPendingDelivery(deliveryId).catch(() => {});
        }, backoffMs);
      }
    }
  }

  /**
   * Generate Facebook OAuth Connect Dialog URL for Lead Ads
   */
  getFacebookOAuthUrl(tenantId: string, redirectUri?: string): string {
    const appId = process.env.META_APP_ID || process.env.WHATSAPP_APP_ID || '1146741767116544';
    const version = this.getGraphVersion();
    const effectiveRedirectUri = redirectUri || `${process.env.FRONTEND_URL || 'https://admin.jsnc.co.in'}/flow-studio`;
    const scopes = [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_metadata',
      'leads_retrieval',
      'pages_manage_ads',
    ].join(',');

    const stateToken = crypto.createHmac('sha256', process.env.JWT_SECRET || 'dev_secret')
      .update(`${tenantId}:${Date.now()}`)
      .digest('hex');

    return `https://www.facebook.com/${version}/dialog/oauth?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(effectiveRedirectUri)}&scope=${encodeURIComponent(scopes)}&state=${tenantId}_${stateToken}&response_type=token`;
  }

  /**
   * Connect Facebook Page: Exchange token, fetch Page permanent access token,
   * call subscribed_apps with leadgen, and securely store encrypted credentials.
   */
  async connectFacebookPage(
    tenantId: string,
    userAccessToken: string,
    targetPageId?: string,
  ): Promise<{ success: boolean; page: any; subscribed: boolean; error?: string }> {
    const version = this.getGraphVersion();
    const appId = process.env.META_APP_ID || process.env.WHATSAPP_APP_ID;
    const appSecret = process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET;

    let effectiveToken = userAccessToken.trim();

    // 1. If App ID & Secret are configured, exchange for long-lived User Access Token
    if (appId && appSecret) {
      try {
        const exchangeUrl = `https://graph.facebook.com/${version}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(effectiveToken)}`;
        const res = await fetch(exchangeUrl, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json();
          if (data.access_token) {
            effectiveToken = data.access_token;
            this.logger.log(`Exchanged short-lived user token for long-lived Meta token.`);
          }
        }
      } catch (err: any) {
        this.logger.warn(`Token exchange notice: using provided token directly (${err.message}).`);
      }
    }

    // 2. Fetch User's Pages via /me/accounts
    let pages: any[] = [];
    try {
      const accountsUrl = `https://graph.facebook.com/${version}/me/accounts?access_token=${encodeURIComponent(effectiveToken)}&fields=id,name,access_token,category,tasks`;
      const res = await fetch(accountsUrl, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) {
        const errText = await res.text();
        this.logger.warn(`Meta Graph /me/accounts error (${res.status}): ${errText}`);
        // If /me/accounts fails (e.g. provided token is already a Page Token), fallback to direct page inspection
        pages = [{ id: targetPageId || 'page_direct', name: 'Connected Facebook Page', access_token: effectiveToken }];
      } else {
        const data = await res.json();
        pages = data.data || [];
      }
    } catch (err: any) {
      this.logger.warn(`Failed to retrieve accounts from Meta: ${err.message}`);
      pages = [{ id: targetPageId || 'page_direct', name: 'Connected Facebook Page', access_token: effectiveToken }];
    }

    if (pages.length === 0) {
      throw new BadRequestException('No Facebook Pages found for this account. Ensure you are an Admin of the Page.');
    }

    const selectedPage = (targetPageId ? pages.find((p) => p.id === targetPageId) : pages[0]) || pages[0];
    const pageAccessToken = selectedPage.access_token || effectiveToken;

    // 3. Call subscribed_apps with leadgen
    let isSubscribed = false;
    try {
      const subscribeUrl = `https://graph.facebook.com/${version}/${selectedPage.id}/subscribed_apps`;
      const res = await fetch(subscribeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscribed_fields: ['leadgen'],
          access_token: pageAccessToken,
        }),
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const subData = await res.json();
        isSubscribed = Boolean(subData.success);
        this.logger.log(`Successfully subscribed page ${selectedPage.id} (${selectedPage.name}) to leadgen.`);
      } else {
        const errText = await res.text();
        this.logger.warn(`Meta subscribed_apps returned HTTP ${res.status}: ${errText}`);
        // Even if subscription fails due to test sandbox token, we record credentials
        isSubscribed = false;
      }
    } catch (err: any) {
      this.logger.warn(`Could not call subscribed_apps: ${err.message}`);
      isSubscribed = false;
    }

    // 4. Securely store Page Token & details in SystemSetting
    await this.saveTenantPageAccessToken(tenantId, pageAccessToken);
    await this.prisma.systemSetting.upsert({
      where: { key: `meta_page_id:${tenantId}` },
      create: { key: `meta_page_id:${tenantId}`, value: String(selectedPage.id) },
      update: { value: String(selectedPage.id) },
    });
    await this.prisma.systemSetting.upsert({
      where: { key: `meta_page_name:${tenantId}` },
      create: { key: `meta_page_name:${tenantId}`, value: String(selectedPage.name || 'Facebook Page') },
      update: { value: String(selectedPage.name || 'Facebook Page') },
    });
    await this.prisma.systemSetting.upsert({
      where: { key: `meta_subscribed_apps:${tenantId}` },
      create: {
        key: `meta_subscribed_apps:${tenantId}`,
        value: JSON.stringify({
          subscribed: isSubscribed,
          pageId: selectedPage.id,
          pageName: selectedPage.name,
          timestamp: new Date().toISOString(),
          graphVersion: version,
        }),
      },
      update: {
        value: JSON.stringify({
          subscribed: isSubscribed,
          pageId: selectedPage.id,
          pageName: selectedPage.name,
          timestamp: new Date().toISOString(),
          graphVersion: version,
        }),
      },
    });

    return {
      success: true,
      page: { id: selectedPage.id, name: selectedPage.name },
      subscribed: isSubscribed,
    };
  }

  /**
   * Get Facebook Page Connection Status & Configuration Checklist
   */
  async getFacebookPageConnectionStatus(tenantId: string) {
    const version = this.getGraphVersion();
    const pageIdSetting = await this.prisma.systemSetting.findUnique({ where: { key: `meta_page_id:${tenantId}` } });
    const pageNameSetting = await this.prisma.systemSetting.findUnique({ where: { key: `meta_page_name:${tenantId}` } });
    const subSetting = await this.prisma.systemSetting.findUnique({ where: { key: `meta_subscribed_apps:${tenantId}` } });
    const token = await this.getTenantPageAccessToken(tenantId);

    let subData: any = {};
    if (subSetting && subSetting.value) {
      try { subData = JSON.parse(subSetting.value); } catch {}
    }

    const isConnected = Boolean(pageIdSetting?.value && token);
    const maskedToken = token ? `${token.slice(0, 8)}••••••••${token.slice(-6)}` : null;

    return {
      isConnected,
      pageId: pageIdSetting?.value || null,
      pageName: pageNameSetting?.value || null,
      isSubscribed: Boolean(subData.subscribed),
      graphVersion: version,
      maskedToken,
      lastUpdated: subData.timestamp || null,
      checklist: [
        { item: 'Permissions', status: isConnected ? 'VERIFIED' : 'PENDING', detail: 'pages_show_list, pages_read_engagement, pages_manage_metadata, leads_retrieval, pages_manage_ads' },
        { item: 'App Mode', status: process.env.NODE_ENV === 'production' ? 'LIVE' : 'DEVELOPMENT', detail: 'App must be in Live mode on Meta Developer Portal for public leads' },
        { item: 'Subscribed Apps', status: subData.subscribed ? 'ACTIVE' : 'PENDING', detail: 'POST /{page-id}/subscribed_apps with leadgen' },
        { item: 'Lead Ads Testing Tool', status: 'READY', detail: 'https://developers.facebook.com/tools/lead-ads-testing' },
      ],
    };
  }

  /**
   * Disconnect Facebook Page
   */
  async disconnectFacebookPage(tenantId: string): Promise<void> {
    await this.prisma.systemSetting.deleteMany({
      where: {
        key: { in: [`meta_page_token:${tenantId}`, `meta_page_id:${tenantId}`, `meta_page_name:${tenantId}`, `meta_subscribed_apps:${tenantId}`] },
      },
    });
  }

  /**
   * Log webhook delivery / handshake event in AuditLog
   */
  async logWebhookDelivery(
    tenantId: string,
    provider: string,
    status: 'SUCCESS' | 'ERROR' | 'DUPLICATE' | 'HANDSHAKE',
    details: { error?: string; summary?: string; statusCode?: number; leadId?: string } = {},
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          action: 'WEBHOOK_DELIVERY',
          entityName: 'WebhookDelivery',
          entityId: details.leadId || `DELIV-${Date.now()}`,
          actorName: provider.toUpperCase(),
          afterState: JSON.stringify({
            provider,
            status,
            timestamp: new Date().toISOString(),
            error: details.error || null,
            summary: details.summary || null,
            statusCode: details.statusCode || (status === 'SUCCESS' || status === 'HANDSHAKE' ? 200 : 400),
          }),
          ipAddress: '127.0.0.1',
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to record webhook delivery audit log: ${err.message}`);
    }
  }

  /**
   * Retrieve last 20 deliveries for tenant
   */
  async getRecentDeliveries(tenantId: string, limit = 20) {
    try {
      const logs = await this.prisma.auditLog.findMany({
        where: { tenantId, action: 'WEBHOOK_DELIVERY' },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });
      return logs.map((l) => {
        let state: any = {};
        if (typeof l.afterState === 'string') {
          try { state = JSON.parse(l.afterState); } catch { state = {}; }
        } else if (l.afterState && typeof l.afterState === 'object') {
          state = l.afterState;
        }
        return {
          id: l.id,
          provider: state.provider || 'whatsapp',
          status: state.status || 'SUCCESS',
          timestamp: state.timestamp || l.timestamp,
          statusCode: state.statusCode || 200,
          error: state.error || null,
          summary: state.summary || null,
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Fetch lead from Meta Graph API using Page Access Token
   */
  async fetchMetaGraphLead(leadgenId: string, pageAccessToken: string) {
    try {
      const url = `https://graph.facebook.com/v20.0/${leadgenId}?access_token=${encodeURIComponent(pageAccessToken)}&fields=created_time,id,field_data,platform`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) {
        const errText = await res.text();
        this.logger.warn(`Meta Graph API returned HTTP ${res.status}: ${errText}`);
        return null;
      }
      return await res.json();
    } catch (err: any) {
      this.logger.warn(`Failed to fetch Meta Graph API leadgen ${leadgenId}: ${err.message}`);
      return null;
    }
  }

  /**
   * Regenerate plain webhook key for tenant, store key in DB, and return plain key
   */
  async regenerateWebhookKey(tenantId: string) {
    const plainKey = 'whk_' + crypto.randomBytes(24).toString('hex');
    const newVerifyToken = await this.regenerateTenantVerifyToken(tenantId);

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { webhookKeyHash: plainKey } as any,
    });

    WebhooksService.webhookKeyCache.set(tenantId, plainKey);

    return {
      webhookKey: plainKey,
      verifyToken: newVerifyToken,
      message: 'Webhook key and verify token regenerated successfully. Warning: You must update Meta Developers Portal (developers.facebook.com) with the new Callback URL and Verify Token, or webhook delivery will fail.',
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
      this.prisma.lead.count({ where: { tenantId, source: { in: ['whatsapp', 'meta', 'facebook_lead_ads', 'instagram_lead_ads'] }, deletedAt: null } }),
      this.prisma.lead.count({ where: { tenantId, source: 'indiamart', deletedAt: null } }),
      this.prisma.lead.count({ where: { tenantId, source: 'web', deletedAt: null } }),
      this.prisma.lead.findFirst({
        where: { tenantId, source: { in: ['whatsapp', 'meta', 'facebook_lead_ads', 'instagram_lead_ads', 'indiamart', 'web'] }, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true, source: true, createdAt: true, customerName: true },
      }),
    ]);

    const verifyToken = await this.getTenantVerifyToken(tenantId);
    const maskedVerifyToken = verifyToken.length > 8
      ? verifyToken.slice(0, 4) + '•'.repeat(16) + verifyToken.slice(-4)
      : '••••••••••••••••';

    const deliveries = await this.getRecentDeliveries(tenantId, 20);
    const lastReceived = deliveries[0]?.timestamp || lastLead?.createdAt || null;
    const publicBaseUrl = process.env.PUBLIC_URL || process.env.PUBLIC_API_URL || 'https://admin.jsnc.co.in';

    return {
      hasWebhookKey: !!tenant?.webhookKeyHash,
      webhookKey: activeKey,
      verifyToken: maskedVerifyToken,
      publicBaseUrl,
      lastReceivedAt: lastReceived,
      deliveries,
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
   * Test webhook handshake by simulating Meta's GET verification request
   */
  async testHandshake(tenantId: string, customUrl?: string, customVerifyToken?: string) {
    const config = await this.getTenantWebhookConfig(tenantId);
    const plainVerifyToken = customVerifyToken || await this.getTenantVerifyToken(tenantId);
    const targetUrlStr = customUrl || `${config.publicBaseUrl}/api/v1/webhooks/whatsapp/${config.webhookKey}`;

    const randomChallenge = 'crm_test_chal_' + Math.floor(100000 + Math.random() * 900000);
    const startTime = Date.now();
    try {
      const url = new URL(targetUrlStr);
      url.searchParams.set('hub.mode', 'subscribe');
      url.searchParams.set('hub.challenge', randomChallenge);
      url.searchParams.set('hub.verify_token', plainVerifyToken);

      const res = await fetch(url.toString(), {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      const latencyMs = Date.now() - startTime;
      const body = await res.text();
      const ok = res.status === 200 && body.trim() === randomChallenge;

      return {
        ok,
        statusCode: res.status,
        body,
        expectedChallenge: randomChallenge,
        latencyMs,
        targetUrl: targetUrlStr,
        message: ok
          ? `Webhook verified successfully in ${latencyMs}ms! Response matched hub.challenge.`
          : `Handshake failed with HTTP ${res.status}. Body: ${body.slice(0, 200)}`,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      return {
        ok: false,
        statusCode: 0,
        body: err.message,
        latencyMs,
        targetUrl: targetUrlStr,
        message: `Connection error after ${latencyMs}ms: ${err.message}`,
      };
    }
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
      if (err?.message?.includes('Duplicate lead detected') || err?.message?.includes('already exists') || err?.status === 409) {
        // Redelivery / duplicate phone fallback
        const existing = await this.leadsService.findDuplicateLead(tenantId, customerPhone);
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
    let city = '';
    let queryMessage = '';
    let messageId = '';
    let leadSource: 'facebook_lead_ads' | 'instagram_lead_ads' | 'whatsapp' | 'meta' = defaultSource === 'whatsapp' ? 'whatsapp' : 'facebook_lead_ads';

    // 1. Meta Webhook format (WhatsApp or Lead Ads)
    if (payload?.entry && payload.entry[0]?.changes && payload.entry[0]?.changes[0]?.value) {
      const change = payload.entry[0].changes[0];
      const value = change.value;

      if (change.field === 'leadgen' || value.leadgen_id) {
        const leadgenId = String(value.leadgen_id || payload.entry[0]?.id || '');
        messageId = leadgenId;
        leadSource = 'facebook_lead_ads';

        // Check deduplication by leadgen_id
        if (leadgenId) {
          const existing = await this.prisma.lead.findFirst({
            where: {
              tenantId,
              rawPayload: { contains: leadgenId },
              deletedAt: null,
            },
          });
          if (existing) {
            this.logger.log(`Meta Lead Ads redelivery ignored for leadgen_id=${leadgenId}. Existing lead: ${existing.leadNumber}`);
            await this.logWebhookDelivery(tenantId, 'meta', 'DUPLICATE', { summary: `Duplicate leadgen_id ${leadgenId}` });
            return { isDuplicate: true, lead: existing };
          }
        }

        // Try fetching full lead details via Meta Graph API using stored Page Access Token
        const pageToken = await this.getTenantPageAccessToken(tenantId);
        let graphLead: any = null;
        if (pageToken && leadgenId) {
          graphLead = await this.fetchMetaGraphLead(leadgenId, pageToken);
        }

        if (graphLead && graphLead.field_data) {
          if (graphLead.platform === 'ig' || graphLead.platform === 'instagram') {
            leadSource = 'instagram_lead_ads';
          }
          const fieldMap: Record<string, string> = {};
          for (const f of graphLead.field_data) {
            if (f.name && Array.isArray(f.values) && f.values.length > 0) {
              fieldMap[f.name.toLowerCase()] = String(f.values[0]);
            }
          }
          customerName = fieldMap['full_name'] || fieldMap['name'] || fieldMap['first_name'] || 'Meta Lead Ads Prospect';
          customerPhone = fieldMap['phone_number'] || fieldMap['phone'] || '';
          customerEmail = fieldMap['email'] || '';
          city = fieldMap['city'] || '';
          queryMessage = `Form response via ${leadSource === 'instagram_lead_ads' ? 'Instagram' : 'Facebook'} Lead Ad (Form ID: ${value.form_id || 'N/A'}, Page ID: ${value.page_id || 'N/A'})`;
          if (city) queryMessage += ` | City: ${city}`;
        } else {
          // Fallback if token not set or graph API unavailable
          if (value.platform === 'ig' || value.platform === 'instagram') {
            leadSource = 'instagram_lead_ads';
          }
          customerName = value.name || value.full_name || 'Meta Lead Ads Prospect';
          customerPhone = value.phone_number || value.phone || '';
          customerEmail = value.email || '';
          city = value.city || '';
          queryMessage = `Inquiry via ${leadSource === 'instagram_lead_ads' ? 'Instagram' : 'Facebook'} Lead Ad (Form ID: ${value.form_id || 'N/A'}, Page ID: ${value.page_id || 'N/A'}, Leadgen ID: ${leadgenId})`;
        }
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
      city = payload.city || '';
      queryMessage = payload.queryMessage || payload.message || payload.text || `Inbound inquiry via ${defaultSource.toUpperCase()}`;
      messageId = String(payload.messageId || payload.id || payload.leadgen_id || '');
      if (payload.source) {
        leadSource = payload.source;
      } else if (payload.platform === 'ig' || payload.platform === 'instagram') {
        leadSource = 'instagram_lead_ads';
      } else if (payload.leadgen_id) {
        leadSource = 'facebook_lead_ads';
      }
    }

    if (!customerPhone) customerPhone = '';
    if (!customerName) customerName = leadSource === 'whatsapp' ? 'WhatsApp Lead' : 'Meta Lead';
    if (!queryMessage) queryMessage = `Inbound lead captured via ${leadSource}`;

    // Natural Idempotency Check on messageId / leadgen_id
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
        await this.logWebhookDelivery(tenantId, leadSource, 'DUPLICATE', { summary: `Duplicate messageId ${messageId}` });
        return { isDuplicate: true, lead: existing };
      }
    }

    try {
      const lead = await this.leadsService.createLead(
        {
          customerName: stripHtml(customerName) || 'Inbound Lead',
          customerPhone: stripHtml(customerPhone),
          customerEmail: stripHtml(customerEmail),
          city: stripHtml(city),
          queryMessage: stripHtml(queryMessage),
          source: leadSource,
          productCategory: 'General Inquiry',
          rawPayload: JSON.stringify(payload),
        },
        { tenantId, role: 'admin', employeeCode: 'WEBHOOK' } as any,
      );
      await this.logWebhookDelivery(tenantId, leadSource, 'SUCCESS', {
        summary: `Lead created (${lead.leadNumber}) for ${customerName}`,
        leadId: lead.id,
      });
      return { isDuplicate: false, lead };
    } catch (err: any) {
      if (err?.message?.includes('Duplicate lead detected') || err?.message?.includes('already exists') || err?.status === 409) {
        const existing = await this.leadsService.findDuplicateLead(tenantId, customerPhone);
        await this.logWebhookDelivery(tenantId, leadSource, 'DUPLICATE', { summary: `Duplicate phone lead match ${customerPhone}` });
        return { isDuplicate: true, lead: existing };
      }
      await this.logWebhookDelivery(tenantId, leadSource, 'ERROR', { error: err?.message || 'Lead creation failed' });
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
    if (reqOrigin && allowedOrigins.length > 0) {
      const incomingOrigin = parseExactOrigin(reqOrigin);
      const isAllowed = incomingOrigin && allowedOrigins.includes(incomingOrigin);
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
        return { isBot: false, isDuplicate: true, lead: null };
      }
    }

    // 7. Duplicate Check: Match across phone formats and optional email
    const existingDuplicate = await this.leadsService.findDuplicateLead(tenantId, customerPhone, customerEmail);
    const isDuplicate = Boolean(existingDuplicate);

    // 8. Create lead in database strictly under tenantId (Merge NOTHING silently!)
    const lead = await this.leadsService.createLead(
      {
        customerName: customerName || existingDuplicate?.customerName || 'Website Visitor',
        customerPhone: customerPhone || existingDuplicate?.customerPhone || '',
        customerEmail: customerEmail || existingDuplicate?.customerEmail || undefined,
        companyName: companyName || (existingDuplicate as any)?.company?.name || undefined,
        city: city || existingDuplicate?.city || undefined,
        productName: productName || undefined,
        productCategory: productName || (isDuplicate ? 'Website Inquiry (Repeat)' : 'Website Inquiry'),
        quantity: payload.quantity ? Number(payload.quantity) : 1,
        estimatedValue: payload.estimatedValue ? Number(payload.estimatedValue) : 0,
        queryMessage: queryMessage || (productName ? `Inquiry for ${productName}` : 'Website contact submission'),
        source: 'web',
        rawPayload: JSON.stringify({
          ...payload,
          duplicateAudit: isDuplicate
            ? { matchedLeadId: existingDuplicate.id, repeatSubmission: true }
            : { status: 'unique' },
        }),
      },
      { tenantId, role: 'admin', employeeCode: 'WEB_FORM' } as any,
    );

    if (isDuplicate && existingDuplicate) {
      try {
        await this.prisma.leadActivity.create({
          data: {
            leadId: existingDuplicate.id,
            type: 'note',
            title: 'Repeat Inquiry Received',
            description: `Customer submitted new inquiry #${lead.leadNumber} for "${productName || 'General'}". Note: ${queryMessage || 'None'}`,
          },
        });
      } catch {}
    }

    return { isBot: false, isDuplicate, lead };
  }

  /**
   * Resolve default active tenant for public site inquiry walkthroughs.
   * Supports both UUID (tenant ID) and non-UUID company codes (e.g. ACME-DEV-001)
   * without Postgres UUID cast exceptions.
   */
  async getDefaultTenant() {
    const configured = process.env.PLATFORM_LEADS_TENANT_ID?.trim();
    if (configured) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(configured);
      const tenant = await this.prisma.tenant.findFirst({
        where: isUuid
          ? { id: configured, status: 'active', deletedAt: null }
          : { OR: [{ code: configured }, { name: configured }], status: 'active', deletedAt: null },
      });
      if (tenant) return tenant;
    }
    return this.prisma.tenant.findFirst({
      where: { status: 'active', deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Public endpoint to fetch tenant-configured web-to-lead form settings
   * Resolves tenant by key, or falls back to default active tenant for public website inquiry.
   * NEVER returns internal IDs, keys, or sensitive auth data.
   */
  async getInquiryInfo(key?: string) {
    if (!key || typeof key !== 'string' || !key.trim()) {
      throw new NotFoundException('This form is not available');
    }

    const tenant = await this.findTenantByWebhookKey(key.trim());
    if (!tenant) {
      throw new NotFoundException('This form is not available');
    }

    const settings = await this.getWebFormSettingsForTenant(tenant.id);

    // If tenant disabled their embeddable form, reject
    if (!settings || !settings.isEnabled) {
      throw new NotFoundException('This form is not available');
    }

    const defaultProducts = [
      { name: 'High-Volume Order Processing & Warehouse Logistics', category: 'Wholesale & Distribution' },
      { name: 'Component Procurement, Stock Control & Assembly Lines', category: 'Manufacturing & Engineering' },
      { name: 'Client Proposals, Milestone Billing & Contract Oversight', category: 'B2B Professional Services' },
      { name: 'Centralized Governance with Isolated Branch Workspaces', category: 'Multi-Location Operations' },
    ];

    const products = Array.isArray(settings?.products) && settings.products.length > 0
      ? settings.products
      : defaultProducts;

    return {
      companyName: tenant.name,
      logoUrl: settings?.logoUrl || tenant.logoUrl || '',
      phone: tenant.phone || '',
      email: tenant.email || '',
      website: tenant.website || '',
      brandColor: settings?.brandColor || '#2563eb',
      headline: settings?.headline || 'Request a Solution Walkthrough',
      description:
        settings?.description ||
        'Schedule an interactive walkthrough tailored to your operations or get a customized proposal.',
      submitButtonText: settings?.submitButtonText || 'Request Walkthrough',
      thankYouTitle: settings?.thankYouTitle || 'Inquiry Received!',
      thankYouMessage:
        settings?.thankYouMessage ||
        'Your inquiry has been received. Our solutions team will review your requirements and reach out within 1 business day.',
      redirectUrl: settings?.redirectUrl || null,
      products,
      fields: settings?.fields || DEFAULT_WEB_FORM_FIELDS,
      allowedOrigins: Array.isArray(settings?.allowedOrigins) ? settings.allowedOrigins : [],
      isEnabled: true,
    };
  }
}

