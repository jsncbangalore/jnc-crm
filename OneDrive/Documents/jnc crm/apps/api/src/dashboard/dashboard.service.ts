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
              paymentStatus: { in: ['unpaid', 'partially_paid', 'overdue'] },
              isVoided: false,
            },
            select: { totalAmount: true },
          }),
          this.prisma.invoice.count({
            where: {
              tenantId: user.tenantId,
              paymentStatus: { in: ['unpaid', 'partially_paid', 'overdue'] },
              isVoided: false,
              dueDate: { lt: todayStart },
            },
          }),
        ]).catch(() => [[], 0] as [any[], number])
      : Promise.resolve([[], 0] as [any[], number]);

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
    ] = await Promise.all([
      platformPromise,
      tenantPromise,
      leadsPromise,
      quotationsPromise,
      ordersPromise,
      invoicesPromise,
      revenuePromise,
      inventoryPromise,
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
        label: cfg.label,
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

    const unpaidInvoicesAmount = (unpaidInvoices as any[]).reduce((acc: number, inv: any) => acc + (inv.totalAmount || 0), 0);
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
}
