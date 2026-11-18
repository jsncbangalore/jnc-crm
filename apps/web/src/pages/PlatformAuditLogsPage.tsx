/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import {
  ShieldAlert,
  ShieldCheck,
  Search,
  Filter,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Eye,
  RefreshCw,
  Calendar,
  Lock,
  Building2,
  Users,
  HardDrive,
  FileText,
  Key,
  X,
  ChevronLeft,
  ChevronRight,
  Database,
  Fingerprint,
  Mail,
} from 'lucide-react';
import { platformApi } from '../services/api';
import { usePopup } from '../contexts/PopupContext';

export interface AuditRecord {
  id: string;
  timestamp: string;
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  targetTenantId?: string | null;
  targetTenantCode?: string | null;
  summary: string;
  details?: string | null;
  outcome: 'success' | 'denied' | 'failed';
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  prevHash?: string | null;
  hash: string;
}

const DANGEROUS_ACTIONS = new Set([
  'DELETE_TENANT',
  'PERMANENT_DELETE_TENANT',
  'DELETE_TENANT_USER',
  'IMPERSONATION_START',
  'RESET_TENANT_ADMIN_PASSWORD',
  'RESET_PLATFORM_ADMIN_PASSWORD',
  'DELETE_PLATFORM_ADMIN',
  'SUSPEND_TENANT',
  'PLATFORM_ACCOUNT_LOCKED',
  'PLATFORM_SESSION_CONFLICT',
]);

const ACTION_LABELS: Record<string, string> = {
  CREATE_TENANT: 'Create Company',
  UPDATE_TENANT: 'Update Company',
  SUSPEND_TENANT: 'Suspend Company',
  ACTIVATE_TENANT: 'Activate Company',
  CHANGE_PLAN: 'Change Plan',
  CHANGE_SEAT_LIMIT: 'Change Seat Limit',
  DELETE_TENANT: 'Deactivate Company',
  PERMANENT_DELETE_TENANT: 'Permanent Delete Company',
  CREATE_TENANT_USER: 'Create Company User',
  DELETE_TENANT_USER: 'Delete Company User',
  RESET_TENANT_ADMIN_PASSWORD: 'Reset Company Admin Password',
  IMPERSONATION_START: 'Impersonation Start',
  IMPERSONATION_END: 'Impersonation End',
  CREATE_PLATFORM_ADMIN: 'Create Platform Admin',
  TOGGLE_PLATFORM_ADMIN_ACTIVE: 'Toggle Admin Active',
  RESET_PLATFORM_ADMIN_PASSWORD: 'Reset Admin Password',
  DELETE_PLATFORM_ADMIN: 'Delete Platform Admin',
  PLATFORM_MAIL_TEST: 'Test Mail Dispatch',
  BACKUP_CREATE: 'Manual Backup Create',
  BACKUP_RESTORE_DRILL: 'Restore Drill Run',
  BACKUP_DOWNLOAD: 'Backup Download',
  PLATFORM_LOGIN_SUCCESS: 'Platform Login Success',
  PLATFORM_LOGIN_FAILED: 'Platform Login Failed',
  PLATFORM_ACCOUNT_LOCKED: 'Platform Account Locked',
  PLATFORM_2FA_VERIFY: '2FA Verification',
  PLATFORM_2FA_CODE_SENT: '2FA Code Sent',
  PLATFORM_2FA_SETUP_INITIATED: '2FA Setup Initiated',
  PLATFORM_2FA_ENABLED: '2FA Enabled',
  PLATFORM_STEP_UP_SUCCESS: 'Step-Up Success',
  PLATFORM_STEP_UP_FAILED: 'Step-Up Failed',
  PLATFORM_LOGOUT: 'Platform Logout',
  PLATFORM_LOGOUT_ALL: 'Platform Logout All',
  PLATFORM_SESSION_CONFLICT: 'Session Conflict',
  PLATFORM_AUDIT_EXPORT: 'Audit Log Export',
};

export default function PlatformAuditLogsPage() {
  const { showAlert } = usePopup();

  // Navigation tab
  const [activeTab, setActiveTab] = useState<'audit_trail' | 'security_events' | 'company_activity' | 'integrity' | 'email_delivery'>('audit_trail');

  // Mail Delivery Diagnostics State
  const [mailStatus, setMailStatus] = useState<any>(null);
  const [loadingMailStatus, setLoadingMailStatus] = useState(false);
  const [sendingTestMail, setSendingTestMail] = useState(false);

  // Audit Logs State
  const [logs, setLogs] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [tenantFilter, setTenantFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Drawer Detail State
  const [selectedRecord, setSelectedRecord] = useState<AuditRecord | null>(null);

  // Integrity Check State
  const [verifying, setVerifying] = useState(false);
  const [integrityResult, setIntegrityResult] = useState<{
    valid: boolean;
    totalChecked: number;
    brokenRowId?: string;
    brokenIndex?: number;
    reason?: string;
    message: string;
  } | null>(null);

  // Export State
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportStepUpToken, setExportStepUpToken] = useState('');
  const [exporting, setExporting] = useState(false);

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const category =
        activeTab === 'security_events' ? 'security' : activeTab === 'company_activity' ? 'company' : undefined;

      const { data } = await platformApi.listAuditLogs({
        page,
        limit,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        action: actionFilter || undefined,
        tenantCode: tenantFilter || undefined,
        outcome: outcomeFilter || undefined,
        search: search.trim() || undefined,
        category,
      });

      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to load platform security and audit logs.';
      const reqId = err?.response?.headers?.['x-request-id'] || err?.config?.headers?.['x-request-id'];
      setError({ message: msg, requestId: reqId });
    } finally {
      setLoading(false);
    }
  }, [page, limit, startDate, endDate, actionFilter, tenantFilter, outcomeFilter, search, activeTab]);

  const fetchMailStatus = useCallback(async () => {
    setLoadingMailStatus(true);
    try {
      const { data } = await platformApi.getMailStatus();
      setMailStatus(data);
    } catch {}
    finally {
      setLoadingMailStatus(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    fetchMailStatus();
  }, [fetchLogs, fetchMailStatus]);

  const handleSendTestEmail = async () => {
    setSendingTestMail(true);
    try {
      const res = await platformApi.sendMailTest();
      showAlert('Mail Test Sent', `Operational test email dispatched successfully (${res.data?.provider || 'SMTP'}). Check inbox.`, 'success');
      fetchMailStatus();
    } catch (err: any) {
      showAlert('Mail Test Failed', err?.response?.data?.message || 'Could not send test email. Verify provider configuration.', 'error');
    } finally {
      setSendingTestMail(false);
    }
  };

  // Run integrity verification
  const handleVerifyIntegrity = async () => {
    setVerifying(true);
    try {
      const { data } = await platformApi.verifyAuditIntegrity();
      setIntegrityResult(data);
    } catch (err: any) {
      showAlert('Verification Error', err?.response?.data?.message || 'Could not verify hash chain.', 'error');
    } finally {
      setVerifying(false);
    }
  };

  // Run export
  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exportStepUpToken.trim()) {
      showAlert('2-Step Required', 'Please enter your 2-step verification code to export audit logs.', 'warning');
      return;
    }
    setExporting(true);
    try {
      const category =
        activeTab === 'security_events' ? 'security' : activeTab === 'company_activity' ? 'company' : undefined;

      const response = await platformApi.exportAuditLogs(
        {
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          action: actionFilter || undefined,
          tenantCode: tenantFilter || undefined,
          outcome: outcomeFilter || undefined,
          search: search.trim() || undefined,
          category,
        },
        exportStepUpToken.trim(),
      );

      // Download file
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `platform-audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      showAlert('Export Completed', 'Platform audit logs exported to CSV successfully.', 'success');
      setExportModalOpen(false);
      setExportStepUpToken('');
      fetchLogs();
    } catch (err: any) {
      showAlert(
        'Export Failed',
        err?.response?.data?.message || 'Step-up verification failed. Please verify your 2-step verification code.',
        'error',
      );
    } finally {
      setExporting(false);
    }
  };

  // Company Activity Aggregation
  const companySummary = useMemo(() => {
    const map = new Map<string, { total: number; risky: number; lastAction: string; lastSeen: string; name?: string }>();
    for (const log of logs) {
      const code = log.targetTenantCode || 'GLOBAL';
      const existing = map.get(code) || { total: 0, risky: 0, lastAction: log.action, lastSeen: log.timestamp };
      existing.total += 1;
      if (DANGEROUS_ACTIONS.has(log.action)) {
        existing.risky += 1;
      }
      map.set(code, existing);
    }
    return Array.from(map.entries()).map(([code, stats]) => ({
      code,
      ...stats,
    }));
  }, [logs]);

  return (
    <div className="space-y-6">
      {/* Platform Navigation Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-6 overflow-x-auto">
          <NavLink
            to="/platform/companies"
            className="pb-3 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <Building2 size={14} />
            <span>Client Companies</span>
          </NavLink>
          <NavLink
            to="/platform/admins"
            className="pb-3 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <Users size={14} />
            <span>Platform Administrators</span>
          </NavLink>
          <NavLink
            to="/platform/audit-logs"
            className="pb-3 text-xs font-bold text-crm-blue border-b-2 border-crm-blue flex items-center gap-1.5 whitespace-nowrap"
          >
            <ShieldAlert size={14} />
            <span>Security & Audit Logs</span>
          </NavLink>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <span>Security & Audit Logs</span>
            <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              Immutable Chain
            </span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Tamper-evident platform audit trail, cryptographic integrity verification, and sensitive operations monitor.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button type="button"
            onClick={() => setExportModalOpen(true)}
            className="btn btn-secondary text-xs flex items-center gap-1.5 flex-1 sm:flex-initial justify-center"
            aria-label="Export platform audit logs to CSV"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
          <button type="button"
            onClick={fetchLogs}
            disabled={loading}
            className="btn btn-secondary text-xs flex items-center gap-1.5"
            title="Refresh logs"
            aria-label="Refresh audit logs"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Critical Verification Delivery Alert Banner */}
      {mailStatus?.hasFailedVerificationAlert && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200 flex items-start gap-3 shadow-xs">
          <AlertTriangle size={20} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div className="flex-1 text-xs">
            <div className="font-bold text-sm">Critical Delivery Notice: Failed Verification Emails</div>
            <p className="mt-1">
              {mailStatus.failedVerificationCount} verification code email(s) failed delivery. Check SMTP credentials, port configuration, or DNS SPF/DKIM records immediately.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('email_delivery')}
            className="px-3 py-1 rounded-lg bg-amber-600 text-white font-semibold text-xs hover:bg-amber-700 transition"
          >
            Inspect Delivery
          </button>
        </div>
      )}

      {/* Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button type="button"
          onClick={() => {
            setActiveTab('audit_trail');
            setPage(1);
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'audit_trail'
              ? 'bg-crm-blue text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          aria-label="View Audit Trail"
        >
          Audit Trail
        </button>
        <button type="button"
          onClick={() => {
            setActiveTab('security_events');
            setPage(1);
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
            activeTab === 'security_events'
              ? 'bg-crm-blue text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          aria-label="View Security Events"
        >
          <Key size={13} />
          <span>Security Events</span>
        </button>
        <button type="button"
          onClick={() => {
            setActiveTab('company_activity');
            setPage(1);
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
            activeTab === 'company_activity'
              ? 'bg-crm-blue text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          aria-label="View Company Activity Summary"
        >
          <Building2 size={13} />
          <span>Company Activity</span>
        </button>
        <button type="button"
          onClick={() => {
            setActiveTab('integrity');
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
            activeTab === 'integrity'
              ? 'bg-crm-blue text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          aria-label="View Cryptographic Integrity Verification"
        >
          <Fingerprint size={13} />
          <span>Integrity Verification</span>
        </button>
        <button type="button"
          onClick={() => {
            setActiveTab('email_delivery');
            fetchMailStatus();
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
            activeTab === 'email_delivery'
              ? 'bg-crm-blue text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          aria-label="View Email Delivery Diagnostics"
        >
          <Mail size={13} />
          <span>Email Delivery</span>
          {mailStatus?.hasFailedVerificationAlert && (
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          )}
        </button>
      </div>

      {/* Error Display Card with Retry & Request ID */}
      {error && (
        <div className="card bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50 p-4 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-rose-700 dark:text-rose-400 font-semibold text-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} />
              <span>Failed to load audit logs</span>
            </div>
            {error.requestId && (
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                Ref: {error.requestId}
              </span>
            )}
          </div>
          <p className="text-xs text-rose-600 dark:text-rose-300">{error.message}</p>
          <button type="button"
            onClick={fetchLogs}
            className="btn btn-secondary text-xs px-3 py-1 bg-white dark:bg-slate-900 border-rose-200 text-rose-700 dark:text-rose-300 hover:bg-rose-100"
          >
            Retry Request
          </button>
        </div>
      )}

      {/* Integrity Tab View */}
      {activeTab === 'integrity' && (
        <div className="card p-6 rounded-2xl bg-white dark:bg-[#12151F] border border-slate-200 dark:border-[#222838] space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Fingerprint size={18} className="text-crm-blue" />
                <span>SHA-256 Tamper-Evident Hash Chain</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Each platform audit log entry cryptographically seals its payload combined with the preceding record's
                hash. Any direct modification or deletion of a row breaks the chain.
              </p>
            </div>
            <button type="button"
              onClick={handleVerifyIntegrity}
              disabled={verifying}
              className="btn btn-primary text-xs flex items-center gap-2 font-bold px-4 py-2"
              aria-label="Verify Hash Chain Integrity Now"
            >
              <RefreshCw size={14} className={verifying ? 'animate-spin' : ''} />
              <span>{verifying ? 'Verifying Chain...' : 'Verify Chain Integrity'}</span>
            </button>
          </div>

          {integrityResult && (
            <div
              className={`p-4 rounded-xl border ${
                integrityResult.valid
                  ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                {integrityResult.valid ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                <span>
                  {integrityResult.valid ? 'Cryptographic Integrity Intact' : 'Hash Chain Break Detected!'}
                </span>
              </div>
              <p className="text-xs mt-1">{integrityResult.message}</p>
              <div className="mt-2 text-[11px] font-mono space-y-1">
                <div>Total Records Verified: {integrityResult.totalChecked}</div>
                {!integrityResult.valid && (
                  <>
                    <div className="text-rose-700 dark:text-rose-400 font-bold">
                      Broken Row ID: {integrityResult.brokenRowId}
                    </div>
                    <div>Reason: {integrityResult.reason}</div>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-2">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200">How the Hash Chain Works:</h3>
            <ul className="list-disc pl-5 space-y-1 text-[11px]">
              <li>Genesis row starts with prevHash = 'GENESIS'.</li>
              <li>Row N hash = SHA256(prevHash | timestamp | actor | action | target | details | outcome).</li>
              <li>Verification traverses all records sequentially and computes expected hashes from stored data.</li>
            </ul>
          </div>
        </div>
      )}

      {/* Email Delivery Diagnostics Tab View */}
      {activeTab === 'email_delivery' && (
        <div className="space-y-4">
          {/* Top Status Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="card p-4 rounded-2xl bg-white dark:bg-[#12151F] border border-slate-200 dark:border-[#222838] space-y-1">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">SMTP Connection</div>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${
                  mailStatus?.smtpStatus === 'ok' ? 'bg-emerald-500' : mailStatus?.smtpStatus === 'down' ? 'bg-rose-500' : 'bg-amber-500'
                }`} />
                <span className="text-base font-bold text-slate-900 dark:text-white uppercase">
                  {mailStatus?.smtpStatus || 'UNKNOWN'}
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                Provider: {mailStatus?.provider?.toUpperCase() || 'SMTP'}
              </div>
            </div>

            <div className="card p-4 rounded-2xl bg-white dark:bg-[#12151F] border border-slate-200 dark:border-[#222838] space-y-1">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Outbox Queue Size</div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">
                {mailStatus?.queueSize ?? 0}
              </div>
              <div className="text-[11px] text-slate-400">Pending outbox messages</div>
            </div>

            <div className="card p-4 rounded-2xl bg-white dark:bg-[#12151F] border border-slate-200 dark:border-[#222838] space-y-1">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Failed Deliveries</div>
              <div className={`text-xl font-bold ${
                (mailStatus?.failedCount ?? 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
              }`}>
                {mailStatus?.failedCount ?? 0}
              </div>
              <div className="text-[11px] text-slate-400">Exhausted retry attempts</div>
            </div>

            <div className="card p-4 rounded-2xl bg-white dark:bg-[#12151F] border border-slate-200 dark:border-[#222838] space-y-1">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Oldest Pending Age</div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">
                {mailStatus?.oldestPendingAgeSec ? `${mailStatus.oldestPendingAgeSec}s` : '0s'}
              </div>
              <div className="text-[11px] text-slate-400">Time since earliest pending queue item</div>
            </div>
          </div>

          {/* Operational Test Panel */}
          <div className="card p-4 rounded-2xl bg-white dark:bg-[#12151F] border border-slate-200 dark:border-[#222838] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Mail size={16} className="text-crm-blue" />
                <span>Operational Mail Provider Dispatch Test</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Sends a live verification test email to the signed-in administrator to test provider connectivity.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSendTestEmail}
              disabled={sendingTestMail}
              className="btn btn-primary text-xs flex items-center gap-1.5 shrink-0"
            >
              {sendingTestMail ? <RefreshCw size={14} className="animate-spin" /> : <Mail size={14} />}
              <span>Send Test Email</span>
            </button>
          </div>

          {/* Recent Failures Table (Last 20 failures, masked recipient, NO tokens) */}
          <div className="card overflow-hidden p-0 rounded-2xl bg-white dark:bg-[#12151F] border border-slate-200 dark:border-[#222838]">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Recent Delivery Failures (Last 20)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Recipient emails are masked. Plain verification codes and tokens are strictly omitted.
                </p>
              </div>
              <button
                type="button"
                onClick={fetchMailStatus}
                disabled={loadingMailStatus}
                className="btn btn-secondary text-xs flex items-center gap-1"
                title="Refresh mail delivery diagnostics"
              >
                <RefreshCw size={12} className={loadingMailStatus ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-[#181B26] text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Purpose</th>
                    <th className="py-3 px-4">Provider</th>
                    <th className="py-3 px-4">Masked Recipient</th>
                    <th className="py-3 px-4">Failure Reason</th>
                    <th className="py-3 px-4">Request ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {!mailStatus?.recentFailures || mailStatus.recentFailures.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No recent email delivery failures recorded.
                      </td>
                    </tr>
                  ) : (
                    mailStatus.recentFailures.map((f: any) => (
                      <tr key={f.id || f.createdAt} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                          {new Date(f.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px]">{f.purpose || 'notification'}</td>
                        <td className="py-3 px-4 uppercase font-semibold text-[11px]">{f.provider}</td>
                        <td className="py-3 px-4 font-mono text-crm-blue">{f.recipient}</td>
                        <td className="py-3 px-4 text-rose-600 dark:text-rose-400 font-medium">
                          {f.reason || 'delivery failure'}
                        </td>
                        <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                          {f.reqId || '-'}
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
      {activeTab === 'company_activity' && (
        <div className="card overflow-hidden p-0 rounded-2xl bg-white dark:bg-[#12151F] border border-slate-200 dark:border-[#222838]">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Company Operations & Risk Summary
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Aggregated sensitive actions per client company workspace.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-[#181B26] text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Company Code</th>
                  <th className="py-3 px-4">Total Actions</th>
                  <th className="py-3 px-4">High Risk Actions</th>
                  <th className="py-3 px-4">Latest Action</th>
                  <th className="py-3 px-4">Last Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {companySummary.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No company activity recorded yet.
                    </td>
                  </tr>
                ) : (
                  companySummary.map((c) => (
                    <tr key={c.code} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                      <td className="py-3 px-4 font-mono font-bold text-crm-blue">{c.code}</td>
                      <td className="py-3 px-4 font-medium">{c.total}</td>
                      <td className="py-3 px-4">
                        {c.risky > 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400">
                            {c.risky} Risky
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                        {c.lastAction}
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {new Date(c.lastSeen).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filters Bar (Audit Trail & Security Events) */}
      {(activeTab === 'audit_trail' || activeTab === 'security_events') && (
        <div className="card p-4 rounded-2xl bg-white dark:bg-[#12151F] border border-slate-200 dark:border-[#222838] space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search summary, actor, or code..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-crm-blue"
                aria-label="Search audit records"
              />
            </div>

            {/* Action Select */}
            <div>
              <select
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-crm-blue"
                aria-label="Filter by action"
              >
                <option value="">All Actions</option>
                {Object.entries(ACTION_LABELS).map(([action, label]) => (
                  <option key={action} value={action}>
                    {label} ({action})
                  </option>
                ))}
              </select>
            </div>

            {/* Outcome Select */}
            <div>
              <select
                value={outcomeFilter}
                onChange={(e) => {
                  setOutcomeFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-crm-blue"
                aria-label="Filter by outcome"
              >
                <option value="">All Outcomes</option>
                <option value="success">Success</option>
                <option value="denied">Denied</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            {/* Tenant Code */}
            <div>
              <input
                type="text"
                placeholder="Filter by company code..."
                value={tenantFilter}
                onChange={(e) => {
                  setTenantFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-crm-blue font-mono"
                aria-label="Filter by company code"
              />
            </div>
          </div>

          {/* Date Range & Clear */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <Calendar size={13} />
              <span>From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
                className="px-2 py-1 text-xs rounded-lg bg-slate-50 dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] text-slate-900 dark:text-white"
                aria-label="Start date filter"
              />
              <span>To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
                className="px-2 py-1 text-xs rounded-lg bg-slate-50 dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] text-slate-900 dark:text-white"
                aria-label="End date filter"
              />
            </div>

            {(search || actionFilter || outcomeFilter || tenantFilter || startDate || endDate) && (
              <button type="button"
                onClick={() => {
                  setSearch('');
                  setActionFilter('');
                  setOutcomeFilter('');
                  setTenantFilter('');
                  setStartDate('');
                  setEndDate('');
                  setPage(1);
                }}
                className="text-xs text-crm-blue hover:underline"
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Table (Audit Trail & Security Events) */}
      {(activeTab === 'audit_trail' || activeTab === 'security_events') && (
        <div className="card overflow-hidden p-0 rounded-2xl bg-white dark:bg-[#12151F] border border-slate-200 dark:border-[#222838] shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-[#181B26] text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4 whitespace-nowrap">Timestamp (UTC)</th>
                  <th className="py-3 px-4 whitespace-nowrap">Action</th>
                  <th className="py-3 px-4 whitespace-nowrap">Outcome</th>
                  <th className="py-3 px-4 whitespace-nowrap">Actor</th>
                  <th className="py-3 px-4 whitespace-nowrap">Target</th>
                  <th className="py-3 px-4 min-w-[200px]">Summary</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-crm-blue" />
                      <span>Loading platform audit records...</span>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 space-y-2">
                      <ShieldAlert size={28} className="mx-auto text-slate-300 dark:text-slate-600" />
                      <p className="font-semibold text-slate-600 dark:text-slate-300">No audit log records found</p>
                      <p className="text-[11px]">Try adjusting your search criteria or date filters.</p>
                    </td>
                  </tr>
                ) : (
                  logs.map((record) => {
                    const isDangerous = DANGEROUS_ACTIONS.has(record.action);
                    return (
                      <tr
                        key={record.id}
                        onClick={() => setSelectedRecord(record)}
                        className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors ${
                          isDangerous ? 'bg-rose-50/30 dark:bg-rose-950/10' : ''
                        }`}
                      >
                        {/* Timestamp */}
                        <td className="py-3 px-4 whitespace-nowrap text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                          {new Date(record.timestamp).toISOString().replace('T', ' ').substring(0, 19)}
                        </td>

                        {/* Action */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {isDangerous && (
                              <AlertTriangle size={13} className="text-rose-600 dark:text-rose-400 shrink-0" />
                            )}
                            <span
                              className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold ${
                                isDangerous
                                  ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-900'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {record.action}
                            </span>
                          </div>
                        </td>

                        {/* Outcome */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {record.outcome === 'success' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400">
                              <CheckCircle2 size={11} /> Success
                            </span>
                          ) : record.outcome === 'denied' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400">
                              <AlertTriangle size={11} /> Denied
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400">
                              <XCircle size={11} /> Failed
                            </span>
                          )}
                        </td>

                        {/* Actor */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {record.actorName || 'System'}
                          </div>
                          <div className="text-[10px] text-slate-400">{record.actorRole || 'system'}</div>
                        </td>

                        {/* Target */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {record.targetTenantCode ? (
                            <span className="font-mono font-semibold text-crm-blue">
                              {record.targetTenantCode}
                            </span>
                          ) : record.targetType ? (
                            <span className="text-slate-500 font-mono text-[11px]">{record.targetType}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* Summary */}
                        <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{record.summary}</td>

                        {/* Detail Button */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button type="button"
                            onClick={() => setSelectedRecord(record)}
                            className="btn btn-secondary text-xs p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700"
                            title="Inspect full audit record"
                            aria-label={`Inspect audit record ${record.id}`}
                          >
                            <Eye size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <div>
              Showing {logs.length} of {total} records (Page {page} of {totalPages})
            </div>
            <div className="flex items-center gap-2">
              <button type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1 disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft size={13} />
                <span>Prev</span>
              </button>
              <button type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="btn btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1 disabled:opacity-40"
                aria-label="Next page"
              >
                <span>Next</span>
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Detail Drawer / Modal */}
      {selectedRecord && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="audit-record-detail-title"
        >
          <div className="max-w-2xl w-full bg-white dark:bg-[#12151F] rounded-2xl border border-slate-200 dark:border-[#222838] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-[#181B26]">
              <div className="flex items-center gap-2">
                <ShieldAlert size={16} className="text-crm-blue" />
                <h3 id="audit-record-detail-title" className="font-bold text-slate-900 dark:text-white text-sm">
                  Audit Record Detail
                </h3>
              </div>
              <button type="button"
                onClick={() => setSelectedRecord(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="Close detail modal"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto text-xs">
              {/* Summary */}
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Summary</span>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                  {selectedRecord.summary}
                </p>
              </div>

              {/* Grid Metadata */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Action</span>
                  <div className="font-mono font-bold text-slate-900 dark:text-white mt-0.5">
                    {selectedRecord.action}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Outcome</span>
                  <div className="mt-0.5">
                    {selectedRecord.outcome === 'success' ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">Success</span>
                    ) : selectedRecord.outcome === 'denied' ? (
                      <span className="text-amber-600 dark:text-amber-400 font-bold">Denied</span>
                    ) : (
                      <span className="text-rose-600 dark:text-rose-400 font-bold">Failed</span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Actor</span>
                  <div className="text-slate-900 dark:text-white mt-0.5">
                    {selectedRecord.actorName || 'System'} ({selectedRecord.actorRole || 'system'})
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Actor ID</span>
                  <div className="font-mono text-slate-600 dark:text-slate-300 mt-0.5">
                    {selectedRecord.actorId || '-'}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Target Type</span>
                  <div className="text-slate-900 dark:text-white mt-0.5">{selectedRecord.targetType || '-'}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Company Code</span>
                  <div className="font-mono font-bold text-crm-blue mt-0.5">
                    {selectedRecord.targetTenantCode || '-'}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">IP Address</span>
                  <div className="font-mono text-slate-600 dark:text-slate-300 mt-0.5">
                    {selectedRecord.ipAddress || '127.0.0.1'}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Request ID</span>
                  <div className="font-mono text-slate-600 dark:text-slate-300 mt-0.5">
                    {selectedRecord.requestId || '-'}
                  </div>
                </div>
              </div>

              {/* Changed Fields / Details */}
              {selectedRecord.details && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Changed Fields & Operation Details
                  </span>
                  <pre className="mt-1 p-3 rounded-xl bg-slate-900 text-slate-200 font-mono text-[11px] overflow-x-auto max-h-48 border border-slate-800">
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(selectedRecord.details), null, 2);
                      } catch {
                        return selectedRecord.details;
                      }
                    })()}
                  </pre>
                </div>
              )}

              {/* Hash Chain Cryptography */}
              <div className="p-3 rounded-xl bg-slate-900/90 text-slate-300 font-mono text-[10px] space-y-2 border border-slate-800">
                <div className="flex items-center gap-1.5 text-crm-blue font-bold text-[11px]">
                  <Fingerprint size={13} />
                  <span>Tamper-Evident Hash Proof</span>
                </div>
                <div className="break-all">
                  <span className="text-slate-400 block text-[9px] uppercase font-bold">Current Record Hash:</span>
                  <span className="text-emerald-400">{selectedRecord.hash}</span>
                </div>
                <div className="break-all">
                  <span className="text-slate-400 block text-[9px] uppercase font-bold">Previous Record Hash (Chained):</span>
                  <span className="text-slate-400">{selectedRecord.prevHash || 'GENESIS'}</span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-[#181B26] flex justify-end">
              <button type="button" onClick={() => setSelectedRecord(null)} className="btn btn-secondary text-xs px-4 py-2">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export 2-Step Modal */}
      {exportModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-audit-modal-title"
        >
          <div className="max-w-md w-full bg-white dark:bg-[#12151F] rounded-2xl border border-slate-200 dark:border-[#222838] shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
              <Lock size={16} className="text-crm-blue" />
              <h3 id="export-audit-modal-title">Authorized Audit Export</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Exporting the platform audit trail contains privileged organizational telemetry and requires elevated
              step-up authentication. Enter your 6-digit 2-step verification code to authorize export.
            </p>

            <form onSubmit={handleExport} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Two-Step Verification Code
                </label>
                <input
                  type="text"
                  placeholder="6-digit code or step-up token"
                  value={exportStepUpToken}
                  onChange={(e) => setExportStepUpToken(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] text-slate-900 dark:text-white font-mono"
                  autoFocus
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setExportModalOpen(false)}
                  className="btn btn-secondary text-xs px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={exporting || !exportStepUpToken.trim()}
                  className="btn btn-primary text-xs px-4 py-2 flex items-center gap-1.5"
                >
                  {exporting ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
                  <span>{exporting ? 'Exporting...' : 'Authorize & Download CSV'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
