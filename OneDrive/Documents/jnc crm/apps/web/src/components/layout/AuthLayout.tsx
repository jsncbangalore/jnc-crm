/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { useBranding } from '../../contexts/BrandingContext';
import { Sun, Moon } from 'lucide-react';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  const { isDark, toggleTheme } = useTheme();
  const { branding } = useBranding();

  return (
    <div className="min-h-screen min-h-dvh w-full grid lg:grid-cols-2 bg-[#F8FAFC] dark:bg-[#0B1220] text-slate-900 dark:text-slate-100 relative">
      {/* ── Left panel (Desktop 1024px+) ────────────────────────────────────── */}
      <div
        className="hidden lg:flex flex-col justify-between h-full min-h-full p-12 xl:p-16 relative overflow-hidden select-none"
        style={{
          background: 'linear-gradient(160deg, #0B1F4D 0%, #12307A 50%, #1D4ED8 100%)',
        }}
      >
        {/* Two subtle large circles (white at 6% opacity) safely within bounds */}
        <div
          className="absolute top-12 left-12 w-64 h-64 rounded-full pointer-events-none"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.06)' }}
          aria-hidden="true"
        />
        <div
          className="absolute bottom-16 right-12 w-72 h-72 rounded-full pointer-events-none"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.06)' }}
          aria-hidden="true"
        />

        {/* Top: Brand Logo Chip & Name */}
        <div className="relative z-10 flex items-center gap-3.5">
          <div className="h-11 min-h-[44px] px-3.5 py-1.5 rounded-xl bg-white shadow-sm flex items-center justify-center">
            <img
              src="/jnc-logo.jpg"
              alt="JNC Logo"
              className="h-7 w-auto object-contain"
            />
          </div>
          <span className="text-[20px] font-semibold text-white tracking-tight leading-tight">
            JS Communication
          </span>
        </div>

        {/* Middle: Vertically Centered Hero Text */}
        <div className="relative z-10 my-auto py-12 max-w-md">
          <h1 className="text-[40px] leading-[1.15] font-semibold text-white tracking-tight mb-4">
            Run your sales, orders and billing in one place.
          </h1>
          <p
            className="text-[16px] leading-relaxed mb-8 max-w-md"
            style={{ color: 'rgba(255, 255, 255, 0.78)' }}
          >
            A secure CRM for growing B2B teams.
          </p>

          <div className="flex flex-col space-y-3 pt-6 border-t border-white/10 max-w-md">
            <div className="text-[14px] font-medium" style={{ color: 'rgba(255, 255, 255, 0.78)' }}>
              Leads and pipeline
            </div>
            <div className="h-px bg-white/10 w-full" />
            <div className="text-[14px] font-medium" style={{ color: 'rgba(255, 255, 255, 0.78)' }}>
              Quotations and invoices
            </div>
            <div className="h-px bg-white/10 w-full" />
            <div className="text-[14px] font-medium" style={{ color: 'rgba(255, 255, 255, 0.78)' }}>
              Inventory and teams
            </div>
          </div>
        </div>

        {/* Bottom: Footer */}
        <div className="relative z-10">
          <p className="text-[13px]" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
            &copy; 2026 JS Communication
          </p>
        </div>
      </div>

      {/* ── Right panel ────────────────────────────────────────────────────── */}
      <div className="flex flex-col justify-between items-center h-full min-h-full min-h-screen min-h-dvh w-full relative px-4 py-6 sm:px-8 sm:py-10 bg-[#F8FAFC] dark:bg-[#0B1220]">
        {/* Theme Toggle in top-right corner */}
        <button
          type="button"
          onClick={toggleTheme}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 dark:border-[#243049] bg-white dark:bg-[#111A2E] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white shadow-sm transition-all cursor-pointer z-20"
          title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          aria-label={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
        >
          {isDark ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-slate-600" />}
        </button>

        {/* Mobile Header (Hidden on lg+) */}
        <div className="w-full flex justify-center pt-1 pb-5 pr-10 pl-2 lg:hidden">
          <div className="flex items-center justify-center gap-2.5">
            <div className="h-11 min-h-[44px] px-3 py-1.5 rounded-xl bg-white shadow-sm border border-slate-200 dark:border-slate-800 flex items-center justify-center shrink-0">
              <img
                src="/jnc-logo.jpg"
                alt="JNC Logo"
                className="h-6 w-auto object-contain"
              />
            </div>
            <span className="text-[16px] font-semibold text-slate-900 dark:text-white tracking-tight leading-tight">
              JS Communication
            </span>
          </div>
        </div>

        {/* Form Card Centered */}
        <div className="flex-1 flex items-center justify-center w-full py-2">
          <div className="w-full max-w-[420px] bg-white dark:bg-[#111A2E] border border-[#CBD5E1] dark:border-[#243049] rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] dark:shadow-none p-6 sm:p-10">
            {children}
          </div>
        </div>

        {/* Bottom Centre Footer */}
        <p className="text-center text-[12px] text-slate-400 dark:text-slate-500 pt-2 pb-2">
          &copy; 2026 JS Communication. All rights reserved.
        </p>
      </div>
    </div>
  );
}
