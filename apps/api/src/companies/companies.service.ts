/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopingService, ScopedUser } from '../auth/scoping.service';
import { requireTenantId } from '../common/tenant.util';
import { parsePagination } from '../common/pagination.util';
import { getEffectivePagesForUser } from '../auth/effective-page-access';
import { isPlatformOwner } from '../auth/roles';
import { AuditService } from '../audit/audit.service';

import { IsString, IsNotEmpty, IsOptional, IsEmail, IsBoolean, MaxLength } from 'class-validator';
import {
  SanitizeText,
  TrimString,
  IsValidName,
  IsValidContactName,
  IsValidPhone,
  IsValidEmail,
} from '../common/validation.transformers';
import { normalizeToE164 } from '../common/shared-validation';

export function cleanCustomerName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\b(pvt|ltd|private|limited|llp|inc|corp|corporation|co|company|enterprises|enterprise|industries|trading|traders|agency|services|solutions)\b/gi, '')
    .replace(/[^a-z0-9]/gi, '')
    .trim();
}

export class RegisterAndLinkCustomerDto {
  @SanitizeText()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  gstin?: string;

  @TrimString()
  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;
}

export class MergeCustomerDto {
  @IsString()
  @IsNotEmpty()
  sourceCompanyId: string;

  @IsString()
  @IsNotEmpty()
  targetCompanyId: string;
}

export class CreateCompanyDto {
  @SanitizeText()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @IsValidName()
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

  @TrimString()
  @IsString()
  @IsOptional()
  @MaxLength(20)
  @IsValidPhone()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  pincode?: string;

  @IsString()
  @IsOptional()
  pan?: string;
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

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  pincode?: string;

  @IsString()
  @IsOptional()
  pan?: string;
}

export class CreateContactDto {
  @SanitizeText()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  @IsValidContactName(60)
  name: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @IsValidPhone()
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
    private auditService: AuditService,
  ) {}

  async create(dto: CreateCompanyDto, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const email = (dto.billingEmail || dto.email)?.trim().toLowerCase() || null;
    const phone = dto.phone?.trim() ? normalizeToE164(dto.phone) : null;

    const company = await this.prisma.company.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        gstin: dto.gstin?.trim() || null,
        industry: dto.industry?.trim() || null,
        address: dto.address?.trim() || null,
        city: dto.city?.trim() || null,
        state: dto.state?.trim() || 'Karnataka',
        website: dto.website?.trim() || null,
        billingEmail: email,
        createdById: user.id,
      },
    });

    if (phone || email) {
      await this.prisma.contact.create({
        data: {
          tenantId,
          companyId: company.id,
          name: dto.name.trim(),
          phone: phone || '-',
          email: email,
          isPrimary: true,
          createdById: user.id,
        },
      });
    }

    return {
      ...company,
      phone,
      email: company.billingEmail,
    };
  }

  async findAll(user: ScopedUser, query?: { search?: string; page?: number; limit?: number }) {
    const scope = this.scopingService.getCompanyScope(user);
    const where: any = { ...scope, deletedAt: null };
    if (query?.search) {
      const rawSearch = query.search.trim();
      const digitsOnly = rawSearch.replace(/\D/g, '');
      const searchOR: any[] = [
        { name: { contains: rawSearch, mode: 'insensitive' } },
        { gstin: { contains: rawSearch, mode: 'insensitive' } },
        { city: { contains: rawSearch, mode: 'insensitive' } },
        { billingEmail: { contains: rawSearch, mode: 'insensitive' } },
        { contacts: { some: { phone: { contains: rawSearch }, deletedAt: null } } },
      ];
      if (digitsOnly.length >= 7) {
        searchOR.push({ contacts: { some: { phone: { contains: digitsOnly.slice(-10) }, deletedAt: null } } });
      }
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
      const primaryContact = c.contacts?.[0];
      return {
        ...c,
        phone: primaryContact?.phone || null,
        email: c.billingEmail || primaryContact?.email || null,
        _count: counts,
      };
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

    const primaryContact = company.contacts?.[0];
    return {
      ...company,
      phone: primaryContact?.phone || null,
      email: company.billingEmail || primaryContact?.email || null,
    };
  }

  async update(id: string, dto: UpdateCompanyDto, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const scope = this.scopingService.getCompanyScope(user);
    const email = (dto.billingEmail || dto.email)?.trim().toLowerCase();
    const phone = dto.phone?.trim();

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
        ...(email !== undefined && { billingEmail: email || null }),
      },
    });
    if (res.count === 0) throw new NotFoundException('Company not found');

    if (phone !== undefined || email !== undefined) {
      const primaryContact = await this.prisma.contact.findFirst({
        where: { companyId: id, tenantId, deletedAt: null },
        orderBy: { isPrimary: 'desc' },
      });
      if (primaryContact) {
        await this.prisma.contact.update({
          where: { id: primaryContact.id },
          data: {
            ...(phone !== undefined && { phone }),
            ...(email !== undefined && { email: email || null }),
          },
        });
      } else if (phone || email) {
        await this.prisma.contact.create({
          data: {
            tenantId,
            companyId: id,
            name: dto.name?.trim() || 'Primary Contact',
            phone: phone || '-',
            email: email || null,
            isPrimary: true,
            createdById: user.id,
          },
        });
      }
    }

    return this.findOne(id, user);
  }

  async delete(id: string, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const scope = this.scopingService.getCompanyScope(user);

    // Verify if documents exist (never delete if documents exist)
    const docCount =
      (await this.prisma.invoice.count({
        where: { tenantId, OR: [{ customerId: id }, { companyId: id }] },
      })) +
      (await this.prisma.order.count({ where: { tenantId, customerId: id } })) +
      (await this.prisma.paymentRecord.count({ where: { tenantId, customerId: id } }));

    if (docCount > 0) {
      throw new BadRequestException(
        `Cannot delete this customer because ${docCount} document(s) (invoices/orders/payments) are linked to it. Please archive the customer instead.`
      );
    }

    const res = await this.prisma.company.updateMany({
      where: { id, tenantId, ...scope, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundException('Company not found');
    return { success: true };
  }

  async archive(id: string, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const company = await this.prisma.company.findFirst({
      where: { id, tenantId },
    });
    if (!company) throw new NotFoundException('Company not found');

    await this.prisma.company.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditService.log({
      tenantId,
      actorId: user.id,
      actorName: (user as any).employeeCode || (user as any).name || 'Staff',
      action: 'ARCHIVE_CUSTOMER',
      entityName: 'Company',
      entityId: id,
      afterState: { name: company.name, isArchived: true },
    });

    return { success: true };
  }

  async unarchive(id: string, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const company = await this.prisma.company.findFirst({
      where: { id, tenantId },
    });
    if (!company) throw new NotFoundException('Company not found');

    await this.prisma.company.update({
      where: { id },
      data: { deletedAt: null },
    });

    await this.auditService.log({
      tenantId,
      actorId: user.id,
      actorName: (user as any).employeeCode || (user as any).name || 'Staff',
      action: 'UNARCHIVE_CUSTOMER',
      entityName: 'Company',
      entityId: id,
      afterState: { name: company.name, isArchived: false },
    });

    return { success: true };
  }

  async registerAndLink(dto: RegisterAndLinkCustomerDto, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const trimmedName = dto.name?.trim();
    if (!trimmedName || trimmedName.toLowerCase() === 'valued client') {
      throw new BadRequestException('A valid customer name is required.');
    }

    // Period lock check: prevent modifying historical documents in locked periods
    const lock = await this.prisma.ledgerLock.findUnique({ where: { tenantId } });
    if (lock && lock.lockedUntil) {
      const lockDate = new Date(lock.lockedUntil);
      const lockedInvoices = await this.prisma.invoice.count({
        where: {
          tenantId,
          customerName: { equals: trimmedName, mode: 'insensitive' as const },
          OR: [{ customerId: null }, { companyId: null }],
          invoiceDate: { lte: lockDate },
        },
      });
      if (lockedInvoices > 0) {
        throw new BadRequestException(
          `Accounting period is locked up to ${lockDate.toISOString().slice(0, 10)}. Cannot link historical documents in a locked period.`
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // Find or create company
      let company = await tx.company.findFirst({
        where: {
          tenantId,
          deletedAt: null,
          OR: [
            { name: { equals: trimmedName, mode: 'insensitive' as const } },
            ...(dto.gstin?.trim() ? [{ gstin: { equals: dto.gstin.trim(), mode: 'insensitive' as const } }] : []),
          ],
        },
      });

      const normEmail = dto.email?.trim().toLowerCase() || null;
      const normPhone = dto.phone?.trim() ? normalizeToE164(dto.phone) : null;

      if (!company) {
        company = await tx.company.create({
          data: {
            tenantId,
            name: trimmedName,
            gstin: dto.gstin?.trim() || null,
            address: dto.address?.trim() || null,
            city: dto.city?.trim() || null,
            state: dto.state?.trim() || 'Karnataka',
            billingEmail: normEmail,
            source: 'manual',
            createdById: user.id,
          },
        });

        if (normPhone || normEmail) {
          await tx.contact.create({
            data: {
              tenantId,
              companyId: company.id,
              name: trimmedName,
              phone: normPhone || '-',
              email: normEmail,
              isPrimary: true,
              createdById: user.id,
            },
          });
        }
      }

      // Link unlinked invoices
      const unlinkedInvoices = await tx.invoice.findMany({
        where: {
          tenantId,
          customerName: { equals: trimmedName, mode: 'insensitive' as const },
          OR: [{ customerId: null }, { companyId: null }],
        },
        select: { id: true, invoiceNumber: true },
      });

      if (unlinkedInvoices.length > 0) {
        const invIds = unlinkedInvoices.map((i) => i.id);
        await tx.invoice.updateMany({
          where: { id: { in: invIds }, tenantId },
          data: {
            customerId: company.id,
            companyId: company.id,
            customerName: company.name,
            customerGstin: company.gstin || undefined,
          },
        });

        await tx.ledgerEntry.updateMany({
          where: { tenantId, sourceType: 'invoice', sourceId: { in: invIds } },
          data: { partyId: company.id },
        });
      }

      // Link unlinked orders
      const unlinkedOrders = await tx.order.findMany({
        where: {
          tenantId,
          customerId: null,
          customerName: { equals: trimmedName, mode: 'insensitive' as const },
        },
        select: { id: true },
      });

      if (unlinkedOrders.length > 0) {
        const ordIds = unlinkedOrders.map((o) => o.id);
        await tx.order.updateMany({
          where: { id: { in: ordIds }, tenantId },
          data: { customerId: company.id },
        });
      }

      // Link unlinked quotations
      await tx.quotation.updateMany({
        where: {
          tenantId,
          customerId: null,
          customerName: { equals: trimmedName, mode: 'insensitive' as const },
        },
        data: { customerId: company.id },
      });

      await this.auditService.log({
        tenantId,
        actorId: user.id,
        actorName: (user as any).employeeCode || (user as any).name || 'Staff',
        action: 'REGISTER_AND_LINK_CUSTOMER',
        entityName: 'Company',
        entityId: company.id,
        afterState: {
          companyId: company.id,
          name: company.name,
          linkedInvoices: unlinkedInvoices.length,
          linkedOrders: unlinkedOrders.length,
        },
      });

      return {
        success: true,
        company,
        linkedInvoicesCount: unlinkedInvoices.length,
        linkedOrdersCount: unlinkedOrders.length,
      };
    });
  }

  async mergeCustomers(dto: MergeCustomerDto, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const { sourceCompanyId, targetCompanyId } = dto;

    if (!sourceCompanyId || !targetCompanyId || sourceCompanyId === targetCompanyId) {
      throw new BadRequestException('Source and target companies must be distinct.');
    }

    const source = await this.prisma.company.findFirst({
      where: { id: sourceCompanyId, tenantId },
    });
    if (!source) {
      throw new NotFoundException('Source company not found.');
    }

    const target = await this.prisma.company.findFirst({
      where: { id: targetCompanyId, tenantId, deletedAt: null },
    });
    if (!target) {
      throw new NotFoundException('Target company not found.');
    }

    // Check period lock on source documents
    const lock = await this.prisma.ledgerLock.findUnique({ where: { tenantId } });
    if (lock && lock.lockedUntil) {
      const lockDate = new Date(lock.lockedUntil);
      const lockedInvoices = await this.prisma.invoice.count({
        where: {
          tenantId,
          OR: [{ customerId: sourceCompanyId }, { companyId: sourceCompanyId }],
          invoiceDate: { lte: lockDate },
        },
      });
      const lockedPayments = await this.prisma.paymentRecord.count({
        where: {
          tenantId,
          customerId: sourceCompanyId,
          paymentDate: { lte: lockDate },
        },
      });
      if (lockedInvoices > 0 || lockedPayments > 0) {
        throw new BadRequestException(
          `Accounting period is locked up to ${lockDate.toISOString().slice(0, 10)}. Cannot merge customer with documents in a locked accounting period.`
        );
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Move Invoices
      const invRes = await tx.invoice.updateMany({
        where: { tenantId, OR: [{ customerId: sourceCompanyId }, { companyId: sourceCompanyId }] },
        data: {
          customerId: target.id,
          companyId: target.id,
          customerName: target.name,
          customerGstin: target.gstin || undefined,
        },
      });

      // 2. Move Orders
      const ordRes = await tx.order.updateMany({
        where: { tenantId, customerId: sourceCompanyId },
        data: { customerId: target.id, customerName: target.name },
      });

      // 3. Move Quotations
      const qtnRes = await tx.quotation.updateMany({
        where: { tenantId, customerId: sourceCompanyId },
        data: { customerId: target.id, customerName: target.name },
      });

      // 4. Move PaymentRecords
      const payRes = await tx.paymentRecord.updateMany({
        where: { tenantId, customerId: sourceCompanyId },
        data: { customerId: target.id },
      });

      // 5. Move LedgerEntries
      const ledRes = await tx.ledgerEntry.updateMany({
        where: { tenantId, partyType: 'customer', partyId: sourceCompanyId },
        data: { partyId: target.id },
      });

      // 6. Move Contacts
      await tx.contact.updateMany({
        where: { tenantId, companyId: sourceCompanyId },
        data: { companyId: target.id },
      });

      // 7. Soft delete source company
      await tx.company.update({
        where: { id: sourceCompanyId },
        data: { deletedAt: new Date() },
      });

      // 8. Audit log
      await this.auditService.log({
        tenantId,
        actorId: user.id,
        actorName: (user as any).employeeCode || (user as any).name || 'Staff',
        action: 'MERGE_CUSTOMERS',
        entityName: 'Company',
        entityId: target.id,
        afterState: {
          sourceCompanyId,
          sourceCompanyName: source.name,
          targetCompanyId: target.id,
          targetCompanyName: target.name,
          movedInvoices: invRes.count,
          movedOrders: ordRes.count,
          movedQuotations: qtnRes.count,
          movedPayments: payRes.count,
          movedLedgerEntries: ledRes.count,
        },
      });

      return {
        movedInvoices: invRes.count,
        movedOrders: ordRes.count,
        movedQuotations: qtnRes.count,
        movedPayments: payRes.count,
      };
    });

    return {
      success: true,
      targetCompany: target,
      ...result,
    };
  }

  async getUnifiedCustomers(user: ScopedUser, query?: { search?: string; includeArchived?: boolean }) {
    const tenantId = requireTenantId(user);
    const search = query?.search?.trim()?.toLowerCase() || '';
    const includeArchived = query?.includeArchived === true || query?.includeArchived === ('true' as any);

    // 1. Registered Companies
    const companies = await this.prisma.company.findMany({
      where: {
        tenantId,
        ...(includeArchived ? {} : { deletedAt: null }),
      },
      include: {
        contacts: {
          where: { deletedAt: null },
          orderBy: { isPrimary: 'desc' },
        },
        invoices: {
          where: { isVoided: false },
          select: { id: true, totalAmount: true, balanceDue: true, invoiceDate: true },
        },
        orders: {
          where: { deletedAt: null },
          select: { id: true, confirmedAt: true, totalAmount: true },
        },
        quotations: {
          select: { id: true, createdAt: true, totalAmount: true },
        },
        payments: {
          where: { reversalOfId: null },
          select: { id: true, paymentDate: true, amount: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const registeredCustomers = companies.map((c: any) => {
      const primaryContact = c.contacts?.[0];
      const invBalance = c.invoices.reduce((s: number, inv: any) => s + (inv.balanceDue ?? inv.totalAmount ?? 0), 0);
      const docCount = c.invoices.length + c.orders.length + c.quotations.length;

      const timestamps = [
        ...c.invoices.map((i: any) => i.invoiceDate ? new Date(i.invoiceDate).getTime() : 0),
        ...c.orders.map((o: any) => o.confirmedAt ? new Date(o.confirmedAt).getTime() : 0),
        ...c.payments.map((p: any) => p.paymentDate ? new Date(p.paymentDate).getTime() : 0),
        new Date(c.createdAt).getTime(),
      ].filter(Boolean);
      const latestTs = timestamps.length > 0 ? Math.max(...timestamps) : null;

      return {
        id: c.id,
        isRegistered: true,
        name: c.name,
        gstin: c.gstin || null,
        phone: primaryContact?.phone || null,
        email: c.billingEmail || primaryContact?.email || null,
        balance: Number(invBalance.toFixed(2)),
        documentCount: docCount,
        lastActivity: latestTs ? new Date(latestTs).toISOString() : c.createdAt.toISOString(),
        isArchived: Boolean(c.deletedAt),
        source: c.source || 'manual',
        isDemo: c.isDemo || false,
      };
    });

    // 2. Unregistered Customers from unlinked invoices and orders
    const unlinkedInvoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        isVoided: false,
        OR: [{ customerId: null }, { companyId: null }],
      },
      select: {
        id: true,
        customerName: true,
        customerGstin: true,
        customerPhone: true,
        customerEmail: true,
        totalAmount: true,
        balanceDue: true,
        invoiceDate: true,
      },
    });

    const unlinkedOrders = await this.prisma.order.findMany({
      where: {
        tenantId,
        customerId: null,
        deletedAt: null,
      },
      select: {
        id: true,
        customerName: true,
        customerPhone: true,
        customerEmail: true,
        confirmedAt: true,
        totalAmount: true,
      },
    });

    const unlinkedGroups = new Map<string, {
      name: string;
      gstin: string | null;
      phone: string | null;
      email: string | null;
      balance: number;
      docCount: number;
      latestDate: number;
    }>();

    for (const inv of unlinkedInvoices) {
      const rawName = (inv.customerName || 'Unregistered Customer').trim();
      const rawGstin = (inv.customerGstin || '').trim().toUpperCase();
      const key = `${rawName.toLowerCase()}:::${rawGstin}`;
      const due = Number(inv.balanceDue ?? inv.totalAmount ?? 0);
      const invDate = inv.invoiceDate ? new Date(inv.invoiceDate).getTime() : 0;

      if (!unlinkedGroups.has(key)) {
        unlinkedGroups.set(key, {
          name: rawName,
          gstin: rawGstin || null,
          phone: inv.customerPhone || null,
          email: inv.customerEmail || null,
          balance: due,
          docCount: 1,
          latestDate: invDate,
        });
      } else {
        const g = unlinkedGroups.get(key)!;
        g.balance += due;
        g.docCount += 1;
        if (invDate > g.latestDate) g.latestDate = invDate;
        if (!g.phone && inv.customerPhone) g.phone = inv.customerPhone;
        if (!g.email && inv.customerEmail) g.email = inv.customerEmail;
      }
    }

    for (const ord of unlinkedOrders) {
      const rawName = (ord.customerName || 'Unregistered Customer').trim();
      const key = `${rawName.toLowerCase()}:::`;
      const ordDate = ord.confirmedAt ? new Date(ord.confirmedAt).getTime() : 0;

      if (!unlinkedGroups.has(key)) {
        unlinkedGroups.set(key, {
          name: rawName,
          gstin: null,
          phone: ord.customerPhone || null,
          email: ord.customerEmail || null,
          balance: 0,
          docCount: 1,
          latestDate: ordDate,
        });
      } else {
        const g = unlinkedGroups.get(key)!;
        g.docCount += 1;
        if (ordDate > g.latestDate) g.latestDate = ordDate;
        if (!g.phone && ord.customerPhone) g.phone = ord.customerPhone;
        if (!g.email && ord.customerEmail) g.email = ord.customerEmail;
      }
    }

    const unregisteredCustomers = Array.from(unlinkedGroups.entries()).map(([, g]) => ({
      id: `unlinked:${encodeURIComponent(g.name)}:${encodeURIComponent(g.gstin || '')}`,
      isRegistered: false,
      name: g.name,
      gstin: g.gstin,
      phone: g.phone,
      email: g.email,
      balance: Number(g.balance.toFixed(2)),
      documentCount: g.docCount,
      lastActivity: g.latestDate ? new Date(g.latestDate).toISOString() : new Date().toISOString(),
      isArchived: false,
      source: 'unlinked',
      isDemo: false,
    }));

    let allCustomers = [...registeredCustomers, ...unregisteredCustomers];

    if (search) {
      allCustomers = allCustomers.filter(c =>
        c.name.toLowerCase().includes(search) ||
        (c.gstin && c.gstin.toLowerCase().includes(search)) ||
        (c.phone && c.phone.includes(search)) ||
        (c.email && c.email.toLowerCase().includes(search))
      );
    }

    // 3. Compute Possible Duplicates using cleanCustomerName, phone and GSTIN
    const dupCleanMap = new Map<string, any[]>();
    for (const c of allCustomers) {
      const clean = cleanCustomerName(c.name);
      if (clean && clean.length >= 2) {
        if (!dupCleanMap.has(clean)) dupCleanMap.set(clean, []);
        dupCleanMap.get(clean)!.push(c);
      }
      if (c.gstin && c.gstin.length >= 10) {
        const gKey = `gstin:${c.gstin.toUpperCase()}`;
        if (!dupCleanMap.has(gKey)) dupCleanMap.set(gKey, []);
        dupCleanMap.get(gKey)!.push(c);
      }
    }

    const possibleDuplicates: Array<{ reason: string; key: string; customers: any[] }> = [];
    for (const [key, list] of dupCleanMap.entries()) {
      // Dedup list by id
      const uniqueList = Array.from(new Map(list.map(item => [item.id, item])).values());
      if (uniqueList.length > 1) {
        const reason = key.startsWith('gstin:')
          ? `Same GSTIN (${key.replace('gstin:', '')})`
          : `Similar normalized business name ("${key}")`;
        possibleDuplicates.push({
          reason,
          key,
          customers: uniqueList,
        });
      }
    }

    return {
      items: allCustomers,
      registeredCount: registeredCustomers.length,
      unregisteredCount: unregisteredCustomers.length,
      possibleDuplicates,
    };
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
        phone: dto.phone ? normalizeToE164(dto.phone) : '-',
        designation: dto.designation?.trim() || null,
        isPrimary: !!dto.isPrimary,
        tenantId,
        companyId: company.id,
        createdById: user.id,
      },
    });
  }
}
