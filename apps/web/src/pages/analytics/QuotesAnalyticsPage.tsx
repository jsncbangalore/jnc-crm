import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  TrendingUp,
} from 'lucide-react';
import AnalyticsHeader from './AnalyticsHeader';
import { dashboardApi } from '../../services/api';

function formatRupees(val: number) {
  if (val >= 10000000) return '₹' + (val / 10000000).toFixed(2) + ' Cr';
  if (val >= 100000) return '₹' + (val / 100000).toFixed(2) + ' L';
  return '₹' + Math.round(val).toLocaleString('en-IN');
}

export default function QuotesAnalyticsPage() {
  const [range, setRange] = useState<'today' | '7d' | '30d' | 'month'>('7d');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchAnalytics = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setLoading(true);
    try {
      const res = await dashboardApi.getQuotesAnalytics(range);
      setData(res.data);
    } catch (err) {
      console.error('Failed to load quotes analytics', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [range]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const summary = data?.summary || {};
  const statusBreakdown = data?.statusBreakdown || {};
  const expiringSoon = data?.expiringSoon || [];
  const recentQuotes = data?.recentQuotes || [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <AnalyticsHeader
        title="Active Quotes & Pipeline Analytics"
        subtitle="Forecasted pipeline value, probability-weighted revenue, deal size averages, and quote conversion rates"
        icon={<FileText size={22} />}
        badge={data?.period?.label}
        range={range}
        onRangeChange={setRange}
        onRefresh={() => fetchAnalytics(true)}
        isRefreshing={isRefreshing}
        viewAllLink={{ to: '/quotations', label: 'View Quotations Table' }}
      />

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-purple-600 border-t-transparent animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Computing revenue pipeline & probability models...</p>
        </div>
      ) : (
        <>
          {/* Core Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Pipeline</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-purple-600 dark:text-purple-400 truncate">
                  {formatRupees(summary.activePipelineValue || 0)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Across <strong className="text-slate-700 dark:text-slate-300">{summary.activeQuotesCount ?? 0}</strong> active quotes
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Weighted Pipeline</span>
                <TrendingUp size={15} className="text-emerald-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400 truncate">
                  {formatRupees(summary.weightedPipelineValue || 0)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Risk-adjusted probability forecast
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Average Deal Size</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-slate-900 dark:text-white truncate">
                  {formatRupees(summary.averageDealSize || 0)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Per quoted proposal
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Quote Win Rate</span>
                <CheckCircle2 size={15} className="text-blue-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-blue-600 dark:text-blue-400">
                  {summary.winRate}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                <strong className="text-slate-700 dark:text-slate-300">{statusBreakdown.approved?.count ?? 0}</strong> approved proposals
              </p>
            </div>
          </div>

          {/* Pipeline Stage Distribution & Expiry Risk */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Stage Breakdown */}
            <div className="p-5 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Pipeline Status Distribution</h2>
                <p className="text-xs text-slate-500">Breakdown of proposals across active, negotiated, and closed stages</p>
              </div>

              <div className="space-y-3 pt-2">
                {[
                  { key: 'draft', label: 'Draft Proposals', color: 'bg-slate-400', weight: '20%' },
                  { key: 'sent', label: 'Sent to Customer', color: 'bg-purple-500', weight: '50%' },
                  { key: 'approved', label: 'Approved (Won)', color: 'bg-emerald-500', weight: '100%' },
                  { key: 'rejected', label: 'Rejected', color: 'bg-rose-500', weight: '0%' },
                  { key: 'expired', label: 'Expired', color: 'bg-amber-500', weight: '0%' },
                ].map((st) => {
                  const item = statusBreakdown[st.key] || { count: 0, totalValue: 0 };
                  return (
                    <div key={st.key} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`w-3 h-3 rounded-full ${st.color}`} />
                        <div>
                          <div className="text-xs font-semibold text-slate-900 dark:text-white">{st.label}</div>
                          <div className="text-[11px] text-slate-500">Weight: {st.weight}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold font-mono text-slate-900 dark:text-white">
                          {formatRupees(item.totalValue || 0)}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">{item.count} quotes</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Expiring Soon Alerts */}
            <div className="p-5 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">Expiring Soon Alerts (&lt; 7 Days)</h2>
                  <p className="text-xs text-slate-500">Open quotes at risk of expiration requiring customer check-in</p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                  {expiringSoon.length} at risk
                </span>
              </div>

              <div className="space-y-2.5 max-h-[380px] overflow-y-auto">
                {expiringSoon.map((q: any) => (
                  <div key={q.id} className="p-3 rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-amber-800 dark:text-amber-300">{q.quoteNumber}</span>
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">{q.customerName}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Expires: <strong className="text-amber-700 dark:text-amber-400">{new Date(q.validUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</strong>
                      </div>
                    </div>
                    <div className="text-right font-mono font-bold text-xs text-slate-900 dark:text-white">
                      {formatRupees(Number(q.totalAmount))}
                    </div>
                  </div>
                ))}
                {expiringSoon.length === 0 && (
                  <div className="py-12 text-center text-slate-400 space-y-1">
                    <CheckCircle2 size={24} className="mx-auto text-emerald-500/70" />
                    <p className="text-xs">No active quotes expiring within the next 7 days.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Recent Quotations Table */}
          <div className="p-5 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Recent Quotations Activity</h2>
                <p className="text-xs text-slate-500">Recently drafted and sent commercial proposals</p>
              </div>
              <Link to="/quotations" className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline">
                View All Quotes &rarr;
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider text-[10px]">
                    <th className="py-2 px-3">Quote #</th>
                    <th className="py-2 px-3">Customer</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3 text-right">Value</th>
                    <th className="py-2 px-3 text-right">Valid Until</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {recentQuotes.map((q: any) => (
                    <tr key={q.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-mono font-bold text-purple-600 dark:text-purple-400">
                        {q.quoteNumber}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                        {q.customerName}
                      </td>
                      <td className="py-2.5 px-3 capitalize">
                        <span className={`px-2 py-0.5 rounded font-bold text-[10.5px] ${
                          q.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : q.status === 'sent'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                            : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                          {q.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {formatRupees(Number(q.totalAmount))}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                        {q.validUntil ? new Date(q.validUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '-'}
                      </td>
                    </tr>
                  ))}
                  {recentQuotes.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">No quotation activity found</td>
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
