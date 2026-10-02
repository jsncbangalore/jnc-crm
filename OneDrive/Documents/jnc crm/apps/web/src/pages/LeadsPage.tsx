import React, { useEffect, useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Upload, Link2, Copy, Check, ExternalLink, Share2, Globe,
  MessageSquare, X, Smartphone, FileSpreadsheet, Download, AlertTriangle,
  CheckCircle2, RefreshCw, Phone, Mail, Building2, MapPin, Tag, Clock,
  Calendar, User, DollarSign, Filter, Flame, ChevronRight, ChevronLeft,
  ChevronsLeft, ChevronsRight, Edit3, Trash2, Activity, FileText, Send, CheckCircle, HelpCircle, ArrowRight,
  Sliders, Settings, Zap
} from 'lucide-react';
import { leadsApi, usersApi } from '../services/api';
import { Lead, LeadStatus, LeadSource, User as UserType } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { usePopup } from '../contexts/PopupContext';
import LeadSetupModal from '../components/leads/LeadSetupModal';
import { format, formatDistanceToNow, isToday } from 'date-fns';
import Papa from 'papaparse';

// ─── Pipeline Column Definitions ──────────────────────────────────────────────
export interface ColumnDef {
  id: LeadStatus | 'won_lost';
  label: string;
  statuses: LeadStatus[];
  accentColor: string;
  headerBorder: string;
  pillBg: string;
}

export const PIPELINE_COLUMNS: ColumnDef[] = [
  {
    id: 'new',
    label: 'New Inquiries',
    statuses: ['new'],
    accentColor: '#2E5EFF',
    headerBorder: 'border-t-[#2E5EFF]',
    pillBg: 'bg-[#2E5EFF]/15 text-[#2E5EFF] border-[#2E5EFF]/30',
  },
  {
    id: 'contacted',
    label: 'Contacted',
    statuses: ['contacted'],
    accentColor: '#8B5CF6',
    headerBorder: 'border-t-[#8B5CF6]',
    pillBg: 'bg-[#8B5CF6]/15 text-[#8B5CF6] border-[#8B5CF6]/30',
  },
  {
    id: 'qualified',
    label: 'Qualified Requirement',
    statuses: ['qualified'],
    accentColor: '#00D2B4',
    headerBorder: 'border-t-[#00D2B4]',
    pillBg: 'bg-[#00D2B4]/15 text-[#00D2B4] border-[#00D2B4]/30',
  },
  {
    id: 'quoted',
    label: 'Quoted / Proposal Sent',
    statuses: ['quoted'],
    accentColor: '#FFB020',
    headerBorder: 'border-t-[#FFB020]',
    pillBg: 'bg-[#FFB020]/15 text-[#FFB020] border-[#FFB020]/30',
  },
  {
    id: 'won',
    label: 'Won / Closed',
    statuses: ['won'],
    accentColor: '#10B981',
    headerBorder: 'border-t-[#10B981]',
    pillBg: 'bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30',
  },
  {
    id: 'lost',
    label: 'Lost / Closed',
    statuses: ['lost'],
    accentColor: '#EF4444',
    headerBorder: 'border-t-[#EF4444]',
    pillBg: 'bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/30',
  },
];

// Sample leads template for import demo
const SAMPLE_LEADS = [
  { company_name: 'Acme Enterprise Ltd', contact_name: 'Sample Contact 1', phone: '9845012345', email: 'contact@acme.com', product_interest: 'Commercial Sound Equipment', city: 'Metropolis', estimated_value: 50000, urgency: 'urgent' },
  { company_name: 'Global Technologies', contact_name: 'Sample Contact 2', phone: '9820055443', email: 'info@globaltech.com', product_interest: 'Control Panels & Hardware', city: 'City Center', estimated_value: 45000, urgency: 'standard' },
  { company_name: 'Pioneer Automation', contact_name: 'Sample Contact 3', phone: '9811122334', email: 'orders@pioneer.com', product_interest: 'Intercom System Stations', city: 'North District', estimated_value: 28000, urgency: 'planning' },
];

export default function LeadsPage() {
  const { user } = useAuth();
  const { showAlert } = usePopup();
  const canImport = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'sub_admin';

  const [activeTab, setActiveTab] = useState<'pipeline' | 'client-directory'>('pipeline');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [employees, setEmployees] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [view, setView] = useState<'kanban' | 'list'>('kanban');

  // Editing Lead state for quick updates
  const [editingLead, setEditingLead] = useState<any | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Density & Horizontal Navigation for Board & Table
  const [density, setDensity] = useState<'compact' | 'normal'>('compact');
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const kanbanContainerRef = useRef<HTMLDivElement>(null);

  // Lead Sharing state
  const [shareLeadModalOpen, setShareLeadModalOpen] = useState(false);
  const [shareTargetUserId, setShareTargetUserId] = useState('');
  const [sharingLead, setSharingLead] = useState(false);

  const handleShareLead = async () => {
    if (!selectedLead || !shareTargetUserId) return;
    setSharingLead(true);
    try {
      await leadsApi.shareLead(selectedLead.id, shareTargetUserId);
      showAlert('Success', 'Lead has been shared successfully with your sales colleague.');
      setShareLeadModalOpen(false);
      setShareTargetUserId('');
    } catch (err: any) {
      showAlert('Error', 'Failed to share lead: ' + (err.response?.data?.message || err.message));
    } finally {
      setSharingLead(false);
    }
  };

  const scrollTable = (direction: 'start' | 'left' | 'right' | 'end') => {
    const el = (activeTab === 'pipeline' && view === 'kanban')
      ? kanbanContainerRef.current
      : tableContainerRef.current;
    if (!el) return;
    const scrollAmount = 350;
    if (direction === 'start') {
      el.scrollTo({ left: 0, behavior: 'smooth' });
    } else if (direction === 'left') {
      el.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    } else if (direction === 'right') {
      el.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    } else if (direction === 'end') {
      el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
    }
  };

  // Drag-and-Drop state
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);

  // Selected Lead Detail Drawer
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activityNote, setActivityNote] = useState('');
  const [activityType, setActivityType] = useState<'call' | 'note' | 'email' | 'meeting'>('call');
  const [sendDirectEmail, setSendDirectEmail] = useState(true);
  const [submittingActivity, setSubmittingActivity] = useState(false);

  // Lead Setup & Real-time Flow Controller Modal
  const [leadSetupModalOpen, setLeadSetupModalOpen] = useState(false);
  const [leadSetupInitialTab, setLeadSetupInitialTab] = useState<'indiamart' | 'website' | 'whatsapp' | 'routing' | 'pipeline'>('indiamart');

  // Web-to-Lead Share Modal
  const [showShareModal, setShowShareModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  // Manual Add Lead Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLead, setNewLead] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    companyName: '',
    city: '',
    productCategory: 'PA System',
    estimatedValue: 0,
    urgency: 'standard',
    source: 'manual',
    queryMessage: '',
  });

  // Bulk Import Modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [parsedPreviewRows, setParsedPreviewRows] = useState<any[]>([]);
  const [selectedRowIndices, setSelectedRowIndices] = useState<number[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [importResult, setImportResult] = useState<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch Leads from Backend
  const fetchLeads = async () => {
    try {
      setLoading(true);
      const params: Record<string, any> = { limit: 300 };
      if (search) params.search = search;
      if (sourceFilter !== 'all') params.source = sourceFilter;
      if (urgencyFilter !== 'all') params.urgency = urgencyFilter;
      if (employeeFilter !== 'all') params.assignedToId = employeeFilter;

      const { data } = await leadsApi.list(params);
      setLeads(data.items || []);
    } catch (err) {
      console.error('Failed to load leads:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Sales Reps for filter dropdown
  useEffect(() => {
    if (user?.role === 'super_admin' || user?.role === 'admin') {
      usersApi.list({ role: 'employee' }).then((res) => {
        setEmployees(res.data.items || []);
      }).catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    const t = setTimeout(fetchLeads, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, sourceFilter, urgencyFilter, employeeFilter]);

  // Filtered Leads
  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      if (sourceFilter !== 'all' && l.source !== sourceFilter) return false;
      if (urgencyFilter !== 'all' && (l.urgency || 'standard') !== urgencyFilter) return false;
      if (employeeFilter !== 'all' && l.assignedToId !== employeeFilter) return false;
      return true;
    });
  }, [leads, sourceFilter, urgencyFilter, employeeFilter]);

  // Metrics: Leads Today calculations
  const todayLeads = useMemo(() => {
    return leads.filter((l) => {
      try {
        return isToday(new Date(l.createdAt));
      } catch {
        return false;
      }
    });
  }, [leads]);

  const sourceCountsToday = useMemo(() => {
    const counts = { indiamart: 0, web: 0, whatsapp: 0, manual: 0 };
    todayLeads.forEach((l) => {
      if (l.source in counts) counts[l.source as keyof typeof counts]++;
      else counts.manual++;
    });
    return counts;
  }, [todayLeads]);

  // Open Lead Detail
  const handleOpenLeadDetail = async (leadId: string) => {
    setLoadingDetail(true);
    try {
      const { data } = await leadsApi.get(leadId);
      setSelectedLead(data);
    } catch (err: any) {
      alert('Failed to load lead details: ' + (err?.response?.data?.message || err.message));
    } finally {
      setLoadingDetail(false);
    }
  };

  // Drag & Drop Handlers with Optimistic UI Update & API Synchronization
  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    e.dataTransfer.setData('text/plain', leadId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedLeadId(leadId);
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumnId !== columnId) {
      setDragOverColumnId(columnId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetColumn: ColumnDef) => {
    e.preventDefault();
    setDragOverColumnId(null);
    const leadId = e.dataTransfer.getData('text/plain') || draggedLeadId;
    if (!leadId) return;

    const targetStatus: LeadStatus = targetColumn.statuses[0]; // e.g. 'new', 'contacted', 'qualified', 'quoted', 'won'
    const currentLead = leads.find((l) => l.id === leadId);
    if (!currentLead || currentLead.status === targetStatus) {
      setDraggedLeadId(null);
      return;
    }

    const previousStatus = currentLead.status;

    // 1. Optimistic UI update
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: targetStatus } : l))
    );
    setDraggedLeadId(null);

    // 2. Persist to API
    try {
      await leadsApi.updateStatus(leadId, { status: targetStatus });
      if (selectedLead?.id === leadId) {
        setSelectedLead((prev) => (prev ? { ...prev, status: targetStatus } : null));
      }
    } catch (err: any) {
      // Roll back on failure
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: previousStatus } : l))
      );
      alert('Failed to update lead status: ' + (err?.response?.data?.message || err.message));
    }
  };

  // Add Activity Note
  const handleAddActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || !activityNote.trim()) return;

    setSubmittingActivity(true);
    try {
      await leadsApi.addActivity(selectedLead.id, {
        type: activityType,
        title: `${activityType.toUpperCase()}: ${activityNote.slice(0, 40)}...`,
        description: activityNote.trim(),
        sendEmailToCustomer: activityType === 'email' ? sendDirectEmail : false,
        isCompleted: true,
      });
      setActivityNote('');
      const { data } = await leadsApi.get(selectedLead.id);
      setSelectedLead(data);
      await fetchLeads();
    } catch (err: any) {
      alert('Failed to add note: ' + (err?.response?.data?.message || err.message));
    } finally {
      setSubmittingActivity(false);
    }
  };

  // Manual Add Lead Submit
  const handleCreateLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await leadsApi.create(newLead);
      setShowAddModal(false);
      setNewLead({
        customerName: '',
        customerPhone: '',
        customerEmail: '',
        companyName: '',
        city: '',
        productCategory: 'PA System',
        estimatedValue: 0,
        urgency: 'standard',
        source: 'manual',
        queryMessage: '',
      });
      await fetchLeads();
    } catch (err: any) {
      alert('Failed to create lead: ' + (err?.response?.data?.message || err.message));
    }
  };

  // Web-to-Lead URLs
  const publicUrl = window.location.origin + '/inquiry';
  const embedCode = `<iframe src="${publicUrl}" width="100%" height="750" frameborder="0" style="border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);"></iframe>`;

  // Bulk Import Handlers
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setEvaluating(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const { data } = await leadsApi.previewJson(results.data);
          setParsedPreviewRows(data.evaluatedRows || []);
          setSelectedRowIndices(data.evaluatedRows?.map((r: any) => r.rowIndex) || []);
        } catch (err: any) {
          alert('Failed to evaluate spreadsheet: ' + err.message);
        } finally {
          setEvaluating(false);
        }
      },
    });
  };

  const handleLoadSampleLeads = async () => {
    setFileName('jsnc_trade_show_sample.csv');
    setEvaluating(true);
    try {
      const { data } = await leadsApi.previewJson(SAMPLE_LEADS);
      setParsedPreviewRows(data.evaluatedRows || []);
      setSelectedRowIndices(data.evaluatedRows?.map((r: any) => r.rowIndex) || []);
    } catch (err: any) {
      alert('Failed to preview sample leads: ' + err.message);
    } finally {
      setEvaluating(false);
    }
  };

  const handleCommitImport = async () => {
    const rowsToCommit = parsedPreviewRows.filter((r) => selectedRowIndices.includes(r.rowIndex));
    if (rowsToCommit.length === 0) {
      alert('Please select at least 1 row to import.');
      return;
    }

    setImporting(true);
    try {
      const { data } = await leadsApi.commitImport(rowsToCommit);
      setImportResult(data);
      await fetchLeads();
    } catch (err: any) {
      alert('Import commit failed: ' + (err?.response?.data?.message || err.message));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* ─── TOP BAR: Leads Today Counter & Source Split Pills ──────────────── */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] flex items-center justify-between flex-wrap gap-4 shadow-xl">
        <div className="flex items-center gap-5 flex-wrap">
          {/* Animated Counter */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#2E5EFF]/15 border border-[#2E5EFF]/30 flex items-center justify-center text-[#2E5EFF] shadow-glow-blue">
              <Flame size={24} />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Leads Captured Today</p>
              <div className="flex items-baseline gap-2">
                <motion.span
                  key={todayLeads.length}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-3xl font-black text-slate-950 dark:text-white tabular-nums tracking-tight"
                >
                  {todayLeads.length}
                </motion.span>
                <span className="text-xs text-slate-500 font-mono">({leads.length} in pipeline)</span>
              </div>
            </div>
          </div>

          <div className="h-10 w-[1px] bg-[#2A3042] hidden sm:block" />

          {/* Source Breakdown Interactive Pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* IndiaMART */}
            <button
              onClick={() => {
                setLeadSetupInitialTab('indiamart');
                setLeadSetupModalOpen(true);
              }}
              title="Click to configure IndiaMART Webhook & Live API sync"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#2E5EFF]/15 hover:bg-[#2E5EFF]/25 text-[#2E5EFF] border border-[#2E5EFF]/30 text-xs font-bold transition-all cursor-pointer shadow-sm hover:scale-[1.02]"
            >
              <span className="w-2 h-2 rounded-full bg-[#2E5EFF]" />
              <span>IndiaMART</span>
              <span className="px-1.5 py-0.2 rounded-full bg-[#2E5EFF]/20 font-mono text-[11px]">
                {sourceCountsToday.indiamart}
              </span>
            </button>

            {/* Website */}
            <button
              onClick={() => {
                setLeadSetupInitialTab('website');
                setLeadSetupModalOpen(true);
              }}
              title="Click to configure Website Inquiry Form & Embed Widget"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-blue-50 dark:bg-[#1E2230] dark:hover:bg-[#262C3E] text-[#60A5FA] border border-[#3B82F6]/30 text-xs font-bold transition-all cursor-pointer shadow-sm hover:scale-[1.02]"
            >
              <Globe size={13} className="text-[#60A5FA]" />
              <span>Website</span>
              <span className="px-1.5 py-0.2 rounded-full bg-blue-500/20 font-mono text-[11px]">
                {sourceCountsToday.web}
              </span>
            </button>

            {/* WhatsApp */}
            <button
              onClick={() => {
                setLeadSetupInitialTab('whatsapp');
                setLeadSetupModalOpen(true);
              }}
              title="Click to configure Meta WhatsApp Cloud API Webhook"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#25D366] border border-[#25D366]/30 text-xs font-bold transition-all cursor-pointer shadow-sm hover:scale-[1.02]"
            >
              <MessageSquare size={13} />
              <span>WhatsApp</span>
              <span className="px-1.5 py-0.2 rounded-full bg-[#25D366]/20 font-mono text-[11px]">
                {sourceCountsToday.whatsapp}
              </span>
            </button>

            {/* Manual / Routing */}
            <button
              onClick={() => {
                setLeadSetupInitialTab('routing');
                setLeadSetupModalOpen(true);
              }}
              title="Click to configure Sales Auto-Assignment & SLA Routing"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#9AA0B4]/15 hover:bg-[#9AA0B4]/25 text-[#9AA0B4] border border-[#9AA0B4]/30 text-xs font-bold transition-all cursor-pointer shadow-sm hover:scale-[1.02]"
            >
              <User size={13} />
              <span>Manual / Import</span>
              <span className="px-1.5 py-0.2 rounded-full bg-[#9AA0B4]/20 font-mono text-[11px]">
                {sourceCountsToday.manual}
              </span>
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Lead Setup & Real-time Flow Controller Button */}
          <button
            onClick={() => {
              setLeadSetupInitialTab('routing');
              setLeadSetupModalOpen(true);
            }}
            className="btn bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/10 text-xs gap-1.5 shadow-sm font-bold"
            title="Configure Lead Capture Channels, Routing Rules & SLA"
          >
            <Sliders size={14} className="text-crm-blue" />
            <span>Lead Setup & Flow</span>
          </button>

          {/* Web-to-Lead Link */}
          <button
            onClick={() => {
              setLeadSetupInitialTab('website');
              setLeadSetupModalOpen(true);
            }}
            className="btn bg-crm-teal/15 hover:bg-crm-teal/25 text-crm-teal border border-crm-teal/30 text-xs gap-1.5 shadow-glow-teal font-bold"
          >
            <Link2 size={14} /> Web-to-Lead Link
          </button>

          {/* Bulk Import (Gated) */}
          {canImport && (
            <button
              onClick={() => {
                setShowImportModal(true);
                setImportResult(null);
              }}
              className="btn bg-crm-violet hover:bg-crm-violet-hover text-white text-xs gap-1.5 shadow-glow-violet font-bold"
            >
              <FileSpreadsheet size={14} /> Import Leads
            </button>
          )}

          {/* New Lead */}
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary text-xs gap-1.5 shadow-glow-blue font-bold"
          >
            <Plus size={15} /> New Lead
          </button>
        </div>
      </div>

      {/* ─── TAB NAVIGATION: Pipeline Board vs Client Data Directory ──────── */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#2A3042] pb-1 gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('pipeline')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'pipeline'
                ? 'bg-crm-blue text-white shadow-glow-blue'
                : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 font-bold'
            }`}
          >
            <Flame size={14} className={activeTab === 'pipeline' ? 'text-amber-300' : ''} />
            Pipeline & Kanban Board ({filteredLeads.length})
          </button>

          <button
            onClick={() => setActiveTab('client-directory')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'client-directory'
                ? 'bg-crm-violet text-white shadow-glow-violet'
                : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 font-bold'
            }`}
          >
            <Building2 size={14} className={activeTab === 'client-directory' ? 'text-violet-300' : ''} />
            Client Directory & Lead Research ({filteredLeads.length})
          </button>
        </div>

        {activeTab === 'client-directory' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const csvContent = 'data:text/csv;charset=utf-8,' + [
                  ['Lead Number', 'Inquiry Date', 'Client Name', 'Company', 'Phone', 'Email', 'City', 'Source', 'Product / System', 'Est. Value', 'Urgency', 'Stage', 'Assigned Rep', 'Notes / Research'].join(','),
                  ...filteredLeads.map((l) => [
                    `"${l.leadNumber}"`,
                    `"${format(new Date(l.createdAt), 'yyyy-MM-dd HH:mm')}"`,
                    `"${(l.customerName || '').replace(/"/g, '""')}"`,
                    `"${(l.company?.name || l.companyName || '').replace(/"/g, '""')}"`,
                    `"${(l.customerPhone || '').replace(/"/g, '""')}"`,
                    `"${(l.customerEmail || '').replace(/"/g, '""')}"`,
                    `"${(l.city || '').replace(/"/g, '""')}"`,
                    `"${l.source || ''}"`,
                    `"${(l.productCategory || l.productName || '').replace(/"/g, '""')}"`,
                    l.estimatedValue || 0,
                    `"${l.urgency || 'standard'}"`,
                    `"${l.status || 'new'}"`,
                    `"${(l.assignedTo?.name || 'Unassigned').replace(/"/g, '""')}"`,
                    `"${(l.queryMessage || '').replace(/"/g, '""')}"`,
                  ].join(','))
                ].join('\n');
                const encodedUri = encodeURI(csvContent);
                const link = document.createElement('a');
                link.setAttribute('href', encodedUri);
                link.setAttribute('download', `JSNC_Leads_Client_Directory_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              className="btn bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5 shadow-sm"
              title="Export all client directory data to CSV"
            >
              <Download size={13} /> Export Client Data (CSV)
            </button>
          </div>
        )}
      </div>

      {/* ─── CONTROLS: Search, Filter Chips, & View Toggle ────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-1 max-w-4xl flex-wrap">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-9 text-xs"
              placeholder="Search contact, company, phone, SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Source Chips */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#141722] p-1 rounded-xl border border-slate-200 dark:border-[#2A3042]">
            <span className="text-[10px] text-slate-500 font-bold px-2 uppercase">Source:</span>
            {[
              { id: 'all', label: 'All' },
              { id: 'indiamart', label: 'IndiaMART' },
              { id: 'web', label: 'Website' },
              { id: 'whatsapp', label: 'WhatsApp' },
              { id: 'manual', label: 'Manual' },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => setSourceFilter(s.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  sourceFilter === s.id
                    ? 'bg-crm-blue text-white shadow-glow-blue'
                    : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 font-bold'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Urgency Chips */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#141722] p-1 rounded-xl border border-slate-200 dark:border-[#2A3042]">
            <span className="text-[10px] text-slate-500 font-bold px-2 uppercase">Urgency:</span>
            {[
              { id: 'all', label: 'All' },
              { id: 'urgent', label: 'Urgent' },
              { id: 'standard', label: 'Standard' },
              { id: 'planning', label: 'Planning' },
            ].map((u) => (
              <button
                key={u.id}
                onClick={() => setUrgencyFilter(u.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  urgencyFilter === u.id
                    ? u.id === 'urgent'
                      ? 'bg-crm-coral text-white shadow-glow-coral'
                      : 'bg-crm-amber text-black font-bold'
                    : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 font-bold'
                }`}
              >
                {u.label}
              </button>
            ))}
          </div>

          {/* Assigned Rep Filter */}
          {employees.length > 0 && (
            <select
              className="input w-44 text-xs"
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
            >
              <option value="all">All Sales Reps</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.employeeCode})
                </option>
              ))}
            </select>
          )}

          {/* Reset All Filters Button */}
          {(search || sourceFilter !== 'all' || urgencyFilter !== 'all' || employeeFilter !== 'all') && (
            <button
              onClick={() => {
                setSearch('');
                setSourceFilter('all');
                setUrgencyFilter('all');
                setEmployeeFilter('all');
              }}
              className="btn-ghost text-xs text-crm-coral hover:bg-crm-coral/10 border border-crm-coral/30 px-2.5 py-1.5 flex items-center gap-1 font-semibold"
              title="Reset all active filters"
            >
              <X size={13} /> Clear Filters
            </button>
          )}
        </div>

        {/* View Switcher & Refresh (Only on Pipeline tab) */}
        <div className="flex items-center gap-2">
          {activeTab === 'pipeline' && (
            <div className="flex bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-xl p-1 gap-1">
              <button
                onClick={() => setView('kanban')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  view === 'kanban'
                    ? 'bg-crm-blue text-white shadow-glow-blue'
                    : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                Kanban Board
              </button>
              <button
                onClick={() => setView('list')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  view === 'list'
                    ? 'bg-crm-blue text-white shadow-glow-blue'
                    : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                Pipeline Table
              </button>
            </div>
          )}

          <button onClick={fetchLeads} className="btn-ghost text-xs gap-1" title="Refresh leads">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ─── TABLE & BOARD NAVIGATOR TOOLBAR (Scroll or Pan) ────────────────── */}
      <div className="flex items-center justify-between bg-white dark:bg-[#181B26] p-2 rounded-xl border border-slate-200 dark:border-[#2A3042] flex-wrap gap-2 text-xs shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-crm-blue animate-pulse" />
            Table Navigator (Scroll or Pan):
          </span>
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#141722] p-0.5 rounded-lg border border-slate-200 dark:border-[#2A3042]">
            <button
              type="button"
              onClick={() => setDensity('compact')}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                density === 'compact' ? 'bg-crm-blue text-white shadow-sm' : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              Compact
            </button>
            <button
              type="button"
              onClick={() => setDensity('normal')}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                density === 'normal' ? 'bg-crm-blue text-white shadow-sm' : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              Normal
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => scrollTable('start')}
            className="btn bg-white dark:bg-[#1E2230] text-[11px] py-1 px-2.5 border border-slate-300 dark:border-white/10 hover:border-crm-blue text-slate-800 dark:text-slate-300 flex items-center gap-1 font-bold shadow-sm"
            title="Scroll to Start"
          >
            <ChevronsLeft size={13} /> Start (Component & SKU)
          </button>
          <button
            type="button"
            onClick={() => scrollTable('left')}
            className="btn bg-white dark:bg-[#1E2230] text-[11px] py-1 px-2.5 border border-slate-300 dark:border-[#2A3042] hover:border-crm-blue text-slate-800 dark:text-white flex items-center gap-1 font-bold shadow-sm"
            title="Pan Left"
          >
            <ChevronLeft size={13} /> Left
          </button>
          <button
            type="button"
            onClick={() => scrollTable('right')}
            className="btn bg-white dark:bg-[#1E2230] text-[11px] py-1 px-2.5 border border-slate-300 dark:border-[#2A3042] hover:border-crm-blue text-slate-800 dark:text-white flex items-center gap-1 font-bold shadow-sm"
            title="Pan Right"
          >
            Right <ChevronRight size={13} />
          </button>
          <button
            type="button"
            onClick={() => scrollTable('end')}
            className="btn bg-white dark:bg-[#1E2230] text-[11px] py-1 px-2.5 border border-slate-300 dark:border-white/10 hover:border-amber-500 text-amber-700 dark:text-crm-amber flex items-center gap-1 font-bold shadow-sm"
            title="Scroll to End"
          >
            End (Actions & Bill) <ChevronsRight size={13} />
          </button>
        </div>
      </div>

      {/* ─── TAB CONTENT: Pipeline vs Client Data Directory ──────────────── */}
      {activeTab === 'pipeline' ? (
        view === 'kanban' ? (
          <div
            ref={kanbanContainerRef}
            className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin items-start min-w-full scroll-smooth"
          >
            {PIPELINE_COLUMNS.map((column) => {
              const columnCards = filteredLeads.filter((l) => column.statuses.includes(l.status));
              const isDropTarget = dragOverColumnId === column.id;

              return (
                <div
                  key={column.id}
                  onDragOver={(e) => handleDragOver(e, column.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, column)}
                  className={`shrink-0 flex flex-col rounded-2xl bg-slate-100 dark:bg-[#141722] border-t-4 ${column.headerBorder} border border-slate-200 dark:border-[#2A3042] transition-all min-h-[550px] max-h-[82vh] ${
                    density === 'compact' ? 'w-[235px] min-w-[235px]' : 'w-[290px] min-w-[290px]'
                  } ${
                    isDropTarget
                      ? 'bg-slate-50 dark:bg-[#1E2230] border-[#3B82F6] ring-2 ring-[#3B82F6]/30 shadow-2xl scale-[1.01]'
                      : ''
                  }`}
                >
                  {/* Column Header */}
                  <div className={`border-b border-slate-200 dark:border-[#2A3042]/70 flex items-center justify-between bg-white dark:bg-[#181B26] rounded-t-xl shrink-0 ${
                    density === 'compact' ? 'p-2.5' : 'p-3.5'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: column.accentColor }} />
                      <h3 className={`font-bold text-slate-950 dark:text-white uppercase tracking-wider ${
                        density === 'compact' ? 'text-[11px]' : 'text-xs'
                      }`}>
                        {column.label}
                      </h3>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full font-mono font-bold ${
                        density === 'compact' ? 'text-[10px]' : 'text-[11px]'
                      } ${column.pillBg}`}
                    >
                      {columnCards.length}
                    </span>
                  </div>

                  {/* Column Cards Container */}
                  <div className={`overflow-y-auto flex-1 custom-scrollbar ${
                    density === 'compact' ? 'p-2 space-y-2' : 'p-2.5 space-y-2.5'
                  }`}>
                    <AnimatePresence>
                      {columnCards.map((lead) => {
                        const isUrgent = (lead.urgency || 'standard') === 'urgent';
                        const isPlanning = (lead.urgency || 'standard') === 'planning';
                        const assignedName = lead.assignedTo?.name || 'Unassigned';
                        const initials = assignedName
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase();

                        // Source badge styling
                        const sourceConfig: Record<string, { bg: string; text: string; label: string }> = {
                          indiamart: { bg: 'bg-[#2E5EFF]', text: 'text-white', label: 'IndiaMART' },
                          web: { bg: 'bg-slate-50 dark:bg-[#1E2230] border border-[#3B82F6]/40', text: 'text-[#60A5FA]', label: 'Website' },
                          whatsapp: { bg: 'bg-[#25D366]', text: 'text-black font-bold', label: 'WhatsApp' },
                          manual: { bg: 'bg-[#9AA0B4]', text: 'text-black', label: 'Manual' },
                        };
                        const srcStyle = sourceConfig[lead.source] || sourceConfig.manual;

                        return (
                          <motion.div
                            key={lead.id}
                            layout
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                            draggable
                            onDragStart={(e: any) => handleDragStart(e, lead.id)}
                            onClick={() => handleOpenLeadDetail(lead.id)}
                            whileHover={{
                              y: -3,
                              boxShadow: isUrgent
                                ? '0 12px 28px -4px rgba(255, 107, 107, 0.45)'
                                : '0 12px 24px -4px rgba(0, 0, 0, 0.6)',
                              transition: { duration: 0.15 },
                            }}
                            className={`bg-white dark:bg-[#181B26] border cursor-pointer select-none transition-all relative overflow-hidden ${
                              density === 'compact' ? 'p-2.5 rounded-lg' : 'p-3.5 rounded-xl'
                            } ${
                              isUrgent
                                ? 'border-crm-coral/60 shadow-[0_0_15px_rgba(255,107,107,0.25)] animate-pulse'
                                : 'border-slate-200 dark:border-[#2A3042] hover:border-[#3B82F6]/60'
                            }`}
                          >
                            {/* Top Row: Lead Code & Source Badge */}
                            <div className={`flex items-center justify-between gap-1.5 min-w-0 ${
                              density === 'compact' ? 'mb-1.5' : 'mb-2.5'
                            }`}>
                              <span className="font-mono text-[10px] text-slate-400 font-bold tracking-tight whitespace-nowrap truncate shrink-0 max-w-[130px]">
                                {lead.leadNumber}
                              </span>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {/* Source Pill */}
                                <span
                                  className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold shrink-0 ${srcStyle.bg} ${srcStyle.text}`}
                                >
                                  {srcStyle.label}
                                </span>
                              </div>
                            </div>

                            {/* Contact Name & Company */}
                            <div>
                              <h4 className={`font-bold text-slate-950 dark:text-white leading-snug line-clamp-1 group-hover:text-crm-blue-light transition-colors ${
                                density === 'compact' ? 'text-xs' : 'text-sm'
                              }`}>
                                {lead.customerName}
                              </h4>
                              <p className={`text-slate-400 font-medium truncate mt-0.5 ${
                                density === 'compact' ? 'text-[10px]' : 'text-xs'
                              }`}>
                                {lead.company?.name || lead.companyName || 'Individual Inquirer'}
                              </p>
                            </div>

                            {/* Product / System Requirement Tag */}
                            {(lead.productCategory || lead.productName) && (
                              <div className={density === 'compact' ? 'mt-1.5' : 'mt-2.5'}>
                                <span className={`inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042] text-slate-300 max-w-full truncate font-medium ${
                                  density === 'compact' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
                                }`}>
                                  <Tag size={9} className="text-crm-teal shrink-0" />
                                  <span className="truncate">{lead.productCategory || lead.productName}</span>
                                </span>
                              </div>
                            )}

                            {/* Bottom Row: Est. Value, Time Since Created & Rep Avatar */}
                            <div className={`flex items-center justify-between border-t border-slate-200 dark:border-[#2A3042]/70 ${
                              density === 'compact' ? 'pt-2 mt-2 text-[11px]' : 'pt-3 mt-3 text-xs'
                            }`}>
                              <div>
                                {lead.estimatedValue && lead.estimatedValue > 0 ? (
                                  <span className="font-bold font-mono text-crm-amber">
                                    ₹{lead.estimatedValue.toLocaleString('en-IN')}
                                  </span>
                                ) : (
                                  <span className="text-slate-600 font-mono text-[10px]">—</span>
                                )}
                                <p className="text-[9px] text-slate-500 mt-0.5 flex items-center gap-1 font-mono">
                                  <Clock size={9} />
                                  {formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })}
                                </p>
                              </div>

                              {/* Assigned Rep Avatar */}
                              <div
                                className={`rounded-full bg-crm-blue/20 border border-crm-blue/40 text-crm-blue-light flex items-center justify-center font-bold shadow-sm shrink-0 ${
                                  density === 'compact' ? 'w-6 h-6 text-[9px]' : 'w-7 h-7 text-[10px]'
                                }`}
                                title={`Assigned to: ${assignedName}`}
                              >
                                {initials}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>

                    {columnCards.length === 0 && (
                      <div className="p-6 text-center text-slate-600 text-xs border border-dashed border-slate-200 dark:border-[#2A3042] rounded-xl flex flex-col items-center justify-center min-h-[120px]">
                        <span>No leads in {column.label}</span>
                        <span className="text-[10px] text-slate-700 mt-1">Drag cards here to update stage</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ─── PIPELINE TABLE VIEW ────────────────────────────────────────── */
          <div className="table-wrapper border border-slate-200 dark:border-[#2A3042] rounded-xl overflow-hidden shadow-sm bg-white dark:bg-[#141722]">
            <div
              ref={tableContainerRef}
              className="overflow-x-auto max-h-[720px] scrollbar-thin scrollbar-thumb-crm-blue/70 hover:scrollbar-thumb-crm-blue scrollbar-track-slate-100 dark:scrollbar-track-[#181B26]"
            >
              <table className={`table-auto border-collapse w-full ${density === 'compact' ? 'text-[11px]' : 'text-xs'}`}>
                <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-[#181B26] border-b border-slate-200 dark:border-[#2A3042] text-slate-800 dark:text-slate-300 shadow-sm">
                  <tr>
                    <th className={`text-left font-bold border-r border-slate-200 dark:border-[#2A3042]/60 whitespace-nowrap ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>Lead #</th>
                    <th className={`text-left font-bold border-r border-slate-200 dark:border-[#2A3042]/60 whitespace-nowrap ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>Source</th>
                    <th className={`text-center font-bold border-r border-slate-200 dark:border-[#2A3042]/60 whitespace-nowrap ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>Urgency</th>
                    <th className={`text-left font-bold border-r border-slate-200 dark:border-[#2A3042]/60 min-w-[180px] ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>Contact & Company</th>
                    <th className={`text-left font-bold border-r border-slate-200 dark:border-[#2A3042]/60 min-w-[140px] ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>Phone</th>
                    <th className={`text-left font-bold border-r border-slate-200 dark:border-[#2A3042]/60 min-w-[180px] ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>Product / System</th>
                    <th className={`text-right font-bold border-r border-slate-200 dark:border-[#2A3042]/60 whitespace-nowrap ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>Est. Value</th>
                    <th className={`text-left font-bold border-r border-slate-200 dark:border-[#2A3042]/60 min-w-[140px] ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>Assigned Rep</th>
                    <th className={`text-center font-bold border-r border-slate-200 dark:border-[#2A3042]/60 whitespace-nowrap ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>Stage</th>
                    <th className={`text-right font-bold whitespace-nowrap ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#2A3042]/40">
                  {filteredLeads.map((l) => (
                    <tr
                      key={l.id}
                      onClick={() => handleOpenLeadDetail(l.id)}
                      className="cursor-pointer bg-white dark:bg-[#181B26] hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
                    >
                      <td className={`font-mono font-bold text-purple-700 dark:text-crm-violet-light border-r border-slate-200 dark:border-[#2A3042]/30 whitespace-nowrap ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                        {l.leadNumber}
                      </td>
                      <td className={`border-r border-slate-200 dark:border-[#2A3042]/30 whitespace-nowrap ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 dark:bg-[#1E2230] border border-slate-200 dark:border-[#2A3042] text-slate-800 dark:text-slate-300">
                          {l.source}
                        </span>
                      </td>
                      <td className={`text-center border-r border-slate-200 dark:border-[#2A3042]/30 whitespace-nowrap ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                        {(l.urgency || 'standard') === 'urgent' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300 border border-red-300 dark:border-red-500/30 inline-flex items-center gap-1 font-bold">
                            <Flame size={10} /> Urgent
                          </span>
                        ) : (
                          <span className="text-slate-700 dark:text-slate-400 font-medium capitalize">{l.urgency || 'standard'}</span>
                        )}
                      </td>
                      <td className={`border-r border-slate-200 dark:border-[#2A3042]/30 ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                        <div>
                          <p className="font-bold text-slate-950 dark:text-white leading-tight">{l.customerName}</p>
                          <p className="text-[11px] text-slate-700 dark:text-slate-400 font-semibold mt-0.5">{l.company?.name || l.companyName || '—'}</p>
                        </div>
                      </td>
                      <td className={`font-mono font-bold text-emerald-700 dark:text-crm-teal border-r border-slate-200 dark:border-[#2A3042]/30 ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                        {l.customerPhone || '—'}
                      </td>
                      <td className={`text-slate-800 dark:text-slate-200 font-semibold border-r border-slate-200 dark:border-[#2A3042]/30 ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                        {l.productCategory || l.productName || '—'}
                      </td>
                      <td className={`text-right text-amber-800 dark:text-crm-amber font-mono font-black border-r border-slate-200 dark:border-[#2A3042]/30 whitespace-nowrap ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                        {l.estimatedValue ? `₹${l.estimatedValue.toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className={`text-slate-800 dark:text-slate-300 font-medium border-r border-slate-200 dark:border-[#2A3042]/30 ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                        {l.assignedTo?.name ? (
                          <span className="text-blue-700 dark:text-crm-blue-light font-bold">{l.assignedTo.name}</span>
                        ) : (
                          <span className="text-slate-500 italic">Unassigned</span>
                        )}
                      </td>
                      <td className={`text-center border-r border-slate-200 dark:border-[#2A3042]/30 whitespace-nowrap ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                        <span className="capitalize px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 dark:bg-[#1E2230] border border-slate-200 dark:border-[#2A3042] text-slate-800 dark:text-slate-200">
                          {l.status}
                        </span>
                      </td>
                      <td className={`text-right text-slate-700 dark:text-slate-400 font-mono font-medium whitespace-nowrap ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                        {format(new Date(l.createdAt), 'dd MMM yyyy, HH:mm')}
                      </td>
                    </tr>
                  ))}
                  {filteredLeads.length === 0 && (
                    <tr>
                      <td colSpan={10} className="text-center py-10 text-slate-500 font-bold">
                        No leads matching your filters
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        /* ─── TAB 2: CLIENT DIRECTORY & LEAD RESEARCH DATA TABLE ─────────── */
        <div className="table-wrapper border border-slate-200 dark:border-[#2A3042] rounded-xl overflow-hidden shadow-sm bg-white dark:bg-[#141722]">
          <div
            ref={tableContainerRef}
            className="overflow-x-auto max-h-[720px] scrollbar-thin scrollbar-thumb-crm-blue/70 hover:scrollbar-thumb-crm-blue scrollbar-track-slate-100 dark:scrollbar-track-[#181B26]"
          >
            <table className={`table-auto border-collapse w-full ${density === 'compact' ? 'text-[11px]' : 'text-xs'}`}>
              <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-[#181B26] border-b border-slate-200 dark:border-[#2A3042] text-slate-800 dark:text-slate-300 shadow-sm">
                <tr>
                  <th className={`text-left font-bold border-r border-slate-200 dark:border-[#2A3042]/60 whitespace-nowrap ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>
                    Lead #
                  </th>
                  <th className={`text-left font-bold border-r border-slate-200 dark:border-[#2A3042]/60 whitespace-nowrap ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>
                    Inquiry Date
                  </th>
                  <th className={`text-left font-bold border-r border-slate-200 dark:border-[#2A3042]/60 min-w-[180px] ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>
                    Client / Company
                  </th>
                  <th className={`text-left font-bold border-r border-slate-200 dark:border-[#2A3042]/60 min-w-[150px] ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>
                    Contact Details
                  </th>
                  <th className={`text-left font-bold border-r border-slate-200 dark:border-[#2A3042]/60 whitespace-nowrap ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>
                    Location
                  </th>
                  <th className={`text-center font-bold border-r border-slate-200 dark:border-[#2A3042]/60 whitespace-nowrap ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>
                    Source
                  </th>
                  <th className={`text-left font-bold border-r border-slate-200 dark:border-[#2A3042]/60 min-w-[200px] ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>
                    Equipment / System Specs
                  </th>
                  <th className={`text-right font-bold border-r border-slate-200 dark:border-[#2A3042]/60 whitespace-nowrap ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>
                    Est. Value
                  </th>
                  <th className={`text-left font-bold border-r border-slate-200 dark:border-[#2A3042]/60 min-w-[240px] ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>
                    Notes & Research Content
                  </th>
                  <th className={`text-center font-bold border-r border-slate-200 dark:border-[#2A3042]/60 whitespace-nowrap ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>
                    Stage
                  </th>
                  <th className={`text-right font-bold whitespace-nowrap ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2A3042]/40">
                {filteredLeads.map((l) => (
                  <tr key={l.id} className="bg-white dark:bg-[#181B26] hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                    <td className={`font-mono font-bold text-purple-700 dark:text-crm-violet-light border-r border-slate-200 dark:border-[#2A3042]/30 whitespace-nowrap ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                      {l.leadNumber}
                    </td>
                    <td className={`text-slate-700 dark:text-slate-400 font-mono whitespace-nowrap border-r border-slate-200 dark:border-[#2A3042]/30 ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                      {format(new Date(l.createdAt), 'dd MMM yyyy')}
                      <span className="block text-[10px] text-slate-500 font-medium">
                        {format(new Date(l.createdAt), 'HH:mm')}
                      </span>
                    </td>
                    <td className={`border-r border-slate-200 dark:border-[#2A3042]/30 ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                      <div>
                        <p className="font-bold text-slate-950 dark:text-white leading-tight">{l.customerName}</p>
                        <p className="text-[11px] text-slate-700 dark:text-slate-400 font-semibold mt-0.5">
                          {l.company?.name || l.companyName || 'Individual Inquirer'}
                        </p>
                      </div>
                    </td>
                    <td className={`border-r border-slate-200 dark:border-[#2A3042]/30 ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                      <div className="space-y-0.5">
                        <a
                          href={`tel:${l.customerPhone}`}
                          className="text-emerald-700 dark:text-crm-teal font-mono font-bold flex items-center gap-1 hover:underline"
                        >
                          <Phone size={11} /> {l.customerPhone || '—'}
                        </a>
                        {l.customerEmail && (
                          <a
                            href={`mailto:${l.customerEmail}`}
                            className="text-slate-700 dark:text-slate-400 font-medium text-[11px] flex items-center gap-1 truncate max-w-[160px] hover:underline"
                          >
                            <Mail size={11} className="text-slate-500" /> {l.customerEmail}
                          </a>
                        )}
                      </div>
                    </td>
                    <td className={`text-slate-800 dark:text-slate-300 whitespace-nowrap border-r border-slate-200 dark:border-[#2A3042]/30 ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                      <span className="flex items-center gap-1 font-medium">
                        <MapPin size={11} className="text-slate-500" /> {l.city || 'India'}
                      </span>
                    </td>
                    <td className={`text-center border-r border-slate-200 dark:border-[#2A3042]/30 ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 dark:bg-[#1E2230] border border-slate-200 dark:border-[#2A3042] text-slate-800 dark:text-slate-300">
                        {l.source}
                      </span>
                    </td>
                    <td className={`border-r border-slate-200 dark:border-[#2A3042]/30 ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                      <div className="max-w-[220px]">
                        <p className="font-bold text-slate-950 dark:text-white truncate">
                          {l.productCategory || l.productName || 'System Equipment'}
                        </p>
                      </div>
                    </td>
                    <td className={`text-right text-amber-800 dark:text-crm-amber font-mono font-black whitespace-nowrap border-r border-slate-200 dark:border-[#2A3042]/30 ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                      {l.estimatedValue ? `₹${l.estimatedValue.toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td className={`border-r border-slate-200 dark:border-[#2A3042]/30 ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                      <div className="max-w-[260px]">
                        <p className="text-slate-800 dark:text-slate-300 font-medium italic line-clamp-2" title={l.queryMessage || ''}>
                          {l.queryMessage ? `"${l.queryMessage}"` : <span className="text-slate-500">No notes added</span>}
                        </p>
                      </div>
                    </td>
                    <td className={`text-center border-r border-slate-200 dark:border-[#2A3042]/30 whitespace-nowrap ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                      <span className="capitalize px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-[#1E2230] border border-slate-200 dark:border-[#2A3042] text-slate-800 dark:text-slate-200">
                        {l.status}
                      </span>
                    </td>
                    <td className={`text-right whitespace-nowrap ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenLeadDetail(l.id)}
                          className="btn bg-white dark:bg-[#1E2230] text-xs px-2.5 py-1 border border-slate-300 dark:border-white/10 text-crm-blue hover:bg-crm-blue/10 font-bold shadow-sm"
                          title="Open Timeline & Activities"
                        >
                          View
                        </button>
                        <a
                          href={`/quotations?leadId=${l.id}&name=${encodeURIComponent(l.customerName)}&phone=${encodeURIComponent(l.customerPhone)}&email=${encodeURIComponent(l.customerEmail || '')}&company=${encodeURIComponent(l.company?.name || l.companyName || '')}`}
                          className="btn bg-amber-100 dark:bg-crm-amber/15 hover:bg-amber-200 dark:hover:bg-crm-amber/25 text-amber-900 dark:text-crm-amber border border-amber-300 dark:border-crm-amber/30 text-xs px-2.5 py-1 font-bold shadow-sm"
                          title="Generate Quotation"
                        >
                          Quote
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── DRAWER: Lead Detail & Activity Timeline ──────────────────────── */}
      <AnimatePresence>
        {selectedLead && (
          <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="w-full max-w-2xl h-full bg-white dark:bg-[#181B26] border-l border-slate-200 dark:border-[#2A3042] flex flex-col shadow-2xl overflow-hidden"
            >
              {/* Drawer Header */}
              <div className="p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-crm-blue/20 text-crm-blue border border-crm-blue/30 flex items-center justify-center font-bold">
                    <User size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-950 dark:text-white">{selectedLead.customerName}</h2>
                      <span className="font-mono text-xs text-purple-800 dark:text-purple-300 px-2 py-0.5 rounded bg-purple-100 dark:bg-crm-violet/20 border border-purple-300 dark:border-crm-violet/30 font-bold">
                        {selectedLead.leadNumber}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-400 font-medium mt-0.5">
                      {selectedLead.company?.name || selectedLead.companyName || 'Direct Inquiry'} • {selectedLead.city || 'Location N/A'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShareLeadModalOpen(true)}
                    className="px-2.5 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-crm-blue-light text-xs font-bold flex items-center gap-1.5 transition-colors border border-blue-500/20"
                    title="Share Lead with Sales Teammate"
                  >
                    <Share2 size={14} /> Share Lead
                  </button>
                  <button
                    onClick={() => setSelectedLead(null)}
                    className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white flex items-center justify-center"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Drawer Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50 dark:bg-[#0F1117]">
                {/* Stage Progression Selector */}
                <div className="p-4 rounded-xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] space-y-3 shadow-sm">
                  <p className="text-[11px] font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Pipeline Stage</p>
                  <div className="grid grid-cols-5 gap-1 bg-slate-100 dark:bg-[#141722] p-1 rounded-xl border border-slate-200 dark:border-[#2A3042]">
                    {(['new', 'contacted', 'qualified', 'quoted', 'won'] as LeadStatus[]).map((st) => (
                      <button
                        key={st}
                        onClick={async () => {
                          try {
                            await leadsApi.updateStatus(selectedLead.id, { status: st });
                            setSelectedLead({ ...selectedLead, status: st });
                            await fetchLeads();
                          } catch (err: any) {
                            alert('Failed to update stage: ' + err.message);
                          }
                        }}
                        className={`py-2 rounded-lg text-xs font-bold capitalize transition-all ${
                          selectedLead.status === st
                            ? 'bg-crm-blue text-white shadow-glow-blue'
                            : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 font-bold'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Contact & Deal Details */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-4 rounded-xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] space-y-2 shadow-sm">
                    <p className="text-[10px] text-slate-700 dark:text-slate-400 font-bold uppercase tracking-wider">Contact Info</p>
                    <p className="text-teal-700 dark:text-crm-teal font-mono font-bold flex items-center gap-1.5">
                      <Phone size={13} /> {selectedLead.customerPhone || '—'}
                    </p>
                    <p className="text-slate-800 dark:text-slate-300 font-medium flex items-center gap-1.5 truncate">
                      <Mail size={13} className="text-slate-500" /> {selectedLead.customerEmail || '—'}
                    </p>
                    <p className="text-slate-700 dark:text-slate-400 font-medium flex items-center gap-1.5">
                      <MapPin size={13} className="text-slate-500" /> {selectedLead.city || 'India'}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] space-y-2 shadow-sm">
                    <p className="text-[10px] text-slate-700 dark:text-slate-400 font-bold uppercase tracking-wider">Requirement Specs</p>
                    <p className="text-slate-950 dark:text-white font-bold">{selectedLead.productCategory || selectedLead.productName || 'System Equipment'}</p>
                    <p className="text-amber-700 dark:text-crm-amber font-mono font-black text-sm">
                      Est. Value: ₹{selectedLead.estimatedValue?.toLocaleString('en-IN') || '0'}
                    </p>
                    <p className="text-slate-700 dark:text-slate-400 font-medium text-[11px]">
                      Assigned Rep: <strong className="text-blue-700 dark:text-crm-blue-light font-bold">{selectedLead.assignedTo?.name || 'Unassigned'}</strong>
                    </p>
                  </div>
                </div>

                {/* Inquiry Message */}
                {selectedLead.queryMessage && (
                  <div className="p-4 rounded-xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] space-y-1 text-xs shadow-sm">
                    <p className="text-[10px] text-slate-700 dark:text-slate-400 font-bold uppercase tracking-wider">Customer Inquiry Note</p>
                    <p className="text-slate-900 dark:text-slate-300 italic font-medium leading-relaxed">"{selectedLead.queryMessage}"</p>
                  </div>
                )}

                {/* Add Activity / Call Note Box */}
                <form onSubmit={handleAddActivity} className="p-4 rounded-xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold text-slate-950 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Activity size={13} className="text-crm-blue" /> Log Call / Follow-up Note
                    </p>
                    <select
                      className="input text-xs w-32 py-1 font-bold"
                      value={activityType}
                      onChange={(e) => setActivityType(e.target.value as any)}
                    >
                      <option value="call">Phone Call</option>
                      <option value="note">Internal Note</option>
                      <option value="email">Email Sent</option>
                      <option value="meeting">Meeting</option>
                    </select>
                  </div>

                  <textarea
                    className="input text-xs w-full min-h-[70px] resize-none"
                    placeholder={
                      activityType === 'email'
                        ? 'Type message to send directly to customer email...'
                        : 'Enter discussion notes, customer objections, or next steps...'
                    }
                    value={activityNote}
                    onChange={(e) => setActivityNote(e.target.value)}
                    required
                  />

                  {activityType === 'email' && (
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-100 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042] text-xs">
                      {user?.role === 'super_admin' ? (
                        <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300 font-medium">
                          <input
                            type="checkbox"
                            checked={sendDirectEmail}
                            onChange={(e) => setSendDirectEmail(e.target.checked)}
                            className="rounded border-slate-200 dark:border-[#2A3042] text-crm-blue"
                          />
                          <span>Send email to: <strong className="text-teal-700 dark:text-crm-teal font-bold">{selectedLead.customerEmail || 'No email attached'}</strong></span>
                        </label>
                      ) : (
                        <span className="text-slate-600 dark:text-slate-400 italic">
                          Outbound emailing is authorized for <strong>Super Admin</strong> only. This note will be recorded internally.
                        </span>
                      )}
                      <span className="text-[10px] text-slate-600 dark:text-slate-400 font-medium">From: {user?.email || 'System Email Account'}</span>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={submittingActivity || (activityType === 'email' && user?.role === 'super_admin' && sendDirectEmail && !selectedLead.customerEmail)}
                      className="btn-primary text-xs gap-1.5 px-4 shadow-glow-blue font-bold"
                    >
                      <Send size={13} /> {submittingActivity ? 'Saving...' : (activityType === 'email' && user?.role === 'super_admin' && sendDirectEmail) ? 'Send Email to Client' : 'Add Note to Timeline'}
                    </button>
                  </div>
                </form>

                {/* Activity History Timeline */}
                <div className="space-y-3">
                  <p className="text-[11px] font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Activity History</p>
                  {selectedLead.activities && selectedLead.activities.length > 0 ? (
                    <div className="space-y-2.5">
                      {selectedLead.activities.map((act) => (
                        <div
                          key={act.id}
                          className="p-3 rounded-xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] text-xs space-y-1 shadow-sm"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-950 dark:text-white capitalize flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-crm-blue" />
                              {act.type}: {act.title}
                            </span>
                            <span className="text-[10px] text-slate-600 dark:text-slate-400 font-mono font-bold">
                              {format(new Date(act.createdAt), 'dd MMM, HH:mm')}
                            </span>
                          </div>
                          {act.description && (
                            <p className="text-slate-800 dark:text-slate-300 text-[11px] pl-3 border-l-2 border-slate-300 dark:border-[#2A3042] font-medium">
                              {act.description}
                            </p>
                          )}
                          <p className="text-[10px] text-slate-600 dark:text-slate-400 text-right font-medium">
                            By {act.performedBy?.name || 'Representative'}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-slate-600 text-xs border border-dashed border-slate-300 dark:border-[#2A3042] rounded-xl font-medium">
                      No activities logged yet.
                    </div>
                  )}
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="p-4 border-t border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex justify-between items-center">
                <button
                  onClick={() => setSelectedLead(null)}
                  className="btn bg-white dark:bg-white/5 border border-slate-300 dark:border-white/10 text-slate-800 dark:text-white text-xs font-bold px-4 py-2"
                >
                  Close
                </button>
                <a
                  href={`/quotations?leadId=${selectedLead.id}`}
                  className="btn bg-crm-amber hover:bg-crm-amber-hover text-black font-bold text-xs gap-1.5 shadow-glow-amber px-4 py-2"
                >
                  <FileText size={14} /> Create Quotation
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL: Manual Add Lead ──────────────────────────────────────── */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-auto"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230]">
                <h2 className="text-base font-bold text-slate-950 dark:text-white flex items-center gap-2">
                  <Plus size={16} className="text-crm-blue" /> Create New Lead Manually
                </h2>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="w-7 h-7 rounded-lg hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white flex items-center justify-center"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateLeadSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Contact Name *</label>
                    <input
                      className="input text-xs"
                      placeholder="Enter contact name"
                      value={newLead.customerName}
                      onChange={(e) => setNewLead({ ...newLead, customerName: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Mobile Number *</label>
                    <input
                      className="input text-xs font-mono"
                      placeholder="Enter phone number"
                      value={newLead.customerPhone}
                      onChange={(e) => setNewLead({ ...newLead, customerPhone: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Company Name</label>
                    <input
                      className="input text-xs"
                      placeholder="Enter company name"
                      value={newLead.companyName}
                      onChange={(e) => setNewLead({ ...newLead, companyName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Email Address</label>
                    <input
                      type="email"
                      className="input text-xs"
                      placeholder="contact@company.com"
                      value={newLead.customerEmail}
                      onChange={(e) => setNewLead({ ...newLead, customerEmail: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">System Category</label>
                    <input
                      className="input text-xs"
                      placeholder="Enter category or system type"
                      value={newLead.productCategory}
                      onChange={(e) => setNewLead({ ...newLead, productCategory: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Est. Deal Value (₹)</label>
                    <input
                      type="number"
                      className="input text-xs"
                      placeholder="0.00"
                      value={newLead.estimatedValue || ''}
                      onChange={(e) =>
                        setNewLead({ ...newLead, estimatedValue: parseFloat(e.target.value) || 0 })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Urgency Level</label>
                    <select
                      className="input text-xs font-medium"
                      value={newLead.urgency}
                      onChange={(e) => setNewLead({ ...newLead, urgency: e.target.value })}
                    >
                      <option value="urgent">Urgent (Immediate Procurement)</option>
                      <option value="standard">Standard (Next 1-2 Weeks)</option>
                      <option value="planning">Planning (Budgeting / Future)</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">City / Location</label>
                    <input
                      className="input text-xs"
                      placeholder="Enter city or location"
                      value={newLead.city}
                      onChange={(e) => setNewLead({ ...newLead, city: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Requirement Notes</label>
                  <textarea
                    className="input text-xs w-full min-h-[60px] resize-none"
                    placeholder="Enter notes or requirement specifications..."
                    value={newLead.queryMessage}
                    onChange={(e) => setNewLead({ ...newLead, queryMessage: e.target.value })}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#2A3042]">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="btn-ghost text-xs"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary text-xs px-5 shadow-glow-blue">
                    Create Lead
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL: Bulk Import Excel / CSV ───────────────────────────────── */}
      <AnimatePresence>
        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-crm-violet/20 border border-crm-violet/30 flex items-center justify-center text-crm-violet">
                    <FileSpreadsheet size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-950 dark:text-white">Bulk Lead Import (Excel / CSV)</h2>
                    <p className="text-xs text-slate-400">
                      Upload sales lists or trade show inquiries with automatic 30-day de-duplication & round-robin assignment
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowImportModal(false)}
                  className="w-8 h-8 rounded-lg hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white flex items-center justify-center"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-5 flex-1">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="md:col-span-2 border-2 border-dashed border-slate-200 dark:border-[#2A3042] hover:border-crm-violet rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-50 dark:bg-[#0F1117]/50 hover:bg-crm-violet/5 transition-all text-center"
                  >
                    <Upload size={28} className="text-crm-violet" />
                    <div>
                      <p className="text-sm font-bold text-slate-950 dark:text-white">
                        {fileName ? fileName : 'Click to browse or drag & drop spreadsheet'}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">Supports .CSV, .XLSX, .XLS files (up to 50MB)</p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv, .xlsx, .xls, text/csv"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </div>

                  <div className="flex flex-col gap-2 justify-center bg-slate-50 dark:bg-[#1E2230] p-4 rounded-xl border border-slate-200 dark:border-[#2A3042]">
                    <button
                      onClick={handleLoadSampleLeads}
                      className="btn bg-crm-violet/20 hover:bg-crm-violet/30 text-crm-violet-light text-xs justify-center py-2.5"
                    >
                      <Plus size={14} /> Load Sample Trade Show Leads
                    </button>
                    <button
                      onClick={() => {
                        const csv = Papa.unparse(SAMPLE_LEADS);
                        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.setAttribute('download', 'jsnc_leads_template.csv');
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                      className="btn-ghost text-xs justify-center py-2 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white border border-slate-200 dark:border-[#2A3042]"
                    >
                      <Download size={13} /> Download Template CSV
                    </button>
                  </div>
                </div>

                {importResult && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-xl bg-green-500/10 border border-green-500/30 flex items-start gap-3"
                  >
                    <CheckCircle2 size={20} className="text-green-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-green-400">Leads Successfully Imported!</h4>
                      <p className="text-xs text-slate-300 mt-1">
                        Created <strong>{importResult.importedCount} new leads</strong> with round-robin assignment and audit history logs.
                      </p>
                    </div>
                  </motion.div>
                )}

                {parsedPreviewRows.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Spreadsheet Preview ({parsedPreviewRows.length} Rows Evaluated)
                      </h3>
                      <span className="text-xs text-crm-teal font-mono">
                        {selectedRowIndices.length} Rows Selected for Commit
                      </span>
                    </div>

                    <div className="table-wrapper max-h-60 overflow-y-auto">
                      <table className="crm-table text-xs">
                        <thead>
                          <tr>
                            <th>Contact</th>
                            <th>Phone</th>
                            <th>Company</th>
                            <th>Product Interest</th>
                            <th>Est. Value</th>
                            <th>30-Day Duplicate?</th>
                            <th>Auto-Assigned Rep</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedPreviewRows.map((r, i) => (
                            <tr key={i}>
                              <td className="font-bold text-slate-950 dark:text-white">{r.customerName}</td>
                              <td className="font-mono text-crm-teal">{r.customerPhone}</td>
                              <td className="text-slate-300">{r.companyName || '—'}</td>
                              <td className="text-slate-300">{r.productCategory || '—'}</td>
                              <td className="text-crm-amber font-mono">
                                ₹{(r.estimatedValue || 0).toLocaleString('en-IN')}
                              </td>
                              <td>
                                {r.isDuplicate ? (
                                  <span className="px-1.5 py-0.5 rounded bg-crm-coral/20 text-crm-coral text-[10px] font-bold">
                                    Duplicate Detected
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 text-[10px] font-bold">
                                    Unique Lead
                                  </span>
                                )}
                              </td>
                              <td className="text-slate-300 font-mono text-[11px]">
                                {r.assignedToName || 'Round-Robin (Sales Rep)'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-between">
                <button onClick={() => setShowImportModal(false)} className="btn-ghost text-xs">
                  Close
                </button>
                <button
                  onClick={handleCommitImport}
                  disabled={parsedPreviewRows.length === 0 || importing}
                  className="btn-primary text-xs px-6 shadow-glow-blue"
                >
                  {importing ? 'Importing...' : `Commit ${selectedRowIndices.length} Leads to Pipeline`}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL: Web-to-Lead Link & Embed Code ─────────────────────────── */}
      <AnimatePresence>
        {showShareModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
            >
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#2A3042] pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-crm-teal/20 text-crm-teal flex items-center justify-center">
                      <Link2 size={18} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-950 dark:text-white">Public Web-to-Lead Form</h3>
                      <p className="text-xs text-slate-400">Share or embed customer quotation intake forms</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowShareModal(false)}
                    className="w-7 h-7 rounded-lg hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white flex items-center justify-center"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="label">Direct Customer Link</label>
                    <div className="flex gap-2">
                      <input
                        className="input text-xs font-mono flex-1 text-slate-300 bg-slate-50 dark:bg-[#0F1117]"
                        value={publicUrl}
                        readOnly
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(publicUrl);
                          setCopiedLink(true);
                          setTimeout(() => setCopiedLink(false), 2000);
                        }}
                        className="btn-primary text-xs px-3 gap-1"
                      >
                        {copiedLink ? <Check size={13} /> : <Copy size={13} />}
                        {copiedLink ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="label">Embed Snippet (iFrame for your website)</label>
                    <div className="flex gap-2">
                      <input
                        className="input text-xs font-mono flex-1 text-slate-300 bg-slate-50 dark:bg-[#0F1117]"
                        value={embedCode}
                        readOnly
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(embedCode);
                          setCopiedEmbed(true);
                          setTimeout(() => setCopiedEmbed(false), 2000);
                        }}
                        className="btn-ghost text-xs px-3 gap-1 border border-slate-200 dark:border-[#2A3042]"
                      >
                        {copiedEmbed ? <Check size={13} /> : <Copy size={13} />}
                        {copiedEmbed ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button onClick={() => setShowShareModal(false)} className="btn-primary text-xs px-5">
                    Done
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Share Lead Modal */}
        {shareLeadModalOpen && selectedLead && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl shadow-2xl p-6 space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#2A3042]">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-crm-blue-light">
                    <Share2 size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-950 dark:text-white">Share Lead with Teammate</h3>
                    <p className="text-[11px] text-slate-500 font-mono">{selectedLead.leadNumber} — {selectedLead.customerName}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShareLeadModalOpen(false)}
                  className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <label className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  Select Sales Representative
                </label>
                <select
                  value={shareTargetUserId}
                  onChange={(e) => setShareTargetUserId(e.target.value)}
                  className="w-full input text-xs bg-slate-50 dark:bg-[#0F1117] text-slate-300 border-slate-300 dark:border-[#2A3042]"
                >
                  <option value="">-- Choose Sales Teammate --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.employeeCode} - {emp.role})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 italic">
                  Sharing grants full read and collaboration access on this lead to the selected sales representative.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#2A3042]">
                <button
                  onClick={() => setShareLeadModalOpen(false)}
                  className="btn-ghost text-xs px-4"
                >
                  Cancel
                </button>
                <button
                  onClick={handleShareLead}
                  disabled={!shareTargetUserId || sharingLead}
                  className="btn-primary text-xs px-5 gap-1.5 font-bold"
                >
                  <Share2 size={13} /> {sharingLead ? 'Sharing...' : 'Confirm Share'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Lead Setup & Real-time Flow Controller Modal */}
        <LeadSetupModal
          isOpen={leadSetupModalOpen}
          onClose={() => setLeadSetupModalOpen(false)}
          initialTab={leadSetupInitialTab}
          onLeadCreated={fetchLeads}
        />
      </AnimatePresence>
    </div>
  );
}
