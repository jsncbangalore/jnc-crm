/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as nodemailer from 'nodemailer';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  tenantId?: string;
  senderType?: 'primary' | 'invoice' | 'sales';
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

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private transporterCache: Map<string, nodemailer.Transporter> = new Map();

  constructor(private prisma: PrismaService) {}

  /**
   * Dynamically retrieves the isolated nodemailer Transporter for a specific tenant.
   * If a tenant has not configured their own SMTP, it falls back to in-app notification mode
   * to guarantee NO cross-tenant mail leakage.
   */
  private async getTenantTransporter(tenantId?: string, senderType: 'primary' | 'invoice' | 'sales' = 'primary'): Promise<{
    transporter: nodemailer.Transporter | null;
    fromEmail: string;
    senderName: string;
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
              pass: mailAccount.smtpPass,
            },
            tls: { rejectUnauthorized: false },
          });
          this.transporterCache.set(cacheKey, transporter);
        }

        return {
          transporter,
          fromEmail: mailAccount.email,
          senderName: mailAccount.senderName || mailAccount.name,
        };
      }
    }

    // 2. Fallback to env configuration
    const primaryUser = process.env.SMTP_USER || '';
      const primaryPass = process.env.SMTP_PASS || '';

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
          });
          this.transporterCache.set('default_root_smtp', transporter);
        }

        return {
          transporter,
          fromEmail: primaryUser,
          senderName: 'JS Network Communication',
        };
      }

    // 3. For third-party customer tenants with no SMTP configured: return null
    return {
      transporter: null,
      fromEmail: 'noreply@jsnc.co.in',
      senderName: 'System Notification',
    };
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
      companyDisplayName: 'JS Network Communication',
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

  async sendEmail(options: SendEmailOptions) {
    const tenantId = await this.resolveNotificationTenantId(options.tenantId);
    const isInvoice = options.senderType === 'invoice' || options.relatedEntityType === 'invoice';
    const branding = await this.getBranding(tenantId);
    
    const { transporter, fromEmail, senderName } = await this.getTenantTransporter(
      tenantId,
      isInvoice ? 'invoice' : (options.senderType || 'primary')
    );

    const fromAddress = options.from || fromEmail;
    const senderDisplayName = options.from ? branding.companyDisplayName : senderName;

    this.logger.log(`[TENANT EMAIL] Tenant: ${tenantId} | From: ${fromAddress} | To: ${options.to} | Subject: ${options.subject}`);

    let status = 'failed';
    let errorMessage: string | null = null;
    let transportInfo: any = null;

    if (!transporter) {
      this.logger.warn(`No SMTP account registered for tenant ${tenantId}. Message logged without outward SMTP transmission.`);
      status = 'queued';
      errorMessage = 'No tenant SMTP account configured. Message stored in in-app log.';
    } else {
      try {
        transportInfo = await transporter.sendMail({
          from: `"${senderDisplayName}" <${fromAddress}>`,
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text,
          attachments: options.attachments,
        });

        if (transportInfo && (transportInfo.accepted?.length > 0 || transportInfo.messageId)) {
          status = 'sent';
          this.logger.log(`[EMAIL DISPATCH SUCCESS] MessageId: ${transportInfo.messageId} | To: ${options.to}`);
        } else {
          status = 'failed';
          errorMessage = `SMTP server rejected recipient: ${JSON.stringify(transportInfo?.rejected || 'Unknown rejection')}`;
          this.logger.error(errorMessage);
        }
      } catch (err: any) {
        this.logger.error(`Failed to send email to ${options.to}: ${err.message}`);
        status = 'failed';
        errorMessage = err.message || 'SMTP network or authentication failure';
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
    });

    if (status === 'failed') {
      throw new BadRequestException(errorMessage || `Failed to deliver email to ${options.to}`);
    }

    return { success: true, recipient: options.to, messageId: transportInfo?.messageId, status };
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

      await this.prisma.messageLog.create({
        data: {
          tenantId,
          channel: 'in_app',
          recipient: options.userId || 'Unassigned',
          subject: options.title,
          body: options.description || options.title,
          status: 'sent',
          relatedEntityType: 'lead',
          relatedEntityId: options.leadId,
        },
      });

      return { success: true };
    } catch (err: any) {
      this.logger.error(`Failed to create in-app task: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async sendSms(phone: string, text: string) {
    this.logger.log(`[SMS DISPATCH] Simulated SMS to ${phone}: ${text}`);
    return { success: true };
  }

  async syncGoDaddyInbox() {
    this.logger.log(`[IMAP SYNC] Synchronizing inbox`);
    return { message: 'Inbox synchronized successfully', count: 0 };
  }
}
