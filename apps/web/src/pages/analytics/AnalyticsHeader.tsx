import React from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, ExternalLink } from 'lucide-react';

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
  range = '7d',
  onRangeChange,
  onRefresh,
  isRefreshing,
  viewAllLink,
}: AnalyticsHeaderProps) {
  React.useEffect(() => {
    if (title) {
      document.title = `${title} | JNC CRM`;
    }
  }, [title]);

  return (
    <div className="space-y-3 pb-5 border-b border-slate-200 dark:border-slate-800">
      {/* ── Title, Subtitle & Controls ───────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-800/40 shadow-xs">
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {title}
              </h1>
              {badge && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50">
                  {badge}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 max-w-2xl">
              {subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {range && onRangeChange && (
            <div className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 text-xs font-medium">
              <button
                type="button"
                onClick={() => onRangeChange('today')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
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
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
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
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
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
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
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
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
              title="Refresh report data"
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
    </div>
  );
}
