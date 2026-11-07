import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  TrendingUp,
  Target,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowUpRight,
  Filter,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import AnalyticsHeader from './AnalyticsHeader';
import { dashboardApi } from '../../services/api';

const SOURCE_COLORS: Record<string, string> = {
  indiamart: '#F97316',
  whatsapp: '#10B981',
  web: '#2563EB',
  website: '#2563EB',
  manual: '#6366F1',
  facebook: '#EC4899',
  instagram: '#8B5CF6',
};

function formatRupees(val: number) {
  if (val >= 10000000) return '₹' + (val / 10000000).toFixed(2) + ' Cr';
  if (val >= 100000) return '₹' + (val / 100000).toFixed(2) + ' L';
  return '₹' + Math.round(val).toLocaleString('en-IN');
}

export default function LeadsAnalyticsPage() {
  const [range, setRange] = useState<'today' | '7d' | '30d' | 'month'>('7d');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchAnalytics = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setLoading(true);
    try {
      const res = await dashboardApi.getLeadsAnalytics(range);
      setData(res.data);
    } catch (err) {
      console.error('Failed to load leads analytics', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [range]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const summary = data?.summary || {};
  const statusDist = data?.statusDistribution || {};
  const sources = data?.sources || [];
  const trend = data?.trend || [];
  const lostReasons = data?.lostReasons || [];
  const recentLeads = data?.recentLeads || [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <AnalyticsHeader
        title="Total Leads Analytics"
        subtitle="Real-time lead acquisition velocity, source attribution, conversion rates, and pipeline quality"
        icon={<Users size={22} />}
        badge={data?.period?.label}
        range={range}
        onRangeChange={setRange}
        onRefresh={() => fetchAnalytics(true)}
        isRefreshing={isRefreshing}
        viewAllLink={{ to: '/leads', label: 'View Leads Table' }}
      />

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Computing lead analytics & attribution...</p>
        </div>
      ) : (
        <>
          {/* 1. Core KPIs Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Leads Ingested</span>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded">
                  {summary.growthPercent}
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-slate-900 dark:text-white">
                  {summary.leadsInPeriod ?? 0}
                </span>
                <span className="text-xs text-slate-500">leads in period</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Velocity: <strong className="text-slate-700 dark:text-slate-300">{summary.dailyAverage}/day avg</strong>
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Win Conversion</span>
                <CheckCircle2 size={15} className="text-emerald-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                  {summary.conversionRate}
                </span>
                <span className="text-xs text-slate-500">won leads</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                <strong className="text-slate-700 dark:text-slate-300">{summary.wonCount}</strong> closed won deals
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Qualification Rate</span>
                <Target size={15} className="text-blue-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-blue-600 dark:text-blue-400">
                  {summary.qualificationRate}
                </span>
                <span className="text-xs text-slate-500">qualified</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                <strong className="text-slate-700 dark:text-slate-300">{summary.qualifiedCount}</strong> advanced to quote/win
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Pipeline Est. Value</span>
                <TrendingUp size={15} className="text-indigo-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-slate-900 dark:text-white truncate">
                  {formatRupees(summary.totalPipelineValue || 0)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                <strong className="text-slate-700 dark:text-slate-300">{summary.uncontactedCount}</strong> new uncontacted leads
              </p>
            </div>
          </div>

          {/* 2. Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Daily Acquisition Velocity Trend */}
            <div className="lg:col-span-2 p-5 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Lead Acquisition Velocity</h2>
                <p className="text-xs text-slate-500">Daily number of captured inquiries across all integrated channels</p>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="leadVelocityGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.5} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1E293B',
                        borderColor: '#334155',
                        borderRadius: '8px',
                        color: '#F8FAFC',
                        fontSize: '12px',
                      }}
                    />
                    <Area type="monotone" dataKey="count" name="New Leads" stroke="#2563EB" strokeWidth={2.5} fill="url(#leadVelocityGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Stage Conversion Funnel */}
            <div className="p-5 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Funnel Stage Distribution</h2>
                <p className="text-xs text-slate-500">Progression from discovery to deal conversion</p>
              </div>

              <div className="space-y-3 pt-2">
                {[
                  { stage: 'New', count: statusDist.new || 0, color: 'bg-blue-500' },
                  { stage: 'Contacted', count: statusDist.contacted || 0, color: 'bg-indigo-500' },
                  { stage: 'Qualified', count: statusDist.qualified || 0, color: 'bg-purple-500' },
                  { stage: 'Quoted', count: statusDist.quoted || 0, color: 'bg-amber-500' },
                  { stage: 'Won', count: statusDist.won || 0, color: 'bg-emerald-500' },
                  { stage: 'Lost', count: statusDist.lost || 0, color: 'bg-rose-500' },
                ].map((s) => {
                  const pct = summary.leadsInPeriod > 0 ? ((s.count / summary.leadsInPeriod) * 100).toFixed(0) : 0;
                  return (
                    <div key={s.stage} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{s.stage}</span>
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          {s.count} <span className="text-[10px] text-slate-500 font-normal">({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full ${s.color} rounded-full transition-all`} style={{ width: `${Math.min(100, Number(pct))}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 3. Source Attribution & Lost Reason Analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Source Attribution Breakdown */}
            <div className="p-5 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">Channel & Source Attribution</h2>
                  <p className="text-xs text-slate-500">Leads captured and estimated value by ingestion platform</p>
                </div>
                <span className="text-xs font-bold text-slate-500">{sources.length} Channels</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider text-[10px]">
                      <th className="py-2 px-3">Source Channel</th>
                      <th className="py-2 px-3 text-right">Leads</th>
                      <th className="py-2 px-3 text-right">Share %</th>
                      <th className="py-2 px-3 text-right">Est. Pipeline</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                    {sources.map((src: any) => (
                      <tr key={src.source} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: SOURCE_COLORS[src.source] || '#94A3B8' }}
                          />
                          <span className="capitalize font-semibold text-slate-900 dark:text-white">{src.source}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                          {src.count}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                          {src.percentage}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatRupees(src.value || 0)}
                        </td>
                      </tr>
                    ))}
                    {sources.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-400">No leads captured in this timeframe</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Lost Reason Analysis */}
            <div className="p-5 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Lost Reason Intelligence</h2>
                <p className="text-xs text-slate-500">Root causes for disqualification or abandoned opportunities</p>
              </div>

              <div className="space-y-3 pt-2">
                {lostReasons.map((lr: any) => (
                  <div key={lr.reason} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <AlertCircle size={15} className="text-rose-500 shrink-0" />
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{lr.reason}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-mono font-bold text-xs">
                      {lr.count} leads
                    </span>
                  </div>
                ))}
                {lostReasons.length === 0 && (
                  <div className="py-10 text-center text-slate-400 space-y-1">
                    <CheckCircle2 size={24} className="mx-auto text-emerald-500/70" />
                    <p className="text-xs">No lost reasons recorded in the selected period.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 4. Recent Captured Leads Action Queue */}
          <div className="p-5 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Recent Ingested Leads</h2>
                <p className="text-xs text-slate-500">High-priority inquiries requiring initial outreach or follow-up</p>
              </div>
              <Link to="/leads" className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">
                Open Leads Manager &rarr;
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider text-[10px]">
                    <th className="py-2 px-3">Lead #</th>
                    <th className="py-2 px-3">Customer</th>
                    <th className="py-2 px-3">Source</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3 text-right">Est. Value</th>
                    <th className="py-2 px-3 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {recentLeads.map((ld: any) => (
                    <tr key={ld.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                        {ld.leadNumber}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900 dark:text-white">{ld.customerName}</div>
                        <div className="text-[11px] text-slate-500">{ld.customerPhone}</div>
                      </td>
                      <td className="py-2.5 px-3 capitalize">
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[10.5px]">
                          {ld.source}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 capitalize">
                        <span className={`px-2 py-0.5 rounded font-bold text-[10.5px] ${
                          ld.status === 'won'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : ld.status === 'lost'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                        }`}>
                          {ld.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 dark:text-white">
                        {ld.estimatedValue ? formatRupees(Number(ld.estimatedValue)) : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                        {new Date(ld.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </td>
                    </tr>
                  ))}
                  {recentLeads.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">No leads available in this period</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
