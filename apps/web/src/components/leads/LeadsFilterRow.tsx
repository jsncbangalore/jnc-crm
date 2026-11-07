import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Filter,
  RefreshCw,
  LayoutGrid,
  List,
  SlidersHorizontal,
  ChevronDown,
  X,
  Check,
} from 'lucide-react';

export interface LeadsFilterRowProps {
  search: string;
  onSearchChange: (val: string) => void;
  source: string;
  onSourceChange: (val: string) => void;
  availableSources: string[];
  urgency: string;
  onUrgencyChange: (val: string) => void;
  assignedToId: string;
  onAssignedToIdChange: (val: string) => void;
  salesReps: { id: string; name?: string; email?: string }[];
  view: 'kanban' | 'list';
  onViewChange: (val: 'kanban' | 'list') => void;
  density: 'compact' | 'comfortable';
  onDensityChange: (val: 'compact' | 'comfortable') => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  updatedTime: string;
  currentUser?: any;
}

export const LeadsFilterRow: React.FC<LeadsFilterRowProps> = ({
  search,
  onSearchChange,
  source,
  onSourceChange,
  availableSources,
  urgency,
  onUrgencyChange,
  assignedToId,
  onAssignedToIdChange,
  salesReps,
  view,
  onViewChange,
  density,
  onDensityChange,
  onRefresh,
  isRefreshing = false,
  updatedTime,
  currentUser,
}) => {
  const [showCollapsedPopover, setShowCollapsedPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Calculate active filter count for the badge under 1280px
  let activeFilterCount = 0;
  if (source && source !== 'all') activeFilterCount++;
  if (urgency && urgency !== 'all') activeFilterCount++;
  if (assignedToId && assignedToId !== 'all') activeFilterCount++;
  if (search.trim()) activeFilterCount++;

  // Close popover on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowCollapsedPopover(false);
      }
    };
    if (showCollapsedPopover) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCollapsedPopover]);

  const sourceLabels: Record<string, string> = {
    all: 'All Sources',
    indiamart: 'IndiaMART',
    web: 'Website',
    whatsapp: 'WhatsApp',
    facebook_lead_ads: 'Facebook',
    instagram_lead_ads: 'Instagram',
    meta: 'Meta',
    manual: 'Manual',
  };

  return (
    <div className="h-9 px-3 border-b border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#141722] flex items-center justify-between gap-2 shrink-0 select-none text-xs">
      {/* ─── LEFT: Search Box ─────────────────────────────────────────────── */}
      <div className="relative flex-1 max-w-xs min-w-[140px]">
        <Search
          size={13}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search leads, phone, city..."
          aria-label="Search leads"
          className="w-full h-7 pl-8 pr-6 text-xs rounded-md border border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#181B26] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-crm-blue"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* ─── CENTER: Full Filters (>= 1280px) ─────────────────────────────── */}
      <div className="hidden xl:flex items-center gap-2">
        {/* Source Segmented Control */}
        <div className="flex items-center bg-slate-100 dark:bg-[#1E2230] p-0.5 rounded-md border border-slate-200 dark:border-[#2A3042]">
          {['all', 'indiamart', 'web', 'whatsapp', 'facebook_lead_ads'].map((src) => {
            const isSel = source === src;
            return (
              <button
                key={src}
                type="button"
                onClick={() => onSourceChange(src)}
                className={`px-2 py-0.5 text-[11px] font-semibold rounded capitalize transition-all ${
                  isSel
                    ? 'bg-white dark:bg-crm-blue text-crm-blue dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {src === 'facebook_lead_ads' ? 'FB Leads' : src}
              </button>
            );
          })}
        </div>

        {/* Urgency Segmented Control */}
        <div className="flex items-center bg-slate-100 dark:bg-[#1E2230] p-0.5 rounded-md border border-slate-200 dark:border-[#2A3042]">
          {[
            { id: 'all', label: 'All' },
            { id: 'urgent', label: 'Urgent' },
            { id: 'high', label: 'High' },
            { id: 'standard', label: 'Standard' },
          ].map((u) => {
            const isSel = urgency === u.id;
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => onUrgencyChange(u.id)}
                className={`px-2 py-0.5 text-[11px] font-semibold rounded transition-all ${
                  isSel
                    ? 'bg-white dark:bg-crm-blue text-crm-blue dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {u.label}
              </button>
            );
          })}
        </div>

        {/* Sales Rep Select */}
        <div className="relative">
          <select
            value={assignedToId}
            onChange={(e) => onAssignedToIdChange(e.target.value)}
            aria-label="Filter by sales representative"
            id="sales-rep-filter-select"
            className="h-7 px-2 pr-6 text-[11px] font-medium rounded-md border border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#181B26] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-crm-blue appearance-none cursor-pointer"
          >
            <option value="all">All Sales Reps</option>
            {currentUser && currentUser.id && (
              <option value={currentUser.id}>My Leads Only</option>
            )}
            {salesReps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name || r.email}
              </option>
            ))}
          </select>
          <ChevronDown
            size={11}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
        </div>
      </div>

      {/* ─── COLLAPSED FILTERS BUTTON (< 1280px) ──────────────────────────── */}
      <div className="xl:hidden relative" ref={popoverRef}>
        <button
          type="button"
          onClick={() => setShowCollapsedPopover(!showCollapsedPopover)}
          className={`h-7 px-2.5 rounded-md border flex items-center gap-1.5 text-xs font-semibold transition-colors ${
            activeFilterCount > 0
              ? 'border-crm-blue bg-crm-blue/10 text-crm-blue'
              : 'border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#181B26] text-slate-700 dark:text-slate-300'
          }`}
        >
          <Filter size={12} />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-crm-blue text-white text-[10px] font-bold flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>

        {showCollapsedPopover && (
          <div className="absolute right-0 top-8 z-50 w-72 p-3 bg-white dark:bg-[#1E2230] border border-slate-200 dark:border-[#2A3042] rounded-lg shadow-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-900 dark:text-white">Active Filters</span>
              <button
                type="button"
                onClick={() => {
                  onSourceChange('all');
                  onUrgencyChange('all');
                  onAssignedToIdChange('all');
                }}
                className="text-[11px] text-crm-blue hover:underline"
              >
                Reset All
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Source
              </label>
              <select
                value={source}
                onChange={(e) => onSourceChange(e.target.value)}
                className="w-full h-7 px-2 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="all">All Sources</option>
                {availableSources.map((s) => (
                  <option key={s} value={s}>
                    {sourceLabels[s] || s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Urgency
              </label>
              <select
                value={urgency}
                onChange={(e) => onUrgencyChange(e.target.value)}
                className="w-full h-7 px-2 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="all">All Urgencies</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="standard">Standard</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Sales Rep
              </label>
              <select
                value={assignedToId}
                onChange={(e) => onAssignedToIdChange(e.target.value)}
                className="w-full h-7 px-2 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="all">All Sales Reps</option>
                {currentUser && currentUser.id && (
                  <option value={currentUser.id}>My Leads</option>
                )}
                {salesReps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name || r.email}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ─── RIGHT: View Toggle, Density Toggle, Refresh + Updated hh:mm ─── */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* View Toggle: Board / Table */}
        <div className="flex items-center bg-slate-100 dark:bg-[#1E2230] p-0.5 rounded-md border border-slate-200 dark:border-[#2A3042]">
          <button
            type="button"
            onClick={() => onViewChange('kanban')}
            aria-label="Board view"
            title="Board View"
            className={`p-1 rounded transition-colors ${
              view === 'kanban'
                ? 'bg-white dark:bg-crm-blue text-crm-blue dark:text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <LayoutGrid size={13} />
          </button>
          <button
            type="button"
            onClick={() => onViewChange('list')}
            aria-label="Table view"
            title="Table View"
            className={`p-1 rounded transition-colors ${
              view === 'list'
                ? 'bg-white dark:bg-crm-blue text-crm-blue dark:text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <List size={13} />
          </button>
        </div>

        {/* Density Toggle: Compact / Comfortable */}
        <div className="flex items-center bg-slate-100 dark:bg-[#1E2230] p-0.5 rounded-md border border-slate-200 dark:border-[#2A3042]">
          <button
            type="button"
            onClick={() => onDensityChange('compact')}
            className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-colors ${
              density === 'compact'
                ? 'bg-white dark:bg-crm-blue text-crm-blue dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            Compact
          </button>
          <button
            type="button"
            onClick={() => onDensityChange('comfortable')}
            className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-colors ${
              density === 'comfortable'
                ? 'bg-white dark:bg-crm-blue text-crm-blue dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            Comfortable
          </button>
        </div>

        {/* Refresh with Updated hh:mm */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#181B26] hover:bg-slate-100 transition-colors"
          title="Refresh board"
        >
          <RefreshCw size={11} className={isRefreshing ? 'animate-spin text-crm-blue' : ''} />
          <span className="hidden sm:inline">Updated {updatedTime}</span>
        </button>
      </div>
    </div>
  );
};
