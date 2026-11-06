/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  Search,
  RefreshCw,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Clock,
  User,
  Building,
  FileText,
  AlertOctagon,
  Layers,
  Hash,
} from 'lucide-react';
import { systemErrorsApi, invoicesApi } from '../services/api';

interface SystemErrorItem {
  id: string;
  referenceId: string;
  route: string;
  page: string;
  message: string;
  componentStack?: string;
  buildVersion?: string;
  createdAt: string;
  user?: { name: string; code: string } | null;
  tenant?: { name: string; code: string } | null;
}

interface SeriesAuditResponse {
  officialPrefix: string;
  totalInvoices: number;
  totalSeries: number;
  manualFormatCount: number;
  totalGaps: number;
  series: Array<{
    seriesKey: string;
    prefix: string;
    financialYear: string;
    totalDocuments: number;
    activeCount: number;
    voidedCount: number;
    minNumber: number | null;
    maxNumber: number | null;
    gaps: Array<{ sequenceNumber: number; reason: string }>;
    isManualSeries: boolean;
    documents: Array<{ id: string; invoiceNumber: string; isVoided: boolean; isManualFormat: boolean; date: string }>;
  }>;
}

export default function SystemErrorsPage() {
  const [activeTab, setActiveTab] = useState<'errors' | 'reconciliation'>('errors');
  const [errors, setErrors] = useState<SystemErrorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Reconciliation state
  const [seriesAudit, setSeriesAudit] = useState<SeriesAuditResponse | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [expandedSeriesKey, setExpandedSeriesKey] = useState<string | null>(null);

  const fetchErrors = useCallback(async () => {
    setLoading(true);
    try {
      const res = await systemErrorsApi.getErrors({
        search: search.trim() || undefined,
        page,
        limit: 25,
      });
      setErrors(res.data?.items || []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      console.error('Failed to load system errors:', err);
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  const fetchSeriesAudit = useCallback(async () => {
    setLoadingAudit(true);
    try {
      const res = await invoicesApi.getSeriesAudit();
      const raw = res.data || {};
      const groups = raw.seriesGroups || raw.series || [];
      const totalGaps = groups.reduce((sum: number, g: any) => sum + (g.gaps?.length || 0), 0);
      setSeriesAudit({
        officialPrefix: raw.officialPrefix || 'INV',
        totalInvoices: raw.totalInvoices || 0,
        totalSeries: groups.length,
        manualFormatCount: raw.manualCount ?? raw.manualFormatCount ?? 0,
        totalGaps,
        series: groups,
      });
    } catch (err) {
      console.error('Failed to load invoice series audit:', err);
    } finally {
      setLoadingAudit(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'errors') {
      fetchErrors();
    } else {
      fetchSeriesAudit();
    }
  }, [activeTab, fetchErrors, fetchSeriesAudit]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-950 dark:text-white tracking-tight">
                System Errors
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Live diagnostics and recorded client/server errors indexed by reference ID.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              if (activeTab === 'errors') fetchErrors();
              else fetchSeriesAudit();
            }}
            disabled={activeTab === 'errors' ? loading : loadingAudit}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition shadow-2xs"
          >
            <RefreshCw size={13} className={(activeTab === 'errors' ? loading : loadingAudit) ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('errors')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
            activeTab === 'errors'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <ShieldAlert size={14} />
          <span>Recorded Errors</span>
          <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            {total}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('reconciliation')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
            activeTab === 'reconciliation'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Hash size={14} />
          <span>Invoice Number Reconciliation</span>
          {seriesAudit && (seriesAudit.manualFormatCount > 0 || seriesAudit.totalGaps > 0) && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 font-semibold">
              {seriesAudit.manualFormatCount + seriesAudit.totalGaps} flags
            </span>
          )}
        </button>
      </div>

      {activeTab === 'errors' ? (
        <>
          {/* Filter and Search Bar */}
          <div className="flex items-center gap-3 p-3 bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl shadow-xs">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by reference ID, page, route or message..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div className="text-xs font-medium text-slate-500 px-2 shrink-0">
              Total: <span className="font-bold text-slate-800 dark:text-white">{total}</span>
            </div>
          </div>

          {/* Errors List */}
          <div className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl shadow-xs overflow-hidden">
            {loading && errors.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-500">
                <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-indigo-500" />
                Loading system errors...
              </div>
            ) : errors.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-500">
                <AlertTriangle size={24} className="mx-auto mb-2 text-slate-400" />
                No system or client errors found matching criteria.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {errors.map((item) => {
                  const isExpanded = expandedId === item.id;
                  const isCopied = copiedId === item.id;

                  return (
                    <div key={item.id} className="p-4 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800/60">
                              {item.referenceId || item.id}
                            </span>
                            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                              Page: {item.page}
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono">
                              {item.route}
                            </span>
                          </div>

                          <p className="text-xs text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
                            {item.message}
                          </p>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                            <span className="flex items-center gap-1">
                              <Clock size={12} />
                              {new Date(item.createdAt).toLocaleString('en-IN')}
                            </span>
                            {item.user && (
                              <span className="flex items-center gap-1">
                                <User size={12} />
                                {item.user.name} ({item.user.code})
                              </span>
                            )}
                            {item.tenant && (
                              <span className="flex items-center gap-1">
                                <Building size={12} />
                                {item.tenant.name}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleCopy(item.referenceId || item.id, item.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition shadow-2xs"
                            title="Copy Reference ID"
                          >
                            {isCopied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                            <span>{isCopied ? 'Copied' : 'Copy Ref'}</span>
                          </button>

                          {item.componentStack && (
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : item.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition shadow-2xs"
                            >
                              <span>Stack</span>
                              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                          )}
                        </div>
                      </div>

                      {isExpanded && item.componentStack && (
                        <div className="mt-3 p-3 rounded-xl bg-slate-900 text-slate-200 font-mono text-[10px] overflow-x-auto border border-slate-800 whitespace-pre-wrap">
                          {item.componentStack}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Invoice Number Reconciliation Tab */
        <div className="space-y-6">
          {loadingAudit && !seriesAudit ? (
            <div className="p-12 text-center text-xs text-slate-500 bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl">
              <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-indigo-500" />
              Auditing invoice series and sequence continuity...
            </div>
          ) : !seriesAudit ? (
            <div className="p-12 text-center text-xs text-slate-500 bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl">
              <AlertTriangle size={24} className="mx-auto mb-2 text-slate-400" />
              Failed to load invoice series reconciliation audit.
            </div>
          ) : (
            <>
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
                <div className="p-4 bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl shadow-xs">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <Hash size={12} /> Standard Prefix
                  </div>
                  <div className="text-xl font-black text-slate-900 dark:text-white font-mono">
                    {seriesAudit.officialPrefix}
                  </div>
                </div>

                <div className="p-4 bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl shadow-xs">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <FileText size={12} /> Total Invoices
                  </div>
                  <div className="text-xl font-black text-slate-900 dark:text-white">
                    {seriesAudit.totalInvoices}
                  </div>
                </div>

                <div className="p-4 bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl shadow-xs">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <Layers size={12} /> Series Count
                  </div>
                  <div className="text-xl font-black text-slate-900 dark:text-white">
                    {seriesAudit.totalSeries}
                  </div>
                </div>

                <div className={`p-4 border rounded-2xl shadow-xs ${
                  seriesAudit.manualFormatCount > 0
                    ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/60'
                    : 'bg-white dark:bg-[#181B26] border-slate-200 dark:border-[#2A3042]'
                }`}>
                  <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <AlertOctagon size={12} /> Manual Formats
                  </div>
                  <div className="text-xl font-black text-amber-600 dark:text-amber-400">
                    {seriesAudit.manualFormatCount}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">e.g. non-standard prefixes</p>
                </div>

                <div className={`p-4 border rounded-2xl shadow-xs ${
                  seriesAudit.totalGaps > 0
                    ? 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/60'
                    : 'bg-white dark:bg-[#181B26] border-slate-200 dark:border-[#2A3042]'
                }`}>
                  <div className="text-[11px] font-semibold text-rose-700 dark:text-rose-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <AlertTriangle size={12} /> Number Gaps
                  </div>
                  <div className="text-xl font-black text-rose-600 dark:text-rose-400">
                    {seriesAudit.totalGaps}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">Voided or missing numbers</p>
                </div>
              </div>

              {/* Series List */}
              <div className="space-y-4">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Document Series & Gaps Audit</span>
                </h2>

                {(seriesAudit.series || []).map((grp) => {
                  const isExpanded = expandedSeriesKey === grp.seriesKey;

                  return (
                    <div
                      key={grp.seriesKey}
                      className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl p-4 shadow-xs space-y-3"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                              {grp.seriesKey}
                            </span>
                            {grp.isManualSeries && (
                              <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800/60 px-2 py-0.5 rounded-md flex items-center gap-1">
                                <AlertOctagon size={11} /> Flagged Manual Series
                              </span>
                            )}
                            {grp.financialYear && (
                              <span className="text-[10px] font-medium text-slate-500 bg-slate-50 dark:bg-slate-900 px-2 py-0.5 rounded-md">
                                FY: {grp.financialYear}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                            <span>Range: <strong className="text-slate-800 dark:text-slate-200 font-mono">#{grp.minNumber ?? 0} — #{grp.maxNumber ?? 0}</strong></span>
                            <span>•</span>
                            <span>Total Docs: <strong className="text-slate-800 dark:text-slate-200">{grp.totalDocuments}</strong></span>
                            <span>•</span>
                            <span>Active: <strong className="text-emerald-600 dark:text-emerald-400">{grp.activeCount}</strong></span>
                            {grp.voidedCount > 0 && (
                              <>
                                <span>•</span>
                                <span>Voided: <strong className="text-rose-600 dark:text-rose-400">{grp.voidedCount}</strong></span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setExpandedSeriesKey(isExpanded ? null : grp.seriesKey)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition shadow-2xs"
                          >
                            <span>{isExpanded ? 'Hide Details' : 'View Documents & Gaps'}</span>
                            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>
                        </div>
                      </div>

                      {/* Gaps Alert Banner if gaps exist */}
                      {grp.gaps.length > 0 && (
                        <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60">
                          <div className="text-xs font-bold text-rose-800 dark:text-rose-300 flex items-center gap-1.5 mb-1.5">
                            <AlertTriangle size={13} /> {grp.gaps.length} Sequence Gap(s) Detected in Series:
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {grp.gaps.map((gap) => (
                              <span
                                key={gap.sequenceNumber}
                                className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-400 font-medium"
                              >
                                #{gap.sequenceNumber} ({gap.reason})
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Expandable Document List */}
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                            Recorded Documents in this Series:
                          </div>
                          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
                            {grp.documents.map((doc) => (
                              <div
                                key={doc.id}
                                className="py-2 flex items-center justify-between text-xs"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                                    {doc.invoiceNumber}
                                  </span>
                                  {doc.isManualFormat && (
                                    <span className="text-[10px] text-amber-700 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.2 rounded font-semibold">
                                      manual
                                    </span>
                                  )}
                                  {doc.isVoided && (
                                    <span className="text-[10px] text-rose-700 bg-rose-50 dark:bg-rose-950/60 px-1.5 py-0.2 rounded font-semibold">
                                      voided
                                    </span>
                                  )}
                                </div>
                                <span className="text-slate-400 font-mono text-[11px]">
                                  {doc.date}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
