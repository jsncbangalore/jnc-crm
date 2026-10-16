import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Globe, MessageSquare, Zap, BarChart3,
  Sliders, Sun, Moon, ShieldCheck, Sparkles, RefreshCw
} from 'lucide-react';
import { useBranding } from '../contexts/BrandingContext';
import { useTheme } from '../contexts/ThemeContext';
import FlowStudioCanvas from '../components/flow-studio/FlowStudioCanvas';
import IndiaMartTab from '../components/flow-studio/IndiaMartTab';
import MetaWhatsAppTab from '../components/flow-studio/MetaWhatsAppTab';
import UnifiedInboxTab from '../components/flow-studio/UnifiedInboxTab';
import FlowAnalyticsTab from '../components/flow-studio/FlowAnalyticsTab';

export default function StartSetupPage() {
  const { branding } = useBranding();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  // Active studio module tab
  const [activeTab, setActiveTab] = useState<'builder' | 'indiamart' | 'meta' | 'inbox' | 'analytics'>('builder');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0F1117] text-slate-900 dark:text-slate-100 flex flex-col font-sans select-none">
      {/* ═══════════════════════════════════════════════════════════════════════
          CLEAN STANDALONE HEADER (NO CRM APP TABS, NO QUOTATIONS/INVOICES NAV)
          ═══════════════════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#181B26]/95 backdrop-blur-md border-b border-slate-200 dark:border-[#2A3042] px-4 lg:px-6 py-2.5 shadow-xs shrink-0">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between gap-4 flex-wrap">
          
          {/* Left: Company Branding */}
          <div className="flex items-center gap-3 shrink-0">

            <div className="flex items-center gap-2.5">
              <div className="h-8 px-2 py-1 rounded-lg bg-white flex items-center justify-center shadow-xs border border-slate-200 dark:border-transparent shrink-0">
                <img
                  src="/jnc-logo.jpg"
                  alt="JS Network Communication"
                  className="h-5 w-auto object-contain"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white tracking-tight truncate max-w-[240px]">
                    {branding.companyDisplayName}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-crm-teal/15 text-crm-teal border border-crm-teal/30">
                    Start Setup Studio
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">
                  Visual Flowchart Automator &amp; Real-Time Multi-Channel Ingestion Hub
                </p>
              </div>
            </div>
          </div>

          {/* Center: Module Navigation Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#141721] p-1 rounded-xl border border-slate-200 dark:border-[#2A3042] overflow-x-auto text-xs font-bold">
            <button
              onClick={() => setActiveTab('builder')}
              className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 shrink-0 ${
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
              className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 shrink-0 ${
                activeTab === 'indiamart'
                  ? 'bg-crm-blue text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>IndiaMART</span>
            </button>

            <button
              onClick={() => setActiveTab('meta')}
              className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 shrink-0 ${
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
              className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 shrink-0 ${
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
              className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 shrink-0 ${
                activeTab === 'analytics'
                  ? 'bg-crm-blue text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BarChart3 size={13} />
              <span>Analytics</span>
            </button>
          </div>

          {/* Right: Theme Toggle & Exit */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-white/5 transition-all cursor-pointer"
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDark ? <Sun size={15} className="text-amber-400" /> : <Moon size={15} className="text-indigo-600" />}
            </button>

            <button
              onClick={() => navigate('/')}
              className="btn-ghost text-xs px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#2A3042]"
            >
              Exit Setup
            </button>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════════
          START SETUP BODY (FOCUSED STANDALONE CONSOLE)
          ═══════════════════════════════════════════════════════════════════════ */}
      <main className="flex-1 max-w-[1800px] w-full mx-auto p-3 sm:p-5 lg:p-6 overflow-hidden">
        {activeTab === 'builder' && <FlowStudioCanvas />}
        {activeTab === 'indiamart' && <IndiaMartTab />}
        {activeTab === 'meta' && <MetaWhatsAppTab />}
        {activeTab === 'inbox' && <UnifiedInboxTab />}
        {activeTab === 'analytics' && <FlowAnalyticsTab />}
      </main>

      {/* Standalone Setup Footer */}
      <footer className="mt-auto border-t border-slate-200 dark:border-[#2A3042] bg-white/70 dark:bg-[#181B26]/70 px-6 py-2.5 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between flex-wrap gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-800 dark:text-slate-200">{branding.companyDisplayName}</span>
          <span>•</span>
          <span>Automated Flow &amp; Ingestion Console</span>
          <span>•</span>
          <span>&copy; {new Date().getFullYear()}</span>
        </div>
        <div>
          <button
            onClick={() => navigate('/')}
            className="text-crm-blue hover:underline font-semibold"
          >
            ← Return to CRM Main Workspace
          </button>
        </div>
      </footer>
    </div>
  );
}
