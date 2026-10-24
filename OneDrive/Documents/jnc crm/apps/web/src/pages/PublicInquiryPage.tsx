import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Send, CheckCircle2, Phone, Mail, Globe, AlertCircle, Building2, ExternalLink
} from 'lucide-react';
import axios from 'axios';

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

export default function PublicInquiryPage() {
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
    urgency: 'medium',
    message: '',
    _hp_company_trap: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [submittedLeadId, setSubmittedLeadId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Notify parent window of height for seamless iframe embedding
  const postHeightToParent = () => {
    try {
      if (window.parent && window.parent !== window) {
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
  }, [isLoading, submittedLeadId, config]);

  // Load tenant public form configuration
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get('key');

    if (!key || !key.trim()) {
      setIsLoading(false);
      setLoadError('This form is not available');
      return;
    }

    axios
      .get(`/api/v1/webhooks/inquiry-info/${encodeURIComponent(key.trim())}`)
      .then((res) => {
        const data: WebFormConfig = res.data;
        setConfig(data);
        if (Array.isArray(data.products) && data.products.length > 0) {
          setFormData((prev) => ({
            ...prev,
            product: data.products[0].name,
          }));
        }
      })
      .catch((err) => {
        const msg = err?.response?.data?.message || 'This form is not available';
        setLoadError(msg);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

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

    const params = new URLSearchParams(window.location.search);
    const key = params.get('key');

    if (!key) {
      setSubmitError('Missing form authorization key.');
      setSubmitting(false);
      return;
    }

    const selectedProduct = formData.product === '__OTHER__' 
      ? formData.customProduct 
      : (formData.product || formData.customProduct);

    const payload = {
      name: formData.name,
      phone: formData.phone,
      email: formData.email,
      company: formData.company,
      city: formData.city,
      product: selectedProduct,
      quantity: formData.quantity,
      urgency: formData.urgency,
      message: formData.message,
      _hp_company_trap: formData._hp_company_trap,
      submissionId: 'WEB-' + Date.now().toString(),
    };

    try {
      const response = await axios.post(
        `/api/v1/webhooks/website/${encodeURIComponent(key.trim())}`,
        payload
      );
      setSubmittedLeadId(response.data?.leadId || 'INQ-' + Date.now().toString().slice(-6));
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to submit form. Please check your information and try again.';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const brandColor = config?.brandColor || '#2563eb';

  // Loading State
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-slate-300 border-t-slate-800 rounded-full animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Loading form...</p>
        </div>
      </div>
    );
  }

  // Error / Form Disabled / Invalid Key State
  if (loadError || !config) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 antialiased">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 text-slate-500 flex items-center justify-center mx-auto">
            <AlertCircle size={24} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">This form is not available</h1>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              The link you followed may have expired, or the form is currently paused by the administrator.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const fields = config.fields || {};
  const isFieldVisible = (name: string, defaultShow = true) => fields[name]?.show ?? defaultShow;
  const isFieldRequired = (name: string, defaultReq = false) => fields[name]?.required ?? defaultReq;

  return (
    <div ref={containerRef} className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between antialiased">
      {/* Header */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {config.logoUrl ? (
              <img
                src={config.logoUrl}
                alt={config.companyName}
                className="h-9 max-w-[140px] object-contain rounded-md"
              />
            ) : (
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-xs"
                style={{ backgroundColor: brandColor }}
              >
                <Building2 size={18} />
              </div>
            )}
            <div>
              <h1 className="text-sm font-bold text-slate-900 leading-tight">
                {config.companyName}
              </h1>
              <p className="text-[11px] text-slate-500">Official Inquiry Desk</p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-4 text-xs text-slate-500">
            {config.phone && (
              <a href={`tel:${config.phone}`} className="flex items-center gap-1.5 hover:text-slate-800 transition-colors">
                <Phone size={13} style={{ color: brandColor }} />
                <span>{config.phone}</span>
              </a>
            )}
            {config.email && (
              <a href={`mailto:${config.email}`} className="flex items-center gap-1.5 hover:text-slate-800 transition-colors">
                <Mail size={13} style={{ color: brandColor }} />
                <span>{config.email}</span>
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-2xl w-full mx-auto px-4 py-8 flex-1 flex flex-col justify-center">
        {submittedLeadId ? (
          /* Thank You Screen */
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-slate-200 rounded-2xl p-8 sm:p-12 text-center shadow-xs space-y-6"
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
              style={{ backgroundColor: `${brandColor}15`, color: brandColor }}
            >
              <CheckCircle2 size={36} />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-slate-900">
                {config.thankYouTitle || 'Thank You!'}
              </h2>
              <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                {config.thankYouMessage || 'Your inquiry has been received. Our team will contact you soon.'}
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 max-w-xs mx-auto text-xs text-slate-600 flex justify-between items-center">
              <span className="text-slate-500">Reference Number:</span>
              <span className="font-mono font-bold text-slate-900">{submittedLeadId}</span>
            </div>

            {config.redirectUrl && (
              <div className="pt-2 space-y-3">
                <p className="text-xs text-slate-500">
                  Redirecting in <span className="font-bold text-slate-800">{countdown}s</span>...
                </p>
                <a
                  href={config.redirectUrl}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl text-white transition-opacity hover:opacity-90 shadow-xs"
                  style={{ backgroundColor: brandColor }}
                >
                  <span>Continue</span>
                  <ExternalLink size={13} />
                </a>
              </div>
            )}
          </motion.div>
        ) : (
          /* Inquiry Form Card */
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6"
          >
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                {config.headline || 'Request a Quote'}
              </h2>
              {config.description && (
                <p className="text-xs sm:text-sm text-slate-500 mt-1.5 leading-relaxed">
                  {config.description}
                </p>
              )}
            </div>

            {submitError && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0 text-red-500" />
                <span>{submitError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
              {/* Anti-spam Honeypot field (hidden from legitimate users) */}
              <div style={{ display: 'none' }} aria-hidden="true">
                <input
                  type="text"
                  name="_hp_company_trap"
                  tabIndex={-1}
                  autoComplete="off"
                  value={formData._hp_company_trap}
                  onChange={(e) => setFormData({ ...formData, _hp_company_trap: e.target.value })}
                />
              </div>

              {/* Product Selection (only if show: true) */}
              {isFieldVisible('product', true) && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Product / Service {isFieldRequired('product', false) && <span className="text-red-500">*</span>}
                  </label>
                  {config.products && config.products.length > 0 ? (
                    <div className="space-y-2">
                      <select
                        required={isFieldRequired('product', false)}
                        value={formData.product}
                        onChange={(e) => setFormData({ ...formData, product: e.target.value })}
                        className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-all"
                      >
                        {config.products.map((p, idx) => (
                          <option key={idx} value={p.name}>
                            {p.category && p.category !== 'General' ? `[${p.category}] ` : ''}{p.name}
                          </option>
                        ))}
                        <option value="__OTHER__">Other / Custom Requirement</option>
                      </select>

                      {formData.product === '__OTHER__' && (
                        <input
                          type="text"
                          required
                          placeholder="Please specify product or service needed..."
                          value={formData.customProduct}
                          onChange={(e) => setFormData({ ...formData, customProduct: e.target.value })}
                          className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-all"
                        />
                      )}
                    </div>
                  ) : (
                    <input
                      type="text"
                      required={isFieldRequired('product', false)}
                      placeholder="e.g. Fiber Optic Patch Cables, UPS 5kVA..."
                      value={formData.customProduct}
                      onChange={(e) => setFormData({ ...formData, customProduct: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-all"
                    />
                  )}
                </div>
              )}

              {/* Row: Name & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {isFieldVisible('name', true) && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">
                      Your Name {isFieldRequired('name', true) && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      type="text"
                      required={isFieldRequired('name', true)}
                      placeholder="John Doe"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-all"
                    />
                  </div>
                )}

                {isFieldVisible('phone', true) && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">
                      Phone Number {isFieldRequired('phone', true) && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      type="tel"
                      required={isFieldRequired('phone', true)}
                      placeholder="Phone Number"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-all"
                    />
                  </div>
                )}
              </div>

              {/* Row: Email & Company */}
              {(isFieldVisible('email', true) || isFieldVisible('company', true)) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {isFieldVisible('email', true) && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-700">
                        Email Address {isFieldRequired('email', false) && <span className="text-red-500">*</span>}
                      </label>
                      <input
                        type="email"
                        required={isFieldRequired('email', false)}
                        placeholder="john@example.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-all"
                      />
                    </div>
                  )}

                  {isFieldVisible('company', true) && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-700">
                        Company Name {isFieldRequired('company', false) && <span className="text-red-500">*</span>}
                      </label>
                      <input
                        type="text"
                        required={isFieldRequired('company', false)}
                        placeholder="Company or Organization"
                        value={formData.company}
                        onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                        className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-all"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Row: City & Quantity */}
              {(isFieldVisible('city', true) || isFieldVisible('quantity', true)) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {isFieldVisible('city', true) && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-700">
                        City / Location {isFieldRequired('city', false) && <span className="text-red-500">*</span>}
                      </label>
                      <input
                        type="text"
                        required={isFieldRequired('city', false)}
                        placeholder="e.g. City"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-all"
                      />
                    </div>
                  )}

                  {isFieldVisible('quantity', true) && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-700">
                        Quantity Needed {isFieldRequired('quantity', false) && <span className="text-red-500">*</span>}
                      </label>
                      <input
                        type="text"
                        required={isFieldRequired('quantity', false)}
                        placeholder="e.g. 5 units, 100 meters"
                        value={formData.quantity}
                        onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                        className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-all"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Urgency */}
              {isFieldVisible('urgency', false) && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Requirement Timeline
                  </label>
                  <select
                    value={formData.urgency}
                    onChange={(e) => setFormData({ ...formData, urgency: e.target.value })}
                    className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-all"
                  >
                    <option value="high">Immediate (Ready Stock)</option>
                    <option value="medium">Standard (1-2 weeks)</option>
                    <option value="low">Planning / Tender</option>
                  </select>
                </div>
              )}

              {/* Message */}
              {isFieldVisible('message', true) && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Message / Specifications {isFieldRequired('message', false) && <span className="text-red-500">*</span>}
                  </label>
                  <textarea
                    rows={3}
                    required={isFieldRequired('message', false)}
                    placeholder="Enter any additional requirements, questions, or notes..."
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-all resize-none"
                  />
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 px-4 rounded-xl text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-opacity hover:opacity-95 cursor-pointer disabled:opacity-50"
                  style={{ backgroundColor: brandColor }}
                >
                  {submitting ? (
                    'Submitting...'
                  ) : (
                    <>
                      <Send size={14} />
                      <span>{config.submitButtonText || 'Submit Inquiry'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200/80 py-4 text-center text-xs text-slate-400">
        <div className="max-w-3xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="font-medium text-slate-600">&copy; {new Date().getFullYear()} {config.companyName}</p>
          {config.website && (
            <a
              href={config.website.startsWith('http') ? config.website : `https://${config.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-slate-700 transition-colors"
            >
              <Globe size={12} />
              <span>{config.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
            </a>
          )}
        </div>
      </footer>
    </div>
  );
}
