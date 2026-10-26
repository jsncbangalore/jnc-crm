/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import { useBranding } from '../../contexts/BrandingContext';
import { Sun, Moon } from 'lucide-react';
import BrandLogo from '../common/BrandLogo';
import { getBrandHeadline, getBrandFeatures, getBrandLegalLinks, getProductName } from '../../config/brand';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  const { isDark, toggleTheme } = useTheme();
  const { branding } = useBranding();
  const productName = getProductName();
  const legalLinks = getBrandLegalLinks();
  const features = getBrandFeatures();

  return (
    <div
      data-testid="auth-layout"
      className="min-h-screen w-full grid lg:grid-cols-2 bg-[#F8FAFC] dark:bg-[#0B1220] text-slate-900 dark:text-slate-100 relative overflow-x-hidden m-0 p-0"
    >
      {/* ── Left panel (Desktop 1024px+) ────────────────────────────────────── */}
      <aside
        className="hidden lg:flex flex-col justify-between h-full min-h-full p-12 xl:p-16 relative overflow-hidden select-none"
        style={{
          background: 'linear-gradient(160deg, #0B1F4D 0%, #12307A 50%, #1D4ED8 100%)',
        }}
        aria-label="About CRM"
      >
        {/* Subtle geometric circles */}
        <div
          className="absolute top-12 left-12 w-64 h-64 rounded-full pointer-events-none"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
          aria-hidden="true"
        />
        <div
          className="absolute bottom-16 right-12 w-72 h-72 rounded-full pointer-events-none"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
          aria-hidden="true"
        />

        {/* Top: Brand Logo & Product Name */}
        <div className="relative z-10 flex items-center gap-3">
          <Link to="/" aria-label={`${productName} home`} className="inline-block">
            <BrandLogo size={36} reversed={true} showText={true} productOnly={true} />
          </Link>
        </div>

        {/* Middle: Vertically Centered True Features */}
        <div className="relative z-10 my-auto py-10 max-w-md">
          <h1 className="text-[36px] xl:text-[40px] leading-[1.18] font-bold text-white tracking-tight mb-3">
            {getBrandHeadline()}
          </h1>
          <p
            className="text-[16px] leading-relaxed mb-8 max-w-md"
            style={{ color: 'rgba(255, 255, 255, 0.82)' }}
          >
            A secure CRM for growing B2B teams.
          </p>

          <div className="flex flex-col space-y-3 pt-6 border-t border-white/10 max-w-md">
            {features.map((feat, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <div className="h-px bg-white/10 w-full" />}
                <div
                  className="text-[14px] font-semibold flex items-center gap-2"
                  style={{ color: 'rgba(255, 255, 255, 0.88)' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-300" aria-hidden="true" />
                  <span>{feat}</span>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Bottom: Left panel copyright */}
        <div className="relative z-10">
          <p className="text-[13px] font-medium" style={{ color: 'rgba(255, 255, 255, 0.65)' }}>
            &copy; {new Date().getFullYear()} {productName}. All rights reserved.
          </p>
        </div>
      </aside>

      {/* ── Right panel ────────────────────────────────────────────────────── */}
      <main className="flex flex-col justify-between items-center min-h-screen w-full relative px-4 py-3 sm:px-6 sm:py-4 bg-[#F8FAFC] dark:bg-[#0B1220] overflow-x-hidden">
        {/* Theme Toggle (top-right absolute, zero vertical height overhead) */}
        <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20">
          <button
            type="button"
            onClick={toggleTheme}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-xs cursor-pointer transition-colors focus:outline-none focus:ring-[3px] focus:ring-blue-500/30"
            title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {isDark ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-slate-600" />}
          </button>
        </div>

        {/* Mobile Header (Hidden on lg+) */}
        <div className="w-full flex justify-center pt-1 pb-2 lg:hidden">
          <Link to="/" aria-label={`${productName} home`}>
            <BrandLogo size={28} reversed={false} showText={true} productOnly={true} />
          </Link>
        </div>

        {/* Form Card Container (Exact 440px width, stable top-anchored positioning to prevent vertical shifts) */}
        <div className="flex-1 flex justify-center items-start w-full pt-4 sm:pt-8 lg:pt-12 pb-4">
          <div className="w-full max-w-[440px] bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.05)] dark:shadow-none p-5 sm:p-6">
            {children}
          </div>
        </div>

        {/* Honest Footer: only links that exist, configured via brand config */}
        <footer className="text-center text-[12px] text-slate-500 dark:text-slate-400 py-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <span>&copy; {new Date().getFullYear()} {productName}. All rights reserved.</span>
          {legalLinks.map((link, idx) => (
            <React.Fragment key={link.label}>
              <span aria-hidden="true">•</span>
              {link.isExternal ? (
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-slate-900 dark:hover:text-white underline transition-colors"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  to={link.href}
                  className="hover:text-slate-900 dark:hover:text-white underline transition-colors"
                >
                  {link.label}
                </Link>
              )}
            </React.Fragment>
          ))}
        </footer>
      </main>
    </div>
  );
}
