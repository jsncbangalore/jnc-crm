/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

export type StorageItemCategory = 'necessary' | 'preferences';
export type StorageType = 'cookie' | 'localStorage' | 'sessionStorage';

export interface StorageItemDefinition {
  name: string;
  purpose: string;
  category: StorageItemCategory;
  type: StorageType;
  duration: string;
  whenSet: string;
}

export const POLICY_VERSION = '2026.10.1';
export const POLICY_UPDATED_AT = 'October 21, 2026';
export const COOKIE_CONSENT_KEY = 'crm_cookie_consent';

export const STORAGE_INVENTORY: StorageItemDefinition[] = [
  // ─── Strictly Necessary Cookies ──────────────────────────────────────────
  {
    name: 'crm_refresh_token',
    purpose: 'Cryptographically signed JWT used to securely refresh authenticated user sessions without exposing credentials to browser script.',
    category: 'necessary',
    type: 'cookie',
    duration: 'Session / up to 7 days',
    whenSet: 'On successful user authentication or session renewal',
  },
  {
    name: 'crm_platform_refresh',
    purpose: 'Dedicated refresh token for platform administration accounts, strictly isolated from regular tenant sessions.',
    category: 'necessary',
    type: 'cookie',
    duration: 'Session / up to 7 days',
    whenSet: 'On successful platform administrator authentication',
  },
  {
    name: 'crm_session_active',
    purpose: 'Lightweight binary indicator flag (value 1) enabling client-side multi-tab session synchronization and immediate logout detection.',
    category: 'necessary',
    type: 'cookie',
    duration: 'Session / up to 7 days',
    whenSet: 'On user login or session validation',
  },
  {
    name: 'crm_platform_session_active',
    purpose: 'Lightweight binary indicator flag (value 1) enabling platform portal multi-tab session synchronization and immediate logout detection.',
    category: 'necessary',
    type: 'cookie',
    duration: 'Session / up to 7 days',
    whenSet: 'On platform administrator login or session validation',
  },
  {
    name: 'crm_trusted_device',
    purpose: 'Cryptographic device trust token enabling two-factor authentication (2FA) verification to recognize authorized workstations.',
    category: 'necessary',
    type: 'cookie',
    duration: '7 days (Admin) / 30 days (User)',
    whenSet: 'Upon completing 2FA verification with device trust enabled',
  },

  // ─── Optional Preferences (Local Storage) ───────────────────────────────
  {
    name: 'crm_theme',
    purpose: 'Remembers your chosen visual appearance (light mode or dark mode) so the application loads without visual flicker.',
    category: 'preferences',
    type: 'localStorage',
    duration: 'Persistent until cleared',
    whenSet: 'When light or dark appearance mode is toggled',
  },
  {
    name: 'crm_show_bills_kpis',
    purpose: 'Remembers the expanded or collapsed view state of metric summary cards on the purchase bills dashboard.',
    category: 'preferences',
    type: 'localStorage',
    duration: 'Persistent until cleared',
    whenSet: 'When toggling purchase bills KPI card visibility',
  },
  {
    name: 'crm_show_stock_kpis',
    purpose: 'Remembers the expanded or collapsed view state of inventory stock summary metric cards.',
    category: 'preferences',
    type: 'localStorage',
    duration: 'Persistent until cleared',
    whenSet: 'When toggling inventory stock KPI card visibility',
  },
  {
    name: 'crm_show_buylist_kpis',
    purpose: 'Remembers the expanded or collapsed view state of procurement buylist KPI metric cards.',
    category: 'preferences',
    type: 'localStorage',
    duration: 'Persistent until cleared',
    whenSet: 'When toggling procurement buylist KPI card visibility',
  },
  {
    name: 'crm_show_invoices_kpis',
    purpose: 'Remembers the expanded or collapsed view state of sales invoice KPI metric cards.',
    category: 'preferences',
    type: 'localStorage',
    duration: 'Persistent until cleared',
    whenSet: 'When toggling sales invoice KPI card visibility',
  },
  {
    name: 'crm_inventory_buy_list',
    purpose: 'Saves procurement draft items locally in the browser before purchase order conversion.',
    category: 'preferences',
    type: 'localStorage',
    duration: 'Persistent until cleared',
    whenSet: 'When adding or updating procurement buylist items',
  },
  {
    name: 'crm_setup_sidebar_collapsed',
    purpose: 'Remembers whether the onboarding setup assistant navigation sidebar is collapsed.',
    category: 'preferences',
    type: 'localStorage',
    duration: 'Persistent until cleared',
    whenSet: 'When collapsing or expanding the setup assistant sidebar',
  },
  {
    name: 'crm_flow_sequence',
    purpose: 'Remembers customized drag-and-drop workflow step ordering in Flow Studio.',
    category: 'preferences',
    type: 'localStorage',
    duration: 'Persistent until cleared',
    whenSet: 'When reorganizing business workflow stages',
  },

  // ─── Strictly Necessary Local Storage ───────────────────────────────────
  {
    name: 'crm_cookie_consent',
    purpose: 'Stores your cookie acceptance or rejection decision record so you are not prompted repeatedly.',
    category: 'necessary',
    type: 'localStorage',
    duration: '12 months',
    whenSet: 'When confirming or updating cookie preferences',
  },
  {
    name: 'crm_session_sync',
    purpose: 'Cross-tab broadcast channel to synchronize logout and session state changes across open browser tabs.',
    category: 'necessary',
    type: 'localStorage',
    duration: 'Transient (cleared immediately after broadcast)',
    whenSet: 'When multi-tab session state changes',
  },
  {
    name: 'crm_branding_cache',
    purpose: 'Caches verified workspace display configuration to prevent visual layout flicker on initial render.',
    category: 'necessary',
    type: 'localStorage',
    duration: 'Until cache invalidation or re-login',
    whenSet: 'When organization workspace settings are loaded',
  },
  {
    name: 'crm_tenant_webhook_key',
    purpose: 'Caches the integration webhook key displayed in the administrative workflow settings.',
    category: 'necessary',
    type: 'localStorage',
    duration: 'Persistent until cleared',
    whenSet: 'When administrative integration settings are viewed',
  },
  {
    name: 'crm_custom_webhook_domain',
    purpose: 'Stores the custom webhook callback endpoint URL configured by tenant administrators.',
    category: 'necessary',
    type: 'localStorage',
    duration: 'Persistent until cleared',
    whenSet: 'When tenant administrator configures a custom webhook host',
  },
  {
    name: 'crm_im_api_key',
    purpose: 'Administrative credential for external marketplace lead synchronization.',
    category: 'necessary',
    type: 'localStorage',
    duration: 'Persistent until cleared',
    whenSet: 'When administrator configures marketplace lead sync',
  },
  {
    name: 'crm_im_mobile',
    purpose: 'Administrative mobile reference identifier for marketplace lead synchronization.',
    category: 'necessary',
    type: 'localStorage',
    duration: 'Persistent until cleared',
    whenSet: 'When administrator configures marketplace lead sync',
  },
  {
    name: 'crm_im_interval',
    purpose: 'Polling frequency interval for marketplace lead synchronization.',
    category: 'necessary',
    type: 'localStorage',
    duration: 'Persistent until cleared',
    whenSet: 'When administrator configures marketplace sync frequency',
  },
  {
    name: 'crm_meta_phone_id',
    purpose: 'Administrative phone number identifier for channel messaging integration.',
    category: 'necessary',
    type: 'localStorage',
    duration: 'Persistent until cleared',
    whenSet: 'When administrator configures channel messaging credentials',
  },
  {
    name: 'crm_meta_waba_id',
    purpose: 'Administrative account identifier for business messaging integration.',
    category: 'necessary',
    type: 'localStorage',
    duration: 'Persistent until cleared',
    whenSet: 'When administrator configures channel messaging credentials',
  },
  {
    name: 'crm_meta_token',
    purpose: 'Administrative bearer token for channel messaging webhook calls.',
    category: 'necessary',
    type: 'localStorage',
    duration: 'Persistent until cleared',
    whenSet: 'When administrator configures channel messaging credentials',
  },

  // ─── Strictly Necessary Session Storage ─────────────────────────────────
  {
    name: 'crm_portal',
    purpose: 'Remembers active portal interface type (staff or platform) for the current browser session tab.',
    category: 'necessary',
    type: 'sessionStorage',
    duration: 'Browser session',
    whenSet: 'On login or portal navigation',
  },
  {
    name: 'crm_session_expired',
    purpose: 'Stores session expiration notification text across automatic logout redirects.',
    category: 'necessary',
    type: 'sessionStorage',
    duration: 'Browser session',
    whenSet: 'When authentication session expires or is terminated',
  },
  {
    name: 'crm_security_alert_email',
    purpose: 'Passes email reference temporarily during account password recovery or security verification.',
    category: 'necessary',
    type: 'sessionStorage',
    duration: 'Browser session',
    whenSet: 'When initiating account security verification',
  },
  {
    name: 'platform_master_token',
    purpose: 'Retains operator token temporarily during administrative tenant support inspection.',
    category: 'necessary',
    type: 'sessionStorage',
    duration: 'Browser session',
    whenSet: 'When platform operator initiates tenant support view',
  },
  {
    name: 'platform_master_user',
    purpose: 'Retains operator identity profile during administrative tenant support inspection.',
    category: 'necessary',
    type: 'sessionStorage',
    duration: 'Browser session',
    whenSet: 'When platform operator initiates tenant support view',
  },
  {
    name: 'platform_impersonate_token',
    purpose: 'Ephemeral session token for scoped tenant inspection.',
    category: 'necessary',
    type: 'sessionStorage',
    duration: 'Browser session',
    whenSet: 'When platform operator enters tenant inspection mode',
  },
  {
    name: 'crm_tab_user_id',
    purpose: 'Binds browser tab to active user ID, preventing cross-tenant leakage between multi-tenant tabs.',
    category: 'necessary',
    type: 'sessionStorage',
    duration: 'Browser session',
    whenSet: 'On browser tab session connection',
  },
  {
    name: 'crm_tab_user_email',
    purpose: 'Binds browser tab to authenticated user email address.',
    category: 'necessary',
    type: 'sessionStorage',
    duration: 'Browser session',
    whenSet: 'On browser tab session connection',
  },
  {
    name: 'crm_tab_tenant_id',
    purpose: 'Binds browser tab to active tenant workspace ID.',
    category: 'necessary',
    type: 'sessionStorage',
    duration: 'Browser session',
    whenSet: 'On browser tab session connection',
  },
  {
    name: 'crm_tab_tenant_name',
    purpose: 'Binds browser tab to active tenant company name.',
    category: 'necessary',
    type: 'sessionStorage',
    duration: 'Browser session',
    whenSet: 'On browser tab session connection',
  },
  {
    name: 'crm_tab_tenant_code',
    purpose: 'Binds browser tab to active tenant organization code.',
    category: 'necessary',
    type: 'sessionStorage',
    duration: 'Browser session',
    whenSet: 'On browser tab session connection',
  },
  {
    name: 'crm_tab_portal',
    purpose: 'Binds browser tab to active portal context (staff or platform).',
    category: 'necessary',
    type: 'sessionStorage',
    duration: 'Browser session',
    whenSet: 'On browser tab session connection',
  },
  {
    name: 'crm_tab_bound_at',
    purpose: 'Records exact timestamp when browser tab was bound to its session.',
    category: 'necessary',
    type: 'sessionStorage',
    duration: 'Browser session',
    whenSet: 'On browser tab session connection',
  },
  {
    name: 'crm_tab_platform_user_id',
    purpose: 'Binds browser tab to platform operator identity.',
    category: 'necessary',
    type: 'sessionStorage',
    duration: 'Browser session',
    whenSet: 'On platform operator tab connection',
  },
  {
    name: 'crm_tab_platform_user_email',
    purpose: 'Binds browser tab to platform operator email address.',
    category: 'necessary',
    type: 'sessionStorage',
    duration: 'Browser session',
    whenSet: 'On platform operator tab connection',
  },
];

/**
 * Historical/legacy keys explicitly cleaned up on application mount or logout.
 */
export const KNOWN_LEGACY_KEYS = [
  'theme',
  'crm_user',
  'crm_access_token',
  'crm_refresh_token',
  'crm_last_company_code',
];
