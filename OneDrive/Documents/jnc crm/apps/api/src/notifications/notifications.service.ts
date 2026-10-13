/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { decryptAtRest } from '../common/encryption.util';
import { BRAND_CONFIG } from '../common/brand';
import * as nodemailer from 'nodemailer';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  tenantId?: string;
  senderType?: 'primary' | 'invoice' | 'sales';
  requestId?: string;
  attachments?: Array<{
    filename: string;
    content?: any;
    path?: string;
    contentType?: string;
  }>;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

export interface CreateInAppTaskOptions {
  leadId: string;
  userId?: string;
  tenantId?: string;
  title: string;
  description?: string;
  scheduledAt?: Date;
}

export interface MailTestResult {
  provider: string;
  status: 'sent' | 'failed';
  errorText?: string;
  messageId?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private transporterCache: Map<string, nodemailer.Transporter> = new Map();

  constructor(private prisma: PrismaService) {}

  /**
   * Retrieves the configured MAIL_PROVIDER: 'smtp' | 'brevo' | 'resend'
   * Auto-detects RESEND_API_KEY or BREVO_API_KEY when running on cloud hosts like Render where SMTP ports are blocked.
   */
  getMailProvider(): 'smtp' | 'brevo' | 'resend' {
    const raw = (process.env.MAIL_PROVIDER || '').trim().toLowerCase();
    if (raw === 'brevo') return 'brevo';
    if (raw === 'resend') return 'resend';
    if (raw === 'smtp') return 'smtp';
    if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim()) return 'resend';
    if (process.env.BREVO_API_KEY && process.env.BREVO_API_KEY.trim()) return 'brevo';
    return 'smtp';
  }

  /**
   * Dynamically retrieves the isolated nodemailer Transporter for a specific tenant.
   * If a tenant has a custom MailAccount registered in DB, keep using SMTP for that tenant.
   */
  private async getTenantTransporter(tenantId?: string, senderType: 'primary' | 'invoice' | 'sales' = 'primary'): Promise<{
    transporter: nodemailer.Transporter | null;
    fromEmail: string;
    senderName: string;
    isCustomTenantAccount: boolean;
  }> {
    const targetTenantId = tenantId;

    // 1. Check if tenant has registered MailAccount in database
    if (targetTenantId) {
      const mailAccount = await this.prisma.mailAccount.findFirst({
        where: {
          tenantId: targetTenantId,
          isActive: true,
          OR: [
            { purpose: senderType === 'invoice' ? 'BILLING_INVOICES' : 'PRIMARY_ALERTS' },
            { purpose: 'PRIMARY_ALERTS' },
            { purpose: 'SALES_OUTBOUND' },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });

      if (mailAccount) {
        const cacheKey = `${mailAccount.id}_${mailAccount.smtpHost}_${mailAccount.smtpUser}`;
        let transporter = this.transporterCache.get(cacheKey);
        if (!transporter) {
          transporter = nodemailer.createTransport({
            host: mailAccount.smtpHost,
            port: mailAccount.smtpPort,
            secure: mailAccount.isSecure || mailAccount.smtpPort === 465,
            auth: {
              user: mailAccount.smtpUser,
              pass: decryptAtRest(mailAccount.smtpPass) || mailAccount.smtpPass,
            },
            tls: { rejectUnauthorized: false },
            connectionTimeout: 15000,
            greetingTimeout: 15000,
            socketTimeout: 20000,
          } as any);
          this.transporterCache.set(cacheKey, transporter);
        }

        return {
          transporter,
          fromEmail: mailAccount.email,
          senderName: mailAccount.senderName || mailAccount.name,
          isCustomTenantAccount: true,
        };
      }
    }

    // 2. Fallback to system env SMTP configuration
    const primaryUser = process.env.SMTP_USER || '';
    const primaryPass = process.env.SMTP_PASS || '';
    const primaryFrom = process.env.EMAIL_FROM || process.env.PRIMARY_EMAIL_FROM || primaryUser || 'noreply@jsnc.co.in';

    if (primaryUser && primaryPass) {
      const isGmail = primaryUser.toLowerCase().includes('@gmail.com');
      const host = process.env.SMTP_HOST || (isGmail ? 'smtp.gmail.com' : 'smtpout.secureserver.net');
      const port = Number(process.env.SMTP_PORT) || (isGmail ? 465 : 587);

      let transporter = this.transporterCache.get('default_root_smtp');
      if (!transporter) {
        transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user: primaryUser, pass: primaryPass },
          tls: { rejectUnauthorized: false },
          connectionTimeout: 15000,
          greetingTimeout: 15000,
          socketTimeout: 20000,
        } as any);
        this.transporterCache.set('default_root_smtp', transporter);
      }

      return {
        transporter,
        fromEmail: primaryFrom,
        senderName: BRAND_CONFIG.displayName,
        isCustomTenantAccount: false,
      };
    }

    return {
      transporter: null,
      fromEmail: primaryFrom,
      senderName: BRAND_CONFIG.displayName,
      isCustomTenantAccount: false,
    };
  }

  /**
   * HTTPS REST API dispatch via Brevo (https://api.brevo.com/v3/smtp/email)
   */
  private async sendViaBrevo(options: SendEmailOptions, fromEmail: string, senderName: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      return { success: false, error: 'BREVO_API_KEY environment variable is not configured' };
    }

    const payload = {
      sender: { name: senderName, email: fromEmail },
      to: [{ email: options.to }],
      subject: options.subject,
      htmlContent: options.html,
      textContent: options.text || undefined,
    };

    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey.trim(),
          'accept': 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.messageId || data.messageIds)) {
        return { success: true, messageId: data.messageId || (data.messageIds && data.messageIds[0]) || 'brevo-sent' };
      }

      const errMsg = data.message || data.code || `Brevo HTTP ${res.status}`;
      return { success: false, error: errMsg };
    } catch (err: any) {
      return { success: false, error: err.message || 'Brevo HTTPS network request failed' };
    }
  }

  /**
   * HTTPS REST API dispatch via Resend (https://api.resend.com/emails)
   */
  private async sendViaResend(options: SendEmailOptions, fromEmail: string, senderName: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      return { success: false, error: 'RESEND_API_KEY environment variable is not configured' };
    }

    const configuredFrom = process.env.RESEND_FROM;
    let fromFormatted = configuredFrom
      ? (configuredFrom.includes('<') ? configuredFrom : `"${senderName || 'JNC CRM'}" <${configuredFrom}>`)
      : (senderName ? `"${senderName}" <${fromEmail}>` : fromEmail);

    const payload = {
      from: fromFormatted,
      to: [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text || undefined,
    };

    try {
      let res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      let data = await res.json().catch(() => ({}));
      if (res.ok && data.id) {
        return { success: true, messageId: data.id };
      }

      // If domain verification failed or 403 on custom domain, retry with Resend default sandbox sender
      if (res.status === 403 || (data.message && data.message.toLowerCase().includes('domain'))) {
        this.logger.warn(`Resend domain '${fromFormatted}' not verified. Falling back to default onboarding@resend.dev...`);
        const fallbackPayload = {
          ...payload,
          from: `JNC CRM <onboarding@resend.dev>`,
        };
        res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey.trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(fallbackPayload),
        });
        data = await res.json().catch(() => ({}));
        if (res.ok && data.id) {
          return { success: true, messageId: data.id };
        }
      }

      const errMsg = data.message || data.name || `Resend HTTP ${res.status}`;
      return { success: false, error: errMsg };
    } catch (err: any) {
      return { success: false, error: err.message || 'Resend HTTPS network request failed' };
    }
  }

  private sanitizeBodyForLog(rawBody: string): string {
    if (!rawBody) return '';
    return rawBody
      .replace(/(Temporary Password:\s*(?:<\/strong>\s*)?<code>)([^<]+)(<\/code>)/gi, '$1[REDACTED_FOR_SECURITY]$3')
      .replace(/(Password:\s*(?:<\/strong>\s*)?<code>)([^<]+)(<\/code>)/gi, '$1[REDACTED_FOR_SECURITY]$3')
      .replace(/(Temporary Password:\s*)([^\s<]+)/gi, '$1[REDACTED_FOR_SECURITY]')
      .replace(/(Password:\s*)([^\s<]+)/gi, '$1[REDACTED_FOR_SECURITY]');
  }

  async getBranding(tenantId?: string): Promise<{ companyDisplayName: string; companyPhone: string; companyLogoUrl: string | null }> {
    if (tenantId) {
      try {
        const tenant = await this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true, phone: true, logoUrl: true },
        });
        if (tenant) {
          return {
            companyDisplayName: tenant.name || 'JNC CRM',
            companyPhone: tenant.phone || '+91 9663421455',
            companyLogoUrl: tenant.logoUrl || '/jnc-logo.jpg',
          };
        }
      } catch {}
    }

    return {
      companyDisplayName: BRAND_CONFIG.displayName,
      companyPhone: '+91 9663421455',
      companyLogoUrl: '/jnc-logo.jpg',
    };
  }

  private async resolveNotificationTenantId(tenantId?: string): Promise<string> {
    if (tenantId && tenantId.trim()) return tenantId;
    const jnc = await this.prisma.tenant.findFirst({
      where: { code: 'JNC' },
      select: { id: true },
    });
    if (jnc) return jnc.id;
    const anyTenant = await this.prisma.tenant.findFirst({ select: { id: true } });
    return anyTenant?.id || '';
  }

  /**
   * Single unified entry point for sending emails across forgot-password, reset-password, welcome emails and notifications.
   */
  async sendEmail(options: SendEmailOptions) {
    const tenantId = await this.resolveNotificationTenantId(options.tenantId);
    const isInvoice = options.senderType === 'invoice' || options.relatedEntityType === 'invoice';
    const branding = await this.getBranding(tenantId);
    const reqId = options.requestId || 'no-req-id';

    const tenantTransporterInfo = await this.getTenantTransporter(
      tenantId,
      isInvoice ? 'invoice' : (options.senderType || 'primary')
    );

    const fromEmail = options.from || process.env.EMAIL_FROM || process.env.PRIMARY_EMAIL_FROM || tenantTransporterInfo.fromEmail;
    const senderName = options.from ? branding.companyDisplayName : tenantTransporterInfo.senderName;
    const mailProvider = this.getMailProvider();

    let status = 'failed';
    let errorMessage: string | null = null;
    let messageId: string | null = null;
    let providerUsed: string = mailProvider;

    // 1. If tenant has a custom registered MailAccount in DB, use SMTP
    if (tenantTransporterInfo.isCustomTenantAccount && tenantTransporterInfo.transporter) {
      providerUsed = 'smtp-tenant';
      try {
        const info = await tenantTransporterInfo.transporter.sendMail({
          from: `"${senderName}" <${fromEmail}>`,
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text,
          attachments: options.attachments,
        });

        if (info && (info.accepted?.length > 0 || info.messageId)) {
          status = 'sent';
          messageId = info.messageId;
          this.logger.log(`[MAIL DISPATCH SUCCESS] ReqId: ${reqId} | Provider: smtp-tenant | To: ${options.to} | MessageId: ${messageId}`);
        } else {
          status = 'failed';
          errorMessage = 'Tenant SMTP rejected recipient';
          this.logger.error(`[MAIL ERROR] ReqId: ${reqId} | Provider: smtp-tenant | To: ${options.to} | Reason: ${errorMessage}`);
        }
      } catch (err: any) {
        status = 'failed';
        errorMessage = err.message || 'Tenant SMTP connection failed';
        this.logger.error(`[MAIL ERROR] ReqId: ${reqId} | Provider: smtp-tenant | To: ${options.to} | Reason: ${errorMessage}`);
      }
    }
    // 2. HTTPS REST API Provider: Brevo
    else if (mailProvider === 'brevo') {
      const result = await this.sendViaBrevo(options, fromEmail, senderName);
      if (result.success) {
        status = 'sent';
        messageId = result.messageId || null;
        this.logger.log(`[MAIL DISPATCH SUCCESS] ReqId: ${reqId} | Provider: brevo | To: ${options.to} | MessageId: ${messageId}`);
      } else {
        status = 'failed';
        errorMessage = result.error || 'Brevo API sending failed';
        this.logger.error(`[MAIL ERROR] ReqId: ${reqId} | Provider: brevo | To: ${options.to} | Reason: ${errorMessage}`);
      }
    }
    // 3. HTTPS REST API Provider: Resend
    else if (mailProvider === 'resend') {
      const result = await this.sendViaResend(options, fromEmail, senderName);
      if (result.success) {
        status = 'sent';
        messageId = result.messageId || null;
        this.logger.log(`[MAIL DISPATCH SUCCESS] ReqId: ${reqId} | Provider: resend | To: ${options.to} | MessageId: ${messageId}`);
      } else {
        status = 'failed';
        errorMessage = result.error || 'Resend API sending failed';
        this.logger.error(`[MAIL ERROR] ReqId: ${reqId} | Provider: resend | To: ${options.to} | Reason: ${errorMessage}`);
      }
    }
    // 4. Default: System SMTP (Nodemailer)
    else {
      if (!tenantTransporterInfo.transporter) {
        const isMissingPass = !process.env.SMTP_PASS;
        status = 'queued';
        errorMessage = isMissingPass
          ? 'SMTP_PASS missing in server environment variables. Configure SMTP_PASS or set MAIL_PROVIDER=brevo/resend.'
          : 'No system SMTP transporter configured.';
        this.logger.warn(`[MAIL ERROR] ReqId: ${reqId} | Provider: smtp | To: ${options.to} | Reason: ${errorMessage}`);
      } else {
        try {
          const info = await tenantTransporterInfo.transporter.sendMail({
            from: `"${senderName}" <${fromEmail}>`,
            to: options.to,
            subject: options.subject,
            html: options.html,
            text: options.text,
            attachments: options.attachments,
          });

          if (info && (info.accepted?.length > 0 || info.messageId)) {
            status = 'sent';
            messageId = info.messageId;
            this.logger.log(`[MAIL DISPATCH SUCCESS] ReqId: ${reqId} | Provider: smtp | To: ${options.to} | MessageId: ${messageId}`);
          } else {
            status = 'failed';
            errorMessage = 'System SMTP rejected recipient';
            this.logger.error(`[MAIL ERROR] ReqId: ${reqId} | Provider: smtp | To: ${options.to} | Reason: ${errorMessage}`);
          }
        } catch (err: any) {
          status = 'failed';
          errorMessage = err.message || 'System SMTP connection failed';
          this.logger.error(`[MAIL ERROR] ReqId: ${reqId} | Provider: smtp | To: ${options.to} | Reason: ${errorMessage}`);
        }
      }
    }

    // 5. Automated Resilient Fallback Cascade:
    // If primary provider failed (e.g. SMTP blocked by cloud firewall like Render Free Tier),
    // automatically retry with available HTTPS APIs or secondary transports so delivery never drops.
    if (status !== 'sent') {
      if (providerUsed !== 'resend' && process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim()) {
        this.logger.log(`[MAIL FALLBACK] Primary provider '${providerUsed}' failed (${errorMessage}). Retrying via Resend HTTPS API...`);
        const resendResult = await this.sendViaResend(options, fromEmail, senderName);
        if (resendResult.success) {
          status = 'sent';
          messageId = resendResult.messageId || null;
          providerUsed = 'resend';
          errorMessage = null;
          this.logger.log(`[MAIL DISPATCH SUCCESS via Fallback] Provider: resend | To: ${options.to} | MessageId: ${messageId}`);
        }
      }

      if (status !== 'sent' && providerUsed !== 'brevo' && process.env.BREVO_API_KEY && process.env.BREVO_API_KEY.trim()) {
        this.logger.log(`[MAIL FALLBACK] Retrying via Brevo HTTPS API...`);
        const brevoResult = await this.sendViaBrevo(options, fromEmail, senderName);
        if (brevoResult.success) {
          status = 'sent';
          messageId = brevoResult.messageId || null;
          providerUsed = 'brevo';
          errorMessage = null;
          this.logger.log(`[MAIL DISPATCH SUCCESS via Fallback] Provider: brevo | To: ${options.to} | MessageId: ${messageId}`);
        }
      }

      if (status !== 'sent' && providerUsed !== 'smtp' && tenantTransporterInfo.transporter) {
        this.logger.log(`[MAIL FALLBACK] Retrying via SMTP transporter...`);
        try {
          const fallbackInfo = await tenantTransporterInfo.transporter.sendMail({
            from: `"${senderName}" <${fromEmail}>`,
            to: options.to,
            subject: options.subject,
            html: options.html,
            text: options.text,
            attachments: options.attachments,
          });
          if (fallbackInfo && (fallbackInfo.accepted?.length > 0 || fallbackInfo.messageId)) {
            status = 'sent';
            messageId = fallbackInfo.messageId;
            providerUsed = 'smtp';
            errorMessage = null;
            this.logger.log(`[MAIL DISPATCH SUCCESS via Fallback] Provider: smtp | To: ${options.to} | MessageId: ${messageId}`);
          }
        } catch {}
      }
    }

    const sanitizedBody = this.sanitizeBodyForLog(options.html || options.text || '');

    await this.prisma.messageLog.create({
      data: {
        tenantId,
        channel: 'email',
        recipient: options.to,
        subject: options.subject,
        body: sanitizedBody,
        status,
        errorMessage,
        relatedEntityType: options.relatedEntityType,
        relatedEntityId: options.relatedEntityId,
      },
    }).catch(() => {});

    if (status === 'failed' || status === 'queued') {
      throw new BadRequestException(errorMessage || `Failed to deliver email to ${options.to}`);
    }

    return { success: true, recipient: options.to, messageId, status, provider: providerUsed };
  }

  /**
   * Platform Admin Mail Test Method
   */
  async sendTestMail(targetEmail: string, requestId?: string): Promise<MailTestResult> {
    const provider = this.getMailProvider();
    const testSubject = `[JNC CRM] Mail Provider Test (${provider.toUpperCase()})`;
    const testHtml = `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2>Mail Provider Operational Test</h2>
        <p>This test email was sent using provider: <strong>${provider.toUpperCase()}</strong>.</p>
        <p>Time: ${new Date().toISOString()}</p>
      </div>
    `;

    try {
      const res = await this.sendEmail({
        to: targetEmail,
        subject: testSubject,
        html: testHtml,
        text: `Mail Provider Test (${provider.toUpperCase()}) - ${new Date().toISOString()}`,
        requestId,
      });

      return {
        provider,
        status: 'sent',
        messageId: res.messageId || undefined,
      };
    } catch (err: any) {
      return {
        provider,
        status: 'failed',
        errorText: err.message || 'Test email dispatch failed',
      };
    }
  }

  async createInAppTask(options: CreateInAppTaskOptions) {
    const tenantId = options.tenantId || 'unassigned';
    this.logger.log(`[IN-APP TASK] Tenant: ${tenantId} | Lead: ${options.leadId} | Task: ${options.title} | User: ${options.userId || 'Unassigned'}`);

    try {
      await this.prisma.leadActivity.create({
        data: {
          leadId: options.leadId,
          userId: options.userId || null,
          type: 'reminder',
          title: options.title,
          description: options.description || null,
          scheduledAt: options.scheduledAt || new Date(),
          isCompleted: false,
        },
      });
      return { success: true };
    } catch (err: any) {
      this.logger.error(`Failed to create in-app task: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async sendSms(phone: string, message: string) {
    this.logger.log(`[SMS DISPATCH] To: ${phone} | Content: ${message.slice(0, 50)}...`);
    return { success: true, status: 'sent' };
  }

  async syncGoDaddyInbox() {
    this.logger.log(`[GODADDY SYNC] Syncing GoDaddy IMAP inbox...`);
    return { success: true, syncedCount: 0 };
  }
}
