import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Phone,
  Mail,
  Calendar,
  Users,
  Compass,
  Check,
} from 'lucide-react';
import AnalyticsHeader from './AnalyticsHeader';
import { dashboardApi } from '../../services/api';

export default function ActivityAnalyticsPage() {
  const [range, setRange] = useState<'today' | '7d' | '30d' | 'month'>('7d');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setLoading(true);
    try {
      const res = await dashboardApi.getActivityAnalytics(range);
      setData(res.data);
    } catch (err) {
      console.error('Failed to load activity analytics', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [range]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleComplete = async (id: string) => {
    setCompletingId(id);
    try {
      await dashboardApi.completeActivity(id);
      await fetchAnalytics(true);
    } catch (err) {
      console.error('Failed to complete activity', err);
    } finally {
      setCompletingId(null);
    }
  };

  const summary = data?.summary || {};
  const typeDist = data?.typeDistribution || {};
  const overdueQueue = data?.overdueQueue || [];
  const recentActivities = data?.recentActivities || [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <AnalyticsHeader
        title="Activity & Sales Productivity Analytics"
        subtitle="Daily outreach execution, follow-up adherence rates, channel distribution, and overdue task resolution"
        icon={<Clock size={22} />}
        badge={data?.period?.label}
        range={range}
        onRangeChange={setRange}
        onRefresh={() => fetchAnalytics(true)}
        isRefreshing={isRefreshing}
        viewAllLink={{ to: '/daily-activities', label: 'View Daily Activities' }}
      />

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Computing team activity velocity & adherence metrics...</p>
        </div>
      ) : (
        <>
          {/* Core Activity KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Activities Completed</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                  {summary.completedCount ?? 0}
                </span>
                <span className="text-xs text-slate-500">/ {summary.totalScheduled ?? 0}</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Completed in selected period
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Adherence Rate</span>
                <CheckCircle2 size={15} className="text-blue-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-blue-600 dark:text-blue-400">
                  {summary.adherenceRate}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                On-time follow-up execution
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Pending Execution</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-indigo-600 dark:text-indigo-400">
                  {summary.pendingCount ?? 0}
                </span>
                <span className="text-xs text-slate-500">scheduled</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Upcoming follow-ups
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Overdue Follow-ups</span>
                <AlertCircle size={15} className="text-rose-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-rose-600 dark:text-rose-400">
                  {summary.overdueCount ?? 0}
                </span>
                <span className="text-xs text-slate-500">tasks</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Breached scheduled due date
              </p>
            </div>
          </div>

          {/* Activity Type Distribution & Overdue Queue */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Channel / Type Distribution */}
            <div className="p-5 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Touchpoint Channel Distribution</h2>
                <p className="text-xs text-slate-500">Breakdown of communication channels deployed by sales reps</p>
              </div>

              <div className="space-y-3 pt-2">
                {[
                  { key: 'call', label: 'Phone Calls', icon: Phone, color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/30' },
                  { key: 'follow_up', label: 'Scheduled Follow-ups', icon: Clock, color: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30' },
                  { key: 'meeting', label: 'Meetings & Presentations', icon: Users, color: 'text-purple-500 bg-purple-50 dark:bg-purple-900/30' },
                  { key: 'email', label: 'Emails Sent', icon: Mail, color: 'text-amber-500 bg-amber-50 dark:bg-amber-900/30' },
                  { key: 'visit', label: 'Site Visits & Demos', icon: Compass, color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30' },
                ].map((ch) => {
                  const count = typeDist[ch.key] || 0;
                  const total = summary.totalScheduled || 1;
                  const pct = ((count / total) * 100).toFixed(0);
                  const Icon = ch.icon;
                  return (
                    <div key={ch.key} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg ${ch.color} flex items-center justify-center shrink-0`}>
                          <Icon size={15} />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-900 dark:text-white">{ch.label}</div>
                          <div className="text-[11px] text-slate-500">{pct}% of touchpoints</div>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                        {count} logged
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Overdue Follow-up Action Queue */}
            <div className="p-5 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">Overdue Follow-Up Queue</h2>
                  <p className="text-xs text-slate-500">Tasks past their scheduled deadline requiring immediate resolution</p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                  {overdueQueue.length} Overdue
                </span>
              </div>

              <div className="space-y-2.5 max-h-[380px] overflow-y-auto">
                {overdueQueue.map((act: any) => (
                  <div key={act.id} className="p-3 rounded-lg border border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-rose-700 dark:text-rose-300 capitalize">{act.type || 'Task'}</span>
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">{act.lead?.customerName || 'Inquiry'}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Due: <strong className="text-rose-700 dark:text-rose-400">{new Date(act.scheduledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</strong> &bull; {act.description || 'Routine follow-up'}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={completingId === act.id}
                      onClick={() => handleComplete(act.id)}
                      className="h-8 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-colors shrink-0"
                      title="Mark as completed"
                    >
                      <Check size={13} />
                      <span>{completingId === act.id ? 'Saving...' : 'Done'}</span>
                    </button>
                  </div>
                ))}
                {overdueQueue.length === 0 && (
                  <div className="py-12 text-center text-slate-400 space-y-1">
                    <CheckCircle2 size={24} className="mx-auto text-emerald-500/70" />
                    <p className="text-xs">All scheduled follow-ups are on track! No overdue tasks.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Recent Activities Timeline */}
          <div className="p-5 rounded-xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Recent Activities Executed</h2>
                <p className="text-xs text-slate-500">Log of touchpoints and interactions conducted</p>
              </div>
              <Link to="/daily-activities" className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                View Daily Activities &rarr;
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider text-[10px]">
                    <th className="py-2 px-3">Type</th>
                    <th className="py-2 px-3">Customer / Lead</th>
                    <th className="py-2 px-3">Description</th>
                    <th className="py-2 px-3 text-center">Status</th>
                    <th className="py-2 px-3 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {recentActivities.map((act: any) => (
                    <tr key={act.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 capitalize font-semibold text-slate-900 dark:text-white">
                        {act.type || 'follow_up'}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900 dark:text-white">{act.lead?.customerName || '-'}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{act.lead?.leadNumber}</div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 max-w-xs truncate">
                        {act.description || 'No description provided'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded font-bold text-[10.5px] ${
                          act.isCompleted
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        }`}>
                          {act.isCompleted ? 'Completed' : 'Pending'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                        {act.scheduledAt ? new Date(act.scheduledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '-'}
                      </td>
                    </tr>
                  ))}
                  {recentActivities.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">No activity logged in this period</td>
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
