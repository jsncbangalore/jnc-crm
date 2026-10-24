/* --- REUSABLE CREATE ORDER MODAL ---
 * Accessible modal with WCAG focus trap, Esc key listener, unsaved changes guard,
 * FormField validation layer, and live totals calculation.
 * -------------------------------------------------------------------------- */

import React, { useState, useEffect, useRef } from 'react';
import { ShoppingCart, Plus, Trash2, AlertCircle } from 'lucide-react';
import { ordersApi, inventoryApi } from '../../services/api';
import { Sku, Order } from '../../types';
import { AccessibleModal } from '../common/AccessibleModal';
import {
  FormField,
  filterPhoneInput,
  filterRateInput,
  filterIntegerInput,
  filterTextOnlyInput,
} from '../common/FormField';
import {
  validatePersonOrCompanyName,
  validateTextOnlyName,
  validatePhone,
  validateEmail,
  validateProductName,
  validateQuantity,
  validateUnitRate,
  calculateDocumentTotals,
  formatIndianCurrency,
  sanitizeText,
} from '@crm/shared-validation';

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderCreated?: (order: Order, action?: 'close' | 'add_another') => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

interface OrderLineItem {
  skuId: string;
  name: string;
  quantity: string;
  unitPrice: string;
}

const DEFAULT_LINE: OrderLineItem = {
  skuId: '',
  name: '',
  quantity: '1',
  unitPrice: '',
};

export default function CreateOrderModal({
  isOpen,
  onClose,
  onOrderCreated,
  triggerRef,
}: CreateOrderModalProps) {
  const [skus, setSkus] = useState<Sku[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [notes, setNotes] = useState('');

  const [lines, setLines] = useState<OrderLineItem[]>([{ ...DEFAULT_LINE }]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      inventoryApi.getSkus().then((res) => {
        setSkus(res.data.items || res.data || []);
      }).catch((e) => console.error('Failed to load SKUs', e));
    }
  }, [isOpen]);

  const resetForm = () => {
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setShippingAddress('');
    setNotes('');
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
    shippingAddress.trim() ||
    notes.trim() ||
    lines.some((l) => l.name.trim() || l.unitPrice.trim())
  );

  const calcTotals = calculateDocumentTotals(
    lines.map((l) => ({
      quantity: parseFloat(l.quantity) || 0,
      unitPrice: parseFloat(l.unitPrice) || 0,
    })),
    18
  );

  const handleSelectSku = (index: number, sku: Sku) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        skuId: sku.id,
        name: sku.name,
        unitPrice: String(sku.unitPrice || ''),
      };
      return copy;
    });
  };

  const handleLineChange = (index: number, field: keyof OrderLineItem, val: string) => {
    let cleanVal = val;
    if (field === 'quantity') cleanVal = filterIntegerInput(val) || '1';
    if (field === 'unitPrice') cleanVal = filterRateInput(val);

    setLines((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: cleanVal };
      return copy;
    });

    if (errors[`line_${index}_${field}`]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`line_${index}_${field}`];
        return next;
      });
    }
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

    const nameRes = validateTextOnlyName(customerName);
    if (!nameRes.valid) nextErrors.customerName = nameRes.error || 'Invalid name';

    const phoneRes = validatePhone(customerPhone);
    if (!phoneRes.valid) nextErrors.customerPhone = phoneRes.error || 'Invalid phone';

    if (customerEmail.trim()) {
      const emailRes = validateEmail(customerEmail, false);
      if (!emailRes.valid) nextErrors.customerEmail = emailRes.error || 'Invalid email';
    }

    lines.forEach((l, idx) => {
      const pRes = validateProductName(l.name);
      if (!pRes.valid) nextErrors[`line_${idx}_name`] = pRes.error || 'Invalid product name';

      const qRes = validateQuantity(l.quantity);
      if (!qRes.valid) nextErrors[`line_${idx}_qty`] = qRes.error || 'Invalid quantity';

      const rRes = validateUnitRate(l.unitPrice);
      if (!rRes.valid) nextErrors[`line_${idx}_rate`] = rRes.error || 'Invalid rate (no leading zeros)';
    });

    setErrors(nextErrors);
    setTouched({ customerName: true, customerPhone: true, customerEmail: true });

    if (Object.keys(nextErrors).length > 0) {
      const firstField = Object.keys(nextErrors)[0];
      const el = document.getElementById(firstField);
      el?.focus();
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent, action: 'close' | 'add_another' = 'close') => {
    e.preventDefault();
    if (!validateAll()) return;

    try {
      setSubmitting(true);
      const payload = {
        customerName: sanitizeText(customerName),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim() || undefined,
        shippingAddress: sanitizeText(shippingAddress) || undefined,
        notes: sanitizeText(notes) || undefined,
        lines: lines.map((l) => ({
          skuId: l.skuId || undefined,
          name: sanitizeText(l.name),
          quantity: parseInt(l.quantity, 10) || 1,
          unitPrice: parseFloat(l.unitPrice) || 0,
        })),
      };

      const { data } = await ordersApi.create(payload);

      if (action === 'add_another') {
        resetForm();
        if (onOrderCreated) onOrderCreated(data, 'add_another');
        const firstInput = document.getElementById('orderCustomerName');
        firstInput?.focus();
      } else {
        onClose();
        if (onOrderCreated) onOrderCreated(data, 'close');
      }
    } catch (err: any) {
      const data = err?.response?.data;
      if (Array.isArray(data?.message)) {
        const mappedErrors: Record<string, string> = {};
        data.message.forEach((msg: string) => {
          if (msg.includes('customerName') || msg.includes('name')) mappedErrors.customerName = msg;
          else if (msg.includes('customerPhone') || msg.includes('phone')) mappedErrors.customerPhone = msg;
          else if (msg.includes('unitPrice') || msg.includes('rate')) mappedErrors.lines = msg;
        });
        setErrors((prev) => ({ ...prev, ...mappedErrors }));
      } else if (data?.message) {
        setErrors((prev) => ({ ...prev, form: data.message }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isFormValid =
    !errors.customerName &&
    !errors.customerPhone &&
    customerName.trim().length >= 2 &&
    customerPhone.trim().length >= 10 &&
    lines.length > 0 &&
    lines.every((l) => l.name.trim().length >= 2 && parseFloat(l.unitPrice) > 0);

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Order"
      subtitle="Type custom product names or pick from catalog inventory with live GST calculation"
      icon={<ShoppingCart size={20} />}
      isDirty={isDirty}
      triggerRef={triggerRef}
      maxWidth="max-w-3xl"
    >
      <form onSubmit={(e) => handleSubmit(e, 'close')} className="p-4 sm:p-6 space-y-4 text-left" noValidate>
        {errors.form && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{errors.form}</span>
          </div>
        )}

        {/* Customer Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            id="orderCustomerName"
            label="Customer / Company Name"
            required
            value={customerName}
            onChange={(e) => {
              const clean = filterTextOnlyInput(e.target.value);
              setCustomerName(clean);
              if (touched.customerName) {
                const res = validateTextOnlyName(clean);
                setErrors((prev) => ({ ...prev, customerName: res.valid ? '' : res.error || '' }));
              }
            }}
            onBlur={() => {
              setTouched((prev) => ({ ...prev, customerName: true }));
              const res = validateTextOnlyName(customerName.trim());
              setErrors((prev) => ({ ...prev, customerName: res.valid ? '' : res.error || '' }));
            }}
            error={touched.customerName ? errors.customerName : null}
            placeholder="e.g. Apex Industrial Pvt Ltd"
            maxLength={100}
            showCount
          />

          <FormField
            id="orderCustomerPhone"
            label="Customer Phone"
            type="tel"
            inputMode="tel"
            required
            value={customerPhone}
            onChange={(e) => {
              const clean = filterPhoneInput(e.target.value);
              setCustomerPhone(clean);
              if (touched.customerPhone) {
                const res = validatePhone(clean);
                setErrors((prev) => ({ ...prev, customerPhone: res.valid ? '' : res.error || '' }));
              }
            }}
            onBlur={() => {
              setTouched((prev) => ({ ...prev, customerPhone: true }));
              const res = validatePhone(customerPhone.trim());
              setErrors((prev) => ({ ...prev, customerPhone: res.valid ? '' : res.error || '' }));
            }}
            error={touched.customerPhone ? errors.customerPhone : null}
            placeholder="10-digit mobile"
            maxLength={20}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            id="orderCustomerEmail"
            label="Customer Email (Optional)"
            type="email"
            inputMode="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            onBlur={() => {
              if (customerEmail.trim()) {
                const res = validateEmail(customerEmail.trim(), false);
                setErrors((prev) => ({ ...prev, customerEmail: res.valid ? '' : res.error || '' }));
              }
            }}
            error={errors.customerEmail}
            placeholder="client@company.com"
            maxLength={254}
          />

          <FormField
            id="orderShippingAddress"
            label="Delivery / Site Address"
            value={shippingAddress}
            onChange={(e) => setShippingAddress(e.target.value)}
            placeholder="Site address or delivery location"
            maxLength={300}
          />
        </div>

        {/* Line Items */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Equipment / Product Line Items <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={addLine}
              className="btn-ghost text-xs text-crm-blue hover:bg-crm-blue/10 gap-1 font-semibold"
            >
              <Plus size={13} /> Add Item
            </button>
          </div>

          <div className="space-y-2.5">
            {lines.map((line, idx) => (
              <div
                key={idx}
                className="flex flex-col sm:flex-row sm:items-center gap-2 bg-slate-50 dark:bg-[#141722] p-2.5 rounded-xl border border-slate-200 dark:border-[#2A3042]"
              >
                <div className="flex-1 min-w-0">
                  <input
                    list={`order-sku-list-${idx}`}
                    type="text"
                    className={`input text-xs font-medium w-full ${errors[`line_${idx}_name`] ? 'border-red-500' : ''}`}
                    placeholder="Type custom product name or pick catalog SKU..."
                    value={line.name}
                    onChange={(e) => {
                      const val = e.target.value;
                      handleLineChange(idx, 'name', val);
                      const matched = skus.find(
                        (s) => `${s.skuCode} - ${s.name}` === val || s.name === val || s.skuCode === val
                      );
                      if (matched) handleSelectSku(idx, matched);
                    }}
                    required
                  />
                  <datalist id={`order-sku-list-${idx}`}>
                    {skus.map((s) => (
                      <option key={s.id} value={`${s.skuCode} - ${s.name}`}>
                        {formatIndianCurrency(s.unitPrice)}
                      </option>
                    ))}
                  </datalist>
                  {errors[`line_${idx}_name`] && (
                    <p className="text-[10px] text-red-500 mt-0.5">{errors[`line_${idx}_name`]}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="w-20">
                    <input
                      type="text"
                      inputMode="numeric"
                      className={`input text-xs text-center font-bold w-full ${errors[`line_${idx}_qty`] ? 'border-red-500' : ''}`}
                      placeholder="Qty"
                      value={line.quantity}
                      onChange={(e) => handleLineChange(idx, 'quantity', e.target.value)}
                    />
                  </div>

                  <div className="w-28">
                    <input
                      type="text"
                      inputMode="decimal"
                      className={`input text-xs text-right font-mono w-full ${errors[`line_${idx}_rate`] ? 'border-red-500' : ''}`}
                      placeholder="Rate (₹)"
                      value={line.unitPrice}
                      onChange={(e) => handleLineChange(idx, 'unitPrice', e.target.value)}
                    />
                  </div>

                  <div className="w-24 text-right font-mono font-bold text-xs text-crm-blue shrink-0">
                    {formatIndianCurrency(calcTotals.lineTotals[idx] || 0)}
                  </div>

                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
                      title="Remove Row"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Calculation summary */}
        <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042] space-y-1.5 text-xs font-mono">
          <div className="flex justify-between text-slate-500 dark:text-slate-400">
            <span>Taxable Subtotal:</span>
            <span className="font-semibold">{formatIndianCurrency(calcTotals.taxableSubtotal)}</span>
          </div>
          <div className="flex justify-between text-slate-500 dark:text-slate-400">
            <span>Estimated GST (18%):</span>
            <span className="font-semibold">{formatIndianCurrency(calcTotals.gstAmount)}</span>
          </div>
          <div className="flex justify-between text-slate-900 dark:text-white pt-2 border-t border-slate-300 dark:border-[#2A3042] text-sm font-bold">
            <span>Total Order Amount:</span>
            <span className="text-crm-blue font-bold">{formatIndianCurrency(calcTotals.grandTotal)}</span>
          </div>
        </div>

        {/* Notes */}
        <FormField
          id="orderNotes"
          label="Order Notes / Terms"
          as="textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Delivery schedule, transport details, or installation requirements..."
          maxLength={1000}
          showCount
        />

        {/* Actions */}
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
              {submitting ? 'Creating...' : 'Create Order'}
            </button>
          </div>
        </div>
      </form>
    </AccessibleModal>
  );
}
