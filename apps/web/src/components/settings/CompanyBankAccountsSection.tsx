/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2, Plus, Edit2, CheckCircle2, ShieldCheck, FileText,
  AlertCircle, RefreshCw, X, Check, EyeOff
} from 'lucide-react';
import { bankAccountsApi } from '../../services/api';
import {
  validateBankAccount,
  validateIfsc,
  validateUpiId,
  formatFriendlyErrorMessage,
} from '@crm/shared-validation';

export interface CompanyBankAccount {
  id: string;
  label?: string;
  bankName: string;
  holderName?: string;
  accountNumberLast4: string;
  maskedAccount: string;
  displayLabel: string;
  ifsc: string;
  branch?: string;
  upiId?: string;
  isDefault: boolean;
  isDocumentDefault: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export default function CompanyBankAccountsSection() {
  const [accounts, setAccounts] = useState<CompanyBankAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal / Drawer state for Add / Edit
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);

  const [form, setForm] = useState({
    label: '',
    bankName: '',
    holderName: '',
    accountNumber: '',
    ifsc: '',
    branch: '',
    upiId: '',
    isDefault: false,
    isDocumentDefault: false,
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await bankAccountsApi.getAll(true);
      setAccounts(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      setError(formatFriendlyErrorMessage(err, 'Failed to load company bank accounts.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const openAddModal = () => {
    setEditingId(null);
    setForm({
      label: '',
      bankName: '',
      holderName: '',
      accountNumber: '',
      ifsc: '',
      branch: '',
      upiId: '',
      isDefault: accounts.length === 0,
      isDocumentDefault: accounts.length === 0,
    });
    setFormErrors({});
    setShowModal(true);
  };

  const openEditModal = (acc: CompanyBankAccount) => {
    setEditingId(acc.id);
    setForm({
      label: acc.label || '',
      bankName: acc.bankName || '',
      holderName: acc.holderName || '',
      accountNumber: '', // Keep blank unless updating
      ifsc: acc.ifsc || '',
      branch: acc.branch || '',
      upiId: acc.upiId || '',
      isDefault: acc.isDefault,
      isDocumentDefault: acc.isDocumentDefault,
    });
    setFormErrors({});
    setShowModal(true);
  };

  const validateForm = () => {
    const errs: Record<string, string> = {};

    if (!form.bankName.trim()) {
      errs.bankName = 'Bank name is required.';
    }

    if (!editingId || form.accountNumber.trim()) {
      const accCheck = validateBankAccount(form.accountNumber, !editingId);
      if (!accCheck.valid) {
        errs.accountNumber = accCheck.error || 'Account number must be 9 to 18 digits.';
      }
    }

    const ifscCheck = validateIfsc(form.ifsc, true);
    if (!ifscCheck.valid) {
      errs.ifsc = ifscCheck.error || 'Valid 11-character IFSC required (e.g. HDFC0001234).';
    }

    if (form.upiId.trim()) {
      const upiCheck = validateUpiId(form.upiId, false);
      if (!upiCheck.valid) {
        errs.upiId = upiCheck.error || 'Valid UPI ID format required.';
      }
    }

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!validateForm()) return;

    setFormSaving(true);
    setFormErrors({});
    try {
      if (editingId) {
        const payload: any = {
          label: form.label.trim() || undefined,
          bankName: form.bankName.trim(),
          holderName: form.holderName.trim() || undefined,
          ifsc: form.ifsc.trim().toUpperCase(),
          branch: form.branch.trim() || undefined,
          upiId: form.upiId.trim() || undefined,
          isDefault: form.isDefault,
          isDocumentDefault: form.isDocumentDefault,
        };
        if (form.accountNumber.trim()) {
          payload.accountNumber = form.accountNumber.trim();
        }
        await bankAccountsApi.update(editingId, payload);
        setSuccess('Bank account updated successfully.');
      } else {
        await bankAccountsApi.create({
          label: form.label.trim() || undefined,
          bankName: form.bankName.trim(),
          holderName: form.holderName.trim() || undefined,
          accountNumber: form.accountNumber.trim(),
          ifsc: form.ifsc.trim().toUpperCase(),
          branch: form.branch.trim() || undefined,
          upiId: form.upiId.trim() || undefined,
          isDefault: form.isDefault,
          isDocumentDefault: form.isDocumentDefault,
        });
        setSuccess('Bank account added successfully.');
      }
      setShowModal(false);
      await loadAccounts();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to save bank account.';
      setFormErrors({ form: typeof msg === 'string' ? msg : 'Failed to save bank account.' });
    } finally {
      setFormSaving(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await bankAccountsApi.setDefault(id);
      setSuccess('Default payment receiving account updated.');
      await loadAccounts();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(formatFriendlyErrorMessage(err, 'Failed to set default bank account.'));
    }
  };

  const handleSetDocumentDefault = async (id: string) => {
    try {
      await bankAccountsApi.setDocumentDefault(id);
      setSuccess('Invoice settlement bank account updated.');
      await loadAccounts();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(formatFriendlyErrorMessage(err, 'Failed to set document default bank account.'));
    }
  };

  const handleToggleActive = async (acc: CompanyBankAccount) => {
    try {
      if (acc.isActive) {
        await bankAccountsApi.deactivate(acc.id);
        setSuccess(`Deactivated account ${acc.bankName} ••••${acc.accountNumberLast4}.`);
      } else {
        await bankAccountsApi.activate(acc.id);
        setSuccess(`Activated account ${acc.bankName} ••••${acc.accountNumberLast4}.`);
      }
      await loadAccounts();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(formatFriendlyErrorMessage(err, 'Failed to update account status.'));
    }
  };

  return (
    <div className="card space-y-5" data-testid="company-bank-accounts-section">
      <div className="border-b border-slate-200 dark:border-[#2A3042] pb-3 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 size={16} className="text-emerald-500" />
            Company Bank Accounts
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Manage company settlement accounts for invoice printing and receipt recording. Account numbers are encrypted at rest.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          data-testid="btn-add-company-bank-account"
          className="btn-primary text-xs flex items-center gap-1.5 px-3 py-1.5 cursor-pointer shadow-xs"
        >
          <Plus size={14} /> Add Bank Account
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700"><X size={14} /></button>
        </div>
      )}

      {success && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} className="text-emerald-500" />
            <span>{success}</span>
          </div>
          <button type="button" onClick={() => setSuccess(null)} className="text-emerald-500 hover:text-emerald-700"><X size={14} /></button>
        </div>
      )}

      {loading && accounts.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
          <RefreshCw size={14} className="animate-spin" /> Loading bank accounts...
        </div>
      ) : accounts.length === 0 ? (
        <div className="p-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/40">
          <Building2 size={28} className="mx-auto text-slate-400 mb-2" />
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No company bank accounts added yet.</p>
          <p className="text-[11px] text-slate-400 mt-1">Add your company's bank accounts to receive payments and print details on invoices.</p>
          <button
            type="button"
            onClick={openAddModal}
            className="btn-secondary text-xs mt-3 inline-flex items-center gap-1.5"
          >
            <Plus size={13} /> Add First Account
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 dark:border-[#2A3042] rounded-xl">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#1A1E2C] border-b border-slate-200 dark:border-[#2A3042] text-slate-500 font-semibold">
                <th className="py-2.5 px-3">Bank & Account</th>
                <th className="py-2.5 px-3">Label / Holder</th>
                <th className="py-2.5 px-3">IFSC & Branch</th>
                <th className="py-2.5 px-3">UPI ID</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {accounts.map((acc) => (
                <tr
                  key={acc.id}
                  data-testid={`bank-account-row-${acc.id}`}
                  className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors ${
                    !acc.isActive ? 'opacity-60 bg-slate-50/40 dark:bg-slate-900/30' : ''
                  }`}
                >
                  <td className="py-3 px-3">
                    <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span>{acc.bankName} ••••{acc.accountNumberLast4}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {acc.isDocumentDefault && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                          <FileText size={10} /> Invoices & PDFs
                        </span>
                      )}
                      {acc.isDefault && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <CheckCircle2 size={10} /> Default Receipt
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="py-3 px-3">
                    <div className="text-slate-800 dark:text-slate-200 font-medium">
                      {acc.label || 'Company Account'}
                    </div>
                    {acc.holderName && (
                      <div className="text-[10px] text-slate-400">{acc.holderName}</div>
                    )}
                  </td>

                  <td className="py-3 px-3 font-mono">
                    <div className="text-slate-800 dark:text-slate-200 font-semibold">{acc.ifsc}</div>
                    <div className="text-[10px] text-slate-400 font-sans">{acc.branch || 'Main Branch'}</div>
                  </td>

                  <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-300">
                    {acc.upiId || '—'}
                  </td>

                  <td className="py-3 px-3 text-center">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        acc.isActive
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {acc.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>

                  <td className="py-3 px-3 text-right">
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                      {acc.isActive && !acc.isDocumentDefault && (
                        <button
                          type="button"
                          onClick={() => handleSetDocumentDefault(acc.id)}
                          title="Print this account on invoices and quotations"
                          data-testid={`btn-set-doc-default-${acc.id}`}
                          className="px-2 py-1 text-[10px] font-bold rounded bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800 cursor-pointer"
                        >
                          Print on Invoices
                        </button>
                      )}

                      {acc.isActive && !acc.isDefault && (
                        <button
                          type="button"
                          onClick={() => handleSetDefault(acc.id)}
                          title="Set as default for receipts"
                          data-testid={`btn-set-default-${acc.id}`}
                          className="px-2 py-1 text-[10px] font-bold rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 cursor-pointer"
                        >
                          Set Default
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => openEditModal(acc)}
                        data-testid={`btn-edit-bank-${acc.id}`}
                        className="p-1 rounded text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        title="Edit details"
                      >
                        <Edit2 size={13} />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleActive(acc)}
                        data-testid={`btn-toggle-active-${acc.id}`}
                        className={`px-2 py-1 text-[10px] font-medium rounded cursor-pointer ${
                          acc.isActive
                            ? 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                            : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                        }`}
                      >
                        {acc.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Bank Account Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          data-testid="modal-bank-account-form"
        >
          <div className="bg-white dark:bg-[#1E2230] rounded-xl border border-slate-200 dark:border-[#2A3042] w-full max-w-lg shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 size={16} className="text-emerald-500" />
                {editingId ? 'Edit Bank Account' : 'Add Company Bank Account'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            {formErrors.form && (
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
                {formErrors.form}
              </div>
            )}

            <div className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Account Nickname / Label</label>
                  <input
                    type="text"
                    value={form.label}
                    onChange={(e) => setForm({ ...form, label: e.target.value })}
                    placeholder="e.g. Current Account"
                    data-testid="input-bank-label"
                    className="input text-xs"
                  />
                </div>

                <div>
                  <label className="label">Bank Name <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    value={form.bankName}
                    onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                    placeholder="e.g. State Bank of India"
                    data-testid="input-bank-name"
                    className="input text-xs"
                    required
                  />
                  {formErrors.bankName && <p className="text-rose-500 text-[10px] mt-0.5">{formErrors.bankName}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Account Holder Name</label>
                  <input
                    type="text"
                    value={form.holderName}
                    onChange={(e) => setForm({ ...form, holderName: e.target.value })}
                    placeholder="Company Legal Name"
                    data-testid="input-bank-holder"
                    className="input text-xs"
                  />
                </div>

                <div>
                  <label className="label">
                    Account Number {editingId ? '(leave blank to keep current)' : <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    type="text"
                    value={form.accountNumber}
                    onChange={(e) => setForm({ ...form, accountNumber: e.target.value.replace(/\s+/g, '') })}
                    placeholder={editingId ? 'Keep existing encrypted account' : '9 to 18 digits'}
                    data-testid="input-bank-account-number"
                    className="input text-xs font-mono"
                  />
                  {formErrors.accountNumber && (
                    <p className="text-rose-500 text-[10px] mt-0.5">{formErrors.accountNumber}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">IFSC Code <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    value={form.ifsc}
                    onChange={(e) => setForm({ ...form, ifsc: e.target.value.toUpperCase().trim() })}
                    placeholder="e.g. SBIN0001234"
                    maxLength={11}
                    data-testid="input-bank-ifsc"
                    className="input text-xs font-mono uppercase"
                    required
                  />
                  {formErrors.ifsc && <p className="text-rose-500 text-[10px] mt-0.5">{formErrors.ifsc}</p>}
                </div>

                <div>
                  <label className="label">Branch Name</label>
                  <input
                    type="text"
                    value={form.branch}
                    onChange={(e) => setForm({ ...form, branch: e.target.value })}
                    placeholder="e.g. Industrial Area"
                    data-testid="input-bank-branch"
                    className="input text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="label">UPI ID / VPA (Optional)</label>
                <input
                  type="text"
                  value={form.upiId}
                  onChange={(e) => setForm({ ...form, upiId: e.target.value.trim() })}
                  placeholder="e.g. company@upi"
                  data-testid="input-bank-upi"
                  className="input text-xs font-mono"
                />
                {formErrors.upiId && <p className="text-rose-500 text-[10px] mt-0.5">{formErrors.upiId}</p>}
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.isDefault}
                    onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                    className="rounded text-crm-blue"
                  />
                  <span className="text-xs text-slate-700 dark:text-slate-300">
                    Set as default account for receiving customer payments
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.isDocumentDefault}
                    onChange={(e) => setForm({ ...form, isDocumentDefault: e.target.checked })}
                    className="rounded text-purple-600"
                  />
                  <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                    Print this account on customer invoices, quotations, and PDFs
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={formSaving}
                  className="btn-secondary text-xs px-3 py-1.5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={formSaving}
                  data-testid="btn-save-bank-account-form"
                  className="btn-primary text-xs px-4 py-1.5 flex items-center gap-1.5"
                >
                  {formSaving ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Check size={13} /> {editingId ? 'Update Account' : 'Save Account'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
