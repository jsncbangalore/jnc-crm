import React, { useState, useEffect } from 'react';
import {
  Copy, Check, ExternalLink, ShieldCheck, Zap,
  MessageSquare, Globe, AlertCircle, Sparkles, CheckCircle2,
  Lock, Smartphone, Eye, EyeOff, Key, RefreshCw, Radio, Server, Activity,
  AlertTriangle, History, ArrowRight
} from 'lucide-react';
import { getPublicWebhookBaseUrl, webhooksApi } from '../../services/api';

interface DeliveryRecord {
  id: string;
  provider: string;
  status: string;
  timestamp: string;
  statusCode: number;
  error?: string | null;
  summary?: string | null;
}

export default function MetaWhatsAppTab() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Domain selection states
  const [domainMode, setDomainMode] = useState<'production' | 'custom'>(() => {
    const saved = localStorage.getItem('crm_custom_webhook_domain');
    if (saved) return 'custom';
    return 'production';
  });
  const [customDomain, setCustomDomain] = useState(() => localStorage.getItem('crm_custom_webhook_domain') || '');

  // Tenant Webhook Key states
  const [tenantKey, setTenantKey] = useState(() => localStorage.getItem('crm_tenant_webhook_key') || '');
  const [showTenantKey, setShowTenantKey] = useState(false);
  const [isRegeneratingKey, setIsRegeneratingKey] = useState(false);
  const [showRegenerateWarning, setShowRegenerateWarning] = useState(false);

  // Per-tenant Verify Token (shown once on generation)
  const [newlyGeneratedVerifyToken, setNewlyGeneratedVerifyToken] = useState<string | null>(null);
  const [showVerifyToken, setShowVerifyToken] = useState(false);

  // Meta Graph API Credentials
  const [phoneNumberId, setPhoneNumberId] = useState(() => localStorage.getItem('crm_meta_phone_id') || '');
  const [wabaId, setWabaId] = useState(() => localStorage.getItem('crm_meta_waba_id') || '');
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem('crm_meta_token') || '');
  const [showToken, setShowToken] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSavingCreds, setIsSavingCreds] = useState(false);

  // Live Backend Stats & Configuration
  const [liveConfig, setLiveConfig] = useState<{
    hasWebhookKey: boolean;
    tenantCode?: string;
    isWhatsAppConfigured: boolean;
    verifyToken: string;
    publicBaseUrl?: string;
    lastReceivedAt?: string | null;
    deliveries?: DeliveryRecord[];
    stats: {
      whatsappCount: number;
      lastLeadAt: string | null;
      lastLeadName: string | null;
    };
  }>({
    hasWebhookKey: false,
    isWhatsAppConfigured: false,
    verifyToken: 'whv_••••••••••••••••',
    publicBaseUrl: '',
    lastReceivedAt: null,
    deliveries: [],
    stats: {
      whatsappCount: 0,
      lastLeadAt: null,
      lastLeadName: null,
    },
  });

  // Test webhook verification states
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<{
    checked: boolean;
    ok: boolean;
    statusCode: number;
    body: string;
    latencyMs: number;
    message: string;
  } | null>(null);

  // Resolve Public HTTPS Domain
  const resolveDomain = () => {
    if (domainMode === 'custom' && customDomain.trim()) {
      return customDomain.trim().replace(/\/+$/, '');
    }
    return liveConfig.publicBaseUrl || getPublicWebhookBaseUrl() || window.location.origin;
  };

  const publicDomain = resolveDomain();
  const isHttps = publicDomain.toLowerCase().startsWith('https://');

  // Exact Callback URL for Meta - never use placeholder <YOUR_TENANT_KEY>
  const activeKey = tenantKey || (liveConfig.hasWebhookKey ? tenantKey : '');
  const hasActiveKey = Boolean(activeKey && activeKey.startsWith('whk_'));
  const callbackUrl = hasActiveKey ? `${publicDomain}/api/v1/webhooks/whatsapp/${activeKey}` : '';

  // Active verify token display: show once if newly generated, else masked per-tenant
  const displayVerifyToken = newlyGeneratedVerifyToken || liveConfig.verifyToken || 'whv_••••••••••••••••';

  // Fetch real tenant config and statistics on mount
  const fetchTenantConfig = async () => {
    try {
      const res = await webhooksApi.getConfig();
      if (res.data) {
        if (res.data.webhookKey && !tenantKey) {
          setTenantKey(res.data.webhookKey);
          localStorage.setItem('crm_tenant_webhook_key', res.data.webhookKey);
        }
        setLiveConfig({
          hasWebhookKey: Boolean(res.data.hasWebhookKey),
          tenantCode: res.data.tenantCode,
          isWhatsAppConfigured: Boolean(res.data.isWhatsAppConfigured),
          verifyToken: res.data.verifyToken || 'whv_••••••••••••••••',
          publicBaseUrl: res.data.publicBaseUrl || '',
          lastReceivedAt: res.data.lastReceivedAt || null,
          deliveries: res.data.deliveries || [],
          stats: {
            whatsappCount: res.data.stats?.whatsappCount || 0,
            lastLeadAt: res.data.stats?.lastLeadAt || null,
            lastLeadName: res.data.stats?.lastLeadName || null,
          },
        });
      }
    } catch {
      // Offline / unauthenticated fallback
    }
  };

  useEffect(() => {
    fetchTenantConfig();
    const interval = setInterval(fetchTenantConfig, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Generate / Regenerate Tenant Webhook Key
  const handleConfirmRegenerateKey = async () => {
    setShowRegenerateWarning(false);
    setIsRegeneratingKey(true);
    setNewlyGeneratedVerifyToken(null);
    try {
      const res = await webhooksApi.regenerateKey();
      if (res.data?.webhookKey) {
        setTenantKey(res.data.webhookKey);
        localStorage.setItem('crm_tenant_webhook_key', res.data.webhookKey);
        if (res.data.verifyToken) {
          setNewlyGeneratedVerifyToken(res.data.verifyToken);
        }
        setLiveConfig((prev) => ({
          ...prev,
          hasWebhookKey: true,
          verifyToken: res.data.verifyToken || prev.verifyToken,
        }));
        setShowTenantKey(true);
      }
    } catch (err: any) {
      console.error('Failed to regenerate key:', err);
      alert('Failed to regenerate key: ' + (err?.response?.data?.message || err.message));
    } finally {
      setIsRegeneratingKey(false);
    }
  };

  // Test Webhook Handshake (simulating Meta's exact GET verification)
  const handleTestWebhook = async () => {
    if (!hasActiveKey) {
      alert('Please generate a Tenant Webhook Key first before testing the webhook.');
      return;
    }
    setIsTestingWebhook(true);
    setWebhookTestResult(null);
    try {
      const res = await webhooksApi.testHandshake({
        url: callbackUrl,
        verifyToken: newlyGeneratedVerifyToken || undefined,
      });
      const data = res.data;
      setWebhookTestResult({
        checked: true,
        ok: Boolean(data.ok),
        statusCode: data.statusCode || 0,
        body: data.body || '',
        latencyMs: data.latencyMs || 0,
        message: data.message || (data.ok ? 'Webhook verified successfully!' : 'Verification handshake failed.'),
      });
      fetchTenantConfig();
    } catch (err: any) {
      setWebhookTestResult({
        checked: true,
        ok: false,
        statusCode: err?.response?.status || 0,
        body: err?.response?.data || err.message,
        latencyMs: 0,
        message: 'Request failed: ' + (err?.response?.data?.message || err.message),
      });
    } finally {
      setIsTestingWebhook(false);
    }
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingCreds(true);
    try {
      localStorage.setItem('crm_meta_phone_id', phoneNumberId.trim());
      localStorage.setItem('crm_meta_waba_id', wabaId.trim());
      localStorage.setItem('crm_meta_token', accessToken.trim());
      if (domainMode === 'custom') {
        localStorage.setItem('crm_custom_webhook_domain', customDomain.trim());
      } else {
        localStorage.removeItem('crm_custom_webhook_domain');
      }

      // Save encrypted Page Access Token to backend
      if (accessToken.trim()) {
        await webhooksApi.saveMetaCredentials({
          pageAccessToken: accessToken.trim(),
          wabaId: wabaId.trim() || undefined,
          phoneNumberId: phoneNumberId.trim() || undefined,
        });
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert('Failed to save credentials: ' + (err?.response?.data?.message || err.message));
    } finally {
      setIsSavingCreds(false);
    }
  };

  const hasCredentialsStored = Boolean(phoneNumberId.trim() && accessToken.trim());

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 antialiased">
      {/* ─── SECTION HEADER ─── */}
      <div className="flex items-center justify-between flex-wrap gap-4 pb-2 border-b border-slate-200/80 dark:border-[#22293A]">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <MessageSquare className="text-emerald-500" size={22} />
            <span>Meta & WhatsApp Webhook Studio</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Connect Meta WhatsApp Cloud API and Facebook/Instagram Lead Ads directly to your CRM.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTestWebhook}
            disabled={isTestingWebhook || !hasActiveKey}
            className={`flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl border transition-all cursor-pointer shadow-2xs shrink-0 ${
              !hasActiveKey
                ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700'
                : 'border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100/50'
            }`}
          >
            <Activity size={13} className={isTestingWebhook ? 'animate-spin text-emerald-500' : 'text-emerald-500'} />
            <span>{isTestingWebhook ? 'Testing Handshake...' : 'Test Webhook'}</span>
          </button>
        </div>
      </div>

      {/* WEBHOOK TEST RESULT BANNER */}
      {webhookTestResult && (
        <div
          className={`p-4 rounded-xl border text-xs font-medium flex items-start gap-3 shadow-xs animate-in fade-in ${
            webhookTestResult.ok
              ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/20 border-rose-500/30 text-rose-900 dark:text-rose-200'
          }`}
        >
          {webhookTestResult.ok ? (
            <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle size={18} className="text-rose-500 shrink-0 mt-0.5" />
          )}
          <div className="leading-relaxed flex-1 space-y-1">
            <div className="flex items-center justify-between font-bold">
              <span>{webhookTestResult.message}</span>
              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-black/10 dark:bg-white/10">
                HTTP {webhookTestResult.statusCode} ({webhookTestResult.latencyMs}ms)
              </span>
            </div>
            <div className="font-mono text-[11px] bg-white/60 dark:bg-black/40 p-2 rounded-lg border border-black/5 dark:border-white/5 truncate">
              Body: {webhookTestResult.body || '<empty>'}
            </div>
          </div>
        </div>
      )}

      {/* REGENERATE WARNING MODAL */}
      {showRegenerateWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-[#181B26] border border-amber-300 dark:border-amber-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
              <div className="p-2.5 rounded-xl bg-amber-500/10">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Regenerate Webhook Key?
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
              <strong>Warning:</strong> Regenerating your Webhook Key immediately invalidates the current Callback URL and Verify Token. You <strong>must</strong> immediately update the Meta Developers App Dashboard (<span className="font-mono text-crm-blue">developers.facebook.com</span>) with the new Callback URL and Verify Token, or Meta will be unable to validate your endpoint and all incoming WhatsApp and Facebook/Instagram leads will fail.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowRegenerateWarning(false)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-[#2A3042] text-slate-700 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRegenerateKey}
                disabled={isRegeneratingKey}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {isRegeneratingKey ? <RefreshCw size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                <span>{isRegeneratingKey ? 'Regenerating...' : 'Confirm & Invalidate Old Key'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW VERIFY TOKEN SHOWN ONCE BANNER */}
      {newlyGeneratedVerifyToken && (
        <div className="p-4 rounded-xl border border-amber-400/50 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 text-xs font-medium space-y-2 shadow-xs animate-in fade-in">
          <div className="flex items-center justify-between font-bold">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-amber-500" />
              <span>New Verify Token Generated (Copy Now — Shown Once)</span>
            </div>
            <button
              onClick={() => handleCopy(newlyGeneratedVerifyToken, 'newToken')}
              className="text-[11px] px-2.5 py-1 rounded bg-amber-200/80 dark:bg-amber-800/40 hover:bg-amber-300 text-amber-900 dark:text-amber-100 font-bold flex items-center gap-1 cursor-pointer"
            >
              {copiedKey === 'newToken' ? <Check size={12} /> : <Copy size={12} />}
              <span>{copiedKey === 'newToken' ? 'Copied!' : 'Copy Token'}</span>
            </button>
          </div>
          <p className="font-mono text-xs bg-white dark:bg-black/50 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800/40 select-all">
            {newlyGeneratedVerifyToken}
          </p>
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            Copy and paste this token into Meta Developers App Dashboard. For zero-trust security, this token will be permanently masked upon page reload.
          </p>
        </div>
      )}

      {/* ─── 4 REAL LIVE STATUS CARDS ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Public HTTPS Check */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#22293A] shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Public Protocol</p>
            <span className={`w-2 h-2 rounded-full ${isHttps ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          </div>
          <p className="text-sm font-black text-slate-900 dark:text-white truncate">
            {isHttps ? 'HTTPS Ready' : 'HTTP Warning'}
          </p>
          <p className="text-[11px] text-slate-500 truncate">
            {isHttps ? 'TLS 1.3 / SSL encrypted' : 'Meta requires https://'}
          </p>
        </div>

        {/* 2. Tenant Webhook Key */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#22293A] shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tenant Key Status</p>
            <span className={`w-2 h-2 rounded-full ${hasActiveKey ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          </div>
          <p className="text-sm font-black text-slate-900 dark:text-white">
            {hasActiveKey ? 'Key Active' : 'Key Missing'}
          </p>
          <p className="text-[11px] text-slate-500 truncate">
            {hasActiveKey ? 'whk_... (Scoped)' : 'Generate key below'}
          </p>
        </div>

        {/* 3. Last Received Time */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#22293A] shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Last Received</p>
            <span className={`w-2 h-2 rounded-full ${liveConfig.lastReceivedAt ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          </div>
          <p className="text-sm font-black text-slate-900 dark:text-white truncate">
            {liveConfig.lastReceivedAt ? new Date(liveConfig.lastReceivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Never'}
          </p>
          <p className="text-[11px] text-slate-500 truncate">
            {liveConfig.lastReceivedAt ? new Date(liveConfig.lastReceivedAt).toLocaleDateString() : 'Awaiting delivery'}
          </p>
        </div>

        {/* 4. Live Inbound Leads */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#22293A] shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">WhatsApp Ingestion</p>
            <span className={`w-2 h-2 rounded-full ${liveConfig.stats.whatsappCount > 0 ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          </div>
          <p className="text-sm font-black text-slate-900 dark:text-white">
            {liveConfig.stats.whatsappCount > 0 ? `${liveConfig.stats.whatsappCount} Leads Captured` : '0 Inbound Leads'}
          </p>
          <p className="text-[11px] text-slate-500 truncate">
            {liveConfig.stats.lastLeadName ? `Latest: ${liveConfig.stats.lastLeadName}` : 'No leads recorded'}
          </p>
        </div>
      </div>

      {/* ─── WEBHOOK DETAILS CARD (FULL HTTPS & TENANT KEY) ─── */}
      <div className="bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#22293A] rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-100 dark:border-[#1E2536]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500">
              <Globe size={18} />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white">
                Meta App Webhook Ingestion URL
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Keyed endpoint for WhatsApp Cloud incoming messages and Facebook / Instagram Lead Ads.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            Tenant Keyed
          </span>
        </div>

        <div className="space-y-4">
          {/* Callback URL */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Callback URL (Copy into Meta App Dashboard)
              </label>
              {!hasActiveKey && (
                <span className="text-[10px] font-bold text-amber-500">
                  Disabled: Generate a Tenant Webhook Key below to create your secure URL
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                disabled={!hasActiveKey}
                value={hasActiveKey ? callbackUrl : ''}
                placeholder={hasActiveKey ? '' : 'No Webhook Key configured. Click "Generate Webhook Key" below.'}
                className={`flex-1 text-xs font-mono rounded-xl px-3.5 py-2.5 outline-none select-all font-bold border transition-all ${
                  hasActiveKey
                    ? 'bg-slate-50 dark:bg-[#0B0D13] border-slate-200/90 dark:border-[#22293A] text-blue-600 dark:text-blue-400'
                    : 'bg-slate-100 dark:bg-slate-800/40 border-dashed border-slate-300 dark:border-slate-700 text-slate-400 cursor-not-allowed'
                }`}
              />
              <button
                type="button"
                disabled={!hasActiveKey}
                onClick={() => handleCopy(callbackUrl, 'metaUrl')}
                className={`flex items-center gap-1.5 text-xs font-bold px-3.5 py-2.5 rounded-xl border transition-all shrink-0 ${
                  hasActiveKey
                    ? 'border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#171D2B] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#202738] cursor-pointer'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed opacity-60'
                }`}
              >
                {copiedKey === 'metaUrl' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                <span>{copiedKey === 'metaUrl' ? 'Copied' : 'Copy URL'}</span>
              </button>
            </div>
            <p className="text-[10px] text-slate-400">
              Built from real canonical domain (<code>{publicDomain}</code>) and scoped <code>/whatsapp/:key</code> to prevent unauthorized injection.
            </p>
          </div>

          {/* Verification Token */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Verification Token (Verify Token)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 font-semibold">Per-tenant masked</span>
                {newlyGeneratedVerifyToken && (
                  <button
                    type="button"
                    onClick={() => setShowVerifyToken(!showVerifyToken)}
                    className="text-[11px] text-crm-blue hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    {showVerifyToken ? <EyeOff size={12} /> : <Eye size={12} />}
                    <span>{showVerifyToken ? 'Hide' : 'Show Full'}</span>
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type={showVerifyToken ? 'text' : 'password'}
                readOnly
                value={showVerifyToken && newlyGeneratedVerifyToken ? newlyGeneratedVerifyToken : displayVerifyToken}
                className="flex-1 text-xs font-mono bg-slate-50 dark:bg-[#0B0D13] border border-slate-200/90 dark:border-[#22293A] rounded-xl px-3.5 py-2.5 text-slate-700 dark:text-slate-300 outline-none select-all"
              />
              <button
                type="button"
                onClick={() => handleCopy(newlyGeneratedVerifyToken || liveConfig.verifyToken, 'verifyToken')}
                className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#171D2B] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#202738] transition-all cursor-pointer shrink-0"
              >
                {copiedKey === 'verifyToken' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                <span>{copiedKey === 'verifyToken' ? 'Copied' : 'Copy Token'}</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Paste into Meta's <strong>Verify token</strong> field. Meta delivers this token during the <code>hub.challenge</code> handshake.
            </p>
          </div>

          {/* Tenant Webhook Key Manager */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#181D2B] border border-slate-200/80 dark:border-[#22293A] space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Key size={14} className="text-crm-teal" />
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  Tenant Webhook Key
                </span>
                <span className="text-[10px] text-slate-400">(Scoping Key)</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (hasActiveKey) {
                    setShowRegenerateWarning(true);
                  } else {
                    handleConfirmRegenerateKey();
                  }
                }}
                disabled={isRegeneratingKey}
                className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white dark:bg-[#121622] border border-slate-200 dark:border-[#2A3042] text-slate-700 dark:text-slate-300 hover:text-crm-blue cursor-pointer"
              >
                <RefreshCw size={11} className={isRegeneratingKey ? 'animate-spin' : ''} />
                <span>{isRegeneratingKey ? 'Regenerating...' : hasActiveKey ? 'Regenerate Key' : 'Generate Webhook Key'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type={showTenantKey ? 'text' : 'password'}
                value={tenantKey}
                onChange={(e) => {
                  setTenantKey(e.target.value.trim());
                  localStorage.setItem('crm_tenant_webhook_key', e.target.value.trim());
                }}
                placeholder="whk_xxxxxxxxxxxxxxxxxxxxxxxx"
                className="flex-1 text-xs font-mono bg-white dark:bg-[#0B0D13] border border-slate-200/90 dark:border-[#22293A] rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 outline-none"
              />
              <button
                type="button"
                onClick={() => setShowTenantKey(!showTenantKey)}
                className="p-2 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#121622] text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                title={showTenantKey ? 'Hide Key' : 'Show Key'}
              >
                {showTenantKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              {tenantKey && (
                <button
                  type="button"
                  onClick={() => handleCopy(tenantKey, 'tenantKey')}
                  className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#121622] text-slate-700 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
                >
                  {copiedKey === 'tenantKey' ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── LAST 20 DELIVERIES & ERRORS TABLE ─── */}
      <div className="bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#22293A] rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#1E2536]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500">
              <History size={16} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                Recent Deliveries & Error History (Last 20)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Live delivery log showing status codes, handshake attempts, and ingestion errors.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchTenantConfig}
            className="text-xs font-bold text-crm-blue hover:underline flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw size={11} /> Refresh
          </button>
        </div>

        {liveConfig.deliveries && liveConfig.deliveries.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-[#1E2536] text-[10px] font-black uppercase text-slate-400">
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Provider</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">HTTP Code</th>
                  <th className="py-2.5 px-3">Details / Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#1E2536] text-slate-700 dark:text-slate-300">
                {liveConfig.deliveries.slice(0, 20).map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                    <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px]">
                      {new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}{' '}
                      <span className="text-[10px] text-slate-400">({new Date(d.timestamp).toLocaleDateString()})</span>
                    </td>
                    <td className="py-2.5 px-3 uppercase font-bold text-[10px]">
                      {d.provider}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                          d.status === 'SUCCESS' || d.status === 'HANDSHAKE'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-300/40'
                            : d.status === 'DUPLICATE'
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-300/40'
                            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-300/40'
                        }`}
                      >
                        {d.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-xs">
                      {d.statusCode || 200}
                    </td>
                    <td className="py-2.5 px-3 text-[11px] truncate max-w-xs">
                      {d.error ? (
                        <span className="text-rose-600 dark:text-rose-400 font-medium">{d.error}</span>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400">{d.summary || 'Delivered successfully'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400 font-medium">
            No delivery events recorded yet. Click <strong>Test Webhook</strong> above or send an inquiry to verify live logging.
          </div>
        )}
      </div>

      {/* ─── WHATSAPP BUSINESS & META GRAPH API CREDENTIALS FORM ─── */}
      <div className="bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#22293A] rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-[#1E2536]">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500">
            <MessageSquare size={18} />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white">
              Meta Graph API & WhatsApp Outbound Credentials
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Required for fetching full Lead Ads form fields and sending automated WhatsApp messages.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveCredentials} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Phone Number ID */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                WhatsApp Phone Number ID
              </label>
              <div className="relative">
                <Smartphone size={14} className="absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  placeholder="e.g. 100000000000001"
                  className="w-full text-xs font-mono rounded-xl border border-slate-200/90 dark:border-[#22293A] bg-slate-50 dark:bg-[#0B0D13] pl-9 pr-3.5 py-2.5 text-slate-800 dark:text-slate-200 outline-none focus:border-crm-blue"
                />
              </div>
            </div>

            {/* WABA ID */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                WhatsApp Business Account ID (WABA ID)
              </label>
              <div className="relative">
                <ShieldCheck size={14} className="absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  value={wabaId}
                  onChange={(e) => setWabaId(e.target.value)}
                  placeholder="e.g. 294820194850123"
                  className="w-full text-xs font-mono rounded-xl border border-slate-200/90 dark:border-[#22293A] bg-slate-50 dark:bg-[#0B0D13] pl-9 pr-3.5 py-2.5 text-slate-800 dark:text-slate-200 outline-none focus:border-crm-blue"
                />
              </div>
            </div>
          </div>

          {/* Access Token */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                Page Access Token / System User Token (Encrypted at Rest)
              </label>
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="text-[11px] text-crm-blue hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                {showToken ? <EyeOff size={12} /> : <Eye size={12} />}
                <span>{showToken ? 'Hide Token' : 'Show Token'}</span>
              </button>
            </div>
            <div className="relative">
              <Lock size={14} className="absolute left-3.5 top-3 text-slate-400" />
              <input
                type={showToken ? 'text' : 'password'}
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="EAAG...paste your system user token"
                className="w-full text-xs font-mono rounded-xl border border-slate-200/90 dark:border-[#22293A] bg-slate-50 dark:bg-[#0B0D13] pl-9 pr-3.5 py-2.5 text-slate-800 dark:text-slate-200 outline-none focus:border-crm-blue"
              />
            </div>
            <p className="text-[10px] text-slate-400">
              Stored securely with AES-256-GCM encryption per tenant. Used to fetch form fields for <code>leadgen</code> events.
            </p>
          </div>

          {/* Save Button */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-[#1E2536] flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500">Graph Version:</span>
              <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#1E2536] text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300">
                v20.0 (Configurable via META_GRAPH_VERSION)
              </span>
            </div>
            <button
              type="submit"
              disabled={isSavingCreds}
              className="flex items-center gap-1.5 bg-crm-blue hover:bg-crm-blue-hover text-white text-xs px-4 py-2 rounded-xl font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              {saveSuccess ? <Check size={14} /> : <CheckCircle2 size={14} />}
              <span>{isSavingCreds ? 'Saving...' : saveSuccess ? 'Saved Credentials!' : 'Save Meta Configuration'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* ─── CONNECT FACEBOOK PAGE (LEAD ADS OAUTH & SUBSCRIBED_APPS) ─── */}
      <div className="bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#22293A] rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-100 dark:border-[#1E2536]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
              <Globe size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Connect Facebook Page (Lead Ads Ingestion)</span>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  Auto-Subscribed
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Authorizes long-lived Page tokens and automatically invokes <code>subscribed_apps</code> with <code>leadgen</code>.
              </p>
            </div>
          </div>

          <a
            href="https://developers.facebook.com/tools/lead-ads-testing"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#2A3042] text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-crm-blue hover:bg-slate-50 dark:hover:bg-[#171D2B] transition-all"
          >
            <span>Lead Ads Testing Tool</span>
            <ExternalLink size={12} />
          </a>
        </div>

        {/* Lead Ads Integration Checklist */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0B0D13] border border-slate-200/80 dark:border-[#22293A] space-y-2.5">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Lead Ads Pre-Flight Checklist
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
            <div className="p-2.5 rounded-lg bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#1E2536] space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                <CheckCircle2 size={13} className="text-emerald-500" />
                <span>1. Required Meta Permissions</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 pl-4 font-mono">
                pages_show_list, pages_read_engagement, pages_manage_metadata, leads_retrieval, pages_manage_ads
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#1E2536] space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                <CheckCircle2 size={13} className="text-emerald-500" />
                <span>2. App Mode & Access Level</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 pl-4">
                App must be set to <strong>Live Mode</strong> in Meta App Dashboard for public leads (Development mode only permits app admins/testers).
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#1E2536] space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                <CheckCircle2 size={13} className="text-emerald-500" />
                <span>3. Automatic subscribed_apps</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 pl-4">
                Invokes <code>POST /&#123;page-id&#125;/subscribed_apps?subscribed_fields=leadgen</code> so Meta pushes real-time webhooks.
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#1E2536] space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                <CheckCircle2 size={13} className="text-emerald-500" />
                <span>4. Verify via Testing Tool</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 pl-4">
                Use Meta's Lead Ads Testing Tool: Select Page &rarr; Select Form &rarr; Click <strong>Create lead</strong> &rarr; Click <strong>Track status</strong>.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 3-STEP META SETUP GUIDE ─── */}
      <div className="bg-slate-50/70 dark:bg-[#121622]/60 border border-slate-200/80 dark:border-[#22293A] rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Official Meta App Webhook Verification Instructions
          </h3>
          <a
            href="https://developers.facebook.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-bold text-crm-blue hover:underline flex items-center gap-1"
          >
            <span>Open Meta Developers</span>
            <ExternalLink size={12} />
          </a>
        </div>

        <ol className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs text-slate-600 dark:text-slate-300">
          <li className="p-4 bg-white dark:bg-[#121622] rounded-xl border border-slate-200/80 dark:border-[#22293A] space-y-1.5 shadow-2xs">
            <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
              STEP 01
            </span>
            <strong className="text-slate-900 dark:text-white block font-bold mt-1">Open Webhooks Config</strong>
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Log into <span className="font-mono text-crm-blue">developers.facebook.com</span> &rarr; My Apps &rarr; WhatsApp (or Webhooks) &rarr; Configuration.
            </p>
          </li>

          <li className="p-4 bg-white dark:bg-[#121622] rounded-xl border border-slate-200/80 dark:border-[#22293A] space-y-1.5 shadow-2xs">
            <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
              STEP 02
            </span>
            <strong className="text-slate-900 dark:text-white block font-bold mt-1">Verify and Save</strong>
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Paste the exact Callback URL and Verification Token from above, then click <strong>Verify and save</strong>.
            </p>
          </li>

          <li className="p-4 bg-white dark:bg-[#121622] rounded-xl border border-slate-200/80 dark:border-[#22293A] space-y-1.5 shadow-2xs">
            <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
              STEP 03
            </span>
            <strong className="text-slate-900 dark:text-white block font-bold mt-1">Subscribe to Fields</strong>
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Under Webhook fields, click <strong>Manage</strong> and check <code className="text-emerald-500 font-bold">messages</code> and <code className="text-emerald-500 font-bold">leadgen</code> to receive live inbound inquiries.
            </p>
          </li>
        </ol>
      </div>
    </div>
  );
}
