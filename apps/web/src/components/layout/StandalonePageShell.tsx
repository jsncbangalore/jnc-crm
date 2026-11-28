import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sun, Moon } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import BrandLogo from '../common/BrandLogo';
import { PRODUCT_NAME } from '../../config/brand';
import Footer from '../common/Footer';

interface StandalonePageShellProps {
  title: string;
  children: React.ReactNode;
}

export default function StandalonePageShell({ title, children }: StandalonePageShellProps) {
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0F1117] text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#181B26]/95 backdrop-blur-md border-b border-slate-200 dark:border-[#2A3042] px-4 lg:px-6 py-2.5 shadow-xs shrink-0">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <BrandLogo size={30} />
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-[#2A3042] min-w-0">
              <span className="hidden sm:inline text-xs sm:text-sm font-black text-slate-900 dark:text-white tracking-tight truncate">
                {PRODUCT_NAME}
              </span>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-crm-blue/15 text-crm-blue border border-crm-blue/30 truncate">
                {title}
              </span>
            </div>
          </div>

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
              type="button"
              onClick={() => navigate('/')}
              className="btn-ghost text-xs px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#2A3042] hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer font-bold flex items-center gap-1.5"
              title="Back to CRM"
            >
              <ArrowLeft size={14} />
              <span>Back to CRM</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 lg:p-6 max-w-[1800px] w-full mx-auto overflow-y-auto">
        {children}
      </main>
      <Footer />
    </div>
  );
}
