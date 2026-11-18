import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useBranding } from '../contexts/BrandingContext';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, AlertCircle, RefreshCw, ArrowLeft, AlertTriangle, CheckCircle2
} from 'lucide-react';
import { brandingApi, resolveFileUrl } from '../services/api';
import { FormFeedback } from '../components/common/FormFeedback';
import { normalizeHttpsUrl, isValidHttpsUrl } from '@crm/shared-validation';
import { validatePan, validateGstin } from '../utils/taxValidation';
import {
  compressLogoImage,
  compressSignatoryImage,
  dataUrlToFile,
} from '../utils/imageCompression';

import CompanyIdentitySection from '../components/settings/branding/CompanyIdentitySection';
import DocumentLogoSection from '../components/settings/branding/DocumentLogoSection';
import StampSignatorySection from '../components/settings/branding/StampSignatorySection';
import TaxProfileSection from '../components/settings/branding/TaxProfileSection';
import InvoiceSequencesSection from '../components/settings/branding/InvoiceSequencesSection';
import CompanyBankAccountsSection from '../components/settings/CompanyBankAccountsSection';

const FIELD_LABELS: Record<string, string> = {
  companyName: 'Company Name',
  companyPhone: 'Phone',
  logo: 'Document Logo',
  stamp: 'Official Stamp',
  address: 'Address',
  city: 'City',
  state: 'State',
  pincode: 'Pincode',
  email: 'Billing Email',
  website: 'Website',
  gstin: 'GSTIN',
  pan: 'PAN',
  invoicePrefix: 'Invoice Prefix',
  signatoryName: 'Signatory Name',
  signatoryDesignation: 'Signatory Designation',
};

export default function BrandingSettingsPage() {
  const { branding, updateBranding, refreshBranding } = useBranding();
  const { user } = useAuth();
  const navigate = useNavigate();

  const isAdmin =
    user?.role === 'tenant_admin' ||
    user?.role === 'admin' ||
    user?.role === 'platform_super_admin';

  // Form State
  const [companyName, setCompanyName] = useState(branding.companyDisplayName || '');
  const [companyPhone, setCompanyPhone] = useState(branding.companyPhone || '');

  // Document Logo
  const [logoPreview, setLogoPreview] = useState<string | null>(branding.companyLogoUrl || null);
  const [initialLogo, setInitialLogo] = useState<string | null>(branding.companyLogoUrl || null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoResizeInfo, setLogoResizeInfo] = useState<string | null>(null);

  // Company Stamp
  const [stampPreview, setStampPreview] = useState<string | null>(null);
  const [initialStamp, setInitialStamp] = useState<string | null>(null);
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
  const [autoAllocateAdvance, setAutoAllocateAdvance] = useState(true);

  // Signatory
  const [signatoryName, setSignatoryName] = useState('');
  const [signatoryDesignation, setSignatoryDesignation] = useState('');
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [requireTwoFactor, setRequireTwoFactor] = useState(false);

  // Status & Error States
  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Confirmation modal state for intentionally cleared fields
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [clearedFieldNames, setClearedFieldNames] = useState<string[]>([]);

  // Snapshot of initially loaded profile to prevent silent data loss and identify cleared fields
  const initialProfileRef = useRef<Record<string, string>>({});

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Input Refs for scrolling & focusing first invalid field
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stampFileInputRef = useRef<HTMLInputElement>(null);
  const companyNameInputRef = useRef<HTMLInputElement>(null);
  const companyPhoneInputRef = useRef<HTMLInputElement>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const cityInputRef = useRef<HTMLInputElement>(null);
  const stateInputRef = useRef<HTMLInputElement>(null);
  const pincodeInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const websiteInputRef = useRef<HTMLInputElement>(null);
  const gstinInputRef = useRef<HTMLInputElement>(null);
  const panInputRef = useRef<HTMLInputElement>(null);
  const invoicePrefixInputRef = useRef<HTMLInputElement>(null);
  const signatoryNameInputRef = useRef<HTMLInputElement>(null);
  const signatoryDesignationInputRef = useRef<HTMLInputElement>(null);

  const inputRefs: Record<string, React.RefObject<HTMLInputElement | null>> = {
    companyName: companyNameInputRef,
    companyPhone: companyPhoneInputRef,
    address: addressInputRef,
    city: cityInputRef,
    state: stateInputRef,
    pincode: pincodeInputRef,
    email: emailInputRef,
    website: websiteInputRef,
    gstin: gstinInputRef,
    pan: panInputRef,
    invoicePrefix: invoicePrefixInputRef,
    signatoryName: signatoryNameInputRef,
    signatoryDesignation: signatoryDesignationInputRef,
  };

  const focusFirstErrorField = (errs: Record<string, string>) => {
    const fieldOrder = [
      'companyName',
      'companyPhone',
      'logo',
      'stamp',
      'address',
      'city',
      'state',
      'pincode',
      'email',
      'website',
      'gstin',
      'pan',
      'invoicePrefix',
      'signatoryName',
      'signatoryDesignation',
    ];
    for (const f of fieldOrder) {
      if (errs[f] && inputRefs[f]?.current) {
        inputRefs[f].current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        inputRefs[f].current?.focus();
        break;
      }
    }
  };

  // Helper for dynamic input error classes
  const getInputClass = (fieldName: string, extraClasses = '') => {
    const hasError = Boolean(fieldErrors[fieldName]);
    return `input text-xs ${
      hasError
        ? 'border-rose-500 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-rose-900 dark:text-rose-100 bg-rose-50/20 dark:bg-rose-950/20'
        : ''
    } ${extraClasses}`.trim();
  };

  // Helper for dynamic error banner text
  const getDynamicErrorBanner = (errs: Record<string, string>, fallback?: string) => {
    const keys = Object.keys(errs).filter((k) => Boolean(errs[k]));
    if (keys.length > 0) {
      const names = keys.map((k) => FIELD_LABELS[k] || k).join(', ');
      return `Fix: ${names}`;
    }
    return fallback || 'Failed to update company settings.';
  };

  // Check dirty state to warn before leaving
  const isDirty =
    initialLoaded &&
    (companyName !== (initialProfileRef.current.companyName || '') ||
      companyPhone !== (initialProfileRef.current.companyPhone || '') ||
      email !== (initialProfileRef.current.email || '') ||
      address !== (initialProfileRef.current.address || '') ||
      city !== (initialProfileRef.current.city || '') ||
      state !== (initialProfileRef.current.state || '') ||
      pincode !== (initialProfileRef.current.pincode || '') ||
      website !== (initialProfileRef.current.website || '') ||
      gstin !== (initialProfileRef.current.gstin || '') ||
      pan !== (initialProfileRef.current.pan || '') ||
      invoicePrefix !== (initialProfileRef.current.invoicePrefix || 'INV') ||
      signatoryName !== (initialProfileRef.current.signatoryName || '') ||
      signatoryDesignation !== (initialProfileRef.current.signatoryDesignation || '') ||
      logoPreview !== initialLogo ||
      stampPreview !== initialStamp);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && !saving) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, saving]);

  // Load profile from API on mount
  const loadProfile = useCallback(async () => {
    setLoadingProfile(true);
    setLoadError(null);
    try {
      const { data } = await brandingApi.getProfile();
      if (data) {
        setCompanyName(data.name || '');
        setCompanyPhone(data.phone || '');
        const isProdLogo = typeof data.logoUrl === 'string' && (data.logoUrl === '/logo.png' || data.logoUrl === 'logo.png' || data.logoUrl.endsWith('/logo.png'));
        const safeLogo = isProdLogo ? null : (data.logoUrl || null);
        const resolvedLogo = safeLogo ? resolveFileUrl(safeLogo) : null;
        setLogoPreview(resolvedLogo);
        setInitialLogo(resolvedLogo);
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
        if (typeof data.autoAllocateAdvance === 'boolean') {
          setAutoAllocateAdvance(data.autoAllocateAdvance);
        }
        setSignatoryName(data.signatoryName || '');
        setSignatoryDesignation(data.signatoryDesignation || '');
        setSignaturePreview(data.signatureUrl || null);
        setStampPreview(data.stampUrl || null);
        setInitialStamp(data.stampUrl || null);
        if (typeof data.requireTwoFactor === 'boolean') setRequireTwoFactor(data.requireTwoFactor);

        initialProfileRef.current = {
          companyName: (data.name || '').trim(),
          companyPhone: (data.phone || '').trim(),
          email: (data.email || '').trim(),
          address: (data.address || '').trim(),
          city: (data.city || '').trim(),
          state: (data.state || '').trim(),
          pincode: (data.pincode || '').trim(),
          website: (data.website || '').trim(),
          gstin: (data.gstin || '').trim(),
          pan: (data.pan || '').trim(),
          invoicePrefix: (data.invoicePrefix || 'INV').trim(),
          signatoryName: (data.signatoryName || '').trim(),
          signatoryDesignation: (data.signatoryDesignation || '').trim(),
        };
        setInitialLoaded(true);
      }
    } catch (err: any) {
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

    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.logo;
      return next;
    });
    setUploadingLogo(true);
    try {
      const dataUrl = await compressLogoImage(file);
      const compressedFile = dataUrlToFile(dataUrl, file.name);
      const kb = (compressedFile.size / 1024).toFixed(1);
      setLogoResizeInfo(`Compressed: ${kb} KB`);

      const { data } = await brandingApi.uploadLogo(compressedFile);
      const rawUrl = data?.logoUrl;
      const resolved = rawUrl ? resolveFileUrl(rawUrl) : null;
      const bustedUrl = resolved ? `${resolved}${resolved.includes('?') ? '&' : '?'}t=${Date.now()}` : null;
      await updateBranding({ companyLogoUrl: bustedUrl });
      if (bustedUrl) {
        setLogoPreview(bustedUrl);
        setInitialLogo(bustedUrl);
      }
      setSuccessMessage('Document Logo updated successfully! Used on invoices, quotations, and document PDFs.');
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err.message || 'Failed to upload document logo.';
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

  const handleResetToDefaultLogo = async () => {
    try {
      setUploadingLogo(true);
      await updateBranding({ companyLogoUrl: null });
      await brandingApi.updateProfile({ logoUrl: null });
      setLogoPreview(null);
      setInitialLogo(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setSuccessMessage('Document logo removed. Plain company name text will appear on all documents.');
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err: any) {
      setFieldErrors((prev) => ({
        ...prev,
        logo: err?.response?.data?.message || err?.message || 'Failed to reset document logo.',
      }));
    } finally {
      setUploadingLogo(false);
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

    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.stamp;
      return next;
    });
    setUploadingStamp(true);
    try {
      const dataUrl = await compressSignatoryImage(file, 'Stamp');
      const compressedFile = dataUrlToFile(dataUrl, file.name);
      const { data } = await brandingApi.uploadStamp(compressedFile);
      const bustedUrl = data?.stampUrl ? `${data.stampUrl}?t=${Date.now()}` : null;
      if (bustedUrl) {
        setStampPreview(bustedUrl);
        setInitialStamp(bustedUrl);
      }
      setSuccessMessage('Company stamp uploaded successfully! Applied to invoices and signatory signatures.');
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err.message || 'Failed to upload stamp.';
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

  // Submit Handler
  const doSave = async (forceProceed = false) => {
    if (!isAdmin) {
      setErrorMessage('Security Policy: Only Administrators can update Company Branding.');
      return;
    }

    const errors: Record<string, string> = {};

    // 1. Company Name validation
    if (!companyName.trim()) {
      errors.companyName = 'Company Name is required.';
    }

    // 2. Website Normalisation & Validation
    let normWebsite = website.trim();
    if (normWebsite) {
      normWebsite = normalizeHttpsUrl(normWebsite);
      setWebsite(normWebsite);

      if (!isValidHttpsUrl(normWebsite)) {
        errors.website = 'Website must be a valid https URL (e.g. https://company.com)';
      }
    }

    // 3. Pincode validation
    if (pincode.trim()) {
      if (!/^\d{6}$/.test(pincode.trim())) {
        errors.pincode = 'Pincode must be exactly 6 digits.';
      }
    }

    // 4. Email validation
    if (email.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        errors.email = 'Please enter a valid billing email address.';
      }
    }

    // 5. PAN & GSTIN validation
    if (pan.trim()) {
      const panRes = validatePan(pan);
      if (!panRes.valid && panRes.error) {
        errors.pan = panRes.error;
      }
    }

    if (gstin.trim()) {
      const gstinRes = validateGstin(gstin, false, pan.trim() || undefined);
      if (!gstinRes.valid && gstinRes.error) {
        errors.gstin = gstinRes.error;
      }
    }

    // Client-side errors found
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setErrorMessage(getDynamicErrorBanner(errors));
      focusFirstErrorField(errors);
      return;
    }

    // 6. Data Loss Prevention: Check if previously populated fields are being cleared
    if (!forceProceed && initialLoaded) {
      const init = initialProfileRef.current;
      const cleared: string[] = [];
      if (init.address && !address.trim()) cleared.push('Address');
      if (init.city && !city.trim()) cleared.push('City');
      if (init.state && !state.trim()) cleared.push('State');
      if (init.pincode && !pincode.trim()) cleared.push('Pincode');
      if (init.email && !email.trim()) cleared.push('Billing Email');
      if (init.website && !normWebsite) cleared.push('Website');
      if (init.gstin && !gstin.trim()) cleared.push('GSTIN');
      if (init.pan && !pan.trim()) cleared.push('PAN');

      if (cleared.length > 0) {
        setClearedFieldNames(cleared);
        setShowClearConfirmModal(true);
        return;
      }
    }

    setSaving(true);
    setSuccessMessage('');
    setErrorMessage('');
    setFieldErrors({});

    const logoChanged = logoPreview !== initialLogo;

    const brandingPayload: any = {
      companyDisplayName: companyName.trim(),
    };
    if (companyPhone.trim()) {
      brandingPayload.companyPhone = companyPhone.trim();
    }
    if (logoChanged) {
      brandingPayload.companyLogoUrl = logoPreview || null;
    }

    const profilePayload: any = {
      name: companyName.trim(),
      phone: companyPhone.trim() || undefined,
      email: email.trim() || (forceProceed && initialProfileRef.current.email ? '' : undefined),
      address: address.trim() || (forceProceed && initialProfileRef.current.address ? '' : undefined),
      city: city.trim() || (forceProceed && initialProfileRef.current.city ? '' : undefined),
      state: state.trim() || (forceProceed && initialProfileRef.current.state ? '' : undefined),
      pincode: pincode.trim() || (forceProceed && initialProfileRef.current.pincode ? '' : undefined),
      website: normWebsite || (forceProceed && initialProfileRef.current.website ? '' : undefined),
      gstin: gstin.trim() || (forceProceed && initialProfileRef.current.gstin ? '' : undefined),
      pan: pan.trim() || (forceProceed && initialProfileRef.current.pan ? '' : undefined),
      invoicePrefix: invoicePrefix.trim() || undefined,
      lutBondNo: lutBondNo.trim() || undefined,
      lutValidity: lutValidity.trim() || undefined,
      autoAllocateAdvance,
      signatoryName: signatoryName.trim() || undefined,
      signatoryDesignation: signatoryDesignation.trim() || undefined,
      signatureUrl: signaturePreview || null,
      stampUrl: stampPreview || null,
      requireTwoFactor,
    };
    if (logoChanged) {
      profilePayload.logoUrl = logoPreview || null;
    }

    try {
      await updateBranding(brandingPayload);
      await brandingApi.updateProfile(profilePayload);

      // Update initial profile snapshot on successful save
      initialProfileRef.current = {
        companyName: companyName.trim(),
        companyPhone: companyPhone.trim(),
        email: email.trim(),
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
        website: normWebsite,
        gstin: gstin.trim(),
        pan: pan.trim(),
        invoicePrefix: invoicePrefix.trim(),
        signatoryName: signatoryName.trim(),
        signatoryDesignation: signatoryDesignation.trim(),
      };

      setSuccessMessage('Company details and branding updated successfully!');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err: any) {
      const data = err?.response?.data;
      const rawMsg = data?.message;
      const serverFieldErrors = data?.fieldErrors;
      const errMap: Record<string, string> = {};

      if (Array.isArray(serverFieldErrors) && serverFieldErrors.length > 0) {
        for (const fe of serverFieldErrors) {
          if (fe.field && fe.message) {
            errMap[fe.field] = fe.message;
          }
        }
      }

      if (Array.isArray(rawMsg)) {
        for (const m of rawMsg) {
          if (/companyLogoUrl|logo/i.test(m)) errMap.logo = m;
          else if (/stamp/i.test(m)) errMap.stamp = m;
          else if (/name/i.test(m)) errMap.companyName = m;
          else if (/phone/i.test(m)) errMap.companyPhone = m;
          else if (/website/i.test(m)) errMap.website = m;
          else if (/gstin/i.test(m)) errMap.gstin = m;
          else if (/pan/i.test(m)) errMap.pan = m;
          else if (/pincode/i.test(m)) errMap.pincode = m;
          else if (/email/i.test(m)) errMap.email = m;
          else if (/address/i.test(m)) errMap.address = m;
          else if (/city/i.test(m)) errMap.city = m;
          else if (/state/i.test(m)) errMap.state = m;
        }
      }

      if (Object.keys(errMap).length > 0) {
        setFieldErrors(errMap);
        setErrorMessage(getDynamicErrorBanner(errMap));
        focusFirstErrorField(errMap);
      } else if (typeof rawMsg === 'string') {
        if (/logo/i.test(rawMsg)) {
          setFieldErrors({ logo: rawMsg });
          setErrorMessage('Fix: Document Logo');
        } else if (/stamp/i.test(rawMsg)) {
          setFieldErrors({ stamp: rawMsg });
          setErrorMessage('Fix: Official Stamp');
        } else if (/website/i.test(rawMsg)) {
          setFieldErrors({ website: rawMsg });
          setErrorMessage('Fix: Website');
          websiteInputRef.current?.focus();
        } else if (/pan/i.test(rawMsg)) {
          setFieldErrors({ pan: rawMsg });
          setErrorMessage('Fix: PAN');
          panInputRef.current?.focus();
        } else if (/gstin/i.test(rawMsg)) {
          setFieldErrors({ gstin: rawMsg });
          setErrorMessage('Fix: GSTIN');
          gstinInputRef.current?.focus();
        } else if (/pincode/i.test(rawMsg)) {
          setFieldErrors({ pincode: rawMsg });
          setErrorMessage('Fix: Pincode');
          pincodeInputRef.current?.focus();
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSave(false);
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
        <button type="button" onClick={() => navigate('/')} className="btn-secondary text-xs inline-flex items-center gap-2 cursor-pointer">
          <ArrowLeft size={14} /> Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* ─── CONFIRMATION MODAL WHEN CLEARING SAVED FIELDS ──────────────── */}
      <AnimatePresence>
        {showClearConfirmModal && (
          <div
            data-testid="confirm-clear-modal"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="card max-w-md w-full p-6 space-y-4 bg-white dark:bg-[#1E2230] border border-slate-200 dark:border-slate-800 shadow-2xl"
            >
              <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
                <div className="p-2.5 rounded-xl bg-amber-500/10">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Confirm Clearing Saved Information
                  </h3>
                  <p className="text-xs text-slate-500">Data Loss Prevention Check</p>
                </div>
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed">
                <p>
                  You are about to clear the following saved details from your company profile:
                </p>
                <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 font-semibold text-slate-800 dark:text-slate-200">
                  {clearedFieldNames.join(', ')}
                </div>
                <p>
                  Clearing these fields may affect the validity of future invoices and tax documents. Are you sure you want to proceed?
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  data-testid="btn-cancel-clear"
                  onClick={() => setShowClearConfirmModal(false)}
                  className="btn-secondary text-xs px-4 py-2 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="btn-confirm-clear"
                  onClick={() => {
                    setShowClearConfirmModal(false);
                    doSave(true);
                  }}
                  className="btn-primary text-xs px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
                >
                  Confirm & Clear Fields
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
        >
          <RefreshCw size={13} className={loadingProfile ? 'animate-spin' : ''} />
          <span>Reload</span>
        </button>
      </div>

      {loadError && (
        <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {loadingProfile ? (
        <div
          data-testid="branding-loading-skeleton"
          className="card space-y-6 animate-pulse py-16 text-center"
        >
          <div className="flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
            <RefreshCw size={26} className="animate-spin text-crm-blue" />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Loading saved company profile and GST details...
            </span>
            <p className="text-xs text-slate-400">Fetching latest profile data to prevent accidental overwrites.</p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          {/* ─── CARD 0: COMPANY NAME & CONTACT ──────────────────────────────── */}
          <CompanyIdentitySection
            companyName={companyName}
            setCompanyName={setCompanyName}
            companyPhone={companyPhone}
            setCompanyPhone={setCompanyPhone}
            fieldErrors={fieldErrors}
            setFieldErrors={setFieldErrors}
            companyNameInputRef={companyNameInputRef}
            getInputClass={getInputClass}
          />

          {/* ─── CARD 1: DOCUMENT LOGO ───────────────────────────────────────── */}
          <DocumentLogoSection
            logoPreview={logoPreview}
            setLogoPreview={setLogoPreview}
            uploadingLogo={uploadingLogo}
            logoResizeInfo={logoResizeInfo}
            fieldErrors={fieldErrors}
            companyName={companyName}
            address={address}
            companyPhone={companyPhone}
            fileInputRef={fileInputRef}
            handleLogoFileChange={handleLogoFileChange}
            handleResetToDefaultLogo={handleResetToDefaultLogo}
          />

          {/* ─── CARD 2: OFFICIAL STAMP & SIGNATORY ──────────────────────────── */}
          <StampSignatorySection
            stampPreview={stampPreview}
            setStampPreview={setStampPreview}
            uploadingStamp={uploadingStamp}
            fieldErrors={fieldErrors}
            setFieldErrors={setFieldErrors}
            signatoryName={signatoryName}
            setSignatoryName={setSignatoryName}
            signatoryDesignation={signatoryDesignation}
            setSignatoryDesignation={setSignatoryDesignation}
            stampFileInputRef={stampFileInputRef}
            signatoryNameInputRef={signatoryNameInputRef}
            signatoryDesignationInputRef={signatoryDesignationInputRef}
            handleStampFileChange={handleStampFileChange}
            handleRemoveStamp={handleRemoveStamp}
            getInputClass={getInputClass}
          />

          {/* ─── CARD 3: INVOICING & REGISTERED TAX PROFILE CARD ─────────────── */}
          <TaxProfileSection
            address={address}
            setAddress={setAddress}
            city={city}
            setCity={setCity}
            state={state}
            setState={setState}
            pincode={pincode}
            setPincode={setPincode}
            email={email}
            setEmail={setEmail}
            website={website}
            setWebsite={setWebsite}
            gstin={gstin}
            setGstin={setGstin}
            pan={pan}
            setPan={setPan}
            fieldErrors={fieldErrors}
            setFieldErrors={setFieldErrors}
            addressInputRef={addressInputRef}
            cityInputRef={cityInputRef}
            stateInputRef={stateInputRef}
            pincodeInputRef={pincodeInputRef}
            emailInputRef={emailInputRef}
            websiteInputRef={websiteInputRef}
            gstinInputRef={gstinInputRef}
            panInputRef={panInputRef}
            getInputClass={getInputClass}
          />

          {/* ─── CARD 4: INVOICE SEQUENCES & SETTLEMENT INFO ────────────────── */}
          <InvoiceSequencesSection
            invoicePrefix={invoicePrefix}
            setInvoicePrefix={setInvoicePrefix}
            lutBondNo={lutBondNo}
            setLutBondNo={setLutBondNo}
            lutValidity={lutValidity}
            setLutValidity={setLutValidity}
            autoAllocateAdvance={autoAllocateAdvance}
            setAutoAllocateAdvance={setAutoAllocateAdvance}
            fieldErrors={fieldErrors}
            setFieldErrors={setFieldErrors}
            invoicePrefixInputRef={invoicePrefixInputRef}
            getInputClass={getInputClass}
          />

          {/* ─── CARD 5: CANONICAL COMPANY BANK ACCOUNTS ─────────────────────── */}
          <CompanyBankAccountsSection />

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
      )}
    </div>
  );
}
