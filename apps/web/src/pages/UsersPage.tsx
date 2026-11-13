import React, { useEffect, useState } from 'react';
import { useSearchParams, NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, UserPlus, Search, RefreshCw, KeyRound, ShieldAlert,
  CheckCircle2, X, Lock, Mail, Phone, Building2, MapPin, Copy,
  Check, UserCheck, UserX, Edit3, Shield, ShieldCheck, AlertTriangle, Trash2, Clock,
  Upload, Download, FileSpreadsheet, Sliders, FileText, Unlock, LogOut,
  CheckSquare, Square, Layers, LayoutGrid, ChevronRight, Eye, Plus, Sparkles, FolderKey
} from 'lucide-react';
import api, { usersApi, authApi } from '../services/api';
import { User, Role } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { NameField, PhoneField } from '../components/common/forms';
import TeamsTab from './TeamsTab';
import { getProductName } from '../config/brand';
import { ROLE_RANKS, ROLE_LABELS, getAllowedAssignableRoles, isPlatformOwner } from '../utils/roles';
import {
  ALL_COMPANY_PAGE_KEYS,
  COMPANY_PAGE_REGISTRY,
  PAGE_GROUPS,
  getCompanyPagesGrouped,
  STANDARD_TEMPLATES,
  getLegacyPagesForRole,
  PageDefinition,
  PageGroup,
} from '../config/page-registry';

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

interface PageSelectorProps {
  selectedPages: string[];
  onChangePages: (pages: string[]) => void;
  homePage: string;
  onChangeHomePage: (homePage: string) => void;
  selectedTemplate: string;
  onChangeTemplate: (templateId: string) => void;
  templates: any[];
}

function UserPagePermissionsSelector({
  selectedPages,
  onChangePages,
  homePage,
  onChangeHomePage,
  selectedTemplate,
  onChangeTemplate,
  templates,
}: PageSelectorProps) {
  const groupedPages = getCompanyPagesGrouped();

  const handleApplyTemplate = (tplId: string) => {
    onChangeTemplate(tplId);
    if (!tplId) return;

    let targetPages: string[] | null = null;
    if (STANDARD_TEMPLATES[tplId]) {
      targetPages = STANDARD_TEMPLATES[tplId].pages;
    } else {
      const customTpl = templates.find((t) => t.id === tplId);
      if (customTpl && Array.isArray(customTpl.pages)) {
        targetPages = customTpl.pages;
      }
    }

    if (targetPages) {
      onChangePages(targetPages);
      if (!targetPages.includes(homePage)) {
        onChangeHomePage(targetPages[0] || '');
      }
    }
  };

  const handleSelectAllGlobal = () => {
    onChangePages([...ALL_COMPANY_PAGE_KEYS]);
    if (!homePage && ALL_COMPANY_PAGE_KEYS.length > 0) {
      onChangeHomePage(ALL_COMPANY_PAGE_KEYS[0]);
    }
  };

  const handleClearAllGlobal = () => {
    onChangePages([]);
    onChangeHomePage('');
  };

  return (
    <div className="space-y-4 pt-1">
      {/* ─── Top Controls: Template Dropdown & Global Actions ───────────── */}
      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1 flex-1">
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Layers size={13} className="text-crm-blue" /> Quick Permission Template
            </label>
            <select
              className="input text-xs w-full py-1.5"
              value={selectedTemplate}
              onChange={(e) => handleApplyTemplate(e.target.value)}
            >
              <option value="">Custom Selection (Choose pages below)</option>
              <optgroup label="Standard Templates">
                {Object.entries(STANDARD_TEMPLATES).map(([key, tpl]) => (
                  <option key={key} value={key}>
                    {tpl.name} ({tpl.pages.length} pages)
                  </option>
                ))}
              </optgroup>
              {templates.length > 0 && (
                <optgroup label="Company Access Templates">
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name} ({Array.isArray(tpl.pages) ? tpl.pages.length : 0} pages)
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>

        {/* Home Page Selection */}
        <div className="pt-2 border-t border-slate-200 dark:border-[#2A3042]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Default Landing / Home Page *
              </label>
              <p className="text-[11px] text-slate-500">
                User will immediately land on this page upon logging in or navigating to "/".
              </p>
            </div>
            <select
              className="input text-xs w-full sm:w-60 py-1.5"
              value={homePage}
              onChange={(e) => onChangeHomePage(e.target.value)}
              disabled={selectedPages.length === 0}
            >
              {selectedPages.length === 0 ? (
                <option value="">No pages granted (No Access screen)</option>
              ) : (
                selectedPages.map((pageKey) => {
                  const def = COMPANY_PAGE_REGISTRY[pageKey];
                  return (
                    <option key={pageKey} value={pageKey}>
                      {def ? `${def.label} (${def.frontendRoutes[0]})` : pageKey}
                    </option>
                  );
                })
              )}
            </select>
          </div>
        </div>

        {/* Selected Counter */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
          <span className="font-mono text-[11px]">
            Granted: <strong className="text-crm-blue font-bold">{selectedPages.length}</strong> of {ALL_COMPANY_PAGE_KEYS.length} modules
          </span>
          {selectedPages.length === 0 && (
            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle size={12} /> 0 pages granted — user sees No Access screen
            </span>
          )}
        </div>
      </div>

      {/* ─── Grouped Checklists ──────────────────────────────────────────── */}
      <div className="space-y-3">
        {PAGE_GROUPS.map((group) => {
          const pagesInGroup = groupedPages[group] || [];
          const selectedInGroup = pagesInGroup.filter((p) => selectedPages.includes(p.key));
          const allInGroup = selectedInGroup.length === pagesInGroup.length;
          const groupKeys = pagesInGroup.map((p) => p.key);

          return (
            <div
              key={group}
              className="border border-slate-200 dark:border-[#2A3042] rounded-xl overflow-hidden bg-white dark:bg-[#181B26]"
            >
              <div className="p-2.5 bg-slate-50 dark:bg-[#1A1D29] border-b border-slate-200 dark:border-[#2A3042] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    {group}
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-200 dark:bg-[#2A3042] text-slate-700 dark:text-slate-300 font-semibold">
                    {selectedInGroup.length} / {pagesInGroup.length}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (allInGroup) {
                        const nextPages = selectedPages.filter((k) => !groupKeys.includes(k));
                        onChangePages(nextPages);
                        if (!nextPages.includes(homePage)) {
                          onChangeHomePage(nextPages[0] || '');
                        }
                      } else {
                        const nextPages = Array.from(new Set([...selectedPages, ...groupKeys]));
                        onChangePages(nextPages);
                        if (!homePage) {
                          onChangeHomePage(nextPages[0] || '');
                        }
                      }
                    }}
                    className="text-xs text-crm-blue hover:underline font-semibold cursor-pointer"
                  >
                    {allInGroup ? 'Clear Group' : 'Select All in Group'}
                  </button>
                </div>
              </div>

              <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2 bg-white dark:bg-[#141722]">
                {pagesInGroup.map((page) => {
                  const isChecked = selectedPages.includes(page.key);
                  return (
                    <label
                      key={page.key}
                      className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        isChecked
                          ? 'border-crm-blue/40 bg-crm-blue/5 dark:bg-crm-blue/10 text-slate-900 dark:text-white'
                          : 'border-slate-200 dark:border-[#2A3042] hover:bg-slate-50 dark:hover:bg-[#1E2230] text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          let nextPages: string[];
                          if (isChecked) {
                            nextPages = selectedPages.filter((k) => k !== page.key);
                          } else {
                            nextPages = [...selectedPages, page.key];
                          }
                          onChangePages(nextPages);
                          if (!nextPages.includes(homePage)) {
                            onChangeHomePage(nextPages[0] || '');
                          }
                        }}
                        className="mt-0.5 rounded border-slate-300 text-crm-blue focus:ring-crm-blue"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold leading-tight truncate">{page.label}</span>
                          <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                            {page.frontendRoutes[0]}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug line-clamp-2">
                          {page.description}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function UsersPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
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
  const [activeTab, setActiveTab] = useState<'users' | 'teams' | 'templates' | 'signins'>('users');
  const [teams, setTeams] = useState<any[]>([]);
  const [recentSignIns, setRecentSignIns] = useState<any[]>([]);
  const [loadingSignIns, setLoadingSignIns] = useState(false);
  const [showMyProfile, setShowMyProfile] = useState(false);

  // Per-User Granular Access Modal State
  const [accessUser, setAccessUser] = useState<User | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessData, setAccessData] = useState<any | null>(null);
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [savingAccess, setSavingAccess] = useState(false);
  const [accessCopyUserId, setAccessCopyUserId] = useState('');
  const [accessTemplateId, setAccessTemplateId] = useState('');
  const [accessTeamId, setAccessTeamId] = useState('');
  const [accessHomePage, setAccessHomePage] = useState('');

  // Access Templates State (Company Predefined Presets)
  const [templates, setTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<{ id?: string; name: string; description: string; pages: string[] } | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Platform Migration Helper Dry-Run State
  const [dryRunData, setDryRunData] = useState<any | null>(null);
  const [runningDryRun, setRunningDryRun] = useState(false);

  const groupedPages = getCompanyPagesGrouped();

  // Filter out current user's profile and platform super admin so only employee/staff profiles are shown
  const visibleUsers = users.filter((u) => {
    if (!showMyProfile && u.id === currentUser?.id) return false;
    if (!isPlatform && u.role === 'platform_super_admin') return false;
    return true;
  });

  const usersWithNoPages = users.filter((u: any) =>
    u.hasZeroPages ||
    (u.role !== 'tenant_admin' &&
     u.role !== 'platform_super_admin' &&
     (u.pagesCount === 0 || (!u.pageAccess?.pages && !u.teamRef?.allowedPages)))
  );

  // Create User Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createPages, setCreatePages] = useState<string[]>(() => getLegacyPagesForRole(assignableRoles[0] || 'employee'));
  const [createHomePage, setCreateHomePage] = useState<string>('dashboard');
  const [createTemplateId, setCreateTemplateId] = useState<string>('');
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
  const [editPages, setEditPages] = useState<string[]>([]);
  const [editHomePage, setEditHomePage] = useState<string>('');
  const [editTemplateId, setEditTemplateId] = useState<string>('');
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

  // Extend Grace Period Modal State (requires acting admin password or TOTP)
  const [extendGraceModal, setExtendGraceModal] = useState<{
    isOpen: boolean;
    targetUser: User | null;
    days: number;
    adminPassword: string;
    adminTotp: string;
    loading: boolean;
    error: string;
  }>({
    isOpen: false,
    targetUser: null,
    days: 7,
    adminPassword: '',
    adminTotp: '',
    loading: false,
    error: '',
  });

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
      link.setAttribute('download', 'users_import_template.csv');
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

  const fetchTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const { data } = await usersApi.getAccessTemplates();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load templates', e);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleOpenAccessModal = async (targetUser: User) => {
    setAccessUser(targetUser);
    setAccessLoading(true);
    setAccessCopyUserId('');
    setAccessTemplateId('');
    setAccessTeamId('');
    try {
      fetchTemplates();
      const { data } = await usersApi.getUserAccess(targetUser.id);
      setAccessData(data);
      const p = Array.isArray(data?.customPages)
        ? data.customPages
        : Array.isArray(data?.effectivePages)
        ? data.effectivePages
        : [];
      setSelectedPages(p);
      setAccessHomePage(data?.homePage || p[0] || 'dashboard');
    } catch (err: any) {
      setAlertDialog({
        isOpen: true,
        title: 'Error Loading Access',
        message: err?.response?.data?.message || err.message || 'Could not load page access for this user.',
        variant: 'error',
      });
      setAccessUser(null);
    } finally {
      setAccessLoading(false);
    }
  };

  const executeSaveAccess = async () => {
    if (!accessUser) return;
    setSavingAccess(true);
    try {
      await usersApi.updateUserAccess(accessUser.id, selectedPages, accessHomePage);
      setAlertDialog({
        isOpen: true,
        title: 'Access Saved',
        message: `Page access permissions for ${accessUser.name} have been updated successfully.`,
        variant: 'success',
      });
      setAccessUser(null);
      await fetchUsers();
      if (accessUser.id === currentUser?.id) {
        const { data: meData } = await authApi.me();
        if (meData?.user) {
          updateUser(meData.user);
        }
      }
    } catch (err: any) {
      setAlertDialog({
        isOpen: true,
        title: 'Save Failed',
        message: err?.response?.data?.message || err.message || 'Failed to update page access.',
        variant: 'error',
      });
    } finally {
      setSavingAccess(false);
    }
  };

  const handleSaveAccess = async () => {
    if (!accessUser) return;
    const isAdminRole = ['platform_admin', 'platform_super_admin', 'tenant_admin'].includes(accessUser.role);
    if (isAdminRole && (selectedPages.length === 0 || selectedPages.length < ALL_COMPANY_PAGE_KEYS.length)) {
      setAlertDialog({
        isOpen: true,
        title: 'Administrator Access Protected',
        message: 'Administrators (platform_admin and tenant_admin) must retain access to all company pages and can never be left with 0 pages.',
        variant: 'error',
      });
      return;
    }
    if (accessUser.id === currentUser?.id && !selectedPages.includes('users')) {
      setConfirmDialog({
        isOpen: true,
        title: 'Warning: Removing Own User Access',
        message: 'You are modifying your own access and removing the User Accounts & Roles page. You will lose the ability to manage user permissions. Do you want to proceed?',
        confirmText: 'Save Anyway',
        variant: 'danger',
        iconType: 'alert',
        onConfirm: async () => {
          setConfirmDialog(null);
          await executeSaveAccess();
        },
      });
      return;
    }
    await executeSaveAccess();
  };

  const handleResetToTeam = async () => {
    if (!accessUser) return;
    setConfirmDialog({
      isOpen: true,
      title: 'Reset to Team Inherit?',
      message: `This will remove all custom page overrides for ${accessUser.name} and restore page access inherited from their team (${accessUser.teamRef?.name || 'No Team'}).`,
      confirmText: 'Reset to Team',
      variant: 'primary',
      iconType: 'toggle',
      onConfirm: async () => {
        setConfirmDialog(null);
        setSavingAccess(true);
        try {
          await usersApi.resetUserAccess(accessUser.id);
          setAlertDialog({
            isOpen: true,
            title: 'Access Reset',
            message: `Custom access cleared. ${accessUser.name} now inherits module access from their team.`,
            variant: 'success',
          });
          setAccessUser(null);
          await fetchUsers();
        } catch (err: any) {
          setAlertDialog({
            isOpen: true,
            title: 'Reset Failed',
            message: err?.response?.data?.message || err.message || 'Failed to reset access.',
            variant: 'error',
          });
        } finally {
          setSavingAccess(false);
        }
      },
    });
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate || !editingTemplate.name.trim()) return;
    setSavingTemplate(true);
    try {
      if (editingTemplate.id) {
        await usersApi.updateAccessTemplate(editingTemplate.id, {
          name: editingTemplate.name.trim(),
          description: editingTemplate.description?.trim(),
          pages: editingTemplate.pages,
        });
        setAlertDialog({
          isOpen: true,
          title: 'Template Updated',
          message: `Access template "${editingTemplate.name}" has been updated.`,
          variant: 'success',
        });
      } else {
        await usersApi.createAccessTemplate({
          name: editingTemplate.name.trim(),
          description: editingTemplate.description?.trim(),
          pages: editingTemplate.pages,
        });
        setAlertDialog({
          isOpen: true,
          title: 'Template Created',
          message: `Access template "${editingTemplate.name}" has been created.`,
          variant: 'success',
        });
      }
      setEditingTemplate(null);
      await fetchTemplates();
    } catch (err: any) {
      setAlertDialog({
        isOpen: true,
        title: 'Save Failed',
        message: err?.response?.data?.message || err.message || 'Failed to save template.',
        variant: 'error',
      });
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = (tpl: any) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Access Template?',
      message: `Are you sure you want to delete template "${tpl.name}"? Users already assigned these pages will not be affected.`,
      confirmText: 'Delete Template',
      variant: 'danger',
      iconType: 'trash',
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          await usersApi.deleteAccessTemplate(tpl.id);
          await fetchTemplates();
        } catch (err: any) {
          setAlertDialog({
            isOpen: true,
            title: 'Delete Failed',
            message: err?.response?.data?.message || err.message || 'Failed to delete template.',
            variant: 'error',
          });
        }
      },
    });
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
    } else if (activeTab === 'templates' && canManageUsers) {
      fetchTemplates();
    }
  }, [activeTab]);

  useEffect(() => {
    if (searchParams.get('action') === 'create') {
      setShowCreateModal(true);
    }
    if (searchParams.get('tab') === 'teams') {
      setActiveTab('teams');
    } else if (searchParams.get('tab') === 'templates') {
      setActiveTab('templates');
    } else if (searchParams.get('tab') === 'signins' || searchParams.get('tab') === 'audit') {
      setActiveTab('signins');
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
  const executeCreateUser = async () => {
    setCreating(true);
    try {
      const { data } = await usersApi.create({
        ...createForm,
        pages: createPages,
        homePage: createHomePage,
      });
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
        warehouseId: 'WH-MAIN',
      });
      setCreatePages(getLegacyPagesForRole('employee'));
      setCreateHomePage('dashboard');
      setCreateTemplateId('');
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

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createPages.length === 0) {
      setConfirmDialog({
        isOpen: true,
        title: 'Warning: Creating User With No Pages',
        message:
          'This user will be created without any granted pages. When they log in, they will only see the "No Access Granted" screen with a sign out button. Are you sure you want to proceed?',
        confirmText: 'Create Without Pages',
        variant: 'danger',
        iconType: 'alert',
        onConfirm: async () => {
          setConfirmDialog(null);
          await executeCreateUser();
        },
      });
      return;
    }
    await executeCreateUser();
  };

  const handleOpenEditModal = async (u: User) => {
    setEditingUser(u);
    setEditTemplateId('');
    try {
      fetchTemplates();
      const { data } = await usersApi.getUserAccess(u.id);
      const p = Array.isArray(data?.customPages)
        ? data.customPages
        : Array.isArray(data?.effectivePages)
        ? data.effectivePages
        : [];
      setEditPages(p);
      setEditHomePage(data?.homePage || p[0] || '');
    } catch {
      const p = (u as any).configuredPages || getLegacyPagesForRole(u.role);
      setEditPages(p);
      setEditHomePage((u as any).homePage || p[0] || '');
    }
  };

  const executeUpdateUser = async () => {
    if (!editingUser) return;
    setUpdating(true);
    try {
      await usersApi.update(editingUser.id, {
        name: editingUser.name,
        phone: editingUser.phone,
        role: editingUser.role,
        teamId: editingUser.teamId,
        warehouseId: editingUser.warehouseId,
      });
      await usersApi.updateUserAccess(editingUser.id, editPages, editHomePage);
      if (editingUser.id === currentUser?.id) {
        updateUser({ name: editingUser.name, phone: editingUser.phone });
        const { data: meData } = await authApi.me();
        if (meData?.user) {
          updateUser(meData.user);
        }
      }
      setEditingUser(null);
      setAlertDialog({
        isOpen: true,
        title: 'User Profile & Access Updated',
        message: `Profile and page permissions for ${editingUser.name} [${editingUser.employeeCode}] updated successfully!`,
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

  // Handle Edit User Submit
  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    if (editPages.length === 0) {
      setConfirmDialog({
        isOpen: true,
        title: 'Warning: Removing All Pages',
        message: `This will remove all page permissions from ${editingUser.name}. They will only see the "No Access Granted" screen upon login. Are you sure you want to proceed?`,
        confirmText: 'Save Without Pages',
        variant: 'danger',
        iconType: 'alert',
        onConfirm: async () => {
          setConfirmDialog(null);
          await executeUpdateUser();
        },
      });
      return;
    }

    await executeUpdateUser();
  };

  const handleRunMigrationDryRun = async () => {
    setRunningDryRun(true);
    try {
      const { data } = await usersApi.runMigrationDryRun();
      setDryRunData(data);
    } catch (err: any) {
      setAlertDialog({
        isOpen: true,
        title: 'Dry Run Failed',
        message: err?.response?.data?.message || err.message || 'Failed to execute migration dry run.',
        variant: 'error',
      });
    } finally {
      setRunningDryRun(false);
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

  // Handle Reset 2-Step Verification
  const handleResetUserTwoFactor = (targetUser: User) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Reset 2-Step Verification?',
      message: `Are you sure you want to reset 2-Step Verification for ${targetUser.name} (${targetUser.email})? Their authenticator secret and backup recovery codes will be removed immediately.`,
      confirmText: 'Reset 2-Step Verification',
      variant: 'warning',
      iconType: 'alert',
      onConfirm: async () => {
        setActionLoadingId(targetUser.id);
        setConfirmDialog(null);
        try {
          await usersApi.resetTwoFactor(targetUser.id);
          await fetchUsers();
          setAlertDialog({
            isOpen: true,
            title: '2-Step Verification Reset',
            message: `2-Step verification has been reset for ${targetUser.name}. They can now sign in with their password only.`,
            variant: 'success',
          });
        } catch (err: any) {
          setAlertDialog({
            isOpen: true,
            title: 'Action Failed',
            message: 'Failed to reset 2-Step verification: ' + (err?.response?.data?.message || err.message),
            variant: 'error',
          });
        } finally {
          setActionLoadingId(null);
        }
      },
    });
  };

  // Handle Extend 2-Step Grace Period Modal (Requires Admin Password or TOTP)
  const handleOpenExtendGraceModal = (targetUser: User) => {
    setExtendGraceModal({
      isOpen: true,
      targetUser,
      days: 7,
      adminPassword: '',
      adminTotp: '',
      loading: false,
      error: '',
    });
  };

  const handleSubmitExtendGrace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extendGraceModal.targetUser) return;
    if (!extendGraceModal.adminPassword.trim() && !extendGraceModal.adminTotp.trim()) {
      setExtendGraceModal((prev) => ({
        ...prev,
        error: 'Admin authorization required. Enter your admin password or 2-step verification code.',
      }));
      return;
    }

    setExtendGraceModal((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      await usersApi.extendTwoFactorGrace(
        extendGraceModal.targetUser.id,
        extendGraceModal.days,
        extendGraceModal.adminPassword.trim() || undefined,
        extendGraceModal.adminTotp.trim() || undefined
      );
      await fetchUsers();
      const userName = extendGraceModal.targetUser.name;
      const days = extendGraceModal.days;
      setExtendGraceModal({
        isOpen: false,
        targetUser: null,
        days: 7,
        adminPassword: '',
        adminTotp: '',
        loading: false,
        error: '',
      });
      setAlertDialog({
        isOpen: true,
        title: 'Grace Period Extended',
        message: `Grace period for ${userName} has been extended by ${days} days.`,
        variant: 'success',
      });
    } catch (err: any) {
      setExtendGraceModal((prev) => ({
        ...prev,
        loading: false,
        error: err?.response?.data?.message || err.message || 'Failed to extend grace period.',
      }));
    }
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
    const text = `${getProductName()} Login Credentials:\nPortal: ${portalUrl}\nEmployee Code: ${createdCredentialModal.user.employeeCode}\nTemporary Password: ${createdCredentialModal.tempPassword}\nNote: Please change your password on first login.`;
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
          {isPlatform && (
            <button
              type="button"
              onClick={handleRunMigrationDryRun}
              disabled={runningDryRun}
              className="btn bg-purple-600 hover:bg-purple-700 text-white text-xs gap-1.5 shadow-xs cursor-pointer"
              title="Run idempotent page access migration dry run"
            >
              <Sparkles size={14} className={runningDryRun ? 'animate-spin' : ''} />
              {runningDryRun ? 'Simulating...' : 'Migration Dry Run'}
            </button>
          )}
          <button onClick={fetchUsers} className="btn-ghost text-xs gap-1.5" title="Refresh user list">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs (Users vs Teams vs Templates vs Recent Sign-ins) */}
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
            onClick={() => setActiveTab('templates')}
            className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'templates'
                ? 'border-crm-teal text-crm-teal'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <FolderKey size={16} /> Access Templates ({templates.length})
          </button>
        )}
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
      ) : activeTab === 'templates' ? (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042] flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FolderKey size={16} className="text-crm-teal" /> Company Access Templates
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Standard permission presets for company job roles. Apply templates in one click when configuring user page access.
              </p>
            </div>
            <button
              onClick={() =>
                setEditingTemplate({
                  name: '',
                  description: '',
                  pages: [],
                })
              }
              className="btn-primary text-xs gap-1.5 shadow-glow-blue"
            >
              <Plus size={14} /> Create New Template
            </button>
          </div>

          {loadingTemplates ? (
            <div className="text-center py-12 text-slate-400">
              <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-crm-blue" />
              Loading access templates...
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-[#2A3042] rounded-2xl p-8 space-y-3">
              <FolderKey size={36} className="mx-auto text-slate-400" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No Access Templates Created Yet</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Create reusable page bundles (e.g., "Sales Rep", "Accountant", "Logistics Executive") to quickly provision team members.
              </p>
              <button
                onClick={() =>
                  setEditingTemplate({
                    name: '',
                    description: '',
                    pages: [],
                  })
                }
                className="btn-primary text-xs gap-1.5 mx-auto"
              >
                <Plus size={14} /> Create Your First Template
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#181B26] p-4 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <FolderKey size={15} className="text-crm-teal shrink-0" />
                        {tpl.name}
                      </h4>
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#2A3042] text-slate-600 dark:text-slate-300 font-semibold">
                        {Array.isArray(tpl.pages) ? tpl.pages.length : 0} pages
                      </span>
                    </div>
                    {tpl.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                        {tpl.description}
                      </p>
                    )}
                    <div className="pt-2 flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                      {(tpl.pages || []).map((pageKey: string) => (
                        <span
                          key={pageKey}
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#222736] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#2A3042]"
                        >
                          {COMPANY_PAGE_REGISTRY[pageKey]?.label || pageKey}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 mt-3 border-t border-slate-100 dark:border-[#2A3042]">
                    <button
                      onClick={() =>
                        setEditingTemplate({
                          id: tpl.id,
                          name: tpl.name,
                          description: tpl.description || '',
                          pages: Array.isArray(tpl.pages) ? tpl.pages : [],
                        })
                      }
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#2A3042] text-slate-500 hover:text-crm-blue transition-colors text-xs flex items-center gap-1"
                    >
                      <Edit3 size={13} /> Edit
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(tpl)}
                      className="p-1.5 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-500 transition-colors text-xs flex items-center gap-1"
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : activeTab === 'signins' ? (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 text-xs text-blue-800 dark:text-blue-300 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert size={16} className="text-crm-blue shrink-0" />
              <span>
                Audited sign-in attempts for this workspace. Identifiers and IP addresses are masked (first two octets). No passwords, hashes, or session tokens are ever logged or displayed.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate('/audit-logs')}
                className="px-3 py-1.5 rounded-lg bg-crm-blue text-white font-bold text-xs shadow-xs hover:bg-crm-blue/90 flex items-center gap-1.5 cursor-pointer"
              >
                <ShieldCheck size={13} /> Full Security Dashboard
              </button>
              <button
                onClick={fetchRecentSignIns}
                disabled={loadingSignIns}
                className="btn-ghost text-xs gap-1.5 shrink-0"
                title="Refresh sign-in logs"
              >
                <RefreshCw size={13} className={loadingSignIns ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
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

          {/* Banner: N users have no pages */}
          {usersWithNoPages.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-start sm:items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-xs sm:text-sm">
                    {usersWithNoPages.length} {usersWithNoPages.length === 1 ? 'user has' : 'users have'} no pages
                  </h4>
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                    These accounts currently see the "No Access Granted" screen until page permissions are assigned.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap shrink-0">
                {usersWithNoPages.slice(0, 4).map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleOpenAccessModal(u)}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-xs cursor-pointer transition-colors"
                  >
                    Access: {u.name.split(' ')[0]}
                  </button>
                ))}
                {usersWithNoPages.length > 4 && (
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
                    +{usersWithNoPages.length - 4} more
                  </span>
                )}
              </div>
            </div>
          )}

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
                            <MapPin size={11} className="text-slate-400 dark:text-slate-600" /> {u.warehouseId || 'WH-MAIN'}
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
                        {/* 2-Step Verification badge */}
                        <div className="mt-1">
                          {u.twoFactor?.enabledAt ? (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                              title={`2-Step Verification Active (${u.twoFactor.method})`}
                            >
                              <ShieldCheck size={10} /> 2-Step: On
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                              title="2-Step Verification Disabled"
                            >
                              2-Step: Off
                            </span>
                          )}
                        </div>
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

                          {/* Reset 2-Step Verification Action */}
                          {u.twoFactor?.enabledAt && !isCurrentUser && (
                            <button
                              onClick={() => handleResetUserTwoFactor(u)}
                              disabled={actionLoadingId === u.id || !canActOnUser}
                              className="p-1.5 rounded hover:bg-purple-500/10 dark:hover:bg-purple-500/20 text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              title="Reset 2-Step Verification (remove authenticator & backup codes)"
                            >
                              <ShieldAlert size={14} className={actionLoadingId === u.id ? 'animate-spin' : ''} />
                            </button>
                          )}

                          {/* Extend 2-Step Grace Period Action */}
                          {!isCurrentUser && (isPlatform || currentUser?.role === 'tenant_admin') && (
                            <button
                              onClick={() => handleOpenExtendGraceModal(u)}
                              disabled={actionLoadingId === u.id || !canActOnUser}
                              className="p-1.5 rounded hover:bg-amber-500/10 dark:hover:bg-amber-500/20 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              title="Extend grace period"
                              aria-label="Extend grace period"
                            >
                              <Clock size={14} className={actionLoadingId === u.id ? 'animate-spin' : ''} />
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

                          {/* Granular Page Access Action */}
                          <button
                            onClick={() => handleOpenAccessModal(u)}
                            disabled={actionLoadingId === u.id || !canEditUser}
                            className="p-1.5 rounded hover:bg-crm-blue/10 dark:hover:bg-crm-blue/20 text-slate-400 hover:text-crm-blue dark:hover:text-crm-blue-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Manage User Page Access Permissions"
                          >
                            <Sliders size={14} />
                          </button>

                          {/* Edit User Action */}
                          <button
                            onClick={() => handleOpenEditModal(u)}
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
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-2xl max-h-[90vh] shadow-2xl overflow-y-auto my-auto"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] sticky top-0 z-10">
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
                <NameField
                  label="Full Name"
                  required
                  placeholder="Enter full name"
                  value={createForm.name}
                  onChange={(val) => setCreateForm({ ...createForm, name: val })}
                  maxLength={60}
                />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Official Email Address *</label>
                    <input
                      type="email"
                      className="input text-xs"
                      placeholder="user@example.com"
                      value={createForm.email}
                      onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <PhoneField
                      label="Phone Number"
                      required
                      placeholder="10-digit mobile number"
                      value={createForm.phone}
                      onChange={(val) => setCreateForm({ ...createForm, phone: val })}
                    />
                  </div>
                </div>

                {/* Role Dropdown Constrained by Creator Role */}
                <div>
                  <label className="label">Access Role *</label>
                  <select
                    className="input text-xs font-medium"
                    value={createForm.role}
                    onChange={(e) => {
                      const newRole = e.target.value as Role;
                      setCreateForm({
                        ...createForm,
                        role: newRole,
                      });
                      const defaultPages = getLegacyPagesForRole(newRole);
                      setCreatePages(defaultPages);
                      setCreateHomePage(defaultPages[0] || 'dashboard');
                      setCreateTemplateId('');
                    }}
                    required
                  >
                    {assignableRoles.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r] || r}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Role sets job title and administrative powers. Specific module pages are configured below.
                  </p>
                </div>

                {/* Live Auto-Generated ID Preview */}
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 font-medium">Auto-Generated Employee ID:</span>
                  <span className="font-mono text-xs font-bold text-crm-blue bg-crm-blue/10 px-2 py-0.5 rounded border border-crm-blue/20">
                    {(currentUser?.tenant?.code || 'TENANT')}-{ROLE_CODE_MAP[createForm.role] || 'EMP'}-XXX
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

                {/* Granular Page Checklist and Home Page Select */}
                <div className="pt-2 border-t border-slate-200 dark:border-[#2A3042]">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white mb-1 flex items-center gap-1.5">
                    <Shield size={14} className="text-crm-blue" />
                    Granted Page Permissions & Landing Page
                  </h4>
                  <p className="text-[11px] text-slate-500 mb-2">
                    Select exactly which pages this user can view across all screens and navigation bars.
                  </p>
                  <UserPagePermissionsSelector
                    selectedPages={createPages}
                    onChangePages={setCreatePages}
                    homePage={createHomePage}
                    onChangeHomePage={setCreateHomePage}
                    selectedTemplate={createTemplateId}
                    onChangeTemplate={setCreateTemplateId}
                    templates={templates}
                  />
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042] text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <p className="font-semibold text-slate-800 dark:text-slate-300 flex items-center gap-1">
                    <CheckCircle2 size={13} className="text-crm-teal" /> Automatic Credential Provisioning:
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    An employee code will be automatically generated alongside a cryptographically secure temporary password. Credentials will be securely dispatched to the user's email address.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#2A3042] sticky bottom-0 bg-white dark:bg-[#181B26] py-2">
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
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-2xl max-h-[90vh] shadow-2xl overflow-y-auto my-auto"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] sticky top-0 z-10">
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
                <NameField
                  label="Full Name"
                  required
                  placeholder="Enter full name"
                  value={editingUser.name}
                  onChange={(val) => setEditingUser({ ...editingUser, name: val })}
                  maxLength={60}
                />

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
                    <PhoneField
                      label="Phone Number"
                      placeholder="10-digit mobile number"
                      value={editingUser.phone || ''}
                      onChange={(val) => setEditingUser({ ...editingUser, phone: val })}
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
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Role sets job title and administrative powers. Specific module pages are configured below.
                  </p>
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
                      value={editingUser.warehouseId || 'WH-MAIN'}
                      onChange={(e) => setEditingUser({ ...editingUser, warehouseId: e.target.value })}
                    >
                      <option value="WH-MAIN">WH-MAIN (Main Warehouse)</option>
                    </select>
                  </div>
                </div>

                {/* Granular Page Checklist and Home Page Select */}
                <div className="pt-2 border-t border-slate-200 dark:border-[#2A3042]">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white mb-1 flex items-center gap-1.5">
                    <Shield size={14} className="text-crm-blue" />
                    Granted Page Permissions & Landing Page
                  </h4>
                  <p className="text-[11px] text-slate-500 mb-2">
                    Modify the exact page permissions and default home page for this user.
                  </p>
                  <UserPagePermissionsSelector
                    selectedPages={editPages}
                    onChangePages={setEditPages}
                    homePage={editHomePage}
                    onChangeHomePage={setEditHomePage}
                    selectedTemplate={editTemplateId}
                    onChangeTemplate={setEditTemplateId}
                    templates={templates}
                  />
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-[#2A3042] sticky bottom-0 bg-white dark:bg-[#181B26] py-2">
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

      {/* ─── MODAL: Extend 2-Step Grace Period (Requires Admin Password or TOTP) ─ */}
      <AnimatePresence>
        {extendGraceModal.isOpen && extendGraceModal.targetUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/20 dark:border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Clock size={20} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Extend 2-Step Grace Period
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Extend the enrollment grace period for{' '}
                    <strong className="text-slate-900 dark:text-slate-200">
                      {extendGraceModal.targetUser.name}
                    </strong>{' '}
                    ({extendGraceModal.targetUser.email}).
                  </p>
                </div>
              </div>

              {extendGraceModal.error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-medium flex items-center gap-2">
                  <AlertTriangle size={15} className="shrink-0" />
                  <span>{extendGraceModal.error}</span>
                </div>
              )}

              <form onSubmit={handleSubmitExtendGrace} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Extend by (days):
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={extendGraceModal.days}
                    onChange={(e) =>
                      setExtendGraceModal((prev) => ({
                        ...prev,
                        days: Math.max(1, parseInt(e.target.value) || 1),
                      }))
                    }
                    className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-[#131620] border border-slate-200 dark:border-[#2A3042] text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#131620] border border-slate-200 dark:border-[#2A3042] space-y-2.5">
                  <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                    <Shield size={13} className="text-blue-500" />
                    <span>Admin Authorization Required</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                    Enter your admin password or your 6-digit authenticator code to authorize this grace period extension.
                  </p>

                  <div className="space-y-2 pt-1">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Your Admin Password:
                      </label>
                      <input
                        type="password"
                        placeholder="Admin password"
                        value={extendGraceModal.adminPassword}
                        onChange={(e) =>
                          setExtendGraceModal((prev) => ({ ...prev, adminPassword: e.target.value }))
                        }
                        className="w-full h-9 px-3 rounded-lg bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase">OR</span>
                      <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Your 6-Digit Authenticator Code (TOTP):
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="e.g. 123456"
                        value={extendGraceModal.adminTotp}
                        onChange={(e) =>
                          setExtendGraceModal((prev) => ({
                            ...prev,
                            adminTotp: e.target.value.replace(/\D/g, '').slice(0, 6),
                          }))
                        }
                        className="w-full h-9 px-3 rounded-lg bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-[#2A3042]">
                  <button
                    type="button"
                    onClick={() =>
                      setExtendGraceModal({
                        isOpen: false,
                        targetUser: null,
                        days: 7,
                        adminPassword: '',
                        adminTotp: '',
                        loading: false,
                        error: '',
                      })
                    }
                    className="btn-ghost text-xs px-4 py-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={extendGraceModal.loading}
                    className="btn btn-primary text-xs px-4 py-2 font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                  >
                    {extendGraceModal.loading && <RefreshCw size={13} className="animate-spin" />}
                    <span>Extend grace period</span>
                  </button>
                </div>
              </form>
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
                        placeholder="Full Name,Email Address,Phone Number,Role,Team Name"
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

      {/* ─── MODAL: Create / Edit Access Template ─────────────────────────── */}
      <AnimatePresence>
        {editingTemplate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230]">
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FolderKey size={18} className="text-crm-teal" />
                  {editingTemplate.id ? 'Edit Access Template' : 'Create Access Template'}
                </h2>
                <button
                  onClick={() => setEditingTemplate(null)}
                  className="w-7 h-7 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSaveTemplate} className="p-6 space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="label">Template Name *</label>
                  <input
                    className="input text-xs"
                    placeholder="e.g. Sales Executive Preset"
                    value={editingTemplate.name}
                    onChange={(e) =>
                      setEditingTemplate({ ...editingTemplate, name: e.target.value })
                    }
                    required
                  />
                </div>

                <div>
                  <label className="label">Description (Optional)</label>
                  <input
                    className="input text-xs"
                    placeholder="Brief description of who should receive this permission set"
                    value={editingTemplate.description}
                    onChange={(e) =>
                      setEditingTemplate({ ...editingTemplate, description: e.target.value })
                    }
                  />
                </div>

                {/* Toolbar */}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Granted Module Pages ({editingTemplate.pages.length} / {ALL_COMPANY_PAGE_KEYS.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setEditingTemplate({ ...editingTemplate, pages: [...ALL_COMPANY_PAGE_KEYS] })
                      }
                      className="btn-ghost text-xs py-1 px-2.5"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingTemplate({ ...editingTemplate, pages: [] })}
                      className="btn-ghost text-xs py-1 px-2.5"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Grouped Checkboxes */}
                <div className="space-y-3">
                  {PAGE_GROUPS.map((group) => {
                    const pagesInGroup = groupedPages[group] || [];
                    const selectedInGroup = pagesInGroup.filter((p) =>
                      editingTemplate.pages.includes(p.key)
                    );
                    const allInGroup = selectedInGroup.length === pagesInGroup.length;
                    return (
                      <div
                        key={group}
                        className="border border-slate-200 dark:border-[#2A3042] rounded-xl overflow-hidden"
                      >
                        <div className="p-2.5 bg-slate-50 dark:bg-[#1A1D29] border-b border-slate-200 dark:border-[#2A3042] flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                            {group} ({selectedInGroup.length}/{pagesInGroup.length})
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const keys = pagesInGroup.map((p) => p.key);
                              if (allInGroup) {
                                setEditingTemplate({
                                  ...editingTemplate,
                                  pages: editingTemplate.pages.filter((k) => !keys.includes(k)),
                                });
                              } else {
                                setEditingTemplate({
                                  ...editingTemplate,
                                  pages: Array.from(new Set([...editingTemplate.pages, ...keys])),
                                });
                              }
                            }}
                            className="text-xs text-crm-blue hover:underline font-semibold"
                          >
                            {allInGroup ? 'Clear Group' : 'Select All in Group'}
                          </button>
                        </div>
                        <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2 bg-white dark:bg-[#141722]">
                          {pagesInGroup.map((page) => {
                            const isChecked = editingTemplate.pages.includes(page.key);
                            return (
                              <label
                                key={page.key}
                                className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                                  isChecked
                                    ? 'border-crm-blue/40 bg-crm-blue/5 dark:bg-crm-blue/10 text-slate-900 dark:text-white'
                                    : 'border-slate-200 dark:border-[#2A3042] text-slate-600 dark:text-slate-400'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    setEditingTemplate({
                                      ...editingTemplate,
                                      pages: isChecked
                                        ? editingTemplate.pages.filter((k) => k !== page.key)
                                        : [...editingTemplate.pages, page.key],
                                    });
                                  }}
                                  className="mt-0.5 rounded border-slate-300 text-crm-blue focus:ring-crm-blue"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold">{page.label}</span>
                                    <span className="font-mono text-[10px] text-slate-400">{page.key}</span>
                                  </div>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                                    {page.description}
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-[#2A3042]">
                  <button
                    type="button"
                    onClick={() => setEditingTemplate(null)}
                    className="btn-ghost text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingTemplate}
                    className="btn-primary text-xs px-5 shadow-glow-blue"
                  >
                    {savingTemplate ? 'Saving...' : 'Save Template'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL: User Page Access Control Panel ─────────────────────────── */}
      <AnimatePresence>
        {accessUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230]">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Sliders size={18} className="text-crm-blue" />
                    Configure Page Access: {accessUser.name}
                  </h2>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="font-mono text-xs font-bold text-purple-600 dark:text-crm-violet-light">
                      {accessUser.employeeCode}
                    </span>
                    <span className="text-slate-400">•</span>
                    <span className="text-xs text-slate-600 dark:text-slate-300 font-semibold">
                      {ROLE_LABELS[accessUser.role] || accessUser.role}
                    </span>
                    <span className="text-slate-400">•</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-slate-200/60 dark:bg-[#2A3042] text-slate-700 dark:text-slate-300">
                      {accessData?.inheritedFrom === 'tenant_admin'
                        ? 'Full Company Access (Tenant Admin)'
                        : accessData?.inheritedFrom === 'custom'
                        ? 'Custom User Overrides'
                        : accessData?.inheritedFrom === 'team'
                        ? `Inherited from Team: ${accessUser.teamRef?.name || 'Assigned Team'}`
                        : 'No Pages Granted'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setAccessUser(null)}
                  className="w-7 h-7 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center"
                >
                  <X size={16} />
                </button>
              </div>

              {accessLoading ? (
                <div className="p-12 text-center text-slate-400">
                  <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-crm-blue" />
                  Loading user access configuration...
                </div>
              ) : (
                <div className="p-6 space-y-4 overflow-y-auto flex-1">
                  {/* Warning if editing own profile */}
                  {accessUser.id === currentUser?.id && (
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-crm-amber flex items-start gap-2.5">
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-bold">Editing Your Own Account:</strong> Be careful not to uncheck
                        "User Accounts & Roles" or other critical modules, as saving will immediately update your active navigation and permissions.
                      </div>
                    </div>
                  )}

                  {/* Toolbar Shortcuts: Select All, Clear, Copy from user, Apply template, Team shortcut */}
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042] flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {['platform_admin', 'platform_super_admin', 'tenant_admin'].includes(accessUser?.role) && (
                        <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                          <Shield size={12} /> Administrators retain all {ALL_COMPANY_PAGE_KEYS.length} modules
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedPages([...ALL_COMPANY_PAGE_KEYS])}
                        className="btn-ghost text-xs py-1.5 px-3 border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#1A1D29]"
                      >
                        <CheckSquare size={13} className="text-crm-blue" /> Select All ({ALL_COMPANY_PAGE_KEYS.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (['platform_admin', 'platform_super_admin', 'tenant_admin'].includes(accessUser?.role)) {
                            setAlertDialog({
                              isOpen: true,
                              title: 'Action Blocked',
                              message: 'Administrators (platform_admin and tenant_admin) must retain access to all company pages and can never be left with 0 pages.',
                              variant: 'error',
                            });
                            return;
                          }
                          setSelectedPages([]);
                        }}
                        disabled={['platform_admin', 'platform_super_admin', 'tenant_admin'].includes(accessUser?.role)}
                        className="btn-ghost text-xs py-1.5 px-3 border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#1A1D29] disabled:opacity-40 disabled:cursor-not-allowed"
                        title={['platform_admin', 'platform_super_admin', 'tenant_admin'].includes(accessUser?.role) ? 'Administrators cannot be left with 0 pages' : 'Clear all pages'}
                      >
                        <Square size={13} className="text-slate-400" /> Clear
                      </button>

                      {/* Reset to Team Inherit */}
                      {accessData?.inheritedFrom === 'custom' && (
                        <button
                          type="button"
                          onClick={handleResetToTeam}
                          disabled={savingAccess}
                          className="btn-ghost text-xs py-1.5 px-3 border border-purple-500/30 text-purple-600 dark:text-crm-violet-light bg-purple-500/5 hover:bg-purple-500/10"
                          title="Clear custom overrides and revert to team allowedPages"
                        >
                          <Shield size={13} /> Reset to Team Inherit
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Copy from user */}
                      <select
                        className="input text-xs w-48 py-1.5"
                        value={accessCopyUserId}
                        onChange={async (e) => {
                          const targetId = e.target.value;
                          setAccessCopyUserId(targetId);
                          if (!targetId) return;
                          try {
                            const { data } = await usersApi.getUserAccess(targetId);
                            if (Array.isArray(data?.effectivePages)) {
                              setSelectedPages(data.effectivePages);
                              if (!data.effectivePages.includes(accessHomePage)) {
                                setAccessHomePage(data.effectivePages[0] || '');
                              }
                            }
                          } catch (err: any) {
                            setAlertDialog({
                              isOpen: true,
                              title: 'Copy Failed',
                              message: 'Could not load access for the chosen user.',
                              variant: 'error',
                            });
                          }
                        }}
                      >
                        <option value="">Copy pages from another user...</option>
                        {users
                          .filter((u) => u.id !== accessUser.id)
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name} ({u.employeeCode})
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <UserPagePermissionsSelector
                    selectedPages={selectedPages}
                    onChangePages={setSelectedPages}
                    homePage={accessHomePage}
                    onChangeHomePage={setAccessHomePage}
                    selectedTemplate={accessTemplateId}
                    onChangeTemplate={setAccessTemplateId}
                    templates={templates}
                  />

                  {/* Modal Footer */}
                  <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-[#2A3042]">
                    <span className="text-xs text-slate-500">
                      Changes apply immediately across navigation menus, search, dashboard, and API endpoints.
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setAccessUser(null)}
                        className="btn-ghost text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveAccess}
                        disabled={savingAccess}
                        className="btn-primary text-xs px-6 shadow-glow-blue"
                      >
                        {savingAccess ? 'Saving Access...' : 'Save Page Access'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL: Migration Helper Dry Run Results ──────────────────────── */}
      <AnimatePresence>
        {dryRunData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="bg-white dark:bg-[#181B26] border border-purple-500/30 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-auto"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-[#2A3042] bg-purple-500/10">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-purple-600 dark:text-purple-400" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Page Access Migration — Dry Run
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDryRunData(null)}
                  className="w-7 h-7 rounded-lg hover:bg-white/20 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-900 dark:text-purple-200 flex items-center justify-between">
                  <div>
                    <p className="font-bold">Dry-Run Preview (0 Database Writes Executed)</p>
                    <p className="text-[11px] opacity-80 mt-0.5">
                      Idempotent simulation: existing user page access records are strictly preserved.
                    </p>
                  </div>
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-purple-500/20">
                    IDEMPOTENT
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-white/5">
                    <p className="text-[11px] text-slate-500 uppercase font-semibold">Preserved Configs</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                      {dryRunData.preservedCount || 0}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-white/5">
                    <p className="text-[11px] text-slate-500 uppercase font-semibold">New Queued</p>
                    <p className="text-xl font-black text-purple-600 dark:text-purple-400 mt-1">
                      {dryRunData.newCreationsCount || 0}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-white/5">
                    <p className="text-[11px] text-slate-500 uppercase font-semibold">Team Updates</p>
                    <p className="text-xl font-black text-crm-blue mt-1">
                      {dryRunData.teamUpdatesCount || 0}
                    </p>
                  </div>
                </div>

                {dryRunData.statsByRole && Object.keys(dryRunData.statsByRole).length > 0 && (
                  <div className="border border-slate-200 dark:border-[#2A3042] rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-[#141722] text-slate-500 font-semibold border-b border-slate-200 dark:border-[#2A3042]">
                        <tr>
                          <th className="p-2.5 text-left">Role</th>
                          <th className="p-2.5 text-center">Total Users</th>
                          <th className="p-2.5 text-center">Preserved</th>
                          <th className="p-2.5 text-center">Would Migrate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-[#2A3042]">
                        {Object.values(dryRunData.statsByRole).map((st: any) => (
                          <tr key={st.role}>
                            <td className="p-2.5 font-bold">{ROLE_LABELS[st.role] || st.role}</td>
                            <td className="p-2.5 text-center font-mono">{st.totalUsers}</td>
                            <td className="p-2.5 text-center font-mono text-emerald-600 dark:text-emerald-400">
                              {st.alreadyConfigured}
                            </td>
                            <td className="p-2.5 text-center font-mono text-purple-600 dark:text-purple-400 font-bold">
                              {st.newlyMigrated}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setDryRunData(null)}
                    className="btn-primary text-xs px-5 shadow-glow-blue"
                  >
                    Close Preview
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
