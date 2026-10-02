/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopedUser } from '../auth/scoping.service';
import { ScopingService } from '../auth/scoping.service';
import { isPlatformOwner } from '../auth/roles';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private scopingService: ScopingService,
  ) {}

  async getKpis(user: ScopedUser) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const leadScope = this.scopingService.getLeadScope(user);
    const orderScope = this.scopingService.getOrderScope(user);
    const tenantScope = this.scopingService.getTenantScope(user);

    const platformOwner = isPlatformOwner(user);

    // ─── Platform Multi-Tenant Master Metrics (for Super Admin) ──────────────
    let platformMetrics: {
      totalCompanies: number;
      activeCompanies: number;
      totalUsers: number;
    } | null = null;

    if (platformOwner) {
      const [totalCompanies, activeCompanies, totalUsers] = await Promise.all([
        this.prisma.tenant.count({ where: { deletedAt: null } }),
        this.prisma.tenant.count({ where: { status: 'active', deletedAt: null } }),
        this.prisma.user.count({ where: { deletedAt: null } }),
      ]);
      platformMetrics = { totalCompanies, activeCompanies, totalUsers };
    }

    // ─── Tenant Profile & Onboarding Context (for Client Admins) ──────────────
    let clientTenantInfo: {
      id: string;
      code: string;
      name: string;
      isOnboarded: boolean;
      gstin: string | null;
      city: string | null;
    } | null = null;

    if (user.tenantId) {
      const tenantRecord = await this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { id: true, code: true, name: true, isOnboarded: true, gstin: true, city: true },
      });
      if (tenantRecord) {
        clientTenantInfo = tenantRecord;
      }
    }

    // ─── Leads Today by source ──────────────────────────────────────────────
    const [leadsToday, leadsIndiamart, leadsWeb, leadsWhatsapp, leadsManual] = await Promise.all([
      this.prisma.lead.count({
        where: { ...leadScope, createdAt: { gte: today, lte: todayEnd }, deletedAt: null },
      }),
      this.prisma.lead.count({
        where: { ...leadScope, source: 'indiamart', createdAt: { gte: today, lte: todayEnd }, deletedAt: null },
      }),
      this.prisma.lead.count({
        where: { ...leadScope, source: 'web', createdAt: { gte: today, lte: todayEnd }, deletedAt: null },
      }),
      this.prisma.lead.count({
        where: { ...leadScope, source: 'whatsapp', createdAt: { gte: today, lte: todayEnd }, deletedAt: null },
      }),
      this.prisma.lead.count({
        where: { ...leadScope, source: 'manual', createdAt: { gte: today, lte: todayEnd }, deletedAt: null },
      }),
    ]);

    // ─── Pending Follow-ups (Scoped to user's tenant/accessible leads) ─────────
    const pendingFollowUps = await this.prisma.leadActivity.count({
      where: {
        isCompleted: false,
        type: { in: ['task', 'reminder', 'call'] },
        lead: { ...leadScope, deletedAt: null },
      },
    });

    // ─── Orders in Transit ──────────────────────────────────────────────────
    const ordersInTransit = await this.prisma.order.count({
      where: {
        ...orderScope,
        status: { in: ['confirmed', 'processing', 'dispatched'] },
        deletedAt: null,
      },
    });

    // ─── Low Stock SKUs (Strictly Scoped by Tenant) ──────────────────────────
    const allSkus = await this.prisma.sku.findMany({
      where: { ...tenantScope, deletedAt: null },
      include: { stockItems: true },
    });
    const lowStockCount = allSkus.filter((sku) => {
      const totalOnHand = sku.stockItems.reduce((s, si) => s + si.quantityOnHand, 0);
      return totalOnHand <= sku.reorderPoint;
    }).length;

    // ─── Active Supplier Companies (Strictly Scoped by Tenant) ───────────────
    const activeSuppliersCount = await this.prisma.supplier.count({
      where: { ...tenantScope, isActive: true, deletedAt: null },
    });

    // ─── Total leads in pipeline (by status) ───────────────────────────────
    const leadsByStatus = await this.prisma.lead.groupBy({
      by: ['status'],
      where: { ...leadScope, deletedAt: null },
      _count: true,
    });

    // ─── Lead trend (last 7 days) ───────────────────────────────────────────
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const recentLeads = await this.prisma.lead.findMany({
      where: {
        ...leadScope,
        createdAt: { gte: sevenDaysAgo },
        deletedAt: null,
      },
      select: { createdAt: true, source: true },
    });

    // Aggregate by day
    const leadTrend: Record<string, { date: string; indiamart: number; web: number; whatsapp: number; manual: number; total: number }> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      leadTrend[key] = { date: key, indiamart: 0, web: 0, whatsapp: 0, manual: 0, total: 0 };
    }
    for (const lead of recentLeads) {
      const key = lead.createdAt.toISOString().split('T')[0];
      if (leadTrend[key]) {
        leadTrend[key][lead.source as keyof typeof leadTrend[typeof key]]++;
        leadTrend[key].total++;
      }
    }

    // ─── Recent orders ──────────────────────────────────────────────────────
    const recentOrders = await this.prisma.order.findMany({
      where: { ...orderScope, deletedAt: null },
      take: 5,
      orderBy: { confirmedAt: 'desc' },
      select: {
        id: true, orderNumber: true, customerName: true,
        totalAmount: true, status: true, confirmedAt: true,
      },
    });

    return {
      isPlatformOwner,
      platformMetrics,
      clientTenantInfo,
      leadsToday: {
        total: leadsToday,
        breakdown: {
          indiamart: leadsIndiamart,
          web: leadsWeb,
          whatsapp: leadsWhatsapp,
          manual: leadsManual,
        },
      },
      pendingFollowUps,
      ordersInTransit,
      lowStockSkus: lowStockCount,
      activeSuppliers: activeSuppliersCount,
      leadsByStatus: leadsByStatus.reduce((acc, row) => {
        acc[row.status] = row._count;
        return acc;
      }, {} as Record<string, number>),
      leadTrend: Object.values(leadTrend),
      recentOrders,
    };
  }

  async getLeadConversionStats(user: ScopedUser) {
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
