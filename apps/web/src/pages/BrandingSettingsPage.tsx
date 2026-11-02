import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useBranding } from '../contexts/BrandingContext';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Upload, Trash2, CheckCircle2, AlertCircle, RefreshCw,
  Sparkles, Phone, ArrowLeft, Image as ImageIcon, ShieldCheck, Stamp
} from 'lucide-react';
import { brandingApi } from '../services/api';
import { FormFeedback, FormFieldError } from '../components/common/FormFeedback';
import CompanyBankAccountsSection from '../components/settings/CompanyBankAccountsSection';

async function resizeImageInBrowser(
  file: File,
  maxWidth = 300,
  maxHeight = 80
): Promise<{ file: File; dataUrl: string; width: number; height: number; sizeBytes: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image in browser'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Could not get canvas context'));
        }

        // Keep PNG transparency intact
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
        const outputMime = isPng ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return reject(new Error('Failed to encode resized image'));
            }
            const resizedFile = new File([blob], file.name, { type: outputMime });
            const dataUrl = canvas.toDataURL(outputMime);
            resolve({
              file: resizedFile,
              dataUrl,
              width,
              height,
              sizeBytes: blob.size,
            });
          },
          outputMime,
          0.92
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function BrandingSettingsPage() {
  const { branding, updateBranding, refreshBranding } = useBranding();
  const { user } = useAuth();
  const navigate = useNavigate();

  const isAdmin =
    user?.role === 'tenant_admin' ||
    user?.role === 'admin' ||
    user?.role === 'platform_super_admin';

  const [companyName, setCompanyName] = useState(branding.companyDisplayName || '');
  const [companyPhone, setCompanyPhone] = useState(branding.companyPhone || '');

  // Document Logo (invoices and quotations)
  const [logoPreview, setLogoPreview] = useState<string | null>(branding.companyLogoUrl || null);
  const [initialLogo, setInitialLogo] = useState<string | null>(branding.companyLogoUrl || null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoResizeInfo, setLogoResizeInfo] = useState<string | null>(null);

  // Company Stamp
  const [stampPreview, setStampPreview] = useState<string | null>(null);
  const [uploadingStamp, setUploadingStamp] = useState(false);

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

  // Signatory
  const [signatoryName, setSignatoryName] = useState('');
  const [signatoryDesignation, setSignatoryDesignation] = useState('');
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [requireTwoFactor, setRequireTwoFactor] = useState(false);

  // Status & Error States
  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [fieldErrors, setFieldErrors] = useState<{
    companyName?: string;
    companyPhone?: string;
    logo?: string;
    stamp?: string;
    email?: string;
    address?: string;
    website?: string;
    gstin?: string;
    pan?: string;
    bankName?: string;
    bankAccountNumber?: string;
    bankIfsc?: string;
  }>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stampFileInputRef = useRef<HTMLInputElement>(null);

  // Load profile independently
  const loadProfile = useCallback(async () => {
    setLoadingProfile(true);
    setLoadError(null);
    try {
      const { data } = await brandingApi.getProfile();
      if (data) {
        setCompanyName(data.name || '');
        setCompanyPhone(data.phone || '');
        setLogoPreview(data.logoUrl || null);
        setInitialLogo(data.logoUrl || null);
        setEmail(data.email || '');
        setAddress(data.address || '');
        setCity(data.city || '');
        setState(data.state || '');
        setPincode(data.pincode || '');
        setWebsite(data.website || '');
        setGstin(data.gstin || '');
        setPan(data.pan || '');
        setInvoicePrefix(data.invoicePrefix || 'INV');
        setLutBondNo(data.lutBondNo || '');
        setLutValidity(data.lutValidity || '');
        setBankName(data.bankName || '');
        setBankAccountNumber(data.bankAccountNumber || '');
        setBankIfsc(data.bankIfsc || '');
        setBankBranch(data.bankBranch || '');
        setBankUpi(data.bankUpi || '');
        setSignatoryName(data.signatoryName || '');
        setSignatoryDesignation(data.signatoryDesignation || '');
        setSignaturePreview(data.signatureUrl || null);
        setStampPreview(data.stampUrl || null);
        if (typeof data.requireTwoFactor === 'boolean') setRequireTwoFactor(data.requireTwoFactor);
      }
    } catch (err: any) {
      // Clear data to prevent showing stale or other company's data
      setCompanyName('');
      setCompanyPhone('');
      setLogoPreview(null);
      setStampPreview(null);
      const msg = err?.response?.data?.message || err?.message || 'Failed to load company profile and GST settings.';
      setLoadError(typeof msg === 'string' ? msg : 'Failed to load company profile.');
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile, user?.tenantId]);

  // Document Logo Handlers
  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFieldErrors((prev) => ({ ...prev, logo: 'The logo must be a PNG, JPEG or WebP image.' }));
      return;
    }

    if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
      setFieldErrors((prev) => ({ ...prev, logo: 'The logo must be a PNG, JPEG or WebP image.' }));
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setFieldErrors((prev) => ({ ...prev, logo: 'The logo is too large. Maximum 2 MB.' }));
      return;
    }

    setFieldErrors((prev) => ({ ...prev, logo: undefined }));
    setUploadingLogo(true);
    try {
      const resized = await resizeImageInBrowser(file, 300, 80);
      const kb = (resized.sizeBytes / 1024).toFixed(1);
      setLogoResizeInfo(`Resized: ${resized.width}x${resized.height} px (${kb} KB)`);

      const { data } = await brandingApi.uploadLogo(resized.file);
      const bustedUrl = data?.logoUrl ? `${data.logoUrl}?t=${Date.now()}` : null;
      await updateBranding({ companyLogoUrl: bustedUrl });
      if (bustedUrl) {
        setLogoPreview(bustedUrl);
        setInitialLogo(bustedUrl);
      }
      setSuccessMessage('Document Logo updated successfully! Used on invoices, quotations, and document PDFs.');
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to upload document logo.';
      setFieldErrors((prev) => ({
        ...prev,
        logo: typeof msg === 'string' ? msg : 'The logo must be a PNG, JPEG or WebP image.',
      }));
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


  // Stamp Handlers
  const handleStampFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFieldErrors((prev) => ({ ...prev, stamp: 'The stamp must be a PNG, JPEG or WebP image.' }));
      return;
    }

    if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
      setFieldErrors((prev) => ({ ...prev, stamp: 'The stamp must be a PNG, JPEG or WebP image.' }));
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setFieldErrors((prev) => ({ ...prev, stamp: 'The stamp is too large. Maximum 2 MB.' }));
      return;
    }

    setFieldErrors((prev) => ({ ...prev, stamp: undefined }));
    setUploadingStamp(true);
    try {
      const resized = await resizeImageInBrowser(file, 200, 200);
      const { data } = await brandingApi.uploadStamp(resized.file);
      const bustedUrl = data?.stampUrl ? `${data.stampUrl}?t=${Date.now()}` : null;
      if (bustedUrl) setStampPreview(bustedUrl);
      setSuccessMessage('Company stamp uploaded successfully! Applied to invoices and signatory signatures.');
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to upload stamp.';
      setFieldErrors((prev) => ({
        ...prev,
        stamp: typeof msg === 'string' ? msg : 'The stamp must be a PNG, JPEG or WebP image.',
      }));
    } finally {
      setUploadingStamp(false);
      if (stampFileInputRef.current) {
        stampFileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveStamp = async () => {
    setUploadingStamp(true);
    try {
      await brandingApi.deleteStamp();
      setStampPreview(null);
      setSuccessMessage('Company stamp removed.');
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.message || 'Failed to remove company stamp.');
    } finally {
      setUploadingStamp(false);
      if (stampFileInputRef.current) {
        stampFileInputRef.current.value = '';
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
      setFieldErrors((prev) => ({ ...prev, companyName: 'Company Name is required.' }));
      setErrorMessage('Please fix the highlighted field errors before saving.');
      return;
    }

    setSaving(true);
    setSuccessMessage('');
    setErrorMessage('');
    setFieldErrors({});

    const logoChanged = logoPreview !== initialLogo;

    const brandingPayload: any = {
      companyDisplayName: companyName.trim(),
      companyPhone: companyPhone.trim(),
    };
    if (logoChanged) {
      brandingPayload.companyLogoUrl = logoPreview || '';
    }

    const profilePayload: any = {
      name: companyName.trim(),
      phone: companyPhone.trim() || undefined,
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
    };
    if (logoChanged) {
      profilePayload.logoUrl = logoPreview || undefined;
    }

    try {
      await updateBranding(brandingPayload);
      await brandingApi.updateProfile(profilePayload);

      setSuccessMessage('Company details and branding updated successfully!');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err: any) {
      const rawMsg = err?.response?.data?.message;
      if (Array.isArray(rawMsg)) {
        const errMap: Record<string, string> = {};
        for (const m of rawMsg) {
          if (/companyLogoUrl|logo/i.test(m)) errMap.logo = m;
          else if (/stamp/i.test(m)) errMap.stamp = m;
          else if (/name/i.test(m)) errMap.companyName = m;
          else if (/phone/i.test(m)) errMap.companyPhone = m;
          else if (/website/i.test(m)) errMap.website = m;
          else if (/gstin/i.test(m)) errMap.gstin = m;
          else if (/pan/i.test(m)) errMap.pan = m;
          else if (/bankName/i.test(m)) errMap.bankName = m;
          else if (/bankAccountNumber/i.test(m)) errMap.bankAccountNumber = m;
          else if (/bankIfsc/i.test(m)) errMap.bankIfsc = m;
        }
        setFieldErrors(errMap);
      } else if (typeof rawMsg === 'string') {
        if (/logo/i.test(rawMsg)) {
          setFieldErrors({ logo: rawMsg });
        } else if (/stamp/i.test(rawMsg)) {
          setFieldErrors({ stamp: rawMsg });
        } else {
          setErrorMessage(rawMsg);
        }
      } else {
        setErrorMessage('Failed to update company settings.');
      }
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
              <h1 className="text-2xl font-black text-slate-950 dark:text-white">Company Branding & GST Settings</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Manage your document logo, portal header logo, GST credentials, and banking details.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            refreshBranding();
            loadProfile();
          }}
          disabled={loadingProfile}
          className="btn-secondary text-xs flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
          title="Reload Branding from Server"
        >
          <RefreshCw size={13} className={loadingProfile ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* ─── LOAD ERROR & RETRY BANNER ───────────────────────────────────── */}
      {loadError && (
        <div data-testid="load-error-banner" className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/80 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300 flex items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <AlertCircle size={20} className="text-rose-500 shrink-0" />
            <div>
              <p className="text-xs font-bold">Failed to load company settings</p>
              <p className="text-[11px] opacity-90">{loadError}</p>
            </div>
          </div>
          <button
            type="button"
            data-testid="retry-load-button"
            onClick={loadProfile}
            className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <RefreshCw size={12} />
            Retry
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate autoComplete="off" data-lpignore="true" className="space-y-6">
        {/* ─── GENERAL ORGANIZATION IDENTITY ──────────────────────────────── */}
        <div className="card space-y-5">
          <div className="border-b border-slate-200 dark:border-[#2A3042] pb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles size={16} className="text-crm-blue" />
              General Organization Identity
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              These details configure your company display name and contact hotline across the system.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="branding-company-name" className="label">
                Company Display Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  name="brandingCompanyName"
                  id="branding-company-name"
                  autoComplete="organization"
                  data-testid="input-company-name"
                  className="input text-xs pl-8"
                  placeholder="Enter company display name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                />
                <Building2 size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
              <FormFieldError error={fieldErrors.companyName} id="error-company-name" data-testid="error-company-name" />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Used in the portal header and on invoices/quotations.
              </p>
            </div>

            <div>
              <label htmlFor="branding-telephone" className="label">Official Phone / Hotline</label>
              <div className="relative">
                <input
                  type="tel"
                  name="brandingTelephone"
                  id="branding-telephone"
                  autoComplete="tel"
                  data-testid="input-company-phone"
                  className="input text-xs pl-8 font-mono"
                  placeholder="Enter company phone number"
                  value={companyPhone}
                  onChange={(e) => setCompanyPhone(e.target.value)}
                />
                <Phone size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
              <FormFieldError error={fieldErrors.companyPhone} id="error-company-phone" data-testid="error-company-phone" />
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
              Document Logo (Invoices, Quotations, PDFs)
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Rendered on all customer-facing invoices, quotations, delivery challans, and generated PDFs.
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
                        data-testid="document-logo-preview"
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
                data-testid="input-file-document-logo"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleLogoFileChange}
                className="hidden"
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="btn-upload-document-logo"
                  disabled={uploadingLogo}
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Upload size={14} className={uploadingLogo ? 'animate-spin' : ''} />
                  {uploadingLogo ? 'Uploading...' : 'Upload Document Logo'}
                </button>

                {logoPreview && (
                  <button
                    type="button"
                    onClick={handleResetToDefaultLogo}
                    disabled={uploadingLogo}
                    className="btn-secondary text-xs flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-rose-600 cursor-pointer"
                    title="Remove custom document logo"
                  >
                    <Trash2 size={13} /> Reset
                  </button>
                )}
              </div>

              {fieldErrors.logo && (
                <p data-testid="error-logo" className="text-rose-500 text-[11px] font-semibold mt-1">
                  {fieldErrors.logo}
                </p>
              )}

              {logoResizeInfo && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">
                  {logoResizeInfo}
                </p>
              )}

              <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
                <p>• Allowed formats: <strong>PNG, JPEG, WebP</strong> (Max 2 MB).</p>
                <p>• Used strictly for invoices, delivery challans, and customer quotations.</p>
              </div>
            </div>
          </div>
        </div>


        {/* ─── CARD 3: OFFICIAL STAMP & SIGNATORY ──────────────────────────── */}
        <div className="card space-y-5">
          <div className="border-b border-slate-200 dark:border-[#2A3042] pb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Stamp size={16} className="text-purple-600" />
              Company Stamp & Signatory Details
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Official stamp and representative details placed in the document footer.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            {/* Stamp Preview */}
            <div className="md:col-span-6 flex flex-col p-4 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#1E2230]/60 text-left shadow-xs">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center justify-between">
                <span>Official Stamp Preview</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">STAMP</span>
              </div>

              <div className="h-24 p-2 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-center">
                {stampPreview ? (
                  <img
                    src={stampPreview}
                    alt="Official Stamp Preview"
                    data-testid="stamp-preview"
                    className="max-h-20 max-w-[120px] object-contain"
                    onError={() => setStampPreview(null)}
                  />
                ) : (
                  <p className="text-xs text-slate-400 italic">No official company stamp uploaded</p>
                )}
              </div>
            </div>

            {/* Stamp Controls */}
            <div className="md:col-span-6 space-y-3">
              <input
                ref={stampFileInputRef}
                type="file"
                data-testid="input-file-stamp"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleStampFileChange}
                className="hidden"
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="btn-upload-stamp"
                  disabled={uploadingStamp}
                  onClick={() => stampFileInputRef.current?.click()}
                  className="btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Upload size={14} className={uploadingStamp ? 'animate-spin' : ''} />
                  {uploadingStamp ? 'Uploading...' : 'Upload Official Stamp'}
                </button>

                {stampPreview && (
                  <button
                    type="button"
                    data-testid="btn-remove-stamp"
                    onClick={handleRemoveStamp}
                    disabled={uploadingStamp}
                    className="btn-secondary text-xs flex items-center gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                  >
                    <Trash2 size={13} /> Remove
                  </button>
                )}
              </div>

              {fieldErrors.stamp && (
                <p data-testid="error-stamp" className="text-rose-500 text-[11px] font-semibold mt-1">
                  {fieldErrors.stamp}
                </p>
              )}

              <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
                <p>• Applied to the authorized signatory section on official tax invoices.</p>
                <p>• Max file size: <strong>2 MB</strong>.</p>
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
                name="brandingStreetAddress"
                id="branding-street-address"
                autoComplete="street-address"
                data-testid="input-address"
                className="input text-xs"
                placeholder="Enter registered business address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
              <FormFieldError error={fieldErrors.address} id="error-address" data-testid="error-address" />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label htmlFor="branding-address-city" className="label">City</label>
                <input
                  type="text"
                  name="brandingAddressCity"
                  id="branding-address-city"
                  autoComplete="address-level2"
                  data-testid="input-city"
                  className="input text-xs"
                  placeholder="Enter city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="branding-address-state" className="label">State</label>
                <input
                  type="text"
                  name="brandingAddressState"
                  id="branding-address-state"
                  autoComplete="address-level1"
                  data-testid="input-state"
                  className="input text-xs"
                  placeholder="Enter state"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="branding-postal-code" className="label">Pincode</label>
                <input
                  type="text"
                  name="brandingPostalCode"
                  id="branding-postal-code"
                  autoComplete="postal-code"
                  data-testid="input-pincode"
                  className="input text-xs font-mono"
                  placeholder="Pincode"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="branding-billing-email" className="label">Official Billing Email</label>
              <input
                type="email"
                name="brandingBillingEmail"
                id="branding-billing-email"
                autoComplete="email"
                data-testid="input-email"
                className="input text-xs"
                placeholder="billing@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <FormFieldError error={fieldErrors.email} id="error-email" data-testid="error-email" />
            </div>

            <div>
              <label className="label">Website / Portal URL</label>
              <input
                type="url"
                name="companyWebsite"
                id="company-website"
                autoComplete="url"
                data-testid="input-website"
                className="input text-xs"
                placeholder="https://example.com"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
              {fieldErrors.website && (
                <p data-testid="error-website" className="text-rose-500 text-[11px] font-semibold mt-1">
                  {fieldErrors.website}
                </p>
              )}
            </div>

            <div>
              <label className="label">Company GSTIN</label>
              <input
                type="text"
                name="companyGstin"
                id="company-gstin"
                autoComplete="off"
                data-testid="input-gstin"
                className="input text-xs font-mono uppercase"
                placeholder="29AAAAA0000A1Z5"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
              />
              {fieldErrors.gstin && (
                <p data-testid="error-gstin" className="text-rose-500 text-[11px] font-semibold mt-1">
                  {fieldErrors.gstin}
                </p>
              )}
            </div>

            <div>
              <label className="label">Company PAN</label>
              <input
                type="text"
                name="companyPan"
                id="company-pan"
                autoComplete="off"
                data-testid="input-pan"
                className="input text-xs font-mono uppercase"
                placeholder="AAAAA0000A"
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase())}
              />
              {fieldErrors.pan && (
                <p data-testid="error-pan" className="text-rose-500 text-[11px] font-semibold mt-1">
                  {fieldErrors.pan}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ─── COMPANY BANK ACCOUNTS (MULTI-ACCOUNT MANAGEMENT) ──────────── */}
        <CompanyBankAccountsSection />

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
                name="companyInvoicePrefix"
                id="company-invoice-prefix"
                autoComplete="off"
                data-testid="input-invoice-prefix"
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
                name="companyBankName"
                id="company-bank-name"
                autoComplete="off"
                data-testid="input-bank-name"
                className="input text-xs"
                placeholder="e.g. Test Bank Ltd."
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              />
              {fieldErrors.bankName && (
                <p data-testid="error-bank-name" className="text-rose-500 text-[11px] font-semibold mt-1">
                  {fieldErrors.bankName}
                </p>
              )}
            </div>

            <div>
              <label className="label">Account Number</label>
              <input
                type="text"
                name="companyBankAccountNumber"
                id="company-bank-account-number"
                autoComplete="off"
                data-testid="input-bank-account-number"
                className="input text-xs font-mono"
                placeholder="Bank account number"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
              />
              {fieldErrors.bankAccountNumber && (
                <p data-testid="error-bank-account-number" className="text-rose-500 text-[11px] font-semibold mt-1">
                  {fieldErrors.bankAccountNumber}
                </p>
              )}
            </div>

            <div>
              <label className="label">IFSC Code</label>
              <input
                type="text"
                name="companyBankIfsc"
                id="company-bank-ifsc"
                autoComplete="off"
                data-testid="input-bank-ifsc"
                className="input text-xs font-mono uppercase"
                placeholder="TEST0001234"
                value={bankIfsc}
                onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
              />
              {fieldErrors.bankIfsc && (
                <p data-testid="error-bank-ifsc" className="text-rose-500 text-[11px] font-semibold mt-1">
                  {fieldErrors.bankIfsc}
                </p>
              )}
            </div>

            <div>
              <label className="label">Branch Name</label>
              <input
                type="text"
                name="companyBankBranch"
                id="company-bank-branch"
                autoComplete="off"
                data-testid="input-bank-branch"
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
                name="companyBankUpi"
                id="company-bank-upi"
                autoComplete="off"
                data-testid="input-bank-upi"
                className="input text-xs font-mono"
                placeholder="company@bank"
                value={bankUpi}
                onChange={(e) => setBankUpi(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* ─── ACTION BUTTONS ──────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-[#2A3042]">
          {/* Bottom In-Place Status Feedback */}
          <div className="flex-1">
            <FormFeedback
              error={errorMessage}
              success={successMessage}
              onDismiss={() => {
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              data-testid="bottom-branding-feedback"
            />
          </div>

          <button
            type="submit"
            data-testid="btn-save-branding"
            disabled={saving}
            className="btn-primary text-xs px-6 py-2.5 shadow-glow-blue disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
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
