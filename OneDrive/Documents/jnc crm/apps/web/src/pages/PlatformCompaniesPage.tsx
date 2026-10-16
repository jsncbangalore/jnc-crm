/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, RefreshCw, KeyRound, Lock, Power, Settings,
  CheckCircle2, X, Copy, Check, Users, Send, Trash2
} from 'lucide-react';
import { platformApi, setAccessToken, getAccessToken } from '../services/api';
import { Tenant } from '../types';
import { usePopup } from '../contexts/PopupContext';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';

export default function PlatformCompaniesPage() {
  const navigate = useNavigate();
  const { updateUser } = useAuth();
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
    sendEmail: true,
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
    emailDispatched?: boolean;
    emailStatusMessage?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // View Tenant Details & Users Modal State
  const [viewingTenant, setViewingTenant] = useState<any | null>(null);
  const [loadingTenantDetail, setLoadingTenantDetail] = useState(false);

  // Edit Tenant Modal State
  const [editingTenant, setEditingTenant] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    planTier: 'standard',
    maxUsers: 10,
    invoicePrefix: '',
    phone: '',
    email: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Reset Super Admin Credentials Modal State
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
  const [resetMustChangePassword, setResetMustChangePassword] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetSuccessResult, setResetSuccessResult] = useState<any | null>(null);
  const [copiedReset, setCopiedReset] = useState(false);
  const [copiedPasswordOnly, setCopiedPasswordOnly] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Add Employee Modal State
  const [showAddEmpModal, setShowAddEmpModal] = useState(false);
  const [addingEmp, setAddingEmp] = useState(false);
  const [empForm, setEmpForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'employee',
    employeeCode: '',
    password: 'Jsnc@2024jsn',
  });

  const handleDeleteTenant = (tenant: Tenant) => {
    showConfirm(
      `Are you sure you want to delete client company "${tenant.name}" (${tenant.code})? This will deactivate the company workspace.`,
      async () => {
        try {
          await platformApi.deleteTenant(tenant.id);
          showAlert('Deleted', `Company workspace "${tenant.name}" has been deleted.`, 'success');
          fetchTenants();
        } catch (err: any) {
          showAlert('Delete Failed', err?.response?.data?.message || 'Could not delete client company', 'error');
        }
      },
      'Delete Client Company',
      'Delete'
    );
  };

  const handleAddEmp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewingTenant || !empForm.name || !empForm.email) {
      showAlert('Missing Information', 'Name and Email are required for adding an employee.', 'warning');
      return;
    }
    setAddingEmp(true);
    try {
      await platformApi.addTenantUser(viewingTenant.id, empForm);
      showAlert('Employee Added', `Employee "${empForm.name}" added to ${viewingTenant.name} successfully.`, 'success');
      setShowAddEmpModal(false);
      setEmpForm({ name: '', email: '', phone: '', role: 'employee', employeeCode: '', password: 'Jsnc@2024jsn' });
      handleViewTenantUsers(viewingTenant.id);
      fetchTenants();
    } catch (err: any) {
      showAlert('Failed to Add Employee', err?.response?.data?.message || 'Could not add employee to company', 'error');
    } finally {
      setAddingEmp(false);
    }
  };

  const handleDeleteEmp = async (tenantId: string, user: any) => {
    showConfirm(
      `Are you sure you want to remove user "${user.name}" (${user.email}) from ${viewingTenant?.name || 'company'}?`,
      async () => {
        try {
          await platformApi.deleteTenantUser(tenantId, user.id);
          showAlert('User Removed', `User "${user.name}" removed successfully.`, 'success');
          handleViewTenantUsers(tenantId);
          fetchTenants();
        } catch (err: any) {
          showAlert('Failed to Remove User', err?.response?.data?.message || 'Could not remove user', 'error');
        }
      },
      'Remove Employee',
      'Remove'
    );
  };

  const fetchTenants = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const { data } = await platformApi.listTenants();
      setTenants(data || []);
    } catch (err: any) {
      const msg = err?.response?.data?.message || (err.response ? `Server Error (${err.response.status}): ${err.response.statusText || 'Failed to load companies'}` : 'Unable to connect to server. Please check your connection or refresh the page.');
      setLoadError(msg);
      showAlert('Error loading companies', msg, 'error');
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
      const payload = {
        ...form,
        appUrl: window.location.origin + '/login',
      };
      const { data } = await platformApi.createTenant(payload);
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
          const currentToken = getAccessToken();
          if (currentToken) sessionStorage.setItem('jnc_master_token', currentToken);
          sessionStorage.setItem('jnc_impersonate_token', data.accessToken);

          setAccessToken(data.accessToken);
          if (data.user) {
            updateUser(data.user);
          }
          navigate('/');
        } catch (err: any) {
          showAlert('Impersonation Failed', err?.response?.data?.message || 'Could not enter company workspace', 'error');
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
    setResetMustChangePassword(false);
    setLoadingResetAdmin(true);
    setResetAdminEmail(tenant.email || '');

    try {
      const { data } = await platformApi.getTenant(tenant.id);
      const admin =
        data.users?.find((u: any) => u.role === 'tenant_admin' || u.role === 'admin') ||
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
          name: `${tenant.name} Admin`,
          email: targetEmail || 'admin@client.com',
          role: 'tenant_admin',
        });
      }
    } catch {
      const fallbackCode = tenant.code.startsWith('JNC-') ? `${tenant.code}-SA-001` : `JNC-${tenant.code}-SA-001`;
      setResetAdminDetail({
        employeeCode: fallbackCode,
        name: `${tenant.name} Admin`,
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
    for (let i = 0; i < 12; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setResetCustomPassword(pass);
    setResetMustChangePassword(true);
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
        mustResetPassword: resetMustChangePassword,
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

  const handleCopyPasswordOnly = () => {
    if (!resetSuccessResult?.tempPassword) return;
    navigator.clipboard.writeText(resetSuccessResult.tempPassword);
    setCopiedPasswordOnly(true);
    setTimeout(() => setCopiedPasswordOnly(false), 2500);
  };

  const handleCopyResetCredentials = () => {
    if (!resetSuccessResult) return;
    const text = [
      `--- CRM Admin Access Credentials ---`,
      `Company: ${resetSuccessResult.tenant?.name || resetModalTenant?.name} (${resetSuccessResult.tenant?.code || resetModalTenant?.code})`,
      `Admin ID: ${resetSuccessResult.adminUser?.employeeCode}`,
      `Login Email: ${resetSuccessResult.adminUser?.email}`,
      `New Password: ${resetSuccessResult.tempPassword}`,
      `Login Portal: ${window.location.origin}/login`,
      `Role: Tenant Admin`,
      `Note: Please change password upon first login.`,
    ].join('\n');

    navigator.clipboard.writeText(text);
    setCopiedReset(true);
    setTimeout(() => setCopiedReset(false), 2500);
  };

  // Filter list by client companies only (excluding internal platform owner)
  const clientTenants = tenants.filter((t: any) => !t.isInternal && t.code !== 'JNC' && t.code !== 'JNC-ORG-001' && t.id !== 'default-tenant-id');

  // Filter list by search query and status
  const filteredTenants = clientTenants.filter((t) => {
    const matchesSearch =
      search.trim() === '' ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.code.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === '' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalCompaniesCount = clientTenants.length;
  const activeWorkspacesCount = clientTenants.filter((t) => t.status === 'active').length;
  const totalUserSeatsCount = clientTenants.reduce((sum, t) => sum + (t.maxUsers || 0), 0);
  const suspendedCount = clientTenants.filter((t) => t.status === 'suspended').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Client Companies
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Create and manage the companies that use the CRM.
          </p>
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
              sendEmail: true,
            });
            setShowCreateModal(true);
          }}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus size={16} />
          <span>Provision New Company</span>
        </button>
      </div>

      {/* 4 Stat Cards - Plain Text Numbers & Labels Only (No Decorative Icons) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Companies</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{totalCompaniesCount}</div>
        </div>

        <div className="card p-4">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Active Workspaces</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{activeWorkspacesCount}</div>
        </div>

        <div className="card p-4">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total User Seats</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{totalUserSeatsCount}</div>
        </div>

        <div className="card p-4">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Suspended</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{suspendedCount}</div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by company name, code, or slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-crm-blue"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs px-3 py-2 rounded-xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-crm-blue"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>

        <button
          onClick={fetchTenants}
          className="btn btn-secondary text-xs flex items-center justify-center gap-1.5"
          title="Refresh companies list"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Client Companies Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-[#1E2230] border-b border-slate-200 dark:border-[#2A3042] text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Company Code & Name</th>
                <th className="py-3 px-4">Plan Tier</th>
                <th className="py-3 px-4">Users used / seats</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Created On</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-[#2A3042]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-crm-blue" />
                    Loading companies...
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <p className="text-rose-500 font-medium text-xs mb-3">{loadError}</p>
                    <button
                      onClick={fetchTenants}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-crm-blue text-white rounded-lg hover:bg-crm-blue/90"
                    >
                      <RefreshCw size={13} />
                      Retry
                    </button>
                  </td>
                </tr>
              ) : clientTenants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center space-y-3">
                    <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">
                      No client companies yet
                    </p>
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
                          sendEmail: true,
                        });
                        setShowCreateModal(true);
                      }}
                      className="btn btn-primary text-xs inline-flex items-center gap-1.5"
                    >
                      <Plus size={14} />
                      <span>Provision New Company</span>
                    </button>
                  </td>
                </tr>
              ) : filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No client companies found matching your search.
                  </td>
                </tr>
              ) : (
                filteredTenants.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-4">
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white text-sm">
                          {tenant.name}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 font-medium">
                          Code: {tenant.code} • slug: {tenant.slug}
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 capitalize font-medium text-slate-700 dark:text-slate-300">
                      {tenant.planTier}
                    </td>

                    <td className="py-3.5 px-4 font-medium text-slate-700 dark:text-slate-300">
                      <strong>{tenant._count?.users || 0}</strong> / {tenant.maxUsers}
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
                          title="Login as administrator into this workspace"
                        >
                          <KeyRound size={13} className="text-amber-600 dark:text-amber-400" />
                          <span>Login As</span>
                        </button>

                        <button
                          onClick={() => handleOpenResetPasswordModal(tenant)}
                          className="btn px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20 border border-indigo-500/30 flex items-center gap-1 shadow-sm"
                          title="Reset tenant admin password and send email"
                        >
                          <Lock size={13} className="text-indigo-600 dark:text-indigo-400" />
                          <span>Reset Password</span>
                        </button>

                        <button
                          onClick={() => handleViewTenantUsers(tenant.id)}
                          className="btn p-1.5 rounded-lg text-xs font-semibold bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-900/20"
                          title="View company members"
                        >
                          <Users size={14} />
                        </button>

                        <button
                          onClick={() => handleOpenEditTenant(tenant)}
                          className="btn p-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20"
                          title="Edit company settings"
                        >
                          <Settings size={14} />
                        </button>

                        <button
                          onClick={() => handleToggleStatus(tenant)}
                          className={`btn p-1.5 rounded-lg text-xs font-semibold ${
                            tenant.status === 'active'
                              ? 'bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/20'
                              : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20'
                          }`}
                          title={tenant.status === 'active' ? 'Suspend workspace' : 'Activate workspace'}
                        >
                          <Power size={14} />
                        </button>

                        <button
                          onClick={() => handleDeleteTenant(tenant)}
                          className="btn p-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-900/20"
                          title="Delete client company workspace"
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
                <h2 className="font-bold text-slate-900 dark:text-white text-base">
                  Provision New Client Company
                </h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-white/5"
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreate} className="p-4 overflow-y-auto space-y-4 flex-1">
                <div className="bg-slate-100 dark:bg-[#1E2230] p-3 rounded-xl border border-slate-200 dark:border-[#2A3042] text-xs text-slate-700 dark:text-slate-300">
                  This will create an isolated workspace for the client company and automatically create their primary <strong>Tenant Admin</strong> account.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Company Code *</label>
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
                    <label className="label">Company Name *</label>
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
                    <label className="label">Max User Seats</label>
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
                      <label className="label">Admin Email *</label>
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

                <div className="p-3 rounded-xl bg-slate-100 dark:bg-[#1E2230] border border-slate-200 dark:border-[#2A3042] flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="createSendEmailCheck"
                    checked={form.sendEmail}
                    onChange={(e) => setForm({ ...form, sendEmail: e.target.checked })}
                    className="mt-0.5 rounded border-slate-300 text-crm-blue focus:ring-crm-blue"
                  />
                  <label htmlFor="createSendEmailCheck" className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <span className="font-semibold block text-slate-900 dark:text-white">
                      Send Official Welcome & Access Credentials Email
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      Automatically sends an email containing Company Code, User ID, Password, and Direct Login URL to <strong>{form.adminEmail || 'Admin Email'}</strong>.
                    </span>
                  </label>
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
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-lg shadow-2xl p-6 text-slate-900 dark:text-white space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={22} />
                </div>
                <div>
                  <h2 className="text-base font-bold">Company Workspace Provisioned</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    The company workspace and Tenant Admin account are active.
                  </p>
                </div>
              </div>

              {createdResult.emailDispatched ? (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <span>
                    Credentials email dispatched to <strong>{createdResult.adminUser.email}</strong>
                  </span>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-300 text-xs">
                  <div className="font-semibold mb-0.5">Email Delivery Status:</div>
                  <span>{createdResult.emailStatusMessage || 'Credentials email could not be sent. Please copy the credentials below and provide them to the client administrator.'}</span>
                </div>
              )}

              <div className="bg-slate-50 dark:bg-[#1E2230] p-4 rounded-xl border border-slate-200 dark:border-[#2A3042] space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Company:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{createdResult.tenant.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Company Code:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{createdResult.tenant.code}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Admin User ID:</span>
                  <span className="font-bold text-crm-blue">{createdResult.adminUser.employeeCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Admin Email:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{createdResult.adminUser.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Temporary Password:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                    {createdResult.adminUser.tempPassword}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500">Login Portal:</span>
                  <a
                    href="/login"
                    target="_blank"
                    rel="noreferrer"
                    className="text-crm-blue font-bold hover:underline"
                  >
                    {window.location.origin}/login &nearr;
                  </a>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 text-[12px] text-blue-900 dark:text-blue-300">
                <p className="font-semibold">Portal Notice:</p>
                <p className="mt-0.5 text-blue-800 dark:text-blue-300">
                  Client company administrators and employees must sign in at <strong>{window.location.origin}/login</strong> (NOT at /platform/login).
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    const loginUrl = `${window.location.origin}/login`;
                    const text = [
                      `--- CRM Access Credentials ---`,
                      `Company: ${createdResult.tenant.name} (${createdResult.tenant.code})`,
                      `Admin User ID: ${createdResult.adminUser.employeeCode}`,
                      `Admin Email: ${createdResult.adminUser.email}`,
                      `Temporary Password: ${createdResult.adminUser.tempPassword}`,
                      `Login Portal: ${loginUrl}`,
                      `Note: Please change your password upon first login.`,
                    ].join('\n');
                    navigator.clipboard.writeText(text);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2500);
                  }}
                  className="btn btn-secondary text-xs flex items-center gap-1.5"
                >
                  {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  <span>{copied ? 'Copied to Clipboard' : 'Copy Credentials'}</span>
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

      {/* Inspect Company Members Modal */}
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
                <div>
                  <h2 className="font-bold text-slate-900 dark:text-white text-base">
                    {viewingTenant.name}
                  </h2>
                  <div className="text-[11px] text-slate-500">
                    Code: <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{viewingTenant.code}</span> • Plan: <span className="capitalize font-semibold">{viewingTenant.planTier}</span>
                  </div>
                </div>
                <button
                  onClick={() => setViewingTenant(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-white/5"
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-4 flex-1">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                      Company Users ({viewingTenant.users?.length || 0} / {viewingTenant.maxUsers})
                    </h3>
                    <button
                      onClick={() => setShowAddEmpModal(!showAddEmpModal)}
                      className="btn px-2.5 py-1 text-xs font-bold bg-primary text-white hover:bg-primary/90 rounded-lg flex items-center gap-1 shadow-sm"
                    >
                      <Plus size={13} />
                      <span>Add Employee</span>
                    </button>
                  </div>

                  {showAddEmpModal && (
                    <form onSubmit={handleAddEmp} className="p-3 bg-slate-50 dark:bg-[#1E2230] rounded-xl border border-slate-200 dark:border-[#2A3042] space-y-3 text-xs mb-4">
                      <div className="font-bold text-slate-900 dark:text-white text-xs flex items-center justify-between">
                        <span>Add New Employee to {viewingTenant.name}</span>
                        <button type="button" onClick={() => setShowAddEmpModal(false)} className="text-slate-400 hover:text-slate-600">
                          <X size={14} />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="label text-[11px] mb-0.5">Full Name *</label>
                          <input
                            type="text"
                            className="input text-xs"
                            placeholder="e.g. Anand Kumar"
                            value={empForm.name}
                            onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })}
                            required
                          />
                        </div>
                        <div>
                          <label className="label text-[11px] mb-0.5">Email Address *</label>
                          <input
                            type="email"
                            className="input text-xs font-mono"
                            placeholder="anand@client.com"
                            value={empForm.email}
                            onChange={(e) => setEmpForm({ ...empForm, email: e.target.value })}
                            required
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="label text-[11px] mb-0.5">Assigned Role *</label>
                          <select
                            className="input text-xs"
                            value={empForm.role}
                            onChange={(e) => setEmpForm({ ...empForm, role: e.target.value })}
                          >
                            <option value="tenant_admin">Company Owner / Admin (tenant_admin)</option>
                            <option value="admin">Administrator (admin)</option>
                            <option value="sub_admin">Sub-Admin / Manager (sub_admin)</option>
                            <option value="employee">Sales Employee (employee)</option>
                            <option value="store_manager">Store Manager (store_manager)</option>
                            <option value="project_manager">Project Manager (project_manager)</option>
                            <option value="developer_lead">Developer Lead (developer_lead)</option>
                            <option value="developer">Developer (developer)</option>
                          </select>
                        </div>
                        <div>
                          <label className="label text-[11px] mb-0.5">Initial Password</label>
                          <input
                            type="text"
                            className="input text-xs font-mono"
                            value={empForm.password}
                            onChange={(e) => setEmpForm({ ...empForm, password: e.target.value })}
                            required
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <button type="button" onClick={() => setShowAddEmpModal(false)} className="btn btn-secondary text-xs py-1 px-3">
                          Cancel
                        </button>
                        <button type="submit" disabled={addingEmp} className="btn btn-primary text-xs py-1 px-3 flex items-center gap-1">
                          {addingEmp ? <RefreshCw size={12} className="animate-spin" /> : <Plus size={12} />}
                          <span>{addingEmp ? 'Adding...' : 'Save & Add Employee'}</span>
                        </button>
                      </div>
                    </form>
                  )}

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
                            {(u.role === 'tenant_admin' || u.role === 'admin') && (
                              <button
                                onClick={() => {
                                  setViewingTenant(null);
                                  handleOpenResetPasswordModal(viewingTenant);
                                }}
                                className="btn px-2 py-1 text-[11px] font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 rounded-lg flex items-center gap-1"
                                title="Reset tenant admin password and send email"
                              >
                                <Lock size={12} />
                                <span>Reset Password</span>
                              </button>
                            )}
                            <span className="capitalize px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {u.role.replace('_', ' ')}
                            </span>
                            <span className={`w-2 h-2 rounded-full ${u.isActive ? 'bg-emerald-500' : 'bg-rose-500'}`} title={u.isActive ? 'Active' : 'Inactive'} />
                            <button
                              onClick={() => handleDeleteEmp(viewingTenant.id, u)}
                              className="p-1 rounded text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                              title="Remove user from company"
                            >
                              <Trash2 size={13} />
                            </button>
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
                <div>
                  <h2 className="font-bold text-slate-900 dark:text-white text-sm">
                    Edit {editingTenant.name}
                  </h2>
                  <div className="text-[11px] text-slate-500">Company Code: {editingTenant.code}</div>
                </div>
                <button
                  onClick={() => setEditingTenant(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-white/5"
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveEditTenant} className="p-4 overflow-y-auto space-y-4 flex-1">
                <div>
                  <label className="label">Company Name *</label>
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
                    <label className="label">Phone</label>
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

      {/* Reset Super Admin Credentials Modal */}
      <AnimatePresence>
        {resetModalTenant && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230]">
                <div>
                  <h2 className="font-bold text-slate-900 dark:text-white text-base">
                    Reset Admin Password
                  </h2>
                  <div className="text-[11px] text-slate-500">
                    Workspace: <span className="font-semibold text-slate-800 dark:text-slate-200">{resetModalTenant.name}</span> ({resetModalTenant.code})
                  </div>
                </div>
                <button
                  onClick={() => {
                    setResetModalTenant(null);
                    setResetSuccessResult(null);
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-white/5"
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>

              {resetSuccessResult ? (
                <div className="p-6 space-y-4">
                  {resetSuccessResult.emailDispatched ? (
                    <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300">
                      <div className="flex items-center gap-2 font-bold text-sm">
                        <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>Password Reset Completed & Email Sent</span>
                      </div>
                      <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                        Official credentials email dispatched to <strong>{resetSuccessResult.adminUser?.email}</strong>.
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 text-amber-900 dark:text-amber-300">
                      <div className="flex items-center gap-2 font-bold text-sm">
                        <CheckCircle2 size={18} className="text-amber-600 dark:text-amber-400 shrink-0" />
                        <span>Password Reset Completed Successfully</span>
                      </div>
                      <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                        <strong>Email Delivery Notice:</strong> {resetSuccessResult.emailStatusMessage || 'Credentials email could not be delivered. Please copy the credentials below and provide them directly to the company admin.'}
                      </p>
                    </div>
                  )}

                  <div className="bg-slate-50 dark:bg-[#1E2230] p-4 rounded-xl border border-slate-200 dark:border-[#2A3042] space-y-2.5 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-800">
                      <span className="text-slate-500 font-medium">Company Workspace:</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {resetSuccessResult.tenant?.name} ({resetSuccessResult.tenant?.code})
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-800">
                      <span className="text-slate-500 font-medium">Admin User ID:</span>
                      <span className="font-mono font-bold text-[#2563EB]">
                        {resetSuccessResult.adminUser?.employeeCode}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-800">
                      <span className="text-slate-500 font-medium">Login Email:</span>
                      <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {resetSuccessResult.adminUser?.email}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-800">
                      <span className="text-slate-500 font-medium">New Password:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 px-2.5 py-0.5 rounded border border-rose-200 dark:border-rose-800 text-sm select-all">
                          {resetSuccessResult.tempPassword}
                        </span>
                        <button
                          type="button"
                          onClick={handleCopyPasswordOnly}
                          title="Copy Password"
                          className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-[11px] flex items-center gap-1 transition-colors"
                        >
                          {copiedPasswordOnly ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                          <span>{copiedPasswordOnly ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-slate-500 font-medium">Login Portal:</span>
                      <a
                        href="/login"
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[11px] text-[#2563EB] hover:underline font-bold"
                      >
                        {window.location.origin}/login &nearr;
                      </a>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 text-[12px] text-blue-900 dark:text-blue-300">
                    <p className="font-semibold">Important Login Instructions:</p>
                    <p className="mt-0.5 text-blue-800 dark:text-blue-300">
                      Company administrators and employees must sign in at the <strong>Client Portal (/login)</strong>, NOT at the Platform Super Admin portal.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={handleCopyResetCredentials}
                      className="btn flex-1 bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-800 flex items-center justify-center gap-1.5 text-xs py-2.5"
                    >
                      {copiedReset ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      <span>{copiedReset ? 'Credentials Copied' : 'Copy All Details'}</span>
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
                <form onSubmit={handleExecuteResetPassword} className="p-5 space-y-4">
                  <div className="p-3.5 bg-slate-50 dark:bg-[#1E2230] rounded-xl border border-slate-200 dark:border-[#2A3042] space-y-3 text-xs">
                    <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                      <span>Target Admin Account:</span>
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                        {loadingResetAdmin ? 'Loading...' : resetAdminDetail?.employeeCode || 'Admin'}
                      </span>
                    </div>

                    <div>
                      <label className="label text-xs mb-1 text-slate-700 dark:text-slate-300 font-semibold">
                        Admin Destination Email
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
                        Updates the login email and delivers the reset credentials.
                      </p>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="label mb-0">New Password</label>
                      <button
                        type="button"
                        onClick={generateRandomPassword}
                        className="text-[11px] text-[#2563EB] hover:underline font-semibold"
                      >
                        Generate Random Strong Password
                      </button>
                    </div>
                    <input
                      type="text"
                      className="input text-xs font-mono"
                      placeholder="Leave blank to auto-generate a secure password"
                      value={resetCustomPassword}
                      onChange={(e) => setResetCustomPassword(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="p-3 rounded-xl bg-slate-100 dark:bg-[#1E2230] border border-slate-200 dark:border-[#2A3042] flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        id="resetSendEmailCheck"
                        checked={resetSendEmail}
                        onChange={(e) => setResetSendEmail(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 text-crm-blue focus:ring-crm-blue"
                      />
                      <label htmlFor="resetSendEmailCheck" className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                        <span className="font-semibold block text-slate-900 dark:text-white">
                          Send Official Credentials Email
                        </span>
                        <span className="text-[11px] text-slate-500 block mt-0.5">
                          Sends an email with access details to <strong>{resetAdminEmail || 'Admin Email'}</strong> (requires configured SMTP or Resend on server).
                        </span>
                      </label>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-100 dark:bg-[#1E2230] border border-slate-200 dark:border-[#2A3042] flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        id="resetMustChangePassCheck"
                        checked={resetMustChangePassword}
                        onChange={(e) => setResetMustChangePassword(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 text-crm-blue focus:ring-crm-blue"
                      />
                      <label htmlFor="resetMustChangePassCheck" className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                        <span className="font-semibold block text-slate-900 dark:text-white">
                          Require Password Change on First Sign-in
                        </span>
                        <span className="text-[11px] text-slate-500 block mt-0.5">
                          If unchecked, the user can immediately use this password without being forced to change it.
                        </span>
                      </label>
                    </div>
                  </div>

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
                          <span>Resetting & Applying...</span>
                        </>
                      ) : (
                        <>
                          <Send size={13} />
                          <span>Reset & Apply Credentials</span>
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
