/* --- REUSABLE CREATE ORDER MODAL ---
 * Accessible modal with WCAG focus trap, Esc key listener, unsaved changes guard,
 * FormField validation layer, and live totals calculation.
 * -------------------------------------------------------------------------- */

import React, { useState, useEffect, useRef } from 'react';
import { ShoppingCart, Plus, Trash2, AlertCircle } from 'lucide-react';
import { ordersApi, inventoryApi } from '../../services/api';
import CustomerSelectWithModal, { CustomerData } from '../common/CustomerSelectWithModal';
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
  NameField,
  PhoneField,
  ProductField,
  QuantityField,
  MoneyField,
} from '../common/forms';
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
  toPlainText,
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
  const [customerId, setCustomerId] = useState<string | null>(null);
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
    setCustomerId(null);
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
        customerId: customerId || undefined,
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
      const mappedErrors: Record<string, string> = {};

      if (Array.isArray(data?.fieldErrors)) {
        data.fieldErrors.forEach((item: any) => {
          if (item?.field) mappedErrors[String(item.field)] = toPlainText(item.message || item);
        });
      } else if (data?.fieldErrors && typeof data.fieldErrors === 'object') {
        Object.entries(data.fieldErrors).forEach(([k, v]) => {
          mappedErrors[k] = toPlainText(v);
        });
      }

      if (Array.isArray(data?.message)) {
        data.message.forEach((msg: any) => {
          const text = toPlainText(msg);
          if (text.includes('customerName') || text.includes('name')) mappedErrors.customerName = text;
          else if (text.includes('customerPhone') || text.includes('phone')) mappedErrors.customerPhone = text;
          else if (text.includes('unitPrice') || text.includes('rate')) mappedErrors.lines = text;
        });
      }

      const formMsg = toPlainText(data?.message || err?.message || 'Failed to save order.');
      setErrors((prev) => ({
        ...prev,
        ...(formMsg && Object.keys(mappedErrors).length === 0 ? { form: formMsg } : {}),
        ...mappedErrors,
      }));
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
            <span>{toPlainText(errors.form)}</span>
          </div>
        )}

        {/* Customer Account Picker & Creation */}
        <div className="mb-2">
          <CustomerSelectWithModal
            selectedCustomerId={customerId}
            onSelectCustomer={(c: CustomerData) => {
              setCustomerId(c.id);
              setCustomerName(c.name);
              if (c.phone) setCustomerPhone(c.phone);
              if (c.email) setCustomerEmail(c.email);
              if (c.address) setShippingAddress(c.address);
              setErrors((prev) => ({ ...prev, customerName: '', customerPhone: '', customerEmail: '' }));
            }}
            required={false}
            label="Customer Master Account (Search or Create)"
          />
        </div>

        {/* Customer Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <NameField
            id="orderCustomerName"
            label="Customer / Company Name"
            required
            value={customerName}
            onChange={(val) => {
              setCustomerName(val);
              if (touched.customerName) {
                const res = validateTextOnlyName(val);
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
            maxLength={60}
          />

          <PhoneField
            id="orderCustomerPhone"
            label="Customer Phone"
            required
            value={customerPhone}
            onChange={(val) => {
              setCustomerPhone(val);
              if (touched.customerPhone) {
                const res = validatePhone(val);
                setErrors((prev) => ({ ...prev, customerPhone: res.valid ? '' : res.error || '' }));
              }
            }}
            onBlur={() => {
              setTouched((prev) => ({ ...prev, customerPhone: true }));
              const res = validatePhone(customerPhone.trim());
              setErrors((prev) => ({ ...prev, customerPhone: res.valid ? '' : res.error || '' }));
            }}
            error={touched.customerPhone ? errors.customerPhone : null}
            placeholder="10-digit mobile number"
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
            placeholder="client@example.com"
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
                  <ProductField
                    value={line.skuId || line.name}
                    onChange={(payload) => {
                      const next = [...lines];
                      next[idx] = {
                        ...next[idx],
                        skuId: payload.skuId || '',
                        name: payload.name,
                        unitPrice: payload.unitPrice !== undefined ? String(payload.unitPrice) : next[idx].unitPrice,
                      };
                      setLines(next);
                    }}
                    placeholder="Pick catalog SKU or type custom item..."
                  />
                  {errors[`line_${idx}_name`] && (
                    <p className="text-[10px] text-red-500 mt-0.5">{errors[`line_${idx}_name`]}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="w-24">
                    <QuantityField
                      value={line.quantity}
                      onChange={(val) => handleLineChange(idx, 'quantity', String(val))}
                    />
                  </div>

                  <div className="w-28">
                    <MoneyField
                      value={line.unitPrice}
                      onChange={(val, raw) => handleLineChange(idx, 'unitPrice', raw !== undefined ? raw : String(val))}
                      placeholder="Rate (₹)"
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
        <div className="sticky bottom-0 bg-white dark:bg-[#181B26] p-4 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 border-t border-slate-200 dark:border-[#2A3042] flex flex-col-reverse sm:flex-row items-center justify-between gap-3 z-10 shadow-xs">
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
