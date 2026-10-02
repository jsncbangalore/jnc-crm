import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import {
  Users, ShoppingCart, Package, Building2, TrendingUp,
  FileText, Plus, ArrowUpRight, ArrowDownRight, Activity,
  BarChart2, LineChart as LineIcon,
  RefreshCw, AlertTriangle
} from 'lucide-react';
import { dashboardApi } from '../services/api';
import { DashboardKpis } from '../types';
import { KpiCard } from '../components/ui/KpiCard';
import { OrderStatusBadge } from '../components/ui/Badge';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Link } from 'react-router-dom';

const SOURCE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  indiamart: { label: 'IndiaMART', color: '#F97316', icon: '' },
  web:       { label: 'Website',   color: '#2E5EFF', icon: '' },
  whatsapp:  { label: 'WhatsApp',  color: '#10B981', icon: '' },
  manual:    { label: 'Direct / Manual', color: '#8B5CF6', icon: '' },
};

const LEAD_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  new:       { label: 'New Inflow', color: '#3B82F6' },
  contacted: { label: 'Contacted',  color: '#EAB308' },
  qualified: { label: 'Qualified',  color: '#8B5CF6' },
  quoted:    { label: 'Quoted',     color: '#F59E0B' },
  won:       { label: 'Won / Converted', color: '#10B981' },
  lost:      { label: 'Lost',       color: '#EF4444' },
};

type ChartType = 'area' | 'bar' | 'line';
type PieViewMode = 'status' | 'source';

export default function DashboardPage() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Dynamic Time-of-Day Greeting
  const timeGreeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 4 && hour < 12) return 'Good Morning';
    if (hour >= 12 && hour < 17) return 'Good Afternoon';
    if (hour >= 17 && hour < 22) return 'Good Evening';
    return 'Welcome back';
  }, []);

  // Display user's actual added name, fallback to email prefix or JNC role
  const displayName = user?.name?.trim() || (user?.role === 'tenant_admin' ? 'Company Admin' : user?.email?.split('@')[0] || 'Team Member');

  // Feature 1: Chart type selection (Area Wave, Bar Stack, Precision Line)
  const [chartType, setChartType] = useState<ChartType>('area');

  // Feature 2: Active Channel Isolation Filter on Lead Trend
  const [activeChannel, setActiveChannel] = useState<string>('all');

  // Feature 3: Donut View Mode Toggle (Status Funnel vs Lead Acquisition Source)
  const [pieMode, setPieMode] = useState<PieViewMode>('status');

  // Feature 4: Active Pie Hover Index
  const [activePieIndex, setActivePieIndex] = useState<number | null>(null);

  const fetchKpis = async (manual = false) => {
    if (manual) setIsRefreshing(true);
    try {
      const { data } = await dashboardApi.getKpis();
      setKpis(data);
    } catch (err) {
      console.error('Failed to load dashboard KPIs', err);
    } finally {
      setLoading(false);
      if (manual) setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchKpis();
    const interval = setInterval(() => fetchKpis(false), 30_000); // 30s auto-refresh
    return () => clearInterval(interval);
  }, []);

  // Compute Trend Aggregates
  const trendMetrics = useMemo(() => {
    if (!kpis?.leadTrend) return { total: 0, avg: '0.0', peak: 0, peakDate: '' };
    const total = kpis.leadTrend.reduce((sum, item) => sum + (item.total || 0), 0);
    const avg = (total / (kpis.leadTrend.length || 1)).toFixed(1);
    let peak = 0;
    let peakDate = '';
    kpis.leadTrend.forEach((item) => {
      if ((item.total || 0) > peak) {
        peak = item.total;
        peakDate = item.date;
      }
    });
    return { total, avg, peak, peakDate };
  }, [kpis]);

  // Compute Pie Chart Data
  const pieData = useMemo(() => {
    if (!kpis) return [];
    if (pieMode === 'status') {
      return Object.entries(kpis.leadsByStatus || {}).map(([key, value]) => ({
        key,
        name: LEAD_STATUS_CONFIG[key]?.label || key,
        value,
        color: LEAD_STATUS_CONFIG[key]?.color || '#64748B',
      }));
    } else {
      const breakdown = kpis.leadsToday?.breakdown || {};
      return Object.entries(breakdown).map(([key, value]) => ({
        key,
        name: SOURCE_CONFIG[key]?.label || key,
        value: Number(value) || 0,
        color: SOURCE_CONFIG[key]?.color || '#64748B',
      }));
    }
  }, [kpis, pieMode]);

  const totalPieCount = useMemo(() => {
    return pieData.reduce((sum, item) => sum + item.value, 0);
  }, [pieData]);

  const wonLeadsCount = kpis?.leadsByStatus?.won || 0;
  const wonRate = totalPieCount > 0 ? Math.round((wonLeadsCount / totalPieCount) * 100) : 0;

  if (loading || !kpis) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-36 bg-slate-200 dark:bg-[#181B26] rounded-xl border border-slate-300 dark:border-[#2A3042]" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 h-72 bg-slate-200 dark:bg-[#181B26] rounded-xl border border-slate-300 dark:border-[#2A3042]" />
          <div className="h-72 bg-slate-200 dark:bg-[#181B26] rounded-xl border border-slate-300 dark:border-[#2A3042]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── HEADER & QUICK SHORTCUT LAUNCHER ───────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-[#2A3042]">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-black text-slate-950 dark:text-white">Command Dashboard</h1>
            <span className="font-handwriting text-3xl sm:text-4xl font-bold text-crm-blue dark:text-crm-blue-light tracking-wide drop-shadow-sm">
              Welcome, {displayName}
            </span>
          </div>
          <p className="text-slate-700 dark:text-slate-400 text-xs mt-1 flex items-center gap-2 flex-wrap font-medium">
            <span className="inline-flex items-center gap-1 font-bold text-slate-950 dark:text-white bg-slate-100 dark:bg-[#1E2230] px-2 py-0.5 rounded-md border border-slate-200 dark:border-[#2A3042]">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {timeGreeting}, {displayName}!
            </span>
          </p>
        </div>

        {/* Quick Operational Launchers */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to="/leads"
            className="btn bg-crm-blue hover:bg-crm-blue-hover text-white shadow-sm text-xs gap-1.5 font-bold"
          >
            <Plus size={14} /> New Lead
          </Link>
          <Link
            to="/quotations"
            className="btn bg-crm-amber hover:bg-crm-amber-hover text-black shadow-sm text-xs gap-1.5 font-bold"
          >
            <FileText size={14} /> Create Quote
          </Link>
          <Link
            to="/inventory"
            className="btn bg-white dark:bg-[#1E2230] border border-slate-300 dark:border-[#2A3042] text-slate-800 dark:text-white text-xs gap-1.5 font-bold shadow-sm hover:border-crm-violet"
          >
            <Package size={14} className="text-crm-violet" /> Inventory
          </Link>
          <button
            type="button"
            onClick={() => fetchKpis(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-700 dark:text-slate-300 hover:text-crm-blue shadow-sm"
            title="Refresh KPIs Now"
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin text-crm-blue' : ''} />
          </button>
        </div>
      </div>

      {/* ─── PLATFORM OWNER SAAS MULTI-TENANT COMMAND BAR ──────────────────── */}
      {kpis.isPlatformOwner && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-900/90 via-slate-900/95 to-slate-950 text-white border border-indigo-500/30 shadow-lg relative overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-48 h-48 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shrink-0 shadow-inner">
                <Building2 size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-indigo-400 bg-indigo-500/20 px-2 py-0.5 rounded-md border border-indigo-500/30">
                    Master SaaS Platform
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Owner: Jayaraj JNC Master
                  </span>
                </div>
                <h3 className="text-base font-black text-white mt-0.5">
                  Multi-Company Workspace Management Hub
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  {kpis.platformMetrics ? (
                    <span>
                      <strong className="text-white">{kpis.platformMetrics.totalCompanies} Companies Registered</strong> •{' '}
                      <strong className="text-emerald-400">{kpis.platformMetrics.activeCompanies} Active Workspaces</strong> •{' '}
                      <strong className="text-indigo-300">{kpis.platformMetrics.totalUsers} Global User Seats</strong>
                    </span>
                  ) : (
                    'Provision separate CRM instances, manage client workspaces, and oversee permissions.'
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap shrink-0">
              <Link
                to="/platform/companies"
                className="btn bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-md gap-1.5 transition-all"
              >
                <Building2 size={14} /> Manage All Companies
              </Link>
              <Link
                to="/users"
                className="btn bg-white/10 hover:bg-white/15 border border-white/20 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all"
              >
                Global Users
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ─── CLIENT TENANT WELCOME & ONBOARDING ALERT ───────────────────────── */}
      {kpis.clientTenantInfo && (
        <div className={`p-4 rounded-2xl border transition-all ${
          !kpis.clientTenantInfo.isOnboarded || !kpis.clientTenantInfo.gstin
            ? 'bg-amber-500/10 border-amber-500/30 text-slate-900 dark:text-white'
            : 'bg-emerald-500/10 border-emerald-500/30 text-slate-900 dark:text-white'
        }`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                !kpis.clientTenantInfo.isOnboarded || !kpis.clientTenantInfo.gstin
                  ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                  : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
              }`}>
                <Building2 size={20} />
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-950 dark:text-white flex items-center gap-2">
                  <span>{kpis.clientTenantInfo.name}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                    {kpis.clientTenantInfo.code}
                  </span>
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  {!kpis.clientTenantInfo.isOnboarded || !kpis.clientTenantInfo.gstin
                    ? 'Setup incomplete: Please configure your Legal Name, GSTIN, PAN, Bank Details & Invoicing Stamp so printed invoices reflect your company details.'
                    : 'Organization Profile is active. All invoices and quotations are customized with your company branding and tax details.'}
                </p>
              </div>
            </div>

            {(!kpis.clientTenantInfo.isOnboarded || !kpis.clientTenantInfo.gstin) && (
              <Link
                to="/settings/branding"
                className="btn bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-3.5 py-2 rounded-xl shrink-0 gap-1 shadow-sm"
              >
                Complete Company Setup <ArrowUpRight size={13} />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ─── SYSTEM CRITICAL SHORTAGE ALERT (If low stock exists) ───────────── */}
      {kpis.lowStockSkus > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 flex items-center justify-between flex-wrap gap-3 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-800 dark:text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div>
              <p className="text-xs font-black text-slate-950 dark:text-white">
                Low Stock Warning: <span className="text-amber-800 dark:text-amber-400">{kpis.lowStockSkus} Components</span> below reorder threshold
              </p>
              <p className="text-[11px] text-slate-700 dark:text-slate-400 font-medium">
                Prevent project assembly delays by restocking or generating purchase bills.
              </p>
            </div>
          </div>
          <Link
            to="/inventory"
            className="btn bg-amber-600 hover:bg-amber-500 text-white text-xs px-3 py-1.5 font-bold gap-1 shadow-sm"
          >
            Review Shortages <ArrowUpRight size={13} />
          </Link>
        </div>
      )}

      {/* ─── KPI SUMMARY ROW ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <KpiCard
          index={0}
          title="Leads Today"
          value={kpis.leadsToday.total}
          color="blue"
          icon={<Users size={18} />}
          subtitle="across all sources"
          breakdown={[
            { label: 'IndiaMART', value: kpis.leadsToday.breakdown.indiamart, color: 'text-orange-700 dark:text-orange-400 font-bold' },
            { label: 'Website',   value: kpis.leadsToday.breakdown.web,       color: 'text-blue-700 dark:text-crm-blue-light font-bold' },
            { label: 'WhatsApp',  value: kpis.leadsToday.breakdown.whatsapp,  color: 'text-emerald-700 dark:text-crm-whatsapp font-bold' },
            { label: 'Manual',    value: kpis.leadsToday.breakdown.manual,    color: 'text-purple-700 dark:text-purple-300 font-bold' },
          ]}
        />
        <KpiCard
          index={1}
          title="Pending Follow-ups"
          value={kpis.pendingFollowUps}
          color="coral"
          icon={<TrendingUp size={18} />}
          subtitle="tasks awaiting action"
        />
        <KpiCard
          index={2}
          title="Orders in Transit"
          value={kpis.ordersInTransit}
          color="amber"
          icon={<ShoppingCart size={18} />}
          subtitle="confirmed, processing, or dispatched"
        />
        <KpiCard
          index={3}
          title="Low Stock SKUs"
          value={kpis.lowStockSkus}
          color="violet"
          icon={<Package size={18} />}
          subtitle="below reorder point"
        />
        <KpiCard
          index={4}
          title="Active Suppliers"
          value={kpis.activeSuppliers}
          color="teal"
          icon={<Building2 size={18} />}
          subtitle="supplier companies registered"
        />
      </div>

      {/* ─── CHARTS ROW: MULTI-MODE LEAD TREND & PIPELINE DONUT ───────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ─── CHART 1: SUPERCHARGED LEAD TREND GRAPH ──────────────────────── */}
        <div className="lg:col-span-2 card bg-white dark:bg-[#181B26] flex flex-col justify-between shadow-sm">
          {/* Chart Header & Control Toolbar */}
          <div className="card-header border-b border-slate-200 dark:border-[#2A3042] pb-3 mb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-950 dark:text-white">Lead Inflow Trend</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 dark:bg-crm-blue/20 dark:text-crm-blue-light border border-blue-300 dark:border-crm-blue/30">
                    7 Days
                  </span>
                </div>
                {/* Metric Summary Badges */}
                <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-700 dark:text-slate-400 font-medium flex-wrap">
                  <span>Total Inflow: <strong className="text-slate-950 dark:text-white font-bold">{trendMetrics.total}</strong></span>
                  <span>•</span>
                  <span>Daily Avg: <strong className="text-slate-950 dark:text-white font-bold">{trendMetrics.avg}/day</strong></span>
                  {trendMetrics.peak > 0 && (
                    <>
                      <span>•</span>
                      <span>Peak: <strong className="text-emerald-700 dark:text-emerald-400 font-bold">{trendMetrics.peak}</strong> ({format(new Date(trendMetrics.peakDate), 'dd MMM')})</span>
                    </>
                  )}
                </div>
              </div>

              {/* Chart Mode & Style Toggles */}
              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-[#141722] p-1 rounded-xl border border-slate-200 dark:border-[#2A3042]">
                <button
                  type="button"
                  onClick={() => setChartType('area')}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                    chartType === 'area'
                      ? 'bg-crm-blue text-white shadow-sm'
                      : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                  }`}
                  title="Smooth Wave Area Chart"
                >
                  <Activity size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setChartType('bar')}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                    chartType === 'bar'
                      ? 'bg-crm-blue text-white shadow-sm'
                      : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                  }`}
                  title="Stacked Comparison Bars"
                >
                  <BarChart2 size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setChartType('line')}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                    chartType === 'line'
                      ? 'bg-crm-blue text-white shadow-sm'
                      : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                  }`}
                  title="Precision Line Graph"
                >
                  <LineIcon size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Channel Filter Chips */}
          <div className="flex items-center gap-1.5 px-1 pb-3 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveChannel('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                activeChannel === 'all'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent shadow-sm'
                  : 'bg-slate-100 dark:bg-[#1E2230] text-slate-700 dark:text-slate-400 border-slate-200 dark:border-[#2A3042] hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              All Channels
            </button>
            {Object.entries(SOURCE_CONFIG).map(([key, cfg]) => {
              const active = activeChannel === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveChannel(active ? 'all' : key)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1.5 transition-all ${
                    active
                      ? 'shadow-sm text-white'
                      : 'bg-slate-100 dark:bg-[#1E2230] text-slate-700 dark:text-slate-400 border-slate-200 dark:border-[#2A3042] hover:text-slate-950 dark:hover:text-white'
                  }`}
                  style={{
                    backgroundColor: active ? cfg.color : undefined,
                    borderColor: active ? cfg.color : undefined,
                  }}
                >
                  <span>{cfg.icon}</span>
                  <span>{cfg.label}</span>
                </button>
              );
            })}
          </div>

          {/* Render Active Chart */}
          <div className="w-full h-64 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'area' ? (
                <AreaChart data={kpis.leadTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    {Object.entries(SOURCE_CONFIG).map(([key, cfg]) => (
                      <linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={cfg.color} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={cfg.color} stopOpacity={0.0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#2A3042' : '#E2E8F0'} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: isDark ? '#94a3b8' : '#475569', fontSize: 11, fontWeight: 700 }}
                    tickFormatter={(d) => format(new Date(d), 'dd MMM')}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: isDark ? '#94a3b8' : '#475569', fontSize: 11, fontWeight: 700 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: isDark ? '#181B26' : '#FFFFFF',
                      border: isDark ? '1px solid #2A3042' : '1px solid #CBD5E1',
                      borderRadius: 10,
                      color: isDark ? '#E2E8F0' : '#0F172A',
                      fontSize: 12,
                      fontWeight: 600,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.15)'
                    }}
                    labelFormatter={(d) => format(new Date(d), 'EEEE, dd MMMM yyyy')}
                  />
                  {Object.entries(SOURCE_CONFIG)
                    .filter(([key]) => activeChannel === 'all' || activeChannel === key)
                    .map(([key, cfg]) => (
                      <Area
                        key={key}
                        type="monotone"
                        dataKey={key}
                        name={cfg.label}
                        stroke={cfg.color}
                        strokeWidth={2.5}
                        fill={`url(#grad-${key})`}
                        dot={false}
                        activeDot={{ r: 5, fill: cfg.color }}
                      />
                    ))}
                </AreaChart>
              ) : chartType === 'bar' ? (
                <BarChart data={kpis.leadTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#2A3042' : '#E2E8F0'} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: isDark ? '#94a3b8' : '#475569', fontSize: 11, fontWeight: 700 }}
                    tickFormatter={(d) => format(new Date(d), 'dd MMM')}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: isDark ? '#94a3b8' : '#475569', fontSize: 11, fontWeight: 700 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: isDark ? '#181B26' : '#FFFFFF',
                      border: isDark ? '1px solid #2A3042' : '1px solid #CBD5E1',
                      borderRadius: 10,
                      color: isDark ? '#E2E8F0' : '#0F172A',
                      fontSize: 12,
                      fontWeight: 600,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.15)'
                    }}
                    labelFormatter={(d) => format(new Date(d), 'EEEE, dd MMMM yyyy')}
                  />
                  {Object.entries(SOURCE_CONFIG)
                    .filter(([key]) => activeChannel === 'all' || activeChannel === key)
                    .map(([key, cfg]) => (
                      <Bar
                        key={key}
                        dataKey={key}
                        name={cfg.label}
                        fill={cfg.color}
                        radius={[4, 4, 0, 0]}
                        stackId={activeChannel === 'all' ? 'a' : undefined}
                      />
                    ))}
                </BarChart>
              ) : (
                <LineChart data={kpis.leadTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#2A3042' : '#E2E8F0'} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: isDark ? '#94a3b8' : '#475569', fontSize: 11, fontWeight: 700 }}
                    tickFormatter={(d) => format(new Date(d), 'dd MMM')}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: isDark ? '#94a3b8' : '#475569', fontSize: 11, fontWeight: 700 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: isDark ? '#181B26' : '#FFFFFF',
                      border: isDark ? '1px solid #2A3042' : '1px solid #CBD5E1',
                      borderRadius: 10,
                      color: isDark ? '#E2E8F0' : '#0F172A',
                      fontSize: 12,
                      fontWeight: 600,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.15)'
                    }}
                    labelFormatter={(d) => format(new Date(d), 'EEEE, dd MMMM yyyy')}
                  />
                  {Object.entries(SOURCE_CONFIG)
                    .filter(([key]) => activeChannel === 'all' || activeChannel === key)
                    .map(([key, cfg]) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        name={cfg.label}
                        stroke={cfg.color}
                        strokeWidth={3}
                        dot={{ r: 4, strokeWidth: 2, fill: isDark ? '#181B26' : '#FFFFFF' }}
                        activeDot={{ r: 6, fill: cfg.color }}
                      />
                    ))}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* ─── CHART 2: MULTI-VIEW DONUT / PIE CHART ────────────────────────── */}
        <div className="card bg-white dark:bg-[#181B26] flex flex-col justify-between shadow-sm">
          {/* Header & Mode Switcher */}
          <div className="card-header border-b border-slate-200 dark:border-[#2A3042] pb-3 mb-2 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-950 dark:text-white">
                {pieMode === 'status' ? 'Pipeline Funnel' : 'Source Acquisition'}
              </h3>
              <p className="text-xs text-slate-700 dark:text-slate-400 font-medium">
                {pieMode === 'status' ? `Win Rate: ${wonRate}%` : 'Channel breakdown'}
              </p>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#141722] p-0.5 rounded-lg border border-slate-200 dark:border-[#2A3042]">
              <button
                type="button"
                onClick={() => setPieMode('status')}
                className={`px-2 py-1 rounded text-[11px] font-bold transition-all ${
                  pieMode === 'status'
                    ? 'bg-crm-blue text-white shadow-sm'
                    : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                Pipeline
              </button>
              <button
                type="button"
                onClick={() => setPieMode('source')}
                className={`px-2 py-1 rounded text-[11px] font-bold transition-all ${
                  pieMode === 'source'
                    ? 'bg-crm-blue text-white shadow-sm'
                    : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                Sources
              </button>
            </div>
          </div>

          {/* Interactive Donut with Center Conversion Metric */}
          <div className="relative w-full h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={54}
                  outerRadius={78}
                  paddingAngle={3}
                  dataKey="value"
                  onMouseEnter={(_, index) => setActivePieIndex(index)}
                  onMouseLeave={() => setActivePieIndex(null)}
                >
                  {pieData.map((entry, index) => (
                    <Cell
                      key={entry.key}
                      fill={entry.color}
                      opacity={activePieIndex === null || activePieIndex === index ? 1 : 0.4}
                      stroke={isDark ? '#181B26' : '#FFFFFF'}
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: isDark ? '#181B26' : '#FFFFFF',
                    border: isDark ? '1px solid #2A3042' : '1px solid #CBD5E1',
                    borderRadius: 8,
                    color: isDark ? '#E2E8F0' : '#0F172A',
                    fontSize: 12,
                    fontWeight: 700,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                  }}
                  formatter={(val: any, name: any) => [`${val} Leads`, name]}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Center Summary Indicator */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-black text-slate-950 dark:text-white leading-none">
                {totalPieCount}
              </span>
              <span className="text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                {pieMode === 'status' ? 'Total Leads' : 'Inflow Today'}
              </span>
            </div>
          </div>

          {/* Interactive Legend List */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-[#2A3042]/50">
            {pieData.map((entry, idx) => {
              const pct = totalPieCount > 0 ? Math.round((entry.value / totalPieCount) * 100) : 0;
              const isHovered = activePieIndex === idx;
              return (
                <div
                  key={entry.key}
                  onMouseEnter={() => setActivePieIndex(idx)}
                  onMouseLeave={() => setActivePieIndex(null)}
                  className={`flex items-center justify-between text-xs p-1 rounded-lg transition-colors cursor-pointer ${
                    isHovered ? 'bg-slate-100 dark:bg-white/5' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: entry.color }} />
                    <span className="text-slate-800 dark:text-slate-300 font-semibold">{entry.name}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">{pct}%</span>
                    <strong className="text-slate-950 dark:text-white font-bold">{entry.value}</strong>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── RECENT ORDERS TABLE ─────────────────────────────────────────── */}
      <div className="card bg-white dark:bg-[#181B26] shadow-sm">
        <div className="card-header flex items-center justify-between border-b border-slate-200 dark:border-[#2A3042] pb-3 mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-950 dark:text-white">Recent Confirmed Orders</h3>
            <p className="text-xs text-slate-700 dark:text-slate-400 font-medium">Latest commercial orders & delivery progress</p>
          </div>
          <Link to="/orders" className="btn-ghost text-xs text-crm-blue font-bold gap-1 hover:underline">
            View all orders →
          </Link>
        </div>

        <div className="table-wrapper">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Customer / Client</th>
                <th>Total Value</th>
                <th>Order Status</th>
                <th>Confirmed Date</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {kpis.recentOrders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                  <td className="font-mono text-xs font-bold text-blue-700 dark:text-crm-blue-light">{order.orderNumber}</td>
                  <td className="font-bold text-slate-950 dark:text-white">{order.customerName}</td>
                  <td className="font-mono font-black text-amber-700 dark:text-crm-amber">
                    ₹{order.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                  </td>
                  <td><OrderStatusBadge status={order.status} /></td>
                  <td className="text-slate-700 dark:text-slate-400 text-xs font-mono font-bold">
                    {format(new Date(order.confirmedAt), 'dd MMM yyyy')}
                  </td>
                  <td className="text-right">
                    <Link
                      to="/orders"
                      className="btn-ghost text-[11px] py-1 px-2.5 border border-slate-300 dark:border-white/10 text-slate-800 dark:text-slate-200 hover:text-slate-950 font-bold"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
              {kpis.recentOrders.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-slate-600 dark:text-slate-400 py-10 font-bold">
                    No confirmed orders yet. Convert quotations or add orders in the Orders tab.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
