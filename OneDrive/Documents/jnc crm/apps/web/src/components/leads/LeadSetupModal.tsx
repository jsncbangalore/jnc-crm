import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Sliders, Globe, MessageSquare, Link2, Copy, Check, ExternalLink,
  ShieldCheck, Zap, Users, ArrowRight, Bell, Clock, RefreshCw, Send,
  CheckCircle2, Sparkles, Building2, Smartphone, FileCode2, Play,
  Settings, CheckSquare, Layers, AlertCircle
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePopup } from '../../contexts/PopupContext';
import { leadsApi, usersApi } from '../../services/api';
import { User as UserType } from '../../types';

export interface LeadSetupViewProps {
  initialTab?: 'indiamart' | 'website' | 'whatsapp' | 'routing' | 'pipeline';
  onLeadCreated?: () => void;
  onNavigateToPipeline?: () => void;
  isModal?: boolean;
  onClose?: () => void;
}

export function LeadSetupView({
  initialTab = 'indiamart',
  onLeadCreated,
  onNavigateToPipeline,
  isModal = false,
  onClose,
}: LeadSetupViewProps) {
  const { user } = useAuth();
  const { showAlert } = usePopup();

  const [activeTab, setActiveTab] = useState<'indiamart' | 'website' | 'whatsapp' | 'routing' | 'pipeline'>(initialTab);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [employees, setEmployees] = useState<UserType[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);

  // Form states for routing configuration
  const [assignmentMode, setAssignmentMode] = useState<'round_robin' | 'direct' | 'claim'>('round_robin');
  const [selectedRepId, setSelectedRepId] = useState<string>('');
  const [slaMinutes, setSlaMinutes] = useState<number>(15);
  const [highValueAlertThreshold, setHighValueAlertThreshold] = useState<number>(50000);
  const [autoAckEmail, setAutoAckEmail] = useState<boolean>(true);
  const [autoAckWhatsapp, setAutoAckWhatsapp] = useState<boolean>(true);

  // Webhook and API URLs
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://admin.jsnc.co.in';
  const publicInquiryUrl = `${origin}/inquiry`;
  const indiamartWebhookUrl = `${origin}/api/v1/webhooks/indiamart`;
  const whatsappWebhookUrl = `${origin}/api/v1/webhooks/whatsapp`;

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    usersApi.list({ role: 'employee' })
      .then((res) => {
        const list = res.data.items || [];
        setEmployees(list);
        if (list.length > 0 && !selectedRepId) {
          setSelectedRepId(list[0].id);
        }
      })
      .catch(() => {});
  }, []);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Embeddable HTML Widget Snippet
  const embedCode = `<!-- JSNC Clean Web-to-Lead Embed Widget -->
<iframe
  src="${publicInquiryUrl}"
  width="100%"
  height="650"
  style="border: none; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.08);"
  title="Customer Inquiry Form"
></iframe>`;

  // Simulation Trigger: Injects a Real-time Test Lead into pipeline
  const handleSimulateInboundLead = async (source: 'indiamart' | 'web' | 'whatsapp') => {
    setIsSimulating(true);
    try {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const testNames = ['Rajesh Electronics', 'Metro Infrastructure', 'Apex Hospital PA Setup', 'Pioneer Engineering'];
      const pickedCompany = testNames[Math.floor(Math.random() * testNames.length)];

      const payload = {
        customerName: `Contact ${randomSuffix}`,
        customerPhone: `98450${randomSuffix}`,
        customerEmail: `lead${randomSuffix}@testdomain.com`,
        companyName: `${pickedCompany} #${randomSuffix}`,
        city: 'Bengaluru',
        productCategory: 'Commercial PA System',
        estimatedValue: 45000 + (randomSuffix % 5) * 10000,
        urgency: randomSuffix % 2 === 0 ? 'urgent' : 'standard',
        source,
        queryMessage: `Inquiry submitted via ${source.toUpperCase()} live stream test simulation. System ready for dispatch.`,
        assignedToId: assignmentMode === 'direct' ? selectedRepId : undefined,
      };

      await leadsApi.create(payload);
      showAlert('Success', `Real-time test lead captured from ${source.toUpperCase()} and placed in "New Inquiries" pipeline!`);
      if (onLeadCreated) onLeadCreated();
    } catch (err: any) {
      showAlert('Error', 'Failed to generate test lead: ' + (err.response?.data?.message || err.message));
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className={`bg-white dark:bg-[#13161F] border border-slate-200 dark:border-[#2A3042] rounded-2xl shadow-xl overflow-hidden flex flex-col ${isModal ? 'max-h-[90vh]' : 'w-full'}`}>
      
      {/* ─── HEADER ──────────────────────────────────────────────────────── */}
      <div className="px-6 py-5 border-b border-slate-200 dark:border-[#2A3042] flex items-center justify-between bg-slate-50/80 dark:bg-[#181B26] shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-crm-blue/15 border border-crm-blue/30 flex items-center justify-center text-crm-blue shadow-glow-blue">
            <Sliders size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-slate-900 dark:text-white">
                Lead Setup & Real-time Flow Controller
              </h2>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Ingestion
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
              Configure IndiaMART webhook listener, Web-to-Lead inquiry form, WhatsApp Cloud API, and real-time sales auto-routing.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onNavigateToPipeline && (
            <button
              onClick={onNavigateToPipeline}
              className="btn bg-crm-blue hover:bg-crm-blue-hover text-white text-xs gap-1.5 shadow-glow-blue font-bold px-3 py-1.5"
            >
              <span>Go to Pipeline Board</span>
              <ArrowRight size={13} />
            </button>
          )}

          {isModal && onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

        {/* ─── LIVE STATUS BAR ──────────────────────────────────────────────── */}
        <div className="px-6 py-2.5 bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-teal-50/70 dark:from-blue-950/30 dark:via-indigo-950/20 dark:to-teal-950/30 border-b border-slate-200 dark:border-[#2A3042] flex items-center justify-between gap-3 text-xs shrink-0 flex-wrap">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Webhook Listener:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">Active & Listening</span>
            </div>

            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
              <Clock size={13} className="text-crm-blue" />
              <span>Response SLA:</span>
              <span className="font-bold text-slate-900 dark:text-white">{slaMinutes} Minutes</span>
            </div>

            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
              <Users size={13} className="text-crm-teal" />
              <span>Routing Mode:</span>
              <span className="font-bold uppercase text-slate-900 dark:text-white">{assignmentMode.replace('_', ' ')}</span>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            Host: {origin.replace('https://', '').replace('http://', '')}
          </div>
        </div>

        {/* ─── NAVIGATION TABS ──────────────────────────────────────────────── */}
        <div className="px-6 border-b border-slate-200 dark:border-[#2A3042] flex items-center gap-2 overflow-x-auto bg-slate-50/50 dark:bg-[#151824] shrink-0 pt-2">
          <button
            onClick={() => setActiveTab('indiamart')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'indiamart'
                ? 'border-crm-blue text-crm-blue bg-white dark:bg-[#13161F]'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#2E5EFF]" />
            <span>IndiaMART API & Push</span>
          </button>

          <button
            onClick={() => setActiveTab('website')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'website'
                ? 'border-crm-teal text-crm-teal bg-white dark:bg-[#13161F]'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Globe size={14} />
            <span>Web-to-Lead & Form</span>
          </button>

          <button
            onClick={() => setActiveTab('whatsapp')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'whatsapp'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-white dark:bg-[#13161F]'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <MessageSquare size={14} />
            <span>WhatsApp Business API</span>
          </button>

          <button
            onClick={() => setActiveTab('routing')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'routing'
                ? 'border-crm-violet text-crm-violet bg-white dark:bg-[#13161F]'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Zap size={14} />
            <span>Sales Routing & SLA</span>
          </button>

          <button
            onClick={() => setActiveTab('pipeline')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'pipeline'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400 bg-white dark:bg-[#13161F]'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Layers size={14} />
            <span>Pipeline Flow Architecture</span>
          </button>
        </div>

        {/* ─── MODAL BODY CONTENT ───────────────────────────────────────────── */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {/* ══════════════════════════════════════════════════════════════════
              TAB 1: INDIAMART INTEGRATION ENGINE
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'indiamart' && (
            <div className="space-y-5">
              <div className="bg-slate-50 dark:bg-[#181B26] p-4 rounded-xl border border-slate-200 dark:border-[#2A3042]">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#2E5EFF]" />
                    IndiaMART Push Webhook URL (Live Endpoint)
                  </span>
                  <span className="text-[11px] font-bold text-crm-blue bg-crm-blue/10 px-2 py-0.5 rounded-md">
                    POST Webhook
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={indiamartWebhookUrl}
                    className="input font-mono text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-[#13161F] flex-1 cursor-text select-all"
                  />
                  <button
                    onClick={() => handleCopy(indiamartWebhookUrl, 'indiamart-webhook')}
                    className="btn btn-secondary text-xs flex items-center gap-1.5 shrink-0"
                  >
                    {copiedKey === 'indiamart-webhook' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    <span>{copiedKey === 'indiamart-webhook' ? 'Copied!' : 'Copy URL'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                  Enter this URL in your <strong>IndiaMART Seller Portal &gt; CRM Integration &gt; Push API URL</strong>.
                </p>
              </div>

              {/* IndiaMART Settings Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#151824] space-y-3">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <ShieldCheck size={14} className="text-emerald-500" /> Security & Auth Header
                  </h4>
                  <div>
                    <label className="label text-[11px]">Push Secret Header Key</label>
                    <input
                      type="text"
                      readOnly
                      value="x-indiamart-token"
                      className="input text-xs font-mono bg-slate-50 dark:bg-[#181B26]"
                    />
                  </div>
                  <div>
                    <label className="label text-[11px]">IndiaMART CRM Key (Optional Query Token)</label>
                    <input
                      type="text"
                      placeholder="e.g. mPlus_your_crm_key_here"
                      className="input text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#151824] space-y-3">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Zap size={14} className="text-amber-500" /> Real-time Ingestion Controls
                  </h4>
                  <div className="space-y-2 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" defaultChecked className="rounded border-slate-300 text-crm-blue" />
                      <span>Auto-deduplicate repeat inquiries within 24 hours</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" defaultChecked className="rounded border-slate-300 text-crm-blue" />
                      <span>Trigger instant sales alert sound on inbound lead</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" defaultChecked className="rounded border-slate-300 text-crm-blue" />
                      <span>Auto-create Company record if GSTIN or firm name exists</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Simulation Box */}
              <div className="p-4 rounded-xl border border-crm-blue/30 bg-crm-blue/5 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Sparkles size={14} className="text-crm-blue" /> Test Live IndiaMART Lead Delivery
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Simulates an instant IndiaMART prospect inquiry to verify pipeline arrival and notifications.
                  </p>
                </div>
                <button
                  onClick={() => handleSimulateInboundLead('indiamart')}
                  disabled={isSimulating}
                  className="btn-primary text-xs flex items-center gap-1.5 shrink-0"
                >
                  <Play size={13} />
                  <span>{isSimulating ? 'Injecting Lead...' : 'Send Test IndiaMART Lead'}</span>
                </button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 2: WEBSITE & WEB-TO-LEAD EMBED
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'website' && (
            <div className="space-y-5">
              {/* Hosted Form Link */}
              <div className="bg-slate-50 dark:bg-[#181B26] p-4 rounded-xl border border-slate-200 dark:border-[#2A3042]">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Globe size={14} className="text-crm-teal" />
                    Public Hosted Inquiry Page URL
                  </span>
                  <a
                    href={publicInquiryUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-bold text-crm-teal hover:underline flex items-center gap-1"
                  >
                    <span>Open Live Page</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={publicInquiryUrl}
                    className="input font-mono text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-[#13161F] flex-1 cursor-text select-all"
                  />
                  <button
                    onClick={() => handleCopy(publicInquiryUrl, 'web-link')}
                    className="btn btn-secondary text-xs flex items-center gap-1.5 shrink-0"
                  >
                    {copiedKey === 'web-link' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    <span>{copiedKey === 'web-link' ? 'Copied!' : 'Copy Link'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                  Share this public URL on your website, WhatsApp bio, email signatures, or marketing campaigns.
                </p>
              </div>

              {/* Embed Code Snippet */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#151824] space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <FileCode2 size={14} className="text-indigo-500" />
                    Embeddable HTML Widget Snippet (Website Form)
                  </h4>
                  <button
                    onClick={() => handleCopy(embedCode, 'embed-code')}
                    className="btn btn-secondary text-xs flex items-center gap-1.5"
                  >
                    {copiedKey === 'embed-code' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    <span>{copiedKey === 'embed-code' ? 'Copied HTML!' : 'Copy Embed Code'}</span>
                  </button>
                </div>
                <textarea
                  readOnly
                  rows={5}
                  value={embedCode}
                  className="input font-mono text-[11px] leading-relaxed bg-slate-50 dark:bg-[#181B26] select-all resize-none"
                />
              </div>

              {/* Simulation Box */}
              <div className="p-4 rounded-xl border border-crm-teal/30 bg-crm-teal/5 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Sparkles size={14} className="text-crm-teal" /> Test Web Form Inbound Submission
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Simulates a prospect inquiry submitted via your website form.
                  </p>
                </div>
                <button
                  onClick={() => handleSimulateInboundLead('web')}
                  disabled={isSimulating}
                  className="btn bg-crm-teal hover:bg-crm-teal-hover text-white text-xs flex items-center gap-1.5 shrink-0 shadow-glow-teal"
                >
                  <Play size={13} />
                  <span>{isSimulating ? 'Submitting...' : 'Send Test Web Lead'}</span>
                </button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 3: WHATSAPP CLOUD API & BOT INTEGRATION
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'whatsapp' && (
            <div className="space-y-5">
              <div className="bg-slate-50 dark:bg-[#181B26] p-4 rounded-xl border border-slate-200 dark:border-[#2A3042]">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <MessageSquare size={14} className="text-emerald-500" />
                    Meta WhatsApp Cloud API Webhook Callback URL
                  </span>
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                    GET Handshake + POST Inbound
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={whatsappWebhookUrl}
                    className="input font-mono text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-[#13161F] flex-1 cursor-text select-all"
                  />
                  <button
                    onClick={() => handleCopy(whatsappWebhookUrl, 'whatsapp-webhook')}
                    className="btn btn-secondary text-xs flex items-center gap-1.5 shrink-0"
                  >
                    {copiedKey === 'whatsapp-webhook' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    <span>{copiedKey === 'whatsapp-webhook' ? 'Copied!' : 'Copy URL'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                  Configure this in <strong>Meta for Developers &gt; WhatsApp &gt; Configuration &gt; Callback URL</strong>.
                </p>
              </div>

              {/* WhatsApp Config Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#151824] space-y-3">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <ShieldCheck size={14} className="text-emerald-500" /> Verification Token
                  </h4>
                  <div>
                    <label className="label text-[11px]">Webhook Verify Token</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value="jnc_crm_whatsapp_verify_token_prod"
                        className="input text-xs font-mono bg-slate-50 dark:bg-[#181B26] flex-1"
                      />
                      <button
                        onClick={() => handleCopy('jnc_crm_whatsapp_verify_token_prod', 'whatsapp-verify')}
                        className="btn btn-secondary text-xs shrink-0"
                      >
                        {copiedKey === 'whatsapp-verify' ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#151824] space-y-3">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Smartphone size={14} className="text-emerald-500" /> Automated Welcome Reply
                  </h4>
                  <textarea
                    rows={3}
                    defaultValue="Hello! Thank you for inquiring with our engineering team. A dedicated technical specialist has been assigned and will connect with you shortly."
                    className="input text-xs leading-relaxed resize-none"
                  />
                </div>
              </div>

              {/* Simulation Box */}
              <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Sparkles size={14} className="text-emerald-500" /> Test Inbound WhatsApp Message
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Simulates a customer sending a WhatsApp message to your business phone number.
                  </p>
                </div>
                <button
                  onClick={() => handleSimulateInboundLead('whatsapp')}
                  disabled={isSimulating}
                  className="btn bg-emerald-600 hover:bg-emerald-500 text-white text-xs flex items-center gap-1.5 shrink-0 shadow-sm"
                >
                  <Play size={13} />
                  <span>{isSimulating ? 'Connecting...' : 'Send Test WhatsApp Lead'}</span>
                </button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 4: SALES ROUTING & SLA CONTROLLER
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'routing' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Mode 1: Round Robin */}
                <div
                  onClick={() => setAssignmentMode('round_robin')}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    assignmentMode === 'round_robin'
                      ? 'border-crm-blue bg-crm-blue/5 dark:bg-crm-blue/10 shadow-glow-blue'
                      : 'border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#151824] hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">Round Robin</h4>
                    {assignmentMode === 'round_robin' && <CheckCircle2 size={16} className="text-crm-blue" />}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Evenly rotates new inbound inquiries across all active sales engineers in rotation.
                  </p>
                </div>

                {/* Mode 2: Direct Rep */}
                <div
                  onClick={() => setAssignmentMode('direct')}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    assignmentMode === 'direct'
                      ? 'border-crm-violet bg-crm-violet/5 dark:bg-crm-violet/10 shadow-glow-violet'
                      : 'border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#151824] hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">Direct Assigned Rep</h4>
                    {assignmentMode === 'direct' && <CheckCircle2 size={16} className="text-crm-violet" />}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Directs all incoming prospects straight to a designated primary sales coordinator.
                  </p>
                </div>

                {/* Mode 3: Open Claim Pool */}
                <div
                  onClick={() => setAssignmentMode('claim')}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    assignmentMode === 'claim'
                      ? 'border-crm-teal bg-crm-teal/5 dark:bg-crm-teal/10 shadow-glow-teal'
                      : 'border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#151824] hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">Open Pool / Claim</h4>
                    {assignmentMode === 'claim' && <CheckCircle2 size={16} className="text-crm-teal" />}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Places new leads in the unassigned pool; first representative to accept claims the deal.
                  </p>
                </div>
              </div>

              {/* Direct Rep Selection if direct mode is active */}
              {assignmentMode === 'direct' && (
                <div className="p-4 rounded-xl border border-crm-violet/30 bg-crm-violet/5 space-y-2">
                  <label className="label text-xs font-bold">Select Primary Sales Representative</label>
                  <select
                    value={selectedRepId}
                    onChange={(e) => setSelectedRepId(e.target.value)}
                    className="input text-xs"
                  >
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.employeeCode}) — {emp.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* SLA & Alert Parameters */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#151824] space-y-3">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Clock size={14} className="text-amber-500" /> Response Time SLA Target
                  </h4>
                  <div className="flex items-center gap-3">
                    {[15, 30, 60].map((mins) => (
                      <button
                        key={mins}
                        onClick={() => setSlaMinutes(mins)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                          slaMinutes === mins
                            ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                            : 'bg-slate-50 dark:bg-[#181B26] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#2A3042]'
                        }`}
                      >
                        {mins} Minutes
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Triggers overdue warning indicators if inquiry remains in 'New' stage past this window.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#151824] space-y-3">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Bell size={14} className="text-rose-500" /> High-Value Lead Alert Threshold
                  </h4>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500">₹</span>
                    <input
                      type="number"
                      value={highValueAlertThreshold}
                      onChange={(e) => setHighValueAlertThreshold(Number(e.target.value))}
                      className="input text-xs flex-1"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Immediately flags high-priority banners for opportunities equal to or above this value.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 5: PIPELINE FLOW ARCHITECTURE
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'pipeline' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#181B26]">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <Layers size={14} className="text-crm-blue" />
                  Real-time Deal Progression Stages & Conversion Velocity
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { stage: '1. New Inquiries', desc: 'Inbound stream via IndiaMART, Web, WhatsApp', color: 'border-t-[#2E5EFF]', pill: 'bg-[#2E5EFF]/15 text-[#2E5EFF]' },
                    { stage: '2. Contacted', desc: 'Initial call/chat initiated within SLA window', color: 'border-t-[#8B5CF6]', pill: 'bg-[#8B5CF6]/15 text-[#8B5CF6]' },
                    { stage: '3. Qualified', desc: 'Site requirements and budget validated', color: 'border-t-[#00D2B4]', pill: 'bg-[#00D2B4]/15 text-[#00D2B4]' },
                    { stage: '4. Quoted / Proposal', desc: 'Commercial quotation generated and shared', color: 'border-t-[#FFB020]', pill: 'bg-[#FFB020]/15 text-[#FFB020]' },
                    { stage: '5. Won / Closed', desc: 'PO received and converted directly to Order', color: 'border-t-[#10B981]', pill: 'bg-[#10B981]/15 text-[#10B981]' },
                  ].map((s, idx) => (
                    <div key={idx} className={`p-3 rounded-xl bg-white dark:bg-[#13161F] border border-slate-200 dark:border-[#2A3042] ${s.color} border-t-4 shadow-sm flex flex-col justify-between`}>
                      <div>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${s.pill}`}>
                          {s.stage}
                        </span>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                          {s.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Conversion Actions Summary */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#151824] space-y-2">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <CheckSquare size={14} className="text-emerald-500" /> Direct 1-Click Conversion Actions
                </h4>
                <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5 list-disc list-inside">
                  <li><strong>Generate Quotation</strong>: Creates an official tax quotation retaining all customer specifications.</li>
                  <li><strong>Convert to Order</strong>: Reserves warehouse component stock and schedules logistics dispatch.</li>
                  <li><strong>Log Call / Activity</strong>: Records timestamped interactions with scheduled follow-up reminders.</li>
                </ul>
              </div>
            </div>
          )}

        </div>

        {/* ─── FOOTER ──────────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-[#2A3042] bg-slate-50/80 dark:bg-[#181B26] flex items-center justify-between shrink-0 flex-wrap gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Webhook listeners and sales SLA rules are live across your tenant instance.</span>
          </div>

          <div className="flex items-center gap-2">
            {isModal && onClose && (
              <button
                onClick={onClose}
                className="btn btn-secondary text-xs"
              >
                Close
              </button>
            )}
            <button
              onClick={() => {
                showAlert('Saved', 'Lead setup preferences and sales routing rules updated successfully.');
                if (onClose) onClose();
              }}
              className="btn-primary text-xs flex items-center gap-1.5 shadow-glow-blue px-4 py-2 font-bold"
            >
              <Check size={14} />
              <span>Save & Apply Configuration</span>
            </button>
          </div>
        </div>

    </div>
  );
}

export interface LeadSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'indiamart' | 'website' | 'whatsapp' | 'routing' | 'pipeline';
  onLeadCreated?: () => void;
  onNavigateToPipeline?: () => void;
}

export default function LeadSetupModal({
  isOpen,
  onClose,
  initialTab = 'indiamart',
  onLeadCreated,
  onNavigateToPipeline,
}: LeadSetupModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-4xl my-6">
        <LeadSetupView
          initialTab={initialTab}
          onLeadCreated={onLeadCreated}
          onNavigateToPipeline={() => {
            onClose();
            if (onNavigateToPipeline) onNavigateToPipeline();
          }}
          isModal={true}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
