/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Search,
  RefreshCw,
  Plus,
  GitMerge,
  Archive,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Building,
  FileText,
  Clock,
  Sparkles,
  X,
  Phone,
  Mail,
  Receipt,
  Layers,
} from 'lucide-react';
import { companiesApi } from '../services/api';
import { UnifiedErrorComponent } from '../components/common/UnifiedErrorComponent';

interface UnifiedCustomer {
  id: string;
  isRegistered: boolean;
  name: string;
  gstin: string | null;
  phone: string | null;
  email: string | null;
  balance: number;
  documentCount: number;
  lastActivity: string;
  isArchived: boolean;
  source: string;
  isDemo?: boolean;
}

interface DuplicateCluster {
  reason: string;
  key: string;
  customers: UnifiedCustomer[];
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<UnifiedCustomer[]>([]);
  const [possibleDuplicates, setPossibleDuplicates] = useState<DuplicateCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'registered' | 'unregistered' | 'archived'>('all');
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);

  // Modals state
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    name: '',
    gstin: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: 'Karnataka',
  });
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  // Merge state
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeSource, setMergeSource] = useState<UnifiedCustomer | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>('');
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  // Toast message
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // In-App Archive Confirmation Modal State (replaces native window.confirm)
  const [customerToArchive, setCustomerToArchive] = useState<UnifiedCustomer | null>(null);
  const [archiving, setArchiving] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const loadCustomers = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await companiesApi.getUnifiedCustomers({ includeArchived: true, search });
      setCustomers(res.data?.items || []);
      setPossibleDuplicates(res.data?.possibleDuplicates || []);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(loadCustomers, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search]);

  // Filtered customer list
  const filteredCustomers = useMemo(() => {
    let list = customers;
    if (filterType === 'registered') {
      list = list.filter((c) => c.isRegistered && !c.isArchived);
    } else if (filterType === 'unregistered') {
      list = list.filter((c) => !c.isRegistered && !c.isArchived);
    } else if (filterType === 'archived') {
      list = list.filter((c) => c.isArchived);
    } else {
      // 'all' shows active registered and unregistered by default
      list = list.filter((c) => !c.isArchived);
    }

    if (showDuplicatesOnly) {
      const dupIds = new Set<string>();
      possibleDuplicates.forEach((cluster) => {
        cluster.customers.forEach((c) => dupIds.add(c.id));
      });
      list = list.filter((c) => dupIds.has(c.id));
    }

    return list;
  }, [customers, filterType, showDuplicatesOnly, possibleDuplicates]);

  // Action: Open Register Modal
  const handleOpenRegister = (cust?: UnifiedCustomer) => {
    setRegisterForm({
      name: cust?.name || '',
      gstin: cust?.gstin || '',
      phone: cust?.phone || '',
      email: cust?.email || '',
      address: '',
      city: '',
      state: 'Karnataka',
    });
    setRegisterError(null);
    setShowRegisterModal(true);
  };

  // Submit Register & Link
  const handleSubmitRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerForm.name.trim()) {
      setRegisterError('Customer name is required.');
      return;
    }
    setRegistering(true);
    setRegisterError(null);
    try {
      const res = await companiesApi.registerAndLink(registerForm);
      showToast(
        `Customer "${res.data?.company?.name}" registered and linked (${res.data?.linkedInvoicesCount || 0} invoices, ${res.data?.linkedOrdersCount || 0} orders).`
      );
      setShowRegisterModal(false);
      await loadCustomers();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to register customer. Please verify input.';
      setRegisterError(msg);
    } finally {
      setRegistering(false);
    }
  };

  // Action: Open Merge Modal
  const handleOpenMerge = (source: UnifiedCustomer, presetTarget?: UnifiedCustomer) => {
    setMergeSource(source);
    setMergeTargetId(presetTarget ? presetTarget.id : '');
    setMergeError(null);
    setShowMergeModal(true);
  };

  // Submit Merge
  const handleSubmitMerge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mergeSource || !mergeTargetId || mergeSource.id === mergeTargetId) {
      setMergeError('Please select a distinct target customer to receive documents.');
      return;
    }
    setMerging(true);
    setMergeError(null);
    try {
      const res = await companiesApi.merge({
        sourceCompanyId: mergeSource.id,
        targetCompanyId: mergeTargetId,
      });
      showToast(
        `Merged "${mergeSource.name}" into "${res.data?.targetCompany?.name}". (${res.data?.movedInvoices || 0} invoices, ${res.data?.movedOrders || 0} orders moved).`
      );
      setShowMergeModal(false);
      await loadCustomers();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to merge customers. Period lock may prevent modifying historical documents.';
      setMergeError(msg);
    } finally {
      setMerging(false);
    }
  };

  // Action: Archive Customer (Opens In-App Confirmation Modal)
  const handleArchive = (cust: UnifiedCustomer) => {
    setCustomerToArchive(cust);
  };

  // Confirm Archive Action (Invoked from In-App Modal)
  const handleConfirmArchive = async () => {
    if (!customerToArchive) return;
    try {
      setArchiving(true);
      await companiesApi.archive(customerToArchive.id);
      showToast(`Customer "${customerToArchive.name}" archived successfully.`);
      setCustomerToArchive(null);
      await loadCustomers();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Failed to archive customer.', 'error');
    } finally {
      setArchiving(false);
    }
  };

  // Action: Unarchive Customer
  const handleUnarchive = async (cust: UnifiedCustomer) => {
    try {
      await companiesApi.unarchive(cust.id);
      showToast(`Customer "${cust.name}" unarchived.`);
      await loadCustomers();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Failed to unarchive customer.', 'error');
    }
  };

  if (error && customers.length === 0) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 select-none">
        <UnifiedErrorComponent
          error={error}
          page="Customers Page"
          onRetry={loadCustomers}
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 select-none">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-xl border flex items-center gap-3 transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-300 dark:border-emerald-600/40 text-emerald-900 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/80 border-rose-300 dark:border-rose-600/40 text-rose-900 dark:text-rose-200'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span className="text-xs font-semibold">{toast.message}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-crm-blue/10 text-crm-blue dark:bg-crm-blue/20">
              <Users size={22} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Customers
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Manage registered accounts, unlinked parties, deduplication, and document histories
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadCustomers()}
            disabled={loading}
            className="btn bg-white dark:bg-[#141722] hover:bg-slate-100 dark:hover:bg-[#202534] border border-slate-300 dark:border-[#2A3042] text-xs font-bold gap-1.5 py-2 px-3 shadow-sm"
            title="Refresh list"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={() => handleOpenRegister()}
            className="btn bg-crm-blue hover:bg-crm-blue-hover text-white text-xs font-bold gap-1.5 py-2 px-3.5 shadow-glow-blue"
          >
            <Plus size={15} />
            <span>Register Customer</span>
          </button>
        </div>
      </div>

      {/* Duplicates Banner Alert */}
      {possibleDuplicates.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-600/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-400 shrink-0">
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-900 dark:text-amber-300">
                {possibleDuplicates.length} Duplicate Group{possibleDuplicates.length > 1 ? 's' : ''} Detected
              </h3>
              <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                Found accounts sharing normalized names or GSTINs. You can merge duplicates safely to preserve period locks and audit logs.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowDuplicatesOnly((prev) => !prev)}
            className={`btn text-xs font-bold px-3 py-1.5 rounded-lg border whitespace-nowrap ${
              showDuplicatesOnly
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-white dark:bg-[#181B26] text-amber-800 dark:text-amber-400 border-amber-300 dark:border-amber-600/40 hover:bg-amber-100/50'
            }`}
          >
            {showDuplicatesOnly ? 'Show All Customers' : 'Review Duplicates'}
          </button>
        </div>
      )}

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            className="input pl-10 pr-4 py-2 text-xs w-full rounded-xl bg-white dark:bg-[#141722] border-slate-300 dark:border-[#2A3042]"
            placeholder="Search by name, GSTIN, phone, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'all', label: 'All Active' },
            { id: 'registered', label: 'Registered' },
            { id: 'unregistered', label: 'Unregistered' },
            { id: 'archived', label: 'Archived' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setFilterType(tab.id as any);
                setShowDuplicatesOnly(false);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
                filterType === tab.id && !showDuplicatesOnly
                  ? 'bg-crm-blue text-white border-crm-blue shadow-glow-blue'
                  : 'bg-white dark:bg-[#141722] text-slate-700 dark:text-slate-400 border-slate-300 dark:border-[#2A3042] hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <UnifiedErrorComponent
          error={error}
          page="Customers Page"
          onRetry={loadCustomers}
        />
      )}

      {/* Main Customers Table */}
      {!error && (
        <div className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-800 dark:text-slate-200">
              <thead className="bg-slate-50 dark:bg-[#141722] border-b border-slate-200 dark:border-[#2A3042] text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-3 px-4">Customer Name</th>
                  <th className="py-3 px-4">GSTIN & Contact</th>
                  <th className="py-3 px-4 text-right">Balance Due</th>
                  <th className="py-3 px-4 text-center">Docs</th>
                  <th className="py-3 px-4">Last Activity</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading && customers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-500">
                      <RefreshCw size={20} className="animate-spin text-crm-blue mx-auto mb-2" />
                      <span>Loading customer accounts...</span>
                    </td>
                  </tr>
                )}

                {!loading && filteredCustomers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-500">
                      No customers match your criteria. Click "Register Customer" to create an account.
                    </td>
                  </tr>
                )}

                {filteredCustomers.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-[#1f2433] transition-colors"
                  >
                    {/* Name */}
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        <span>{c.name}</span>
                        {c.isDemo && (
                          <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                            DEMO
                          </span>
                        )}
                        {c.source === 'test' && (
                          <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                            TEST
                          </span>
                        )}
                      </div>
                    </td>

                    {/* GSTIN & Contact */}
                    <td className="py-3 px-4">
                      <div className="space-y-0.5 text-[11px]">
                        {c.gstin ? (
                          <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                            {c.gstin}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">No GSTIN</span>
                        )}
                        {(c.phone || c.email) && (
                          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                            {c.phone && <span>{c.phone}</span>}
                            {c.email && <span>• {c.email}</span>}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Balance */}
                    <td className="py-3 px-4 text-right font-mono font-bold">
                      {c.balance > 0 ? (
                        <span className="text-rose-600 dark:text-rose-400">
                          ₹{c.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })} Dr
                        </span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400">₹0.00</span>
                      )}
                    </td>

                    {/* Document count */}
                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {c.documentCount}
                      </span>
                    </td>

                    {/* Last activity */}
                    <td className="py-3 px-4 text-slate-500 text-[11px]">
                      {c.lastActivity ? c.lastActivity.slice(0, 10) : '—'}
                    </td>

                    {/* Status badge */}
                    <td className="py-3 px-4">
                      {c.isArchived ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          Archived
                        </span>
                      ) : c.isRegistered ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800/40">
                          Registered
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800/40">
                          Unregistered
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {!c.isRegistered && (
                          <button
                            onClick={() => handleOpenRegister(c)}
                            className="btn bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] py-1 px-2.5 rounded-lg shadow-sm"
                            title="Register account and link all invoices"
                          >
                            Register
                          </button>
                        )}

                        {c.isRegistered && !c.isArchived && (
                          <button
                            onClick={() => handleOpenMerge(c)}
                            className="btn bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40 font-bold text-[11px] py-1 px-2.5 rounded-lg"
                            title="Merge duplicates into another customer"
                          >
                            <GitMerge size={12} className="inline mr-1" /> Merge
                          </button>
                        )}

                        {c.isArchived ? (
                          <button
                            onClick={() => handleUnarchive(c)}
                            className="btn bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-[11px] py-1 px-2.5 rounded-lg"
                            title="Restore customer account"
                          >
                            <RotateCcw size={12} className="inline mr-1" /> Restore
                          </button>
                        ) : (
                          <button
                            onClick={() => handleArchive(c)}
                            className="btn bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/60 dark:hover:bg-slate-700/60 text-slate-600 dark:text-slate-400 font-bold text-[11px] py-1 px-2 rounded-lg"
                            title="Archive customer (hides from pickers, never deletes historical documents)"
                          >
                            <Archive size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Register & Link Customer */}
      {showRegisterModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs select-none"
        >
          <div className="w-full max-w-lg bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-crm-blue/10 text-crm-blue">
                  <Building size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Register Customer Account
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Creates customer and automatically links all existing invoices and orders
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitRegister} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Customer / Business Name *
                </label>
                <input
                  type="text"
                  required
                  className="input text-xs w-full py-1.5"
                  value={registerForm.name}
                  onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                  placeholder="e.g. Bharat Tech Solutions"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    GSTIN (Optional)
                  </label>
                  <input
                    type="text"
                    className="input text-xs w-full py-1.5 uppercase font-mono"
                    value={registerForm.gstin}
                    onChange={(e) => setRegisterForm({ ...registerForm, gstin: e.target.value.toUpperCase() })}
                    placeholder="29ABCDE1234F1Z5"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Phone
                  </label>
                  <input
                    type="text"
                    className="input text-xs w-full py-1.5"
                    value={registerForm.phone}
                    onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })}
                    placeholder="9876543210"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Billing Email
                </label>
                <input
                  type="email"
                  className="input text-xs w-full py-1.5"
                  value={registerForm.email}
                  onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                  placeholder="accounts@example.com"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    className="input text-xs w-full py-1.5"
                    value={registerForm.city}
                    onChange={(e) => setRegisterForm({ ...registerForm, city: e.target.value })}
                    placeholder="Bengaluru"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    State
                  </label>
                  <input
                    type="text"
                    className="input text-xs w-full py-1.5"
                    value={registerForm.state}
                    onChange={(e) => setRegisterForm({ ...registerForm, state: e.target.value })}
                    placeholder="Karnataka"
                  />
                </div>
              </div>

              {registerError && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                  {registerError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="btn bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold py-1.5 px-3 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={registering}
                  className="btn bg-crm-blue hover:bg-crm-blue-hover text-white text-xs font-bold py-1.5 px-4 rounded-lg shadow-glow-blue"
                >
                  {registering ? 'Registering & Linking...' : 'Register & Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Merge Duplicates */}
      {showMergeModal && mergeSource && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs select-none"
        >
          <div className="w-full max-w-lg bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <GitMerge size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Merge Duplicate Customer
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Move all invoices, orders, and payments into the target account
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowMergeModal(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitMerge} className="space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141722] border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase text-slate-400">
                  Source Customer (Will be archived &amp; merged)
                </span>
                <p className="font-bold text-slate-900 dark:text-white mt-0.5">
                  {mergeSource.name}
                </p>
                <p className="text-[11px] text-slate-500">
                  {mergeSource.documentCount} documents • Balance: ₹{mergeSource.balance.toFixed(2)}
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Select Target Customer (Will keep all documents) *
                </label>
                <select
                  value={mergeTargetId}
                  onChange={(e) => setMergeTargetId(e.target.value)}
                  className="input text-xs w-full py-2 bg-white dark:bg-[#141722]"
                  required
                >
                  <option value="">-- Choose target customer --</option>
                  {customers
                    .filter((c) => c.id !== mergeSource.id && c.isRegistered && !c.isArchived)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.gstin ? `(${c.gstin})` : ''} - {c.documentCount} docs
                      </option>
                    ))}
                </select>
              </div>

              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-700/40 text-[11px] text-amber-900 dark:text-amber-300 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle size={13} /> Accounting Period Lock &amp; Audit Note
                </p>
                <p>
                  Documents will be atomically reassigned and audit-logged. If any invoice or payment is in a locked accounting period, the merge will be safely refused.
                </p>
              </div>

              {mergeError && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                  {mergeError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowMergeModal(false)}
                  className="btn bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold py-1.5 px-3 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={merging || !mergeTargetId}
                  className="btn bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-1.5 px-4 rounded-lg shadow-sm"
                >
                  {merging ? 'Merging Documents...' : 'Confirm Merge'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── IN-APP ARCHIVE CONFIRMATION MODAL ────────────────────────────── */}
      {customerToArchive && (
        <div
          data-testid="archive-customer-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => !archiving && setCustomerToArchive(null)}
        >
          <div
            className="bg-white dark:bg-[#1a1f2e] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/20 dark:border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <Archive size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {customerToArchive.isDemo || customerToArchive.source === 'test'
                      ? 'Archive Test Record'
                      : 'Archive Customer'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Safe archive with full document history preservation
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !archiving && setCustomerToArchive(null)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                {customerToArchive.isDemo || customerToArchive.source === 'test'
                  ? `Archive test record "${customerToArchive.name}"? It will be removed from pickers.`
                  : `Archive customer "${customerToArchive.name}"? This hides it from pickers while permanently preserving historical documents.`}
              </p>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141722] border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="flex justify-between items-center text-slate-500 text-[11px]">
                  <span>Customer Name:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{customerToArchive.name}</span>
                </div>
                {customerToArchive.gstin && (
                  <div className="flex justify-between items-center text-slate-500 text-[11px]">
                    <span>GSTIN:</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">{customerToArchive.gstin}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-slate-500 text-[11px]">
                  <span>Historical Documents:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{customerToArchive.documentCount} docs</span>
                </div>
                <div className="flex justify-between items-center text-slate-500 text-[11px]">
                  <span>Current Balance:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">₹{customerToArchive.balance.toFixed(2)}</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-700/40 text-[11px] text-amber-900 dark:text-amber-300 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-amber-600 dark:text-amber-400" />
                  Preserves All Historical Records
                </p>
                <p className="text-[10.5px]">
                  No documents, invoices, orders, or payments are ever deleted. You can restore this customer account at any time from the &quot;Archived&quot; filter tab.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={archiving}
                onClick={() => setCustomerToArchive(null)}
                className="btn bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold py-2 px-3.5 rounded-xl disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={archiving}
                onClick={handleConfirmArchive}
                className="btn bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-sm disabled:opacity-50 flex items-center gap-1.5"
              >
                {archiving ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    Archiving...
                  </>
                ) : (
                  <>
                    <Archive size={13} />
                    Archive Customer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
