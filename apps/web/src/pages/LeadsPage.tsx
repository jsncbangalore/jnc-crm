import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Plus,
  Upload,
  RefreshCw,
  Building2,
  Sliders,
  HelpCircle,
  FileSpreadsheet,
  AlertTriangle,
  Flame,
  LayoutGrid,
  List,
  Check,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';
import { leadsApi, usersApi } from '../services/api';
import { Lead, LeadStatus, User as UserType } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { usePopup } from '../contexts/PopupContext';
import { ErrorStateCard, parseApiError } from '../components/common/ErrorStateCard';
import { CompactLeadCard, formatIndianCurrency } from '../components/leads/CompactLeadCard';
import { LeadDrawer } from '../components/leads/LeadDrawer';
import { LeadLostReasonModal } from '../components/leads/LeadLostReasonModal';
import { LeadsSummaryStrip, LeadsSummaryData } from '../components/leads/LeadsSummaryStrip';
import { LeadsFilterRow } from '../components/leads/LeadsFilterRow';
import { LeadsTableView } from '../components/leads/LeadsTableView';
import { ClientDirectoryView } from '../components/leads/ClientDirectoryView';
import { ImportLeadsModal } from '../components/leads/ImportLeadsModal';
import CreateLeadModal from '../components/leads/CreateLeadModal';
import LeadSetupModal, { LeadSetupView } from '../components/leads/LeadSetupModal';
import { format } from 'date-fns';

export interface StageConfig {
  id: LeadStatus;
  label: string;
  color: string;
  headerBorder: string;
  badgeBg: string;
}

export const STAGES_CONFIG: StageConfig[] = [
  {
    id: 'new',
    label: 'New Inquiries',
    color: '#2E5EFF',
    headerBorder: 'border-t-[#2E5EFF]',
    badgeBg: 'bg-[#2E5EFF]/15 text-[#2E5EFF]',
  },
  {
    id: 'contacted',
    label: 'Contacted',
    color: '#8B5CF6',
    headerBorder: 'border-t-[#8B5CF6]',
    badgeBg: 'bg-[#8B5CF6]/15 text-[#8B5CF6]',
  },
  {
    id: 'qualified',
    label: 'Qualified Requirement',
    color: '#00D2B4',
    headerBorder: 'border-t-[#00D2B4]',
    badgeBg: 'bg-[#00D2B4]/15 text-[#00D2B4]',
  },
  {
    id: 'quoted',
    label: 'Quoted / Proposal Sent',
    color: '#FFB020',
    headerBorder: 'border-t-[#FFB020]',
    badgeBg: 'bg-[#FFB020]/15 text-[#FFB020]',
  },
  {
    id: 'won',
    label: 'Won / Closed',
    color: '#10B981',
    headerBorder: 'border-t-[#10B981]',
    badgeBg: 'bg-[#10B981]/15 text-[#10B981]',
  },
  {
    id: 'lost',
    label: 'Lost / Closed',
    color: '#EF4444',
    headerBorder: 'border-t-[#EF4444]',
    badgeBg: 'bg-[#EF4444]/15 text-[#EF4444]',
  },
];

export default function LeadsPage() {
  const { user } = useAuth();
  const { showAlert } = usePopup();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Active Main Tab: Pipeline vs Client Directory vs Lead Setup
  const [activeTab, setActiveTab] = useState<'pipeline' | 'client-directory' | 'lead-setup'>('pipeline');

  // URL state persistence (Requirement 3 & 6)
  const initialView = (searchParams.get('view') as 'kanban' | 'list') || 'kanban';
  const initialDensity = (searchParams.get('density') as 'compact' | 'comfortable') || 'compact';
  const initialSource = searchParams.get('source') || 'all';
  const initialUrgency = searchParams.get('urgency') || 'all';
  const initialSearch = searchParams.get('search') || '';

  // Sales rep default: 'My leads' for sales role, 'All' for admins; persisted in localStorage
  const defaultRep = useMemo(() => {
    const saved = localStorage.getItem('crm_leads_sales_rep_filter');
    if (saved) return saved;
    if (user?.role === 'sales' || user?.role === 'employee') return user.id || 'all';
    return 'all';
  }, [user]);

  const initialAssignedTo = searchParams.get('assignedToId') || defaultRep;

  const [view, setView] = useState<'kanban' | 'list'>(initialView);
  const [density, setDensity] = useState<'compact' | 'comfortable'>(initialDensity);
  const [search, setSearch] = useState<string>(initialSearch);
  const [sourceFilter, setSourceFilter] = useState<string>(initialSource);
  const [urgencyFilter, setUrgencyFilter] = useState<string>(initialUrgency);
  const [assignedToId, setAssignedToId] = useState<string>(initialAssignedTo);
  const [summaryBoxFilter, setSummaryBoxFilter] = useState<string | null>(null);

  // Board Data state
  const [boardData, setBoardData] = useState<{
    summary: LeadsSummaryData;
    stages: Record<string, { id: string; label: string; count: number; totalValue: number; cards: Lead[]; hasMore: boolean; totalCards: number }>;
    sources: string[];
    salesReps: UserType[];
  }>({
    summary: { totalLeads: 0, newToday: 0, urgentCount: 0, pipelineValue: 0, winRate: 0, followUpsDueToday: 0 },
    stages: {
      new: { id: 'new', label: 'New Inquiries', count: 0, totalValue: 0, cards: [], hasMore: false, totalCards: 0 },
      contacted: { id: 'contacted', label: 'Contacted', count: 0, totalValue: 0, cards: [], hasMore: false, totalCards: 0 },
      qualified: { id: 'qualified', label: 'Qualified Requirement', count: 0, totalValue: 0, cards: [], hasMore: false, totalCards: 0 },
      quoted: { id: 'quoted', label: 'Quoted / Proposal Sent', count: 0, totalValue: 0, cards: [], hasMore: false, totalCards: 0 },
      won: { id: 'won', label: 'Won / Closed', count: 0, totalValue: 0, cards: [], hasMore: false, totalCards: 0 },
      lost: { id: 'lost', label: 'Lost / Closed', count: 0, totalValue: 0, cards: [], hasMore: false, totalCards: 0 },
    },
    sources: ['manual', 'web', 'whatsapp', 'indiamart', 'facebook_lead_ads', 'instagram_lead_ads'],
    salesReps: [],
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [updatedTime, setUpdatedTime] = useState<string>(() => format(new Date(), 'HH:mm'));
  const [apiError, setApiError] = useState<{ status?: number; message: string; isNetworkError: boolean; refId?: string } | null>(null);

  // Drag and drop state
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  // Collapsed column hover/click override
  const [expandedColumns, setExpandedColumns] = useState<Record<string, boolean>>({});

  // Mobile/tablet active stage tab (< 1024px)
  const [activeStageTab, setActiveStageTab] = useState<LeadStatus>('new');

  // Drawer state (Requirement 6)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const hasInitializedDeepLead = useRef(false);

  const handleCloseDrawer = useCallback(() => {
    setSelectedLead(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('lead');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Lost Reason Modal state (Requirement 8)
  const [lostModalLead, setLostModalLead] = useState<Lead | null>(null);
  const [isLostModalOpen, setIsLostModalOpen] = useState<boolean>(false);

  // Create Lead & Import Modals
  const [showCreateLeadModal, setShowCreateLeadModal] = useState<boolean>(false);
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [setupModalView, setSetupModalView] = useState<'indiamart' | 'website' | 'whatsapp' | 'routing' | 'pipeline' | null>(null);

  // Window width tracking for responsive column rendering (< 1280px merged closed, < 1024px tabs)
  const [windowWidth, setWindowWidth] = useState<number>(() => (typeof window !== 'undefined' ? window.innerWidth : 1366));

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Update URL search parameters when filters change
  const updateUrlParams = useCallback(() => {
    const params = new URLSearchParams();
    if (view !== 'kanban') params.set('view', view);
    if (density !== 'compact') params.set('density', density);
    if (search) params.set('search', search);
    if (sourceFilter !== 'all') params.set('source', sourceFilter);
    if (urgencyFilter !== 'all') params.set('urgency', urgencyFilter);
    if (assignedToId !== 'all') params.set('assignedToId', assignedToId);
    if (selectedLead?.id) params.set('lead', selectedLead.id);
    setSearchParams(params, { replace: true });
  }, [view, density, search, sourceFilter, urgencyFilter, assignedToId, selectedLead, setSearchParams]);

  useEffect(() => {
    updateUrlParams();
  }, [updateUrlParams]);

  // Fetch Pipeline Board Data in One Fast Request (Requirement 2 & 9)
  const fetchBoardData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setRefreshing(true);
    setApiError(null);

    try {
      const res = await leadsApi.getPipelineBoard({
        source: sourceFilter,
        urgency: urgencyFilter,
        assignedToId: assignedToId,
        search: search.trim() || undefined,
      });

      setBoardData(res.data);
      setUpdatedTime(format(new Date(), 'HH:mm'));

      // If deep link has ?lead=<id>, open that lead once on initialization
      if (!hasInitializedDeepLead.current) {
        hasInitializedDeepLead.current = true;
        const deepLeadId = searchParams.get('lead');
        if (deepLeadId) {
          for (const st of Object.values(res.data.stages as Record<string, any>)) {
            const found = (st.cards as Lead[]).find((c) => c.id === deepLeadId);
            if (found) {
              setSelectedLead(found);
              break;
            }
          }
        }
      }
    } catch (err: any) {
      const parsed = parseApiError(err);
      setApiError({
        status: err?.response?.status,
        message: parsed.message || 'Failed to load lead pipeline.',
        isNetworkError: !err?.response,
        refId: parsed.referenceId,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sourceFilter, urgencyFilter, assignedToId, search, searchParams, selectedLead]);

  useEffect(() => {
    fetchBoardData();
  }, [fetchBoardData]);

  // Handle stage move (Drag & Drop and Keyboard/Menu 'Move to...')
  const handleStageTransition = async (lead: Lead, targetStatus: LeadStatus) => {
    if (lead.status === targetStatus) return;

    // Rule 1: Moving to 'lost' requires reason modal (Requirement 8)
    if (targetStatus === 'lost') {
      setLostModalLead(lead);
      setIsLostModalOpen(true);
      return;
    }

    // Rule 2: Moving to 'quoted' opens create quotation prefilled (Requirement 8)
    if (targetStatus === 'quoted') {
      // Optimistic update
      applyOptimisticMove(lead.id, targetStatus);
      try {
        await leadsApi.updateStatus(lead.id, { status: targetStatus });
        showAlert('Proposal Initiated', `Lead moved to Quoted. Opening quotation builder...`);
        navigate(`/quotations?action=create&leadId=${lead.id}&customerName=${encodeURIComponent(lead.customerName)}&phone=${encodeURIComponent(lead.customerPhone || '')}&email=${encodeURIComponent(lead.customerEmail || '')}`);
      } catch (err: any) {
        revertOptimisticMove(lead.id, lead.status);
        showAlert('Error', 'Failed to update lead status: ' + (err?.response?.data?.message || err.message));
      }
      return;
    }

    // Rule 3: Moving to 'won' offers 'Convert to order' if quotation exists
    if (targetStatus === 'won') {
      applyOptimisticMove(lead.id, targetStatus);
      try {
        await leadsApi.updateStatus(lead.id, { status: targetStatus });
        if (lead.quotations && lead.quotations.length > 0) {
          showAlert('Lead Won!', `Congratulations! Lead converted. Would you like to create an order now?`);
        }
      } catch (err: any) {
        revertOptimisticMove(lead.id, lead.status);
        showAlert('Error', 'Failed to update lead status: ' + (err?.response?.data?.message || err.message));
      }
      return;
    }

    // Standard stage move with optimistic update & rollback
    applyOptimisticMove(lead.id, targetStatus);
    try {
      await leadsApi.updateStatus(lead.id, { status: targetStatus });
    } catch (err: any) {
      revertOptimisticMove(lead.id, lead.status);
      showAlert('Error', 'Failed to update lead status: ' + (err?.response?.data?.message || err.message));
    }
  };

  // Optimistic Move helper
  const applyOptimisticMove = (leadId: string, newStatus: LeadStatus) => {
    setBoardData((prev) => {
      const nextStages = { ...prev.stages };
      let movedCard: Lead | null = null;
      let fromStage: string | null = null;

      for (const [stKey, stVal] of Object.entries(nextStages)) {
        const idx = stVal.cards.findIndex((c) => c.id === leadId);
        if (idx !== -1) {
          movedCard = { ...stVal.cards[idx], status: newStatus };
          fromStage = stKey;
          stVal.cards.splice(idx, 1);
          stVal.count = Math.max(0, stVal.count - 1);
          stVal.totalValue = Math.max(0, stVal.totalValue - Number(movedCard.estimatedValue || 0));
          break;
        }
      }

      if (movedCard && nextStages[newStatus]) {
        nextStages[newStatus].cards.unshift(movedCard);
        nextStages[newStatus].count += 1;
        nextStages[newStatus].totalValue += Number(movedCard.estimatedValue || 0);
      }

      return { ...prev, stages: nextStages };
    });
  };

  // Revert helper on failure
  const revertOptimisticMove = (leadId: string, originalStatus: LeadStatus) => {
    fetchBoardData(true);
  };

  // Lost Modal Confirm Submission
  const handleLostReasonSubmit = async (leadId: string, reason: string, note?: string) => {
    applyOptimisticMove(leadId, 'lost');
    try {
      await leadsApi.updateStatus(leadId, {
        status: 'lost',
        lostReason: reason,
        note,
      });
      fetchBoardData(true);
    } catch (err: any) {
      fetchBoardData(true);
      throw err;
    }
  };

  // Quick action: schedule follow-up
  const handleScheduleFollowUp = async (lead: Lead, dateStr: string) => {
    try {
      await leadsApi.update(lead.id, {
        nextFollowUpAt: new Date(dateStr).toISOString(),
      });
      showAlert('Success', `Follow-up scheduled for ${dateStr}`);
      fetchBoardData(true);
    } catch (err: any) {
      showAlert('Error', 'Failed to schedule follow-up: ' + (err?.response?.data?.message || err.message));
    }
  };

  // Quick action: create quote
  const handleCreateQuote = (lead: Lead) => {
    navigate(`/quotations?action=create&leadId=${lead.id}&customerName=${encodeURIComponent(lead.customerName)}&phone=${encodeURIComponent(lead.customerPhone || '')}&email=${encodeURIComponent(lead.customerEmail || '')}`);
  };

  // Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStage !== stageId) setDragOverStage(stageId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetStageId: LeadStatus) => {
    e.preventDefault();
    setDragOverStage(null);
    const leadId = e.dataTransfer.getData('text/plain') || draggedLeadId;
    if (!leadId) return;

    // Find the lead card
    let droppedLead: Lead | null = null;
    for (const st of Object.values(boardData.stages)) {
      const found = st.cards.find((c) => c.id === leadId);
      if (found) {
        droppedLead = found;
        break;
      }
    }

    if (droppedLead) {
      handleStageTransition(droppedLead, targetStageId);
    }
    setDraggedLeadId(null);
  };

  // Combined flat list for Table View and Client Directory
  const allCardsList = useMemo(() => {
    const list: Lead[] = [];
    for (const st of STAGES_CONFIG) {
      if (boardData.stages[st.id]?.cards) {
        list.push(...boardData.stages[st.id].cards);
      }
    }
    return list;
  }, [boardData]);

  // Apply summary strip quick filters
  const filteredBoardStages = useMemo(() => {
    if (!summaryBoxFilter || summaryBoxFilter === 'all') return boardData.stages;

    const filtered: typeof boardData.stages = {};
    for (const [stKey, stVal] of Object.entries(boardData.stages)) {
      filtered[stKey] = {
        ...stVal,
        cards: stVal.cards.filter((lead) => {
          if (summaryBoxFilter === 'new_today') {
            return lead.createdAt && new Date(lead.createdAt) >= new Date(new Date().setHours(0, 0, 0, 0));
          }
          if (summaryBoxFilter === 'urgent') {
            return lead.urgency === 'urgent' || lead.urgency === 'high';
          }
          if (summaryBoxFilter === 'followup_today') {
            return lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) <= new Date(new Date().setHours(23, 59, 59, 999));
          }
          return true;
        }),
      };
    }
    return filtered;
  }, [boardData.stages, summaryBoxFilter]);

  // Can import check
  const canImport = user?.role === 'tenant_admin' || user?.role === 'admin' || user?.role === 'sub_admin';

  const handleSummaryFilterSelect = (filterKey: string | null) => {
    if (!filterKey || filterKey === summaryBoxFilter) {
      setSummaryBoxFilter('all');
      if (urgencyFilter === 'urgent') setUrgencyFilter('all');
    } else {
      setSummaryBoxFilter(filterKey);
      if (filterKey === 'urgent') {
        setUrgencyFilter('urgent');
      } else if (filterKey === 'all') {
        setUrgencyFilter('all');
        setSourceFilter('all');
      }
    }
  };

  return (
    <div className="h-[calc(100vh-theme(spacing.16))] max-h-[calc(100vh-theme(spacing.16))] flex flex-col overflow-hidden bg-slate-50 dark:bg-[#0F1117] select-none text-slate-900 dark:text-white">
      {/* ─── 1. TOP ROW (~40px, One Line) (Requirement 2) ────────────────── */}
      <div className="h-10 px-3 border-b border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#181B26] flex items-center justify-between gap-3 shrink-0 select-none">
        {/* Title, Main Tabs & Summary Strip */}
        <div className="flex items-center gap-3 overflow-hidden">
          <h1 className="text-sm font-bold text-slate-900 dark:text-white shrink-0 tracking-tight">
            Leads
          </h1>

          {/* Tabs: Pipeline and Directory */}
          <div className="flex items-center bg-slate-100 dark:bg-[#1E2230] p-0.5 rounded-lg border border-slate-200 dark:border-[#2A3042] shrink-0 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('pipeline')}
              className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                activeTab === 'pipeline'
                  ? 'bg-white dark:bg-crm-blue text-crm-blue dark:text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Pipeline</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 dark:bg-black/20 font-mono">
                {boardData.summary.totalLeads}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('client-directory')}
              className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                activeTab === 'client-directory'
                  ? 'bg-white dark:bg-crm-blue text-crm-blue dark:text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Directory</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 dark:bg-black/20 font-mono">
                {boardData.summary.totalLeads}
              </span>
            </button>
          </div>

          {/* Strip of Compact Clickable Summary Boxes */}
          <div className="hidden md:block overflow-hidden">
            <LeadsSummaryStrip
              summary={boardData.summary}
              activeFilter={summaryBoxFilter}
              onSelectFilter={handleSummaryFilterSelect}
            />
          </div>
        </div>

        {/* Right Side Buttons: Import leads, + New lead */}
        <div className="flex items-center gap-2 shrink-0">
          {canImport && (
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="h-7 px-2.5 rounded-md border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Upload size={12} className="text-slate-500" />
              <span className="hidden sm:inline">Import leads</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowCreateLeadModal(true)}
            className="h-7 px-3 rounded-md bg-crm-blue hover:bg-crm-blue/90 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
          >
            <Plus size={13} />
            <span>New lead</span>
          </button>
        </div>
      </div>

      {/* ─── 2. FILTER ROW (~36px, One Line) (Requirement 3) ──────────────── */}
      {activeTab === 'pipeline' && (
        <LeadsFilterRow
          search={search}
          onSearchChange={setSearch}
          source={sourceFilter}
          onSourceChange={setSourceFilter}
          availableSources={boardData.sources}
          urgency={urgencyFilter}
          onUrgencyChange={setUrgencyFilter}
          assignedToId={assignedToId}
          onAssignedToIdChange={(id) => {
            setAssignedToId(id);
            localStorage.setItem('crm_leads_sales_rep_filter', id);
          }}
          salesReps={boardData.salesReps}
          view={view}
          onViewChange={setView}
          density={density}
          onDensityChange={setDensity}
          onRefresh={() => fetchBoardData(false)}
          isRefreshing={refreshing}
          updatedTime={updatedTime}
          currentUser={user}
        />
      )}

      {/* ─── 3. MAIN CONTENT: Board / Table / Directory (Requirement 1, 4, 10, 11) ── */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
        {/* Error State with Retry (Requirement 11) */}
        {apiError ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <ErrorStateCard
              status={apiError.status}
              message={apiError.message}
              isNetworkError={apiError.isNetworkError}
              referenceId={apiError.refId}
              onRetry={() => fetchBoardData(false)}
            />
          </div>
        ) : activeTab === 'client-directory' ? (
          /* Client Directory Tab */
          <ClientDirectoryView
            leads={allCardsList}
            onOpenDrawer={setSelectedLead}
            density={density}
          />
        ) : view === 'list' ? (
          /* Table View (Requirement 10) */
          <LeadsTableView
            leads={allCardsList}
            onOpenDrawer={setSelectedLead}
            onMoveToStage={handleStageTransition}
            density={density}
          />
        ) : (
          /* ─── KANBAN BOARD VIEW (Requirement 1 & 4) ────────────────────── */
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-2">
            {/* Tablet/Mobile Stages Tabs (< 1024px) (Requirement 4) */}
            {windowWidth < 1024 && (
              <div className="flex items-center gap-1 overflow-x-auto pb-2 shrink-0 no-scrollbar">
                {STAGES_CONFIG.map((st) => {
                  const isSel = activeStageTab === st.id;
                  const stData = filteredBoardStages[st.id] || { count: 0, totalValue: 0 };
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setActiveStageTab(st.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 flex items-center gap-1.5 border transition-all ${
                        isSel
                          ? `${st.badgeBg} border-current shadow-xs`
                          : 'border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#181B26] text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <span>{st.label}</span>
                      <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-black/10">
                        {stData.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Board Columns Grid (Equal columns minmax(170px, 1fr), No Page Scroll) */}
            <div
              className={`flex-1 min-h-0 w-full ${
                windowWidth < 1024
                  ? 'flex flex-col overflow-hidden'
                  : windowWidth < 1280
                  ? 'grid grid-cols-5 gap-2 overflow-hidden'
                  : 'grid grid-cols-6 gap-2 overflow-hidden'
              }`}
            >
              {windowWidth < 1024 ? (
                /* Mobile Single Active Stage Column List (< 1024px) */
                <div
                  onDragOver={(e) => handleDragOver(e, activeStageTab)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, activeStageTab)}
                  className="flex-1 min-h-0 bg-slate-100/60 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042] rounded-xl flex flex-col overflow-hidden"
                >
                  <div className="p-3 border-b border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#181B26] flex items-center justify-between shrink-0">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {STAGES_CONFIG.find((s) => s.id === activeStageTab)?.label}
                    </span>
                    <span className="font-bold text-emerald-600 text-xs">
                      {formatIndianCurrency(filteredBoardStages[activeStageTab]?.totalValue)}
                    </span>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
                    {filteredBoardStages[activeStageTab]?.cards?.length > 0 ? (
                      filteredBoardStages[activeStageTab].cards.map((lead) => (
                        <CompactLeadCard
                          key={lead.id}
                          lead={lead}
                          density={density}
                          onOpenDrawer={setSelectedLead}
                          onMoveToStage={handleStageTransition}
                          onScheduleFollowUp={handleScheduleFollowUp}
                          onCreateQuote={handleCreateQuote}
                        />
                      ))
                    ) : (
                      <div className="h-40 flex flex-col items-center justify-center text-xs text-slate-400">
                        <p>No leads in this stage</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : windowWidth < 1280 ? (
                /* Intermediate layout (1024px - 1279px): 4 individual stages + 1 merged 'Closed' column (Requirement 4) */
                <>
                  {STAGES_CONFIG.slice(0, 4).map((stage) => {
                    const stData = filteredBoardStages[stage.id] || { count: 0, totalValue: 0, cards: [] };
                    const isDropTarget = dragOverStage === stage.id;
                    const isEmpty = stData.cards.length === 0;
                    const isCollapsed = isEmpty && !isDropTarget && !expandedColumns[stage.id];

                    return (
                      <div
                        key={stage.id}
                        onDragOver={(e) => handleDragOver(e, stage.id)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, stage.id)}
                        className={`flex flex-col min-h-0 rounded-xl border transition-all duration-150 overflow-hidden ${
                          isDropTarget
                            ? 'border-crm-blue ring-2 ring-crm-blue/30 bg-blue-50/40 dark:bg-crm-blue/10'
                            : 'border-slate-200 dark:border-[#2A3042] bg-slate-100/60 dark:bg-[#141722]'
                        }`}
                      >
                        {/* Header */}
                        <div className={`p-2 bg-white dark:bg-[#181B26] border-b border-slate-200 dark:border-[#2A3042] border-t-2 ${stage.headerBorder} shrink-0`}>
                          <div className="flex items-center justify-between gap-1 leading-tight">
                            <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {stage.label}
                            </span>
                            <span className="font-mono text-[11px] font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {stData.count}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                            <span>Total Value:</span>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              {formatIndianCurrency(stData.totalValue) || '₹0'}
                            </span>
                          </div>
                        </div>

                        {/* Column Cards Container: ONLY this scrolls */}
                        <div className="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-2">
                          {stData.cards.length > 0 ? (
                            stData.cards.map((lead) => (
                              <CompactLeadCard
                                key={lead.id}
                                lead={lead}
                                density={density}
                                onOpenDrawer={setSelectedLead}
                                onMoveToStage={handleStageTransition}
                                onScheduleFollowUp={handleScheduleFollowUp}
                                onCreateQuote={handleCreateQuote}
                              />
                            ))
                          ) : (
                            <div className="h-32 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg flex flex-col items-center justify-center text-center p-2 text-slate-400 text-xs">
                              <p className="font-semibold">No leads</p>
                              <p className="text-[10px] mt-0.5">Drag cards here</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Merged 'Closed' Column (Won + Lost) (Requirement 4) */}
                  <div className="flex flex-col min-h-0 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-slate-100/60 dark:bg-[#141722] overflow-hidden">
                    <div className="p-2 bg-white dark:bg-[#181B26] border-b border-slate-200 dark:border-[#2A3042] border-t-2 border-t-slate-500 shrink-0">
                      <div className="flex items-center justify-between gap-1 leading-tight">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          Closed Leads
                        </span>
                        <span className="font-mono text-[11px] font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800">
                          {(filteredBoardStages.won?.count || 0) + (filteredBoardStages.lost?.count || 0)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                        <span>Won: {formatIndianCurrency(filteredBoardStages.won?.totalValue) || '₹0'}</span>
                        <span className="text-rose-500 font-semibold">Lost: {filteredBoardStages.lost?.count || 0}</span>
                      </div>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-3">
                      {/* Won Section */}
                      <div
                        onDragOver={(e) => handleDragOver(e, 'won')}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, 'won')}
                        className={`p-1.5 rounded-lg border ${
                          dragOverStage === 'won' ? 'border-emerald-500 bg-emerald-50/20' : 'border-slate-200 dark:border-slate-800 bg-emerald-500/5'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] font-bold text-emerald-600 mb-1 px-1">
                          <span>Won ({filteredBoardStages.won?.count || 0})</span>
                          <span>{formatIndianCurrency(filteredBoardStages.won?.totalValue) || '₹0'}</span>
                        </div>
                        <div className="space-y-2">
                          {filteredBoardStages.won?.cards?.map((lead) => (
                            <CompactLeadCard
                              key={lead.id}
                              lead={lead}
                              density={density}
                              onOpenDrawer={setSelectedLead}
                              onMoveToStage={handleStageTransition}
                              onScheduleFollowUp={handleScheduleFollowUp}
                              onCreateQuote={handleCreateQuote}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Lost Section */}
                      <div
                        onDragOver={(e) => handleDragOver(e, 'lost')}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, 'lost')}
                        className={`p-1.5 rounded-lg border ${
                          dragOverStage === 'lost' ? 'border-rose-500 bg-rose-50/20' : 'border-slate-200 dark:border-slate-800 bg-rose-500/5'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] font-bold text-rose-600 mb-1 px-1">
                          <span>Lost ({filteredBoardStages.lost?.count || 0})</span>
                          <span>{formatIndianCurrency(filteredBoardStages.lost?.totalValue) || '₹0'}</span>
                        </div>
                        <div className="space-y-2">
                          {filteredBoardStages.lost?.cards?.map((lead) => (
                            <CompactLeadCard
                              key={lead.id}
                              lead={lead}
                              density={density}
                              onOpenDrawer={setSelectedLead}
                              onMoveToStage={handleStageTransition}
                              onScheduleFollowUp={handleScheduleFollowUp}
                              onCreateQuote={handleCreateQuote}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* Full 6 Equal Columns Layout (>= 1280px) (Requirement 1 & 4) */
                STAGES_CONFIG.map((stage) => {
                  const stData = filteredBoardStages[stage.id] || { count: 0, totalValue: 0, cards: [] };
                  const isDropTarget = dragOverStage === stage.id;
                  const isEmpty = stData.cards.length === 0;
                  const isCollapsed = isEmpty && !isDropTarget && !expandedColumns[stage.id];

                  if (isCollapsed) {
                    /* Collapsed empty column to 44px strip (Requirement 4) */
                    return (
                      <div
                        key={stage.id}
                        onClick={() =>
                          setExpandedColumns({ ...expandedColumns, [stage.id]: true })
                        }
                        onDragOver={(e) => handleDragOver(e, stage.id)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, stage.id)}
                        title={`Click or drag to expand ${stage.label}`}
                        className="w-11 min-w-[44px] h-full rounded-xl border border-dashed border-slate-300 dark:border-[#2A3042] bg-slate-100/50 dark:bg-[#141722]/50 hover:bg-slate-200/60 dark:hover:bg-slate-800/40 cursor-pointer flex flex-col items-center justify-between py-3 transition-all shrink-0 select-none"
                      >
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                        <span className="text-[11px] font-bold text-slate-500 [writing-mode:vertical-rl] rotate-180 tracking-wide uppercase">
                          {stage.label}
                        </span>
                        <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-800 text-[10px] font-bold flex items-center justify-center text-slate-600 dark:text-slate-400">
                          0
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={stage.id}
                      onDragOver={(e) => handleDragOver(e, stage.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, stage.id)}
                      className={`flex flex-col min-h-0 rounded-xl border transition-all duration-150 overflow-hidden ${
                        isDropTarget
                          ? 'border-crm-blue ring-2 ring-crm-blue/30 bg-blue-50/40 dark:bg-crm-blue/10'
                          : 'border-slate-200 dark:border-[#2A3042] bg-slate-100/60 dark:bg-[#141722]'
                      }`}
                    >
                      {/* Column Header */}
                      <div className={`p-2 bg-white dark:bg-[#181B26] border-b border-slate-200 dark:border-[#2A3042] border-t-2 ${stage.headerBorder} shrink-0`}>
                        <div className="flex items-center justify-between gap-1 leading-tight">
                          <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {stage.label}
                          </span>
                          <span className="font-mono text-[11px] font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {stData.count}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                          <span>Total Value:</span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatIndianCurrency(stData.totalValue) || '₹0'}
                          </span>
                        </div>
                      </div>

                      {/* Column Cards Container: ONLY this scrolls (Requirement 1 & 4) */}
                      <div className="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-2">
                        {stData.cards.length > 0 ? (
                          stData.cards.map((lead) => (
                            <CompactLeadCard
                              key={lead.id}
                              lead={lead}
                              density={density}
                              onOpenDrawer={setSelectedLead}
                              onMoveToStage={handleStageTransition}
                              onScheduleFollowUp={handleScheduleFollowUp}
                              onCreateQuote={handleCreateQuote}
                            />
                          ))
                        ) : (
                          <div className="h-32 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg flex flex-col items-center justify-center text-center p-2 text-slate-400 text-xs">
                            <p className="font-semibold">No leads</p>
                            <p className="text-[10px] mt-0.5">Drag cards here</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── 4. RIGHT-SIDE SLIDE-OVER DRAWER (Requirement 6) ─────────────── */}
      <LeadDrawer
        lead={selectedLead}
        onClose={handleCloseDrawer}
        onUpdateLead={(updated) => {
          setSelectedLead(updated);
          fetchBoardData(true);
        }}
        salesReps={boardData.salesReps}
        onCreateQuote={handleCreateQuote}
        onConvertToOrder={(lead) => {
          showAlert('Convert to Order', `Converting quotation for ${lead.customerName} to official Sales Order...`);
        }}
      />

      {/* ─── 5. LOST REASON MODAL (Requirement 8) ────────────────────────── */}
      <LeadLostReasonModal
        isOpen={isLostModalOpen}
        lead={lostModalLead}
        onClose={() => {
          setIsLostModalOpen(false);
          setLostModalLead(null);
        }}
        onSubmit={handleLostReasonSubmit}
      />

      {/* ─── 6. CREATE LEAD MODAL ────────────────────────────────────────── */}
      {showCreateLeadModal && (
        <CreateLeadModal
          isOpen={showCreateLeadModal}
          onClose={() => setShowCreateLeadModal(false)}
          onSuccess={(newLead) => {
            setShowCreateLeadModal(false);
            showAlert('Lead Created', `Lead ${newLead.leadNumber} created successfully.`);
            fetchBoardData(false);
          }}
        />
      )}

      {/* ─── 7. IMPORT LEADS MODAL (CSV / Excel) ─────────────────────────── */}
      <ImportLeadsModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={() => {
          fetchBoardData(false);
        }}
      />

      {/* ─── 8. LEAD SETUP MODAL (Preserved Feature) ──────────────────────── */}
      {setupModalView && (
        <LeadSetupModal
          isOpen={!!setupModalView}
          onClose={() => setSetupModalView(null)}
          initialTab={setupModalView}
        />
      )}
    </div>
  );
}
