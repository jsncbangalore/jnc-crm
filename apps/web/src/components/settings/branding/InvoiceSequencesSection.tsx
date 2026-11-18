import React from 'react';
import { FileText, Building2, CheckSquare, Square } from 'lucide-react';
import { FormFieldError } from '../../common/FormFeedback';

interface InvoiceSequencesSectionProps {
  invoicePrefix: string;
  setInvoicePrefix: (val: string) => void;
  lutBondNo: string;
  setLutBondNo: (val: string) => void;
  lutValidity: string;
  setLutValidity: (val: string) => void;
  autoAllocateAdvance: boolean;
  setAutoAllocateAdvance: (val: boolean) => void;
  fieldErrors: Record<string, string>;
  setFieldErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  invoicePrefixInputRef: React.RefObject<HTMLInputElement>;
  getInputClass: (fieldName: string, extraClasses?: string) => string;
}

export default function InvoiceSequencesSection({
  invoicePrefix,
  setInvoicePrefix,
  lutBondNo,
  setLutBondNo,
  lutValidity,
  setLutValidity,
  autoAllocateAdvance,
  setAutoAllocateAdvance,
  fieldErrors,
  setFieldErrors,
  invoicePrefixInputRef,
  getInputClass,
}: InvoiceSequencesSectionProps) {
  return (
    <div className="card space-y-4">
      <div className="border-b border-slate-200 dark:border-[#2A3042] pb-3">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <FileText size={16} className="text-emerald-600" />
          Invoice Sequences & Numbering
        </h2>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
          Configure your company's invoice series prefix and tax compliance information.
        </p>
      </div>

      <div className="p-3.5 rounded-lg border border-blue-200 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20 flex items-start gap-3">
        <Building2 size={16} className="text-crm-blue shrink-0 mt-0.5" />
        <div className="text-xs text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-slate-900 dark:text-white">Bank Settlement for Invoices & PDFs:</span>{' '}
          Managed centrally below under <strong>Company Bank Accounts</strong>. The account marked as default for documents will automatically populate on all tax invoices, quotations, and generated PDFs.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="label">Invoice Series Prefix</label>
          <input
            ref={invoicePrefixInputRef}
            type="text"
            name="crmInvoiceSeriesPrefix"
            id="crm-invoice-series-prefix"
            autoComplete="one-time-code"
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            data-testid="input-invoice-prefix"
            className={getInputClass('invoicePrefix', 'font-mono uppercase')}
            placeholder="INV"
            value={invoicePrefix}
            onChange={(e) => {
              setInvoicePrefix(e.target.value.toUpperCase());
              if (fieldErrors.invoicePrefix) {
                setFieldErrors((prev) => {
                  const n = { ...prev };
                  delete n.invoicePrefix;
                  return n;
                });
              }
            }}
          />
          <FormFieldError error={fieldErrors.invoicePrefix} id="error-invoice-prefix" data-testid="error-invoice-prefix" />
          <p className="text-[10px] text-slate-400 mt-1">e.g. INV-2026-XXXX</p>
        </div>

        <div>
          <label className="label">LUT / Bond Number (Zero-Rated Exports / SEZ)</label>
          <input
            type="text"
            name="crmLutBondNo"
            id="crm-lut-bond-no"
            autoComplete="one-time-code"
            data-testid="input-lut-bond-no"
            className="input text-xs font-mono"
            placeholder="e.g. AD290326000000T"
            value={lutBondNo}
            onChange={(e) => setLutBondNo(e.target.value)}
          />
        </div>

        <div>
          <label className="label">LUT Validity Period</label>
          <input
            type="text"
            name="crmLutValidity"
            id="crm-lut-validity"
            autoComplete="one-time-code"
            data-testid="input-lut-validity"
            className="input text-xs font-mono"
            placeholder="e.g. From: 01/04/2026 To: 31/03/2027"
            value={lutValidity}
            onChange={(e) => setLutValidity(e.target.value)}
          />
        </div>
      </div>

      {/* Auto-Allocate Advances Setting */}
      <div className="pt-3 border-t border-slate-100 dark:border-[#2A3042]">
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            data-testid="checkbox-auto-allocate-advance"
            checked={autoAllocateAdvance}
            onChange={(e) => setAutoAllocateAdvance(e.target.checked)}
            className="sr-only"
          />
          <div className="mt-0.5 text-crm-blue">
            {autoAllocateAdvance ? (
              <CheckSquare size={18} className="text-crm-blue" />
            ) : (
              <Square size={18} className="text-slate-400 group-hover:text-slate-500" />
            )}
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900 dark:text-white">
              Auto-allocate advance payments to new invoices
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              When enabled (default: ON), available unallocated advance payments for a customer are automatically applied against newly generated invoices. Turn off to manage invoice allocations manually.
            </p>
          </div>
        </label>
      </div>
    </div>
  );
}
