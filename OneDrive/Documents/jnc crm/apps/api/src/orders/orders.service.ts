/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopingService, ScopedUser } from '../auth/scoping.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { requireTenantId } from '../common/tenant.util';
import { parsePagination } from '../common/pagination.util';
import { BRAND_CONFIG } from '../common/brand';
import { sanitizeHtml } from '../common/html-sanitize.util';
import { LiveCourierTrackerService, LiveTrackingResult } from './live-courier-tracker.service';

import { IsString, IsNotEmpty, IsOptional, IsArray, IsNumber } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  @IsOptional()
  quotationId?: string;

  @IsString()
  @IsOptional()
  contactId?: string;

  @IsString()
  @IsNotEmpty()
  customerName: string;

  @IsString()
  @IsNotEmpty()
  customerPhone: string;

  @IsString()
  @IsOptional()
  customerEmail?: string;

  @IsString()
  @IsOptional()
  shippingAddress?: string;

  @IsArray()
  lines: any[];

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  paymentStatus?: string;
}

export class UpdateOrderDto {
  @IsString()
  @IsOptional()
  quotationId?: string;

  @IsString()
  @IsOptional()
  contactId?: string;

  @IsString()
  @IsOptional()
  customerName?: string;

  @IsString()
  @IsOptional()
  customerPhone?: string;

  @IsString()
  @IsOptional()
  customerEmail?: string;

  @IsString()
  @IsOptional()
  shippingAddress?: string;

  @IsArray()
  @IsOptional()
  lines?: any[];

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  paymentStatus?: string;

  @IsString()
  @IsOptional()
  status?: string;
}

export class UpdateOrderStatusDto {
  @IsString()
  @IsNotEmpty()
  status: string;

  @IsString()
  @IsOptional()
  note?: string;
}

export class CreateShipmentDto {
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @IsString()
  @IsNotEmpty()
  courierName: string;

  @IsString()
  @IsNotEmpty()
  trackingNumber: string;

  @IsString()
  @IsOptional()
  trackingUrl?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateShipmentStatusDto {
  @IsString()
  @IsNotEmpty()
  status: string;
}

export class UpdateShipmentDto {
  @IsString()
  @IsOptional()
  courierName?: string;

  @IsString()
  @IsOptional()
  trackingNumber?: string;

  @IsString()
  @IsOptional()
  trackingUrl?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class VerifyLiveTrackingUrlDto {
  @IsString()
  @IsOptional()
  trackingUrl?: string;

  @IsString()
  @IsOptional()
  courierName?: string;

  @IsString()
  @IsOptional()
  trackingNumber?: string;
}

export class RecordOrderPaymentDto {
  @IsNumber()
  amount: number;

  @IsString()
  @IsOptional()
  paymentType?: string;

  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @IsString()
  @IsOptional()
  transactionRef?: string;

  @IsString()
  @IsOptional()
  paymentDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private prisma: PrismaService,
    private scopingService: ScopingService,
    private notificationsService: NotificationsService,
    private auditService: AuditService,
    private liveTracker: LiveCourierTrackerService,
  ) {}

  /**
   * Serializes user notes and structured live tracking into notes field
   */
  serializeShipmentNotes(userNotes?: string, liveTracking?: LiveTrackingResult | null): string {
    return JSON.stringify({
      userNotes: (userNotes || '').trim(),
      liveTracking: liveTracking || null,
    });
  }

  /**
   * Safely parses user notes and structured live tracking
   */
  parseShipmentNotes(rawNotes?: string | null): { userNotes: string; liveTracking: LiveTrackingResult | null } {
    if (!rawNotes) return { userNotes: '', liveTracking: null };
    try {
      const parsed = JSON.parse(rawNotes);
      if (parsed && typeof parsed === 'object') {
        return {
          userNotes: parsed.userNotes || '',
          liveTracking: parsed.liveTracking || null,
        };
      }
    } catch {
      // Legacy plain text note
    }
    return { userNotes: rawNotes, liveTracking: null };
  }

  /**
   * Formats shipment with clean user notes, liveTracking, and top-level tracking fields
   */
  formatShipmentWithLiveTracking(shipment: any) {
    if (!shipment) return shipment;
    const { userNotes, liveTracking } = this.parseShipmentNotes(shipment.notes);

    return {
      ...shipment,
      notes: userNotes,
      userNotes,
      liveTracking: liveTracking || null,
      trackingUrl: shipment.trackingUrl || liveTracking?.sourceUrl || null,
    };
  }

  private async resolveSkuForLine(
    line: { skuId?: string; name?: string; unitPrice: number; hsnCode?: string },
    user: ScopedUser,
    warehouseId?: string,
  ) {
    const tenantId = requireTenantId(user);
    if (line.skuId && line.skuId.trim()) {
      const existing = await this.prisma.sku.findFirst({ where: { id: line.skuId, tenantId } });
      if (existing) return existing;
      throw new NotFoundException(`SKU "${line.skuId}" not found in your organization.`);
    }

    const text = (line.name || '').trim();
    if (!text) {
      throw new BadRequestException('Product SKU or description name is required for all order items.');
    }

    // Try finding by skuCode or name
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

    // Create on-the-fly SKU for typed text item
    const codePrefix = text.slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'ITEM';
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const skuCode = `SKU-${codePrefix}-${randomSuffix}`;

    const newSku = await this.prisma.sku.create({
      data: {
        tenantId,
        skuCode,
        name: text,
        category: 'Equipment',
        unitPrice: line.unitPrice || 0,
        costPrice: Math.round((line.unitPrice || 0) * 0.7),
        hsnCode: line.hsnCode || '85312000',
        packageType: "Unit",
      },
    });

    // Ensure default stock item exists so reservations work smoothly
    let defaultWarehouse = await this.prisma.warehouse.findFirst({ where: { tenantId } });
    if (!defaultWarehouse) {
      defaultWarehouse = await this.prisma.warehouse.create({
        data: {
          tenantId,
          code: 'MAIN-01',
          name: 'Main Warehouse',
          city: 'Headquarters',
        },
      });
    }
    if (defaultWarehouse) {
      await this.prisma.stockItem.create({
        data: {
          skuId: newSku.id,
          warehouseId: defaultWarehouse.id,
          quantityOnHand: 1000, // initialize available stock for on-the-fly created item
          quantityReserved: 0,
        },
      });
    }

    return newSku;
  }

  async createOrder(dto: CreateOrderDto, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const count = await this.prisma.order.count({ where: { tenantId } });
    const orderNumber = `ORD-${String(count + 1).padStart(5, '0')}`;

    // Resolve SKUs (matching dropdown or typed text)
    const resolvedLines: { skuId: string; quantity: number; unitPrice: number }[] = [];
    for (const line of dto.lines) {
      const sku = await this.resolveSkuForLine(line, user);
      resolvedLines.push({
        skuId: sku.id,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      });
    }

    // Calculate totals
    const subtotal = resolvedLines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
    const taxAmount = subtotal * 0.18;
    const totalAmount = subtotal + taxAmount;

    const order = await this.prisma.order.create({
      data: {
        tenantId,
        orderNumber,
        quotationId: dto.quotationId,
        contactId: dto.contactId,
        createdById: user.id,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        customerEmail: dto.customerEmail,
        shippingAddress: dto.shippingAddress,
        subtotal,
        taxAmount,
        totalAmount,
        notes: sanitizeHtml(dto.notes),
        status: 'confirmed',

        paymentStatus: 'pending',
        lines: {
          create: resolvedLines.map((l) => ({
            skuId: l.skuId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            totalPrice: l.quantity * l.unitPrice,
          })),
        },
      },
      include: {
        lines: { include: { sku: true } },
        contact: true,
        createdBy: { select: { id: true, name: true, employeeCode: true } },
      },
    });

    // Reserve stock for each line
    for (const line of resolvedLines) {
      const stockItem = await this.prisma.stockItem.findFirst({
        where: { skuId: line.skuId, warehouse: { tenantId } },
        orderBy: { quantityOnHand: 'desc' },
      });
      if (stockItem) {
        await this.prisma.stockItem.update({
          where: { id: stockItem.id },
          data: { quantityReserved: { increment: line.quantity } },
        });
        await this.prisma.stockMovement.create({
          data: {
            skuId: line.skuId,
            type: 'outward',
            quantity: line.quantity,
            referenceType: 'order',
            referenceId: order.id,
            performedById: user.id,
            reasonCode: 'stock_reservation',
          },
        });
      }
    }

    // Status history
    await this.prisma.statusHistory.create({
      data: {
        entityType: 'order',
        entityId: order.id,
        toStatus: 'confirmed',
        changedById: user.id,
        note: 'Order confirmed, stock reserved',
      },
    });

    await this.auditService.log({
      actorId: user.id,
      actorName: user.employeeCode,
      action: 'CREATE',
      entityName: 'Order',
      entityId: order.id,
      afterState: { orderNumber, totalAmount, linesCount: resolvedLines.length },
    });

    return order;
  }

  async findAll(user: ScopedUser, query: { status?: string; search?: string; page?: number; limit?: number }) {
    const scopeWhere = this.scopingService.getOrderScope(user);
    const where: any = { ...scopeWhere, deletedAt: null };

    if (query.status) where.status = query.status;
    if (query.search) {
      const searchOR = [
        { orderNumber: { contains: query.search } },
        { customerName: { contains: query.search } },
        { customerPhone: { contains: query.search } },
      ];
      if (scopeWhere.OR) {
        where.AND = [{ OR: scopeWhere.OR }, { OR: searchOR }];
        delete where.OR;
      } else {
        where.OR = searchOR;
      }
    }

    const { page, limit, skip, take } = parsePagination(query, 25, 100);

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take,
        orderBy: { confirmedAt: 'desc' },
        include: {
          lines: { include: { sku: true } },
          shipments: true,
          invoices: {
            where: { isVoided: false },
            include: { lines: true },
          },
          payments: {
            include: { recordedBy: { select: { id: true, name: true, employeeCode: true } } },
            orderBy: { createdAt: 'desc' },
          },
          contact: true,
          createdBy: { select: { id: true, name: true, employeeCode: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const scope = this.scopingService.getOrderScope(user);
    const order = await this.prisma.order.findFirst({
      where: { id, tenantId, ...scope },
      include: {
        lines: { include: { sku: { include: { preferredSupplier: true } } } },
        shipments: true,
        invoices: {
          include: { lines: true, createdBy: { select: { id: true, name: true, employeeCode: true } } },
        },
        payments: {
          include: { recordedBy: { select: { id: true, name: true, employeeCode: true } } },
          orderBy: { createdAt: 'desc' },
        },
        quotation: { include: { lines: true } },
        contact: true,
        createdBy: { select: { id: true, name: true, employeeCode: true } },
      },
    });

    if (!order || order.deletedAt) throw new NotFoundException('Order not found');

    const scopeWhere: any = this.scopingService.getOrderScope(user);
    if (scopeWhere.createdById && order.createdById !== user.id) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async recordPayment(
    orderId: string,
    dto: {
      amount: number;
      paymentType?: string; // advance | milestone | final_settlement | full_payment
      paymentMethod?: string; // NEFT | RTGS | IMPS | Cheque | UPI | Cash
      transactionRef?: string;
      paymentDate?: string;
      notes?: string;
    },
    user: ScopedUser,
  ) {
    const tenantId = requireTenantId(user);
    const order = await this.findOne(orderId, user);

    const amount = Number(dto.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new BadRequestException('Valid payment amount is required');
    }

    // Find any active invoice for this order to link if present
    const activeInvoice = await this.prisma.invoice.findFirst({
      where: { orderId: order.id, tenantId, isVoided: false },
      orderBy: { createdAt: 'desc' },
    });

    const paymentRecord = await this.prisma.paymentRecord.create({
      data: {
        orderId: order.id,
        invoiceId: activeInvoice?.id || undefined,
        amount,
        paymentType: dto.paymentType || 'advance',
        paymentMethod: dto.paymentMethod || 'NEFT',
        transactionRef: dto.transactionRef?.trim(),
        paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
        notes: dto.notes,
        recordedById: user.id,
      },
    });

    const allPayments = await this.prisma.paymentRecord.findMany({
      where: { orderId: order.id, tenantId },
    });
    const totalPaid = allPayments.reduce((acc, p) => acc + p.amount, 0);

    let paymentStatus = 'pending';
    if (totalPaid >= order.totalAmount - 0.5) {
      paymentStatus = 'paid';
    } else if (totalPaid > 0) {
      paymentStatus = 'partial';
    }

    const balanceAmount = Math.max(0, Number((order.totalAmount - totalPaid).toFixed(2)));

    await this.prisma.order.updateMany({
      where: { id: order.id, tenantId },
      data: {
        paidAmount: totalPaid,
        balanceAmount,
        paymentStatus,
        paymentRef: dto.transactionRef?.trim() || order.paymentRef,
      },
    });
    const updatedOrder = await this.findOne(order.id, user);

    // If an active tax invoice exists, also update its balanceDue and paymentStatus
    if (activeInvoice) {
      const invBalanceDue = Math.max(0, Number((activeInvoice.totalAmount - totalPaid).toFixed(2)));
      await this.prisma.invoice.updateMany({
        where: { id: activeInvoice.id, tenantId },
        data: {
          paymentStatus: paymentStatus === 'paid' ? 'paid' : (totalPaid > 0 ? 'partial' : 'unpaid'),
          balanceDue: invBalanceDue,
          advanceAdjusted: totalPaid,
          transactionRef: dto.transactionRef?.trim() || activeInvoice.transactionRef,
        },
      });
    }

    await this.auditService.log({
      actorId: user.id,
      actorName: user.employeeCode,
      action: 'UPDATE',
      entityName: 'Order',
      entityId: order.id,
      afterState: { paymentId: paymentRecord.id, amount, totalPaid, balanceAmount, paymentStatus },
    });

    return updatedOrder;
  }

  async updateOrder(id: string, dto: Partial<CreateOrderDto> & { paymentStatus?: string }, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const order = await this.findOne(id, user);

    let subtotal = order.subtotal;
    let taxAmount = order.taxAmount;
    let totalAmount = order.totalAmount;

    // If lines are being updated, recalculate totals and adjust stock reservations
    if (dto.lines && dto.lines.length > 0) {
      const resolvedLines: { skuId: string; quantity: number; unitPrice: number }[] = [];
      for (const line of dto.lines) {
        const sku = await this.resolveSkuForLine(line, user);
        resolvedLines.push({
          skuId: sku.id,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        });
      }

      subtotal = resolvedLines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
      taxAmount = subtotal * 0.18;
      totalAmount = subtotal + taxAmount;

      // Restore previously reserved stock
      for (const oldLine of order.lines) {
        const stockItem = await this.prisma.stockItem.findFirst({
          where: { skuId: oldLine.skuId, warehouse: { tenantId } },
        });
        if (stockItem) {
          await this.prisma.stockItem.update({
            where: { id: stockItem.id },
            data: { quantityReserved: { decrement: oldLine.quantity } },
          });
        }
      }

      // Reserve new stock lines
      for (const newLine of resolvedLines) {
        const stockItem = await this.prisma.stockItem.findFirst({
          where: { skuId: newLine.skuId, warehouse: { tenantId } },
          orderBy: { quantityOnHand: 'desc' },
        });
        if (stockItem) {
          await this.prisma.stockItem.update({
            where: { id: stockItem.id },
            data: { quantityReserved: { increment: newLine.quantity } },
          });
        }
      }

      // Delete existing order lines and recreate
      await this.prisma.orderLine.deleteMany({ where: { orderId: id } });
      await this.prisma.orderLine.createMany({
        data: resolvedLines.map((l) => ({
          orderId: id,
          skuId: l.skuId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          totalPrice: l.quantity * l.unitPrice,
        })),
      });
    }

    await this.prisma.order.updateMany({
      where: { id, tenantId },
      data: {
        customerName: dto.customerName ?? order.customerName,
        customerPhone: dto.customerPhone ?? order.customerPhone,
        customerEmail: dto.customerEmail !== undefined ? dto.customerEmail : order.customerEmail,
        shippingAddress: dto.shippingAddress !== undefined ? dto.shippingAddress : order.shippingAddress,
        notes: dto.notes !== undefined ? sanitizeHtml(dto.notes) : order.notes,
        paymentStatus: dto.paymentStatus ?? order.paymentStatus,

        subtotal,
        taxAmount,
        totalAmount,
      },
    });
    const updated = await this.findOne(id, user);

    await this.auditService.log({
      actorId: user.id,
      actorName: user.employeeCode,
      action: 'UPDATE',
      entityName: 'Order',
      entityId: id,
      afterState: { customerName: updated.customerName, totalAmount: updated.totalAmount },
    });

    return updated;
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const order = await this.findOne(id, user);
    const oldStatus = order.status;

    await this.prisma.order.updateMany({
      where: { id, tenantId },
      data: { status: dto.status },
    });
    const updated = await this.findOne(id, user);

    await this.prisma.statusHistory.create({
      data: {
        entityType: 'order',
        entityId: id,
        fromStatus: oldStatus,
        toStatus: dto.status,
        changedById: user.id,
        note: dto.note,
      },
    });

    await this.auditService.log({
      actorId: user.id,
      actorName: user.employeeCode,
      action: 'STATUS_CHANGE',
      entityName: 'Order',
      entityId: id,
      beforeState: { status: oldStatus },
      afterState: { status: dto.status },
    });

    return updated;
  }

  async createShipment(dto: CreateShipmentDto, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const order = await this.findOne(dto.orderId, user);
    const count = await this.prisma.shipment.count({ where: { tenantId } });
    const shipmentNumber = `JNC-SHIP-${String(count + 1).padStart(5, '0')}`;

    // Perform initial live tracking probe
    let initialLiveTracking: LiveTrackingResult | null = null;
    try {
      initialLiveTracking = await this.liveTracker.trackShipment({
        trackingUrl: dto.trackingUrl,
        courierName: dto.courierName,
        trackingNumber: dto.trackingNumber,
        dispatchedAt: new Date(),
      });
    } catch (e: any) {
      this.logger.warn(`Initial live tracking probe failed: ${e.message}`);
    }

    const serializedNotes = this.serializeShipmentNotes(dto.notes, initialLiveTracking);
    const initialStatus = initialLiveTracking?.status || 'dispatched';

    const shipment = await this.prisma.shipment.create({
      data: {
        tenantId,
        shipmentNumber,
        orderId: dto.orderId,
        courierName: dto.courierName,
        trackingNumber: dto.trackingNumber,
        trackingUrl: dto.trackingUrl,
        notes: serializedNotes,
        status: initialStatus,
        dispatchedAt: new Date(),
      },
    });

    // Update order status to dispatched
    await this.updateStatus(dto.orderId, { status: 'dispatched', note: `Dispatched via ${dto.courierName} (${dto.trackingNumber})` }, user);

    // Decrement actual on-hand stock now that it's been picked/packed
    if (order.lines && order.lines.length > 0) {
      for (const line of order.lines) {
        if (!line.skuId) continue;
        const stockItem = await this.prisma.stockItem.findFirst({
          where: { skuId: line.skuId, warehouse: { tenantId: order.tenantId } },
          orderBy: { quantityOnHand: 'desc' },
        });
        if (stockItem) {
          await this.prisma.stockItem.update({
            where: { id: stockItem.id },
            data: {
              quantityOnHand: Math.max(0, stockItem.quantityOnHand - line.quantity),
              quantityReserved: Math.max(0, stockItem.quantityReserved - line.quantity),
            },
          });
        }
      }
    }

    // Send dispatch EMAIL notification to customer (safely, non-blocking)
    if (order.customerEmail) {
      try {
        const branding = await this.notificationsService.getBranding(tenantId);
        await this.notificationsService.sendEmail({
          tenantId,
          to: order.customerEmail,
          subject: `Your Order ${order.orderNumber} Has Been Dispatched - ${branding?.companyDisplayName || 'JNC'}`,
          html: this.buildDispatchEmailHtml(order, shipment, branding),
          relatedEntityType: 'shipment',
          relatedEntityId: shipment.id,
        });
      } catch (emailErr: any) {
        this.logger.warn(`Dispatch email notification skipped or failed: ${emailErr?.message || emailErr}`);
      }
    }

    await this.prisma.statusHistory.create({
      data: {
        entityType: 'shipment',
        entityId: shipment.id,
        toStatus: initialStatus,
        changedById: user.id,
        note: `Shipment created by ${user.employeeCode} (${initialLiveTracking?.statusLabel || 'Dispatched'})`,
      },
    });

    return this.formatShipmentWithLiveTracking(shipment);
  }

  async updateShipmentStatus(shipmentId: string, status: string, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const shipment = await this.prisma.shipment.findFirst({
      where: { id: shipmentId, tenantId },
      include: { order: true },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');

    const oldStatus = shipment.status;
    const deliveredAt = status === 'delivered' ? new Date() : (status === 'dispatched' || status === 'in_transit' ? null : shipment.deliveredAt);

    await this.prisma.shipment.updateMany({
      where: { id: shipmentId, tenantId },
      data: {
        status,
        deliveredAt,
      },
    });

    await this.prisma.statusHistory.create({
      data: {
        entityType: 'shipment',
        entityId: shipmentId,
        fromStatus: oldStatus,
        toStatus: status,
        changedById: user.id,
      },
    });

    // Auto-update order status
    if (status === 'delivered') {
      await this.prisma.order.updateMany({
        where: { id: shipment.orderId, tenantId },
        data: { status: 'delivered' },
      });

      // Send delivery EMAIL confirmation (safely, non-blocking)
      if (shipment.order && shipment.order.customerEmail) {
        try {
          const branding = await this.notificationsService.getBranding(tenantId);
          await this.notificationsService.sendEmail({
            tenantId,
            to: shipment.order.customerEmail,
            subject: `Your Order ${shipment.order.orderNumber} Has Been Delivered - ${branding?.companyDisplayName || 'JNC'}`,
            html: this.buildDeliveryEmailHtml(shipment.order, branding),
            relatedEntityType: 'order',
            relatedEntityId: shipment.orderId,
          });
        } catch (emailErr: any) {
          this.logger.warn(`Delivery email confirmation skipped or failed: ${emailErr?.message || emailErr}`);
        }
      }
    } else if (status === 'in_transit' || status === 'dispatched') {
      await this.prisma.order.updateMany({
        where: { id: shipment.orderId, tenantId },
        data: { status: 'dispatched' },
      });
    }

    const updated = await this.prisma.shipment.findFirst({
      where: { id: shipmentId, tenantId },
      include: { order: true },
    });
    return this.formatShipmentWithLiveTracking(updated);
  }

  async updateShipment(shipmentId: string, dto: UpdateShipmentDto, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const shipment = await this.prisma.shipment.findFirst({
      where: { id: shipmentId, tenantId },
      include: { order: true },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');

    const updateData: any = {};
    if (dto.courierName !== undefined) updateData.courierName = dto.courierName.trim();
    if (dto.trackingNumber !== undefined) updateData.trackingNumber = dto.trackingNumber.trim();
    if (dto.trackingUrl !== undefined) updateData.trackingUrl = dto.trackingUrl.trim() || null;
    if (dto.notes !== undefined) updateData.notes = dto.notes;

    if (dto.status !== undefined && dto.status !== shipment.status) {
      updateData.status = dto.status;
      if (dto.status === 'delivered') {
        updateData.deliveredAt = new Date();
      } else if (dto.status === 'dispatched' || dto.status === 'in_transit') {
        updateData.deliveredAt = null;
      }
    }

    await this.prisma.shipment.updateMany({
      where: { id: shipmentId, tenantId },
      data: updateData,
    });

    if (dto.status === 'delivered') {
      await this.prisma.order.updateMany({
        where: { id: shipment.orderId, tenantId },
        data: { status: 'delivered' },
      });
    } else if (dto.status === 'in_transit' || dto.status === 'dispatched') {
      await this.prisma.order.updateMany({
        where: { id: shipment.orderId, tenantId },
        data: { status: 'dispatched' },
      });
    }

    const updated = await this.prisma.shipment.findFirst({
      where: { id: shipmentId, tenantId },
      include: { order: true },
    });
    return this.formatShipmentWithLiveTracking(updated);
  }

  async listShipments(user: ScopedUser, query: { status?: string; search?: string; page?: number; limit?: number }) {
    const tenantId = requireTenantId(user);
    const scopeWhere = this.scopingService.getOrderScope(user);
    const where: any = {
      tenantId,
      order: {
        ...scopeWhere,
        deletedAt: null,
      },
    };

    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { shipmentNumber: { contains: query.search } },
        { courierName: { contains: query.search } },
        { trackingNumber: { contains: query.search } },
        { order: { customerName: { contains: query.search } } },
        { order: { orderNumber: { contains: query.search } } },
      ];
    }

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 50;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.shipment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { dispatchedAt: 'desc' },
        include: {
          order: {
            include: {
              lines: { include: { sku: true } },
              invoices: true,
              createdBy: { select: { id: true, name: true, employeeCode: true } },
            },
          },
        },
      }),
      this.prisma.shipment.count({ where }),
    ]);

    const formattedItems = items.map((item) => this.formatShipmentWithLiveTracking(item));

    return { items: formattedItems, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Verifies live tracking URL / AWB in real-time (for modal preview)
   */
  async verifyLiveTrackingUrl(dto: VerifyLiveTrackingUrlDto): Promise<LiveTrackingResult> {
    return this.liveTracker.trackShipment({
      trackingUrl: dto.trackingUrl,
      courierName: dto.courierName,
      trackingNumber: dto.trackingNumber,
      dispatchedAt: new Date(),
    });
  }

  /**
   * Synchronizes live courier tracking for an existing shipment
   */
  async syncShipmentTracking(shipmentId: string, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const shipment = await this.prisma.shipment.findFirst({
      where: { id: shipmentId, tenantId },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            customerName: true,
            customerPhone: true,
            shippingAddress: true,
            totalAmount: true,
          },
        },
      },
    });

    if (!shipment) throw new NotFoundException('Shipment not found');

    const liveResult = await this.liveTracker.trackShipment({
      trackingUrl: shipment.trackingUrl || undefined,
      courierName: shipment.courierName,
      trackingNumber: shipment.trackingNumber,
      dispatchedAt: shipment.dispatchedAt,
    });

    const { userNotes } = this.parseShipmentNotes(shipment.notes);
    const serializedNotes = this.serializeShipmentNotes(userNotes, liveResult);

    const oldStatus = shipment.status;
    const newStatus = liveResult.status;

    let updatedDeliveredAt = shipment.deliveredAt;
    if (newStatus === 'delivered' && !shipment.deliveredAt) {
      updatedDeliveredAt = new Date();
    }

    await this.prisma.shipment.updateMany({
      where: { id: shipmentId, tenantId },
      data: {
        notes: serializedNotes,
        status: newStatus,
        deliveredAt: updatedDeliveredAt,
      },
    });

    if (oldStatus !== newStatus) {
      await this.prisma.statusHistory.create({
        data: {
          entityType: 'shipment',
          entityId: shipment.id,
          fromStatus: oldStatus,
          toStatus: newStatus,
          changedById: user.id,
          note: `Live courier sync: ${liveResult.statusLabel}`,
        },
      });

      if (newStatus === 'delivered') {
        await this.prisma.order.updateMany({
          where: { id: shipment.orderId, tenantId },
          data: { status: 'delivered' },
        });
      }
    }

    const refreshed = await this.prisma.shipment.findFirst({
      where: { id: shipmentId, tenantId },
      include: {
        order: {
          include: {
            lines: { include: { sku: true } },
            invoices: true,
            createdBy: { select: { id: true, name: true, employeeCode: true } },
          },
        },
      },
    });

    return this.formatShipmentWithLiveTracking(refreshed);
  }

  /**
   * Retrieves full transit timeline and tracking checkpoints
   */
  async getShipmentLiveTimeline(shipmentId: string, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const shipment = await this.prisma.shipment.findFirst({
      where: { id: shipmentId, tenantId },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            customerName: true,
            customerPhone: true,
            shippingAddress: true,
            totalAmount: true,
          },
        },
      },
    });

    if (!shipment) throw new NotFoundException('Shipment not found');

    const formatted = this.formatShipmentWithLiveTracking(shipment);
    return formatted.liveTracking;
  }

  private buildDispatchEmailHtml(order: any, shipment: any, branding?: { companyDisplayName: string; companyPhone: string }): string {
    const companyName = branding?.companyDisplayName || BRAND_CONFIG.displayName;
    const phone = branding?.companyPhone || '';
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background: #2E5EFF; color: white; padding: 20px; text-align: center;">
          <h2 style="margin:0;">${companyName} — Order Dispatched</h2>
        </div>
        <div style="padding: 24px; background: #ffffff; color: #1e293b;">
          <p>Dear ${order.customerName},</p>
          <p>Your order <strong>${order.orderNumber}</strong> has been dispatched.</p>
          <table style="width:100%; border-collapse:collapse; margin: 16px 0;">
            <tr><td style="padding:8px; background:#f1f5f9; border: 1px solid #e2e8f0;"><strong>Courier</strong></td><td style="padding:8px; border: 1px solid #e2e8f0;">${shipment.courierName}</td></tr>
            <tr><td style="padding:8px; background:#f1f5f9; border: 1px solid #e2e8f0;"><strong>Tracking No.</strong></td><td style="padding:8px; border: 1px solid #e2e8f0;">${shipment.trackingNumber}</td></tr>
            ${shipment.trackingUrl ? `<tr><td style="padding:8px; background:#f1f5f9; border: 1px solid #e2e8f0;"><strong>Track Here</strong></td><td style="padding:8px; border: 1px solid #e2e8f0;"><a href="${shipment.trackingUrl}">Click to Track Shipment</a></td></tr>` : ''}
          </table>
          <p>For queries, please contact us${phone ? ` at <strong>${phone}</strong>` : ''}. Our team will be happy to assist you.</p>
          <p>Thank you for your business!</p>
          <p style="margin-top: 20px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
            <strong>${companyName}</strong>${phone ? ` • Support: ${phone}` : ''}
          </p>
        </div>
      </div>
    `;
  }

  private buildDeliveryEmailHtml(order: any, branding?: { companyDisplayName: string; companyPhone: string }): string {
    const companyName = branding?.companyDisplayName || BRAND_CONFIG.displayName;
    const phone = branding?.companyPhone || '';
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background: #00B8A9; color: white; padding: 20px; text-align: center;">
          <h2 style="margin:0;">${companyName} — Order Delivered</h2>
        </div>
        <div style="padding: 24px; background: #ffffff; color: #1e293b;">
          <p>Dear ${order.customerName},</p>
          <p>Your order <strong>${order.orderNumber}</strong> has been successfully delivered. Thank you!</p>
          <p>We hope you are satisfied with your purchase. For any feedback or assistance, please reach out to us${phone ? ` at <strong>${phone}</strong>` : ''}.</p>
          <p style="margin-top: 20px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
            <strong>${companyName}</strong>${phone ? ` • Support: ${phone}` : ''}
          </p>
        </div>
      </div>
    `;
  }
}
