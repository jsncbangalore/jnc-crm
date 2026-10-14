import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { useBranding } from '../../contexts/BrandingContext';
import {
  LayoutDashboard, Users, ShoppingCart, Package,
  Truck, LogOut, Zap, Building2, FileText, Shield, ClipboardList, Receipt
} from 'lucide-react';
import { isPlatformOwner } from '../../utils/roles';

// ─── PLATFORM OWNER MASTER NAVIGATION ─────────────────────────────────────────
const platformMasterNavItems = [
  { to: '/platform/companies', icon: Building2, label: 'Client Companies' },
  { to: '/platform/admins',    icon: Shield,    label: 'Platform Admins' },
];

// ─── CLIENT ORGANIZATION CRM NAVIGATION ──────────────────────────────────────
const clientOrgNavItems = [
  { to: '/',                  icon: LayoutDashboard, label: 'Dashboard',        roles: ['tenant_admin', 'admin', 'sub_admin', 'employee', 'store_manager'], pageKey: 'dashboard' },
  { to: '/leads',             icon: Users,           label: 'Leads',            roles: ['tenant_admin', 'admin', 'sub_admin', 'employee'], pageKey: 'leads' },
  { to: '/orders',            icon: ShoppingCart,    label: 'Orders',           roles: ['tenant_admin', 'admin', 'sub_admin', 'employee'], pageKey: 'orders' },
  { to: '/invoices',          icon: FileText,        label: 'Invoices',         roles: ['tenant_admin', 'admin', 'sub_admin', 'employee'], pageKey: 'invoices' },
  { to: '/inventory',         icon: Package,         label: 'Inventory',        roles: ['tenant_admin', 'admin', 'sub_admin', 'employee', 'store_manager'], pageKey: 'inventory' },
  { to: '/purchase-bills',    icon: Receipt,         label: 'Purchase Bills',   roles: ['tenant_admin', 'admin', 'sub_admin', 'employee', 'store_manager'], pageKey: 'purchase_bills' },
  { to: '/shipments',         icon: Truck,           label: 'Shipments',        roles: ['tenant_admin', 'admin', 'sub_admin', 'employee', 'store_manager'], pageKey: 'shipments' },
  { to: '/quotations',        icon: FileText,        label: 'Quotations',       roles: ['tenant_admin', 'admin', 'sub_admin', 'employee'], pageKey: 'quotations' },
  { to: '/daily-activities',  icon: ClipboardList,   label: 'Daily Activities', roles: ['tenant_admin', 'admin', 'sub_admin', 'project_manager', 'developer_lead', 'developer'] as string[], pageKey: 'daily_activities' },
  { to: '/users',             icon: Users,           label: 'Users',            roles: ['tenant_admin', 'admin'], pageKey: 'users' },
];

const colorForPath: Record<string, string> = {
  '/':                  'text-crm-blue',
  '/leads':             'text-crm-blue',
  '/orders':            'text-amber-600 dark:text-crm-amber',
  '/invoices':          'text-emerald-500',
  '/inventory':         'text-purple-600 dark:text-crm-violet',
  '/purchase-bills':    'text-emerald-600 dark:text-emerald-400',
  '/suppliers':         'text-indigo-600 dark:text-crm-violet-light',
  '/shipments':         'text-teal-600 dark:text-crm-teal',
  '/quotations':        'text-amber-600 dark:text-crm-amber-light',
  '/users':             'text-blue-600 dark:text-crm-blue-light',
  '/platform/companies':'text-indigo-600 dark:text-indigo-400',
  '/platform/admins':   'text-purple-600 dark:text-purple-400',
  '/automation':        'text-rose-600 dark:text-crm-coral',
  '/daily-activities':  'text-emerald-600 dark:text-emerald-400',
};

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { branding } = useBranding();
  const navigate = useNavigate();

  const isPlatform = isPlatformOwner(user);

  const visibleNavItems = isPlatform
    ? platformMasterNavItems
    : clientOrgNavItems.filter((item) => {
        if (item.roles && !item.roles.includes(user?.role || '')) return false;
        if (user?.role !== 'tenant_admin' && user?.role !== 'platform_super_admin') {
          if (user?.teamId && user?.teamRef) {
            const allowedPages = typeof user.teamRef.allowedPages === 'string'
              ? JSON.parse(user.teamRef.allowedPages || '[]')
              : user.teamRef.allowedPages || [];
            if (item.pageKey && !allowedPages.includes(item.pageKey)) return false;
          }
        }
        return true;
      });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 bg-white dark:bg-[#181B26] border-r border-slate-200 dark:border-[#2A3042] flex flex-col transition-colors duration-150">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-slate-200 dark:border-[#2A3042]">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center p-0.5 border border-slate-200 shadow-sm overflow-hidden shrink-0">
            <img
              src="/jnc-logo.jpg"
              alt="JS Network Communication"
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <div className="overflow-hidden">
            <div className="text-sm font-black text-slate-950 dark:text-white leading-tight truncate">
              {branding.companyDisplayName}
            </div>
            {isPlatform ? (
              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider block">
                Platform Admin
              </span>
            ) : branding.companyPhone ? (
              <span className="text-[10px] text-slate-500 font-mono leading-tight block truncate">
                {branding.companyPhone}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
        {visibleNavItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition-all duration-150 ${
                  isActive
                    ? `bg-slate-100 dark:bg-white/[0.07] ${colorForPath[to] || 'text-crm-blue dark:text-white'} shadow-sm dark:shadow-none`
                    : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-100 hover:bg-slate-100/70 dark:hover:bg-white/[0.04]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={16} className={isActive ? colorForPath[to] : ''} />
                  <span>{label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="ml-auto w-1.5 h-1.5 rounded-full bg-current"
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
      </nav>

      {/* User info */}
      <div className="border-t border-slate-200 dark:border-[#2A3042] p-3">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-slate-50 dark:bg-transparent border border-slate-200 dark:border-transparent">
          <div className="w-8 h-8 rounded-full bg-crm-blue/10 dark:bg-crm-blue/20 flex items-center justify-center border border-crm-blue/20">
            <span className="text-xs font-bold text-crm-blue">
              {user?.name?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-slate-950 dark:text-white truncate">{user?.name}</div>
            <div className="text-[10px] text-slate-500 font-medium capitalize">{user?.role?.replace('_', ' ')}</div>
          </div>
          <button
            onClick={handleLogout}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-600 transition-colors"
            title="Logout"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
