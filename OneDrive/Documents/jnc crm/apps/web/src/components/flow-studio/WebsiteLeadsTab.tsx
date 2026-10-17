import React, { useState, useEffect } from 'react';
import {
  Globe, Copy, Check, ExternalLink, Code2, Sparkles,
  CheckCircle2, RefreshCw, Zap, ShieldCheck,
  Eye, EyeOff, LayoutTemplate, Send, Plus, Trash2,
  Sliders, Palette, Package, Shield, AlertCircle,
  Pencil, X, RotateCcw, SlidersHorizontal, CheckSquare
} from 'lucide-react';
import { leadsApi, getPublicWebhookBaseUrl, webFormApi } from '../../services/api';

interface ProductItem {
  name: string;
  category?: string;
}

interface FieldConfigItem {
  show: boolean;
  required: boolean;
}

interface WebFormSettingsState {
  isEnabled: boolean;
  brandColor: string;
  headline: string;
  description: string;
  submitButtonText: string;
  thankYouTitle: string;
  thankYouMessage: string;
  redirectUrl: string;
  products: ProductItem[];
  fields: Record<string, FieldConfigItem>;
  allowedOrigins: string[];
}

const DEFAULT_FIELDS: Record<string, FieldConfigItem> = {
  name: { show: true, required: true },
  phone: { show: true, required: true },
  email: { show: true, required: false },
  company: { show: true, required: false },
  city: { show: true, required: false },
  product: { show: true, required: false },
  quantity: { show: true, required: false },
  urgency: { show: true, required: false },
  message: { show: true, required: false },
};

const FIELD_LABELS: Record<string, string> = {
  name: 'Client Name',
  phone: 'Mobile / WhatsApp Number',
  email: 'Email Address',
  company: 'Company / Organization',
  city: 'City / Location',
  product: 'Product / System Selection',
  quantity: 'Target Quantity / Units',
  urgency: 'Timeline / Urgency',
  message: 'Custom Notes / Specifications',
};

export default function WebsiteLeadsTab({ onLeadIngested }: { onLeadIngested?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [tenantKey, setTenantKey] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'settings' | 'products' | 'fields' | 'security' | 'embed' | 'preview'>('embed');

  const [settings, setSettings] = useState<WebFormSettingsState>({
    isEnabled: false,
    brandColor: '#2563EB',
    headline: 'Request a Quote',
    description: 'Please submit your inquiry below and our team will get in touch shortly.',
    submitButtonText: 'Submit Inquiry',
    thankYouTitle: 'Thank You!',
    thankYouMessage: 'Your inquiry has been received. Our team will contact you soon.',
    redirectUrl: '',
    products: [],
    fields: { ...DEFAULT_FIELDS },
    allowedOrigins: [],
  });

  // Product Add & Edit State
  const [newProdName, setNewProdName] = useState('');
  const [newProdCat, setNewProdCat] = useState('');
  const [editingProdIndex, setEditingProdIndex] = useState<number | null>(null);
  const [editingProdName, setEditingProdName] = useState('');
  const [editingProdCat, setEditingProdCat] = useState('');

  const [newDomain, setNewDomain] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isSubmittingTest, setIsSubmittingTest] = useState(false);
  const [testLeadSuccess, setTestLeadSuccess] = useState(false);
  const [regeneratingKey, setRegeneratingKey] = useState(false);

  // iFrame Embed Snippet Customizer & Editing State
  const [embedWidth, setEmbedWidth] = useState('100%');
  const [embedHeight, setEmbedHeight] = useState('700px');
  const [embedRadius, setEmbedRadius] = useState('16px');
  const [embedShadow, setEmbedShadow] = useState('medium'); // 'none' | 'soft' | 'medium' | 'deep'
  const [embedBorder, setEmbedBorder] = useState('none'); // 'none' | 'subtle' | 'dark'
  const [embedTitle, setEmbedTitle] = useState('Website Inquiry Form');
  const [includeAutoResizeScript, setIncludeAutoResizeScript] = useState(false);
  const [isManualEditMode, setIsManualEditMode] = useState(false);
  const [manualEmbedCode, setManualEmbedCode] = useState('');

  // Load tenant webhook key and web form settings
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [configRes, settingsRes] = await Promise.all([
          webFormApi.getWebhookConfig().catch(() => null),
          webFormApi.getSettings().catch(() => null),
        ]);

        if (configRes?.data?.webhookKey) {
          setTenantKey(configRes.data.webhookKey);
          localStorage.setItem('jnc_tenant_webhook_key', configRes.data.webhookKey);
        } else {
          const cached = localStorage.getItem('jnc_tenant_webhook_key');
          if (cached) setTenantKey(cached);
        }

        if (settingsRes?.data) {
          const d = settingsRes.data;
          setSettings({
            isEnabled: Boolean(d.isEnabled),
            brandColor: d.brandColor || '#2563EB',
            headline: d.headline || 'Request a Quote',
            description: d.description || '',
            submitButtonText: d.submitButtonText || 'Submit Inquiry',
            thankYouTitle: d.thankYouTitle || 'Thank You!',
            thankYouMessage: d.thankYouMessage || 'Your inquiry has been received. Our team will contact you soon.',
            redirectUrl: d.redirectUrl || '',
            products: Array.isArray(d.products) ? d.products : [],
            fields: d.fields && typeof d.fields === 'object' ? { ...DEFAULT_FIELDS, ...d.fields } : { ...DEFAULT_FIELDS },
            allowedOrigins: Array.isArray(d.allowedOrigins) ? d.allowedOrigins : [],
          });
        }
      } catch (err: any) {
        console.error('Failed to load web form configuration:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const publicBase = getPublicWebhookBaseUrl();
  const webhookUrl = `${publicBase}/api/v1/webhooks/website/${tenantKey || '{YOUR_TENANT_KEY}'}`;
  const hostedFormUrl = `${window.location.origin}/inquiry?key=${tenantKey || ''}`;

  // Generate dynamic embed iframe styles
  const getShadowCss = () => {
    switch (embedShadow) {
      case 'none': return 'box-shadow:none;';
      case 'soft': return 'box-shadow:0 4px 15px rgba(0,0,0,0.04);';
      case 'medium': return 'box-shadow:0 8px 30px rgba(0,0,0,0.06);';
      case 'deep': return 'box-shadow:0 15px 40px rgba(0,0,0,0.12);';
      default: return 'box-shadow:0 8px 30px rgba(0,0,0,0.06);';
    }
  };

  const getBorderCss = () => {
    switch (embedBorder) {
      case 'none': return 'border:none;';
      case 'subtle': return 'border:1px solid #e2e8f0;';
      case 'dark': return 'border:1px solid #334155;';
      default: return 'border:none;';
    }
  };

  const defaultEmbedCode = `<iframe
  id="crm-inquiry-iframe"
  src="${hostedFormUrl}"
  width="${embedWidth}"
  height="${embedHeight}"
  frameborder="0"
  style="${getBorderCss()}border-radius:${embedRadius};${getShadowCss()}max-width:100%;transition:height 0.25s ease;"
  title="${embedTitle || 'Website Inquiry Form'}"
  loading="lazy"
></iframe>${includeAutoResizeScript ? `\n\n<script>
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'CRM_FORM_RESIZE' && e.data.height) {
    var iframe = document.getElementById('crm-inquiry-iframe');
    if (iframe) iframe.style.height = (e.data.height + 20) + 'px';
  }
});
</script>` : ''}`;

  const currentEmbedCode = isManualEditMode ? manualEmbedCode : defaultEmbedCode;

  const handleToggleManualEdit = () => {
    if (!isManualEditMode) {
      setManualEmbedCode(defaultEmbedCode);
      setIsManualEditMode(true);
    } else {
      setIsManualEditMode(false);
    }
  };

  const handleResetEmbedCode = () => {
    setEmbedWidth('100%');
    setEmbedHeight('700px');
    setEmbedRadius('16px');
    setEmbedShadow('medium');
    setEmbedBorder('none');
    setEmbedTitle('Website Inquiry Form');
    setIncludeAutoResizeScript(false);
    setIsManualEditMode(false);
    setManualEmbedCode('');
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    try {
      const payload = {
        isEnabled: settings.isEnabled,
        brandColor: settings.brandColor,
        headline: settings.headline,
        description: settings.description,
        submitButtonText: settings.submitButtonText,
        thankYouTitle: settings.thankYouTitle,
        thankYouMessage: settings.thankYouMessage,
        redirectUrl: settings.redirectUrl.trim() ? settings.redirectUrl.trim() : null,
        products: settings.products,
        fields: settings.fields,
        allowedOrigins: settings.allowedOrigins,
      };

      const res = await webFormApi.updateSettings(payload);
      if (res.data) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3500);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to save settings.';
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateKey = async () => {
    if (!window.confirm('Are you sure you want to regenerate your Webhook Key? Any existing embedded forms or integrations using the old key will stop working.')) {
      return;
    }
    setRegeneratingKey(true);
    try {
      const res = await webFormApi.regenerateKey();
      if (res.data?.webhookKey) {
        setTenantKey(res.data.webhookKey);
        localStorage.setItem('jnc_tenant_webhook_key', res.data.webhookKey);
      }
    } catch (err: any) {
      alert('Failed to regenerate key: ' + (err?.response?.data?.message || err.message));
    } finally {
      setRegeneratingKey(false);
    }
  };

  // Product Add & Edit Handlers
  const handleAddProduct = () => {
    if (!newProdName.trim()) return;
    setSettings((prev) => ({
      ...prev,
      products: [...prev.products, { name: newProdName.trim(), category: newProdCat.trim() || 'General' }],
    }));
    setNewProdName('');
    setNewProdCat('');
  };

  const handleStartEditProduct = (index: number) => {
    setEditingProdIndex(index);
    setEditingProdName(settings.products[index].name);
    setEditingProdCat(settings.products[index].category || 'General');
  };

  const handleSaveEditProduct = () => {
    if (editingProdIndex === null || !editingProdName.trim()) return;
    setSettings((prev) => {
      const updated = [...prev.products];
      updated[editingProdIndex] = {
        name: editingProdName.trim(),
        category: editingProdCat.trim() || 'General',
      };
      return { ...prev, products: updated };
    });
    setEditingProdIndex(null);
    setEditingProdName('');
    setEditingProdCat('');
  };

  const handleCancelEditProduct = () => {
    setEditingProdIndex(null);
    setEditingProdName('');
    setEditingProdCat('');
  };

  const handleRemoveProduct = (index: number) => {
    setSettings((prev) => ({
      ...prev,
      products: prev.products.filter((_, i) => i !== index),
    }));
    if (editingProdIndex === index) {
      setEditingProdIndex(null);
    }
  };

  const handleAddOrigin = () => {
    if (!newDomain.trim()) return;
    let domain = newDomain.trim().toLowerCase();
    try {
      if (domain.startsWith('http://') || domain.startsWith('https://')) {
        domain = new URL(domain).hostname;
      }
    } catch {}
    domain = domain.replace(/\/.*$/, '');
    if (!settings.allowedOrigins.includes(domain)) {
      setSettings((prev) => ({
        ...prev,
        allowedOrigins: [...prev.allowedOrigins, domain],
      }));
    }
    setNewDomain('');
  };

  const handleRemoveOrigin = (domain: string) => {
    setSettings((prev) => ({
      ...prev,
      allowedOrigins: prev.allowedOrigins.filter((d) => d !== domain),
    }));
  };

  const handleFieldToggle = (fieldName: string, key: 'show' | 'required') => {
    setSettings((prev) => {
      const current = prev.fields[fieldName] || { show: true, required: false };
      const updated = { ...current, [key]: !current[key] };
      if (key === 'show' && !updated.show) {
        updated.required = false;
      }
      return {
        ...prev,
        fields: {
          ...prev.fields,
          [fieldName]: updated,
        },
      };
    });
  };

  const handleSendTestWebLead = async () => {
    setIsSubmittingTest(true);
    try {
      const suffix = Math.floor(1000 + Math.random() * 9000);
      const chosenProduct = settings.products.length > 0 ? settings.products[0].name : 'Custom Web Inquiry';

      await leadsApi.create({
        customerName: `Web Visitor #${suffix}`,
        customerPhone: `98765${suffix}`,
        customerEmail: `visitor${suffix}@company.in`,
        companyName: `Apex Solutions #${suffix}`,
        city: 'Bengaluru',
        productName: chosenProduct,
        productCategory: chosenProduct,
        source: 'web',
        queryMessage: 'Inquiry via Website Contact Form: Requested quotation and technical specs.',
      });

      setTestLeadSuccess(true);
      if (onLeadIngested) onLeadIngested();
      setTimeout(() => setTestLeadSuccess(false), 4000);
    } catch (err) {
      console.error('Test web lead error:', err);
    } finally {
      setIsSubmittingTest(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-xs text-slate-500">
        <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-crm-blue" />
        Loading website lead integration settings...
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 antialiased">
      {/* ─── STREAMLINED COMPACT HEADER ─── */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-200 dark:border-[#22293A]">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
            Website Lead Form
          </h1>

          {/* Compact Status Switch */}
          <label className="flex items-center gap-2 px-2.5 py-1 rounded-full border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#121622] cursor-pointer select-none shadow-2xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
            <span className={`w-2 h-2 rounded-full ${settings.isEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            <span className={`text-xs font-semibold ${settings.isEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
              {settings.isEnabled ? 'Active' : 'Paused'}
            </span>
            <input
              type="checkbox"
              checked={settings.isEnabled}
              onChange={(e) => setSettings({ ...settings, isEnabled: e.target.checked })}
              className="sr-only"
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSendTestWebLead}
            disabled={isSubmittingTest}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#22293A] bg-white dark:bg-[#121622] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#181D2B] transition-all cursor-pointer shadow-2xs"
          >
            <Send size={12} className={isSubmittingTest ? 'animate-spin text-crm-blue' : 'text-slate-400'} />
            <span>{isSubmittingTest ? 'Sending...' : 'Test Lead'}</span>
          </button>

          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={saving}
            className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-xl bg-crm-blue hover:bg-crm-blue-hover text-white transition-all cursor-pointer shadow-xs disabled:opacity-50"
          >
            <Check size={13} className={saving ? 'animate-spin' : ''} />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </div>

      {/* Feedback Notifications */}
      {saveSuccess && (
        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
          <span>Form settings saved and active.</span>
        </div>
      )}

      {saveError && (
        <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-500/30 text-red-800 dark:text-red-300 text-xs font-semibold flex items-center gap-2">
          <AlertCircle size={15} className="text-red-500 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {testLeadSuccess && (
        <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-500/30 text-blue-800 dark:text-blue-300 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 size={15} className="text-blue-500 shrink-0" />
          <span>Test lead ingested! Check your Leads pipeline.</span>
        </div>
      )}

      {/* ─── SUB-NAVIGATION TABS ─── */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-[#22293A] overflow-x-auto pb-px">
        {[
          { id: 'embed', label: 'Embed & Links', icon: Code2 },
          { id: 'settings', label: 'Branding & Copy', icon: Palette },
          { id: 'products', label: `Products (${settings.products.length})`, icon: Package },
          { id: 'fields', label: 'Fields', icon: Sliders },
          { id: 'security', label: `Allowed Domains (${settings.allowedOrigins.length})`, icon: Shield },
          { id: 'preview', label: 'Live Preview', icon: Eye },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'border-crm-blue text-crm-blue dark:text-crm-blue-light'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ─── TAB 1: EMBED & LINKS (WITH FULL EDITING CAPABILITIES) ─── */}
      {activeTab === 'embed' && (
        <div className="space-y-5">
          {/* Direct Public Form URL */}
          <div className="bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#22293A] rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Direct Hosted Form Link
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Share this link directly in emails, WhatsApp chats, or social media bios.
                </p>
              </div>
              <a
                href={hostedFormUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-bold text-crm-blue hover:underline"
              >
                <span>Open in New Tab</span>
                <ExternalLink size={12} />
              </a>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={hostedFormUrl}
                className="flex-1 text-xs font-mono bg-slate-50 dark:bg-[#0B0D13] border border-slate-200/90 dark:border-[#22293A] rounded-xl px-3.5 py-2.5 text-slate-800 dark:text-slate-200 outline-none select-all"
              />
              <button
                type="button"
                onClick={() => handleCopy(hostedFormUrl, 'hostedUrl')}
                className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#171D2B] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#202738] transition-all cursor-pointer shrink-0"
              >
                {copiedKey === 'hostedUrl' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                <span>{copiedKey === 'hostedUrl' ? 'Copied' : 'Copy Link'}</span>
              </button>
            </div>
          </div>

          {/* iFrame Embed Code Card with Interactive Editing Options */}
          <div className="bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#22293A] rounded-2xl p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-100 dark:border-[#1E2536]">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Website Embed Snippet (HTML iFrame)
                  </h2>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    Customizable &amp; Editable
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Customize the embed dimensions, styling, and attributes or edit the raw HTML code directly.
                </p>
              </div>

              {/* Editing Mode Selector */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-[#181D2B] rounded-xl border border-slate-200/80 dark:border-[#2A3042]">
                <button
                  type="button"
                  onClick={() => setIsManualEditMode(false)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    !isManualEditMode
                      ? 'bg-white dark:bg-[#202738] text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <SlidersHorizontal size={12} />
                  <span>Visual Customizer</span>
                </button>
                <button
                  type="button"
                  onClick={handleToggleManualEdit}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    isManualEditMode
                      ? 'bg-white dark:bg-[#202738] text-crm-blue dark:text-crm-blue-light shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <Pencil size={12} />
                  <span>Edit Raw Code</span>
                </button>
              </div>
            </div>

            {/* Visual Controls Panel (When in Visual Mode) */}
            {!isManualEditMode ? (
              <div className="p-4 bg-slate-50 dark:bg-[#0F121C] rounded-xl border border-slate-200/80 dark:border-[#22293A] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Sliders size={13} className="text-crm-blue" />
                    <span>iFrame Embed Properties &amp; Dimensions</span>
                  </h3>
                  <button
                    type="button"
                    onClick={handleResetEmbedCode}
                    className="text-[11px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw size={11} /> Reset Defaults
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  {/* Height */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Height</label>
                    <select
                      value={embedHeight}
                      onChange={(e) => setEmbedHeight(e.target.value)}
                      className="w-full text-xs bg-white dark:bg-[#171D2B] border border-slate-200 dark:border-[#2A3042] rounded-xl px-2.5 py-1.5 text-slate-800 dark:text-slate-200 outline-none"
                    >
                      <option value="600px">600px (Compact)</option>
                      <option value="700px">700px (Standard Default)</option>
                      <option value="800px">800px (Comfortable)</option>
                      <option value="900px">900px (Tall)</option>
                      <option value="1000px">1000px (Full Height)</option>
                    </select>
                  </div>

                  {/* Width */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Width</label>
                    <select
                      value={embedWidth}
                      onChange={(e) => setEmbedWidth(e.target.value)}
                      className="w-full text-xs bg-white dark:bg-[#171D2B] border border-slate-200 dark:border-[#2A3042] rounded-xl px-2.5 py-1.5 text-slate-800 dark:text-slate-200 outline-none"
                    >
                      <option value="100%">100% (Responsive Full Width)</option>
                      <option value="800px">800px (Desktop Container)</option>
                      <option value="640px">640px (Medium Column)</option>
                      <option value="500px">500px (Sidebar Width)</option>
                    </select>
                  </div>

                  {/* Corner Radius */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Corner Radius</label>
                    <select
                      value={embedRadius}
                      onChange={(e) => setEmbedRadius(e.target.value)}
                      className="w-full text-xs bg-white dark:bg-[#171D2B] border border-slate-200 dark:border-[#2A3042] rounded-xl px-2.5 py-1.5 text-slate-800 dark:text-slate-200 outline-none"
                    >
                      <option value="0px">0px (Square)</option>
                      <option value="8px">8px (Slight Rounded)</option>
                      <option value="16px">16px (Modern Rounded)</option>
                      <option value="24px">24px (Pill Soft)</option>
                    </select>
                  </div>

                  {/* Box Shadow */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Drop Shadow</label>
                    <select
                      value={embedShadow}
                      onChange={(e) => setEmbedShadow(e.target.value)}
                      className="w-full text-xs bg-white dark:bg-[#171D2B] border border-slate-200 dark:border-[#2A3042] rounded-xl px-2.5 py-1.5 text-slate-800 dark:text-slate-200 outline-none"
                    >
                      <option value="none">None (Flat)</option>
                      <option value="soft">Soft Subtle Shadow</option>
                      <option value="medium">Medium SaaS Depth</option>
                      <option value="deep">Deep Floating Shadow</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Border Style */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Frame Border</label>
                    <select
                      value={embedBorder}
                      onChange={(e) => setEmbedBorder(e.target.value)}
                      className="w-full text-xs bg-white dark:bg-[#171D2B] border border-slate-200 dark:border-[#2A3042] rounded-xl px-2.5 py-1.5 text-slate-800 dark:text-slate-200 outline-none"
                    >
                      <option value="none">None (Seamless)</option>
                      <option value="subtle">Subtle Light (1px #e2e8f0)</option>
                      <option value="dark">Dark Slate (1px #334155)</option>
                    </select>
                  </div>

                  {/* Title Attribute */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">iFrame Title / Accessibility Label</label>
                    <input
                      type="text"
                      value={embedTitle}
                      onChange={(e) => setEmbedTitle(e.target.value)}
                      placeholder="Website Inquiry Form"
                      className="w-full text-xs bg-white dark:bg-[#171D2B] border border-slate-200 dark:border-[#2A3042] rounded-xl px-2.5 py-1.5 text-slate-800 dark:text-slate-200 outline-none"
                    />
                  </div>
                </div>

                {/* Auto-resize Script Toggle */}
                <div className="pt-2 border-t border-slate-200/80 dark:border-[#22293A]">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={includeAutoResizeScript}
                      onChange={(e) => setIncludeAutoResizeScript(e.target.checked)}
                      className="rounded border-slate-300 text-crm-blue focus:ring-crm-blue cursor-pointer"
                    />
                    <span className="font-semibold">Include Seamless Auto-Resize Script</span>
                    <span className="text-[11px] text-slate-400 font-normal">
                      (Automatically expands the iframe to fit the form content with zero double scrollbars)
                    </span>
                  </label>
                </div>
              </div>
            ) : (
              /* Raw Code Editor Notice */
              <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300">
                <span className="flex items-center gap-1.5 font-medium">
                  <Pencil size={13} />
                  <span>Manual Edit Mode Active: You can edit or paste any custom HTML, classes, attributes, or inline scripts below.</span>
                </span>
                <button
                  type="button"
                  onClick={handleResetEmbedCode}
                  className="font-bold underline hover:no-underline cursor-pointer ml-2 shrink-0"
                >
                  Reset Code
                </button>
              </div>
            )}

            {/* Code Box: Editable textarea in manual mode, syntax pre in visual mode */}
            <div className="relative">
              {isManualEditMode ? (
                <textarea
                  rows={9}
                  value={manualEmbedCode}
                  onChange={(e) => setManualEmbedCode(e.target.value)}
                  className="w-full text-xs font-mono bg-slate-950 text-emerald-400 p-4 rounded-xl border border-slate-800 outline-none focus:border-crm-blue resize-y selection:bg-crm-blue selection:text-white"
                  spellCheck={false}
                  placeholder="Paste or write your custom iframe HTML code here..."
                />
              ) : (
                <pre className="text-xs font-mono bg-slate-900 text-slate-200 p-4 rounded-xl overflow-x-auto border border-slate-800 leading-relaxed">
                  {currentEmbedCode}
                </pre>
              )}

              <div className="absolute top-3 right-3 flex items-center gap-2">
                {!isManualEditMode && (
                  <button
                    type="button"
                    onClick={handleToggleManualEdit}
                    className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                    title="Click to edit HTML code directly"
                  >
                    <Pencil size={12} />
                    <span>Edit Code</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleCopy(currentEmbedCode, 'embedCode')}
                  className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-crm-blue hover:bg-crm-blue-hover text-white transition-all cursor-pointer shadow-xs"
                >
                  {copiedKey === 'embedCode' ? <Check size={13} className="text-white" /> : <Copy size={13} />}
                  <span>{copiedKey === 'embedCode' ? 'Copied' : 'Copy HTML'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Webhook REST URL & Key Regeneration */}
          <div className="bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#22293A] rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Custom Webhook REST Endpoint (POST)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Send form submissions directly from custom backend scripts or Contact Form 7 webhooks.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRegenerateKey}
                disabled={regeneratingKey}
                className="flex items-center gap-1 text-[11px] font-bold text-red-500 hover:text-red-600 transition-colors cursor-pointer"
              >
                <RefreshCw size={12} className={regeneratingKey ? 'animate-spin' : ''} />
                <span>{regeneratingKey ? 'Regenerating...' : 'Regenerate Key'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={webhookUrl}
                className="flex-1 text-xs font-mono bg-slate-50 dark:bg-[#0B0D13] border border-slate-200/90 dark:border-[#22293A] rounded-xl px-3.5 py-2.5 text-indigo-600 dark:text-indigo-400 outline-none select-all"
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
        </div>
      )}

      {/* ─── TAB 2: BRANDING & COPY ─── */}
      {activeTab === 'settings' && (
        <div className="bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#22293A] rounded-2xl p-6 shadow-xs space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Primary Brand Color (Hex)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={settings.brandColor.startsWith('#') ? settings.brandColor : '#2563EB'}
                  onChange={(e) => setSettings({ ...settings, brandColor: e.target.value })}
                  className="w-10 h-10 p-1 rounded-xl border border-slate-200 dark:border-[#2A3042] cursor-pointer bg-white dark:bg-[#1A1E2B]"
                />
                <input
                  type="text"
                  value={settings.brandColor}
                  onChange={(e) => setSettings({ ...settings, brandColor: e.target.value })}
                  placeholder="#2563EB"
                  className="flex-1 text-xs font-mono bg-slate-50 dark:bg-[#0B0D13] border border-slate-200/90 dark:border-[#22293A] rounded-xl px-3.5 py-2.5 text-slate-800 dark:text-slate-200 outline-none"
                />
              </div>
              <p className="text-[11px] text-slate-400">Controls headers, buttons, accents, and icons on the public form.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Submit Button Text
              </label>
              <input
                type="text"
                value={settings.submitButtonText}
                onChange={(e) => setSettings({ ...settings, submitButtonText: e.target.value })}
                placeholder="e.g. Request Quotation Now"
                className="w-full text-xs bg-slate-50 dark:bg-[#0B0D13] border border-slate-200/90 dark:border-[#22293A] rounded-xl px-3.5 py-2.5 text-slate-800 dark:text-slate-200 outline-none"
              />
              <p className="text-[11px] text-slate-400">Action label displayed on the primary submit button.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Form Headline Title
            </label>
            <input
              type="text"
              value={settings.headline}
              onChange={(e) => setSettings({ ...settings, headline: e.target.value })}
              placeholder="e.g. Request Product Pricing & Availability"
              className="w-full text-xs bg-slate-50 dark:bg-[#0B0D13] border border-slate-200/90 dark:border-[#22293A] rounded-xl px-3.5 py-2.5 text-slate-800 dark:text-slate-200 outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Form Sub-headline / Instructions
            </label>
            <textarea
              rows={2}
              value={settings.description}
              onChange={(e) => setSettings({ ...settings, description: e.target.value })}
              placeholder="e.g. Tell us your requirements to receive a fast, customized quotation from our engineering team."
              className="w-full text-xs bg-slate-50 dark:bg-[#0B0D13] border border-slate-200/90 dark:border-[#22293A] rounded-xl px-3.5 py-2.5 text-slate-800 dark:text-slate-200 outline-none resize-none"
            />
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-[#1E2536] grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Thank-You Screen Title
              </label>
              <input
                type="text"
                value={settings.thankYouTitle}
                onChange={(e) => setSettings({ ...settings, thankYouTitle: e.target.value })}
                placeholder="Thank You!"
                className="w-full text-xs bg-slate-50 dark:bg-[#0B0D13] border border-slate-200/90 dark:border-[#22293A] rounded-xl px-3.5 py-2.5 text-slate-800 dark:text-slate-200 outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Redirect URL After Submission (Optional)
              </label>
              <input
                type="url"
                value={settings.redirectUrl}
                onChange={(e) => setSettings({ ...settings, redirectUrl: e.target.value })}
                placeholder="https://yourwebsite.com/thank-you"
                className="w-full text-xs font-mono bg-slate-50 dark:bg-[#0B0D13] border border-slate-200/90 dark:border-[#22293A] rounded-xl px-3.5 py-2.5 text-slate-800 dark:text-slate-200 outline-none"
              />
              <p className="text-[11px] text-slate-400">Must begin with https://. If set, redirects visitor after 3 seconds.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Thank-You Screen Message
            </label>
            <textarea
              rows={2}
              value={settings.thankYouMessage}
              onChange={(e) => setSettings({ ...settings, thankYouMessage: e.target.value })}
              placeholder="Your inquiry has been received. Our team will contact you soon."
              className="w-full text-xs bg-slate-50 dark:bg-[#0B0D13] border border-slate-200/90 dark:border-[#22293A] rounded-xl px-3.5 py-2.5 text-slate-800 dark:text-slate-200 outline-none resize-none"
            />
          </div>
        </div>
      )}

      {/* ─── TAB 3: PRODUCTS CATALOG (WITH INLINE EDITING) ─── */}
      {activeTab === 'products' && (
        <div className="bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#22293A] rounded-2xl p-6 shadow-xs space-y-5">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Company Product List
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Add your own company products or services for visitors to select. Starts empty by default.
            </p>
          </div>

          {/* Add Product Form */}
          <div className="p-4 bg-slate-50 dark:bg-[#0F121C] rounded-xl border border-slate-200/80 dark:border-[#22293A] space-y-3">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300">Add New Product</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                value={newProdName}
                onChange={(e) => setNewProdName(e.target.value)}
                placeholder="Product Name (e.g. 5kVA Solar Inverter)"
                className="sm:col-span-2 text-xs bg-white dark:bg-[#171D2B] border border-slate-200 dark:border-[#2A3042] rounded-xl px-3.5 py-2 text-slate-800 dark:text-slate-200 outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddProduct();
                  }
                }}
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newProdCat}
                  onChange={(e) => setNewProdCat(e.target.value)}
                  placeholder="Category (e.g. Power)"
                  className="flex-1 text-xs bg-white dark:bg-[#171D2B] border border-slate-200 dark:border-[#2A3042] rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddProduct();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddProduct}
                  className="px-3.5 py-2 rounded-xl bg-crm-blue hover:bg-crm-blue-hover text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>
          </div>

          {/* Product Items Table with Inline Editing */}
          {settings.products.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-slate-200 dark:border-[#22293A] rounded-xl space-y-2">
              <Package size={24} className="text-slate-400 mx-auto" />
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">No products added yet.</p>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                When this list is empty, the public inquiry form will automatically render a free-text requirement field instead of a fixed dropdown.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {settings.products.map((prod, idx) => {
                const isEditing = editingProdIndex === idx;
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 bg-slate-50/70 dark:bg-[#171D2B] border border-slate-200/80 dark:border-[#22293A] rounded-xl text-xs gap-3"
                  >
                    {isEditing ? (
                      /* Inline Edit Row */
                      <div className="flex-1 flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-slate-400 text-[11px]">#{idx + 1}</span>
                        <input
                          type="text"
                          value={editingProdName}
                          onChange={(e) => setEditingProdName(e.target.value)}
                          placeholder="Product Name"
                          className="flex-1 min-w-[140px] text-xs bg-white dark:bg-[#202738] border border-crm-blue rounded-lg px-2.5 py-1 text-slate-800 dark:text-slate-100 outline-none"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEditProduct();
                            if (e.key === 'Escape') handleCancelEditProduct();
                          }}
                        />
                        <input
                          type="text"
                          value={editingProdCat}
                          onChange={(e) => setEditingProdCat(e.target.value)}
                          placeholder="Category"
                          className="w-28 text-xs bg-white dark:bg-[#202738] border border-crm-blue rounded-lg px-2.5 py-1 text-slate-800 dark:text-slate-100 outline-none"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEditProduct();
                            if (e.key === 'Escape') handleCancelEditProduct();
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleSaveEditProduct}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 cursor-pointer"
                        >
                          <Check size={12} /> Save
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEditProduct}
                          className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs flex items-center gap-1 cursor-pointer"
                        >
                          <X size={12} /> Cancel
                        </button>
                      </div>
                    ) : (
                      /* Normal Display Row with Edit & Delete */
                      <>
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-slate-400 text-[11px]">#{idx + 1}</span>
                          <span className="font-bold text-slate-800 dark:text-slate-100">{prod.name}</span>
                          {prod.category && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              {prod.category}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleStartEditProduct(idx)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-crm-blue hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors cursor-pointer"
                            title="Edit this product"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveProduct(idx)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                            title="Delete this product"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 4: FIELDS CONFIGURATION ─── */}
      {activeTab === 'fields' && (
        <div className="bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#22293A] rounded-2xl p-6 shadow-xs space-y-5">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Form Field Visibility &amp; Requirements
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Choose which fields appear on your customer quote form, and designate required fields.
            </p>
          </div>

          <div className="border border-slate-200/80 dark:border-[#22293A] rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-[#1E2536]">
            {Object.keys(DEFAULT_FIELDS).map((fieldName) => {
              const config = settings.fields[fieldName] || { show: true, required: false };
              const label = FIELD_LABELS[fieldName] || fieldName;
              return (
                <div
                  key={fieldName}
                  className="p-3.5 flex items-center justify-between flex-wrap gap-3 hover:bg-slate-50/50 dark:hover:bg-[#171D2B]/50 transition-colors"
                >
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{label}</p>
                    <p className="text-[11px] font-mono text-slate-400">{fieldName}</p>
                  </div>

                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 dark:text-slate-400">
                      <input
                        type="checkbox"
                        checked={config.show}
                        onChange={() => handleFieldToggle(fieldName, 'show')}
                        className="rounded border-slate-300 text-crm-blue focus:ring-crm-blue cursor-pointer"
                      />
                      <span>Show on Form</span>
                    </label>

                    <label
                      className={`flex items-center gap-2 text-xs transition-opacity ${
                        config.show ? 'cursor-pointer text-slate-600 dark:text-slate-400' : 'opacity-40 cursor-not-allowed'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={!config.show}
                        checked={config.required}
                        onChange={() => handleFieldToggle(fieldName, 'required')}
                        className="rounded border-slate-300 text-crm-blue focus:ring-crm-blue cursor-pointer"
                      />
                      <span>Mandatory</span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── TAB 5: ALLOWED ORIGINS / SECURITY ─── */}
      {activeTab === 'security' && (
        <div className="bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#22293A] rounded-2xl p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Website Origin Allowlist (Anti-Spam / Anti-Scraping)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Restrict form submissions so that only your client website can submit leads through this form.
              </p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              CORS / Origin Guard
            </span>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-[#0F121C] rounded-xl border border-slate-200/80 dark:border-[#22293A] space-y-3">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300">Add Allowed Website Domain</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="e.g. clientcompany.in or www.mywebsite.com"
                className="flex-1 text-xs bg-white dark:bg-[#171D2B] border border-slate-200 dark:border-[#2A3042] rounded-xl px-3.5 py-2 text-slate-800 dark:text-slate-200 outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddOrigin();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleAddOrigin}
                className="px-4 py-2 rounded-xl bg-crm-blue hover:bg-crm-blue-hover text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Plus size={14} /> Add Domain
              </button>
            </div>
          </div>

          {settings.allowedOrigins.length === 0 ? (
            <div className="p-5 rounded-xl border border-dashed border-slate-200 dark:border-[#22293A] text-center space-y-1">
              <ShieldCheck size={20} className="text-slate-400 mx-auto" />
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Open Origin Policy</p>
              <p className="text-[11px] text-slate-400 max-w-md mx-auto">
                No domain restrictions configured. The form accepts submissions from any hosted website or iframe. Add your domain above to restrict submissions exclusively to your own site.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Allowed Domains:</p>
              <div className="flex flex-wrap gap-2">
                {settings.allowedOrigins.map((dom, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs font-mono font-medium"
                  >
                    <span>{dom}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveOrigin(dom)}
                      className="text-indigo-400 hover:text-red-500 cursor-pointer"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 6: LIVE PREVIEW ─── */}
      {activeTab === 'preview' && (
        <div className="bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-[#22293A] rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#1E2536]">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Live Interactive Form Preview
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                This preview renders using your currently selected color ({settings.brandColor}), products ({settings.products.length}), and visible fields.
              </p>
            </div>
            <a
              href={hostedFormUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg text-white shadow-xs"
              style={{ backgroundColor: settings.brandColor }}
            >
              <span>Test Live Page</span>
              <ExternalLink size={12} />
            </a>
          </div>

          <div className="border border-slate-200 dark:border-[#22293A] rounded-2xl overflow-hidden bg-slate-50">
            <iframe
              src={hostedFormUrl}
              width="100%"
              height="600px"
              className="w-full border-none"
              title="Form Live Preview"
            />
          </div>
        </div>
      )}
    </div>
  );
}
