import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { ScopedUser } from '../auth/scoping.service';
import { requireTenantId } from '../common/tenant.util';
import { AuditService } from '../audit/audit.service';
import { DocumentSeriesService } from '../common/document-series.service';
import { formatIndianCurrency, validateMeaningfulNarration, validatePaymentReference } from '../common/shared-validation';
import { getEffectivePagesForUser } from '../auth/effective-page-access';

export interface PaymentAllocationInput {
  invoiceId?: string;
  billId?: string;
  documentId?: string;
  amount: number;
}

export interface RecordPaymentInput {
  partyType?: 'customer' | 'supplier';
  partyId?: string;
  customerId?: string;
  supplierId?: string;
  orderId?: string;
  invoiceId?: string;
  amount: number;
  paymentType?: 'advance' | 'milestone' | 'final_settlement' | 'full_payment' | string;
  paymentMethod?: 'NEFT' | 'RTGS' | 'IMPS' | 'Cheque' | 'UPI' | 'Cash' | 'Bank Transfer' | string;
  transactionRef?: string;
  reference?: string;
  paymentDate?: Date | string;
  notes?: string;
  bankAccount?: string;
  bankAccountId?: string;
  allocations?: PaymentAllocationInput[];
  autoAllocate?: boolean;
  allowAdvance?: boolean;
  isAdvance?: boolean;
  confirmDuplicate?: boolean;
  confirmedLargePayment?: boolean;
  typedConfirmation?: string;
  idempotencyKey?: string;
}

export interface CustomerAccountSummary {
  customerId: string;
  customerName: string;
  gstin?: string | null;
  email?: string | null;
  phone?: string | null;
  totalQuoted: number;
  quotesCount: number;
  totalOrdered: number;
  ordersCount: number;
  totalInvoiced: number;
  invoicesCount: number;
  totalPaid: number;
  receivable: number; // Strictly equals sum of unpaid/partial invoice balanceDue
  overdue: number;
  quotations?: any[];
  orders?: any[];
  invoices?: any[];
  payments?: any[];
  ledgerEntries?: any[];
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private static readonly idempotencyStore = new Map<string, { result: any; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly documentSeriesService: DocumentSeriesService,
  ) {}

  /**
   * The single, authoritative entry point to record payments across the entire system.
   * Atomically handles payment record creation, invoice allocations, invoice & order balance
   * updates, status transitions, audit logging, and ledger synchronization.
   */
  async record(dto: RecordPaymentInput, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const amount = Number(Number(dto.amount).toFixed(2));

    // Server Idempotency-Key Check (Database-backed via SystemSetting with in-memory fast fallback)
    const idemKey = (dto.idempotencyKey || '').trim();
    if (idemKey) {
      const cacheKey = `${tenantId}:${idemKey}`;
      const cached = PaymentsService.idempotencyStore.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        this.logger.log(`[IDEMPOTENCY] Replaying cached in-memory payment response for key "${idemKey}"`);
        return cached.result;
      }

      // Check database persistence
      const dbKey = `idempotency:payment:${tenantId}:${idemKey}`;
      try {
        const persisted = await this.prisma.systemSetting.findUnique({ where: { key: dbKey } });
        if (persisted) {
          const parsed = JSON.parse(persisted.value);
          if (parsed.expiresAt > Date.now()) {
            this.logger.log(`[IDEMPOTENCY] Replaying cached database payment response for key "${idemKey}"`);
            PaymentsService.idempotencyStore.set(cacheKey, parsed);
            return parsed.result;
          }
        }
      } catch (err: any) {
        this.logger.warn(`Failed reading idempotency setting: ${err.message}`);
      }
    }

    if (isNaN(amount) || amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than 0.');
    }

    // Payment reference validation by mode
    if (dto.paymentMethod) {
      const refToValidate = dto.reference || dto.transactionRef;
      const refCheck = validatePaymentReference(dto.paymentMethod, refToValidate);
      if (!refCheck.valid) {
        throw new BadRequestException(refCheck.error);
      }
    }

    // Bank account tenant isolation check
    let bankAccountLabel: string | null = null;
    if (dto.bankAccountId) {
      const bankId = dto.bankAccountId.trim();
      if (bankId.startsWith('tenant-')) {
        const tenant = await this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { id: true, bankName: true, bankAccountNumber: true },
        });
        if (!tenant || `tenant-${tenant.id}` !== bankId) {
          throw new BadRequestException('Invalid bank account selected or account belongs to another organization.');
        }
        bankAccountLabel = tenant.bankName ? `${tenant.bankName} ••••${(tenant.bankAccountNumber || '').slice(-4)}` : 'Company Bank';
      } else {
        const bank = await this.prisma.companyBankAccount.findFirst({
          where: { id: bankId, tenantId },
        });
        if (!bank) {
          throw new BadRequestException('Invalid bank account selected or account belongs to another organization.');
        }
        bankAccountLabel = bank.label || `${bank.bankName} ••••${bank.accountNumberLast4}`;
      }
    }

    // Narration validation: if notes provided, require meaningful text (5+ chars, non-gibberish)
    if (dto.notes) {
      const narrationCheck = validateMeaningfulNarration(dto.notes, 'Narration');
      if (!narrationCheck.valid) {
        throw new BadRequestException(narrationCheck.error);
      }
    }

    // High value payment confirmations
    if (amount > 10000000) {
      if (dto.typedConfirmation !== 'CONFIRM') {
        throw new BadRequestException(
          `Payment of ${formatIndianCurrency(amount)} exceeds ₹1,00,00,000. Please type CONFIRM to proceed.`
        );
      }
    } else if (amount > 1000000) {
      if (!dto.confirmedLargePayment) {
        throw new BadRequestException(
          `Payment of ${formatIndianCurrency(amount)} exceeds ₹10,00,000. Confirmation is required.`
        );
      }
    }

    const payDate = dto.paymentDate ? new Date(dto.paymentDate) : new Date();

    // Period lock check: prevent posting on or before locked date
    const lock = await this.prisma.ledgerLock.findUnique({ where: { tenantId } });
    if (lock && lock.lockedUntil) {
      const lockDate = new Date(lock.lockedUntil);
      if (payDate <= lockDate) {
        throw new BadRequestException(
          `This accounting period is locked up to ${lockDate.toISOString().slice(0, 10)}. No payments or modifications are permitted on or before this date.`
        );
      }
    }

    let result: any;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        // ─── 0. Atomic Unique Idempotency Insertion In Same Transaction ─────────
        if (idemKey) {
          const dbKey = `idempotency:payment:${tenantId}:${idemKey}`;
          try {
            await tx.systemSetting.create({
              data: {
                key: dbKey,
                value: JSON.stringify({ inProgress: true, startedAt: Date.now() }),
              },
            });
          } catch (err: any) {
            if (
              err?.code === 'P2002' ||
              err?.message?.includes('Unique constraint failed') ||
              err?.message?.includes('duplicate key')
            ) {
              throw new ConflictException(
                `Payment already in progress or completed for idempotency key "${idemKey}".`
              );
            }
            throw err;
          }
        }

        // ─── 0a. Supplier Payment Route ──────────────────────────────────────────
        if (dto.partyType === 'supplier' || dto.supplierId) {
        const supplierId = dto.supplierId || dto.partyId;
        if (!supplierId) {
          throw new BadRequestException('Supplier ID is required for supplier payments.');
        }

        const supplier = await tx.supplier.findFirst({
          where: { id: supplierId, tenantId },
        });
        if (!supplier) {
          throw new NotFoundException(`Supplier not found.`);
        }

        // Duplicate Reference Check: Block duplicate reference for same supplier and date unless confirmed
        const ref = (dto.reference || dto.transactionRef)?.trim();
        if (ref && !dto.confirmDuplicate) {
          const dayStart = new Date(payDate);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(payDate);
          dayEnd.setHours(23, 59, 59, 999);

          const existing = await tx.supplierPayment.findFirst({
            where: {
              tenantId,
              supplierId,
              paymentDate: { gte: dayStart, lte: dayEnd },
              OR: [
                { reference: { equals: ref, mode: 'insensitive' } },
                { paymentNumber: { equals: ref, mode: 'insensitive' } },
              ],
            },
          });
          if (existing) {
            throw new ConflictException({
              statusCode: 409,
              code: 'DUPLICATE_PAYMENT_REFERENCE',
              requiresConfirmation: true,
              message: `A supplier payment with reference "${ref}" already exists on ${payDate.toISOString().slice(0, 10)}. Please confirm to proceed with duplicate entry.`,
              existingPaymentId: existing.id,
            });
          }
        }

        const effectiveNotes = bankAccountLabel
          ? (dto.notes?.trim() ? `${dto.notes.trim()} • Account: ${bankAccountLabel}` : `Account: ${bankAccountLabel}`)
          : (dto.notes?.trim() || null);

        const paymentNumber = dto.reference?.trim() || `SPAY-${Date.now()}`;
        const supplierPayment = await tx.supplierPayment.create({
          data: {
            tenantId,
            supplierId,
            paymentNumber,
            paymentDate: payDate,
            amount: new Prisma.Decimal(amount.toFixed(2)),
            paymentMethod: dto.paymentMethod || 'NEFT',
            reference: dto.reference?.trim() || dto.transactionRef?.trim(),
            notes: effectiveNotes,
            createdById: user.id,
          },
        });

        // Handle bill allocations
        let allocationsToProcess = dto.allocations || [];
        if (dto.autoAllocate && allocationsToProcess.length === 0) {
          const unpaidBills: any[] = await tx.purchaseBill.findMany({
            where: {
              tenantId,
              supplierId,
              deletedAt: null,
              paymentStatus: { in: ['unpaid', 'partial'] },
            },
            include: { allocations: true } as any,
            orderBy: [
              { invoiceDateReal: 'asc' },
              { dueDate: 'asc' },
              { invoiceNumber: 'asc' },
            ],
          });
          let remaining = amount;
          allocationsToProcess = [];
          for (const bill of unpaidBills) {
            if (remaining <= 0) break;
            const alreadyPaid = ((bill as any).allocations || []).reduce((s: number, a: any) => s + Number(a.amount), 0);
            const due = Math.max(0, bill.grandTotal - alreadyPaid);
            if (due <= 0.01) continue;
            const allocAmt = Math.min(remaining, due);
            allocationsToProcess.push({ billId: bill.id, documentId: bill.id, amount: allocAmt });
            remaining -= allocAmt;
          }
        }

        for (const alloc of allocationsToProcess) {
          const billId = alloc.billId || alloc.documentId || alloc.invoiceId;
          if (!billId) continue;
          const bill = await tx.purchaseBill.findFirst({
            where: { id: billId, tenantId },
            include: { allocations: true },
          });
          if (bill) {
            const allocAmt = Number(alloc.amount);
            await tx.paymentAllocation.create({
              data: {
                tenantId,
                paymentType: 'supplier_payment',
                supplierPaymentId: supplierPayment.id,
                purchaseBillId: bill.id,
                amount: new Prisma.Decimal(allocAmt.toFixed(2)),
              },
            });
            const totalAllocated = (bill.allocations || []).reduce((s, a) => s + Number(a.amount), 0) + allocAmt;
            const newStatus = totalAllocated >= bill.grandTotal - 0.01 ? 'paid' : 'partial';
            await tx.purchaseBill.update({
              where: { id: bill.id },
              data: {
                paymentStatus: newStatus,
              },
            });
          }
        }

        // Create Ledger Entry for Supplier (Payment = Debit)
        const fy = `20${payDate.getFullYear().toString().slice(-2)}-${(payDate.getFullYear() + 1).toString().slice(-2)}`;
        await tx.ledgerEntry.create({
          data: {
            tenantId,
            partyType: 'supplier',
            partyId: supplierId,
            entryDate: payDate,
            financialYear: fy,
            voucherType: 'payment',
            voucherNo: supplierPayment.paymentNumber,
            particulars: `Supplier Payment - ${dto.paymentMethod || 'NEFT'} Ref: ${supplierPayment.paymentNumber}`,
            debit: new Prisma.Decimal(amount.toFixed(2)),
            credit: new Prisma.Decimal('0.00'),
            sourceType: 'supplier_payment',
            sourceId: supplierPayment.id,
            createdById: user.id,
          },
        });

        await this.auditService.log({
          tenantId,
          actorId: user.id,
          actorName: (user as any).employeeCode || (user as any).name || 'Staff',
          action: 'SUPPLIER_PAYMENT_RECORDED',
          entityName: 'SupplierPayment',
          entityId: supplierPayment.id,
          afterState: { paymentNumber, amount, supplierId },
        });

        return {
          payment: supplierPayment,
          voucherNo: supplierPayment.paymentNumber,
          receiptNumber: supplierPayment.paymentNumber,
          amount,
        };
      }

      // ─── Customer Receipt Route ─────────────────────────────────────────────
      let resolvedCustomerId = dto.customerId || (dto.partyType === 'customer' ? dto.partyId : null) || null;
      let targetOrder: any = null;
      let primaryInvoice: any = null;

      // ─── 1. Target Validation ──────────────────────────────────────────────
      if (dto.invoiceId) {
        primaryInvoice = await tx.invoice.findFirst({
          where: { id: dto.invoiceId, tenantId },
          include: { order: true },
        });

        if (!primaryInvoice) {
          throw new NotFoundException(`Invoice ${dto.invoiceId} not found.`);
        }
        if (primaryInvoice.isVoided) {
          throw new BadRequestException('Cannot record payment for a voided invoice.');
        }

        resolvedCustomerId = resolvedCustomerId || primaryInvoice.customerId || primaryInvoice.companyId;
        targetOrder = primaryInvoice.order;
      }

      if (dto.orderId && !targetOrder) {
        targetOrder = await tx.order.findFirst({
          where: { id: dto.orderId, tenantId, deletedAt: null },
        });
        if (!targetOrder) {
          throw new NotFoundException(`Order ${dto.orderId} not found.`);
        }
        resolvedCustomerId = resolvedCustomerId || targetOrder.customerId;
      }

      // Duplicate Reference Check: Block duplicate reference for same customer and date unless confirmed
      const custRef = (dto.transactionRef || dto.reference)?.trim();
      if (resolvedCustomerId && custRef && !dto.confirmDuplicate) {
        const dayStart = new Date(payDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(payDate);
        dayEnd.setHours(23, 59, 59, 999);

        const existing = await tx.paymentRecord.findFirst({
          where: {
            tenantId,
            customerId: resolvedCustomerId,
            paymentDate: { gte: dayStart, lte: dayEnd },
            reversalOfId: null,
            transactionRef: { equals: custRef, mode: 'insensitive' },
          },
        });
        if (existing) {
          throw new ConflictException({
            statusCode: 409,
            code: 'DUPLICATE_PAYMENT_REFERENCE',
            requiresConfirmation: true,
            message: `A receipt with reference "${custRef}" already exists for this customer on ${payDate.toISOString().slice(0, 10)}. Please confirm to proceed with duplicate entry.`,
            existingPaymentId: existing.id,
          });
        }
      }

      // ─── 2. Allocations & Overpayment Check ─────────────────────────────────
      let allocationsToProcess: PaymentAllocationInput[] = [];

      if (dto.allocations && dto.allocations.length > 0) {
        allocationsToProcess = dto.allocations.map((a) => ({
          ...a,
          invoiceId: a.invoiceId || a.documentId,
        }));
        const totalAlloc = Number(
          allocationsToProcess.reduce((sum, a) => sum + Number(a.amount), 0).toFixed(2)
        );
        const totalAllocPaise = Math.round(totalAlloc * 100);
        const amountPaise = Math.round(amount * 100);
        if (totalAllocPaise > amountPaise) {
          throw new BadRequestException(
            `Total allocations (${formatIndianCurrency(totalAlloc)}) must not exceed the amount received (${formatIndianCurrency(amount)}).`
          );
        }
        if (totalAllocPaise !== amountPaise) {
          if (!dto.allowAdvance || amountPaise < totalAllocPaise) {
            throw new BadRequestException(
              `Total allocated amount (${formatIndianCurrency(totalAlloc)}) must equal payment amount (${formatIndianCurrency(amount)}). Tick "Allow advance payment" to record surplus as an advance.`
            );
          }
        }
      } else if (dto.autoAllocate && resolvedCustomerId) {
        // Auto-allocate oldest unpaid invoices first
        const unpaidInvoices = await tx.invoice.findMany({
          where: {
            tenantId,
            OR: [
              { customerId: resolvedCustomerId },
              { companyId: resolvedCustomerId },
            ],
            isVoided: false,
            paymentStatus: { in: ['unpaid', 'partial'] },
            balanceDue: { gt: 0 },
          },
          orderBy: [
            { invoiceDate: 'asc' },
            { dueDate: 'asc' },
            { invoiceNumber: 'asc' },
          ],
        });

        let remaining = amount;
        allocationsToProcess = [];
        for (const inv of unpaidInvoices) {
          if (remaining <= 0) break;
          const due = (inv.balanceDue != null && inv.balanceDue > 0) ? inv.balanceDue : inv.totalAmount;
          const allocAmt = Math.min(remaining, due);
          allocationsToProcess.push({ invoiceId: inv.id, amount: allocAmt });
          remaining -= allocAmt;
        }
      } else if (primaryInvoice) {
        // Default 100% allocation to primary invoice
        allocationsToProcess = [{ invoiceId: primaryInvoice.id, amount }];
      }

      // Check for overpayment against specific invoices
      if (allocationsToProcess.length > 0) {
        for (const alloc of allocationsToProcess) {
          const inv =
            alloc.invoiceId === primaryInvoice?.id
              ? primaryInvoice
              : await tx.invoice.findFirst({
                  where: { id: alloc.invoiceId, tenantId },
                });

          if (!inv) throw new NotFoundException(`Invoice ${alloc.invoiceId} not found.`);
          if (inv.isVoided) throw new BadRequestException(`Invoice ${inv.invoiceNumber} is voided.`);

          const outstanding =
            inv.balanceDue != null && inv.balanceDue >= 0
              ? Number(inv.balanceDue)
              : Number(inv.totalAmount);

          const allocPaise = Math.round(Number(alloc.amount) * 100);
          const outstandingPaise = Math.round(outstanding * 100);

          if (allocPaise > outstandingPaise) {
            throw new BadRequestException(
              `Overpayment is refused. Allocation of ${formatIndianCurrency(alloc.amount)} exceeds invoice ${inv.invoiceNumber} outstanding balance of ${formatIndianCurrency(outstanding)}.`
            );
          }
        }
      } else if (targetOrder) {
        // Pure advance payment on order before invoicing
        const orderOutstanding =
          targetOrder.balanceAmount != null && targetOrder.balanceAmount >= 0
            ? Number(targetOrder.balanceAmount)
            : Math.max(0, Number(targetOrder.totalAmount - (targetOrder.paidAmount || 0)));

        const amountPaise = Math.round(amount * 100);
        const orderOutstandingPaise = Math.round(orderOutstanding * 100);

        if (amountPaise > orderOutstandingPaise) {
          throw new BadRequestException(
            `Overpayment is refused. Advance amount of ${formatIndianCurrency(amount)} exceeds order ${targetOrder.orderNumber} outstanding balance of ${formatIndianCurrency(orderOutstanding)}.`
          );
        }
      }

      // ─── 3. Generate Receipt Number via DocumentSeries ──────────────────────
      const seriesInfo = await this.documentSeriesService.getNextDocumentNumber(
        tenantId,
        'receipt',
        payDate,
        tx
      );

      // ─── 4. Create PaymentRecord (Append-only) ──────────────────────────────
      const paymentRecord = await tx.paymentRecord.create({
        data: {
          tenantId,
          orderId: targetOrder?.id || null,
          invoiceId: primaryInvoice?.id || null,
          customerId: resolvedCustomerId,
          amount,
          paymentType: dto.paymentType || (targetOrder && !primaryInvoice ? 'advance' : 'full_payment'),
          paymentMethod: dto.paymentMethod || 'NEFT',
          transactionRef: (dto.reference || dto.transactionRef)?.trim() || seriesInfo.formattedNumber,
          paymentDate: payDate,
          notes: dto.notes?.trim() || null,
          bankAccountId: dto.bankAccountId?.trim() || null,
          bankAccountLabel: bankAccountLabel || null,
          recordedById: user.id,
        },
      });

      // ─── 5. Apply Allocations to Invoices ────────────────────────────────────
      const updatedInvoices: any[] = [];
      for (const alloc of allocationsToProcess) {
        const inv =
          alloc.invoiceId === primaryInvoice?.id
            ? primaryInvoice
            : await tx.invoice.findFirst({
                where: { id: alloc.invoiceId, tenantId },
              });

        const outstanding =
          inv.balanceDue != null && inv.balanceDue >= 0
            ? Number(inv.balanceDue)
            : Number(inv.totalAmount);

        const newBalance = Math.max(0, Number((outstanding - alloc.amount).toFixed(2)));

        let newStatus = 'partial';
        if (newBalance <= 0.01) {
          newStatus = 'paid';
        } else if (inv.dueDate && new Date(inv.dueDate) < new Date()) {
          newStatus = 'overdue';
        }

        await tx.paymentAllocation.create({
          data: {
            tenantId,
            paymentType: 'customer_receipt',
            paymentRecordId: paymentRecord.id,
            invoiceId: inv.id,
            amount: new Prisma.Decimal(alloc.amount.toFixed(2)),
          },
        });

        const updatedInv = await tx.invoice.update({
          where: { id: inv.id },
          data: {
            balanceDue: newBalance,
            paymentStatus: newStatus,
            transactionRef: dto.transactionRef?.trim() || inv.transactionRef,
            paymentMethod: dto.paymentMethod || inv.paymentMethod,
          },
        });
        updatedInvoices.push(updatedInv);
      }

      // ─── 6. Update Order Paid & Balance Amounts ──────────────────────────────
      let updatedOrder: any = null;
      if (targetOrder) {
        const currentPaid = Number(targetOrder.paidAmount || 0);
        const newPaidAmount = Number((currentPaid + amount).toFixed(2));
        const newBalanceAmount = Math.max(0, Number((targetOrder.totalAmount - newPaidAmount).toFixed(2)));
        const orderPaymentStatus =
          newBalanceAmount <= 0.01 ? 'paid' : newPaidAmount > 0 ? 'partial' : 'pending';

        updatedOrder = await tx.order.update({
          where: { id: targetOrder.id },
          data: {
            paidAmount: newPaidAmount,
            balanceAmount: newBalanceAmount,
            paymentStatus: orderPaymentStatus,
            paymentRef: dto.transactionRef?.trim() || targetOrder.paymentRef,
          },
        });
      }

      // ─── 7. Audit Log within tx ─────────────────────────────────────────────
      await this.auditService.log({
        tenantId,
        actorId: user.id,
        actorName: (user as any).employeeCode || (user as any).name || 'Staff',
        action: 'PAYMENT_RECORDED',
        entityName: 'PaymentRecord',
        entityId: paymentRecord.id,
        afterState: {
          receiptNumber: seriesInfo.formattedNumber,
          amount,
          orderId: targetOrder?.id,
          invoiceId: primaryInvoice?.id,
          allocationsCount: allocationsToProcess.length,
        },
      }, tx);

      // ─── 8. Ledger Hook within tx (failure aborts payment transaction) ─────────
      if (resolvedCustomerId) {
        await tx.ledgerEntry.create({
          data: {
            tenantId,
            partyType: 'customer',
            partyId: resolvedCustomerId,
            entryDate: payDate,
            financialYear: seriesInfo.financialYear,
            voucherType: 'receipt',
            voucherNo: seriesInfo.formattedNumber,
            particulars: `Receipt #${seriesInfo.formattedNumber} - ${dto.paymentMethod || 'Bank'} [${dto.transactionRef || 'Direct'}]`,
            debit: new Prisma.Decimal('0.00'),
            credit: new Prisma.Decimal(amount.toFixed(2)),
            sourceType: 'payment',
            sourceId: paymentRecord.id,
            createdById: user.id,
          },
        });
      }

      const finalOutput = {
        payment: paymentRecord,
        receiptNumber: seriesInfo.formattedNumber,
        invoices: updatedInvoices,
        order: updatedOrder,
      };

      // Update idempotency record to completed state in the same atomic transaction
      if (idemKey) {
        const dbKey = `idempotency:payment:${tenantId}:${idemKey}`;
        const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
        await tx.systemSetting.update({
          where: { key: dbKey },
          data: {
            value: JSON.stringify({ result: finalOutput, expiresAt }),
          },
        });
      }

      return finalOutput;
    });
    } catch (err: any) {
      if (err instanceof ConflictException && idemKey) {
        this.logger.log(
          `[IDEMPOTENCY] Parallel request detected for key "${idemKey}". Awaiting winner transaction commit...`
        );
        const dbKey = `idempotency:payment:${tenantId}:${idemKey}`;
        for (let attempt = 0; attempt < 30; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          const persisted = await this.prisma.systemSetting.findUnique({ where: { key: dbKey } });
          if (persisted) {
            try {
              const parsed = JSON.parse(persisted.value);
              if (parsed.result) {
                this.logger.log(`[IDEMPOTENCY] Replaying committed parallel payment response for key "${idemKey}"`);
                PaymentsService.idempotencyStore.set(`${tenantId}:${idemKey}`, parsed);
                return parsed.result;
              }
            } catch {}
          }
        }
      }
      throw err;
    }

    if (idemKey && result) {
      PaymentsService.idempotencyStore.set(`${tenantId}:${idemKey}`, {
        result,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      });
    }

    return result;
  }

  /**
   * Reverses a payment without editing or deleting the original record (Immutability guarantee).
   */
  async reverse(paymentId: string, reason: string, user: ScopedUser) {
    const tenantId = requireTenantId(user);

    const narrationCheck = validateMeaningfulNarration(reason, 'Reversal reason');
    if (!narrationCheck.valid) {
      throw new BadRequestException(narrationCheck.error);
    }

    return this.prisma.$transaction(async (tx) => {
      const original = await tx.paymentRecord.findFirst({
        where: { id: paymentId, tenantId },
        include: {
          allocations: { include: { invoice: true } },
          order: true,
          reversals: true,
        },
      });

      if (!original) throw new NotFoundException('Payment record not found.');
      if (original.reversalOfId) throw new BadRequestException('Cannot reverse a reversal payment.');
      if (original.reversals && original.reversals.length > 0) {
        throw new BadRequestException('This payment has already been reversed.');
      }

      const reverseAmount = original.amount;

      // 1. Create reversal PaymentRecord
      const reversalRecord = await tx.paymentRecord.create({
        data: {
          tenantId,
          orderId: original.orderId,
          invoiceId: original.invoiceId,
          customerId: original.customerId,
          amount: -reverseAmount,
          paymentType: 'reversal',
          paymentMethod: original.paymentMethod,
          transactionRef: `REV-${original.transactionRef || original.id.slice(0, 8)}`,
          paymentDate: new Date(),
          notes: `Reversal: ${reason}`,
          recordedById: user.id,
          reversalOfId: original.id,
        },
      });

      // 2. Restore invoice balances
      for (const alloc of original.allocations) {
        const inv = alloc.invoice;
        if (inv && !inv.isVoided) {
          const allocAmount = Number(alloc.amount);
          const restoredBalance = Number(((inv.balanceDue || 0) + allocAmount).toFixed(2));
          const newStatus =
            restoredBalance >= inv.totalAmount - 0.01
              ? (inv.dueDate && new Date(inv.dueDate) < new Date() ? 'overdue' : 'unpaid')
              : 'partial';

          await tx.invoice.update({
            where: { id: inv.id },
            data: {
              balanceDue: restoredBalance,
              paymentStatus: newStatus,
            },
          });
        }
      }

      // 3. Restore order balance
      if (original.order) {
        const order = original.order;
        const newPaidAmount = Math.max(0, Number((order.paidAmount - reverseAmount).toFixed(2)));
        const newBalanceAmount = Math.min(
          order.totalAmount,
          Number((order.totalAmount - newPaidAmount).toFixed(2))
        );
        const orderPaymentStatus =
          newPaidAmount <= 0.01 ? 'pending' : newBalanceAmount <= 0.01 ? 'paid' : 'partial';

        await tx.order.update({
          where: { id: order.id },
          data: {
            paidAmount: newPaidAmount,
            balanceAmount: newBalanceAmount,
            paymentStatus: orderPaymentStatus,
          },
        });
      }

      // 4. Audit Log within tx
      await this.auditService.log({
        tenantId,
        actorId: user.id,
        actorName: (user as any).employeeCode || (user as any).name || 'Staff',
        action: 'PAYMENT_REVERSED',
        entityName: 'PaymentRecord',
        entityId: reversalRecord.id,
        beforeState: { originalPaymentId: original.id, amount: original.amount },
        afterState: { reason },
      }, tx);

      // 5. Create reversal LedgerEntry if original payment was posted to ledger
      const originalLedger = await tx.ledgerEntry.findFirst({
        where: {
          tenantId,
          sourceType: 'payment',
          sourceId: original.id,
          reversalOfId: null,
        },
      });
      if (originalLedger) {
        await tx.ledgerEntry.create({
          data: {
            tenantId,
            partyType: originalLedger.partyType,
            partyId: originalLedger.partyId,
            entryDate: new Date(),
            financialYear: originalLedger.financialYear,
            voucherType: 'reversal',
            voucherNo: `REV-${originalLedger.voucherNo}`,
            particulars: `Reversal of ${originalLedger.voucherNo}: ${reason.trim()}`,
            debit: originalLedger.credit,
            credit: originalLedger.debit,
            sourceType: 'payment_reversal',
            sourceId: reversalRecord.id,
            reversalOfId: originalLedger.id,
            createdById: user.id,
          },
        });
      }

      return reversalRecord;
    });
  }

  /**
   * Retrieves related documents across the sales and payment chain,
   * strictly omitting documents from modules where the user lacks page access.
   */
  async getRelatedDocuments(type: string, id: string, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const effectivePages = await getEffectivePagesForUser(this.prisma, user);

    const canSeeQuotations = effectivePages.includes('quotations');
    const canSeeOrders = effectivePages.includes('orders');
    const canSeeInvoices = effectivePages.includes('invoices');
    const canSeeLedger = effectivePages.includes('ledger');

    let quoteId: string | null = null;
    let orderId: string | null = null;
    let invoiceId: string | null = null;
    let customerId: string | null = null;

    if (type === 'quotation') {
      const q = await this.prisma.quotation.findFirst({
        where: { id, tenantId },
        select: { id: true, orderId: true, customerId: true },
      });
      if (q) {
        quoteId = q.id;
        orderId = q.orderId;
        customerId = q.customerId;
      }
    } else if (type === 'order') {
      const o = await this.prisma.order.findFirst({
        where: { id, tenantId },
        select: { id: true, quotationId: true, customerId: true },
      });
      if (o) {
        orderId = o.id;
        quoteId = o.quotationId;
        customerId = o.customerId;
      }
    } else if (type === 'invoice') {
      const inv = await this.prisma.invoice.findFirst({
        where: { id, tenantId },
        select: { id: true, orderId: true, quotationId: true, customerId: true, companyId: true },
      });
      if (inv) {
        invoiceId = inv.id;
        orderId = inv.orderId;
        quoteId = inv.quotationId;
        customerId = inv.customerId || inv.companyId;
        if (orderId && !quoteId) {
          const ord = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: { quotationId: true },
          });
          quoteId = ord?.quotationId || null;
        }
      }
    }

    // 1. Fetch Quotation
    let quotation: any = null;
    if (canSeeQuotations && quoteId) {
      quotation = await this.prisma.quotation.findFirst({
        where: { id: quoteId, tenantId },
        select: {
          id: true,
          quoteNumber: true,
          status: true,
          totalAmount: true,
          createdAt: true,
        },
      });
    }

    // 2. Fetch Order
    let order: any = null;
    if (canSeeOrders && orderId) {
      order = await this.prisma.order.findFirst({
        where: { id: orderId, tenantId },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          totalAmount: true,
          paidAmount: true,
          balanceAmount: true,
          confirmedAt: true,
        },
      });
    }

    // 3. Fetch Invoices & Credit Notes
    let invoices: any[] = [];
    let creditNotes: any[] = [];
    if (canSeeInvoices) {
      const invList = await this.prisma.invoice.findMany({
        where: {
          tenantId,
          OR: [
            orderId ? { orderId } : undefined,
            quoteId ? { quotationId: quoteId } : undefined,
            invoiceId ? { id: invoiceId } : undefined,
          ].filter(Boolean) as any,
        },
        select: {
          id: true,
          invoiceNumber: true,
          docType: true,
          totalAmount: true,
          balanceDue: true,
          paymentStatus: true,
          isVoided: true,
          invoiceDate: true,
        },
      });

      invoices = invList.filter((i) => i.docType !== 'credit_note');
      creditNotes = invList.filter((i) => i.docType === 'credit_note');
    }

    // 4. Fetch Payments
    let payments: any[] = [];
    if (orderId || invoiceId || (invoices.length > 0)) {
      const invoiceIds = invoices.map((i) => i.id);
      payments = await this.prisma.paymentRecord.findMany({
        where: {
          tenantId,
          OR: [
            orderId ? { orderId } : undefined,
            invoiceId ? { invoiceId } : undefined,
            invoiceIds.length > 0 ? { invoiceId: { in: invoiceIds } } : undefined,
            invoiceIds.length > 0
              ? { allocations: { some: { invoiceId: { in: invoiceIds } } } }
              : undefined,
          ].filter(Boolean) as any,
        },
        select: {
          id: true,
          amount: true,
          paymentType: true,
          paymentMethod: true,
          transactionRef: true,
          paymentDate: true,
        },
        orderBy: { paymentDate: 'desc' },
      });
    }

    // 5. Fetch Ledger Entries (ONLY if user has ledger page permission)
    let ledgerEntries: any[] = [];
    if (canSeeLedger && customerId) {
      ledgerEntries = await this.prisma.ledgerEntry.findMany({
        where: {
          tenantId,
          partyType: 'customer',
          partyId: customerId,
        },
        take: 10,
        orderBy: { entryDate: 'desc' },
        select: {
          id: true,
          entryDate: true,
          voucherType: true,
          voucherNo: true,
          particulars: true,
          debit: true,
          credit: true,
        },
      });
    }

    return {
      quotation,
      order,
      invoices,
      creditNotes,
      payments,
      ledgerEntries: canSeeLedger ? ledgerEntries : undefined,
    };
  }

  /**
   * Computes the single source of truth for Customer Account and Dashboard totals.
   * Receivables strictly equal the sum of unpaid invoice balanceDue.
   */
  async getCustomerAccountSummary(customerId: string, user: ScopedUser): Promise<CustomerAccountSummary> {
    const tenantId = requireTenantId(user);

    const customer = await this.prisma.company.findFirst({
      where: { id: customerId, tenantId },
      include: {
        quotations: { where: { deletedAt: null } },
        orders: { where: { deletedAt: null } },
        invoices: { where: { isVoided: false } },
      },
    });

    if (!customer) throw new NotFoundException('Customer not found.');

    const quotesCount = customer.quotations.length;
    const totalQuoted = Number(
      customer.quotations.reduce((sum, q) => sum + Number(q.totalAmount || 0), 0).toFixed(2)
    );

    const ordersCount = customer.orders.length;
    const totalOrdered = Number(
      customer.orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0).toFixed(2)
    );

    const invoicesCount = customer.invoices.length;
    const totalInvoiced = Number(
      customer.invoices.reduce((sum, i) => sum + Number(i.totalAmount || 0), 0).toFixed(2)
    );

    // Sum of actual received money
    const paymentRecords = await this.prisma.paymentRecord.findMany({
      where: { tenantId, customerId, reversalOfId: null },
      select: { amount: true },
    });
    const totalPaid = Number(
      paymentRecords.reduce((sum, p) => sum + Math.max(0, Number(p.amount)), 0).toFixed(2)
    );

    // Receivable: Strictly equal to the sum of unpaid invoice balanceDue
    const today = new Date();
    let receivable = 0;
    let overdue = 0;

    for (const inv of customer.invoices) {
      if (inv.paymentStatus !== 'paid') {
        const bal = inv.balanceDue != null && inv.balanceDue >= 0 ? Number(inv.balanceDue) : Number(inv.totalAmount);
        receivable += bal;
        if (inv.dueDate && new Date(inv.dueDate) < today) {
          overdue += bal;
        }
      }
    }

    receivable = Number(receivable.toFixed(2));
    overdue = Number(overdue.toFixed(2));

    const ledgerEntries = await this.prisma.ledgerEntry.findMany({
      where: { tenantId, partyId: customerId },
      orderBy: { entryDate: 'desc' },
      take: 20,
    });

    return {
      customerId: customer.id,
      customerName: customer.name,
      gstin: customer.gstin,
      email: customer.billingEmail,
      phone: (customer as any).phone || null,
      quotesCount,
      totalQuoted,
      ordersCount,
      totalOrdered,
      invoicesCount,
      totalInvoiced,
      totalPaid,
      receivable,
      overdue,
      quotations: customer.quotations.map((q) => ({
        ...q,
        status: q.status || 'draft',
      })),
      orders: customer.orders.map((o) => ({
        ...o,
        status: o.status || 'confirmed',
      })),
      invoices: customer.invoices.map((inv) => ({
        ...inv,
        status: inv.paymentStatus || 'unpaid',
      })),
      payments: paymentRecords,
      ledgerEntries: ledgerEntries.map((l) => ({
        ...l,
        voucherType: l.voucherType || 'journal',
      })),
    };
  }

  async findAll(user: ScopedUser, query?: { partyId?: string; page?: number; limit?: number }) {
    const tenantId = requireTenantId(user);
    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query?.limit) || 50));
    const skip = (page - 1) * limit;

    const where: any = { tenantId };
    if (query?.partyId) {
      where.customerId = query.partyId;
    }

    const [items, total] = await Promise.all([
      this.prisma.paymentRecord.findMany({
        where,
        orderBy: { paymentDate: 'desc' },
        skip,
        take: limit,
        include: {
          customer: { select: { id: true, name: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
          order: { select: { id: true, orderNumber: true } },
        },
      }),
      this.prisma.paymentRecord.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Looks up an existing payment by its client-supplied idempotency key.
   * Enables UI recovery after network drops ('Check if it was saved').
   */
  async checkIdempotency(idemKey: string, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const cleanKey = (idemKey || '').trim();
    if (!cleanKey) {
      return { found: false };
    }

    const cacheKey = `${tenantId}:${cleanKey}`;
    const cached = PaymentsService.idempotencyStore.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        found: true,
        exists: true,
        status: 'completed',
        payment: cached.result,
      };
    }

    const dbKey = `idempotency:payment:${tenantId}:${cleanKey}`;
    try {
      const persisted = await this.prisma.systemSetting.findUnique({ where: { key: dbKey } });
      if (persisted) {
        const parsed = JSON.parse(persisted.value);
        if (parsed.result) {
          PaymentsService.idempotencyStore.set(cacheKey, parsed);
          return {
            found: true,
            exists: true,
            status: 'completed',
            payment: parsed.result,
          };
        }
        return { found: true, exists: true, status: 'in_progress' };
      }
    } catch (err: any) {
      this.logger.warn(`Failed reading idempotency setting: ${err.message}`);
    }

    return { found: false, exists: false };
  }
}
