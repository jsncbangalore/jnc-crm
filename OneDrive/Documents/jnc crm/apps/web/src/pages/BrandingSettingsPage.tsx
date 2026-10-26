import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Phone, Upload, Image as ImageIcon, CheckCircle2,
  Trash2, ShieldCheck, RefreshCw, Sparkles, AlertCircle, ArrowLeft, Layout
} from 'lucide-react';
import { useBranding } from '../contexts/BrandingContext';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { brandingApi } from '../services/api';

export default function BrandingSettingsPage() {
  const { branding, updateBranding, refreshBranding } = useBranding();
  const { user } = useAuth();
  const navigate = useNavigate();

  const isAdmin = user?.role === 'tenant_admin' || user?.role === 'admin' || user?.role === 'platform_super_admin';

  const [companyName, setCompanyName] = useState(branding.companyDisplayName);
  const [companyPhone, setCompanyPhone] = useState(branding.companyPhone);
  
  // Document Logo (invoices and quotations)
  const [logoPreview, setLogoPreview] = useState<string | null>(
    branding.companyLogoUrl || null
  );
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Portal Logo (optional, header after sign-in)
  const [portalLogoPreview, setPortalLogoPreview] = useState<string | null>(
    branding.portalLogoUrl || null
  );
  const [uploadingPortalLogo, setUploadingPortalLogo] = useState(false);

  // Invoicing & Tax Profile Fields
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [website, setWebsite] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [invoicePrefix, setInvoicePrefix] = useState('INV');
  const [lutBondNo, setLutBondNo] = useState('');
  const [lutValidity, setLutValidity] = useState('');

  // Bank Details
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [bankUpi, setBankUpi] = useState('');

  // Signatory & Stamp
  const [signatoryName, setSignatoryName] = useState('');
  const [signatoryDesignation, setSignatoryDesignation] = useState('');
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [stampPreview, setStampPreview] = useState<string | null>(null);
  const [requireTwoFactor, setRequireTwoFactor] = useState(false);

  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const portalFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCompanyName(branding.companyDisplayName);
    setCompanyPhone(branding.companyPhone);
    setLogoPreview(branding.companyLogoUrl || null);
    setPortalLogoPreview(branding.portalLogoUrl || null);

    // Fetch full company invoicing profile
    const loadProfile = async () => {
      try {
        setLoadingProfile(true);
        const { data } = await brandingApi.getProfile();
        if (data) {
          if (data.name) setCompanyName(data.name);
          if (data.phone) setCompanyPhone(data.phone);
          if (data.logoUrl) {
            setLogoPreview(data.logoUrl);
          } else {
            setLogoPreview(null);
          }
          if (data.portalLogoUrl) {
            setPortalLogoPreview(data.portalLogoUrl);
          } else {
            setPortalLogoPreview(null);
          }
          if (data.email) setEmail(data.email);
          if (data.address) setAddress(data.address);
          if (data.city) setCity(data.city);
          if (data.state) setState(data.state);
          if (data.pincode) setPincode(data.pincode);
          if (data.website) setWebsite(data.website);
          if (data.gstin) setGstin(data.gstin);
          if (data.pan) setPan(data.pan);
          if (data.invoicePrefix) setInvoicePrefix(data.invoicePrefix);
          if (data.lutBondNo) setLutBondNo(data.lutBondNo);
          if (data.lutValidity) setLutValidity(data.lutValidity);
          if (data.bankName) setBankName(data.bankName);
          if (data.bankAccountNumber) setBankAccountNumber(data.bankAccountNumber);
          if (data.bankIfsc) setBankIfsc(data.bankIfsc);
          if (data.bankBranch) setBankBranch(data.bankBranch);
          if (data.bankUpi) setBankUpi(data.bankUpi);
          if (data.signatoryName) setSignatoryName(data.signatoryName);
          if (data.signatoryDesignation) setSignatoryDesignation(data.signatoryDesignation);
          if (data.signatureUrl) setSignaturePreview(data.signatureUrl);
          if (data.stampUrl) setStampPreview(data.stampUrl);
          if (typeof data.requireTwoFactor === 'boolean') setRequireTwoFactor(data.requireTwoFactor);
        }
      } catch (err) {
        // Fallback to defaults
      } finally {
        setLoadingProfile(false);
      }
    };

    loadProfile();
  }, [branding]);

  // Document Logo Handlers
  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (PNG, JPG, SVG, WebP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Logo file size must be under 5MB.');
      return;
    }

    setErrorMessage('');
    setUploadingLogo(true);
    try {
      const { data } = await brandingApi.uploadLogo(file);
      await refreshBranding();
      if (data?.logoUrl) {
        setLogoPreview(data.logoUrl);
      }
      setSuccessMessage('Document Logo updated successfully! It will appear on all invoices, quotations, and document PDFs.');
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.message || 'Failed to upload document logo.');
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleResetToDefaultLogo = () => {
    setLogoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Portal Logo Handlers
  const handlePortalLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (PNG, JPG, SVG, WebP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Portal logo file size must be under 5MB.');
      return;
    }

    setErrorMessage('');
    setUploadingPortalLogo(true);
    try {
      const { data } = await brandingApi.uploadPortalLogo(file);
      await refreshBranding();
      if (data?.portalLogoUrl) {
        setPortalLogoPreview(data.portalLogoUrl);
      }
      setSuccessMessage('Portal Logo uploaded successfully! Displayed in the top portal header after sign-in.');
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.message || 'Failed to upload portal logo.');
    } finally {
      setUploadingPortalLogo(false);
      if (portalFileInputRef.current) {
        portalFileInputRef.current.value = '';
      }
    }
  };

  const handleRemovePortalLogo = async () => {
    setUploadingPortalLogo(true);
    setErrorMessage('');
    try {
      await brandingApi.deletePortalLogo();
      await refreshBranding();
      setPortalLogoPreview(null);
      setSuccessMessage('Portal logo removed. The portal header will now show your company name as text.');
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.message || 'Failed to remove portal logo.');
    } finally {
      setUploadingPortalLogo(false);
      if (portalFileInputRef.current) {
        portalFileInputRef.current.value = '';
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setErrorMessage('Security Policy: Only Administrators can update Company Branding.');
      return;
    }

    if (!companyName.trim()) {
      setErrorMessage('Company Name is required.');
      return;
    }

    setSaving(true);
    setSuccessMessage('');
    setErrorMessage('');

    try {
      await updateBranding({
        companyDisplayName: companyName.trim(),
        companyPhone: companyPhone.trim(),
        companyLogoUrl: logoPreview || '',
        portalLogoUrl: portalLogoPreview || null,
      });

      await brandingApi.updateProfile({
        name: companyName.trim(),
        phone: companyPhone.trim() || undefined,
        logoUrl: logoPreview || undefined,
        portalLogoUrl: portalLogoPreview || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        pincode: pincode.trim() || undefined,
        website: website.trim() || undefined,
        gstin: gstin.trim() || undefined,
        pan: pan.trim() || undefined,
        invoicePrefix: invoicePrefix.trim() || undefined,
        lutBondNo: lutBondNo.trim() || undefined,
        lutValidity: lutValidity.trim() || undefined,
        bankName: bankName.trim() || undefined,
        bankAccountNumber: bankAccountNumber.trim() || undefined,
        bankIfsc: bankIfsc.trim() || undefined,
        bankBranch: bankBranch.trim() || undefined,
        bankUpi: bankUpi.trim() || undefined,
        signatoryName: signatoryName.trim() || undefined,
        signatoryDesignation: signatoryDesignation.trim() || undefined,
        signatureUrl: signaturePreview || null,
        stampUrl: stampPreview || null,
        requireTwoFactor,
      });

      setSuccessMessage('Company details and branding updated successfully!');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.message || 'Failed to update company settings.');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="card text-center py-16 space-y-4 max-w-lg mx-auto mt-12">
        <div className="w-16 h-16 rounded-2xl bg-red-500/15 text-red-500 mx-auto flex items-center justify-center">
          <AlertCircle size={32} />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Access Restricted</h2>
        <p className="text-xs text-slate-500">
          Only Super Administrators and Administrators have permission to modify central company branding settings.
        </p>
        <button onClick={() => navigate('/')} className="btn-secondary text-xs inline-flex items-center gap-2">
          <ArrowLeft size={14} /> Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* ─── HEADER ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-[#2A3042]">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-crm-blue/10 dark:bg-crm-blue/20 text-crm-blue border border-crm-blue/30">
              <Building2 size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-950 dark:text-white">Company Branding Settings</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Manage your document logo for invoices/quotations, and optional portal header logo.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => refreshBranding()}
          className="btn-secondary text-xs flex items-center gap-1.5 self-start sm:self-auto"
          title="Reload Branding from Server"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* ─── ALERTS ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 flex items-center gap-3 text-xs font-semibold shadow-sm"
          >
            <CheckCircle2 size={18} className="shrink-0" />
            <span>{successMessage}</span>
          </motion.div>
        )}

        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 flex items-center gap-3 text-xs font-semibold shadow-sm"
          >
            <AlertCircle size={18} className="shrink-0" />
            <span>{errorMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ─── GENERAL ORGANIZATION IDENTITY ──────────────────────────────── */}
        <div className="card space-y-5">
          <div className="border-b border-slate-200 dark:border-[#2A3042] pb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles size={16} className="text-crm-blue" />
              General Organization Identity
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              These details configure your company identity across the system.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">
                Company Display Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  className="input text-xs pl-8"
                  placeholder="Enter company display name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                />
                <Building2 size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Used in the portal header and in documents.
              </p>
            </div>

            <div>
              <label className="label">Official Phone / Hotline</label>
              <div className="relative">
                <input
                  type="text"
                  className="input text-xs pl-8 font-mono"
                  placeholder="Enter company phone number"
                  value={companyPhone}
                  onChange={(e) => setCompanyPhone(e.target.value)}
                />
                <Phone size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Included in outbound customer emails and documents.
              </p>
            </div>
          </div>
        </div>

        {/* ─── CARD 1: DOCUMENT LOGO ───────────────────────────────────────── */}
        <div className="card space-y-5">
          <div className="border-b border-slate-200 dark:border-[#2A3042] pb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ImageIcon size={16} className="text-crm-teal" />
              Document logo (invoices and quotations). Not shown on the login page.
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Used on invoices, quotations, delivery challans, credit notes, purchase orders, their PDFs and emails.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            {/* Invoice Header Preview */}
            <div className="md:col-span-6 flex flex-col p-4 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#1E2230]/60 text-left shadow-xs">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center justify-between">
                <span>Invoice Header Preview</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">PDF / PRINT</span>
              </div>
              
              <div className="p-3.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="h-10 max-w-[140px] flex items-center">
                    {logoPreview ? (
                      <img
                        src={logoPreview}
                        alt="Document Logo Preview"
                        className="max-h-10 max-w-[140px] object-contain"
                        onError={() => setLogoPreview(null)}
                      />
                    ) : (
                      <div className="text-xs font-black tracking-tight text-slate-800 dark:text-slate-100">
                        {companyName || 'Company Name'}
                      </div>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">{companyName || 'Company Display Name'}</p>
                    <p>{address ? address.slice(0, 30) + '...' : 'Address / City / GSTIN'}</p>
                    <p className="font-mono">{companyPhone || '+91 ••••• •••••'}</p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-xs font-black uppercase text-blue-600 dark:text-blue-400">TAX INVOICE</div>
                  <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400 mt-1">INV-2026-0001</div>
                  <div className="text-[9px] text-slate-500 dark:text-slate-400">Date: 26/10/2026</div>
                </div>
              </div>
            </div>

            {/* Document Logo Controls */}
            <div className="md:col-span-6 space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleLogoFileChange}
                className="hidden"
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={uploadingLogo}
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-primary text-xs flex items-center gap-1.5 shadow-glow-blue disabled:opacity-50 cursor-pointer"
                >
                  <Upload size={14} className={uploadingLogo ? 'animate-spin' : ''} />
                  {uploadingLogo ? 'Uploading...' : 'Upload Document Logo'}
                </button>

                {logoPreview && (
                  <button
                    type="button"
                    onClick={handleResetToDefaultLogo}
                    className="btn-secondary text-xs flex items-center gap-1.5 cursor-pointer"
                    title="Remove custom logo"
                  >
                    <RefreshCw size={13} /> Reset
                  </button>
                )}
              </div>

              <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
                <p>• Used exclusively in <strong>Invoices, Quotations, Challans, and PDFs</strong>.</p>
                <p>• Recommended dimension: <strong>300x80px</strong> (PNG with transparent background).</p>
                <p>• <strong>Strict Privacy:</strong> This logo is never rendered on pre-login or platform login screens.</p>
              </div>
            </div>
          </div>
        </div>

        {/* ─── CARD 2: PORTAL LOGO (OPTIONAL) ──────────────────────────────── */}
        <div className="card space-y-5">
          <div className="border-b border-slate-200 dark:border-[#2A3042] pb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layout size={16} className="text-indigo-500" />
              Portal logo (optional, shown in the portal header after sign-in)
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Shown in the portal header after login only. Empty by default (displays company name as text).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            {/* Portal Header Preview */}
            <div className="md:col-span-6 flex flex-col p-4 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#1E2230]/60 text-left shadow-xs">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center justify-between">
                <span>Portal Header Preview</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-mono">PORTAL NAVBAR</span>
              </div>

              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center gap-3">
                <div className="h-7 w-7 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                  <Building2 size={15} />
                </div>

                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {portalLogoPreview ? (
                    <img
                      src={portalLogoPreview}
                      alt="Portal Logo Preview"
                      className="h-7 max-w-[120px] object-contain shrink-0"
                      onError={() => setPortalLogoPreview(null)}
                    />
                  ) : null}

                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {companyName || 'Company Name'}
                    </span>
                    <span className="text-[9px] text-slate-500 dark:text-slate-400">
                      CRM Portal
                    </span>
                  </div>
                </div>

                <div className="h-6 w-16 rounded bg-slate-100 dark:bg-slate-800 shrink-0 flex items-center justify-center text-[9px] text-slate-400 font-mono">
                  Search...
                </div>
              </div>

              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">
                {portalLogoPreview
                  ? 'Custom portal logo is set. It appears alongside your company name in the top navbar.'
                  : 'No portal logo uploaded. The portal header displays your company name as text.'}
              </p>
            </div>

            {/* Portal Logo Controls */}
            <div className="md:col-span-6 space-y-3">
              <input
                ref={portalFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handlePortalLogoFileChange}
                className="hidden"
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={uploadingPortalLogo}
                  onClick={() => portalFileInputRef.current?.click()}
                  className="btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Upload size={14} className={uploadingPortalLogo ? 'animate-spin' : ''} />
                  {uploadingPortalLogo ? 'Uploading...' : 'Upload Portal Logo'}
                </button>

                {portalLogoPreview && (
                  <button
                    type="button"
                    onClick={handleRemovePortalLogo}
                    disabled={uploadingPortalLogo}
                    className="btn-secondary text-xs flex items-center gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                    title="Remove portal logo and display company name as text"
                  >
                    <Trash2 size={13} /> Remove
                  </button>
                )}
              </div>

              <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
                <p>• <strong>Optional:</strong> Displayed only in the authenticated portal header.</p>
                <p>• If not set, the header displays the company name as text.</p>
                <p>• Recommended dimension: <strong>120x32px</strong> or compact horizontal icon/mark.</p>
              </div>
            </div>
          </div>
        </div>

        {/* ─── INVOICING & REGISTERED TAX PROFILE CARD ─────────────────────── */}
        <div className="card space-y-5">
          <div className="border-b border-slate-200 dark:border-[#2A3042] pb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Building2 size={16} className="text-indigo-600" />
              Registered Business & Tax Invoicing Profile
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              These details automatically populate on all Tax Invoices, Quotations, Proforma, and Delivery Challans.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Registered Business Address</label>
              <input
                type="text"
                className="input text-xs"
                placeholder="Enter registered business address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="label">City</label>
                <input
                  type="text"
                  className="input text-xs"
                  placeholder="Enter city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
              <div>
                <label className="label">State</label>
                <input
                  type="text"
                  className="input text-xs"
                  placeholder="Enter state"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Pincode</label>
                <input
                  type="text"
                  className="input text-xs font-mono"
                  placeholder="Pincode"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="label">Official Billing Email</label>
              <input
                type="email"
                className="input text-xs"
                placeholder="billing@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Website / Portal URL</label>
              <input
                type="text"
                className="input text-xs"
                placeholder="https://example.com"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Company GSTIN</label>
              <input
                type="text"
                className="input text-xs font-mono uppercase"
                placeholder="29AAAAA0000A1Z5"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
              />
            </div>

            <div>
              <label className="label">Company PAN</label>
              <input
                type="text"
                className="input text-xs font-mono uppercase"
                placeholder="AAAAA0000A"
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase())}
              />
            </div>
          </div>
        </div>

        {/* ─── INVOICE PREFIX & BANKING DETAILS CARD ───────────────────────── */}
        <div className="card space-y-5">
          <div className="border-b border-slate-200 dark:border-[#2A3042] pb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck size={16} className="text-emerald-500" />
              Invoice Sequences & Bank Settlement Account
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Settlement banking details printed on customer invoices for RTGS/NEFT/UPI remittance.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Invoice Number Prefix</label>
              <input
                type="text"
                className="input text-xs font-mono uppercase"
                placeholder="INV"
                value={invoicePrefix}
                onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())}
              />
              <p className="text-[10px] text-slate-400 mt-1">e.g. INV-2026-XXXX</p>
            </div>

            <div>
              <label className="label">Bank Name</label>
              <input
                type="text"
                className="input text-xs"
                placeholder="e.g. HDFC Bank Ltd."
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Account Number</label>
              <input
                type="text"
                className="input text-xs font-mono"
                placeholder="Bank account number"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
              />
            </div>

            <div>
              <label className="label">IFSC Code</label>
              <input
                type="text"
                className="input text-xs font-mono uppercase"
                placeholder="HDFC0001234"
                value={bankIfsc}
                onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
              />
            </div>

            <div>
              <label className="label">Branch Name</label>
              <input
                type="text"
                className="input text-xs"
                placeholder="Branch name"
                value={bankBranch}
                onChange={(e) => setBankBranch(e.target.value)}
              />
            </div>

            <div>
              <label className="label">UPI ID / VPA</label>
              <input
                type="text"
                className="input text-xs font-mono"
                placeholder="company@bank"
                value={bankUpi}
                onChange={(e) => setBankUpi(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* ─── ACTION BUTTONS ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-[#2A3042]">
          <button
            type="submit"
            disabled={saving}
            className="btn-primary text-xs px-6 py-2.5 shadow-glow-blue disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            {saving ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Saving Changes...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={14} />
                <span>Save All Settings</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
