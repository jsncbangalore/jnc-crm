import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useBranding } from '../../contexts/BrandingContext';
import {
  LayoutDashboard, Users, ShoppingCart, Package, Truck, LogOut,
  Building2, FileText, Shield, Bell, ChevronDown, Settings, ShieldCheck,
  Receipt, Sun, Moon, ClipboardList, Search, Plus, Star, Grid,
  CheckCircle2, ArrowRight, ExternalLink, Sparkles, X, UserPlus,
  FilePlus, ShoppingBag, Box, UserCheck, HelpCircle, Layers, Bookmark
} from 'lucide-react';

// ─── NAV ITEM INTERFACE ──────────────────────────────────────────────────────
interface NavTabItem {
  to: string;
  icon: any;
  label: string;
  roles?: string[];
  pageKey?: string;
  subItems?: { label: string; to: string; isAction?: boolean }[];
}

// ─── PLATFORM OWNER MASTER NAVIGATION ─────────────────────────────────────────
const platformMasterNavItems: NavTabItem[] = [
  {
    to: '/platform/companies',
    icon: Building2,
    label: 'Companies Hub',
    pageKey: 'companies',
    subItems: [
      { label: 'All Registered Companies', to: '/platform/companies' },
      { label: '+ Add New Company Tenant', to: '/platform/companies?action=create', isAction: true },
    ],
  },
  {
    to: '/users',
    icon: Shield,
    label: 'Global Users',
    pageKey: 'users',
    subItems: [
      { label: 'All Platform Users', to: '/users' },
      { label: '+ Add Global User', to: '/users?action=create', isAction: true },
    ],
  },
];

const clientOrgNavItems: NavTabItem[] = [
  {
    to: '/',
    icon: LayoutDashboard,
    label: 'Home',
    roles: ['tenant_admin', 'super_admin', 'admin', 'sub_admin', 'employee', 'store_manager'],
    pageKey: 'dashboard',
  },
  {
    to: '/leads',
    icon: Users,
    label: 'Leads',
    roles: ['tenant_admin', 'super_admin', 'admin', 'sub_admin', 'employee'],
    pageKey: 'leads',
    subItems: [
      { label: '+ New Lead', to: '/leads?action=create', isAction: true },
      { label: 'All Leads', to: '/leads' },
      { label: 'My Assigned Leads', to: '/leads?filter=my' },
      { label: 'Converted Pipeline', to: '/leads?filter=converted' },
    ],
  },
  {
    to: '/orders',
    icon: ShoppingCart,
    label: 'Orders',
    roles: ['tenant_admin', 'super_admin', 'admin', 'sub_admin', 'employee'],
    pageKey: 'orders',
    subItems: [
      { label: '+ Create Order', to: '/orders?action=create', isAction: true },
      { label: 'All Orders', to: '/orders' },
      { label: 'Pending Production', to: '/orders?filter=pending' },
      { label: 'Ready for Dispatch', to: '/orders?filter=ready' },
    ],
  },
  {
    to: '/invoices',
    icon: Receipt,
    label: 'Invoices',
    roles: ['tenant_admin', 'super_admin', 'admin', 'sub_admin', 'employee'],
    pageKey: 'invoices',
    subItems: [
      { label: '+ Create Tax Invoice / Document', to: '/invoices?action=create', isAction: true },
      { label: 'All Invoices', to: '/invoices' },
      { label: 'Unpaid & Overdue', to: '/invoices?filter=unpaid' },
      { label: 'LUT / Export Documents', to: '/invoices?filter=lut' },
    ],
  },
  {
    to: '/inventory',
    icon: Package,
    label: 'Inventory',
    roles: ['tenant_admin', 'super_admin', 'admin', 'sub_admin', 'employee', 'store_manager'],
    pageKey: 'inventory',
    subItems: [
      { label: '+ Add Component / SKU', to: '/inventory?action=create', isAction: true },
      { label: 'Project Stock Position', to: '/inventory?tab=stock' },
      { label: 'Component Library', to: '/inventory?tab=library' },
      { label: 'Purchase Bills Hub', to: '/inventory?tab=bills' },
    ],
  },
  {
    to: '/suppliers',
    icon: Building2,
    label: 'Suppliers',
    roles: ['tenant_admin', 'super_admin', 'admin', 'sub_admin', 'employee', 'store_manager'],
    pageKey: 'suppliers',
    subItems: [
      { label: '+ Add Supplier', to: '/suppliers?action=create', isAction: true },
      { label: 'All Suppliers', to: '/suppliers' },
      { label: 'Active Vendor Accounts', to: '/suppliers?filter=active' },
    ],
  },
  {
    to: '/shipments',
    icon: Truck,
    label: 'Shipments',
    roles: ['tenant_admin', 'super_admin', 'admin', 'sub_admin', 'employee', 'store_manager'],
    pageKey: 'shipments',
    subItems: [
      { label: '+ New Dispatch', to: '/shipments?action=create', isAction: true },
      { label: 'All Dispatches', to: '/shipments' },
      { label: 'In Transit', to: '/shipments?filter=transit' },
      { label: 'Delivered', to: '/shipments?filter=delivered' },
    ],
  },
  {
    to: '/quotations',
    icon: FileText,
    label: 'Quotations',
    roles: ['tenant_admin', 'super_admin', 'admin', 'sub_admin', 'employee'],
    pageKey: 'quotations',
    subItems: [
      { label: '+ New Quotation', to: '/quotations?action=create', isAction: true },
      { label: 'All Quotations', to: '/quotations' },
      { label: 'Pending Approvals', to: '/quotations?filter=pending' },
    ],
  },
  {
    to: '/daily-activities',
    icon: ClipboardList,
    label: 'Daily Activities',
    roles: ['tenant_admin', 'super_admin', 'admin', 'sub_admin', 'project_manager', 'developer_lead', 'developer'],
    pageKey: 'daily_activities',
    subItems: [
      { label: "Today's Task Logs", to: '/daily-activities' },
      { label: 'Developer Activity Feed', to: '/daily-activities?filter=dev' },
    ],
  },
  {
    to: '/users',
    icon: Shield,
    label: 'Team & Users',
    roles: ['tenant_admin', 'super_admin', 'admin'],
    pageKey: 'users',
    subItems: [
      { label: '+ Add Team Member', to: '/users?action=create', isAction: true },
      { label: 'All Staff Members', to: '/users' },
      { label: 'Department Teams & Roles', to: '/users?tab=teams' },
    ],
  },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { branding } = useBranding();
  const navigate = useNavigate();
  const location = useLocation();

  // Dropdown states
  const [profileOpen, setProfileOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [appLauncherOpen, setAppLauncherOpen] = useState(false);
  const [activeTabDropdown, setActiveTabDropdown] = useState<string | null>(null);

  // Global search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const navRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isPlatformOwner =
    user?.role === 'platform_super_admin' ||
    (user?.role === 'super_admin' && (!user?.tenantId || user?.tenantId === 'default-tenant-id'));

  const isAdmin = isPlatformOwner || user?.role === 'tenant_admin' || user?.role === 'admin' || user?.role === 'sub_admin';

  const visibleNavItems = isPlatformOwner
    ? platformMasterNavItems
    : clientOrgNavItems.filter((item) => !item.roles || item.roles.includes(user?.role || ''));

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
        setQuickCreateOpen(false);
        setFavoritesOpen(false);
        setSetupOpen(false);
        setAppLauncherOpen(false);
        setActiveTabDropdown(null);
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
        setFavoritesOpen(false);
        setSetupOpen(false);
        setProfileOpen(false);
        setAppLauncherOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close dropdowns on route change
  useEffect(() => {
    setProfileOpen(false);
    setQuickCreateOpen(false);
    setFavoritesOpen(false);
    setSetupOpen(false);
    setAppLauncherOpen(false);
    setActiveTabDropdown(null);
    setSearchFocused(false);
    setSearchQuery('');
  }, [location.pathname, location.search]);

  const handleLogout = () => {
    setProfileOpen(false);
    logout();
    navigate('/login');
  };

  // Filter searchable items
  const searchResults = visibleNavItems.flatMap(tab => {
    const items = [{ title: tab.label, to: tab.to, category: 'Main Module' }];
    if (tab.subItems) {
      tab.subItems.forEach(sub => {
        items.push({ title: `${tab.label} > ${sub.label}`, to: sub.to, category: sub.isAction ? 'Action' : 'List View' });
      });
    }
    return items;
  }).filter(item =>
    searchQuery.trim() === '' ||
    item.title.toLowerCase().includes(searchQuery.toLowerCase())
  ).slice(0, 8);

  return (
    <header ref={navRef} className="hidden lg:flex flex-col shrink-0 bg-white dark:bg-[#181B26] border-b border-slate-200 dark:border-[#2A3042] sticky top-0 z-40 select-none shadow-sm overflow-visible">
      {/* ═══════════════════════════════════════════════════════════════════════
          TIER 1: GLOBAL UTILITY HEADER BAR (48px)
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="h-12 px-4 flex items-center justify-between gap-4 border-b border-slate-200/80 dark:border-[#2A3042]/80 bg-slate-50/60 dark:bg-[#141721]/60 overflow-visible">
        
        {/* Left: App Launcher 9-Dots & Company Branding */}
        <div className="flex items-center gap-3 shrink-0">
          {/* 9-Dot App Launcher */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setAppLauncherOpen(!appLauncherOpen);
                setQuickCreateOpen(false);
                setFavoritesOpen(false);
                setSetupOpen(false);
                setProfileOpen(false);
              }}
              title="App Launcher"
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                appLauncherOpen
                  ? 'bg-crm-blue text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10'
              }`}
            >
              <Grid size={18} />
            </button>

            {/* App Launcher Modal / Drawer */}
            <AnimatePresence>
              {appLauncherOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 mt-2 w-80 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-2xl p-3 z-50 overflow-hidden"
                >
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-white/5">
                    <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">All CRM Apps</span>
                    <span className="text-[10px] text-slate-500 font-mono">Workspace Modules</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {visibleNavItems.map(item => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setAppLauncherOpen(false)}
                        className="flex items-center gap-2.5 p-2 rounded-xl border border-transparent hover:border-slate-200 dark:hover:border-[#2A3042] hover:bg-slate-50 dark:hover:bg-white/5 transition-all text-left group"
                      >
                        <div className="w-7 h-7 rounded-lg bg-crm-blue/10 dark:bg-crm-blue/20 text-crm-blue flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                          <item.icon size={15} />
                        </div>
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 group-hover:text-crm-blue truncate">
                          {item.label}
                        </span>
                      </NavLink>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Company Brand Logo & Workspace Name */}
          <NavLink
            to={isPlatformOwner ? "/platform/companies" : "/"}
            className="flex items-center gap-2.5 group"
          >
            <div className="h-7 px-1.5 py-0.5 rounded-md bg-white flex items-center justify-center shadow-xs border border-slate-200 dark:border-transparent">
              <img
                src={branding.companyLogoUrl || '/jnc-logo.jpg'}
                alt={branding.companyDisplayName}
                className="h-5 w-auto object-contain"
              />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-bold text-slate-900 dark:text-white tracking-tight leading-none truncate max-w-[170px]">
                {branding.companyDisplayName}
              </span>
              <span className="text-[9.5px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                {isPlatformOwner ? 'Master Platform' : 'Enterprise CRM Portal'}
              </span>
            </div>
          </NavLink>
        </div>

        {/* Center: Global Lightning Search Bar */}
        <div className="flex-1 max-w-xl relative">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search Leads, Orders, Invoices, Items... (Ctrl+K)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              className="w-full h-8 pl-8 pr-16 rounded-lg bg-white dark:bg-[#1E2230] border border-slate-300/80 dark:border-[#2A3042] text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:border-crm-blue focus:ring-1 focus:ring-crm-blue shadow-2xs transition-all"
            />
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-400 bg-slate-100 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded">
              ⌘K
            </kbd>
          </div>

          {/* Search Dropdown / Command Palette */}
          <AnimatePresence>
            {searchFocused && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="absolute top-10 left-0 right-0 rounded-xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-xl p-2 z-50 overflow-hidden"
              >
                <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2 py-1">
                  {searchQuery ? `Matching Results for "${searchQuery}"` : 'Quick Jump / Navigation'}
                </div>
                <div className="space-y-0.5 mt-1 max-h-60 overflow-y-auto">
                  {searchResults.map((res, idx) => (
                    <button
                      key={idx}
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

        {/* Right: Global Utility Actions (⭐, ➕, ⚙️, 🔔, ☀️/🌙, 👤) */}
        <div className="flex items-center gap-1.5 shrink-0">
          
          {/* Favorites Star Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setFavoritesOpen(!favoritesOpen);
                setQuickCreateOpen(false);
                setSetupOpen(false);
                setProfileOpen(false);
                setAppLauncherOpen(false);
              }}
              title="Favorites & Bookmarks"
              className={`h-8 px-2 rounded-lg flex items-center gap-1 border transition-all text-xs font-semibold ${
                favoritesOpen
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-500'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-white/5'
              }`}
            >
              <Star size={14} className="fill-amber-400 text-amber-500" />
              <ChevronDown size={11} className={`transition-transform duration-200 ${favoritesOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {favoritesOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.96 }}
                  className="absolute right-0 mt-2 w-56 rounded-xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-xl p-1.5 z-50"
                >
                  <p className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pinned Favorites</p>
                  <NavLink to="/invoices" onClick={() => setFavoritesOpen(false)} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200">
                    <Receipt size={13} className="text-emerald-500" />
                    <span>Invoices & Billing</span>
                  </NavLink>
                  <NavLink to="/leads" onClick={() => setFavoritesOpen(false)} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200">
                    <Users size={13} className="text-crm-blue" />
                    <span>Active Leads Pipeline</span>
                  </NavLink>
                  <NavLink to="/orders" onClick={() => setFavoritesOpen(false)} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200">
                    <ShoppingCart size={13} className="text-amber-500" />
                    <span>Production Orders</span>
                  </NavLink>
                  <NavLink to="/inventory" onClick={() => setFavoritesOpen(false)} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200">
                    <Package size={13} className="text-crm-violet" />
                    <span>Component Stock Positions</span>
                  </NavLink>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Global Quick Create ➕ Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setQuickCreateOpen(!quickCreateOpen);
                setFavoritesOpen(false);
                setSetupOpen(false);
                setProfileOpen(false);
                setAppLauncherOpen(false);
              }}
              title="Global Quick Create (+)"
              className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold transition-all ${
                quickCreateOpen
                  ? 'bg-crm-blue text-white shadow-sm'
                  : 'bg-crm-blue/10 dark:bg-crm-blue/20 text-crm-blue hover:bg-crm-blue hover:text-white'
              }`}
            >
              <Plus size={16} />
            </button>

            <AnimatePresence>
              {quickCreateOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.96 }}
                  className="absolute right-0 mt-2 w-64 rounded-xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-xl p-2 z-50 space-y-1"
                >
                  <p className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quick Actions</p>
                  <NavLink to="/invoices?action=create" onClick={() => setQuickCreateOpen(false)} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium hover:bg-emerald-500/10 text-slate-800 dark:text-slate-200 hover:text-emerald-600 transition-colors">
                    <Receipt size={14} className="text-emerald-500" />
                    <span>New Tax Invoice</span>
                  </NavLink>
                  <NavLink to="/leads?action=create" onClick={() => setQuickCreateOpen(false)} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium hover:bg-crm-blue/10 text-slate-800 dark:text-slate-200 hover:text-crm-blue transition-colors">
                    <Users size={14} className="text-crm-blue" />
                    <span>New Lead / Customer</span>
                  </NavLink>
                  <NavLink to="/orders?action=create" onClick={() => setQuickCreateOpen(false)} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium hover:bg-amber-500/10 text-slate-800 dark:text-slate-200 hover:text-amber-600 transition-colors">
                    <ShoppingCart size={14} className="text-amber-500" />
                    <span>New Customer Order</span>
                  </NavLink>
                  <NavLink to="/quotations?action=create" onClick={() => setQuickCreateOpen(false)} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium hover:bg-indigo-500/10 text-slate-800 dark:text-slate-200 hover:text-indigo-600 transition-colors">
                    <FileText size={14} className="text-indigo-500" />
                    <span>New Quotation</span>
                  </NavLink>
                  <NavLink to="/inventory?action=create" onClick={() => setQuickCreateOpen(false)} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium hover:bg-purple-500/10 text-slate-800 dark:text-slate-200 hover:text-purple-600 transition-colors">
                    <Package size={14} className="text-purple-500" />
                    <span>Add Inventory Component</span>
                  </NavLink>
                  {isAdmin && (
                    <NavLink to="/users?action=create" onClick={() => setQuickCreateOpen(false)} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium hover:bg-blue-500/10 text-slate-800 dark:text-slate-200 hover:text-blue-600 transition-colors border-t border-slate-100 dark:border-white/5 pt-2">
                      <UserPlus size={14} className="text-blue-500" />
                      <span>Add Team Member</span>
                    </NavLink>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Setup / Configuration Gear ⚙️ */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setSetupOpen(!setupOpen);
                setQuickCreateOpen(false);
                setFavoritesOpen(false);
                setProfileOpen(false);
                setAppLauncherOpen(false);
              }}
              title="Setup & Administration"
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                setupOpen
                  ? 'bg-slate-200 dark:bg-white/15 text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-white/5'
              }`}
            >
              <Settings size={16} />
            </button>

            <AnimatePresence>
              {setupOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.96 }}
                  className="absolute right-0 mt-2 w-60 rounded-xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-xl p-1.5 z-50"
                >
                  <p className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Setup & Settings</p>
                  {isPlatformOwner ? (
                    <NavLink to="/platform/companies" onClick={() => setSetupOpen(false)} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs hover:bg-indigo-500/10 text-indigo-600 font-semibold">
                      <Building2 size={13} />
                      <span>Companies Master Hub</span>
                    </NavLink>
                  ) : null}
                  <NavLink to="/settings/branding" onClick={() => setSetupOpen(false)} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200">
                    <Building2 size={13} className="text-crm-teal" />
                    <span>Company Branding & GST</span>
                  </NavLink>
                  <NavLink to="/users" onClick={() => setSetupOpen(false)} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200">
                    <Shield size={13} className="text-crm-blue" />
                    <span>Team & Role Permissions</span>
                  </NavLink>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Theme Switcher ☀️ / 🌙 */}
          <button
            type="button"
            onClick={toggleTheme}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-white/5 transition-all cursor-pointer"
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDark ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-indigo-600" />}
          </button>

          {/* User Profile Avatar with Slide Drawer 👤 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setProfileOpen(!profileOpen);
                setQuickCreateOpen(false);
                setFavoritesOpen(false);
                setSetupOpen(false);
                setAppLauncherOpen(false);
              }}
              className={`flex items-center gap-1.5 p-1 rounded-full border transition-all ${
                profileOpen
                  ? 'border-crm-blue ring-2 ring-crm-blue/20'
                  : 'border-slate-300 dark:border-[#2A3042] hover:border-crm-blue'
              }`}
            >
              <div className="w-6 h-6 rounded-full bg-crm-blue flex items-center justify-center text-white font-bold text-[11px]">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
            </button>

            <AnimatePresence>
              {profileOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.96 }}
                  className="absolute right-0 mt-2 w-64 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-2xl p-2 z-50 overflow-hidden"
                >
                  {/* Profile Header */}
                  <div className="p-3 bg-slate-50 dark:bg-[#1E2230] rounded-xl border border-slate-200/80 dark:border-[#2A3042]/80 mb-2">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{user?.name}</p>
                    <p className="text-[10px] font-mono text-crm-blue dark:text-crm-teal truncate mt-0.5">{user?.email || user?.employeeCode}</p>
                    <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-200/60 dark:border-[#2A3042]/60">
                      <ShieldCheck size={12} className="text-emerald-500 shrink-0" />
                      <span className="text-[10px] text-slate-600 dark:text-slate-300 font-semibold capitalize truncate">
                        {user?.role?.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  {/* Company Scope */}
                  <div className="px-2.5 py-1.5 mb-2 rounded-lg bg-slate-100/50 dark:bg-white/5 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between">
                    <div>
                      <span>Workspace: </span>
                      <strong className="text-slate-900 dark:text-white">{branding.companyDisplayName}</strong>
                    </div>
                  </div>

                  {/* Company Business Details Link */}
                  {isAdmin && (
                    <NavLink
                      to="/settings/branding"
                      onClick={() => setProfileOpen(false)}
                      className="w-full flex items-center gap-2 px-2.5 py-2 mb-1 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                    >
                      <Building2 size={14} className="text-crm-teal" />
                      <span>Company Profile & Details</span>
                    </NavLink>
                  )}

                  {/* Logout Session */}
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-semibold text-crm-coral hover:bg-red-500/10 transition-colors text-left"
                  >
                    <LogOut size={14} />
                    <span>Logout Session</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          TIER 2: APP NAVIGATION TABS (40px)
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="h-10 px-4 flex items-center justify-between overflow-visible relative bg-white dark:bg-[#181B26]">
        
        {/* Left: App Title + Nav Tabs */}
        <div className="flex items-center gap-1 h-full overflow-visible">
          {/* CRM App Title */}
          <span className="text-xs font-black text-slate-900 dark:text-white mr-3 tracking-tight shrink-0 hidden xl:inline">
            CRM
          </span>

          {/* Tabs */}
          <nav className="flex items-center h-full gap-0.5 overflow-visible">
            {visibleNavItems.map((item) => {
              const isActive = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to));
              const isDropdownOpen = activeTabDropdown === item.to;

              return (
                <div key={item.to} className="relative h-full flex items-center">
                  {/* Split Button Group: Tab Link + Dropdown Arrow ▾ */}
                  <div className={`h-full flex items-center rounded-none border-b-2 transition-all ${
                    isActive
                      ? 'border-crm-blue bg-crm-blue/[0.08] dark:bg-crm-blue/15 text-crm-blue dark:text-white font-bold'
                      : 'border-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 font-medium'
                  }`}>
                    {/* Direct Page Link */}
                    <NavLink
                      to={item.to}
                      end={item.to === '/' || item.to === '/platform/companies'}
                      className="px-2.5 py-2 text-xs flex items-center gap-1.5 whitespace-nowrap h-full"
                    >
                      <item.icon size={13} className={isActive ? 'text-crm-blue' : 'opacity-75'} />
                      <span>{item.label}</span>
                    </NavLink>

                    {/* Dropdown Arrow ▾ (if sub-items exist) */}
                    {item.subItems && item.subItems.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTabDropdown(isDropdownOpen ? null : item.to);
                        }}
                        className={`px-1.5 h-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors ${
                          isDropdownOpen ? 'bg-black/10 dark:bg-white/15' : ''
                        }`}
                        title={`${item.label} Menu`}
                      >
                        <ChevronDown size={11} className={`transition-transform duration-150 ${isDropdownOpen ? 'rotate-180 text-crm-blue' : ''}`} />
                      </button>
                    )}
                  </div>

                  {/* Tab Dropdown Popover - Elevated High Z-Index */}
                  <AnimatePresence>
                    {isDropdownOpen && item.subItems && (
                      <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.96 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 top-full mt-1 min-w-[240px] rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-2xl p-2 z-[100]"
                      >
                        <div className="flex items-center justify-between px-2.5 py-1 mb-1 border-b border-slate-100 dark:border-white/5">
                          <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">{item.label} Actions</span>
                          <span className="text-[9px] font-mono text-crm-blue dark:text-crm-teal font-semibold">Quick Menu</span>
                        </div>
                        <div className="space-y-0.5">
                          {item.subItems.map((sub, sIdx) => (
                            <NavLink
                              key={sIdx}
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
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </nav>
        </div>

        {/* Right: Personalize Tabs Icon (✏️) */}
        <div className="flex items-center gap-2 shrink-0 pl-2">
          <button
            type="button"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            title="Personalize Navigation Bar"
          >
            <Settings size={13} />
          </button>
        </div>
      </div>
    </header>
  );
}
