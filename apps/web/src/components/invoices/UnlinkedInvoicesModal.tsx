import React, { useState, useMemo } from 'react';
import {
  Info,
  X,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  UserPlus,
  ArrowRight,
  Loader2,
  Check,
} from 'lucide-react';
import { invoicesApi, companiesApi } from '../../services/api';
import { formatIndianCurrency, isPlaceholderCustomerName, validateCustomerName } from '@crm/shared-validation';

export interface UnlinkedInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  docType: string;
  customerName: string;
  customerGstin?: string | null;
  totalAmount: number;
  balanceDue: number;
  paymentStatus: string;
  reason: string;
}

export interface RegisteredCustomer {
  id: string;
  name: string;
  gstin?: string | null;
  phone?: string | null;
  email?: string | null;
}

interface UnlinkedInvoicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  unlinkedInvoices: UnlinkedInvoice[];
  loading: boolean;
  registeredCustomers: RegisteredCustomer[];
  onRefresh?: () => Promise<void>;
  onSuccess?: (msg: string) => void;
}

export default function UnlinkedInvoicesModal({
  isOpen,
  onClose,
  unlinkedInvoices,
  loading,
  registeredCustomers,
  onRefresh,
  onSuccess,
}: UnlinkedInvoicesModalProps) {
  // Bulk selection state
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [bulkTargetCustomerId, setBulkTargetCustomerId] = useState<string>('');
  const [bulkLinking, setBulkLinking] = useState(false);

  // Single linking state
  const [linkingInvoiceId, setLinkingInvoiceId] = useState<string | null>(null);
  const [selectedTargetCustomerId, setSelectedTargetCustomerId] = useState<string>('');
  const [singleLinkingLoading, setSingleLinkingLoading] = useState(false);

  // Inline "Create & Link" state
  const [creatingForInvoiceId, setCreatingForInvoiceId] = useState<string | null>(null);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerGstin, setNewCustomerGstin] = useState('');
  const [creatingLoading, setCreatingLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedInvoiceIds(unlinkedInvoices.map((inv) => inv.id));
    } else {
      setSelectedInvoiceIds([]);
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedInvoiceIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Perform single link
  const handleSingleLink = async (invoiceId: string) => {
    if (!selectedTargetCustomerId) return;
    setSingleLinkingLoading(true);
    try {
      await invoicesApi.linkCustomer(invoiceId, selectedTargetCustomerId);
      setLinkingInvoiceId(null);
      setSelectedTargetCustomerId('');
      setSelectedInvoiceIds((prev) => prev.filter((id) => id !== invoiceId));
      if (onSuccess) onSuccess('Invoice successfully linked to customer.');
      if (onRefresh) await onRefresh();
    } catch (err: any) {
      alert(err?.response?.data?.message || err?.message || 'Failed to link customer.');
    } finally {
      setSingleLinkingLoading(false);
    }
  };

  // Perform bulk link
  const handleBulkLink = async () => {
    if (selectedInvoiceIds.length === 0 || !bulkTargetCustomerId) return;
    setBulkLinking(true);
    try {
      await invoicesApi.bulkLinkCustomer(selectedInvoiceIds, bulkTargetCustomerId);
      const count = selectedInvoiceIds.length;
      setSelectedInvoiceIds([]);
      setBulkTargetCustomerId('');
      if (onSuccess) onSuccess(`Successfully linked ${count} invoices to customer.`);
      if (onRefresh) await onRefresh();
    } catch (err: any) {
      alert(err?.response?.data?.message || err?.message || 'Failed to bulk link invoices.');
    } finally {
      setBulkLinking(false);
    }
  };

  // Open inline Create New Customer
  const openCreateNew = (inv: UnlinkedInvoice) => {
    setCreatingForInvoiceId(inv.id);
    setLinkingInvoiceId(null);
    setCreateError(null);
    // Prefill name only if not a placeholder name
    const rawName = (inv.customerName || '').trim();
    setNewCustomerName(isPlaceholderCustomerName(rawName) ? '' : rawName);
    setNewCustomerGstin(inv.customerGstin || '');
    setNewCustomerPhone('');
  };

  // Perform Create Customer & Link
  const handleCreateAndLink = async (invoiceId: string) => {
    const nameVal = validateCustomerName(newCustomerName);
    if (!nameVal.valid) {
      setCreateError(nameVal.error || 'Please enter a valid customer name.');
      return;
    }

    setCreatingLoading(true);
    setCreateError(null);
    try {
      // 1. Create company
      const companyRes = await companiesApi.create({
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim() || undefined,
        gstin: newCustomerGstin.trim().toUpperCase() || undefined,
      });
      const newCompanyId = companyRes.data?.id;
      if (!newCompanyId) {
        throw new Error('Failed to retrieve new customer ID.');
      }

      // 2. Link invoice
      await invoicesApi.linkCustomer(invoiceId, newCompanyId);

      setCreatingForInvoiceId(null);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewCustomerGstin('');
      setSelectedInvoiceIds((prev) => prev.filter((id) => id !== invoiceId));

      if (onSuccess) onSuccess(`Created "${newCustomerName.trim()}" and linked invoice.`);
      if (onRefresh) await onRefresh();
    } catch (err: any) {
      setCreateError(err?.response?.data?.message || err?.message || 'Failed to create and link customer.');
    } finally {
      setCreatingLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/20 shrink-0">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                <span>Unlinked Invoices Reconciliation</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  {unlinkedInvoices.length} unlinked
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Link unlinked invoices to registered customer accounts via dropdown, new registration, or bulk actions.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Bulk Action Bar (Visible when >= 1 selected) */}
        {selectedInvoiceIds.length > 0 && (
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border-b border-indigo-200 dark:border-indigo-900/60 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-indigo-900 dark:text-indigo-300">
                {selectedInvoiceIds.length} {selectedInvoiceIds.length === 1 ? 'invoice' : 'invoices'} selected
              </span>
              <button
                onClick={() => setSelectedInvoiceIds([])}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Clear
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={bulkTargetCustomerId}
                onChange={(e) => setBulkTargetCustomerId(e.target.value)}
                className="px-2.5 py-1 text-xs bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 rounded-lg text-slate-900 dark:text-white focus:outline-none max-w-xs"
              >
                <option value="">Select target customer for bulk link...</option>
                {registeredCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.gstin ? `(${c.gstin})` : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={handleBulkLink}
                disabled={!bulkTargetCustomerId || bulkLinking}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold disabled:opacity-50 transition flex items-center gap-1.5"
              >
                {bulkLinking ? <Loader2 size={13} className="animate-spin" /> : <UserCheck size={13} />}
                <span>Bulk Link ({selectedInvoiceIds.length})</span>
              </button>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              <span>Loading unlinked invoices...</span>
            </div>
          ) : unlinkedInvoices.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                All invoices are clean & deterministically matched!
              </p>
              <p className="text-xs text-slate-500">
                No unlinked or ambiguous invoices found in the system.
              </p>
            </div>
          ) : (
            <div>
              {/* DESKTOP TABLE VIEW (1536x730 & screens >= md) */}
              <div className="hidden md:block overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 font-bold text-slate-700 dark:text-slate-300">
                      <th className="py-2.5 px-3 w-8">
                        <input
                          type="checkbox"
                          checked={selectedInvoiceIds.length === unlinkedInvoices.length && unlinkedInvoices.length > 0}
                          onChange={(e) => handleSelectAll(e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-0"
                        />
                      </th>
                      <th className="py-2.5 px-3">Invoice No.</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Party on Invoice</th>
                      <th className="py-2.5 px-3">GSTIN</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                      <th className="py-2.5 px-3 min-w-[200px] max-w-[280px]">Reason / Ambiguity</th>
                      <th className="py-2.5 px-3 text-right min-w-[220px]">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                    {unlinkedInvoices.map((inv) => {
                      const isSelected = selectedInvoiceIds.includes(inv.id);
                      const isLinkingThis = linkingInvoiceId === inv.id;
                      const isCreatingThis = creatingForInvoiceId === inv.id;

                      return (
                        <React.Fragment key={inv.id}>
                          <tr className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/30 ${isSelected ? 'bg-indigo-50/30 dark:bg-indigo-950/20' : ''}`}>
                            <td className="py-2.5 px-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectOne(inv.id)}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-0"
                              />
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                              {inv.invoiceNumber}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">
                              {inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().slice(0, 10) : '-'}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                              {inv.customerName || <span className="text-slate-400 italic">None</span>}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                              {inv.customerGstin || <span className="text-slate-400 italic">None</span>}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                              ₹{formatIndianCurrency(inv.totalAmount)}
                            </td>
                            <td className="py-2.5 px-3 min-w-[200px] max-w-[280px]">
                              <div className="px-2.5 py-1 rounded text-[11px] font-medium leading-relaxed bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-900/60 break-words">
                                {inv.reason}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              {isLinkingThis ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <select
                                    value={selectedTargetCustomerId}
                                    onChange={(e) => setSelectedTargetCustomerId(e.target.value)}
                                    className="px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-indigo-400 rounded-lg text-slate-900 dark:text-white focus:outline-none max-w-[140px]"
                                  >
                                    <option value="">Select customer...</option>
                                    {registeredCustomers.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name} {c.gstin ? `(${c.gstin})` : ''}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={() => handleSingleLink(inv.id)}
                                    disabled={!selectedTargetCustomerId || singleLinkingLoading}
                                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold disabled:opacity-50 transition"
                                  >
                                    {singleLinkingLoading ? '...' : 'Link'}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setLinkingInvoiceId(null);
                                      setSelectedTargetCustomerId('');
                                    }}
                                    className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 rounded-lg text-xs font-semibold"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : isCreatingThis ? (
                                <span className="text-xs text-indigo-600 font-bold">Creating customer...</span>
                              ) : (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => {
                                      setLinkingInvoiceId(inv.id);
                                      setCreatingForInvoiceId(null);
                                      setSelectedTargetCustomerId('');
                                    }}
                                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs font-bold transition flex items-center gap-1"
                                  >
                                    <UserCheck size={12} />
                                    <span>Link</span>
                                  </button>
                                  <button
                                    onClick={() => openCreateNew(inv)}
                                    className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold transition flex items-center gap-1"
                                  >
                                    <UserPlus size={12} />
                                    <span>Create New</span>
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>

                          {/* Inline Create New Customer Sub-row */}
                          {isCreatingThis && (
                            <tr className="bg-amber-50/40 dark:bg-amber-950/20">
                              <td colSpan={8} className="p-3">
                                <div className="p-3 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700/60 rounded-xl space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-xs text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                                      <UserPlus size={14} />
                                      <span>Create New Customer & Link to Invoice {inv.invoiceNumber}</span>
                                    </span>
                                    <button
                                      onClick={() => setCreatingForInvoiceId(null)}
                                      className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                                    >
                                      ✕ Cancel
                                    </button>
                                  </div>

                                  {createError && (
                                    <div className="p-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded text-xs text-red-600 dark:text-red-400">
                                      {createError}
                                    </div>
                                  )}

                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                                    <div>
                                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                                        Customer Name *
                                      </label>
                                      <input
                                        type="text"
                                        value={newCustomerName}
                                        onChange={(e) => setNewCustomerName(e.target.value)}
                                        placeholder="e.g. Acme Industrial Solutions"
                                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                                        Mobile / Phone
                                      </label>
                                      <input
                                        type="text"
                                        value={newCustomerPhone}
                                        onChange={(e) => setNewCustomerPhone(e.target.value)}
                                        placeholder="10-digit mobile"
                                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                                        GSTIN (Optional)
                                      </label>
                                      <input
                                        type="text"
                                        value={newCustomerGstin}
                                        onChange={(e) => setNewCustomerGstin(e.target.value.toUpperCase())}
                                        placeholder="15-character GSTIN"
                                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs uppercase font-mono"
                                      />
                                    </div>
                                  </div>

                                  <div className="flex justify-end gap-2 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => setCreatingForInvoiceId(null)}
                                      className="px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-600 text-xs text-slate-700 dark:text-slate-300"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleCreateAndLink(inv.id)}
                                      disabled={creatingLoading || !newCustomerName.trim()}
                                      className="px-3.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs disabled:opacity-50 transition"
                                    >
                                      {creatingLoading ? 'Creating & Linking...' : 'Save & Link to Invoice'}
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* MOBILE CARD VIEW (390px & screens < md) */}
              <div className="block md:hidden space-y-3">
                {unlinkedInvoices.map((inv) => {
                  const isSelected = selectedInvoiceIds.includes(inv.id);
                  const isLinkingThis = linkingInvoiceId === inv.id;
                  const isCreatingThis = creatingForInvoiceId === inv.id;

                  return (
                    <div
                      key={inv.id}
                      className={`p-3.5 rounded-xl border transition space-y-2.5 ${
                        isSelected
                          ? 'border-indigo-400 bg-indigo-50/30 dark:bg-indigo-950/20 dark:border-indigo-600'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60'
                      }`}
                    >
                      {/* Top Header: Checkbox, Invoice Number, Date, Amount */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(inv.id)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-0"
                          />
                          <span className="font-mono font-bold text-xs text-indigo-600 dark:text-indigo-400">
                            {inv.invoiceNumber}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                            ₹{formatIndianCurrency(inv.totalAmount)}
                          </span>
                        </div>
                      </div>

                      {/* Party Info */}
                      <div className="text-xs space-y-0.5">
                        <div className="flex items-center justify-between text-slate-500">
                          <span>Party on Invoice:</span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {inv.customerName || 'None'}
                          </span>
                        </div>
                        {inv.customerGstin && (
                          <div className="flex items-center justify-between text-slate-500">
                            <span>GSTIN:</span>
                            <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                              {inv.customerGstin}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-slate-500 text-[11px]">
                          <span>Invoice Date:</span>
                          <span className="font-mono">
                            {inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().slice(0, 10) : '-'}
                          </span>
                        </div>
                      </div>

                      {/* Prominent Amber Reason Callout (Clearly readable at 390px) */}
                      <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                        <span className="font-bold text-amber-950 dark:text-amber-100 block mb-0.5">
                          Reason / Ambiguity:
                        </span>
                        {inv.reason}
                      </div>

                      {/* Action Controls */}
                      {isLinkingThis ? (
                        <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                          <select
                            value={selectedTargetCustomerId}
                            onChange={(e) => setSelectedTargetCustomerId(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-indigo-400 rounded-lg text-slate-900 dark:text-white focus:outline-none"
                          >
                            <option value="">Select customer to link...</option>
                            {registeredCustomers.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} {c.gstin ? `(${c.gstin})` : ''}
                              </option>
                            ))}
                          </select>
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => {
                                setLinkingInvoiceId(null);
                                setSelectedTargetCustomerId('');
                              }}
                              className="px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-semibold"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSingleLink(inv.id)}
                              disabled={!selectedTargetCustomerId || singleLinkingLoading}
                              className="px-3.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold disabled:opacity-50"
                            >
                              {singleLinkingLoading ? 'Linking...' : 'Link to Customer'}
                            </button>
                          </div>
                        </div>
                      ) : isCreatingThis ? (
                        <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                          <span className="font-bold text-xs text-amber-900 dark:text-amber-300 block">
                            Create New Customer
                          </span>
                          {createError && (
                            <div className="p-2 bg-red-50 text-red-600 rounded text-xs">
                              {createError}
                            </div>
                          )}
                          <input
                            type="text"
                            value={newCustomerName}
                            onChange={(e) => setNewCustomerName(e.target.value)}
                            placeholder="Customer Name *"
                            className="w-full px-2.5 py-1.5 rounded-lg border text-xs"
                          />
                          <input
                            type="text"
                            value={newCustomerPhone}
                            onChange={(e) => setNewCustomerPhone(e.target.value)}
                            placeholder="Mobile / Phone"
                            className="w-full px-2.5 py-1.5 rounded-lg border text-xs"
                          />
                          <input
                            type="text"
                            value={newCustomerGstin}
                            onChange={(e) => setNewCustomerGstin(e.target.value.toUpperCase())}
                            placeholder="GSTIN (Optional)"
                            className="w-full px-2.5 py-1.5 rounded-lg border text-xs uppercase font-mono"
                          />
                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              onClick={() => setCreatingForInvoiceId(null)}
                              className="px-3 py-1 rounded-lg border text-xs"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleCreateAndLink(inv.id)}
                              disabled={creatingLoading || !newCustomerName.trim()}
                              className="px-3 py-1 rounded-lg bg-indigo-600 text-white font-bold text-xs disabled:opacity-50"
                            >
                              {creatingLoading ? 'Saving...' : 'Save & Link'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                          <button
                            onClick={() => {
                              setLinkingInvoiceId(inv.id);
                              setCreatingForInvoiceId(null);
                              setSelectedTargetCustomerId('');
                            }}
                            className="flex-1 py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5"
                          >
                            <UserCheck size={13} />
                            <span>Link to Customer</span>
                          </button>
                          <button
                            onClick={() => openCreateNew(inv)}
                            className="flex-1 py-1.5 px-3 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5"
                          >
                            <UserPlus size={13} />
                            <span>Create New</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
