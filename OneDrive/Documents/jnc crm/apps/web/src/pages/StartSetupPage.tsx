import React, { useState } from 'react';
import { canStore } from '../utils/cookieConsent';
import { useNavigate } from 'react-router-dom';
import {
  Globe, MessageSquare, Zap, BarChart3,
  Sun, Moon, ShieldCheck, CheckCircle2,
  Sliders, ArrowUpRight, LogOut, Check, Layers,
  LayoutTemplate, PanelLeftClose, PanelLeftOpen,
  ChevronLeft, ChevronRight, Menu, Sparkles
} from 'lucide-react';
import { useBranding } from '../contexts/BrandingContext';
import { useTheme } from '../contexts/ThemeContext';
import FlowStudioCanvas from '../components/flow-studio/FlowStudioCanvas';
import IndiaMartTab from '../components/flow-studio/IndiaMartTab';
import MetaWhatsAppTab from '../components/flow-studio/MetaWhatsAppTab';
import WebsiteLeadsTab from '../components/flow-studio/WebsiteLeadsTab';
import UnifiedInboxTab from '../components/flow-studio/UnifiedInboxTab';
import FlowAnalyticsTab from '../components/flow-studio/FlowAnalyticsTab';

export type StudioTab = 'builder' | 'indiamart' | 'meta' | 'website' | 'inbox' | 'analytics';

export default function StartSetupPage() {
  const { branding } = useBranding();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  // Active studio module tab
  const [activeTab, setActiveTab] = useState<StudioTab>('builder');
  
  // Left Sidebar Collapsed state (Hide / Unhide, persisted if consented)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      if (canStore('preferences')) {
        return localStorage.getItem('crm_setup_sidebar_collapsed') === 'true';
      }
      return false;
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        if (canStore('preferences')) {
          localStorage.setItem('crm_setup_sidebar_collapsed', String(next));
        }
      } catch {}
      return next;
    });
  };

  const tabs: {
    id: StudioTab;
    label: string;
    sublabel: string;
    icon: React.ReactNode;
    badge?: string;
    badgeColor?: string;
  }[] = [
    {
      id: 'builder',
      label: 'Flow Builder',
      sublabel: 'Visual Drag & Drop Engine',
      icon: <Zap size={17} />,
      badge: 'Visual',
      badgeColor: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20',
    },
    {
      id: 'indiamart',
      label: 'IndiaMART API',
      sublabel: 'Lead Push Webhook & Polling',
      icon: <Layers size={17} />,
      badge: 'Active',
      badgeColor: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    },
    {
      id: 'meta',
      label: 'Meta & WhatsApp',
      sublabel: 'Cloud API & WhatsApp Templates',
      icon: <Globe size={17} />,
      badge: 'Ready',
      badgeColor: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20',
    },
    {
      id: 'website',
      label: 'Website Leads',
      sublabel: 'Public Inquiries & Embed Code',
      icon: <LayoutTemplate size={17} />,
      badge: 'Live',
      badgeColor: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
    },
    {
      id: 'inbox',
      label: 'Unified Inbox',
      sublabel: 'Omnichannel Inbound Messages',
      icon: <MessageSquare size={17} />,
    },
    {
      id: 'analytics',
      label: 'Flow Analytics',
      sublabel: 'Real-time Funnel & Metrics',
      icon: <BarChart3 size={17} />,
    },
  ];

  const currentTab = tabs.find((t) => t.id === activeTab) || tabs[0];

  return (
    <div className="h-screen w-screen bg-slate-50/90 dark:bg-[#0B0D13] text-slate-900 dark:text-slate-100 flex overflow-hidden font-sans select-none antialiased">
      {/* ═══════════════════════════════════════════════════════════════════════
          LEFT NAVIGATION SIDEBAR (WITH HIDE / UNHIDE TOGGLE)
          ═══════════════════════════════════════════════════════════════════════ */}
      <aside
        className={`bg-white dark:bg-[#121622] border-r border-slate-200/90 dark:border-[#22293A] flex flex-col shrink-0 transition-all duration-300 ease-in-out z-30 shadow-sm ${
          isSidebarCollapsed ? 'w-[68px]' : 'w-72'
        }`}
      >
        {/* SIDEBAR HEADER / BRANDING */}
        <div
          className={`h-14 px-3.5 flex items-center border-b border-slate-200/80 dark:border-[#22293A] shrink-0 ${
            isSidebarCollapsed ? 'justify-center' : 'justify-start'
          }`}
        >
          <div
            className={`flex items-center gap-2.5 overflow-hidden ${
              isSidebarCollapsed ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''
            }`}
            onClick={() => isSidebarCollapsed && toggleSidebar()}
            title={isSidebarCollapsed ? 'Click to expand sidebar' : undefined}
          >
            {branding.companyLogoUrl ? (
              <div className="h-9 w-9 rounded-xl bg-white dark:bg-[#1A2030] flex items-center justify-center shadow-xs border border-slate-200/90 dark:border-white/10 shrink-0">
                <img
                  src={branding.companyLogoUrl}
                  alt={branding.companyDisplayName}
                  className="h-5 w-auto object-contain"
                />
              </div>
            ) : null}
            {!isSidebarCollapsed && (
              <div className="leading-tight overflow-hidden">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-slate-900 dark:text-white tracking-tight truncate">
                    {branding.companyDisplayName}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-crm-teal">
                  Setup Studio Hub
                </span>
              </div>
            )}
          </div>
        </div>

        {/* SIDEBAR NAVIGATION ITEMS */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 scrollbar-none">
          {!isSidebarCollapsed && (
            <div className="px-2 pt-1 pb-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Setup Modules &amp; Ingestion
              </span>
            </div>
          )}

          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                title={isSidebarCollapsed ? `${tab.label} — ${tab.sublabel}` : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer relative group ${
                  isActive
                    ? 'bg-crm-blue text-white shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-white/5'
                } ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
              >
                <div className={`shrink-0 transition-transform ${isActive ? 'scale-105' : 'group-hover:scale-110'}`}>
                  {tab.icon}
                </div>

                {!isSidebarCollapsed && (
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-xs font-black truncate">{tab.label}</span>
                      {tab.badge && (
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold border ${
                            isActive
                              ? 'bg-white/20 text-white border-white/30'
                              : tab.badgeColor || 'bg-slate-100 dark:bg-white/10 text-slate-500'
                          }`}
                        >
                          {tab.badge}
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-[10px] truncate ${
                        isActive ? 'text-white/80 font-medium' : 'text-slate-400 dark:text-slate-400'
                      }`}
                    >
                      {tab.sublabel}
                    </p>
                  </div>
                )}

                {/* Collapsed Active Indicator Pill */}
                {isSidebarCollapsed && isActive && (
                  <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-white" />
                )}
              </button>
            );
          })}
        </div>

        {/* SIDEBAR FOOTER / ENGINE STATUS & ACTIONS */}
        <div className="p-3 border-t border-slate-200/80 dark:border-[#22293A] space-y-2 shrink-0">
          {!isSidebarCollapsed ? (
            <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/20 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Ingestion Engine Active</span>
              </div>
              <span className="text-[10px] bg-emerald-500/20 px-1.5 py-0.5 rounded-md">Live</span>
            </div>
          ) : (
            <div className="flex justify-center" title="Ingestion Engine Active (Live)">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
          )}

          <div className="flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={toggleTheme}
              className={`p-2 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 border border-slate-200/80 dark:border-[#22293A] transition-colors cursor-pointer ${
                isSidebarCollapsed ? 'w-full' : 'flex-1'
              }`}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDark ? <Sun size={15} className="text-amber-400" /> : <Moon size={15} className="text-indigo-600" />}
              {!isSidebarCollapsed && (
                <span className="ml-2 text-xs font-semibold">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
              )}
            </button>

            {!isSidebarCollapsed && (
              <button
                type="button"
                onClick={() => navigate('/')}
                className="flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-slate-200/80 dark:border-[#22293A] bg-slate-100/70 dark:bg-[#181D2B] text-slate-700 dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-[#22283A] transition-colors cursor-pointer"
                title="Exit Setup Studio and return to CRM"
              >
                <span>Exit</span>
                <LogOut size={13} className="text-slate-400" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ═══════════════════════════════════════════════════════════════════════
          MAIN WORKSPACE AREA
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col h-screen min-w-0 overflow-hidden">
        {/* TOP COMPACT TITLE & ACTION BAR */}
        <header className="h-14 bg-white/95 dark:bg-[#121622]/95 backdrop-blur-md border-b border-slate-200/80 dark:border-[#22293A] px-4 lg:px-6 flex items-center justify-between gap-3 shrink-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            {/* Sidebar toggle button in top bar for quick access */}
            <button
              type="button"
              onClick={toggleSidebar}
              className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 border border-slate-200/80 dark:border-[#22293A] transition-colors cursor-pointer shrink-0"
              title={isSidebarCollapsed ? 'Unhide Navigation (Expand Sidebar)' : 'Hide Navigation (Collapse Sidebar)'}
            >
              {isSidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>

            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-bold text-slate-400 dark:text-slate-400 hidden sm:inline">
                Setup Studio /
              </span>
              <span className="text-sm font-black text-slate-900 dark:text-white truncate">
                {currentTab.label}
              </span>
              <span className="text-[11px] text-slate-400 dark:text-slate-400 hidden md:inline">
                &bull; {currentTab.sublabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Top quick exit button */}
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#171D2B] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#202738] transition-all cursor-pointer shadow-2xs"
            >
              <span>Exit Setup</span>
              <LogOut size={13} className="text-slate-400" />
            </button>
          </div>
        </header>

        {/* TAB WORKSPACE CONTENT */}
        <main
          className={`flex-1 min-w-0 ${
            activeTab === 'builder'
              ? 'p-2 sm:p-3 overflow-hidden flex flex-col'
              : 'p-4 sm:p-6 lg:p-8 overflow-y-auto'
          }`}
        >
          {activeTab === 'builder' && <FlowStudioCanvas />}
          {activeTab === 'indiamart' && <IndiaMartTab />}
          {activeTab === 'meta' && <MetaWhatsAppTab />}
          {activeTab === 'website' && <WebsiteLeadsTab />}
          {activeTab === 'inbox' && <UnifiedInboxTab />}
          {activeTab === 'analytics' && <FlowAnalyticsTab />}
        </main>
      </div>
    </div>
  );
}
