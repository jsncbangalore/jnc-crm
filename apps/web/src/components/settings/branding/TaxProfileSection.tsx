import React from 'react';
import { Building2 } from 'lucide-react';
import { FormFieldError } from '../../common/FormFeedback';
import { normalizeHttpsUrl } from '@crm/shared-validation';
import { cleanPan, cleanGstin } from '../../../utils/taxValidation';

interface TaxProfileSectionProps {
  address: string;
  setAddress: (val: string) => void;
  city: string;
  setCity: (val: string) => void;
  state: string;
  setState: (val: string) => void;
  pincode: string;
  setPincode: (val: string) => void;
  email: string;
  setEmail: (val: string) => void;
  website: string;
  setWebsite: (val: string) => void;
  gstin: string;
  setGstin: (val: string) => void;
  pan: string;
  setPan: (val: string) => void;
  fieldErrors: Record<string, string>;
  setFieldErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  addressInputRef: React.RefObject<HTMLInputElement>;
  cityInputRef: React.RefObject<HTMLInputElement>;
  stateInputRef: React.RefObject<HTMLInputElement>;
  pincodeInputRef: React.RefObject<HTMLInputElement>;
  emailInputRef: React.RefObject<HTMLInputElement>;
  websiteInputRef: React.RefObject<HTMLInputElement>;
  gstinInputRef: React.RefObject<HTMLInputElement>;
  panInputRef: React.RefObject<HTMLInputElement>;
  getInputClass: (fieldName: string, extraClasses?: string) => string;
}

export default function TaxProfileSection({
  address,
  setAddress,
  city,
  setCity,
  state,
  setState,
  pincode,
  setPincode,
  email,
  setEmail,
  website,
  setWebsite,
  gstin,
  setGstin,
  pan,
  setPan,
  fieldErrors,
  setFieldErrors,
  addressInputRef,
  cityInputRef,
  stateInputRef,
  pincodeInputRef,
  emailInputRef,
  websiteInputRef,
  gstinInputRef,
  panInputRef,
  getInputClass,
}: TaxProfileSectionProps) {
  return (
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
            ref={addressInputRef}
            type="text"
            name="brandingStreetAddress"
            id="branding-street-address"
            autoComplete="street-address"
            data-testid="input-address"
            className={getInputClass('address')}
            placeholder="Enter registered business address"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              if (fieldErrors.address) {
                setFieldErrors((prev) => {
                  const n = { ...prev };
                  delete n.address;
                  return n;
                });
              }
            }}
          />
          <FormFieldError error={fieldErrors.address} id="error-address" data-testid="error-address" />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label htmlFor="branding-address-city" className="label">City</label>
            <input
              ref={cityInputRef}
              type="text"
              name="brandingAddressCity"
              id="branding-address-city"
              autoComplete="address-level2"
              data-testid="input-city"
              className={getInputClass('city')}
              placeholder="Enter city"
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                if (fieldErrors.city) {
                  setFieldErrors((prev) => {
                    const n = { ...prev };
                    delete n.city;
                    return n;
                  });
                }
              }}
            />
            <FormFieldError error={fieldErrors.city} id="error-city" data-testid="error-city" />
          </div>
          <div>
            <label htmlFor="branding-address-state" className="label">State</label>
            <input
              ref={stateInputRef}
              type="text"
              name="brandingAddressState"
              id="branding-address-state"
              autoComplete="address-level1"
              data-testid="input-state"
              className={getInputClass('state')}
              placeholder="Enter state"
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                if (fieldErrors.state) {
                  setFieldErrors((prev) => {
                    const n = { ...prev };
                    delete n.state;
                    return n;
                  });
                }
              }}
            />
            <FormFieldError error={fieldErrors.state} id="error-state" data-testid="error-state" />
          </div>
          <div>
            <label htmlFor="branding-postal-code" className="label">Pincode</label>
            <input
              ref={pincodeInputRef}
              type="text"
              name="brandingPostalCode"
              id="branding-postal-code"
              autoComplete="postal-code"
              data-testid="input-pincode"
              className={getInputClass('pincode', 'font-mono')}
              placeholder="Pincode"
              maxLength={6}
              value={pincode}
              onChange={(e) => {
                setPincode(e.target.value.replace(/\D/g, ''));
                if (fieldErrors.pincode) {
                  setFieldErrors((prev) => {
                    const n = { ...prev };
                    delete n.pincode;
                    return n;
                  });
                }
              }}
            />
            <FormFieldError error={fieldErrors.pincode} id="error-pincode" data-testid="error-pincode" />
          </div>
        </div>

        <div>
          <label htmlFor="branding-billing-email" className="label">Official Billing Email</label>
          <input
            ref={emailInputRef}
            type="email"
            name="brandingBillingEmail"
            id="branding-billing-email"
            autoComplete="email"
            data-testid="input-email"
            className={getInputClass('email')}
            placeholder="billing@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) {
                setFieldErrors((prev) => {
                  const n = { ...prev };
                  delete n.email;
                  return n;
                });
              }
            }}
          />
          <FormFieldError error={fieldErrors.email} id="error-email" data-testid="error-email" />
        </div>

        <div>
          <label className="label">Website / Portal URL</label>
          <input
            ref={websiteInputRef}
            type="text"
            name="companyWebsite"
            id="company-website"
            autoComplete="url"
            data-testid="input-website"
            className={getInputClass('website')}
            placeholder="https://example.com"
            value={website}
            onChange={(e) => {
              setWebsite(e.target.value);
              if (fieldErrors.website) {
                setFieldErrors((prev) => {
                  const n = { ...prev };
                  delete n.website;
                  return n;
                });
              }
            }}
            onBlur={() => {
              if (website.trim()) {
                const norm = normalizeHttpsUrl(website.trim());
                setWebsite(norm);
              }
            }}
          />
          <FormFieldError error={fieldErrors.website} id="error-website" data-testid="error-website" />
        </div>

        <div>
          <label className="label">Company GSTIN</label>
          <input
            ref={gstinInputRef}
            type="text"
            name="companyGstin"
            id="company-gstin"
            autoComplete="one-time-code"
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            data-testid="input-gstin"
            className={getInputClass('gstin', 'font-mono uppercase')}
            placeholder="Enter 15 letters and digits, for example 29AAAAA0000A1ZY"
            maxLength={15}
            value={gstin}
            onChange={(e) => {
              const cleaned = cleanGstin(e.target.value);
              setGstin(cleaned);
              if (fieldErrors.gstin) {
                setFieldErrors((prev) => {
                  const n = { ...prev };
                  delete n.gstin;
                  return n;
                });
              }
            }}
            onPaste={(e) => {
              e.preventDefault();
              setGstin(cleanGstin(e.clipboardData.getData('text')));
            }}
          />
          <FormFieldError error={fieldErrors.gstin} id="error-gstin" data-testid="error-gstin" />
        </div>

        <div>
          <label className="label">Company PAN</label>
          <input
            ref={panInputRef}
            type="text"
            name="companyPan"
            id="company-pan"
            autoComplete="one-time-code"
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            data-testid="input-pan"
            className={getInputClass('pan', 'font-mono uppercase')}
            placeholder="Enter 10 letters and digits, for example AAAAA0000A"
            maxLength={10}
            value={pan}
            onChange={(e) => {
              const cleaned = cleanPan(e.target.value);
              setPan(cleaned);
              if (fieldErrors.pan) {
                setFieldErrors((prev) => {
                  const n = { ...prev };
                  delete n.pan;
                  return n;
                });
              }
            }}
            onPaste={(e) => {
              e.preventDefault();
              setPan(cleanPan(e.clipboardData.getData('text')));
            }}
          />
          <FormFieldError error={fieldErrors.pan} id="error-pan" data-testid="error-pan" />
        </div>
      </div>
    </div>
  );
}
