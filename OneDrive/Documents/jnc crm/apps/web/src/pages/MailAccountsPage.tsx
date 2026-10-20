import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail, ShieldCheck, CheckCircle2, AlertCircle, RefreshCw, Plus,
  Trash2, Edit3, Lock, Eye, EyeOff, Server, Globe, ChevronDown,
  ChevronUp, Check, X, Info, Zap, ArrowRight, Activity, Send
} from 'lucide-react';
import { mailAccountsApi } from '../services/api';
import { MailAccount, DomainHealthResult } from '../types';

export default function MailAccountsPage() {
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Domain health status cache by account id
  const [healthMap, setHealthMap] = useState<Record<string, DomainHealthResult>>({});
  const [loadingHealth, setLoadingHealth] = useState<Record<string, boolean>>({});

  // Modal / Add / Edit Wizard State
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<MailAccount | null>(null);

  // Wizard Steps: 1 = Email & Auto-Detect, 2 = Credentials, Purpose & Test
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);

  // Form Fields
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [senderName, setSenderName] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [encryption, setEncryption] = useState<'starttls' | 'ssl'>('starttls');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [useForAllPurposes, setUseForAllPurposes] = useState(true);
  const [purpose, setPurpose] = useState('PRIMARY_ALERTS');

  // Auto-Detect Result
  const [detectedProvider, setDetectedProvider] = useState<{
    provider: string;
    providerName: string;
    smtpHost: string;
    smtpPort: number;
    encryption: 'starttls' | 'ssl';
    notes: string;
  } | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Test Connection State
  const [testing, setTesting] = useState(false);
  const [sendTestEmail, setSendTestEmail] = useState(true);
  const [testResult, setTestResult] = useState<{
    result: 'ok' | 'auth_failed' | 'port_blocked' | 'timeout' | 'certificate_error' | 'host_not_found';
    message: string;
  } | null>(null);

  const [saving, setSaving] = useState(false);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const res = await mailAccountsApi.list();
      const list: MailAccount[] = res.data || [];
      setAccounts(list);

      // Load domain health for each account
      list.forEach((acc) => {
        loadDomainHealth(acc.id);
      });
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.message || 'Failed to load mail accounts.');
    } finally {
      setLoading(false);
    }
  };

  const loadDomainHealth = async (id: string) => {
    setLoadingHealth((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await mailAccountsApi.domainHealth(id);
      if (res.data) {
        setHealthMap((prev) => ({ ...prev, [id]: res.data }));
      }
    } catch (_) {
      // Ignore background check failure
    } finally {
      setLoadingHealth((prev) => ({ ...prev, [id]: false }));
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const openAddModal = () => {
    setEditingAccount(null);
    setWizardStep(1);
    setEmail('');
    setName('');
    setSenderName('');
    setSmtpHost('');
    setSmtpPort(587);
    setEncryption('starttls');
    setSmtpUser('');
    setSmtpPass('');
    setUseForAllPurposes(true);
    setPurpose('PRIMARY_ALERTS');
    setDetectedProvider(null);
    setShowAdvanced(false);
    setShowPassword(false);
    setTestResult(null);
    setErrorMessage('');
    setShowModal(true);
  };

  const openEditModal = (acc: MailAccount) => {
    setEditingAccount(acc);
    setWizardStep(2); // Skip straight to credentials for editing
    setEmail(acc.email);
    setName(acc.name);
    setSenderName(acc.senderName || '');
    setSmtpHost(acc.smtpHost);
    setSmtpPort(acc.smtpPort);
    setEncryption(acc.encryption || (acc.isSecure || acc.smtpPort === 465 ? 'ssl' : 'starttls'));
    setSmtpUser(acc.smtpUser);
    setSmtpPass(''); // keep blank unless modifying
    setUseForAllPurposes(acc.purpose === 'ALL');
    setPurpose(acc.purpose || 'PRIMARY_ALERTS');
    setDetectedProvider(null);
    setShowAdvanced(true);
    setShowPassword(false);
    setTestResult(null);
    setErrorMessage('');
    setShowModal(true);
  };

  // Step 1: Detect Provider on Email Submit
  const handleDetectProvider = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email || !email.includes('@')) {
      setErrorMessage('Please enter a valid business email address.');
      return;
    }

    setDetecting(true);
    setErrorMessage('');
    try {
      const res = await mailAccountsApi.detect(email);
      const data = res.data;
      setDetectedProvider(data);

      setSmtpHost(data.smtpHost || '');
      setSmtpPort(data.smtpPort || 587);
      setEncryption(data.encryption || 'starttls');
      setSmtpUser(email);

      if (!name) {
        setName(`${data.providerName || 'Company'} Mail`);
      }
      if (!senderName) {
        const domain = email.split('@')[1];
        setSenderName(domain ? domain.split('.')[0].toUpperCase() : 'Company Alerts');
      }

      setWizardStep(2);
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.message || 'Failed to auto-detect mail provider.');
      // Still proceed to step 2 so user can configure manually
      setWizardStep(2);
      setShowAdvanced(true);
    } finally {
      setDetecting(false);
    }
  };

  // Step 2: Test Connection
  const handleTestConnection = async () => {
    if (!smtpHost || !smtpPort || !smtpUser) {
      setErrorMessage('Please enter SMTP Host, Port, and Username before testing.');
      return;
    }

    if (!editingAccount && !smtpPass) {
      setErrorMessage('Please enter the SMTP password or app password to test.');
      return;
    }

    setTesting(true);
    setTestResult(null);
    setErrorMessage('');

    try {
      const payload: any = {
        email,
        smtpHost,
        smtpPort: Number(smtpPort),
        encryption,
        smtpUser,
        smtpPass: smtpPass || undefined,
        sendTestEmail,
      };

      if (editingAccount) {
        payload.id = editingAccount.id;
      }

      const res = await mailAccountsApi.test(payload);
      setTestResult(res.data);
    } catch (err: any) {
      const respData = err?.response?.data;
      if (respData && respData.result) {
        setTestResult(respData);
      } else {
        setTestResult({
          result: 'port_blocked',
          message: err?.response?.data?.message || err.message || 'Connection test failed.',
        });
      }
    } finally {
      setTesting(false);
    }
  };

  // Step 2: Save Mail Account (Enabled ONLY after test succeeds)
  const handleSaveAccount = async () => {
    if (!testResult || testResult.result !== 'ok') {
      setErrorMessage('Please test the connection successfully before saving.');
      return;
    }

    setSaving(true);
    setErrorMessage('');
    try {
      const payload = {
        name: name.trim() || `${email} Account`,
        email: email.trim(),
        senderName: senderName.trim() || undefined,
        smtpHost: smtpHost.trim(),
        smtpPort: Number(smtpPort),
        smtpUser: smtpUser.trim(),
        smtpPass: smtpPass || undefined,
        encryption,
        purpose: useForAllPurposes ? 'ALL' : purpose,
        useForAllPurposes,
      };

      if (editingAccount) {
        await mailAccountsApi.update(editingAccount.id, payload);
        setSuccessMessage('Mail account updated successfully.');
      } else {
        await mailAccountsApi.create(payload);
        setSuccessMessage('Mail account configured and verified successfully.');
      }

      setShowModal(false);
      await fetchAccounts();
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.message || 'Failed to save mail account.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async (id: string, accEmail: string) => {
    if (!window.confirm(`Are you sure you want to remove mail account for ${accEmail}?`)) return;

    try {
      await mailAccountsApi.delete(id);
      setSuccessMessage(`Mail account ${accEmail} removed.`);
      await fetchAccounts();
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.message || 'Failed to delete mail account.');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ─── HEADER ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-[#2A3042]">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-crm-blue/10 dark:bg-crm-blue/20 text-crm-blue border border-crm-blue/30">
            <Mail size={22} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              Company Mail Accounts & TLS Security
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Strict TLS email delivery for customer invoices, alerts, and system notifications.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchAccounts}
            className="btn-secondary text-xs flex items-center gap-1.5"
            title="Refresh accounts"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="btn-primary text-xs flex items-center gap-1.5 shadow-glow-blue"
          >
            <Plus size={14} />
            <span>Add Mail Account</span>
          </button>
        </div>
      </div>

      {/* ─── ALERTS ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 flex items-center gap-3 text-xs font-semibold shadow-sm"
          >
            <CheckCircle2 size={18} className="shrink-0" />
            <span>{successMessage}</span>
          </motion.div>
        )}

        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 flex items-center gap-3 text-xs font-semibold shadow-sm"
          >
            <AlertCircle size={18} className="shrink-0" />
            <span>{errorMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── ACCOUNTS LIST ───────────────────────────────────────────────── */}
      <div className="space-y-4">
        {loading ? (
          <div className="card text-center py-16 space-y-3">
            <RefreshCw size={24} className="animate-spin text-crm-blue mx-auto" />
            <p className="text-xs text-slate-500 font-medium">Loading configured mail accounts...</p>
          </div>
        ) : accounts.length === 0 ? (
          <div className="card text-center py-16 space-y-4 max-w-lg mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-crm-blue/10 text-crm-blue flex items-center justify-center mx-auto">
              <Mail size={28} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">No Mail Accounts Configured</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                Connect your business email (Google Workspace, Microsoft 365, GoDaddy, or custom SMTP) to send invoices, quotes, and alerts directly from your company domain.
              </p>
            </div>
            <button
              onClick={openAddModal}
              className="btn-primary text-xs inline-flex items-center gap-2 px-4 py-2"
            >
              <Plus size={14} /> Set Up Company Mail Account
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {accounts.map((acc) => {
              const health = healthMap[acc.id];
              const isCheckingHealth = loadingHealth[acc.id];

              return (
                <div
                  key={acc.id}
                  className="card p-5 space-y-4 hover:border-slate-300 dark:hover:border-slate-700 transition-all shadow-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-[#222738]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-crm-blue flex items-center justify-center font-bold text-sm shrink-0">
                        <Mail size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-white">
                            {acc.name}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            Active
                          </span>
                          {acc.purpose === 'ALL' ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                              All Purposes (Alerts, Invoices, Sales)
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              {acc.purpose}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 font-mono mt-0.5">
                          {acc.email} {acc.senderName && <span className="text-slate-400">({acc.senderName})</span>}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <button
                        onClick={() => openEditModal(acc)}
                        className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1"
                      >
                        <Edit3 size={12} /> Edit
                      </button>
                      <button
                        onClick={() => handleDeleteAccount(acc.id, acc.email)}
                        className="btn-ghost text-xs px-2.5 py-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                        title="Delete Mail Account"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* SMTP Connection Specs */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#151823] border border-slate-200 dark:border-[#2A3042]/50">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">SMTP Server</span>
                      <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 truncate block mt-0.5">
                        {acc.smtpHost}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#151823] border border-slate-200 dark:border-[#2A3042]/50">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Port & TLS Security</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 mt-0.5">
                        <ShieldCheck size={14} className="text-emerald-500" />
                        <span>Port {acc.smtpPort}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-700 uppercase font-mono">
                          {acc.encryption === 'ssl' || acc.smtpPort === 465 ? 'SSL (Strict)' : 'STARTTLS (Strict)'}
                        </span>
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#151823] border border-slate-200 dark:border-[#2A3042]/50">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Auth User</span>
                      <span className="font-mono text-slate-800 dark:text-slate-200 truncate block mt-0.5">
                        {acc.smtpUser}
                      </span>
                    </div>
                  </div>

                  {/* Domain Health Checks Section */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                        <Activity size={14} className="text-crm-teal" />
                        <span>Domain Deliverability Health (SPF, DKIM, DMARC)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => loadDomainHealth(acc.id)}
                        disabled={isCheckingHealth}
                        className="text-[11px] font-semibold text-crm-blue hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw size={11} className={isCheckingHealth ? 'animate-spin' : ''} />
                        <span>{isCheckingHealth ? 'Checking DNS...' : 'Re-check DNS'}</span>
                      </button>
                    </div>

                    {isCheckingHealth && !health ? (
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 py-2">
                        <RefreshCw size={12} className="animate-spin" />
                        <span>Checking SPF, DKIM, and DMARC records for {acc.email.split('@')[1]}...</span>
                      </div>
                    ) : health ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                        {/* SPF Status */}
                        <div className={`p-2.5 rounded-xl border text-xs ${
                          health.spf.status === 'found'
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-300'
                            : 'bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-800/40 text-red-900 dark:text-red-300'
                        }`}>
                          <div className="flex items-center justify-between font-bold">
                            <span className="text-[11px] uppercase tracking-wider">SPF Record</span>
                            {health.spf.status === 'found' ? (
                              <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                                <CheckCircle2 size={13} /> Verified
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400 font-semibold">
                                <AlertCircle size={13} /> Missing / Invalid
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] mt-1 text-slate-600 dark:text-slate-400 leading-relaxed font-mono">
                            {health.spf.status === 'found' && health.spf.record ? health.spf.record : health.spf.fix}
                          </p>
                        </div>

                        {/* DKIM Status */}
                        <div className={`p-2.5 rounded-xl border text-xs ${
                          health.dkim.status === 'found'
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-300'
                            : 'bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-800/40 text-red-900 dark:text-red-300'
                        }`}>
                          <div className="flex items-center justify-between font-bold">
                            <span className="text-[11px] uppercase tracking-wider">DKIM Signature</span>
                            {health.dkim.status === 'found' ? (
                              <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                                <CheckCircle2 size={13} /> Found ({health.dkim.selector || 'default'})
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400 font-semibold">
                                <AlertCircle size={13} /> Missing
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] mt-1 text-slate-600 dark:text-slate-400 leading-relaxed font-mono truncate" title={health.dkim.fix}>
                            {health.dkim.fix}
                          </p>
                        </div>

                        {/* DMARC Status */}
                        <div className={`p-2.5 rounded-xl border text-xs ${
                          health.dmarc.status === 'found'
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-300'
                            : 'bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-800/40 text-red-900 dark:text-red-300'
                        }`}>
                          <div className="flex items-center justify-between font-bold">
                            <span className="text-[11px] uppercase tracking-wider">DMARC Policy</span>
                            {health.dmarc.status === 'found' ? (
                              <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                                <CheckCircle2 size={13} /> Verified
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400 font-semibold">
                                <AlertCircle size={13} /> Missing
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] mt-1 text-slate-600 dark:text-slate-400 leading-relaxed font-mono truncate" title={health.dmarc.fix}>
                            {health.dmarc.fix}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400">DNS deliverability check not loaded.</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── ADD / EDIT MAIL ACCOUNT MODAL ───────────────────────────────── */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#141721] border border-slate-200 dark:border-[#2A3042] rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl relative my-8"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#2A3042]">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-crm-blue/10 text-crm-blue">
                    <Mail size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {editingAccount ? 'Edit Mail Account' : 'Set Up Mail Account'}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {wizardStep === 1
                        ? 'Step 1: Enter your business email address'
                        : 'Step 2: Authenticate and verify connection'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Error in modal */}
              {errorMessage && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* ─── STEP 1: EMAIL ONLY & AUTO-DETECT ────────────────────────── */}
              {wizardStep === 1 && (
                <form onSubmit={handleDetectProvider} className="space-y-4">
                  <div>
                    <label className="label">
                      Your Business Email Address <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        className="input text-xs pl-8 font-mono"
                        placeholder="e.g. sales@yourcompany.com or billing@yourcompany.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoFocus
                        required
                      />
                      <Mail size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                      We will automatically detect your mail server (Google Workspace, Microsoft 365, GoDaddy, Hostinger, Zoho, etc.) and configure TLS settings.
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="btn-ghost text-xs px-4"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={detecting || !email}
                      className="btn-primary text-xs px-5 py-2 shadow-glow-blue flex items-center gap-2 disabled:opacity-50"
                    >
                      {detecting ? (
                        <>
                          <RefreshCw size={13} className="animate-spin" />
                          <span>Detecting Mail Server...</span>
                        </>
                      ) : (
                        <>
                          <span>Continue</span>
                          <ArrowRight size={14} />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* ─── STEP 2: CREDENTIALS, TEST & SAVE ───────────────────────── */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  {/* Detected Provider Card */}
                  {detectedProvider && (
                    <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Zap size={15} className="text-blue-600 dark:text-blue-400 shrink-0" />
                          <span className="text-xs font-bold text-blue-900 dark:text-blue-200">
                            Detected: {detectedProvider.providerName}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">
                          Standard encryption (TLS)
                        </span>
                      </div>
                      <p className="text-[11px] text-blue-800 dark:text-blue-300 leading-relaxed">
                        {detectedProvider.notes}
                      </p>
                    </div>
                  )}

                  {/* Account Name & Sender Name */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label">Account Label</label>
                      <input
                        type="text"
                        className="input text-xs"
                        placeholder="e.g. Acme Sales Mail"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="label">Sender Display Name</label>
                      <input
                        type="text"
                        className="input text-xs"
                        placeholder="e.g. Acme Corporation"
                        value={senderName}
                        onChange={(e) => setSenderName(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Username & Password */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label">SMTP Username (Email)</label>
                      <input
                        type="text"
                        className="input text-xs font-mono"
                        value={smtpUser}
                        onChange={(e) => setSmtpUser(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="label">
                        {editingAccount ? 'New Password / App Password' : 'Password / App Password'}{' '}
                        <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          className="input text-xs pr-8 font-mono"
                          placeholder={editingAccount ? 'Leave blank to keep existing' : 'Enter app password'}
                          value={smtpPass}
                          onChange={(e) => {
                            setSmtpPass(e.target.value);
                            setTestResult(null); // Require re-test if password changed
                          }}
                          required={!editingAccount}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* "Use for all purposes" Switch */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                          Use for all purposes
                        </span>
                        <span className="text-[11px] text-slate-500 block">
                          Use this account for customer invoices, system alerts, and sales outbound emails.
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={useForAllPurposes}
                        onChange={(e) => setUseForAllPurposes(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-crm-blue focus:ring-crm-blue cursor-pointer"
                      />
                    </div>

                    {!useForAllPurposes && (
                      <div className="pt-2 border-t border-slate-200 dark:border-[#2A3042]">
                        <label className="label text-[11px]">Primary Purpose</label>
                        <select
                          className="input text-xs"
                          value={purpose}
                          onChange={(e) => setPurpose(e.target.value)}
                        >
                          <option value="PRIMARY_ALERTS">Primary Alerts & Security Notifications</option>
                          <option value="BILLING_INVOICES">Billing & Tax Invoices Only</option>
                          <option value="SALES_OUTBOUND">Sales Quotes & Outbound Leads Only</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Advanced Server Configuration Dropdown */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="text-xs text-crm-blue hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      <span>{showAdvanced ? 'Hide Advanced Configuration' : 'Advanced Configuration (Host, Port, TLS)'}</span>
                      {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>

                    {showAdvanced && (
                      <div className="mt-2.5 p-3.5 rounded-xl bg-slate-50 dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div className="sm:col-span-2">
                            <label className="label text-[11px]">SMTP Host</label>
                            <input
                              type="text"
                              className="input text-xs font-mono"
                              value={smtpHost}
                              onChange={(e) => {
                                setSmtpHost(e.target.value);
                                setTestResult(null);
                              }}
                            />
                          </div>
                          <div>
                            <label className="label text-[11px]">Port</label>
                            <select
                              className="input text-xs font-mono"
                              value={smtpPort}
                              onChange={(e) => {
                                const p = Number(e.target.value);
                                setSmtpPort(p);
                                if (p === 465) setEncryption('ssl');
                                else setEncryption('starttls');
                                setTestResult(null);
                              }}
                            >
                              <option value="587">587 (STARTTLS)</option>
                              <option value="465">465 (SSL / TLS)</option>
                              <option value="2525">2525 (Alternative TLS)</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="label text-[11px]">Encryption Mode</label>
                          <div className="flex items-center gap-4 text-xs">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="radio"
                                name="encryption"
                                value="starttls"
                                checked={encryption === 'starttls'}
                                onChange={() => {
                                  setEncryption('starttls');
                                  setTestResult(null);
                                }}
                              />
                              <span>STARTTLS (Port 587 / 2525)</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="radio"
                                name="encryption"
                                value="ssl"
                                checked={encryption === 'ssl'}
                                onChange={() => {
                                  setEncryption('ssl');
                                  setTestResult(null);
                                }}
                              />
                              <span>SSL / TLS (Port 465)</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Test Connection Controls & Result Banner */}
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-slate-50/50 dark:bg-[#181B26]/50 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="sendTestCheck"
                          checked={sendTestEmail}
                          onChange={(e) => setSendTestEmail(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-crm-blue cursor-pointer"
                        />
                        <label htmlFor="sendTestCheck" className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                          Send one test email to my logged-in address
                        </label>
                      </div>

                      <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={testing}
                        className="btn-secondary text-xs px-3.5 py-1.5 font-bold flex items-center justify-center gap-1.5 self-start sm:self-auto cursor-pointer"
                      >
                        {testing ? (
                          <>
                            <RefreshCw size={12} className="animate-spin text-crm-blue" />
                            <span>Verifying TLS & Auth...</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck size={13} className="text-emerald-500" />
                            <span>Test Connection</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Test Result Display */}
                    {testResult && (
                      <div
                        className={`p-3 rounded-lg text-xs font-semibold flex items-start gap-2.5 ${
                          testResult.result === 'ok'
                            ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                            : 'bg-red-500/15 border border-red-500/30 text-red-700 dark:text-red-300'
                        }`}
                      >
                        {testResult.result === 'ok' ? (
                          <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle size={16} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <div className="font-bold">
                            {testResult.result === 'ok'
                              ? 'Connection Test Successful'
                              : testResult.result === 'auth_failed'
                              ? 'Authentication Failed'
                              : testResult.result === 'certificate_error'
                              ? 'Untrusted Certificate'
                              : testResult.result === 'port_blocked'
                              ? 'Port Blocked or Disallowed'
                              : testResult.result === 'timeout'
                              ? 'Connection Timed Out'
                              : 'Host Not Found'}
                          </div>
                          <p className="text-[11px] font-normal mt-0.5 leading-relaxed">
                            {testResult.message}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setWizardStep(1)}
                      className="btn-ghost text-xs px-3"
                    >
                      ← Change Email
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowModal(false)}
                        className="btn-ghost text-xs px-4"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveAccount}
                        disabled={saving || !testResult || testResult.result !== 'ok'}
                        className="btn-primary text-xs px-5 py-2 shadow-glow-blue flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                        title={
                          !testResult || testResult.result !== 'ok'
                            ? 'You must test connection successfully before saving'
                            : 'Save Mail Account'
                        }
                      >
                        {saving ? (
                          <>
                            <RefreshCw size={13} className="animate-spin" />
                            <span>Saving Account...</span>
                          </>
                        ) : (
                          <>
                            <Check size={14} />
                            <span>Save Mail Account</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
