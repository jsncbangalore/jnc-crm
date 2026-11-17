import React from 'react';
import { Upload, Trash2, Stamp } from 'lucide-react';
import { FormFieldError } from '../../common/FormFeedback';

interface StampSignatorySectionProps {
  stampPreview: string | null;
  setStampPreview: (val: string | null) => void;
  uploadingStamp: boolean;
  fieldErrors: Record<string, string>;
  setFieldErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  signatoryName: string;
  setSignatoryName: (val: string) => void;
  signatoryDesignation: string;
  setSignatoryDesignation: (val: string) => void;
  stampFileInputRef: React.RefObject<HTMLInputElement>;
  signatoryNameInputRef: React.RefObject<HTMLInputElement>;
  signatoryDesignationInputRef: React.RefObject<HTMLInputElement>;
  handleStampFileChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleRemoveStamp: () => Promise<void>;
  getInputClass: (fieldName: string, extraClasses?: string) => string;
}

export default function StampSignatorySection({
  stampPreview,
  setStampPreview,
  uploadingStamp,
  fieldErrors,
  setFieldErrors,
  signatoryName,
  setSignatoryName,
  signatoryDesignation,
  setSignatoryDesignation,
  stampFileInputRef,
  signatoryNameInputRef,
  signatoryDesignationInputRef,
  handleStampFileChange,
  handleRemoveStamp,
  getInputClass,
}: StampSignatorySectionProps) {
  return (
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-100 dark:border-[#2A3042]">
        <div>
          <label className="label">Authorized Signatory Name</label>
          <input
            ref={signatoryNameInputRef}
            type="text"
            name="brandingSignatoryName"
            id="branding-signatory-name"
            data-testid="input-signatory-name"
            className={getInputClass('signatoryName')}
            placeholder="e.g. John Doe"
            value={signatoryName}
            onChange={(e) => {
              setSignatoryName(e.target.value);
              if (fieldErrors.signatoryName) {
                setFieldErrors((prev) => {
                  const n = { ...prev };
                  delete n.signatoryName;
                  return n;
                });
              }
            }}
          />
          <FormFieldError error={fieldErrors.signatoryName} id="error-signatory-name" data-testid="error-signatory-name" />
        </div>

        <div>
          <label className="label">Designation / Title</label>
          <input
            ref={signatoryDesignationInputRef}
            type="text"
            name="brandingSignatoryDesignation"
            id="branding-signatory-designation"
            data-testid="input-signatory-designation"
            className={getInputClass('signatoryDesignation')}
            placeholder="e.g. Director / Authorized Signatory"
            value={signatoryDesignation}
            onChange={(e) => {
              setSignatoryDesignation(e.target.value);
              if (fieldErrors.signatoryDesignation) {
                setFieldErrors((prev) => {
                  const n = { ...prev };
                  delete n.signatoryDesignation;
                  return n;
                });
              }
            }}
          />
          <FormFieldError error={fieldErrors.signatoryDesignation} id="error-signatory-designation" data-testid="error-signatory-designation" />
        </div>
      </div>
    </div>
  );
}
