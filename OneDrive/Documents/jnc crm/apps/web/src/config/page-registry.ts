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
    label: 'Purchase Bills & Expenses',
    group: 'Finance',
    frontendRoutes: ['/purchase-bills'],
    controllers: ['inventory'],
    description: 'Vendor bills, inward inventory entries, and expense accounting',
  },
  dashboard: {
    key: 'dashboard',
    label: 'Company Dashboard',
    group: 'Work',
    frontendRoutes: ['/'],
    controllers: ['dashboard'],
    description: 'Real-time operational KPIs, conversion funnels, and executive summary',
  },
  daily_activities: {
    key: 'daily_activities',
    label: 'Daily Activities & Logs',
    group: 'Work',
    frontendRoutes: ['/daily-activities'],
    controllers: ['activities'],
    description: 'Daily developer timesheets, project milestone logs, and work summaries',
  },
  notifications: {
    key: 'notifications',
    label: 'System Notifications',
    group: 'Work',
    frontendRoutes: ['/notifications'],
    controllers: ['notifications'],
    description: 'Security alerts, quotation approvals, order dispatches, and reminders',
  },
  custom_objects: {
    key: 'custom_objects',
    label: 'Custom Objects & Data',
    group: 'Admin',
    frontendRoutes: ['/setup/objects'],
    controllers: ['custom-objects'],
    description: 'User-defined data entities, schema builder, and dynamic record tables',
  },
  automation: {
    key: 'automation',
    label: 'Workflow Automation',
    group: 'Admin',
    frontendRoutes: ['/automation'],
    controllers: ['automation'],
    description: 'Trigger-action rules, automated emails, lead assignment, and webhooks',
  },
  audit_logs: {
    key: 'audit_logs',
    label: 'Compliance Audit Trail',
    group: 'Admin',
    frontendRoutes: ['/users?tab=audit'],
    controllers: ['audit'],
    description: 'Immutable ledger of authentication, entity updates, and exports',
  },
  users: {
    key: 'users',
    label: 'User Accounts & Roles',
    group: 'Admin',
    frontendRoutes: ['/users'],
    controllers: ['users'],
    description: 'Team member credentials, role titles, and granular permissions',
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

export function isPlatformPageKey(pageKey?: string | null): boolean {
  if (!pageKey) return false;
  return pageKey in PLATFORM_PAGE_REGISTRY || pageKey.startsWith('platform');
}

export function isValidCompanyPageKey(pageKey?: string | null): boolean {
  if (!pageKey) return false;
  return pageKey in COMPANY_PAGE_REGISTRY;
}

export function getCompanyPagesGrouped(): Record<PageGroup, PageDefinition[]> {
  const result: Record<PageGroup, PageDefinition[]> = {
    Sales: [],
    Operations: [],
    Finance: [],
    Work: [],
    Admin: [],
  };

  for (const page of Object.values(COMPANY_PAGE_REGISTRY)) {
    result[page.group].push(page);
  }

  return result;
}

export const PAGE_KEY_TO_ROUTE: Record<string, string> = {
  dashboard: '/',
  leads: '/leads',
  lead_flow: '/lead-flow',
  lead_setup: '/start-setup',
  orders: '/orders',
  invoices: '/invoices',
  inventory: '/inventory',
  suppliers: '/purchase-bills',
  purchase_bills: '/purchase-bills',
  shipments: '/shipments',
  quotations: '/quotations',
  users: '/users',
  teams: '/users?tab=teams',
  branding: '/settings/branding',
  mail_settings: '/settings/mail',
  automation: '/automation',
  custom_objects: '/setup/objects',
  daily_activities: '/daily-activities',
  notifications: '/notifications',
  audit_logs: '/users?tab=audit',
  platform_companies: '/platform/companies',
  platform_admins: '/platform/admins',
  platform_backup: '/platform/backup',
};

