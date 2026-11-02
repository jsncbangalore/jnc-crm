/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  COMPANY_PAGE_REGISTRY,
  PLATFORM_PAGE_REGISTRY,
  PAGE_KEY_TO_ROUTE,
  PageDefinition,
  PlatformPageDefinition,
} from '../config/page-registry';
import { isPlatformOwner } from '../utils/roles';
import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  Package,
  Truck,
  Building2,
  FileText,
  Shield,
  Bell,
  Receipt,
  ClipboardList,
  Sliders,
  Zap,
  Database,
  History,
  Mail,
  HardDriveDownload,
  BookOpen,
  LucideIcon,
} from 'lucide-react';

export const PAGE_ICON_MAP: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  leads: Users,
  lead_flow: Zap,
  lead_setup: Sliders,
  quotations: FileText,
  orders: ShoppingCart,
  shipments: Truck,
  inventory: Package,
  suppliers: Building2,
  invoices: Receipt,
  bills: Receipt,
  purchase_bills: Receipt,
  ledger: BookOpen,
  daily_activities: ClipboardList,
  notifications: Bell,
  custom_objects: Database,
  automation: Zap,
  audit_logs: History,
  users: Shield,
  teams: Users,
  branding: Building2,
  mail_settings: Mail,
  platform_companies: Building2,
  platform_admins: Shield,
  platform_backup: HardDriveDownload,
};

export const PAGE_SUB_ITEMS: Record<string, { label: string; to: string; isAction?: boolean }[]> = {
  leads: [
    { label: '+ New Lead', to: '/leads?action=create', isAction: true },
    { label: 'All Leads', to: '/leads' },
    { label: 'My Assigned Leads', to: '/leads?filter=my' },
    { label: 'Converted Pipeline', to: '/leads?filter=converted' },
  ],
  quotations: [
    { label: '+ New Quotation', to: '/quotations?action=create', isAction: true },
    { label: 'All Quotations', to: '/quotations' },
    { label: 'Pending Approvals', to: '/quotations?filter=pending' },
  ],
  orders: [
    { label: '+ Create Order', to: '/orders?action=create', isAction: true },
    { label: 'All Orders', to: '/orders' },
    { label: 'Pending Production', to: '/orders?filter=pending' },
    { label: 'Ready for Dispatch', to: '/orders?filter=ready' },
  ],
  invoices: [
    { label: '+ Create Tax Invoice / Document', to: '/invoices?action=create', isAction: true },
    { label: 'All Invoices', to: '/invoices' },
    { label: 'Unpaid & Overdue', to: '/invoices?filter=unpaid' },
    { label: 'LUT / Export Documents', to: '/invoices?filter=lut' },
  ],
  ledger: [
    { label: 'Customer Statements', to: '/ledger?tab=customers' },
    { label: 'Supplier Statements', to: '/ledger?tab=suppliers' },
    { label: '+ Record Payment', to: '/ledger?action=payment', isAction: true },
  ],
  inventory: [
    { label: '+ Add Component / SKU', to: '/inventory?action=create', isAction: true },
    { label: 'Project Stock Position', to: '/inventory?tab=stock' },
    { label: 'Component Library', to: '/inventory?tab=library' },
    { label: 'Purchase Bills Hub', to: '/bills' },
  ],
  bills: [
    { label: '+ Record Purchase Bill', to: '/bills?action=create', isAction: true },
    { label: 'All Bills', to: '/bills' },
  ],
  shipments: [
    { label: '+ New Dispatch', to: '/shipments?action=create', isAction: true },
    { label: 'All Dispatches', to: '/shipments' },
    { label: 'In Transit', to: '/shipments?filter=transit' },
    { label: 'Delivered', to: '/shipments?filter=delivered' },
  ],
  daily_activities: [
    { label: "Today's Task Logs", to: '/daily-activities' },
    { label: 'Developer Activity Feed', to: '/daily-activities?filter=dev' },
  ],
};

export interface AllowedNavItem {
  key: string;
  label: string;
  to: string;
  icon: LucideIcon;
  group?: string;
  description?: string;
  subItems?: { label: string; to: string; isAction?: boolean }[];
}

export function useAllowedPages() {
  const { user } = useAuth();

  const isPlatform = Boolean(
    isPlatformOwner(user) || (user?.role === 'platform_super_admin' && !user?.tenantId)
  );

  // Derive canonical allowed keys
  const allowedKeys = useMemo<string[]>(() => {
    if (!user) return [];

    if (isPlatform) {
      return Object.keys(PLATFORM_PAGE_REGISTRY);
    }

    // Admins always get all company pages
    if (
      user.role === 'tenant_admin' ||
      user.role === 'admin' ||
      user.role === 'platform_super_admin' ||
      user.role === 'platform_admin'
    ) {
      return Object.keys(COMPANY_PAGE_REGISTRY);
    }

    // Explicit effectivePages takes precedence
    if (Array.isArray(user.effectivePages)) {
      const normalized = user.effectivePages.map((k) => (k === 'purchase_bills' ? 'bills' : k));
      return normalized.filter((k) => k in COMPANY_PAGE_REGISTRY);
    }

    // Team allowedPages fallback
    if (user.teamId && user.teamRef) {
      try {
        const parsed =
          typeof user.teamRef.allowedPages === 'string'
            ? JSON.parse(user.teamRef.allowedPages || '[]')
            : user.teamRef.allowedPages || [];
        if (Array.isArray(parsed)) {
          const normalized = parsed.map((k: string) => (k === 'purchase_bills' ? 'bills' : k));
          return normalized.filter((k: string) => k in COMPANY_PAGE_REGISTRY);
        }
      } catch {}
    }

    return [];
  }, [user, isPlatform]);

  const hasPage = (key: string): boolean => {
    if (!user) return false;
    if (isPlatform) {
      return key in PLATFORM_PAGE_REGISTRY || key.startsWith('platform');
    }
    // Admins always get all company pages
    if (
      user.role === 'tenant_admin' ||
      user.role === 'admin' ||
      user.role === 'platform_super_admin' ||
      user.role === 'platform_admin'
    ) {
      return true;
    }
    const canonicalKey = key === 'purchase_bills' ? 'bills' : key;
    return (
      allowedKeys.includes(canonicalKey) ||
      (key === 'bills' && allowedKeys.includes('purchase_bills')) ||
      allowedKeys.includes(key)
    );
  };

  const hasAnyPage = (keys: string[]): boolean => {
    return keys.some((k) => hasPage(k));
  };

  const hasZeroPages = !isPlatform && Boolean(user) && allowedKeys.length === 0;

  // Ordered list of allowed pages according to canonical registry definition order
  const allowedPages = useMemo<(PageDefinition | PlatformPageDefinition)[]>(() => {
    if (isPlatform) {
      return Object.keys(PLATFORM_PAGE_REGISTRY).map((k) => PLATFORM_PAGE_REGISTRY[k]);
    }
    const registryKeys = Object.keys(COMPANY_PAGE_REGISTRY);
    return registryKeys
      .filter((k) => allowedKeys.includes(k) && k !== 'custom_objects' && k !== 'automation')
      .map((k) => COMPANY_PAGE_REGISTRY[k]);
  }, [isPlatform, allowedKeys]);

  // Structured navigation items ready for rendering
  const navItems = useMemo<AllowedNavItem[]>(() => {
    return allowedPages.map((page) => {
      const icon = PAGE_ICON_MAP[page.key] || LayoutDashboard;
      const to = PAGE_KEY_TO_ROUTE[page.key] || page.frontendRoutes[0] || '/';
      const subItems = PAGE_SUB_ITEMS[page.key];
      return {
        key: page.key,
        label: page.label,
        to,
        icon,
        group: 'group' in page ? page.group : 'Platform',
        description: page.description,
        subItems,
      };
    });
  }, [allowedPages]);

  // Mobile dock primary tabs: up to 4 granted pages in registry order
  const mobilePrimaryTabs = useMemo<AllowedNavItem[]>(() => {
    return navItems.slice(0, 4);
  }, [navItems]);

  // Mobile drawer items: remaining granted pages beyond the first 4
  const mobileDrawerItems = useMemo<AllowedNavItem[]>(() => {
    return navItems.slice(4);
  }, [navItems]);

  // Home page resolution: user preferred homePage if granted, otherwise first granted page
  const homePageKey = useMemo<string | null>(() => {
    if (isPlatform) return 'platform_companies';
    if (allowedPages.length === 0) return null;

    const preferred = (user as any)?.homePage;
    if (preferred && allowedKeys.includes(preferred)) {
      return preferred;
    }
    return allowedPages[0]?.key || null;
  }, [isPlatform, allowedPages, allowedKeys, user]);

  const homePageRoute = useMemo<string>(() => {
    if (isPlatform) return '/platform/companies';
    if (!homePageKey) return '/login';
    return PAGE_KEY_TO_ROUTE[homePageKey] || '/';
  }, [isPlatform, homePageKey]);

  // Granted modules that are searchable
  const searchableModules = useMemo(() => {
    return navItems.map((item) => ({
      key: item.key,
      label: item.label,
      to: item.to,
      subItems: item.subItems,
    }));
  }, [navItems]);

  return {
    user,
    isPlatform,
    allowedKeys,
    allowedPages,
    navItems,
    mobilePrimaryTabs,
    mobileDrawerItems,
    searchableModules,
    hasPage,
    hasAnyPage,
    hasZeroPages,
    homePageKey,
    homePageRoute,
  };
}
