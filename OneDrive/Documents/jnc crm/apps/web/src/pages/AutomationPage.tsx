import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, Plus, RefreshCw, Mail, MessageSquare, CheckSquare,
  ArrowRight, ArrowDown, ShieldAlert, CheckCircle2, Play, Edit3, Trash2,
  X, Filter, Search, Sparkles, Layers, Sliders, BellRing, Box,
  PlusCircle, Trash, Clock, UserCheck, ArrowUp, Check
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { automationApi } from '../services/api';
import { AutomationRule, AutomationStep, AutomationStepType } from '../types';

// Trigger event definitions
const TRIGGER_EVENTS = [
  { value: 'lead_created', label: 'Lead Ingested / Created', category: 'Leads', desc: 'When a new lead arrives via IndiaMART, WhatsApp, Web, or Manual entry' },
  { value: 'lead_status_changed', label: 'Lead Status Changed', category: 'Leads', desc: 'When a lead transitions between pipeline stages (Contacted, Qualified, etc.)' },
  { value: 'followup_overdue', label: 'Lead Inactivity SLA Breach', category: 'Leads', desc: 'When a lead receives no sales activity for 24h or 48h' },
  { value: 'quotation_sent', label: 'Quotation Dispatched to Client', category: 'Quotations', desc: 'When a formal PDF quotation is generated and emailed' },
  { value: 'quotation_approved', label: 'Quotation Approved by Client', category: 'Quotations', desc: 'When a client signs off or approves a formal quotation' },
  { value: 'order_status_changed', label: 'Order Status Changed', category: 'Orders', desc: 'When order moves between processing, packed, or dispatched' },
  { value: 'order_confirmed', label: 'Order Confirmed', category: 'Orders', desc: 'When a proforma order is officially confirmed by sales' },
  { value: 'payment_received', label: 'Payment Cleared', category: 'Orders', desc: 'When advance/full payment is received and marked paid' },
  { value: 'payment_overdue', label: 'Payment Overdue SLA', category: 'Orders', desc: 'When invoice payment exceeds net terms / due date' },
  { value: 'order_dispatched', label: 'Order Dispatched / Shipped', category: 'Shipments', desc: 'When courier tracking number is assigned and goods depart' },
  { value: 'order_delivered', label: 'Order Delivered', category: 'Shipments', desc: 'When courier confirms arrival at customer premises' },
  { value: 'stock_low', label: 'Low Stock Threshold Reached', category: 'Inventory', desc: 'When SKU on-hand inventory drops below reorder point' },
  { value: 'stock_transfer_in_transit', label: 'Stock Transfer Dispatched', category: 'Inventory', desc: 'When inter-warehouse stock is dispatched and en-route' },
  { value: 'user_created', label: 'New Employee / User Created', category: 'Users', desc: 'When a new staff account is provisioned in team management' },
];

const TRIGGER_LABELS: Record<string, string> = {
  lead_created: 'Lead Created',
  lead_status_changed: 'Lead Status Changed',
  followup_overdue: 'Inactivity SLA Overdue',
  quotation_sent: 'Quotation Sent',
  quotation_approved: 'Quotation Approved',
  order_status_changed: 'Order Status Changed',
  order_confirmed: 'Order Confirmed',
  payment_received: 'Payment Cleared',
  payment_overdue: 'Payment Overdue',
  order_dispatched: 'Order Dispatched',
  order_delivered: 'Order Delivered',
  stock_low: 'Low Stock Alert',
  stock_transfer_in_transit: 'Transfer Dispatched',
  user_created: 'User Created',
};

// 6 Allowed Step Types (Strictly No WhatsApp)
const STEP_TYPE_DEFS: Record<AutomationStepType, { label: string; icon: any; color: string; borderClass: string; badgeColor: string }> = {
  send_email: {
    label: 'Send Automated Email',
    icon: Mail,
    color: 'text-crm-teal bg-crm-teal/15 border-crm-teal/30',
    borderClass: 'border-l-crm-teal',
    badgeColor: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  },
  send_sms: {
    label: 'Send SMS Notification',
    icon: MessageSquare,
    color: 'text-crm-violet-light bg-crm-violet/15 border-crm-violet/30',
    borderClass: 'border-l-crm-violet',
    badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  },
  create_in_app_task: {
    label: 'Create In-App Task for Rep',
    icon: CheckSquare,
    color: 'text-crm-amber bg-crm-amber/15 border-crm-amber/30',
    borderClass: 'border-l-crm-amber',
    badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  update_lead_field: {
    label: 'Update Record Field',
    icon: Sliders,
    color: 'text-crm-blue bg-crm-blue/15 border-crm-blue/30',
    borderClass: 'border-l-crm-blue',
    badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
  reassign_record: {
    label: 'Reassign Record Owner',
    icon: UserCheck,
    color: 'text-rose-400 bg-rose-500/15 border-rose-500/30',
    borderClass: 'border-l-rose-500',
    badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  },
  wait_then_continue: {
    label: 'Wait / Pause Execution',
    icon: Clock,
    color: 'text-indigo-400 bg-indigo-500/15 border-indigo-500/30',
    borderClass: 'border-l-indigo-500',
    badgeColor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  },
};

const OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'greater_than', label: 'greater than (>)' },
  { value: 'less_than', label: 'less than (<)' },
  { value: 'contains', label: 'contains' },
];

interface ConditionRow {
  id: string;
  field: string;
  operator: string;
  value: string;
}

interface FormStep {
  id: string;
  stepType: AutomationStepType;
  config: Record<string, any>;
}

export default function AutomationPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [metrics, setMetrics] = useState<any>({ totalRules: 0, activeRules: 0, pausedRules: 0, byActionType: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTrigger, setFilterTrigger] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'paused'>('all');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form State
  const [ruleName, setRuleName] = useState('');
  const [triggerEvent, setTriggerEvent] = useState('lead_created');
  const [conditionRows, setConditionRows] = useState<ConditionRow[]>([]);
  const [steps, setSteps] = useState<FormStep[]>([
    {
      id: 'step-1',
      stepType: 'send_email',
      config: { recipient: 'assigned_employee', subject: '', body: '' },
    },
  ]);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const [rulesRes, metricsRes] = await Promise.all([
        automationApi.getRules({
          search,
          triggerEvent: filterTrigger || undefined,
          isActive: filterStatus === 'all' ? undefined : filterStatus === 'active',
        }),
        automationApi.getMetrics(),
      ]);
      setRules(rulesRes.data);
      setMetrics(metricsRes.data);
    } catch (err) {
      console.error('Failed to load automation rules:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, [search, filterTrigger, filterStatus]);

  const handleOpenNewModal = () => {
    setEditingRule(null);
    setRuleName('');
    setTriggerEvent('lead_created');
    setConditionRows([{ id: 'c1', field: 'source', operator: 'equals', value: 'indiamart' }]);
    setSteps([
      {
        id: 'step-1',
        stepType: 'send_email',
        config: { recipient: 'assigned_employee', subject: '[Lead Alert] {{customerName}}', body: 'New lead received.' },
      },
    ]);
    setIsActive(true);
    setShowCreateModal(true);
  };

  const handleOpenEditModal = (rule: AutomationRule) => {
    setEditingRule(rule);
    setRuleName(rule.name);
    setTriggerEvent(rule.triggerEvent);
    setIsActive(rule.isActive);

    // Parse conditions
    try {
      const parsed = JSON.parse(rule.conditionJson || '{}');
      if (Array.isArray(parsed)) {
        setConditionRows(
          parsed.map((c: any, i: number) => ({
            id: `c-${i}`,
            field: c.field || '',
            operator: c.operator || 'equals',
            value: String(c.value ?? ''),
          })),
        );
      } else {
        const rows: ConditionRow[] = Object.entries(parsed).map(([k, v], i) => ({
          id: `c-${i}`,
          field: k,
          operator: 'equals',
          value: String(v ?? ''),
        }));
        setConditionRows(rows.length > 0 ? rows : []);
      }
    } catch {
      setConditionRows([]);
    }

    // Populate steps
    if (rule.steps && rule.steps.length > 0) {
      setSteps(
        rule.steps.map((s, i) => {
          let cfg: Record<string, any> = {};
          try {
            cfg = typeof s.config === 'string' ? JSON.parse(s.config) : s.config;
          } catch {}
          return {
            id: s.id || `step-${i}`,
            stepType: s.stepType,
            config: cfg,
          };
        }),
      );
    } else {
      // Legacy fallback
      let legacyCfg: Record<string, any> = {};
      try {
        legacyCfg = JSON.parse(rule.actionPayloadJson || '{}');
      } catch {}
      setSteps([
        {
          id: 'step-legacy',
          stepType: (rule.actionType as AutomationStepType) || 'send_email',
          config: legacyCfg,
        },
      ]);
    }

    setShowCreateModal(true);
  };

  // Add Step
  const handleAddStep = () => {
    setSteps((prev) => [
      ...prev,
      {
        id: `step-${Date.now()}`,
        stepType: 'create_in_app_task',
        config: { title: 'Follow-up Task', recipient: 'assigned_employee' },
      },
    ]);
  };

  // Remove Step
  const handleRemoveStep = (index: number) => {
    if (steps.length <= 1) {
      alert('A rule must have at least one step in the pipeline.');
      return;
    }
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  // Move Step Up/Down
  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= steps.length) return;
    const updated = [...steps];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    setSteps(updated);
  };

  // Update step field
  const handleUpdateStepType = (index: number, newType: AutomationStepType) => {
    setSteps((prev) => {
      const copy = [...prev];
      let initialConfig: Record<string, any> = {};
      if (newType === 'send_email') initialConfig = { recipient: 'assigned_employee', subject: '', body: '' };
      else if (newType === 'send_sms') initialConfig = { recipient: 'customer', message: '' };
      else if (newType === 'create_in_app_task') initialConfig = { recipient: 'assigned_employee', title: '', description: '' };
      else if (newType === 'update_lead_field') initialConfig = { field: 'status', value: 'Contacted' };
      else if (newType === 'reassign_record') initialConfig = { mode: 'round_robin' };
      else if (newType === 'wait_then_continue') initialConfig = { duration_hours: 24 };

      copy[index] = { ...copy[index], stepType: newType, config: initialConfig };
      return copy;
    });
  };

  const handleUpdateStepConfig = (index: number, key: string, value: any) => {
    setSteps((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        config: { ...copy[index].config, [key]: value },
      };
      return copy;
    });
  };

  // Condition Helpers
  const handleAddCondition = () => {
    setConditionRows((prev) => [...prev, { id: `c-${Date.now()}`, field: '', operator: 'equals', value: '' }]);
  };

  const handleRemoveCondition = (id: string) => {
    setConditionRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleConditionChange = (id: string, key: keyof ConditionRow, val: string) => {
    setConditionRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: val } : r)));
  };

  // Submit Rule Form
  const handleSubmitRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim()) {
      alert('Please enter a Rule Name');
      return;
    }

    setSaving(true);
    try {
      // Build condition payload
      const validConditions = conditionRows.filter((r) => r.field.trim() !== '');
      const conditionPayload =
        validConditions.length === 0
          ? '{}'
          : JSON.stringify(
              validConditions.map((c) => ({
                field: c.field.trim(),
                operator: c.operator,
                value: c.value.trim(),
              })),
            );

      const stepsPayload = steps.map((s, idx) => ({
        stepOrder: idx + 1,
        stepType: s.stepType,
        config: s.config,
      }));

      const payload = {
        name: ruleName.trim(),
        triggerEvent,
        conditionJson: conditionPayload,
        steps: stepsPayload,
        isActive,
      };

      if (editingRule) {
        await automationApi.updateRule(editingRule.id, payload);
      } else {
        await automationApi.createRule(payload);
      }

      setShowCreateModal(false);
      fetchRules();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to save automation rule');
    } finally {
      setSaving(false);
    }
  };

  // Toggle Rule Active
  const handleToggleActive = async (id: string, current: boolean) => {
    try {
      setRules((prev) => prev.map((r) => (r.id === id ? { ...r, isActive: !current } : r)));
      await automationApi.toggleRule(id, !current);
      fetchRules();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to toggle rule');
      fetchRules();
    }
  };

  // Delete Rule
  const handleDeleteRule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this automation rule?')) return;
    try {
      await automationApi.deleteRule(id);
      fetchRules();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to delete rule');
    }
  };

  if (!isAdmin) {
    return (
      <div className="card p-12 text-center max-w-xl mx-auto my-12 border-crm-coral/30">
        <ShieldAlert size={48} className="text-crm-coral mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-950 dark:text-white">Restricted Access</h2>
        <p className="text-sm text-slate-400 mt-2">
          Only System Administrators and Super Admins have permission to manage automation rules.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── HEADER & METRICS ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <span>Workflow Automation</span>
            <span>•</span>
            <span className="text-crm-teal font-semibold">Multi-Step Pipeline Engine</span>
          </div>
          <h1 className="text-2xl font-black text-slate-950 dark:text-white flex items-center gap-2">
            <Zap className="text-crm-amber" size={26} /> Automation Rules & Step Pipelines
          </h1>
          <p className="text-slate-400 text-xs mt-0.5">
            Event-driven triggers executing ordered sequences of unconditional actions
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button onClick={handleOpenNewModal} className="btn-primary text-xs gap-1.5 shadow-glow-blue">
            <Plus size={15} /> New Automation Rule
          </button>
        </div>
      </div>

      {/* ─── METRIC CARDS ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="card p-4 flex items-center gap-3 border-l-4 border-l-crm-blue">
          <div className="w-10 h-10 rounded-xl bg-crm-blue/15 text-crm-blue flex items-center justify-center font-bold">
            <Zap size={20} />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Total Rules</p>
            <p className="text-xl font-black text-slate-950 dark:text-white">{metrics.totalRules}</p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3 border-l-4 border-l-emerald-500">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center font-bold">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Active Rules</p>
            <p className="text-xl font-black text-emerald-400">{metrics.activeRules}</p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3 border-l-4 border-l-crm-teal">
          <div className="w-10 h-10 rounded-xl bg-crm-teal/15 text-crm-teal flex items-center justify-center font-bold">
            <Mail size={20} />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Email Actions</p>
            <p className="text-xl font-black text-crm-teal">{metrics.byActionType?.send_email || 0}</p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3 border-l-4 border-l-crm-amber">
          <div className="w-10 h-10 rounded-xl bg-crm-amber/15 text-crm-amber flex items-center justify-center font-bold">
            <CheckSquare size={20} />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">In-App Tasks</p>
            <p className="text-xl font-black text-crm-amber">{metrics.byActionType?.create_in_app_task || 0}</p>
          </div>
        </div>
      </div>

      {/* ─── FILTERS ──────────────────────────────────────────────────────── */}
      <div className="card p-3.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-1 min-w-[240px]">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-9 text-xs"
              placeholder="Search rules by name or trigger..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className="input text-xs max-w-[200px]"
            value={filterTrigger}
            onChange={(e) => setFilterTrigger(e.target.value)}
          >
            <option value="">All Triggers ({TRIGGER_EVENTS.length})</option>
            {TRIGGER_EVENTS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          <select
            className="input text-xs max-w-[140px]"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="paused">Paused Only</option>
          </select>
        </div>

        <button onClick={fetchRules} className="btn-ghost text-xs gap-1.5" title="Refresh">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* ─── RULES PIPELINE LIST VIEW ─────────────────────────────────────── */}
      <div className="space-y-4">
        {loading ? (
          <div className="card p-12 text-center text-slate-400">
            <RefreshCw size={24} className="animate-spin text-crm-blue mx-auto mb-2" />
            Loading automation pipeline rules...
          </div>
        ) : rules.length === 0 ? (
          <div className="card p-12 text-center text-slate-500">
            <Zap size={36} className="mx-auto mb-2 opacity-40 text-crm-amber" />
            <p className="font-semibold text-slate-300">No automation rules found</p>
            <p className="text-xs text-slate-500 mt-1">Create a new rule or clear your active filters.</p>
          </div>
        ) : (
          rules.map((rule) => {
            const ruleSteps = rule.steps && rule.steps.length > 0 ? rule.steps : [];
            const primaryType = (ruleSteps[0]?.stepType || rule.actionType || 'send_email') as AutomationStepType;
            const typeDef = STEP_TYPE_DEFS[primaryType] || STEP_TYPE_DEFS.send_email;

            let conditions: any[] = [];
            try {
              const p = JSON.parse(rule.conditionJson || '{}');
              if (Array.isArray(p)) conditions = p;
              else conditions = Object.entries(p).map(([k, v]) => ({ field: k, operator: 'equals', value: v }));
            } catch {}

            return (
              <div
                key={rule.id}
                className={`card p-5 border-l-4 ${typeDef.borderClass} hover:border-white/20 transition-all ${
                  !rule.isActive ? 'opacity-60 bg-white/[0.01]' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap pb-4 border-b border-white/5">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold border ${typeDef.color}`}
                    >
                      <Zap size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-slate-950 dark:text-white">{rule.name}</h3>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            rule.isActive
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-slate-700/50 text-slate-400 border-slate-600/30'
                          }`}
                        >
                          {rule.isActive ? 'Active Pipeline' : 'Paused'}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          ({ruleSteps.length} {ruleSteps.length === 1 ? 'Step' : 'Steps'})
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Trigger: <strong className="text-slate-200">{TRIGGER_LABELS[rule.triggerEvent] || rule.triggerEvent}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Active Toggle Switch */}
                    <div className="flex items-center gap-2 bg-white dark:bg-[#181B26] p-1.5 rounded-xl border border-white/5">
                      <span className="text-[11px] font-semibold text-slate-400 pl-1">
                        {rule.isActive ? 'Enabled' : 'Disabled'}
                      </span>
                      <button
                        onClick={() => handleToggleActive(rule.id, rule.isActive)}
                        className={`w-10 h-5 rounded-full p-0.5 transition-colors ${
                          rule.isActive ? 'bg-emerald-500' : 'bg-slate-700'
                        }`}
                        title={rule.isActive ? 'Pause Rule' : 'Activate Rule'}
                      >
                        <div
                          className={`w-4 h-4 rounded-full bg-white transition-transform ${
                            rule.isActive ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <button
                      onClick={() => handleOpenEditModal(rule)}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                      title="Edit Pipeline"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                      title="Delete Rule"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* ─── VERTICAL FLOW DIAGRAM / CHAIN ───────────────────────────────── */}
                <div className="mt-4 pt-2">
                  <div className="flex flex-col gap-2.5">
                    {/* Node 1: Trigger */}
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-crm-blue/15 text-crm-blue border border-crm-blue/30 flex items-center justify-center font-bold text-xs shrink-0">
                        1
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#141721] border border-white/5 flex-1 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Trigger:</span>
                          <span className="text-xs font-bold text-crm-blue">
                            {TRIGGER_LABELS[rule.triggerEvent] || rule.triggerEvent}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pl-3.5 py-0.5 text-slate-600">
                      <ArrowDown size={14} />
                    </div>

                    {/* Node 2: Conditions */}
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-slate-800 text-slate-400 border border-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                        2
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#141721] border border-white/5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Condition:</span>
                          {conditions.length === 0 ? (
                            <span className="text-xs text-emerald-400 font-semibold italic">Always (No Condition)</span>
                          ) : (
                            conditions.map((c, i) => (
                              <span
                                key={i}
                                className="text-[11px] font-mono bg-white/5 px-2 py-0.5 rounded border border-white/10 text-slate-300"
                              >
                                {c.field} <span className="text-crm-blue">{c.operator || '=='}</span> "{c.value}"
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Ordered Sequence of Steps */}
                    {ruleSteps.map((step, idx) => {
                      const sDef = STEP_TYPE_DEFS[step.stepType] || STEP_TYPE_DEFS.send_email;
                      const Icon = sDef.icon;
                      let cfg: Record<string, any> = {};
                      try {
                        cfg = typeof step.config === 'string' ? JSON.parse(step.config) : step.config;
                      } catch {}

                      return (
                        <React.Fragment key={step.id || idx}>
                          <div className="pl-3.5 py-0.5 text-slate-600">
                            <ArrowDown size={14} />
                          </div>

                          <div className="flex items-center gap-3">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 border ${sDef.color}`}
                            >
                              {idx + 3}
                            </div>
                            <div className="p-2.5 rounded-lg bg-[#141721] border border-white/5 flex-1 flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2.5">
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${sDef.badgeColor}`}>
                                  <Icon size={12} /> {sDef.label}
                                </span>

                                {/* Detail summary per step type */}
                                {step.stepType === 'send_email' && (
                                  <span className="text-xs text-slate-300 truncate max-w-md">
                                    "{cfg.subject || 'Automated Email'}" • To: <strong className="text-crm-teal">{cfg.recipient || cfg.to || 'Assigned Rep'}</strong>
                                  </span>
                                )}

                                {step.stepType === 'send_sms' && (
                                  <span className="text-xs text-slate-300 truncate max-w-md">
                                    "{cfg.message || cfg.body || 'SMS Notification'}" • To: <strong className="text-crm-violet-light">{cfg.recipient || 'Customer'}</strong>
                                  </span>
                                )}

                                {step.stepType === 'create_in_app_task' && (
                                  <span className="text-xs text-slate-300 truncate max-w-md">
                                    Task: "{cfg.title || 'Follow-up Task'}" • Assignee: <strong className="text-crm-amber">{cfg.recipient || 'Assigned Rep'}</strong>
                                  </span>
                                )}

                                {step.stepType === 'update_lead_field' && (
                                  <span className="text-xs text-slate-300 truncate max-w-md font-mono">
                                    Set <span className="text-crm-blue">{cfg.field}</span> = <strong className="text-white">"{cfg.value}"</strong>
                                  </span>
                                )}

                                {step.stepType === 'reassign_record' && (
                                  <span className="text-xs text-slate-300 truncate max-w-md">
                                    Mode: <strong className="text-rose-400 capitalize">{cfg.mode || 'round_robin'}</strong>
                                    {cfg.user_id ? ` (User: ${cfg.user_id})` : ' (Next Active Sales Rep)'}
                                  </span>
                                )}

                                {step.stepType === 'wait_then_continue' && (
                                  <span className="text-xs text-slate-300 truncate max-w-md flex items-center gap-1 font-mono">
                                    Pause Pipeline for <strong className="text-indigo-400">{cfg.duration_hours || cfg.durationHours || 24} hours</strong> before next step
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}

                    <div className="pl-3.5 py-0.5 text-slate-600">
                      <ArrowDown size={14} />
                    </div>

                    {/* End Node */}
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-xs shrink-0">
                        <Check size={14} />
                      </div>
                      <div className="px-3 py-1.5 rounded-lg bg-[#141721] border border-white/5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        Pipeline End
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ─── MULTI-STEP RULE BUILDER MODAL ────────────────────────────────── */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden my-auto"
            >
              <div className="p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-crm-amber/20 text-crm-amber border border-crm-amber/30 flex items-center justify-center font-bold">
                    <Zap size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-950 dark:text-white">
                      {editingRule ? 'Edit Automation Pipeline Rule' : 'New Automation Pipeline Rule'}
                    </h2>
                    <p className="text-xs text-slate-400">
                      Multi-Step Chain Execution • Trigger $\rightarrow$ Conditions $\rightarrow$ Ordered Steps
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-2 rounded-lg hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmitRule} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
                {/* 1. Rule Name & Trigger */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Rule Name *</label>
                    <input
                      className="input w-full text-xs"
                      placeholder="e.g. Inbound IndiaMART Lead: Urgent Multi-Step Followup"
                      value={ruleName}
                      onChange={(e) => setRuleName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Trigger Event *</label>
                    <select
                      className="input w-full text-xs"
                      value={triggerEvent}
                      onChange={(e) => setTriggerEvent(e.target.value)}
                      required
                    >
                      {TRIGGER_EVENTS.map((t) => (
                        <option key={t.value} value={t.value}>
                          [{t.category}] {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 2. Condition Builder */}
                <div className="space-y-2 pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      Evaluation Conditions (All Must Match)
                    </label>
                    <button
                      type="button"
                      onClick={handleAddCondition}
                      className="btn-ghost text-xs gap-1 py-1 text-crm-blue"
                    >
                      <PlusCircle size={13} /> Add Condition
                    </button>
                  </div>

                  {conditionRows.length === 0 ? (
                    <div className="p-3 bg-[#141721] rounded-lg border border-dashed border-white/10 text-xs text-slate-500 italic text-center">
                      No condition filters set — this rule will fire for EVERY matching trigger event.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {conditionRows.map((cond) => (
                        <div key={cond.id} className="flex items-center gap-2">
                          <input
                            className="input text-xs flex-1"
                            placeholder="Field name (e.g. source, status, totalAmount)"
                            value={cond.field}
                            onChange={(e) => handleConditionChange(cond.id, 'field', e.target.value)}
                          />
                          <select
                            className="input text-xs w-40"
                            value={cond.operator}
                            onChange={(e) => handleConditionChange(cond.id, 'operator', e.target.value)}
                          >
                            {OPERATORS.map((op) => (
                              <option key={op.value} value={op.value}>
                                {op.label}
                              </option>
                            ))}
                          </select>
                          <input
                            className="input text-xs flex-1"
                            placeholder="Expected value (e.g. indiamart, 50000)"
                            value={cond.value}
                            onChange={(e) => handleConditionChange(cond.id, 'value', e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveCondition(cond.id)}
                            className="p-2 text-slate-500 hover:text-red-400"
                          >
                            <Trash size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. Multi-Step Pipeline Builder */}
                <div className="space-y-3 pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                        Ordered Execution Steps
                      </label>
                      <p className="text-[11px] text-slate-400">
                        Executed strictly top-to-bottom. Pause steps will defer remaining actions.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddStep}
                      className="btn-primary text-xs gap-1 py-1 shadow-glow-blue"
                    >
                      <Plus size={13} /> Add Step
                    </button>
                  </div>

                  <div className="space-y-3">
                    {steps.map((step, idx) => {
                      const sDef = STEP_TYPE_DEFS[step.stepType] || STEP_TYPE_DEFS.send_email;

                      return (
                        <div
                          key={step.id || idx}
                          className="p-4 rounded-xl bg-[#141721] border border-white/10 space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-md bg-crm-blue text-white flex items-center justify-center font-bold text-xs">
                                {idx + 1}
                              </span>
                              <select
                                className="input text-xs font-bold text-slate-950 dark:text-white bg-slate-50 dark:bg-[#1E2230]"
                                value={step.stepType}
                                onChange={(e) => handleUpdateStepType(idx, e.target.value as AutomationStepType)}
                              >
                                {Object.entries(STEP_TYPE_DEFS).map(([val, def]) => (
                                  <option key={val} value={val}>
                                    {def.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleMoveStep(idx, 'up')}
                                disabled={idx === 0}
                                className="p-1.5 rounded hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white disabled:opacity-30"
                                title="Move Up"
                              >
                                <ArrowUp size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveStep(idx, 'down')}
                                disabled={idx === steps.length - 1}
                                className="p-1.5 rounded hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white disabled:opacity-30"
                                title="Move Down"
                              >
                                <ArrowDown size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveStep(idx)}
                                className="p-1.5 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400"
                                title="Remove Step"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>

                          {/* Dynamic Inputs Based on Step Type */}
                          {step.stepType === 'send_email' && (
                            <div className="space-y-2 pt-1">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[11px] text-slate-400">Recipient Target</label>
                                  <select
                                    className="input w-full text-xs"
                                    value={step.config.recipient || 'assigned_employee'}
                                    onChange={(e) => handleUpdateStepConfig(idx, 'recipient', e.target.value)}
                                  >
                                    <option value="assigned_employee">Assigned Sales Employee</option>
                                    <option value="admin">System Super Admin</option>
                                    <option value="customer">Lead / Customer Email</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[11px] text-slate-400">Email Subject</label>
                                  <input
                                    className="input w-full text-xs"
                                    placeholder="e.g. [Lead Alert] {{customerName}}"
                                    value={step.config.subject || ''}
                                    onChange={(e) => handleUpdateStepConfig(idx, 'subject', e.target.value)}
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="text-[11px] text-slate-400">Message Body (Supports {'{{placeholders}}'})</label>
                                <textarea
                                  className="input w-full text-xs h-16 resize-none"
                                  placeholder="Enter notification message content..."
                                  value={step.config.body || ''}
                                  onChange={(e) => handleUpdateStepConfig(idx, 'body', e.target.value)}
                                />
                              </div>
                            </div>
                          )}

                          {step.stepType === 'send_sms' && (
                            <div className="space-y-2 pt-1">
                              <div>
                                <label className="text-[11px] text-slate-400">Recipient Target</label>
                                <select
                                  className="input w-full text-xs"
                                  value={step.config.recipient || 'customer'}
                                  onChange={(e) => handleUpdateStepConfig(idx, 'recipient', e.target.value)}
                                >
                                  <option value="customer">Lead / Customer Mobile</option>
                                  <option value="assigned_employee">Assigned Employee Mobile</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-[11px] text-slate-400">SMS Text (Max 160 chars)</label>
                                <textarea
                                  className="input w-full text-xs h-16 resize-none"
                                  placeholder="e.g. Hi {{customerName}}, thanks for reaching out to JNC Network."
                                  value={step.config.message || ''}
                                  onChange={(e) => handleUpdateStepConfig(idx, 'message', e.target.value)}
                                />
                              </div>
                            </div>
                          )}

                          {step.stepType === 'create_in_app_task' && (
                            <div className="space-y-2 pt-1">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[11px] text-slate-400">Task Assignee</label>
                                  <select
                                    className="input w-full text-xs"
                                    value={step.config.recipient || 'assigned_employee'}
                                    onChange={(e) => handleUpdateStepConfig(idx, 'recipient', e.target.value)}
                                  >
                                    <option value="assigned_employee">Assigned Sales Rep</option>
                                    <option value="admin">System Admin</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[11px] text-slate-400">Task Title</label>
                                  <input
                                    className="input w-full text-xs"
                                    placeholder="e.g. Inbound Lead Followup: {{customerName}}"
                                    value={step.config.title || ''}
                                    onChange={(e) => handleUpdateStepConfig(idx, 'title', e.target.value)}
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="text-[11px] text-slate-400">Task Description</label>
                                <textarea
                                  className="input w-full text-xs h-14 resize-none"
                                  placeholder="Actionable notes for the assigned employee..."
                                  value={step.config.description || ''}
                                  onChange={(e) => handleUpdateStepConfig(idx, 'description', e.target.value)}
                                />
                              </div>
                            </div>
                          )}

                          {step.stepType === 'update_lead_field' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                              <div>
                                <label className="text-[11px] text-slate-400">Lead Field to Update</label>
                                <select
                                  className="input w-full text-xs font-mono"
                                  value={step.config.field || 'status'}
                                  onChange={(e) => handleUpdateStepConfig(idx, 'field', e.target.value)}
                                >
                                  <option value="status">status</option>
                                  <option value="urgency">urgency</option>
                                  <option value="notes">notes</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-[11px] text-slate-400">New Value</label>
                                <input
                                  className="input w-full text-xs font-mono"
                                  placeholder="e.g. Contacted, High, Followed up"
                                  value={step.config.value || ''}
                                  onChange={(e) => handleUpdateStepConfig(idx, 'value', e.target.value)}
                                />
                              </div>
                            </div>
                          )}

                          {step.stepType === 'reassign_record' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                              <div>
                                <label className="text-[11px] text-slate-400">Reassignment Strategy</label>
                                <select
                                  className="input w-full text-xs"
                                  value={step.config.mode || 'round_robin'}
                                  onChange={(e) => handleUpdateStepConfig(idx, 'mode', e.target.value)}
                                >
                                  <option value="round_robin">Round-Robin (Next Active Sales Rep)</option>
                                  <option value="specific_user">Specific Team Member ID</option>
                                </select>
                              </div>
                              {step.config.mode === 'specific_user' && (
                                <div>
                                  <label className="text-[11px] text-slate-400">Target User ID</label>
                                  <input
                                    className="input w-full text-xs font-mono"
                                    placeholder="Enter User UUID..."
                                    value={step.config.user_id || ''}
                                    onChange={(e) => handleUpdateStepConfig(idx, 'user_id', e.target.value)}
                                  />
                                </div>
                              )}
                            </div>
                          )}

                          {step.stepType === 'wait_then_continue' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                              <div>
                                <label className="text-[11px] text-slate-400">Delay Duration (Hours)</label>
                                <input
                                  type="number"
                                  min="1"
                                  className="input w-full text-xs font-mono"
                                  placeholder="e.g. 24, 48, 72"
                                  value={step.config.duration_hours || 24}
                                  onChange={(e) => handleUpdateStepConfig(idx, 'duration_hours', Number(e.target.value))}
                                />
                              </div>
                              <div className="flex items-center text-xs text-slate-400 pt-4">
                                <Clock size={14} className="text-indigo-400 mr-1.5 shrink-0" />
                                Defers subsequent pipeline steps until delay has elapsed.
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-[#2A3042]">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="btn-ghost text-xs"
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary text-xs gap-1.5 shadow-glow-blue"
                    disabled={saving}
                  >
                    <Check size={14} /> {saving ? 'Saving Pipeline...' : editingRule ? 'Update Rule' : 'Save Rule'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
