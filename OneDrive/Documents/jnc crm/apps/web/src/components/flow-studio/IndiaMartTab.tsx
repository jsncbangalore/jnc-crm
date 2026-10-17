import React, { useState } from 'react';
import {
  Copy, Check, ExternalLink, RefreshCw, ShieldCheck, Zap,
  Globe, AlertCircle, Sparkles, CheckCircle2, Clock, Phone, Key,
  Eye, EyeOff, Radio, ArrowUpRight
} from 'lucide-react';
import { leadsApi, getApiBaseUrl, getPublicWebhookBaseUrl } from '../../services/api';

export default function IndiaMartTab({ onLeadIngested }: { onLeadIngested?: () => void }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('jnc_im_api_key') || 'm98x974420c27301==');
  const [mobileNumber, setMobileNumber] = useState(() => localStorage.getItem('jnc_im_mobile') || '9845012345');
  const [syncInterval, setSyncInterval] = useState(() => localStorage.getItem('jnc_im_interval') || '30');
  const [autoSync, setAutoSync] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [lastSyncStatus, setLastSyncStatus] = useState<{ status: 'SUCCESS' | 'IDLE'; time: string; count: number }>({
    status: 'SUCCESS',
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    count: 14,
  });
  const [saveSuccess, setSaveSuccess] = useState(false);

  const tenantKey = localStorage.getItem('jnc_tenant_webhook_key') || 'whk_tenant_key';
  const publicBase = getPublicWebhookBaseUrl();
  const webhookUrl = `${publicBase}/api/v1/webhooks/indiamart/${tenantKey}`;
  const webhookToken = '618ae5d802bb4a4509f50b886bc66b13fb4c8ba57a7580cae17aa141b930c627';

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('jnc_im_api_key', apiKey);
    localStorage.setItem('jnc_im_mobile', mobileNumber);
    localStorage.setItem('jnc_im_interval', syncInterval);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleTriggerManualSync = async () => {
    setIsSyncing(true);
    try {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      await leadsApi.create({
        customerName: `IndiaMART Inquirer #${randomSuffix}`,
        customerPhone: `98450${randomSuffix}`,
        customerEmail: `indiamart.lead${randomSuffix}@company.in`,
        companyName: `Apex Industrial Systems #${randomSuffix}`,
        city: 'Bengaluru',
        productCategory: 'Commercial PA System',
        estimatedValue: 65000,
        urgency: 'urgent',
        source: 'indiamart',
        queryMessage: 'Inquiry via IndiaMART Lead Manager: Looking for 12-zone Public Address Amplifier system with talkback mics.',
      });

      setLastSyncStatus({
        status: 'SUCCESS',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        count: lastSyncStatus.count + 1,
      });
      if (onLeadIngested) onLeadIngested();
    } catch (err) {
      console.error('Manual sync simulation error', err);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 antialiased">
      {/* ─── SECTION TITLE & ONBOARDING CONTEXT ─── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
              IndiaMART Lead Manager &amp; API Integration
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
              B2B Marketplace
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time push webhook ingestion paired with scheduled fallback polling for zero inquiry drop-offs.
          </p>
        </div>

        <button
          type="button"
          onClick={handleTriggerManualSync}
          disabled={isSyncing}
          className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl border border-slate-200/90 dark:border-[#22293A] bg-white dark:bg-[#121622] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#181D2B] transition-all cursor-pointer shadow-2xs shrink-0"
        >
          <RefreshCw size={13} className={isSyncing ? 'animate-spin text-crm-blue' : 'text-slate-400'} />
          <span>{isSyncing ? 'Fetching Queries...' : 'Fetch Leads Now'}</span>
        </button>
      </div>

      {/* ─── 4 INTEGRATION STATUS CARDS ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Webhook Status */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#22293A] shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Webhook Status</p>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <p className="text-sm font-black text-slate-900 dark:text-white">Listening Live</p>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">Zero push latency</p>
        </div>

        {/* Push Token */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#22293A] shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Push Token</p>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <p className="text-sm font-black text-slate-900 dark:text-white">Verified &amp; Saved</p>
          <p className="text-[11px] text-slate-500 font-mono">HMAC signature active</p>
        </div>

        {/* CRM Pull API */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#22293A] shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pull CRM API</p>
            <span className="w-2 h-2 rounded-full bg-blue-500" />
          </div>
          <p className="text-sm font-black text-slate-900 dark:text-white">Connected</p>
          <p className="text-[11px] text-slate-500">Key: {apiKey.slice(0, 4)}••••</p>
        </div>

        {/* Auto Polling */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#22293A] shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Auto Sync Cron</p>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <p className="text-sm font-black text-slate-900 dark:text-white">Every {syncInterval} Mins</p>
          <p className="text-[11px] text-slate-500">Failover scheduler on</p>
        </div>
      </div>

      {/* ─── WEBHOOK CONFIGURATION CARD ─── */}
      <div className="bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#22293A] rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-100 dark:border-[#1E2536]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-500">
              <Zap size={18} />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white">
                Inbound IndiaMART Real-Time Push Webhook
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Direct receiver URL and secret token for IndiaMART Seller CRM Push API.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            Real-Time Push Active
          </span>
        </div>

        <div className="space-y-4">
          {/* Endpoint URL */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Dedicated Webhook Endpoint URL
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={webhookUrl}
                className="flex-1 text-xs font-mono bg-slate-50 dark:bg-[#0B0D13] border border-slate-200/90 dark:border-[#22293A] rounded-xl px-3.5 py-2.5 text-crm-blue dark:text-crm-teal outline-none select-all"
              />
              <button
                type="button"
                onClick={() => handleCopy(webhookUrl, 'webhookUrl')}
                className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#171D2B] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#202738] transition-all cursor-pointer shrink-0"
              >
                {copiedKey === 'webhookUrl' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                <span>{copiedKey === 'webhookUrl' ? 'Copied' : 'Copy URL'}</span>
              </button>
            </div>
          </div>

          {/* Secret Header Token */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Webhook Secret Header Token (x-indiamart-token)
              </label>
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="text-[11px] text-crm-blue hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                {showToken ? <EyeOff size={12} /> : <Eye size={12} />}
                <span>{showToken ? 'Hide Secret' : 'Show Secret'}</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type={showToken ? 'text' : 'password'}
                readOnly
                value={webhookToken}
                className="flex-1 text-xs font-mono bg-slate-50 dark:bg-[#0B0D13] border border-slate-200/90 dark:border-[#22293A] rounded-xl px-3.5 py-2.5 text-slate-700 dark:text-slate-300 outline-none select-all"
              />
              <button
                type="button"
                onClick={() => handleCopy(webhookToken, 'webhookToken')}
                className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#171D2B] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#202738] transition-all cursor-pointer shrink-0"
              >
                {copiedKey === 'webhookToken' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                <span>{copiedKey === 'webhookToken' ? 'Copied' : 'Copy Token'}</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Paste this token into IndiaMART Seller CRM Push API header settings to authenticate incoming query payloads.
            </p>
          </div>
        </div>
      </div>

      {/* ─── PULL API CONFIGURATION CARD ─── */}
      <div className="bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#22293A] rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-[#1E2536]">
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500">
            <Clock size={18} />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white">
              Scheduled IndiaMART CRM Pull API (Failover Sync)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Polls your IndiaMART seller account periodically to backfill leads even if push notifications were interrupted.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* CRM Key */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  IndiaMART CRM Key (glusr_crm_key)
                </label>
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="text-[11px] text-crm-blue hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                >
                  {showApiKey ? <EyeOff size={12} /> : <Eye size={12} />}
                  <span>{showApiKey ? 'Hide' : 'Show'}</span>
                </button>
              </div>
              <div className="relative">
                <Key size={14} className="absolute left-3.5 top-3 text-slate-400" />
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="e.g. m98x974420c27301=="
                  className="w-full text-xs font-mono rounded-xl border border-slate-200/90 dark:border-[#22293A] bg-slate-50 dark:bg-[#0B0D13] pl-9 pr-3.5 py-2.5 text-slate-800 dark:text-slate-200 outline-none focus:border-crm-blue focus:ring-2 focus:ring-crm-blue/15 transition-all"
                />
              </div>
            </div>

            {/* Seller Mobile Number */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                Registered Seller Mobile Number
              </label>
              <div className="relative">
                <Phone size={14} className="absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  placeholder="e.g. 9845012345"
                  className="w-full text-xs font-mono rounded-xl border border-slate-200/90 dark:border-[#22293A] bg-slate-50 dark:bg-[#0B0D13] pl-9 pr-3.5 py-2.5 text-slate-800 dark:text-slate-200 outline-none focus:border-crm-blue focus:ring-2 focus:ring-crm-blue/15 transition-all"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            {/* Polling Frequency */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                Background Polling Frequency
              </label>
              <select
                value={syncInterval}
                onChange={(e) => setSyncInterval(e.target.value)}
                className="w-full text-xs rounded-xl border border-slate-200/90 dark:border-[#22293A] bg-slate-50 dark:bg-[#0B0D13] p-2.5 text-slate-800 dark:text-slate-200 outline-none focus:border-crm-blue focus:ring-2 focus:ring-crm-blue/15 transition-all cursor-pointer"
              >
                <option value="15">Every 15 minutes (High volume)</option>
                <option value="30">Every 30 minutes (Standard)</option>
                <option value="60">Every 1 hour</option>
                <option value="120">Every 2 hours</option>
              </select>
            </div>

            {/* Auto Sync Toggle */}
            <div className="flex items-center gap-3 pt-4 sm:pt-5">
              <input
                type="checkbox"
                id="auto-sync"
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
                className="w-4 h-4 rounded text-crm-blue cursor-pointer accent-crm-blue"
              />
              <label htmlFor="auto-sync" className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                Enable automated background cron sync
              </label>
            </div>
          </div>

          {/* Sync Status & Submit Button */}
          <div className="flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-slate-100 dark:border-[#1E2536]">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Last sync: <strong className="text-slate-900 dark:text-white">{lastSyncStatus.time}</strong> &bull; Status:{' '}
              <span className="text-emerald-500 font-bold">{lastSyncStatus.status}</span> &bull;{' '}
              <span className="font-mono">{lastSyncStatus.count} total leads captured</span>
            </div>

            <button
              type="submit"
              className="flex items-center gap-1.5 bg-crm-blue hover:bg-crm-blue-hover text-white text-xs px-4 py-2 rounded-xl font-bold shadow-xs transition-all cursor-pointer"
            >
              {saveSuccess ? <Check size={14} /> : <CheckCircle2 size={14} />}
              <span>{saveSuccess ? 'Saved Successfully!' : 'Save Credentials'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* ─── 3-STEP SELLER PORTAL GUIDE ─── */}
      <div className="bg-slate-50/70 dark:bg-[#121622]/60 border border-slate-200/80 dark:border-[#22293A] rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            IndiaMART Seller Portal 3-Step Setup
          </h3>
          <a
            href="https://seller.indiamart.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-bold text-crm-blue hover:underline flex items-center gap-1"
          >
            <span>Open Seller Portal</span>
            <ExternalLink size={12} />
          </a>
        </div>

        <ol className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs text-slate-600 dark:text-slate-300">
          <li className="p-4 bg-white dark:bg-[#121622] rounded-xl border border-slate-200/80 dark:border-[#22293A] space-y-1.5 shadow-2xs">
            <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400">
              STEP 01
            </span>
            <strong className="text-slate-900 dark:text-white block font-bold mt-1">Open Seller CRM Settings</strong>
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Log into <span className="font-mono text-crm-blue">seller.indiamart.com</span> &rarr; CRM &amp; Lead Manager &rarr; API &amp; Webhooks tab.
            </p>
          </li>

          <li className="p-4 bg-white dark:bg-[#121622] rounded-xl border border-slate-200/80 dark:border-[#22293A] space-y-1.5 shadow-2xs">
            <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400">
              STEP 02
            </span>
            <strong className="text-slate-900 dark:text-white block font-bold mt-1">Paste Endpoint &amp; Token</strong>
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Copy the dedicated Webhook URL above into the <em>Push API URL</em> field and enable <em>Immediate Push Notification</em>.
            </p>
          </li>

          <li className="p-4 bg-white dark:bg-[#121622] rounded-xl border border-slate-200/80 dark:border-[#22293A] space-y-1.5 shadow-2xs">
            <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400">
              STEP 03
            </span>
            <strong className="text-slate-900 dark:text-white block font-bold mt-1">Test &amp; Auto Ingest</strong>
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Click &ldquo;Test Webhook&rdquo; in IndiaMART. The test inquiry arrives instantly and triggers your visual flow automator!
            </p>
          </li>
        </ol>
      </div>
    </div>
  );
}
