import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Sliders, Globe, MessageSquare, Link2, Copy, Check, ExternalLink,
  ShieldCheck, Zap, Users, ArrowRight, Bell, Clock, RefreshCw, Send,
  CheckCircle2, Sparkles, Building2, Smartphone, FileCode2, Play,
  Settings, CheckSquare, Layers, AlertCircle, Flame, Plus,
  Eye, Palette, Code, CheckCircle, Trash2, Phone, Mail
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { usePopup } from '../../contexts/PopupContext';
import { leadsApi, usersApi, getApiBaseUrl, webhooksApi } from '../../services/api';
import { getProductName } from '../../config/brand';
import { User as UserType } from '../../types';

export interface LeadSetupViewProps {
  initialTab?: 'indiamart' | 'website' | 'whatsapp' | 'routing' | 'pipeline';
  onLeadCreated?: () => void;
  onNavigateToPipeline?: () => void;
  isModal?: boolean;
  onClose?: () => void;
  todayCount?: number;
  pipelineCount?: number;
  sourceCountsToday?: { indiamart: number; web: number; whatsapp: number; manual: number };
  onOpenAddLead?: () => void;
  onOpenShareModal?: () => void;
}

export function LeadSetupView({
  initialTab = 'indiamart',
  onLeadCreated,
  onNavigateToPipeline,
  isModal = false,
  onClose,
  todayCount = 0,
  pipelineCount = 0,
  sourceCountsToday = { indiamart: 0, web: 0, whatsapp: 0, manual: 0 },
  onOpenAddLead,
  onOpenShareModal,
}: LeadSetupViewProps) {
  const { user } = useAuth();
  const { showAlert } = usePopup();

  const [activeTab, setActiveTab] = useState<'indiamart' | 'website' | 'whatsapp' | 'routing' | 'pipeline'>(initialTab);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [employees, setEmployees] = useState<UserType[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [tenantWebhookKey, setTenantWebhookKey] = useState<string>(() => localStorage.getItem('crm_tenant_webhook_key') || '');
  const [webhookVerifyToken, setWebhookVerifyToken] = useState<string>('meta_verify_token');

  // Form states for routing configuration
  const [assignmentMode, setAssignmentMode] = useState<'round_robin' | 'direct' | 'claim'>('round_robin');
  const [selectedRepId, setSelectedRepId] = useState<string>('');
  const [slaMinutes, setSlaMinutes] = useState<number>(15);
  const [highValueAlertThreshold, setHighValueAlertThreshold] = useState<number>(50000);
  const [autoAckEmail, setAutoAckEmail] = useState<boolean>(true);
  const [autoAckWhatsapp, setAutoAckWhatsapp] = useState<boolean>(true);

  // Webhook and API URLs (Guaranteed full absolute HTTPS URLs with tenant key)
  const origin = typeof window !== 'undefined'
    ? (import.meta.env.VITE_PUBLIC_API_URL || window.location.origin)
    : '';
  const isDevHost = typeof window !== 'undefined' && (window.location.hostname.startsWith('local') || window.location.hostname.startsWith('127.'));

  const publicInquiryUrl = `${origin}/inquiry`;
  const metaWebhookUrl = `${origin}/api/v1/webhooks/meta/${tenantWebhookKey || 'whk_tenant_key'}`;
  const whatsappWebhookUrl = `${origin}/api/v1/webhooks/whatsapp/${tenantWebhookKey || 'whk_tenant_key'}`;
  const indiamartWebhookUrl = `${origin}/api/v1/webhooks/indiamart/${tenantWebhookKey || 'whk_tenant_key'}`;
  const liveSubmitUrl = `${origin}/api/v1/webhooks/website/${tenantWebhookKey || 'whk_tenant_key'}`;

  // Custom Web-to-Lead Form Generator states
  const [generatorCompany, setGeneratorCompany] = useState<string>(() => getProductName());
  const [generatorPhone, setGeneratorPhone] = useState<string>('');
  const [generatorEmail, setGeneratorEmail] = useState<string>('');
  const [generatorButtonText, setGeneratorButtonText] = useState<string>('Submit Requirement for Quotation');
  const [generatorThemeColor, setGeneratorThemeColor] = useState<string>('#2E5EFF');
  const [availableProducts, setAvailableProducts] = useState<string[]>([
    'PA System (Public Address & Amplifiers)',
    'Talk Back System (Two-Way Communication)',
    'Addressable Talk Back System',
    'Fire Alarm System (3-in-1)',
    'Nurse Call System (Hospital Intercom)',
    'EPABX / IPABX Telephony Systems',
    'CCTV & Video Surveillance',
    'Access Control & Biometric Attendance',
    'Panic Alarm & Emergency Alert Systems',
    'Network Infrastructure & Uninterrupted Power',
    'Electronic Components & Microcontrollers',
  ]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([
    'PA System (Public Address & Amplifiers)',
    'Talk Back System (Two-Way Communication)',
    'Fire Alarm System (3-in-1)',
    'CCTV & Video Surveillance',
  ]);
  const [newCustomProduct, setNewCustomProduct] = useState<string>('');
  const [formFields, setFormFields] = useState({
    name: true,
    phone: true,
    email: true,
    company: true,
    city: true,
    quantity: true,
    urgency: true,
    message: true,
  });
  const [embedMode, setEmbedMode] = useState<'html' | 'iframe'>('html');
  const [activeSubTab, setActiveSubTab] = useState<'generator' | 'hosted'>('generator');
  const [previewViewMode, setPreviewViewMode] = useState<'preview' | 'code'>('preview');

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Fetch real company details & products on mount
  useEffect(() => {
    axios.get('/api/v1/webhooks/inquiry-info')
      .then((res) => {
        if (res.data?.company) {
          if (res.data.company.name) setGeneratorCompany(res.data.company.name);
          if (res.data.company.phone) setGeneratorPhone(res.data.company.phone);
          if (res.data.company.email) setGeneratorEmail(res.data.company.email);
        }
        if (Array.isArray(res.data?.products) && res.data.products.length > 0) {
          const productNames: string[] = res.data.products.map((p: any) => p.name || p.skuCode).filter(Boolean);
          if (productNames.length > 0) {
            setAvailableProducts(prev => Array.from(new Set([...productNames, ...prev])));
            setSelectedProducts(productNames.slice(0, 6));
          }
        }
      })
      .catch(() => {});

    usersApi.list()
      .then((res: any) => {
        if (Array.isArray(res.data)) {
          setEmployees(res.data);
          if (res.data.length > 0) setSelectedRepId(res.data[0].id);
        }
      })
      .catch(() => {});

    webhooksApi.getConfig()
      .then((res: any) => {
        if (res.data?.webhookKey) {
          setTenantWebhookKey(res.data.webhookKey);
          localStorage.setItem('crm_tenant_webhook_key', res.data.webhookKey);
        }
        if (res.data?.verifyToken) {
          setWebhookVerifyToken(res.data.verifyToken);
        }
      })
      .catch(() => {});
  }, []);

  const embedCode = `<iframe 
  src="${publicInquiryUrl}" 
  width="100%" 
  height="780" 
  style="border:none; border-radius:12px; box-shadow: 0 10px 30px rgba(0,0,0,0.08);"
  title="Inquiry Form"
></iframe>`;

  const standaloneHtmlCode = `<!-- ==========================================
     ${generatorCompany} Web-to-Lead Form
     Live Ingestion Endpoint: ${liveSubmitUrl}
========================================== -->
<div id="crm-lead-form-wrapper" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 640px; margin: 20px auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05); color: #0f172a; box-sizing: border-box;">
  <div style="margin-bottom: 20px; border-bottom: 1px solid #f1f5f9; padding-bottom: 16px;">
    <h3 style="margin: 0 0 6px 0; font-size: 20px; font-weight: 800; color: #0f172a;">${generatorCompany}</h3>
    <p style="margin: 0; font-size: 13px; color: #64748b;">Request an official commercial quotation or project consultation.</p>
    ${generatorPhone || generatorEmail ? `
    <div style="margin-top: 8px; font-size: 12px; color: #64748b; display: flex; gap: 14px; flex-wrap: wrap;">
      ${generatorPhone ? `<span><strong>Phone:</strong> ${generatorPhone}</span>` : ''}
      ${generatorEmail ? `<span><strong>Email:</strong> ${generatorEmail}</span>` : ''}
    </div>` : ''}
  </div>

  <form id="crm-inquiry-form" onsubmit="handleCrmFormSubmit(event)" autocomplete="off">
    <input type="text" name="_hp_company_trap" style="display:none !important;" tabindex="-1" autocomplete="off" />

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
      ${formFields.name ? `
      <div>
        <label style="display: block; font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 5px;">Your Name *</label>
        <input type="text" name="name" required autocomplete="off" placeholder="Full Name" style="width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; box-sizing: border-box; outline: none;" />
      </div>` : ''}

      ${formFields.phone ? `
      <div>
        <label style="display: block; font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 5px;">Phone Number *</label>
        <input type="tel" name="phone" required autocomplete="off" placeholder="Phone Number" style="width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; box-sizing: border-box; outline: none;" />
      </div>` : ''}
    </div>

    ${formFields.email || formFields.company ? `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
      ${formFields.email ? `
      <div>
        <label style="display: block; font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 5px;">Email Address</label>
        <input type="email" name="email" placeholder="name@example.com" style="width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; box-sizing: border-box; outline: none;" />
      </div>` : ''}
      ${formFields.company ? `
      <div>
        <label style="display: block; font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 5px;">Company / Firm Name</label>
        <input type="text" name="company" placeholder="Company Name" style="width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; box-sizing: border-box; outline: none;" />
      </div>` : ''}
    </div>` : ''}

    <div style="margin-bottom: 14px;">
      <label style="display: block; font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 5px;">Product / Solution Required *</label>
      <select name="productCategory" required style="width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; background-color: #ffffff; box-sizing: border-box; outline: none;">
        ${selectedProducts.map(p => `<option value="${p}">${p}</option>`).join('\n        ')}
        <option value="Other Custom Requirement">Other Custom Requirement</option>
      </select>
    </div>

    ${formFields.city || formFields.quantity ? `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
      ${formFields.city ? `
      <div>
        <label style="display: block; font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 5px;">City / Site Location</label>
        <input type="text" name="city" placeholder="e.g. City Name, State" style="width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; box-sizing: border-box; outline: none;" />
      </div>` : ''}
      ${formFields.quantity ? `
      <div>
        <label style="display: block; font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 5px;">Estimated Qty / Units</label>
        <input type="text" name="quantity" placeholder="e.g. 10 Units / 1 Complete Setup" style="width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; box-sizing: border-box; outline: none;" />
      </div>` : ''}
    </div>` : ''}

    ${formFields.urgency ? `
    <div style="margin-bottom: 14px;">
      <label style="display: block; font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 5px;">Requirement Timeline</label>
      <select name="urgency" style="width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; background-color: #ffffff; box-sizing: border-box; outline: none;">
        <option value="urgent">Urgent / Immediate (Within 48 Hours)</option>
        <option value="medium" selected>Standard (1 - 2 Weeks)</option>
        <option value="low">Budgeting / Future Planning (1+ Month)</option>
      </select>
    </div>` : ''}

    ${formFields.message ? `
    <div style="margin-bottom: 18px;">
      <label style="display: block; font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 5px;">Additional Requirements / Technical Specifications</label>
      <textarea name="message" rows="3" placeholder="Provide any model numbers, site details, or special features needed..." style="width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; box-sizing: border-box; resize: vertical; outline: none;"></textarea>
    </div>` : ''}

    <button type="submit" id="crm-submit-btn" style="width: 100%; background-color: ${generatorThemeColor}; color: #ffffff; border: none; border-radius: 8px; padding: 12px 18px; font-size: 14px; font-weight: 700; cursor: pointer; transition: opacity 0.2s; box-shadow: 0 4px 12px ${generatorThemeColor}40;">
      ${generatorButtonText}
    </button>

    <div id="crm-status-msg" style="display: none; margin-top: 14px; padding: 12px; border-radius: 8px; font-size: 13px; text-align: center;"></div>
  </form>

  <script>
    function handleCrmFormSubmit(e) {
      e.preventDefault();
      var form = e.target;
      var btn = document.getElementById('crm-submit-btn');
      var status = document.getElementById('crm-status-msg');
      var originalBtnText = btn.innerText;

      btn.disabled = true;
      btn.innerText = 'Submitting requirement...';
      btn.style.opacity = '0.7';

      var data = {
        name: form.name ? form.name.value : '',
        phone: form.phone ? form.phone.value : '',
        email: form.email ? form.email.value : '',
        company: form.company ? form.company.value : '',
        city: form.city ? form.city.value : '',
        productCategory: form.productCategory ? form.productCategory.value : '',
        productName: form.productCategory ? form.productCategory.value : '',
        quantity: form.quantity ? form.quantity.value : '',
        urgency: form.urgency ? form.urgency.value : 'medium',
        queryMessage: (form.message ? form.message.value : '') + '\\n(Direct Form Submission to ${generatorCompany})',
        _hp_company_trap: form._hp_company_trap ? form._hp_company_trap.value : '',
        submissionId: 'WEB-' + Date.now()
      };

      fetch('${liveSubmitUrl}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      .then(function(res) { return res.json(); })
      .then(function(result) {
        btn.disabled = false;
        btn.innerText = originalBtnText;
        btn.style.opacity = '1';
        status.style.display = 'block';
        if (result.status === 'SUCCESS' || result.leadId) {
          status.style.backgroundColor = '#ecfdf5';
          status.style.color = '#065f46';
          status.style.border = '1px solid #a7f3d0';
          status.innerHTML = '<strong>Success!</strong> Thank you. Your inquiry (ID: ' + (result.leadId || 'Captured') + ') has been registered with ${generatorCompany}. Our team will contact you shortly.';
          form.reset();
        } else {
          status.style.backgroundColor = '#fef2f2';
          status.style.color = '#991b1b';
          status.style.border = '1px solid #fecaca';
          status.innerHTML = 'Submission failed: ' + (result.message || 'Please check your inputs.');
        }
      })
      .catch(function(err) {
        btn.disabled = false;
        btn.innerText = originalBtnText;
        btn.style.opacity = '1';
        status.style.display = 'block';
        status.style.backgroundColor = '#fef2f2';
        status.style.color = '#991b1b';
        status.style.border = '1px solid #fecaca';
        status.innerHTML = 'Network error submitting inquiry. Please contact us directly.';
      });
    }
  </script>
</div>`;

  // Simulation Trigger: Injects a Real-time Test Lead into pipeline
  const handleSimulateInboundLead = async (source: 'indiamart' | 'web' | 'whatsapp') => {
    setIsSimulating(true);
    try {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const pickedCompany = `Test Account ${randomSuffix}`;

      const payload = {
        customerName: `Test Lead ${randomSuffix}`,
        customerPhone: '',
        customerEmail: '',
        companyName: `${pickedCompany} #${randomSuffix}`,
        city: '',
        productCategory: 'Commercial Systems',
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

      {/* ─── LEADS TODAY & INBOUND CHANNELS METRIC BAR ────────────────────── */}
      <div className="px-6 py-4 bg-slate-50/90 dark:bg-[#151824] border-b border-slate-200 dark:border-[#2A3042] flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-5 flex-wrap">
          {/* Animated Counter */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#2E5EFF]/15 border border-[#2E5EFF]/30 flex items-center justify-center text-[#2E5EFF] shadow-glow-blue">
              <Flame size={22} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Leads Captured Today</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-950 dark:text-white tabular-nums tracking-tight">
                  {todayCount}
                </span>
                <span className="text-xs text-slate-500 font-mono">({pipelineCount} in pipeline)</span>
              </div>
            </div>
          </div>

          <div className="h-8 w-[1px] bg-slate-200 dark:bg-[#2A3042] hidden sm:block" />

          {/* Source Breakdown Interactive Channel Switchers */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* IndiaMART */}
            <button
              onClick={() => setActiveTab('indiamart')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm hover:scale-[1.02] ${
                activeTab === 'indiamart'
                  ? 'bg-[#2E5EFF] text-white shadow-glow-blue'
                  : 'bg-[#2E5EFF]/15 hover:bg-[#2E5EFF]/25 text-[#2E5EFF] border border-[#2E5EFF]/30'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${activeTab === 'indiamart' ? 'bg-white' : 'bg-[#2E5EFF]'}`} />
              <span>IndiaMART</span>
              <span className={`px-1.5 py-0.2 rounded-full font-mono text-[11px] ${activeTab === 'indiamart' ? 'bg-white/20' : 'bg-[#2E5EFF]/20'}`}>
                {sourceCountsToday.indiamart}
              </span>
            </button>

            {/* Website */}
            <button
              onClick={() => setActiveTab('website')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm hover:scale-[1.02] ${
                activeTab === 'website'
                  ? 'bg-crm-teal text-white shadow-glow-teal'
                  : 'bg-crm-teal/15 hover:bg-crm-teal/25 text-crm-teal border border-crm-teal/30'
              }`}
            >
              <Globe size={13} />
              <span>Website</span>
              <span className={`px-1.5 py-0.2 rounded-full font-mono text-[11px] ${activeTab === 'website' ? 'bg-white/20' : 'bg-crm-teal/20'}`}>
                {sourceCountsToday.web}
              </span>
            </button>

            {/* WhatsApp */}
            <button
              onClick={() => setActiveTab('whatsapp')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm hover:scale-[1.02] ${
                activeTab === 'whatsapp'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#25D366] border border-[#25D366]/30'
              }`}
            >
              <MessageSquare size={13} />
              <span>WhatsApp</span>
              <span className={`px-1.5 py-0.2 rounded-full font-mono text-[11px] ${activeTab === 'whatsapp' ? 'bg-white/20' : 'bg-[#25D366]/20'}`}>
                {sourceCountsToday.whatsapp}
              </span>
            </button>

            {/* Manual / Routing */}
            <button
              onClick={() => setActiveTab('routing')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm hover:scale-[1.02] ${
                activeTab === 'routing'
                  ? 'bg-crm-violet text-white shadow-glow-violet'
                  : 'bg-[#9AA0B4]/15 hover:bg-[#9AA0B4]/25 text-[#9AA0B4] border border-[#9AA0B4]/30'
              }`}
            >
              <Users size={13} />
              <span>Sales Routing</span>
              <span className={`px-1.5 py-0.2 rounded-full font-mono text-[11px] ${activeTab === 'routing' ? 'bg-white/20' : 'bg-[#9AA0B4]/20'}`}>
                {sourceCountsToday.manual}
              </span>
            </button>
          </div>
        </div>

        {/* Action Buttons Inside Lead Setup */}
        <div className="flex items-center gap-2 flex-wrap">
          {onOpenShareModal && (
            <button
              onClick={onOpenShareModal}
              className="btn bg-crm-teal/15 hover:bg-crm-teal/25 text-crm-teal border border-crm-teal/30 text-xs gap-1.5 font-bold"
            >
              <Link2 size={13} /> Web-to-Lead Link
            </button>
          )}
          {onOpenAddLead && (
            <button
              onClick={onOpenAddLead}
              className="btn-primary text-xs gap-1.5 font-bold shadow-glow-blue"
            >
              <Plus size={14} /> New Lead
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
          {/* ══════════════════════════════════════════════════════════════════
              TAB 2: WEBSITE & WEB-TO-LEAD EMBED & GENERATOR
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'website' && (
            <div className="space-y-6">

              {/* Sub-tab Navigation */}
              <div className="flex items-center gap-2 p-1.5 bg-slate-100 dark:bg-[#181B26] rounded-xl border border-slate-200 dark:border-[#2A3042] w-fit">
                <button
                  type="button"
                  onClick={() => setActiveSubTab('generator')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeSubTab === 'generator'
                      ? 'bg-white dark:bg-[#202534] text-crm-blue shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Sparkles size={14} className="text-crm-blue" />
                  <span>Custom HTML Form Generator</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 bg-crm-blue/15 text-crm-blue rounded-md">
                    Customizable
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSubTab('hosted')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeSubTab === 'hosted'
                      ? 'bg-white dark:bg-[#202534] text-crm-teal shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Globe size={14} className="text-crm-teal" />
                  <span>Hosted URL & iFrame Embed</span>
                </button>
              </div>

              {/* ─────────────────────────────────────────────────────────────
                  SUB-TAB 1: CUSTOM WEB-TO-LEAD HTML GENERATOR
              ───────────────────────────────────────────────────────────── */}
              {activeSubTab === 'generator' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

                  {/* LEFT COLUMN: CUSTOMIZATION CONTROLS */}
                  <div className="lg:col-span-6 space-y-4">

                    {/* Section 1: Company & Contact Header */}
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#151824] space-y-3 shadow-sm">
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#2A3042] pb-2">
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                          <Building2 size={14} className="text-crm-blue" />
                          1. Company & Contact Details
                        </h4>
                        <span className="text-[10px] text-slate-400 font-medium">Shown on your form</span>
                      </div>

                      <div className="space-y-2.5">
                        <div>
                          <label className="label text-[11px] font-bold text-slate-700 dark:text-slate-300">Company Name</label>
                          <input
                            type="text"
                            value={generatorCompany}
                            onChange={(e) => setGeneratorCompany(e.target.value)}
                            placeholder="Company Name"
                            className="input text-xs"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="label text-[11px] font-bold text-slate-700 dark:text-slate-300">Contact Phone</label>
                            <input
                              type="text"
                              value={generatorPhone}
                              onChange={(e) => setGeneratorPhone(e.target.value)}
                              placeholder="10-digit mobile number"
                              className="input text-xs"
                            />
                          </div>
                          <div>
                            <label className="label text-[11px] font-bold text-slate-700 dark:text-slate-300">Contact Email</label>
                            <input
                              type="email"
                              value={generatorEmail}
                              onChange={(e) => setGeneratorEmail(e.target.value)}
                              placeholder="e.g. sales@example.com"
                              className="input text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section 2: Products Catalog Checklist */}
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#151824] space-y-3 shadow-sm">
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#2A3042] pb-2">
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                            <Layers size={14} className="text-crm-teal" />
                            2. Select Products for Dropdown
                          </h4>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            Customers will select from these options on your website.
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedProducts([...availableProducts])}
                            className="text-[10px] font-bold text-crm-blue hover:underline"
                          >
                            Select All
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => setSelectedProducts([])}
                            className="text-[10px] font-bold text-slate-400 hover:underline"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      {/* Products Checklist */}
                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 border border-slate-100 dark:border-[#2A3042] p-2 rounded-lg bg-slate-50/50 dark:bg-[#181B26]">
                        {availableProducts.map((prod) => {
                          const isSelected = selectedProducts.includes(prod);
                          return (
                            <label
                              key={prod}
                              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-crm-blue/10 text-crm-blue font-semibold'
                                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedProducts(prev => [...prev, prod]);
                                  } else {
                                    setSelectedProducts(prev => prev.filter(p => p !== prod));
                                  }
                                }}
                                className="rounded text-crm-blue border-slate-300 focus:ring-0"
                              />
                              <span className="truncate flex-1">{prod}</span>
                            </label>
                          );
                        })}
                      </div>

                      {/* Add Custom Product Input */}
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          value={newCustomProduct}
                          onChange={(e) => setNewCustomProduct(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newCustomProduct.trim()) {
                              e.preventDefault();
                              const trimmed = newCustomProduct.trim();
                              if (!availableProducts.includes(trimmed)) {
                                setAvailableProducts(prev => [...prev, trimmed]);
                              }
                              if (!selectedProducts.includes(trimmed)) {
                                setSelectedProducts(prev => [...prev, trimmed]);
                              }
                              setNewCustomProduct('');
                            }
                          }}
                          placeholder="+ Type any custom product or service..."
                          className="input text-xs flex-1"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (newCustomProduct.trim()) {
                              const trimmed = newCustomProduct.trim();
                              if (!availableProducts.includes(trimmed)) {
                                setAvailableProducts(prev => [...prev, trimmed]);
                              }
                              if (!selectedProducts.includes(trimmed)) {
                                setSelectedProducts(prev => [...prev, trimmed]);
                              }
                              setNewCustomProduct('');
                            }
                          }}
                          className="btn btn-secondary text-xs shrink-0 flex items-center gap-1 font-bold"
                        >
                          <Plus size={13} />
                          <span>Add</span>
                        </button>
                      </div>
                    </div>

                    {/* Section 3: Form Fields & Styling */}
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#151824] space-y-3 shadow-sm">
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#2A3042] pb-2">
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                          <Sliders size={14} className="text-crm-violet" />
                          3. Form Fields & Theme Color
                        </h4>
                      </div>

                      {/* Field Toggles */}
                      <div>
                        <label className="label text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-2">
                          Include Fields:
                        </label>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                            <input
                              type="checkbox"
                              checked={formFields.email}
                              onChange={(e) => setFormFields(prev => ({ ...prev, email: e.target.checked }))}
                              className="rounded text-crm-blue"
                            />
                            <span>Email Address</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                            <input
                              type="checkbox"
                              checked={formFields.company}
                              onChange={(e) => setFormFields(prev => ({ ...prev, company: e.target.checked }))}
                              className="rounded text-crm-blue"
                            />
                            <span>Company / Firm</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                            <input
                              type="checkbox"
                              checked={formFields.city}
                              onChange={(e) => setFormFields(prev => ({ ...prev, city: e.target.checked }))}
                              className="rounded text-crm-blue"
                            />
                            <span>City / Location</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                            <input
                              type="checkbox"
                              checked={formFields.quantity}
                              onChange={(e) => setFormFields(prev => ({ ...prev, quantity: e.target.checked }))}
                              className="rounded text-crm-blue"
                            />
                            <span>Quantity / Units</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                            <input
                              type="checkbox"
                              checked={formFields.urgency}
                              onChange={(e) => setFormFields(prev => ({ ...prev, urgency: e.target.checked }))}
                              className="rounded text-crm-blue"
                            />
                            <span>Requirement Timeline</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                            <input
                              type="checkbox"
                              checked={formFields.message}
                              onChange={(e) => setFormFields(prev => ({ ...prev, message: e.target.checked }))}
                              className="rounded text-crm-blue"
                            />
                            <span>Specifications Message</span>
                          </label>
                        </div>
                      </div>

                      {/* Button Text & Theme Accent */}
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div>
                          <label className="label text-[11px] font-bold text-slate-700 dark:text-slate-300">Button Text</label>
                          <input
                            type="text"
                            value={generatorButtonText}
                            onChange={(e) => setGeneratorButtonText(e.target.value)}
                            className="input text-xs"
                          />
                        </div>

                        <div>
                          <label className="label text-[11px] font-bold text-slate-700 dark:text-slate-300">Primary Color</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={generatorThemeColor}
                              onChange={(e) => setGeneratorThemeColor(e.target.value)}
                              className="w-9 h-9 p-1 rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white cursor-pointer"
                            />
                            <div className="flex items-center gap-1">
                              {['#2E5EFF', '#00D2B4', '#8B5CF6', '#10B981', '#FF5722'].map((color) => (
                                <button
                                  key={color}
                                  type="button"
                                  onClick={() => setGeneratorThemeColor(color)}
                                  className="w-5 h-5 rounded-full border border-black/10 transition-transform hover:scale-110"
                                  style={{ backgroundColor: color }}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>

                  </div>

                  {/* RIGHT COLUMN: LIVE PREVIEW & CODE EXPORT */}
                  <div className="lg:col-span-6 space-y-4">

                    {/* Preview / Code Header Tabs */}
                    <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#2A3042] pb-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPreviewViewMode('preview')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            previewViewMode === 'preview'
                              ? 'bg-crm-blue text-white shadow-sm'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
                          }`}
                        >
                          <Eye size={13} />
                          <span>Live Form Preview</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setPreviewViewMode('code')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            previewViewMode === 'code'
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
                          }`}
                        >
                          <Code size={13} />
                          <span>HTML Code Snippet</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCopy(standaloneHtmlCode, 'standalone-html')}
                        className="btn bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5 font-bold shadow-sm"
                      >
                        {copiedKey === 'standalone-html' ? <Check size={13} /> : <Copy size={13} />}
                        <span>{copiedKey === 'standalone-html' ? 'Copied HTML!' : 'Copy Live HTML'}</span>
                      </button>
                    </div>

                    {/* Tab View: Live Interactive Visual Preview */}
                    {previewViewMode === 'preview' && (
                      <div className="border border-slate-200 dark:border-[#2A3042] rounded-2xl p-5 bg-white text-slate-900 shadow-md">
                        <div className="border-b border-slate-100 pb-3 mb-4">
                          <h3 className="text-base font-extrabold text-slate-900">{generatorCompany}</h3>
                          <p className="text-xs text-slate-500 mt-0.5">Request an official commercial quotation or project consultation.</p>
                          {(generatorPhone || generatorEmail) && (
                            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500">
                              {generatorPhone && (
                                <span className="flex items-center gap-1">
                                  <Phone size={11} className="text-slate-400" /> {generatorPhone}
                                </span>
                              )}
                              {generatorEmail && (
                                <span className="flex items-center gap-1">
                                  <Mail size={11} className="text-slate-400" /> {generatorEmail}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="space-y-3 text-xs">
                          <div className="grid grid-cols-2 gap-2.5">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">Your Name *</label>
                              <input type="text" readOnly placeholder="Full Name" className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-slate-50" />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">Phone Number *</label>
                              <input type="tel" readOnly placeholder="Phone Number" className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-slate-50" />
                            </div>
                          </div>

                          {(formFields.email || formFields.company) && (
                            <div className="grid grid-cols-2 gap-2.5">
                              {formFields.email && (
                                <div>
                                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Email Address</label>
                                  <input type="email" readOnly placeholder="name@example.com" className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-slate-50" />
                                </div>
                              )}
                              {formFields.company && (
                                <div>
                                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Company / Firm Name</label>
                                  <input type="text" readOnly placeholder="Company Name" className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-slate-50" />
                                </div>
                              )}
                            </div>
                          )}

                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">Product / Solution Required *</label>
                            <select className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white">
                              {selectedProducts.map((p) => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                              <option value="Other">Other Custom Requirement</option>
                            </select>
                          </div>

                          {(formFields.city || formFields.quantity) && (
                            <div className="grid grid-cols-2 gap-2.5">
                              {formFields.city && (
                                <div>
                                  <label className="block text-[11px] font-bold text-slate-700 mb-1">City / Location</label>
                                  <input type="text" readOnly placeholder="City" className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-slate-50" />
                                </div>
                              )}
                              {formFields.quantity && (
                                <div>
                                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Quantity / Units</label>
                                  <input type="text" readOnly placeholder="10 Units" className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-slate-50" />
                                </div>
                              )}
                            </div>
                          )}

                          {formFields.urgency && (
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">Requirement Timeline</label>
                              <select className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white">
                                <option>Standard (1 - 2 Weeks)</option>
                                <option>Urgent / Immediate (Within 48 Hours)</option>
                                <option>Budgeting / Future Planning (1+ Month)</option>
                              </select>
                            </div>
                          )}

                          {formFields.message && (
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">Additional Specifications</label>
                              <textarea rows={2} readOnly placeholder="Details or site specifications..." className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-slate-50 resize-none" />
                            </div>
                          )}

                          <button
                            type="button"
                            style={{ backgroundColor: generatorThemeColor }}
                            className="w-full text-white font-bold py-2.5 px-4 rounded-lg text-xs shadow-md mt-2 pointer-events-none"
                          >
                            {generatorButtonText}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Tab View: Generated HTML & JS Code */}
                    {previewViewMode === 'code' && (
                      <div className="space-y-2">
                        <textarea
                          readOnly
                          rows={14}
                          value={standaloneHtmlCode}
                          className="input font-mono text-[11px] leading-relaxed bg-slate-900 text-emerald-400 select-all resize-none w-full border border-slate-800 rounded-xl p-3"
                        />
                        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-600 dark:text-emerald-400">
                          <strong>Ready for Production:</strong> Submissions post securely to <code className="font-mono">{liveSubmitUrl}</code> and immediately land inside your CRM leads pipeline.
                        </div>
                      </div>
                    )}

                  </div>

                </div>
              )}

              {/* ─────────────────────────────────────────────────────────────
                  SUB-TAB 2: HOSTED URL & IFRAME EMBED
              ───────────────────────────────────────────────────────────── */}
              {activeSubTab === 'hosted' && (
                <div className="space-y-4">
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
                        type="button"
                        onClick={() => handleCopy(publicInquiryUrl, 'web-link')}
                        className="btn btn-secondary text-xs flex items-center gap-1.5 shrink-0"
                      >
                        {copiedKey === 'web-link' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                        <span>{copiedKey === 'web-link' ? 'Copied!' : 'Copy Link'}</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                      Share this URL directly with clients, via WhatsApp chat, in your email signatures, or marketing campaigns.
                    </p>
                  </div>

                  {/* Embed Code Snippet */}
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#151824] space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <FileCode2 size={14} className="text-indigo-500" />
                        iFrame Embed Code (Hosted Page Widget)
                      </h4>
                      <button
                        type="button"
                        onClick={() => handleCopy(embedCode, 'embed-code')}
                        className="btn btn-secondary text-xs flex items-center gap-1.5 font-bold"
                      >
                        {copiedKey === 'embed-code' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                        <span>{copiedKey === 'embed-code' ? 'Copied!' : 'Copy iFrame Code'}</span>
                      </button>
                    </div>
                    <textarea
                      readOnly
                      rows={5}
                      value={embedCode}
                      className="input font-mono text-[11px] leading-relaxed bg-slate-50 dark:bg-[#181B26] select-all resize-none"
                    />
                  </div>
                </div>
              )}

              {/* Simulation Box */}
              <div className="p-4 rounded-xl border border-crm-teal/30 bg-crm-teal/5 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Sparkles size={14} className="text-crm-teal" /> Test Web Form Inbound Submission
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Simulates a prospect inquiry submitted via your website form to verify instant pipeline ingestion.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleSimulateInboundLead('web')}
                  disabled={isSimulating}
                  className="btn bg-crm-teal hover:bg-crm-teal-hover text-white text-xs flex items-center gap-1.5 shrink-0 shadow-glow-teal font-bold"
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
              <div className="bg-slate-50 dark:bg-[#181B26] p-4 rounded-xl border border-slate-200 dark:border-[#2A3042] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <MessageSquare size={14} className="text-emerald-500" />
                    Meta Lead Ads &amp; WhatsApp Cloud API Webhook Callback URL
                  </span>
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                    GET Handshake + POST Inbound
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={metaWebhookUrl}
                    className="input font-mono text-xs text-blue-600 dark:text-blue-400 font-bold bg-white dark:bg-[#13161F] flex-1 cursor-text select-all"
                  />
                  <button
                    onClick={() => handleCopy(metaWebhookUrl, 'meta-webhook')}
                    className="btn btn-secondary text-xs flex items-center gap-1.5 shrink-0"
                  >
                    {copiedKey === 'meta-webhook' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    <span>{copiedKey === 'meta-webhook' ? 'Copied!' : 'Copy URL'}</span>
                  </button>
                </div>
                {isDevHost && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                    <AlertCircle size={14} className="text-amber-500 shrink-0" />
                    <span>Local Dev Environment Detected: Meta servers require a public HTTPS URL (use your live domain or a Cloudflare Tunnel URL when pasting into Meta Developers).</span>
                  </div>
                )}
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
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
                        value={webhookVerifyToken}
                        className="input text-xs font-mono bg-slate-50 dark:bg-[#181B26] flex-1"
                      />
                      <button
                        onClick={() => handleCopy(webhookVerifyToken, 'whatsapp-verify')}
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
