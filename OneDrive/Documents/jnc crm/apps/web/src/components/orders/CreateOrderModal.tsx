import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, ShoppingCart, User, Phone, Mail, MapPin, Package, Check, AlertCircle } from 'lucide-react';
import { ordersApi, inventoryApi } from '../../services/api';
import { Sku, Order } from '../../types';

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderCreated?: (order: Order) => void;
}

interface OrderLineItem {
  skuId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  availableStock?: number;
  skuName?: string;
  skuCode?: string;
}

export default function CreateOrderModal({ isOpen, onClose, onOrderCreated }: CreateOrderModalProps) {
  const [skus, setSkus] = useState<Sku[]>([]);
  const [loadingSkus, setLoadingSkus] = useState(false);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [notes, setNotes] = useState('');

  const [lines, setLines] = useState<OrderLineItem[]>([
    { skuId: '', name: '', quantity: 1, unitPrice: 0 },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchSkus();
      setError(null);
    }
  }, [isOpen]);

  const fetchSkus = async () => {
    try {
      setLoadingSkus(true);
      const { data } = await inventoryApi.getSkus();
      setSkus(data.items || data || []);
    } catch (err) {
      console.error('Failed to load SKUs', err);
    } finally {
      setLoadingSkus(false);
    }
  };

  const handleSelectSku = (index: number, skuId: string) => {
    const selectedSku = skus.find((s) => s.id === skuId);
    setLines((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        skuId,
        name: selectedSku ? selectedSku.name : copy[index].name,
        unitPrice: selectedSku ? selectedSku.unitPrice : copy[index].unitPrice,
        availableStock: selectedSku?.totalAvailable ?? 999,
        skuName: selectedSku?.name,
        skuCode: selectedSku?.skuCode,
      };
      return copy;
    });
  };

  const handleNameChange = (index: number, name: string) => {
    setLines((prev) => {
      const copy = [...prev];
      const matched = skus.find(
        (s) =>
          s.name.toLowerCase() === name.toLowerCase() ||
          s.skuCode.toLowerCase() === name.toLowerCase()
      );
      copy[index] = {
        ...copy[index],
        skuId: matched ? matched.id : '',
        name,
        unitPrice: matched ? matched.unitPrice : copy[index].unitPrice,
        skuName: matched?.name,
        skuCode: matched?.skuCode,
      };
      return copy;
    });
  };

  const handleQuantityChange = (index: number, quantity: number) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], quantity: Math.max(1, quantity) };
      return copy;
    });
  };

  const handleUnitPriceChange = (index: number, unitPrice: number) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], unitPrice: Math.max(0, unitPrice) };
      return copy;
    });
  };

  const addLine = () => {
    setLines((prev) => [...prev, { skuId: '', name: '', quantity: 1, unitPrice: 0 }]);
  };

  const removeLine = (index: number) => {
    if (lines.length === 1) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const subtotal = lines.reduce((sum, l) => sum + (l.quantity * l.unitPrice || 0), 0);
  const gstTax = subtotal * 0.18;
  const totalAmount = subtotal + gstTax;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!customerName.trim()) {
      setError('Customer name is required.');
      return;
    }
    if (!customerPhone.trim()) {
      setError('Customer phone number is required.');
      return;
    }

    const validLines = lines.filter((l) => (l.skuId || l.name.trim()) && l.quantity > 0);
    if (validLines.length === 0) {
      setError('Please type or select at least one equipment / product name.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim() || undefined,
        shippingAddress: shippingAddress.trim() || undefined,
        notes: notes.trim() || undefined,
        lines: validLines.map((l) => ({
          skuId: l.skuId || undefined,
          name: l.name.trim() || undefined,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
        })),
      };

      const { data } = await ordersApi.create(payload);
      if (onOrderCreated) {
        onOrderCreated(data);
      }
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || 'Failed to create order');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          className="card w-full max-w-3xl border-slate-200 dark:border-[#2A3042] shadow-2xl p-6 bg-white dark:bg-[#181B26] overflow-y-auto max-h-[92vh]"
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-[#2A3042] mb-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-crm-blue/20 text-crm-blue flex items-center justify-center">
                <ShoppingCart size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-950 dark:text-white">Create New Order</h2>
                <p className="text-xs text-slate-400">
                  Type custom product names or pick from catalog inventory with live GST calculation
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white"
            >
              <X size={16} />
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/15 border border-red-500/30 text-crm-coral text-xs flex items-center gap-2">
              <AlertCircle size={15} /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Customer Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Customer / Company Name *</label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    required
                    className="input pl-9 text-xs"
                    placeholder="Enter customer or company name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="label">Customer Phone *</label>
                <div className="relative">
                  <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    required
                    className="input pl-9 text-xs font-mono"
                    placeholder="Enter phone number"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Customer Email (Optional)</label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    className="input pl-9 text-xs font-mono"
                    placeholder="billing@customer.com"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="label">Delivery / Site Address</label>
                <div className="relative">
                  <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    className="input pl-9 text-xs"
                    placeholder="Enter delivery or site address"
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <label className="label text-slate-800 dark:text-slate-200 font-bold mb-0 flex items-center gap-1.5">
                  <Package size={14} className="text-amber-600 dark:text-crm-amber" /> Equipment / Product Line Items *
                </label>
                <button
                  type="button"
                  onClick={addLine}
                  className="btn bg-slate-100 dark:bg-[#141722] hover:bg-slate-200 dark:hover:bg-[#1E2230] border border-slate-300 dark:border-[#2A3042] text-crm-blue text-[11px] py-1 px-2.5 gap-1 flex items-center font-bold"
                >
                  <Plus size={12} /> Add Item
                </button>
              </div>

              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {lines.map((line, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-slate-100 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042] space-y-2 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10.5px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                        Item #{idx + 1} - Product / SKU Details
                      </span>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          className="p-1 rounded text-slate-500 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                          title="Remove Line"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                      {/* Product Name Input */}
                      <div className="sm:col-span-6">
                        <label className="text-[10px] text-slate-700 dark:text-slate-400 uppercase font-bold mb-1 block">
                          Product Name / SKU *
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            required
                            className="input text-xs pl-2.5 pr-7 font-bold text-slate-950 dark:text-white"
                            placeholder="Type or select product name / SKU..."
                            value={line.name}
                            onChange={(e) => handleNameChange(idx, e.target.value)}
                            list={`sku-options-${idx}`}
                          />
                          {line.name && (
                            <button
                              type="button"
                              onClick={() => {
                                handleNameChange(idx, '');
                                handleSelectSku(idx, '');
                              }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white p-0.5"
                              title="Clear"
                            >
                              <X size={12} />
                            </button>
                          )}
                          <datalist id={`sku-options-${idx}`}>
                            {skus.map((s) => (
                              <option key={s.id} value={s.name}>
                                [{s.skuCode}] ₹{s.unitPrice}
                              </option>
                            ))}
                          </datalist>
                        </div>
                      </div>

                      {/* Quantity */}
                      <div className="sm:col-span-2">
                        <label className="text-[10px] text-slate-700 dark:text-slate-400 uppercase font-bold mb-1 block">Qty</label>
                        <input
                          type="number"
                          min="1"
                          required
                          className="input text-xs text-center font-mono font-bold text-slate-950 dark:text-white"
                          placeholder="Qty"
                          value={line.quantity}
                          onChange={(e) => handleQuantityChange(idx, parseInt(e.target.value) || 1)}
                        />
                      </div>

                      {/* Unit Price */}
                      <div className="sm:col-span-4">
                        <label className="text-[10px] text-slate-700 dark:text-slate-400 uppercase font-bold mb-1 block">Unit Rate (₹)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          className="input text-xs text-right font-mono font-bold text-slate-950 dark:text-white"
                          placeholder="Rate (₹)"
                          value={line.unitPrice}
                          onChange={(e) => handleUnitPriceChange(idx, parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </div>

                    <div className="text-right text-[11px] text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-[#2A3042]/50 font-medium">
                      Line Total: <strong className="text-slate-950 dark:text-white font-mono font-bold">₹{(line.quantity * line.unitPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Calculations Box */}
            <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042] space-y-1.5 text-xs shadow-sm">
              <div className="flex justify-between text-slate-700 dark:text-slate-400 font-bold">
                <span>Taxable Subtotal:</span>
                <span className="font-mono font-black text-slate-950 dark:text-slate-200">
                  ₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-slate-700 dark:text-slate-400 font-bold">
                <span>Estimated GST (18%):</span>
                <span className="font-mono font-black text-slate-950 dark:text-slate-300">
                  ₹{gstTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-sm font-bold text-slate-950 dark:text-white pt-1.5 border-t border-slate-300 dark:border-[#2A3042]">
                <span>Total Order Amount:</span>
                <span className="font-mono text-amber-600 dark:text-crm-amber font-black text-base">
                  ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="label">Order Notes / Terms</label>
              <textarea
                rows={2}
                className="input text-xs resize-none"
                placeholder="Enter order remarks or terms..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-[#2A3042]">
              <button
                type="button"
                onClick={onClose}
                className="btn-ghost text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="btn-primary text-xs px-6 shadow-glow-blue flex items-center gap-1.5"
              >
                <Check size={14} />
                {submitting ? 'Confirming Order...' : 'Confirm Order & Reserve Stock'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
