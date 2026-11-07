/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopedUser } from '../auth/scoping.service';
import { ScopingService } from '../auth/scoping.service';
import { isPlatformOwner } from '../auth/roles';
import { getEffectivePagesForUser } from '../auth/effective-page-access';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private scopingService: ScopingService,
  ) {}

  async getKpis(user: ScopedUser, rangeParam?: string) {
    const range = rangeParam || '7d';
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    let startDate = new Date(todayStart);
    let endDate = new Date(todayEnd);
    let prevStartDate = new Date(todayStart);
    let prevEndDate = new Date(todayEnd);
    let daysCount = 7;
    let periodLabel = 'Last 7 days';

    switch (range) {
      case 'today':
        daysCount = 1;
        periodLabel = 'Today';
        startDate = new Date(todayStart);
        endDate = new Date(todayEnd);
        prevStartDate = new Date(todayStart);
        prevStartDate.setDate(prevStartDate.getDate() - 1);
        prevEndDate = new Date(todayEnd);
        prevEndDate.setDate(prevEndDate.getDate() - 1);
        break;
      case '30d':
        daysCount = 30;
        periodLabel = 'Last 30 days';
        startDate = new Date(todayStart);
        startDate.setDate(startDate.getDate() - 29);
        endDate = new Date(todayEnd);
        prevStartDate = new Date(startDate);
        prevStartDate.setDate(prevStartDate.getDate() - 30);
        prevEndDate = new Date(startDate);
        prevEndDate.setMilliseconds(-1);
        break;
      case 'month': {
        periodLabel = 'This month';
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        endDate = new Date(todayEnd);
        const dayOfMonth = now.getDate();
        daysCount = dayOfMonth;
        prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
        prevEndDate = new Date(now.getFullYear(), now.getMonth() - 1, dayOfMonth, 23, 59, 59, 999);
        break;
      }
      case '7d':
      default:
        daysCount = 7;
        periodLabel = 'Last 7 days';
        startDate = new Date(todayStart);
        startDate.setDate(startDate.getDate() - 6);
        endDate = new Date(todayEnd);
        prevStartDate = new Date(startDate);
        prevStartDate.setDate(prevStartDate.getDate() - 7);
        prevEndDate = new Date(startDate);
        prevEndDate.setMilliseconds(-1);
        break;
    }

    const leadScope = this.scopingService.getLeadScope(user);
    const orderScope = this.scopingService.getOrderScope(user);

    const platformOwner = isPlatformOwner(user);

    const effectivePages = await getEffectivePagesForUser(this.prisma, user);
    const hasLeads = platformOwner || effectivePages.includes('leads') || effectivePages.includes('lead_flow');
    const hasOrders = platformOwner || effectivePages.includes('orders');
    const hasInventory = platformOwner || effectivePages.includes('inventory');
    const hasSuppliers = platformOwner || effectivePages.includes('suppliers');
    const hasQuotations = platformOwner || effectivePages.includes('quotations');
    const hasInvoices = platformOwner || effectivePages.includes('invoices');
    const hasDailyActivities = platformOwner || effectivePages.includes('daily_activities');

    // ─── Parallelized High-Performance Aggregation ───────────────────────────
    const in7Days = new Date(now);
    in7Days.setDate(in7Days.getDate() + 7);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

    const platformPromise = platformOwner
      ? Promise.all([
          this.prisma.tenant.count({ where: { deletedAt: null } }),
          this.prisma.tenant.count({ where: { status: 'active', deletedAt: null } }),
          this.prisma.user.count({ where: { deletedAt: null } }),
        ]).then(([totalCompanies, activeCompanies, totalUsers]) => ({
          totalCompanies,
          activeCompanies,
          totalUsers,
        }))
      : Promise.resolve(null);

    const tenantPromise = user.tenantId
      ? this.prisma.tenant.findUnique({
          where: { id: user.tenantId },
          select: {
            id: true,
            code: true,
            name: true,
            isOnboarded: true,
            gstin: true,
            pan: true,
            bankAccountNumber: true,
            bankName: true,
            bankIfsc: true,
            stampUrl: true,
            signatureUrl: true,
            address: true,
            city: true,
          },
        })
      : Promise.resolve(null);

    const leadsPromise: Promise<[number, number, any[], number, any[]]> = hasLeads
      ? Promise.all([
          this.prisma.lead.count({
            where: { ...leadScope, createdAt: { gte: startDate, lte: endDate }, deletedAt: null },
          }),
          this.prisma.lead.count({
            where: { ...leadScope, createdAt: { gte: prevStartDate, lte: prevEndDate }, deletedAt: null },
          }),
          this.prisma.lead.findMany({
            where: { ...leadScope, createdAt: { gte: startDate, lte: endDate }, deletedAt: null },
            select: { createdAt: true, source: true, status: true },
          }),
          this.prisma.lead.count({
            where: { ...leadScope, contactId: null, deletedAt: null },
          }),
          this.prisma.leadActivity.findMany({
            where: {
              isCompleted: false,
              scheduledAt: { lte: todayEnd },
              lead: { ...leadScope, deletedAt: null },
            },
            orderBy: { scheduledAt: 'asc' },
            take: 5,
            include: {
              lead: { select: { id: true, customerName: true } },
            },
          }).catch(() => []),
        ])
      : Promise.resolve([0, 0, [], 0, []]);

    const quotationsPromise: Promise<[any[], number]> = (hasQuotations && user.tenantId)
      ? Promise.all([
          this.prisma.quotation.findMany({
            where: {
              tenantId: user.tenantId,
              status: { in: ['draft', 'sent'] },
              deletedAt: null,
            },
            select: { totalAmount: true },
          }),
          this.prisma.quotation.count({
            where: {
              tenantId: user.tenantId,
              status: { in: ['draft', 'sent'] },
              validUntil: { gte: now, lte: in7Days },
              deletedAt: null,
            },
          }),
        ]).catch(() => [[], 0] as [any[], number])
      : Promise.resolve([[], 0] as [any[], number]);

    const ordersPromise: Promise<[number, any[]]> = hasOrders
      ? Promise.all([
          this.prisma.order.count({
            where: {
              ...orderScope,
              status: { in: ['confirmed', 'processing', 'dispatched'] },
              deletedAt: null,
            },
          }),
          this.prisma.order.findMany({
            where: { ...orderScope, deletedAt: null },
            take: 5,
            orderBy: { confirmedAt: 'desc' },
            select: {
              id: true,
              orderNumber: true,
              customerName: true,
              totalAmount: true,
              status: true,
              confirmedAt: true,
            },
          }),
        ]).catch(() => [0, []] as [number, any[]])
      : Promise.resolve([0, []] as [number, any[]]);

    const invoicesPromise: Promise<[any[], number]> = (hasInvoices && user.tenantId)
      ? Promise.all([
          this.prisma.invoice.findMany({
            where: {
              tenantId: user.tenantId,
              docType: { in: ['tax_invoice', 'sez_invoice'] },
              paymentStatus: { in: ['unpaid', 'partially_paid', 'partial', 'overdue'] },
              isVoided: false,
            },
            select: { totalAmount: true, balanceDue: true },
          }),
          this.prisma.invoice.count({
            where: {
              tenantId: user.tenantId,
              docType: { in: ['tax_invoice', 'sez_invoice'] },
              paymentStatus: { in: ['unpaid', 'partially_paid', 'overdue'] },
              isVoided: false,
              dueDate: { lt: todayStart },
            },
          }),
        ]).catch(() => [[], 0] as [any[], number])
      : Promise.resolve([[], 0] as [any[], number]);

    const customerLedgerPromise = user.tenantId
      ? this.prisma.ledgerEntry.findMany({
          where: {
            tenantId: user.tenantId,
            partyType: 'customer',
          },
          select: { partyId: true, debit: true, credit: true },
        }).catch(() => [])
      : Promise.resolve([]);

    const revenuePromise = (hasOrders
      ? this.prisma.order.findMany({
          where: {
            ...orderScope,
            status: { in: ['confirmed', 'processing', 'dispatched', 'delivered'] },
            confirmedAt: { gte: startOfMonth },
            deletedAt: null,
          },
          select: { totalAmount: true },
        })
      : (hasInvoices && user.tenantId)
        ? this.prisma.invoice.findMany({
            where: {
              tenantId: user.tenantId,
              isVoided: false,
              createdAt: { gte: startOfMonth },
            },
            select: { totalAmount: true },
          })
        : Promise.resolve([])
    ).catch(() => []);

    const inventoryPromise = hasInventory
      ? this.prisma.sku.findMany({
          where: { ...this.scopingService.getInventoryScope(user), deletedAt: null },
          select: {
            reorderPoint: true,
            stockItems: {
              select: { quantityOnHand: true },
            },
          },
        }).catch(() => [])
      : Promise.resolve([]);

    // Execute all module database requests in parallel
    const [
      platformMetrics,
      tenantRecord,
      [currentLeadCount, pastLeadCount, periodLeads, noContactCount, followUps],
      [openQuotes, expiringQuotationsCount],
      [ordersInProgressCount, recentOrders],
      [unpaidInvoices, overdueInvoicesCount],
      paidOrdersOrInvoices,
      allSkus,
      customerLedgerRecords,
    ] = await Promise.all([
      platformPromise,
      tenantPromise,
      leadsPromise,
      quotationsPromise,
      ordersPromise,
      invoicesPromise,
      revenuePromise,
      inventoryPromise,
      customerLedgerPromise,
    ]);

    // ─── Process Tenant Profile & Setup Status ─────────────────────────────────
    let clientTenantInfo: {
      id: string;
      code: string;
      name: string;
      isOnboarded: boolean;
      gstin: string | null;
      pan: string | null;
      bankAccountNumber: string | null;
      stampUrl: string | null;
      address: string | null;
      city: string | null;
    } | null = null;

    let setupDoneCount = 0;
    let isSetupComplete = false;

    if (tenantRecord) {
      clientTenantInfo = {
        id: tenantRecord.id,
        code: tenantRecord.code,
        name: tenantRecord.name,
        isOnboarded: tenantRecord.isOnboarded,
        gstin: tenantRecord.gstin,
        pan: tenantRecord.pan,
        bankAccountNumber: tenantRecord.bankAccountNumber,
        stampUrl: tenantRecord.stampUrl,
        address: tenantRecord.address,
        city: tenantRecord.city,
      };

      const checks = [
        Boolean(tenantRecord.name?.trim()),
        Boolean(tenantRecord.gstin?.trim()),
        Boolean(tenantRecord.pan?.trim()),
        Boolean(tenantRecord.bankAccountNumber?.trim() || tenantRecord.bankIfsc?.trim()),
        Boolean(tenantRecord.stampUrl || tenantRecord.signatureUrl),
        Boolean(tenantRecord.address?.trim() || tenantRecord.city?.trim()),
      ];
      setupDoneCount = checks.filter(Boolean).length;
      isSetupComplete = setupDoneCount === 6 && tenantRecord.isOnboarded;
    }

    // ─── Process Leads Metrics & Trend ─────────────────────────────────────────
    const leadCount = currentLeadCount as number;
    const prevLeadCount = pastLeadCount as number;
    const leadsChangePct = prevLeadCount > 0
      ? Math.round(((leadCount - prevLeadCount) / prevLeadCount) * 100)
      : (leadCount > 0 ? 100 : 0);
    const leadsDailyAverage = daysCount > 0 ? (leadCount / daysCount).toFixed(1) : '0.0';
    const leadsWithoutContact = noContactCount as number;

    const sourceSet = new Set<string>();
    (periodLeads as Array<{ createdAt: Date; source: string | null; status: string | null }>).forEach((l) => {
      if (l.source) sourceSet.add(l.source);
    });
    if (sourceSet.size === 0) {
      sourceSet.add('indiamart');
      sourceSet.add('web');
      sourceSet.add('whatsapp');
      sourceSet.add('manual');
    }
    const leadSourcesList = Array.from(sourceSet);

    const trendMap: Record<string, Record<string, number>> = {};
    for (let i = 0; i < daysCount; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      trendMap[key] = { total: 0 };
      leadSourcesList.forEach((src) => {
        trendMap[key][src] = 0;
      });
    }

    (periodLeads as Array<{ createdAt: Date; source: string | null; status: string | null }>).forEach((l) => {
      const key = l.createdAt.toISOString().split('T')[0];
      if (trendMap[key]) {
        const src = l.source || 'manual';
        trendMap[key][src] = (trendMap[key][src] || 0) + 1;
        trendMap[key].total = (trendMap[key].total || 0) + 1;
      }
    });

    const leadTrendList = Object.entries(trendMap).map(([date, counts]) => ({
      date,
      total: counts.total || 0,
      ...counts,
    }));

    const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
      new: { label: 'New', color: '#3B82F6' },
      contacted: { label: 'Contacted', color: '#EAB308' },
      qualified: { label: 'Qualified', color: '#8B5CF6' },
      quoted: { label: 'Quoted', color: '#F59E0B' },
      won: { label: 'Won', color: '#10B981' },
      lost: { label: 'Lost', color: '#EF4444' },
    };

    const stageCounts: Record<string, number> = {
      new: 0,
      contacted: 0,
      qualified: 0,
      quoted: 0,
      won: 0,
      lost: 0,
    };
    (periodLeads as Array<{ createdAt: Date; source: string | null; status: string | null }>).forEach((l) => {
      const st = l.status || 'new';
      if (stageCounts[st] !== undefined) {
        stageCounts[st]++;
      } else {
        stageCounts[st] = 1;
      }
    });

    const totalInStages = Object.values(stageCounts).reduce((a, b) => a + b, 0);
    const pipelineStages = Object.entries(STAGE_CONFIG).map(([stage, cfg]) => {
      const c = stageCounts[stage] || 0;
      return {
        stage,
        label: cfg?.label || (stage.charAt(0).toUpperCase() + stage.slice(1)),
        count: c,
        percent: totalInStages > 0 ? Math.round((c / totalInStages) * 100) : 0,
        color: cfg.color,
      };
    });

    const wonCount = stageCounts.won || 0;
    const closedCount = (stageCounts.won || 0) + (stageCounts.lost || 0);
    const pipelineWinRate = closedCount > 0
      ? Math.round((wonCount / closedCount) * 100)
      : (totalInStages > 0 ? Math.round((wonCount / totalInStages) * 100) : 0);

    const followUpsDueList = (followUps as any[]).map((act) => ({
      id: act.id,
      title: act.title || 'Follow-up call',
      customerName: act.lead?.customerName || 'No customer name',
      scheduledAt: act.scheduledAt ? new Date(act.scheduledAt).toISOString() : new Date().toISOString(),
      isOverdue: act.scheduledAt ? new Date(act.scheduledAt) < todayStart : false,
    }));

    // ─── Process Quotations, Orders, Invoices, Revenue, Low Stock ──────────────
    const openQuotationsCount = (openQuotes as any[]).length;
    const openQuotationsValue = (openQuotes as any[]).reduce((acc: number, q: any) => acc + (q.totalAmount || 0), 0);

    const recentOrdersList = (recentOrders as any[]).map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customerName || 'No customer name',
      totalAmount: o.totalAmount,
      status: o.status,
      confirmedAt: o.confirmedAt ? new Date(o.confirmedAt).toISOString() : new Date().toISOString(),
    }));

    const customerLedgerMap = new Map<string, number>();
    for (const e of (customerLedgerRecords as any[] || [])) {
      const partyKey = (e.partyId || '__unlinked__').trim() || '__unlinked__';
      const cur = customerLedgerMap.get(partyKey) || 0;
      customerLedgerMap.set(partyKey, cur + Number(e.debit) - Number(e.credit));
    }
    let totalCustomerReceivable = 0;
    let totalCustomerAdvances = 0;
    for (const [, bal] of customerLedgerMap) {
      if (bal > 0) {
        totalCustomerReceivable += bal;
      } else if (bal < 0) {
        totalCustomerAdvances += Math.abs(bal);
      }
    }
    totalCustomerReceivable = Number(totalCustomerReceivable.toFixed(2));
    totalCustomerAdvances = Number(totalCustomerAdvances.toFixed(2));

    const unpaidInvoicesAmount = totalCustomerReceivable > 0
      ? totalCustomerReceivable
      : (unpaidInvoices as any[]).reduce((acc: number, inv: any) => {
          const bal = inv.balanceDue != null && inv.balanceDue >= 0 ? Number(inv.balanceDue) : Number(inv.totalAmount || 0);
          return acc + bal;
        }, 0);
    const revenueThisMonth = (paidOrdersOrInvoices as any[]).reduce((sum: number, r: any) => sum + (r.totalAmount || 0), 0);

    const lowStockCount = (allSkus as Array<{ reorderPoint: number; stockItems: Array<{ quantityOnHand: number }> }>).filter((sku) => {
      const totalOnHand = (sku.stockItems || []).reduce((s, si) => s + (si.quantityOnHand || 0), 0);
      return totalOnHand <= sku.reorderPoint;
    }).length;

    // ─── Needs Attention (Max 5 items, only for accessible modules) ───────────
    const needsAttention: Array<{
      id: string;
      type: 'setup' | 'low_stock' | 'expiring_quote' | 'overdue_invoice' | 'unassigned_lead';
      text: string;
      actionLabel: string;
      actionLink: string;
    }> = [];

    const isAdminRole = user.role === 'tenant_admin' || user.role === 'admin' || platformOwner;
    if (isAdminRole && !isSetupComplete && user.tenantId) {
      needsAttention.push({
        id: 'setup',
        type: 'setup',
        text: `Finish your company setup. Add legal name, GSTIN, PAN, bank details and stamp so invoices show your details. (${setupDoneCount} of 6 done)`,
        actionLabel: 'Finish setup',
        actionLink: '/settings/branding',
      });
    }

    if (hasInventory && lowStockCount > 0) {
      needsAttention.push({
        id: 'low_stock',
        type: 'low_stock',
        text: `${lowStockCount} items are below reorder level. Restock or create a purchase bill.`,
        actionLabel: 'Review items',
        actionLink: '/inventory',
      });
    }

    if (hasQuotations && expiringQuotationsCount > 0) {
      needsAttention.push({
        id: 'expiring_quote',
        type: 'expiring_quote',
        text: `${expiringQuotationsCount} ${expiringQuotationsCount === 1 ? 'quotation expires' : 'quotations expire'} this week`,
        actionLabel: 'Open quotes',
        actionLink: '/quotations',
      });
    }

    if (hasInvoices && overdueInvoicesCount > 0) {
      needsAttention.push({
        id: 'overdue_invoice',
        type: 'overdue_invoice',
        text: `${overdueInvoicesCount} ${overdueInvoicesCount === 1 ? 'overdue invoice' : 'overdue invoices'}`,
        actionLabel: 'View invoices',
        actionLink: '/invoices',
      });
    }

    if (hasLeads && leadsWithoutContact > 0) {
      needsAttention.push({
        id: 'unassigned_lead',
        type: 'unassigned_lead',
        text: `${leadsWithoutContact} ${leadsWithoutContact === 1 ? 'lead without a contact' : 'leads without a contact'}`,
        actionLabel: 'Assign contacts',
        actionLink: '/leads',
      });
    }

    // Trim to at most 5 lines
    const finalNeedsAttention = needsAttention.slice(0, 5);

    // ─── Build Final Dashboard Payload ────────────────────────────────────────
    return {
      period: range,
      periodLabel,
      isPlatformOwner: platformOwner,
      platformMetrics,
      clientTenantInfo,
      kpis: {
        leads: hasLeads
          ? {
              count: leadCount,
              changePct: leadsChangePct,
              dailyAverage: leadsDailyAverage,
              trend: leadTrendList.map((d) => d.total as number),
            }
          : null,
        quotations: hasQuotations
          ? {
              openCount: openQuotationsCount,
              openValue: openQuotationsValue,
              expiringThisWeek: expiringQuotationsCount,
            }
          : null,
        orders: hasOrders
          ? {
              inProgressCount: ordersInProgressCount,
            }
          : null,
        invoices: hasInvoices
          ? {
              unpaidAmount: unpaidInvoicesAmount,
              totalReceivable: unpaidInvoicesAmount,
              customerAdvances: totalCustomerAdvances,
              overdueCount: overdueInvoicesCount,
            }
          : null,
        revenue: (hasInvoices || hasOrders)
          ? {
              thisMonth: revenueThisMonth,
            }
          : null,
        inventory: hasInventory
          ? {
              lowStockCount,
            }
          : null,
      },
      needsAttention: finalNeedsAttention,
      leadsChart: hasLeads
        ? {
            total: leadCount,
            dailyAverage: leadsDailyAverage,
            sources: leadSourcesList,
            days: leadTrendList,
          }
        : null,
      pipeline: hasLeads
        ? {
            total: leadCount,
            winRate: pipelineWinRate,
            periodLabel,
            stages: pipelineStages,
          }
        : null,
      recentOrders: hasOrders ? recentOrdersList : null,
      followUpsDue: hasLeads ? followUpsDueList : null,

      // Backward-compatible fields
      leadsToday: {
        total: leadCount,
        breakdown: {},
      },
      pendingFollowUps: followUpsDueList.length,
      ordersInTransit: ordersInProgressCount,
      lowStockSkus: lowStockCount,
      activeSuppliers: 0,
      leadsByStatus: pipelineStages.reduce((acc, st) => {
        acc[st.stage] = st.count;
        return acc;
      }, {} as Record<string, number>),
      leadTrend: leadTrendList,
    };
  }

  async completeActivity(id: string, user: ScopedUser) {
    const leadScope = this.scopingService.getLeadScope(user);
    const activity = await this.prisma.leadActivity.findFirst({
      where: {
        id,
        lead: { ...leadScope, deletedAt: null },
      },
    });

    if (!activity) {
      throw new NotFoundException('Activity not found or not accessible.');
    }

    return this.prisma.leadActivity.update({
      where: { id },
      data: {
        isCompleted: true,
        completedAt: new Date(),
      },
    });
  }

  async getLeadConversionStats(user: ScopedUser) {
    const effectivePages = await getEffectivePagesForUser(this.prisma, user);
    const hasLeads = isPlatformOwner(user) || effectivePages.includes('leads') || effectivePages.includes('lead_flow');
    if (!hasLeads) {
      return {
        totalLeads: 0,
        wonLeads: 0,
        lostLeads: 0,
        conversionRate: '0.0',
      };
    }

    const leadScope = this.scopingService.getLeadScope(user);
    const totalLeads = await this.prisma.lead.count({ where: { ...leadScope, deletedAt: null } });
    const wonLeads = await this.prisma.lead.count({ where: { ...leadScope, status: 'won', deletedAt: null } });
    const lostLeads = await this.prisma.lead.count({ where: { ...leadScope, status: 'lost', deletedAt: null } });

    return {
      totalLeads,
      wonLeads,
      lostLeads,
      conversionRate: totalLeads > 0 ? ((wonLeads / totalLeads) * 100).toFixed(1) : '0.0',
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // REAL-CALCULATION ANALYTICS ENGINE FOR DEDICATED PILLARS
  // ───────────────────────────────────────────────────────────────────────────

  private resolveRange(rangeParam?: string) {
    const range = rangeParam || '7d';
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    let startDate = new Date(todayStart);
    let endDate = new Date(todayEnd);
    let prevStartDate = new Date(todayStart);
    let prevEndDate = new Date(todayEnd);
    let daysCount = 7;
    let periodLabel = 'Last 7 days';

    switch (range) {
      case 'today':
        daysCount = 1;
        periodLabel = 'Today';
        startDate = new Date(todayStart);
        endDate = new Date(todayEnd);
        prevStartDate = new Date(todayStart);
        prevStartDate.setDate(prevStartDate.getDate() - 1);
        prevEndDate = new Date(todayEnd);
        prevEndDate.setDate(prevEndDate.getDate() - 1);
        break;
      case '30d':
        daysCount = 30;
        periodLabel = 'Last 30 days';
        startDate = new Date(todayStart);
        startDate.setDate(startDate.getDate() - 29);
        endDate = new Date(todayEnd);
        prevStartDate = new Date(startDate);
        prevStartDate.setDate(prevStartDate.getDate() - 30);
        prevEndDate = new Date(startDate);
        prevEndDate.setMilliseconds(-1);
        break;
      case 'month': {
        periodLabel = 'This month';
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        endDate = new Date(todayEnd);
        const dayOfMonth = now.getDate();
        daysCount = dayOfMonth;
        prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
        prevEndDate = new Date(now.getFullYear(), now.getMonth() - 1, dayOfMonth, 23, 59, 59, 999);
        break;
      }
      case '7d':
      default:
        daysCount = 7;
        periodLabel = 'Last 7 days';
        startDate = new Date(todayStart);
        startDate.setDate(startDate.getDate() - 6);
        endDate = new Date(todayEnd);
        prevStartDate = new Date(startDate);
        prevStartDate.setDate(prevStartDate.getDate() - 7);
        prevEndDate = new Date(startDate);
        prevEndDate.setMilliseconds(-1);
        break;
    }

    return { range, now, todayStart, todayEnd, startDate, endDate, prevStartDate, prevEndDate, daysCount, periodLabel };
  }

  // ── 1. LEADS ANALYTICS ─────────────────────────────────────────────────────
  async getLeadsAnalytics(user: ScopedUser, rangeParam?: string) {
    const { range, now, startDate, endDate, prevStartDate, prevEndDate, daysCount, periodLabel } = this.resolveRange(rangeParam);
    const leadScope = this.scopingService.getLeadScope(user);

    const [
      totalLeadsAllTime,
      leadsInPeriod,
      prevPeriodCount,
      uncontactedCount,
      leadsList,
    ] = await Promise.all([
      this.prisma.lead.count({ where: { ...leadScope, deletedAt: null } }),
      this.prisma.lead.count({
        where: { ...leadScope, createdAt: { gte: startDate, lte: endDate }, deletedAt: null },
      }),
      this.prisma.lead.count({
        where: { ...leadScope, createdAt: { gte: prevStartDate, lte: prevEndDate }, deletedAt: null },
      }),
      this.prisma.lead.count({
        where: { ...leadScope, status: 'new', deletedAt: null },
      }),
      this.prisma.lead.findMany({
        where: { ...leadScope, createdAt: { gte: startDate, lte: endDate }, deletedAt: null },
        select: {
          id: true,
          leadNumber: true,
          customerName: true,
          customerPhone: true,
          source: true,
          status: true,
          estimatedValue: true,
          createdAt: true,
          lostReason: true,
          assignedTo: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Daily time series
    const dailyMap = new Map<string, number>();
    for (let i = 0; i < daysCount; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      dailyMap.set(key, 0);
    }
    for (const lead of leadsList) {
      const key = new Date(lead.createdAt).toISOString().slice(0, 10);
      if (dailyMap.has(key)) {
        dailyMap.set(key, (dailyMap.get(key) || 0) + 1);
      }
    }
    const trend = Array.from(dailyMap.entries()).map(([date, count]) => ({
      date,
      count,
      label: new Date(date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
    }));

    // Status breakdown
    const statusCounts: Record<string, number> = {
      new: 0,
      contacted: 0,
      qualified: 0,
      quoted: 0,
      won: 0,
      lost: 0,
    };
    const sourceCounts: Record<string, { count: number; value: number }> = {};
    const lostReasons: Record<string, number> = {};

    let totalPipelineValue = 0;
    for (const lead of leadsList) {
      const st = (lead.status || 'new').toLowerCase();
      statusCounts[st] = (statusCounts[st] || 0) + 1;

      const src = (lead.source || 'manual').toLowerCase();
      if (!sourceCounts[src]) sourceCounts[src] = { count: 0, value: 0 };
      sourceCounts[src].count += 1;
      const val = Number(lead.estimatedValue) || 0;
      sourceCounts[src].value += val;
      totalPipelineValue += val;

      if (lead.status === 'lost' && lead.lostReason) {
        lostReasons[lead.lostReason] = (lostReasons[lead.lostReason] || 0) + 1;
      }
    }

    const wonCount = statusCounts.won || 0;
    const qualifiedCount = (statusCounts.qualified || 0) + (statusCounts.quoted || 0) + wonCount;
    const conversionRate = leadsInPeriod > 0 ? ((wonCount / leadsInPeriod) * 100).toFixed(1) : '0.0';
    const qualificationRate = leadsInPeriod > 0 ? ((qualifiedCount / leadsInPeriod) * 100).toFixed(1) : '0.0';
    const dailyAverage = (leadsInPeriod / Math.max(1, daysCount)).toFixed(1);

    const growthPercent = prevPeriodCount > 0
      ? (((leadsInPeriod - prevPeriodCount) / prevPeriodCount) * 100).toFixed(1)
      : (leadsInPeriod > 0 ? '+100.0' : '0.0');

    // Sources formatted list
    const sources = Object.entries(sourceCounts).map(([source, data]) => ({
      source,
      count: data.count,
      value: data.value,
      percentage: leadsInPeriod > 0 ? ((data.count / leadsInPeriod) * 100).toFixed(1) : '0.0',
    })).sort((a, b) => b.count - a.count);

    return {
      period: { range, label: periodLabel, daysCount },
      summary: {
        totalLeadsAllTime,
        leadsInPeriod,
        prevPeriodCount,
        growthPercent: Number(growthPercent) >= 0 ? `+${growthPercent}%` : `${growthPercent}%`,
        dailyAverage,
        uncontactedCount,
        wonCount,
        qualifiedCount,
        conversionRate: `${conversionRate}%`,
        qualificationRate: `${qualificationRate}%`,
        totalPipelineValue,
      },
      statusDistribution: statusCounts,
      sources,
      lostReasons: Object.entries(lostReasons).map(([reason, count]) => ({ reason, count })),
      trend,
      recentLeads: leadsList.slice(0, 10),
    };
  }

  // ── 2. QUOTATIONS ANALYTICS ────────────────────────────────────────────────
  async getQuotesAnalytics(user: ScopedUser, rangeParam?: string) {
    if (!user.tenantId) {
      return { summary: {}, statusBreakdown: {}, expiringSoon: [], recentQuotes: [] };
    }
    const { range, now, startDate, endDate, prevStartDate, prevEndDate, periodLabel } = this.resolveRange(rangeParam);
    const in7Days = new Date(now);
    in7Days.setDate(in7Days.getDate() + 7);

    const [allQuotesInPeriod, activeQuotes, expiringQuotes, recentQuotes] = await Promise.all([
      this.prisma.quotation.findMany({
        where: {
          tenantId: user.tenantId,
          createdAt: { gte: startDate, lte: endDate },
          deletedAt: null,
        },
        select: {
          id: true,
          quoteNumber: true,
          customerName: true,
          status: true,
          totalAmount: true,
          validUntil: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.quotation.findMany({
        where: {
          tenantId: user.tenantId,
          status: { in: ['draft', 'sent'] },
          deletedAt: null,
        },
        select: {
          id: true,
          quoteNumber: true,
          customerName: true,
          status: true,
          totalAmount: true,
          validUntil: true,
        },
      }),
      this.prisma.quotation.findMany({
        where: {
          tenantId: user.tenantId,
          status: { in: ['draft', 'sent'] },
          validUntil: { gte: now, lte: in7Days },
          deletedAt: null,
        },
        select: {
          id: true,
          quoteNumber: true,
          customerName: true,
          customerPhone: true,
          totalAmount: true,
          validUntil: true,
          status: true,
        },
        orderBy: { validUntil: 'asc' },
        take: 10,
      }),
      this.prisma.quotation.findMany({
        where: {
          tenantId: user.tenantId,
          deletedAt: null,
        },
        select: {
          id: true,
          quoteNumber: true,
          customerName: true,
          status: true,
          totalAmount: true,
          validUntil: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const statusCounts: Record<string, { count: number; totalValue: number }> = {
      draft: { count: 0, totalValue: 0 },
      sent: { count: 0, totalValue: 0 },
      approved: { count: 0, totalValue: 0 },
      rejected: { count: 0, totalValue: 0 },
      expired: { count: 0, totalValue: 0 },
    };

    let activePipelineValue = 0;
    let weightedPipelineValue = 0;

    for (const q of activeQuotes) {
      const val = Number(q.totalAmount) || 0;
      activePipelineValue += val;
      const weight = q.status === 'sent' ? 0.5 : 0.2;
      weightedPipelineValue += val * weight;
    }

    for (const q of allQuotesInPeriod) {
      const rawSt = (q.status || 'draft').toLowerCase();
      const st = rawSt === 'accepted' ? 'approved' : rawSt;
      if (!statusCounts[st]) statusCounts[st] = { count: 0, totalValue: 0 };
      statusCounts[st].count += 1;
      statusCounts[st].totalValue += Number(q.totalAmount) || 0;
    }

    const approvedCount = statusCounts.approved?.count || 0;
    const closedCount = approvedCount + (statusCounts.rejected?.count || 0);
    const winRate = closedCount > 0 ? ((approvedCount / closedCount) * 100).toFixed(1) : '0.0';
    const averageDealSize = activeQuotes.length > 0
      ? Math.round(activePipelineValue / activeQuotes.length)
      : (allQuotesInPeriod.length > 0 ? Math.round(statusCounts.approved.totalValue / (statusCounts.approved.count || 1)) : 0);

    return {
      period: { range, label: periodLabel },
      summary: {
        activeQuotesCount: activeQuotes.length,
        activePipelineValue,
        weightedPipelineValue: Math.round(weightedPipelineValue),
        averageDealSize,
        winRate: `${winRate}%`,
        quotesCreatedInPeriod: allQuotesInPeriod.length,
        expiringSoonCount: expiringQuotes.length,
      },
      statusBreakdown: statusCounts,
      expiringSoon: expiringQuotes,
      recentQuotes,
    };
  }

  // ── 3. ORDERS ANALYTICS ───────────────────────────────────────────────────
  async getOrdersAnalytics(user: ScopedUser, rangeParam?: string) {
    const { range, startDate, endDate, periodLabel } = this.resolveRange(rangeParam);
    const orderScope = this.scopingService.getOrderScope(user);

    const [allOrdersInPeriod, activeOrders, recentOrders] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          ...orderScope,
          confirmedAt: { gte: startDate, lte: endDate },
          deletedAt: null,
        },
        include: {
          lines: {
            select: { id: true, quantity: true, unitPrice: true, totalPrice: true, sku: { select: { name: true } } },
          },
        },
        orderBy: { confirmedAt: 'desc' },
      }),
      this.prisma.order.findMany({
        where: {
          ...orderScope,
          status: { in: ['confirmed', 'processing', 'dispatched'] },
          deletedAt: null,
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          paidAmount: true,
          balanceAmount: true,
        },
      }),
      this.prisma.order.findMany({
        where: { ...orderScope, deletedAt: null },
        select: {
          id: true,
          orderNumber: true,
          customerName: true,
          status: true,
          totalAmount: true,
          paidAmount: true,
          balanceAmount: true,
          confirmedAt: true,
        },
        orderBy: { confirmedAt: 'desc' },
        take: 10,
      }),
    ]);

    const statusCounts: Record<string, number> = {
      confirmed: 0,
      processing: 0,
      dispatched: 0,
      delivered: 0,
      cancelled: 0,
    };

    let totalRevenueConfirmed = 0;
    let totalPaidInPeriod = 0;
    const productFrequency: Record<string, { name: string; quantity: number; revenue: number }> = {};

    for (const order of allOrdersInPeriod) {
      const st = (order.status || 'confirmed').toLowerCase();
      statusCounts[st] = (statusCounts[st] || 0) + 1;
      const total = Number(order.totalAmount) || 0;
      totalRevenueConfirmed += total;
      totalPaidInPeriod += Number(order.paidAmount) || 0;

      for (const line of order.lines || []) {
        const prodName = line.sku?.name || 'Custom System';
        if (!productFrequency[prodName]) {
          productFrequency[prodName] = { name: prodName, quantity: 0, revenue: 0 };
        }
        productFrequency[prodName].quantity += line.quantity || 1;
        productFrequency[prodName].revenue += Number(line.totalPrice) || 0;
      }
    }

    const orderCount = allOrdersInPeriod.length;
    const averageOrderValue = orderCount > 0 ? Math.round(totalRevenueConfirmed / orderCount) : 0;
    const advanceCollectionRatio = totalRevenueConfirmed > 0
      ? ((totalPaidInPeriod / totalRevenueConfirmed) * 100).toFixed(1)
      : '0.0';

    const topProducts = Object.values(productFrequency)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return {
      period: { range, label: periodLabel },
      summary: {
        activeOrdersCount: activeOrders.length,
        totalOrdersInPeriod: orderCount,
        totalRevenueConfirmed,
        averageOrderValue,
        advanceCollectionRatio: `${advanceCollectionRatio}%`,
      },
      statusBreakdown: statusCounts,
      topProducts,
      recentOrders,
    };
  }

  // ── 4. RECEIVABLES (AR) ANALYTICS ─────────────────────────────────────────
  async getReceivablesAnalytics(user: ScopedUser) {
    if (!user.tenantId) {
      return { summary: {}, agingBuckets: {}, topDebtors: [], upcomingCollections: [] };
    }
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [unpaidInvoices, billedLast30Days] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          tenantId: user.tenantId,
          docType: { in: ['tax_invoice', 'sez_invoice'] },
          paymentStatus: { in: ['unpaid', 'partially_paid', 'partial', 'overdue'] },
          isVoided: false,
        },
        select: {
          id: true,
          invoiceNumber: true,
          customerName: true,
          customerGstin: true,
          totalAmount: true,
          balanceDue: true,
          invoiceDate: true,
          dueDate: true,
          paymentStatus: true,
        },
      }),
      this.prisma.invoice.findMany({
        where: {
          tenantId: user.tenantId,
          docType: { in: ['tax_invoice', 'sez_invoice'] },
          invoiceDate: { gte: thirtyDaysAgo },
          isVoided: false,
        },
        select: { totalAmount: true },
      }),
    ]);

    let totalReceivable = 0;
    const aging = {
      bucket_0_30: { label: '0–30 Days (Current)', amount: 0, count: 0 },
      bucket_31_60: { label: '31–60 Days', amount: 0, count: 0 },
      bucket_61_90: { label: '61–90 Days', amount: 0, count: 0 },
      bucket_90_plus: { label: '90+ Days (High Risk)', amount: 0, count: 0 },
    };

    const customerMap: Record<string, { customerName: string; totalDue: number; count: number }> = {};
    const upcoming: any[] = [];

    for (const inv of unpaidInvoices) {
      const balance = Number(inv.balanceDue) || 0;
      totalReceivable += balance;

      // Calculate days outstanding from invoiceDate
      const invDate = new Date(inv.invoiceDate || inv.dueDate || now);
      const daysElapsed = Math.max(0, Math.floor((now.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24)));

      if (daysElapsed <= 30) {
        aging.bucket_0_30.amount += balance;
        aging.bucket_0_30.count += 1;
      } else if (daysElapsed <= 60) {
        aging.bucket_31_60.amount += balance;
        aging.bucket_31_60.count += 1;
      } else if (daysElapsed <= 90) {
        aging.bucket_61_90.amount += balance;
        aging.bucket_61_90.count += 1;
      } else {
        aging.bucket_90_plus.amount += balance;
        aging.bucket_90_plus.count += 1;
      }

      // Group by customer
      const custName = inv.customerName || 'Unnamed Customer';
      if (!customerMap[custName]) {
        customerMap[custName] = { customerName: custName, totalDue: 0, count: 0 };
      }
      customerMap[custName].totalDue += balance;
      customerMap[custName].count += 1;

      // Upcoming due check
      if (inv.dueDate && new Date(inv.dueDate) >= todayStart) {
        upcoming.push(inv);
      }
    }

    const totalBilled = billedLast30Days.reduce((acc, i) => acc + (Number(i.totalAmount) || 0), 0);
    const dso = totalBilled > 0 ? Math.round((totalReceivable / totalBilled) * 30) : 45;

    const topDebtors = Object.values(customerMap)
      .sort((a, b) => b.totalDue - a.totalDue)
      .slice(0, 10)
      .map((c) => ({
        ...c,
        percentage: totalReceivable > 0 ? ((c.totalDue / totalReceivable) * 100).toFixed(1) : '0.0',
      }));

    upcoming.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    return {
      summary: {
        totalReceivable,
        unpaidInvoicesCount: unpaidInvoices.length,
        daysSalesOutstanding: dso,
        totalBilledLast30Days: totalBilled,
      },
      agingBuckets: aging,
      topDebtors,
      upcomingCollections: upcoming.slice(0, 8),
    };
  }

  // ── 5. OVERDUE INVOICES & RECOVERY ANALYTICS ────────────────────────────────
  async getOverdueAnalytics(user: ScopedUser) {
    if (!user.tenantId) {
      return { summary: {}, dpdBuckets: {}, priorityRecoveryList: [] };
    }
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        tenantId: user.tenantId,
        docType: { in: ['tax_invoice', 'sez_invoice'] },
        paymentStatus: { in: ['unpaid', 'partially_paid', 'overdue'] },
        dueDate: { lt: todayStart },
        isVoided: false,
      },
      select: {
        id: true,
        invoiceNumber: true,
        customerName: true,
        customerPhone: true,
        totalAmount: true,
        balanceDue: true,
        invoiceDate: true,
        dueDate: true,
        paymentStatus: true,
      },
    });

    let totalOverdue = 0;
    let totalInterestAccrued = 0;

    const dpdBuckets = {
      bracket_1_15: { label: '1–15 Days (Mild)', amount: 0, count: 0 },
      bracket_16_30: { label: '16–30 Days (Moderate)', amount: 0, count: 0 },
      bracket_31_60: { label: '31–60 Days (Severe)', amount: 0, count: 0 },
      bracket_60_plus: { label: '60+ Days (Critical)', amount: 0, count: 0 },
    };

    const recoveryList = overdueInvoices.map((inv) => {
      const balance = Number(inv.balanceDue) || 0;
      totalOverdue += balance;

      const due = new Date(inv.dueDate);
      const dpd = Math.max(1, Math.floor((todayStart.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));

      if (dpd <= 15) {
        dpdBuckets.bracket_1_15.amount += balance;
        dpdBuckets.bracket_1_15.count += 1;
      } else if (dpd <= 30) {
        dpdBuckets.bracket_16_30.amount += balance;
        dpdBuckets.bracket_16_30.count += 1;
      } else if (dpd <= 60) {
        dpdBuckets.bracket_31_60.amount += balance;
        dpdBuckets.bracket_31_60.count += 1;
      } else {
        dpdBuckets.bracket_60_plus.amount += balance;
        dpdBuckets.bracket_60_plus.count += 1;
      }

      // Standard commercial late interest at 18% p.a.
      const interest = Math.round(balance * (0.18 / 365) * dpd);
      totalInterestAccrued += interest;

      return {
        ...inv,
        daysPastDue: dpd,
        accruedInterest: interest,
        totalRecoveryAmount: balance + interest,
        riskScore: dpd > 45 ? 'High' : (dpd > 20 ? 'Medium' : 'Low'),
      };
    });

    recoveryList.sort((a, b) => b.balanceDue - a.balanceDue);

    return {
      summary: {
        totalOverdue,
        overdueCount: overdueInvoices.length,
        totalInterestAccrued,
      },
      dpdBuckets,
      priorityRecoveryList: recoveryList.slice(0, 15),
    };
  }

  // ── 6. ACTIVITY & PERFORMANCE ANALYTICS ────────────────────────────────────
  async getActivityAnalytics(user: ScopedUser, rangeParam?: string) {
    const { range, startDate, endDate, todayEnd, todayStart, periodLabel } = this.resolveRange(rangeParam);
    const leadScope = this.scopingService.getLeadScope(user);

    const [allActivities, overdueActivities] = await Promise.all([
      this.prisma.leadActivity.findMany({
        where: {
          lead: { ...leadScope, deletedAt: null },
          scheduledAt: { gte: startDate, lte: endDate },
        },
        include: {
          lead: { select: { id: true, leadNumber: true, customerName: true, customerPhone: true } },
        },
        orderBy: { scheduledAt: 'desc' },
      }),
      this.prisma.leadActivity.findMany({
        where: {
          isCompleted: false,
          scheduledAt: { lt: todayStart },
          lead: { ...leadScope, deletedAt: null },
        },
        include: {
          lead: { select: { id: true, leadNumber: true, customerName: true, customerPhone: true } },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 10,
      }),
    ]);

    let completedCount = 0;
    const typeDistribution: Record<string, number> = {
      call: 0,
      email: 0,
      meeting: 0,
      follow_up: 0,
      visit: 0,
    };

    for (const act of allActivities) {
      if (act.isCompleted) completedCount += 1;
      const t = (act.type || 'follow_up').toLowerCase();
      typeDistribution[t] = (typeDistribution[t] || 0) + 1;
    }

    const totalScheduled = allActivities.length;
    const adherenceRate = totalScheduled > 0 ? ((completedCount / totalScheduled) * 100).toFixed(1) : '100.0';

    return {
      period: { range, label: periodLabel },
      summary: {
        totalScheduled,
        completedCount,
        pendingCount: totalScheduled - completedCount,
        overdueCount: overdueActivities.length,
        adherenceRate: `${adherenceRate}%`,
      },
      typeDistribution,
      overdueQueue: overdueActivities,
      recentActivities: allActivities.slice(0, 10),
    };
  }
}

