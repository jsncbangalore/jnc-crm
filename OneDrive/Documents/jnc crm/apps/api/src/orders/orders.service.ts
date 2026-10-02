/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopingService, ScopedUser } from '../auth/scoping.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';

export interface CreateOrderDto {
  quotationId?: string;
  contactId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  shippingAddress?: string;
  lines: { skuId?: string; name?: string; quantity: number; unitPrice: number; hsnCode?: string }[];
  notes?: string;
}

export interface UpdateOrderStatusDto {
  status: string;
  note?: string;
}

export interface CreateShipmentDto {
  orderId: string;
  courierName: string;
  trackingNumber: string;
  trackingUrl?: string;
  notes?: string;
}

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private scopingService: ScopingService,
    private notificationsService: NotificationsService,
    private auditService: AuditService,
  ) {}

  private async resolveSkuForLine(
    line: { skuId?: string; name?: string; unitPrice: number; hsnCode?: string },
    user: ScopedUser,
    warehouseId?: string,
  ) {
    const tenantId = user?.tenantId || 'default-tenant-id';
    if (line.skuId && line.skuId.trim()) {
      const existing = await this.prisma.sku.findFirst({ where: { id: line.skuId, tenantId } });
      if (existing) return existing;
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
    const tenantId = user?.tenantId || 'default-tenant-id';
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
        notes: dto.notes,
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
        where: { skuId: line.skuId },
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
      where.OR = [
        { orderNumber: { contains: query.search } },
        { customerName: { contains: query.search } },
        { customerPhone: { contains: query.search } },
      ];
    }

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 50;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
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
    const order = await this.prisma.order.findUnique({
      where: { id },
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
    const order = await this.findOne(orderId, user);

    const amount = Number(dto.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new BadRequestException('Valid payment amount is required');
    }

    // Find any active invoice for this order to link if present
    const activeInvoice = await this.prisma.invoice.findFirst({
      where: { orderId: order.id, isVoided: false },
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
      where: { orderId: order.id },
    });
    const totalPaid = allPayments.reduce((acc, p) => acc + p.amount, 0);

    let paymentStatus = 'pending';
    if (totalPaid >= order.totalAmount - 0.5) {
      paymentStatus = 'paid';
    } else if (totalPaid > 0) {
      paymentStatus = 'partial';
    }

    const balanceAmount = Math.max(0, Number((order.totalAmount - totalPaid).toFixed(2)));

    const updatedOrder = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        paidAmount: totalPaid,
        balanceAmount,
        paymentStatus,
        paymentRef: dto.transactionRef?.trim() || order.paymentRef,
      },
      include: {
        lines: { include: { sku: true } },
        payments: {
          include: { recordedBy: { select: { id: true, name: true, employeeCode: true } } },
          orderBy: { createdAt: 'desc' },
        },
        invoices: { where: { isVoided: false } },
      },
    });

    // If an active tax invoice exists, also update its balanceDue and paymentStatus
    if (activeInvoice) {
      const invBalanceDue = Math.max(0, Number((activeInvoice.totalAmount - totalPaid).toFixed(2)));
      await this.prisma.invoice.update({
        where: { id: activeInvoice.id },
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
          where: { skuId: oldLine.skuId },
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
          where: { skuId: newLine.skuId },
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

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        customerName: dto.customerName ?? order.customerName,
        customerPhone: dto.customerPhone ?? order.customerPhone,
        customerEmail: dto.customerEmail !== undefined ? dto.customerEmail : order.customerEmail,
        shippingAddress: dto.shippingAddress !== undefined ? dto.shippingAddress : order.shippingAddress,
        notes: dto.notes !== undefined ? dto.notes : order.notes,
        paymentStatus: dto.paymentStatus ?? order.paymentStatus,
        subtotal,
        taxAmount,
        totalAmount,
      },
      include: {
        lines: { include: { sku: true } },
        shipments: true,
        invoices: { where: { isVoided: false }, include: { lines: true } },
        contact: true,
        createdBy: { select: { id: true, name: true, employeeCode: true } },
      },
    });

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
    const order = await this.findOne(id, user);
    const oldStatus = order.status;

    const updated = await this.prisma.order.update({
      where: { id },
      data: { status: dto.status },
      include: { lines: { include: { sku: true } }, shipments: true },
    });

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
    const order = await this.findOne(dto.orderId, user);
    const count = await this.prisma.shipment.count();
    const shipmentNumber = `JNC-SHIP-${String(count + 1).padStart(5, '0')}`;

    const shipment = await this.prisma.shipment.create({
      data: {
        shipmentNumber,
        orderId: dto.orderId,
        courierName: dto.courierName,
        trackingNumber: dto.trackingNumber,
        trackingUrl: dto.trackingUrl,
        notes: dto.notes,
        status: 'dispatched',
        dispatchedAt: new Date(),
      },
    });

    // Update order status to dispatched
    await this.updateStatus(dto.orderId, { status: 'dispatched', note: `Dispatched via ${dto.courierName} (${dto.trackingNumber})` }, user);

    // Decrement actual on-hand stock now that it's been picked/packed
    for (const line of order.lines) {
      const stockItem = await this.prisma.stockItem.findFirst({
        where: { skuId: line.skuId },
        orderBy: { quantityOnHand: 'desc' },
      });
      if (stockItem) {
        await this.prisma.stockItem.update({
          where: { id: stockItem.id },
          data: {
            quantityOnHand: { decrement: line.quantity },
            quantityReserved: { decrement: line.quantity },
          },
        });
      }
    }

    // Send dispatch EMAIL notification to customer (NOT WhatsApp)
    if (order.customerEmail) {
      const branding = await this.notificationsService.getBranding();
      await this.notificationsService.sendEmail({
        to: order.customerEmail,
        subject: `Your Order ${order.orderNumber} Has Been Dispatched - ${branding.companyDisplayName}`,
        html: this.buildDispatchEmailHtml(order, shipment, branding),
        relatedEntityType: 'shipment',
        relatedEntityId: shipment.id,
      });
    }

    await this.prisma.statusHistory.create({
      data: {
        entityType: 'shipment',
        entityId: shipment.id,
        toStatus: 'dispatched',
        changedById: user.id,
        note: `Shipment created by ${user.employeeCode}`,
      },
    });

    return shipment;
  }

  async updateShipmentStatus(shipmentId: string, status: string, user: ScopedUser) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { order: true },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');

    const oldStatus = shipment.status;
    const updated = await this.prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        status,
        deliveredAt: status === 'delivered' ? new Date() : shipment.deliveredAt,
      },
      include: { order: true },
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

    // Auto-update order status on delivery
    if (status === 'delivered') {
      await this.prisma.order.update({
        where: { id: shipment.orderId },
        data: { status: 'delivered' },
      });

      // Send delivery EMAIL confirmation (NOT WhatsApp)
      if (shipment.order.customerEmail) {
        const branding = await this.notificationsService.getBranding();
        await this.notificationsService.sendEmail({
          to: shipment.order.customerEmail,
          subject: `Your Order ${shipment.order.orderNumber} Has Been Delivered - ${branding.companyDisplayName}`,
          html: this.buildDeliveryEmailHtml(shipment.order, branding),
          relatedEntityType: 'order',
          relatedEntityId: shipment.orderId,
        });
      }
    }

    return updated;
  }

  async listShipments(user: ScopedUser, query: { status?: string; search?: string; page?: number; limit?: number }) {
    const scopeWhere = this.scopingService.getOrderScope(user);
    const where: any = {
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

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  private buildDispatchEmailHtml(order: any, shipment: any, branding?: { companyDisplayName: string; companyPhone: string }): string {
    const companyName = branding?.companyDisplayName || 'JS Network Communication';
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
    const companyName = branding?.companyDisplayName || 'JS Network Communication';
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
