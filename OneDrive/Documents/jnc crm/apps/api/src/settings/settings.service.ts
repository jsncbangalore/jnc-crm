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
import { encryptAtRest } from '../common/encryption.util';
import { BRAND_CONFIG } from '../common/brand';
import * as fs from 'fs';
import * as path from 'path';
import {
  WebFormSettingsData,
  validateAndSanitizeWebFormInput,
  getFallbackWebFormSettings,
  saveFallbackWebFormSettings,
  createDefaultWebFormSettings,
} from './web-form-settings.util';
import { UpdateWebFormSettingsDto } from './dto/settings.dto';

export interface CompanyBrandingConfig {
  companyDisplayName: string;
  companyPhone: string;
  companyLogoUrl: string | null;
}

export const DEFAULT_BRANDING: CompanyBrandingConfig = {
  companyDisplayName: BRAND_CONFIG.displayName,
  companyPhone: '+91 9876543210',
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
                : '/jnc-logo.jpg',
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
      sanitizedLogoUrl = '/jnc-logo.jpg';
    } else if (!sanitizedLogoUrl || sanitizedLogoUrl.trim() === '') {
      sanitizedLogoUrl = '/jnc-logo.jpg';
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

    const destinations = [
      path.resolve(process.cwd(), 'apps/web/public/jnc-logo.jpg'),
      path.resolve(process.cwd(), 'apps/api/assets/jnc-logo.jpg'),
      path.resolve(process.cwd(), 'assets/jnc-logo.jpg'),
      path.resolve(process.cwd(), 'apps/web/src/assets/jnc-logo.jpg'),
    ];

    const distLogo = path.resolve(process.cwd(), 'apps/web/dist/jnc-logo.jpg');
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

    const logoPath = '/jnc-logo.jpg';

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
      sanitizedLogo = '/jnc-logo.jpg';
    } else if (!sanitizedLogo || sanitizedLogo.trim() === '') {
      sanitizedLogo = '/jnc-logo.jpg';
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
        isOnboarded: true,
      },
    });

    return updated;
  }

  // --- TENANT-SCOPED ISOLATED MAIL ACCOUNTS ---

  async getMailAccounts(user: ScopedUser) {
    const tenantId = requireTenantId(user);

    if (user.role !== 'platform_super_admin' && user.role !== 'tenant_admin') {
      throw new ForbiddenException('Only Company Administrators can access Mail Account settings.');
    }

    return this.prisma.mailAccount.findMany({
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
        isSecure: true,
        purpose: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
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
      isSecure?: boolean;
      purpose?: string;
    },
  ) {
    const tenantId = requireTenantId(user);

    if (user.role !== 'platform_super_admin' && user.role !== 'tenant_admin') {
      throw new ForbiddenException('Only Company Administrators can configure Mail Accounts.');
    }

    const encryptedPass = encryptAtRest(dto.smtpPass) || dto.smtpPass;
    const created = await this.prisma.mailAccount.create({
      data: {
        tenantId,
        name: dto.name,
        email: dto.email,
        senderName: dto.senderName,
        smtpHost: dto.smtpHost,
        smtpPort: dto.smtpPort ? Number(dto.smtpPort) : 587,
        smtpUser: dto.smtpUser,
        smtpPass: encryptedPass,
        isSecure: Boolean(dto.isSecure),
        purpose: dto.purpose || 'PRIMARY_ALERTS',
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
        isSecure: true,
        purpose: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return created;
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
      isSecure?: boolean;
      purpose?: string;
      isActive?: boolean;
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

    const encryptedPass = dto.smtpPass !== undefined && dto.smtpPass !== ''
      ? (encryptAtRest(dto.smtpPass) || dto.smtpPass)
      : undefined;

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
        isSecure: dto.isSecure !== undefined ? Boolean(dto.isSecure) : undefined,
        purpose: dto.purpose,
        isActive: dto.isActive !== undefined ? Boolean(dto.isActive) : undefined,
      },
    });
    return this.prisma.mailAccount.findFirst({
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
        isSecure: true,
        purpose: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
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
    const defaultLogoPaths = [
      path.resolve(process.cwd(), 'apps/web/public/jnc-logo.jpg'),
      path.resolve(process.cwd(), 'apps/api/assets/jnc-logo.jpg'),
      path.resolve(process.cwd(), 'assets/jnc-logo.jpg'),
      path.resolve(__dirname, '../../assets/jnc-logo.jpg'),
      path.resolve(__dirname, '../../../assets/jnc-logo.jpg'),
    ];

    for (const p of defaultLogoPaths) {
      if (fs.existsSync(p)) {
        res.setHeader('Content-Type', 'image/jpeg');
        return res.sendFile(p);
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

