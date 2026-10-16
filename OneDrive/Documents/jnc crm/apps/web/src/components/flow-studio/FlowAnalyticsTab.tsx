import React, { useState } from 'react';
import {
  TrendingUp, Users, CheckCircle2, Clock, Mail, MessageSquare,
  Phone, ArrowRight, BarChart3, AlertCircle, Sparkles, Filter
} from 'lucide-react';

export default function FlowAnalyticsTab() {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');

  const funnelSteps = [
    { name: '1. Inbound Ingestion (Trigger)', count: 248, pct: 100, color: 'bg-amber-500' },
    { name: '2. Auto Proposal Email Dispatched', count: 244, pct: 98.4, color: 'bg-blue-500' },
    { name: '3. 24h Delay Evaluation', count: 230, pct: 92.7, color: 'bg-slate-500' },
    { name: '4. WhatsApp Inspection Follow-up', count: 209, pct: 84.2, color: 'bg-emerald-500' },
    { name: '5. Proposal Won / Quotation Converted', count: 103, pct: 41.5, color: 'bg-indigo-500' },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* ─── TIME RANGE SWITCHER ─── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white">
            Automation Performance & Funnel Conversion
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time delivery rates, stage progression velocity, and sequence drop-off analytics.
          </p>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#181B26] p-1 rounded-xl text-xs font-bold border border-slate-200 dark:border-[#2A3042]">
          {(['7d', '30d', '90d'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={`px-3 py-1 rounded-lg transition-colors ${
                timeRange === r
                  ? 'bg-crm-blue text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Last {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* ─── 4 TOP KPI CARDS ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-xs space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Enrolled Prospects</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">248</span>
            <span className="text-xs font-bold text-emerald-500">+18% this month</span>
          </div>
          <p className="text-[11px] text-slate-500">Automated sequence triggers fired</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-xs space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sequence Completion Rate</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">84.2%</span>
            <span className="text-xs font-bold text-emerald-500">+4.1%</span>
          </div>
          <p className="text-[11px] text-slate-500">Reached end of configured path</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-xs space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Message Delivery Reliability</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">98.6%</span>
            <span className="text-xs font-bold text-emerald-500">Verified</span>
          </div>
          <p className="text-[11px] text-slate-500">WhatsApp & Email dispatch success</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-xs space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Avg Lead Engagement SLA</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">4.2 min</span>
            <span className="text-xs font-bold text-emerald-500">-65% faster</span>
          </div>
          <p className="text-[11px] text-slate-500">From webhook to first interaction</p>
        </div>
      </div>

      {/* ─── VISUAL FUNNEL CONVERSION SECTION ─── */}
      <div className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-crm-blue/15 text-crm-blue">
              <TrendingUp size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                Step-by-Step Flow Funnel Progression
              </h3>
              <p className="text-xs text-slate-500">Conversion drop-off across individual sequence nodes</p>
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          {funnelSteps.map((step, idx) => (
            <div key={idx} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 dark:text-slate-200">{step.name}</span>
                <span className="font-mono text-slate-500">
                  <strong className="text-slate-900 dark:text-white">{step.count}</strong> leads ({step.pct}%)
                </span>
              </div>
              <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-[#11141E] overflow-hidden border border-slate-200 dark:border-white/5">
                <div
                  className={`h-full rounded-full ${step.color} transition-all duration-500`}
                  style={{ width: `${step.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── CHANNEL DELIVERY BREAKDOWN ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-emerald-500 font-bold text-xs">
            <MessageSquare size={16} />
            <span>WhatsApp Cloud API</span>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Delivery Rate</span>
              <strong className="text-slate-900 dark:text-white">99.2%</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Read Check Rate</span>
              <strong className="text-slate-900 dark:text-white">94.1%</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Prospect Response Rate</span>
              <strong className="text-emerald-500">68.4%</strong>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-blue-500 font-bold text-xs">
            <Mail size={16} />
            <span>Email Proposals</span>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Delivery Rate</span>
              <strong className="text-slate-900 dark:text-white">98.1%</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Open Rate</span>
              <strong className="text-slate-900 dark:text-white">52.8%</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Quotation PDF Clicks</span>
              <strong className="text-blue-500">28.4%</strong>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-orange-500 font-bold text-xs">
            <Clock size={16} />
            <span>IndiaMART Ingestion</span>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Webhook Push Speed</span>
              <strong className="text-slate-900 dark:text-white">&lt; 1.2s</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Auto Round-Robin Match</span>
              <strong className="text-slate-900 dark:text-white">100%</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Duplicate Trap Catch</span>
              <strong className="text-orange-500">14 caught</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
