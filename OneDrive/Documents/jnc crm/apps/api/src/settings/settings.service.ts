/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopedUser } from '../auth/scoping.service';
import { requireTenantId } from '../common/tenant.util';
import { encryptAtRest } from '../common/encryption.util';

export interface CompanyBrandingConfig {
  companyDisplayName: string;
  companyPhone: string;
  companyLogoUrl: string | null;
}

export const DEFAULT_BRANDING: CompanyBrandingConfig = {
  companyDisplayName: 'JS Network Communication',
  companyPhone: '+91 9663421455',
  companyLogoUrl: '/jnc-logo.jpg',
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
      let tenant = null;
      if (tenantId) {
        tenant = await this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true, phone: true, logoUrl: true },
        });
      } else {
        tenant = await this.prisma.tenant.findFirst({
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: { name: true, phone: true, logoUrl: true },
        });
      }

      if (tenant) {
        return {
          companyDisplayName: tenant.name || DEFAULT_BRANDING.companyDisplayName,
          companyPhone: tenant.phone || DEFAULT_BRANDING.companyPhone,
          companyLogoUrl: tenant.logoUrl || DEFAULT_BRANDING.companyLogoUrl,
        };
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

    const updatedTenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        name: dto.companyDisplayName?.trim(),
        phone: dto.companyPhone?.trim(),
        logoUrl: dto.companyLogoUrl,
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
        logoUrl: dto.logoUrl,
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
}
