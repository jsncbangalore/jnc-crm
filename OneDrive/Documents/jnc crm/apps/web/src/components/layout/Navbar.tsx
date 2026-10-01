import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useBranding } from '../../contexts/BrandingContext';
import {
  LayoutDashboard, Users, ShoppingCart, Package,
  Truck, LogOut, Zap, Building2, FileText, Shield, ExternalLink, Boxes, Bell,
  ChevronDown, Settings, User as UserIcon, ShieldCheck, Receipt, Sun, Moon, ClipboardList
} from 'lucide-react';

// ─── PLATFORM OWNER MASTER NAVIGATION ─────────────────────────────────────────
const platformMasterNavItems = [
  { to: '/platform/companies', icon: Building2, label: 'Companies Hub' },
  { to: '/users',              icon: Shield,    label: 'Global Users' },
];

// ─── CLIENT ORGANIZATION CRM NAVIGATION ──────────────────────────────────────
const clientOrgNavItems = [
  { to: '/',              icon: LayoutDashboard, label: 'Dashboard',        roles: ['tenant_admin', 'super_admin', 'admin', 'sub_admin', 'employee', 'store_manager'], pageKey: 'dashboard' },
  { to: '/leads',         icon: Users,           label: 'Leads',            roles: ['tenant_admin', 'super_admin', 'admin', 'sub_admin', 'employee'], pageKey: 'leads' },
  { to: '/notifications', icon: Bell,            label: 'Inbox & Alerts',   roles: ['tenant_admin', 'super_admin', 'admin', 'sub_admin', 'employee'], pageKey: 'notifications' },
  { to: '/orders',        icon: ShoppingCart,    label: 'Orders',           roles: ['tenant_admin', 'super_admin', 'admin', 'sub_admin', 'employee'], pageKey: 'orders' },
  { to: '/invoices',      icon: Receipt,         label: 'Invoices',         roles: ['tenant_admin', 'super_admin', 'admin', 'sub_admin', 'employee'], pageKey: 'invoices' },
  { to: '/inventory',     icon: Package,         label: 'Inventory',        roles: ['tenant_admin', 'super_admin', 'admin', 'sub_admin', 'employee', 'store_manager'], pageKey: 'inventory' },
  { to: '/suppliers',     icon: Building2,       label: 'Suppliers',        roles: ['tenant_admin', 'super_admin', 'admin', 'sub_admin', 'employee', 'store_manager'], pageKey: 'suppliers' },
  { to: '/shipments',     icon: Truck,           label: 'Shipments',        roles: ['tenant_admin', 'super_admin', 'admin', 'sub_admin', 'employee', 'store_manager'], pageKey: 'shipments' },
  { to: '/quotations',    icon: FileText,        label: 'Quotations',       roles: ['tenant_admin', 'super_admin', 'admin', 'sub_admin', 'employee'], pageKey: 'quotations' },
  { to: '/daily-activities', icon: ClipboardList, label: 'Daily Activities', roles: ['tenant_admin', 'super_admin', 'admin', 'sub_admin', 'project_manager', 'developer_lead', 'developer'], pageKey: 'daily_activities' },
  { to: '/users',         icon: Shield,          label: 'Team & Users',     roles: ['tenant_admin', 'super_admin', 'admin'], pageKey: 'users' },
];

const colorForPath: Record<string, string> = {
  '/':                  'text-crm-blue',
  '/leads':             'text-crm-blue',
  '/notifications':     'text-crm-blue-light',
  '/orders':            'text-crm-amber',
  '/invoices':          'text-emerald-500',
  '/inventory':         'text-crm-violet',
  '/suppliers':         'text-crm-violet-light',
  '/shipments':         'text-crm-teal',
  '/quotations':        'text-amber-500',
  '/daily-activities':  'text-emerald-500',
  '/platform/companies':'text-indigo-600 dark:text-indigo-400',
  '/users':             'text-crm-blue',
  '/settings/branding': 'text-crm-teal',
  '/automation':        'text-crm-coral',
  '/setup/objects':     'text-crm-teal',
};

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, isDark, toggleTheme } = useTheme();
  const { branding } = useBranding();
  const navigate = useNavigate();
  const location = useLocation();

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const isPlatformOwner =
    user?.role === 'platform_super_admin' ||
    (user?.role === 'super_admin' && (!user?.tenantId || user?.tenantId === 'default-tenant-id'));

  const isAdmin = isPlatformOwner || user?.role === 'tenant_admin' || user?.role === 'admin' || user?.role === 'sub_admin';

  const visibleNavItems = isPlatformOwner
    ? platformMasterNavItems
    : clientOrgNavItems.filter((item) => !item.roles || item.roles.includes(user?.role || ''));

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    setProfileOpen(false);
    logout();
    navigate('/login');
  };

  return (
    <header className="hidden lg:flex h-14 shrink-0 bg-white/95 dark:bg-[#181B26]/95 backdrop-blur-md border-b border-slate-200 dark:border-[#2A3042] sticky top-0 z-40 px-4 sm:px-5 items-center justify-between gap-3">
      {/* ─── BRAND LOGO & OFFICIAL SITE LINK ───────────────────────────────── */}
      <div className="flex items-center gap-2.5 shrink-0">
        <NavLink to={isPlatformOwner ? "/platform/companies" : "/"} className="flex items-center gap-2.5 group">
          <div className="h-9 px-1.5 py-0.5 rounded-lg bg-white dark:bg-white flex items-center justify-center shadow-sm border border-slate-200 dark:border-transparent hover:opacity-95 transition-opacity">
            <img
              src={branding.companyLogoUrl || '/jnc-logo.jpg'}
              alt={branding.companyDisplayName}
              className="h-7 w-auto object-contain"
            />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-xs font-black text-slate-900 dark:text-white tracking-tight hidden 2xl:inline max-w-[160px] truncate">
              {branding.companyDisplayName}
            </span>
            {isPlatformOwner && (
              <span className="text-[9px] font-mono text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider hidden 2xl:inline">
                Master Platform
              </span>
            )}
          </div>
        </NavLink>
      </div>

      {/* ─── HORIZONTAL BALANCED LINEAR NAVIGATION ITEMS (Desktop) ────────── */}
      <nav className="hidden lg:flex items-center gap-1 overflow-x-auto py-1 scrollbar-none">
        {visibleNavItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/' || to === '/platform/companies'}
            className={({ isActive }) =>
              `relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-150
              ${
                isActive
                  ? 'bg-crm-blue/10 dark:bg-white/[0.09] text-crm-blue dark:text-white shadow-sm border border-crm-blue/20 dark:border-white/10'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/[0.04]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={13.5} className={isActive ? (colorForPath[to] || 'text-crm-blue') : 'opacity-70'} />
                <span>{label}</span>
                {isActive && (
                  <motion.div
                    layoutId="active-tab-indicator"
                    className="absolute bottom-0 left-1.5 right-1.5 h-[2px] bg-gradient-to-r from-crm-blue to-crm-teal rounded-full"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ─── RIGHT CONTROLS: THEME SWITCHER & USER PROFILE ─────────────────── */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Theme Toggle Button - Rock Solid Fixed Size */}
        <button
          type="button"
          onClick={toggleTheme}
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-700 dark:text-slate-200 hover:border-crm-blue dark:hover:border-crm-blue shadow-sm transition-all cursor-pointer"
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label="Toggle Theme"
        >
          {isDark ? (
            <Sun size={17} className="text-amber-400 shrink-0" />
          ) : (
            <Moon size={17} className="text-indigo-600 shrink-0" />
          )}
        </button>

        {/* User Profile & Dropdown */}
        <div ref={profileRef} className="relative">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className={`flex items-center gap-2 pl-2 pr-1.5 py-1 rounded-xl border transition-all ${
              profileOpen
                ? 'bg-slate-100 dark:bg-[#1E2230] border-crm-blue/40 text-slate-900 dark:text-white shadow-sm'
                : 'border-slate-200 dark:border-[#2A3042] hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300'
            }`}
          >
            <div className="w-7 h-7 rounded-lg bg-crm-blue/15 dark:bg-crm-blue/20 border border-crm-blue/30 flex items-center justify-center text-crm-blue font-black text-xs">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="hidden lg:flex flex-col text-left">
              <span className="text-xs font-bold text-slate-900 dark:text-white leading-tight truncate max-w-[110px]">
                {user?.name}
              </span>
              <span className="text-[9.5px] text-slate-500 dark:text-slate-400 capitalize leading-tight">
                {user?.role?.replace('_', ' ')}
              </span>
            </div>
            <ChevronDown
              size={13}
              className={`text-slate-400 transition-transform duration-200 ${profileOpen ? 'rotate-180 text-crm-blue' : ''}`}
            />
          </button>

          <AnimatePresence>
            {profileOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 mt-2 w-60 rounded-xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-xl dark:shadow-2xl p-1.5 z-50 overflow-hidden"
              >
                {/* Profile Card Header */}
                <div className="p-3 bg-slate-50 dark:bg-[#1E2230] rounded-lg border border-slate-200 dark:border-[#2A3042]/70 mb-1">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{user?.name}</p>
                  <p className="text-[10px] font-mono text-crm-blue dark:text-crm-teal mt-0.5">{user?.email || user?.employeeCode}</p>
                  <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-200 dark:border-[#2A3042]/50">
                    <ShieldCheck size={12} className="text-emerald-500" />
                    <span className="text-[10px] text-slate-600 dark:text-slate-300 font-semibold capitalize">
                      {user?.role?.replace('_', ' ')} Role
                    </span>
                  </div>
                </div>

                {/* Quick Setup shortcuts inside Profile — desktop only */}
                {isPlatformOwner ? (
                  <div className="space-y-0.5 border-b border-slate-200 dark:border-[#2A3042]/60 pb-1 mb-1">
                    <p className="px-2.5 py-1 text-[9.5px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Platform Master</p>
                    <NavLink
                      to="/platform/companies"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                    >
                      <Building2 size={13} className="text-indigo-600 dark:text-indigo-400" />
                      <span>Companies Hub</span>
                    </NavLink>
                    <NavLink
                      to="/users"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                    >
                      <Shield size={13} className="text-crm-blue" />
                      <span>Global Users</span>
                    </NavLink>
                  </div>
                ) : isAdmin ? (
                  <div className="space-y-0.5 border-b border-slate-200 dark:border-[#2A3042]/60 pb-1 mb-1">
                    <p className="px-2.5 py-1 text-[9.5px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Company Setup</p>
                    <NavLink
                      to="/users"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                    >
                      <Shield size={13} className="text-crm-blue" />
                      <span>Team & Users</span>
                    </NavLink>
                    <NavLink
                      to="/settings/branding"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                    >
                      <Building2 size={13} className="text-crm-teal" />
                      <span>Company Branding & Tax</span>
                    </NavLink>
                  </div>
                ) : null}

                {/* Logout Action */}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-crm-coral hover:bg-red-500/10 dark:hover:bg-red-500/15 transition-colors text-left"
                >
                  <LogOut size={14} />
                  <span>Logout Session</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
