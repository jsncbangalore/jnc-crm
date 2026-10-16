import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Check, Image as ImageIcon, Trash2, ShieldCheck, AlertCircle } from 'lucide-react';
import { invoicesApi } from '../../services/api';
import { SignatorySettings } from '../../types';
import { BRAND_CONFIG } from '../../config/brand';

interface InvoiceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (settings: SignatorySettings) => void;
}

export default function InvoiceSettingsModal({ isOpen, onClose, onSaved }: InvoiceSettingsModalProps) {
  const [settings, setSettings] = useState<SignatorySettings>({
    companyName: '',
    signatoryName: '',
    signatoryDesignation: '',
    signatureImage: null,
    stampImage: null,
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const signatureInputRef = useRef<HTMLInputElement>(null);
  const stampInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
    }
  }, [isOpen]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data } = await invoicesApi.getSignatorySettings();
      if (data) {
        setSettings({
          companyName: data.companyName || BRAND_CONFIG.displayName || 'JNC Network & Power Solutions',
          signatoryName: data.signatoryName || '',
          signatoryDesignation: data.signatoryDesignation || '',
          signatureImage: data.signatureImage || null,
          stampImage: data.stampImage || null,
        });
      }
    } catch (err: any) {
      console.error('Failed to load signatory settings', err);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'signatureImage' | 'stampImage'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (< 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('Image size must be under 2MB. Please upload a compressed PNG or JPG.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const base64 = evt.target?.result as string;
      setSettings((prev) => ({ ...prev, [field]: base64 }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!settings.companyName?.trim()) {
      alert('Please provide your Company / Business name');
      return;
    }

    if (!settings.signatoryName.trim()) {
      alert('Please provide a signatory name');
      return;
    }

    try {
      setSaving(true);
      const { data } = await invoicesApi.updateSignatorySettings(settings);
      setSaveSuccess(true);
      if (onSaved) onSaved(data);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 1200);
    } catch (err: any) {
      alert('Failed to save settings: ' + (err?.response?.data?.message || err.message));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          className="card w-full max-w-2xl border-slate-200 dark:border-[#2A3042] shadow-2xl p-6 bg-white dark:bg-[#181B26] overflow-y-auto max-h-[90vh]"
        >
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-[#2A3042] mb-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-crm-teal/20 text-crm-teal flex items-center justify-center">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-950 dark:text-white">Invoice Signatory & Stamp Settings</h2>
                <p className="text-xs text-slate-400">
                  Configure the authorized visual signature and company seal for GST Tax Invoices
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-5 text-xs">
            {/* Note banner */}
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-slate-800 dark:text-slate-300 flex items-start gap-2.5">
              <AlertCircle size={15} className="text-crm-blue mt-0.5 flex-shrink-0" />
              <p className="text-[11px] leading-relaxed font-medium">
                These settings are saved permanently and applied automatically to all generated invoices. If left blank, invoices will render with standard spacing without blocking generation.
              </p>
            </div>

            {/* Company / Business Trade Name */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042] space-y-1.5">
              <label className="label font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
                <span>Company / Business Trade Name *</span>
                <span className="text-[10px] font-normal text-slate-500">Appears as &quot;For &lt;Company Name&gt;&quot;, in header & declarations</span>
              </label>
              <input
                className="input text-xs font-semibold"
                placeholder="e.g. JNC Network & Power Solutions"
                value={settings.companyName || ''}
                onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
              />
              <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                Updating this name automatically sets the company title across all invoice types, signatory blocks, and delivery declarations.
              </p>
            </div>

            {/* Text Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Signatory Name *</label>
                <input
                  className="input text-xs"
                  placeholder="e.g. Authorized Signatory or Signatory Name"
                  value={settings.signatoryName}
                  onChange={(e) => setSettings({ ...settings, signatoryName: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Designation / Role *</label>
                <input
                  className="input text-xs"
                  placeholder="e.g. Proprietor / Director"
                  value={settings.signatoryDesignation}
                  onChange={(e) => setSettings({ ...settings, signatoryDesignation: e.target.value })}
                />
              </div>
            </div>

            {/* Upload Area for Signature & Stamp */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              {/* 1. Signature Upload */}
              <div className="space-y-2">
                <label className="label">Authorized Signature Image</label>
                <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-[#2A3042] bg-slate-50 dark:bg-[#141722] flex flex-col items-center justify-center min-h-[140px] text-center">
                  {settings.signatureImage ? (
                    <div className="relative group">
                      <img
                        src={settings.signatureImage}
                        alt="Signature"
                        className="max-h-20 object-contain filter invert-0 dark:brightness-110"
                      />
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, signatureImage: null })}
                        className="absolute -top-2 -right-2 p-1 rounded-full bg-red-500 text-white shadow hover:bg-red-600"
                        title="Remove signature"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <ImageIcon size={28} className="text-slate-400 dark:text-slate-500 mx-auto" />
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">PNG / JPG (Transparent recommended)</p>
                      <p className="text-[10px] text-slate-500">Max size 2MB</p>
                    </div>
                  )}

                  <input
                    ref={signatureInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    onChange={(e) => handleImageUpload(e, 'signatureImage')}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => signatureInputRef.current?.click()}
                    className="mt-3 btn bg-white dark:bg-[#1E2230] border border-slate-300 dark:border-[#2A3042] hover:border-crm-blue text-slate-800 dark:text-white text-[11px] py-1 px-3 shadow-sm font-bold"
                  >
                    <Upload size={12} /> {settings.signatureImage ? 'Change Signature' : 'Upload Signature'}
                  </button>
                </div>
              </div>

              {/* 2. Company Stamp Upload */}
              <div className="space-y-2">
                <label className="label">Company Seal / Stamp Image</label>
                <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-[#2A3042] bg-slate-50 dark:bg-[#141722] flex flex-col items-center justify-center min-h-[140px] text-center">
                  {settings.stampImage ? (
                    <div className="relative group">
                      <img
                        src={settings.stampImage}
                        alt="Company Stamp"
                        className="max-h-20 object-contain filter invert-0"
                      />
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, stampImage: null })}
                        className="absolute -top-2 -right-2 p-1 rounded-full bg-red-500 text-white shadow hover:bg-red-600"
                        title="Remove stamp"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <ImageIcon size={28} className="text-slate-400 dark:text-slate-500 mx-auto" />
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">Round/Oval Seal (PNG Transparent)</p>
                      <p className="text-[10px] text-slate-500">Max size 2MB</p>
                    </div>
                  )}

                  <input
                    ref={stampInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    onChange={(e) => handleImageUpload(e, 'stampImage')}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => stampInputRef.current?.click()}
                    className="mt-3 btn bg-white dark:bg-[#1E2230] border border-slate-300 dark:border-[#2A3042] hover:border-crm-blue text-slate-800 dark:text-white text-[11px] py-1 px-3 shadow-sm font-bold"
                  >
                    <Upload size={12} /> {settings.stampImage ? 'Change Stamp' : 'Upload Stamp'}
                  </button>
                </div>
              </div>
            </div>

            {/* Live Invoice Preview Box */}
            <div className="p-4 rounded-xl bg-white text-black border border-gray-300 space-y-2">
              <span className="text-[10.5px] uppercase font-bold text-gray-500 tracking-wider block">
                Live Bottom-Right Invoice Preview:
              </span>
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 flex justify-end">
                <div className="text-right w-64 space-y-1">
                  <p className="text-xs font-bold text-gray-800">
                    For {settings.companyName || BRAND_CONFIG.displayName || 'JNC Network & Power Solutions'}
                  </p>
                  
                  {/* Signature & Stamp overlapping area */}
                  <div className="relative my-2 min-h-[60px] flex items-center justify-end">
                    {settings.stampImage && (
                      <img
                        src={settings.stampImage}
                        alt="Stamp Preview"
                        className="w-16 h-16 object-contain opacity-85 absolute right-16 top-0"
                      />
                    )}
                    {settings.signatureImage ? (
                      <img
                        src={settings.signatureImage}
                        alt="Signature Preview"
                        className="max-h-12 object-contain relative z-10"
                      />
                    ) : (
                      <span className="text-xs text-gray-400 italic block py-4">
                        (Space for physical / uploaded signature)
                      </span>
                    )}
                  </div>

                  <div className="border-t border-gray-400 pt-1">
                    <p className="text-xs font-bold text-gray-900">{settings.signatoryName || 'Authorized Signatory'}</p>
                    <p className="text-[10px] text-gray-600">{settings.signatoryDesignation || 'Authorized Signatory'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Save Buttons */}
            <div className="flex justify-end items-center gap-2 pt-3 border-t border-slate-200 dark:border-[#2A3042]">
              <button
                type="button"
                onClick={onClose}
                className="btn-ghost text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="btn-primary text-xs px-5 shadow-glow-blue flex items-center gap-1.5"
              >
                {saveSuccess ? (
                  <>
                    <Check size={14} className="text-emerald-300" /> Saved Successfully!
                  </>
                ) : saving ? (
                  'Saving...'
                ) : (
                  'Save Signatory Settings'
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
