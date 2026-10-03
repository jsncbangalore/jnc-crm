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

export interface CreateSupplierDto {
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  gstin?: string;
  address?: string;
  city?: string;
  leadTimeDays?: number;
  notes?: string;
}

@Injectable()
export class SuppliersService {
  constructor(
    private prisma: PrismaService,
    private scopingService: ScopingService,
  ) {}

  async create(dto: CreateSupplierDto, user?: ScopedUser) {
    const tenantId = requireTenantId(user);
    return this.prisma.supplier.create({
      data: {
        tenantId,
        name: dto.name,
        contactPerson: dto.contactPerson,
        email: dto.email,
        phone: dto.phone,
        gstin: dto.gstin,
        address: dto.address,
        city: dto.city,
        leadTimeDays: dto.leadTimeDays ? Number(dto.leadTimeDays) : 7,
        notes: dto.notes,
        createdById: user?.id ?? null,
      },
    });
  }

  async findAll(user?: ScopedUser, query: { search?: string; isActive?: boolean } = {}) {
    const scope = user ? this.scopingService.getSupplierScope(user) : { tenantId: requireTenantId(user) };
    const where: any = { deletedAt: null, ...scope };
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search } },
        { contactPerson: { contains: query.search } },
        { city: { contains: query.search } },
        { email: { contains: query.search } },
        { gstin: { contains: query.search } },
      ];
    }

    return this.prisma.supplier.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        preferredSkus: {
          select: { id: true, skuCode: true, name: true, category: true },
        },
        _count: {
          select: { stockMovements: true, preferredSkus: true },
        },
      },
    });
  }

  async findOne(id: string, user?: ScopedUser) {
    const scope = user ? this.scopingService.getSupplierScope(user) : { tenantId: requireTenantId(user) };
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, ...scope },
      include: {
        preferredSkus: true,
        stockMovements: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: { sku: true },
        },
      },
    });

    if (!supplier || supplier.deletedAt) {
      throw new NotFoundException('Supplier not found');
    }

    return supplier;
  }

  async update(id: string, dto: Partial<CreateSupplierDto>, user?: ScopedUser) {
    const scope = user ? this.scopingService.getSupplierScope(user) : { tenantId: requireTenantId(user) };
    const res = await this.prisma.supplier.updateMany({
      where: { id, ...scope, deletedAt: null },
      data: dto,
    });
    if (res.count === 0) {
      throw new NotFoundException('Supplier not found');
    }
    return this.findOne(id, user);
  }

  async delete(id: string, user?: ScopedUser) {
    const scope = user ? this.scopingService.getSupplierScope(user) : { tenantId: requireTenantId(user) };
    const res = await this.prisma.supplier.updateMany({
      where: { id, ...scope, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) {
      throw new NotFoundException('Supplier not found');
    }
    return { success: true };
  }

  async countActiveSuppliers(user?: ScopedUser): Promise<number> {
    const tenantId = requireTenantId(user);
    return this.prisma.supplier.count({
      where: {
        tenantId,
        isActive: true,
        deletedAt: null,
      },
    });
  }
}
