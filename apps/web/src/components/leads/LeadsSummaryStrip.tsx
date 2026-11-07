import React from 'react';
import {
  Users,
  Sparkles,
  Flame,
  IndianRupee,
  CalendarCheck,
} from 'lucide-react';

export interface LeadsSummaryData {
  totalLeads: number;
  newToday: number;
  urgentCount: number;
  pipelineValue: number;
  winRate?: number;
  followUpsDueToday: number;
}

export interface LeadsSummaryStripProps {
  summary: LeadsSummaryData;
  activeFilter: string | null;
  onSelectFilter: (filterKey: string | null) => void;
}

export function formatCompactCurrency(val: number): string {
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)}Cr`;
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(0)}k`;
  return `₹${val.toLocaleString('en-IN')}`;
}

export const LeadsSummaryStrip: React.FC<LeadsSummaryStripProps> = ({
  summary,
  activeFilter,
  onSelectFilter,
}) => {
  const items = [
    {
      key: 'all',
      label: 'Total leads',
      value: summary.totalLeads,
      icon: Users,
      color: 'text-blue-600 dark:text-blue-400',
      activeRing: 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300',
    },
    {
      key: 'new_today',
      label: 'New today',
      value: summary.newToday,
      icon: Sparkles,
      color: 'text-indigo-600 dark:text-indigo-400',
      activeRing: 'border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
    },
    {
      key: 'urgent',
      label: 'Urgent',
      value: summary.urgentCount,
      icon: Flame,
      color: 'text-rose-600 dark:text-rose-400',
      activeRing: 'border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    },
    {
      key: 'pipeline_value',
      label: 'Pipeline value',
      value: formatCompactCurrency(summary.pipelineValue),
      icon: IndianRupee,
      color: 'text-emerald-600 dark:text-emerald-400',
      activeRing: 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    },
    {
      key: 'followup_today',
      label: 'Follow-ups due',
      value: summary.followUpsDueToday,
      icon: CalendarCheck,
      color: 'text-purple-600 dark:text-purple-400',
      activeRing: 'border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-300',
    },
  ];

  return (
    <div
      className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5"
      role="toolbar"
      aria-label="Leads summary filters"
    >
      {items.map((item) => {
        const isActive = activeFilter === item.key;
        const Icon = item.icon;

        return (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              if (isActive) {
                onSelectFilter(null); // Deselect if already active
              } else {
                onSelectFilter(item.key);
              }
            }}
            aria-pressed={isActive}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border transition-all shrink-0 cursor-pointer ${
              isActive
                ? `${item.activeRing} shadow-sm font-bold`
                : 'border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#181B26] hover:bg-slate-50 dark:hover:bg-[#1F2433] text-slate-700 dark:text-slate-300'
            }`}
          >
            <Icon size={12} className={item.color} />
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal hidden xl:inline">
              {item.label}:
            </span>
            <span className="text-xs font-bold text-slate-900 dark:text-white">
              {item.value}
            </span>
          </button>
        );
      })}
    </div>
  );
};
