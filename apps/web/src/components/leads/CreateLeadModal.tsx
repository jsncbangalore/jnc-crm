/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect } from 'react';
import { UserPlus, Plus, ExternalLink, AlertCircle, AlertTriangle, Calculator, Edit3, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { leadsApi } from '../../services/api';
import { AccessibleModal } from '../common/AccessibleModal';
import { FormField } from '../common/FormField';
import {
  NameField,
  PhoneField,
  StateCityField,
  ProductField,
  QuantityField,
  MoneyField,
  SelectedProductPayload,
} from '../common/forms';
import {
  validateEmail,
  validateNotes,
  sanitizeText,
  toPlainText,
} from '@crm/shared-validation';

export interface CreateLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (createdLead: any, action: 'close' | 'add_another') => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
  leadToEdit?: any;
}

const SKU_CATEGORIES = [
  'CCTV Surveillance',
  'Access Control & Biometrics',
  'Fire Safety & Alarm',
  'Solar PV & Inverters',
  'Home & Building Automation',
  'Networking & IT Infrastructure',
  'Audio & Public Address',
  'Hardware & Accessories',
  'Other',
];

const UNIT_OPTIONS = ['NOS', 'PCS', 'SET', 'MTR', 'PKG', 'BOX', 'KG', 'LTR'];

interface FormState {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  companyName: string;
  state: string;
  city: string;
  productCategory: string;
  customCategory: string;
  productName: string;
  selectedSkuCode: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  estimatedValue: number;
  isAutoValue: boolean;
  urgency: string;
  queryMessage: string;
}

const INITIAL_FORM: FormState = {
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  companyName: '',
  state: 'Karnataka',
  city: 'Bengaluru',
  productCategory: 'CCTV Surveillance',
  customCategory: '',
  productName: '',
  selectedSkuCode: '',
  quantity: 1,
  unit: 'NOS',
  unitPrice: 0,
  estimatedValue: 0,
  isAutoValue: false,
  urgency: 'standard',
  queryMessage: '',
};

export const CreateLeadModal: React.FC<CreateLeadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  triggerRef,
  leadToEdit,
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

  const initialPhone = leadToEdit?.customerPhone || '';

  // Check if form is dirty
  const isDirty = Boolean(
    form.customerName.trim() ||
    form.customerPhone.trim() ||
    form.customerEmail.trim() ||
    form.companyName.trim() ||
    form.productName.trim() ||
    form.queryMessage.trim() ||
    form.estimatedValue > 0
  );

  useEffect(() => {
    if (isOpen) {
      if (leadToEdit) {
        setForm({
          customerName: leadToEdit.customerName || '',
          customerPhone: leadToEdit.customerPhone || '',
          customerEmail: leadToEdit.customerEmail || '',
          companyName: leadToEdit.companyName || leadToEdit.company?.name || '',
          state: leadToEdit.state || 'Karnataka',
          city: leadToEdit.city || 'Bengaluru',
          productCategory: leadToEdit.productCategory || 'CCTV Surveillance',
          customCategory: '',
          productName: leadToEdit.productName || '',
          selectedSkuCode: '',
          quantity: leadToEdit.quantity || 1,
          unit: leadToEdit.unit || 'NOS',
          unitPrice: 0,
          estimatedValue: leadToEdit.estimatedValue || 0,
          isAutoValue: false,
          urgency: leadToEdit.urgency || 'standard',
          queryMessage: leadToEdit.queryMessage || leadToEdit.notes || '',
        });
      } else {
        setForm(INITIAL_FORM);
      }
      setErrors({});
      setTouched({});
      setDuplicateWarning(null);
    }
  }, [isOpen, leadToEdit]);

  // Recalculate auto deal value when quantity or unit price changes
  const handleQuantityChange = (qty: number) => {
    setForm((prev) => {
      const next: FormState = { ...prev, quantity: qty };
      if (prev.isAutoValue && prev.unitPrice > 0) {
        next.estimatedValue = Math.round(qty * prev.unitPrice * 100) / 100;
      }
      return next;
    });
  };

  const handleProductSelect = (payload: SelectedProductPayload) => {
    setForm((prev) => {
      const unitPrice = payload.unitPrice || 0;
      const hasCatalogPrice = unitPrice > 0;
      const next: FormState = {
        ...prev,
        productName: payload.name,
        selectedSkuCode: payload.skuCode || '',
        unit: payload.unit || prev.unit,
        unitPrice,
        isAutoValue: hasCatalogPrice,
      };

      if (hasCatalogPrice) {
        next.estimatedValue = Math.round(prev.quantity * unitPrice * 100) / 100;
      }
      return next;
    });

    if (errors.productName) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy.productName;
        return copy;
      });
    }
  };

  const validateAll = (): boolean => {
    const nextErrors: Record<string, string> = {};

    if (!form.customerName.trim() || form.customerName.trim().length < 2) {
      nextErrors.customerName = 'Contact name is required (at least 2 letters).';
    }

    // Phone validation only runs when the phone value was changed from initial value
    const isPhoneChanged = form.customerPhone.trim() !== (initialPhone || '').trim();
    if (isPhoneChanged) {
      const cleanPhone = form.customerPhone.replace(/\D/g, '');
      if (!cleanPhone || cleanPhone.length < 10) {
        nextErrors.customerPhone = 'Enter a 10-digit mobile number.';
      } else if (cleanPhone.length === 10 && !/^[6-9]/.test(cleanPhone)) {
        nextErrors.customerPhone = 'Mobile number must start with 6, 7, 8, or 9.';
      }
    }

    if (form.customerEmail.trim()) {
      const emailRes = validateEmail(form.customerEmail.trim(), false);
      if (!emailRes.valid) nextErrors.customerEmail = emailRes.error || 'Invalid email address';
    }

    if (form.queryMessage.trim()) {
      const notesRes = validateNotes(form.queryMessage.trim());
      if (!notesRes.valid) nextErrors.queryMessage = notesRes.error || 'Notes invalid';
    }

    setErrors(nextErrors);
    setTouched({
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      queryMessage: true,
    });

    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent, action: 'close' | 'add_another', forceSave = false) => {
    e.preventDefault();
    if (!validateAll()) return;

    try {
      setSubmitting(true);
      const finalCategory =
        form.productCategory === 'Other'
          ? (form.customCategory.trim() || 'Other')
          : form.productCategory;

      let savedLead: any;
      if (leadToEdit?.id) {
        const updatePayload: any = {
          customerName: sanitizeText(form.customerName),
          customerPhone: form.customerPhone.trim(),
          customerEmail: form.customerEmail.trim() || undefined,
          companyName: sanitizeText(form.companyName) || undefined,
          state: form.state || undefined,
          city: sanitizeText(form.city) || undefined,
          productCategory: sanitizeText(finalCategory) || undefined,
          productName: sanitizeText(form.productName) || undefined,
          quantity: form.quantity > 0 ? form.quantity : 1,
          unit: form.unit || 'NOS',
          estimatedValue: form.estimatedValue > 0 ? form.estimatedValue : undefined,
          urgency: form.urgency,
          queryMessage: sanitizeText(form.queryMessage) || undefined,
        };
        const res = await leadsApi.update(leadToEdit.id, updatePayload);
        savedLead = res.data;
      } else {
        const payload: any = {
          customerName: sanitizeText(form.customerName),
          customerPhone: form.customerPhone.trim(),
          customerEmail: form.customerEmail.trim() || undefined,
          companyName: sanitizeText(form.companyName) || undefined,
          state: form.state || undefined,
          city: sanitizeText(form.city) || undefined,
          productCategory: sanitizeText(finalCategory) || undefined,
          productName: sanitizeText(form.productName) || undefined,
          quantity: form.quantity > 0 ? form.quantity : 1,
          unit: form.unit || 'NOS',
          estimatedValue: form.estimatedValue > 0 ? form.estimatedValue : undefined,
          urgency: form.urgency,
          queryMessage: sanitizeText(form.queryMessage) || undefined,
          source: 'manual',
          forceSave,
          allowDuplicate: forceSave,
        };
        const res = await leadsApi.create(payload);
        savedLead = res.data;
      }

      if (action === 'add_another' && !leadToEdit) {
        setForm(INITIAL_FORM);
        setErrors({});
        setTouched({});
        setDuplicateWarning(null);
        if (onSuccess) onSuccess(savedLead, 'add_another');
      } else {
        onClose();
        if (onSuccess) onSuccess(savedLead, 'close');
      }
    } catch (err: any) {
      const data = err?.response?.data;
      if (
        err?.response?.status === 409 ||
        (data?.message && typeof data.message === 'string' && data.message.includes('already exists'))
      ) {
        setDuplicateWarning({
          message: data?.message || 'A lead with this contact already exists. Open it or save anyway.',
          existingLeadId: data?.existingLeadId,
        });
      } else if (Array.isArray(data?.message)) {
        const mappedErrors: Record<string, string> = {};
        const unmapped: string[] = [];
        data.message.forEach((msg: string) => {
          if (msg.includes('customerName') || msg.includes('name')) mappedErrors.customerName = msg;
          else if (msg.includes('customerPhone') || msg.includes('phone')) mappedErrors.customerPhone = msg;
          else if (msg.includes('customerEmail') || msg.includes('email')) mappedErrors.customerEmail = msg;
          else unmapped.push(msg);
        });
        if (unmapped.length > 0) {
          mappedErrors.form = unmapped.join(', ');
        }
        setErrors((prev) => ({ ...prev, ...mappedErrors }));
      } else if (data?.message) {
        setErrors((prev) => ({ ...prev, form: toPlainText(data.message) }));
      } else {
        setErrors((prev) => ({ ...prev, form: toPlainText(err?.message || 'Failed to save lead. Please check details.') }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title={leadToEdit ? "Edit Lead" : "Create New Lead"}
      subtitle={leadToEdit ? "Update lead inquiry details" : "Manually register an inquiry or sales prospect with catalog items"}
      icon={leadToEdit ? <Edit3 size={20} /> : <UserPlus size={20} />}
      isDirty={isDirty}
      triggerRef={triggerRef}
      maxWidth="max-w-2xl"
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
            <span>{toPlainText(errors.form)}</span>
          </div>
        )}

        {/* 1. Contact Name & Mobile (Shared NameField & PhoneField) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <NameField
            id="lead-customer-name"
            label="Contact Name"
            required
            value={form.customerName}
            onChange={(val) => setForm((prev) => ({ ...prev, customerName: val }))}
            error={touched.customerName ? errors.customerName : null}
            placeholder="e.g. Rahul Sharma"
            maxLength={60}
          />

          <PhoneField
            id="lead-customer-phone"
            label="Mobile Number"
            required
            value={form.customerPhone}
            initialValue={initialPhone}
            onChange={(e164) => setForm((prev) => ({ ...prev, customerPhone: e164 }))}
            error={touched.customerPhone ? errors.customerPhone : null}
            placeholder="10-digit mobile number"
          />
        </div>

        {/* 2. Company & Email */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            id="companyName"
            name="companyName"
            label="Company / Organization"
            value={form.companyName}
            onChange={(e) => setForm((prev) => ({ ...prev, companyName: e.target.value }))}
            placeholder="e.g. Apex Industrial Solutions Ltd"
            maxLength={100}
          />

          <FormField
            id="customerEmail"
            name="customerEmail"
            label="Email Address"
            type="email"
            inputMode="email"
            value={form.customerEmail}
            onChange={(e) => setForm((prev) => ({ ...prev, customerEmail: e.target.value }))}
            error={touched.customerEmail ? errors.customerEmail : null}
            placeholder="contact@example.com"
            maxLength={254}
          />
        </div>

        {/* 3. State & City (Shared StateCityField) */}
        <StateCityField
          stateValue={form.state}
          cityValue={form.city}
          onStateChange={(st) => setForm((prev) => ({ ...prev, state: st }))}
          onCityChange={(ct) => setForm((prev) => ({ ...prev, city: ct }))}
          required={false}
          stateLabel="State"
          cityLabel="City / Location"
        />

        {/* 4. Product Category & Product Name (Shared ProductField) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5 text-left">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Product Category
            </label>
            <select
              value={form.productCategory}
              onChange={(e) => setForm((prev) => ({ ...prev, productCategory: e.target.value }))}
              className="w-full rounded-xl text-xs py-2.5 px-3 bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white border border-slate-300 dark:border-[#2A3042] outline-none font-medium cursor-pointer focus:border-crm-blue"
            >
              {SKU_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            {form.productCategory === 'Other' && (
              <input
                type="text"
                placeholder="Type custom category..."
                value={form.customCategory}
                onChange={(e) => setForm((prev) => ({ ...prev, customCategory: e.target.value }))}
                className="w-full rounded-xl text-xs px-3.5 py-2 font-medium bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white border border-slate-300 dark:border-[#2A3042] outline-none mt-1 animate-fadeIn"
              />
            )}
          </div>

          <ProductField
            label="Product (SKU Catalog)"
            value={form.productName}
            selectedSkuCode={form.selectedSkuCode}
            onChange={handleProductSelect}
            placeholder="Pick from SKU catalog or type custom..."
            error={errors.productName}
          />
        </div>

        {/* 5. Quantity, Unit & Est. Deal Value (Shared QuantityField & MoneyField) */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-5">
            <QuantityField
              id="lead-quantity"
              label="Quantity"
              value={form.quantity}
              unit={form.unit}
              onChange={handleQuantityChange}
              min={1}
              max={999999}
            />
          </div>

          <div className="sm:col-span-2 space-y-1.5 text-left">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Unit
            </label>
            <select
              value={form.unit}
              onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
              className="w-full rounded-xl text-xs h-10 px-2.5 font-bold font-mono bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white border border-slate-300 dark:border-[#2A3042] outline-none cursor-pointer focus:border-crm-blue"
            >
              {UNIT_OPTIONS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-5 space-y-1.5 text-left">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Est. Deal Value (₹)
              </label>
              {form.unitPrice > 0 && (
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded font-mono ${
                      form.isAutoValue
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300/40'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {form.isAutoValue ? 'Auto' : 'Manual'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (!form.isAutoValue) {
                        // Switch back to auto
                        const autoVal = Math.round(form.quantity * form.unitPrice * 100) / 100;
                        setForm((prev) => ({ ...prev, isAutoValue: true, estimatedValue: autoVal }));
                      } else {
                        // Switch to manual edit
                        setForm((prev) => ({ ...prev, isAutoValue: false }));
                      }
                    }}
                    className="text-[10px] text-crm-blue hover:underline font-semibold cursor-pointer"
                  >
                    {form.isAutoValue ? 'Edit' : 'Reset Auto'}
                  </button>
                </div>
              )}
            </div>

            <MoneyField
              id="lead-estimated-value"
              value={form.estimatedValue > 0 ? form.estimatedValue : ''}
              onChange={(val) => setForm((prev) => ({ ...prev, estimatedValue: val, isAutoValue: false }))}
              placeholder="0.00"
              disabled={form.isAutoValue}
            />
          </div>
        </div>

        {/* 6. Urgency */}
        <FormField
          id="urgency"
          name="urgency"
          label="Urgency Level"
          as="select"
          value={form.urgency}
          onChange={(e) => setForm((prev) => ({ ...prev, urgency: e.target.value }))}
          options={[
            { label: 'Standard (1-2 Weeks)', value: 'standard' },
            { label: 'Urgent (Immediate Procurement)', value: 'urgent' },
            { label: 'Planning (Budgeting / Future)', value: 'planning' },
          ]}
        />

        {/* 7. Requirement Notes */}
        <FormField
          id="queryMessage"
          name="queryMessage"
          label="Requirement Notes"
          as="textarea"
          value={form.queryMessage}
          onChange={(e) => setForm((prev) => ({ ...prev, queryMessage: e.target.value }))}
          error={touched.queryMessage ? errors.queryMessage : null}
          placeholder="Client specifications, requested models, or site notes..."
          maxLength={1000}
          showCount
        />

        {/* Modal Actions */}
        <div className="sticky bottom-0 bg-white dark:bg-[#181B26] p-4 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 border-t border-slate-200 dark:border-[#2A3042] flex flex-col-reverse sm:flex-row items-center justify-between gap-3 z-10 shadow-xs">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto btn-ghost text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {!leadToEdit && (
              <button
                type="button"
                disabled={submitting}
                onClick={(e) => handleSubmit(e, 'add_another')}
                className="w-full sm:w-auto btn-outline text-xs px-3 py-2 font-semibold disabled:opacity-50"
              >
                Save & Add Another
              </button>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto btn-primary text-xs px-4 py-2 font-bold shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : leadToEdit ? (
                <>
                  <Check size={14} />
                  <span>Save Changes</span>
                </>
              ) : (
                <>
                  <Plus size={14} />
                  <span>Create Lead</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </AccessibleModal>
  );
};

export default CreateLeadModal;
