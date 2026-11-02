/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useBranding } from '../../contexts/BrandingContext';
import {
  LayoutDashboard, Users, ShoppingCart, Package, Truck, LogOut,
  Building2, FileText, Bell, ChevronDown, ShieldCheck,
  Receipt, Sun, Moon, ClipboardList, Search, Plus,
  Sparkles, UserPlus, Sliders, User, Mail, Database, Zap, Layers, BookOpen,
  ArrowRight,
} from 'lucide-react';
import CreateLeadModal from '../leads/CreateLeadModal';
import CreateQuotationModal from '../quotations/CreateQuotationModal';
import DropdownPortal from '../common/DropdownPortal';
import { useAllowedPages, PAGE_SUB_ITEMS } from '../../hooks/useAllowedPages';
import { LAYERS } from '../../constants/layers';
import BrandLogo from '../common/BrandLogo';

interface TabDefinition {
  key: string;
  label: string;
  to: string;
  icon: React.ComponentType<{ size?: string | number; className?: string }> | any;
  subItems?: Array<{ label: string; to: string; isAction?: boolean }>;
}

/**
 * Calculates estimated width required by a navigation tab (in pixels)
 */
function estimateTabWidth(tab: TabDefinition): number {
  // Base icon (14px) + gap (6px) + padding (20px) + inter-tab gap (4px) = 44px
  // Label width estimate: ~7.5px per character
  // Sub-items chevron button: ~22px
  const charWidth = tab.label.length * 7.5;
  const chevronWidth = tab.subItems && tab.subItems.length > 0 ? 22 : 0;
  return Math.ceil(44 + charWidth + chevronWidth);
}

export default function Navbar() {
  const { logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { branding } = useBranding();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    user,
    isPlatform,
    navItems,
    searchableModules,
    hasPage,
    hasAnyPage,
    homePageRoute,
  } = useAllowedPages();

  const isPlatformOwner = isPlatform;

  // Dropdown states
  const [profileOpen, setProfileOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [activeTabDropdown, setActiveTabDropdown] = useState<string | null>(null);
  const [quickLeadModalOpen, setQuickLeadModalOpen] = useState(false);
  const [quickQuoteModalOpen, setQuickQuoteModalOpen] = useState(false);

  // Trigger element refs for Portaled Dropdowns
  const profileTriggerRef = useRef<HTMLButtonElement>(null);
  const quickCreateTriggerRef = useRef<HTMLButtonElement>(null);
  const tabTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Global search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Responsive Tabs Container
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(1440);

  // Quick actions visibility
  const hasQuickCreate = hasAnyPage(['invoices', 'leads', 'orders', 'quotations', 'inventory', 'users']);

  // Dynamic search placeholder
  const searchPlaceholder = useMemo(() => {
    const candidateModules = [
      { key: 'leads', name: 'Leads' },
      { key: 'quotations', name: 'Quotations' },
      { key: 'orders', name: 'Orders' },
      { key: 'invoices', name: 'Invoices' },
      { key: 'inventory', name: 'Items' },
    ];

    const grantedNames: string[] = [];
    const seenWords = new Set<string>();

    for (const mod of candidateModules) {
      if (hasPage(mod.key)) {
        const word = mod.name.trim();
        const lower = word.toLowerCase();
        if (!seenWords.has(lower)) {
          seenWords.add(lower);
          grantedNames.push(word);
        }
      }
    }

    if (grantedNames.length === 0) {
      return 'Search... (Ctrl+K)';
    }

    const firstThree = grantedNames.slice(0, 3);
    return `Search ${firstThree.join(', ')}... (Ctrl+K)`;
  }, [hasPage]);

  // All granted tabs in strict canonical order
  const allGrantedTabs = useMemo<TabDefinition[]>(() => {
    if (isPlatformOwner) {
      return navItems.map((n) => ({
        key: n.to,
        label: n.label,
        to: n.to,
        icon: n.icon,
      }));
    }

    const fullCatalog: TabDefinition[] = [
      { key: 'dashboard', label: 'Home', to: '/dashboard', icon: LayoutDashboard },
      { key: 'leads', label: 'Leads', to: '/leads', icon: Users, subItems: PAGE_SUB_ITEMS.leads },
      { key: 'quotations', label: 'Quotations', to: '/quotations', icon: FileText, subItems: PAGE_SUB_ITEMS.quotations },
      { key: 'orders', label: 'Orders', to: '/orders', icon: ShoppingCart, subItems: PAGE_SUB_ITEMS.orders },
      { key: 'invoices', label: 'Invoices', to: '/invoices', icon: Receipt, subItems: PAGE_SUB_ITEMS.invoices },
      { key: 'shipments', label: 'Shipments', to: '/shipments', icon: Truck, subItems: PAGE_SUB_ITEMS.shipments },
      { key: 'inventory', label: 'Inventory', to: '/inventory', icon: Package, subItems: PAGE_SUB_ITEMS.inventory },
      { key: 'ledger', label: 'Ledger', to: '/ledger', icon: BookOpen, subItems: PAGE_SUB_ITEMS.ledger },
      { key: 'suppliers', label: 'Suppliers', to: '/suppliers', icon: Building2 },
      { key: 'bills', label: 'Bills', to: '/bills', icon: Receipt, subItems: PAGE_SUB_ITEMS.bills },
      { key: 'daily_activities', label: 'Daily Activities', to: '/daily-activities', icon: ClipboardList },
    ];

    return fullCatalog.filter((def) => {
      if (def.key === 'dashboard') {
        return hasPage('dashboard');
      }
      return hasPage(def.key);
    });
  }, [isPlatformOwner, navItems, user, hasPage]);

  // Setup Studio Access: Admins with matching permissions
  const canAccessSetupStudio =
    !isPlatformOwner &&
    (user?.role === 'tenant_admin' || user?.role === 'admin' || user?.role === 'platform_super_admin') &&
    (hasPage('lead_setup') || hasPage('lead_flow'));

  // Measure container width dynamically via ResizeObserver
  useEffect(() => {
    if (!tabsContainerRef.current) return;

    const measure = () => {
      if (tabsContainerRef.current) {
        const w = tabsContainerRef.current.clientWidth || window.innerWidth;
        if (w > 0) {
          setContainerWidth(Math.floor(w));
        }
      }
    };

    measure();

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(Math.floor(entry.contentRect.width));
        }
      }
    });

    ro.observe(tabsContainerRef.current);
    window.addEventListener('resize', measure);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // All granted navigation tabs are directly visible in the navbar
  const visibleTabs = allGrantedTabs;
  const overflowTabs: TabDefinition[] = [];

  // Keyboard shortcut Ctrl+K / Cmd+K for global search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchFocused(true);
      }
      if (e.key === 'Escape') {
        setSearchFocused(false);
        setActiveTabDropdown(null);
        setQuickCreateOpen(false);
        setProfileOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close dropdowns on route change
  useEffect(() => {
    setProfileOpen(false);
    setQuickCreateOpen(false);
    setActiveTabDropdown(null);
    setSearchFocused(false);
    setSearchQuery('');
  }, [location.pathname, location.search]);

  const handleLogout = () => {
    setProfileOpen(false);
    logout();
    navigate('/login');
  };

  // Filter searchable items strictly from granted modules
  const searchResults = useMemo(() => {
    return searchableModules
      .flatMap((tab) => {
        const items = [{ title: tab.label, to: tab.to, category: 'Page' }];
        if (tab.subItems) {
          tab.subItems.forEach((sub) => {
            items.push({ title: `${tab.label} > ${sub.label}`, to: sub.to, category: 'Action' });
          });
        }
        return items;
      })
      .filter((item) =>
        searchQuery ? item.title.toLowerCase().includes(searchQuery.toLowerCase().trim()) : true
      );
  }, [searchableModules, searchQuery]);

  // Generic key listener for trigger buttons to open dropdowns on Enter / Space / ArrowDown
  const makeTriggerKeyDown = (
    isOpen: boolean,
    setOpen: (v: boolean) => void
  ) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
    }
  };

  return (
    <header
      className="sticky top-0 w-full flex flex-col bg-white dark:bg-[#181B26] border-b border-slate-200 dark:border-[#2A3042] transition-colors duration-150"
      style={{ zIndex: LAYERS.HEADER }}
    >
      {/* ═══════════════════════════════════════════════════════════════════════
          TIER 1: UTILITY / WORKSPACE TOP BAR
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="h-12 px-3 sm:px-4 flex items-center justify-between gap-2 sm:gap-4 border-b border-slate-200/80 dark:border-[#2A3042]">
        
        {/* Left: Permanent Brand Logo & Name */}
        <div className="flex items-center gap-2.5 shrink-0">
          <NavLink
            to={isPlatformOwner ? '/platform/companies' : (hasPage('dashboard') ? '/dashboard' : homePageRoute)}
            className="flex items-center gap-2.5 group"
          >
            <BrandLogo size={32} />
            <div className="hidden sm:flex flex-col text-left pl-2 border-l border-slate-200 dark:border-[#2A3042]">
              <span
                className="text-xs font-bold text-slate-900 dark:text-white tracking-tight leading-none"
                data-testid="portal-company-name"
              >
                JNC CRM
              </span>
            </div>
          </NavLink>
        </div>

        {/* Center: Global Search Bar */}
        {!isPlatformOwner ? (
          <div className="flex-1 max-w-xl relative">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                className="w-full h-8 pl-8 pr-16 rounded-lg bg-white dark:bg-[#1E2230] border border-slate-300/80 dark:border-[#2A3042] text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-crm-blue focus:ring-1 focus:ring-crm-blue shadow-2xs transition-all"
              />
              <kbd className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-400 bg-slate-100 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded">
                Ctrl K
              </kbd>
            </div>

            {/* Search Dropdown / Command Palette */}
            <AnimatePresence>
              {searchFocused && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  style={{ zIndex: LAYERS.DROPDOWN }}
                  className="absolute top-10 left-0 right-0 rounded-xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-xl p-2 overflow-hidden"
                >
                  <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2 py-1">
                    {searchQuery ? `Matching Results for "${searchQuery}"` : 'Quick Jump / Navigation'}
                  </div>
                  <div className="space-y-0.5 mt-1 max-h-60 overflow-y-auto">
                    {searchResults.map((res, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          navigate(res.to);
                          setSearchFocused(false);
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-slate-700 dark:text-slate-200 hover:bg-crm-blue/10 hover:text-crm-blue dark:hover:bg-white/5 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2">
                          <Sparkles size={12} className="text-crm-blue shrink-0" />
                          <span>{res.title}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">{res.category}</span>
                      </button>
                    ))}
                    {searchResults.length === 0 && (
                      <div className="p-4 text-center text-xs text-slate-400">
                        No matching records found. Press Enter to search on page.
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="flex-1" />
        )}

        {/* Right: Global Utility Actions (Notification Bell, '+', Theme, Avatar) */}
        <div className="flex items-center gap-2 shrink-0">
          {/* 1. Notification Bell */}
          {!isPlatformOwner && hasPage('notifications') && (
            <NavLink
              to="/notifications"
              title="Notifications"
              className={({ isActive }) =>
                `w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                  isActive
                    ? 'bg-crm-blue text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10'
                }`
              }
            >
              <Bell size={16} />
            </NavLink>
          )}

          {/* 2. Global Quick Create (+) with Portaled Dropdown */}
          {!isPlatformOwner && hasQuickCreate && (
            <div>
              <button
                ref={quickCreateTriggerRef}
                id="quick-create-button"
                data-testid="quick-create-button"
                type="button"
                aria-haspopup="menu"
                aria-expanded={quickCreateOpen}
                aria-label="Quick Create menu"
                onClick={() => {
                  setQuickCreateOpen(!quickCreateOpen);
                  setProfileOpen(false);
                  setActiveTabDropdown(null);
                }}
                onKeyDown={makeTriggerKeyDown(quickCreateOpen, setQuickCreateOpen)}
                title="Quick Create (+)"
                className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold transition-all cursor-pointer ${
                  quickCreateOpen
                    ? 'bg-crm-blue text-white shadow-sm'
                    : 'bg-crm-blue/10 dark:bg-crm-blue/20 text-crm-blue hover:bg-crm-blue hover:text-white'
                }`}
              >
                <Plus size={16} />
              </button>

              <DropdownPortal
                id="quick-create-menu"
                isOpen={quickCreateOpen}
                onClose={() => setQuickCreateOpen(false)}
                triggerRef={quickCreateTriggerRef}
                preferredPlacement="bottom-end"
                className="w-64 space-y-1"
                aria-labelledby="quick-create-button"
              >
                <p className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Quick Actions
                </p>
                {hasPage('invoices') && (
                  <NavLink
                    role="menuitem"
                    to="/invoices?action=create"
                    onClick={() => setQuickCreateOpen(false)}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium hover:bg-emerald-500/10 text-slate-800 dark:text-slate-200 hover:text-emerald-600 transition-colors"
                  >
                    <Receipt size={14} className="text-emerald-500 shrink-0" />
                    <span>New Tax Invoice</span>
                  </NavLink>
                )}
                {hasPage('leads') && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setQuickCreateOpen(false);
                      setQuickLeadModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium hover:bg-crm-blue/10 text-slate-800 dark:text-slate-200 hover:text-crm-blue transition-colors text-left cursor-pointer"
                  >
                    <Users size={14} className="text-crm-blue shrink-0" />
                    <span>New Lead / Customer</span>
                  </button>
                )}
                {hasPage('orders') && (
                  <NavLink
                    role="menuitem"
                    to="/orders?action=create"
                    onClick={() => setQuickCreateOpen(false)}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium hover:bg-amber-500/10 text-slate-800 dark:text-slate-200 hover:text-amber-600 transition-colors"
                  >
                    <ShoppingCart size={14} className="text-amber-500 shrink-0" />
                    <span>New Customer Order</span>
                  </NavLink>
                )}
                {hasPage('quotations') && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setQuickCreateOpen(false);
                      setQuickQuoteModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium hover:bg-indigo-500/10 text-slate-800 dark:text-slate-200 hover:text-indigo-600 transition-colors text-left cursor-pointer"
                  >
                    <FileText size={14} className="text-indigo-500 shrink-0" />
                    <span>New Quotation</span>
                  </button>
                )}
                {hasPage('inventory') && (
                  <NavLink
                    role="menuitem"
                    to="/inventory?action=create"
                    onClick={() => setQuickCreateOpen(false)}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium hover:bg-purple-500/10 text-slate-800 dark:text-slate-200 hover:text-purple-600 transition-colors"
                  >
                    <Package size={14} className="text-purple-500 shrink-0" />
                    <span>Add Inventory Component</span>
                  </NavLink>
                )}
                {hasPage('users') && (
                  <NavLink
                    role="menuitem"
                    to="/users?action=create"
                    onClick={() => setQuickCreateOpen(false)}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium hover:bg-blue-500/10 text-slate-800 dark:text-slate-200 hover:text-blue-600 transition-colors border-t border-slate-100 dark:border-white/5 pt-2"
                  >
                    <UserPlus size={14} className="text-blue-500 shrink-0" />
                    <span>Add Team Member</span>
                  </NavLink>
                )}
              </DropdownPortal>
            </div>
          )}

          {/* 3. Theme Switcher */}
          <button
            type="button"
            onClick={toggleTheme}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-white/5 transition-all cursor-pointer"
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle theme"
          >
            {isDark ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-indigo-600" />}
          </button>

          {/* 4. User Profile Avatar with Portaled Dropdown */}
          <div>
            <button
              ref={profileTriggerRef}
              id="user-profile-button"
              data-testid="user-profile-button"
              type="button"
              aria-label="User profile menu"
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              onClick={() => {
                setProfileOpen(!profileOpen);
                setQuickCreateOpen(false);
                setActiveTabDropdown(null);
              }}
              onKeyDown={makeTriggerKeyDown(profileOpen, setProfileOpen)}
              className={`flex flex-col items-center justify-center px-1.5 py-0.5 rounded-xl border transition-all cursor-pointer ${
                profileOpen
                  ? 'bg-crm-blue/10 border-crm-blue ring-1 ring-crm-blue/30 text-crm-blue'
                  : 'border-transparent hover:bg-slate-200/60 dark:hover:bg-white/5 hover:border-slate-300 dark:hover:border-[#2A3042] text-slate-700 dark:text-slate-300'
              }`}
              title={`Signed in as ${user?.name || 'User'}`}
            >
              <div className="w-6 h-6 rounded-full bg-crm-blue flex items-center justify-center text-white font-bold text-[11px] shadow-xs shrink-0">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <span className="text-[10px] font-bold tracking-tight max-w-[70px] truncate leading-tight mt-0.5 text-center text-slate-800 dark:text-slate-200">
                {user?.name || 'User'}
              </span>
            </button>

            <DropdownPortal
              id="user-profile-menu"
              isOpen={profileOpen}
              onClose={() => setProfileOpen(false)}
              triggerRef={profileTriggerRef}
              preferredPlacement="bottom-end"
              className="w-64 p-2"
              aria-labelledby="user-profile-button"
            >
              {/* Profile Header */}
              <div className="p-3 bg-slate-50 dark:bg-[#1E2230] rounded-xl border border-slate-200/80 dark:border-[#2A3042]/80 mb-2">
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{user?.name}</p>
                <p className="text-[10px] font-mono text-crm-blue dark:text-crm-teal truncate mt-0.5">
                  {user?.email || user?.employeeCode}
                </p>
                <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-200/60 dark:border-[#2A3042]/60">
                  <ShieldCheck size={12} className="text-emerald-500 shrink-0" />
                  <span className="text-[10px] text-slate-600 dark:text-slate-300 font-semibold capitalize truncate">
                    {user?.role?.replace('_', ' ')}
                  </span>
                </div>
              </div>

              {/* Workspace Scope */}
              <div className="px-2.5 py-1.5 mb-2 rounded-lg bg-slate-100/50 dark:bg-white/5 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between">
                <div>
                  <span>Workspace: </span>
                  <strong className="text-slate-900 dark:text-white">
                    {isPlatformOwner ? 'Platform Administration' : 'JNC CRM'}
                  </strong>
                </div>
              </div>

              {/* Navigation Links inside Profile */}
              {isPlatformOwner ? (
                <div className="space-y-0.5 mb-1 pb-1 border-b border-slate-100 dark:border-white/5">
                  <NavLink
                    role="menuitem"
                    to="/platform/companies"
                    onClick={() => setProfileOpen(false)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                  >
                    <Building2 size={13} className="text-crm-blue shrink-0" />
                    <span>Client Companies</span>
                  </NavLink>
                  <NavLink
                    role="menuitem"
                    to="/platform/admins"
                    onClick={() => setProfileOpen(false)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                  >
                    <ShieldCheck size={13} className="text-purple-600 shrink-0" />
                    <span>Platform Admins</span>
                  </NavLink>
                </div>
              ) : (
                <div className="space-y-0.5 mb-1 pb-1 border-b border-slate-100 dark:border-white/5">
                  {canAccessSetupStudio && (
                    <NavLink
                      role="menuitem"
                      to="/start-setup"
                      onClick={() => setProfileOpen(false)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 hover:bg-crm-blue/10 hover:text-crm-blue dark:hover:bg-white/5 transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <Sliders
                          size={13}
                          className="text-crm-blue shrink-0 group-hover:rotate-45 transition-transform"
                        />
                        <span>Setup Studio</span>
                      </div>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-crm-blue/10 text-crm-blue font-bold">
                        Admin
                      </span>
                    </NavLink>
                  )}

                  {hasPage('users') && (
                    <NavLink
                      role="menuitem"
                      to="/users"
                      onClick={() => setProfileOpen(false)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                    >
                      <ShieldCheck size={13} className="text-crm-blue shrink-0" />
                      <span>User Accounts & Roles</span>
                    </NavLink>
                  )}
                  {hasPage('teams') && (
                    <NavLink
                      role="menuitem"
                      to="/users?tab=teams"
                      onClick={() => setProfileOpen(false)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                    >
                      <Users size={13} className="text-purple-500 shrink-0" />
                      <span>Access Teams</span>
                    </NavLink>
                  )}
                  {hasPage('audit_logs') && (
                    <NavLink
                      role="menuitem"
                      to="/audit-logs"
                      onClick={() => setProfileOpen(false)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                    >
                      <ShieldCheck size={13} className="text-amber-500 shrink-0" />
                      <span>Security & Audit Logs</span>
                    </NavLink>
                  )}
                  {hasPage('branding') && (
                    <NavLink
                      role="menuitem"
                      to="/settings/branding"
                      onClick={() => setProfileOpen(false)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                    >
                      <Building2 size={13} className="text-crm-teal shrink-0" />
                      <span>Branding & GST Profile</span>
                    </NavLink>
                  )}
                  {hasPage('mail_settings') && (
                    <NavLink
                      role="menuitem"
                      to="/settings/mail"
                      onClick={() => setProfileOpen(false)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                    >
                      <Mail size={13} className="text-indigo-500 shrink-0" />
                      <span>Mail Accounts</span>
                    </NavLink>
                  )}
                </div>
              )}

              {/* My Account */}
              <NavLink
                role="menuitem"
                to="/account"
                onClick={() => setProfileOpen(false)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors mb-1"
              >
                <User size={13} className="text-crm-blue shrink-0" />
                <span>My Account</span>
              </NavLink>

              {/* Logout Session */}
              <button
                role="menuitem"
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-semibold text-crm-coral hover:bg-red-500/10 transition-colors text-left cursor-pointer"
              >
                <LogOut size={14} className="shrink-0" />
                <span>Logout Session</span>
              </button>
            </DropdownPortal>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          TIER 2: APP NAVIGATION TABS (Dynamic measurement: never overflows or clips)
          Tabs that do not fit move into 'More' automatically.
          ═══════════════════════════════════════════════════════════════════════ */}
      <div
        ref={tabsContainerRef}
        id="nav-tabs-container"
        data-testid="nav-tabs-container"
        className="h-10 px-3 sm:px-4 flex items-center justify-between relative bg-white dark:bg-[#181B26] border-b border-slate-200/80 dark:border-[#2A3042]"
      >
        {/* Left: App Title + Nav Tabs */}
        <div className="flex items-center gap-1 h-full min-w-0 flex-1 overflow-x-auto scrollbar-none">
          {/* CRM App Title (visible on lg+) */}
          <span className="text-xs font-black text-slate-900 dark:text-white mr-2 tracking-tight shrink-0 hidden lg:inline">
            CRM
          </span>

          {/* Primary Nav Tabs */}
          <nav
            aria-label="Application Tabs"
            className="flex items-center h-full gap-0.5 flex-nowrap"
          >
            {visibleTabs.map((item) => {
              const isActive = item.to.includes('?')
                ? (location.pathname + location.search) === item.to
                : location.pathname === item.to;
              const isDropdownOpen = activeTabDropdown === item.to;

              return (
                <div key={item.key} className="h-full flex items-center shrink-0">
                  <div
                    className={`h-full flex items-center rounded-none border-b-2 transition-all ${
                      isActive
                        ? 'border-crm-blue bg-crm-blue/[0.08] dark:bg-crm-blue/15 text-crm-blue dark:text-white font-bold'
                        : 'border-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 font-medium'
                    }`}
                  >
                    {/* Direct Page Link */}
                    <NavLink
                      to={item.to}
                      end={item.to === '/' || item.to === '/platform/companies'}
                      className="px-2.5 py-2 text-xs flex items-center gap-1.5 whitespace-nowrap h-full"
                    >
                      <item.icon size={13} className={isActive ? 'text-crm-blue' : 'opacity-75'} />
                      <span>{item.label}</span>
                    </NavLink>

                    {/* Dropdown Arrow (if subItems exist) */}
                    {item.subItems && item.subItems.length > 0 && (
                      <>
                        <button
                          ref={(el) => {
                            tabTriggerRefs.current[item.to] = el;
                          }}
                          type="button"
                          aria-haspopup="menu"
                          aria-expanded={isDropdownOpen}
                          aria-label={`${item.label} quick actions menu`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveTabDropdown(isDropdownOpen ? null : item.to);
                            setProfileOpen(false);
                            setQuickCreateOpen(false);
                          }}
                          onKeyDown={makeTriggerKeyDown(isDropdownOpen, (val) =>
                            setActiveTabDropdown(val ? item.to : null)
                          )}
                          className={`px-1.5 h-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer ${
                            isDropdownOpen ? 'bg-black/10 dark:bg-white/15' : ''
                          }`}
                          title={`${item.label} Actions`}
                        >
                          <ChevronDown
                            size={11}
                            className={`transition-transform duration-150 ${
                              isDropdownOpen ? 'rotate-180 text-crm-blue' : ''
                            }`}
                          />
                        </button>

                        <DropdownPortal
                          isOpen={isDropdownOpen}
                          onClose={() => setActiveTabDropdown(null)}
                          triggerRef={{ current: tabTriggerRefs.current[item.to] || null }}
                          preferredPlacement="bottom-start"
                          className="min-w-[220px] p-2"
                        >
                          <div className="flex items-center justify-between px-2.5 py-1 mb-1 border-b border-slate-100 dark:border-white/5">
                            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                              {item.label} Actions
                            </span>
                            <span className="text-[9px] font-mono text-crm-blue dark:text-crm-teal font-semibold">
                              Quick Menu
                            </span>
                          </div>
                          <div className="space-y-0.5">
                            {item.subItems.map((sub, sIdx) => (
                              <NavLink
                                key={sIdx}
                                role="menuitem"
                                to={sub.to}
                                onClick={() => setActiveTabDropdown(null)}
                                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all ${
                                  sub.isAction
                                    ? 'font-bold bg-crm-blue/10 text-crm-blue hover:bg-crm-blue hover:text-white dark:bg-crm-blue/20 dark:hover:bg-crm-blue dark:text-white shadow-2xs'
                                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                                }`}
                              >
                                <span>{sub.label}</span>
                                {sub.isAction && <Plus size={13} className="shrink-0" />}
                              </NavLink>
                            ))}
                          </div>
                        </DropdownPortal>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Quick Add Modals */}
      <CreateLeadModal
        isOpen={quickLeadModalOpen}
        onClose={() => setQuickLeadModalOpen(false)}
        onSuccess={(_lead, action) => {
          if (action === 'close') {
            navigate('/leads');
          }
        }}
      />

      <CreateQuotationModal
        isOpen={quickQuoteModalOpen}
        onClose={() => setQuickQuoteModalOpen(false)}
        onSuccess={(_quote, action) => {
          if (action === 'close') {
            navigate('/quotations');
          }
        }}
      />
    </header>
  );
}
