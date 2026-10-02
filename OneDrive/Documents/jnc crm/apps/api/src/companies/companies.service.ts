/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopedUser } from '../auth/scoping.service';
import { requireTenantId } from '../common/tenant.util';

export interface CreateCompanyDto {
  name: string;
  gstin?: string;
  industry?: string;
  address?: string;
  city?: string;
  state?: string;
  website?: string;
  billingEmail?: string;
}

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

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
      },
    });
  }

  async findAll(user: ScopedUser, query?: { search?: string }) {
    const tenantId = requireTenantId(user);
    const where: any = { tenantId, deletedAt: null };
    if (query?.search) {
      where.OR = [
        { name: { contains: query.search } },
        { gstin: { contains: query.search } },
        { city: { contains: query.search } },
        { billingEmail: { contains: query.search } },
      ];
    }

    return this.prisma.company.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        contacts: {
          where: { deletedAt: null },
          orderBy: { isPrimary: 'desc' },
        },
        _count: {
          select: { leads: true, contacts: true, invoices: true },
        },
      },
    });
  }

  async findOne(id: string, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const company = await this.prisma.company.findFirst({
      where: { id, tenantId },
      include: {
        contacts: {
          where: { deletedAt: null },
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

    return company;
  }

  async update(id: string, dto: Partial<CreateCompanyDto>, user: ScopedUser) {
    await this.findOne(id, user);
    return this.prisma.company.update({
      where: { id },
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
  }

  async delete(id: string, user: ScopedUser) {
    await this.findOne(id, user);
    return this.prisma.company.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
