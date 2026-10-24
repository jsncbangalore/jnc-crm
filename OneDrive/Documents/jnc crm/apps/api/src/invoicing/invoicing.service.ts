/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopingService, ScopedUser } from '../auth/scoping.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { requireTenantId } from '../common/tenant.util';
import { parsePagination } from '../common/pagination.util';
import { calculateGst, numberToIndianWords } from './invoice-config';
import { generateInvoicePdfBuffer } from './pdf-generator';
import { validateLutStatus } from './lut-validator';
import { sanitizeHtml } from '../common/html-sanitize.util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
const ptp = require('pdf-to-printer');

@Injectable()
export class InvoicingService {
  constructor(
    private prisma: PrismaService,
    private scopingService: ScopingService,
    private notificationsService: NotificationsService,
    private auditService: AuditService,
  ) {}

  /**
   * Generates sequential Invoice Number per Indian Financial Year (April - March)
   * Format: [PREFIX]/26-27/0001
   * Numbers are NEVER reused even if voided.
   */
  async generateFinancialYearInvoiceNumber(date: Date = new Date(), prefix?: string, tenantId?: string): Promise<string> {
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-indexed (0 = Jan, 3 = Apr, 11 = Dec)

    let fyStartYear: number;
    let fyEndYear: number;

    if (month >= 3) {
      // April to December
      fyStartYear = year;
      fyEndYear = year + 1;
    } else {
      // January to March
      fyStartYear = year - 1;
      fyEndYear = year;
    }

    const fyCode = `${String(fyStartYear).slice(-2)}-${String(fyEndYear).slice(-2)}`;
    const fyStartDate = new Date(fyStartYear, 3, 1, 0, 0, 0, 0); // April 1st
    const fyEndDate = new Date(fyEndYear, 2, 31, 23, 59, 59, 999); // March 31st

    let cleanPrefix = prefix?.trim().toUpperCase();
    if (!cleanPrefix && tenantId) {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      if (tenant?.invoicePrefix) cleanPrefix = tenant.invoicePrefix.toUpperCase();
      else if (tenant?.code) cleanPrefix = tenant.code.toUpperCase();
    }
    if (!cleanPrefix) cleanPrefix = 'INV';

    // Count all invoices created in this financial year for this tenant
    const safeTenantId = requireTenantId(tenantId);
    const countWhere: any = {
      tenantId: safeTenantId,
      createdAt: {
        gte: fyStartDate,
        lte: fyEndDate,
      },
    };

    const countInFy = await this.prisma.invoice.count({
      where: countWhere,
    });

    const sequenceNumber = String(countInFy + 1).padStart(4, '0');
    return `${cleanPrefix}/${fyCode}/${sequenceNumber}`;
  }

  /**
   * Generates GST-compliant Invoice from an existing Order
   */
  async generateInvoiceForOrder(
    orderId: string,
    user: ScopedUser,
    options?: { paymentTerms?: string; dueDate?: string; notes?: string },
  ) {
    const tenantId = requireTenantId(user);
    const scopeWhere = this.scopingService.getOrderScope(user);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId, ...scopeWhere },
      include: {
        lines: { include: { sku: true } },
        contact: { include: { company: true } },
        invoices: { where: { isVoided: false } },
      },
    });

    if (!order || order.deletedAt) {
      throw new NotFoundException('Order not found');
    }

    // Must be confirmed or later
    if (order.status === 'cancelled') {
      throw new BadRequestException('Cannot generate invoice for a cancelled order');
    }

    // If an active invoice already exists, return it
    if (order.invoices && order.invoices.length > 0) {
      return this.findOne(order.invoices[0].id, user);
    }

    // Determine Customer State for GST calculation (Home State: Karnataka)
    const customerCompany = order.contact?.company;
    const customerState = customerCompany?.state || 'Karnataka';
    const customerGstin = customerCompany?.gstin || undefined;

    // Generate FY sequential number
    const invoiceNumber = await this.generateFinancialYearInvoiceNumber(new Date(), undefined, user.tenantId);

    // Calculate line items with tax breakdown & snapshot HSN codes
    let subtotal = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    const lineItemsData = order.lines.map((orderLine) => {
      const lineTaxable = orderLine.quantity * orderLine.unitPrice;
      // Dynamically read tax rate configured on the specific SKU / Line Item (e.g. 18%, 12%, 28%, 5%)
      const taxRate = orderLine.sku?.taxRate ?? orderLine.taxRate ?? 18.0;
      const taxCalc = calculateGst(lineTaxable, customerState, taxRate);

      subtotal += lineTaxable;
      totalCgst += taxCalc.cgstAmount;
      totalSgst += taxCalc.sgstAmount;
      totalIgst += taxCalc.igstAmount;

      return {
        skuId: orderLine.skuId,
        hsnCode: orderLine.sku?.hsnCode || '85184000', // Snapshot at generation time
        description: orderLine.sku?.name || 'Electronic Security / Communication System Item',
        quantity: orderLine.quantity,
        unitPrice: orderLine.unitPrice,
        taxRate,
        cgstRate: taxCalc.cgstRate,
        cgstAmount: taxCalc.cgstAmount,
        sgstRate: taxCalc.sgstRate,
        sgstAmount: taxCalc.sgstAmount,
        igstRate: taxCalc.igstRate,
        igstAmount: taxCalc.igstAmount,
        lineTotal: taxCalc.grandTotal,
      };
    });

    const totalAmount = subtotal + totalCgst + totalSgst + totalIgst;
    const advanceAdjusted = (order.paidAmount && order.paidAmount > 0) ? order.paidAmount : (order.advanceAmount || 0);
    const balanceDue = Math.max(0, Number((totalAmount - advanceAdjusted).toFixed(2)));
    let initialPaymentStatus = 'unpaid';
    if (advanceAdjusted >= totalAmount - 0.5) {
      initialPaymentStatus = 'paid';
    } else if (advanceAdjusted > 0) {
      initialPaymentStatus = 'partial';
    }

    const invoice = await this.prisma.invoice.create({
      data: {
        tenantId: requireTenantId(user.tenantId || (order as any).tenantId),
        invoiceNumber,
        orderId: order.id,
        companyId: customerCompany?.id || undefined,
        createdById: user.id,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerEmail: order.customerEmail,
        customerGstin,
        customerState,
        billingAddress: order.shippingAddress || customerCompany?.address || '',
        subtotal,
        cgstAmount: totalCgst,
        sgstAmount: totalSgst,
        igstAmount: totalIgst,
        totalAmount,
        advanceAdjusted,
        balanceDue,
        paymentStatus: initialPaymentStatus,
        transactionRef: order.paymentRef,
        paymentTerms: options?.paymentTerms || (advanceAdjusted > 0 ? `Advance Adjusted (Bal: Rs. ${balanceDue.toLocaleString('en-IN')})` : 'Due on Receipt (Net 30 Days)'),
        dueDate: options?.dueDate ? new Date(options?.dueDate) : new Date(Date.now() + 30 * 86_400_000), // Net 30 days
        notes: sanitizeHtml(options?.notes || order.notes),

        lines: {
          create: lineItemsData,
        },
      },
      include: {
        lines: { include: { sku: true } },
        order: true,
        payments: true,
        createdBy: { select: { id: true, name: true, employeeCode: true } },
      },
    });

    // Record Audit Log
    await this.auditService.log({
      actorId: user.id,
      actorName: user.employeeCode,
      action: 'CREATE',
      entityName: 'Invoice',
      entityId: invoice.id,
      afterState: { invoiceNumber, orderId: order.id, totalAmount },
    });

    // Automated LUT Validity Verification for SEZ Invoices
    if (invoice.isSez || invoice.docType === 'sez_invoice') {
      const lutStatus = validateLutStatus(invoice.lutBondNo || '', invoice.lutValidity || '', invoice.invoiceDate);
      if (lutStatus.isExpired || lutStatus.isExpiringSoon) {
        await this.auditService.log({
          actorId: user.id,
          actorName: user.employeeCode,
          action: 'SEZ_LUT_WARNING',
          entityName: 'Invoice',
          entityId: invoice.id,
          afterState: {
            invoiceNumber: invoice.invoiceNumber,
            docType: invoice.docType,
            customerName: invoice.customerName,
            totalAmount: invoice.totalAmount,
            lutBondNo: invoice.lutBondNo,
            lutValidity: invoice.lutValidity,
            severity: lutStatus.severity,
            warningMessage: lutStatus.warningMessage,
            daysRemaining: lutStatus.daysRemaining,
            acknowledgedByUser: !!(options as any)?.lutAcknowledged,
          },
        });
      }
    }

    return invoice;
  }

  /**
   * Generates next sequential document number for any document type:
   * - Tax Invoice: [PREFIX]/26-27/0001 or 002/26-27
   * - SEZ Invoice: 013/25-26
   * - Proforma Invoice: 006/26-27 or PI/26-27/0001
   * - Delivery Challan: 024/26-27 or DC/26-27/0001
   */
  async getNextDocumentNumber(docType: string = 'tax_invoice', customPrefix?: string, user?: ScopedUser): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const fyStart = month >= 3 ? year : year - 1;
    const fyEnd = fyStart + 1;
    const fyCode = `${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}`;

    const tenantId = requireTenantId(user);
    const count = await this.prisma.invoice.count({
      where: {
        docType,
        tenantId,
      },
    });

    const seq4 = String(count + 1).padStart(4, '0');

    if (customPrefix) {
      return `${customPrefix}/${fyCode}/${seq4}`;
    }

    // Dynamic tenant prefix handling
    if (tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { invoicePrefix: true, code: true },
      });
      const tPrefix = tenant?.invoicePrefix || tenant?.code || 'INV';
      if (docType === 'delivery_challan') {
        return `DC/${tPrefix}/${fyCode}/${seq4}`;
      }
      if (docType === 'proforma_invoice') {
        return `PI/${tPrefix}/${fyCode}/${seq4}`;
      }
      if (docType === 'credit_note') {
        return `CN/${tPrefix}/${fyCode}/${seq4}`;
      }
      return `${tPrefix}/${fyCode}/${seq4}`;
    }

    if (docType === 'credit_note') {
      const cnSeq = String(count + 1).padStart(2, '0');
      return `CN${cnSeq}/${fyCode}`;
    }
    if (docType === 'purchase_order') {
      const poSeq = String(count + 1).padStart(2, '0');
      return `PO_${poSeq}/${fyCode}`;
    }
    if (docType === 'delivery_challan') {
      return `DC/${fyCode}/${seq4}`;
    }
    if (docType === 'proforma_invoice') {
      return `PI/${fyCode}/${seq4}`;
    }
    if (docType === 'sez_invoice') {
      return `SEZ/${fyCode}/${seq4}`;
    }
    return `INV/${fyCode}/${seq4}`;
  }

  /**
   * Direct creation of any document type (Tax Invoice, SEZ Invoice, Proforma Invoice, Delivery Challan)
   */
  async createDirectDocument(
    user: ScopedUser,
    dto: {
      docType?: string; // tax_invoice | sez_invoice | proforma_invoice | delivery_challan
      invoiceNumber?: string;
      invoiceDate?: string;
      dueDate?: string;
      poDate?: string;
      buyerOrderNo?: string;
      referenceNo?: string;
      paymentTerms?: string;
      paymentStatus?: string;
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      customerGstin?: string;
      customerState?: string;
      billingAddress?: string;
      deliveryAddress?: string;
      lutBondNo?: string;
      lutValidity?: string;
      isSez?: boolean;
      advancePercent?: number;
      advanceAdjusted?: number;
      balanceDue?: number;
      paymentMethod?: string;
      transactionRef?: string;
      notes?: string;
      lines: Array<{
        skuId?: string;
        hsnCode?: string;
        description: string;
        unit?: string;
        quantity: number;
        unitPrice: number;
        taxRate?: number;
      }>;
    },
  ) {
    const tenantId = requireTenantId(user);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new BadRequestException('Tenant not found.');
    }

    const docType = dto.docType || 'tax_invoice';
    const isSez = docType === 'sez_invoice' || !!dto.isSez;

    const missingFields: string[] = [];
    if (!tenant.name?.trim()) missingFields.push('Company Name');
    if (!tenant.address?.trim()) missingFields.push('Address');
    if (!tenant.gstin?.trim()) missingFields.push('GSTIN');
    if (!tenant.bankName?.trim() || !tenant.bankAccountNumber?.trim() || !tenant.bankIfsc?.trim()) {
      missingFields.push('Bank Details (Bank Name, Account Number, IFSC)');
    }
    if (isSez && !tenant.lutBondNo?.trim() && !dto.lutBondNo?.trim()) {
      missingFields.push('LUT Bond No');
    }

    if (missingFields.length > 0) {
      throw new BadRequestException(
        `Cannot create invoice. Company profile in Settings is incomplete. Missing: ${missingFields.join(', ')}.`
      );
    }

    const customerState = dto.customerState || tenant.state || 'Karnataka';

    let invoiceNumber = dto.invoiceNumber?.trim();
    if (!invoiceNumber) {
      invoiceNumber = await this.getNextDocumentNumber(docType, undefined, user);
    }

    // Ensure uniqueness
    const existing = await this.prisma.invoice.findFirst({ where: { invoiceNumber, tenantId } });
    if (existing) {
      invoiceNumber = `${invoiceNumber}-${Date.now().toString().slice(-4)}`;
    }

    let subtotal = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    const rawItems = (dto.lines && dto.lines.length > 0 ? dto.lines : (dto as any).items) || [];
    const lineItemsData = rawItems.map((line) => {
      const lineTaxable = Number((line.quantity * line.unitPrice).toFixed(2));
      const taxRate = docType === 'delivery_challan' ? 0 : (line.taxRate ?? 18.0);
      const taxCalc = calculateGst(lineTaxable, customerState, taxRate, isSez);

      subtotal += lineTaxable;
      totalCgst += taxCalc.cgstAmount;
      totalSgst += taxCalc.sgstAmount;
      totalIgst += taxCalc.igstAmount;

      return {
        skuId: line.skuId || undefined,
        hsnCode: line.hsnCode || (docType === 'delivery_challan' ? '-' : '85312000'),
        description: line.description,
        unit: line.unit || "No's",
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxRate,
        cgstRate: taxCalc.cgstRate,
        cgstAmount: taxCalc.cgstAmount,
        sgstRate: taxCalc.sgstRate,
        sgstAmount: taxCalc.sgstAmount,
        igstRate: taxCalc.igstRate,
        igstAmount: taxCalc.igstAmount,
        lineTotal: docType === 'delivery_challan' ? lineTaxable : taxCalc.grandTotal,
      };
    });

    const totalAmount = docType === 'delivery_challan'
      ? subtotal
      : (isSez ? subtotal : Number((subtotal + totalCgst + totalSgst + totalIgst).toFixed(2)));

    const advancePercent = dto.advancePercent ?? (docType === 'proforma_invoice' ? 50 : undefined);
    const advanceAmount = advancePercent ? Number(((totalAmount * advancePercent) / 100).toFixed(2)) : undefined;
    const advanceAdjusted = dto.advanceAdjusted ? Number(dto.advanceAdjusted) : 0;
    const balanceDue = Math.max(0, Number((totalAmount - advanceAdjusted).toFixed(2)));
    let initialStatus = dto.paymentStatus || 'unpaid';
    if (!dto.paymentStatus) {
      if (advanceAdjusted >= totalAmount - 0.5 && totalAmount > 0) {
        initialStatus = 'paid';
      } else if (advanceAdjusted > 0) {
        initialStatus = 'partial';
      }
    }

    const invoice = await this.prisma.invoice.create({
      data: {
        tenantId,
        invoiceNumber,
        docType,
        createdById: user.id,
        invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : new Date(),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        poDate: dto.poDate ? new Date(dto.poDate) : undefined,
        buyerOrderNo: dto.buyerOrderNo,
        referenceNo: dto.referenceNo,
        paymentTerms: dto.paymentTerms || (docType === 'delivery_challan' ? 'Immediately' : 'Advance'),
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        customerEmail: dto.customerEmail,
        customerGstin: dto.customerGstin,
        customerState,
        billingAddress: dto.billingAddress,
        deliveryAddress: dto.deliveryAddress || dto.billingAddress,
        lutBondNo: dto.lutBondNo || tenant.lutBondNo || null,
        lutValidity: dto.lutValidity || tenant.lutValidity || null,
        isSez,
        advancePercent,
        advanceAmount,
        advanceAdjusted,
        balanceDue,
        paymentStatus: initialStatus,
        paymentMethod: (dto as any).paymentMethod,
        transactionRef: (dto as any).transactionRef,
        subtotal: Number(subtotal.toFixed(2)),
        cgstAmount: Number(totalCgst.toFixed(2)),
        sgstAmount: Number(totalSgst.toFixed(2)),
        igstAmount: Number(totalIgst.toFixed(2)),
        totalAmount: Number(totalAmount.toFixed(2)),
        notes: sanitizeHtml(dto.notes),
        lines: {

          create: lineItemsData,
        },
      },
      include: {
        lines: { include: { sku: true } },
        order: true,
        payments: true,
        createdBy: { select: { id: true, name: true, employeeCode: true } },
      },
    });

    // Record Audit Log
    await this.auditService.log({
      actorId: user.id,
      actorName: user.employeeCode,
      action: 'CREATE',
      entityName: 'Invoice',
      entityId: invoice.id,
      afterState: { invoiceNumber, docType, totalAmount },
    });

    // Automated LUT Validity Verification for SEZ Invoices
    if (isSez) {
      const lutStatus = validateLutStatus(invoice.lutBondNo || '', invoice.lutValidity || '', invoice.invoiceDate);
      if (lutStatus.isExpired || lutStatus.isExpiringSoon) {
        await this.auditService.log({
          actorId: user.id,
          actorName: user.employeeCode,
          action: 'SEZ_LUT_WARNING',
          entityName: 'Invoice',
          entityId: invoice.id,
          afterState: {
            invoiceNumber: invoice.invoiceNumber,
            docType: invoice.docType,
            customerName: invoice.customerName,
            totalAmount: invoice.totalAmount,
            lutBondNo: invoice.lutBondNo,
            lutValidity: invoice.lutValidity,
            severity: lutStatus.severity,
            warningMessage: lutStatus.warningMessage,
            daysRemaining: lutStatus.daysRemaining,
            acknowledgedByUser: !!(dto as any).lutAcknowledged,
          },
        });
      }
    }

    return invoice;
  }

  /**
   * Update an existing Invoice / Document with recalculations & line replacements
   */
  async updateDocument(
    id: string,
    user: ScopedUser,
    dto: {
      docType?: string;
      invoiceNumber?: string;
      invoiceDate?: string;
      dueDate?: string;
      poDate?: string;
      buyerOrderNo?: string;
      referenceNo?: string;
      paymentTerms?: string;
      paymentStatus?: string;
      status?: string;
      customerName?: string;
      customerPhone?: string;
      customerEmail?: string;
      customerGstin?: string;
      customerState?: string;
      billingAddress?: string;
      deliveryAddress?: string;
      lutBondNo?: string;
      lutValidity?: string;
      isSez?: boolean;
      advancePercent?: number;
      advanceAdjusted?: number;
      balanceDue?: number;
      paymentMethod?: string;
      transactionRef?: string;
      notes?: string;
      lines?: Array<{
        skuId?: string;
        hsnCode?: string;
        description: string;
        unit?: string;
        quantity: number;
        unitPrice: number;
        taxRate?: number;
      }>;
    },
  ) {
    const tenantId = requireTenantId(user);
    const existing = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!existing) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }

    const docType = dto.docType || existing.docType || 'tax_invoice';
    const isSez = docType === 'sez_invoice' || (dto.isSez !== undefined ? !!dto.isSez : !!existing.isSez);
    const customerState = dto.customerState || existing.customerState || 'Karnataka';

    let subtotal = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    const linesToProcess = dto.lines || existing.lines;

    const lineItemsData = linesToProcess.map((line) => {
      const lineTaxable = Number((line.quantity * line.unitPrice).toFixed(2));
      const taxRate = docType === 'delivery_challan' ? 0 : (line.taxRate ?? 18.0);
      const taxCalc = calculateGst(lineTaxable, customerState, taxRate, isSez);

      subtotal += lineTaxable;
      totalCgst += taxCalc.cgstAmount;
      totalSgst += taxCalc.sgstAmount;
      totalIgst += taxCalc.igstAmount;

      return {
        skuId: line.skuId || undefined,
        hsnCode: line.hsnCode || (docType === 'delivery_challan' ? '-' : '85312000'),
        description: line.description,
        unit: (line as any).unit || "No's",
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxRate,
        cgstRate: taxCalc.cgstRate,
        cgstAmount: taxCalc.cgstAmount,
        sgstRate: taxCalc.sgstRate,
        sgstAmount: taxCalc.sgstAmount,
        igstRate: taxCalc.igstRate,
        igstAmount: taxCalc.igstAmount,
        lineTotal: docType === 'delivery_challan' ? lineTaxable : taxCalc.grandTotal,
      };
    });

    const totalAmount = docType === 'delivery_challan'
      ? subtotal
      : (isSez ? subtotal : Number((subtotal + totalCgst + totalSgst + totalIgst).toFixed(2)));

    const advancePercent = dto.advancePercent !== undefined ? dto.advancePercent : existing.advancePercent;
    const advanceAmount = advancePercent ? Number(((totalAmount * advancePercent) / 100).toFixed(2)) : undefined;
    const advanceAdjusted = dto.advanceAdjusted !== undefined ? Number(dto.advanceAdjusted) : (existing.advanceAdjusted || 0);
    const balanceDue = Math.max(0, Number((totalAmount - advanceAdjusted).toFixed(2)));
    let paymentStatus = dto.paymentStatus || (dto.status as string) || existing.paymentStatus;
    if (!dto.paymentStatus && !dto.status) {
      if (advanceAdjusted >= totalAmount - 0.5 && totalAmount > 0) {
        paymentStatus = 'paid';
      } else if (advanceAdjusted > 0) {
        paymentStatus = 'partial';
      }
    }

    // Delete existing lines and recreate updated lines
    await this.prisma.invoiceLine.deleteMany({
      where: { invoiceId: id },
    });

    // Re-create updated invoice; tenantId verified on line 550 (existing.tenantId)
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        invoiceNumber: dto.invoiceNumber?.trim() || existing.invoiceNumber,
        docType,
        invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : existing.invoiceDate,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : existing.dueDate,
        poDate: dto.poDate ? new Date(dto.poDate) : existing.poDate,
        buyerOrderNo: dto.buyerOrderNo !== undefined ? dto.buyerOrderNo : existing.buyerOrderNo,
        referenceNo: dto.referenceNo !== undefined ? dto.referenceNo : existing.referenceNo,
        paymentTerms: dto.paymentTerms || existing.paymentTerms,
        customerName: dto.customerName || existing.customerName,
        customerPhone: dto.customerPhone || existing.customerPhone,
        customerEmail: dto.customerEmail !== undefined ? dto.customerEmail : existing.customerEmail,
        customerGstin: dto.customerGstin !== undefined ? dto.customerGstin : existing.customerGstin,
        customerState,
        billingAddress: dto.billingAddress !== undefined ? dto.billingAddress : existing.billingAddress,
        deliveryAddress: dto.deliveryAddress !== undefined ? dto.deliveryAddress : existing.deliveryAddress,
        lutBondNo: dto.lutBondNo || existing.lutBondNo,
        lutValidity: dto.lutValidity || existing.lutValidity,
        isSez,
        advancePercent,
        advanceAmount,
        advanceAdjusted,
        balanceDue,
        paymentStatus,
        paymentMethod: dto.paymentMethod || existing.paymentMethod,
        transactionRef: dto.transactionRef !== undefined ? dto.transactionRef : existing.transactionRef,
        subtotal: Number(subtotal.toFixed(2)),
        cgstAmount: Number(totalCgst.toFixed(2)),
        sgstAmount: Number(totalSgst.toFixed(2)),
        igstAmount: Number(totalIgst.toFixed(2)),
        totalAmount: Number(totalAmount.toFixed(2)),
        notes: dto.notes !== undefined ? sanitizeHtml(dto.notes) : existing.notes,
        lines: {

          create: lineItemsData,
        },
      },
      include: {
        lines: { include: { sku: true } },
        order: true,
        payments: true,
        createdBy: { select: { id: true, name: true, employeeCode: true } },
      },
    });

    // Record Audit Log
    await this.auditService.log({
      actorId: user.id,
      actorName: user.employeeCode,
      action: 'UPDATE',
      entityName: 'Invoice',
      entityId: updated.id,
      beforeState: { invoiceNumber: existing.invoiceNumber, totalAmount: existing.totalAmount },
      afterState: { invoiceNumber: updated.invoiceNumber, totalAmount: updated.totalAmount },
    });

    // Automated LUT Validity Verification for SEZ Invoices
    if (isSez) {
      const lutStatus = validateLutStatus(updated.lutBondNo || '', updated.lutValidity || '', updated.invoiceDate);
      if (lutStatus.isExpired || lutStatus.isExpiringSoon) {
        await this.auditService.log({
          actorId: user.id,
          actorName: user.employeeCode,
          action: 'SEZ_LUT_WARNING',
          entityName: 'Invoice',
          entityId: updated.id,
          afterState: {
            invoiceNumber: updated.invoiceNumber,
            docType: updated.docType,
            customerName: updated.customerName,
            totalAmount: updated.totalAmount,
            lutBondNo: updated.lutBondNo,
            lutValidity: updated.lutValidity,
            severity: lutStatus.severity,
            warningMessage: lutStatus.warningMessage,
            daysRemaining: lutStatus.daysRemaining,
            acknowledgedByUser: !!(dto as any).lutAcknowledged,
          },
        });
      }
    }

    return updated;
  }

  /**
   * Retrieve Invoices with RBAC Scoping and docType filter
   */
  async findAll(
    user: ScopedUser,
    query?: { page?: number; limit?: number; search?: string; status?: string; docType?: string },
  ) {
    const scope = this.scopingService.getInvoiceScope(user);
    const where: any = { ...scope };

    if (query?.docType && query.docType !== 'all') {
      where.docType = query.docType;
    }

    if (query?.search) {
      const searchOR = [
        { invoiceNumber: { contains: query.search } },
        { customerName: { contains: query.search } },
        { customerPhone: { contains: query.search } },
        { customerEmail: { contains: query.search } },
        { customerGstin: { contains: query.search } },
        { buyerOrderNo: { contains: query.search } },
      ];
      if (scope.OR) {
        where.AND = [{ OR: scope.OR }, { OR: searchOR }];
        delete where.OR;
      } else {
        where.AND = [{ OR: searchOR }];
      }
    }

    if (query?.status && query.status !== 'all') {
      where.paymentStatus = query.status;
    }

    const { page, limit, skip, take } = parsePagination(query, 50, 100);

    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          lines: true,
          order: true,
          payments: {
            include: { recordedBy: { select: { id: true, name: true, employeeCode: true } } },
            orderBy: { createdAt: 'desc' },
          },
          createdBy: { select: { id: true, name: true, employeeCode: true } },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      companyProfile: await this.getCompanyProfile(user),
    };
  }

  /**
   * Retrieve Single Source of Truth Company Invoice Profile
   */
  async getCompanyProfile(userOrTenantId?: ScopedUser | string) {
    const tenantId =
      typeof userOrTenantId === 'string'
        ? userOrTenantId
        : userOrTenantId?.tenantId;

    if (tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
      });

      if (tenant) {
        return {
          companyName: tenant.name,
          tradeName: tenant.name,
          address: tenant.address || '',
          city: tenant.city || '',
          state: tenant.state || '',
          pincode: tenant.pincode || '',
          gstin: tenant.gstin || '',
          pan: tenant.pan || (tenant.gstin && tenant.gstin.length >= 12 ? tenant.gstin.substring(2, 12) : ''),
          phone: tenant.phone || '',
          email: tenant.email || '',
          website: tenant.website || '',
          bankName: tenant.bankName || '',
          bankAccountNumber: tenant.bankAccountNumber || '',
          bankIfsc: tenant.bankIfsc || '',
          bankBranch: tenant.bankBranch || '',
          bankAccountHolder: tenant.name || '',
          lutBondNo: tenant.lutBondNo || '',
          logoUrl:
            tenant.logoUrl && !tenant.logoUrl.startsWith('data:') && tenant.logoUrl.trim() !== ''
              ? tenant.logoUrl
              : (process.env.PRODUCT_LOGO_URL || ''),
          invoicePrefix: tenant.invoicePrefix || 'INV',
          isOnboarded: tenant.isOnboarded || false,
        };
      }
    }

    const defaultName = process.env.PRODUCT_NAME || 'CRM';
    return {
      companyName: defaultName,
      tradeName: defaultName,
      address: '',
      city: '',
      state: '',
      pincode: '',
      gstin: '',
      pan: '',
      phone: '',
      email: '',
      website: '',
      bankName: '',
      bankAccountNumber: '',
      bankIfsc: '',
      bankBranch: '',
      bankAccountHolder: defaultName,
      lutBondNo: '',
      logoUrl: process.env.PRODUCT_LOGO_URL || '',
      invoicePrefix: 'INV',
      isOnboarded: false,
    };
  }

  /**
   * Retrieve Signatory Settings (Signature & Stamp)
   */
  async getSignatorySettings(userOrTenantId?: ScopedUser | string) {
    const tenantId =
      typeof userOrTenantId === 'string'
        ? userOrTenantId
        : userOrTenantId?.tenantId;

    if (tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
      });

      if (tenant) {
        return {
          companyName: tenant.name || process.env.PRODUCT_NAME || 'CRM',
          signatoryName: tenant.signatoryName || `${tenant.name} Authorized Signatory`,
          signatoryDesignation: tenant.signatoryDesignation || 'Authorized Signatory',
          signatureImage: tenant.signatureUrl || null,
          stampImage: tenant.stampUrl || null,
        };
      }
    }

    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'invoice_signatory_config' },
    });

    const defaultCompanyName = (process.env.PRODUCT_NAME || '').trim() || 'Company';

    if (!setting) {
      return {
        companyName: defaultCompanyName,
        signatoryName: '',
        signatoryDesignation: '',
        signatureImage: null,
        stampImage: null,
      };
    }

    try {
      const parsed = JSON.parse(setting.value);
      return {
        companyName: parsed.companyName || defaultCompanyName,
        signatoryName: parsed.signatoryName || '',
        signatoryDesignation: parsed.signatoryDesignation || '',
        signatureImage: parsed.signatureImage || null,
        stampImage: parsed.stampImage || null,
      };
    } catch {
      return {
        companyName: defaultCompanyName,
        signatoryName: '',
        signatoryDesignation: '',
        signatureImage: null,
        stampImage: null,
      };
    }
  }

  /**
   * Update Signatory Settings (Admin & Super Admin only)
   */
  async updateSignatorySettings(
    user: ScopedUser,
    dto: {
      companyName?: string;
      signatoryName?: string;
      signatoryDesignation?: string;
      signatureImage?: string | null;
      stampImage?: string | null;
    },
  ) {
    if (user.role !== 'platform_super_admin' && user.role !== 'tenant_admin' && user.role !== 'admin') {
      throw new ForbiddenException('Only Administrators can modify Invoice Signatory and Stamp settings.');
    }

    const tenantId = user.tenantId || (user.role === 'platform_super_admin' ? (await this.prisma.tenant.findFirst())?.id : undefined);

    const defaultCompanyName = (process.env.PRODUCT_NAME || '').trim() || 'Company';
    let resolvedCompanyName = dto.companyName?.trim() || defaultCompanyName;

    if (tenantId) {
      const updateData: any = {
        signatoryName: dto.signatoryName,
        signatoryDesignation: dto.signatoryDesignation,
        signatureUrl: dto.signatureImage,
        stampUrl: dto.stampImage,
      };

      if (dto.companyName?.trim()) {
        updateData.name = dto.companyName.trim();
        resolvedCompanyName = dto.companyName.trim();
      }

      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: updateData,
      });
    }

    const payload = {
      companyName: resolvedCompanyName,
      signatoryName: dto.signatoryName || '',
      signatoryDesignation: dto.signatoryDesignation || '',
      signatureImage: dto.signatureImage || null,
      stampImage: dto.stampImage || null,
    };

    await this.prisma.systemSetting.upsert({
      where: { key: 'invoice_signatory_config' },
      update: { value: JSON.stringify(payload) },
      create: { key: 'invoice_signatory_config', value: JSON.stringify(payload) },
    });

    return payload;
  }

  /**
   * Update Tenant Legal Company Invoicing Profile & Bank Details
   */
  async updateCompanyProfile(user: ScopedUser, dto: any) {
    if (user.role !== 'platform_super_admin' && user.role !== 'tenant_admin' && user.role !== 'admin') {
      throw new ForbiddenException('Only Administrators can modify Company Profile and Invoicing settings.');
    }

    const tenantId = requireTenantId(user);
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        name: dto.companyName || dto.name,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        pincode: dto.pincode,
        gstin: dto.gstin,
        pan: dto.pan,
        phone: dto.phone,
        email: dto.email,
        website: dto.website,
        bankName: dto.bankName,
        bankAccountNumber: dto.bankAccountNumber,
        bankIfsc: dto.bankIfsc,
        bankBranch: dto.bankBranch,
        logoUrl: dto.logoUrl,
        lutBondNo: dto.lutBondNo,
        lutValidity: dto.lutValidity,
        invoicePrefix: dto.invoicePrefix,
        isOnboarded: true,
      },
    });

    return this.getCompanyProfile(tenantId);
  }

  /**
   * Get single invoice by ID with items, company header profile, and signatory config
   */
  async findOne(id: string, user: ScopedUser) {
    const scope = this.scopingService.getInvoiceScope(user);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, ...scope },
      include: {
        lines: { include: { sku: true } },
        company: {
          include: {
            contacts: {
              where: { deletedAt: null, tenantId: scope.tenantId },
              orderBy: { isPrimary: 'desc' },
            },
          },
        },
        order: {
          include: {
            contact: {
              include: { company: true },
            },
            createdBy: { select: { id: true, name: true, employeeCode: true } },
          },
        },
        payments: {
          include: {
            recordedBy: { select: { id: true, name: true, employeeCode: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        createdBy: { select: { id: true, name: true, employeeCode: true } },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Determine default billing email candidate:
    const defaultBillingEmail =
      invoice.company?.billingEmail ||
      invoice.order?.contact?.email ||
      invoice.company?.contacts?.[0]?.email ||
      invoice.customerEmail ||
      null;

    const targetTenantId = invoice.tenantId || user.tenantId;
    const signatorySettings = await this.getSignatorySettings(targetTenantId);
    const companyProfile = await this.getCompanyProfile(targetTenantId);

    return {
      ...invoice,
      defaultBillingEmail,
      signatorySettings,
      companyProfile,
    };
  }

  /**
   * Record a payment (Advance, Milestone, Final Settlement) against an Invoice
   */
  async recordPayment(
    invoiceId: string,
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
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: {
        payments: true,
        order: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.isVoided) {
      throw new BadRequestException('Cannot record payment for a voided invoice');
    }

    const amount = Number(dto.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new BadRequestException('Valid payment amount is required');
    }

    const paymentRecord = await this.prisma.paymentRecord.create({
      data: {
        tenantId: requireTenantId(user.tenantId || invoice.tenantId),
        invoiceId: invoice.id,
        orderId: invoice.orderId || undefined,
        amount,
        paymentType: dto.paymentType || (invoice.docType === 'proforma_invoice' ? 'advance' : 'milestone'),
        paymentMethod: dto.paymentMethod || 'NEFT',
        transactionRef: dto.transactionRef?.trim(),
        paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
        notes: sanitizeHtml(dto.notes),
        recordedById: user.id,

      },
    });

    // Calculate total paid across all payments for this invoice
    const allPayments = await this.prisma.paymentRecord.findMany({
      where: { invoiceId: invoice.id, tenantId: invoice.tenantId },
    });
    const totalPaid = allPayments.reduce((acc, p) => acc + p.amount, 0);

    let paymentStatus = 'unpaid';
    if (totalPaid >= invoice.totalAmount - 0.5) {
      paymentStatus = 'paid';
    } else if (totalPaid > 0) {
      paymentStatus = 'partial';
    }

    const balanceDue = Math.max(0, Number((invoice.totalAmount - totalPaid).toFixed(2)));

    await this.prisma.invoice.updateMany({
      where: { id: invoice.id, tenantId: invoice.tenantId },
      data: {
        paymentStatus,
        balanceDue,
        paymentMethod: dto.paymentMethod || invoice.paymentMethod || 'NEFT',
        transactionRef: dto.transactionRef?.trim() || invoice.transactionRef,
      },
    });
    const updatedInvoice = await this.findOne(invoice.id, user);

    // If linked to an order, also update order payment status & paidAmount
    if (invoice.orderId) {
      const orderPayments = await this.prisma.paymentRecord.findMany({
        where: { orderId: invoice.orderId, tenantId: invoice.tenantId },
      });
      const orderTotalPaid = orderPayments.reduce((acc, p) => acc + p.amount, 0);
      const order = await this.prisma.order.findFirst({ where: { id: invoice.orderId, tenantId: invoice.tenantId } });
      if (order) {
        let orderPaymentStatus = 'pending';
        if (orderTotalPaid >= order.totalAmount - 0.5) {
          orderPaymentStatus = 'paid';
        } else if (orderTotalPaid > 0) {
          orderPaymentStatus = 'partial';
        }
        await this.prisma.order.updateMany({
          where: { id: invoice.orderId, tenantId: invoice.tenantId },
          data: {
            paidAmount: orderTotalPaid,
            balanceAmount: Math.max(0, Number((order.totalAmount - orderTotalPaid).toFixed(2))),
            paymentStatus: orderPaymentStatus,
            paymentRef: dto.transactionRef?.trim() || order.paymentRef,
          },
        });
      }
    }

    // Record Audit Log
    await this.auditService.log({
      actorId: user.id,
      actorName: user.employeeCode,
      action: 'UPDATE',
      entityName: 'Invoice',
      entityId: invoice.id,
      afterState: { paymentId: paymentRecord.id, amount, totalPaid, balanceDue, paymentStatus },
    });

    return updatedInvoice;
  }

  /**
   * Void an invoice (Admin & Super Admin only)
   */
  async voidInvoice(id: string, reason: string, user: ScopedUser) {
    if (user.role !== 'platform_super_admin' && user.role !== 'tenant_admin' && user.role !== 'admin') {
      throw new ForbiddenException('Only Administrators can void invoices.');
    }

    const tenantId = requireTenantId(user);
    const invoice = await this.prisma.invoice.findFirst({ where: { id, tenantId } });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.isVoided) {
      throw new BadRequestException('Invoice is already voided');
    }

    await this.prisma.invoice.updateMany({
      where: { id, tenantId },
      data: {
        isVoided: true,
        voidedAt: new Date(),
        voidReason: reason || 'Voided by Administrator',
      },
    });
    const updated = await this.findOne(id, user);

    // Record in Audit Log
    await this.auditService.log({
      actorId: user.id,
      actorName: user.employeeCode,
      action: 'STATUS_CHANGE',
      entityName: 'Invoice',
      entityId: invoice.id,
      beforeState: { isVoided: false },
      afterState: { isVoided: true, voidReason: reason },
    });

    return updated;
  }

  /**
   * Helper to get company logo base64
   */
   private getLogoBase64(): string {
     try {
       const logoFile = process.env.PRODUCT_LOGO_PATH || 'logo.png';
       const possiblePaths = [
         path.join(process.cwd(), 'apps/web/public', logoFile),
         path.join(process.cwd(), 'public', logoFile),
         path.join(process.cwd(), '../web/public', logoFile),
         path.join(process.cwd(), '../../apps/web/public', logoFile),
       ];
       for (const p of possiblePaths) {
         if (fs.existsSync(p)) {
           const buf = fs.readFileSync(p);
           const mime = p.endsWith('.png') ? 'image/png' : 'image/jpeg';
           return `data:${mime};base64,${buf.toString('base64')}`;
         }
       }
     } catch (e) {
       // fallback
     }
     return '';
   }

  /**
   * Generate Binary PDF Buffer for direct download or printing
   */
  async getPdf(id: string, user: ScopedUser, templateType?: string) {
    const invoice = await this.findOne(id, user);
    const activeDocType = templateType || invoice.docType || 'tax_invoice';

    const documentTitle =
      activeDocType === 'delivery_challan'
        ? 'Delivery_Challan'
        : activeDocType === 'proforma_invoice'
        ? 'Proforma_Invoice'
        : activeDocType === 'sez_invoice' || invoice.isSez
        ? 'SEZ_Tax_Invoice'
        : 'Tax_Invoice';

    const buffer = await generateInvoicePdfBuffer(invoice, {
      templateType: activeDocType,
      companyProfile: invoice.companyProfile,
      signatorySettings: invoice.signatorySettings,
    });

    const cleanNum = invoice.invoiceNumber.replace(/[\/\\]/g, '_');
    const filename = `${documentTitle}_${cleanNum}.pdf`;

    return { buffer, filename };
  }

  /**
   * Send Invoice via Email with clean notification text and attached official PDF document
   */
  async emailInvoice(
    id: string,
    user: ScopedUser,
    options?: { recipientEmail?: string; customNote?: string; templateType?: string },
  ) {
    const invoice = await this.findOne(id, user);

    const targetRecipient =
      options?.recipientEmail?.trim() ||
      invoice.company?.billingEmail?.trim() ||
      invoice.order?.contact?.email?.trim() ||
      invoice.company?.contacts?.[0]?.email?.trim() ||
      invoice.customerEmail?.trim();

    if (!targetRecipient) {
      throw new BadRequestException('No recipient email address available for this document');
    }

    const activeDocType = options?.templateType || invoice.docType || 'tax_invoice';
    const isSez = activeDocType === 'sez_invoice' || invoice.isSez;
    const isProforma = activeDocType === 'proforma_invoice';
    const isDC = activeDocType === 'delivery_challan';

    const documentTitle = isDC
      ? 'Delivery Challan'
      : isProforma
      ? 'Proforma Invoice'
      : isSez
      ? 'Tax Invoice (SEZ / LUT)'
      : 'Tax Invoice';

    const effectiveTotal = isDC || isSez ? invoice.subtotal : invoice.totalAmount;

    const formatDateDMY = (d: Date | string) => {
      if (!d) return '-';
      const date = new Date(d);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    };

    // Generate authentic Vector PDF buffer
    const pdfBuffer = await generateInvoicePdfBuffer(invoice, {
      templateType: activeDocType,
      companyProfile: invoice.companyProfile,
      signatorySettings: invoice.signatorySettings,
    });

    const cleanDocTitle = isDC
      ? 'Delivery_Challan'
      : isProforma
      ? 'Proforma_Invoice'
      : isSez
      ? 'SEZ_Tax_Invoice'
      : 'Tax_Invoice';
    const pdfFileName = `${cleanDocTitle}_${invoice.invoiceNumber.replace(/[\/\\]/g, '_')}.pdf`;

    // Dynamic Company Branding
    const rawBranding: any = invoice.companyProfile || (await this.notificationsService.getBranding(invoice.tenantId));
    const companyDisplayName = rawBranding?.companyName || rawBranding?.companyDisplayName || process.env.PRODUCT_NAME || 'CRM';
    const companyPhone = rawBranding?.phone || rawBranding?.companyPhone || '';

    // Clean, elegant, professional email body (NO raw code, NO huge duplicate copies)
    const emailHtml = `
      <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff; color: #1e293b;">
        <h2 style="color: #1e40af; margin-top: 0; margin-bottom: 6px;">${companyDisplayName}</h2>
        <p style="font-size: 14px; margin-bottom: 12px;">Dear <strong>${invoice.customerName}</strong>,</p>
        <p style="font-size: 13px; color: #334155; line-height: 1.5; margin-bottom: 16px;">
          Please find attached your official <strong>${documentTitle} (${invoice.invoiceNumber})</strong> from ${companyDisplayName}.
        </p>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px 16px; margin-bottom: 16px; font-size: 12.5px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 4px 0; color: #64748b; width: 40%;"><strong>Document Type:</strong></td>
              <td style="padding: 4px 0; font-weight: bold; color: #0f172a;">${documentTitle}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;"><strong>Document No:</strong></td>
              <td style="padding: 4px 0; font-family: monospace; font-weight: bold; color: #0f172a;">${invoice.invoiceNumber}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;"><strong>Dated:</strong></td>
              <td style="padding: 4px 0; color: #0f172a;">${formatDateDMY(invoice.invoiceDate)}</td>
            </tr>
            ${invoice.buyerOrderNo ? `
            <tr>
              <td style="padding: 4px 0; color: #64748b;"><strong>${isDC ? 'PO Order No' : 'Buyer Order No'}:</strong></td>
              <td style="padding: 4px 0; font-family: monospace; color: #0f172a;">${invoice.buyerOrderNo}</td>
            </tr>
            ` : ''}
            ${!isDC ? `
            <tr>
              <td style="padding: 4px 0; color: #64748b;"><strong>Total Amount:</strong></td>
              <td style="padding: 4px 0; font-weight: bold; color: #059669; font-size: 14px;">₹${effectiveTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 4px 0; color: #64748b;"><strong>Payment Terms:</strong></td>
              <td style="padding: 4px 0; color: #0f172a;">${invoice.paymentTerms || (isDC ? 'Immediately' : 'Advance')}</td>
            </tr>
          </table>
        </div>

        ${options?.customNote ? `<div style="padding: 12px; background-color: #f0fdf4; border-left: 4px solid #22c55e; border-radius: 4px; margin-bottom: 16px; font-size: 13px; color: #166534;"><em>${options.customNote}</em></div>` : ''}

        <p style="font-size: 13px; color: #475569; margin-bottom: 20px;">
          The official document has been attached to this email as a PDF file: <strong>${pdfFileName}</strong>.
        </p>

        <p style="font-size: 13px; font-weight: 600; color: #0f172a; margin-bottom: 4px;">
          Warm regards,<br />
          <strong>${companyDisplayName}</strong>
        </p>
        <p style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
          ${companyPhone ? `Phone: ${companyPhone} • ` : ''}Official Commercial Billing
        </p>
      </div>
    `;

    // Send email with attached binary PDF
    await this.notificationsService.sendEmail({
      to: targetRecipient,
      subject: `${documentTitle} ${invoice.invoiceNumber} from ${companyDisplayName}`,
      html: emailHtml,
      attachments: [
        {
          filename: pdfFileName,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
      relatedEntityType: 'invoice',
      relatedEntityId: invoice.id,
    });

    return {
      success: true,
      message: `${documentTitle} ${invoice.invoiceNumber} successfully emailed as PDF to ${targetRecipient}`,
      recipient: targetRecipient,
      filename: pdfFileName,
    };
  }

  /**
   * List installed Windows/system printers for direct 1-click printing
   */
  async getInstalledPrinters() {
    try {
      const printers = await ptp.getPrinters();
      const defaultPrinter = await ptp.getDefaultPrinter().catch(() => null);
      return {
        printers: printers || [],
        defaultPrinter: defaultPrinter || null,
      };
    } catch (err: any) {
      return {
        printers: [
          {
            deviceId: 'Brother DCP-T520W Printer',
            name: 'Brother DCP-T520W Printer',
            paperSizes: ['A4', 'Letter'],
          },
        ],
        defaultPrinter: {
          deviceId: 'Brother DCP-T520W Printer',
          name: 'Brother DCP-T520W Printer',
        },
        error: err?.message,
      };
    }
  }

  /**
   * Direct Print straight to physical Windows printer (e.g. Brother DCP-T520W)
   * Completely bypasses browser preview dialogs and sends job directly to Windows Print Spooler.
   */
  async directPrintInvoice(
    invoiceId: string,
    user: ScopedUser,
    dto: {
      printerName?: string;
      copies?: number;
      copyType?: string;
      templateType?: string;
      paperSize?: string;
    },
  ) {
    const invoice = await this.findOne(invoiceId, user);
    const activeDocType = dto.templateType || invoice.docType || 'tax_invoice';
    const copiesCount = Math.max(1, Math.min(20, dto.copies || 1));

    // Resolve target printer: user selected -> default printer -> 'Brother DCP-T520W Printer'
    let targetPrinter = dto.printerName?.trim();
    if (!targetPrinter) {
      try {
        const def = await ptp.getDefaultPrinter();
        targetPrinter = def?.name;
      } catch (e) {}
    }
    if (!targetPrinter) {
      targetPrinter = 'Brother DCP-T520W Printer';
    }

    const copyType = dto.copyType || 'original';
    const copiesToPrint: Array<{ label: string }> = [];

    if (copyType === 'all_three') {
      copiesToPrint.push({ label: 'Original for Recipient' });
      copiesToPrint.push({ label: 'Duplicate for Transporter' });
      copiesToPrint.push({ label: 'Triplicate for Supplier' });
    } else if (copyType === 'duplicate') {
      copiesToPrint.push({ label: 'Duplicate for Transporter' });
    } else if (copyType === 'triplicate') {
      copiesToPrint.push({ label: 'Triplicate for Supplier' });
    } else if (copyType === 'extra') {
      copiesToPrint.push({ label: 'Extra / Office Copy' });
    } else {
      copiesToPrint.push({ label: 'Original for Recipient' });
    }

    const tempFiles: string[] = [];
    try {
      for (const item of copiesToPrint) {
        const buffer = await generateInvoicePdfBuffer(invoice, {
          templateType: activeDocType,
          copyLabel: item.label,
          companyProfile: invoice.companyProfile,
          signatorySettings: invoice.signatorySettings,
        });

        const tempFileName = `print_${crypto.randomUUID()}.pdf`;
        const tempPath = path.join(os.tmpdir(), tempFileName);
        fs.writeFileSync(tempPath, buffer);
        tempFiles.push(tempPath);

        const printOptions: any = {
          printer: targetPrinter,
          copies: copiesCount,
          scale: 'fit',
          paperSize: dto.paperSize === 'A5' ? 'A5' : 'A4',
          orientation: 'portrait',
        };

        await ptp.print(tempPath, printOptions);
      }

      await this.auditService.log({
        tenantId: requireTenantId(user),
        actorId: user.id,
        actorName: user.employeeCode || 'User',
        action: 'INVOICE_DIRECT_PRINTED',
        entityName: 'Invoice',
        entityId: invoice.id,
        afterState: {
          invoiceNumber: invoice.invoiceNumber,
          printer: targetPrinter,
          copies: copiesCount,
          copyType,
        },
      });

      return {
        success: true,
        message: `Print job sent directly to ${targetPrinter}!`,
        printer: targetPrinter,
        copies: copiesCount * copiesToPrint.length,
      };
    } catch (err: any) {
      throw new BadRequestException(`Direct print to ${targetPrinter} failed: ${err.message || err}`);
    } finally {
      // Clean up temporary files with safe delay to let spooler release file handle
      setTimeout(() => {
        tempFiles.forEach((file) => {
          try {
            if (fs.existsSync(file)) fs.unlinkSync(file);
          } catch (e) {}
        });
      }, 8000);
    }
  }
}


