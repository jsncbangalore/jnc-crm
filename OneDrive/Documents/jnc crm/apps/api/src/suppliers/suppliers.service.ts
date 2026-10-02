/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopedUser } from '../auth/scoping.service';

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
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateSupplierDto, user?: ScopedUser) {
    const tenantId = user?.tenantId || 'default-tenant-id';
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
      },
    });
  }

  async findAll(user?: ScopedUser, query: { search?: string; isActive?: boolean } = {}) {
    const tenantId = user?.tenantId || 'default-tenant-id';
    const where: any = { deletedAt: null, tenantId };
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
    const tenantId = user?.tenantId || 'default-tenant-id';
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId },
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
    await this.findOne(id, user);
    return this.prisma.supplier.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: string, user?: ScopedUser) {
    await this.findOne(id, user);
    return this.prisma.supplier.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async countActiveSuppliers(user?: ScopedUser): Promise<number> {
    const tenantId = user?.tenantId || 'default-tenant-id';
    return this.prisma.supplier.count({
      where: {
        tenantId,
        isActive: true,
        deletedAt: null,
      },
    });
  }
}
