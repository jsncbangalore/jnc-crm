import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Receipt,
  DollarSign,
  Clock,
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import AnalyticsHeader from './AnalyticsHeader';
import { dashboardApi } from '../../services/api';

function formatRupees(val: number) {
  if (val >= 10000000) return '₹' + (val / 10000000).toFixed(2) + ' Cr';
  if (val >= 100000) return '₹' + (val / 100000).toFixed(2) + ' L';
  return '₹' + Math.round(val).toLocaleString('en-IN');
}

export default function ReceivablesAnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchAnalytics = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setLoading(true);
    try {
      const res = await dashboardApi.getReceivablesAnalytics();
      setData(res.data);
    } catch (err) {
      console.error('Failed to load receivables analytics', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const summary = data?.summary || {};
  const aging = data?.agingBuckets || {};
  const topDebtors = data?.topDebtors || [];
  const upcoming = data?.upcomingCollections || [];

  const totalAR = summary.totalReceivable || 1;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <AnalyticsHeader
        title="Accounts Receivable (AR) & Aging Analytics"
        subtitle="Outstanding balance aging buckets, Days Sales Outstanding (DSO), debtor concentration, and cash flow forecast"
        icon={<Receipt size={22} />}
        badge="Real-time AR"
        onRefresh={() => fetchAnalytics(true)}
        isRefreshing={isRefreshing}
        viewAllLink={{ to: '/invoices', label: 'View Invoices' }}
      />

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Computing AR aging buckets & credit risk index...</p>
        </div>
      ) : (
        <>
          {/* Core AR KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Outstanding AR</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400 truncate">
                  {formatRupees(summary.totalReceivable || 0)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Across <strong className="text-slate-700 dark:text-slate-300">{summary.unpaidInvoicesCount ?? 0}</strong> unpaid invoices
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Days Sales Outstanding</span>
                <Clock size={15} className="text-blue-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-blue-600 dark:text-blue-400">
                  {summary.daysSalesOutstanding ?? 45}
                </span>
                <span className="text-xs text-slate-500">days</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Average collection period
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Current (0–30 Days)</span>
                <CheckCircle2 size={15} className="text-emerald-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-slate-900 dark:text-white truncate">
                  {formatRupees(aging.bucket_0_30?.amount || 0)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                <strong className="text-slate-700 dark:text-slate-300">{aging.bucket_0_30?.count || 0}</strong> invoices within credit terms
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Critical Delinquent (90+ D)</span>
                <ShieldAlert size={15} className="text-rose-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-rose-600 dark:text-rose-400 truncate">
                  {formatRupees(aging.bucket_90_plus?.amount || 0)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                <strong className="text-slate-700 dark:text-slate-300">{aging.bucket_90_plus?.count || 0}</strong> high-risk accounts
              </p>
            </div>
          </div>

          {/* Aging Visual Bar & Buckets */}
          <div className="p-5 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Receivable Aging Distribution Bar</h2>
                <p className="text-xs text-slate-500">Segmentation of all balance amounts based on invoice age</p>
              </div>
              <span className="text-xs font-semibold text-slate-500">Total: {formatRupees(summary.totalReceivable || 0)}</span>
            </div>

            {/* Visual segmented bar */}
            <div className="h-4 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
              <div
                style={{ width: `${Math.min(100, ((aging.bucket_0_30?.amount || 0) / totalAR) * 100)}%` }}
                className="bg-emerald-500 transition-all"
                title={`0–30 Days: ${formatRupees(aging.bucket_0_30?.amount || 0)}`}
              />
              <div
                style={{ width: `${Math.min(100, ((aging.bucket_31_60?.amount || 0) / totalAR) * 100)}%` }}
                className="bg-blue-500 transition-all"
                title={`31–60 Days: ${formatRupees(aging.bucket_31_60?.amount || 0)}`}
              />
              <div
                style={{ width: `${Math.min(100, ((aging.bucket_61_90?.amount || 0) / totalAR) * 100)}%` }}
                className="bg-amber-500 transition-all"
                title={`61–90 Days: ${formatRupees(aging.bucket_61_90?.amount || 0)}`}
              />
              <div
                style={{ width: `${Math.min(100, ((aging.bucket_90_plus?.amount || 0) / totalAR) * 100)}%` }}
                className="bg-rose-500 transition-all"
                title={`90+ Days: ${formatRupees(aging.bucket_90_plus?.amount || 0)}`}
              />
            </div>

            {/* 4 Bucket Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 pt-2">
              {[
                { bucket: aging.bucket_0_30, color: 'border-emerald-500', textColor: 'text-emerald-600 dark:text-emerald-400' },
                { bucket: aging.bucket_31_60, color: 'border-blue-500', textColor: 'text-blue-600 dark:text-blue-400' },
                { bucket: aging.bucket_61_90, color: 'border-amber-500', textColor: 'text-amber-600 dark:text-amber-400' },
                { bucket: aging.bucket_90_plus, color: 'border-rose-500', textColor: 'text-rose-600 dark:text-rose-400' },
              ].map((b, i) => (
                <div key={i} className={`p-3.5 rounded-xl border-l-4 ${b.color} bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800`}>
                  <div className="text-xs font-semibold text-slate-500">{b.bucket?.label}</div>
                  <div className={`text-lg font-black font-mono mt-1 ${b.textColor}`}>
                    {formatRupees(b.bucket?.amount || 0)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {b.bucket?.count || 0} invoices &bull; {totalAR > 0 ? (((b.bucket?.amount || 0) / totalAR) * 100).toFixed(1) : 0}% of AR
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Debtor Accounts & Upcoming Inflow Schedule */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Debtors */}
            <div className="p-5 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">Debtor Concentration (Top 10)</h2>
                  <p className="text-xs text-slate-500">Clients with highest aggregate balance due</p>
                </div>
                <Link to="/ledger" className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline">
                  View Ledger &rarr;
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider text-[10px]">
                      <th className="py-2 px-3">Customer Party</th>
                      <th className="py-2 px-3 text-center">Invoices</th>
                      <th className="py-2 px-3 text-right">Balance Due</th>
                      <th className="py-2 px-3 text-right">AR Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                    {topDebtors.map((d: any) => (
                      <tr key={d.customerName} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                          <Building2 size={14} className="text-slate-400 shrink-0" />
                          <span>{d.customerName}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-slate-600 dark:text-slate-400">
                          {d.count}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {formatRupees(d.totalDue)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                          {d.percentage}%
                        </td>
                      </tr>
                    ))}
                    {topDebtors.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-400">No outstanding customer balances</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Upcoming Collections Schedule */}
            <div className="p-5 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Upcoming Collection Timeline</h2>
                <p className="text-xs text-slate-500">Invoices coming due in the immediate forecast</p>
              </div>

              <div className="space-y-2.5 max-h-[360px] overflow-y-auto">
                {upcoming.map((inv: any) => (
                  <div key={inv.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-blue-600 dark:text-blue-400">{inv.invoiceNumber}</span>
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">{inv.customerName}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Due Date: <strong className="text-slate-700 dark:text-slate-300">{new Date(inv.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</strong>
                      </div>
                    </div>
                    <div className="text-right font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                      {formatRupees(Number(inv.balanceDue))}
                    </div>
                  </div>
                ))}
                {upcoming.length === 0 && (
                  <div className="py-12 text-center text-slate-400 space-y-1">
                    <Calendar size={24} className="mx-auto text-slate-400" />
                    <p className="text-xs">No upcoming invoices scheduled in this period.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
