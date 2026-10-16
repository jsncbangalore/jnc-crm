import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderOpen, Plus, Upload, Trash2, X, ChevronRight,
  FileSpreadsheet, Calendar, User, AlertTriangle, CheckCircle2,
  Clock, Activity, ArrowLeft, Download, Eye, UserPlus, Users
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePopup } from '../contexts/PopupContext';
import { activitiesApi } from '../services/api';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

type ProjectAssignment = {
  id: string;
  userId: string;
  roleInProject?: string;
  user?: { id: string; name: string; employeeCode: string; role: string; email?: string };
};

type Project = {
  id: string;
  name: string;
  description?: string;
  status: string;
  createdAt: string;
  createdBy?: { id: string; name: string; employeeCode: string; email?: string };
  assignments?: ProjectAssignment[];
  _count?: { dailyLogs: number };
};

type DailyLog = {
  id: string;
  projectId: string;
  logDate: string;
  fileName?: string;
  taskSummary?: string;
  recordsJson: string;
  createdAt: string;
  uploadedBy?: { id: string; name: string; employeeCode: string; role: string; email?: string };
};

const STATUS_COLORS: Record<string, string> = {
  active:    'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  completed: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  on_hold:   'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
};

const ROLE_LABEL: Record<string, string> = {
  platform_super_admin: 'Super Admin',
  tenant_admin: 'Company Admin',
  admin: 'Admin',
  sub_admin: 'Sub Admin',
  project_manager: 'PM / Manager',
  developer_lead: 'Dev Lead',
  developer: 'Developer',
  employee: 'Employee',
  store_manager: 'Store Manager',
};

export default function DailyActivitiesPage() {
  const { user } = useAuth();
  const { showAlert } = usePopup();

  // Role permissions
  const canCreateProject = ['platform_super_admin', 'tenant_admin', 'admin', 'sub_admin', 'project_manager'].includes(user?.role || '');
  const canAssignMembers = ['platform_super_admin', 'tenant_admin', 'admin', 'sub_admin', 'project_manager', 'developer_lead'].includes(user?.role || '');
  const isIndividualDev = user?.role === 'developer';

  // ─── State ────────────────────────────────────────────────────────────────────
  const [projects, setProjects] = useState<Project[]>([]);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [view, setView] = useState<'projects' | 'logs'>('projects');

  // Create/Edit Project Modal
  const [projectModal, setProjectModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectForm, setProjectForm] = useState({ name: '', description: '', status: 'active' });
  const [savingProject, setSavingProject] = useState(false);

  // Assign Developers & Admins Modal State
  const [assignModal, setAssignModal] = useState(false);
  const [assigningProject, setAssigningProject] = useState<Project | null>(null);
  const [assignableUsers, setAssignableUsers] = useState<any[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [savingAssignments, setSavingAssignments] = useState(false);

  // Upload Log Modal
  const [uploadModal, setUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadSummary, setUploadSummary] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [previewCols, setPreviewCols] = useState<string[]>([]);

  // Log preview modal
  const [viewLogModal, setViewLogModal] = useState(false);
  const [viewingLog, setViewingLog] = useState<DailyLog | null>(null);

  // Member Work Review Modal
  const [memberWorkModal, setMemberWorkModal] = useState<{
    show: boolean;
    member: { id: string; name: string; employeeCode: string; role: string; email?: string } | null;
    projects: { id: string; name: string; status: string }[];
    logs: DailyLog[];
    loading: boolean;
  }>({
    show: false,
    member: null,
    projects: [],
    logs: [],
    loading: false,
  });

  // ─── Fetch Projects ───────────────────────────────────────────────────────────
  const fetchProjects = async () => {
    setLoading(true);
    try {
      const res = await activitiesApi.listProjects();
      setProjects(res.data || []);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async (projectId: string) => {
    setLogsLoading(true);
    try {
      const res = await activitiesApi.listLogs(projectId);
      setLogs(res.data || []);
    } catch {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => { fetchProjects(); }, []);

  // ─── Project Actions ──────────────────────────────────────────────────────────
  const openCreateProject = () => {
    setEditingProject(null);
    setProjectForm({ name: '', description: '', status: 'active' });
    setProjectModal(true);
  };

  const openEditProject = (p: Project) => {
    setEditingProject(p);
    setProjectForm({ name: p.name, description: p.description || '', status: p.status });
    setProjectModal(true);
  };

  const saveProject = async () => {
    if (!projectForm.name.trim()) return showAlert('Error', 'Project name is required.');
    setSavingProject(true);
    try {
      if (editingProject) {
        await activitiesApi.updateProject(editingProject.id, projectForm);
      } else {
        await activitiesApi.createProject(projectForm);
      }
      setProjectModal(false);
      await fetchProjects();
    } catch (err: any) {
      showAlert('Error', err.response?.data?.message || err.message);
    } finally {
      setSavingProject(false);
    }
  };

  const deleteProject = async (p: Project) => {
    if (!window.confirm(`Delete project "${p.name}"? All daily logs will be removed.`)) return;
    try {
      await activitiesApi.deleteProject(p.id);
      await fetchProjects();
    } catch (err: any) {
      showAlert('Error', err.response?.data?.message || err.message);
    }
  };

  // ─── Developer Assignment Actions ─────────────────────────────────────────────
  const openAssignModal = async (p: Project) => {
    setAssigningProject(p);
    const existingIds = (p.assignments || []).map(a => a.userId);
    setSelectedMemberIds(existingIds);
    setAssignModal(true);
    try {
      const res = await activitiesApi.getAssignableUsers();
      setAssignableUsers(res.data || []);
    } catch (err: any) {
      showAlert('Error', 'Failed to fetch assignable developers.');
    }
  };

  const toggleMemberSelection = (userId: string) => {
    if (selectedMemberIds.includes(userId)) {
      setSelectedMemberIds(selectedMemberIds.filter(id => id !== userId));
    } else {
      setSelectedMemberIds([...selectedMemberIds, userId]);
    }
  };

  const saveAssignments = async () => {
    if (!assigningProject) return;
    setSavingAssignments(true);
    try {
      await activitiesApi.assignMembers(assigningProject.id, selectedMemberIds);
      setAssignModal(false);
      await fetchProjects();
      if (selectedProject?.id === assigningProject.id) {
        const updated = projects.find(p => p.id === assigningProject.id);
        if (updated) setSelectedProject(updated);
      }
    } catch (err: any) {
      showAlert('Error', err.response?.data?.message || err.message);
    } finally {
      setSavingAssignments(false);
    }
  };

  // ─── Navigate into Project Logs ───────────────────────────────────────────────
  const openProjectLogs = (p: Project) => {
    setSelectedProject(p);
    setView('logs');
    fetchLogs(p.id);
  };

  const backToProjects = () => {
    setView('projects');
    setSelectedProject(null);
    setLogs([]);
  };

  // ─── Open Member Work Action ──────────────────────────────────────────────────
  const openMemberWork = async (m: { user: any; projects: any[] }) => {
    setMemberWorkModal({
      show: true,
      member: m.user,
      projects: m.projects,
      logs: [],
      loading: true,
    });

    try {
      const logPromises = m.projects.map((p) =>
        activitiesApi.listLogs(p.id).then((res) => ({ projectId: p.id, projectName: p.name, logs: res.data || [] })).catch(() => ({ projectId: p.id, projectName: p.name, logs: [] }))
      );
      const results = await Promise.all(logPromises);
      const allLogs: any[] = [];
      results.forEach((r) => {
        (r.logs || []).forEach((l: any) => {
          if (l.uploadedBy?.id === m.user.id || (l as any).uploadedById === m.user.id) {
            allLogs.push({ ...l, projectName: r.projectName });
          }
        });
      });
      allLogs.sort((a, b) => new Date(b.logDate).getTime() - new Date(a.logDate).getTime());
      setMemberWorkModal((prev) => ({ ...prev, logs: allLogs, loading: false }));
    } catch {
      setMemberWorkModal((prev) => ({ ...prev, logs: [], loading: false }));
    }
  };

  // Extract all distinct working members across projects
  const workingMembersMap = new Map<string, {
    user: { id: string; name: string; employeeCode: string; role: string; email?: string };
    projects: { id: string; name: string; status: string }[];
  }>();

  projects.forEach((p) => {
    (p.assignments || []).forEach((a) => {
      if (!a.user) return;
      const existing = workingMembersMap.get(a.user.id);
      if (existing) {
        if (!existing.projects.some((proj) => proj.id === p.id)) {
          existing.projects.push({ id: p.id, name: p.name, status: p.status });
        }
      } else {
        workingMembersMap.set(a.user.id, {
          user: a.user,
          projects: [{ id: p.id, name: p.name, status: p.status }],
        });
      }
    });
  });

  const workingMembers = Array.from(workingMembersMap.values());

  // ─── Upload Log ───────────────────────────────────────────────────────────────
  const handleFileChange = (file: File | null) => {
    setUploadFile(file);
    setPreviewRows([]);
    setPreviewCols([]);
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      setPreviewRows(rows.slice(0, 5));
      setPreviewCols(rows.length > 0 ? Object.keys(rows[0]) : []);
    };
    reader.readAsArrayBuffer(file);
  };

  const submitUpload = async () => {
    if ((!uploadFile && !uploadSummary.trim()) || !selectedProject) return;
    setUploading(true);
    try {
      const fd = new FormData();
      if (uploadFile) fd.append('file', uploadFile);
      if (uploadSummary) fd.append('taskSummary', uploadSummary);
      await activitiesApi.uploadLog(selectedProject.id, fd);
      setUploadModal(false);
      setUploadFile(null);
      setUploadSummary('');
      setPreviewRows([]);
      setPreviewCols([]);
      await fetchLogs(selectedProject.id);
      await fetchProjects();
    } catch (err: any) {
      showAlert('Error', err.response?.data?.message || err.message);
    } finally {
      setUploading(false);
    }
  };

  const deleteLog = async (log: DailyLog) => {
    if (!window.confirm('Delete this daily log?')) return;
    try {
      await activitiesApi.deleteLog(selectedProject!.id, log.id);
      await fetchLogs(selectedProject!.id);
      await fetchProjects();
    } catch (err: any) {
      showAlert('Error', err.response?.data?.message || err.message);
    }
  };

  // ─── Download Log as Excel ─────────────────────────────────────────────────────
  const downloadLog = (log: DailyLog) => {
    try {
      const rows = JSON.parse(log.recordsJson || '[]');
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Daily Log');
      XLSX.writeFile(wb, log.fileName || `daily-log-${log.id}.xlsx`);
    } catch {
      showAlert('Error', 'Could not parse log data for download.');
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 bg-slate-50 dark:bg-[#0F1117] min-h-full">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {view === 'logs' && (
            <button
              onClick={backToProjects}
              className="w-8 h-8 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-400 flex items-center justify-center transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <Activity size={20} className="text-crm-blue" />
              <h1 className="text-xl font-black text-slate-950 dark:text-white">Daily Activities</h1>
              {view === 'logs' && selectedProject && (
                <>
                  <ChevronRight size={16} className="text-slate-400" />
                  <span className="text-lg font-bold text-crm-blue">{selectedProject.name}</span>
                </>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {isIndividualDev
                ? 'Your assigned projects & daily work log submissions'
                : view === 'projects'
                ? 'Manage projects & assign developers to track daily work logs'
                : `Daily activity reports for ${selectedProject?.name}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canCreateProject && (
            <button
              onClick={openCreateProject}
              className="btn-primary text-xs gap-1.5 px-4 font-bold flex items-center shadow-glow-blue"
            >
              <Plus size={14} /> New Project
            </button>
          )}
          {view === 'logs' && (
            <button
              onClick={() => setUploadModal(true)}
              className="btn bg-crm-teal hover:bg-crm-teal-hover text-black font-bold text-xs gap-1.5 px-4 shadow-glow-teal flex items-center"
            >
              <Upload size={14} /> Add Daily Activity Log
            </button>
          )}
        </div>
      </div>

      {/* ─── Projects Grid ──────────────────────────────────────────────────────── */}
      {view === 'projects' && (
        <>
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-crm-blue animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}</div>
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <FolderOpen size={40} className="mx-auto mb-3 opacity-40" />
              <p className="font-bold">No projects assigned yet</p>
              <p className="text-xs mt-1">
                {canCreateProject ? 'Click New Project to add a project' : 'Contact your Project Manager or Developer Lead to get assigned to a project'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {projects.map((p) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-xl shadow-sm hover:shadow-md transition-shadow group"
                >
                  <div
                    className="p-5 cursor-pointer"
                    onClick={() => openProjectLogs(p)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="p-2.5 rounded-xl bg-crm-blue/10">
                        <FolderOpen size={20} className="text-crm-blue" />
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[p.status] || ''}`}>
                        {p.status.replace('_', ' ')}
                      </span>
                    </div>

                    <h3 className="font-bold text-slate-950 dark:text-white text-sm leading-snug mb-1 group-hover:text-crm-blue transition-colors">
                      {p.name}
                    </h3>
                    {p.description && (
                      <p className="text-xs text-slate-500 line-clamp-2 mb-3">{p.description}</p>
                    )}

                    {/* Assigned Team Members Avatars */}
                    <div className="my-3 pt-2 border-t border-slate-100 dark:border-[#2A3042]/60">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                        <Users size={11} /> Team Members ({p.assignments?.length || 0})
                      </p>
                      {p.assignments && p.assignments.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {p.assignments.map(a => (
                            <span
                              key={a.id}
                              className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#202534] text-slate-700 dark:text-slate-300 font-medium"
                            >
                              <User size={10} className="text-crm-blue" />
                              {a.user?.name}
                              <span className="text-[9px] text-slate-400 font-mono">({ROLE_LABEL[a.user?.role || ''] || a.user?.role})</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-400 italic">No developers assigned</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-[#2A3042] text-[10px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <FileSpreadsheet size={11} />
                        {p._count?.dailyLogs ?? 0} log{(p._count?.dailyLogs ?? 0) !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar size={11} />
                        {format(new Date(p.createdAt), 'dd MMM yyyy')}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="px-5 pb-4 flex gap-2">
                    {canAssignMembers && (
                      <button
                        onClick={() => openAssignModal(p)}
                        className="flex-1 text-[11px] font-bold py-1.5 rounded-lg border border-crm-blue/30 text-crm-blue hover:bg-crm-blue/10 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <UserPlus size={12} /> Assign Members
                      </button>
                    )}
                    {canCreateProject && (
                      <button
                        onClick={() => openEditProject(p)}
                        className="px-3 text-[11px] font-bold py-1.5 rounded-lg border border-slate-200 dark:border-[#2A3042] text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                      >
                        Edit
                      </button>
                    )}
                    {['platform_super_admin', 'tenant_admin', 'admin', 'sub_admin'].includes(user?.role || '') && (
                      <button
                        onClick={() => deleteProject(p)}
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-slate-200 dark:border-[#2A3042] transition-colors cursor-pointer"
                        title="Delete project"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* ─── Working Team Members & Project Directory Table ─────────────────────── */}
          <div className="mt-8 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-base font-black text-slate-950 dark:text-white flex items-center gap-2">
                  <Users size={18} className="text-crm-blue" />
                  Working Team Members & Project Directory
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  All assigned admins, project managers, and team members with their IDs, emails, and work records
                </p>
              </div>
              <div className="text-xs font-bold text-slate-400">
                Total Active Members: <span className="text-crm-blue font-mono font-bold">{workingMembers.length}</span>
              </div>
            </div>

            {workingMembers.length === 0 ? (
              <div className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-xl p-8 text-center text-slate-400">
                <Users size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm font-bold">No members assigned to projects yet</p>
                <p className="text-xs mt-1">Assign team members or co-admins to projects to view their work directory here</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#141722]">
                    <tr>
                      {['Member Name', 'Employee ID', 'Email Address', 'Role / Access', 'Assigned Projects', 'Work Records', 'Actions'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#2A3042]">
                    {workingMembers.map(m => (
                      <tr key={m.user.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-crm-blue/10 text-crm-blue flex items-center justify-center font-bold text-xs">
                              {m.user.name?.charAt(0)?.toUpperCase() || 'U'}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 dark:text-white">{m.user.name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-slate-700 dark:text-slate-300 font-bold">
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-[#202534] border border-slate-200 dark:border-white/5">
                            {m.user.employeeCode || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-400 font-medium">
                          {m.user.email ? (
                            <a href={`mailto:${m.user.email}`} className="hover:text-crm-blue hover:underline">
                              {m.user.email}
                            </a>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                            ['admin', 'tenant_admin', 'platform_super_admin'].includes(m.user.role)
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                              : m.user.role === 'project_manager'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                          }`}>
                            {ROLE_LABEL[m.user.role] || m.user.role}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {m.projects.map(p => (
                              <span
                                key={p.id}
                                className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 flex items-center gap-1"
                              >
                                <FolderOpen size={9} className="text-crm-blue" />
                                {p.name}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-mono font-bold text-slate-600 dark:text-slate-300">
                          {m.projects.length} project{m.projects.length !== 1 ? 's' : ''}
                        </td>
                        <td className="px-4 py-3.5">
                          <button
                            type="button"
                            onClick={() => openMemberWork(m)}
                            className="btn text-[11px] font-bold px-3 py-1.5 rounded-lg bg-crm-blue hover:bg-crm-blue-hover text-white shadow-glow-blue flex items-center gap-1.5 cursor-pointer"
                          >
                            <FolderOpen size={12} /> Open Work
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── Daily Logs Table ─────────────────────────────────────────────────── */}
      {view === 'logs' && (
        <>
          {logsLoading ? (
            <div className="flex justify-center py-20">
              <div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-crm-blue animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}</div>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-20 text-slate-400 bg-white dark:bg-[#181B26] rounded-xl border border-slate-200 dark:border-[#2A3042]">
              <FileSpreadsheet size={40} className="mx-auto mb-3 opacity-40" />
              <p className="font-bold">No activity logs recorded yet</p>
              <p className="text-xs mt-1">Click <strong>Add Daily Activity Log</strong> to record work summary or upload sheet</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#141722]">
                  <tr>
                    {['Date', 'Attachment / File', 'Work Summary', 'Rows', 'Submitted By', 'Role', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#2A3042]">
                  {logs.map(log => {
                    let rowCount = 0;
                    try { rowCount = JSON.parse(log.recordsJson || '[]').length; } catch {}
                    return (
                      <motion.tr
                        key={log.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">
                          {format(new Date(log.logDate), 'dd MMM yyyy')}
                        </td>
                        <td className="px-4 py-3">
                          {log.fileName ? (
                            <span className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                              <FileSpreadsheet size={13} className="text-emerald-500 shrink-0" />
                              {log.fileName}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">No File</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200 max-w-xs font-medium">
                          {log.taskSummary || <span className="italic text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3 font-mono text-crm-blue font-bold">{rowCount}</td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 font-medium">
                            <User size={11} />
                            {log.uploadedBy?.name || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                            {ROLE_LABEL[log.uploadedBy?.role || ''] || log.uploadedBy?.role || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {rowCount > 0 && (
                              <button
                                onClick={() => { setViewingLog(log); setViewLogModal(true); }}
                                className="p-1.5 rounded-lg text-crm-blue hover:bg-crm-blue/10 transition-colors"
                                title="Preview File Data"
                              >
                                <Eye size={13} />
                              </button>
                            )}
                            {log.fileName && (
                              <button
                                onClick={() => downloadLog(log)}
                                className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                                title="Download Excel"
                              >
                                <Download size={13} />
                              </button>
                            )}
                            {(user?.role === 'tenant_admin' || user?.role === 'admin') && (
                              <button
                                onClick={() => deleteLog(log)}
                                className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                title="Delete Log"
                              >
                                <Trash2 size={13} />
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
          )}
        </>
      )}

      {/* ─── Create / Edit Project Modal ─────────────────────────────────────── */}
      <AnimatePresence>
        {projectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl shadow-2xl p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-950 dark:text-white">
                  {editingProject ? 'Edit Project' : 'New Project'}
                </h3>
                <button onClick={() => setProjectModal(false)} className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 flex items-center justify-center">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Project Name *</label>
                  <input
                    className="input text-sm w-full"
                    placeholder="Enter project name"
                    value={projectForm.name}
                    onChange={e => setProjectForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Description</label>
                  <textarea
                    className="input text-sm w-full resize-none"
                    rows={3}
                    placeholder="Brief project overview..."
                    value={projectForm.description}
                    onChange={e => setProjectForm(f => ({ ...f, description: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Status</label>
                  <select
                    className="input text-sm w-full"
                    value={projectForm.status}
                    onChange={e => setProjectForm(f => ({ ...f, status: e.target.value }))}
                  >
                    <option value="active">Active</option>
                    <option value="on_hold">On Hold</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#2A3042]">
                <button onClick={() => setProjectModal(false)} className="btn-ghost text-xs px-4">Cancel</button>
                <button
                  onClick={saveProject}
                  disabled={savingProject || !projectForm.name.trim()}
                  className="btn-primary text-xs px-5 font-bold"
                >
                  {savingProject ? 'Saving...' : (editingProject ? 'Save Changes' : 'Create Project')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Assign Developers Modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {assignModal && assigningProject && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl shadow-2xl p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-950 dark:text-white flex items-center gap-2">
                    <UserPlus size={18} className="text-crm-blue" /> Assign Team & Admins to Project
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">{assigningProject.name}</p>
                </div>
                <button onClick={() => setAssignModal(false)} className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 flex items-center justify-center">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Select Team Members, Co-Admins & Leads</label>
                {assignableUsers.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">No active team members found in team setup.</p>
                ) : (
                  assignableUsers.map(u => {
                    const isChecked = selectedMemberIds.includes(u.id);
                    return (
                      <div
                        key={u.id}
                        onClick={() => toggleMemberSelection(u.id)}
                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-crm-blue/10 border-crm-blue/40 text-slate-900 dark:text-white'
                            : 'bg-slate-50 dark:bg-[#141722] border-slate-200 dark:border-[#2A3042] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="rounded border-slate-300 text-crm-blue focus:ring-crm-blue"
                          />
                          <div>
                            <p className="text-xs font-bold">{u.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{u.employeeCode} • {u.email}</p>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                          {ROLE_LABEL[u.role] || u.role}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#2A3042]">
                <button onClick={() => setAssignModal(false)} className="btn-ghost text-xs px-4">Cancel</button>
                <button
                  onClick={saveAssignments}
                  disabled={savingAssignments}
                  className="btn-primary text-xs px-5 font-bold"
                >
                  {savingAssignments ? 'Saving...' : 'Save Assignments'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Upload Daily Log Modal ───────────────────────────────────────────── */}
      <AnimatePresence>
        {uploadModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl shadow-2xl p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-950 dark:text-white">Add Daily Activity Log</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">{selectedProject?.name}</p>
                </div>
                <button onClick={() => { setUploadModal(false); setUploadFile(null); setPreviewRows([]); }} className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 flex items-center justify-center">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3">
                {/* Summary First */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Summary / Notes for Today</label>
                  <textarea
                    className="input text-sm w-full resize-none"
                    rows={3}
                    placeholder="Write what you worked on today (e.g. Completed milestone tasks, updated client records...)"
                    value={uploadSummary}
                    onChange={e => setUploadSummary(e.target.value)}
                  />
                </div>

                {/* File Drop Zone (Optional) */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Excel / CSV File (Optional)</label>
                  <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-300 dark:border-[#2A3042] rounded-xl cursor-pointer hover:border-crm-blue hover:bg-crm-blue/5 transition-colors">
                    <Upload size={20} className="text-slate-400 mb-1" />
                    <span className="text-xs text-slate-500 font-medium">
                      {uploadFile ? uploadFile.name : 'Click to attach .xlsx / .xls / .csv (optional)'}
                    </span>
                    <span className="text-[10px] text-slate-400">Max 20 MB</span>
                    <input
                      type="file"
                      className="hidden"
                      accept=".xlsx,.xls,.csv"
                      onChange={e => handleFileChange(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>

                {/* Preview */}
                {previewRows.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <CheckCircle2 size={11} className="text-emerald-500" /> Preview (first 5 rows)
                    </p>
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#2A3042]">
                      <table className="w-full text-[10px]">
                        <thead className="bg-slate-50 dark:bg-[#141722]">
                          <tr>
                            {previewCols.map(c => (
                              <th key={c} className="px-3 py-2 text-left font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-[#2A3042]">
                          {previewRows.map((row, i) => (
                            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                              {previewCols.map(c => (
                                <td key={c} className="px-3 py-1.5 text-slate-700 dark:text-slate-300 whitespace-nowrap max-w-[150px] truncate">{String(row[c])}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#2A3042]">
                <button onClick={() => { setUploadModal(false); setUploadFile(null); setPreviewRows([]); }} className="btn-ghost text-xs px-4">Cancel</button>
                <button
                  onClick={submitUpload}
                  disabled={(!uploadFile && !uploadSummary.trim()) || uploading}
                  className="btn-primary text-xs px-5 gap-1.5 font-bold"
                >
                  {uploading ? 'Saving...' : 'Save Activity Log'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── View Log Modal ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {viewLogModal && viewingLog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-4xl max-h-[85vh] flex flex-col bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl shadow-2xl"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-[#2A3042]">
                <div>
                  <h3 className="font-bold text-slate-950 dark:text-white">{viewingLog.fileName || 'Daily Log'}</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {format(new Date(viewingLog.logDate), 'dd MMMM yyyy')} • Submitted by {viewingLog.uploadedBy?.name || '—'} ({ROLE_LABEL[viewingLog.uploadedBy?.role || ''] || viewingLog.uploadedBy?.role})
                  </p>
                  {viewingLog.taskSummary && (
                    <p className="text-xs text-slate-500 mt-1 italic">"{viewingLog.taskSummary}"</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {viewingLog.fileName && (
                    <button onClick={() => downloadLog(viewingLog)} className="btn-ghost text-xs gap-1.5 px-3">
                      <Download size={13} /> Download
                    </button>
                  )}
                  <button onClick={() => setViewLogModal(false)} className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 flex items-center justify-center">
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-5">
                {(() => {
                  let rows: any[] = [];
                  let cols: string[] = [];
                  try { rows = JSON.parse(viewingLog.recordsJson || '[]'); cols = rows.length > 0 ? Object.keys(rows[0]) : []; } catch {}
                  return rows.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 text-xs">No file data rows in this report.</div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-[#141722] sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-bold text-slate-500 uppercase tracking-wider text-[10px]">#</th>
                          {cols.map(c => (
                            <th key={c} className="px-3 py-2 text-left font-bold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-[#2A3042]">
                        {rows.map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                            <td className="px-3 py-2 text-slate-400 font-mono">{i + 1}</td>
                            {cols.map(c => (
                              <td key={c} className="px-3 py-2 text-slate-700 dark:text-slate-300 max-w-[200px] truncate whitespace-nowrap">{String(row[c])}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Member Work Review Modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {memberWorkModal.show && memberWorkModal.member && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-3xl max-h-[85vh] flex flex-col bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#141722] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-crm-blue/10 text-crm-blue flex items-center justify-center font-bold">
                    <User size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-950 dark:text-white flex items-center gap-2">
                      {memberWorkModal.member.name}
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-crm-blue/15 text-crm-blue border border-crm-blue/30 font-mono">
                        {memberWorkModal.member.employeeCode || 'ID —'}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                      <span>{memberWorkModal.member.email || 'No email registered'}</span>
                      <span>•</span>
                      <span className="font-medium text-slate-600 dark:text-slate-300">
                        {ROLE_LABEL[memberWorkModal.member.role] || memberWorkModal.member.role}
                      </span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setMemberWorkModal({ ...memberWorkModal, show: false })}
                  className="w-7 h-7 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 flex items-center justify-center"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Assigned Projects Badges */}
              <div className="px-5 py-2.5 bg-slate-100/50 dark:bg-[#181B26]/50 border-b border-slate-200 dark:border-[#2A3042] flex items-center gap-2 flex-wrap text-xs">
                <span className="font-bold text-slate-500 text-[11px] uppercase tracking-wider">Assigned Projects:</span>
                {memberWorkModal.projects.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-[#202534] border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 font-medium text-[11px]"
                  >
                    <FolderOpen size={10} className="text-crm-blue" />
                    {p.name}
                  </span>
                ))}
              </div>

              {/* Logs Content List */}
              <div className="flex-1 overflow-auto p-5">
                {memberWorkModal.loading ? (
                  <div className="flex justify-center py-16">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="w-2 h-2 rounded-full bg-crm-blue animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </div>
                  </div>
                ) : memberWorkModal.logs.length === 0 ? (
                  <div className="text-center py-16 text-slate-400">
                    <FileSpreadsheet size={36} className="mx-auto mb-2 opacity-40" />
                    <p className="font-bold text-sm">No work records submitted yet</p>
                    <p className="text-xs mt-1 text-slate-500">
                      When {memberWorkModal.member.name} submits daily activity logs or reports, they will be listed here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1">
                      <span>Submitted Work & Activity Records ({memberWorkModal.logs.length})</span>
                    </div>
                    <div className="border border-slate-200 dark:border-[#2A3042] rounded-xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 dark:bg-[#141722] border-b border-slate-200 dark:border-[#2A3042]">
                          <tr>
                            {['Date', 'Project', 'Work Summary', 'Attachment / File', 'Actions'].map((h) => (
                              <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-[#2A3042]">
                          {memberWorkModal.logs.map((log: any) => {
                            let rowCount = 0;
                            try { rowCount = JSON.parse(log.recordsJson || '[]').length; } catch {}
                            return (
                              <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                                <td className="px-3 py-2.5 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                  {format(new Date(log.logDate), 'dd MMM yyyy')}
                                </td>
                                <td className="px-3 py-2.5 font-bold text-crm-blue whitespace-nowrap">
                                  {log.projectName || 'Project'}
                                </td>
                                <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200 max-w-xs font-medium">
                                  {log.taskSummary || <span className="italic text-slate-400">No summary note</span>}
                                </td>
                                <td className="px-3 py-2.5">
                                  {log.fileName ? (
                                    <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                                      <FileSpreadsheet size={12} />
                                      {log.fileName} <span className="font-mono text-[10px] text-slate-400">({rowCount} rows)</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 italic">No File</span>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setViewingLog(log);
                                      setViewLogModal(true);
                                    }}
                                    className="px-2.5 py-1 text-[11px] font-bold rounded bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 text-slate-700 dark:text-slate-300 transition"
                                  >
                                    View Details
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 dark:bg-[#141722] border-t border-slate-200 dark:border-[#2A3042] flex justify-end">
                <button
                  type="button"
                  onClick={() => setMemberWorkModal({ ...memberWorkModal, show: false })}
                  className="btn-ghost text-xs px-5"
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
