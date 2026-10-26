/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Menu,
  X,
  Sun,
  Moon,
  ArrowRight,
  ShieldCheck,
  Twitter,
  Linkedin,
  Github,
  Youtube,
  LayoutDashboard,
  LifeBuoy,
  PhoneCall,
  FileText,
  Lock,
} from 'lucide-react';
import BrandLogo from '../common/BrandLogo';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { PRODUCT_NAME, COMPANY_NAME } from '../../config/brand';

interface PublicLayoutProps {
  children: React.ReactNode;
}

export default function PublicLayout({ children }: PublicLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, isAuthenticated } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();

  const navLinks = [
    { label: 'Features', path: '/features' },
    { label: 'Solutions', path: '/solutions' },
    { label: 'Pricing', path: '/pricing' },
    { label: 'Help', path: '/help' },
    { label: 'Contact', path: '/contact' },
  ];

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0B0D13] text-slate-900 dark:text-slate-100 transition-colors">
      {/* ── Public Navbar ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-[#2A3042] bg-white/95 dark:bg-[#0F1117]/95 backdrop-blur-md transition-colors">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <BrandLogo size={34} reversed={isDark} showText={true} />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-7 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`text-sm font-medium transition ${
                  isActive(link.path)
                    ? 'text-blue-600 dark:text-blue-400 font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Desktop Right Actions */}
          <div className="hidden items-center gap-3 md:flex">
            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#181B26] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-all shadow-xs cursor-pointer"
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label="Toggle theme"
            >
              {isDark ? <Sun size={17} className="text-amber-400" /> : <Moon size={17} className="text-slate-700" />}
            </button>

            {isAuthenticated && user ? (
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-xs transition"
              >
                <LayoutDashboard size={15} />
                <span>Go to Dashboard</span>
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="rounded-xl px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#181B26] transition"
                >
                  Sign In
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-xs transition"
                >
                  <span>Get Started</span>
                  <ArrowRight size={14} />
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={toggleTheme}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#181B26] text-slate-700 dark:text-slate-300"
              aria-label="Toggle theme"
            >
              {isDark ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} />}
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="rounded-xl border border-slate-200 dark:border-[#2A3042] p-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Open mobile menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="border-b border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#0F1117] px-4 py-4 md:hidden">
            <nav className="flex flex-col gap-1.5">
              <Link
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Home
              </Link>
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium ${
                    isActive(link.path)
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold'
                      : 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-[#2A3042] flex flex-col gap-2">
              {isAuthenticated && user ? (
                <Link
                  to="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-xs"
                >
                  <LayoutDashboard size={16} />
                  <span>Go to Dashboard</span>
                </Link>
              ) : (
                <>
                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full text-center rounded-xl border border-slate-300 dark:border-slate-700 py-2 text-sm font-medium text-slate-700 dark:text-slate-200"
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full text-center rounded-xl bg-blue-600 py-2 text-sm font-semibold text-white shadow-xs"
                  >
                    Get Started Free
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ── Main Page Content ────────────────────────────────────────── */}
      <main className="flex-1">{children}</main>

      {/* ── Public Footer ────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#0F1117] transition-colors">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 lg:gap-12">
            {/* Column 1: Brand & Tagline */}
            <div className="md:col-span-1 space-y-4">
              <Link to="/" className="inline-flex items-center gap-2">
                <BrandLogo size={30} reversed={isDark} showText={true} />
              </Link>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Modern multi-tenant platform for unified sales pipeline tracking, inventory control, and automated billing.
              </p>
              <div className="flex items-center gap-3 text-slate-400">
                <a href="#" className="hover:text-blue-500 transition-colors" aria-label="Twitter">
                  <Twitter size={16} />
                </a>
                <a href="#" className="hover:text-blue-500 transition-colors" aria-label="LinkedIn">
                  <Linkedin size={16} />
                </a>
                <a href="#" className="hover:text-blue-500 transition-colors" aria-label="GitHub">
                  <Github size={16} />
                </a>
                <a href="#" className="hover:text-blue-500 transition-colors" aria-label="YouTube">
                  <Youtube size={16} />
                </a>
              </div>
            </div>

            {/* Column 2: Product */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                Product
              </h4>
              <ul className="mt-3 space-y-2 text-xs">
                <li>
                  <Link to="/features" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition">
                    Features Overview
                  </Link>
                </li>
                <li>
                  <Link to="/solutions" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition">
                    Solutions by Industry
                  </Link>
                </li>
                <li>
                  <Link to="/pricing" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition">
                    Pricing Plans
                  </Link>
                </li>
                <li>
                  <Link to="/inquiry" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition">
                    Request a Quote
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 3: Resources & Support */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                Resources
              </h4>
              <ul className="mt-3 space-y-2 text-xs">
                <li>
                  <Link to="/help" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition">
                    Help & Documentation
                  </Link>
                </li>
                <li>
                  <Link to="/contact" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition">
                    Contact Support
                  </Link>
                </li>
                <li>
                  <Link to="/cookies" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition">
                    Cookie Settings
                  </Link>
                </li>
                <li>
                  <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    All Systems Operational
                  </span>
                </li>
              </ul>
            </div>

            {/* Column 4: Legal & Security */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                Trust & Legal
              </h4>
              <ul className="mt-3 space-y-2 text-xs">
                <li>
                  <Link to="/privacy" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link to="/login" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition">
                    Staff Portal Sign In
                  </Link>
                </li>
                <li>
                  <Link to="/platform/login" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition">
                    Platform Admin Console
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-[#2A3042] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
            <div>
              © {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <Link to="/privacy" className="hover:text-blue-600 dark:hover:text-blue-400 transition">
                Privacy
              </Link>
              <Link to="/terms" className="hover:text-blue-600 dark:hover:text-blue-400 transition">
                Terms
              </Link>
              <Link to="/cookies" className="hover:text-blue-600 dark:hover:text-blue-400 transition">
                Cookies
              </Link>
              <Link to="/contact" className="hover:text-blue-600 dark:hover:text-blue-400 transition">
                Contact
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
