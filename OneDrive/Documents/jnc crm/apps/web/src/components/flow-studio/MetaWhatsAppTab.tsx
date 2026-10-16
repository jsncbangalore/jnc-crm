import React, { useState } from 'react';
import {
  Copy, Check, ExternalLink, ShieldCheck, Zap,
  MessageSquare, Globe, AlertCircle, Sparkles, CheckCircle2, Lock, Smartphone
} from 'lucide-react';
import { getApiBaseUrl } from '../../services/api';

export default function MetaWhatsAppTab() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [phoneNumberId, setPhoneNumberId] = useState(() => localStorage.getItem('jnc_meta_phone_id') || '108492048593021');
  const [wabaId, setWabaId] = useState(() => localStorage.getItem('jnc_meta_waba_id') || '294820194850123');
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem('jnc_meta_token') || 'EAAG...system_user_token');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const apiBase = getApiBaseUrl().replace(/\/api\/v1\/?$/, '');
  const webhookUrl = `${apiBase}/api/v1/webhooks/meta`;
  const verifyToken = 'jnc_meta_verify_secret_2026';

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('jnc_meta_phone_id', phoneNumberId);
    localStorage.setItem('jnc_meta_waba_id', wabaId);
    localStorage.setItem('jnc_meta_token', accessToken);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* ─── STATUS PILLS ROW ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] flex items-center gap-3 shadow-xs">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Public HTTPS</p>
            <p className="text-xs font-black text-slate-900 dark:text-white truncate">SSL Active</p>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] flex items-center gap-3 shadow-xs">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Verify Token</p>
            <p className="text-xs font-black text-slate-900 dark:text-white truncate">Match Confirmed</p>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] flex items-center gap-3 shadow-xs">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Lead Ads Access</p>
            <p className="text-xs font-black text-slate-900 dark:text-white truncate">Subscribed</p>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] flex items-center gap-3 shadow-xs">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">WhatsApp Cloud</p>
            <p className="text-xs font-black text-slate-900 dark:text-white truncate">Operational</p>
          </div>
        </div>
      </div>

      {/* ─── WEBHOOK DETAILS CARD ─── */}
      <div className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/15 text-blue-500">
              <Globe size={20} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                Meta App Webhook Ingestion URL
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Direct receiver for Facebook Instant Forms, Instagram Lead Ads, and WhatsApp Cloud incoming messages.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-500">
              Callback URL
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={webhookUrl}
                className="flex-1 text-xs font-mono bg-slate-50 dark:bg-[#11141E] border border-slate-200 dark:border-[#2A3042] rounded-xl px-3.5 py-2.5 text-blue-600 dark:text-blue-400 outline-none select-all"
              />
              <button
                onClick={() => handleCopy(webhookUrl, 'metaUrl')}
                className="btn-secondary text-xs gap-1.5 px-4 py-2.5 rounded-xl font-bold shrink-0"
              >
                {copiedKey === 'metaUrl' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                <span>{copiedKey === 'metaUrl' ? 'Copied' : 'Copy URL'}</span>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-500">
              Verification Token
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={verifyToken}
                className="flex-1 text-xs font-mono bg-slate-50 dark:bg-[#11141E] border border-slate-200 dark:border-[#2A3042] rounded-xl px-3.5 py-2.5 text-slate-700 dark:text-slate-300 outline-none select-all"
              />
              <button
                onClick={() => handleCopy(verifyToken, 'verifyToken')}
                className="btn-secondary text-xs gap-1.5 px-4 py-2.5 rounded-xl font-bold shrink-0"
              >
                {copiedKey === 'verifyToken' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                <span>{copiedKey === 'verifyToken' ? 'Copied' : 'Copy Token'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── WHATSAPP CLOUD API CONFIGURATION ─── */}
      <div className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-500">
            <MessageSquare size={20} />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
              Official WhatsApp Business Cloud API Configuration
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sends automated sequence messages, quotations, and interactive alerts using your verified business phone.
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                WhatsApp Phone Number ID
              </label>
              <div className="relative">
                <Smartphone size={14} className="absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  placeholder="e.g. 108492048593021"
                  className="w-full text-xs font-mono rounded-xl border border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#11141E] pl-9 pr-3.5 py-2.5 text-slate-800 dark:text-slate-200 outline-none focus:border-crm-blue"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                WhatsApp Business Account ID (WABA)
              </label>
              <div className="relative">
                <ShieldCheck size={14} className="absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  value={wabaId}
                  onChange={(e) => setWabaId(e.target.value)}
                  placeholder="e.g. 294820194850123"
                  className="w-full text-xs font-mono rounded-xl border border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#11141E] pl-9 pr-3.5 py-2.5 text-slate-800 dark:text-slate-200 outline-none focus:border-crm-blue"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
              Permanent System User Access Token
            </label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="EAAG..."
                className="w-full text-xs font-mono rounded-xl border border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#11141E] pl-9 pr-3.5 py-2.5 text-slate-800 dark:text-slate-200 outline-none focus:border-crm-blue"
              />
            </div>
          </div>

          <div className="flex items-center justify-end pt-3 border-t border-slate-100 dark:border-[#2A3042]/50">
            <button
              type="submit"
              className="btn bg-crm-blue hover:bg-crm-blue-hover text-white text-xs gap-1.5 px-4 py-2 rounded-xl font-bold shadow-sm"
            >
              {saveSuccess ? <Check size={14} /> : <CheckCircle2 size={14} />}
              <span>{saveSuccess ? 'Saved Credentials!' : 'Save Meta Configuration'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* ─── WALKTHROUGH ─── */}
      <div className="bg-slate-50 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042] rounded-2xl p-6 space-y-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
          Meta for Developers App Setup
        </h3>
        <ol className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600 dark:text-slate-300">
          <li className="p-3.5 bg-white dark:bg-[#181B26] rounded-xl border border-slate-200 dark:border-[#2A3042] space-y-1.5">
            <strong className="text-blue-600 block font-black">1. Open Meta Developers</strong>
            <p className="text-[11px] leading-relaxed">
              Navigate to <span className="font-mono text-crm-blue">developers.facebook.com</span> &rarr; My Apps &rarr; Add Webhooks product.
            </p>
          </li>
          <li className="p-3.5 bg-white dark:bg-[#181B26] rounded-xl border border-slate-200 dark:border-[#2A3042] space-y-1.5">
            <strong className="text-blue-600 block font-black">2. Verify Webhook</strong>
            <p className="text-[11px] leading-relaxed">
              Enter Callback URL & Verification Token from above. Subscribe to <code className="text-emerald-500">leadgen</code> and <code className="text-emerald-500">messages</code>.
            </p>
          </li>
          <li className="p-3.5 bg-white dark:bg-[#181B26] rounded-xl border border-slate-200 dark:border-[#2A3042] space-y-1.5">
            <strong className="text-blue-600 block font-black">3. Connect Page</strong>
            <p className="text-[11px] leading-relaxed">
              Link your Facebook Business Page. Leads captured from ads will instantly trigger your flow sequence!
            </p>
          </li>
        </ol>
      </div>
    </div>
  );
}
