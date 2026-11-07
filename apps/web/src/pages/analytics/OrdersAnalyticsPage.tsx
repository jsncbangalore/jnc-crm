import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingCart,
  DollarSign,
  TrendingUp,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  ArrowUpRight,
} from 'lucide-react';
import AnalyticsHeader from './AnalyticsHeader';
import { dashboardApi } from '../../services/api';

function formatRupees(val: number) {
  if (val >= 10000000) return '₹' + (val / 10000000).toFixed(2) + ' Cr';
  if (val >= 100000) return '₹' + (val / 100000).toFixed(2) + ' L';
  return '₹' + Math.round(val).toLocaleString('en-IN');
}

export default function OrdersAnalyticsPage() {
  const [range, setRange] = useState<'today' | '7d' | '30d' | 'month'>('7d');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchAnalytics = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setLoading(true);
    try {
      const res = await dashboardApi.getOrdersAnalytics(range);
      setData(res.data);
    } catch (err) {
      console.error('Failed to load orders analytics', err);
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
  const topProducts = data?.topProducts || [];
  const recentOrders = data?.recentOrders || [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <AnalyticsHeader
        title="Active Orders & Operations Analytics"
        subtitle="Order fulfillment velocity, confirmed revenue, average order value (AOV), and advance collection coverage"
        icon={<ShoppingCart size={22} />}
        badge={data?.period?.label}
        range={range}
        onRangeChange={setRange}
        onRefresh={() => fetchAnalytics(true)}
        isRefreshing={isRefreshing}
        viewAllLink={{ to: '/orders', label: 'View Orders Table' }}
      />

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-amber-600 border-t-transparent animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Computing order fulfillment metrics & revenue...</p>
        </div>
      ) : (
        <>
          {/* Core Operational KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Active In-Flight Orders</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-amber-600 dark:text-amber-400">
                  {summary.activeOrdersCount ?? 0}
                </span>
                <span className="text-xs text-slate-500">orders</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Confirmed, processing, or dispatched
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Confirmed Revenue</span>
                <TrendingUp size={15} className="text-emerald-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400 truncate">
                  {formatRupees(summary.totalRevenueConfirmed || 0)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                From <strong className="text-slate-700 dark:text-slate-300">{summary.totalOrdersInPeriod ?? 0}</strong> orders in period
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Average Order Value (AOV)</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-slate-900 dark:text-white truncate">
                  {formatRupees(summary.averageOrderValue || 0)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Average transaction deal size
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Advance Collection %</span>
                <CheckCircle2 size={15} className="text-blue-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-blue-600 dark:text-blue-400">
                  {summary.advanceCollectionRatio}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Upfront payments collected
              </p>
            </div>
          </div>

          {/* Fulfillment Stages & Top SKUs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Fulfillment Status Funnel */}
            <div className="p-5 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Fulfillment Stage Distribution</h2>
                <p className="text-xs text-slate-500">Operational pipeline progression from order booking to final delivery</p>
              </div>

              <div className="space-y-3 pt-2">
                {[
                  { key: 'confirmed', label: 'Order Confirmed', color: 'bg-blue-500', icon: Clock },
                  { key: 'processing', label: 'In Assembly / Production', color: 'bg-amber-500', icon: Package },
                  { key: 'dispatched', label: 'Dispatched / In Transit', color: 'bg-indigo-500', icon: Truck },
                  { key: 'delivered', label: 'Successfully Delivered', color: 'bg-emerald-500', icon: CheckCircle2 },
                  { key: 'cancelled', label: 'Cancelled', color: 'bg-rose-500', icon: Clock },
                ].map((st) => {
                  const count = statusBreakdown[st.key] || 0;
                  const total = summary.totalOrdersInPeriod || 1;
                  const pct = ((count / total) * 100).toFixed(0);
                  const Icon = st.icon;
                  return (
                    <div key={st.key} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-lg ${st.color}/10 text-${st.color.replace('bg-', '')} flex items-center justify-center shrink-0`}>
                          <Icon size={14} className={st.color.replace('bg-', 'text-')} />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-900 dark:text-white">{st.label}</div>
                          <div className="text-[11px] text-slate-500">{pct}% of period orders</div>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                        {count} orders
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top Revenue Products / SKUs */}
            <div className="p-5 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Top Revenue Systems & SKUs</h2>
                <p className="text-xs text-slate-500">Highest grossing equipment lines and component units booked</p>
              </div>

              <div className="space-y-3 pt-2">
                {topProducts.map((p: any, idx: number) => (
                  <div key={p.name} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-[10px] flex items-center justify-center shrink-0 font-mono">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="text-xs font-semibold text-slate-900 dark:text-white">{p.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{p.quantity} units sold</div>
                      </div>
                    </div>
                    <div className="text-right font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                      {formatRupees(p.revenue)}
                    </div>
                  </div>
                ))}
                {topProducts.length === 0 && (
                  <div className="py-12 text-center text-slate-400 space-y-1">
                    <Package size={24} className="mx-auto text-slate-400" />
                    <p className="text-xs">No product line breakdown available for this timeframe.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Recent Sales Orders Table */}
          <div className="p-5 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Recent Sales Orders</h2>
                <p className="text-xs text-slate-500">Recently booked customer purchase orders</p>
              </div>
              <Link to="/orders" className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline">
                View All Orders &rarr;
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider text-[10px]">
                    <th className="py-2 px-3">Order #</th>
                    <th className="py-2 px-3">Customer</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3 text-right">Total Amount</th>
                    <th className="py-2 px-3 text-right">Paid</th>
                    <th className="py-2 px-3 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {recentOrders.map((ord: any) => (
                    <tr key={ord.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-mono font-bold text-amber-600 dark:text-amber-400">
                        {ord.orderNumber}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                        {ord.customerName}
                      </td>
                      <td className="py-2.5 px-3 capitalize">
                        <span className={`px-2 py-0.5 rounded font-bold text-[10.5px] ${
                          ord.status === 'delivered'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : ord.status === 'dispatched'
                            ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        }`}>
                          {ord.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {formatRupees(Number(ord.totalAmount))}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                        {formatRupees(Number(ord.paidAmount || 0))}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-rose-600 dark:text-rose-400 font-bold">
                        {formatRupees(Number(ord.balanceAmount || 0))}
                      </td>
                    </tr>
                  ))}
                  {recentOrders.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">No recent orders found</td>
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
