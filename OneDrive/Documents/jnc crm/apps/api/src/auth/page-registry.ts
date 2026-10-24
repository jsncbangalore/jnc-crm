/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Centralized Canonical Page Registry for Granular Permission Access Control
 */

export type PageGroup = 'Sales' | 'Operations' | 'Finance' | 'Work' | 'Admin';

export interface PageDefinition {
  key: string;
  label: string;
  group: PageGroup;
  frontendRoutes: string[];
  controllers: string[];
  description: string;
}

export const COMPANY_PAGE_REGISTRY: Record<string, PageDefinition> = {
  // ─── Sales ──────────────────────────────────────────────────────────────────
  leads: {
    key: 'leads',
    label: 'Leads & Accounts',
    group: 'Sales',
    frontendRoutes: ['/leads'],
    controllers: ['leads', 'companies'],
    description: 'Lead generation, sales pipeline, client accounts, and contacts',
  },
  lead_flow: {
    key: 'lead_flow',
    label: 'Lead Flow & Pipeline',
    group: 'Sales',
    frontendRoutes: ['/lead-flow'],
    controllers: ['leads'],
    description: 'Visual stage flow and Kanban board for active leads',
  },
  lead_setup: {
    key: 'lead_setup',
    label: 'Lead Setup & Web Forms',
    group: 'Sales',
    frontendRoutes: ['/start-setup', '/lead-setup'],
    controllers: ['settings', 'webhooks'],
    description: 'Web-to-lead form builder, webhook ingestion, and inquiry configuration',
  },
  quotations: {
    key: 'quotations',
    label: 'Quotations & Estimates',
    group: 'Sales',
    frontendRoutes: ['/quotations'],
    controllers: ['quotations'],
    description: 'Quotation drafting, pricing estimations, and approval workflow',
  },

  // ─── Operations ─────────────────────────────────────────────────────────────
  orders: {
    key: 'orders',
    label: 'Sales Orders',
    group: 'Operations',
    frontendRoutes: ['/orders'],
    controllers: ['orders'],
    description: 'Customer purchase orders, advance payments, and production milestones',
  },
  shipments: {
    key: 'shipments',
    label: 'Shipments & Logistics',
    group: 'Operations',
    frontendRoutes: ['/shipments'],
    controllers: ['orders'],
    description: 'Dispatch tracking, courier milestones, and delivery confirmation',
  },
  inventory: {
    key: 'inventory',
    label: 'Inventory & Stock',
    group: 'Operations',
    frontendRoutes: ['/inventory'],
    controllers: ['inventory'],
    description: 'Component stock, warehouse bins, stock movements, and project positions',
  },
  suppliers: {
    key: 'suppliers',
    label: 'Suppliers & Vendors',
    group: 'Operations',
    frontendRoutes: ['/suppliers'],
    controllers: ['suppliers'],
    description: 'Approved vendor directory, lead times, and supplier performance',
  },

  // ─── Finance ────────────────────────────────────────────────────────────────
  invoices: {
    key: 'invoices',
    label: 'Tax Invoices & Billing',
    group: 'Finance',
    frontendRoutes: ['/invoices'],
    controllers: ['invoicing'],
    description: 'GST tax invoices, LUT exports, delivery challans, and payment receipts',
  },
  purchase_bills: {
    key: 'purchase_bills',
    label: 'Purchase Bills & OCR',
    group: 'Finance',
    frontendRoutes: ['/purchase-bills'],
    controllers: ['inventory'],
    description: 'Supplier invoice repository, OCR bill scanning, and purchase ledgers',
  },

  // ─── Work ───────────────────────────────────────────────────────────────────
  dashboard: {
    key: 'dashboard',
    label: 'Dashboard & Overview',
    group: 'Work',
    frontendRoutes: ['/'],
    controllers: ['dashboard'],
    description: 'Executive overview, pipeline KPIs, revenue charts, and operational summary',
  },
  daily_activities: {
    key: 'daily_activities',
    label: 'Daily Activities & Logs',
    group: 'Work',
    frontendRoutes: ['/daily-activities'],
    controllers: ['activities'],
    description: 'Daily project work logs, developer timesheets, and task reports',
  },
  notifications: {
    key: 'notifications',
    label: 'Notifications & Broadcasts',
    group: 'Work',
    frontendRoutes: ['/notifications'],
    controllers: ['notifications'],
    description: 'System alerts, customer email replies, and message delivery audit',
  },

  // ─── Admin ──────────────────────────────────────────────────────────────────
  custom_objects: {
    key: 'custom_objects',
    label: 'Custom Objects',
    group: 'Admin',
    frontendRoutes: ['/setup/objects', '/objects/:objectApiName'],
    controllers: ['custom-objects'],
    description: 'Custom CRM data entities, custom fields, and custom record storage',
  },
  automation: {
    key: 'automation',
    label: 'Workflow Automation',
    group: 'Admin',
    frontendRoutes: ['/automation'],
    controllers: ['automation'],
    description: 'Event triggers, automated email alerts, and workflow rules',
  },
  audit_logs: {
    key: 'audit_logs',
    label: 'Security Audit Logs',
    group: 'Admin',
    frontendRoutes: ['/setup', '/audit-logs'],
    controllers: ['audit'],
    description: 'Immutable security log of changes, logins, and permission adjustments',
  },
  users: {
    key: 'users',
    label: 'Users & Permissions',
    group: 'Admin',
    frontendRoutes: ['/users'],
    controllers: ['users'],
    description: 'User profiles, credential generation, session resets, and access rights',
  },
  teams: {
    key: 'teams',
    label: 'Access Teams',
    group: 'Admin',
    frontendRoutes: ['/users?tab=teams'],
    controllers: ['teams'],
    description: 'Department groups and team module permission presets',
  },
  branding: {
    key: 'branding',
    label: 'Branding & GST Profile',
    group: 'Admin',
    frontendRoutes: ['/settings/branding'],
    controllers: ['settings'],
    description: 'Company logos, stamps, bank accounts, GSTIN, and invoice styling',
  },
  mail_settings: {
    key: 'mail_settings',
    label: 'Company Mail Accounts',
    group: 'Admin',
    frontendRoutes: ['/settings/mail', '/settings/mail-accounts'],
    controllers: ['settings'],
    description: 'Tenant SMTP configurations, domain health, and email test delivery',
  },
};

export const ALL_COMPANY_PAGE_KEYS = Object.keys(COMPANY_PAGE_REGISTRY);

export const PAGE_GROUPS: PageGroup[] = ['Sales', 'Operations', 'Finance', 'Work', 'Admin'];

export interface PlatformPageDefinition {
  key: string;
  label: string;
  frontendRoutes: string[];
  controllers: string[];
  description: string;
}

export const PLATFORM_PAGE_REGISTRY: Record<string, PlatformPageDefinition> = {
  platform_companies: {
    key: 'platform_companies',
    label: 'Client Companies',
    frontendRoutes: ['/platform/companies'],
    controllers: ['platform'],
    description: 'Tenant provisioning, licensing limits, and subscription status',
  },
  platform_admins: {
    key: 'platform_admins',
    label: 'Platform Administrators',
    frontendRoutes: ['/platform/admins'],
    controllers: ['platform'],
    description: 'Platform super administrator accounts and system authority',
  },
  platform_backup: {
    key: 'platform_backup',
    label: 'System Backup & Drills',
    frontendRoutes: ['/platform/backup'],
    controllers: ['backup'],
    description: 'Automated encrypted database archives and restoration verification',
  },
};

export const ALL_PLATFORM_PAGE_KEYS = Object.keys(PLATFORM_PAGE_REGISTRY);

export const COMPANY_PAGE_KEYS = ALL_COMPANY_PAGE_KEYS;
export const PLATFORM_PAGE_KEYS = ALL_PLATFORM_PAGE_KEYS;
export const ALL_PAGE_KEYS = [...ALL_COMPANY_PAGE_KEYS, ...ALL_PLATFORM_PAGE_KEYS];

export const PAGE_REGISTRY: Record<string, PageDefinition | (PlatformPageDefinition & { group?: string; isPlatformOnly?: boolean })> = {
  ...COMPANY_PAGE_REGISTRY,
  ...Object.fromEntries(
    Object.entries(PLATFORM_PAGE_REGISTRY).map(([k, v]) => [
      k,
      { ...v, group: 'Platform', isPlatformOnly: true },
    ]),
  ),
};

/**
 * Checks if a given page key belongs to the platform portal (never grantable to company users)
 */
export function isPlatformPageKey(pageKey?: string | null): boolean {
  if (!pageKey) return false;
  return pageKey in PLATFORM_PAGE_REGISTRY || pageKey.startsWith('platform');
}

/**
 * Validates whether a key is an authorized company page
 */
export function isValidCompanyPageKey(pageKey?: string | null): boolean {
  if (!pageKey) return false;
  return pageKey in COMPANY_PAGE_REGISTRY;
}

/**
 * Validates whether a key is any valid page key in the registry
 */
export function isValidPageKey(pageKey?: string | null): boolean {
  if (!pageKey) return false;
  return pageKey in PAGE_REGISTRY;
}

/**
 * Legacy to canonical page key mapping dictionary.
 * Maps legacy route paths, camelCase identifiers, and kebab-case tokens to canonical keys.
 */
export const OLD_TO_NEW_PAGE_KEY_MAP: Record<string, string> = {
  // kebab-case and camelCase keys
  'daily-activities': 'daily_activities',
  'dailyActivities': 'daily_activities',
  'purchase-bills': 'purchase_bills',
  'purchaseBills': 'purchase_bills',
  'lead-flow': 'lead_flow',
  'leadFlow': 'lead_flow',
  'start-setup': 'lead_setup',
  'lead-setup': 'lead_setup',
  'leadSetup': 'lead_setup',
  'setup/objects': 'custom_objects',
  'custom-objects': 'custom_objects',
  'customObjects': 'custom_objects',
  'audit-logs': 'audit_logs',
  'auditLogs': 'audit_logs',
  'settings/mail': 'mail_settings',
  'mail-settings': 'mail_settings',
  'mailSettings': 'mail_settings',
  'settings/branding': 'branding',

  // route paths
  '/daily-activities': 'daily_activities',
  '/purchase-bills': 'purchase_bills',
  '/lead-flow': 'lead_flow',
  '/start-setup': 'lead_setup',
  '/lead-setup': 'lead_setup',
  '/setup/objects': 'custom_objects',
  '/audit-logs': 'audit_logs',
  '/setup': 'audit_logs',
  '/settings/mail': 'mail_settings',
  '/settings/mail-accounts': 'mail_settings',
  '/settings/branding': 'branding',
  '/leads': 'leads',
  '/orders': 'orders',
  '/invoices': 'invoices',
  '/inventory': 'inventory',
  '/suppliers': 'suppliers',
  '/shipments': 'shipments',
  '/quotations': 'quotations',
  '/users': 'users',
  '/teams': 'teams',
  '/automation': 'automation',
  '/notifications': 'notifications',
  '/': 'dashboard',

  // canonical company keys
  dashboard: 'dashboard',
  leads: 'leads',
  lead_flow: 'lead_flow',
  lead_setup: 'lead_setup',
  quotations: 'quotations',
  orders: 'orders',
  shipments: 'shipments',
  inventory: 'inventory',
  suppliers: 'suppliers',
  invoices: 'invoices',
  purchase_bills: 'purchase_bills',
  daily_activities: 'daily_activities',
  notifications: 'notifications',
  custom_objects: 'custom_objects',
  automation: 'automation',
  audit_logs: 'audit_logs',
  users: 'users',
  teams: 'teams',
  branding: 'branding',
  mail_settings: 'mail_settings',

  // platform keys
  platform_companies: 'platform_companies',
  platform_admins: 'platform_admins',
  platform_backup: 'platform_backup',
};

/**
 * Maps an old page key or route path to the canonical page key.
 * Returns null if the key cannot be mapped to a valid canonical page key.
 */
export function mapOldToNewPageKey(rawKey: string): string | null {
  if (!rawKey || typeof rawKey !== 'string') return null;
  const trimmed = rawKey.trim();
  if (OLD_TO_NEW_PAGE_KEY_MAP[trimmed]) {
    return OLD_TO_NEW_PAGE_KEY_MAP[trimmed];
  }
  const normalized = trimmed.replace(/^\/+/, '').toLowerCase();
  if (OLD_TO_NEW_PAGE_KEY_MAP[normalized]) {
    return OLD_TO_NEW_PAGE_KEY_MAP[normalized];
  }
  if (isValidPageKey(trimmed)) {
    return trimmed;
  }
  return null;
}


