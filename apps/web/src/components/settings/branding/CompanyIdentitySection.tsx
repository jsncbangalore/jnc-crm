import React from 'react';
import { Building2 } from 'lucide-react';
import { FormFieldError } from '../../common/FormFeedback';
import { PhoneField } from '../../common/forms';

interface CompanyIdentitySectionProps {
  companyName: string;
  setCompanyName: (val: string) => void;
  companyPhone: string;
  setCompanyPhone: (val: string) => void;
  fieldErrors: Record<string, string>;
  setFieldErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  companyNameInputRef: React.RefObject<HTMLInputElement>;
  getInputClass: (fieldName: string, extraClasses?: string) => string;
}

export default function CompanyIdentitySection({
  companyName,
  setCompanyName,
  companyPhone,
  setCompanyPhone,
  fieldErrors,
  setFieldErrors,
  companyNameInputRef,
  getInputClass,
}: CompanyIdentitySectionProps) {
  return (
    <div className="card space-y-4">
      <div className="border-b border-slate-200 dark:border-[#2A3042] pb-3">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Building2 size={16} className="text-crm-blue" />
          Company Identity & Basic Details
        </h2>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
          Core organization identity used across the platform and document headers.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="branding-company-name" className="label">
            Company Display Name <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              ref={companyNameInputRef}
              type="text"
              name="brandingCompanyName"
              id="branding-company-name"
              autoComplete="organization"
              data-testid="input-company-name"
              className={getInputClass('companyName', 'pl-8')}
              placeholder="Enter company display name"
              value={companyName}
              onChange={(e) => {
                setCompanyName(e.target.value);
                if (fieldErrors.companyName) {
                  setFieldErrors((prev) => {
                    const n = { ...prev };
                    delete n.companyName;
                    return n;
                  });
                }
              }}
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
          <PhoneField
            id="branding-telephone"
            label="Official Phone / Hotline"
            value={companyPhone}
            phoneType="landline"
            onChange={(val) => {
              setCompanyPhone(val);
              if (fieldErrors.companyPhone) {
                setFieldErrors((prev) => {
                  const n = { ...prev };
                  delete n.companyPhone;
                  return n;
                });
              }
            }}
            error={fieldErrors.companyPhone}
            placeholder="Enter company phone number, for example 0802345678"
            helperText="Included in outbound customer emails and documents."
            dataTestId="input-company-phone"
          />
        </div>
      </div>
    </div>
  );
}
