/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

export interface TabBoundUser {
  id: string;
  email: string;
  tenantId?: string;
  tenantName?: string;
  tenantCode?: string;
  portal: 'staff' | 'platform';
  boundAt: number;
}

export interface AuthSyncMessage {
  type: 'LOGIN' | 'LOGOUT';
  portal: 'staff' | 'platform';
  userId?: string;
  email?: string;
  tenantId?: string;
  tenantCode?: string;
  tenantName?: string;
  timestamp: number;
}

export interface SessionConflictDetail {
  expectedUser: {
    id?: string;
    email?: string;
    tenantId?: string;
    tenantName?: string;
    tenantCode?: string;
    portal?: 'staff' | 'platform';
  };
  incomingUser: any;
  incomingAccessToken: string;
  incomingRefreshToken?: string;
}

export const TAB_STORAGE_KEYS = {
  USER_ID: 'crm_tab_user_id',
  USER_EMAIL: 'crm_tab_user_email',
  TENANT_ID: 'crm_tab_tenant_id',
  TENANT_NAME: 'crm_tab_tenant_name',
  TENANT_CODE: 'crm_tab_tenant_code',
  PORTAL: 'crm_tab_portal',
  BOUND_AT: 'crm_tab_bound_at',
  PLATFORM_USER_ID: 'crm_tab_platform_user_id',
  PLATFORM_USER_EMAIL: 'crm_tab_platform_user_email',
  PLATFORM_BOUND_AT: 'crm_tab_platform_bound_at',
} as const;

const BROADCAST_CHANNEL_NAME = 'crm_auth_sync';
const STORAGE_SYNC_KEY = 'crm_last_auth_sync';

export function getTabSessionUser(portal?: 'staff' | 'platform'): TabBoundUser | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const isPlatform = portal === 'platform';
    const idKey = isPlatform ? TAB_STORAGE_KEYS.PLATFORM_USER_ID : TAB_STORAGE_KEYS.USER_ID;
    const emailKey = isPlatform ? TAB_STORAGE_KEYS.PLATFORM_USER_EMAIL : TAB_STORAGE_KEYS.USER_EMAIL;
    const boundAtKey = isPlatform ? TAB_STORAGE_KEYS.PLATFORM_BOUND_AT : TAB_STORAGE_KEYS.BOUND_AT;

    // Tab-scoped: read strictly from sessionStorage, NEVER from localStorage to prevent cross-tab pollution
    const id = sessionStorage.getItem(idKey);
    if (!id) return null;

    const email = sessionStorage.getItem(emailKey) || '';
    const tenantId = !isPlatform ? sessionStorage.getItem(TAB_STORAGE_KEYS.TENANT_ID) || undefined : undefined;
    const tenantName = !isPlatform ? sessionStorage.getItem(TAB_STORAGE_KEYS.TENANT_NAME) || undefined : undefined;
    const tenantCode = !isPlatform ? sessionStorage.getItem(TAB_STORAGE_KEYS.TENANT_CODE) || undefined : undefined;
    const boundAtStr = sessionStorage.getItem(boundAtKey);
    const boundAt = boundAtStr ? parseInt(boundAtStr, 10) : Date.now();

    return { id, email, tenantId, tenantName, tenantCode, portal: isPlatform ? 'platform' : 'staff', boundAt };
  } catch {
    return null;
  }
}

export function setTabSessionUser(
  user: {
    id: string;
    email: string;
    tenantId?: string;
    tenant?: { code?: string; name?: string };
    role?: string;
  },
  portal: 'staff' | 'platform',
): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const isPlatform = portal === 'platform';
    if (isPlatform) {
      sessionStorage.setItem(TAB_STORAGE_KEYS.PLATFORM_USER_ID, user.id);
      sessionStorage.setItem(TAB_STORAGE_KEYS.PLATFORM_USER_EMAIL, user.email);
      sessionStorage.setItem(TAB_STORAGE_KEYS.PORTAL, 'platform');
      sessionStorage.setItem(TAB_STORAGE_KEYS.PLATFORM_BOUND_AT, Date.now().toString());
    } else {
      sessionStorage.setItem(TAB_STORAGE_KEYS.USER_ID, user.id);
      sessionStorage.setItem(TAB_STORAGE_KEYS.USER_EMAIL, user.email);
      sessionStorage.setItem(TAB_STORAGE_KEYS.TENANT_ID, user.tenantId || '');
      sessionStorage.setItem(TAB_STORAGE_KEYS.TENANT_NAME, user.tenant?.name || '');
      sessionStorage.setItem(TAB_STORAGE_KEYS.TENANT_CODE, user.tenant?.code || '');
      sessionStorage.setItem(TAB_STORAGE_KEYS.PORTAL, 'staff');
      sessionStorage.setItem(TAB_STORAGE_KEYS.BOUND_AT, Date.now().toString());
    }

    // STRICT SECURITY RULE: Tab identity keys must NEVER be stored in localStorage!
    // Clean up any legacy keys in localStorage so other tabs are not polluted.
    localStorage.removeItem(TAB_STORAGE_KEYS.USER_ID);
    localStorage.removeItem(TAB_STORAGE_KEYS.PLATFORM_USER_ID);
    localStorage.removeItem(TAB_STORAGE_KEYS.TENANT_ID);
  } catch {
    // Ignore storage quota or access errors
  }
}

export function clearTabSessionUser(portal?: 'staff' | 'platform'): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    if (!portal || portal === 'staff') {
      sessionStorage.removeItem(TAB_STORAGE_KEYS.USER_ID);
      sessionStorage.removeItem(TAB_STORAGE_KEYS.USER_EMAIL);
      sessionStorage.removeItem(TAB_STORAGE_KEYS.TENANT_ID);
      sessionStorage.removeItem(TAB_STORAGE_KEYS.TENANT_NAME);
      sessionStorage.removeItem(TAB_STORAGE_KEYS.TENANT_CODE);
      sessionStorage.removeItem(TAB_STORAGE_KEYS.BOUND_AT);
    }
    if (!portal || portal === 'platform') {
      sessionStorage.removeItem(TAB_STORAGE_KEYS.PLATFORM_USER_ID);
      sessionStorage.removeItem(TAB_STORAGE_KEYS.PLATFORM_USER_EMAIL);
      sessionStorage.removeItem(TAB_STORAGE_KEYS.PLATFORM_BOUND_AT);
    }
    if (!portal) {
      sessionStorage.removeItem(TAB_STORAGE_KEYS.PORTAL);
    }

    // Clean up any legacy localStorage copies
    localStorage.removeItem(TAB_STORAGE_KEYS.USER_ID);
    localStorage.removeItem(TAB_STORAGE_KEYS.PLATFORM_USER_ID);
    localStorage.removeItem(TAB_STORAGE_KEYS.TENANT_ID);
  } catch {
    // Ignore
  }
}

/**
 * Clear all stale tab identity and tracking keys (e.g. on public pages or after logout).
 */
export function clearStaleTabKeys(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem('crm_tab_user_id');
    sessionStorage.removeItem('crm_tab_platform_user_id');
    sessionStorage.removeItem('crm_last_active_user_id');
    sessionStorage.removeItem('crm_last_active_platform_user_id');
    sessionStorage.removeItem('crm_tab_user_email');
    sessionStorage.removeItem('crm_tab_platform_user_email');
    sessionStorage.removeItem('crm_tab_tenant_id');
    sessionStorage.removeItem('crm_tab_tenant_name');
    sessionStorage.removeItem('crm_tab_tenant_code');
    sessionStorage.removeItem('crm_tab_portal');
    sessionStorage.removeItem('crm_tab_bound_at');
    sessionStorage.removeItem('crm_tab_platform_bound_at');
    sessionStorage.removeItem('crm_tab_impersonating');

    localStorage.removeItem('crm_tab_user_id');
    localStorage.removeItem('crm_tab_platform_user_id');
    localStorage.removeItem('crm_last_active_user_id');
  } catch {}
}

export function broadcastAuthSync(message: AuthSyncMessage): void {
  if (typeof window === 'undefined') return;

  // 1. Primary: BroadcastChannel (standard across modern browsers)
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channel.postMessage(message);
      channel.close();
    } catch {
      // Fallback below
    }
  }

  // 2. Secondary fallback: localStorage storage event
  try {
    localStorage.setItem(STORAGE_SYNC_KEY, JSON.stringify(message));
  } catch {
    // Ignore
  }
}

export function subscribeAuthSync(handler: (message: AuthSyncMessage) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channel.onmessage = (event) => {
        if (event.data && typeof event.data === 'object' && event.data.type) {
          handler(event.data as AuthSyncMessage);
        }
      };
    } catch {
      channel = null;
    }
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_SYNC_KEY && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue);
        if (parsed && parsed.type) {
          handler(parsed as AuthSyncMessage);
        }
      } catch {
        // Ignore
      }
    }
  };

  window.addEventListener('storage', handleStorage);

  return () => {
    if (channel) {
      channel.close();
    }
    window.removeEventListener('storage', handleStorage);
  };
}

export function dispatchSessionConflict(detail: SessionConflictDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('crm:session-conflict', { detail }));
}
