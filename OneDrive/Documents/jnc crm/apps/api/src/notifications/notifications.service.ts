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
import * as dns from 'dns';
import { isPrivateOrBlockedIp, isInternalHostname } from '../common/ssrf.util';

export type MailDeliveryStatus = 'sent' | 'failed' | 'not_configured';

export type MailReasonCode =
  | 'domain_not_verified'
  | 'invalid_api_key'
  | 'test_sender_restricted'
  | 'timeout'
  | 'rate_limited'
  | 'smtp_blocked'
  | 'missing_configuration'
  | 'network_error'
  | 'validation_error'
  | 'certificate_error'
  | null;

export function isCertificateError(err: any): boolean {
  if (!err) return false;
  const code = (err.code || '').toUpperCase();
  const msg = (err.message || '').toLowerCase();
  const certCodes = [
    'SELF_SIGNED_CERT_IN_CHAIN',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'CERT_HAS_EXPIRED',
    'CERT_NOT_YET_VALID',
    'ERR_TLS_CERT_ALTNAME_INVALID',
    'UNABLE_TO_GET_ISSUER_CERT',
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  ];
  if (certCodes.includes(code)) return true;
  if (
    msg.includes('certificate') ||
    msg.includes('cert_') ||
    msg.includes('self-signed') ||
    msg.includes('self signed') ||
    msg.includes('not trusted') ||
    msg.includes('unable to verify') ||
    msg.includes('tls_cert')
  ) {
    return true;
  }
  return false;
}

export interface MailDispatchResult {
  status: MailDeliveryStatus;
  reason: MailReasonCode;
  provider: string;
  recipient: string;
  messageId?: string;
  error?: string;
  success?: boolean;
}

export function maskRecipient(email: string): string {
  if (!email || !email.includes('@')) return '***@unknown';
  const [local, domain] = email.trim().toLowerCase().split('@');
  const prefix = local.length >= 3 ? local.slice(0, 3) : (local.length > 0 ? local.slice(0, Math.min(local.length, 2)) : '');
  return `${prefix}***@${domain}`;
}

export function mapProviderError(
  provider: string,
  httpStatus: number | null,
  errorMessage: string | null,
): MailReasonCode {
  const msg = (errorMessage || '').toLowerCase();

  if (provider === 'resend') {
    if (httpStatus === 403 || msg.includes('domain') || msg.includes('verify') || msg.includes('not verified')) {
      if (
        msg.includes('only send testing') ||
        msg.includes('testing emails') ||
        msg.includes('sandbox') ||
        msg.includes('restriction') ||
        msg.includes('account owner')
      ) {
        return 'test_sender_restricted';
      }
      return 'domain_not_verified';
    }
    if (httpStatus === 401 || msg.includes('api key') || msg.includes('unauthorized') || msg.includes('invalid_api_key')) {
      return 'invalid_api_key';
    }
    if (httpStatus === 422 || msg.includes('validation')) {
      return 'validation_error';
    }
    if (httpStatus === 429 || msg.includes('rate') || msg.includes('quota') || msg.includes('limit')) {
      return 'rate_limited';
    }
    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('etimedout')) {
      return 'timeout';
    }
    if (msg.includes('network') || msg.includes('fetch failed') || msg.includes('enotfound') || msg.includes('econnreset')) {
      return 'network_error';
    }
  }

  if (provider === 'brevo') {
    if (httpStatus === 403 || httpStatus === 400 || msg.includes('domain') || msg.includes('unverified') || msg.includes('sender')) {
      return 'domain_not_verified';
    }
    if (httpStatus === 401 || msg.includes('unauthorized') || msg.includes('api-key') || msg.includes('key not found')) {
      return 'invalid_api_key';
    }
    if (httpStatus === 429 || msg.includes('rate') || msg.includes('quota')) {
      return 'rate_limited';
    }
    if (httpStatus === 422 || msg.includes('validation')) {
      return 'validation_error';
    }
    if (msg.includes('timeout') || msg.includes('timed out')) {
      return 'timeout';
    }
    if (msg.includes('network') || msg.includes('fetch failed')) {
      return 'network_error';
    }
  }

  // SMTP or generic fallback
  if (isCertificateError({ message: msg })) {
    return 'certificate_error';
  }
  if (msg.includes('timeout') || msg.includes('timedout') || msg.includes('etimedout') || msg.includes('esocket')) {
    return 'timeout';
  }
  if (msg.includes('refused') || msg.includes('econnrefused') || msg.includes('ehostunreach') || msg.includes('blocked')) {
    return 'smtp_blocked';
  }
  if (msg.includes('invalid login') || msg.includes('auth') || msg.includes('eauth') || msg.includes('535') || msg.includes('credentials')) {
    return 'invalid_api_key';
  }
  if (msg.includes('missing') || msg.includes('not configured')) {
    return 'missing_configuration';
  }
  if (msg.includes('network') || msg.includes('enotfound') || msg.includes('dns')) {
    return 'network_error';
  }

  return null;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  tenantId?: string;
  senderType?: 'primary' | 'invoice' | 'sales';
  requestId?: string;
  purpose?: string;
  throwOnError?: boolean;
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
  reason?: MailReasonCode;
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
  private async resolveAndValidateSmtpHost(host: string, port: number): Promise<string> {
    if (![465, 587, 2525].includes(port)) {
      throw new Error(`Port ${port} is not allowed. Only secure ports 465, 587, or 2525 are permitted.`);
    }
    if (isInternalHostname(host)) {
      throw new Error(`Host "${host}" is an internal address and is prohibited.`);
    }
    const lookups = await dns.promises.lookup(host, { all: true });
    const ips = lookups.map((l) => l.address);
    if (ips.length === 0) {
      throw new Error(`Host "${host}" could not be resolved in DNS.`);
    }
    for (const ip of ips) {
      if (isPrivateOrBlockedIp(ip)) {
        throw new Error(`Host "${host}" resolves to prohibited address ${ip}.`);
      }
    }
    return ips[0];
  }

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
            { purpose: 'ALL' },
            { purpose: senderType === 'invoice' ? 'BILLING_INVOICES' : 'PRIMARY_ALERTS' },
            { purpose: 'PRIMARY_ALERTS' },
            { purpose: 'SALES_OUTBOUND' },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });

      if (mailAccount) {
        try {
          const checkedIp = await this.resolveAndValidateSmtpHost(mailAccount.smtpHost, mailAccount.smtpPort);
          const isSsl = mailAccount.encryption === 'ssl' || mailAccount.isSecure || mailAccount.smtpPort === 465;
          const cacheKey = `${mailAccount.id}_${checkedIp}_${mailAccount.smtpPort}_${isSsl}_${mailAccount.smtpUser}`;
          let transporter = this.transporterCache.get(cacheKey);
          if (!transporter) {
            transporter = nodemailer.createTransport({
              host: checkedIp,
              port: mailAccount.smtpPort,
              secure: isSsl,
              requireTLS: !isSsl,
              tls: {
                servername: mailAccount.smtpHost,
              },
              auth: {
                user: mailAccount.smtpUser,
                pass: decryptAtRest(mailAccount.smtpPass) || mailAccount.smtpPass,
              },
              connectionTimeout: 10000,
              greetingTimeout: 10000,
              socketTimeout: 10000,
            } as any);
            this.transporterCache.set(cacheKey, transporter);
          }

          return {
            transporter,
            fromEmail: mailAccount.email,
            senderName: mailAccount.senderName || mailAccount.name,
            isCustomTenantAccount: true,
          };
        } catch (err: any) {
          this.logger.error(`[MAIL_SECURITY] Tenant SMTP security validation failed: ${err.message}`);
        }
      }
    }

    // 2. Fallback to system env SMTP configuration
    const primaryUser = process.env.SMTP_USER || '';
    const primaryPass = process.env.SMTP_PASS || '';
    const primaryFrom = process.env.EMAIL_FROM || primaryUser;

    if (primaryUser && primaryPass) {
      const isGmail = primaryUser.toLowerCase().includes('gmail.com');
      const host = process.env.SMTP_HOST || (isGmail ? 'smtp.gmail.com' : 'localhost');
      const port = Number(process.env.SMTP_PORT) || (isGmail ? 465 : 587);
      const isSsl = port === 465;

      try {
        const checkedIp = await this.resolveAndValidateSmtpHost(host, port);
        const cacheKey = `default_root_smtp_${checkedIp}_${port}_${isSsl}`;
        let transporter = this.transporterCache.get(cacheKey);
        if (!transporter) {
          transporter = nodemailer.createTransport({
            host: checkedIp,
            port,
            secure: isSsl,
            requireTLS: !isSsl,
            tls: {
              servername: host,
            },
            auth: { user: primaryUser, pass: primaryPass },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 10000,
          } as any);
          this.transporterCache.set(cacheKey, transporter);
        }

        return {
          transporter,
          fromEmail: primaryFrom,
          senderName: process.env.PRODUCT_NAME || BRAND_CONFIG.displayName || 'CRM',
          isCustomTenantAccount: false,
        };
      } catch (err: any) {
        this.logger.error(`[MAIL_SECURITY] System root SMTP security validation failed: ${err.message}`);
      }
    }

    return {
      transporter: null,
      fromEmail: primaryFrom,
      senderName: process.env.PRODUCT_NAME || BRAND_CONFIG.displayName || 'CRM',
      isCustomTenantAccount: false,
    };
  }

  /**
   * HTTPS REST API dispatch via Brevo (https://api.brevo.com/v3/smtp/email)
   */
  private async sendViaBrevo(
    options: SendEmailOptions,
    fromEmail: string,
    senderName: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string; reason?: MailReasonCode; status?: number }> {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      return { success: false, error: 'BREVO_API_KEY environment variable is not configured', reason: 'missing_configuration' };
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
      const reason = mapProviderError('brevo', res.status, errMsg);
      return { success: false, error: errMsg, reason, status: res.status };
    } catch (err: any) {
      const reason = mapProviderError('brevo', null, err.message);
      return { success: false, error: err.message || 'Brevo HTTPS network request failed', reason };
    }
  }

  /**
   * HTTPS REST API dispatch via Resend (https://api.resend.com/emails)
   */
  private async sendViaResend(
    options: SendEmailOptions,
    fromEmail: string,
    senderName: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string; reason?: MailReasonCode; status?: number }> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      return { success: false, error: 'RESEND_API_KEY environment variable is not configured', reason: 'missing_configuration' };
    }

    const configuredFrom = process.env.RESEND_FROM;
    let fromFormatted = configuredFrom
      ? (configuredFrom.includes('<') ? configuredFrom : `"${senderName || process.env.PRODUCT_NAME || 'CRM'}" <${configuredFrom}>`)
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

      const errMsg = data.message || data.name || `Resend HTTP ${res.status}`;
      const reason = mapProviderError('resend', res.status, errMsg);
      return { success: false, error: errMsg, reason, status: res.status };
    } catch (err: any) {
      const reason = mapProviderError('resend', null, err.message);
      return { success: false, error: err.message || 'Resend HTTPS network request failed', reason };
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
            companyDisplayName: tenant.name || (process.env.PRODUCT_NAME || BRAND_CONFIG.displayName || 'CRM'),
            companyPhone: tenant.phone || '',
            companyLogoUrl: tenant.logoUrl || process.env.PRODUCT_LOGO_URL || '',
          };
        }
      } catch {}
    }

    const defaultName = process.env.PRODUCT_NAME || BRAND_CONFIG.displayName || 'CRM';
    const defaultLogo = process.env.PRODUCT_LOGO_URL || '';

    return {
      companyDisplayName: defaultName,
      companyPhone: '',
      companyLogoUrl: defaultLogo,
    };
  }

  private async resolveNotificationTenantId(tenantId?: string): Promise<string> {
    if (tenantId && tenantId.trim()) return tenantId;
    const anyTenant = await this.prisma.tenant.findFirst({
      where: { deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return anyTenant?.id || '';
  }

  /**
   * Single unified entry point for sending emails across forgot-password, reset-password, welcome emails and notifications.
   */
  async sendEmail(options: SendEmailOptions): Promise<MailDispatchResult> {
    const tenantId = await this.resolveNotificationTenantId(options.tenantId);
    const isInvoice = options.senderType === 'invoice' || options.relatedEntityType === 'invoice';
    const branding = await this.getBranding(tenantId);
    const reqId = options.requestId || 'no-req-id';

    const tenantTransporterInfo = await this.getTenantTransporter(
      tenantId,
      isInvoice ? 'invoice' : (options.senderType || 'primary')
    );

    // Purpose-based routing: System sender vs Business mail account
    const SYSTEM_ALLOWED_PURPOSES = new Set([
      'login_code',
      'two_factor_code',
      'password_reset_code',
      'password_reset',
      'security_alert',
      'password_changed',
      'welcome_credentials',
      'user_invite',
      'test_mail',
      'mail_test',
    ]);

    const isSystemMail = Boolean(options.purpose && SYSTEM_ALLOWED_PURPOSES.has(options.purpose));

    // Business mails (quotations, invoices, follow-ups, customer automations) must use company's own mail account
    if (!isSystemMail && (!tenantTransporterInfo.isCustomTenantAccount || !tenantTransporterInfo.transporter)) {
      const errMsg = 'Connect your company mail account in Settings';
      this.logger.warn(`[BUSINESS_MAIL_BLOCKED] Tenant '${tenantId}' has no active mail account. Blocked business mail with purpose '${options.purpose || options.relatedEntityType || 'business'}'.`);
      if (options.throwOnError !== false) {
        throw new BadRequestException(errMsg);
      }
      return {
        status: 'not_configured',
        reason: 'missing_configuration',
        provider: 'tenant-mail',
        recipient: options.to,
        error: errMsg,
        success: false,
      };
    }

    const fromEmail = tenantTransporterInfo.isCustomTenantAccount
      ? tenantTransporterInfo.fromEmail
      : (process.env.EMAIL_FROM || process.env.SMTP_USER || '');
    const senderName = tenantTransporterInfo.isCustomTenantAccount
      ? (tenantTransporterInfo.senderName || branding.companyDisplayName)
      : (process.env.PRODUCT_NAME || BRAND_CONFIG.displayName || 'CRM');
    const mailProvider = this.getMailProvider();

    let status: MailDeliveryStatus = 'failed';
    let errorMessage: string | null = null;
    let messageId: string | null = null;
    let providerUsed: string = mailProvider;
    let detectedReason: MailReasonCode = null;

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
          detectedReason = 'domain_not_verified';
          this.logger.error(`[MAIL ERROR] ReqId: ${reqId} | Provider: smtp-tenant | To: ${options.to} | Reason: ${errorMessage}`);
        }
      } catch (err: any) {
        status = 'failed';
        if (isCertificateError(err)) {
          errorMessage = 'The mail server certificate is not trusted';
          detectedReason = 'certificate_error';
        } else {
          errorMessage = err.message || 'Tenant SMTP connection failed';
          detectedReason = mapProviderError('smtp', null, errorMessage);
        }
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
        status = result.reason === 'missing_configuration' ? 'not_configured' : 'failed';
        errorMessage = result.error || 'Brevo API sending failed';
        detectedReason = result.reason || mapProviderError('brevo', result.status || null, errorMessage);
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
        status = result.reason === 'missing_configuration' ? 'not_configured' : 'failed';
        errorMessage = result.error || 'Resend API sending failed';
        detectedReason = result.reason || mapProviderError('resend', result.status || null, errorMessage);
        this.logger.error(`[MAIL ERROR] ReqId: ${reqId} | Provider: resend | To: ${options.to} | Reason: ${errorMessage}`);
      }
    }
    // 4. Default: System SMTP (Nodemailer)
    else {
      if (!tenantTransporterInfo.transporter) {
        const isMissingPass = !process.env.SMTP_PASS;
        status = 'not_configured';
        detectedReason = 'missing_configuration';
        errorMessage = isMissingPass
          ? 'SMTP_PASS missing in server environment variables. Configure SMTP_PASS or set MAIL_PROVIDER=brevo/resend.'
          : 'No system SMTP transporter configured.';
        this.logger.warn(`[MAIL ERROR] ReqId: ${reqId} | Provider: smtp | To: ${options.to} | Reason: ${errorMessage}`);
      } else {
        try {
          const info = await tenantTransporterInfo.transporter.sendMail({
            from: `"${senderName}" <${fromEmail}>`,
            replyTo: process.env.REPLY_TO_EMAIL || fromEmail,
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
            detectedReason = 'domain_not_verified';
            this.logger.error(`[MAIL ERROR] ReqId: ${reqId} | Provider: smtp | To: ${options.to} | Reason: ${errorMessage}`);
          }
        } catch (err: any) {
          status = 'failed';
          if (isCertificateError(err)) {
            errorMessage = 'The mail server certificate is not trusted';
            detectedReason = 'certificate_error';
          } else {
            errorMessage = err.message || 'System SMTP connection failed';
            detectedReason = mapProviderError('smtp', null, errorMessage);
          }
          this.logger.error(`[MAIL ERROR] ReqId: ${reqId} | Provider: smtp | To: ${options.to} | Reason: ${errorMessage}`);
        }
      }
    }

    // 5. Automated Resilient Fallback Cascade:
    // If primary provider failed (e.g. SMTP blocked by cloud firewall like Render Free Tier),
    // automatically retry with available HTTPS APIs or secondary transports so delivery never drops.
    // Security Rule: If a certificate error happens, never fall back to an unverified connection.
    if (status !== 'sent' && detectedReason !== 'certificate_error') {
      if (providerUsed !== 'resend' && process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim()) {
        this.logger.log(`[MAIL FALLBACK] Primary provider '${providerUsed}' failed (${errorMessage}). Retrying via Resend HTTPS API...`);
        const resendResult = await this.sendViaResend(options, fromEmail, senderName);
        if (resendResult.success) {
          status = 'sent';
          messageId = resendResult.messageId || null;
          providerUsed = 'resend';
          errorMessage = null;
          detectedReason = null;
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
          detectedReason = null;
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
            detectedReason = null;
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
        status: status === 'sent' ? 'sent' : 'failed',
        errorMessage,
        relatedEntityType: options.relatedEntityType,
        relatedEntityId: options.relatedEntityId,
      },
    }).catch(() => {});

    // Save to MailLog with masked recipient and no tokens or raw bodies
    const maskedRecipient = maskRecipient(options.to);
    const finalReason = status === 'sent' ? null : (detectedReason || mapProviderError(providerUsed, null, errorMessage));

    await (this.prisma as any).mailLog?.create({
      data: {
        tenantId: tenantId || null,
        purpose: options.purpose || options.relatedEntityType || 'general_notification',
        provider: providerUsed,
        status,
        reason: finalReason,
        recipient: maskedRecipient,
        reqId: reqId !== 'no-req-id' ? reqId : null,
      },
    }).catch((logErr) => {
      this.logger.warn(`Failed to create MailLog entry: ${logErr?.message}`);
    });

    const result: MailDispatchResult = {
      success: status === 'sent',
      status,
      reason: finalReason,
      provider: providerUsed,
      recipient: options.to,
      messageId: messageId || undefined,
      error: errorMessage || undefined,
    };

    if (status !== 'sent' && options.throwOnError !== false) {
      throw new BadRequestException(errorMessage || `Failed to deliver email to ${options.to}`);
    }

    return result;
  }

  /**
   * Platform Admin Mail Test Method
   */
  async sendTestMail(targetEmail: string, requestId?: string): Promise<MailTestResult> {
    const provider = this.getMailProvider();
    const prodName = process.env.PRODUCT_NAME || BRAND_CONFIG.displayName || 'CRM';
    const testSubject = `[${prodName}] Mail Provider Test (${provider.toUpperCase()})`;
    const testHtml = `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2>Mail Provider Operational Test</h2>
        <p>This test email was sent using provider: <strong>${provider.toUpperCase()}</strong>.</p>
        <p>Time: ${new Date().toISOString()}</p>
      </div>
    `;

    const res = await this.sendEmail({
      to: targetEmail,
      subject: testSubject,
      html: testHtml,
      text: `Mail Provider Test (${provider.toUpperCase()}) - ${new Date().toISOString()}`,
      requestId,
      purpose: 'test_mail',
      throwOnError: false,
    });

    return {
      provider: res.provider,
      status: res.status === 'sent' ? 'sent' : 'failed',
      reason: res.reason,
      errorText: res.error,
      messageId: res.messageId,
    };
  }

  /**
   * Get Platform Mail Configuration & Diagnostics Status
   */
  async getMailStatus() {
    const provider = this.getMailProvider();
    const fromEmail = process.env.EMAIL_FROM || process.env.SMTP_USER || '';
    const domainMatch = fromEmail.match(/@(.+)$/);
    const senderDomain = domainMatch ? domainMatch[1] : 'unknown';

    let isConfigured = false;
    let apiKeyConfigured = false;
    let smtpPortBlockedWarning = false;

    if (provider === 'resend') {
      apiKeyConfigured = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim());
      isConfigured = apiKeyConfigured;
    } else if (provider === 'brevo') {
      apiKeyConfigured = Boolean(process.env.BREVO_API_KEY && process.env.BREVO_API_KEY.trim());
      isConfigured = apiKeyConfigured;
    } else {
      isConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
      smtpPortBlockedWarning = true;
    }

    const mailLogModel = (this.prisma as any).mailLog;
    const [recentFailures, totalSent, totalFailed, totalNotConfigured] = await Promise.all([
      mailLogModel?.findMany
        ? mailLogModel.findMany({
            where: { status: { in: ['failed', 'not_configured'] } },
            orderBy: { createdAt: 'desc' },
            take: 20,
          }).catch(() => [])
        : Promise.resolve([]),
      mailLogModel?.count ? mailLogModel.count({ where: { status: 'sent' } }).catch(() => 0) : Promise.resolve(0),
      mailLogModel?.count ? mailLogModel.count({ where: { status: 'failed' } }).catch(() => 0) : Promise.resolve(0),
      mailLogModel?.count ? mailLogModel.count({ where: { status: 'not_configured' } }).catch(() => 0) : Promise.resolve(0),
    ]);

    return {
      provider,
      senderDomain,
      senderEmail: fromEmail,
      isConfigured,
      apiKeyConfigured,
      smtpPortBlockedWarning,
      warningMessage: smtpPortBlockedWarning
        ? "Outbound SMTP (ports 25, 465, 587) is blocked on Render free tier. Use RESEND or BREVO HTTPS APIs for guaranteed delivery."
        : null,
      recentFailures,
      stats: {
        totalSent,
        totalFailed,
        totalNotConfigured,
      },
    };
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
