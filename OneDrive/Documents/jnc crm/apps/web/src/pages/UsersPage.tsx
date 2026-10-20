import React, { useEffect, useState } from 'react';
import { useSearchParams, NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, UserPlus, Search, RefreshCw, KeyRound, ShieldAlert,
  CheckCircle2, X, Lock, Mail, Phone, Building2, MapPin, Copy,
  Check, UserCheck, UserX, Edit3, Shield, AlertTriangle, Trash2, Clock,
  Upload, Download, FileSpreadsheet, Sliders, FileText, Unlock, LogOut
} from 'lucide-react';
import api, { usersApi, authApi } from '../services/api';
import { User, Role } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import TeamsTab from './TeamsTab';
import { ROLE_RANKS, ROLE_LABELS, getAllowedAssignableRoles, isPlatformOwner } from '../utils/roles';

const ROLE_CODE_MAP: Record<string, string> = {
  platform_super_admin: 'PSA',
  tenant_admin: 'TAD',
  admin: 'ADM',
  sub_admin: 'SUB',
  project_manager: 'PM',
  store_manager: 'STM',
  employee: 'EMP',
};

const safeFormatDate = (dateVal: any, formatStr = 'dd MMM yyyy, HH:mm') => {
  if (!dateVal) return null;
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return null;
    return format(d, formatStr);
  } catch {
    return null;
  }
};

export default function UsersPage() {
  const [searchParams] = useSearchParams();
  const { user: currentUser, updateUser } = useAuth();
  const isPlatform = isPlatformOwner(currentUser);
  const isTenantAdmin = currentUser?.role === 'tenant_admin';
  const isAdmin = currentUser?.role === 'admin';
  const canManageUsers = isPlatform || isTenantAdmin || isAdmin;
  const assignableRoles = getAllowedAssignableRoles(currentUser?.role);

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [companies, setCompanies] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'users' | 'teams' | 'signins'>('users');
  const [teams, setTeams] = useState<any[]>([]);
  const [recentSignIns, setRecentSignIns] = useState<any[]>([]);
  const [loadingSignIns, setLoadingSignIns] = useState(false);
  const [showMyProfile, setShowMyProfile] = useState(false);

  // Filter out current user's profile and platform super admin so only employee/staff profiles are shown
  const visibleUsers = users.filter((u) => {
    if (!showMyProfile && u.id === currentUser?.id) return false;
    if (!isPlatform && u.role === 'platform_super_admin') return false;
    return true;
  });

  // Create User Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: (assignableRoles[0] || 'employee') as Role,
    teamId: '',
    warehouseId: '',
  });

  // Credential Fallback Display Modal State
  const [createdCredentialModal, setCreatedCredentialModal] = useState<{
    user: User;
    tempPassword: string;
    message: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Edit User Modal State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [updating, setUpdating] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // In-App Confirmation Dialog State (Replaces native window.confirm)
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    variant?: 'danger' | 'warning' | 'primary';
    iconType?: 'key' | 'toggle' | 'alert' | 'trash';
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  // In-App Alert / Error Dialog State (Replaces native alert)
  const [alertDialog, setAlertDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant?: 'error' | 'success';
  } | null>(null);

  // Bulk Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importCsvText, setImportCsvText] = useState('');
  const [previewingImport, setPreviewingImport] = useState(false);
  const [committingImport, setCommittingImport] = useState(false);
  const [importPreviewData, setImportPreviewData] = useState<any | null>(null);
  const [importResult, setImportResult] = useState<any | null>(null);

  const parseCsvUsers = (text: string) => {
    const lines = text.trim().split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length <= 1) return [];
    const headers = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''));
    return lines.slice(1).map((line) => {
      const parts = line.split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h] = parts[idx] || '';
      });
      return {
        name: obj['Full Name'] || obj['name'] || parts[0] || '',
        email: obj['Email Address'] || obj['email'] || parts[1] || '',
        phone: obj['Phone Number'] || obj['phone'] || parts[2] || '',
        role: obj['Role'] || obj['role'] || parts[3] || 'employee',
        teamName: obj['Team Name'] || obj['team'] || parts[4] || '',
      };
    });
  };

  const handleDownloadTemplateCsv = async () => {
    try {
      const res = await usersApi.downloadTemplate();
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'jnc_users_import_template.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e: any) {
      setAlertDialog({
        isOpen: true,
        title: 'Download Failed',
        message: 'Could not download users CSV template: ' + (e?.message || 'Error'),
        variant: 'error',
      });
    }
  };

  const handlePreviewImport = async () => {
    const records = parseCsvUsers(importCsvText);
    if (records.length === 0) {
      setAlertDialog({
        isOpen: true,
        title: 'Empty Import',
        message: 'Please provide CSV rows with at least one record.',
        variant: 'error',
      });
      return;
    }
    setPreviewingImport(true);
    try {
      const { data } = await usersApi.importPreview(records);
      setImportPreviewData(data);
    } catch (e: any) {
      setAlertDialog({
        isOpen: true,
        title: 'Preview Failed',
        message: e?.response?.data?.message || e.message || 'Error parsing CSV',
        variant: 'error',
      });
    } finally {
      setPreviewingImport(false);
    }
  };

  const handleCommitImport = async () => {
    if (!importPreviewData || !importPreviewData.valid) return;
    setCommittingImport(true);
    try {
      const { data } = await usersApi.importCommit(importPreviewData.valid);
      setImportResult(data);
      setImportPreviewData(null);
      await fetchUsers();
    } catch (e: any) {
      setAlertDialog({
        isOpen: true,
        title: 'Import Failed',
        message: e?.response?.data?.message || e.message || 'Error creating imported users',
        variant: 'error',
      });
    } finally {
      setCommittingImport(false);
    }
  };

  const fetchTeams = async () => {
    try {
      const { data } = await api.get('/teams');
      setTeams(data);
    } catch(e) {}
  };

  const fetchCompanies = async () => {
    if (!isPlatform) return;
    try {
      const { data } = await api.get('/platform/tenants');
      setCompanies(data || []);
    } catch (e) {
      console.error('Failed to load companies list:', e);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data } = await usersApi.list({
        search,
        role: roleFilter,
        isActive: statusFilter,
        tenantId: companyFilter || undefined,
      });
      setUsers(data.items || []);
    } catch (err) {
      console.error('Failed to load team users:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentSignIns = async () => {
    try {
      setLoadingSignIns(true);
      const { data } = await authApi.getRecentSignIns();
      setRecentSignIns(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load recent sign-ins:', err);
    } finally {
      setLoadingSignIns(false);
    }
  };

  useEffect(() => {
    fetchTeams();
    if (isPlatform) {
      fetchCompanies();
    }
  }, [isPlatform]);

  useEffect(() => {
    if (canManageUsers) {
      const t = setTimeout(fetchUsers, search ? 300 : 0);
      return () => clearTimeout(t);
    }
  }, [search, roleFilter, statusFilter, companyFilter]);

  useEffect(() => {
    if (activeTab === 'signins' && canManageUsers) {
      fetchRecentSignIns();
    }
  }, [activeTab]);

  useEffect(() => {
    if (searchParams.get('action') === 'create') {
      setShowCreateModal(true);
    }
    if (searchParams.get('tab') === 'teams') {
      setActiveTab('teams');
    }
  }, [searchParams]);

  // If user is not Super Admin or Admin, block view
  if (!canManageUsers) {
    return (
      <div className="p-12 text-center max-w-md mx-auto space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 text-crm-coral flex items-center justify-center mx-auto">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Access Restricted</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          The Team & User Management console is strictly reserved for Super Administrators and Administrators.
        </p>
      </div>
    );
  }

  // Handle Create User Submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { data } = await usersApi.create(createForm);
      setShowCreateModal(false);
      setCreatedCredentialModal({
        user: data.user,
        tempPassword: data.tempPassword,
        message: data.message,
      });
      setCreateForm({
        name: '',
        email: '',
        phone: '',
        role: 'employee',
        teamId: '',
        warehouseId: 'BLR-MAIN',
      });
      await fetchUsers();
    } catch (err: any) {
      setAlertDialog({
        isOpen: true,
        title: 'User Creation Failed',
        message: err?.response?.data?.message || err.message || 'Unable to create user',
        variant: 'error',
      });
    } finally {
      setCreating(false);
    }
  };

  // Handle Edit User Submit
  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setUpdating(true);
    try {
      const { data } = await usersApi.update(editingUser.id, {
        name: editingUser.name,
        phone: editingUser.phone,
        role: editingUser.role,
        teamId: editingUser.teamId,
        warehouseId: editingUser.warehouseId,
      });
      if (editingUser.id === currentUser?.id) {
        updateUser({ name: editingUser.name, phone: editingUser.phone });
      }
      setEditingUser(null);
      setAlertDialog({
        isOpen: true,
        title: 'User Profile Updated',
        message: `Profile for ${editingUser.name} [${editingUser.employeeCode}] updated successfully!`,
        variant: 'success',
      });
      await fetchUsers();
    } catch (err: any) {
      setAlertDialog({
        isOpen: true,
        title: 'Update Failed',
        message: err?.response?.data?.message || err.message || 'Unable to update user details',
        variant: 'error',
      });
    } finally {
      setUpdating(false);
    }
  };

  // Handle Reset Credentials
  const handleResetCredentials = (targetUser: User) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Regenerate Credentials?',
      message: `Are you sure you want to regenerate and email temporary credentials for ${targetUser.name} (${targetUser.employeeCode})?`,
      confirmText: 'Regenerate & Email',
      variant: 'warning',
      iconType: 'key',
      onConfirm: async () => {
        setActionLoadingId(targetUser.id);
        setConfirmDialog(null);
        try {
          const { data } = await usersApi.resetCredentials(targetUser.id);
          setCreatedCredentialModal({
            user: targetUser,
            tempPassword: data.tempPassword,
            message: data.message,
          });
          await fetchUsers();
        } catch (err: any) {
          setAlertDialog({
            isOpen: true,
            title: 'Action Failed',
            message: 'Failed to reset credentials: ' + (err?.response?.data?.message || err.message),
            variant: 'error',
          });
        } finally {
          setActionLoadingId(null);
        }
      },
    });
  };

  // Handle Send Reset Code (OTP Flow)
  const handleSendResetCode = (targetUser: User) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Send Password Reset Code?',
      message: `A single-use 6-digit verification code will be dispatched directly to ${targetUser.email}. Administrators never see verification codes.`,
      confirmText: 'Send Reset Code',
      variant: 'primary',
      iconType: 'key',
      onConfirm: async () => {
        setActionLoadingId(targetUser.id);
        setConfirmDialog(null);
        try {
          const { data } = await usersApi.sendResetCode(targetUser.id);
          setAlertDialog({
            isOpen: true,
            title: 'Reset Code Sent',
            message: data?.message || `A verification code was dispatched to ${targetUser.email}.`,
            variant: 'success',
          });
        } catch (err: any) {
          setAlertDialog({
            isOpen: true,
            title: 'Failed to Send Code',
            message: err?.response?.data?.message || err.message,
            variant: 'error',
          });
        } finally {
          setActionLoadingId(null);
        }
      },
    });
  };

  // Handle Sign Out User Everywhere (Revoke All Sessions)
  const handleRevokeUserSessions = (targetUser: User) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Sign Out User Everywhere?',
      message: `This will terminate all active browser and device sessions for ${targetUser.name} (${targetUser.employeeCode}). They will need to log in again.`,
      confirmText: 'Sign Out Everywhere',
      variant: 'warning',
      iconType: 'alert',
      onConfirm: async () => {
        setActionLoadingId(targetUser.id);
        setConfirmDialog(null);
        try {
          const { data } = await usersApi.revokeSessions(targetUser.id);
          setAlertDialog({
            isOpen: true,
            title: 'Sessions Terminated',
            message: data?.message || 'User sessions terminated successfully.',
            variant: 'success',
          });
        } catch (err: any) {
          setAlertDialog({
            isOpen: true,
            title: 'Failed to Terminate Sessions',
            message: err?.response?.data?.message || err.message,
            variant: 'error',
          });
        } finally {
          setActionLoadingId(null);
        }
      },
    });
  };

  // Handle Unlock Account
  const handleUnlockUser = (targetUser: User) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Unlock Account?',
      message: `Clear failed login counters and remove any temporary account lockout for ${targetUser.name} (${targetUser.employeeCode}).`,
      confirmText: 'Unlock Account',
      variant: 'primary',
      iconType: 'key',
      onConfirm: async () => {
        setActionLoadingId(targetUser.id);
        setConfirmDialog(null);
        try {
          const { data } = await usersApi.unlock(targetUser.id);
          setAlertDialog({
            isOpen: true,
            title: 'Account Unlocked',
            message: data?.message || 'Account unlocked successfully.',
            variant: 'success',
          });
          await fetchUsers();
        } catch (err: any) {
          setAlertDialog({
            isOpen: true,
            title: 'Failed to Unlock Account',
            message: err?.response?.data?.message || err.message,
            variant: 'error',
          });
        } finally {
          setActionLoadingId(null);
        }
      },
    });
  };

  // Handle Force System-Wide Password Reset
  const handleForceResetAll = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Force System-Wide Password Reset?',
      message: 'This will require EVERY active user to change their password upon their next login. Are you sure you want to proceed?',
      confirmText: 'Enforce Password Reset',
      variant: 'warning',
      iconType: 'key',
      onConfirm: async () => {
        setActionLoadingId('all');
        setConfirmDialog(null);
        try {
          const { data } = await usersApi.forceResetAllPasswords();
          setAlertDialog({
            isOpen: true,
            title: 'Forced Password Reset Enforced',
            message: data?.message || 'All active users have been flagged for mandatory password change on their next login.',
            variant: 'success',
          });
          await fetchUsers();
        } catch (err: any) {
          setAlertDialog({
            isOpen: true,
            title: 'Action Failed',
            message: 'Failed to enforce password resets: ' + (err?.response?.data?.message || err.message),
            variant: 'error',
          });
        } finally {
          setActionLoadingId(null);
        }
      },
    });
  };

  // Handle Toggle Active / Deactivate
  const handleToggleActive = (targetUser: User) => {
    const actionLabel = targetUser.isActive ? 'Deactivate' : 'Reactivate';
    const isDeactivating = targetUser.isActive;
    setConfirmDialog({
      isOpen: true,
      title: `${actionLabel} User Account?`,
      message: `Are you sure you want to ${actionLabel.toLowerCase()} access for ${targetUser.name} (${targetUser.employeeCode})? ${isDeactivating ? 'The user will not be able to log in until reactivated.' : 'The user will immediately regain system access.'}`,
      confirmText: `${actionLabel} User`,
      variant: isDeactivating ? 'danger' : 'primary',
      iconType: 'toggle',
      onConfirm: async () => {
        setActionLoadingId(targetUser.id);
        setConfirmDialog(null);
        try {
          await usersApi.toggleActive(targetUser.id, !targetUser.isActive);
          await fetchUsers();
        } catch (err: any) {
          setAlertDialog({
            isOpen: true,
            title: 'Action Failed',
            message: 'Failed to update account status: ' + (err?.response?.data?.message || err.message),
            variant: 'error',
          });
        } finally {
          setActionLoadingId(null);
        }
      },
    });
  };

  // Handle Delete User (Role Hierarchy protected)
  const handleDeleteUser = (targetUser: User) => {
    if (targetUser.id === currentUser?.id) {
      setAlertDialog({
        isOpen: true,
        title: 'Action Blocked',
        message: 'You cannot delete your own account.',
        variant: 'error',
      });
      return;
    }

    const isCompanyAdmin = isPlatform || currentUser?.role === 'tenant_admin';
    if (!isCompanyAdmin && (ROLE_RANKS[currentUser?.role || ''] || 0) <= (ROLE_RANKS[targetUser.role] || 0)) {
      setAlertDialog({
        isOpen: true,
        title: 'Action Blocked',
        message: 'Security Policy: You can only delete users whose role rank is strictly below your own.',
        variant: 'error',
      });
      return;
    }

    if (currentUser?.role === 'tenant_admin' && targetUser.role === 'platform_super_admin') {
      setAlertDialog({
        isOpen: true,
        title: 'Action Blocked',
        message: 'Security Policy: You cannot delete a platform administrator.',
        variant: 'error',
      });
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: `Delete ${targetUser.name}?`,
      message: `Are you sure you want to permanently delete ${targetUser.name} (${targetUser.employeeCode})? This user will immediately lose access and be removed from the active system.`,
      confirmText: 'Delete User',
      variant: 'danger',
      iconType: 'trash',
      onConfirm: async () => {
        setActionLoadingId(targetUser.id);
        setConfirmDialog(null);
        try {
          await usersApi.delete(targetUser.id);
          setAlertDialog({
            isOpen: true,
            title: 'User Deleted',
            message: `User ${targetUser.name} [${targetUser.employeeCode}] has been removed successfully.`,
            variant: 'success',
          });
          await fetchUsers();
        } catch (err: any) {
          setAlertDialog({
            isOpen: true,
            title: 'Delete Failed',
            message: 'Failed to delete user: ' + (err?.response?.data?.message || err.message),
            variant: 'error',
          });
        } finally {
          setActionLoadingId(null);
        }
      },
    });
  };

  // Copy credentials helper
  const handleCopyCredentials = () => {
    if (!createdCredentialModal) return;
    const portalUrl = `${window.location.origin}/login`;
    const text = `JSNC-CRM Login Credentials:\nPortal: ${portalUrl}\nEmployee Code: ${createdCredentialModal.user.employeeCode}\nTemporary Password: ${createdCredentialModal.tempPassword}\nNote: Please change your password on first login.`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <Users size={24} className="text-crm-blue" /> User Management
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
            Configure system users, credentials, role assignments, and team module access permissions
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'users' && (isPlatform || isTenantAdmin) && (
            <button
              onClick={handleForceResetAll}
              disabled={actionLoadingId === 'all'}
              className="px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-crm-amber text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
              title="Force all active users to change passwords on next login"
            >
              <KeyRound size={13} className={actionLoadingId === 'all' ? 'animate-spin' : ''} /> Force Reset All Passwords
            </button>
          )}

          {activeTab === 'users' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary text-xs gap-1.5 shadow-glow-blue"
            >
              <UserPlus size={15} /> Create New User
            </button>
          )}
          <button onClick={fetchUsers} className="btn-ghost text-xs gap-1.5" title="Refresh user list">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs (Users vs Teams vs Recent Sign-ins) */}
      <div className="flex border-b border-slate-200 dark:border-[#2A3042] gap-4">
        <button
          onClick={() => setActiveTab('users')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'users'
              ? 'border-crm-blue text-crm-blue'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Users size={16} /> All Active Employees ({visibleUsers.length})
        </button>
        <button
          onClick={() => setActiveTab('teams')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'teams'
              ? 'border-crm-violet text-crm-violet'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Shield size={16} /> Module Access Teams ({teams.length})
        </button>
        {(isPlatform || isTenantAdmin || isAdmin) && (
          <button
            onClick={() => setActiveTab('signins')}
            className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'signins'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Clock size={16} /> Recent Sign-ins
          </button>
        )}
      </div>

      {activeTab === 'teams' ? (
        <TeamsTab />
      ) : activeTab === 'signins' ? (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 text-xs text-blue-800 dark:text-blue-300 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert size={16} className="text-crm-blue shrink-0" />
              <span>
                Audited sign-in attempts for this workspace. Identifiers and IP addresses are masked (first two octets). No passwords, hashes, or session tokens are ever logged or displayed.
              </span>
            </div>
            <button
              onClick={fetchRecentSignIns}
              disabled={loadingSignIns}
              className="btn-ghost text-xs gap-1.5 shrink-0"
              title="Refresh sign-in logs"
            >
              <RefreshCw size={13} className={loadingSignIns ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>

          <div className="table-container overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Masked Identifier</th>
                  <th>IP Address</th>
                  <th>Client / Browser</th>
                  <th>Reason / Event</th>
                  <th>Portal</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {loadingSignIns ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400">
                      <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-crm-blue" />
                      Loading sign-in history...
                    </td>
                  </tr>
                ) : recentSignIns.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400 italic">
                      No sign-in records found.
                    </td>
                  </tr>
                ) : (
                  recentSignIns.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                      <td>
                        {item.status === 'SUCCESS' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
                            <CheckCircle2 size={12} /> SUCCESS
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-red-500/10 text-red-600 dark:text-crm-coral border border-red-500/20">
                            <X size={12} /> FAILED
                          </span>
                        )}
                      </td>
                      <td className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {item.maskedIdentifier}
                      </td>
                      <td className="font-mono text-xs text-slate-600 dark:text-slate-400">
                        {item.ipAddress}
                      </td>
                      <td className="text-xs text-slate-600 dark:text-slate-400 max-w-xs truncate" title={item.userAgent}>
                        {item.userAgent}
                      </td>
                      <td>
                        <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {item.reasonCode}
                        </span>
                      </td>
                      <td className="text-xs font-semibold uppercase text-slate-500">
                        {item.portal}
                      </td>
                      <td className="font-mono text-xs text-slate-500">
                        {safeFormatDate(item.timestamp)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <>
          {/* Filter & Search Bar */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-1 max-w-2xl flex-wrap">
              <div className="relative flex-1 min-w-[220px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  className="input pl-9 text-xs"
                  placeholder="Search by name, employee code, email, team..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <select
                className="input w-40 text-xs"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="">All Roles</option>
                {Object.entries(ROLE_LABELS).map(([rKey, rLabel]) => (
                  <option key={rKey} value={rKey}>{rLabel}</option>
                ))}
              </select>

              <select
                className="input w-36 text-xs"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="true">Active Only</option>
                <option value="false">Inactive Only</option>
              </select>

              {isPlatform && (
                <select
                  className="input w-48 text-xs font-semibold text-blue-600 dark:text-blue-400 border-blue-500/40"
                  value={companyFilter}
                  onChange={(e) => setCompanyFilter(e.target.value)}
                >
                  <option value="">All Client Companies</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowMyProfile(!showMyProfile)}
                className={`text-[11px] px-2.5 py-1 rounded-lg border font-semibold transition-all cursor-pointer ${
                  showMyProfile
                    ? 'bg-crm-blue/10 border-crm-blue text-crm-blue shadow-2xs'
                    : 'bg-white dark:bg-[#1E2230] border-slate-300 dark:border-[#2A3042] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title={showMyProfile ? 'Showing your own profile' : 'Hiding your own admin profile'}
              >
                {showMyProfile ? 'Showing My Profile' : 'My Profile: Hidden'}
              </button>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                Total Employees: <strong className="text-slate-900 dark:text-white">{visibleUsers.length}</strong>
              </div>
            </div>
          </div>

          {/* Users Table */}
          <div className="table-wrapper">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Employee / Name</th>
                  {isPlatform && <th>Company</th>}
                  <th>Employee Code</th>
                  <th>Role</th>
                  <th>Team & Warehouse</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Created By</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.length === 0 ? (
                  <tr>
                    <td colSpan={isPlatform ? 9 : 8} className="p-8 text-center text-slate-400 text-xs">
                      No employee profiles found matching current filters. Click &quot;+ Create New User&quot; to onboard staff.
                    </td>
                  </tr>
                ) : (
                  visibleUsers.map((u, i) => {
                  const isCurrentUser = u.id === currentUser?.id;
                  const isCompanyAdmin = isPlatform || currentUser?.role === 'tenant_admin';
                  const myRank = ROLE_RANKS[currentUser?.role || ''] || 0;
                  const targetRank = ROLE_RANKS[u.role] || 0;
                  const isStrictlyHigher = isPlatform || myRank > targetRank;
                  const canActOnUser = isCompanyAdmin ? (!isCurrentUser && u.role !== 'platform_super_admin') : isStrictlyHigher;
                  const canEditUser = isCurrentUser || isCompanyAdmin || isStrictlyHigher;
                  const canDeleteUser = !isCurrentUser && (isCompanyAdmin ? u.role !== 'platform_super_admin' : isStrictlyHigher);

                  const roleBadgeColors: Record<string, string> = {
                    platform_super_admin: 'bg-purple-500/10 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20 dark:border-purple-500/30',
                    tenant_admin: 'bg-red-500/10 dark:bg-crm-coral/15 text-red-600 dark:text-crm-coral border-red-500/20 dark:border-crm-coral/30',
                    admin: 'bg-crm-blue/10 dark:bg-crm-blue/15 text-crm-blue dark:text-crm-blue border-crm-blue/20 dark:border-crm-blue/30',
                    sub_admin: 'bg-indigo-500/10 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 dark:border-indigo-500/30',
                    store_manager: 'bg-amber-500/10 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20 dark:border-amber-500/30',
                    project_manager: 'bg-cyan-500/10 dark:bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/20 dark:border-cyan-500/30',
                    developer_lead: 'bg-blue-500/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20 dark:border-blue-500/30',
                    developer: 'bg-sky-500/10 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/20 dark:border-sky-500/30',
                    employee: 'bg-teal-500/10 dark:bg-crm-teal/15 text-teal-600 dark:text-crm-teal border-teal-500/20 dark:border-crm-teal/30',
                  };

                  return (
                    <motion.tr
                      key={u.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                    >
                      {/* Name & Contact */}
                      <td>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                            {u.name}
                            {isCurrentUser && (
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-crm-blue/15 text-crm-blue font-bold">
                                You
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                            <Mail size={11} className="text-slate-400 dark:text-slate-500" /> {u.email}
                          </p>
                          {u.phone && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5 font-mono">
                              <Phone size={11} className="text-slate-400 dark:text-slate-600" /> {u.phone}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Company (Platform Admin Only) */}
                      {isPlatform && (
                        <td>
                          {u.tenant ? (
                            <div>
                              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{u.tenant.name}</p>
                              <p className="text-[10px] font-mono text-slate-500">{u.tenant.code}</p>
                            </div>
                          ) : (
                            <span className="text-xs font-mono text-purple-600 dark:text-purple-400 font-semibold">Platform Core</span>
                          )}
                        </td>
                      )}

                      {/* Employee Code */}
                      <td className="font-mono text-xs font-bold text-purple-600 dark:text-crm-violet-light">
                        {u.employeeCode}
                      </td>

                      {/* Role */}
                      <td>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border uppercase ${
                            roleBadgeColors[u.role] || 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          <Shield size={11} />
                          {ROLE_LABELS[u.role] || u.role}
                        </span>
                      </td>

                      {/* Team & Warehouse */}
                      <td>
                        <div className="space-y-0.5 text-xs">
                          <p className="text-slate-800 dark:text-slate-200 font-medium">{u.teamRef?.name || 'Unrestricted'}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1">
                            <MapPin size={11} className="text-slate-400 dark:text-slate-600" /> {u.warehouseId || 'BLR-MAIN'}
                          </p>
                        </div>
                      </td>

                      {/* Status */}
                      <td>
                        {u.isActive ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-green-500/10 dark:bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/20 dark:border-green-500/30">
                            <UserCheck size={11} /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-red-500/10 dark:bg-red-500/15 text-red-600 dark:text-crm-coral border border-red-500/20 dark:border-red-500/30">
                            <UserX size={11} /> Inactive
                          </span>
                        )}
                        {u.mustResetPassword && (
                          <p className="text-[10px] text-amber-600 dark:text-crm-amber mt-0.5 flex items-center gap-1 font-mono font-semibold">
                            <Lock size={10} /> Password Reset Pending
                          </p>
                        )}
                      </td>

                      {/* Last Login */}
                      <td className="text-slate-600 dark:text-slate-400 text-xs font-mono">
                        {safeFormatDate(u.lastLoginAt) ? (
                          safeFormatDate(u.lastLoginAt)
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600 italic">Never logged in</span>
                        )}
                      </td>

                      {/* Created By */}
                      <td className="text-slate-600 dark:text-slate-400 text-xs">
                        {u.createdBy ? (
                          <div>
                            <p className="text-slate-800 dark:text-slate-300 font-medium">{u.createdBy.name}</p>
                            <p className="text-[10px] font-mono text-slate-500">{u.createdBy.employeeCode}</p>
                          </div>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600">System Seed</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="text-right">
                        <div className="inline-flex items-center gap-1">
                          {/* Send OTP Reset Code Action */}
                          <button
                            onClick={() => handleSendResetCode(u)}
                            disabled={actionLoadingId === u.id || !canActOnUser}
                            className="p-1.5 rounded hover:bg-blue-500/10 dark:hover:bg-blue-500/20 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Send OTP Password Reset Code (to user's email)"
                          >
                            <Mail size={14} className={actionLoadingId === u.id ? 'animate-spin' : ''} />
                          </button>

                          {/* Sign Out User Everywhere */}
                          {!isCurrentUser && (
                            <button
                              onClick={() => handleRevokeUserSessions(u)}
                              disabled={actionLoadingId === u.id || !canActOnUser}
                              className="p-1.5 rounded hover:bg-orange-500/10 dark:hover:bg-orange-500/20 text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              title="Sign Out User From All Active Devices"
                            >
                              <LogOut size={14} />
                            </button>
                          )}

                          {/* Unlock Account Action */}
                          {!isCurrentUser && (
                            <button
                              onClick={() => handleUnlockUser(u)}
                              disabled={actionLoadingId === u.id || !canActOnUser}
                              className="p-1.5 rounded hover:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              title="Unlock Account & Reset Failed Login Attempts"
                            >
                              <Unlock size={14} />
                            </button>
                          )}

                          {/* Reset Credentials Action */}
                          <button
                            onClick={() => handleResetCredentials(u)}
                            disabled={actionLoadingId === u.id || !canActOnUser}
                            className="p-1.5 rounded hover:bg-amber-500/10 dark:hover:bg-crm-amber/20 text-slate-400 hover:text-amber-600 dark:hover:text-crm-amber transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Regenerate & Email Temporary Password"
                          >
                            <KeyRound size={14} className={actionLoadingId === u.id ? 'animate-spin' : ''} />
                          </button>

                          {/* Edit User Action */}
                          <button
                            onClick={() => setEditingUser(u)}
                            disabled={!canEditUser}
                            className="p-1.5 rounded hover:bg-crm-blue/10 dark:hover:bg-crm-blue/20 text-slate-400 hover:text-crm-blue transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Edit User Details & Role"
                          >
                            <Edit3 size={14} />
                          </button>

                          {/* Deactivate / Reactivate Action */}
                          {!isCurrentUser && (
                            <button
                              onClick={() => handleToggleActive(u)}
                              disabled={actionLoadingId === u.id || !canActOnUser}
                              className={`p-1.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                u.isActive
                                  ? 'hover:bg-amber-500/10 dark:hover:bg-amber-500/20 text-slate-400 hover:text-amber-600 dark:hover:text-crm-amber'
                                  : 'hover:bg-green-500/10 dark:hover:bg-green-500/20 text-slate-400 hover:text-green-600 dark:hover:text-green-400'
                              }`}
                              title={u.isActive ? 'Deactivate Account' : 'Reactivate Account'}
                            >
                              {u.isActive ? <UserX size={14} /> : <UserCheck size={14} />}
                            </button>
                          )}

                          {/* Delete User Action */}
                          {canDeleteUser && (
                            <button
                              onClick={() => handleDeleteUser(u)}
                              disabled={actionLoadingId === u.id}
                              className="p-1.5 rounded hover:bg-red-500/10 dark:hover:bg-red-500/20 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              title="Delete User Account"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ─── MODAL: Create New User Form ──────────────────────────────────── */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-auto"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230]">
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <UserPlus size={18} className="text-crm-blue" /> Create New CRM User
                </h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="w-7 h-7 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
                <div>
                  <label className="label">Full Name *</label>
                  <input
                    className="input text-xs"
                    placeholder="Enter full name"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Official Email Address *</label>
                    <input
                      type="email"
                      className="input text-xs"
                      placeholder="user@company.com"
                      value={createForm.email}
                      onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Phone Number *</label>
                    <input
                      className="input text-xs font-mono"
                      placeholder="Enter phone number"
                      value={createForm.phone}
                      onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                      required
                    />
                  </div>
                </div>

                {/* Role Dropdown Constrained by Creator Role */}
                <div>
                  <label className="label">Access Role *</label>
                  <select
                    className="input text-xs font-medium"
                    value={createForm.role}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        role: e.target.value as Role,
                      })
                    }
                    required
                  >
                    {assignableRoles.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r] || r}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Live Auto-Generated ID Preview */}
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 font-medium">Auto-Generated Employee ID:</span>
                  <span className="font-mono text-xs font-bold text-crm-blue bg-crm-blue/10 px-2 py-0.5 rounded border border-crm-blue/20">
                    JNC-{(currentUser?.tenant?.code || 'TENANT').replace(/^JNC-/, '')}-{ROLE_CODE_MAP[createForm.role] || 'EMP'}-XXX
                  </span>
                </div>

                {/* Team & Warehouse Scoping */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Access Team / Module Restriction</label>
                    <select className="input text-xs" value={createForm.teamId} onChange={(e) => setCreateForm({ ...createForm, teamId: e.target.value })}>
                      <option value="">Unrestricted (Full Role Access)</option>
                      {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Assigned Warehouse</label>
                    <select
                      className="input text-xs"
                      value={createForm.warehouseId}
                      onChange={(e) => setCreateForm({ ...createForm, warehouseId: e.target.value })}
                    >
                      <option value="MAIN-01">MAIN-01 (Headquarters)</option>
                    </select>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042] text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <p className="font-semibold text-slate-800 dark:text-slate-300 flex items-center gap-1">
                    <CheckCircle2 size={13} className="text-crm-teal" /> Automatic Credential Provisioning:
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    An employee code will be automatically generated alongside a cryptographically secure temporary password. Credentials will be securely dispatched to the user's email address.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#2A3042]">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="btn-ghost text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="btn-primary text-xs px-5 shadow-glow-blue"
                  >
                    {creating ? 'Creating User...' : 'Provision User & Dispatch Email'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL: On-Screen Credential Fallback ─────────────────────────── */}
      <AnimatePresence>
        {createdCredentialModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 16 }}
              className="bg-white dark:bg-[#181B26] border border-green-500/30 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="p-6 text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-green-500/15 border border-green-500/30 text-green-500 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={30} />
                </div>

                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Credentials Provisioned!</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {createdCredentialModal.message}
                  </p>
                </div>

                {/* Credential Box */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0F1117] border border-slate-200 dark:border-[#2A3042] text-left space-y-3 font-mono text-xs">
                  <div className="flex justify-between items-center border-b border-slate-200 dark:border-[#2A3042] pb-2">
                    <span className="text-slate-500">Employee Code:</span>
                    <strong className="text-purple-600 dark:text-crm-violet-light text-sm">
                      {createdCredentialModal.user.employeeCode}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-200 dark:border-[#2A3042] pb-2">
                    <span className="text-slate-500">Temporary Password:</span>
                    <strong className="text-amber-600 dark:text-crm-amber text-sm font-bold tracking-wider">
                      {createdCredentialModal.tempPassword}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Login Portal:</span>
                    <span className="text-crm-blue text-[11px]">{window.location.origin}/login</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-left text-xs text-amber-700 dark:text-crm-amber flex items-start gap-2">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed">
                    <strong>One-Time Display:</strong> This temporary password is not stored in plaintext and cannot be retrieved later. The user will be required to choose a new password upon first login.
                  </p>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleCopyCredentials}
                    className="btn bg-slate-100 dark:bg-[#1E2230] hover:bg-slate-200 dark:hover:bg-[#2A3042] text-slate-800 dark:text-white text-xs flex-1 gap-1.5 justify-center py-2.5"
                  >
                    {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    {copied ? 'Copied to Clipboard!' : 'Copy Credentials'}
                  </button>
                  <button
                    onClick={() => setCreatedCredentialModal(null)}
                    className="btn-primary text-xs px-6"
                  >
                    Done
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL: Edit User Details ────────────────────────────────────── */}
      <AnimatePresence>
        {editingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-auto"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230]">
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Edit3 size={18} className="text-crm-blue" /> Edit User: {editingUser.employeeCode}
                </h2>
                <button
                  onClick={() => setEditingUser(null)}
                  className="w-7 h-7 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleUpdateSubmit} className="p-6 space-y-4">
                <div>
                  <label className="label">Full Name *</label>
                  <input
                    className="input text-xs"
                    value={editingUser.name}
                    onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Email Address</label>
                    <input
                      className="input text-xs text-slate-400 bg-slate-100 dark:bg-[#0F1117]"
                      value={editingUser.email}
                      disabled
                    />
                  </div>
                  <div>
                    <label className="label">Phone Number</label>
                    <input
                      className="input text-xs font-mono"
                      value={editingUser.phone || ''}
                      onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                    />
                  </div>
                </div>

                {/* Role selection restricted by hierarchy */}
                <div>
                  <label className="label">Role</label>
                  <select
                    className="input text-xs font-medium"
                    value={editingUser.role}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as Role })}
                    disabled={editingUser.id === currentUser?.id || (!isPlatform && currentUser?.role !== 'tenant_admin' && (ROLE_RANKS[currentUser?.role || ''] || 0) <= (ROLE_RANKS[editingUser.role] || 0))}
                  >
                    {!assignableRoles.includes(editingUser.role) && (
                      <option value={editingUser.role}>
                        {ROLE_LABELS[editingUser.role] || editingUser.role}
                      </option>
                    )}
                    {assignableRoles.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r] || r}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Access Team / Module Restriction</label>
                    <select className="input text-xs" value={editingUser.teamId} onChange={(e) => setEditingUser({ ...editingUser, teamId: e.target.value })}>
                      <option value="">Unrestricted (Full Role Access)</option>
                      {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Warehouse</label>
                    <select
                      className="input text-xs"
                      value={editingUser.warehouseId || 'BLR-MAIN'}
                      onChange={(e) => setEditingUser({ ...editingUser, warehouseId: e.target.value })}
                    >
                      <option value="BLR-MAIN">BLR-MAIN (Bengaluru Hub)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-[#2A3042]">
                  {editingUser.id !== currentUser?.id && (isPlatform || currentUser?.role === 'tenant_admin' || (ROLE_RANKS[currentUser?.role || ''] || 0) > (ROLE_RANKS[editingUser.role] || 0)) ? (
                    <button
                      type="button"
                      onClick={() => {
                        const target = editingUser;
                        setEditingUser(null);
                        handleDeleteUser(target);
                      }}
                      className="btn bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 text-xs gap-1.5 py-1.5 px-3"
                    >
                      <Trash2 size={13} /> Delete User
                    </button>
                  ) : <div />}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingUser(null)}
                      className="btn-ghost text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={updating}
                      className="btn-primary text-xs px-5 shadow-glow-blue"
                    >
                      {updating ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── IN-APP CONFIRMATION DIALOG ────────────────────────────────────── */}
      <AnimatePresence>
        {confirmDialog && confirmDialog.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-start gap-3.5">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
                    confirmDialog.variant === 'danger'
                      ? 'bg-red-500/10 dark:bg-red-500/15 border-red-500/20 dark:border-red-500/30 text-red-600 dark:text-red-400'
                      : confirmDialog.variant === 'warning'
                      ? 'bg-amber-500/10 dark:bg-amber-500/15 border-amber-500/20 dark:border-amber-500/30 text-amber-600 dark:text-amber-400'
                      : 'bg-crm-blue/10 dark:bg-crm-blue/15 border-crm-blue/20 dark:border-crm-blue/30 text-crm-blue'
                  }`}
                >
                  {confirmDialog.iconType === 'trash' ? (
                    <Trash2 size={20} />
                  ) : confirmDialog.iconType === 'key' ? (
                    <KeyRound size={20} />
                  ) : confirmDialog.iconType === 'toggle' ? (
                    <Shield size={20} />
                  ) : (
                    <AlertTriangle size={20} />
                  )}
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">{confirmDialog.title}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {confirmDialog.message}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-[#2A3042]">
                <button
                  type="button"
                  onClick={() => setConfirmDialog(null)}
                  className="btn-ghost text-xs px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => confirmDialog.onConfirm()}
                  className={`btn text-xs px-4 py-2 font-bold transition-all shadow-md ${
                    confirmDialog.variant === 'danger'
                      ? 'bg-red-600 hover:bg-red-500 text-white'
                      : confirmDialog.variant === 'warning'
                      ? 'bg-amber-600 hover:bg-amber-500 text-white'
                      : 'btn-primary'
                  }`}
                >
                  {confirmDialog.confirmText}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── IN-APP ALERT / NOTIFICATION DIALOG ────────────────────────────── */}
      <AnimatePresence>
        {alertDialog && alertDialog.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-3"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                    alertDialog.variant === 'error'
                      ? 'bg-red-500/10 dark:bg-red-500/15 border-red-500/20 dark:border-red-500/30 text-red-600 dark:text-red-400'
                      : 'bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/20 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {alertDialog.variant === 'error' ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">{alertDialog.title}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">{alertDialog.message}</p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setAlertDialog(null)}
                  className="btn-primary text-xs px-4 py-1.5"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL: Bulk User Import ───────────────────────────────────────── */}
      <AnimatePresence>
        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-auto"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230]">
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Upload size={18} className="text-crm-blue" /> Bulk Onboard Client Users
                </h2>
                <button
                  onClick={() => setShowImportModal(false)}
                  className="w-7 h-7 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {!importResult ? (
                  <>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="label">CSV Records (Paste or Upload)</label>
                        <button
                          type="button"
                          onClick={handleDownloadTemplateCsv}
                          className="text-xs text-crm-blue hover:underline flex items-center gap-1 font-semibold"
                        >
                          <Download size={12} /> Download Sample Template
                        </button>
                      </div>
                      <textarea
                        className="input font-mono text-xs h-36"
                        placeholder="Full Name,Email Address,Phone Number,Role,Team Name&#10;Rajesh Sharma,rajesh.sharma@example.com,+91 98450 12345,employee,Sales Team Alpha"
                        value={importCsvText}
                        onChange={(e) => {
                          setImportCsvText(e.target.value);
                          setImportPreviewData(null);
                        }}
                      />
                    </div>

                    <div className="flex justify-between items-center">
                      <label className="btn-ghost text-xs cursor-pointer gap-1.5 border border-slate-300 dark:border-white/10">
                        <FileSpreadsheet size={13} /> Upload .CSV File
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (evt) => {
                              const text = evt.target?.result as string;
                              if (text) {
                                setImportCsvText(text);
                                setImportPreviewData(null);
                              }
                            };
                            reader.readAsText(file);
                          }}
                        />
                      </label>

                      <button
                        type="button"
                        onClick={handlePreviewImport}
                        disabled={previewingImport || !importCsvText.trim()}
                        className="btn bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 text-xs px-4 py-2 font-bold disabled:opacity-50"
                      >
                        {previewingImport ? 'Validating Rows...' : 'Preview Validation & Codes'}
                      </button>
                    </div>

                    {importPreviewData && (
                      <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-[#2A3042]">
                        <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            Validation: <strong className="text-emerald-600">{importPreviewData.validRows} valid</strong>, <strong className="text-red-500">{importPreviewData.errorRows} errors</strong>
                          </span>
                          <span className="text-slate-500">
                            Available Plan Slots: {importPreviewData.availableSlots} / {importPreviewData.maxUsers}
                          </span>
                        </div>

                        {importPreviewData.errors.length > 0 && (
                          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-xs text-red-700 dark:text-red-300 max-h-28 overflow-y-auto space-y-1">
                            {importPreviewData.errors.map((err: any, idx: number) => (
                              <p key={idx}>Row {err.row} ({err.data.email || 'No email'}): {err.errors.join(', ')}</p>
                            ))}
                          </div>
                        )}

                        {importPreviewData.valid.length > 0 && (
                          <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-[#2A3042] rounded-xl text-xs">
                            <table className="w-full text-left">
                              <thead className="bg-slate-50 dark:bg-[#1E2230] text-slate-500 font-semibold border-b border-slate-200 dark:border-[#2A3042]">
                                <tr>
                                  <th className="p-2">Name</th>
                                  <th className="p-2">Email</th>
                                  <th className="p-2">Role</th>
                                  <th className="p-2">Assigned Code</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 dark:divide-[#2A3042]">
                                {importPreviewData.valid.map((u: any, idx: number) => (
                                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-white/5">
                                    <td className="p-2 font-medium">{u.name}</td>
                                    <td className="p-2 font-mono text-[11px]">{u.email}</td>
                                    <td className="p-2 capitalize">{u.role}</td>
                                    <td className="p-2 font-mono font-bold text-crm-blue text-[11px]">{u.previewCode}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => setShowImportModal(false)}
                            className="btn-ghost text-xs px-4"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleCommitImport}
                            disabled={committingImport || importPreviewData.valid.length === 0 || importPreviewData.capacityExceeded}
                            className="btn-primary text-xs px-5 shadow-glow-blue font-bold disabled:opacity-50"
                          >
                            {committingImport ? 'Creating Accounts...' : `Confirm & Onboard ${importPreviewData.valid.length} Users`}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-4 text-center py-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center mx-auto">
                      <CheckCircle2 size={24} />
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">{importResult.message}</h3>
                    <p className="text-xs text-slate-500">
                      Generated credentials for {importResult.count} new users with mandatory password reset on first login.
                    </p>

                    <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-[#2A3042] rounded-xl text-xs text-left">
                      <table className="w-full">
                        <thead className="bg-slate-50 dark:bg-[#1E2230] text-slate-500 font-semibold border-b border-slate-200 dark:border-[#2A3042]">
                          <tr>
                            <th className="p-2">Employee Code</th>
                            <th className="p-2">User</th>
                            <th className="p-2">Temporary Password</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-[#2A3042]">
                          {importResult.users.map((item: any, idx: number) => (
                            <tr key={idx}>
                              <td className="p-2 font-mono font-bold text-crm-blue">{item.user.employeeCode}</td>
                              <td className="p-2">{item.user.name} ({item.user.email})</td>
                              <td className="p-2 font-mono text-emerald-600 dark:text-emerald-400 font-bold">{item.tempPassword}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          const csvOut = 'Employee Code,Name,Email,Temporary Password\n' +
                            importResult.users.map((i: any) => `${i.user.employeeCode},${i.user.name},${i.user.email},${i.tempPassword}`).join('\n');
                          const blob = new Blob([csvOut], { type: 'text/csv' });
                          const url = window.URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = url;
                          link.setAttribute('download', 'onboarded_users_credentials.csv');
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }}
                        className="btn-ghost text-xs gap-1.5 border border-slate-300 dark:border-white/10"
                      >
                        <Download size={13} /> Export Credentials CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowImportModal(false)}
                        className="btn-primary text-xs px-5"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
