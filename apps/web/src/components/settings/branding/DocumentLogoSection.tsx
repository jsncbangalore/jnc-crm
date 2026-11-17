import React from 'react';
import { Upload, Trash2, Image as ImageIcon } from 'lucide-react';

interface DocumentLogoSectionProps {
  logoPreview: string | null;
  setLogoPreview: (val: string | null) => void;
  uploadingLogo: boolean;
  logoResizeInfo: string | null;
  fieldErrors: Record<string, string>;
  companyName: string;
  address: string;
  companyPhone: string;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleLogoFileChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleResetToDefaultLogo: () => Promise<void>;
}

export default function DocumentLogoSection({
  logoPreview,
  setLogoPreview,
  uploadingLogo,
  logoResizeInfo,
  fieldErrors,
  companyName,
  address,
  companyPhone,
  fileInputRef,
  handleLogoFileChange,
  handleResetToDefaultLogo,
}: DocumentLogoSectionProps) {
  return (
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

          {/* White Document Paper Sheet for High Contrast Preview in Light & Dark mode */}
          <div data-testid="document-logo-preview-sheet" className="p-4 rounded-lg border border-slate-200 bg-white text-slate-900 shadow-sm flex items-start justify-between gap-4">
            <div className="space-y-1.5 max-w-[65%]">
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
                  <div className="text-xs font-bold text-slate-900 leading-tight">
                    {companyName || 'Company Display Name'}
                  </div>
                )}
              </div>
              {!logoPreview && (
                <p className="text-[9.5px] text-slate-500 italic leading-tight">
                  Upload your company logo to display it on invoices and quotes
                </p>
              )}
              <div className="text-[10px] text-slate-600 leading-tight">
                <p className="font-semibold text-slate-900">{companyName || 'Company Display Name'}</p>
                <p>{address ? address.slice(0, 30) + '...' : 'Address / City / GSTIN'}</p>
                <p className="font-sans tabular-nums">{companyPhone || '+91 ••••• •••••'}</p>
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="text-xs font-black uppercase text-slate-900">TAX INVOICE</div>
              <div className="text-[9px] font-sans tabular-nums text-slate-600 mt-1">INV-2026-0001</div>
              <div className="text-[9px] font-sans tabular-nums text-slate-500">Date: 26/10/2026</div>
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
  );
}
