import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Edit3, User, Phone, Mail, MapPin, Package, AlertCircle, Save } from 'lucide-react';
import { ordersApi, inventoryApi } from '../../services/api';
import { Sku, Order } from '../../types';

interface EditOrderModalProps {
  isOpen: boolean;
  order: Order | null;
  onClose: () => void;
  onOrderUpdated?: (order: Order) => void;
}

interface OrderLineItem {
  skuId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  skuName?: string;
  skuCode?: string;
}

export default function EditOrderModal({
  isOpen,
  order,
  onClose,
  onOrderUpdated,
}: EditOrderModalProps) {
  const [skus, setSkus] = useState<Sku[]>([]);
  const [loadingSkus, setLoadingSkus] = useState(false);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('pending');
  const [status, setStatus] = useState('confirmed');
  const [notes, setNotes] = useState('');

  const [lines, setLines] = useState<OrderLineItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && order) {
      setCustomerName(order.customerName || '');
      setCustomerPhone(order.customerPhone || '');
      setCustomerEmail(order.customerEmail || '');
      setShippingAddress(order.shippingAddress || '');
      setPaymentStatus(order.paymentStatus || 'pending');
      setStatus(order.status || 'confirmed');
      setNotes(order.notes || '');

      if (order.lines && order.lines.length > 0) {
        setLines(
          order.lines.map((l) => ({
            skuId: l.skuId,
            name: l.sku?.name || '',
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            skuName: l.sku?.name,
            skuCode: l.sku?.skuCode,
          }))
        );
      } else {
        setLines([{ skuId: '', name: '', quantity: 1, unitPrice: 0 }]);
      }

      fetchSkus();
      setError(null);
    }
  }, [isOpen, order]);

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
    if (!order) return;

    if (!customerName.trim() || !customerPhone.trim()) {
      setError('Customer name and phone number are required.');
      return;
    }

    const validLines = lines.filter((l) => (l.skuId || l.name.trim()) && l.quantity > 0);
    if (validLines.length === 0) {
      setError('Please type or select at least one valid product line with quantity.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // 1. Update Order Content
      const { data } = await ordersApi.update(order.id, {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim() || undefined,
        shippingAddress: shippingAddress.trim() || undefined,
        paymentStatus,
        notes: notes.trim() || undefined,
        lines: validLines.map((l) => ({
          skuId: l.skuId || undefined,
          name: l.name.trim() || undefined,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
      });

      // 2. If status changed, update status
      if (status !== order.status) {
        await ordersApi.updateStatus(order.id, { status });
      }

      if (onOrderUpdated) {
        onOrderUpdated(data);
      }
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || 'Failed to update order');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !order) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto"
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-crm-blue/20 text-crm-blue flex items-center justify-center">
                <Edit3 size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-950 dark:text-white flex items-center gap-2">
                  Edit Order <span className="font-mono text-crm-amber">{order.orderNumber}</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Type custom product names or choose catalog items, change pricing, and update status
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white flex items-center justify-center"
            >
              <X size={18} />
            </button>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
            {error && (
              <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-crm-coral text-xs flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Customer Information Grid */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                <User size={14} className="text-crm-blue" /> Customer & Billing Information
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Customer / Company Name *</label>
                  <div className="relative">
                    <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
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
                      type="tel"
                      required
                      className="input pl-9 text-xs font-mono"
                      placeholder="Enter phone number"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Customer Email</label>
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
                  <label className="label">Shipping / Delivery Address</label>
                  <div className="relative">
                    <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      className="input pl-9 text-xs"
                      placeholder="Enter delivery or site address"
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Order Status & Payment Status Controls */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                <Package size={14} className="text-crm-teal" /> Order Lifecycle & Payment Status
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Order Status</label>
                  <select
                    className="input text-xs font-semibold"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="confirmed">Confirmed</option>
                    <option value="processing">Processing</option>
                    <option value="dispatched">Dispatched</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                <div>
                  <label className="label">Payment Status</label>
                  <select
                    className="input text-xs font-semibold"
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value)}
                  >
                    <option value="pending">Pending</option>
                    <option value="partial">Partial</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Equipment Items & Line Items Table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Package size={14} className="text-crm-amber" /> Equipment Line Items
                </h4>
                <button
                  type="button"
                  onClick={addLine}
                  className="btn bg-slate-50 dark:bg-[#1E2230] hover:bg-[#2A3042] border border-slate-200 dark:border-[#2A3042] text-crm-blue-light text-xs gap-1.5 py-1 px-3"
                >
                  <Plus size={13} /> Add Product Line
                </button>
              </div>

              <div className="space-y-3">
                {lines.map((line, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-slate-100 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042] space-y-2 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10.5px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                        Item #{idx + 1} - Product / SKU Details
                      </span>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          className="p-1 rounded text-slate-500 hover:text-crm-coral hover:bg-red-500/10 transition-colors"
                          title="Remove Line"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
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
                            list={`edit-sku-options-${idx}`}
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
                          <datalist id={`edit-sku-options-${idx}`}>
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
                        <label className="text-[10px] text-slate-700 dark:text-slate-400 uppercase font-bold mb-1 block">
                          Quantity *
                        </label>
                        <input
                          type="number"
                          min="1"
                          required
                          className="input text-xs font-mono text-center font-bold text-slate-950 dark:text-white"
                          value={line.quantity}
                          onChange={(e) => handleQuantityChange(idx, parseInt(e.target.value) || 1)}
                        />
                      </div>

                      {/* Unit Price */}
                      <div className="sm:col-span-4">
                        <label className="text-[10px] text-slate-700 dark:text-slate-400 uppercase font-bold mb-1 block">
                          Unit Rate (₹) *
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          className="input text-xs font-mono text-right font-bold text-slate-950 dark:text-white"
                          value={line.unitPrice}
                          onChange={(e) => handleUnitPriceChange(idx, parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </div>

                    {/* Line Total preview */}
                    <div className="text-right text-[11px] text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-[#2A3042]/50 font-medium">
                      Line Total: <strong className="text-slate-950 dark:text-white font-mono font-bold">₹{(line.quantity * line.unitPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Summary Box */}
            <div className="p-4 rounded-xl bg-slate-100 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042] space-y-2 text-xs shadow-sm">
              <div className="flex justify-between text-slate-700 dark:text-slate-400 font-bold">
                <span>Subtotal (Taxable Value):</span>
                <span className="font-mono text-slate-950 dark:text-white font-black">
                  ₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-slate-700 dark:text-slate-400 font-bold">
                <span>GST Tax (18%):</span>
                <span className="font-mono text-slate-950 dark:text-white font-black">
                  ₹{gstTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-sm font-bold pt-2 border-t border-slate-300 dark:border-[#2A3042] text-slate-950 dark:text-white">
                <span>Total Amount (Incl. GST):</span>
                <span className="font-mono text-emerald-700 dark:text-emerald-400 text-base font-black">
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
          </form>

          {/* Modal Footer Actions */}
          <div className="p-4 border-t border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="btn-ghost text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="btn-primary text-xs px-6 shadow-glow-blue flex items-center gap-1.5"
            >
              <Save size={14} /> {submitting ? 'Saving Changes...' : 'Save Order Changes'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
