import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Cpu, Send, CheckCircle2, Phone, Mail, MapPin, Sparkles, Building, Layers, Globe, Radio, Bell, Shield, PhoneCall
} from 'lucide-react';
import axios from 'axios';
import { BRAND_CONFIG } from '../config/brand';

const FALLBACK_PRODUCT_CATEGORIES = [
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
  'Other Custom Requirement',
];

export default function PublicInquiryPage() {
  const [companyInfo, setCompanyInfo] = useState({
    name: BRAND_CONFIG.displayName,
    phone: '',
    email: '',
    website: '',
    address: '',
    logoUrl: '',
  });

  const [productsList, setProductsList] = useState<Array<{ name: string; category: string; skuCode?: string }>>([]);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    company: '',
    city: '',
    productCategory: 'PA System (Public Address & Amplifiers)',
    productName: '',
    quantity: '',
    urgency: 'medium',
    message: '',
    _hp_company_trap: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [submittedLeadId, setSubmittedLeadId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load tenant branding & inventory product catalog dynamically
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get('key');
    const infoEndpoint = key ? `/api/v1/webhooks/inquiry-info/${key}` : '/api/v1/webhooks/inquiry-info';

    axios.get(infoEndpoint)
      .then((res) => {
        if (res.data?.company) {
          const comp = res.data.company;
          setCompanyInfo({
            name: comp.name || BRAND_CONFIG.displayName,
            phone: comp.phone || '',
            email: comp.email || '',
            website: comp.website || '',
            address: comp.address || '',
            logoUrl: comp.logoUrl || '',
          });
        }
        if (Array.isArray(res.data?.products) && res.data.products.length > 0) {
          setProductsList(res.data.products);
          setFormData((prev) => ({
            ...prev,
            productCategory: res.data.products[0].name,
          }));
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams(window.location.search);
      const key = params.get('key');
      const submitEndpoint = key ? `/api/v1/webhooks/website/${key}` : '/api/v1/webhooks/website';

      const payload = {
        name: formData.name,
        phone: formData.phone,
        email: formData.email,
        company: formData.company,
        city: formData.city,
        productCategory: formData.productCategory,
        productName: formData.productName || formData.productCategory,
        quantity: formData.quantity,
        urgency: formData.urgency,
        submissionId: 'INQ-' + Date.now().toString(),
        _hp_company_trap: formData._hp_company_trap,
        queryMessage: `[RFQ via ${companyInfo.name || BRAND_CONFIG.displayName} Inquiry Form]\nCategory/Product: ${formData.productCategory}\nItem/Specification: ${formData.productName || 'Standard Package'}\nTarget Qty: ${formData.quantity || 'Not specified'}\nUrgency: ${formData.urgency.toUpperCase()}\n\nClient Note: ${formData.message || 'None'}`,
      };

      const response = await axios.post(submitEndpoint, payload);
      setSubmittedLeadId(response.data.leadId || 'INQ-' + Date.now().toString().slice(-6));
    } catch (err: any) {
      const fallbackPhone = companyInfo.phone || BRAND_CONFIG.phone || '';
      setErrorMsg(
        err?.response?.data?.message ||
        `Failed to submit inquiry. ${fallbackPhone ? `Please call ${fallbackPhone} directly.` : 'Please try again later.'}`
      );
    } finally {
      setSubmitting(false);
    }
  };

  const displayName = companyInfo.name || BRAND_CONFIG.displayName;
  const displayPhone = companyInfo.phone || BRAND_CONFIG.phone || '';
  const displayEmail = companyInfo.email || BRAND_CONFIG.email || '';
  const displayWebsite = companyInfo.website || BRAND_CONFIG.website || '';
  const displayAddress = companyInfo.address || BRAND_CONFIG.address || '';

  return (
    <div className="min-h-screen bg-[#0A0C10] text-slate-100 flex flex-col justify-between selection:bg-crm-blue selection:text-white">
      {/* Ambient background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-crm-blue/15 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-crm-violet/15 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="border-b border-[#1E2230] bg-slate-50 dark:bg-[#0F1117]/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-crm-blue to-crm-violet flex items-center justify-center shadow-glow-blue">
              <Cpu size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight text-slate-950 dark:text-white flex items-center gap-2">
                {displayName}
              </h1>
              <p className="text-[11px] text-slate-400 font-medium">
                Official Product Inquiry & Quotation Desk
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-4 text-xs text-slate-400">
            {displayPhone && (
              <a href={`tel:${displayPhone}`} className="flex items-center gap-1.5 text-crm-teal hover:underline font-medium">
                <Phone size={13} /> {displayPhone}
              </a>
            )}
            {displayEmail && (
              <a href={`mailto:${displayEmail}`} className="flex items-center gap-1.5 text-crm-blue-light hover:underline font-medium">
                <Mail size={13} /> {displayEmail}
              </a>
            )}
            {displayWebsite && (
              <a
                href={displayWebsite.startsWith('http') ? displayWebsite : `https://${displayWebsite}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-slate-300 hover:text-white font-medium"
              >
                <Globe size={13} /> {displayWebsite.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl w-full mx-auto px-4 py-8 relative z-10 flex-1 flex flex-col justify-center">
        {submittedLeadId ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#131620] border border-green-500/30 rounded-3xl p-8 sm:p-12 text-center shadow-2xl shadow-green-500/5 space-y-6"
          >
            <div className="w-20 h-20 rounded-2xl bg-green-500/15 border border-green-500/30 text-green-400 flex items-center justify-center mx-auto">
              <CheckCircle2 size={40} />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-950 dark:text-white">Inquiry Received!</h2>
              <p className="text-slate-400 text-sm mt-2 max-w-md mx-auto">
                Thank you, <strong className="text-white">{formData.name}</strong>. Your request for{' '}
                <strong className="text-crm-teal">{formData.productCategory}</strong> has been received by our technical engineering & sales team.
              </p>
            </div>

            <div className="p-4 bg-[#1A1E2B] rounded-2xl border border-slate-200 dark:border-[#2A3042] max-w-sm mx-auto text-left text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Inquiry Reference:</span>
                <span className="font-mono text-crm-teal font-bold">{submittedLeadId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">System:</span>
                <span className="text-white font-medium truncate max-w-[180px]">{formData.productCategory}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Contact:</span>
                <span className="text-slate-300">{formData.phone}</span>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => {
                  setSubmittedLeadId(null);
                  setFormData({
                    name: '',
                    phone: '',
                    email: '',
                    company: '',
                    city: '',
                    productCategory: productsList[0]?.name || 'PA System (Public Address & Amplifiers)',
                    productName: '',
                    quantity: '',
                    urgency: 'medium',
                    message: '',
                    _hp_company_trap: '',
                  });
                }}
                className="btn bg-white/10 hover:bg-white/20 text-white text-xs px-6 py-2.5 rounded-xl transition-all"
              >
                Submit Another Request
              </button>
              <a
                href={displayWebsite || '#'}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost text-xs px-5 py-2.5 text-slate-300 hover:text-white"
              >
                Visit Official Website →
              </a>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#131620] border border-[#222738] rounded-3xl p-6 sm:p-10 shadow-2xl shadow-black/60"
          >
            <div className="mb-8">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-crm-blue/15 border border-crm-blue/30 text-crm-blue-light text-xs font-semibold mb-3">
                <Sparkles size={13} /> Official Quote & Solution Design Request
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-950 dark:text-white tracking-tight">
                Request Product Pricing & Availability
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Tell us your system requirements (PA Systems, Fire Alarms, Talk Back, Security, Networking) to get a competitive quotation.
              </p>
            </div>

            {errorMsg && (
              <div className="mb-6 p-4 rounded-xl bg-crm-coral/15 border border-crm-coral/30 text-crm-coral text-xs">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off" data-lpignore="true">
              {/* Anti-spam Honeypot field (hidden from real users) */}
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

              {/* Product Category Selection */}
              <div>
                <label className="label font-bold text-slate-950 dark:text-white">Select Product / System Category *</label>
                <select
                  required
                  className="input text-xs bg-[#1A1E2B] border-slate-200 dark:border-[#2A3042]"
                  value={formData.productCategory}
                  onChange={(e) => setFormData({ ...formData, productCategory: e.target.value })}
                >
                  {productsList.length > 0 ? (
                    <>
                      {productsList.map((prod, idx) => (
                        <option key={idx} value={prod.name}>
                          {prod.category && prod.category !== 'General' ? `[${prod.category}] ` : ''}{prod.name}
                        </option>
                      ))}
                      <option value="Other Custom Requirement">Other Custom Requirement</option>
                    </>
                  ) : (
                    FALLBACK_PRODUCT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Row 1: Name & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Your Name *</label>
                  <input
                    type="text"
                    name="client_contact_name"
                    required
                    autoComplete="off"
                    className="input text-xs"
                    placeholder="e.g. Rajesh Sharma"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Mobile / WhatsApp Number *</label>
                  <input
                    type="tel"
                    name="client_contact_phone"
                    required
                    autoComplete="off"
                    className="input text-xs"
                    placeholder="e.g. 9845012345"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>

              {/* Row 2: Email & Company */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Email Address</label>
                  <input
                    type="email"
                    name="client_contact_email"
                    autoComplete="off"
                    className="input text-xs"
                    placeholder="e.g. rajesh@company.in"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Company / Organization Name</label>
                  <input
                    type="text"
                    name="client_org_name"
                    autoComplete="off"
                    className="input text-xs"
                    placeholder="e.g. Apollo Hospital / Tech Park Facility"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  />
                </div>
              </div>

              {/* Row 3: Product Required & Quantity */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="label">Specific Model / Requirements / Part Number</label>
                  <input
                    type="text"
                    name="client_product_desc"
                    autoComplete="off"
                    className="input text-xs"
                    placeholder="e.g. 240W Amplifier, 8 Zone Addressable Panel, Smoke Detectors..."
                    value={formData.productName}
                    onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Quantity / Units</label>
                  <input
                    type="text"
                    name="client_order_qty"
                    autoComplete="off"
                    className="input text-xs"
                    placeholder="e.g. 10 units / Complete Setup"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  />
                </div>
              </div>

              {/* Row 4: City & Urgency */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Project City / State</label>
                  <input
                    type="text"
                    name="client_project_city"
                    autoComplete="off"
                    className="input text-xs"
                    placeholder="e.g. Bengaluru, Karnataka"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Timeline / Urgency</label>
                  <select
                    className="input text-xs"
                    value={formData.urgency}
                    onChange={(e) => setFormData({ ...formData, urgency: e.target.value })}
                  >
                    <option value="high">Urgent (Ready stock / Immediate installation)</option>
                    <option value="medium">Standard (1-2 weeks)</option>
                    <option value="low">Planning / Future Project Tender</option>
                  </select>
                </div>
              </div>

              {/* Additional Message */}
              <div>
                <label className="label">Project Details / Custom Specifications</label>
                <textarea
                  rows={3}
                  className="input text-xs resize-none"
                  placeholder="Mention site layout details, cable distance, number of zones, or any customization needed..."
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                />
              </div>

              <div className="pt-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full btn bg-gradient-to-r from-crm-blue to-crm-violet hover:from-crm-blue-hover hover:to-crm-violet-hover text-white font-bold py-3.5 rounded-xl shadow-glow-blue flex items-center justify-center gap-2 text-sm transition-all"
                >
                  {submitting ? (
                    'Submitting to Engineering Desk...'
                  ) : (
                    <>
                      <Send size={16} /> Submit Requirement for Quotation
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </main>

      {/* Footer with verified official company credentials */}
      <footer className="border-t border-[#1E2230] py-6 text-xs text-slate-400 bg-slate-50 dark:bg-[#0F1117]/80">
        <div className="max-w-5xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <div>
            <p className="font-bold text-slate-950 dark:text-white">{displayName}</p>
            {displayAddress && (
              <p className="text-slate-500 mt-0.5">{displayAddress}</p>
            )}
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            {displayPhone && <span>{displayPhone}</span>}
            {displayEmail && <span>{displayEmail}</span>}
          </div>
        </div>
      </footer>
    </div>
  );
}
