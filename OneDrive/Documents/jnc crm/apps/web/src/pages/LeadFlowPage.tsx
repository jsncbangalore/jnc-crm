import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Sliders, ArrowLeft, GitBranch, MessageSquare, BarChart3,
  Globe, Sparkles, RefreshCw, Zap
} from 'lucide-react';
import FlowStudioCanvas from '../components/flow-studio/FlowStudioCanvas';
import IndiaMartTab from '../components/flow-studio/IndiaMartTab';
import MetaWhatsAppTab from '../components/flow-studio/MetaWhatsAppTab';
import UnifiedInboxTab from '../components/flow-studio/UnifiedInboxTab';
import FlowAnalyticsTab from '../components/flow-studio/FlowAnalyticsTab';

export default function LeadFlowPage() {
  const [activeTab, setActiveTab] = useState<'builder' | 'indiamart' | 'meta' | 'inbox' | 'analytics'>('builder');

  return (
    <div className="space-y-4">
      {/* ─── CLEAN APP HEADER & TAB SWITCHER ─── */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-slate-200 dark:border-[#2A3042]">
        <div className="flex items-center gap-3">
          <NavLink
            to="/leads"
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors"
            title="Return to Pipeline"
          >
            <ArrowLeft size={16} />
          </NavLink>

          <div>
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-lg bg-crm-teal/15 text-crm-teal">
                <Sliders size={16} />
              </span>
              <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
                Start Setup &amp; Flow Studio
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-crm-teal/15 text-crm-teal border border-crm-teal/30">
                Visual Automator &amp; Omnichannel Ingestion
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Visual Bezier flow builder, real-time IndiaMART webhook configuration, Meta &amp; WhatsApp Cloud connections, unified inbox, and conversion analytics.
            </p>
          </div>
        </div>

        {/* Studio Navigation Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#181B26] p-1 rounded-xl border border-slate-200 dark:border-[#2A3042] text-xs font-bold">
          <button
            onClick={() => setActiveTab('builder')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'builder'
                ? 'bg-crm-blue text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Zap size={13} />
            <span>Flow Builder</span>
          </button>

          <button
            onClick={() => setActiveTab('indiamart')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'indiamart'
                ? 'bg-crm-blue text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span>IndiaMART</span>
          </button>

          <button
            onClick={() => setActiveTab('meta')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'meta'
                ? 'bg-crm-blue text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Globe size={13} />
            <span>Meta &amp; WhatsApp</span>
          </button>

          <button
            onClick={() => setActiveTab('inbox')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'inbox'
                ? 'bg-crm-blue text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <MessageSquare size={13} />
            <span>Unified Inbox</span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'analytics'
                ? 'bg-crm-blue text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <BarChart3 size={13} />
            <span>Analytics</span>
          </button>
        </div>
      </div>

      {/* ─── ACTIVE TAB CONTENT ─── */}
      <div className="pt-1">
        {activeTab === 'builder' && <FlowStudioCanvas />}
        {activeTab === 'indiamart' && <IndiaMartTab />}
        {activeTab === 'meta' && <MetaWhatsAppTab />}
        {activeTab === 'inbox' && <UnifiedInboxTab />}
        {activeTab === 'analytics' && <FlowAnalyticsTab />}
      </div>
    </div>
  );
}
