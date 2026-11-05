/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect } from 'react';
import { FileText, Plus, Trash2, AlertCircle, AlertTriangle, Check, ShieldAlert } from 'lucide-react';
import { quotationsApi, inventoryApi } from '../../services/api';
import CustomerSelectWithModal, { CustomerData } from '../common/CustomerSelectWithModal';
import { Sku, Quotation } from '../../types';
import { AccessibleModal } from '../common/AccessibleModal';
import { FormField } from '../common/FormField';
import {
  PhoneField,
  StateCityField,
  ProductField,
  QuantityField,
  MoneyField,
  SelectedProductPayload,
} from '../common/forms';
import {
  calculateDocumentTotals,
  formatIndianCurrency,
  validateEmail,
  validatePersonOrCompanyName,
  sanitizeText,
  toPlainText,
} from '@crm/shared-validation';
import { useAuth } from '../../contexts/AuthContext';

export interface CreateQuotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (quotation: Quotation, action?: 'close' | 'add_another') => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export interface QuoteLineItem {
  skuId?: string;
  skuCode?: string;
  name: string;
  description?: string;
  hsnCode?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate?: number;
  isCustom?: boolean;
}

const DEFAULT_LINE: QuoteLineItem = {
  skuId: '',
  skuCode: '',
  name: '',
  description: '',
  hsnCode: '',
  unit: 'NOS',
  quantity: 1,
  unitPrice: 0,
  discount: 0,
  taxRate: 18,
  isCustom: false,
};

export const CreateQuotationModal: React.FC<CreateQuotationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  triggerRef,
}) => {
  const { user } = useAuth();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [deliveryState, setDeliveryState] = useState('Karnataka');
  const [deliveryCity, setDeliveryCity] = useState('Bengaluru');
  const [taxRate, setTaxRate] = useState<number>(18);
  const [terms, setTerms] = useState(
    'Payment: 50% advance along with Purchase Order, 50% against delivery.\nValidity: 30 days from quotation date.'
  );
  const [lines, setLines] = useState<QuoteLineItem[]>([{ ...DEFAULT_LINE }]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setCustomerId(null);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setCompanyName('');
    setDeliveryState('Karnataka');
    setDeliveryCity('Bengaluru');
    setTaxRate(18);
    setTerms(
      'Payment: 50% advance along with Purchase Order, 50% against delivery.\nValidity: 30 days from quotation date.'
    );
    setLines([{ ...DEFAULT_LINE }]);
    setErrors({});
    setTouched({});
  };

  useEffect(() => {
    if (isOpen) {
      resetForm();
    }
  }, [isOpen]);

  const isDirty = Boolean(
    customerName.trim() ||
    customerPhone.trim() ||
    customerEmail.trim() ||
    companyName.trim() ||
    lines.some((l) => l.name.trim() || l.unitPrice > 0)
  );

  // Calculate live totals
  const calcTotals = calculateDocumentTotals(
    lines.map((l) => ({
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discount: l.discount,
    })),
    taxRate
  );

  const handleProductSelect = (index: number, payload: SelectedProductPayload) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        skuId: payload.skuId,
        skuCode: payload.skuCode,
        name: payload.name,
        unit: payload.unit || 'NOS',
        unitPrice: payload.unitPrice ?? copy[index].unitPrice,
        hsnCode: payload.hsnCode,
        taxRate: payload.taxRate ?? taxRate,
        isCustom: payload.isCustom ?? false,
      };
      return copy;
    });

    if (errors[`line_${index}_name`]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`line_${index}_name`];
        return next;
      });
    }
  };

  const handleLineQtyChange = (index: number, qty: number) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], quantity: qty };
      return copy;
    });
  };

  const handleLineRateChange = (index: number, rate: number) => {
    const line = lines[index];
    if (line.skuId) {
      setErrors((prev) => ({
        ...prev,
        [`line_${index}_rate`]: 'Rate is locked to catalog price.',
      }));
      return;
    }

    setErrors((prev) => {
      const next = { ...prev };
      delete next[`line_${index}_rate`];
      return next;
    });

    setLines((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], unitPrice: rate };
      return copy;
    });
  };

  const addLine = () => {
    setLines((prev) => [...prev, { ...DEFAULT_LINE }]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const validateAll = (): boolean => {
    const nextErrors: Record<string, string> = {};

    const nameRes = validatePersonOrCompanyName(customerName);
    if (!nameRes.valid) {
      nextErrors.customerName = nameRes.error || 'Customer / client name is required.';
    }

    const cleanPhone = customerPhone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      nextErrors.customerPhone = 'Enter a 10-digit mobile number.';
    }

    if (customerEmail.trim()) {
      const emailRes = validateEmail(customerEmail, false);
      if (!emailRes.valid) nextErrors.customerEmail = emailRes.error || 'Invalid email';
    }

    lines.forEach((l, idx) => {
      if (!l.name.trim()) {
        nextErrors[`line_${idx}_name`] = 'Product is required';
      }
      if (l.quantity <= 0) {
        nextErrors[`line_${idx}_qty`] = 'Quantity must be > 0';
      }
    });

    setErrors(nextErrors);
    setTouched({
      customerName: true,
      customerPhone: true,
      customerEmail: true,
    });

    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent, action: 'close' | 'add_another') => {
    e.preventDefault();
    if (!validateAll()) return;

    try {
      setSubmitting(true);
      const payload: any = {
        customerId: customerId || undefined,
        customerName: sanitizeText(customerName),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim() || undefined,
        companyName: sanitizeText(companyName) || undefined,
        shippingAddress: `${deliveryCity}, ${deliveryState}`,
        taxRate,
        terms: sanitizeText(terms),
        lines: lines.map((l) => ({
          skuId: l.skuId || undefined,
          name: sanitizeText(l.name),
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: l.discount || 0,
          unit: l.unit || 'NOS',
          hsnCode: l.hsnCode || undefined,
        })),
      };

      const res = await quotationsApi.create(payload);
      const created = res.data;

      if (action === 'add_another') {
        resetForm();
        if (onSuccess) onSuccess(created, 'add_another');
      } else {
        onClose();
        if (onSuccess) onSuccess(created, 'close');
      }
    } catch (err: any) {
      const data = err?.response?.data;
      if (Array.isArray(data?.message)) {
        setErrors((prev) => ({ ...prev, form: data.message.join(', ') }));
      } else if (data?.message) {
        setErrors((prev) => ({ ...prev, form: toPlainText(data.message) }));
      } else {
        setErrors((prev) => ({
          ...prev,
          form: toPlainText(err?.message || 'Failed to generate quotation.'),
        }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Quotation"
      subtitle="Generate an official client estimate with catalog products and live GST calculations"
      icon={<FileText size={20} />}
      isDirty={isDirty}
      triggerRef={triggerRef}
      maxWidth="max-w-4xl"
    >
      <form onSubmit={(e) => handleSubmit(e, 'close')} className="p-4 sm:p-6 space-y-4 text-left" noValidate autoComplete="off" data-lpignore="true">
        {errors.form && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{toPlainText(errors.form)}</span>
          </div>
        )}

        {/* Existing Customer Account Selection */}
        <CustomerSelectWithModal
          selectedCustomerId={customerId}
          onSelectCustomer={(c: CustomerData) => {
            setCustomerId(c.id);
            setCustomerName(c.name);
            if (c.phone) setCustomerPhone(c.phone);
            if (c.email) setCustomerEmail(c.email);
            if (c.state) setDeliveryState(c.state);
            setCompanyName(c.name);
          }}
          required={false}
          label="Select Existing Client Account (Optional)"
        />

        {/* Client Name & Mobile Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            id="quoteCustomerName"
            label="Client / Customer Name"
            required
            value={customerName}
            onChange={(e) => {
              setCustomerName(e.target.value);
              if (touched.customerName) {
                const res = validatePersonOrCompanyName(e.target.value);
                setErrors((prev) => ({ ...prev, customerName: res.valid ? '' : res.error || '' }));
              }
            }}
            onBlur={() => {
              setTouched((prev) => ({ ...prev, customerName: true }));
              const res = validatePersonOrCompanyName(customerName);
              setErrors((prev) => ({ ...prev, customerName: res.valid ? '' : res.error || '' }));
            }}
            error={touched.customerName ? errors.customerName : null}
            placeholder="e.g. Rahul Sharma or Zenith Infra Ltd"
            maxLength={100}
          />

          <PhoneField
            id="quoteCustomerPhone"
            label="Mobile Number"
            required
            value={customerPhone}
            onChange={(e164) => setCustomerPhone(e164)}
            error={touched.customerPhone ? errors.customerPhone : null}
            placeholder="10-digit mobile number"
          />
        </div>

        {/* Company & Email Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            id="quoteCompanyName"
            label="Company / Organization"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g. Zenith Infra Ltd"
            maxLength={100}
          />

          <FormField
            id="quoteCustomerEmail"
            label="Email Address"
            type="email"
            inputMode="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            error={errors.customerEmail}
            placeholder="client@example.com"
            maxLength={254}
          />
        </div>

        {/* Delivery Location via Shared StateCityField */}
        <StateCityField
          stateValue={deliveryState}
          cityValue={deliveryCity}
          onStateChange={(st) => setDeliveryState(st)}
          onCityChange={(ct) => setDeliveryCity(ct)}
          stateLabel="Delivery State"
          cityLabel="Delivery City / Location"
        />

        {/* GST Rate */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            id="quoteGstRate"
            label="Default GST Rate (%)"
            as="select"
            value={taxRate}
            onChange={(e) => setTaxRate(Number(e.target.value) || 18)}
            options={[
              { label: '18% GST (Standard Equipment)', value: 18 },
              { label: '12% GST', value: 12 },
              { label: '28% GST', value: 28 },
              { label: '5% GST', value: 5 },
              { label: '0% (Exempt)', value: 0 },
            ]}
          />

          <div className="flex items-end pb-1.5">
            <span className="text-xs text-slate-500 font-medium">
              Tax Region: {deliveryState === 'Karnataka' ? 'Intra-State (CGST 9% + SGST 9%)' : 'Inter-State (IGST 18%)'}
            </span>
          </div>
        </div>

        {/* Line Items Builder with Shared ProductField & QuantityField */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Quotation Line Items <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={addLine}
              className="btn-ghost text-xs text-crm-amber hover:bg-crm-amber/10 gap-1 font-semibold cursor-pointer"
            >
              <Plus size={13} /> Add Product Row
            </button>
          </div>

          <div className="space-y-3">
            {lines.map((line, idx) => (
              <div
                key={idx}
                className="p-3 bg-slate-50 dark:bg-[#141722] rounded-xl border border-slate-200 dark:border-[#2A3042] space-y-2.5"
              >
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                  {/* Product Field */}
                  <div className="sm:col-span-5">
                    <ProductField
                      value={line.name}
                      selectedSkuCode={line.skuCode}
                      onChange={(p) => handleProductSelect(idx, p)}
                      error={errors[`line_${idx}_name`]}
                      placeholder="Select SKU catalog or type custom..."
                    />
                  </div>

                  {/* Quantity Field */}
                  <div className="sm:col-span-3">
                    <QuantityField
                      value={line.quantity}
                      unit={line.unit}
                      onChange={(q) => handleLineQtyChange(idx, q)}
                      min={1}
                      max={999999}
                    />
                  </div>

                  {/* Rate Field */}
                  <div className="sm:col-span-2">
                    <MoneyField
                      label={`Rate (${line.unit})`}
                      value={line.unitPrice}
                      onChange={(r) => handleLineRateChange(idx, r)}
                      disabled={Boolean(line.skuId)}
                      helperText={line.skuId ? 'Catalog price' : undefined}
                      error={errors[`line_${idx}_rate`]}
                    />
                  </div>

                  {/* Row Total & Delete */}
                  <div className="sm:col-span-2 flex items-center justify-between pb-1">
                    <div className="text-right font-mono font-bold text-xs text-crm-amber">
                      {formatIndianCurrency(calcTotals.lineTotals[idx] || 0)}
                    </div>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="text-slate-400 hover:text-red-500 p-1.5 transition cursor-pointer"
                        title="Remove Line Item"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {errors[`line_${idx}_rate`] && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
                    <ShieldAlert size={12} />
                    <span>{errors[`line_${idx}_rate`]}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Live Quotation Summary Box */}
        <div className="bg-slate-50 dark:bg-[#141722] p-4 rounded-xl border border-slate-200 dark:border-[#2A3042] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1 text-xs text-slate-500">
            <p>Subtotal: <strong className="text-slate-900 dark:text-white font-mono">{formatIndianCurrency(calcTotals.taxableSubtotal)}</strong></p>
            <p>Total GST ({taxRate}%): <strong className="text-slate-900 dark:text-white font-mono">{formatIndianCurrency(calcTotals.gstAmount)}</strong></p>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-500 font-medium">Total Quotation Value:</span>
            <p className="text-xl font-black font-mono text-crm-amber">
              {formatIndianCurrency(calcTotals.grandTotal)}
            </p>
          </div>
        </div>

        {/* Commercial Terms & Conditions */}
        <FormField
          id="quoteTerms"
          label="Commercial Terms & Conditions"
          as="textarea"
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          rows={2}
          maxLength={500}
        />

        {/* Modal Actions */}
        <div className="sticky bottom-0 bg-white dark:bg-[#181B26] p-4 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 border-t border-slate-200 dark:border-[#2A3042] flex flex-col-reverse sm:flex-row items-center justify-between gap-3 z-10 shadow-xs">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto btn-ghost text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              disabled={submitting}
              onClick={(e) => handleSubmit(e, 'add_another')}
              className="w-full sm:w-auto btn-outline text-xs px-3 py-2 font-semibold disabled:opacity-50 cursor-pointer"
            >
              Save & Add Another
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto btn-primary text-xs px-4 py-2 font-bold shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Generating Quote...</span>
                </>
              ) : (
                <>
                  <Check size={14} />
                  <span>Generate Quotation</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </AccessibleModal>
  );
};

export default CreateQuotationModal;
