import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Plus, Users, Shield, CheckCircle2, AlertTriangle,
  Search, ExternalLink, RefreshCw, KeyRound, Globe, Mail, Phone,
  ChevronRight, X, Copy, Check, Power, Settings, Lock, Sparkles, Send
} from 'lucide-react';
import { platformApi } from '../services/api';
import { Tenant } from '../types';
import { usePopup } from '../contexts/PopupContext';
import { format } from 'date-fns';

export default function PlatformCompaniesPage() {
  const { showAlert, showConfirm } = usePopup();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Create Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    code: '',
    name: '',
    slug: '',
    planTier: 'standard',
    maxUsers: 10,
    adminName: '',
    adminEmail: '',
    adminPhone: '',
    adminPassword: '',
    city: 'Bengaluru',
    state: 'Karnataka',
    gstin: '',
  });

  // Created Tenant Success Modal State
  const [createdResult, setCreatedResult] = useState<{
    tenant: Tenant;
    adminUser: {
      employeeCode: string;
      name: string;
      email: string;
      tempPassword: string;
    };
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // View Tenant Details & Users Modal State
  const [viewingTenant, setViewingTenant] = useState<any | null>(null);
  const [loadingTenantDetail, setLoadingTenantDetail] = useState(false);

  // Edit Tenant & Reset Password Modal State
  const [editingTenant, setEditingTenant] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    planTier: 'standard',
    maxUsers: 10,
    invoicePrefix: '',
    phone: '',
    email: '',
    newAdminPassword: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Dedicated Reset Super Admin Credentials Modal State
  const [resetModalTenant, setResetModalTenant] = useState<Tenant | null>(null);
  const [resetAdminDetail, setResetAdminDetail] = useState<{
    employeeCode: string;
    name: string;
    email: string;
    role?: string;
  } | null>(null);
  const [resetAdminEmail, setResetAdminEmail] = useState('');
  const [loadingResetAdmin, setLoadingResetAdmin] = useState(false);
  const [resetCustomPassword, setResetCustomPassword] = useState('');
  const [resetSendEmail, setResetSendEmail] = useState(true);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetSuccessResult, setResetSuccessResult] = useState<any | null>(null);
  const [copiedReset, setCopiedReset] = useState(false);

  const fetchTenants = async () => {
    try {
      setLoading(true);
      const { data } = await platformApi.listTenants();
      setTenants(data || []);
    } catch (err: any) {
      showAlert('Error loading companies', err?.response?.data?.message || 'Failed to fetch customer companies', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleViewTenantUsers = async (tenantId: string) => {
    try {
      setLoadingTenantDetail(true);
      const { data } = await platformApi.getTenant(tenantId);
      setViewingTenant(data);
    } catch (err: any) {
      showAlert('Failed to load company details', err?.response?.data?.message || 'Could not fetch company members', 'error');
    } finally {
      setLoadingTenantDetail(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code || !form.name || !form.adminEmail || !form.adminName) {
      showAlert('Missing Information', 'Company code, name, and Admin details are required.', 'warning');
      return;
    }

    setCreating(true);
    try {
      const { data } = await platformApi.createTenant(form);
      setShowCreateModal(false);
      setCreatedResult(data);
      fetchTenants();
    } catch (err: any) {
      showAlert('Failed to Provision Company', err?.response?.data?.message || 'Error occurred while creating company', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleOpenEditTenant = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setEditForm({
      name: tenant.name || '',
      planTier: tenant.planTier || 'standard',
      maxUsers: tenant.maxUsers || 10,
      invoicePrefix: tenant.invoicePrefix || '',
      phone: tenant.phone || '',
      email: tenant.email || '',
      newAdminPassword: '',
    });
  };

  const handleSaveEditTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenant) return;

    setSavingEdit(true);
    try {
      await platformApi.updateTenant(editingTenant.id, {
        name: editForm.name.trim(),
        planTier: editForm.planTier,
        maxUsers: Number(editForm.maxUsers),
        invoicePrefix: editForm.invoicePrefix.trim() || undefined,
        phone: editForm.phone.trim() || undefined,
        email: editForm.email.trim() || undefined,
      });

      showAlert('Updated Successfully', `${editForm.name} profile and settings updated.`, 'success');
      setEditingTenant(null);
      fetchTenants();
    } catch (err: any) {
      showAlert('Update Failed', err?.response?.data?.message || 'Could not update company settings', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleStatus = async (tenant: Tenant) => {
    const nextStatus = tenant.status === 'active' ? 'suspended' : 'active';
    showConfirm(
      `Are you sure you want to ${nextStatus === 'active' ? 'activate' : 'suspend'} ${tenant.name}? ${nextStatus === 'suspended' ? 'All users under this company will be blocked from logging in.' : ''}`,
      async () => {
        try {
          await platformApi.updateTenant(tenant.id, { status: nextStatus });
          showAlert('Updated', `${tenant.name} status set to ${nextStatus}.`, 'success');
          fetchTenants();
        } catch (err: any) {
          showAlert('Update Failed', err?.response?.data?.message || 'Could not update status', 'error');
        }
      },
      `${nextStatus === 'active' ? 'Activate' : 'Suspend'} Company Workspace`,
      nextStatus === 'suspended' ? 'Suspend' : 'Activate'
    );
  };

  const handleImpersonate = (tenant: Tenant) => {
    showConfirm(
      `Switch to ${tenant.name} (${tenant.code}) workspace? You will be logged in as an administrator to help configure settings. You can return to Master Console at any time.`,
      async () => {
        try {
          const { data } = await platformApi.impersonateTenant(tenant.id);
          const currentToken = localStorage.getItem('jnc_access_token');
          const currentUser = localStorage.getItem('jnc_user');
          if (currentToken) sessionStorage.setItem('jnc_master_token', currentToken);
          if (currentUser) sessionStorage.setItem('jnc_master_user', currentUser);

          localStorage.setItem('jnc_access_token', data.accessToken);
          localStorage.setItem('jnc_user', JSON.stringify(data.user));
          window.location.href = '/';
        } catch (err: any) {
          showAlert(err?.response?.data?.message || 'Could not enter company workspace', 'Impersonation Failed', 'error');
        }
      },
      'Enter Company Workspace (Support Mode)',
      'Enter Workspace'
    );
  };

  const handleOpenResetPasswordModal = async (tenant: Tenant) => {
    setResetModalTenant(tenant);
    setResetSuccessResult(null);
    setResetCustomPassword('');
    setResetSendEmail(true);
    setLoadingResetAdmin(true);
    setResetAdminEmail(tenant.email || '');

    try {
      const { data } = await platformApi.getTenant(tenant.id);
      const admin =
        data.users?.find((u: any) => u.role === 'tenant_admin' || u.role === 'super_admin' || u.role === 'admin') ||
        data.users?.[0];
      const targetEmail = tenant.email || admin?.email || '';
      setResetAdminEmail(targetEmail);
      if (admin) {
        setResetAdminDetail({
          employeeCode: admin.employeeCode,
          name: admin.name,
          email: targetEmail,
          role: admin.role,
        });
      } else {
        const fallbackCode = tenant.code.startsWith('JNC-') ? `${tenant.code}-SA-001` : `JNC-${tenant.code}-SA-001`;
        setResetAdminDetail({
          employeeCode: fallbackCode,
          name: `${tenant.name} Super Admin`,
          email: targetEmail || 'admin@client.com',
          role: 'tenant_admin',
        });
      }
    } catch {
      const fallbackCode = tenant.code.startsWith('JNC-') ? `${tenant.code}-SA-001` : `JNC-${tenant.code}-SA-001`;
      setResetAdminDetail({
        employeeCode: fallbackCode,
        name: `${tenant.name} Super Admin`,
        email: tenant.email || 'admin@client.com',
        role: 'tenant_admin',
      });
      setResetAdminEmail(tenant.email || '');
    } finally {
      setLoadingResetAdmin(false);
    }
  };

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789#@!';
    let pass = '';
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setResetCustomPassword(pass);
  };

  const handleExecuteResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalTenant) return;

    setResettingPassword(true);
    try {
      const { data } = await platformApi.resetAdminPassword(resetModalTenant.id, {
        newPassword: resetCustomPassword.trim() || undefined,
        adminEmail: resetAdminEmail.trim() || undefined,
        sendEmail: resetSendEmail,
        appUrl: window.location.origin + '/login',
      });
      setResetSuccessResult(data);
      fetchTenants();
    } catch (err: any) {
      showAlert('Password Reset Failed', err?.response?.data?.message || 'Could not reset credentials', 'error');
    } finally {
      setResettingPassword(false);
    }
  };

  const handleCopyResetCredentials = () => {
    if (!resetSuccessResult) return;
    const text = [
      `--- JNC CRM Super Admin Access Credentials ---`,
      `Company: ${resetSuccessResult.tenant?.name || resetModalTenant?.name} (${resetSuccessResult.tenant?.code || resetModalTenant?.code})`,
      `Super Admin ID: ${resetSuccessResult.adminUser?.employeeCode}`,
      `Login Email: ${resetSuccessResult.adminUser?.email}`,
      `New Password: ${resetSuccessResult.tempPassword}`,
      `Login Portal: ${window.location.origin}/login`,
      `Role: Company Super Admin`,
      `Note: Please change password upon first login.`,
    ].join('\n');

    navigator.clipboard.writeText(text);
    setCopiedReset(true);
    setTimeout(() => setCopiedReset(false), 2500);
  };

  const filtered = tenants.filter((t) => {
    const matchesSearch =
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.code.toLowerCase().includes(search.toLowerCase()) ||
      t.email?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !statusFilter || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-600/10 text-purple-600 dark:text-purple-400">
              <Building2 size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Company Workspaces (Multi-Tenant SaaS)
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Provision isolated customer companies, allocate user licenses, and create Tenant Admin credentials.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            setForm({
              code: '',
              name: '',
              slug: '',
              planTier: 'standard',
              maxUsers: 10,
              adminName: '',
              adminEmail: '',
              adminPhone: '',
              adminPassword: '',
              city: 'Bengaluru',
              state: 'Karnataka',
              gstin: '',
            });
            setShowCreateModal(true);
          }}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus size={16} />
          <span>Provision New Company</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Companies</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{tenants.length}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold">
            <Building2 size={20} />
          </div>
        </div>

        <div className="card p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Workspaces</div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">
              {tenants.filter((t) => t.status === 'active').length}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
            <CheckCircle2 size={20} />
          </div>
        </div>

        <div className="card p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total User Seats</div>
            <div className="text-2xl font-bold text-indigo-600 mt-1">
              {tenants.reduce((acc, t) => acc + (t.maxUsers || 0), 0)}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-bold">
            <Users size={20} />
          </div>
        </div>

        <div className="card p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Suspended</div>
            <div className="text-2xl font-bold text-rose-600 mt-1">
              {tenants.filter((t) => t.status === 'suspended').length}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center font-bold">
            <AlertTriangle size={20} />
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            className="input pl-10 w-full text-xs"
            placeholder="Search by company name, org code (e.g. VERTEX, JNC), or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            className="input text-xs w-full sm:w-40"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>

          <button
            onClick={fetchTenants}
            className="btn btn-secondary p-2.5 shrink-0"
            title="Refresh list"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Company List Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-[#1E2230] border-b border-slate-200 dark:border-[#2A3042] text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Org Code & Name</th>
                <th className="py-3 px-4">Plan & Licenses</th>
                <th className="py-3 px-4">Records & Usage</th>
                <th className="py-3 px-4">Mail Setup</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Created On</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-[#2A3042]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-crm-blue" />
                    Loading workspaces...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No company workspaces found matching your search.
                  </td>
                </tr>
              ) : (
                filtered.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-bold flex items-center justify-center shrink-0 border border-purple-200 dark:border-purple-800/40">
                          {tenant.code.slice(0, 3)}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white text-sm">
                            {tenant.name}
                          </div>
                          <div className="text-[11px] font-mono text-purple-600 dark:text-purple-400 font-semibold">
                            Code: {tenant.code} • slug: {tenant.slug}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div>
                        <span className="capitalize font-semibold text-slate-900 dark:text-white">
                          {tenant.planTier}
                        </span>
                        <div className="text-[11px] text-slate-500">
                          Max Users: <strong className="text-slate-700 dark:text-slate-300">{tenant.maxUsers}</strong>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                        <div>Users: <strong>{tenant._count?.users || 0}</strong> / {tenant.maxUsers}</div>
                        <div>Leads: <strong>{tenant._count?.leads || 0}</strong> • Orders: <strong>{tenant._count?.orders || 0}</strong></div>
                        <div>Invoices: <strong>{tenant._count?.invoices || 0}</strong> • SKUs: <strong>{tenant._count?.skus || 0}</strong></div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      {tenant._count?.mailAccounts && tenant._count.mailAccounts > 0 ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 size={12} /> Custom SMTP Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                          In-App Only (Safe)
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold capitalize ${
                          tenant.status === 'active'
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                            : 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        {tenant.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                      {tenant.createdAt ? format(new Date(tenant.createdAt), 'dd MMM yyyy') : 'N/A'}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        <button
                          onClick={() => handleImpersonate(tenant)}
                          className="btn px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 border border-amber-500/30 flex items-center gap-1 shadow-sm"
                          title="Support Access: Enter Company Workspace"
                        >
                          <KeyRound size={13} className="text-amber-600 dark:text-amber-400" />
                          <span>Login As</span>
                        </button>
                        <button
                          onClick={() => handleOpenResetPasswordModal(tenant)}
                          className="btn px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20 border border-indigo-500/30 flex items-center gap-1 shadow-sm"
                          title="Reset Super Admin Password & Dispatch Email Credentials"
                        >
                          <Lock size={13} className="text-indigo-600 dark:text-indigo-400" />
                          <span>Reset Password</span>
                        </button>
                        <button
                          onClick={() => handleViewTenantUsers(tenant.id)}
                          className="btn p-1.5 rounded-lg text-xs font-semibold bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-900/20"
                          title="View Company Members & Statistics"
                        >
                          <Users size={14} />
                        </button>
                        <button
                          onClick={() => handleOpenEditTenant(tenant)}
                          className="btn p-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20"
                          title="Edit Company Details & Settings"
                        >
                          <Settings size={14} />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(tenant)}
                          className={`btn p-1.5 rounded-lg text-xs font-semibold ${
                            tenant.status === 'active'
                              ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-900/20'
                              : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20'
                          }`}
                          title={tenant.status === 'active' ? 'Suspend Workspace' : 'Activate Workspace'}
                        >
                          <Power size={14} />
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

      {/* Provision New Company Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230]">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600">
                    <Building2 size={18} />
                  </div>
                  <h2 className="font-bold text-slate-900 dark:text-white text-base">
                    Provision New Customer Company
                  </h2>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-white/5"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreate} className="p-4 overflow-y-auto space-y-4 flex-1">
                <div className="bg-purple-50 dark:bg-purple-950/30 p-3 rounded-xl border border-purple-200 dark:border-purple-800/40 text-xs text-purple-800 dark:text-purple-300">
                  This will create an isolated workspace for the company and automatically create their primary <strong>Tenant Admin</strong> account.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Company Org Code *</label>
                    <input
                      type="text"
                      className="input uppercase font-mono tracking-wider text-xs"
                      placeholder="e.g. VERTEX, ACME"
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') })}
                      required
                    />
                  </div>

                  <div>
                    <label className="label">Company Display Name *</label>
                    <input
                      type="text"
                      className="input text-xs"
                      placeholder="e.g. Vertex Solutions Pvt Ltd"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Plan Tier</label>
                    <select
                      className="input text-xs"
                      value={form.planTier}
                      onChange={(e) => setForm({ ...form, planTier: e.target.value })}
                    >
                      <option value="starter">Starter (5 Users)</option>
                      <option value="standard">Standard (10 Users)</option>
                      <option value="professional">Professional (25 Users)</option>
                      <option value="enterprise">Enterprise (100 Users)</option>
                    </select>
                  </div>

                  <div>
                    <label className="label">Max User Licenses</label>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      className="input text-xs"
                      value={form.maxUsers}
                      onChange={(e) => setForm({ ...form, maxUsers: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="border-t border-slate-200 dark:border-[#2A3042] pt-3">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2">
                    Primary Tenant Admin Credentials
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label">Admin Full Name *</label>
                      <input
                        type="text"
                        className="input text-xs"
                        placeholder="e.g. Ramesh Patel"
                        value={form.adminName}
                        onChange={(e) => setForm({ ...form, adminName: e.target.value })}
                        required
                      />
                    </div>

                    <div>
                      <label className="label">Admin Email Address *</label>
                      <input
                        type="email"
                        className="input text-xs"
                        placeholder="ramesh@vertexsolutions.in"
                        value={form.adminEmail}
                        onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="label">Admin Phone</label>
                      <input
                        type="text"
                        className="input text-xs"
                        placeholder="+91 9845012345"
                        value={form.adminPhone}
                        onChange={(e) => setForm({ ...form, adminPhone: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="label">Initial Password (Optional)</label>
                      <input
                        type="text"
                        className="input text-xs font-mono"
                        placeholder="Leave blank for auto-generate"
                        value={form.adminPassword}
                        onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200 dark:border-[#2A3042] pt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label">GSTIN (Optional)</label>
                      <input
                        type="text"
                        className="input uppercase text-xs font-mono"
                        placeholder="29ABCDE1234F1Z5"
                        value={form.gstin}
                        onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                      />
                    </div>
                    <div>
                      <label className="label">City</label>
                      <input
                        type="text"
                        className="input text-xs"
                        value={form.city}
                        onChange={(e) => setForm({ ...form, city: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-[#2A3042] flex items-center justify-end gap-2">
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
                    <span>{creating ? 'Provisioning...' : 'Create Company Workspace'}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Created Tenant Success Modal */}
      <AnimatePresence>
        {createdResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-lg shadow-2xl p-6 text-slate-900 dark:text-white"
            >
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-4">
                <CheckCircle2 size={24} />
              </div>

              <h2 className="text-lg font-bold">Company Workspace Provisioned!</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                The isolated company tenant and Tenant Admin account are active. Share these credentials with the customer:
              </p>

              <div className="bg-slate-50 dark:bg-[#1E2230] p-4 rounded-xl border border-slate-200 dark:border-[#2A3042] my-4 space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Company:</span>
                  <span className="font-bold">{createdResult.tenant.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Company Code:</span>
                  <span className="font-bold text-purple-600">{createdResult.tenant.code}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Admin Username:</span>
                  <span className="font-bold">{createdResult.adminUser.employeeCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Admin Email:</span>
                  <span className="font-bold">{createdResult.adminUser.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">One-Time Password:</span>
                  <span className="font-bold text-emerald-600">{createdResult.adminUser.tempPassword}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    const text = `Company: ${createdResult.tenant.name}\nCompany Code: ${createdResult.tenant.code}\nLogin URL: http://localhost:5173/login\nAdmin Username: ${createdResult.adminUser.employeeCode}\nAdmin Email: ${createdResult.adminUser.email}\nTemporary Password: ${createdResult.adminUser.tempPassword}`;
                    navigator.clipboard.writeText(text);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2500);
                  }}
                  className="btn btn-secondary text-xs flex items-center gap-1.5"
                >
                  {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  <span>{copied ? 'Copied to Clipboard!' : 'Copy Credentials'}</span>
                </button>

                <button
                  onClick={() => setCreatedResult(null)}
                  className="btn btn-primary text-xs"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Inspect Company Members & Details Modal */}
      <AnimatePresence>
        {viewingTenant && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-600/10 text-purple-600 flex items-center justify-center font-bold text-xs">
                    {viewingTenant.code.slice(0, 3)}
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-900 dark:text-white text-base">
                      {viewingTenant.name}
                    </h2>
                    <div className="text-[11px] text-slate-500">
                      Org Code: <span className="font-mono text-purple-600 font-bold">{viewingTenant.code}</span> • Plan: <span className="capitalize font-semibold">{viewingTenant.planTier}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setViewingTenant(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-white/5"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-4 flex-1">
                {/* Stats row */}
                <div className="grid grid-cols-4 gap-2 bg-slate-50 dark:bg-[#1E2230] p-3 rounded-xl border border-slate-200 dark:border-[#2A3042] text-center">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Users</div>
                    <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                      {viewingTenant.users?.length || 0} / {viewingTenant.maxUsers}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Leads</div>
                    <div className="text-base font-bold text-blue-600 mt-0.5">
                      {viewingTenant._count?.leads || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Orders</div>
                    <div className="text-base font-bold text-indigo-600 mt-0.5">
                      {viewingTenant._count?.orders || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Invoices</div>
                    <div className="text-base font-bold text-emerald-600 mt-0.5">
                      {viewingTenant._count?.invoices || 0}
                    </div>
                  </div>
                </div>

                {/* Users List */}
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Users size={14} className="text-purple-600" />
                    <span>Company Members & Accounts ({viewingTenant.users?.length || 0})</span>
                  </h3>

                  {(!viewingTenant.users || viewingTenant.users.length === 0) ? (
                    <div className="text-center py-6 text-slate-400 text-xs bg-slate-50 dark:bg-[#1E2230] rounded-xl border border-slate-200 dark:border-[#2A3042]">
                      No active users registered under this company yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-[#2A3042] border border-slate-200 dark:border-[#2A3042] rounded-xl overflow-hidden">
                      {viewingTenant.users.map((u: any) => (
                        <div key={u.id} className="p-3 bg-white dark:bg-[#1E2230]/50 flex items-center justify-between text-xs">
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                              <span>{u.name}</span>
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                {u.employeeCode}
                              </span>
                            </div>
                            <div className="text-slate-500 text-[11px] mt-0.5">
                              {u.email}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {(u.role === 'tenant_admin' || u.role === 'super_admin' || u.role === 'admin') && (
                              <button
                                onClick={() => {
                                  setViewingTenant(null);
                                  handleOpenResetPasswordModal(viewingTenant);
                                }}
                                className="btn px-2 py-1 text-[11px] font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 rounded-lg flex items-center gap-1"
                                title="Reset Super Admin Password & Dispatch Email"
                              >
                                <KeyRound size={12} />
                                <span>Reset Password</span>
                              </button>
                            )}
                            <span className="capitalize px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                              {u.role.replace('_', ' ')}
                            </span>
                            <span className={`w-2 h-2 rounded-full ${u.isActive ? 'bg-emerald-500' : 'bg-rose-500'}`} title={u.isActive ? 'Active' : 'Inactive'} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-3 border-t border-slate-200 dark:border-[#2A3042] flex items-center justify-end">
                <button
                  onClick={() => setViewingTenant(null)}
                  className="btn btn-secondary text-xs"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Company Modal */}
      <AnimatePresence>
        {editingTenant && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230]">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600">
                    <Settings size={18} />
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-900 dark:text-white text-sm">
                      Edit {editingTenant.name}
                    </h2>
                    <div className="text-[11px] text-slate-500">Org Code: {editingTenant.code}</div>
                  </div>
                </div>
                <button
                  onClick={() => setEditingTenant(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-white/5"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveEditTenant} className="p-4 overflow-y-auto space-y-4 flex-1">
                <div>
                  <label className="label">Company Display Name *</label>
                  <input
                    type="text"
                    className="input text-xs"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Plan Tier</label>
                    <select
                      className="input text-xs"
                      value={editForm.planTier}
                      onChange={(e) => setEditForm({ ...editForm, planTier: e.target.value })}
                    >
                      <option value="starter">Starter</option>
                      <option value="standard">Standard</option>
                      <option value="professional">Professional</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </div>

                  <div>
                    <label className="label">Max User Seats</label>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      className="input text-xs"
                      value={editForm.maxUsers}
                      onChange={(e) => setEditForm({ ...editForm, maxUsers: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Invoice Prefix</label>
                    <input
                      type="text"
                      className="input uppercase text-xs font-mono"
                      placeholder="e.g. VTX, INV"
                      value={editForm.invoicePrefix}
                      onChange={(e) => setEditForm({ ...editForm, invoicePrefix: e.target.value.toUpperCase() })}
                    />
                  </div>

                  <div>
                    <label className="label">Company Phone</label>
                    <input
                      type="text"
                      className="input text-xs"
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Official Billing Email</label>
                  <input
                    type="email"
                    className="input text-xs"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  />
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-[#2A3042] flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingTenant(null)}
                    className="btn btn-secondary text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="btn btn-primary text-xs flex items-center gap-1.5"
                  >
                    {savingEdit ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                    <span>{savingEdit ? 'Saving...' : 'Save Changes'}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reset Super Admin Credentials & Email Modal */}
      <AnimatePresence>
        {resetModalTenant && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230]">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                    <Lock size={18} />
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-900 dark:text-white text-base">
                      Reset Super Admin Password
                    </h2>
                    <div className="text-[11px] text-slate-500">
                      Target Workspace: <span className="font-semibold text-slate-800 dark:text-slate-200">{resetModalTenant.name}</span> ({resetModalTenant.code})
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setResetModalTenant(null);
                    setResetSuccessResult(null);
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-white/5"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Content */}
              {resetSuccessResult ? (
                /* Success View */
                <div className="p-6 space-y-4">
                  <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300">
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>Password Reset Completed</span>
                    </div>
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                      {resetSuccessResult.emailDispatched
                        ? `Official credentials email dispatched to ${resetSuccessResult.adminUser?.email}`
                        : `Credentials updated in database.`}
                    </p>
                  </div>

                  {/* Credentials Card */}
                  <div className="bg-slate-50 dark:bg-[#1E2230] p-4 rounded-xl border border-slate-200 dark:border-[#2A3042] space-y-2.5 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-800">
                      <span className="text-slate-500">Company:</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {resetSuccessResult.tenant?.name} ({resetSuccessResult.tenant?.code})
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-800">
                      <span className="text-slate-500">Super Admin User ID:</span>
                      <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                        {resetSuccessResult.adminUser?.employeeCode}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-800">
                      <span className="text-slate-500">Login Email:</span>
                      <span className="font-mono text-slate-800 dark:text-slate-200">
                        {resetSuccessResult.adminUser?.email}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-800">
                      <span className="text-slate-500 font-semibold">New Temporary Password:</span>
                      <span className="font-mono font-black text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 px-2.5 py-0.5 rounded border border-rose-200 dark:border-rose-800 text-sm select-all">
                        {resetSuccessResult.tempPassword}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-slate-500">Login Portal:</span>
                      <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400">
                        {window.location.origin}/login
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={handleCopyResetCredentials}
                      className="btn flex-1 bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-800 flex items-center justify-center gap-1.5 text-xs py-2.5"
                    >
                      {copiedReset ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      <span>{copiedReset ? 'Credentials Copied!' : 'Copy All Credentials'}</span>
                    </button>
                    <button
                      onClick={() => {
                        setResetModalTenant(null);
                        setResetSuccessResult(null);
                      }}
                      className="btn btn-secondary text-xs py-2.5 px-4"
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : (
                /* Form View */
                <form onSubmit={handleExecuteResetPassword} className="p-5 space-y-4">
                  {/* Super Admin Info Card & Editable Email */}
                  <div className="p-3.5 bg-slate-50 dark:bg-[#1E2230] rounded-xl border border-slate-200 dark:border-[#2A3042] space-y-3 text-xs">
                    <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                      <span>Target Super Admin Account:</span>
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-bold">
                        {loadingResetAdmin ? 'Loading...' : resetAdminDetail?.employeeCode || 'Super Admin'}
                      </span>
                    </div>

                    <div>
                      <label className="label text-xs mb-1 text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-1.5">
                        <Mail size={13} className="text-slate-400" />
                        <span>Super Admin Destination Email (Login & Email Dispatch)</span>
                      </label>
                      <input
                        type="email"
                        className="input text-xs font-mono"
                        placeholder="e.g. admin@company.com"
                        value={resetAdminEmail}
                        onChange={(e) => setResetAdminEmail(e.target.value)}
                        required
                      />
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        Updates the login email in the database and delivers the reset credentials here.
                      </p>
                    </div>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-0.5 border-t border-slate-200/60 dark:border-slate-800">
                      Resetting this password will only affect this company's Super Admin account. Other employees and organizations remain unaffected.
                    </p>
                  </div>

                  {/* New Password Input */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="label mb-0">New Password</label>
                      <button
                        type="button"
                        onClick={generateRandomPassword}
                        className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
                      >
                        <Sparkles size={12} />
                        <span>Generate Random Strong Password</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      className="input text-xs font-mono"
                      placeholder="Leave blank to auto-generate a secure temporary password"
                      value={resetCustomPassword}
                      onChange={(e) => setResetCustomPassword(e.target.value)}
                    />
                  </div>

                  {/* Send Email Checkbox */}
                  <div className="p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      id="resetSendEmailCheck"
                      checked={resetSendEmail}
                      onChange={(e) => setResetSendEmail(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label htmlFor="resetSendEmailCheck" className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <span className="font-semibold block text-slate-900 dark:text-white">
                        Send Official Credentials Email
                      </span>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        Dispatches an email containing the Company Code, User ID ({resetAdminDetail?.employeeCode || 'Super Admin'}), New Password, and Direct Login URL to <strong>{resetAdminEmail || 'Admin Email'}</strong>.
                      </span>
                    </label>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-[#2A3042]">
                    <button
                      type="button"
                      onClick={() => setResetModalTenant(null)}
                      className="btn btn-secondary text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={resettingPassword || loadingResetAdmin}
                      className="btn btn-primary text-xs flex items-center gap-1.5"
                    >
                      {resettingPassword ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          <span>Resetting & Sending...</span>
                        </>
                      ) : (
                        <>
                          <Send size={13} />
                          <span>Reset & Send Credentials</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
