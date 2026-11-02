/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Optional, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopingService, ScopedUser } from '../auth/scoping.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { PostingService } from '../ledger/posting.service';
import { PaymentsService } from '../payments/payments.service';
import { DocumentSeriesService } from '../common/document-series.service';
import { getIndianFinancialYear, getFinancialYearDateBounds } from '../ledger/ledger.service';
import { requireTenantId } from '../common/tenant.util';
import { parsePagination } from '../common/pagination.util';
import { calculateGst, numberToIndianWords } from './invoice-config';
import { generateInvoicePdfBuffer } from './pdf-generator';
import { validateLutStatus } from './lut-validator';
import { sanitizeHtml } from '../common/html-sanitize.util';
import { decryptAtRest } from '../common/encryption.util';
import { getCompanyProfileCompleteness, getUnifiedCompanyProfile, updateUnifiedCompanyProfile } from '../common/company-profile.util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
const ptp = require('pdf-to-printer');

@Injectable()
export class InvoicingService {
  private readonly logger = new Logger(InvoicingService.name);

  constructor(
    private prisma: PrismaService,
    private scopingService: ScopingService,
    private notificationsService: NotificationsService,
    private auditService: AuditService,
    private paymentsService: PaymentsService,
    private documentSeriesService: DocumentSeriesService,
    @Optional() private postingService?: PostingService,
  ) {}

  /**
   * Generates sequential Invoice Number per Indian Financial Year (April - March)
   * Format: [PREFIX]/26-27/0001
   * Numbers are NEVER reused even if voided.
   */
  async generateFinancialYearInvoiceNumber(date: Date = new Date(), prefix?: string, tenantId?: string, customTx?: any): Promise<string> {
    if (tenantId) {
      const res = await this.documentSeriesService.getNextDocumentNumber(
        tenantId,
        'tax_invoice',
        date,
        customTx || this.prisma,
        prefix
      );
      return res.formattedNumber;
    }

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
    let cleanPrefix = prefix?.trim().toUpperCase() || 'INV';
    return `${cleanPrefix}/${fyCode}/0001`;
  }

  /**
   * Generates GST-compliant Invoice from an existing Order
   */
  async generateInvoiceForOrder(
    orderId: string,
    user: ScopedUser,
    options?: { paymentTerms?: string; dueDate?: string; notes?: string; isPartial?: boolean },
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

    // If an active invoice already exists and partial is not requested, return it (idempotent per order)
    if (order.invoices && order.invoices.length > 0 && !options?.isPartial) {
      return this.findOne(order.invoices[0].id, user);
    }

    // Determine Customer State for GST calculation (Home State: Karnataka)
    const customerCompany = order.contact?.company;
    const customerState = customerCompany?.state || 'Karnataka';
    const customerGstin = customerCompany?.gstin || undefined;

    return this.prisma.$transaction(async (tx) => {
      // Generate FY sequential number with row lock
      const invoiceNumber = await this.generateFinancialYearInvoiceNumber(new Date(), undefined, user.tenantId, tx);

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

      const invoice = await tx.invoice.create({
        data: {
          tenantId: requireTenantId(user.tenantId || (order as any).tenantId),
          invoiceNumber,
          orderId: order.id,
          quotationId: order.quotationId,
          customerId: order.customerId || customerCompany?.id || undefined,
          companyId: order.customerId || customerCompany?.id || undefined,
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

      // Record Audit Log within tx
      await this.auditService.log({
        actorId: user.id,
        actorName: user.employeeCode,
        action: 'CREATE',
        entityName: 'Invoice',
        entityId: invoice.id,
        afterState: { invoiceNumber, orderId: order.id, totalAmount },
      }, tx);

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
          }, tx);
        }
      }

      // Post to ledger within the same interactive transaction
      await this.postingService?.postInvoice(invoice, user, tx);

      return invoice;
    });
  }

  /**
   * Generates next sequential document number for any document type:
   * - Tax Invoice: [PREFIX]/26-27/0001 or 002/26-27
   * - SEZ Invoice: 013/25-26
   * - Proforma Invoice: 006/26-27 or PI/26-27/0001
   * - Delivery Challan: 024/26-27 or DC/26-27/0001
   */
  async getNextDocumentNumber(
    docType: string = 'tax_invoice',
    customPrefix?: string,
    user?: ScopedUser,
    customTx?: any
  ): Promise<string> {
    const tenantId = requireTenantId(user);
    const series = await this.documentSeriesService.getNextDocumentNumber(
      tenantId,
      docType,
      new Date(),
      customTx,
      customPrefix
    );
    return series.formattedNumber;
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

    const completeness = await getCompanyProfileCompleteness(this.prisma, tenantId, {
      isSez,
      dtoLutBondNo: dto.lutBondNo,
    });

    if (!completeness.complete) {
      throw new BadRequestException(
        `Cannot create invoice. Company profile in Settings is incomplete. Missing: ${completeness.missing.join(', ')}.`
      );
    }

    const fieldErrors: Record<string, string> = {};

    if (!dto.customerName || !dto.customerName.trim()) {
      fieldErrors.customerName = 'Customer or company name is required';
    }

    let resolvedPhone = dto.customerPhone?.trim();
    if (!resolvedPhone) {
      if ((dto as any).customerId || (dto as any).companyId) {
        const contact = await this.prisma.contact.findFirst({
          where: { companyId: (dto as any).customerId || (dto as any).companyId, tenantId },
          select: { phone: true },
        });
        if (contact?.phone?.trim()) {
          resolvedPhone = contact.phone.trim();
        }
      }
    }
    if (!resolvedPhone) {
      resolvedPhone = '-';
    }

    const rawItems = (dto.lines && dto.lines.length > 0 ? dto.lines : (dto as any).items) || [];
    if (!rawItems || rawItems.length === 0) {
      fieldErrors.lines = 'At least one line item is required';
    } else {
      rawItems.forEach((line, idx) => {
        if (!line.description || !line.description.trim()) {
          fieldErrors[`lines[${idx}].description`] = `Line ${idx + 1}: Description is required`;
        }
        if (line.quantity === undefined || line.quantity === null || Number(line.quantity) <= 0) {
          fieldErrors[`lines[${idx}].quantity`] = `Line ${idx + 1}: Quantity must be greater than 0`;
        }
        if (line.unitPrice === undefined || line.unitPrice === null || Number(line.unitPrice) < 0) {
          fieldErrors[`lines[${idx}].unitPrice`] = `Line ${idx + 1}: Unit price must be 0 or positive`;
        }
      });
    }

    if (Object.keys(fieldErrors).length > 0) {
      throw new BadRequestException({
        message: 'Validation failed for document creation',
        fieldErrors,
      });
    }

    // Verify skuIds to prevent P2003 foreign key violation
    const skuIds = rawItems.map((l) => l.skuId).filter((id): id is string => !!id && typeof id === 'string');
    let validSkuIds = new Set<string>();
    if (skuIds.length > 0) {
      const existingSkus = await this.prisma.sku.findMany({
        where: { id: { in: skuIds }, tenantId },
        select: { id: true },
      });
      validSkuIds = new Set(existingSkus.map((s) => s.id));
    }

    const customerState = dto.customerState || tenant.state || 'Karnataka';

    const invoiceDateObj = dto.invoiceDate ? new Date(dto.invoiceDate) : new Date();
    if (isNaN(invoiceDateObj.getTime())) {
      throw new BadRequestException('A valid invoice date is required.');
    }
    const fyCode = getIndianFinancialYear(invoiceDateObj);
    const fyBounds = getFinancialYearDateBounds(fyCode);

    return this.prisma.$transaction(async (tx) => {
      // Number Order Invariant: Block documents dated before the latest issued date of the same series unless an admin confirms
      const latestDoc = await tx.invoice.findFirst({
        where: {
          tenantId,
          docType,
          invoiceDate: { gte: fyBounds.start, lte: fyBounds.end },
          isVoided: false,
        },
        orderBy: { invoiceDate: 'desc' },
        select: { invoiceNumber: true, invoiceDate: true },
      });
      if (latestDoc) {
        const latestDate = new Date(latestDoc.invoiceDate);
        if (invoiceDateObj < latestDate && !(dto as any).adminConfirmBackdate && !(dto as any).adminConfirmed) {
          throw new BadRequestException(
            `Document date (${invoiceDateObj.toISOString().slice(0, 10)}) cannot be earlier than the latest issued document in this series (${latestDoc.invoiceNumber} dated ${latestDate.toISOString().slice(0, 10)}). Admin confirmation required to backdate.`
          );
        }
      }

      // Credit Note Invariant: References an existing posted invoice of the same party
      let referencedInvoice: any = null;
      if (docType === 'credit_note') {
        const refNo = (dto.referenceNo || (dto as any).invoiceId || (dto as any).originalInvoiceNumber || '').trim();
        if (!refNo) {
          throw new BadRequestException('A credit note must reference an existing posted invoice of the same party.');
        }
        referencedInvoice = await tx.invoice.findFirst({
          where: {
            tenantId,
            OR: [{ id: refNo }, { invoiceNumber: refNo }],
            docType: { in: ['tax_invoice', 'sez_invoice'] },
            isVoided: false,
          },
        });
        if (!referencedInvoice) {
          throw new BadRequestException(`Referenced invoice "${refNo}" not found, voided, or is not an active sales invoice.`);
        }
        const targetPartyId = (dto as any).companyId || (dto as any).customerId;
        if (targetPartyId && referencedInvoice.customerId && referencedInvoice.customerId !== targetPartyId && referencedInvoice.companyId !== targetPartyId) {
          throw new BadRequestException('Credit note customer does not match the customer on the referenced invoice.');
        }
      }

      let invoiceNumber = dto.invoiceNumber?.trim();
      if (!invoiceNumber) {
        invoiceNumber = await this.getNextDocumentNumber(docType, undefined, user, tx);
      } else {
        const existing = await tx.invoice.findFirst({ where: { invoiceNumber, tenantId } });
        if (existing) {
          throw new BadRequestException({
            message: `Document number "${invoiceNumber}" already exists in the system.`,
            fieldErrors: { invoiceNumber: `Document number "${invoiceNumber}" already exists` },
          });
        }
      }

      let subtotal = 0;
      let totalCgst = 0;
      let totalSgst = 0;
      let totalIgst = 0;

      const lineItemsData = rawItems.map((line) => {
        const lineTaxable = Number((line.quantity * line.unitPrice).toFixed(2));
        const taxRate = docType === 'delivery_challan' ? 0 : (line.taxRate ?? 18.0);
        const taxCalc = calculateGst(lineTaxable, customerState, taxRate, isSez);

        subtotal += lineTaxable;
        totalCgst += taxCalc.cgstAmount;
        totalSgst += taxCalc.sgstAmount;
        totalIgst += taxCalc.igstAmount;

        return {
          skuId: (line.skuId && validSkuIds.has(line.skuId)) ? line.skuId : undefined,
          hsnCode: line.hsnCode || (docType === 'delivery_challan' ? '-' : '85312000'),
          description: line.description,
          unit: line.unit || "No's",
          quantity: Math.max(1, Math.round(Number(line.quantity) || 1)),
          unitPrice: Number(line.unitPrice) || 0,
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

      if (docType === 'credit_note' && referencedInvoice) {
        // Check date >= invoice date
        const invIssueDate = new Date((referencedInvoice as any).issueDate || referencedInvoice.invoiceDate || referencedInvoice.createdAt);
        const cnIssueDate = (dto as any).issueDate ? new Date((dto as any).issueDate) : (dto.invoiceDate ? new Date(dto.invoiceDate) : new Date());
        if (cnIssueDate < invIssueDate) {
          throw new BadRequestException(
            `Credit note date (${cnIssueDate.toISOString().slice(0, 10)}) cannot precede referenced invoice date (${invIssueDate.toISOString().slice(0, 10)}).`
          );
        }

        // Cap calculation: Invoice total minus earlier credit notes (NOT unpaid balance)
        const earlierCreditNotes = await tx.invoice.findMany({
          where: {
            tenantId,
            docType: 'credit_note',
            isVoided: false,
            OR: [
              { referenceNo: referencedInvoice.invoiceNumber },
              { referenceNo: referencedInvoice.id },
            ],
          },
          select: { totalAmount: true },
        });
        const earlierCnTotal = earlierCreditNotes.reduce((sum, cn) => sum + Number(cn.totalAmount || 0), 0);
        const invTotal = Number(referencedInvoice.totalAmount || 0);
        const maxAllowed = Math.max(0, Number((invTotal - earlierCnTotal).toFixed(2)));

        if (totalAmount > maxAllowed) {
          throw new BadRequestException(
            `Credit note amount (₹${totalAmount}) cannot exceed invoice total minus earlier credit notes (₹${maxAllowed}). Total invoice: ₹${invTotal}, earlier credit notes: ₹${earlierCnTotal}.`
          );
        }

        // GST statutory deadline warning (Section 34(2) of CGST Act: 30th November following financial year)
        const invYear = invIssueDate.getFullYear();
        const invMonth = invIssueDate.getMonth(); // 0-indexed: 0 is Jan, 2 is March
        const fyEndYear = invMonth >= 3 ? invYear + 1 : invYear;
        const gstDeadline = new Date(fyEndYear, 10, 30, 23, 59, 59); // 30 November
        if (cnIssueDate > gstDeadline) {
          this.logger.warn(
            `Warning: Under Section 34(2) of the CGST Act, the statutory deadline (30th November following FY ${fyEndYear - 1}-${String(fyEndYear).slice(-2)}) for GST tax adjustment on credit notes has lapsed.`
          );
        }
      }

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

      let invoice;
      try {
        invoice = await tx.invoice.create({
          data: {
            tenantId,
            companyId: (dto as any).companyId || (dto as any).customerId || undefined,
            customerId: (dto as any).customerId || (dto as any).companyId || undefined,
            invoiceNumber,
            docType,
            createdById: user.id,
            invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : new Date(),
            dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
            poDate: dto.poDate ? new Date(dto.poDate) : undefined,
            buyerOrderNo: dto.buyerOrderNo,
            referenceNo: dto.referenceNo,
            paymentTerms: dto.paymentTerms || (docType === 'delivery_challan' ? 'Immediately' : 'Advance'),
            customerName: dto.customerName.trim(),
            customerPhone: resolvedPhone,
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
      } catch (err: any) {
        if (err.code === 'P2002') {
          throw new BadRequestException({
            message: `Document number "${invoiceNumber}" already exists in the system.`,
            fieldErrors: { invoiceNumber: `Document number "${invoiceNumber}" already exists` },
          });
        }
        if (err.code === 'P2003') {
          throw new BadRequestException({
            message: `Referenced record does not exist for this document.`,
            fieldErrors: { general: 'Foreign key reference violation' },
          });
        }
        throw new BadRequestException({
          message: `Failed to create document: ${err.message || 'Database constraint violation'}`,
          fieldErrors: { general: err.message },
        });
      }

      // Record Audit Log within tx
      await this.auditService.log({
        actorId: user.id,
        actorName: user.employeeCode,
        action: 'CREATE',
        entityName: 'Invoice',
        entityId: invoice.id,
        afterState: { invoiceNumber, docType, totalAmount },
      }, tx);

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
          }, tx);
        }
      }

      // Post to ledger within the same interactive transaction
      await this.postingService?.postInvoice(invoice, user, tx);

      return invoice;
    });
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

    if (dto.lines && dto.lines.length > 0) {
      if (existing.docType === 'tax_invoice' || existing.docType === 'sez_invoice') {
        throw new BadRequestException('Invoice lines are locked after issuance. Changes must use a credit note.');
      }
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

    return this.prisma.$transaction(async (tx) => {
      // Delete existing lines and recreate updated lines
      await tx.invoiceLine.deleteMany({
        where: { invoiceId: id },
      });

      // Re-create updated invoice; tenantId verified on line 550 (existing.tenantId)
      const updated = await tx.invoice.update({
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

      // Record Audit Log within tx
      await this.auditService.log({
        actorId: user.id,
        actorName: user.employeeCode,
        action: 'UPDATE',
        entityName: 'Invoice',
        entityId: updated.id,
        beforeState: { invoiceNumber: existing.invoiceNumber, totalAmount: existing.totalAmount },
        afterState: { invoiceNumber: updated.invoiceNumber, totalAmount: updated.totalAmount },
      }, tx);

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
          }, tx);
        }
      }

      // Post update to ledger within tx if applicable
      await this.postingService?.postInvoice(updated, user, tx);

      return updated;
    });
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
      const profile = await getUnifiedCompanyProfile(this.prisma, tenantId);
      if (profile) return profile;
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
      bankUpi: '',
      bankDetails: {
        bankName: '',
        accountNumber: '',
        ifscCode: '',
        branch: '',
        accountHolderName: defaultName,
        upiId: '',
      },
      lutBondNo: '',
      logoUrl: process.env.PRODUCT_LOGO_URL || '',
      invoicePrefix: 'INV',
      isOnboarded: false,
      completeness: {
        complete: false,
        missing: ['Company profile not found'],
      },
    };
  }

  /**
   * Evaluates company profile completeness for tenant.
   */
  async getCompleteness(tenantId: string, options?: { isSez?: boolean; dtoLutBondNo?: string }) {
    return getCompanyProfileCompleteness(this.prisma, tenantId, options);
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
    return updateUnifiedCompanyProfile(this.prisma, tenantId, dto);
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
      allocations?: Array<{ invoiceId: string; amount: number }>;
      confirmDuplicate?: boolean;
    },
    user: ScopedUser,
  ) {
    await this.paymentsService.record({ invoiceId, ...dto }, user);
    return this.findOne(invoiceId, user);
  }

  /**
   * One-click Link an unlinked invoice to a customer master record
   */
  async linkCustomer(
    id: string,
    customerId: string | undefined,
    user: ScopedUser,
  ) {
    const tenantId = requireTenantId(user);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    let targetCompany: any = null;
    if (customerId) {
      targetCompany = await this.prisma.company.findFirst({
        where: { id: customerId, tenantId, deletedAt: null },
      });
      if (!targetCompany) {
        throw new NotFoundException(`Customer company ${customerId} not found`);
      }
    } else {
      // Auto-match by invoice.customerName or invoice.customerGstin
      const matches = await this.prisma.company.findMany({
        where: {
          tenantId,
          deletedAt: null,
          OR: [
            ...(invoice.customerGstin ? [{ gstin: invoice.customerGstin }] : []),
            { name: { equals: invoice.customerName, mode: 'insensitive' as const } },
          ],
        },
      });
      if (matches.length === 1) {
        targetCompany = matches[0];
      } else if (matches.length > 1) {
        throw new BadRequestException(`Multiple companies match "${invoice.customerName}". Please choose a specific customer.`);
      } else {
        throw new NotFoundException(`No matching customer found for "${invoice.customerName}".`);
      }
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        customerId: targetCompany.id,
        companyId: targetCompany.id,
        customerName: targetCompany.name,
        customerGstin: targetCompany.gstin || invoice.customerGstin,
      },
    });

    // Update any existing ledger entries for this invoice to point to targetCompany.id
    await this.prisma.ledgerEntry.updateMany({
      where: { tenantId, sourceType: 'invoice', sourceId: id },
      data: { partyId: targetCompany.id },
    }).catch(() => {});

    // Ensure invoice is posted to ledger
    await this.postingService?.postInvoice(updated, user);

    return {
      success: true,
      invoice: updated,
      linkedCustomer: { id: targetCompany.id, name: targetCompany.name },
    };
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

    return this.prisma.$transaction(async (tx) => {
      await tx.invoice.updateMany({
        where: { id, tenantId },
        data: {
          isVoided: true,
          voidedAt: new Date(),
          voidReason: reason || 'Voided by Administrator',
        },
      });
      const updated = await tx.invoice.findFirst({
        where: { id, tenantId },
        include: {
          lines: { include: { sku: true } },
          order: true,
          payments: true,
          createdBy: { select: { id: true, name: true, employeeCode: true } },
        },
      });

      // Record in Audit Log within tx
      await this.auditService.log({
        actorId: user.id,
        actorName: user.employeeCode,
        action: 'STATUS_CHANGE',
        entityName: 'Invoice',
        entityId: invoice.id,
        beforeState: { isVoided: false },
        afterState: { isVoided: true, voidReason: reason },
      }, tx);

      // Post void reversal to ledger within tx if applicable
      await this.postingService?.postInvoiceVoid(updated, reason, user, tx);

      return updated;
    });
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
  async getPdf(
    id: string,
    user: ScopedUser,
    templateType?: string,
    options?: { copyLabel?: string; paperSize?: 'A4' | 'A5' },
  ) {
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
      copyLabel: options?.copyLabel,
      paperSize: options?.paperSize,
      companyProfile: invoice.companyProfile,
      signatorySettings: invoice.signatorySettings,
    });

    const cleanNum = (invoice.invoiceNumber || 'INV').replace(/[\/\\]/g, '_');
    const filename = `${documentTitle}_${cleanNum}.pdf`;

    return { buffer, filename };
  }

  /**
   * Generate Binary PDF Buffer for preview of unsaved / draft invoices
   */
  async generatePreviewPdf(
    invoiceData: any,
    user: ScopedUser,
    options?: { templateType?: string; copyLabel?: string; paperSize?: 'A4' | 'A5' },
  ) {
    const companyProfile = await this.getCompanyProfile(user);
    const activeDocType = options?.templateType || invoiceData.docType || 'tax_invoice';

    const buffer = await generateInvoicePdfBuffer(
      {
        ...invoiceData,
        companyProfile,
      },
      {
        templateType: activeDocType,
        copyLabel: options?.copyLabel,
        paperSize: options?.paperSize,
        companyProfile,
      },
    );

    const cleanNum = (invoiceData.invoiceNumber || 'PREVIEW').replace(/[\/\\]/g, '_');
    const filename = `Preview_${cleanNum}.pdf`;

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


