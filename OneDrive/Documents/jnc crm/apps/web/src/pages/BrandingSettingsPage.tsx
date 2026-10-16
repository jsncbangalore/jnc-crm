import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Phone, Upload, Image as ImageIcon, CheckCircle2,
  Trash2, ShieldCheck, RefreshCw, Sparkles, AlertCircle, ArrowLeft
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
  const [logoPreview, setLogoPreview] = useState<string | null>(
    branding.companyLogoUrl || '/jnc-logo.jpg'
  );
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Invoicing & Tax Profile Fields
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('Karnataka');
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

  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sigInputRef = useRef<HTMLInputElement>(null);
  const stampInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCompanyName(branding.companyDisplayName);
    setCompanyPhone(branding.companyPhone);
    setLogoPreview(branding.companyLogoUrl || '/jnc-logo.jpg');

    // Fetch full company invoicing profile
    const loadProfile = async () => {
      try {
        setLoadingProfile(true);
        const { data } = await brandingApi.getProfile();
        if (data) {
          if (data.name) setCompanyName(data.name);
          if (data.phone) setCompanyPhone(data.phone);
          if (data.logoUrl && !data.logoUrl.startsWith('data:')) {
            setLogoPreview(data.logoUrl);
          } else {
            setLogoPreview('/jnc-logo.jpg');
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
        }
      } catch (err) {
        // Fallback to defaults
      } finally {
        setLoadingProfile(false);
      }
    };

    loadProfile();
  }, [branding]);

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
      await brandingApi.uploadLogo(file);
      await refreshBranding();
      const freshUrl = `/jnc-logo.jpg?t=${Date.now()}`;
      setLogoPreview(freshUrl);
      setSuccessMessage('Official Company Logo uploaded and updated successfully across all invoices, printouts, and headers.');
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.message || 'Failed to upload logo.');
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveLogo = () => {
    setLogoPreview('/jnc-logo.jpg');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleResetToDefaultLogo = () => {
    setLogoPreview('/jnc-logo.jpg');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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
        companyLogoUrl: '/jnc-logo.jpg',
      });

      await brandingApi.updateProfile({
        name: companyName.trim(),
        phone: companyPhone.trim() || undefined,
        logoUrl: '/jnc-logo.jpg',
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
      });

      setSuccessMessage('Company Business Details & Invoicing Profile successfully updated! All tax invoices, headers, and documents are synchronized.');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.message || 'Failed to update company profile settings.');
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
                Centralized branding configuration driving UI chrome (header/footer) and all outgoing email templates.
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
        {/* ─── BRANDING DETAILS CARD ───────────────────────────────────────── */}
        <div className="card space-y-5">
          <div className="border-b border-slate-200 dark:border-[#2A3042] pb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles size={16} className="text-crm-blue" />
              General Organization Identity
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              These details appear across the CRM portal header, mobile dock, footer, invoices, and automated notifications.
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
              <p className="text-[10px] text-slate-400 mt-1">
                Used in header logos, page titles, dispatch notifications, and PDF billing summaries.
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
              <p className="text-[10px] text-slate-400 mt-1">
                Included in outbound customer emails and the footer support hotline.
              </p>
            </div>
          </div>
        </div>

        {/* ─── INVOICE LOGO ASSET & PREVIEW CARD ──────────────────────────────────── */}
        <div className="card space-y-5">
          <div className="border-b border-slate-200 dark:border-[#2A3042] pb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ImageIcon size={16} className="text-crm-teal" />
              Invoice & Quotation Custom Logo
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Upload your custom logo to appear exclusively on Tax Invoices, Quotations, and Documents. The portal header logo (JNC) remains permanent.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            {/* Live Preview Box */}
            <div className="md:col-span-5 flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed border-slate-200 dark:border-[#2A3042] bg-slate-50/50 dark:bg-[#1E2230]/40 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Invoice Logo Preview</div>
              <div className="h-16 w-48 px-4 py-2 rounded-xl bg-white flex items-center justify-center shadow-md border border-slate-200">
                <img
                  src={logoPreview || '/jnc-logo.jpg'}
                  alt={companyName || 'Company Logo'}
                  className="max-h-12 max-w-full object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = '/jnc-logo.jpg';
                  }}
                />
              </div>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-3">{companyName || 'Company Name'}</p>
              <p className="text-[10px] text-slate-500 font-mono">{companyPhone || 'No Phone'}</p>
            </div>

            {/* Uploader Controls */}
            <div className="md:col-span-7 space-y-3">
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
                  className="btn-primary text-xs flex items-center gap-1.5 shadow-glow-blue disabled:opacity-50"
                >
                  <Upload size={14} className={uploadingLogo ? 'animate-spin' : ''} />
                  {uploadingLogo ? 'Uploading Logo...' : 'Upload Company Logo'}
                </button>

                <button
                  type="button"
                  onClick={handleResetToDefaultLogo}
                  className="btn-secondary text-xs flex items-center gap-1.5"
                  title="Reset to default company logo"
                >
                  <RefreshCw size={13} /> Reset to Default
                </button>
              </div>

              <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
                <p>• Recommended dimension: <strong>300x80px</strong> or proportional aspect ratio.</p>
                <p>• Max file size: <strong>2 MB</strong>.</p>
                <p>• This logo appears on Tax Invoices, Quotations, and printable documents.</p>
                <p>• The main portal header logo remains the permanent official JNC emblem.</p>
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
                <label className="label">PIN Code</label>
                <input
                  type="text"
                  className="input text-xs font-mono"
                  placeholder="Enter PIN code"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">GSTIN / Tax ID</label>
              <input
                type="text"
                className="input text-xs uppercase font-mono"
                placeholder="Enter 15-digit GSTIN"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
              />
            </div>

            <div>
              <label className="label">PAN Number</label>
              <input
                type="text"
                className="input text-xs uppercase font-mono"
                placeholder="Enter 10-digit PAN"
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase())}
              />
            </div>

            <div>
              <label className="label">Invoice Prefix</label>
              <input
                type="text"
                className="input text-xs uppercase font-mono"
                placeholder="Enter invoice prefix (e.g. INV)"
                value={invoicePrefix}
                onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Official Billing Email</label>
              <input
                type="email"
                className="input text-xs"
                placeholder="Enter billing email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Website</label>
              <input
                type="text"
                className="input text-xs"
                placeholder="Enter website URL"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* ─── BANK DETAILS FOR INVOICES CARD ─────────────────────────────── */}
        <div className="card space-y-5">
          <div className="border-b border-slate-200 dark:border-[#2A3042] pb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Building2 size={16} className="text-emerald-600" />
              Bank Account Details (Printed on Invoices & Quotes)
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Customers will see these bank credentials for NEFT/RTGS wire transfers and UPI payments.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Bank Name</label>
              <input
                type="text"
                className="input text-xs"
                placeholder="Enter bank name"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Account Number</label>
              <input
                type="text"
                className="input text-xs font-mono"
                placeholder="Enter account number"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
              />
            </div>

            <div>
              <label className="label">IFSC Code</label>
              <input
                type="text"
                className="input text-xs uppercase font-mono"
                placeholder="Enter IFSC code"
                value={bankIfsc}
                onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Branch Name</label>
              <input
                type="text"
                className="input text-xs"
                placeholder="Enter branch name"
                value={bankBranch}
                onChange={(e) => setBankBranch(e.target.value)}
              />
            </div>

            <div>
              <label className="label">UPI ID (Optional)</label>
              <input
                type="text"
                className="input text-xs font-mono"
                placeholder="Enter UPI ID (optional)"
                value={bankUpi}
                onChange={(e) => setBankUpi(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* ─── AUTHORIZED SIGNATORY CARD ──────────────────────────────────── */}
        <div className="card space-y-5">
          <div className="border-b border-slate-200 dark:border-[#2A3042] pb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck size={16} className="text-purple-600" />
              Authorized Signatory & Seal
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Appears on the legal signature section at the bottom of generated PDF invoices.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Signatory Full Name</label>
              <input
                type="text"
                className="input text-xs"
                placeholder="Enter signatory full name"
                value={signatoryName}
                onChange={(e) => setSignatoryName(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Designation / Title</label>
              <input
                type="text"
                className="input text-xs"
                placeholder="Enter designation / title"
                value={signatoryDesignation}
                onChange={(e) => setSignatoryDesignation(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* ─── ACTION BUTTONS ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="btn-ghost text-xs px-4"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="btn-primary text-xs px-6 py-2.5 shadow-glow-blue flex items-center gap-2"
          >
            {saving ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Saving Invoicing & Branding Profile...</span>
              </>
            ) : (
              <>
                <ShieldCheck size={16} />
                <span>Save Company Profile & Settings</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
