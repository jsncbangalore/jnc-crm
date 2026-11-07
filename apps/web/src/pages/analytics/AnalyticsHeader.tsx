import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Calendar, ExternalLink } from 'lucide-react';

interface AnalyticsHeaderProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  badge?: string;
  range?: 'today' | '7d' | '30d' | 'month';
  onRangeChange?: (range: 'today' | '7d' | '30d' | 'month') => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  viewAllLink?: {
    to: string;
    label: string;
  };
}

export default function AnalyticsHeader({
  title,
  subtitle,
  icon,
  badge,
  range,
  onRangeChange,
  onRefresh,
  isRefreshing,
  viewAllLink,
}: AnalyticsHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <ArrowLeft size={13} />
            <span>Dashboard</span>
          </Link>
          <span>/</span>
          <span className="text-slate-700 dark:text-slate-300">Analytics</span>
          <span>/</span>
          <span className="text-blue-600 dark:text-blue-400 font-bold">{title}</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {title}
              </h1>
              {badge && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                  {badge}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {subtitle}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 flex-wrap">
        {range && onRangeChange && (
          <div className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 text-xs font-medium">
            <button
              type="button"
              onClick={() => onRangeChange('today')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                range === 'today'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => onRangeChange('7d')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                range === '7d'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              7 Days
            </button>
            <button
              type="button"
              onClick={() => onRangeChange('30d')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                range === '30d'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              30 Days
            </button>
            <button
              type="button"
              onClick={() => onRangeChange('month')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                range === 'month'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              This Month
            </button>
          </div>
        )}

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
            title="Refresh analytics data"
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin text-blue-600' : ''} />
          </button>
        )}

        {viewAllLink && (
          <Link
            to={viewAllLink.to}
            className="h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-blue-500 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <span>{viewAllLink.label}</span>
            <ExternalLink size={13} className="opacity-70" />
          </Link>
        )}
      </div>
    </div>
  );
}
