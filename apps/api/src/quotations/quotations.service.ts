/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopingService, ScopedUser } from '../auth/scoping.service';
import { AuditService } from '../audit/audit.service';
import { OrdersService } from '../orders/orders.service';
import { requireTenantId } from '../common/tenant.util';
import { parsePagination } from '../common/pagination.util';
import { sanitizeHtml } from '../common/html-sanitize.util';


import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsNumber,
  Min,
  Max,
  MaxLength,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
  IsBoolean,
} from 'class-validator';
import {
  SanitizeText,
  TrimString,
  IsValidName,
  IsValidPhone,
  IsValidEmail,
  IsValidProductName,
  IsValidQuantity,
  IsValidUnitRate,
  IsValidGstRate,
  CleanPhone,
  CleanGstin,
  CleanSku,
  IsValidGstin,
  IsNotPlaceholderName,
} from '../common/validation.transformers';
import { roundCurrency, validateDocumentAmountLimits, isPlaceholderCustomerName } from '../common/shared-validation';
import { DocumentSeriesService } from '../common/document-series.service';
import { calculateDocumentTotals } from '../common/pricing.calculator';

export class QuotationLineItemDto {
  @IsString()
  @IsOptional()
  skuId?: string;

  @CleanSku()
  @IsString()
  @IsOptional()
  @MaxLength(50)
  skuCode?: string;

  @SanitizeText()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @IsValidProductName()
  name: string;

  @SanitizeText()
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @SanitizeText()
  @IsString()
  @IsOptional()
  @MaxLength(50)
  unit?: string;

  @IsNumber()
  @Min(0.0001)
  @Max(100000)
  @IsValidQuantity()
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000000)
  @IsValidUnitRate()
  unitPrice: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount?: number;

  @IsString()
  @IsOptional()
  hsnCode?: string;

  @IsNumber()
  @IsOptional()
  @IsValidGstRate()
  taxRate?: number;

  @IsNumber()
  @IsOptional()
  gstRate?: number;

  @IsBoolean()
  @IsOptional()
  isCustom?: boolean;

  @SanitizeText()
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;
}

export class CreateQuotationDto {
  @IsString()
  @IsOptional()
  leadId?: string;

  @IsString()
  @IsOptional()
  customerId?: string;

  @IsBoolean()
  @IsOptional()
  confirmCreateCustomer?: boolean;

  @IsString()
  @IsOptional()
  contactId?: string;

  @SanitizeText()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @IsValidName()
  @IsNotPlaceholderName()
  customerName: string;

  @CleanPhone()
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @IsValidPhone()
  customerPhone: string;

  @SanitizeText()
  @IsString()
  @IsOptional()
  @MaxLength(254)
  @IsValidEmail()
  customerEmail?: string;

  @CleanGstin()
  @IsString()
  @IsOptional()
  @IsValidGstin()
  customerGstin?: string;

  @IsString()
  @IsOptional()
  customerAddress?: string;

  @IsString()
  @IsOptional()
  customerState?: string;

  @SanitizeText()
  @IsString()
  @IsOptional()
  @MaxLength(100)
  companyName?: string;

  @SanitizeText()
  @IsString()
  @IsOptional()
  @MaxLength(300)
  shippingAddress?: string;

  @IsString()
  @IsOptional()
  validUntil?: string;

  @SanitizeText()
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;

  @SanitizeText()
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  terms?: string;

  @IsNumber()
  @IsOptional()
  @IsValidGstRate()
  taxRate?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => QuotationLineItemDto)
  lines: QuotationLineItemDto[];

  @IsOptional()
  @IsBoolean()
  confirmedHighAmount?: boolean;

  @IsOptional()
  @IsBoolean()
  confirmHighAmount?: boolean;

  @IsOptional()
  @IsBoolean()
  createCustomer?: boolean;

  @IsOptional()
  @IsBoolean()
  confirmDuplicate?: boolean;
}

export class UpdateQuotationStatusDto {
  @IsString()
  @IsNotEmpty()
  status: string;
}

@Injectable()
export class QuotationsService {
  constructor(
    private prisma: PrismaService,
    private scopingService: ScopingService,
    private auditService: AuditService,
    private ordersService: OrdersService,
    private documentSeriesService: DocumentSeriesService,
  ) {}

  private async resolveSkuForLine(line: { skuId?: string; name?: string; unitPrice: number }, user: ScopedUser, warehouseId?: string) {
    const tenantId = requireTenantId(user);
    if (line.skuId && line.skuId.trim()) {
      const existing = await this.prisma.sku.findFirst({ where: { id: line.skuId, tenantId } });
      if (existing) return existing;
    }

    const text = (line.name || '').trim();
    if (!text) {
      throw new BadRequestException('Product / SKU description is required.');
    }

    let found = await this.prisma.sku.findFirst({
      where: {
        tenantId,
        OR: [
          { skuCode: { equals: text } },
          { name: { equals: text } },
        ],
      },
    });

    if (found) return found;

    // Auto-create SKU
    const count = await this.prisma.sku.count({ where: { tenantId } });
    const cleanPrefix = text.replace(/[^a-zA-Z0-9]/g, '').substring(0, 4).toUpperCase() || 'PROD';
    const autoSkuCode = `${cleanPrefix}-${String(count + 1).padStart(4, '0')}`;

    let whId = warehouseId;
    if (!whId) {
      const defaultWh = await this.prisma.warehouse.findFirst({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
      whId = defaultWh?.id;
    }

    const created = await this.prisma.sku.create({
      data: {
        tenantId,
        skuCode: autoSkuCode,
        name: text,
        category: 'Communication / PA System',
        hsnCode: '85184000',
        taxRate: 18.0,
        packageType: 'Unit',
        unitPrice: line.unitPrice || 0,
        costPrice: 0,
        reorderPoint: 10,
        stockItems: whId
          ? {
              create: {
                warehouseId: whId,
                quantityOnHand: 0,
                quantityReserved: 0,
              },
            }
          : undefined,
      },
    });

    return created;
  }

  async create(dto: CreateQuotationDto, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const custName = dto.customerName?.trim();
    if (!custName || isPlaceholderCustomerName(custName) || !dto.customerPhone) {
      throw new BadRequestException('A real customer is required. Generic placeholder names like Valued Client, Customer, Test, Walk-in, or NA are not permitted.');
    }
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('At least 1 product line is required for quotation.');
    }

    const seriesInfo = await this.documentSeriesService.getNextDocumentNumber(
      tenantId,
      'quotation',
      new Date(),
      this.prisma
    );
    const quoteNumber = seriesInfo.formattedNumber;

    const resolvedLines: any[] = [];
    for (const l of dto.lines) {
      const sku = await this.resolveSkuForLine(l, user);
      const qty = Number(l.quantity) || 1;
      const price = Number(l.unitPrice) || 0;
      const discount = Number(l.discount) || 0;
      const gstRate = Number(l.gstRate ?? (dto as any).taxRate ?? sku.taxRate ?? 18.0);

      resolvedLines.push({
        skuId: sku.id,
        hsnCode: l.hsnCode || sku.hsnCode || '85184000',
        description: l.name || sku.name,
        unit: l.unit || 'NOS',
        quantity: qty,
        unitPrice: price,
        discount,
        gstRate,
        notes: l.notes,
      });
    }

    const customerState = dto.customerState || 'Karnataka';
    const totals = calculateDocumentTotals(resolvedLines, customerState);

    const amountLimitCheck = validateDocumentAmountLimits({
      totalAmount: totals.totalAmount,
      lines: totals.lines,
      confirmedHighAmount: Boolean((dto as any).confirmedHighAmount || (dto as any).confirmHighAmount),
    });
    if (!amountLimitCheck.valid) {
      throw new BadRequestException(amountLimitCheck.error);
    }
    if (amountLimitCheck.needsConfirmation) {
      throw new BadRequestException(`${amountLimitCheck.warning} (Provide confirmedHighAmount: true to proceed).`);
    }

    const validUntil = dto.validUntil ? new Date(dto.validUntil) : new Date(Date.now() + 30 * 86_400_000); // 30 days validity

    return this.prisma.$transaction(async (tx) => {
      let targetCompany: any = null;

      if (dto.customerId) {
        targetCompany = await tx.company.findFirst({
          where: { id: dto.customerId, tenantId, deletedAt: null },
        });
        if (!targetCompany) {
          throw new BadRequestException(`Customer with ID "${dto.customerId}" not found.`);
        }
      } else {
        // Look up by exact customer name
        const existingCompany = await tx.company.findFirst({
          where: {
            tenantId,
            deletedAt: null,
            name: { equals: custName, mode: 'insensitive' as const },
          },
        });

        if (existingCompany) {
          targetCompany = existingCompany;
        } else if (dto.confirmCreateCustomer || (dto as any).createCustomer) {
          // Explicit confirmation: create customer record in same transaction
          targetCompany = await tx.company.create({
            data: {
              tenantId,
              name: custName,
              gstin: dto.customerGstin?.trim().toUpperCase() || null,
              address: dto.customerAddress || dto.shippingAddress || null,
              state: customerState,
              billingEmail: dto.customerEmail?.trim().toLowerCase() || null,
              createdById: user.id,
            },
          });
          if (dto.customerPhone?.trim()) {
            await tx.contact.create({
              data: {
                tenantId,
                companyId: targetCompany.id,
                name: custName,
                phone: dto.customerPhone.trim(),
                email: dto.customerEmail?.trim().toLowerCase() || null,
                isPrimary: true,
                createdById: user.id,
              },
            });
          }
        } else {
          throw new BadRequestException(
            `A registered customer account is required on quotations. "${custName}" does not exist in your customer master. Please select an existing customer or confirm customer creation.`
          );
        }
      }

      const quotation = await tx.quotation.create({
        data: {
          tenantId,
          quoteNumber,
          customerId: targetCompany.id,
          customerName: targetCompany.name,
          customerPhone: dto.customerPhone || targetCompany.phone || null,
          customerEmail: dto.customerEmail || targetCompany.billingEmail || null,
          customerGstin: targetCompany.gstin || dto.customerGstin || null,
          customerAddress: dto.customerAddress || dto.shippingAddress || targetCompany.address || null,
          customerState,
          leadId: dto.leadId,
          contactId: dto.contactId,
          createdById: user.id,
          status: 'draft',
          subtotal: totals.subtotal,
          taxRate: Number(dto.taxRate) || 18.0,
          taxAmount: totals.totalTax,
          totalAmount: totals.totalAmount,
          validUntil,
          notes: sanitizeHtml(dto.notes),
          terms: sanitizeHtml(dto.terms) || '1. 100% advance or approved credit terms.\n2. Delivery within 7–10 days of confirmation.\n3. Prices inclusive/exclusive of GST as indicated.',
          lines: {
            create: totals.lines.map((l) => ({
              skuId: l.skuId!,
              hsnCode: l.hsnCode,
              description: l.description,
              unit: l.unit || 'NOS',
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              discount: l.discount,
              gstRate: l.taxRate,
              totalPrice: l.lineTotal,
            })),
          },
        },
        include: {
          lines: { include: { sku: true } },
          lead: true,
          contact: true,
          createdBy: { select: { id: true, name: true, employeeCode: true } },
        },
      });

      await tx.statusHistory.create({
        data: {
          entityType: 'Quotation',
          entityId: quotation.id,
          toStatus: 'draft',
          changedById: user.id,
          note: `Quotation #${quoteNumber} created`,
        },
      });

      if (dto.leadId) {
        await tx.lead.update({
          where: { id: dto.leadId },
          data: { status: 'quoted' },
        }).catch(() => {});
      }

      await this.auditService.log({
        tenantId,
        actorId: user.id,
        actorName: user.employeeCode,
        action: 'CREATE',
        entityName: 'Quotation',
        entityId: quotation.id,
        afterState: { quoteNumber, totalAmount: totals.totalAmount, customerId: targetCompany.id },
      });

      return quotation;
    });
  }

  async findAll(user: ScopedUser, query: { status?: string; search?: string; page?: number; limit?: number }) {
    const scope = this.scopingService.getQuotationScope(user);
    const where: any = { ...scope, deletedAt: null };

    if (query.status) {
      const qStatus = query.status.toLowerCase().trim();
      if (qStatus === 'approved' || qStatus === 'accepted') {
        where.status = { in: ['approved', 'accepted'] };
      } else {
        where.status = qStatus;
      }
    }
    if (query.search) {
      const searchOR = [
        { quoteNumber: { contains: query.search } },
        { lead: { customerName: { contains: query.search } } },
        { lead: { customerPhone: { contains: query.search } } },
        { contact: { name: { contains: query.search } } },
      ];
      if (scope.OR) {
        where.AND = [{ OR: scope.OR }, { OR: searchOR }];
        delete where.OR;
      } else {
        where.OR = searchOR;
      }
    }

    const { page, limit, skip, take } = parsePagination(query, 25, 100);

    const [items, total] = await Promise.all([
      this.prisma.quotation.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          lines: { include: { sku: true } },
          lead: true,
          contact: true,
          order: true,
          createdBy: { select: { id: true, name: true, employeeCode: true } },
        },
      }),
      this.prisma.quotation.count({ where }),
    ]);

    const mappedItems = items.map((item) => {
      if (item.status === 'accepted') {
        return { ...item, status: 'approved' };
      }
      return item;
    });

    return { items: mappedItems, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const scope = this.scopingService.getQuotationScope(user);
    const quotation = await this.prisma.quotation.findFirst({
      where: { id, tenantId, ...scope },
      include: {
        lines: { include: { sku: true } },
        lead: true,
        contact: true,
        order: { include: { invoices: true } },
        createdBy: { select: { id: true, name: true, employeeCode: true } },
      },
    });

    if (!quotation) throw new NotFoundException('Quotation not found');
    if (quotation.status === 'accepted') {
      (quotation as any).status = 'approved';
    }
    return quotation;
  }

  async updateStatus(id: string, status: string, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const quote = await this.findOne(id, user);

    const validStatuses = ['draft', 'sent', 'accepted', 'approved', 'converted', 'rejected', 'expired'];
    const normalizedStatus = (status || '').toLowerCase().trim();
    if (!validStatuses.includes(normalizedStatus)) {
      throw new BadRequestException(`Invalid status: ${status}. Must be one of ${validStatuses.join(', ')}`);
    }

    // Keep canonical value: always store 'approved'
    const canonicalStatus = normalizedStatus === 'accepted' ? 'approved' : normalizedStatus;

    if ((canonicalStatus === 'sent' || canonicalStatus === 'approved') && (!quote.lines || quote.lines.length === 0)) {
      throw new BadRequestException('Quotation has zero item lines and cannot be sent or approved.');
    }

    const res = await this.prisma.quotation.updateMany({
      where: { id, tenantId },
      data: { status: canonicalStatus },
    });
    if (res.count === 0) throw new NotFoundException('Quotation not found');
    const updated = await this.findOne(id, user);

    await this.prisma.statusHistory.create({
      data: {
        entityType: 'Quotation',
        entityId: id,
        fromStatus: quote.status,
        toStatus: canonicalStatus,
        changedById: user.id,
        note: `Status updated to ${canonicalStatus}`,
      },
    });

    await this.auditService.log({
      actorId: user.id,
      actorName: user.employeeCode,
      action: 'STATUS_CHANGE',
      entityName: 'Quotation',
      entityId: id,
      beforeState: { status: quote.status },
      afterState: { status: canonicalStatus },
    });

    return updated;
  }

  async convertToOrder(id: string, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const quote = await this.findOne(id, user);

    const q = quote as any;

    // Idempotent: If quotation has already been converted to an order, return existing order
    if (q.order) {
      return q.order;
    }

    const customerName = (q.customerName || quote.lead?.customerName || quote.contact?.name || '').trim();
    if (!customerName || isPlaceholderCustomerName(customerName)) {
      throw new BadRequestException('A real customer is required to convert quotation to order. Generic placeholder names like Valued Client, Customer, Test, Walk-in, or NA are not permitted.');
    }
    const customerPhone = q.customerPhone || quote.lead?.customerPhone || quote.contact?.phone || '—';
    const customerEmail = q.customerEmail || quote.lead?.customerEmail || quote.contact?.email;
    const customerGstin = q.customerGstin;
    const customerAddress = q.customerAddress || quote.lead?.city;
    const customerState = q.customerState || 'Karnataka';

    let customerId = q.customerId;
    if (!customerId && customerName) {
      const existingCompany = await this.prisma.company.findFirst({
        where: {
          tenantId,
          deletedAt: null,
          name: { equals: customerName, mode: 'insensitive' as const },
        },
      });
      if (existingCompany) {
        customerId = existingCompany.id;
        await this.prisma.quotation.updateMany({
          where: { id: quote.id, tenantId },
          data: { customerId: existingCompany.id },
        });
      }
    }

    const order = await this.ordersService.createOrder(
      {
        quotationId: quote.id,
        customerId: customerId || undefined,
        contactId: quote.contactId || undefined,
        customerName,
        customerPhone,
        customerEmail,
        customerGstin: customerGstin || undefined,
        customerAddress: customerAddress || undefined,
        customerState,
        shippingAddress: customerAddress || undefined,
        notes: quote.notes || undefined,
        lines: quote.lines.map((l) => ({
          skuId: l.skuId,
          name: l.sku?.name || (l as any).description,
          hsnCode: (l as any).hsnCode || l.sku?.hsnCode,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: l.discount || 0,
          gstRate: (l as any).gstRate || 18.0,
        })),
      },
      user,
    );

    await this.prisma.quotation.updateMany({
      where: { id, tenantId },
      data: { status: 'converted', orderId: order.id },
    });

    await this.prisma.statusHistory.create({
      data: {
        entityType: 'Quotation',
        entityId: id,
        fromStatus: quote.status,
        toStatus: 'converted',
        changedById: user.id,
        note: `Converted to Order #${order.orderNumber}`,
      },
    });

    if (quote.leadId) {
      await this.prisma.lead.updateMany({
        where: { id: quote.leadId, tenantId },
        data: { status: 'won' },
      }).catch(() => {});
    }

    return order;
  }

  async expireQuotations(tenantId?: string) {
    const now = new Date();
    const where: any = {
      status: { in: ['draft', 'sent'] },
      validUntil: { lt: now },
      deletedAt: null,
    };
    if (tenantId) where.tenantId = tenantId;

    const expired = await this.prisma.quotation.findMany({
      where,
      select: { id: true, status: true },
    });

    for (const q of expired) {
      await this.prisma.quotation.update({
        where: { id: q.id },
        data: { status: 'expired' },
      });
      await this.prisma.statusHistory.create({
        data: {
          entityType: 'Quotation',
          entityId: q.id,
          fromStatus: q.status,
          toStatus: 'expired',
          note: 'Automatically expired past validity period',
        },
      });
    }

    return { expiredCount: expired.length };
  }
}
