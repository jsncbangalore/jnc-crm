/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Unified Canonical Roles & Permissions Architecture
 * Shared across NestJS Backend and React Frontend
 */

export const TENANT_ROLE_KEYS = [
  'administrator',
  'sub_administrator',
  'project_manager',
  'developer_lead',
  'store_inventory_manager',
  'finance_specialist',
  'accountant',
  'sales_representative',
  'developer',
] as const;

export const ALL_ROLE_KEYS = [
  'platform_super_admin',
  'platform_admin',
  ...TENANT_ROLE_KEYS,
] as const;

export type TenantRoleKey = (typeof TENANT_ROLE_KEYS)[number];
export type RoleKey = (typeof ALL_ROLE_KEYS)[number];

export type PageAction = 'view' | 'create_edit' | 'delete';

export const ALL_CANONICAL_PAGES = [
  'dashboard',
  'leads',
  'lead_flow',
  'lead_setup',
  'quotations',
  'orders',
  'shipments',
  'invoices',
  'inventory',
  'suppliers',
  'bills',
  'ledger',
  'daily_activities',
  'notifications',
  'custom_objects',
  'automation',
  'audit_logs',
  'users',
  'teams',
  'branding',
  'mail_settings',
] as const;

export type CanonicalPageKey = (typeof ALL_CANONICAL_PAGES)[number];

export const ROLE_LABELS: Record<string, string> = {
  platform_super_admin: 'Platform Super Admin',
  platform_admin: 'Platform Administrator',
  tenant_admin: 'Administrator',
  administrator: 'Administrator',
  admin: 'Administrator',
  sub_administrator: 'Sub-Administrator',
  sub_admin: 'Sub-Administrator',
  project_manager: 'Project Manager',
  developer_lead: 'Developer Lead',
  store_inventory_manager: 'Store / Inventory Manager',
  store_manager: 'Store / Inventory Manager',
  finance_specialist: 'Finance Specialist',
  finance: 'Finance Specialist',
  accountant: 'Accountant',
  sales_representative: 'Employee / Sales Representative',
  employee: 'Employee / Sales Representative',
  developer: 'Developer',
};

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  platform_super_admin: 'Full platform infrastructure and tenant management.',
  platform_admin: 'Platform-level tenant oversight and operational management.',
  tenant_admin: 'Full access to all modules and operational actions with zero restrictions.',
  administrator: 'Full access to all modules and operational actions with zero restrictions.',
  admin: 'Full access to all modules and operational actions with zero restrictions.',
  sub_administrator: 'Operations & team management (leads, quotes, orders, inventory, suppliers, users). Excludes audit logs and custom objects.',
  sub_admin: 'Operations & team management (leads, quotes, orders, inventory, suppliers, users). Excludes audit logs and custom objects.',
  project_manager: 'Manages sales pipeline, quotes, orders, dispatches, and task logs. View-only access to inventory.',
  developer_lead: 'Full automation, custom objects, notifications, and dev logs. View-only access to audit logs and leads.',
  store_inventory_manager: 'Full stock control, inventory movements, purchase bills, suppliers, and shipments. View-only access to orders.',
  store_manager: 'Full stock control, inventory movements, purchase bills, suppliers, and shipments. View-only access to orders.',
  finance_specialist: 'Invoicing, payment records, and ledger management. View-only access to orders, quotations, and suppliers.',
  finance: 'Invoicing, payment records, and ledger management. View-only access to orders, quotations, and suppliers.',
  accountant: 'Tax invoices, vendor purchase bills, party ledgers, and suppliers. View-only access to orders and inventory.',
  sales_representative: 'Manages personal sales pipeline: own leads, quotations, and assigned orders.',
  employee: 'Manages personal sales pipeline: own leads, quotations, and assigned orders.',
  developer: 'Workflow automation, custom objects, project task logs, and notifications. View-only access to leads.',
};

export const ROLE_RANKS: Record<string, number> = {
  platform_super_admin: 100,
  platform_admin: 95,
  administrator: 90,
  tenant_admin: 90,
  admin: 90,
  sub_administrator: 80,
  sub_admin: 80,
  project_manager: 70,
  developer_lead: 65,
  store_inventory_manager: 60,
  store_manager: 60,
  finance_specialist: 55,
  finance: 55,
  accountant: 50,
  sales_representative: 40,
  employee: 40,
  sales: 40,
  developer: 30,
};

export const ROLE_NORMALIZATION_MAP: Record<string, RoleKey> = {
  administrator: 'administrator',
  sub_administrator: 'sub_administrator',
  project_manager: 'project_manager',
  developer_lead: 'developer_lead',
  store_inventory_manager: 'store_inventory_manager',
  finance_specialist: 'finance_specialist',
  accountant: 'accountant',
  sales_representative: 'sales_representative',
  developer: 'developer',
  platform_super_admin: 'platform_super_admin',
  platform_admin: 'platform_admin',
  super_admin: 'platform_super_admin',
  // Backward compatibility aliases
  admin: 'administrator',
  tenant_admin: 'administrator',
  sub_admin: 'sub_administrator',
  employee: 'sales_representative',
  sales: 'sales_representative',
  store_manager: 'store_inventory_manager',
  inventory_manager: 'store_inventory_manager',
  finance: 'finance_specialist',
};

export function normalizeRole(role?: string | null): RoleKey {
  if (!role) return 'sales_representative';
  const lower = role.trim().toLowerCase();
  return ROLE_NORMALIZATION_MAP[lower] || 'sales_representative';
}

const FULL_ACTIONS: PageAction[] = ['view', 'create_edit', 'delete'];
const VIEW_ONLY_ACTIONS: PageAction[] = ['view'];

export interface RolePagePermissionMap {
  [pageKey: string]: PageAction[];
}

export const ROLE_DEFAULT_HOME_PAGE: Record<string, string> = {
  administrator: 'dashboard',
  sub_administrator: 'dashboard',
  project_manager: 'leads',
  developer_lead: 'daily_activities',
  store_inventory_manager: 'inventory',
  finance_specialist: 'invoices',
  accountant: 'invoices',
  sales_representative: 'leads',
  developer: 'daily_activities',
};

export function getDefaultHomePageForRole(role?: string | null): string {
  const norm = normalizeRole(role);
  return ROLE_DEFAULT_HOME_PAGE[norm] || 'leads';
}

/**
 * Returns default page permissions for each role according to Requirement B & C.
 * Note: Only administrator and sub_administrator have dashboard by default.
 * All other roles only have dashboard if explicitly granted by an administrator.
 */
export function getRoleDefaultPermissions(role: string): RolePagePermissionMap {
  const norm = normalizeRole(role);

  switch (norm) {
    case 'administrator':
    case 'platform_super_admin':
    case 'platform_admin': {
      const perms: RolePagePermissionMap = {};
      for (const p of ALL_CANONICAL_PAGES) {
        perms[p] = [...FULL_ACTIONS];
      }
      return perms;
    }

    case 'sub_administrator': {
      // Sub-Administrator: dashboard, leads, quotations, orders, shipments, invoices,
      // inventory, suppliers, automation, notifications, and users.
      // Can manage roles below Sub-Administrator. No audit_logs or custom_objects.
      return {
        dashboard: [...FULL_ACTIONS],
        leads: [...FULL_ACTIONS],
        lead_flow: [...FULL_ACTIONS],
        lead_setup: [...FULL_ACTIONS],
        quotations: [...FULL_ACTIONS],
        orders: [...FULL_ACTIONS],
        shipments: [...FULL_ACTIONS],
        invoices: [...FULL_ACTIONS],
        inventory: [...FULL_ACTIONS],
        bills: [...FULL_ACTIONS],
        suppliers: [...FULL_ACTIONS],
        ledger: [...FULL_ACTIONS],
        daily_activities: [...FULL_ACTIONS],
        automation: [...FULL_ACTIONS],
        users: [...FULL_ACTIONS],
        teams: [...FULL_ACTIONS],
        branding: [...FULL_ACTIONS],
        mail_settings: [...FULL_ACTIONS],
        notifications: [...FULL_ACTIONS],
      };
    }

    case 'project_manager': {
      // Project Manager: leads, quotations, orders, shipments, daily_activities, notifications. Inventory is view only.
      return {
        leads: [...FULL_ACTIONS],
        lead_flow: [...FULL_ACTIONS],
        quotations: [...FULL_ACTIONS],
        orders: [...FULL_ACTIONS],
        shipments: [...FULL_ACTIONS],
        daily_activities: [...FULL_ACTIONS],
        inventory: [...VIEW_ONLY_ACTIONS], // view only
        notifications: [...FULL_ACTIONS],
      };
    }

    case 'developer_lead': {
      // Developer Lead: automation, custom_objects, audit_logs (view), leads (view), daily_activities, notifications.
      return {
        daily_activities: [...FULL_ACTIONS],
        automation: [...FULL_ACTIONS],
        custom_objects: [...FULL_ACTIONS],
        audit_logs: [...VIEW_ONLY_ACTIONS], // view only
        leads: [...VIEW_ONLY_ACTIONS],      // view only
        lead_flow: [...VIEW_ONLY_ACTIONS],
        notifications: [...FULL_ACTIONS],
      };
    }

    case 'store_inventory_manager': {
      // Store / Inventory Manager: inventory, suppliers, shipments, bills, orders (view), daily_activities, notifications.
      // This includes purchase bills and stock transfers.
      return {
        inventory: [...FULL_ACTIONS],
        bills: [...FULL_ACTIONS],
        suppliers: [...FULL_ACTIONS],
        shipments: [...FULL_ACTIONS],
        orders: [...VIEW_ONLY_ACTIONS], // view only
        daily_activities: [...FULL_ACTIONS],
        notifications: [...FULL_ACTIONS],
      };
    }

    case 'finance_specialist': {
      // Finance Specialist: invoices, bills, ledger, orders (view), quotations (view), suppliers (view), notifications, and daily activities.
      return {
        invoices: [...FULL_ACTIONS],
        bills: [...FULL_ACTIONS],
        ledger: [...FULL_ACTIONS],
        orders: [...VIEW_ONLY_ACTIONS],     // view only
        quotations: [...VIEW_ONLY_ACTIONS], // view only
        suppliers: [...VIEW_ONLY_ACTIONS],  // view only
        daily_activities: [...FULL_ACTIONS],
        notifications: [...FULL_ACTIONS],
      };
    }

    case 'accountant': {
      // Accountant: invoices, inventory purchase bills, suppliers, ledger, orders (view), notifications, and daily activities.
      return {
        invoices: [...FULL_ACTIONS],
        bills: [...FULL_ACTIONS],
        ledger: [...FULL_ACTIONS],
        suppliers: [...FULL_ACTIONS],
        orders: [...VIEW_ONLY_ACTIONS],    // view only
        inventory: [...VIEW_ONLY_ACTIONS], // view only
        daily_activities: [...FULL_ACTIONS],
        notifications: [...FULL_ACTIONS],
      };
    }

    case 'sales_representative': {
      // Employee / Sales Representative: leads (own leads),
      // quotations, orders (own orders), notifications, and daily activities.
      return {
        leads: [...FULL_ACTIONS],
        lead_flow: [...FULL_ACTIONS],
        quotations: [...FULL_ACTIONS],
        orders: [...FULL_ACTIONS],
        daily_activities: [...FULL_ACTIONS],
        notifications: [...FULL_ACTIONS],
      };
    }

    case 'developer': {
      // Developer: automation, custom_objects, leads (view), daily_activities, notifications.
      return {
        daily_activities: [...FULL_ACTIONS],
        automation: [...FULL_ACTIONS],
        custom_objects: [...FULL_ACTIONS],
        leads: [...VIEW_ONLY_ACTIONS], // view only
        lead_flow: [...VIEW_ONLY_ACTIONS],
        notifications: [...FULL_ACTIONS],
      };
    }

    default: {
      return {
        notifications: [...FULL_ACTIONS],
      };
    }
  }
}

export interface EffectiveAccessResult {
  pages: string[];
  permissions: Record<string, PageAction[]>;
}

/**
 * Single Canonical Function to Resolve Effective Page Access
 * Rule:
 * 1. Administrator ALWAYS gets all pages and all actions. Team restrictions never apply.
 * 2. Effective access = role default, then the user/team changes.
 * 3. An empty team page list must NOT block everything; treat empty as 'use role defaults'.
 * 4. Dashboard and notifications are always allowed for every role.
 */
export function resolveEffectivePageAccess(params: {
  role?: string | null;
  userPages?: string[] | null;
  teamAllowedPages?: string[] | null;
  isPlatform?: boolean;
}): EffectiveAccessResult {
  const norm = normalizeRole(params.role);

  // 1. Platform Super Admin / Platform Admin
  if (params.isPlatform || norm === 'platform_super_admin' || norm === 'platform_admin') {
    const permissions: Record<string, PageAction[]> = {};
    for (const p of ALL_CANONICAL_PAGES) {
      permissions[p] = [...FULL_ACTIONS];
    }
    return {
      pages: [...ALL_CANONICAL_PAGES],
      permissions,
    };
  }

  // 2. Administrator: ALL pages, ALL actions, no restriction. Team restrictions never apply.
  if (norm === 'administrator') {
    const permissions: Record<string, PageAction[]> = {};
    for (const p of ALL_CANONICAL_PAGES) {
      permissions[p] = [...FULL_ACTIONS];
    }
    return {
      pages: [...ALL_CANONICAL_PAGES],
      permissions,
    };
  }

  // 3. Start with role default permissions
  const defaultPerms = getRoleDefaultPermissions(norm);
  const permissions: Record<string, PageAction[]> = { ...defaultPerms };

  // 4. Team Customizations (if assigned and non-empty)
  if (Array.isArray(params.teamAllowedPages) && params.teamAllowedPages.length > 0) {
    const teamSet = new Set(
      params.teamAllowedPages.map((k) => (k === 'purchase_bills' ? 'bills' : k)),
    );
    // Add any pages granted by team
    for (const p of teamSet) {
      if (!permissions[p]) {
        permissions[p] = [...FULL_ACTIONS];
      }
    }
  }

  // 5. User-level Customizations (if explicitly set)
  if (Array.isArray(params.userPages) && params.userPages.length > 0) {
    const userSet = new Set(
      params.userPages.map((k) => (k === 'purchase_bills' ? 'bills' : k)),
    );
    // Explicit user page list defines granted pages
    for (const p of userSet) {
      if (!permissions[p]) {
        permissions[p] = [...FULL_ACTIONS];
      }
    }
    // Remove pages not in userSet (notifications is always granted for system alerts)
    for (const p of Object.keys(permissions)) {
      if (!userSet.has(p) && p !== 'notifications') {
        delete permissions[p];
      }
    }
  }

  // 6. Guarantee notifications is ALWAYS present
  if (!permissions.notifications) permissions.notifications = [...FULL_ACTIONS];

  const pages = Object.keys(permissions);

  return {
    pages,
    permissions,
  };
}

/**
 * Checks whether an effective access set grants a specific action on a page.
 */
export function canAccessPage(
  effectiveAccess: EffectiveAccessResult,
  pageKey: string,
  requiredAction: PageAction = 'view',
): boolean {
  const canonical = pageKey === 'purchase_bills' ? 'bills' : pageKey;
  const actions = effectiveAccess.permissions[canonical] || effectiveAccess.permissions[pageKey];
  if (!actions || actions.length === 0) {
    return false;
  }
  return actions.includes(requiredAction);
}

/**
 * Checks whether an effective access set grants view-only access to a page.
 */
export function isViewOnlyPage(
  effectiveAccess: EffectiveAccessResult,
  pageKey: string,
): boolean {
  const canonical = pageKey === 'purchase_bills' ? 'bills' : pageKey;
  const actions = effectiveAccess.permissions[canonical] || effectiveAccess.permissions[pageKey];
  if (!actions || actions.length === 0) return false;
  return actions.length === 1 && actions[0] === 'view';
}

/**
 * Returns roles that actor can assign (strictly lower rank; only platform_super_admin can assign administrator).
 */
export function getAllowedAssignableRoles(actorRole?: string): TenantRoleKey[] {
  if (!actorRole) return [];
  const normActor = normalizeRole(actorRole);
  const actorRank = ROLE_RANKS[normActor] || 0;

  // Platform admins and Company Administrators can assign all 9 tenant roles
  if (
    normActor === 'platform_super_admin' ||
    normActor === 'platform_admin' ||
    normActor === 'administrator'
  ) {
    return [...TENANT_ROLE_KEYS];
  }

  // Other roles (e.g. sub_administrator) can only assign roles strictly below their own rank
  return TENANT_ROLE_KEYS.filter((role) => {
    const targetRank = ROLE_RANKS[role] || 0;
    return targetRank < actorRank;
  });
}
