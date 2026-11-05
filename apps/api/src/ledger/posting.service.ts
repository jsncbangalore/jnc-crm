import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getIndianFinancialYear } from './ledger.service';
import { ScopedUser } from '../auth/scoping.service';

@Injectable()
export class PostingService {
  private readonly logger = new Logger(PostingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Automatically post an invoice (tax_invoice, sez_invoice, credit_note)
   * Proforma invoices, delivery challans, and purchase orders do NOT post.
   */
  async postInvoice(invoice: any, user?: ScopedUser, customTx?: any) {
    if (!invoice || invoice.isVoided) return null;

    const docType = invoice.docType || 'tax_invoice';
    const postingDocTypes = ['tax_invoice', 'sez_invoice', 'credit_note', 'debit_note', 'bill_of_supply'];
    if (!postingDocTypes.includes(docType)) {
      this.logger.debug(`Skipping non-posting document type: ${docType} (Invoice #${invoice.invoiceNumber})`);
      return null;
    }

    const tx = customTx || this.prisma;
    const tenantId = invoice.tenantId;
    const invDate = new Date(invoice.invoiceDate || invoice.createdAt || new Date());
    const fy = getIndianFinancialYear(invDate);

    // Verify accounting period lock
    const lock = await tx.ledgerLock.findUnique({ where: { tenantId } });
    if (lock && lock.lockedUntil && invDate <= new Date(lock.lockedUntil)) {
      throw new BadRequestException(
        `Accounting period locked up to ${new Date(lock.lockedUntil).toISOString().slice(0, 10)}. Cannot post invoice.`
      );
    }

    // Party is customerId/companyId or structured unlinked customer identifier
    const resolvedPartyId = invoice.customerId || invoice.companyId;
    const partyId = resolvedPartyId
      ? resolvedPartyId
      : `unlinked:${encodeURIComponent((invoice.customerName || 'Unlinked').trim())}:${encodeURIComponent((invoice.customerGstin || '').trim().toUpperCase())}`;
    const isCreditNote = docType === 'credit_note';
    const isDebitNote = docType === 'debit_note';
    const voucherType = isCreditNote ? 'credit_note' : isDebitNote ? 'debit_note' : 'sales';
    const amount = Number(invoice.totalAmount ?? (invoice as any).total ?? 0);

    const debit = isCreditNote ? 0.00 : amount;
    const credit = isCreditNote ? amount : 0.00;

    const particulars = isCreditNote
      ? `Credit Note #${invoice.invoiceNumber} - ${invoice.customerName}`
      : isDebitNote
      ? `Debit Note #${invoice.invoiceNumber} - ${invoice.customerName}`
      : docType === 'bill_of_supply'
      ? `Bill of Supply #${invoice.invoiceNumber} - ${invoice.customerName}`
      : `Sales Tax Invoice #${invoice.invoiceNumber} - ${invoice.customerName}`;

    // Upsert uniquely on [tenantId, sourceType, sourceId, voucherType]
    return tx.ledgerEntry.upsert({
      where: {
        tenantId_sourceType_sourceId_voucherType: {
          tenantId,
          sourceType: 'invoice',
          sourceId: invoice.id,
          voucherType,
        },
      },
      create: {
        tenantId,
        partyType: 'customer',
        partyId,
        entryDate: invDate,
        financialYear: fy,
        voucherType,
        voucherNo: invoice.invoiceNumber,
        particulars,
        debit: new Prisma.Decimal(debit.toFixed(2)),
        credit: new Prisma.Decimal(credit.toFixed(2)),
        sourceType: 'invoice',
        sourceId: invoice.id,
        createdById: user?.id,
      },
      update: {
        // Entries are append-only; update particulars or timestamp only if not voided
        particulars,
      },
    });
  }

  /**
   * Post reversal when an invoice is voided
   */
  async postInvoiceVoid(invoice: any, reason: string, user?: ScopedUser, customTx?: any) {
    if (!invoice) return null;
    const tx = customTx || this.prisma;
    const tenantId = invoice.tenantId;

    const original = await tx.ledgerEntry.findFirst({
      where: {
        tenantId,
        sourceType: 'invoice',
        sourceId: invoice.id,
        reversalOfId: null,
      },
    });

    if (!original) {
      this.logger.warn(`No original ledger entry found to reverse for Invoice #${invoice.invoiceNumber}`);
      return null;
    }

    // Check if reversal already exists
    const existingReversal = await tx.ledgerEntry.findFirst({
      where: {
        tenantId,
        reversalOfId: original.id,
      },
    });
    if (existingReversal) return existingReversal;

    const voidDate = new Date();
    let entryDate = original.entryDate;
    const lock = await tx.ledgerLock.findUnique({ where: { tenantId } });
    if (lock && lock.lockedUntil && entryDate <= new Date(lock.lockedUntil)) {
      entryDate = voidDate;
    }
    if (lock && lock.lockedUntil && entryDate <= new Date(lock.lockedUntil)) {
      throw new BadRequestException(
        `Accounting period locked up to ${new Date(lock.lockedUntil).toISOString().slice(0, 10)}. Cannot post void reversal.`
      );
    }
    const fy = getIndianFinancialYear(entryDate);

    // Create reversal entry with swapped debit and credit
    return tx.ledgerEntry.create({
      data: {
        tenantId,
        partyType: original.partyType,
        partyId: original.partyId,
        entryDate,
        financialYear: fy,
        voucherType: 'reversal',
        voucherNo: `${original.voucherNo}-REV`,
        particulars: `Reversal of ${original.voucherNo}${reason ? ': ' + reason.trim() : ''}`,
        debit: original.credit, // swapped
        credit: original.debit, // swapped
        sourceType: 'invoice_void',
        sourceId: invoice.id,
        reversalOfId: original.id,
        createdById: user?.id,
      },
    });
  }

  /**
   * Automatically post a purchase bill from a supplier (Purchase = Credit)
   */
  async postPurchaseBill(bill: any, user?: ScopedUser, customTx?: any) {
    if (!bill) return null;
    const tx = customTx || this.prisma;
    const tenantId = bill.tenantId;
    const billDate = new Date(bill.invoiceDateReal || bill.invoiceDate || bill.createdAt || new Date());
    const fy = getIndianFinancialYear(billDate);

    // Period lock check
    const lock = await tx.ledgerLock.findUnique({ where: { tenantId } });
    if (lock && lock.lockedUntil && billDate <= new Date(lock.lockedUntil)) {
      throw new BadRequestException(
        `Accounting period locked up to ${new Date(lock.lockedUntil).toISOString().slice(0, 10)}. Cannot post purchase bill.`
      );
    }

    const partyId = bill.supplierId || bill.vendorGstin || bill.vendorName;
    const amount = Number(bill.grandTotal ?? bill.totalAmount ?? (bill as any).total ?? 0);

    return tx.ledgerEntry.upsert({
      where: {
        tenantId_sourceType_sourceId_voucherType: {
          tenantId,
          sourceType: 'purchase_bill',
          sourceId: bill.id,
          voucherType: 'purchase',
        },
      },
      create: {
        tenantId,
        partyType: 'supplier',
        partyId,
        entryDate: billDate,
        financialYear: fy,
        voucherType: 'purchase',
        voucherNo: bill.invoiceNumber,
        particulars: `Purchase Bill #${bill.invoiceNumber} - ${bill.vendorName}`,
        debit: new Prisma.Decimal(0.00),
        credit: new Prisma.Decimal(amount.toFixed(2)),
        sourceType: 'purchase_bill',
        sourceId: bill.id,
        createdById: user?.id,
      },
      update: {
        particulars: `Purchase Bill #${bill.invoiceNumber} - ${bill.vendorName}`,
      },
    });
  }

  /**
   * Post reversal when a purchase bill is deleted or voided
   */
  async postPurchaseBillVoid(bill: any, reason: string, user?: ScopedUser, customTx?: any) {
    if (!bill) return null;
    const tx = customTx || this.prisma;
    const tenantId = bill.tenantId;

    const original = await tx.ledgerEntry.findFirst({
      where: {
        tenantId,
        sourceType: 'purchase_bill',
        sourceId: bill.id,
        reversalOfId: null,
      },
    });

    if (!original) return null;

    const existingReversal = await tx.ledgerEntry.findFirst({
      where: { tenantId, reversalOfId: original.id },
    });
    if (existingReversal) return existingReversal;

    const voidDate = new Date();
    let entryDate = original.entryDate;
    const lock = await tx.ledgerLock.findUnique({ where: { tenantId } });
    if (lock && lock.lockedUntil && entryDate <= new Date(lock.lockedUntil)) {
      entryDate = voidDate;
    }
    if (lock && lock.lockedUntil && entryDate <= new Date(lock.lockedUntil)) {
      throw new BadRequestException(
        `Accounting period locked up to ${new Date(lock.lockedUntil).toISOString().slice(0, 10)}. Cannot post bill void reversal.`
      );
    }
    const fy = getIndianFinancialYear(entryDate);

    return tx.ledgerEntry.create({
      data: {
        tenantId,
        partyType: original.partyType,
        partyId: original.partyId,
        entryDate,
        financialYear: fy,
        voucherType: 'reversal',
        voucherNo: `${original.voucherNo}-REV`,
        particulars: `Reversal of ${original.voucherNo}${reason ? ': ' + reason.trim() : ''}`,
        debit: original.credit,
        credit: original.debit,
        sourceType: 'purchase_bill_void',
        sourceId: bill.id,
        reversalOfId: original.id,
        createdById: user?.id,
      },
    });
  }

  /**
   * Rebuild ledger history from existing invoices, purchase bills, and payments
   * Idempotent; dry-run mode returns summary statistics without committing
   */
  async rebuildLedgerHistory(tenantId: string, options: { dryRun?: boolean } = {}) {
    const isDryRun = options.dryRun !== false;
    let invoicesScanned = 0;
    let invoicesPosted = 0;
    let billsScanned = 0;
    let billsPosted = 0;
    let paymentsScanned = 0;
    let paymentsPosted = 0;

    // 1. Invoices
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        docType: { in: ['tax_invoice', 'sez_invoice', 'credit_note'] },
      },
    });
    invoicesScanned = invoices.length;

    for (const inv of invoices) {
      const existing = await this.prisma.ledgerEntry.findFirst({
        where: {
          tenantId,
          sourceType: 'invoice',
          sourceId: inv.id,
        },
      });
      if (!existing) {
        if (!isDryRun) {
          await this.postInvoice(inv);
        }
        invoicesPosted++;
      }
    }

    // 2. Purchase Bills
    const bills = await this.prisma.purchaseBill.findMany({
      where: { tenantId, deletedAt: null },
    });
    billsScanned = bills.length;

    for (const bill of bills) {
      const existing = await this.prisma.ledgerEntry.findFirst({
        where: {
          tenantId,
          sourceType: 'purchase_bill',
          sourceId: bill.id,
        },
      });
      if (!existing) {
        if (!isDryRun) {
          await this.postPurchaseBill(bill);
        }
        billsPosted++;
      }
    }

    // 3. Payment Records (Customer Receipts)
    const paymentRecords = await this.prisma.paymentRecord.findMany({
      where: { tenantId },
      include: { invoice: true },
    });
    paymentsScanned += paymentRecords.length;

    for (const pr of paymentRecords) {
      const existing = await this.prisma.ledgerEntry.findFirst({
        where: {
          tenantId,
          sourceType: 'payment_record',
          sourceId: pr.id,
        },
      });
      if (!existing && pr.invoice) {
        const partyId = pr.invoice.companyId || pr.invoice.customerGstin || pr.invoice.customerName;
        const fy = getIndianFinancialYear(pr.paymentDate);
        if (!isDryRun) {
          await this.prisma.ledgerEntry.create({
            data: {
              tenantId,
              partyType: 'customer',
              partyId,
              entryDate: pr.paymentDate,
              financialYear: fy,
              voucherType: 'receipt',
              voucherNo: pr.transactionRef || `RCPT-${pr.id.slice(0, 8).toUpperCase()}`,
              particulars: `Receipt - ${pr.paymentMethod} Ref: ${pr.transactionRef || pr.id}`,
              debit: new Prisma.Decimal(0.00),
              credit: new Prisma.Decimal(pr.amount.toFixed(2)),
              sourceType: 'payment_record',
              sourceId: pr.id,
              createdById: pr.recordedById,
            },
          });
        }
        paymentsPosted++;
      }
    }

    return {
      dryRun: isDryRun,
      invoicesScanned,
      invoicesPosted,
      billsScanned,
      billsPosted,
      paymentsScanned,
      paymentsPosted,
      totalEntriesQueued: invoicesPosted + billsPosted + paymentsPosted,
    };
  }
}
