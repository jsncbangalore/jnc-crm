/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Send,
  CheckCircle2,
  Phone,
  Mail,
  Globe,
  AlertCircle,
  Building2,
  Factory,
  Briefcase,
  Store,
  ExternalLink,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Clock,
  Layers,
  Check,
} from 'lucide-react';
import axios from 'axios';
import PublicLayout from '../components/layout/PublicLayout';
import { BRAND, PRODUCT_NAME } from '../config/brand';

interface FormProduct {
  name: string;
  category?: string;
}

interface WebFormFieldItem {
  show: boolean;
  required: boolean;
}

interface WebFormConfig {
  companyName: string;
  logoUrl?: string | null;
  phone?: string;
  email?: string;
  website?: string;
  brandColor: string;
  headline: string;
  description: string;
  submitButtonText: string;
  thankYouTitle: string;
  thankYouMessage: string;
  redirectUrl?: string | null;
  products: FormProduct[];
  fields: Record<string, WebFormFieldItem>;
  isEnabled: boolean;
}

const SOLUTION_TRACKS = [
  {
    id: 'wholesale',
    icon: Building2,
    badge: 'Wholesale & Distribution',
    title: 'High-Volume Order Processing & Warehouse Logistics',
    summary: 'Coordinate warehouse inventory, customer orders, stock movements, and instant delivery challans.',
  },
  {
    id: 'manufacturing',
    icon: Factory,
    badge: 'Manufacturing & Engineering',
    title: 'Component Procurement, Stock Control & Assembly Lines',
    summary: 'Track SKU catalog specifications, low-stock reorder thresholds, supplier purchase bills, and dispatches.',
  },
  {
    id: 'services',
    icon: Briefcase,
    badge: 'B2B Professional Services',
    title: 'Client Proposals, Milestone Billing & Contract Oversight',
    summary: 'Proposal quotations, partial payment receipts, customer activity logs, and party ledger statements.',
  },
  {
    id: 'multi_location',
    icon: Store,
    badge: 'Multi-Location Operations',
    title: 'Centralized Governance with Isolated Branch Workspaces',
    summary: 'Central management plane with role-scoped user access, custom document branding, and live dashboard KPIs.',
  },
];

export default function PublicInquiryPage() {
  const [searchParams] = useSearchParams();
  const [config, setConfig] = useState<WebFormConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    company: '',
    city: '',
    product: '',
    customProduct: '',
    quantity: '',
    urgency: 'within_1_month',
    message: '',
    _hp_company_trap: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [submittedLeadId, setSubmittedLeadId] = useState<string | null>(null);
  const [submittedLeadNumber, setSubmittedLeadNumber] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const isEmbedded = useMemo(() => {
    try {
      return typeof window !== 'undefined' && window.self !== window.top;
    } catch {
      return false;
    }
  }, []);

  // Notify parent window of height for seamless iframe embedding
  const postHeightToParent = () => {
    try {
      if (isEmbedded && window.parent) {
        const height = document.body.scrollHeight || document.documentElement.scrollHeight;
        window.parent.postMessage({ type: 'CRM_FORM_RESIZE', height }, '*');
      }
    } catch {}
  };

  useEffect(() => {
    postHeightToParent();
    const handleResize = () => postHeightToParent();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isLoading, submittedLeadId, config, isEmbedded]);

  // Fetch form configuration
  const loadFormConfig = () => {
    setIsLoading(true);
    setLoadError(null);

    const key = searchParams.get('key')?.trim();

    // If no key is provided, this is our own platform's demo / walkthrough request
    if (!key) {
      const requestedSolution =
        searchParams.get('solution') ||
        searchParams.get('track') ||
        searchParams.get('product') ||
        '';

      let initialProduct = SOLUTION_TRACKS[0].title;
      if (requestedSolution) {
        const lowerReq = requestedSolution.toLowerCase();
        const matched = SOLUTION_TRACKS.find((p) => {
          const pName = p.title.toLowerCase();
          const pCat = p.badge.toLowerCase();
          return pName.includes(lowerReq) || lowerReq.includes(pName) || pCat.includes(lowerReq) || lowerReq.includes(pCat);
        });
        if (matched) initialProduct = matched.title;
      }

      setConfig({
        companyName: PRODUCT_NAME,
        logoUrl: null,
        phone: '',
        email: '',
        website: '',
        brandColor: '#2563eb',
        headline: 'Request a Solution Walkthrough',
        description: 'Schedule an interactive walkthrough tailored to your operations or get a customized proposal.',
        submitButtonText: 'Request Walkthrough',
        thankYouTitle: 'Walkthrough Request Received!',
        thankYouMessage: 'Your demo request has been received. Our solutions team will review your requirements and reach out within 1 business day.',
        redirectUrl: null,
        products: SOLUTION_TRACKS.map((t) => ({ name: t.title, category: t.badge })),
        fields: {},
        isEnabled: true,
      });
      setFormData((prev) => ({ ...prev, product: initialProduct }));
      setIsLoading(false);
      return;
    }

    const endpoint = `/api/v1/webhooks/inquiry-info/${encodeURIComponent(key)}`;

    axios
      .get(endpoint)
      .then((res) => {
        const data: WebFormConfig = res.data;
        setConfig(data);

        // Pre-select solution from query params if specified
        const requestedSolution =
          searchParams.get('solution') ||
          searchParams.get('track') ||
          searchParams.get('product') ||
          '';

        let initialProduct = '';
        if (requestedSolution) {
          const lowerReq = requestedSolution.toLowerCase();
          const matched = (data.products || []).find((p) => {
            const pName = p.name.toLowerCase();
            const pCat = (p.category || '').toLowerCase();
            return (
              pName.includes(lowerReq) ||
              lowerReq.includes(pName) ||
              pCat.includes(lowerReq) ||
              lowerReq.includes(pCat)
            );
          });
          if (matched) {
            initialProduct = matched.name;
          } else {
            // Also match against static tracks
            const trackMatch = SOLUTION_TRACKS.find(
              (t) =>
                t.title.toLowerCase().includes(lowerReq) ||
                t.badge.toLowerCase().includes(lowerReq) ||
                lowerReq.includes(t.title.toLowerCase())
            );
            initialProduct = trackMatch ? trackMatch.title : requestedSolution;
          }
        }

        if (!initialProduct && Array.isArray(data.products) && data.products.length > 0) {
          initialProduct = data.products[0].name;
        }

        setFormData((prev) => ({
          ...prev,
          product: initialProduct || SOLUTION_TRACKS[0].title,
        }));
      })
      .catch((err) => {
        console.error('Failed to load inquiry form config:', err);
        const msg =
          err?.response?.data?.message ||
          'The solution walkthrough request form could not be loaded at this time.';
        setLoadError(msg);
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  useEffect(() => {
    loadFormConfig();
  }, [searchParams]);

  // Handle redirect after successful submission
  useEffect(() => {
    if (submittedLeadId && config?.redirectUrl) {
      setCountdown(4);
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            window.location.href = config.redirectUrl!;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [submittedLeadId, config]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    const key = searchParams.get('key')?.trim();

    const selectedProduct =
      formData.product === '__OTHER__'
        ? formData.customProduct
        : formData.product || formData.customProduct || 'General Solution Walkthrough';

    const payload = {
      name: formData.name,
      phone: formData.phone,
      email: formData.email,
      company: formData.company,
      city: formData.city,
      product: selectedProduct,
      solutionTrack: selectedProduct,
      quantity: formData.quantity,
      urgency: formData.urgency,
      message: formData.message,
      _hp_company_trap: formData._hp_company_trap,
      submissionId: 'WALKTHROUGH-' + Date.now().toString(),
    };

    const endpoint = key
      ? `/api/v1/webhooks/website/${encodeURIComponent(key)}`
      : '/api/v1/public/demo-request';

    try {
      const response = await axios.post(endpoint, payload);
      const leadId =
        response.data?.referenceNumber ||
        response.data?.leadId ||
        response.data?.leadNumber ||
        'REF-' + Date.now().toString().slice(-6);
      const leadNumber = response.data?.leadNumber || response.data?.referenceNumber || leadId;
      setSubmittedLeadId(leadId);
      setSubmittedLeadNumber(leadNumber);
    } catch (err: any) {
      if (err?.response?.data?.errors && typeof err.response.data.errors === 'object') {
        const errMap = err.response.data.errors;
        const msgList = Object.values(errMap).join(' ');
        setSubmitError(msgList || err.response.data.message);
      } else {
        const msg =
          err?.response?.data?.message ||
          'Failed to submit walkthrough request. Please check your information and try again.';
        setSubmitError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const brandColor = config?.brandColor || '#2563eb';
  const fields = config?.fields || {};
  const isFieldVisible = (name: string, defaultShow = true) => fields[name]?.show ?? defaultShow;
  const isFieldRequired = (name: string, defaultReq = false) => fields[name]?.required ?? defaultReq;

  // Selected solution track metadata
  const activeTrack = useMemo(() => {
    return SOLUTION_TRACKS.find((t) => t.title === formData.product) || null;
  }, [formData.product]);

  // Inner Form Content rendered either inside PublicLayout (browser) or standalone (iframe)
  const renderInnerContent = () => {
    // 1. Loading State
    if (isLoading) {
      return (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
            Loading solution walkthrough request...
          </p>
        </div>
      );
    }

    // 2. Error State kept strictly inside the page card container
    if (loadError || !config) {
      return (
        <div className="max-w-2xl mx-auto py-12 px-4">
          <div className="rounded-3xl border border-red-200 dark:border-red-900/40 bg-white dark:bg-[#131620] p-8 sm:p-10 shadow-sm text-center space-y-6">
            <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/50 flex items-center justify-center mx-auto">
              <AlertCircle size={28} />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                Walkthrough Form Unavailable
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
                {loadError ||
                  'The link you followed may have expired, or the form is currently paused by the administrator.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={loadFormConfig}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition"
              >
                <RefreshCw size={14} />
                <span>Retry Request</span>
              </button>

              <Link
                to="/solutions"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#181B26] px-5 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                <ArrowLeft size={14} />
                <span>Browse All Solutions</span>
              </Link>
            </div>
          </div>
        </div>
      );
    }

    // 3. Success / Submitted State
    if (submittedLeadId) {
      return (
        <div className="max-w-2xl mx-auto py-12 px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-3xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#131620] p-8 sm:p-12 text-center shadow-sm space-y-6"
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
              style={{ backgroundColor: `${brandColor}15`, color: brandColor }}
            >
              <CheckCircle2 size={36} />
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                <ShieldCheck size={14} />
                <span>Walkthrough Request Registered</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                {config.thankYouTitle || 'Walkthrough Confirmed!'}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 max-w-lg mx-auto leading-relaxed">
                {config.thankYouMessage ||
                  'Your inquiry has been received. Our solutions engineering team will review your requirements and reach out within 1 business day.'}
              </p>
            </div>

            {/* Reference Number & Solution Pill */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#181B26] border border-slate-200 dark:border-slate-800 max-w-md mx-auto text-xs space-y-2.5">
              <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                <span className="text-slate-500">Inquiry Reference:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {submittedLeadNumber || submittedLeadId}
                </span>
              </div>
              {formData.product && (
                <div className="flex justify-between items-center text-slate-600 dark:text-slate-300 border-t border-slate-200 dark:border-slate-800/80 pt-2">
                  <span className="text-slate-500">Solution Track:</span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400 text-right truncate max-w-[220px]">
                    {formData.product}
                  </span>
                </div>
              )}
            </div>

            {/* Next Steps Guidance */}
            <div className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed border-t border-slate-100 dark:border-white/5 pt-5 space-y-1">
              <p className="font-semibold text-slate-700 dark:text-slate-300">What happens next?</p>
              <p>1. We review your company workflows and SKU / order volumes.</p>
              <p>2. We prepare an interactive sandbox configured with your exact industry scenarios.</p>
              <p>3. A solution architect will contact you to conduct the live walkthrough.</p>
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/solutions"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-6 py-3 text-xs font-semibold text-white shadow-xs transition"
              >
                <span>Explore Solutions Overview</span>
                <ArrowRight size={14} />
              </Link>

              <button
                type="button"
                onClick={() => {
                  setSubmittedLeadId(null);
                  setSubmittedLeadNumber(null);
                  setFormData((prev) => ({
                    ...prev,
                    message: '',
                    name: '',
                    phone: '',
                    email: '',
                  }));
                }}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#181B26] px-5 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                Submit Another Request
              </button>
            </div>

            {config.redirectUrl && countdown !== null && (
              <p className="text-xs text-slate-400">
                Redirecting to host website in <span className="font-bold text-slate-600 dark:text-slate-200">{countdown}s</span>...
              </p>
            )}
          </motion.div>
        </div>
      );
    }

    // 4. Main Interactive Walkthrough Form
    return (
      <div className="max-w-4xl mx-auto py-8 sm:py-12 px-4 sm:px-6">
        {/* Breadcrumb / Top Bar */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link
            to="/solutions"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition"
          >
            <ArrowLeft size={14} />
            <span>Back to Solutions Overview</span>
          </Link>

          <div className="hidden sm:flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            {config.phone && (
              <a
                href={`tel:${config.phone}`}
                className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition"
              >
                <Phone size={13} style={{ color: brandColor }} />
                <span>{config.phone}</span>
              </a>
            )}
            {config.email && (
              <a
                href={`mailto:${config.email}`}
                className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition"
              >
                <Mail size={13} style={{ color: brandColor }} />
                <span>{config.email}</span>
              </a>
            )}
          </div>
        </div>

        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#131620] p-6 sm:p-10 shadow-xs space-y-8"
        >
          {/* Card Header */}
          <div className="border-b border-slate-100 dark:border-white/5 pb-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 dark:border-blue-800/60 bg-blue-50/80 dark:bg-blue-950/50 px-3.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 mb-3">
              <Sparkles size={13} />
              <span>Tailored Platform Demonstration</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {config.headline || 'Request a Solution Walkthrough'}
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
              {config.description ||
                'Tell us about your operations. We will set up a live walkthrough sandbox loaded with your workflow scenarios and guide you step-by-step.'}
            </p>
          </div>

          {submitError && (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs flex items-center gap-3">
              <AlertCircle size={18} className="shrink-0 text-red-500" />
              <span>{submitError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8" autoComplete="off">
            {/* Anti-spam Honeypot field (hidden from legitimate users) */}
            <div style={{ display: 'none' }} aria-hidden="true">
              <input
                type="text"
                name="_hp_company_trap"
                tabIndex={-1}
                autoComplete="off"
                value={formData._hp_company_trap}
                onChange={(e) =>
                  setFormData({ ...formData, _hp_company_trap: e.target.value })
                }
              />
            </div>

            {/* Step 1: Solution Track Selector (4 Solutions) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Layers size={14} className="text-blue-600 dark:text-blue-400" />
                  <span>1. Select Solution Track</span>
                </label>
                {activeTrack && (
                  <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2.5 py-0.5 rounded-full border border-blue-200 dark:border-blue-800/50">
                    {activeTrack.badge}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {SOLUTION_TRACKS.map((track) => {
                  const Icon = track.icon;
                  const isSelected = formData.product === track.title;
                  return (
                    <button
                      key={track.id}
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          product: track.title,
                          customProduct: '',
                        })
                      }
                      className={`text-left p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-blue-600 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 ring-2 ring-blue-600/20 dark:ring-blue-500/20 shadow-xs'
                          : 'border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#181B26] hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                              isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            <Icon size={16} />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              {track.badge}
                            </span>
                            {isSelected && (
                              <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center">
                                <Check size={12} strokeWidth={3} />
                              </div>
                            )}
                          </div>
                        </div>

                        <h3 className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                          {track.title}
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                          {track.summary}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Custom / Other Product Toggle if configured by tenant */}
              {Array.isArray(config.products) && config.products.length > 0 && (
                <div className="pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Or select from specific catalog items:
                    </span>
                    <select
                      value={formData.product}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          product: e.target.value,
                        })
                      }
                      className="text-xs bg-slate-50 dark:bg-[#181B26] border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-slate-700 dark:text-slate-300 outline-none"
                    >
                      {config.products.map((p, idx) => (
                        <option key={idx} value={p.name}>
                          {p.category && p.category !== 'General' ? `[${p.category}] ` : ''}
                          {p.name}
                        </option>
                      ))}
                      <option value="__OTHER__">Other / Custom Requirement</option>
                    </select>
                  </div>

                  {formData.product === '__OTHER__' && (
                    <input
                      type="text"
                      required
                      placeholder="Specify your custom product, module or integration requirement..."
                      value={formData.customProduct}
                      onChange={(e) =>
                        setFormData({ ...formData, customProduct: e.target.value })
                      }
                      className="mt-2 w-full text-xs bg-white dark:bg-[#181B26] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                    />
                  )}
                </div>
              )}
            </div>

            {/* Step 2: Contact Details */}
            <div className="space-y-4 border-t border-slate-100 dark:border-white/5 pt-6">
              <label className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                <Building2 size={14} className="text-blue-600 dark:text-blue-400" />
                <span>2. Contact & Organization Details</span>
              </label>

              {/* Row: Name & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {isFieldVisible('name', true) && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                      <span>Full Name</span>
                      {isFieldRequired('name', true) && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      type="text"
                      required={isFieldRequired('name', true)}
                      placeholder="e.g. Rahul Sharma"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full text-xs bg-white dark:bg-[#181B26] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition"
                    />
                  </div>
                )}

                {isFieldVisible('phone', true) && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                      <span>Phone Number</span>
                      {isFieldRequired('phone', true) && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      type="tel"
                      required={isFieldRequired('phone', true)}
                      placeholder="+91 98765 43210"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full text-xs bg-white dark:bg-[#181B26] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition"
                    />
                  </div>
                )}
              </div>

              {/* Row: Email & Company */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {isFieldVisible('email', true) && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                      <span>Business Email</span>
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="rahul@company.example.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full text-xs bg-white dark:bg-[#181B26] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition"
                    />
                  </div>
                )}

                {isFieldVisible('company', true) && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                      <span>Company Name</span>
                      {isFieldRequired('company', false) && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      type="text"
                      required={isFieldRequired('company', false)}
                      placeholder="e.g. Apex Industrial Solutions Ltd"
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                      className="w-full text-xs bg-white dark:bg-[#181B26] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition"
                    />
                  </div>
                )}
              </div>

              {/* Row: City & Implementation Timeframe */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {isFieldVisible('city', true) && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                      <span>City / Operating Location</span>
                      {isFieldRequired('city', false) && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      type="text"
                      required={isFieldRequired('city', false)}
                      placeholder="e.g. Mumbai, Bengaluru, Delhi NCR"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="w-full text-xs bg-white dark:bg-[#181B26] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Clock size={13} className="text-slate-400" />
                    <span>Implementation Timeframe</span>
                  </label>
                  <select
                    value={formData.urgency}
                    onChange={(e) => setFormData({ ...formData, urgency: e.target.value })}
                    className="w-full text-xs bg-white dark:bg-[#181B26] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition"
                  >
                    <option value="immediate">Immediate (Within 2 weeks)</option>
                    <option value="within_1_month">Within 1 Month</option>
                    <option value="1_to_3_months">1 to 3 Months</option>
                    <option value="exploratory">Exploratory / Evaluating Options</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Step 3: Specific Operational Requirements / Notes */}
            {isFieldVisible('message', true) && (
              <div className="space-y-2 border-t border-slate-100 dark:border-white/5 pt-6">
                <label className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center justify-between">
                  <span>3. Operational Requirements & Questions (Optional)</span>
                  {isFieldRequired('message', false) && <span className="text-red-500">*</span>}
                </label>
                <textarea
                  rows={3}
                  required={isFieldRequired('message', false)}
                  placeholder="Share details such as estimated active users, number of warehouse branches, existing accounting software, or specific workflows you'd like to test in the walkthrough..."
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="w-full text-xs bg-white dark:bg-[#181B26] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition resize-none leading-relaxed"
                />
              </div>
            )}

            {/* Submit Action */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100 dark:border-white/5">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <ShieldCheck size={16} className="text-emerald-500 shrink-0" />
                <span>Strict data privacy safeguards. No spam.</span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto min-w-[200px] py-3.5 px-6 rounded-xl text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition hover:opacity-95 cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: brandColor }}
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    <span>Scheduling Walkthrough...</span>
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    <span>{config.submitButtonText || 'Request Walkthrough'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    );
  };

  // If inside an iframe (embedded on an external site), render standalone card without PublicLayout
  if (isEmbedded) {
    return (
      <div
        ref={containerRef}
        className="min-h-screen bg-transparent text-slate-900 dark:text-white flex flex-col justify-between antialiased p-2"
      >
        <main className="flex-1">{renderInnerContent()}</main>
        {config && (
          <footer className="py-2 text-center text-[11px] text-slate-400">
            <span>{BRAND.copyright}</span>
          </footer>
        )}
      </div>
    );
  }

  // Standalone browser visitor view wrapped in PublicLayout
  return (
    <PublicLayout>
      <div ref={containerRef} className="min-h-[calc(100vh-200px)]">
        {renderInnerContent()}
      </div>
    </PublicLayout>
  );
}
