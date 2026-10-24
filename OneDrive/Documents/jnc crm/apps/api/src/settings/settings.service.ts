/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, ForbiddenException, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopedUser } from '../auth/scoping.service';
import { requireTenantId } from '../common/tenant.util';
import { encryptAtRest, decryptAtRest } from '../common/encryption.util';
import { BRAND_CONFIG } from '../common/brand';
import * as fs from 'fs';
import * as path from 'path';
import * as dns from 'dns';
import * as nodemailer from 'nodemailer';
import { isPrivateOrBlockedIp, isInternalHostname } from '../common/ssrf.util';
import { isCertificateError } from '../notifications/notifications.service';
import {
  WebFormSettingsData,
  validateAndSanitizeWebFormInput,
  getFallbackWebFormSettings,
  saveFallbackWebFormSettings,
  createDefaultWebFormSettings,
} from './web-form-settings.util';
import { UpdateWebFormSettingsDto, TestMailAccountDto } from './dto/settings.dto';

export interface CompanyBrandingConfig {
  companyDisplayName: string;
  companyPhone: string;
  companyLogoUrl: string | null;
}

export const DEFAULT_BRANDING: CompanyBrandingConfig = {
  companyDisplayName: BRAND_CONFIG.displayName,
  companyPhone: (process.env.DEFAULT_COMPANY_PHONE || '').trim(),
  companyLogoUrl: '/api/v1/settings/branding/logo',
};

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieve company branding for a specific tenant or user context
   */
  async getBranding(tenantId?: string): Promise<CompanyBrandingConfig> {
    try {
      if (tenantId && tenantId.trim()) {
        const cleanId = tenantId.trim();
        const tenant = await this.prisma.tenant.findFirst({
          where: {
            deletedAt: null,
            OR: [
              { id: cleanId },
              { code: { equals: cleanId.toUpperCase(), mode: 'insensitive' } },
              { slug: { equals: cleanId.toLowerCase(), mode: 'insensitive' } },
            ],
          },
          select: { name: true, phone: true, logoUrl: true },
        });

        if (tenant) {
          return {
            companyDisplayName: tenant.name || DEFAULT_BRANDING.companyDisplayName,
            companyPhone: tenant.phone || DEFAULT_BRANDING.companyPhone,
            companyLogoUrl:
              tenant.logoUrl && !tenant.logoUrl.startsWith('data:') && tenant.logoUrl.trim() !== ''
                ? tenant.logoUrl
                : (process.env.PRODUCT_LOGO_URL || '/logo.png'),
          };
        }
      }
    } catch (err: any) {
      this.logger.error(`Error reading company branding config: ${err.message}`);
    }
    return DEFAULT_BRANDING;
  }

  /**
   * Update company branding for the logged-in Tenant Admin's company
   */
  async updateBranding(
    user: ScopedUser,
    dto: {
      companyDisplayName?: string;
      companyPhone?: string;
      companyLogoUrl?: string | null;
    },
  ): Promise<CompanyBrandingConfig> {
    if (!user.tenantId) {
      throw new ForbiddenException('Platform administrator cannot modify company branding from the platform console.');
    }
    const tenantId = user.tenantId;

    if (user.role !== 'tenant_admin' && user.role !== 'admin') {
      throw new ForbiddenException('Only Administrators are authorized to modify Company Branding settings.');
    }

    let sanitizedLogoUrl = dto.companyLogoUrl;
    if (sanitizedLogoUrl && sanitizedLogoUrl.startsWith('data:')) {
      sanitizedLogoUrl = process.env.PRODUCT_LOGO_URL || '/logo.png';
    } else if (!sanitizedLogoUrl || sanitizedLogoUrl.trim() === '') {
      sanitizedLogoUrl = process.env.PRODUCT_LOGO_URL || '/logo.png';
    }

    const updatedTenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        name: dto.companyDisplayName?.trim(),
        phone: dto.companyPhone?.trim(),
        logoUrl: sanitizedLogoUrl,
      },
    });

    this.logger.log(
      `Tenant branding updated for ${updatedTenant.code} by ${user.employeeCode}: ${updatedTenant.name}`,
    );

    return {
      companyDisplayName: updatedTenant.name,
      companyPhone: updatedTenant.phone || DEFAULT_BRANDING.companyPhone,
      companyLogoUrl: updatedTenant.logoUrl || DEFAULT_BRANDING.companyLogoUrl,
    };
  }

  /**
   * Upload company logo file and persist across web, api, and database
   */
  async uploadLogo(file: Express.Multer.File, user: ScopedUser) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Invalid file upload. Image buffer is missing.');
    }

    const logoFile = process.env.PRODUCT_LOGO_PATH || 'logo.png';
    const destinations = [
      path.resolve(process.cwd(), 'apps/web/public', logoFile),
      path.resolve(process.cwd(), 'apps/api/assets', logoFile),
      path.resolve(process.cwd(), 'assets', logoFile),
      path.resolve(process.cwd(), 'apps/web/src/assets', logoFile),
    ];

    const distLogo = path.resolve(process.cwd(), 'apps/web/dist', logoFile);
    if (fs.existsSync(path.dirname(distLogo))) {
      destinations.push(distLogo);
    }

    for (const dest of destinations) {
      try {
        const dir = path.dirname(dest);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(dest, file.buffer);
      } catch (e: any) {
        this.logger.warn(`Could not write logo to ${dest}: ${e.message}`);
      }
    }

    const logoPath = `/${logoFile}`;

    if (user?.tenantId) {
      await this.prisma.tenant.update({
        where: { id: user.tenantId },
        data: {
          logoUrl: logoPath,
        },
      });
    }

    this.logger.log(`Branding logo updated by ${user.employeeCode || user.id}`);

    return {
      success: true,
      message: 'Company logo uploaded and updated successfully across all invoices and documents.',
      logoUrl: logoPath,
      timestamp: Date.now(),
    };
  }

  /**
   * Upload company favicon file
   */
  async uploadFavicon(file: Express.Multer.File, user: ScopedUser) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Invalid file upload. Buffer is missing.');
    }

    const destinations = [
      path.resolve(process.cwd(), 'apps/web/public/favicon.ico'),
      path.resolve(process.cwd(), 'apps/web/public/favicon.png'),
    ];

    for (const dest of destinations) {
      try {
        const dir = path.dirname(dest);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(dest, file.buffer);
      } catch (e: any) {
        this.logger.warn(`Could not write favicon to ${dest}: ${e.message}`);
      }
    }

    return {
      success: true,
      message: 'Favicon uploaded successfully',
      faviconUrl: '/favicon.ico',
    };
  }

  /**
   * Get full company invoicing & tax profile for tenant
   */
  async getCompanyProfile(user: ScopedUser) {
    if (!user.tenantId) {
      throw new ForbiddenException('Platform administrator cannot access tenant invoicing, banking, or tax profiles from the platform console.');
    }
    const tenantId = user.tenantId;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Company tenant not found');
    }

    return tenant;
  }

  /**
   * Update full company invoicing & tax profile for tenant
   */
  async updateCompanyProfile(user: ScopedUser, dto: any) {
    if (!user.tenantId) {
      throw new ForbiddenException('Platform administrator cannot update tenant invoicing, banking, or tax profiles from the platform console.');
    }
    const tenantId = user.tenantId;

    if (user.role !== 'tenant_admin' && user.role !== 'admin') {
      throw new ForbiddenException('Only Administrators can update Company Invoicing & Tax Profile.');
    }

    let sanitizedLogo = dto.logoUrl;
    if (sanitizedLogo && sanitizedLogo.startsWith('data:')) {
      sanitizedLogo = process.env.PRODUCT_LOGO_URL || '/logo.png';
    } else if (!sanitizedLogo || sanitizedLogo.trim() === '') {
      sanitizedLogo = process.env.PRODUCT_LOGO_URL || '/logo.png';
    }

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        name: dto.name?.trim(),
        phone: dto.phone?.trim(),
        email: dto.email?.trim(),
        address: dto.address?.trim(),
        city: dto.city?.trim(),
        state: dto.state?.trim(),
        pincode: dto.pincode?.trim(),
        website: dto.website?.trim(),
        gstin: dto.gstin?.trim()?.toUpperCase(),
        pan: dto.pan?.trim()?.toUpperCase(),
        lutBondNo: dto.lutBondNo?.trim(),
        lutValidity: dto.lutValidity?.trim(),
        invoicePrefix: dto.invoicePrefix?.trim()?.toUpperCase(),
        invoiceTerms: dto.invoiceTerms?.trim(),
        bankName: dto.bankName?.trim(),
        bankAccountNumber: dto.bankAccountNumber?.trim(),
        bankIfsc: dto.bankIfsc?.trim()?.toUpperCase(),
        bankBranch: dto.bankBranch?.trim(),
        bankUpi: dto.bankUpi?.trim(),
        signatoryName: dto.signatoryName?.trim(),
        signatoryDesignation: dto.signatoryDesignation?.trim(),
        signatureUrl: dto.signatureUrl,
        stampUrl: dto.stampUrl,
        logoUrl: sanitizedLogo,
        requireTwoFactor: dto.requireTwoFactor !== undefined ? Boolean(dto.requireTwoFactor) : undefined,
        isOnboarded: true,
      },
    });

    return updated;
  }

  // --- TENANT-SCOPED ISOLATED MAIL ACCOUNTS ---

  /**
   * SSRF and Port Verification Guard
   * Enforces allowed ports (465, 587, 2525) and blocks loopback, private, link-local, and cloud metadata.
   * Returns the verified resolved IP for DNS pinning.
   */
  async validateMailHostAndPort(host: string, port: number): Promise<string> {
    if (![465, 587, 2525].includes(port)) {
      throw new BadRequestException(
        `Port ${port} is not allowed. Only secure ports 465 (SSL), 587 (STARTTLS), or 2525 (Alternative TLS) are permitted.`,
      );
    }

    if (isInternalHostname(host)) {
      throw new BadRequestException('Security restriction: loopback, private, and internal hosts are prohibited.');
    }

    let resolvedIps: string[] = [];
    try {
      const lookups = await dns.promises.lookup(host, { all: true });
      resolvedIps = lookups.map((l) => l.address);
    } catch {
      throw new BadRequestException(`Host "${host}" could not be resolved in DNS.`);
    }

    if (resolvedIps.length === 0) {
      throw new BadRequestException(`Host "${host}" could not be resolved in DNS.`);
    }

    for (const ip of resolvedIps) {
      if (isPrivateOrBlockedIp(ip)) {
        throw new BadRequestException(
          'Security restriction: host resolves to loopback, private, link-local, or cloud metadata address.',
        );
      }
    }

    return resolvedIps[0];
  }

  /**
   * Database-backed rate limiter for mail account tests (5 tests per 10 minutes per user)
   */
  private async checkTestRateLimit(userId: string) {
    const identityKey = `mail_test:${userId}`;
    const now = new Date();
    const windowMs = 10 * 60 * 1000; // 10 minutes
    const maxTests = 5;

    const record = await this.prisma.accountLockout.findUnique({
      where: { identityKey },
    });

    if (record) {
      const elapsed = now.getTime() - new Date(record.lastAttemptAt).getTime();
      if (elapsed > windowMs) {
        await this.prisma.accountLockout.update({
          where: { identityKey },
          data: { failedAttempts: 1, lastAttemptAt: now, lockedUntil: null },
        });
      } else {
        if (record.failedAttempts >= maxTests) {
          throw new BadRequestException('Rate limit exceeded: maximum 5 mail tests per 10 minutes per user.');
        }
        await this.prisma.accountLockout.update({
          where: { identityKey },
          data: { failedAttempts: { increment: 1 }, lastAttemptAt: now },
        });
      }
    } else {
      await this.prisma.accountLockout.create({
        data: {
          identityKey,
          failedAttempts: 1,
          lastAttemptAt: now,
        },
      });
    }
  }

  async getMailAccounts(user: ScopedUser) {
    const tenantId = requireTenantId(user);

    if (user.role !== 'platform_super_admin' && user.role !== 'tenant_admin') {
      throw new ForbiddenException('Only Company Administrators can access Mail Account settings.');
    }

    const accounts = await this.prisma.mailAccount.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        tenantId: true,
        name: true,
        email: true,
        senderName: true,
        smtpHost: true,
        smtpPort: true,
        smtpUser: true,
        encryption: true,
        isSecure: true,
        purpose: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return accounts.map(acc => ({
      ...acc,
      encryption: acc.encryption || (acc.isSecure || acc.smtpPort === 465 ? 'ssl' : 'starttls'),
    }));
  }

  async createMailAccount(
    user: ScopedUser,
    dto: {
      name: string;
      email: string;
      senderName?: string;
      smtpHost: string;
      smtpPort?: number;
      smtpUser: string;
      smtpPass: string;
      encryption?: 'starttls' | 'ssl';
      isSecure?: boolean;
      purpose?: string;
      useForAllPurposes?: boolean;
    },
  ) {
    const tenantId = requireTenantId(user);

    if (user.role !== 'platform_super_admin' && user.role !== 'tenant_admin') {
      throw new ForbiddenException('Only Company Administrators can configure Mail Accounts.');
    }

    const port = dto.smtpPort ? Number(dto.smtpPort) : 587;
    // SSRF and allowed ports (465, 587, 2525) validation
    await this.validateMailHostAndPort(dto.smtpHost, port);

    const resolvedEncryption: 'starttls' | 'ssl' =
      dto.encryption || (dto.isSecure || port === 465 ? 'ssl' : 'starttls');
    const isSecure = resolvedEncryption === 'ssl' || Boolean(dto.isSecure) || port === 465;
    const purpose = dto.useForAllPurposes ? 'ALL' : (dto.purpose || 'PRIMARY_ALERTS');

    const encryptedPass = encryptAtRest(dto.smtpPass) || dto.smtpPass;
    const created = await this.prisma.mailAccount.create({
      data: {
        tenantId,
        name: dto.name,
        email: dto.email,
        senderName: dto.senderName,
        smtpHost: dto.smtpHost,
        smtpPort: port,
        smtpUser: dto.smtpUser,
        smtpPass: encryptedPass,
        encryption: resolvedEncryption,
        isSecure,
        purpose,
        createdById: user.id,
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        email: true,
        senderName: true,
        smtpHost: true,
        smtpPort: true,
        smtpUser: true,
        encryption: true,
        isSecure: true,
        purpose: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      ...created,
      encryption: created.encryption || resolvedEncryption,
    };
  }

  async updateMailAccount(
    user: ScopedUser,
    id: string,
    dto: {
      name?: string;
      email?: string;
      senderName?: string;
      smtpHost?: string;
      smtpPort?: number;
      smtpUser?: string;
      smtpPass?: string;
      encryption?: 'starttls' | 'ssl';
      isSecure?: boolean;
      purpose?: string;
      isActive?: boolean;
      useForAllPurposes?: boolean;
    },
  ) {
    const tenantId = requireTenantId(user);

    if (user.role !== 'platform_super_admin' && user.role !== 'tenant_admin') {
      throw new ForbiddenException('Only Company Administrators can modify Mail Accounts.');
    }

    const account = await this.prisma.mailAccount.findFirst({ where: { id, tenantId } });
    if (!account) {
      throw new NotFoundException('Mail account not found');
    }

    // When editing an account, an empty password field means keep the old one
    const encryptedPass = dto.smtpPass !== undefined && dto.smtpPass.trim() !== ''
      ? (encryptAtRest(dto.smtpPass) || dto.smtpPass)
      : undefined;

    const port = dto.smtpPort !== undefined ? Number(dto.smtpPort) : account.smtpPort;
    const host = dto.smtpHost !== undefined ? dto.smtpHost : account.smtpHost;
    if (dto.smtpHost !== undefined || dto.smtpPort !== undefined) {
      await this.validateMailHostAndPort(host, port);
    }

    const resolvedEncryption: 'starttls' | 'ssl' | undefined = dto.encryption
      ? dto.encryption
      : (dto.isSecure !== undefined ? (dto.isSecure ? 'ssl' : 'starttls') : (port === 465 ? 'ssl' : undefined));

    const isSecure = resolvedEncryption !== undefined
      ? (resolvedEncryption === 'ssl' || port === 465)
      : (dto.isSecure !== undefined ? Boolean(dto.isSecure) : undefined);

    const purpose = dto.useForAllPurposes ? 'ALL' : dto.purpose;

    await this.prisma.mailAccount.updateMany({
      where: { id, tenantId },
      data: {
        name: dto.name,
        email: dto.email,
        senderName: dto.senderName,
        smtpHost: dto.smtpHost,
        smtpPort: dto.smtpPort !== undefined ? Number(dto.smtpPort) : undefined,
        smtpUser: dto.smtpUser,
        smtpPass: encryptedPass,
        encryption: resolvedEncryption,
        isSecure,
        purpose,
        isActive: dto.isActive !== undefined ? Boolean(dto.isActive) : undefined,
      },
    });

    const updated = await this.prisma.mailAccount.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        tenantId: true,
        name: true,
        email: true,
        senderName: true,
        smtpHost: true,
        smtpPort: true,
        smtpUser: true,
        encryption: true,
        isSecure: true,
        purpose: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!updated) {
      throw new NotFoundException('Mail account not found after update');
    }

    return {
      ...updated,
      encryption: updated.encryption || (updated.isSecure || updated.smtpPort === 465 ? 'ssl' : 'starttls'),
    };
  }

  async deleteMailAccount(user: ScopedUser, id: string) {
    const tenantId = requireTenantId(user);

    if (user.role !== 'platform_super_admin' && user.role !== 'tenant_admin') {
      throw new ForbiddenException('Only Company Administrators can delete Mail Accounts.');
    }

    const account = await this.prisma.mailAccount.findFirst({ where: { id, tenantId } });
    if (!account) {
      throw new NotFoundException('Mail account not found');
    }

    await this.prisma.mailAccount.deleteMany({
      where: { id, tenantId },
    });
    return { success: true };
  }

  /**
   * Auto-detect SMTP Provider configuration from email domain & DNS MX records
   */
  async detectMailProvider(email: string) {
    if (!email || !email.includes('@')) {
      return {
        provider: 'custom',
        providerName: 'Custom SMTP',
        smtpHost: '',
        smtpPort: 587,
        encryption: 'starttls',
        notes: 'Please enter a valid email address.',
      };
    }

    const domain = email.split('@')[1]?.toLowerCase().trim();
    if (!domain) {
      return {
        provider: 'custom',
        providerName: 'Custom SMTP',
        smtpHost: '',
        smtpPort: 587,
        encryption: 'starttls',
        notes: 'Please enter a valid email address.',
      };
    }

    // 1. Direct Webmail Domain Matches
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
      return {
        provider: 'google',
        providerName: 'Google Workspace / Gmail',
        smtpHost: 'smtp.gmail.com',
        smtpPort: 465,
        encryption: 'ssl',
        notes: 'Google requires an App Password with 2-Step Verification enabled on your Google Account.',
      };
    }

    if (['outlook.com', 'hotmail.com', 'live.com', 'msn.com'].includes(domain)) {
      return {
        provider: 'microsoft365',
        providerName: 'Microsoft 365 / Outlook',
        smtpHost: 'smtp.office365.com',
        smtpPort: 587,
        encryption: 'starttls',
        notes: 'Microsoft 365 requires an App Password or SMTP AUTH enabled on the mailbox.',
      };
    }

    if (['zoho.com', 'zoho.in', 'zohomail.com'].includes(domain)) {
      return {
        provider: 'zoho',
        providerName: 'Zoho Mail',
        smtpHost: 'smtppro.zoho.com',
        smtpPort: 465,
        encryption: 'ssl',
        notes: 'Zoho Mail requires an Application-Specific Password with Two-Factor Authentication.',
      };
    }

    if (domain === 'secureserver.net') {
      return {
        provider: 'godaddy',
        providerName: 'GoDaddy',
        smtpHost: 'smtpout.secureserver.net',
        smtpPort: 465,
        encryption: 'ssl',
        notes: 'GoDaddy uses your full email address as username and port 465 (SSL) or 587 (STARTTLS).',
      };
    }

    // 2. DNS MX Records Auto-Detection for Custom Domains
    try {
      const mxRecords = await dns.promises.resolveMx(domain);
      if (mxRecords && mxRecords.length > 0) {
        mxRecords.sort((a, b) => a.priority - b.priority);
        const exchanges = mxRecords.map(r => r.exchange.toLowerCase());
        const hasMatch = (sub: string) => exchanges.some(ex => ex.includes(sub));

        if (hasMatch('google.com') || hasMatch('googlemail.com') || hasMatch('aspmx.l.google.com')) {
          return {
            provider: 'google',
            providerName: 'Google Workspace',
            smtpHost: 'smtp.gmail.com',
            smtpPort: 465,
            encryption: 'ssl',
            notes: 'Google Workspace requires an App Password with 2-Step Verification enabled on your Google Account.',
          };
        }

        if (hasMatch('outlook.com') || hasMatch('protection.outlook.com') || hasMatch('office365.com')) {
          return {
            provider: 'microsoft365',
            providerName: 'Microsoft 365',
            smtpHost: 'smtp.office365.com',
            smtpPort: 587,
            encryption: 'starttls',
            notes: 'Microsoft 365 requires an App Password or SMTP AUTH enabled on the mailbox.',
          };
        }

        if (hasMatch('secureserver.net')) {
          return {
            provider: 'godaddy',
            providerName: 'GoDaddy',
            smtpHost: 'smtpout.secureserver.net',
            smtpPort: 465,
            encryption: 'ssl',
            notes: 'GoDaddy uses your full email address as username and port 465 (SSL) or 587 (STARTTLS).',
          };
        }

        if (hasMatch('hostinger.com') || hasMatch('titan.email')) {
          return {
            provider: 'hostinger',
            providerName: 'Hostinger',
            smtpHost: 'smtp.hostinger.com',
            smtpPort: 465,
            encryption: 'ssl',
            notes: 'Hostinger uses your full email address and mailbox password with port 465 (SSL).',
          };
        }

        if (hasMatch('zoho.com') || hasMatch('zoho.in') || hasMatch('zoho.eu')) {
          return {
            provider: 'zoho',
            providerName: 'Zoho Mail',
            smtpHost: 'smtppro.zoho.com',
            smtpPort: 465,
            encryption: 'ssl',
            notes: 'Zoho Mail requires an Application-Specific Password with Two-Factor Authentication.',
          };
        }

        if (hasMatch('brevo.com') || hasMatch('sendinblue.com')) {
          return {
            provider: 'brevo',
            providerName: 'Brevo',
            smtpHost: 'smtp-relay.brevo.com',
            smtpPort: 587,
            encryption: 'starttls',
            notes: 'Brevo requires your SMTP key from the Brevo SMTP & API settings page.',
          };
        }
      }
    } catch (_) {
      // DNS MX lookup failed or timed out
    }

    // 3. Fallback for Unknown Provider
    return {
      provider: 'custom',
      providerName: 'Custom SMTP',
      smtpHost: '',
      smtpPort: 587,
      encryption: 'starttls',
      notes: 'Please enter your mail server host, port, and credentials manually.',
    };
  }

  /**
   * Test SMTP Mail Account Connection & Credentials
   */
  async testMailAccount(user: ScopedUser, dto: TestMailAccountDto) {
    if (user.role !== 'platform_super_admin' && user.role !== 'tenant_admin') {
      throw new ForbiddenException('Only Company Administrators can test Mail Accounts.');
    }

    // Enforce rate limit: 5 tests per 10 minutes per user
    await this.checkTestRateLimit(user.id);

    let smtpHost = dto.smtpHost;
    let smtpPort = dto.smtpPort;
    let encryption = dto.encryption;
    let smtpUser = dto.smtpUser;
    let smtpPass = dto.smtpPass;
    let email = dto.email;

    // If an existing account id is provided, fetch stored credentials as defaults
    if (dto.id) {
      const tenantId = requireTenantId(user);
      const existing = await this.prisma.mailAccount.findFirst({
        where: { id: dto.id, tenantId },
      });
      if (!existing) {
        throw new NotFoundException('Mail account not found');
      }

      smtpHost = smtpHost || existing.smtpHost;
      smtpPort = smtpPort || existing.smtpPort;
      encryption = encryption || (existing.encryption as any) || (existing.isSecure || existing.smtpPort === 465 ? 'ssl' : 'starttls');
      smtpUser = smtpUser || existing.smtpUser;
      smtpPass = (smtpPass && smtpPass.trim() !== '')
        ? smtpPass
        : (decryptAtRest(existing.smtpPass) || existing.smtpPass);
      email = email || existing.email;
    }

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
      throw new BadRequestException('smtpHost, smtpPort, smtpUser, and smtpPass are required to test connection.');
    }

    const port = Number(smtpPort);

    // 1. Allowed Ports Guard (Strict TLS Only)
    if (![465, 587, 2525].includes(port)) {
      return {
        result: 'port_blocked' as const,
        message: `Port ${port} is not allowed. Only secure ports 465 (SSL), 587 (STARTTLS), or 2525 (Alternative TLS) are permitted.`,
      };
    }

    // 2. SSRF Protection: Block internal and cloud metadata hostnames directly
    if (isInternalHostname(smtpHost)) {
      return {
        result: 'port_blocked' as const,
        message: 'Security restriction: loopback, private, and internal hosts are prohibited.',
      };
    }

    // 3. DNS Lookup & IP Range Verification
    let resolvedIps: string[] = [];
    try {
      const lookups = await dns.promises.lookup(smtpHost, { all: true });
      resolvedIps = lookups.map(l => l.address);
    } catch (err: any) {
      return {
        result: 'host_not_found' as const,
        message: `Host "${smtpHost}" could not be resolved in DNS.`,
      };
    }

    if (resolvedIps.length === 0) {
      return {
        result: 'host_not_found' as const,
        message: `Host "${smtpHost}" could not be resolved in DNS.`,
      };
    }

    for (const ip of resolvedIps) {
      if (isPrivateOrBlockedIp(ip)) {
        return {
          result: 'port_blocked' as const,
          message: 'Security restriction: loopback, private, link-local, and cloud metadata addresses are prohibited.',
        };
      }
    }

    // 4. Connect, TLS negotiation, and authentication check
    // Connect to already checked IP address with TLS servername (DNS Pinning)
    const checkedIp = resolvedIps[0];
    const isSsl = encryption === 'ssl' || port === 465;
    const transporter = nodemailer.createTransport({
      host: checkedIp,
      port,
      secure: isSsl,
      requireTLS: !isSsl,
      tls: {
        servername: smtpHost,
      },
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    } as any);

    try {
      await transporter.verify();

      // Optionally send one test email to the logged in admin's verified address
      if (dto.sendTestEmail) {
        let recipientEmail: string | null = null;
        const dbUser = await this.prisma.user.findUnique({
          where: { id: user.id },
          select: { email: true },
        });
        if (dbUser?.email) {
          recipientEmail = dbUser.email;
        } else {
          const platformAdmin = await (this.prisma as any).platformAdmin?.findUnique({
            where: { id: user.id },
            select: { email: true },
          });
          if (platformAdmin?.email) {
            recipientEmail = platformAdmin.email;
          }
        }

        if (recipientEmail) {
          const prodName = process.env.PRODUCT_NAME || BRAND_CONFIG.displayName || 'CRM';
          await transporter.sendMail({
            from: `"${prodName} Mail Test" <${email || smtpUser}>`,
            to: recipientEmail,
            subject: `[${prodName}] SMTP Mail Connection Test Successful`,
            html: `<div style="font-family:sans-serif;padding:20px;border:1px solid #e2e8f0;border-radius:8px;">
              <h2 style="color:#059669;margin-top:0;">SMTP Connection Verified</h2>
              <p>Your mail account <strong>${email || smtpUser}</strong> connected to <strong>${smtpHost}:${port}</strong> with strict TLS encryption.</p>
              <p style="font-size:12px;color:#64748b;margin-top:16px;">Verified at: ${new Date().toISOString()}</p>
            </div>`,
            text: `SMTP Connection Verified for ${email || smtpUser} on ${smtpHost}:${port}`,
          });
        }
      }

      return {
        result: 'ok' as const,
        message: 'SMTP connection, TLS negotiation, and authentication succeeded.',
      };
    } catch (err: any) {
      if (isCertificateError(err)) {
        return {
          result: 'certificate_error' as const,
          message: 'The mail server certificate is not trusted.',
        };
      }

      const msg = (err.message || '').toLowerCase();
      const code = (err.code || '').toUpperCase();

      if (
        code === 'EAUTH' ||
        err.responseCode === 535 ||
        msg.includes('auth') ||
        msg.includes('535') ||
        msg.includes('invalid login') ||
        msg.includes('credentials') ||
        msg.includes('username and password not accepted')
      ) {
        return {
          result: 'auth_failed' as const,
          message: 'Authentication failed: invalid SMTP username or password.',
        };
      }

      if (code === 'ECONNREFUSED' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || msg.includes('refused')) {
        return {
          result: 'port_blocked' as const,
          message: `Connection refused on port ${port}. Check firewall or verify the port is open.`,
        };
      }

      if (code === 'ETIMEDOUT' || code === 'ESOCKET' || msg.includes('timeout') || msg.includes('timed out')) {
        return {
          result: 'timeout' as const,
          message: 'Connection timed out after 10 seconds. Check server responsiveness or network routing.',
        };
      }

      if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
        return {
          result: 'host_not_found' as const,
          message: `Host "${smtpHost}" could not be resolved in DNS.`,
        };
      }

      return {
        result: 'port_blocked' as const,
        message: err.message || 'SMTP connection verification failed.',
      };
    }
  }

  /**
   * Check SPF, DKIM, and DMARC DNS health records for a mail account domain
   */
  async getDomainHealth(user: ScopedUser, id: string) {
    const tenantId = requireTenantId(user);
    const account = await this.prisma.mailAccount.findFirst({
      where: { id, tenantId },
    });
    if (!account) {
      throw new NotFoundException('Mail account not found');
    }

    const domain = account.email.split('@')[1]?.toLowerCase().trim();
    if (!domain) {
      throw new BadRequestException('Invalid email address on mail account');
    }

    // 1. SPF Check
    let spfResult: { status: 'found' | 'missing' | 'invalid'; record?: string; fix: string } = {
      status: 'missing',
      fix: `Add a TXT record for @ with value "v=spf1 include:_spf.${account.smtpHost.includes('google') ? 'google.com' : 'secureserver.net'} ~all"`,
    };

    try {
      const txtRecords = await dns.promises.resolveTxt(domain);
      const spfRecord = txtRecords
        .map(chunks => chunks.join(''))
        .find(txt => txt.trim().toLowerCase().startsWith('v=spf1'));

      if (spfRecord) {
        if (spfRecord.includes('~all') || spfRecord.includes('-all') || spfRecord.includes('?all') || spfRecord.includes('+all')) {
          spfResult = {
            status: 'found',
            record: spfRecord,
            fix: 'SPF record is present and properly configured.',
          };
        } else {
          spfResult = {
            status: 'invalid',
            record: spfRecord,
            fix: 'Add "~all" or "-all" to the end of your SPF TXT record.',
          };
        }
      }
    } catch (_) {
      // DNS lookup failure
    }

    // 2. DKIM Check across common and provider selectors
    const candidateSelectors = ['google', 'default', 'k1', 's1', 's2', 'mail', 'godaddy', 'zoho'];
    let dkimResult: { status: 'found' | 'not_found_common' | 'invalid'; selector?: string; record?: string; fix: string } = {
      status: 'not_found_common',
      fix: `DKIM record not found for common selector names (${candidateSelectors.join(', ')}). Check your email provider DNS settings for the exact selector name configured for your domain.`,
    };

    for (const selector of candidateSelectors) {
      try {
        const dkimDomain = `${selector}._domainkey.${domain}`;
        const dkimTxtRecords = await dns.promises.resolveTxt(dkimDomain);
        const dkimRecord = dkimTxtRecords
          .map(chunks => chunks.join(''))
          .find(txt => txt.includes('v=DKIM1') || txt.includes('k=rsa') || txt.includes('p='));

        if (dkimRecord) {
          dkimResult = {
            status: 'found',
            selector,
            record: dkimRecord,
            fix: `DKIM record verified at ${selector}._domainkey.${domain}.`,
          };
          break;
        }
      } catch (_) {
        // Continue searching next selector
      }
    }

    // 3. DMARC Check
    let dmarcResult: { status: 'found' | 'missing' | 'invalid'; record?: string; fix: string } = {
      status: 'missing',
      fix: `Add a TXT record for _dmarc with value "v=DMARC1; p=none; rua=mailto:dmarc-reports@${domain}".`,
    };

    try {
      const dmarcDomain = `_dmarc.${domain}`;
      const dmarcTxtRecords = await dns.promises.resolveTxt(dmarcDomain);
      const dmarcRecord = dmarcTxtRecords
        .map(chunks => chunks.join(''))
        .find(txt => txt.trim().toLowerCase().startsWith('v=dmarc1'));

      if (dmarcRecord) {
        if (dmarcRecord.includes('p=')) {
          dmarcResult = {
            status: 'found',
            record: dmarcRecord,
            fix: 'DMARC record is verified and active.',
          };
        } else {
          dmarcResult = {
            status: 'invalid',
            record: dmarcRecord,
            fix: 'Specify a policy (e.g. p=none, p=quarantine, or p=reject) in your DMARC record.',
          };
        }
      }
    } catch (_) {
      // DNS lookup failure
    }

    return {
      domain,
      spf: spfResult,
      dkim: dkimResult,
      dmarc: dmarcResult,
    };
  }

  /**
   * Serve public tenant-keyed branding image (logo or stamp)
   * Public route with Cross-Origin-Resource-Policy: cross-origin and long cache
   */
  async servePublicBrandingImage(type: 'logo' | 'stamp', tenantKey: string | undefined, res: any) {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    let tenant: any = null;
    try {
      if (tenantKey) {
        tenant = await this.prisma.tenant.findFirst({
          where: {
            OR: [{ id: tenantKey }, { code: tenantKey }, { slug: tenantKey }],
            deletedAt: null,
          },
        });
      }
    } catch (e) {
      // ignore
    }

    const imgVal = type === 'stamp' ? tenant?.stampUrl : tenant?.logoUrl;

    if (imgVal) {
      if (imgVal.startsWith('data:image/')) {
        const matches = imgVal.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const contentType = matches[1];
          const buffer = Buffer.from(matches[2], 'base64');
          res.setHeader('Content-Type', contentType);
          return res.send(buffer);
        }
      } else {
        const cleanVal = imgVal.replace(/^\/+/, '');
        const candidatePaths = [
          path.resolve(process.cwd(), 'apps/web/public', cleanVal),
          path.resolve(process.cwd(), 'apps/api/assets', cleanVal),
          path.resolve(process.cwd(), cleanVal),
        ];
        for (const candidate of candidatePaths) {
          if (fs.existsSync(candidate)) {
            const ext = path.extname(candidate).toLowerCase();
            const mime = ext === '.png' ? 'image/png' : ext === '.svg' ? 'image/svg+xml' : 'image/jpeg';
            res.setHeader('Content-Type', mime);
            return res.sendFile(path.resolve(candidate));
          }
        }
      }
    }

    // Default logo fallback
    const logoCandidates = [process.env.PRODUCT_LOGO_PATH, 'logo.png', 'logo.jpg', 'logo-icon.png', 'logo-full.png'].filter(Boolean);
    const candidateDirs = [
      path.resolve(process.cwd(), 'apps/api/assets'),
      path.resolve(process.cwd(), 'apps/web/public'),
      path.resolve(process.cwd(), 'assets'),
      path.resolve(__dirname, '../../assets'),
      path.resolve(__dirname, '../../../assets'),
      path.resolve(__dirname, '../../../../assets'),
    ];

    for (const dir of candidateDirs) {
      for (const file of logoCandidates) {
        const fullPath = path.resolve(dir, file as string);
        if (fs.existsSync(fullPath)) {
          const ext = path.extname(fullPath).toLowerCase();
          const mime = ext === '.png' ? 'image/png' : ext === '.svg' ? 'image/svg+xml' : 'image/jpeg';
          res.setHeader('Content-Type', mime);
          return res.sendFile(fullPath);
        }
      }
    }

    return res.status(404).send('Branding image not found');
  }

  /**
   * GET /settings/web-form
   * Retrieve tenant-specific web form settings
   */
  async getWebFormSettings(tenantId: string): Promise<WebFormSettingsData> {
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
    } catch (err: any) {
      // If table doesn't exist yet, seamlessly use persistent fallback store
    }
    return getFallbackWebFormSettings(tenantId);
  }

  /**
   * PUT /settings/web-form
   * Update tenant-specific web form settings (tenant_admin or admin only)
   */
  async updateWebFormSettings(
    user: ScopedUser,
    dto: UpdateWebFormSettingsDto,
  ): Promise<WebFormSettingsData> {
    const tenantId = requireTenantId(user);
    if (user.role !== 'tenant_admin' && user.role !== 'admin') {
      throw new ForbiddenException('Only Administrators are authorized to modify Web Form settings.');
    }

    const validated = validateAndSanitizeWebFormInput(dto);

    try {
      if ((this.prisma as any).webFormSettings) {
        const record = await (this.prisma as any).webFormSettings.upsert({
          where: { tenantId },
          create: {
            tenantId,
            ...createDefaultWebFormSettings(tenantId),
            ...validated,
          },
          update: validated,
        });
        saveFallbackWebFormSettings(tenantId, validated);
        return {
          ...record,
          products: Array.isArray(record.products) ? record.products : JSON.parse(record.products || '[]'),
          fields: typeof record.fields === 'object' ? record.fields : JSON.parse(record.fields || '{}'),
          allowedOrigins: Array.isArray(record.allowedOrigins) ? record.allowedOrigins : JSON.parse(record.allowedOrigins || '[]'),
        };
      }
    } catch (err: any) {
      this.logger.warn(`Prisma WebFormSettings unavailable, updating fallback store: ${err.message}`);
    }

    return saveFallbackWebFormSettings(tenantId, validated);
  }
}

