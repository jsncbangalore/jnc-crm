/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, RefreshCw, KeyRound, Power, X, Check, Copy, Trash2 } from 'lucide-react';
import { platformApi } from '../services/api';
import { User } from '../types';
import { usePopup } from '../contexts/PopupContext';
import { format } from 'date-fns';

export default function PlatformAdminsPage() {
  const { showAlert, showConfirm } = usePopup();
  const [admins, setAdmins] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'platform_super_admin',
  });

  // Success result modal
  const [createdResult, setCreatedResult] = useState<{
    user: any;
    tempPassword?: string;
    emailDispatched?: boolean;
    emailStatusMessage?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchAdmins = async () => {
    try {
      setLoading(true);
      const { data } = await platformApi.listAdmins();
      setAdmins(data || []);
    } catch (err: any) {
      const msg = err?.response?.data?.message || (err.response ? `Server Error (${err.response.status}): ${err.response.statusText || 'Failed to load platform administrators'}` : 'Unable to connect to server. Please check your network connection.');
      showAlert('Error', msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email) {
      showAlert('Missing Information', 'Name and Email are required.', 'warning');
      return;
    }

    setCreating(true);
    try {
      const { data } = await platformApi.createAdmin({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        role: form.role,
      });
      setShowCreateModal(false);
      setCreatedResult(data);
      fetchAdmins();
    } catch (err: any) {
      const msg = err?.response?.data?.message || (err.response ? `Server Error (${err.response.status}): ${err.response.statusText || 'Could not create platform admin'}` : 'Unable to connect to server');
      showAlert('Creation Failed', msg, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (admin: User) => {
    const nextState = !admin.isActive;
    showConfirm(
      `Are you sure you want to ${nextState ? 'activate' : 'deactivate'} ${admin.name}?`,
      async () => {
        try {
          await platformApi.toggleAdminActive(admin.id, nextState);
          showAlert('Updated', `${admin.name} status updated.`, 'success');
          fetchAdmins();
        } catch (err: any) {
          const msg = err?.response?.data?.message || (err.response ? `Server Error (${err.response.status}): ${err.response.statusText || 'Could not update status'}` : 'Unable to connect to server');
          showAlert('Update Failed', msg, 'error');
        }
      },
      `${nextState ? 'Activate' : 'Deactivate'} Administrator`,
      nextState ? 'Activate' : 'Deactivate'
    );
  };

  const handleResetCredentials = async (admin: User) => {
    showConfirm(
      `Reset credentials for ${admin.name}? A new temporary password will be generated and emailed to ${admin.email}.`,
      async () => {
        try {
          const { data } = await platformApi.resetAdminUserPassword(admin.id);
          setCreatedResult({
            user: admin,
            tempPassword: data.tempPassword,
            emailDispatched: data.emailDispatched,
            emailStatusMessage: data.emailStatusMessage,
          });
          if (data.emailDispatched) {
            showAlert('Credentials Emailed', `New temporary password emailed to ${admin.email}.`, 'success');
          } else {
            showAlert('Password Reset Completed', data.emailStatusMessage || 'Password reset, but email could not be delivered. Please copy credentials manually.', 'warning');
          }
          fetchAdmins();
        } catch (err: any) {
          const msg = err?.response?.data?.message || (err.response ? `Server Error (${err.response.status}): ${err.response.statusText || 'Could not reset credentials'}` : 'Unable to connect to server');
          showAlert('Reset Failed', msg, 'error');
        }
      },
      'Reset Admin Credentials',
      'Reset & Send Email'
    );
  };

  const handleDeleteAdmin = async (admin: User) => {
    showConfirm(
      `Are you sure you want to delete platform administrator "${admin.name}" (${admin.email})? This action cannot be undone.`,
      async () => {
        try {
          await platformApi.deleteAdmin(admin.id);
          showAlert('Deleted', `Platform administrator ${admin.name} deleted successfully.`, 'success');
          fetchAdmins();
        } catch (err: any) {
          const msg = err?.response?.data?.message || 'Could not delete platform administrator';
          showAlert('Delete Failed', msg, 'error');
        }
      },
      'Delete Platform Administrator',
      'Delete'
    );
  };

  const filtered = admins.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (a.name || '').toLowerCase().includes(q) ||
      (a.email || '').toLowerCase().includes(q) ||
      (a.employeeCode || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Platform Admins
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Manage platform super administrators who have access to manage client companies.
          </p>
        </div>

        <button
          onClick={() => {
            setForm({ name: '', email: '', phone: '', role: 'platform_super_admin' });
            setShowCreateModal(true);
          }}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus size={16} />
          <span>Add Platform Admin</span>
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search platform admins by name, email, or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-crm-blue"
          />
        </div>

        <button
          onClick={fetchAdmins}
          className="btn btn-secondary text-xs flex items-center gap-1.5"
          title="Refresh administrators list"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-[#1E2230] border-b border-slate-200 dark:border-[#2A3042] text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Admin Name & Email</th>
                <th className="py-3 px-4">User ID</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Last Login</th>
                <th className="py-3 px-4">Created On</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-[#2A3042]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-crm-blue" />
                    Loading platform administrators...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No platform administrators found.
                  </td>
                </tr>
              ) : (
                filtered.map((admin) => (
                  <tr key={admin.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-4">
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white text-sm">
                          {admin.name}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {admin.email}
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-medium text-slate-700 dark:text-slate-300">
                      {admin.employeeCode}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        admin.role === 'platform_super_admin'
                          ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                          : admin.role === 'platform_admin'
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : admin.role === 'platform_billing'
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                      }`}>
                        {(admin.role || 'platform_super_admin')
                          .replace(/_/g, ' ')
                          .replace(/\b\w/g, (l) => l.toUpperCase())}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold capitalize ${
                          admin.isActive
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                            : 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        {admin.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                      {admin.lastLoginAt ? format(new Date(admin.lastLoginAt), 'dd MMM yyyy, HH:mm') : 'Never'}
                    </td>

                    <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                      {admin.createdAt ? format(new Date(admin.createdAt), 'dd MMM yyyy') : 'N/A'}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleResetCredentials(admin)}
                          className="btn px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20 border border-indigo-500/30 flex items-center gap-1 shadow-sm"
                          title="Reset administrator password"
                        >
                          <KeyRound size={13} className="text-indigo-600 dark:text-indigo-400" />
                          <span>Reset Password</span>
                        </button>

                        <button
                          onClick={() => handleToggleActive(admin)}
                          className={`btn p-1.5 rounded-lg text-xs font-semibold ${
                            admin.isActive
                              ? 'bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/20'
                              : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20'
                          }`}
                          title={admin.isActive ? 'Deactivate administrator' : 'Activate administrator'}
                        >
                          <Power size={14} />
                        </button>

                        <button
                          onClick={() => handleDeleteAdmin(admin)}
                          className="btn p-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-900/20"
                          title="Delete platform administrator"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230]">
                <h2 className="font-bold text-slate-900 dark:text-white text-base">
                  Add Platform Administrator
                </h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreate} className="p-4 space-y-4">
                <div>
                  <label className="label">Full Name *</label>
                  <input
                    type="text"
                    className="input text-xs"
                    placeholder="e.g. Platform Admin Name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="label">Official Email *</label>
                  <input
                    type="email"
                    className="input text-xs font-mono"
                    placeholder="admin@jsnc.co.in"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="label">Phone Number</label>
                  <input
                    type="text"
                    className="input text-xs"
                    placeholder="+91 9845012345"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>

                <div>
                  <label className="label">Platform Role / Job Designation *</label>
                  <select
                    className="input text-xs font-medium"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    required
                  >
                    <option value="platform_super_admin">Platform Super Admin (Full Platform Access)</option>
                    <option value="platform_admin">Platform Administrator (Company & User Management)</option>
                    <option value="platform_support">Platform Support Specialist (Client Diagnostics)</option>
                    <option value="platform_billing">Platform Billing Manager (Subscriptions & Billing)</option>
                    <option value="platform_developer">Platform Developer Lead (API & System Integrations)</option>
                  </select>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-[#2A3042]">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="btn btn-secondary text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="btn btn-primary text-xs flex items-center gap-1.5"
                  >
                    {creating ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                    <span>{creating ? 'Creating...' : 'Create Platform Admin'}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Success Modal */}
      <AnimatePresence>
        {createdResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4"
            >
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Platform Administrator Credentials
              </h2>

              {createdResult.emailDispatched ? (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300 text-xs">
                  <span className="font-bold">Credentials Email Sent:</span> Dispatched to <strong>{createdResult.user.email}</strong>.
                </div>
              ) : createdResult.emailStatusMessage ? (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-300 text-xs">
                  <span className="font-bold">Delivery Notice:</span> {createdResult.emailStatusMessage}
                </div>
              ) : null}

              <div className="bg-slate-50 dark:bg-[#1E2230] p-4 rounded-xl border border-slate-200 dark:border-[#2A3042] space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Name:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{createdResult.user.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">User ID:</span>
                  <span className="font-bold text-crm-blue">{createdResult.user.employeeCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Email:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{createdResult.user.email}</span>
                </div>
                {createdResult.tempPassword && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Password:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 select-all">
                      {createdResult.tempPassword}
                    </span>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500">Login Portal:</span>
                  <a
                    href="/platform/login"
                    target="_blank"
                    rel="noreferrer"
                    className="text-crm-blue font-bold hover:underline"
                  >
                    {window.location.origin}/platform/login &nearr;
                  </a>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    const text = [
                      `--- Platform Admin Credentials ---`,
                      `Name: ${createdResult.user.name}`,
                      `User ID: ${createdResult.user.employeeCode}`,
                      `Email: ${createdResult.user.email}`,
                      createdResult.tempPassword ? `Password: ${createdResult.tempPassword}` : '',
                      `Login URL: ${window.location.origin}/platform/login`,
                    ].filter(Boolean).join('\n');
                    navigator.clipboard.writeText(text);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="btn btn-secondary text-xs flex items-center gap-1.5"
                >
                  {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  onClick={() => setCreatedResult(null)}
                  className="btn btn-primary text-xs"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
