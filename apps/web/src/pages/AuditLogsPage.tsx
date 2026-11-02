/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldCheck, ShieldAlert, Clock, RefreshCw, Download, Search,
  Laptop, Smartphone, Globe, Filter, CheckCircle2, XCircle, AlertTriangle,
  FileText, User, ArrowRight, Eye, ChevronDown, Check, LogOut
} from 'lucide-react';
import { authApi, auditApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { parseClientUserAgent, ParsedClientInfo } from '../utils/browserParser';

export interface AuditLogsPageProps {
  embedded?: boolean;
}

export default function AuditLogsPage({ embedded = false }: AuditLogsPageProps) {
  const { user } = useAuth();

  // Active view tab
  const [activeTab, setActiveTab] = useState<'signins' | 'audit' | 'sessions'>('signins');

  // Sign-in Logs state
  const [signIns, setSignIns] = useState<any[]>([]);
  const [loadingSignIns, setLoadingSignIns] = useState<boolean>(true);

  // Full Audit Trail state
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState<boolean>(true);
  const [selectedAuditLog, setSelectedAuditLog] = useState<any | null>(null);

  // Active Sessions state
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState<boolean>(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [browserFilter, setBrowserFilter] = useState<string>('all');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 1. Fetch Company Sign-In Logs
  const fetchSignIns = useCallback(async () => {
    setLoadingSignIns(true);
    setErrorMsg(null);
    try {
      const res = await authApi.getRecentSignIns();
      setSignIns(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      console.error('Failed to load recent sign-ins:', err);
      setErrorMsg(err?.response?.data?.message || 'Failed to load sign-in history.');
    } finally {
      setLoadingSignIns(false);
    }
  }, []);

  // 2. Fetch Full Audit Trail
  const fetchAuditLogs = useCallback(async () => {
    setLoadingAudit(true);
    try {
      const res = await auditApi.getLogs({ limit: 100 });
      const items = res.data?.items || res.data || [];
      setAuditLogs(Array.isArray(items) ? items : []);
    } catch (err: any) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoadingAudit(false);
    }
  }, []);

  // 3. Fetch Active Sessions
  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await authApi.getSessions();
      setSessions(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchSignIns();
    fetchAuditLogs();
    fetchSessions();
  }, [fetchSignIns, fetchAuditLogs, fetchSessions]);

  // Handle Revoking a session
  const handleRevokeSession = async (id: string) => {
    setRevokingId(id);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await authApi.revokeSession(id);
      setSuccessMsg('Session revoked successfully.');
      await fetchSessions();
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message || 'Failed to revoke session.');
    } finally {
      setRevokingId(null);
    }
  };

  // Enriched sign-ins with parsed browser & OS
  const enrichedSignIns = useMemo(() => {
    return signIns.map((item) => {
      const parsed: ParsedClientInfo = parseClientUserAgent(item.userAgent);
      return {
        ...item,
        parsedBrowser: parsed.browser,
        parsedOs: parsed.os,
        deviceType: parsed.deviceType,
      };
    });
  }, [signIns]);

  // Filtered Sign-Ins
  const filteredSignIns = useMemo(() => {
    return enrichedSignIns.filter((item) => {
      // Status filter
      if (statusFilter === 'success' && item.status !== 'SUCCESS') return false;
      if (statusFilter === 'failed' && item.status !== 'FAILED') return false;

      // Browser filter
      if (browserFilter !== 'all') {
        if (!item.parsedBrowser.toLowerCase().includes(browserFilter.toLowerCase())) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesUser = item.maskedIdentifier?.toLowerCase().includes(q);
        const matchesIp = item.ipAddress?.toLowerCase().includes(q);
        const matchesBrowser = item.parsedBrowser?.toLowerCase().includes(q);
        const matchesOs = item.parsedOs?.toLowerCase().includes(q);
        const matchesReason = item.reasonCode?.toLowerCase().includes(q);
        if (!matchesUser && !matchesIp && !matchesBrowser && !matchesOs && !matchesReason) {
          return false;
        }
      }
      return true;
    });
  }, [enrichedSignIns, statusFilter, browserFilter, searchQuery]);

  // Stats calculation
  const stats = useMemo(() => {
    const total = signIns.length;
    const success = signIns.filter((s) => s.status === 'SUCCESS').length;
    const failed = total - success;
    const uniqueIps = new Set(signIns.map((s) => s.ipAddress).filter(Boolean)).size;
    return { total, success, failed, uniqueIps };
  }, [signIns]);

  // Export Sign-Ins CSV
  const handleExportSignInsCsv = () => {
    if (filteredSignIns.length === 0) return;
    const header = 'Timestamp,Status,User Identifier,IP Address,Browser Name,Operating System,Device,Reason,Portal\n';
    const rows = filteredSignIns
      .map((item) => {
        const time = new Date(item.timestamp).toISOString();
        const user = `"${(item.maskedIdentifier || '').replace(/"/g, '""')}"`;
        const ip = item.ipAddress || '';
        const browser = `"${(item.parsedBrowser || '').replace(/"/g, '""')}"`;
        const os = `"${(item.parsedOs || '').replace(/"/g, '""')}"`;
        const device = item.deviceType;
        const reason = `"${(item.reasonCode || '').replace(/"/g, '""')}"`;
        const portal = item.portal || '';
        return `${time},${item.status},${user},${ip},${browser},${os},${device},${reason},${portal}`;
      })
      .join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `security-login-logs-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`space-y-6 ${embedded ? '' : 'p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto'}`}>
      {/* ═══════════════════════════════════════════════════════════════════════
          PAGE HEADER
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-[#2A3042]">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-crm-blue/15 border border-crm-blue/30 text-crm-blue flex items-center justify-center font-bold">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Security & Audit Logs
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Security logs, login attempts, active sessions, and client IP addresses.
              </p>
            </div>
          </div>
        </div>

        {/* Global Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              fetchSignIns();
              fetchAuditLogs();
              fetchSessions();
            }}
            disabled={loadingSignIns || loadingAudit || loadingSessions}
            className="px-3 py-2 rounded-xl bg-white dark:bg-[#1E2230] border border-slate-200 dark:border-[#2A3042] text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Refresh logs"
          >
            <RefreshCw
              size={13}
              className={loadingSignIns || loadingAudit || loadingSessions ? 'animate-spin text-crm-blue' : ''}
            />
            <span>Refresh</span>
          </button>

          {activeTab === 'signins' && (
            <button
              type="button"
              onClick={handleExportSignInsCsv}
              disabled={filteredSignIns.length === 0}
              className="px-3.5 py-2 rounded-xl bg-crm-blue text-white text-xs font-bold shadow-xs hover:bg-crm-blue/90 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Download size={13} />
              <span>Export CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-red-500 hover:text-red-700 font-bold ml-2 cursor-pointer">&times;</button>
        </div>
      )}
      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700 font-bold ml-2 cursor-pointer">&times;</button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          OVERVIEW STATS CARDS
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Logins */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200/80 dark:border-[#2A3042] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Sign-ins</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-crm-blue flex items-center justify-center">
              <Globe size={15} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.total}</span>
            <span className="text-[11px] text-slate-500">audited</span>
          </div>
        </div>

        {/* Successful Logins */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200/80 dark:border-[#2A3042] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Successful</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 size={15} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{stats.success}</span>
            <span className="text-[11px] text-slate-500">authenticated</span>
          </div>
        </div>

        {/* Failed Attempts */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200/80 dark:border-[#2A3042] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-red-600 dark:text-crm-coral uppercase tracking-wider">Failed Attempts</span>
            <div className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 flex items-center justify-center">
              <XCircle size={15} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-red-600 dark:text-crm-coral">{stats.failed}</span>
            <span className="text-[11px] text-slate-500">rejected</span>
          </div>
        </div>

        {/* Active Sessions */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200/80 dark:border-[#2A3042] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Active Sessions</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 flex items-center justify-center">
              <Laptop size={15} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{sessions.length}</span>
            <span className="text-[11px] text-slate-500">devices active</span>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          NAVIGATION TABS
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-[#2A3042]">
        <button
          type="button"
          onClick={() => setActiveTab('signins')}
          className={`pb-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'signins'
              ? 'border-crm-blue text-crm-blue font-extrabold'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Globe size={15} />
          <span>Company Login History ({signIns.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`pb-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'audit'
              ? 'border-crm-blue text-crm-blue font-extrabold'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <FileText size={15} />
          <span>Full Audit Trail ({auditLogs.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sessions')}
          className={`pb-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'sessions'
              ? 'border-crm-blue text-crm-blue font-extrabold'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Laptop size={15} />
          <span>Active Device Sessions ({sessions.length})</span>
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 1: COMPANY LOGIN HISTORY & DEVICE INFORMATION
          ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'signins' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="p-3 bg-white dark:bg-[#181B26] rounded-2xl border border-slate-200 dark:border-[#2A3042] flex flex-wrap items-center justify-between gap-3 shadow-2xs">
            {/* Search */}
            <div className="relative flex-1 min-w-[220px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by user, IP address, or browser name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-[#121622] border border-slate-200 dark:border-[#2A3042] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-crm-blue transition-colors"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 hidden sm:inline">Status:</span>
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-crm-blue text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                All ({enrichedSignIns.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('success')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  statusFilter === 'success'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-emerald-500/10 hover:text-emerald-600'
                }`}
              >
                Success ({stats.success})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('failed')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  statusFilter === 'failed'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-red-500/10 hover:text-red-600'
                }`}
              >
                Failed ({stats.failed})
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-[#1E2230] text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-[#2A3042]">
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">User Account</th>
                    <th className="py-3 px-4">Browser & Client</th>
                    <th className="py-3 px-4">Operating System</th>
                    <th className="py-3 px-4">IP Address</th>
                    <th className="py-3 px-4">Event Details</th>
                    <th className="py-3 px-4 text-right">Login Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#2A3042]/70">
                  {loadingSignIns ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-crm-blue" />
                        <span>Loading security login history...</span>
                      </td>
                    </tr>
                  ) : filteredSignIns.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 italic">
                        No login records matching the criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredSignIns.map((log) => {
                      const isSuccess = log.status === 'SUCCESS';
                      return (
                        <tr
                          key={log.id}
                          className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02] transition-colors"
                        >
                          {/* Status */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            {isSuccess ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60">
                                <CheckCircle2 size={11} /> SUCCESS
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800/60">
                                <XCircle size={11} /> FAILED
                              </span>
                            )}
                          </td>

                          {/* User Identifier */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-[10px]">
                                {log.maskedIdentifier ? log.maskedIdentifier.charAt(0).toUpperCase() : 'U'}
                              </div>
                              <div>
                                <span className="font-bold text-slate-900 dark:text-white font-mono">
                                  {log.maskedIdentifier}
                                </span>
                                <span className="block text-[10px] text-slate-400 capitalize">
                                  {log.portal || 'Company Portal'}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Browser Name */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {log.deviceType === 'mobile' ? (
                                <Smartphone size={14} className="text-crm-teal shrink-0" />
                              ) : (
                                <Laptop size={14} className="text-crm-blue shrink-0" />
                              )}
                              <span className="font-bold text-slate-800 dark:text-slate-200" title={log.userAgent}>
                                {log.parsedBrowser}
                              </span>
                            </div>
                          </td>

                          {/* Operating System */}
                          <td className="py-3 px-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                            <span>{log.parsedOs}</span>
                          </td>

                          {/* IP Address */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-semibold border border-slate-200 dark:border-slate-700/60">
                              {log.ipAddress || '127.0.0.1'}
                            </span>
                          </td>

                          {/* Event / Reason */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                              isSuccess
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                                : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 font-bold'
                            }`}>
                              {log.reasonCode || (isSuccess ? 'AUTHENTICATED' : 'AUTH_FAILED')}
                            </span>
                          </td>

                          {/* Timestamp */}
                          <td className="py-3 px-4 whitespace-nowrap text-right text-slate-500 font-mono text-[11px]">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 2: FULL COMPLIANCE AUDIT TRAIL
          ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="p-3 bg-white dark:bg-[#181B26] rounded-2xl border border-slate-200 dark:border-[#2A3042] flex items-center justify-between text-xs text-slate-500">
            <span>Immutable system audit log recording all administrative entity changes and mutations.</span>
            <span className="font-bold font-mono text-slate-700 dark:text-slate-300">{auditLogs.length} Records</span>
          </div>

          <div className="rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-[#1E2230] text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-[#2A3042]">
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Entity</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-4">IP Address</th>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#2A3042]/70">
                  {loadingAudit ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-crm-blue" />
                        <span>Loading audit trail...</span>
                      </td>
                    </tr>
                  ) : auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 italic">
                        No audit records recorded yet.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-mono text-xs font-bold text-crm-blue bg-crm-blue/10 px-2 py-0.5 rounded">
                            {item.action}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-800 dark:text-slate-200">
                          {item.entityName} <span className="font-mono text-[10px] text-slate-400">#{item.entityId?.slice(0, 8)}</span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-slate-700 dark:text-slate-300">
                          {item.actorName || item.actor?.name || 'System / Automated'}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-500">
                          {item.ipAddress || '127.0.0.1'}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-500">
                          {new Date(item.timestamp).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedAuditLog(item)}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-white/5 text-[11px] font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 3: ACTIVE DEVICE SESSIONS
          ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'sessions' && (
        <div className="space-y-4">
          <div className="p-3 bg-white dark:bg-[#181B26] rounded-2xl border border-slate-200 dark:border-[#2A3042] flex items-center justify-between text-xs text-slate-500">
            <span>Active authenticated browser sessions with live refresh tokens for this company.</span>
            <span className="font-bold font-mono text-slate-700 dark:text-slate-300">{sessions.length} Active Sessions</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {loadingSessions ? (
              <div className="col-span-2 py-12 text-center text-slate-400">
                <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-crm-blue" />
                <span>Loading active sessions...</span>
              </div>
            ) : sessions.length === 0 ? (
              <div className="col-span-2 py-12 text-center text-slate-400 italic bg-white dark:bg-[#181B26] rounded-2xl border border-slate-200 dark:border-[#2A3042]">
                No other active sessions detected.
              </div>
            ) : (
              sessions.map((s) => {
                const parsed = parseClientUserAgent(s.userAgent);
                return (
                  <div
                    key={s.id}
                    className="p-4 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-2xs flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-[#121622] text-crm-blue flex items-center justify-center shrink-0 border border-slate-200/60 dark:border-[#2A3042]">
                        {parsed.deviceType === 'mobile' ? <Smartphone size={20} /> : <Laptop size={20} />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">
                            {parsed.browser}
                          </span>
                          {s.isCurrent && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-black border border-emerald-300 dark:border-emerald-800">
                              Current Device
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>{parsed.os}</span>
                          <span>&bull;</span>
                          <span className="font-mono">IP: {s.ipAddress}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1 font-mono">
                          Last active: {new Date(s.lastActive).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {!s.isCurrent && (
                      <button
                        type="button"
                        onClick={() => handleRevokeSession(s.id)}
                        disabled={revokingId === s.id}
                        className="px-3 py-1.5 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-all cursor-pointer disabled:opacity-50"
                      >
                        {revokingId === s.id ? 'Revoking...' : 'Revoke Session'}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          AUDIT LOG DETAILS MODAL
          ═══════════════════════════════════════════════════════════════════════ */}
      {selectedAuditLog && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        >
          <div className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-3xl p-6 max-w-2xl w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-crm-blue" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Audit Event Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAuditLog(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block">Action</span>
                <span className="font-bold font-mono text-crm-blue">{selectedAuditLog.action}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Entity</span>
                <span className="font-bold">{selectedAuditLog.entityName} ({selectedAuditLog.entityId})</span>
              </div>
              <div>
                <span className="text-slate-400 block">Actor</span>
                <span className="font-bold">{selectedAuditLog.actorName || 'System'}</span>
              </div>
              <div>
                <span className="text-slate-400 block">IP Address</span>
                <span className="font-mono">{selectedAuditLog.ipAddress || '127.0.0.1'}</span>
              </div>
            </div>

            {selectedAuditLog.afterState && (
              <div>
                <span className="text-xs font-bold text-slate-500 block mb-1">Payload / State Details</span>
                <pre className="p-3 rounded-xl bg-slate-50 dark:bg-[#121622] border border-slate-200 dark:border-[#2A3042] text-[11px] font-mono text-slate-800 dark:text-slate-200 overflow-x-auto max-h-60">
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(selectedAuditLog.afterState), null, 2);
                    } catch {
                      return selectedAuditLog.afterState;
                    }
                  })()}
                </pre>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedAuditLog(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-white/10 hover:bg-slate-200 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
