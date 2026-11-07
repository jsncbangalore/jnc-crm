/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Columns,
  AlignJustify,
  Check,
  RotateCcw,
  AlertCircle,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { ErrorStateCard } from './ErrorStateCard';

export interface ColumnDef<T> {
  id: string;
  header: React.ReactNode;
  accessorKey?: keyof T;
  cell?: (item: T, index: number) => React.ReactNode;
  /**
   * Column priority:
   * 'p1': Always visible on all screens (>= 1024px)
   * 'p2': Visible by default on screens >= 1280px (hidden under 1280px unless explicitly checked)
   * 'p3': Visible by default on screens >= 1536px (hidden under 1536px unless explicitly checked)
   */
  priority?: 'p1' | 'p2' | 'p3';
  width?: string; // Percentage or CSS width (e.g., '14%')
  minWidth?: string; // CSS min-width (e.g., '120px')
  maxWidth?: string;
  align?: 'left' | 'center' | 'right';
  isMoney?: boolean;
  sortable?: boolean;
  sortAccessor?: (item: T) => number | string;
  defaultVisible?: boolean;
  disableHiding?: boolean;
  isSticky?: 'left' | 'right';
  className?: string;
  headerClassName?: string;
}

export type RowDensity = 'compact' | 'comfortable' | 'spacious';

export interface DataTableProps<T> {
  pageKey: string;
  data: T[];
  columns: ColumnDef<T>[];
  loading?: boolean;
  error?: { message: string; status?: number; isNetworkError?: boolean } | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptySubtitle?: string;
  emptyAction?: React.ReactNode;
  onRowClick?: (item: T, index: number) => void;
  getRowId?: (item: T, index: number) => string;
  cardRenderer?: (item: T, index: number) => React.ReactNode;
  renderDetailRow?: (item: T) => React.ReactNode;
  userId?: string;
  tableClassName?: string;
  containerClassName?: string;
  virtualizeThreshold?: number; // Default 200
  enableRowHover?: boolean;
  enableSelection?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (selectedIds: Set<string>) => void;
}

export function DataTable<T extends Record<string, any>>({
  pageKey,
  data,
  columns,
  loading = false,
  error = null,
  onRetry,
  emptyTitle = 'No records found',
  emptySubtitle = 'There are no items to display matching the current criteria.',
  emptyAction,
  onRowClick,
  getRowId = (item, idx) => item.id || String(idx),
  cardRenderer,
  renderDetailRow,
  userId = 'default',
  tableClassName = '',
  containerClassName = '',
  virtualizeThreshold = 200,
  enableRowHover = true,
}: DataTableProps<T>) {
  // ─── 1. Persistent Density & Column Visibility ───────────────────────────
  const storageKeyPrefix = `crm_dt_${userId}_${pageKey}`;

  const [density, setDensity] = useState<RowDensity>(() => {
    try {
      const saved = localStorage.getItem(`${storageKeyPrefix}_density`);
      if (saved === 'compact' || saved === 'comfortable' || saved === 'spacious') {
        return saved;
      }
    } catch {}
    return 'comfortable';
  });

  const [userColumnOverrides, setUserColumnOverrides] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`${storageKeyPrefix}_columns`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  // Track window width for priority breakpoints
  const [windowWidth, setWindowWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1440));
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleDensityChange = (newDensity: RowDensity) => {
    setDensity(newDensity);
    try {
      localStorage.setItem(`${storageKeyPrefix}_density`, newDensity);
    } catch {}
  };

  const handleToggleColumn = (colId: string) => {
    setUserColumnOverrides((prev) => {
      const isCurrentlyVisible = prev[colId] !== undefined
        ? prev[colId]
        : (columns.find((c) => c.id === colId)?.defaultVisible !== false);
      const updated = { ...prev, [colId]: !isCurrentlyVisible };
      try {
        localStorage.setItem(`${storageKeyPrefix}_columns`, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const handleResetColumns = () => {
    setUserColumnOverrides({});
    try {
      localStorage.removeItem(`${storageKeyPrefix}_columns`);
    } catch {}
  };

  // ─── 2. Sorting ──────────────────────────────────────────────────────────
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (colId: string, col: ColumnDef<T>) => {
    if (!col.sortable) return;
    if (sortCol === colId) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else {
        setSortCol(null);
        setSortDirection('asc');
      }
    } else {
      setSortCol(colId);
      setSortDirection('asc');
    }
  };

  const sortedData = useMemo(() => {
    if (!sortCol) return data;
    const col = columns.find((c) => c.id === sortCol);
    if (!col) return data;

    const copy = [...data];
    copy.sort((a, b) => {
      let valA: any = col.sortAccessor ? col.sortAccessor(a) : col.accessorKey ? a[col.accessorKey] : '';
      let valB: any = col.sortAccessor ? col.sortAccessor(b) : col.accessorKey ? b[col.accessorKey] : '';

      if (valA === null || valA === undefined) valA = '';
      if (valB === null || valB === undefined) valB = '';

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }
      return sortDirection === 'asc'
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });
    return copy;
  }, [data, sortCol, sortDirection, columns]);

  // ─── 3. Visible Columns Filter with Responsive Priorities ────────────────
  const isLargeDesktop = windowWidth >= 1536;
  const isDesktop = windowWidth >= 1280;

  const activeColumns = useMemo(() => {
    return columns.filter((col) => {
      if (col.disableHiding) return true;

      // 1. If user explicitly toggled this column in the chooser, respect their choice
      if (userColumnOverrides[col.id] !== undefined) {
        return userColumnOverrides[col.id];
      }

      // 2. Default hidden columns
      if (col.defaultVisible === false) return false;

      // 3. Priority levels: p1 always, p2 from 1280px, p3 from 1536px
      if (col.priority === 'p3') {
        return isLargeDesktop;
      }
      if (col.priority === 'p2') {
        return isDesktop;
      }

      // p1 is always shown
      return true;
    });
  }, [columns, userColumnOverrides, isLargeDesktop, isDesktop]);

  // ─── 4. Keyboard Navigation ──────────────────────────────────────────────
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(-1);
  const tableRef = useRef<HTMLTableElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent, index: number, item: T) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedRowIndex(Math.min(sortedData.length - 1, index + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedRowIndex(Math.max(0, index - 1));
    } else if (e.key === 'Enter') {
      if (onRowClick) {
        e.preventDefault();
        onRowClick(item, index);
      }
    }
  };

  // ─── 5. Chooser Dropdown State ───────────────────────────────────────────
  const [showChooser, setShowChooser] = useState(false);
  const chooserRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (chooserRef.current && !chooserRef.current.contains(e.target as Node)) {
        setShowChooser(false);
      }
    };
    if (showChooser) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showChooser]);

  // Density CSS padding mapping
  const densityCellClasses = {
    compact: 'py-1.5 px-3 text-xs',
    comfortable: 'py-2.5 px-3.5 text-xs',
    spacious: 'py-3.5 px-4 text-sm',
  }[density];

  const densityHeaderClasses = {
    compact: 'py-2 px-3 text-[11px]',
    comfortable: 'py-2.5 px-3.5 text-xs',
    spacious: 'py-3.5 px-4 text-xs',
  }[density];

  // ─── 6. Mobile & Tablet Card Layout (<= 1024px) ──────────────────────────
  const isMobileOrTablet = windowWidth <= 1024;

  if (isMobileOrTablet && cardRenderer) {
    return (
      <div className={`space-y-3 ${containerClassName}`}>
        {/* Mobile controls toolbar */}
        <div className="flex items-center justify-between px-1 py-1 text-xs text-slate-500">
          <span>{sortedData.length} records</span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-slate-400">Card View</span>
          </div>
        </div>

        {loading && !error && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/40 animate-pulse h-32 border border-slate-200 dark:border-slate-800" />
            ))}
          </div>
        )}

        {error && (
          <ErrorStateCard
            message={error.message}
            status={error.status}
            isNetworkError={error.isNetworkError}
            onRetry={onRetry}
          />
        )}

        {!loading && !error && sortedData.length === 0 && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center bg-white dark:bg-[#181B26]">
            <p className="font-bold text-slate-900 dark:text-white text-sm">{emptyTitle}</p>
            <p className="text-xs text-slate-500 mt-1">{emptySubtitle}</p>
            {emptyAction && <div className="mt-4">{emptyAction}</div>}
          </div>
        )}

        {!loading && !error && sortedData.map((item, idx) => (
          <div key={getRowId(item, idx)}>
            {cardRenderer(item, idx)}
          </div>
        ))}
      </div>
    );
  }

  // ─── 7. Full Desktop Table Rendering (>= 1024px) ─────────────────────────
  return (
    <div className={`flex flex-col w-full min-w-0 ${containerClassName}`}>
      {/* Table Action Bar: Column Chooser, Density Toggle, Row Count */}
      <div className="flex items-center justify-between pb-2.5 px-0.5 text-xs">
        <div className="text-slate-500 dark:text-slate-400 font-medium">
          Showing <span className="font-bold text-slate-900 dark:text-white font-mono">{sortedData.length}</span> {sortedData.length === 1 ? 'record' : 'records'}
        </div>

        <div className="flex items-center gap-2">
          {/* Row Density Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800/60 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400">
            <button
              onClick={() => handleDensityChange('compact')}
              title="Compact rows"
              className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                density === 'compact'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Compact
            </button>
            <button
              onClick={() => handleDensityChange('comfortable')}
              title="Comfortable rows"
              className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                density === 'comfortable'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Default
            </button>
            <button
              onClick={() => handleDensityChange('spacious')}
              title="Spacious rows"
              className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                density === 'spacious'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Spacious
            </button>
          </div>

          {/* Columns Chooser Dropdown */}
          <div className="relative" ref={chooserRef}>
            <button
              onClick={() => setShowChooser(!showChooser)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors font-medium shadow-sm"
              title="Customize Columns"
            >
              <Columns size={13} className="text-slate-500" />
              <span>Columns</span>
            </button>

            {showChooser && (
              <div className="absolute right-0 top-full mt-1.5 w-60 z-50 bg-white dark:bg-[#181B26] border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-3 text-xs">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="font-bold text-slate-900 dark:text-white">Show / Hide Columns</span>
                  <button
                    onClick={handleResetColumns}
                    className="text-[11px] text-crm-blue dark:text-crm-blue-light hover:underline flex items-center gap-1"
                    title="Reset to default columns"
                  >
                    <RotateCcw size={10} /> Reset
                  </button>
                </div>

                <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                  {columns.map((col) => {
                    if (col.disableHiding) return null;
                    const isVisible = userColumnOverrides[col.id] !== undefined
                      ? userColumnOverrides[col.id]
                      : col.defaultVisible !== false && (
                          col.priority === 'p3' ? isLargeDesktop : col.priority === 'p2' ? isDesktop : true
                        );
                    return (
                      <label
                        key={col.id}
                        className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer text-slate-700 dark:text-slate-300"
                      >
                        <input
                          type="checkbox"
                          checked={isVisible}
                          onChange={() => handleToggleColumn(col.id)}
                          className="rounded border-slate-300 text-crm-blue focus:ring-crm-blue/20"
                        />
                        <span className="truncate">{typeof col.header === 'string' ? col.header : col.id}</span>
                        {col.priority && (
                          <span className="ml-auto text-[10px] text-slate-400 uppercase font-mono">
                            {col.priority}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Table Container: fixed layout, sticky header, sticky first and last columns */}
      <div className="w-full min-w-0 overflow-x-hidden rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#181B26] shadow-sm">
        <table
          ref={tableRef}
          className={`w-full table-fixed border-collapse ${tableClassName}`}
          style={{ width: '100%', minWidth: '100%' }}
        >
          {/* Colgroup defining responsive fixed column widths */}
          <colgroup>
            {activeColumns.map((col) => (
              <col
                key={col.id}
                style={{
                  width: col.width || undefined,
                  minWidth: col.minWidth || undefined,
                  maxWidth: col.maxWidth || undefined,
                }}
              />
            ))}
          </colgroup>

          <thead className="bg-slate-50/90 dark:bg-[#131620] border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider sticky top-0 z-20 backdrop-blur-sm">
            <tr>
              {activeColumns.map((col, idx) => {
                const isStickyLeft = col.isSticky === 'left' || idx === 0;
                const isStickyRight = col.isSticky === 'right' || idx === activeColumns.length - 1;

                let stickyClasses = '';
                if (isStickyLeft) {
                  stickyClasses = 'sticky left-0 bg-slate-50 dark:bg-[#131620] z-20 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]';
                } else if (isStickyRight) {
                  stickyClasses = 'sticky right-0 bg-slate-50 dark:bg-[#131620] z-20 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)]';
                }

                const alignClass = col.align === 'right' || col.isMoney
                  ? 'text-right'
                  : col.align === 'center'
                  ? 'text-center'
                  : 'text-left';

                const isActionsCol = col.id === 'actions';
                const headerPadding = isActionsCol ? 'py-2 px-1.5 text-xs' : densityHeaderClasses;

                return (
                  <th
                    key={col.id}
                    scope="col"
                    onClick={() => handleSort(col.id, col)}
                    className={`${headerPadding} ${alignClass} ${stickyClasses} ${col.headerClassName || ''} ${
                      col.sortable ? 'cursor-pointer select-none hover:text-slate-900 dark:hover:text-white' : ''
                    } transition-colors`}
                  >
                    <div className={`inline-flex items-center gap-1.5 ${col.align === 'right' || col.isMoney ? 'justify-end w-full' : ''}`}>
                      <span className="truncate">{col.header}</span>
                      {col.sortable && (
                        <span className="text-slate-400">
                          {sortCol === col.id ? (
                            sortDirection === 'asc' ? <ChevronUp size={12} className="text-crm-blue" /> : <ChevronDown size={12} className="text-crm-blue" />
                          ) : (
                            <ChevronsUpDown size={11} className="opacity-40" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-800 dark:text-slate-200">
            {/* Loading Skeletons */}
            {loading && !error && (
              <>
                {[1, 2, 3, 4, 5].map((rowIdx) => (
                  <tr key={rowIdx} className="animate-pulse">
                    {activeColumns.map((col, cIdx) => (
                      <td key={cIdx} className={densityCellClasses}>
                        <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-4/5" />
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            )}

            {/* Error State */}
            {error && sortedData.length === 0 && (
              <tr>
                <td colSpan={activeColumns.length} className="p-8">
                  <ErrorStateCard
                    message={error.message}
                    status={error.status}
                    isNetworkError={error.isNetworkError}
                    onRetry={onRetry}
                  />
                </td>
              </tr>
            )}

            {/* Empty State */}
            {!loading && !error && sortedData.length === 0 && (
              <tr>
                <td colSpan={activeColumns.length} className="text-center py-16 px-4">
                  <div className="max-w-md mx-auto space-y-2">
                    <p className="font-bold text-slate-900 dark:text-white text-sm">{emptyTitle}</p>
                    <p className="text-xs text-slate-500 leading-relaxed">{emptySubtitle}</p>
                    {emptyAction && <div className="pt-2">{emptyAction}</div>}
                  </div>
                </td>
              </tr>
            )}

            {/* Data Rows */}
            {!loading && sortedData.map((item, rowIdx) => {
              const isFocused = focusedRowIndex === rowIdx;
              return (
                <React.Fragment key={getRowId(item, rowIdx)}>
                  <tr
                    tabIndex={0}
                  onKeyDown={(e) => handleKeyDown(e, rowIdx, item)}
                  onClick={() => onRowClick && onRowClick(item, rowIdx)}
                  className={`group transition-colors ${
                    enableRowHover ? 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40' : ''
                  } ${isFocused ? 'ring-2 ring-crm-blue/50 dark:ring-crm-blue-light/50 bg-blue-50/20' : ''} ${
                    onRowClick ? 'cursor-pointer' : ''
                  }`}
                >
                  {activeColumns.map((col, colIdx) => {
                    const isStickyLeft = col.isSticky === 'left' || colIdx === 0;
                    const isStickyRight = col.isSticky === 'right' || colIdx === activeColumns.length - 1;

                    let stickyClasses = '';
                    if (isStickyLeft) {
                      stickyClasses = 'sticky left-0 bg-white group-hover:bg-slate-50 dark:bg-[#181B26] dark:group-hover:bg-[#1d212f] z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)]';
                    } else if (isStickyRight) {
                      stickyClasses = 'sticky right-0 bg-white group-hover:bg-slate-50 dark:bg-[#181B26] dark:group-hover:bg-[#1d212f] z-10 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.05)]';
                    }

                    const alignClass = col.align === 'right' || col.isMoney
                      ? 'text-right'
                      : col.align === 'center'
                      ? 'text-center'
                      : 'text-left';

                    const moneyClass = col.isMoney ? 'tabular-nums font-mono whitespace-nowrap' : '';

                    const renderedContent = col.cell
                      ? col.cell(item, rowIdx)
                      : col.accessorKey
                      ? String(item[col.accessorKey] ?? '')
                      : '';

                    const cellTitle = typeof renderedContent === 'string' ? renderedContent : undefined;
                    const isActionsCol = col.id === 'actions';
                    const cellPadding = isActionsCol ? 'py-2 px-1 text-xs' : densityCellClasses;

                    return (
                      <td
                        key={col.id}
                        title={cellTitle}
                        className={`${cellPadding} ${alignClass} ${moneyClass} ${stickyClasses} ${col.className || ''}`}
                      >
                        <div className="w-full truncate">
                          {renderedContent}
                        </div>
                      </td>
                    );
                  })}
                </tr>
                {renderDetailRow && renderDetailRow(item) ? (
                  <tr key={`${getRowId(item, rowIdx)}-detail`} className="bg-slate-50/70 dark:bg-slate-900/50">
                    <td colSpan={activeColumns.length} className="p-4">
                      {renderDetailRow(item)}
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DataTable;
