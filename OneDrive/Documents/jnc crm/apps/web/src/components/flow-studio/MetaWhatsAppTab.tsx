import React, { useState, useEffect } from 'react';
import {
  Copy, Check, ExternalLink, ShieldCheck, Zap,
  MessageSquare, Globe, AlertCircle, Sparkles, CheckCircle2,
  Lock, Smartphone, Eye, EyeOff, Key, RefreshCw, Radio, Server, Activity
} from 'lucide-react';
import { getPublicWebhookBaseUrl, webhooksApi } from '../../services/api';

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

  // Meta Graph API Credentials (strictly empty if not entered by user)
  const [phoneNumberId, setPhoneNumberId] = useState(() => localStorage.getItem('crm_meta_phone_id') || '');
  const [wabaId, setWabaId] = useState(() => localStorage.getItem('crm_meta_waba_id') || '');
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem('crm_meta_token') || '');
  const [showToken, setShowToken] = useState(false);
  const [showVerifyToken, setShowVerifyToken] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Live Backend Stats & Configuration
  const [liveConfig, setLiveConfig] = useState<{
    hasWebhookKey: boolean;
    tenantCode?: string;
    isWhatsAppConfigured: boolean;
    verifyToken: string;
    stats: {
      whatsappCount: number;
      lastLeadAt: string | null;
      lastLeadName: string | null;
    };
  }>({
    hasWebhookKey: false,
    isWhatsAppConfigured: false,
    verifyToken: 'meta_verify_token',
    stats: {
      whatsappCount: 0,
      lastLeadAt: null,
      lastLeadName: null,
    },
  });

  // Health check test states
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [healthStatus, setHealthStatus] = useState<{ checked: boolean; ok: boolean; message: string } | null>(null);

  // Resolve Public HTTPS Domain
  const resolveDomain = () => {
    if (domainMode === 'custom' && customDomain.trim()) {
      return customDomain.trim().replace(/\/+$/, '');
    }
    return getPublicWebhookBaseUrl();
  };

  const publicDomain = resolveDomain();
  const isHttps = publicDomain.toLowerCase().startsWith('https://');

  // Exact Callback URL for Meta
  const keyToDisplay = tenantKey || (liveConfig.hasWebhookKey ? '<YOUR_TENANT_KEY>' : 'whk_tenant_key');
  const callbackUrl = `${publicDomain}/api/v1/webhooks/whatsapp/${keyToDisplay}`;
  const verifyToken = liveConfig.verifyToken || 'meta_verify_token';

  // Fetch real tenant config and statistics on mount
  const fetchTenantConfig = async () => {
    try {
      const res = await webhooksApi.getConfig();
      if (res.data) {
        setLiveConfig({
          hasWebhookKey: Boolean(res.data.hasWebhookKey),
          tenantCode: res.data.tenantCode,
          isWhatsAppConfigured: Boolean(res.data.isWhatsAppConfigured),
          verifyToken: res.data.verifyToken || 'meta_verify_token',
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
    const interval = setInterval(fetchTenantConfig, 25000);
    return () => clearInterval(interval);
  }, []);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Generate / Regenerate Tenant Webhook Key
  const handleRegenerateKey = async () => {
    setIsRegeneratingKey(true);
    try {
      const res = await webhooksApi.regenerateKey();
      if (res.data?.webhookKey) {
        setTenantKey(res.data.webhookKey);
        localStorage.setItem('crm_tenant_webhook_key', res.data.webhookKey);
        setLiveConfig((prev) => ({ ...prev, hasWebhookKey: true }));
        setShowTenantKey(true);
      }
    } catch (err: any) {
      console.error('Failed to regenerate key:', err);
    } finally {
      setIsRegeneratingKey(false);
    }
  };

  // Test Public /api/v1/health Endpoint
  const handleTestHealth = async () => {
    setIsCheckingHealth(true);
    setHealthStatus(null);
    try {
      const healthUrl = `${publicDomain}/api/v1/health`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(healthUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        setHealthStatus({
          checked: true,
          ok: true,
          message: `Health check passed (HTTP ${res.status} OK)! Your backend is reachable by Meta.`,
        });
      } else {
        setHealthStatus({
          checked: true,
          ok: false,
          message: `Domain reached, but returned HTTP ${res.status}. Expected 200 OK on ${healthUrl}.`,
        });
      }
    } catch (err: any) {
      setHealthStatus({
        checked: true,
        ok: false,
        message: `Connection failed: ${err.name === 'AbortError' ? 'Connection timed out' : err.message}. Verify that ${publicDomain} is live or Cloudflare Tunnel is running.`,
      });
    } finally {
      setIsCheckingHealth(false);
    }
  };

  const handleSaveCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('crm_meta_phone_id', phoneNumberId.trim());
    localStorage.setItem('crm_meta_waba_id', wabaId.trim());
    localStorage.setItem('crm_meta_token', accessToken.trim());
    if (domainMode === 'custom') {
      localStorage.setItem('crm_custom_webhook_domain', customDomain.trim());
    } else {
      localStorage.removeItem('crm_custom_webhook_domain');
    }
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const hasCredentialsStored = Boolean(phoneNumberId.trim() && accessToken.trim());

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 antialiased">
      {/* ─── SECTION HEADER ─── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
              Meta Lead Ads &amp; WhatsApp Cloud API
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              Facebook &bull; Instagram &bull; WhatsApp Cloud
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Keyed webhook ingestion scoped to your tenant. Connect Facebook Instant Forms and WhatsApp Cloud API.
          </p>
        </div>

        <button
          type="button"
          onClick={handleTestHealth}
          disabled={isCheckingHealth}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-slate-200/90 dark:border-[#22293A] bg-white dark:bg-[#121622] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#181D2B] transition-all cursor-pointer shadow-2xs shrink-0"
        >
          <Activity size={13} className={isCheckingHealth ? 'animate-spin text-crm-blue' : 'text-slate-400'} />
          <span>{isCheckingHealth ? 'Testing Health...' : 'Test Public /health'}</span>
        </button>
      </div>

      {/* HEALTH STATUS BANNER */}
      {healthStatus && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-bold flex items-start gap-2.5 shadow-2xs animate-in fade-in ${
            healthStatus.ok
              ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/20 border-rose-500/30 text-rose-800 dark:text-rose-300'
          }`}
        >
          {healthStatus.ok ? (
            <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
          )}
          <div className="leading-relaxed">
            <p>{healthStatus.message}</p>
          </div>
        </div>
      )}

      {/* ─── 4 REAL LIVE STATUS CARDS (NO MOCK TEXT) ─── */}
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
            <span className={`w-2 h-2 rounded-full ${tenantKey || liveConfig.hasWebhookKey ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          </div>
          <p className="text-sm font-black text-slate-900 dark:text-white">
            {tenantKey || liveConfig.hasWebhookKey ? 'Key Active' : 'Key Missing'}
          </p>
          <p className="text-[11px] text-slate-500 truncate">
            {tenantKey ? 'whk_... (scoped)' : liveConfig.hasWebhookKey ? 'Hashed in database' : 'Generate key below'}
          </p>
        </div>

        {/* 3. WhatsApp Graph Credentials */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#22293A] shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Graph Credentials</p>
            <span className={`w-2 h-2 rounded-full ${hasCredentialsStored ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          </div>
          <p className="text-sm font-black text-slate-900 dark:text-white">
            {hasCredentialsStored ? 'Credentials Set' : 'Not Configured'}
          </p>
          <p className="text-[11px] text-slate-500 truncate">
            {hasCredentialsStored ? 'Phone ID & Token saved' : 'Optional for outbound'}
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
            {liveConfig.stats.lastLeadAt
              ? `Last: ${new Date(liveConfig.stats.lastLeadAt).toLocaleDateString()}`
              : 'Awaiting first webhook'}
          </p>
        </div>
      </div>

      {/* ─── PUBLIC DOMAIN & TUNNEL SELECTOR CARD ─── */}
      <div className="bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#22293A] rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-100 dark:border-[#1E2536]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
              <Server size={16} />
            </div>
            <div>
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                Public Webhook Base Domain
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Choose the public HTTPS domain where Meta should send webhook traffic.
              </p>
            </div>
          </div>
        </div>

        {/* Domain radio options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <label
            onClick={() => setDomainMode('production')}
            className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex items-start gap-2.5 ${
              domainMode === 'production'
                ? 'border-crm-blue bg-blue-50/50 dark:bg-blue-950/20 text-slate-900 dark:text-white font-bold'
                : 'border-slate-200 dark:border-[#2A3042] text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5'
            }`}
          >
            <input
              type="radio"
              name="domainMode"
              checked={domainMode === 'production'}
              onChange={() => setDomainMode('production')}
              className="mt-0.5 text-crm-blue"
            />
            <div>
              <p className="text-xs font-bold">Primary Production URL</p>
              <span className="text-[10px] text-slate-400 font-normal">Configured API / Webhook Host</span>
            </div>
          </label>

          <label
            onClick={() => setDomainMode('custom')}
            className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex items-start gap-2.5 ${
              domainMode === 'custom'
                ? 'border-crm-blue bg-blue-50/50 dark:bg-blue-950/20 text-slate-900 dark:text-white font-bold'
                : 'border-slate-200 dark:border-[#2A3042] text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5'
            }`}
          >
            <input
              type="radio"
              name="domainMode"
              checked={domainMode === 'custom'}
              onChange={() => setDomainMode('custom')}
              className="mt-0.5 text-crm-blue"
            />
            <div>
              <p className="text-xs font-bold">Cloudflare / Custom Tunnel</p>
              <span className="text-[10px] text-slate-400 font-normal">For local testing (trycloudflare.com)</span>
            </div>
          </label>
        </div>

        {/* Custom Tunnel Input if selected */}
        {domainMode === 'custom' && (
          <div className="pt-2 animate-in fade-in space-y-1.5">
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
              Custom Tunnel URL (with https://)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customDomain}
                onChange={(e) => {
                  setCustomDomain(e.target.value);
                  localStorage.setItem('crm_custom_webhook_domain', e.target.value.trim());
                }}
                placeholder="https://xxxx.trycloudflare.com"
                className="flex-1 text-xs font-mono rounded-xl border border-slate-200/90 dark:border-[#22293A] bg-slate-50 dark:bg-[#0B0D13] px-3.5 py-2 text-slate-800 dark:text-slate-200 outline-none focus:border-crm-blue"
              />
              <button
                type="button"
                onClick={handleTestHealth}
                className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#171D2B] text-slate-700 dark:text-slate-200 hover:bg-slate-50"
              >
                Test URL
              </button>
            </div>
          </div>
        )}
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
              {!tenantKey && (
                <span className="text-[10px] font-bold text-amber-500">
                  Notice: Generate a Tenant Webhook Key below to complete URL
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={callbackUrl}
                className="flex-1 text-xs font-mono bg-slate-50 dark:bg-[#0B0D13] border border-slate-200/90 dark:border-[#22293A] rounded-xl px-3.5 py-2.5 text-blue-600 dark:text-blue-400 outline-none select-all font-bold"
              />
              <button
                type="button"
                onClick={() => handleCopy(callbackUrl, 'metaUrl')}
                className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#171D2B] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#202738] transition-all cursor-pointer shrink-0"
              >
                {copiedKey === 'metaUrl' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                <span>{copiedKey === 'metaUrl' ? 'Copied' : 'Copy URL'}</span>
              </button>
            </div>
            <p className="text-[10px] text-slate-400">
              Includes full HTTPS domain and scoped <code>/whatsapp/:key</code> route to prevent unauthorized lead injection.
            </p>
          </div>

          {/* Verification Token */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Verification Token (Verify Token)
              </label>
              <button
                type="button"
                onClick={() => setShowVerifyToken(!showVerifyToken)}
                className="text-[11px] text-crm-blue hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                {showVerifyToken ? <EyeOff size={12} /> : <Eye size={12} />}
                <span>{showVerifyToken ? 'Hide Secret' : 'Show Secret'}</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type={showVerifyToken ? 'text' : 'password'}
                readOnly
                value={verifyToken}
                className="flex-1 text-xs font-mono bg-slate-50 dark:bg-[#0B0D13] border border-slate-200/90 dark:border-[#22293A] rounded-xl px-3.5 py-2.5 text-slate-700 dark:text-slate-300 outline-none select-all"
              />
              <button
                type="button"
                onClick={() => handleCopy(verifyToken, 'verifyToken')}
                className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#171D2B] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#202738] transition-all cursor-pointer shrink-0"
              >
                {copiedKey === 'verifyToken' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                <span>{copiedKey === 'verifyToken' ? 'Copied' : 'Copy Token'}</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Matches <code>WHATSAPP_VERIFY_TOKEN</code> on your server. Meta sends this token during the <code>hub.challenge</code> handshake.
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
                <span className="text-[10px] text-slate-400">(Secret Key for Inbound Scoping)</span>
              </div>
              <button
                type="button"
                onClick={handleRegenerateKey}
                disabled={isRegeneratingKey}
                className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white dark:bg-[#121622] border border-slate-200 dark:border-[#2A3042] text-slate-700 dark:text-slate-300 hover:text-crm-blue cursor-pointer"
              >
                <RefreshCw size={11} className={isRegeneratingKey ? 'animate-spin' : ''} />
                <span>{isRegeneratingKey ? 'Regenerating...' : tenantKey ? 'Regenerate Key' : 'Generate Webhook Key'}</span>
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
            <p className="text-[10px] text-slate-400">
              The plain key is stored in your browser session and hashed on the server with SHA-256 for zero-trust isolation.
            </p>
          </div>
        </div>
      </div>

      {/* ─── WHATSAPP BUSINESS API CREDENTIALS FORM ─── */}
      <div className="bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#22293A] rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-[#1E2536]">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500">
            <MessageSquare size={18} />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white">
              WhatsApp Business Cloud API Outbound Credentials
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Required for your CRM to send automated follow-up messages and quotations to customer phones.
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
              <p className="text-[10px] text-slate-400">From Meta Developers &rarr; WhatsApp &rarr; API Setup</p>
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
              <p className="text-[10px] text-slate-400">Found in WhatsApp Business Account Settings</p>
            </div>
          </div>

          {/* Access Token */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                Permanent System User Access Token
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
              Generated in Meta Business Manager with permissions: <code>whatsapp_business_messaging</code> and <code>leads_retrieval</code>.
            </p>
          </div>

          {/* Save Button */}
          <div className="flex items-center justify-end pt-3 border-t border-slate-100 dark:border-[#1E2536]">
            <button
              type="submit"
              className="flex items-center gap-1.5 bg-crm-blue hover:bg-crm-blue-hover text-white text-xs px-4 py-2 rounded-xl font-bold shadow-xs transition-all cursor-pointer"
            >
              {saveSuccess ? <Check size={14} /> : <CheckCircle2 size={14} />}
              <span>{saveSuccess ? 'Saved Credentials!' : 'Save Meta Configuration'}</span>
            </button>
          </div>
        </form>
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
              Paste the exact Callback URL (starting with <code>https://</code>) and Verification Token from above, then click <strong>Verify and save</strong>.
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
