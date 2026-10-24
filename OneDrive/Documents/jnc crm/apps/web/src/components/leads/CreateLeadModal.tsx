/* --- REUSABLE CREATE LEAD MODAL ---
 * Used across DashboardPage, LeadsPage, and Navbar Quick Add.
 * Includes 'Save and add another', soft duplicate warning ('Open it or save anyway'),
 * accessible FormField validation, and unsaved changes guard.
 * -------------------------------------------------------------------------- */

import React, { useState, useEffect, useRef } from 'react';
import { UserPlus, Plus, ExternalLink, AlertCircle, AlertTriangle, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { leadsApi } from '../../services/api';
import { AccessibleModal } from '../common/AccessibleModal';
import {
  FormField,
  filterPhoneInput,
  filterRateInput,
  filterTextOnlyInput,
} from '../common/FormField';
import {
  validatePersonOrCompanyName,
  validateTextOnlyName,
  validatePhone,
  validateEmail,
  validateUnitRate,
  validateNotes,
  sanitizeText,
} from '@crm/shared-validation';

export interface CreateLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (createdLead: any, action: 'close' | 'add_another') => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

interface FormState {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  companyName: string;
  productCategory: string;
  estimatedValue: string;
  urgency: string;
  city: string;
  queryMessage: string;
}

const INITIAL_FORM: FormState = {
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  companyName: '',
  productCategory: '',
  estimatedValue: '',
  urgency: 'standard',
  city: '',
  queryMessage: '',
};

export const CreateLeadModal: React.FC<CreateLeadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  triggerRef,
}) => {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<{
    message: string;
    existingLeadId?: string;
  } | null>(null);

  // Check if form is dirty
  const isDirty = Object.entries(form).some(([key, val]) => {
    if (key === 'urgency') return val !== 'standard';
    return Boolean(val && val.trim().length > 0);
  });

  useEffect(() => {
    if (isOpen) {
      setForm(INITIAL_FORM);
      setErrors({});
      setTouched({});
      setDuplicateWarning(null);
    }
  }, [isOpen]);

  const validateField = (name: keyof FormState, val: string): string | null => {
    switch (name) {
      case 'customerName': {
        const res = validateTextOnlyName(val);
        return res.valid ? null : (res.error || 'Invalid name');
      }
      case 'customerPhone': {
        const res = validatePhone(val);
        return res.valid ? null : (res.error || 'Invalid phone');
      }
      case 'customerEmail': {
        if (!val.trim()) return null;
        const res = validateEmail(val, false);
        return res.valid ? null : (res.error || 'Invalid email');
      }
      case 'companyName': {
        if (!val.trim()) return null;
        const res = validateTextOnlyName(val);
        return res.valid ? null : (res.error || 'Invalid company name');
      }
      case 'estimatedValue': {
        if (!val.trim()) return null;
        const res = validateUnitRate(val);
        return res.valid ? null : (res.error || 'Invalid value');
      }
      case 'queryMessage': {
        if (!val.trim()) return null;
        const res = validateNotes(val);
        return res.valid ? null : (res.error || 'Notes too long');
      }
      default:
        return null;
    }
  };

  const handleChange = (name: keyof FormState, rawVal: string) => {
    let cleanVal = rawVal;
    if (name === 'customerName' || name === 'companyName') cleanVal = filterTextOnlyInput(rawVal);
    if (name === 'customerPhone') cleanVal = filterPhoneInput(rawVal);
    if (name === 'estimatedValue') cleanVal = filterRateInput(rawVal);

    setForm((prev) => ({ ...prev, [name]: cleanVal }));
    setDuplicateWarning(null);

    if (touched[name]) {
      const err = validateField(name, cleanVal);
      setErrors((prev) => {
        const next = { ...prev };
        if (err) next[name] = err;
        else delete next[name];
        return next;
      });
    }
  };

  const handleBlur = (name: keyof FormState) => {
    setTouched((prev) => ({ ...prev, [name]: true }));
    const trimmedVal = form[name].trim();
    if (trimmedVal !== form[name]) {
      setForm((prev) => ({ ...prev, [name]: trimmedVal }));
    }
    const err = validateField(name, trimmedVal);
    setErrors((prev) => {
      const next = { ...prev };
      if (err) next[name] = err;
      else delete next[name];
      return next;
    });
  };

  const validateAll = (): boolean => {
    const nextErrors: Record<string, string> = {};
    (['customerName', 'customerPhone', 'customerEmail', 'companyName', 'estimatedValue', 'queryMessage'] as Array<keyof FormState>).forEach((field) => {
      const err = validateField(field, form[field]);
      if (err) nextErrors[field] = err;
    });

    setErrors(nextErrors);
    setTouched({
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      companyName: true,
      estimatedValue: true,
      queryMessage: true,
    });

    if (Object.keys(nextErrors).length > 0) {
      // Focus first error field
      const firstField = Object.keys(nextErrors)[0];
      const el = document.getElementById(firstField);
      el?.focus();
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent, action: 'close' | 'add_another', forceSave = false) => {
    e.preventDefault();
    if (!validateAll()) return;

    try {
      setSubmitting(true);
      const payload: any = {
        customerName: sanitizeText(form.customerName),
        customerPhone: form.customerPhone.trim(),
        customerEmail: form.customerEmail.trim() || undefined,
        companyName: sanitizeText(form.companyName) || undefined,
        productCategory: sanitizeText(form.productCategory) || undefined,
        estimatedValue: form.estimatedValue ? parseFloat(form.estimatedValue) : undefined,
        urgency: form.urgency,
        city: sanitizeText(form.city) || undefined,
        queryMessage: sanitizeText(form.queryMessage) || undefined,
        source: 'manual',
        forceSave,
        allowDuplicate: forceSave,
      };

      const res = await leadsApi.create(payload);
      const createdLead = res.data;

      if (action === 'add_another') {
        setForm(INITIAL_FORM);
        setErrors({});
        setTouched({});
        setDuplicateWarning(null);
        if (onSuccess) onSuccess(createdLead, 'add_another');
        const firstInput = document.getElementById('customerName');
        firstInput?.focus();
      } else {
        onClose();
        if (onSuccess) onSuccess(createdLead, 'close');
      }
    } catch (err: any) {
      const data = err?.response?.data;
      // Handle soft duplicate warning (409 or duplicate in message)
      if (err?.response?.status === 409 || (data?.message && typeof data.message === 'string' && data.message.includes('already exists'))) {
        setDuplicateWarning({
          message: data?.message || 'A lead with this phone or email already exists. Open it or save anyway.',
          existingLeadId: data?.existingLeadId,
        });
      } else if (Array.isArray(data?.message)) {
        // Map 400 validation error array back to fields
        const mappedErrors: Record<string, string> = {};
        const unmapped: string[] = [];
        data.message.forEach((msg: string) => {
          if (msg.includes('customerName') || msg.includes('name')) mappedErrors.customerName = msg;
          else if (msg.includes('customerPhone') || msg.includes('phone')) mappedErrors.customerPhone = msg;
          else if (msg.includes('customerEmail') || msg.includes('email')) mappedErrors.customerEmail = msg;
          else if (msg.includes('estimatedValue')) mappedErrors.estimatedValue = msg;
          else if (msg.includes('companyName')) mappedErrors.companyName = msg;
          else unmapped.push(msg);
        });
        if (unmapped.length > 0) {
          mappedErrors.form = unmapped.join(', ');
        }
        setErrors((prev) => ({ ...prev, ...mappedErrors }));
      } else if (data?.message) {
        setErrors((prev) => ({ ...prev, form: typeof data.message === 'string' ? data.message : JSON.stringify(data.message) }));
      } else {
        setErrors((prev) => ({ ...prev, form: err?.message || 'Failed to save lead. Please check details.' }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isFormValid = !errors.customerName && !errors.customerPhone && form.customerName.trim().length >= 2 && form.customerPhone.trim().length >= 10;

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Lead"
      subtitle="Manually add a qualified prospect or direct client contact"
      icon={<UserPlus size={20} />}
      isDirty={isDirty}
      triggerRef={triggerRef}
      maxWidth="max-w-xl"
    >
      <form onSubmit={(e) => handleSubmit(e, 'close')} className="p-4 sm:p-6 space-y-4 text-left" noValidate autoComplete="off" data-lpignore="true">
        {/* Soft Duplicate Warning Card */}
        {duplicateWarning && (
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700/50 space-y-2">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800 dark:text-amber-200">
                <p className="font-semibold">{duplicateWarning.message}</p>
                <p className="text-[11px] text-amber-700/90 dark:text-amber-300/80 mt-0.5">
                  You can inspect the existing record to avoid duplicate work, or force save this entry anyway.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate('/leads');
                }}
                className="btn-ghost text-xs text-amber-800 dark:text-amber-200 hover:bg-amber-200/50 dark:hover:bg-amber-900/40 px-2.5 py-1 gap-1"
              >
                <ExternalLink size={12} /> Open Leads
              </button>
              <button
                type="button"
                onClick={(e) => handleSubmit(e, 'close', true)}
                className="btn bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1 shadow-xs"
              >
                Save Anyway
              </button>
            </div>
          </div>
        )}

        {errors.form && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{errors.form}</span>
          </div>
        )}

        {/* Name & Phone Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            id="customerName"
            label="Contact Name"
            required
            value={form.customerName}
            onChange={(e) => handleChange('customerName', e.target.value)}
            onBlur={() => handleBlur('customerName')}
            error={touched.customerName ? errors.customerName : null}
            placeholder="e.g. Rajesh Kumar"
            maxLength={100}
            showCount
          />

          <FormField
            id="customerPhone"
            label="Mobile Number"
            type="tel"
            inputMode="tel"
            required
            value={form.customerPhone}
            onChange={(e) => handleChange('customerPhone', e.target.value)}
            onBlur={() => handleBlur('customerPhone')}
            error={touched.customerPhone ? errors.customerPhone : null}
            placeholder="10-digit mobile or +country"
            maxLength={20}
          />
        </div>

        {/* Company & Email Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            id="companyName"
            label="Company Name"
            value={form.companyName}
            onChange={(e) => handleChange('companyName', e.target.value)}
            onBlur={() => handleBlur('companyName')}
            error={touched.companyName ? errors.companyName : null}
            placeholder="e.g. Apex Industrial Pvt Ltd"
            maxLength={100}
          />

          <FormField
            id="customerEmail"
            label="Email Address"
            type="email"
            inputMode="email"
            value={form.customerEmail}
            onChange={(e) => handleChange('customerEmail', e.target.value)}
            onBlur={() => handleBlur('customerEmail')}
            error={touched.customerEmail ? errors.customerEmail : null}
            placeholder="contact@company.com"
            maxLength={254}
          />
        </div>

        {/* System Category & Value Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            id="productCategory"
            label="Product Category / System"
            value={form.productCategory}
            onChange={(e) => handleChange('productCategory', e.target.value)}
            onBlur={() => handleBlur('productCategory')}
            placeholder="e.g. CCTV Surveillance, Solar PV"
            maxLength={100}
          />

          <FormField
            id="estimatedValue"
            label="Est. Deal Value (₹)"
            type="text"
            inputMode="decimal"
            value={form.estimatedValue}
            onChange={(e) => handleChange('estimatedValue', e.target.value)}
            onBlur={() => handleBlur('estimatedValue')}
            error={touched.estimatedValue ? errors.estimatedValue : null}
            placeholder="0.00"
          />
        </div>

        {/* Urgency & City Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            id="urgency"
            label="Urgency Level"
            as="select"
            value={form.urgency}
            onChange={(e) => handleChange('urgency', e.target.value)}
            options={[
              { label: 'Standard (1-2 Weeks)', value: 'standard' },
              { label: 'Urgent (Immediate Procurement)', value: 'urgent' },
              { label: 'Planning (Budgeting / Future)', value: 'planning' },
            ]}
          />

          <FormField
            id="city"
            label="City / Location"
            value={form.city}
            onChange={(e) => handleChange('city', e.target.value)}
            onBlur={() => handleBlur('city')}
            placeholder="e.g. Bengaluru, Karnataka"
            maxLength={100}
          />
        </div>

        {/* Requirement Notes */}
        <FormField
          id="queryMessage"
          label="Requirement Notes"
          as="textarea"
          value={form.queryMessage}
          onChange={(e) => handleChange('queryMessage', e.target.value)}
          onBlur={() => handleBlur('queryMessage')}
          error={touched.queryMessage ? errors.queryMessage : null}
          placeholder="Client specifications, requested models, or site notes..."
          maxLength={1000}
          showCount
        />

        {/* Modal Actions */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-[#2A3042]">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto btn-ghost text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              disabled={submitting || !isFormValid}
              onClick={(e) => handleSubmit(e, 'add_another')}
              className="flex-1 sm:flex-initial btn bg-slate-100 hover:bg-slate-200 dark:bg-[#1E2230] dark:hover:bg-[#252B3C] border border-slate-300 dark:border-[#2A3042] text-slate-800 dark:text-slate-200 text-xs font-semibold px-3 py-2 disabled:opacity-50"
            >
              Save & Add Another
            </button>
            <button
              type="submit"
              disabled={submitting || !isFormValid}
              className="flex-1 sm:flex-initial btn bg-crm-blue hover:bg-crm-blue-hover text-white text-xs font-bold px-4 py-2 shadow-sm disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Lead'}
            </button>
          </div>
        </div>
      </form>
    </AccessibleModal>
  );
};

export default CreateLeadModal;
