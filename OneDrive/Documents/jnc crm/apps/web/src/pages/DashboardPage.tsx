/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Plus,
  FileText,
  Package,
  RefreshCw,
  Table as TableIcon,
  BarChart2,
  ChevronDown,
  Check,
} from 'lucide-react';
import { dashboardApi } from '../services/api';
import { DashboardKpis } from '../types';
import { OrderStatusBadge } from '../components/ui/Badge';
import { ErrorStateCard, parseApiError } from '../components/common/ErrorStateCard';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useBranding } from '../contexts/BrandingContext';
import { getProductName } from '../config/brand';
import CreateLeadModal from '../components/leads/CreateLeadModal';
import CreateQuotationModal from '../components/quotations/CreateQuotationModal';
import CreateItemModal from '../components/inventory/CreateItemModal';

// ── Known Source Palette ──────────────────────────────────────────────────────
const KNOWN_SOURCE_COLORS: Record<string, { label: string; color: string }> = {
  indiamart: { label: 'IndiaMART', color: '#F97316' },
  web: { label: 'Website', color: '#2563EB' },
  website: { label: 'Website', color: '#2563EB' },
  whatsapp: { label: 'WhatsApp', color: '#10B981' },
  manual: { label: 'Manual', color: '#6366F1' },
  facebook: { label: 'Facebook', color: '#EC4899' },
  instagram: { label: 'Instagram', color: '#8B5CF6' },
  lead_ads: { label: 'Lead Ads', color: '#06B6D4' },
};

const EXTRA_PALETTE = ['#0EA5E9', '#14B8A6', '#F59E0B', '#64748B', '#A855F7', '#D946EF'];

function getSourceMeta(src: string, index: number) {
  const lower = src.toLowerCase().trim();
  if (KNOWN_SOURCE_COLORS[lower]) {
    return KNOWN_SOURCE_COLORS[lower];
  }
  const color = EXTRA_PALETTE[index % EXTRA_PALETTE.length];
  const label = src.charAt(0).toUpperCase() + src.slice(1);
  return { label, color };
}

// ── Indian Currency Formatting Helpers ────────────────────────────────────────
function formatIndianAbbreviated(val: number): string {
  if (val == null || isNaN(val)) return '0';
  const abs = Math.abs(val);
  if (abs >= 10000000) {
    return (val / 10000000).toFixed(1).replace(/\.0$/, '') + 'Cr';
  }
  if (abs >= 100000) {
    return (val / 100000).toFixed(1).replace(/\.0$/, '') + 'L';
  }
  if (abs >= 1000) {
    return (val / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return val.toLocaleString('en-IN');
}

function formatIndianRupeesFull(val: number): string {
  if (val == null || isNaN(val)) return '₹0';
  return '₹' + Math.round(val).toLocaleString('en-IN');
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const { branding } = useBranding();
  const companyName = branding.companyDisplayName || getProductName();

  // ── Global Filter & State (with Stale-While-Revalidate Instant Loading) ─────
  const [dateRange, setDateRange] = useState<'today' | '7d' | '30d' | 'month'>('7d');
  const [kpis, setKpis] = useState<DashboardKpis | null>(() => {
    try {
      const cached = sessionStorage.getItem('crm_kpis_cache_7d');
      if (cached) return JSON.parse(cached);
    } catch {}
    return null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    try {
      return !sessionStorage.getItem('crm_kpis_cache_7d');
    } catch {
      return true;
    }
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [error, setError] = useState<{ status?: number; message: string; isNetworkError: boolean } | null>(null);

  const handleDateRangeChange = (newRange: 'today' | '7d' | '30d' | 'month') => {
    setDateRange(newRange);
    try {
      const cached = sessionStorage.getItem(`crm_kpis_cache_${newRange}`);
      if (cached) {
        setKpis(JSON.parse(cached));
      }
    } catch {}
  };

  // ── In-Page Creation Modals ─────────────────────────────────────────────────
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; linkText: string; linkTo: string } | null>(null);

  const newLeadBtnRef = useRef<HTMLButtonElement | null>(null);
  const createQuoteBtnRef = useRef<HTMLButtonElement | null>(null);
  const addItemBtnRef = useRef<HTMLButtonElement | null>(null);

  // ── Chart Interactive Features ──────────────────────────────────────────────
  const [hiddenSources, setHiddenSources] = useState<Set<string>>(new Set());
  const [showTableView, setShowTableView] = useState(false);

  // ── Role & Page Access Verification ─────────────────────────────────────────
  const hasPage = useCallback(
    (key: string): boolean => {
      if (kpis?.isPlatformOwner) return true;
      if (!user) return false;
      if (user.role === 'tenant_admin' || user.role === 'platform_super_admin') return true;
      if (!user.effectivePages || user.effectivePages.length === 0) return true;
      return user.effectivePages.includes(key);
    },
    [kpis?.isPlatformOwner, user]
  );

  // ── Data Fetching ───────────────────────────────────────────────────────────
  const fetchKpis = useCallback(
    async (manual = false) => {
      if (manual) setIsRefreshing(true);
      try {
        const { data } = await dashboardApi.getKpis(dateRange);
        setKpis(data);
        setError(null);
        setLastUpdated(new Date());
        try {
          sessionStorage.setItem(`crm_kpis_cache_${dateRange}`, JSON.stringify(data));
        } catch {}
      } catch (err: any) {
        setError(parseApiError(err));
      } finally {
        setLoading(false);
        if (manual) setIsRefreshing(false);
      }
    },
    [dateRange]
  );

  useEffect(() => {
    fetchKpis(false);
  }, [fetchKpis]);

  // Refresh every 60 seconds only while the tab is visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchKpis(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchKpis(false);
      }
    }, 60_000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(interval);
    };
  }, [fetchKpis]);

  // Dynamic Time Greeting & Display Name
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const firstName = user?.name ? user.name.trim().split(' ')[0] : 'there';
    return `${timeGreeting}, ${firstName}`;
  }, [user?.name]);

  // Relative Time Display ("Updated just now", "Updated 2 min ago")
  const updatedTimeString = useMemo(() => {
    const diffSec = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (diffSec < 60) return 'Updated just now';
    const mins = Math.floor(diffSec / 60);
    return `Updated ${mins} min ago`;
  }, [lastUpdated, isRefreshing]);

  // Mark Follow-Up Complete
  const handleCompleteActivity = async (id: string) => {
    try {
      await dashboardApi.completeActivity(id);
      fetchKpis(false);
    } catch {
      // ignore
    }
  };

  // Toggle Source Filter in Stacked Bars
  const toggleSource = (src: string) => {
    setHiddenSources((prev) => {
      const next = new Set(prev);
      if (next.has(src)) next.delete(src);
      else next.add(src);
      return next;
    });
  };

  // ── Loading Skeleton ────────────────────────────────────────────────────────
  if (loading && !kpis && !error) {
    return (
      <div className="max-w-[1440px] mx-auto space-y-6 animate-pulse" data-testid="dashboard-loading">
        <div className="h-10 w-48 bg-slate-200 dark:bg-slate-800 rounded-lg" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-72 bg-slate-200 dark:bg-slate-800 rounded-[12px]" />
          <div className="h-72 bg-slate-200 dark:bg-slate-800 rounded-[12px]" />
        </div>
      </div>
    );
  }

  // ── Error State with Clear Retry ────────────────────────────────────────────
  if (error && !kpis) {
    return (
      <div className="max-w-[1440px] mx-auto space-y-6" data-testid="dashboard-error">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] font-semibold text-slate-900 dark:text-white">Dashboard</h1>
        </div>
        <ErrorStateCard
          message={error.message}
          status={error.status}
          isNetworkError={error.isNetworkError}
          onRetry={() => fetchKpis(true)}
        />
      </div>
    );
  }

  const kpisData = kpis?.kpis;
  const leadsChartData = kpis?.leadsChart;
  const pipelineData = kpis?.pipeline;
  const recentOrdersList = kpis?.recentOrders || [];
  const followUpsDueList = kpis?.followUpsDue || [];

  return (
    <div className="max-w-[1440px] mx-auto space-y-6 text-slate-900 dark:text-slate-100" data-testid="dashboard-container">
      {/* ── 1. PAGE HEADER ─────────────────────────────────────────────────── */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-[28px] font-semibold text-slate-900 dark:text-white leading-tight">
            Dashboard
          </h1>
          <p className="text-[14px] text-slate-600 dark:text-slate-400 mt-1">
            {greeting}
          </p>
        </div>

        {/* Global Controls & Quick Actions */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Global Date Range Select */}
          <div className="relative">
            <label htmlFor="dashboard-date-range" className="sr-only">Date range</label>
            <select
              id="dashboard-date-range"
              value={dateRange}
              onChange={(e) => handleDateRangeChange(e.target.value as any)}
              className="h-9 pl-3 pr-8 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 cursor-pointer appearance-none shadow-xs"
            >
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="month">This month</option>
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-2.5 text-slate-400 pointer-events-none" />
          </div>

          {/* New Lead (Filled Blue) */}
          {hasPage('leads') && (
            <button
              ref={newLeadBtnRef}
              type="button"
              onClick={() => setLeadModalOpen(true)}
              className="h-9 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-sm flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            >
              <Plus size={15} />
              <span>New lead</span>
            </button>
          )}

          {/* Create Quote (Outlined) */}
          {hasPage('quotations') && (
            <button
              ref={createQuoteBtnRef}
              type="button"
              onClick={() => setQuoteModalOpen(true)}
              className="h-9 px-3.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium text-sm flex items-center gap-1.5 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            >
              <FileText size={15} className="text-slate-500" />
              <span>Create quote</span>
            </button>
          )}

          {/* Add Item (Outlined) */}
          {hasPage('inventory') && (
            <button
              ref={addItemBtnRef}
              type="button"
              onClick={() => setItemModalOpen(true)}
              className="h-9 px-3.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium text-sm flex items-center gap-1.5 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            >
              <Package size={15} className="text-slate-500" />
              <span>Add item</span>
            </button>
          )}

          {/* Refresh Icon Button with Time Text */}
          <button
            type="button"
            onClick={() => fetchKpis(true)}
            className="h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2 cursor-pointer shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            title="Refresh dashboard"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin text-blue-600' : ''} />
            <span className="text-xs font-medium">{updatedTimeString}</span>
          </button>
        </div>
      </header>

      {/* ── 4 & 5. CHARTS ROW: NEW LEADS (2/3) & PIPELINE (1/3) ────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 4. NEW LEADS CHART (2/3 width) */}
        <section aria-label="New Leads Graph" className="lg:col-span-2 rounded-[12px] p-5 sm:p-6 bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white">
                New leads
              </h2>
              {leadsChartData && (
                <p className="text-[14px] text-slate-600 dark:text-slate-400 mt-0.5">
                  <strong className="font-semibold text-slate-900 dark:text-white">{leadsChartData.total}</strong> new leads in the selected period &bull; Daily average: <strong className="font-semibold text-slate-900 dark:text-white">{leadsChartData.dailyAverage}/day</strong>
                </p>
              )}
            </div>

            {/* Accessibility View Toggle */}
            <button
              type="button"
              onClick={() => setShowTableView(!showTableView)}
              className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs font-medium flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
              title="Toggle accessible table view"
            >
              {showTableView ? <BarChart2 size={13} /> : <TableIcon size={13} />}
              <span>{showTableView ? 'Chart view' : 'Table view'}</span>
            </button>
          </div>

          {/* Dynamic Toggleable Chips */}
          {leadsChartData && leadsChartData.sources.length > 0 && !showTableView && leadsChartData.total > 0 && (
            <div className="flex items-center gap-2 pt-3 pb-1 flex-wrap">
              {leadsChartData.sources.map((src, idx) => {
                const meta = getSourceMeta(src, idx);
                const isHidden = hiddenSources.has(src);
                return (
                  <button
                    key={src}
                    type="button"
                    onClick={() => toggleSource(src)}
                    className={`h-7 px-2.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer border ${
                      isHidden
                        ? 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-400 opacity-60'
                        : 'border-transparent text-white shadow-xs'
                    }`}
                    style={{
                      backgroundColor: isHidden ? undefined : meta.color,
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                    <span>{meta.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Main Chart Body or Empty State */}
          <div className="w-full min-h-[260px] pt-3 flex flex-col justify-center">
            {leadsChartData && leadsChartData.total === 0 ? (
              <div className="py-12 text-center space-y-3">
                <p className="text-[14px] text-slate-600 dark:text-slate-400 font-medium">
                  No leads received in this period.
                </p>
                <div className="flex items-center justify-center gap-3">
                  {hasPage('leads') && (
                    <button
                      type="button"
                      onClick={() => setLeadModalOpen(true)}
                      className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
                    >
                      Add lead
                    </button>
                  )}
                  <Link
                    to="/leads"
                    className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer"
                  >
                    Connect a lead source
                  </Link>
                </div>
              </div>
            ) : showTableView ? (
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th className="py-2 pr-4 font-semibold">Date</th>
                      <th className="py-2 pr-4 font-semibold">Total</th>
                      {leadsChartData?.sources.map((s, idx) => (
                        <th key={s} className="py-2 pr-4 font-semibold">{getSourceMeta(s, idx).label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-xs">
                    {leadsChartData?.days.map((row) => (
                      <tr key={row.date}>
                        <td className="py-2 pr-4 font-sans text-slate-700 dark:text-slate-300">{row.date}</td>
                        <td className="py-2 pr-4 font-bold text-slate-900 dark:text-white">{row.total}</td>
                        {leadsChartData.sources.map((s) => (
                          <td key={s} className="py-2 pr-4 text-slate-600 dark:text-slate-400">
                            {row[s] || 0}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={leadsChartData?.days} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1E293B' : '#F1F5F9'} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: isDark ? '#94A3B8' : '#64748B', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: isDark ? '#94A3B8' : '#64748B', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: isDark ? '#0F172A' : '#FFFFFF',
                      border: isDark ? '1px solid #1E293B' : '1px solid #E2E8F0',
                      borderRadius: 8,
                      fontSize: 12,
                      color: isDark ? '#F8FAFC' : '#0F172A',
                    }}
                  />
                  {leadsChartData?.sources.map((src, idx) => {
                    if (hiddenSources.has(src)) return null;
                    const meta = getSourceMeta(src, idx);
                    return (
                      <Bar
                        key={src}
                        dataKey={src}
                        name={meta.label}
                        fill={meta.color}
                        stackId="leadsStack"
                        radius={[2, 2, 0, 0]}
                      />
                    );
                  })}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* 5. PIPELINE (1/3 width) */}
        <section aria-label="Sales Pipeline" className="rounded-[12px] p-5 sm:p-6 bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white">
                  Pipeline
                </h2>
                <p className="text-[14px] text-slate-600 dark:text-slate-400 mt-0.5">
                  Win rate: <strong className="font-semibold text-emerald-600 dark:text-emerald-400">{pipelineData?.winRate || 0}%</strong> &bull; {pipelineData?.periodLabel || 'Selected period'}
                </p>
              </div>
            </div>

            {/* Stage Bars */}
            <div className="space-y-3.5 pt-4">
              {pipelineData?.stages.map((st) => (
                <div key={st.stage} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{st.label}</span>
                    <span className="font-mono text-slate-500 dark:text-slate-400">
                      <strong className="font-bold text-slate-900 dark:text-white">{st.count}</strong> ({st.percent}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.max(st.percent, st.count > 0 ? 4 : 0)}%`,
                        backgroundColor: st.color,
                      }}
                    />
                  </div>
                </div>
              ))}
              {(!pipelineData || pipelineData.stages.length === 0) && (
                <p className="text-center text-xs text-slate-500 py-8">
                  No active pipeline data in this period.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* ── 6. BOTTOM ROW: RECENT ORDERS & FOLLOW-UPS DUE ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent orders */}
        {hasPage('orders') && (
          <section aria-label="Recent Orders" className="rounded-[12px] p-5 sm:p-6 bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
                <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white">
                  Recent orders
                </h2>
                <Link to="/orders" className="text-[13px] font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                  View all &rarr;
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-[12px] text-slate-500 dark:text-slate-400">
                      <th className="py-2 pr-3 font-semibold">Order</th>
                      <th className="py-2 pr-3 font-semibold">Customer</th>
                      <th className="py-2 pr-3 font-semibold">Value</th>
                      <th className="py-2 pr-3 font-semibold">Status</th>
                      <th className="py-2 pr-3 font-semibold">Date</th>
                      <th className="py-2 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {recentOrdersList.map((order) => (
                      <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 pr-3 font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                          {order.orderNumber}
                        </td>
                        <td className="py-2.5 pr-3 font-medium text-slate-900 dark:text-white text-xs truncate max-w-[140px]">
                          {order.customerName || 'No customer name'}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-white">
                          {formatIndianRupeesFull(order.totalAmount)}
                        </td>
                        <td className="py-2.5 pr-3">
                          <OrderStatusBadge status={order.status} />
                        </td>
                        <td className="py-2.5 pr-3 text-xs text-slate-500 font-mono">
                          {new Date(order.confirmedAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="py-2.5 text-right">
                          <Link
                            to="/orders"
                            className="text-[12px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {recentOrdersList.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-xs text-slate-500">
                          No recent orders in this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* Follow-ups due */}
        {hasPage('leads') && (
          <section aria-label="Follow-ups Due" className="rounded-[12px] p-5 sm:p-6 bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
                <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white">
                  Follow-ups due
                </h2>
                <Link to="/leads" className="text-[13px] font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                  View all &rarr;
                </Link>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {followUpsDueList.map((item) => (
                  <div key={item.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {item.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                        <span>{item.customerName || 'No customer name'}</span>
                        <span>&bull;</span>
                        <span className={item.isOverdue ? 'text-rose-600 font-semibold' : 'text-slate-500'}>
                          {item.isOverdue ? 'Overdue' : 'Due today'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCompleteActivity(item.id)}
                      className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Mark follow-up done"
                    >
                      <Check size={12} />
                      <span>Done</span>
                    </button>
                  </div>
                ))}
                {followUpsDueList.length === 0 && (
                  <p className="text-center py-8 text-xs text-slate-500">
                    No follow-ups due. You're all caught up.
                  </p>
                )}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* ── TOAST NOTIFICATION ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xl border border-slate-800 dark:border-slate-200"
          >
            <span className="text-xs font-medium">{toast.message}</span>
            <Link
              to={toast.linkTo}
              className="text-xs font-bold text-blue-400 dark:text-blue-600 underline hover:opacity-80"
              onClick={() => setToast(null)}
            >
              {toast.linkText}
            </Link>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="p-1 rounded-md hover:bg-white/10 dark:hover:bg-black/10 text-slate-400"
            >
              &times;
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── IN-PAGE QUICK CREATE FORMS ─────────────────────────────────────── */}
      <CreateLeadModal
        isOpen={leadModalOpen}
        onClose={() => setLeadModalOpen(false)}
        onSuccess={() => {
          fetchKpis(false);
          setToast({
            message: 'Lead created successfully.',
            linkText: 'View leads',
            linkTo: '/leads',
          });
        }}
        triggerRef={newLeadBtnRef}
      />

      <CreateQuotationModal
        isOpen={quoteModalOpen}
        onClose={() => setQuoteModalOpen(false)}
        onSuccess={() => {
          fetchKpis(false);
          setToast({
            message: 'Quotation created successfully.',
            linkText: 'View quotations',
            linkTo: '/quotations',
          });
        }}
        triggerRef={createQuoteBtnRef}
      />

      <CreateItemModal
        isOpen={itemModalOpen}
        onClose={() => setItemModalOpen(false)}
        onSuccess={() => {
          fetchKpis(false);
          setToast({
            message: 'Item created successfully.',
            linkText: 'View inventory',
            linkTo: '/inventory',
          });
        }}
        triggerRef={addItemBtnRef}
      />
    </div>
  );
}
