import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { ScopedUser } from '../auth/scoping.service';
import { validateMeaningfulNarration } from '../common/shared-validation';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface LedgerPartySummary {
  partyId: string;
  partyType: 'customer' | 'supplier';
  partyName: string;
  partyGstin?: string | null;
  partyPhone?: string | null;
  partyEmail?: string | null;
  closingBalance: number;
  balanceSide: 'Dr' | 'Cr';
  outstandingAmount?: number;
  hasOverdue?: boolean;
  isUnlinked?: boolean;
  unlinkedCount?: number;
  isDemo?: boolean;
  source?: string;
  ageing: {
    current: number; // 0-30 days
    days30: number;  // 31-60 days
    days60: number;  // 61-90 days
    days90Plus: number; // 91+ days
    total: number;
  };
}

export interface StatementEntry {
  id: string;
  date: string;
  particulars: string;
  voucherType: string;
  voucherNo: string;
  debit: number;
  credit: number;
  runningBalance: number;
  runningSide: 'Dr' | 'Cr';
  sourceType?: string | null;
  sourceId?: string | null;
  isReversal?: boolean;
}

export interface OpenBillItem {
  documentId: string;
  documentNumber: string;
  documentType: string;
  date: string;
  dueDate?: string;
  totalAmount: number;
  balanceDue: number;
  daysOverdue: number;
}

export interface PartyStatementResponse {
  party: {
    id: string;
    type: 'customer' | 'supplier';
    name: string;
    gstin?: string | null;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
    creditPeriod?: number | null;
  };
  financialYear: string;
  startDate?: string;
  endDate?: string;
  fromDate?: string;
  toDate?: string;
  closingBalance?: number;
  openingSide?: 'Dr' | 'Cr';
  closingSide?: 'Dr' | 'Cr';
  side?: 'Dr' | 'Cr';
  openingBalanceDetail?: {
    amount: number;
    side: 'Dr' | 'Cr';
  };
  openingBalance: number | {
    amount: number;
    side: 'Dr' | 'Cr';
  };
  entries: StatementEntry[];
  openBills?: OpenBillItem[];
  ageing?: {
    current: number; // 0-30
    days30: number;  // 31-60
    days60: number;  // 61-90
    days90Plus: number; // 91+
    total: number;
  };
  availableFinancialYears?: string[];
  alternativeFyWithEntries?: string | null;
  lockedUntil?: string | null;
  totals: {
    debitTotal: number;
    creditTotal: number;
    totalDebit?: number;
    totalCredit?: number;
    closingBalance: number;
    closingSide: 'Dr' | 'Cr';
  };
}

export function getIndianFinancialYear(date: Date | string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    const now = new Date();
    return getIndianFinancialYear(now);
  }
  const year = d.getFullYear();
  const month = d.getMonth(); // 0 = Jan, 1 = Feb, 2 = Mar, 3 = Apr
  const startYear = month >= 3 ? year : year - 1;
  const endYear = startYear + 1;
  const yy1 = String(startYear).slice(-2);
  const yy2 = String(endYear).slice(-2);
  return `${yy1}-${yy2}`;
}

export function getFinancialYearDateBounds(fy: string): { start: Date; end: Date } {
  const match = fy.match(/^(\d{2})-(\d{2})$/);
  if (!match) {
    const now = new Date();
    const currentFy = getIndianFinancialYear(now);
    return getFinancialYearDateBounds(currentFy);
  }
  const startYear = 2000 + parseInt(match[1], 10);
  const endYear = 2000 + parseInt(match[2], 10);
  const start = new Date(Date.UTC(startYear, 3, 1, 0, 0, 0, 0)); // 1 April
  const end = new Date(Date.UTC(endYear, 2, 31, 23, 59, 59, 999)); // 31 March
  return { start, end };
}

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService: AuditService
  ) {}

  /**
   * Period Lock check: throws if targetDate is on or before tenant's lockedUntil
   */
  async assertPeriodNotLocked(tenantId: string, targetDate: Date | string): Promise<void> {
    const lock = await this.prisma.ledgerLock.findUnique({
      where: { tenantId },
    });
    if (!lock || !lock.lockedUntil) return;

    const dateToCheck = new Date(targetDate);
    const lockDate = new Date(lock.lockedUntil);
    if (dateToCheck <= lockDate) {
      const formattedLock = lockDate.toISOString().slice(0, 10);
      throw new BadRequestException(
        `This accounting period is locked up to ${formattedLock}. No postings or modifications are permitted on or before this date.`
      );
    }
  }

  /**
   * Get accounting period lock date
   */
  async getLockDate(tenantId: string): Promise<{ lockedUntil: string | null }> {
    const lock = await this.prisma.ledgerLock.findUnique({ where: { tenantId } });
    const lockedUntil = lock?.lockedUntil ? lock.lockedUntil.toISOString().slice(0, 10) : null;
    return { lockedUntil };
  }

  /**
   * Set or update accounting period lock date (or null to unlock)
   */
  async setLockDate(tenantId: string, lockedUntil: string | null | undefined, user: ScopedUser) {
    if (
      user.role !== 'platform_super_admin' &&
      user.role !== 'tenant_admin' &&
      user.role !== 'admin' &&
      user.role !== 'accountant'
    ) {
      throw new ForbiddenException('Only administrators and accountants can set period lock dates.');
    }

    if (!lockedUntil) {
      await this.prisma.ledgerLock.deleteMany({ where: { tenantId } });
      await this.auditService.log({
        actorId: user.id,
        actorName: user.employeeCode || (user as any).name || 'User',
        action: 'UNLOCK_LEDGER_PERIOD',
        entityName: 'LedgerLock',
        entityId: tenantId,
        beforeState: {},
        afterState: { lockedUntil: null },
      });
      return { lockedUntil: null };
    }

    const lockDate = new Date(lockedUntil);
    if (isNaN(lockDate.getTime())) {
      throw new BadRequestException('A valid lock date is required.');
    }

    const lock = await this.prisma.ledgerLock.upsert({
      where: { tenantId },
      create: {
        tenantId,
        lockedUntil: lockDate,
        lockedById: user.id,
      },
      update: {
        lockedUntil: lockDate,
        lockedById: user.id,
      },
    });

    await this.auditService.log({
      actorId: user.id,
      actorName: user.employeeCode || (user as any).name || 'User',
      action: 'UPDATE_LEDGER_LOCK',
      entityName: 'LedgerLock',
      entityId: lock.id,
      beforeState: {},
      afterState: { lockedUntil: lockDate.toISOString() },
    });

    return lock;
  }

  /**
   * Authoritative reconciliation between Ledger closing balances and Document unpaid balances.
   * For every customer: ledger balance (Dr) == sum(unpaid issued tax/sez invoices balanceDue) - sum(unallocated credit notes balanceDue) - sum(unallocated customer receipts)
   * For every supplier: ledger balance (Cr) == sum(unpaid purchase bills balanceDue) - sum(unallocated supplier advances)
   */
  async getReconciliation(tenantId: string) {
    // 1. Reconcile Customers
    const companies = await this.prisma.company.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
    });

    const customersReconciliation: any[] = [];
    let totalCustomerReceivable = 0;

    for (const comp of companies) {
      const ledgerBal = await this.calculatePartyBalance(tenantId, 'customer', comp.id);
      const ledgerClosing = ledgerBal.side === 'Dr' ? ledgerBal.amount : -ledgerBal.amount;

      // Active issued tax and SEZ invoices (excluding voided)
      const invoices = await this.prisma.invoice.findMany({
        where: {
          tenantId,
          OR: [{ companyId: comp.id }, { customerId: comp.id }],
          docType: { in: ['tax_invoice', 'sez_invoice'] },
          isVoided: false,
          paymentStatus: { not: 'paid' },
        },
        select: { id: true, invoiceNumber: true, totalAmount: true, balanceDue: true, advanceAdjusted: true },
      });

      const unpaidInvoicesSum = invoices.reduce((sum, i) => sum + (Number(i.balanceDue ?? i.totalAmount) || 0), 0);

      // Active credit notes
      const creditNotes = await this.prisma.invoice.findMany({
        where: {
          tenantId,
          OR: [{ companyId: comp.id }, { customerId: comp.id }],
          docType: 'credit_note',
          isVoided: false,
        },
        select: { id: true, invoiceNumber: true, totalAmount: true, balanceDue: true },
      });
      const unallocatedCreditNotesSum = creditNotes.reduce((sum, c) => sum + (Number(c.balanceDue ?? c.totalAmount) || 0), 0);

      // Unallocated customer advances (excluding reversed payments)
      const payments = await this.prisma.paymentRecord.findMany({
        where: {
          tenantId,
          customerId: comp.id,
          reversalOfId: null,
          reversals: { none: {} },
        },
        include: { allocations: true },
      });
      let unallocatedAdvances = 0;
      for (const p of payments) {
        const allocated = (p.allocations || []).reduce((s, a) => s + Number(a.amount), 0);
        const unalloc = Math.max(0, Number(p.amount) - allocated);
        unallocatedAdvances += unalloc;
      }

      const netDocumentBalance = Number((unpaidInvoicesSum - unallocatedCreditNotesSum - unallocatedAdvances).toFixed(2));
      const discrepancy = Number((ledgerClosing - netDocumentBalance).toFixed(2));
      const isReconciled = Math.abs(discrepancy) < 0.05;

      if (ledgerClosing > 0) {
        totalCustomerReceivable += ledgerClosing;
      }

      customersReconciliation.push({
        partyId: comp.id,
        partyName: comp.name,
        ledgerBalance: ledgerClosing,
        balanceSide: ledgerBal.side,
        unpaidInvoicesSum: Number(unpaidInvoicesSum.toFixed(2)),
        unallocatedCreditNotesSum: Number(unallocatedCreditNotesSum.toFixed(2)),
        unallocatedAdvances: Number(unallocatedAdvances.toFixed(2)),
        netDocumentBalance,
        discrepancy,
        isReconciled,
        unpaidInvoicesCount: invoices.length,
      });
    }

    // 2. Reconcile Suppliers
    const suppliers = await this.prisma.supplier.findMany({
      where: { tenantId, isActive: true, deletedAt: null },
      orderBy: { name: 'asc' },
    });

    const suppliersReconciliation: any[] = [];
    let totalSupplierPayable = 0;

    for (const sup of suppliers) {
      const ledgerBal = await this.calculatePartyBalance(tenantId, 'supplier', sup.id);
      const ledgerClosing = ledgerBal.side === 'Cr' ? ledgerBal.amount : -ledgerBal.amount;

      // Purchase bills
      const bills = await this.prisma.purchaseBill.findMany({
        where: {
          tenantId,
          supplierId: sup.id,
          deletedAt: null,
          paymentStatus: { in: ['unpaid', 'partial'] },
        },
        include: { allocations: true },
      });

      let unpaidBillsSum = 0;
      for (const b of bills) {
        const allocated = (b.allocations || []).reduce((s, a) => s + Number(a.amount), 0);
        const due = Math.max(0, Number(b.grandTotal) - allocated);
        unpaidBillsSum += due;
      }

      // Check supplier payments for unallocated amounts
      const supplierPayments = await this.prisma.supplierPayment.findMany({
        where: { tenantId, supplierId: sup.id },
        include: { allocations: true },
      });
      let unallocatedSupplierAdvances = 0;
      for (const sp of supplierPayments) {
        const allocated = (sp.allocations || []).reduce((s, a) => s + Number(a.amount), 0);
        const unalloc = Math.max(0, Number(sp.amount) - allocated);
        unallocatedSupplierAdvances += unalloc;
      }

      const netBillsBalance = Number((unpaidBillsSum - unallocatedSupplierAdvances).toFixed(2));
      const discrepancy = Number((ledgerClosing - netBillsBalance).toFixed(2));
      const isReconciled = Math.abs(discrepancy) < 0.05;

      if (ledgerClosing > 0) {
        totalSupplierPayable += ledgerClosing;
      }

      suppliersReconciliation.push({
        partyId: sup.id,
        partyName: sup.name,
        ledgerBalance: ledgerClosing,
        balanceSide: ledgerBal.side,
        unpaidBillsSum: Number(unpaidBillsSum.toFixed(2)),
        unallocatedSupplierAdvances: Number(unallocatedSupplierAdvances.toFixed(2)),
        netBillsBalance,
        discrepancy,
        isReconciled,
        unpaidBillsCount: bills.length,
      });
    }

    const allReconciled =
      customersReconciliation.every((c) => c.isReconciled) &&
      suppliersReconciliation.every((s) => s.isReconciled);

    return {
      status: allReconciled ? 'reconciled' : 'discrepancy',
      reconciled: allReconciled,
      totalReceivable: Number(totalCustomerReceivable.toFixed(2)),
      totalPayable: Number(totalSupplierPayable.toFixed(2)),
      customers: customersReconciliation,
      suppliers: suppliersReconciliation,
    };
  }

  /**
   * All-Years Open Documents for a Customer or Supplier
   * Standardizes on one set of field names:
   * documentId, documentNumber, documentType, date, dueDate, totalAmount, balanceDue
   */
  async getAllOpenDocuments(tenantId: string, partyType: 'customer' | 'supplier', partyId: string) {
    if (partyType === 'customer') {
      const invoices = await this.prisma.invoice.findMany({
        where: {
          tenantId,
          OR: [{ companyId: partyId }, { customerId: partyId }],
          docType: { in: ['tax_invoice', 'sez_invoice', 'credit_note'] },
          isVoided: false,
          paymentStatus: { not: 'paid' },
        },
        orderBy: [{ invoiceDate: 'asc' }, { dueDate: 'asc' }, { invoiceNumber: 'asc' }],
      });

      return invoices.map((inv) => ({
        documentId: inv.id,
        documentNumber: inv.invoiceNumber,
        documentType: inv.docType,
        date: inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().slice(0, 10) : '',
        dueDate: inv.dueDate
          ? new Date(inv.dueDate).toISOString().slice(0, 10)
          : (inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().slice(0, 10) : ''),
        totalAmount: Number(inv.totalAmount || 0),
        balanceDue: Number(inv.balanceDue ?? inv.totalAmount ?? 0),
        referenceNo: inv.referenceNo || null,
      }));
    } else {
      const bills = await this.prisma.purchaseBill.findMany({
        where: {
          tenantId,
          supplierId: partyId,
          deletedAt: null,
          paymentStatus: { not: 'paid' },
        },
        include: { allocations: true } as any,
        orderBy: [{ invoiceDateReal: 'asc' }, { dueDate: 'asc' }, { invoiceNumber: 'asc' }],
      });

      return bills.map((b: any) => {
        const bDate = b.invoiceDateReal || b.billDate || b.createdAt;
        const paidAllocations = (b.allocations || []).reduce((s: number, a: any) => s + Number(a.amount || 0), 0);
        const due = Math.max(0, Number(b.grandTotal || b.totalAmount || 0) - paidAllocations);
        return {
          documentId: b.id,
          documentNumber: b.invoiceNumber || b.billNumber || b.id,
          documentType: 'purchase_bill',
          date: bDate ? new Date(bDate).toISOString().slice(0, 10) : '',
          dueDate: b.dueDate
            ? new Date(b.dueDate).toISOString().slice(0, 10)
            : (bDate ? new Date(bDate).toISOString().slice(0, 10) : ''),
          totalAmount: Number(b.grandTotal || b.totalAmount || 0),
          balanceDue: Number(due.toFixed(2)),
          referenceNo: b.reference || null,
        };
      });
    }
  }

  /**
   * Retrieve list of parties (customers & suppliers) with balance and ageing breakdown
   */
  async getParties(tenantId: string, type: 'customer' | 'supplier' | 'all' = 'all', search?: string): Promise<LedgerPartySummary[]> {
    const results: LedgerPartySummary[] = [];
    const searchFilter = search ? search.trim().toLowerCase() : '';

    // 1. Customers
    if (type === 'all' || type === 'customer') {
      const companies = await this.prisma.company.findMany({
        where: {
          tenantId,
          deletedAt: null,
          ...(searchFilter
            ? {
                OR: [
                  { name: { contains: searchFilter, mode: 'insensitive' } },
                  { gstin: { contains: searchFilter, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        include: {
          contacts: {
            where: { deletedAt: null },
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          },
        },
        orderBy: { name: 'asc' },
      });

      for (const comp of companies) {
        const balance = await this.calculatePartyBalance(tenantId, 'customer', comp.id);
        const ageing = await this.calculatePartyAgeing(tenantId, 'customer', comp.id);
        const contact = comp.contacts?.[0];
        const phone = (comp as any).phone || contact?.phone || null;
        const email = comp.billingEmail || contact?.email || (comp as any).email || null;
        const hasOverdue = ageing.days30 > 0 || ageing.days60 > 0 || ageing.days90Plus > 0;

        results.push({
          partyId: comp.id,
          partyType: 'customer',
          partyName: comp.name,
          partyGstin: comp.gstin,
          partyPhone: phone,
          partyEmail: email,
          closingBalance: balance.amount,
          balanceSide: balance.side,
          outstandingAmount: balance.amount,
          hasOverdue,
          isDemo: Boolean((comp as any).isDemo),
          source: (comp as any).source || ((comp as any).isDemo ? 'demo' : 'manual'),
          ageing,
        });
      }

      // Check unlinked customer invoices (invoices without companyId)
      const unlinkedInvoices = await this.prisma.invoice.findMany({
        where: {
          tenantId,
          companyId: null,
          isVoided: false,
        },
        select: {
          id: true,
          invoiceNumber: true,
          customerName: true,
          customerPhone: true,
          customerGstin: true,
          customerEmail: true,
          totalAmount: true,
          balanceDue: true,
          dueDate: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (unlinkedInvoices.length > 0) {
        const totalUnlinkedBalance = unlinkedInvoices.reduce((sum, inv) => sum + (Number(inv.balanceDue ?? inv.totalAmount) || 0), 0);
        const hasOverdueUnlinked = unlinkedInvoices.some((inv) => inv.dueDate && new Date(inv.dueDate) < new Date());

        results.push({
          partyId: 'not-linked',
          partyType: 'customer',
          partyName: 'Not linked to a customer yet',
          partyGstin: null,
          partyPhone: null,
          partyEmail: null,
          closingBalance: Number(totalUnlinkedBalance.toFixed(2)),
          balanceSide: 'Dr',
          outstandingAmount: Number(totalUnlinkedBalance.toFixed(2)),
          hasOverdue: hasOverdueUnlinked,
          isUnlinked: true,
          unlinkedCount: unlinkedInvoices.length,
          ageing: {
            current: Number(totalUnlinkedBalance.toFixed(2)),
            days30: 0,
            days60: 0,
            days90Plus: 0,
            total: Number(totalUnlinkedBalance.toFixed(2)),
          },
        });
      }
    }

    // 2. Suppliers
    if (type === 'all' || type === 'supplier') {
      const suppliers = await this.prisma.supplier.findMany({
        where: {
          tenantId,
          isActive: true,
          deletedAt: null,
          ...(searchFilter
            ? {
                OR: [
                  { name: { contains: searchFilter, mode: 'insensitive' } },
                  { gstin: { contains: searchFilter, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: { name: 'asc' },
      });

      for (const sup of suppliers) {
        const balance = await this.calculatePartyBalance(tenantId, 'supplier', sup.id);
        const ageing = await this.calculatePartyAgeing(tenantId, 'supplier', sup.id);
        const hasOverdue = ageing.days30 > 0 || ageing.days60 > 0 || ageing.days90Plus > 0;

        results.push({
          partyId: sup.id,
          partyType: 'supplier',
          partyName: sup.name,
          partyGstin: sup.gstin,
          partyPhone: sup.phone,
          partyEmail: sup.email,
          closingBalance: balance.amount,
          balanceSide: balance.side,
          outstandingAmount: balance.amount,
          hasOverdue,
          isDemo: Boolean((sup as any).isDemo),
          source: (sup as any).source || ((sup as any).isDemo ? 'demo' : 'manual'),
          ageing,
        });
      }
    }

    // Sort by outstanding amount, largest first
    results.sort((a, b) => b.closingBalance - a.closingBalance);

    return results;
  }

  /**
   * Helper: calculate net balance and side for a party
   */
  async calculatePartyBalance(
    tenantId: string,
    partyType: 'customer' | 'supplier',
    partyId: string,
    asOfDate?: Date
  ): Promise<{ amount: number; side: 'Dr' | 'Cr' }> {
    if (partyId === 'not-linked') {
      const unlinkedInvs = await this.prisma.invoice.findMany({
        where: { tenantId, companyId: null, isVoided: false },
        select: { totalAmount: true, balanceDue: true },
      });
      const unlinkedSum = unlinkedInvs.reduce((sum, i) => sum + (Number(i.balanceDue ?? i.totalAmount) || 0), 0);
      return { amount: Number(unlinkedSum.toFixed(2)), side: 'Dr' };
    }

    const entries = await this.prisma.ledgerEntry.findMany({
      where: {
        tenantId,
        partyType,
        partyId,
        ...(asOfDate ? { entryDate: { lte: asOfDate } } : {}),
      },
    });

    let netDebit = 0;
    let netCredit = 0;

    for (const e of entries) {
      netDebit += Number(e.debit);
      netCredit += Number(e.credit);
    }

    // Sync safety: If PartyOpeningBalance exists and is not represented in entries, include it
    const hasOpeningEntry = entries.some((e) => e.voucherType === 'opening');
    if (!hasOpeningEntry) {
      const openBals = await this.prisma.partyOpeningBalance.findMany({
        where: { tenantId, partyType, partyId },
      });
      for (const ob of openBals) {
        if (ob.side.toLowerCase() === 'dr') {
          netDebit += Number(ob.amount);
        } else {
          netCredit += Number(ob.amount);
        }
      }
    }

    if (partyType === 'customer') {
      const net = Number((netDebit - netCredit).toFixed(2));
      if (net >= 0) {
        return { amount: net, side: 'Dr' };
      }
      return { amount: Math.abs(net), side: 'Cr' };
    } else {
      // Supplier: normal side is Cr (liability)
      const net = Number((netCredit - netDebit).toFixed(2));
      if (net >= 0) {
        return { amount: net, side: 'Cr' };
      }
      return { amount: Math.abs(net), side: 'Dr' };
    }
  }

  /**
   * Calculate ageing totals (0-30, 31-60, 61-90, 90+) for a party
   */
  private async calculatePartyAgeing(tenantId: string, partyType: 'customer' | 'supplier', partyId: string) {
    if (partyId === 'not-linked') {
      const unlinkedInvs = await this.prisma.invoice.findMany({
        where: { tenantId, companyId: null, isVoided: false },
        select: { totalAmount: true, balanceDue: true, dueDate: true, invoiceDate: true },
      });
      const now = new Date();
      const day30 = new Date(now.getTime() - 30 * 86400000);
      const day60 = new Date(now.getTime() - 60 * 86400000);
      const day90 = new Date(now.getTime() - 90 * 86400000);
      let current = 0;
      let days30 = 0;
      let days60 = 0;
      let days90Plus = 0;
      for (const inv of unlinkedInvs) {
        const amt = Number(inv.balanceDue ?? inv.totalAmount ?? 0);
        const d = new Date(inv.dueDate || inv.invoiceDate);
        if (d > day30) current += amt;
        else if (d > day60) days30 += amt;
        else if (d > day90) days60 += amt;
        else days90Plus += amt;
      }
      const total = current + days30 + days60 + days90Plus;
      return {
        current: Math.max(0, Number(current.toFixed(2))),
        days30: Math.max(0, Number(days30.toFixed(2))),
        days60: Math.max(0, Number(days60.toFixed(2))),
        days90Plus: Math.max(0, Number(days90Plus.toFixed(2))),
        total: Math.max(0, Number(total.toFixed(2))),
      };
    }

    const now = new Date();
    const day30 = new Date(now.getTime() - 30 * 86400000);
    const day60 = new Date(now.getTime() - 60 * 86400000);
    const day90 = new Date(now.getTime() - 90 * 86400000);

    const entries = await this.prisma.ledgerEntry.findMany({
      where: { tenantId, partyType, partyId },
      orderBy: { entryDate: 'asc' },
    });

    let current = 0;
    let days30 = 0;
    let days60 = 0;
    let days90Plus = 0;

    for (const e of entries) {
      const amt = partyType === 'customer' ? Number(e.debit) - Number(e.credit) : Number(e.credit) - Number(e.debit);
      const d = new Date(e.entryDate);
      if (d > day30) current += amt;
      else if (d > day60) days30 += amt;
      else if (d > day90) days60 += amt;
      else days90Plus += amt;
    }

    const total = current + days30 + days60 + days90Plus;
    return {
      current: Math.max(0, Number(current.toFixed(2))),
      days30: Math.max(0, Number(days30.toFixed(2))),
      days60: Math.max(0, Number(days60.toFixed(2))),
      days90Plus: Math.max(0, Number(days90Plus.toFixed(2))),
      total: Math.max(0, Number(total.toFixed(2))),
    };
  }

  /**
   * Generate official statement for a party (Customer or Supplier)
   */
  async getStatement(
    tenantId: string,
    partyType: 'customer' | 'supplier',
    partyId: string,
    options: { financialYear?: string; startDate?: string; endDate?: string } = {}
  ): Promise<PartyStatementResponse> {
    // 1. Resolve party info
    let partyInfo: any = null;
    let unlinkedNames: string[] = [];

    if (partyType === 'customer') {
      if (partyId === 'not-linked') {
        const unlinkedInvs = await this.prisma.invoice.findMany({
          where: { tenantId, companyId: null, isVoided: false },
          select: { customerName: true },
        });
        unlinkedNames = Array.from(new Set(unlinkedInvs.map((i) => i.customerName).filter(Boolean))) as string[];

        partyInfo = {
          id: 'not-linked',
          type: 'customer',
          name: 'Not linked to a customer yet',
          gstin: null,
          address: 'Invoices without linked customer company',
          email: null,
          phone: null,
          creditPeriod: 30,
        };
      } else {
        const comp = await this.prisma.company.findFirst({
          where: { id: partyId, tenantId },
          include: {
            contacts: {
              where: { deletedAt: null },
              orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            },
          },
        });
        if (comp) {
          const contact = comp.contacts?.[0];
          partyInfo = {
            id: comp.id,
            type: 'customer',
            name: comp.name,
            gstin: comp.gstin,
            address: comp.address ? `${comp.address}, ${comp.city || ''} ${comp.state || ''}` : '',
            email: comp.billingEmail || contact?.email || (comp as any).email || null,
            phone: (comp as any).phone || contact?.phone || null,
            creditPeriod: 30,
          };
        } else {
          // Fallback customer
          partyInfo = { id: partyId, type: 'customer', name: partyId, creditPeriod: 30 };
        }
      }
    } else {
      const sup = await this.prisma.supplier.findFirst({ where: { id: partyId, tenantId } });
      if (sup) {
        partyInfo = {
          id: sup.id,
          type: 'supplier',
          name: sup.name,
          gstin: sup.gstin,
          address: sup.address ? `${sup.address}, ${sup.city || ''}` : '',
          email: sup.email,
          phone: sup.phone,
          creditPeriod: sup.leadTimeDays || 30,
        };
      } else {
        partyInfo = { id: partyId, type: 'supplier', name: partyId, creditPeriod: 30 };
      }
    }

    const currentFy = options.financialYear || getIndianFinancialYear(new Date());
    let bounds = getFinancialYearDateBounds(currentFy);

    if (options.startDate && options.endDate) {
      bounds = {
        start: new Date(options.startDate),
        end: new Date(options.endDate),
      };
    }

    const partyIdFilter: any =
      partyId === 'not-linked'
        ? { in: ['not-linked', ...unlinkedNames] }
        : partyId;

    // 2. Resolve opening balance for the financial year
    // Rule: opening b/f = the sum of all entries dated BEFORE the FY start (carry forward) + the one opening entry of that FY.
    const priorEntries = await this.prisma.ledgerEntry.findMany({
      where: {
        tenantId,
        partyType,
        partyId: partyIdFilter,
        entryDate: { lt: bounds.start },
      },
    });

    let priorDebits = 0;
    let priorCredits = 0;
    for (const pe of priorEntries) {
      priorDebits += Number(pe.debit);
      priorCredits += Number(pe.credit);
    }

    let priorNet = partyType === 'customer'
      ? (priorDebits - priorCredits)
      : (priorCredits - priorDebits);

    // Resolve the one opening entry for this FY (from PartyOpeningBalance or LedgerEntry with voucherType 'opening')
    const configuredOpening = partyId !== 'not-linked'
      ? await this.prisma.partyOpeningBalance.findUnique({
          where: {
            tenantId_partyType_partyId_financialYear: {
              tenantId,
              partyType,
              partyId,
              financialYear: currentFy,
            },
          },
        })
      : null;

    let openingEntryNet = 0;
    if (configuredOpening) {
      const amt = Number(configuredOpening.amount);
      if (partyType === 'customer') {
        openingEntryNet = configuredOpening.side.toLowerCase() === 'cr' ? -amt : amt;
      } else {
        openingEntryNet = configuredOpening.side.toLowerCase() === 'cr' ? amt : -amt;
      }
    } else {
      const obEntry = await this.prisma.ledgerEntry.findFirst({
        where: {
          tenantId,
          partyType,
          partyId: partyIdFilter,
          financialYear: currentFy,
          voucherType: 'opening',
          reversals: { none: {} },
        },
      });
      if (obEntry) {
        const dr = Number(obEntry.debit);
        const cr = Number(obEntry.credit);
        if (partyType === 'customer') {
          openingEntryNet = dr - cr;
        } else {
          openingEntryNet = cr - dr;
        }
      }
    }

    const totalOpeningNet = Number((priorNet + openingEntryNet).toFixed(2));
    const openingAmount = Math.abs(totalOpeningNet);
    let openingSide: 'Dr' | 'Cr' = 'Dr';
    if (partyType === 'customer') {
      openingSide = totalOpeningNet >= 0 ? 'Dr' : 'Cr';
    } else {
      openingSide = totalOpeningNet >= 0 ? 'Cr' : 'Dr';
    }

    // 3. Fetch period transaction entries (The opening entry and its reversals appear ONLY as the "Opening Balance b/f" row, NEVER as transaction rows)
    const entries = await this.prisma.ledgerEntry.findMany({
      where: {
        tenantId,
        partyType,
        partyId: partyIdFilter,
        entryDate: {
          gte: bounds.start,
          lte: bounds.end,
        },
        voucherType: { not: 'opening' },
        OR: [
          { reversalOfId: null },
          { reversalOf: { voucherType: { not: 'opening' } } },
        ],
      },
      orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
    });

    // 4. Compute running balance row by row
    let runningNet = 0;
    if (partyType === 'customer') {
      runningNet = openingSide === 'Dr' ? openingAmount : -openingAmount;
    } else {
      runningNet = openingSide === 'Cr' ? openingAmount : -openingAmount;
    }

    let debitTotal = 0;
    let creditTotal = 0;

    const formattedEntries: StatementEntry[] = entries.map((entry) => {
      const dr = Number(entry.debit);
      const cr = Number(entry.credit);
      debitTotal += dr;
      creditTotal += cr;

      if (partyType === 'customer') {
        runningNet = Number((runningNet + dr - cr).toFixed(2));
      } else {
        // Supplier: Credit increases payable, Debit decreases
        runningNet = Number((runningNet + cr - dr).toFixed(2));
      }

      let runningSide: 'Dr' | 'Cr' = 'Dr';
      let displayBalance = 0;

      if (partyType === 'customer') {
        if (runningNet >= 0) {
          runningSide = 'Dr';
          displayBalance = runningNet;
        } else {
          runningSide = 'Cr';
          displayBalance = Math.abs(runningNet);
        }
      } else {
        if (runningNet >= 0) {
          runningSide = 'Cr';
          displayBalance = runningNet;
        } else {
          runningSide = 'Dr';
          displayBalance = Math.abs(runningNet);
        }
      }

      return {
        id: entry.id,
        date: entry.entryDate.toISOString().slice(0, 10),
        particulars: entry.particulars,
        voucherType: entry.voucherType,
        voucherNo: entry.voucherNo,
        debit: dr,
        credit: cr,
        runningBalance: displayBalance,
        runningSide,
        sourceType: entry.sourceType,
        sourceId: entry.sourceId,
        isReversal: Boolean(entry.reversalOfId),
      };
    });

    let closingAmount = 0;
    let closingSide: 'Dr' | 'Cr' = 'Dr';

    if (partyType === 'customer') {
      if (runningNet >= 0) {
        closingAmount = runningNet;
        closingSide = 'Dr';
      } else {
        closingAmount = Math.abs(runningNet);
        closingSide = 'Cr';
      }
    } else {
      if (runningNet >= 0) {
        closingAmount = runningNet;
        closingSide = 'Cr';
      } else {
        closingAmount = Math.abs(runningNet);
        closingSide = 'Dr';
      }
    }

    // 5. Query open bills
    let openBills: OpenBillItem[] = [];
    if (partyType === 'customer') {
      const whereInv: any = {
        tenantId,
        paymentStatus: { not: 'paid' },
        isVoided: false,
      };
      if (partyId === 'not-linked') {
        whereInv.companyId = null;
      } else {
        whereInv.companyId = partyId;
      }
      const unpaidInvoices = await this.prisma.invoice.findMany({
        where: whereInv,
        orderBy: { invoiceDate: 'asc' },
      });
      openBills = unpaidInvoices.map((inv) => {
        const due = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.invoiceDate);
        const diffDays = Math.floor((Date.now() - due.getTime()) / (1000 * 60 * 60 * 24));
        return {
          documentId: inv.id,
          documentNumber: inv.invoiceNumber,
          documentType: inv.docType || 'tax_invoice',
          date: inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().slice(0, 10) : '',
          dueDate: inv.dueDate ? new Date(inv.dueDate).toISOString().slice(0, 10) : undefined,
          totalAmount: Number(inv.totalAmount || 0),
          balanceDue: Number(inv.balanceDue ?? inv.totalAmount ?? 0),
          daysOverdue: Math.max(0, diffDays),
        };
      });
    } else {
      const unpaidBills = await this.prisma.purchaseBill.findMany({
        where: {
          tenantId,
          supplierId: partyId,
          paymentStatus: { not: 'paid' },
          deletedAt: null,
        },
        orderBy: [{ createdAt: 'asc' }],
      });
      openBills = unpaidBills.map((bill: any) => {
        const bDate = bill.billDate || bill.invoiceDate || bill.createdAt;
        const due = bill.dueDate ? new Date(bill.dueDate) : new Date(bDate);
        const diffDays = Math.floor((Date.now() - due.getTime()) / (1000 * 60 * 60 * 24));
        return {
          documentId: bill.id,
          documentNumber: bill.invoiceNumber || bill.billNumber || bill.id,
          documentType: 'purchase_bill',
          date: bDate ? new Date(bDate).toISOString().slice(0, 10) : '',
          dueDate: bill.dueDate ? new Date(bill.dueDate).toISOString().slice(0, 10) : undefined,
          totalAmount: Number(bill.totalAmount || bill.grandTotal || 0),
          balanceDue: Number(bill.balanceDue ?? bill.totalAmount ?? bill.grandTotal ?? 0),
          daysOverdue: Math.max(0, diffDays),
        };
      });
    }

    // 6. Ageing breakdown
    const ageing = await this.calculatePartyAgeing(tenantId, partyType, partyId);

    // 7. Distinct financial years
    const distinctFys = await this.prisma.ledgerEntry.findMany({
      where: {
        tenantId,
        partyType,
        partyId: partyIdFilter,
      },
      select: { financialYear: true },
      distinct: ['financialYear'],
    });
    const currentFyCalculated = getIndianFinancialYear(new Date());
    const fySet = new Set<string>([currentFyCalculated, ...distinctFys.map((f) => f.financialYear).filter(Boolean)]);
    const availableFinancialYears = Array.from(fySet).sort();

    // 8. Alternative year with entries if current selection is empty
    let alternativeFyWithEntries: string | null = null;
    if (entries.length === 0) {
      const otherEntry = await this.prisma.ledgerEntry.findFirst({
        where: {
          tenantId,
          partyType,
          partyId: partyIdFilter,
          financialYear: { not: currentFy },
        },
        orderBy: { entryDate: 'desc' },
        select: { financialYear: true },
      });
      alternativeFyWithEntries = otherEntry?.financialYear || null;
    }

    // 9. Period lock status
    const lock = await this.prisma.ledgerLock.findUnique({ where: { tenantId } });
    const lockedUntil = lock?.lockedUntil ? lock.lockedUntil.toISOString().slice(0, 10) : null;

    const startIso = bounds.start.toISOString().slice(0, 10);
    const endIso = bounds.end.toISOString().slice(0, 10);

    return {
      party: partyInfo,
      financialYear: currentFy,
      startDate: startIso,
      endDate: endIso,
      fromDate: startIso,
      toDate: endIso,
      openingBalance: openingAmount,
      closingBalance: closingAmount,
      openingSide: openingSide || 'Dr',
      closingSide: closingSide || 'Dr',
      side: closingSide || 'Dr',
      openingBalanceDetail: {
        amount: openingAmount,
        side: openingSide || 'Dr',
      },
      entries: formattedEntries.map((e) => ({
        ...e,
        entryDate: e.date,
        voucherType: e.voucherType || 'journal',
        runningSide: e.runningSide || 'Dr',
        side: e.runningSide || 'Dr',
      })),
      openBills,
      ageing,
      availableFinancialYears,
      alternativeFyWithEntries,
      lockedUntil,
      totals: {
        debitTotal: Number(debitTotal.toFixed(2)),
        creditTotal: Number(creditTotal.toFixed(2)),
        totalDebit: Number(debitTotal.toFixed(2)),
        totalCredit: Number(creditTotal.toFixed(2)),
        closingBalance: closingAmount,
        closingSide: closingSide || 'Dr',
      },
    };
  }

  async recordManualEntry(
    tenantId: string,
    dto: {
      partyType: 'customer' | 'supplier';
      partyId: string;
      voucherType: 'opening' | 'journal' | 'credit_note' | 'debit_note';
      voucherNo?: string;
      entryDate: string;
      particulars: string;
      debit?: number;
      credit?: number;
      sourceId?: string;
      invoiceId?: string;
      billId?: string;
      confirmOpening?: boolean;
    },
    user: ScopedUser
  ) {
    if (
      user.role !== 'platform_super_admin' &&
      user.role !== 'tenant_admin' &&
      user.role !== 'admin' &&
      user.role !== 'accountant' &&
      user.role !== 'finance'
    ) {
      throw new ForbiddenException('Only accountants and administrators can post manual ledger entries.');
    }

    const debit = Number(dto.debit || 0);
    const credit = Number(dto.credit || 0);

    if (debit <= 0 && credit <= 0) {
      throw new BadRequestException('Either debit or credit amount must be greater than zero.');
    }
    if (debit > 0 && credit > 0) {
      throw new BadRequestException('A single party entry cannot have both debit and credit. Create two entries.');
    }
    if (debit < 0 || credit < 0) {
      throw new BadRequestException('Negative amounts are not permitted.');
    }
    if (debit > 100_000_000 || credit > 100_000_000) {
      throw new BadRequestException('Amount exceeds maximum permitted limit.');
    }

    const particulars = (dto.particulars || '').trim();
    if (!particulars || particulars.length < 5) {
      throw new BadRequestException('Please enter at least 5 characters for particulars narration.');
    }

    let entryDate = new Date(dto.entryDate || new Date());
    if (isNaN(entryDate.getTime())) {
      throw new BadRequestException('A valid entry date is required.');
    }

    let fy = getIndianFinancialYear(entryDate);
    const fyBounds = getFinancialYearDateBounds(fy);

    if (dto.voucherType === 'opening') {
      // 1. Date forced to FY start
      entryDate = fyBounds.start;

      // 2. Blocked if previous FY already has carry-forward
      const priorEntries = await this.prisma.ledgerEntry.count({
        where: {
          tenantId,
          partyType: dto.partyType,
          partyId: dto.partyId,
          entryDate: { lt: fyBounds.start },
        },
      });
      if (priorEntries > 0) {
        throw new BadRequestException(
          'Opening balance entry cannot be created because prior financial years already have transactions/carry-forward for this party.'
        );
      }

      // 3. Unique rule: one per party per FY
      const existingOB = await this.prisma.ledgerEntry.findFirst({
        where: {
          tenantId,
          partyType: dto.partyType,
          partyId: dto.partyId,
          financialYear: fy,
          voucherType: 'opening',
          reversals: { none: {} },
        },
      });
      if (existingOB) {
        throw new BadRequestException(
          `An opening balance entry already exists for this party in FY ${fy}. To edit, reverse the existing entry first and record a new one.`
        );
      }

      // 4. Confirmation step
      if (!dto.confirmOpening && !(dto as any).confirm) {
        throw new BadRequestException('Confirmation required: Please confirm creating this opening balance entry.');
      }
    } else {
      const maxFuture = new Date(Date.now() + 86400000 * 2);
      if (entryDate > maxFuture) {
        throw new BadRequestException('Entry date cannot be in the future.');
      }
      // Period lock check
      await this.assertPeriodNotLocked(tenantId, entryDate);
    }

    // Auto-generate voucher number if omitted
    let voucherNo = dto.voucherNo?.trim();
    if (!voucherNo) {
      const prefix =
        dto.voucherType === 'opening'
          ? 'OB'
          : dto.voucherType === 'credit_note'
          ? 'CN'
          : dto.voucherType === 'debit_note'
          ? 'DN'
          : 'JV';
      const count = await this.prisma.ledgerEntry.count({
        where: { tenantId, voucherType: dto.voucherType, financialYear: fy },
      });
      voucherNo = `${prefix}/${fy}/${String(count + 1).padStart(4, '0')}`;
    }

    // Optional link to invoice or bill
    const linkedDocId = dto.sourceId || dto.invoiceId || dto.billId || null;
    const sourceType = linkedDocId
      ? dto.partyType === 'customer'
        ? 'invoice'
        : 'purchase_bill'
      : 'manual';

    return this.prisma.$transaction(async (tx) => {
      // If opening balance, sync with PartyOpeningBalance table
      if (dto.voucherType === 'opening') {
        const side = debit > 0 ? 'dr' : 'cr';
        const amount = debit > 0 ? debit : credit;
        await tx.partyOpeningBalance.upsert({
          where: {
            tenantId_partyType_partyId_financialYear: {
              tenantId,
              partyType: dto.partyType,
              partyId: dto.partyId,
              financialYear: fy,
            },
          },
          create: {
            tenantId,
            partyType: dto.partyType,
            partyId: dto.partyId,
            financialYear: fy,
            amount: new Prisma.Decimal(amount.toFixed(2)),
            side,
            createdById: user.id,
          },
          update: {
            amount: new Prisma.Decimal(amount.toFixed(2)),
            side,
          },
        });
      }

      const entry = await tx.ledgerEntry.create({
        data: {
          tenantId,
          partyType: dto.partyType,
          partyId: dto.partyId,
          entryDate,
          financialYear: fy,
          voucherType: dto.voucherType,
          voucherNo,
          particulars,
          debit: new Prisma.Decimal(debit.toFixed(2)),
          credit: new Prisma.Decimal(credit.toFixed(2)),
          sourceType,
          sourceId: linkedDocId,
          createdById: user.id,
        },
      });

      await this.auditService.log({
        actorId: user.id,
        actorName: user.employeeCode || (user as any).name || 'User',
        action: 'CREATE_MANUAL_LEDGER_ENTRY',
        entityName: 'LedgerEntry',
        entityId: entry.id,
        beforeState: {},
        afterState: { ...dto, voucherNo, financialYear: fy },
      }, tx);

      return entry;
    });
  }

  /**
   * Immutability Guarantee: Reverse an existing ledger entry without modifying or deleting history
   */
  async reverseEntry(tenantId: string, entryId: string, user: ScopedUser, reason?: string) {
    const original = await this.prisma.ledgerEntry.findFirst({
      where: { id: entryId, tenantId },
    });
    if (!original) throw new NotFoundException('Original ledger entry not found.');
    if (original.reversalOfId) throw new BadRequestException('Cannot reverse an entry that is already a reversal.');

    const trimmedReason = (reason || '').trim();
    const narrationCheck = validateMeaningfulNarration(trimmedReason, 'Reversal reason');
    if (!narrationCheck.valid) {
      throw new BadRequestException(narrationCheck.error);
    }

    await this.assertPeriodNotLocked(tenantId, new Date());
    const fy = getIndianFinancialYear(new Date());

    return this.prisma.$transaction(async (tx) => {
      // If reversing an opening balance entry, remove/sync PartyOpeningBalance
      if (original.voucherType === 'opening') {
        await tx.partyOpeningBalance.deleteMany({
          where: {
            tenantId,
            partyType: original.partyType,
            partyId: original.partyId,
            financialYear: original.financialYear,
          },
        });
      }

      const count = await tx.ledgerEntry.count({
        where: { tenantId, voucherType: 'reversal', financialYear: fy },
      });
      const voucherNo = `REV/${fy}/${String(count + 1).padStart(4, '0')}`;

      const reversal = await tx.ledgerEntry.create({
        data: {
          tenantId,
          partyType: original.partyType,
          partyId: original.partyId,
          entryDate: new Date(),
          financialYear: fy,
          voucherType: 'reversal',
          voucherNo,
          particulars: `Reversal of ${original.voucherNo}: ${trimmedReason}`,
          debit: original.credit,
          credit: original.debit,
          sourceType: original.sourceType,
          sourceId: original.sourceId,
          reversalOfId: original.id,
          createdById: user.id,
        },
      });

      await this.auditService.log({
        actorId: user.id,
        actorName: user.employeeCode || (user as any).name || 'User',
        action: 'REVERSE_LEDGER_ENTRY',
        entityName: 'LedgerEntry',
        entityId: reversal.id,
        beforeState: { reversedEntryId: original.id },
        afterState: { reversalId: reversal.id, voucherNo, reason: trimmedReason },
      }, tx);

      return reversal;
    });
  }

  /**
   * Party Source Report: counts only grouped by source, createdBy, and createdAt
   */
  async getPartySourceReport(tenantId: string) {
    const companies = await this.prisma.company.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, source: true, createdById: true, createdAt: true, isDemo: true },
    });

    const suppliers = await this.prisma.supplier.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, source: true, createdById: true, createdAt: true, isDemo: true },
    });

    const allParties = [
      ...companies.map((c) => ({ ...c, partyType: 'customer' })),
      ...suppliers.map((s) => ({ ...s, partyType: 'supplier' })),
    ];

    const bySource: Record<string, number> = {
      manual: 0,
      import: 0,
      website: 0,
      demo: 0,
      test: 0,
    };

    const byCreatedBy: Record<string, number> = {};
    const byCreatedAt: Record<string, number> = {};

    for (const p of allParties) {
      const src = p.source || (p.isDemo ? 'demo' : 'manual');
      bySource[src] = (bySource[src] || 0) + 1;

      const creator = p.createdById || 'system';
      byCreatedBy[creator] = (byCreatedBy[creator] || 0) + 1;

      const dateStr = p.createdAt.toISOString().slice(0, 10);
      byCreatedAt[dateStr] = (byCreatedAt[dateStr] || 0) + 1;
    }

    return {
      totalCustomers: companies.length,
      totalSuppliers: suppliers.length,
      totalParties: allParties.length,
      bySource,
      byCreatedBy,
      byCreatedAt,
    };
  }

  /**
   * Reset Demo Data: resets demo tenant back to pristine seed fixture.
   * Only permitted for demo tenants (isDemo === true).
   */
  async resetDemoData(tenantId: string, user: ScopedUser) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }

    if (!tenant.isDemo) {
      throw new ForbiddenException('Reset demo data is only available for demo tenants.');
    }

    try {
      await execAsync('node node_modules/ts-node/dist/bin.js --project apps/api/tsconfig.json scripts/seed-dev.ts');
    } catch (err: any) {
      throw new BadRequestException(`Failed to reset demo data: ${err.message}`);
    }

    await this.auditService.log({
      tenantId,
      actorId: user.id,
      actorName: (user as any).employeeCode || (user as any).name || 'Admin',
      action: 'RESET_DEMO_DATA',
      entityName: 'Tenant',
      entityId: tenantId,
      afterState: { resetAt: new Date().toISOString() },
    });

    return {
      success: true,
      message: 'Demo data has been reset to default initial state.',
    };
  }

  /**
   * Scheduled reconciliation check:
   * Reports orphan ledger entries, documents without ledger entries, and number gaps.
   */
  async checkReconciliation(tenantId: string) {
    // 1. Orphan Ledger Entries: entries pointing to non-existent or deleted/voided source documents
    const ledgerEntries = await this.prisma.ledgerEntry.findMany({
      where: { tenantId },
      select: { id: true, voucherNo: true, voucherType: true, sourceType: true, sourceId: true },
    });

    const orphanEntries: Array<{ id: string; voucherNo: string; sourceType: string; sourceId: string; reason: string }> = [];

    const invoiceIds = new Set(
      (await this.prisma.invoice.findMany({ where: { tenantId }, select: { id: true } })).map((i) => i.id)
    );
    const paymentIds = new Set(
      (await this.prisma.paymentRecord.findMany({ where: { tenantId }, select: { id: true } })).map((p) => p.id)
    );
    const billIds = new Set(
      (await this.prisma.purchaseBill.findMany({ where: { tenantId }, select: { id: true } })).map((b) => b.id)
    );

    for (const entry of ledgerEntries) {
      if (entry.sourceType === 'invoice' && entry.sourceId && !invoiceIds.has(entry.sourceId)) {
        orphanEntries.push({ id: entry.id, voucherNo: entry.voucherNo, sourceType: entry.sourceType, sourceId: entry.sourceId, reason: 'Invoice not found' });
      } else if (entry.sourceType === 'payment' && entry.sourceId && !paymentIds.has(entry.sourceId)) {
        orphanEntries.push({ id: entry.id, voucherNo: entry.voucherNo, sourceType: entry.sourceType, sourceId: entry.sourceId, reason: 'PaymentRecord not found' });
      } else if (entry.sourceType === 'purchase_bill' && entry.sourceId && !billIds.has(entry.sourceId)) {
        orphanEntries.push({ id: entry.id, voucherNo: entry.voucherNo, sourceType: entry.sourceType, sourceId: entry.sourceId, reason: 'PurchaseBill not found' });
      }
    }

    // 2. Documents without Ledger Entries
    const documentsWithoutLedger: Array<{ id: string; docType: string; number: string; type: string }> = [];

    const postedInvoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        isVoided: false,
        docType: { in: ['tax_invoice', 'sez_invoice', 'credit_note'] },
      },
      select: { id: true, invoiceNumber: true, docType: true },
    });

    const invoiceLedgerSourceIds = new Set(
      ledgerEntries.filter((e) => e.sourceType === 'invoice' && e.sourceId).map((e) => e.sourceId!)
    );

    for (const inv of postedInvoices) {
      if (!invoiceLedgerSourceIds.has(inv.id)) {
        documentsWithoutLedger.push({ id: inv.id, docType: inv.docType, number: inv.invoiceNumber, type: 'invoice' });
      }
    }

    const postedBills = await this.prisma.purchaseBill.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      select: { id: true, invoiceNumber: true },
    });

    const billLedgerSourceIds = new Set(
      ledgerEntries.filter((e) => e.sourceType === 'purchase_bill' && e.sourceId).map((e) => e.sourceId!)
    );

    for (const bill of postedBills) {
      if (!billLedgerSourceIds.has(bill.id)) {
        documentsWithoutLedger.push({ id: bill.id, docType: 'purchase_bill', number: bill.invoiceNumber, type: 'purchase_bill' });
      }
    }

    // 3. Document Number Gaps
    const seriesList = await this.prisma.documentSeries.findMany({
      where: { tenantId },
    });

    const numberGaps: Array<{ docType: string; financialYear: string; missingNumbers: number[] }> = [];

    for (const series of seriesList) {
      let allocatedNumbers: number[] = [];
      if (['tax_invoice', 'sez_invoice', 'credit_note', 'delivery_challan', 'proforma_invoice'].includes(series.docType)) {
        const docs = await this.prisma.invoice.findMany({
          where: { tenantId, docType: series.docType },
          select: { invoiceNumber: true },
        });
        allocatedNumbers = docs
          .map((d) => {
            const parts = d.invoiceNumber.split('/');
            const num = parseInt(parts[parts.length - 1], 10);
            return isNaN(num) ? null : num;
          })
          .filter((n): n is number => n !== null);
      } else if (series.docType === 'order') {
        const orders = await this.prisma.order.findMany({
          where: { tenantId },
          select: { orderNumber: true },
        });
        allocatedNumbers = orders
          .map((o) => {
            const parts = o.orderNumber.split('/');
            const num = parseInt(parts[parts.length - 1], 10);
            return isNaN(num) ? null : num;
          })
          .filter((n): n is number => n !== null);
      }

      if (allocatedNumbers.length > 0) {
        const maxNum = Math.max(...allocatedNumbers);
        const presentSet = new Set(allocatedNumbers);
        const missing: number[] = [];
        for (let i = 1; i <= maxNum; i++) {
          if (!presentSet.has(i)) {
            missing.push(i);
          }
        }
        if (missing.length > 0) {
          numberGaps.push({
            docType: series.docType,
            financialYear: series.financialYear,
            missingNumbers: missing,
          });
        }
      }
    }

    return {
      reconciledAt: new Date(),
      tenantId,
      status: orphanEntries.length === 0 && documentsWithoutLedger.length === 0 && numberGaps.length === 0 ? 'CLEAN' : 'DISCREPANCIES_DETECTED',
      orphanEntries,
      documentsWithoutLedger,
      numberGaps,
    };
  }
}
