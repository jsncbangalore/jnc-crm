import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, UserPlus, Search, RefreshCw, KeyRound, ShieldAlert,
  CheckCircle2, X, Lock, Mail, Phone, Building2, MapPin, Copy,
  Check, UserCheck, UserX, Edit3, Shield, AlertTriangle, Trash2
} from 'lucide-react';
import api, { usersApi } from '../services/api';
import { User, Role } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import TeamsTab from './TeamsTab';

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
  const { user: currentUser, updateUser } = useAuth();
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isAdmin = currentUser?.role === 'admin';
  const canManageUsers = isSuperAdmin || isAdmin;

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'teams'>('users');
  const [teams, setTeams] = useState<any[]>([]);

  // Create User Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: (isSuperAdmin ? 'employee' : 'employee') as 'admin' | 'sub_admin' | 'employee',
    teamId: '',
    warehouseId: 'BLR-MAIN',
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

  const fetchTeams = async () => {
    try {
      const { data } = await api.get('/teams');
      setTeams(data);
    } catch(e) {}
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data } = await usersApi.list({
        search,
        role: roleFilter,
        isActive: statusFilter,
      });
      setUsers(data.items || []);
    } catch (err) {
      console.error('Failed to load team users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeams();
  }, []);

  useEffect(() => {
    if (canManageUsers) {
      const t = setTimeout(fetchUsers, search ? 300 : 0);
      return () => clearTimeout(t);
    }
  }, [search, roleFilter, statusFilter]);

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

  // Handle Delete User (Super Admin protected)
  const handleDeleteUser = (targetUser: User) => {
    if (targetUser.role === 'super_admin') {
      setAlertDialog({
        isOpen: true,
        title: 'Action Blocked',
        message: 'Security Policy: Super Administrator accounts cannot be deleted.',
        variant: 'error',
      });
      return;
    }

    if (targetUser.id === currentUser?.id) {
      setAlertDialog({
        isOpen: true,
        title: 'Action Blocked',
        message: 'You cannot delete your own account.',
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
            <Users size={24} className="text-crm-blue" /> Team & User Management
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
            Configure system users, role-based access, team assignments, and secure credential provisioning
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'users' && isSuperAdmin && (
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

      {/* Navigation Sub-Tabs (Users vs Teams) */}
      <div className="flex border-b border-slate-200 dark:border-[#2A3042] gap-4">
        <button
          onClick={() => setActiveTab('users')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'users'
              ? 'border-crm-blue text-crm-blue'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Users size={16} /> All Active Users ({users.length})
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
      </div>

      {activeTab === 'teams' ? (
        <TeamsTab />
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
                {isSuperAdmin && <option value="admin">Admin</option>}
                <option value="sub_admin">Sub-Admin</option>
                <option value="employee">Sales Employee</option>
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
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              Total Users: <strong className="text-slate-900 dark:text-white">{users.length}</strong>
            </div>
          </div>

          {/* Users Table */}
          <div className="table-wrapper">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Employee / Name</th>
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
                {users.map((u, i) => {
                  const isCurrentUser = u.id === currentUser?.id;
                  const roleBadgeColors: Record<string, string> = {
                    super_admin: 'bg-red-500/10 dark:bg-crm-coral/15 text-red-600 dark:text-crm-coral border-red-500/20 dark:border-crm-coral/30',
                    admin: 'bg-crm-blue/10 dark:bg-crm-blue/15 text-crm-blue dark:text-crm-blue border-crm-blue/20 dark:border-crm-blue/30',
                    sub_admin: 'bg-purple-500/10 dark:bg-crm-violet/15 text-purple-600 dark:text-crm-violet-light border-purple-500/20 dark:border-crm-violet/30',
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
                          {u.role === 'super_admin'
                            ? 'Super Admin'
                            : u.role === 'admin'
                            ? 'Admin'
                            : u.role === 'sub_admin'
                            ? 'Sub-Admin'
                            : u.role === 'project_manager'
                            ? 'Project Manager'
                            : u.role === 'developer_lead'
                            ? 'Developer Lead'
                            : u.role === 'developer'
                            ? 'Developer'
                            : 'Sales Rep'}
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
                          {/* Reset Credentials Action */}
                          <button
                            onClick={() => handleResetCredentials(u)}
                            disabled={actionLoadingId === u.id || (!isSuperAdmin && u.role === 'super_admin')}
                            className="p-1.5 rounded hover:bg-amber-500/10 dark:hover:bg-crm-amber/20 text-slate-400 hover:text-amber-600 dark:hover:text-crm-amber transition-colors"
                            title="Regenerate & Email Temporary Password"
                          >
                            <KeyRound size={14} className={actionLoadingId === u.id ? 'animate-spin' : ''} />
                          </button>

                          {/* Edit User Action */}
                          <button
                            onClick={() => setEditingUser(u)}
                            disabled={!isSuperAdmin && (u.role === 'super_admin' || (u.role === 'admin' && u.id !== currentUser?.id))}
                            className="p-1.5 rounded hover:bg-crm-blue/10 dark:hover:bg-crm-blue/20 text-slate-400 hover:text-crm-blue transition-colors"
                            title="Edit User Details & Role"
                          >
                            <Edit3 size={14} />
                          </button>

                          {/* Deactivate / Reactivate Action */}
                          {!isCurrentUser && (
                            <button
                              onClick={() => handleToggleActive(u)}
                              disabled={actionLoadingId === u.id || (!isSuperAdmin && (u.role === 'super_admin' || u.role === 'admin'))}
                              className={`p-1.5 rounded transition-colors ${
                                u.isActive
                                  ? 'hover:bg-amber-500/10 dark:hover:bg-amber-500/20 text-slate-400 hover:text-amber-600 dark:hover:text-crm-amber'
                                  : 'hover:bg-green-500/10 dark:hover:bg-green-500/20 text-slate-400 hover:text-green-600 dark:hover:text-green-400'
                              }`}
                              title={u.isActive ? 'Deactivate Account' : 'Reactivate Account'}
                            >
                              {u.isActive ? <UserX size={14} /> : <UserCheck size={14} />}
                            </button>
                          )}

                          {/* Delete User Action (Never allowed for Super Admin or Own Account) */}
                          {u.role !== 'super_admin' && !isCurrentUser && (
                            <button
                              onClick={() => handleDeleteUser(u)}
                              disabled={actionLoadingId === u.id || (!isSuperAdmin && u.role === 'admin')}
                              className="p-1.5 rounded hover:bg-red-500/10 dark:hover:bg-red-500/20 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                              title="Delete User Account"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
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
                        role: e.target.value as 'admin' | 'sub_admin' | 'employee',
                      })
                    }
                    required
                  >
                    {/* Super Admin can create Admin, Sub-Admin, Employee, Developer */}
                    {isSuperAdmin && (
                      <option value="admin">Administrator (Full Sales & Inventory Control)</option>
                    )}
                    <option value="sub_admin">Sub-Admin (Warehouse / Stock Manager)</option>
                    <option value="employee">Sales Employee (Lead & Order Processing)</option>
                    <option value="project_manager">Project Manager (Creates Projects & Views All Reports)</option>
                    <option value="developer_lead">Developer Lead (Assigns Developers & Views All Reports)</option>
                    <option value="developer">Developer (Assigned Projects & Own Reports Only)</option>
                  </select>
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

                {/* Role selection restricted by creator */}
                <div>
                  <label className="label">Role</label>
                  <select
                    className="input text-xs font-medium"
                    value={editingUser.role}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as Role })}
                    disabled={editingUser.role === 'super_admin'}
                  >
                    {editingUser.role === 'super_admin' && (
                      <option value="super_admin">Super Administrator (System Owner)</option>
                    )}
                    {isSuperAdmin && <option value="admin">Administrator</option>}
                    <option value="sub_admin">Sub-Admin (Warehouse / Stock)</option>
                    <option value="employee">Sales Employee</option>
                    <option value="project_manager">Project Manager (Creates Projects & Views All Reports)</option>
                    <option value="developer_lead">Developer Lead (Assigns Developers & Views All Reports)</option>
                    <option value="developer">Developer (Assigned Projects & Own Reports Only)</option>
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

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#2A3042]">
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
    </div>
  );
}
