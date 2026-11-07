import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Clock,
  DollarSign,
  ShieldAlert,
  Phone,
  Mail,
  MessageCircle,
  FileText,
  Percent,
} from 'lucide-react';
import AnalyticsHeader from './AnalyticsHeader';
import { dashboardApi } from '../../services/api';

function formatRupees(val: number) {
  if (val >= 10000000) return '₹' + (val / 10000000).toFixed(2) + ' Cr';
  if (val >= 100000) return '₹' + (val / 100000).toFixed(2) + ' L';
  return '₹' + Math.round(val).toLocaleString('en-IN');
}

export default function OverdueAnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchAnalytics = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setLoading(true);
    try {
      const res = await dashboardApi.getOverdueAnalytics();
      setData(res.data);
    } catch (err) {
      console.error('Failed to load overdue analytics', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const summary = data?.summary || {};
  const dpdBuckets = data?.dpdBuckets || {};
  const recoveryList = data?.priorityRecoveryList || [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <AnalyticsHeader
        title="Overdue Invoices & Collection Risk Analytics"
        subtitle="Days Past Due (DPD) scoring, delinquent exposure, commercial interest accruals (18% p.a.), and priority recovery queues"
        icon={<AlertCircle size={22} className="text-rose-600" />}
        badge="Credit Risk"
        onRefresh={() => fetchAnalytics(true)}
        isRefreshing={isRefreshing}
        viewAllLink={{ to: '/invoices', label: 'View Invoices' }}
      />

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-rose-600 border-t-transparent animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Computing delinquency risk & interest calculations...</p>
        </div>
      ) : (
        <>
          {/* Overdue Core Risk KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Delinquent Overdue</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-rose-600 dark:text-rose-400 truncate">
                  {formatRupees(summary.totalOverdue || 0)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Across <strong className="text-slate-700 dark:text-slate-300">{summary.overdueCount ?? 0}</strong> past due invoices
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Accrued Late Interest</span>
                <Percent size={15} className="text-amber-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-amber-600 dark:text-amber-400 truncate">
                  {formatRupees(summary.totalInterestAccrued || 0)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Computed at standard 18% p.a.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Critical DPD (60+ Days)</span>
                <ShieldAlert size={15} className="text-rose-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-rose-600 dark:text-rose-400 truncate">
                  {formatRupees(dpdBuckets.bracket_60_plus?.amount || 0)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                <strong className="text-slate-700 dark:text-slate-300">{dpdBuckets.bracket_60_plus?.count || 0}</strong> critical accounts
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Mild DPD (1–15 Days)</span>
                <Clock size={15} className="text-blue-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-blue-600 dark:text-blue-400 truncate">
                  {formatRupees(dpdBuckets.bracket_1_15?.amount || 0)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                <strong className="text-slate-700 dark:text-slate-300">{dpdBuckets.bracket_1_15?.count || 0}</strong> recent due invoices
              </p>
            </div>
          </div>

          {/* DPD Brackets Breakdown */}
          <div className="p-5 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Days Past Due (DPD) Exposure Brackets</h2>
              <p className="text-xs text-slate-500">Segmenting defaulted balances by delinquency duration</p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 pt-2">
              {[
                { data: dpdBuckets.bracket_1_15, color: 'border-blue-500', text: 'text-blue-600 dark:text-blue-400' },
                { data: dpdBuckets.bracket_16_30, color: 'border-amber-500', text: 'text-amber-600 dark:text-amber-400' },
                { data: dpdBuckets.bracket_31_60, color: 'border-orange-500', text: 'text-orange-600 dark:text-orange-400' },
                { data: dpdBuckets.bracket_60_plus, color: 'border-rose-500', text: 'text-rose-600 dark:text-rose-400' },
              ].map((b, i) => (
                <div key={i} className={`p-4 rounded-xl border-l-4 ${b.color} bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800`}>
                  <div className="text-xs font-semibold text-slate-500">{b.data?.label}</div>
                  <div className={`text-xl font-black font-mono mt-1 ${b.text}`}>
                    {formatRupees(b.data?.amount || 0)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {b.data?.count || 0} invoices past due
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Priority Recovery Action List */}
          <div className="p-5 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Priority Collections Action Queue</h2>
                <p className="text-xs text-slate-500">Overdue invoices ranked by recovery urgency with interest and instant contact links</p>
              </div>
              <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 font-mono font-bold">
                {recoveryList.length} Accounts
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Invoice #</th>
                    <th className="py-2.5 px-3">Customer & Contact</th>
                    <th className="py-2.5 px-3 text-center">Due Date</th>
                    <th className="py-2.5 px-3 text-center">DPD</th>
                    <th className="py-2.5 px-3 text-right">Principal Due</th>
                    <th className="py-2.5 px-3 text-right">18% Interest</th>
                    <th className="py-2.5 px-3 text-right">Total Claim</th>
                    <th className="py-2.5 px-3 text-center">Risk</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {recoveryList.map((item: any) => (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                        {item.invoiceNumber}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-900 dark:text-white">{item.customerName}</div>
                        <div className="text-[11px] text-slate-500">{item.customerPhone || 'No phone'}</div>
                      </td>
                      <td className="py-3 px-3 text-center font-mono text-slate-600 dark:text-slate-400">
                        {new Date(item.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-bold text-rose-600 dark:text-rose-400">
                        {item.daysPastDue}d
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {formatRupees(item.balanceDue)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-amber-600 dark:text-amber-400 font-semibold">
                        {formatRupees(item.accruedInterest)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-rose-600 dark:text-rose-400">
                        {formatRupees(item.totalRecoveryAmount)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.riskScore === 'High'
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                            : item.riskScore === 'Medium'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                        }`}>
                          {item.riskScore}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {item.customerPhone && (
                            <a
                              href={`https://wa.me/${item.customerPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                                `Dear ${item.customerName}, this is a reminder regarding outstanding invoice ${item.invoiceNumber} for ${formatRupees(item.balanceDue)}. Please arrange payment at your earliest convenience.`
                              )}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 hover:bg-emerald-100 transition-colors"
                              title="Send WhatsApp Payment Reminder"
                            >
                              <MessageCircle size={14} />
                            </a>
                          )}
                          <Link
                            to={`/ledger?customerId=${item.customerId || ''}`}
                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors"
                            title="Open Customer Ledger Statement"
                          >
                            <FileText size={14} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {recoveryList.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-slate-400">
                        No overdue invoices found! All invoices are currently paid or within credit terms.
                      </td>
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
