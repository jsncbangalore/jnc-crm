/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopingService, ScopedUser } from '../auth/scoping.service';
import { requireTenantId } from '../common/tenant.util';
import { parsePagination } from '../common/pagination.util';
import { getEffectivePagesForUser } from '../auth/effective-page-access';
import { isPlatformOwner } from '../auth/roles';

import { IsString, IsNotEmpty, IsOptional, IsEmail, IsBoolean } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  gstin?: string;

  @IsString()
  @IsOptional()
  industry?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  website?: string;

  @IsEmail()
  @IsOptional()
  billingEmail?: string;
}

export class UpdateCompanyDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  gstin?: string;

  @IsString()
  @IsOptional()
  industry?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  website?: string;

  @IsEmail()
  @IsOptional()
  billingEmail?: string;
}

export class CreateContactDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsOptional()
  designation?: string;

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;
}

@Injectable()
export class CompaniesService {
  constructor(
    private prisma: PrismaService,
    private scopingService: ScopingService,
  ) {}

  async create(dto: CreateCompanyDto, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    return this.prisma.company.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        gstin: dto.gstin?.trim() || null,
        industry: dto.industry?.trim() || null,
        address: dto.address?.trim() || null,
        city: dto.city?.trim() || null,
        state: dto.state?.trim() || 'Karnataka',
        website: dto.website?.trim() || null,
        billingEmail: dto.billingEmail?.trim().toLowerCase() || null,
        createdById: user.id,
      },
    });
  }

  async findAll(user: ScopedUser, query?: { search?: string; page?: number; limit?: number }) {
    const scope = this.scopingService.getCompanyScope(user);
    const where: any = { ...scope, deletedAt: null };
    if (query?.search) {
      const searchOR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { gstin: { contains: query.search, mode: 'insensitive' } },
        { city: { contains: query.search, mode: 'insensitive' } },
        { billingEmail: { contains: query.search, mode: 'insensitive' } },
      ];
      if (scope.OR) {
        where.AND = [{ OR: scope.OR }, { OR: searchOR }];
        delete where.OR;
      } else {
        where.OR = searchOR;
      }
    }

    const { skip, take } = parsePagination(query, 100, 100);

    const effectivePages = await getEffectivePagesForUser(this.prisma, user);
    const hasInvoices = isPlatformOwner(user) || user.role === 'tenant_admin' || effectivePages.includes('invoices');
    const hasLeads = isPlatformOwner(user) || user.role === 'tenant_admin' || effectivePages.includes('leads');

    const companies = await this.prisma.company.findMany({
      where,
      skip,
      take,
      orderBy: { name: 'asc' },
      include: {
        contacts: {
          where: { deletedAt: null, ...this.scopingService.getContactScope(user) },
          orderBy: { isPrimary: 'desc' },
        },
        _count: {
          select: { leads: true, contacts: true, invoices: true },
        },
      },
    });

    return companies.map((c: any) => {
      const counts = { ...c._count };
      if (!hasInvoices) counts.invoices = 0;
      if (!hasLeads) counts.leads = 0;
      return { ...c, _count: counts };
    });
  }

  async findOne(id: string, user: ScopedUser) {
    const scope = this.scopingService.getCompanyScope(user);
    const effectivePages = await getEffectivePagesForUser(this.prisma, user);
    const hasInvoices = isPlatformOwner(user) || user.role === 'tenant_admin' || effectivePages.includes('invoices');
    const hasLeads = isPlatformOwner(user) || user.role === 'tenant_admin' || effectivePages.includes('leads');

    const company: any = await this.prisma.company.findFirst({
      where: { id, ...scope, deletedAt: null },
      include: {
        contacts: {
          where: { deletedAt: null, ...this.scopingService.getContactScope(user) },
          orderBy: { isPrimary: 'desc' },
        },
        leads: {
          where: { deletedAt: null },
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        invoices: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!company || company.deletedAt) {
      throw new NotFoundException('Company not found');
    }

    if (!hasInvoices) {
      company.invoices = [];
    }
    if (!hasLeads) {
      company.leads = [];
    }

    return company;
  }

  async update(id: string, dto: Partial<CreateCompanyDto>, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const scope = this.scopingService.getCompanyScope(user);
    const res = await this.prisma.company.updateMany({
      where: { id, tenantId, ...scope, deletedAt: null },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.gstin !== undefined && { gstin: dto.gstin?.trim() || null }),
        ...(dto.industry !== undefined && { industry: dto.industry?.trim() || null }),
        ...(dto.address !== undefined && { address: dto.address?.trim() || null }),
        ...(dto.city !== undefined && { city: dto.city?.trim() || null }),
        ...(dto.state !== undefined && { state: dto.state?.trim() || 'Karnataka' }),
        ...(dto.website !== undefined && { website: dto.website?.trim() || null }),
        ...(dto.billingEmail !== undefined && { billingEmail: dto.billingEmail?.trim().toLowerCase() || null }),
      },
    });
    if (res.count === 0) throw new NotFoundException('Company not found');
    return this.findOne(id, user);
  }

  async delete(id: string, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const scope = this.scopingService.getCompanyScope(user);
    const res = await this.prisma.company.updateMany({
      where: { id, tenantId, ...scope, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundException('Company not found');
    return { success: true };
  }

  async getContacts(companyId: string, user: ScopedUser) {
    await this.findOne(companyId, user);
    const tenantId = requireTenantId(user);
    const scope = this.scopingService.getContactScope(user);
    return this.prisma.contact.findMany({
      where: { companyId, tenantId, ...scope, deletedAt: null },
      orderBy: { isPrimary: 'desc' },
    });
  }

  async addContact(companyId: string, dto: CreateContactDto, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, tenantId, deletedAt: null },
    });
    if (!company) throw new NotFoundException('Company not found');

    return this.prisma.contact.create({
      data: {
        ...dto,
        name: dto.name?.trim(),
        email: dto.email?.trim().toLowerCase() || null,
        phone: dto.phone?.trim(),
        designation: dto.designation?.trim() || null,
        isPrimary: !!dto.isPrimary,
        tenantId,
        companyId: company.id,
        createdById: user.id,
      },
    });
  }
}
