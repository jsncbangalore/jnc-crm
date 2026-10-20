import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShieldCheck, Building2, Mail, Sun, Moon } from 'lucide-react';
import { useBranding } from '../contexts/BrandingContext';
import { useTheme } from '../contexts/ThemeContext';
import UsersPage from './UsersPage';
import BrandingSettingsPage from './BrandingSettingsPage';
import MailAccountsPage from './MailAccountsPage';

interface AdminSettingsPageProps {
  initialTab?: 'users' | 'branding' | 'mail';
}

export default function AdminSettingsPage({ initialTab = 'users' }: AdminSettingsPageProps) {
  const { branding } = useBranding();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState<'users' | 'branding' | 'mail'>(() => {
    if (location.pathname.includes('mail')) return 'mail';
    if (location.pathname.includes('branding')) return 'branding';
    return initialTab;
  });

  useEffect(() => {
    if (location.pathname.includes('mail')) {
      setActiveTab('mail');
    } else if (location.pathname.includes('branding')) {
      setActiveTab('branding');
    } else if (location.pathname.includes('users')) {
      setActiveTab('users');
    }
  }, [location.pathname]);

  const handleTabChange = (tab: 'users' | 'branding' | 'mail') => {
    setActiveTab(tab);
    if (tab === 'users') {
      navigate('/users', { replace: true });
    } else if (tab === 'mail') {
      navigate('/settings/mail', { replace: true });
    } else {
      navigate('/settings/branding', { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0F1117] text-slate-900 dark:text-slate-100 flex flex-col font-sans select-none">
      {/* ═══════════════════════════════════════════════════════════════════════
          STANDALONE HEADER — ONLY TEAM & USERS + COMPANY BRANDING & GST (NO CRM TABS)
          ═══════════════════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#181B26]/95 backdrop-blur-md border-b border-slate-200 dark:border-[#2A3042] px-4 lg:px-6 py-2.5 shadow-xs shrink-0">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between gap-4 flex-wrap">
          
          {/* Left: Company Branding */}
          <div className="flex items-center gap-2.5 shrink-0">
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
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-crm-blue/15 text-crm-blue border border-crm-blue/30">
                  Administration
                </span>
              </div>
            </div>
          </div>

          {/* Center: ONLY THE TWO MODULE TABS */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-[#141721] p-1 rounded-xl border border-slate-200 dark:border-[#2A3042] text-xs font-bold">
            <button
              onClick={() => handleTabChange('users')}
              className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === 'users'
                  ? 'bg-crm-blue text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/5'
              }`}
            >
              <ShieldCheck size={14} className={activeTab === 'users' ? 'text-white' : 'text-crm-blue'} />
              <span>Team & Users</span>
            </button>

            <button
              onClick={() => handleTabChange('branding')}
              className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === 'branding'
                  ? 'bg-crm-blue text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/5'
              }`}
            >
              <Building2 size={14} className={activeTab === 'branding' ? 'text-white' : 'text-crm-teal'} />
              <span>Company Branding & GST</span>
            </button>

            <button
              onClick={() => handleTabChange('mail')}
              className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === 'mail'
                  ? 'bg-crm-blue text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/5'
              }`}
            >
              <Mail size={14} className={activeTab === 'mail' ? 'text-white' : 'text-indigo-400'} />
              <span>Mail Accounts & SMTP</span>
            </button>
          </div>

          {/* Right: Theme Switcher & Exit to CRM */}
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
              className="btn-ghost text-xs px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#2A3042] hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer font-bold"
              title="Return to CRM Workspace"
            >
              Exit to CRM
            </button>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════════
          PAGE CONTENT — RENDERS ACTIVE MODULE
          ═══════════════════════════════════════════════════════════════════════ */}
      <main className="flex-1 p-4 lg:p-6 max-w-[1800px] w-full mx-auto overflow-y-auto">
        {activeTab === 'users' && <UsersPage />}
        {activeTab === 'branding' && <BrandingSettingsPage />}
        {activeTab === 'mail' && <MailAccountsPage />}
      </main>
    </div>
  );
}
