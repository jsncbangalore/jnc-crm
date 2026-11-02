/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useBranding } from '../../contexts/BrandingContext';
import { useAllowedPages } from '../../hooks/useAllowedPages';
import { Menu, X, LogOut, Sun, Moon } from 'lucide-react';
import BrandLogo from '../common/BrandLogo';

export default function MobileDock() {
  const {
    user,
    mobilePrimaryTabs,
    mobileDrawerItems,
    hasZeroPages,
  } = useAllowedPages();

  const { logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { branding } = useBranding();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // If user has zero pages or is not authenticated, hide bottom dock completely (Requirement 2 & 5)
  if (hasZeroPages || !user || mobilePrimaryTabs.length === 0) {
    return null;
  }

  const showMoreTab = mobileDrawerItems.length > 0;
  const isDrawerRouteActive = mobileDrawerItems.some((item) =>
    item.to.includes('?')
      ? (location.pathname + location.search) === item.to
      : location.pathname === item.to
  );

  return (
    <>
      {/* ─── NATIVE MOBILE BOTTOM DOCK (Visible on screens < 1024px) ────────── */}
      <nav aria-label="Mobile Navigation" className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-[#181B26]/95 backdrop-blur-lg border-t border-slate-200 dark:border-[#2A3042] px-2 py-1.5 flex items-center justify-around shadow-2xl safe-area-bottom transition-colors duration-150">
        {mobilePrimaryTabs.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/' || to === '/platform/companies'}
            className={({ isActive }) =>
              `relative flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'text-crm-blue font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className={`p-1 rounded-lg ${isActive ? 'bg-crm-blue/15' : ''}`}>
                  <Icon size={19} className={isActive ? 'text-crm-blue' : 'currentColor'} />
                </div>
                <span className="text-[10px] tracking-tight mt-0.5 truncate max-w-[64px]">{label}</span>
              </>
            )}
          </NavLink>
        ))}

        {/* 5th Tab: More / Drawer Toggle (Shown only if there are remaining pages) */}
        {showMoreTab && (
          <button
            onClick={() => setDrawerOpen(true)}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all duration-200 ${
              isDrawerRouteActive || drawerOpen
                ? 'text-amber-500 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <div className={`p-1 rounded-lg ${isDrawerRouteActive || drawerOpen ? 'bg-amber-500/15' : ''}`}>
              <Menu size={19} className={isDrawerRouteActive || drawerOpen ? 'text-amber-500' : 'currentColor'} />
            </div>
            <span className="text-[10px] tracking-tight mt-0.5">More</span>
          </button>
        )}
      </nav>

      {/* ─── FULL MOBILE SLIDE-UP NAVIGATION DRAWER ────────────────────────── */}
      <AnimatePresence>
        {drawerOpen && showMoreTab && (
          <div className="fixed inset-0 z-[100] lg:hidden flex flex-col justify-end bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 280 }}
              className="bg-white dark:bg-[#181B26] border-t border-slate-200 dark:border-[#2A3042] rounded-t-3xl p-5 max-h-[85vh] flex flex-col shadow-2xl overflow-hidden transition-colors duration-150"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#2A3042] pb-3.5 mb-3">
                <div className="flex items-center gap-3">
                  <BrandLogo size={32} variant="icon" />
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                      JNC CRM
                    </h3>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">All Operations & Modules</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="w-9 h-9 rounded-full bg-slate-100 dark:bg-[#1E2230] border border-slate-300 dark:border-[#2A3042] flex items-center justify-center text-slate-700 dark:text-slate-200"
                    title={isDark ? 'Light Theme' : 'Dark Theme'}
                  >
                    {isDark ? (
                      <Sun size={17} className="text-amber-400 shrink-0" />
                    ) : (
                      <Moon size={17} className="text-indigo-600 shrink-0" />
                    )}
                  </button>
                  <button
                    onClick={() => setDrawerOpen(false)}
                    className="w-8 h-8 rounded-full bg-slate-100 dark:bg-[#1E2230] border border-slate-200 dark:border-[#2A3042] flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Module Grid Links - Strictly granted drawer items */}
              <div className="overflow-y-auto space-y-1.5 pr-1 flex-1 py-1">
                {mobileDrawerItems.map((item) => {
                  const Icon = item.icon;
                  const active =
                    item.to.includes('?')
                      ? (location.pathname + location.search) === item.to
                      : location.pathname === item.to;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setDrawerOpen(false)}
                      className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
                        active
                          ? 'bg-crm-blue/10 dark:bg-crm-blue/15 border-crm-blue/30 dark:border-crm-blue/40 text-crm-blue dark:text-white font-bold'
                          : 'bg-slate-50 dark:bg-[#141722] border-slate-200 dark:border-[#2A3042] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                      }`}
                    >
                      <div
                        className={`p-2 rounded-lg ${
                          active
                            ? 'bg-crm-blue text-white'
                            : 'bg-slate-200/80 dark:bg-[#1E2230] text-crm-blue dark:text-crm-blue-light'
                        }`}
                      >
                        <Icon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{item.label}</p>
                        {item.description && (
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{item.description}</p>
                        )}
                      </div>
                    </NavLink>
                  );
                })}
              </div>

              {/* User Profile & Logout Drawer Bottom */}
              <div className="pt-3.5 mt-2 border-t border-slate-200 dark:border-[#2A3042] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-crm-blue/15 dark:bg-crm-blue/20 border border-crm-blue/30 flex items-center justify-center text-crm-blue font-bold text-xs">
                    {user?.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight truncate max-w-[130px]">
                      {user?.name}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 capitalize">
                      {user?.role?.replace('_', ' ')}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setDrawerOpen(false);
                    logout();
                  }}
                  className="btn bg-red-500/10 dark:bg-red-500/15 hover:bg-red-500/20 text-crm-coral border border-red-500/20 dark:border-red-500/30 text-xs px-3 py-1.5 gap-1.5 font-bold"
                >
                  <LogOut size={13} />
                  <span>Logout</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
