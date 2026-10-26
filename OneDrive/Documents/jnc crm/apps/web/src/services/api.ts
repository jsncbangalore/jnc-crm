/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import axios from 'axios';
import { acquireCrossTabRefreshLock, broadcastSessionChanged } from '../utils/crossTabSync';
import { clearTabSessionUser } from '../utils/sessionSync';

export const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    // 1. Runtime window global override (e.g. window.__CRM_API_URL__ in index.html for custom backend URL)
    if ((window as any).__CRM_API_URL__) {
      const url = String((window as any).__CRM_API_URL__).trim().replace(/\/+$/, '');
      if (url) return url.endsWith('/api/v1') ? url : `${url}/api/v1`;
    }
    // 2. Runtime localStorage override
    try {
      const stored = localStorage.getItem('crm_api_base_url');
      if (stored && stored.trim().startsWith('http')) {
        const url = stored.trim().replace(/\/+$/, '');
        return url.endsWith('/api/v1') ? url : `${url}/api/v1`;
      }
    } catch {}

    // 3. Dynamic subdomain resolution: admin.<domain> -> api.<domain>
    if (window.location.hostname.startsWith('admin.')) {
      const apiHost = window.location.hostname.replace(/^admin\./, 'api.');
      return `${window.location.protocol}//${apiHost}/api/v1`;
    }

    const isTestTwoOrigin =
      window.location.port === '4173' &&
      (window.location.search.includes('originB=3333') ||
        Boolean((window as any).__ORIGIN_B__));
    if (isTestTwoOrigin) {
      return `${window.location.protocol}//${window.location.hostname}:3333/api/v1`;
    }
  }
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL as string;
  }
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL as string;
  }
  return '/api/v1';
};

/**
 * Resolves the public HTTPS base URL for external incoming webhooks (Meta, IndiaMART, etc.)
 * Strictly avoids returning naked relative paths like "/api/v1".
 */
export const getPublicWebhookBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    const customTunnel = localStorage.getItem('crm_custom_webhook_domain');
    if (customTunnel && customTunnel.trim().startsWith('http')) {
      return customTunnel.trim().replace(/\/+$/, '');
    }
    const isDevHost = window.location.hostname.startsWith('local') || window.location.hostname === '127.0.0.1';
    if (window.location.origin.startsWith('https://') && !isDevHost) {
      return window.location.origin;
    }
  }
  if (import.meta.env.VITE_PUBLIC_API_URL) {
    return (import.meta.env.VITE_PUBLIC_API_URL as string).replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
};

const api = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
  withCredentials: true,
});

/**
 * Maps API errors to safe, separated, and human-friendly user messages:
 * 1. No response at all (network or CORS) -> 'Cannot reach the server. Check your connection.'
 * 2. 404 or 405 -> 'This feature is not available yet. We are updating the system, please try again in a few minutes.'
 * 3. 429 -> 'Too many attempts. Please wait and try again.'
 * 4. 5xx -> 'Something went wrong on our side. Please try again.'
 * 5. 400 from validation -> show the field messages. Never show raw server text or paths.
 */
export function getApiErrorMessage(err: any): string {
  // Case 1: No response at all (network, DNS, timeout, or CORS)
  if (!err?.response) {
    return 'Cannot reach the server. Check your connection.';
  }

  const status = err.response.status;

  // Case 2: 404 Not Found or 405 Method Not Allowed
  if (status === 404 || status === 405) {
    return 'This feature is not available yet. We are updating the system, please try again in a few minutes.';
  }

  // Case 3: 429 Rate limiting
  if (status === 429) {
    return 'Too many attempts. Please wait and try again.';
  }

  // Case 4: 5xx Server errors
  if (status >= 500) {
    return 'Something went wrong on our side. Please try again.';
  }

  // Case 5: 400 Validation errors
  if (status === 400) {
    const data = err.response.data;
    if (data?.message) {
      if (Array.isArray(data.message)) {
        const cleanList = data.message
          .map((m: any) => String(m).replace(/[A-Za-z]:\\[^ ]+|\/[a-zA-Z0-9_\-./]+/g, '').trim())
          .filter(Boolean);
        if (cleanList.length > 0) {
          return cleanList.join(', ');
        }
      } else if (typeof data.message === 'string') {
        const clean = data.message.replace(/[A-Za-z]:\\[^ ]+|\/[a-zA-Z0-9_\-./]+/g, '').trim();
        const lower = clean.toLowerCase();
        if (clean && !lower.includes('syntaxerror') && !lower.includes('prisma') && !lower.includes('stack')) {
          return clean;
        }
      }
    }
    return 'Invalid request details. Please check the fields and try again.';
  }

  // 401 Unauthorized
  if (status === 401) {
    return err.response.data?.message || 'Incorrect email or password. Please check and try again.';
  }

  // 403 Forbidden
  if (status === 403) {
    return err.response.data?.message || 'Access restricted. Please contact your administrator.';
  }

  const fallback = err.response.data?.message;
  if (typeof fallback === 'string' && !fallback.includes('/') && !fallback.includes('\\')) {
    return fallback;
  }

  return 'Unable to complete request. Please try again.';
}

export const resolveFileUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  const apiBase = getApiBaseUrl();
  let apiOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  try {
    if (apiBase.startsWith('http://') || apiBase.startsWith('https://')) {
      apiOrigin = new URL(apiBase).origin;
    } else if (apiOrigin) {
      apiOrigin = new URL(apiBase, apiOrigin).origin;
    }
  } catch {
    apiOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  }
  if (url.startsWith('/')) {
    if (url.startsWith('/assets/')) {
      return url;
    }
    return `${apiOrigin}${url}`;
  }
  return `${apiBase}/${url}`;
};

export const fetchPrivateFileBlobUrl = async (url: string): Promise<string> => {
  if (!url) return '';
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  let path = url;
  const apiBase = getApiBaseUrl();
  if (path.startsWith(apiBase)) {
    path = path.substring(apiBase.length);
  }
  if (path.startsWith('/api/v1/')) {
    path = path.substring('/api/v1'.length);
  }
  if (!path.startsWith('/') && !path.startsWith('http://') && !path.startsWith('https://')) {
    path = '/' + path;
  }
  const res = await api.get(path, { responseType: 'blob' });
  return URL.createObjectURL(res.data);
};

const STAFF_TOKEN_STORAGE_KEY = 'crm_staff_token';
const PLATFORM_TOKEN_STORAGE_KEY = 'crm_platform_token';
const STAFF_REFRESH_KEY = 'crm_refresh_token_fb';
const PLATFORM_REFRESH_KEY = 'platform_refresh_token_fb';

let _inMemoryStaffToken: string | null =
  typeof window !== 'undefined' ? localStorage.getItem(STAFF_TOKEN_STORAGE_KEY) : null;
let _inMemoryPlatformToken: string | null =
  typeof window !== 'undefined' ? localStorage.getItem(PLATFORM_TOKEN_STORAGE_KEY) : null;
let _currentTabUserId: string | null =
  typeof window !== 'undefined'
    ? sessionStorage.getItem('crm_tab_user_id') || localStorage.getItem('crm_tab_user_id')
    : null;

export const setCurrentTabUserId = (id: string | null) => {
  _currentTabUserId = id;
  if (typeof window !== 'undefined') {
    if (id) {
      sessionStorage.setItem('crm_tab_user_id', id);
      localStorage.setItem('crm_tab_user_id', id);
    } else {
      sessionStorage.removeItem('crm_tab_user_id');
      localStorage.removeItem('crm_tab_user_id');
    }
  }
};

export const getCurrentTabUserId = (): string | null => {
  if (_currentTabUserId) return _currentTabUserId;
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem('crm_tab_user_id') || localStorage.getItem('crm_tab_user_id');
  }
  return null;
};

export const isPlatformPath = (pathname?: string): boolean => {
  const p = pathname || (typeof window !== 'undefined' ? window.location.pathname : '');
  return p.startsWith('/platform');
};

export const isPublicRoute = (pathname?: string): boolean => {
  const p = pathname || (typeof window !== 'undefined' ? window.location.pathname : '');
  return (
    p === '/' ||
    p === '/features' ||
    p === '/solutions' ||
    p === '/pricing' ||
    p === '/landing' ||
    p === '/login' ||
    p === '/platform/login' ||
    p === '/forgot-password' ||
    p.startsWith('/reset-password') ||
    p === '/inquiry' ||
    p === '/quote-request' ||
    p === '/shared-cart' ||
    p === '/cart-share' ||
    p === '/cart'
  );
};

let _inMemoryImpersonateToken: string | null = null;

export const setImpersonationAccessToken = (token: string | null) => {
  _inMemoryImpersonateToken = token;
};

export const getImpersonationAccessToken = (): string | null => {
  return _inMemoryImpersonateToken;
};

export const setAccessToken = (token: string | null, forcePlatform?: boolean) => {
  const isPlatform = forcePlatform !== undefined ? forcePlatform : isPlatformPath();
  if (isPlatform) {
    setPlatformAccessToken(token);
  } else {
    setStaffAccessToken(token);
  }
};

export const setStaffAccessToken = (token: string | null) => {
  _inMemoryStaffToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem(STAFF_TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(STAFF_TOKEN_STORAGE_KEY);
    }
  }
};

export const setPlatformAccessToken = (token: string | null) => {
  _inMemoryPlatformToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem(PLATFORM_TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(PLATFORM_TOKEN_STORAGE_KEY);
    }
  }
};

export const getAccessToken = (forcePlatform?: boolean) => {
  if (_inMemoryImpersonateToken) {
    return _inMemoryImpersonateToken;
  }
  const isPlatform = forcePlatform !== undefined ? forcePlatform : isPlatformPath();
  if (isPlatform) {
    if (!_inMemoryPlatformToken && typeof window !== 'undefined') {
      _inMemoryPlatformToken = localStorage.getItem(PLATFORM_TOKEN_STORAGE_KEY);
    }
    return _inMemoryPlatformToken;
  } else {
    if (!_inMemoryStaffToken && typeof window !== 'undefined') {
      _inMemoryStaffToken = localStorage.getItem(STAFF_TOKEN_STORAGE_KEY);
    }
    return _inMemoryStaffToken;
  }
};

export const getStoredRefreshToken = (isPlatform?: boolean): string | null => {
  if (typeof window === 'undefined') return null;
  const key = isPlatform ? PLATFORM_REFRESH_KEY : STAFF_REFRESH_KEY;
  try {
    return localStorage.getItem(key) || sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

export const setStoredRefreshToken = (token: string | null, isPlatform?: boolean) => {
  if (typeof window === 'undefined') return;
  const key = isPlatform ? PLATFORM_REFRESH_KEY : STAFF_REFRESH_KEY;
  try {
    if (token) {
      localStorage.setItem(key, token);
      sessionStorage.setItem(key, token);
    } else {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
};

// Attach token to every request
api.interceptors.request.use((config) => {
  const isPlatformReq =
    config.url?.startsWith('/platform') ||
    config.url?.startsWith('/platform-auth') ||
    isPlatformPath();
  const token = getAccessToken(isPlatformReq);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers['X-Requested-With'] = 'XMLHttpRequest';
  return config;
});

// Singleton mutex promises for in-flight refresh requests (Staff and Platform)
let _activeStaffRefreshPromise: Promise<any> | null = null;
let _activePlatformRefreshPromise: Promise<any> | null = null;

export const performStaffRefresh = async (): Promise<any> => {
  if (_activeStaffRefreshPromise) {
    return _activeStaffRefreshPromise;
  }

  const expectedUserId = getCurrentTabUserId();

  _activeStaffRefreshPromise = (async () => {
    try {
      const res = await acquireCrossTabRefreshLock('staff', expectedUserId, async () => {
        const refreshUrl = `${getApiBaseUrl()}/auth/refresh`;
        const fallbackToken = getStoredRefreshToken(false);
        const payload: Record<string, any> = fallbackToken ? { refreshToken: fallbackToken } : {};
        if (expectedUserId) {
          payload.expectedUserId = expectedUserId;
        }

        return axios.post(
          refreshUrl,
          payload,
          {
            withCredentials: true,
            timeout: 60000,
            headers: {
              'X-Requested-With': 'XMLHttpRequest',
              'Content-Type': 'application/json',
              ...(expectedUserId ? { 'X-Expected-User-Id': expectedUserId } : {}),
            },
          }
        );
      });

      const data = res.data;
      if (typeof window !== 'undefined' && data?.user) {
        if (expectedUserId && expectedUserId !== data.user.id) {
          setStaffAccessToken(null);
          clearTabSessionUser();
          window.dispatchEvent(
            new CustomEvent('crm:session-conflict-reload', {
              detail: { message: 'You signed in with another account in a different tab' },
            })
          );
          const err = new Error('SESSION_CHANGED');
          (err as any).response = { status: 409, data: { code: 'SESSION_CHANGED' } };
          throw err;
        }
      }

      if (data?.accessToken) {
        setStaffAccessToken(data.accessToken);
      }
      if (data?.refreshToken) {
        setStoredRefreshToken(data.refreshToken, false);
      }
      if (typeof window !== 'undefined' && data?.user && !getCurrentTabUserId()) {
        setCurrentTabUserId(data.user.id);
        sessionStorage.setItem('crm_tab_user_email', data.user.email);
        sessionStorage.setItem('crm_tab_tenant_id', data.user.tenantId || '');
        sessionStorage.setItem('crm_tab_tenant_name', data.user.tenant?.name || '');
        sessionStorage.setItem('crm_tab_tenant_code', data.user.tenant?.code || '');
        sessionStorage.setItem('crm_tab_portal', 'staff');
      }
      return res;
    } catch (err: any) {
      if (err?.response?.status === 409 && (err?.response?.data?.code === 'SESSION_CHANGED' || err?.response?.data?.message?.includes('Session changed'))) {
        setStaffAccessToken(null);
        clearTabSessionUser();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('crm:session-conflict-reload', {
              detail: { message: 'You signed in with another account in a different tab' },
            })
          );
        }
        throw err;
      }

      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        setStaffAccessToken(null);
        setStoredRefreshToken(null, false);
        if (typeof document !== 'undefined') {
          document.cookie = 'crm_session_active=; Path=/; Max-Age=0; SameSite=Lax';
        }
        if (
          typeof window !== 'undefined' &&
          !isPublicRoute(window.location.pathname)
        ) {
          try {
            sessionStorage.setItem('crm_session_expired', 'Your session has expired. Please log in again.');
          } catch {}
          window.history.replaceState(null, '', '/login?expired=1');
          window.location.href = '/login?expired=1';
        }
      }
      throw err;
    } finally {
      _activeStaffRefreshPromise = null;
    }
  })();

  return _activeStaffRefreshPromise;
};

export const performPlatformRefresh = async (): Promise<any> => {
  if (_activePlatformRefreshPromise) {
    return _activePlatformRefreshPromise;
  }

  const expectedUserId = getCurrentTabUserId();

  _activePlatformRefreshPromise = (async () => {
    try {
      const res = await acquireCrossTabRefreshLock('platform', expectedUserId, async () => {
        const refreshUrl = `${getApiBaseUrl()}/platform-auth/refresh`;
        const fallbackToken = getStoredRefreshToken(true);
        const payload: Record<string, any> = fallbackToken ? { refreshToken: fallbackToken } : {};
        if (expectedUserId) {
          payload.expectedUserId = expectedUserId;
        }

        return axios.post(
          refreshUrl,
          payload,
          {
            withCredentials: true,
            timeout: 60000,
            headers: {
              'X-Requested-With': 'XMLHttpRequest',
              'Content-Type': 'application/json',
              ...(expectedUserId ? { 'X-Expected-User-Id': expectedUserId } : {}),
            },
          }
        );
      });

      const data = res.data;
      if (typeof window !== 'undefined' && data?.user) {
        if (expectedUserId && expectedUserId !== data.user.id) {
          setPlatformAccessToken(null);
          clearTabSessionUser();
          window.dispatchEvent(
            new CustomEvent('crm:session-conflict-reload', {
              detail: { message: 'You signed in with another account in a different tab' },
            })
          );
          const err = new Error('SESSION_CHANGED');
          (err as any).response = { status: 409, data: { code: 'SESSION_CHANGED' } };
          throw err;
        }
      }

      if (data?.accessToken) {
        setPlatformAccessToken(data.accessToken);
      }
      if (data?.refreshToken) {
        setStoredRefreshToken(data.refreshToken, true);
      }
      if (typeof window !== 'undefined' && data?.user && !getCurrentTabUserId()) {
        setCurrentTabUserId(data.user.id);
        sessionStorage.setItem('crm_tab_platform_user_id', data.user.id);
        sessionStorage.setItem('crm_tab_platform_user_email', data.user.email);
        sessionStorage.setItem('crm_tab_portal', 'platform');
      }
      return res;
    } catch (err: any) {
      if (err?.response?.status === 409 && (err?.response?.data?.code === 'SESSION_CHANGED' || err?.response?.data?.message?.includes('Session changed'))) {
        setPlatformAccessToken(null);
        clearTabSessionUser();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('crm:session-conflict-reload', {
              detail: { message: 'You signed in with another account in a different tab' },
            })
          );
        }
        throw err;
      }

      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        setPlatformAccessToken(null);
        setStoredRefreshToken(null, true);
        if (typeof document !== 'undefined') {
          document.cookie = 'crm_platform_session_active=; Path=/; Max-Age=0; SameSite=Lax';
        }
        if (typeof window !== 'undefined' && !isPublicRoute(window.location.pathname)) {
          try {
            sessionStorage.setItem('crm_session_expired', 'Your session has expired. Please log in again.');
          } catch {}
          window.history.replaceState(null, '', '/login?expired=1');
          window.location.href = '/login?expired=1';
        }
      }
      throw err;
    } finally {
      _activePlatformRefreshPromise = null;
    }
  })();

  return _activePlatformRefreshPromise;
};

// Auth endpoints that should not trigger auto-refresh retry loop
const AUTH_NO_RETRY_URLS = [
  '/auth/login',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/platform-auth/login',
  '/platform-auth/logout',
];

// Auto-refresh on 401 and detection of identity change
api.interceptors.response.use(
  (res) => {
    // Requirement 5: No silent identity change anywhere: if /auth/me or any API response returns a user id different from the one stored for this tab, treat it as SESSION_CHANGED.
    const incomingUser = res?.data?.user;
    if (incomingUser && incomingUser.id) {
      const currentTabId = getCurrentTabUserId();
      if (currentTabId && currentTabId !== incomingUser.id) {
        setStaffAccessToken(null);
        setPlatformAccessToken(null);
        clearTabSessionUser();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('crm:session-conflict-reload', {
              detail: { message: 'You signed in with another account in a different tab' },
            })
          );
        }
      }
    }
    return res;
  },
  async (err) => {
    const original = err.config;
    const url: string = original?.url || '';
    const status = err.response?.status;

    // Handle 409 SESSION_CHANGED: tab identity mismatch. Do NOT wipe server cookies!
    if (status === 409 && (err.response?.data?.code === 'SESSION_CHANGED' || err.response?.data?.message?.includes('Session changed'))) {
      setStaffAccessToken(null);
      setPlatformAccessToken(null);
      clearTabSessionUser();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('crm:session-conflict-reload', {
            detail: { message: 'You signed in with another account in a different tab' },
          })
        );
      }
      return Promise.reject(err);
    }

    // Handle 401/403 directly on the refresh endpoints: session is permanently expired/invalidated
    if ((status === 401 || status === 403) && (url.includes('/auth/refresh') || url.includes('/platform-auth/refresh'))) {
      const isPlatform = url.includes('/platform-auth/refresh') || isPlatformPath();
      if (isPlatform) {
        setPlatformAccessToken(null);
        setStoredRefreshToken(null, true);
        if (typeof document !== 'undefined') {
          document.cookie = 'crm_platform_session_active=; Path=/; Max-Age=0; SameSite=Lax';
        }
        if (typeof window !== 'undefined' && !isPublicRoute(window.location.pathname)) {
          try {
            sessionStorage.setItem('crm_session_expired', 'Your session has expired. Please log in again.');
          } catch {}
          window.location.href = '/login?expired=1';
        }
      } else {
        setStaffAccessToken(null);
        setStoredRefreshToken(null, false);
        if (typeof document !== 'undefined') {
          document.cookie = 'crm_session_active=; Path=/; Max-Age=0; SameSite=Lax';
        }
        if (
          typeof window !== 'undefined' &&
          !isPublicRoute(window.location.pathname)
        ) {
          try {
            sessionStorage.setItem('crm_session_expired', 'Your session has expired. Please log in again.');
          } catch {}
          window.location.href = '/login?expired=1';
        }
      }
      return Promise.reject(err);
    }
    // Requirement 6: After a 403 with pageKey, dispatch event to refresh access and navigate
    if (err.response?.status === 403 && (err.response?.data?.pageKey || err.response?.data?.message?.includes('access'))) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('crm:page-access-revoked', {
            detail: {
              pageKey: err.response.data?.pageKey,
              message: 'Your access was changed',
            },
          }),
        );
      }
    }

    // Never retry credentials/login endpoints — let the caller handle error displays
    if (AUTH_NO_RETRY_URLS.some((p) => url.includes(p))) {
      return Promise.reject(err);
    }

    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;

      const isPlatformReq =
        url.startsWith('/platform') ||
        url.startsWith('/platform-auth') ||
        isPlatformPath();

      if (isPlatformReq) {
        try {
          const res = await performPlatformRefresh();
          const newToken = res.data?.accessToken;
          original.headers.Authorization = `Bearer ${newToken}`;
          return api(original);
        } catch {
          return Promise.reject(err);
        }
      } else {
        try {
          const res = await performStaffRefresh();
          const newToken = res.data?.accessToken;
          original.headers.Authorization = `Bearer ${newToken}`;
          return api(original);
        } catch {
          return Promise.reject(err);
        }
      }
    }
    return Promise.reject(err);
  },
);

export default api;

export type ColdStartListener = (isWakingUp: boolean) => void;
const coldStartListeners: Set<ColdStartListener> = new Set();

export const subscribeColdStart = (listener: ColdStartListener) => {
  coldStartListeners.add(listener);
  return () => {
    coldStartListeners.delete(listener);
  };
};

const notifyColdStart = (isWakingUp: boolean) => {
  coldStartListeners.forEach((fn) => fn(isWakingUp));
};

export async function requestWithColdStartRetry<T>(
  requestFn: () => Promise<T>,
  options: { retries?: number; timeoutMs?: number } = {}
): Promise<T> {
  const retries = options.retries ?? 2;
  let lastError: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let timer: NodeJS.Timeout | null = null;
    let isWaking = false;

    timer = setTimeout(() => {
      isWaking = true;
      notifyColdStart(true);
    }, 2500);

    try {
      const result = await requestFn();
      if (timer) clearTimeout(timer);
      if (isWaking) notifyColdStart(false);
      return result;
    } catch (err: any) {
      if (timer) clearTimeout(timer);
      if (isWaking) notifyColdStart(false);
      lastError = err;

      const isNetworkOrTimeout =
        !err.response ||
        err.code === 'ERR_NETWORK' ||
        err.code === 'ECONNABORTED' ||
        err.message?.includes('timeout') ||
        [502, 503, 504].includes(err.response?.status);

      if (isNetworkOrTimeout && attempt < retries) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      break;
    }
  }

  throw lastError;
}

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
  getHealth: () => api.get('/health'),
  login: (identifier: string, password: string, companyCode?: string, keepSignedIn?: boolean) =>
    requestWithColdStartRetry(() =>
      api.post('/auth/login', { identifier, password, companyCode, keepSignedIn }, { timeout: 60000 })
    ),
  selectCompany: (selectionToken: string, companyCode: string) =>
    api.post('/auth/login/select-company', { selectionToken, companyCode }),
  platformLogin: (email: string, password: string, keepSignedIn?: boolean) =>
    requestWithColdStartRetry(() =>
      api.post('/platform-auth/login', { email, password, keepSignedIn }, { timeout: 60000 })
    ),
  getPasswordPolicy: () => api.get('/auth/password-policy'),
  forgotPasswordStart: (lookup: string, companyCode?: string) =>
    requestWithColdStartRetry(() =>
      api.post('/auth/forgot-password/start', { lookup, companyCode }, { timeout: 30000 })
    ),
  forgotPasswordVerifyPhoneFlow: (flowId: string, phone: string) =>
    requestWithColdStartRetry(() =>
      api.post('/auth/forgot-password/verify-phone', { flowId, phone }, { timeout: 30000 })
    ),
  forgotPasswordVerifyEmailFlow: (flowId: string, email: string) =>
    requestWithColdStartRetry(() =>
      api.post('/auth/forgot-password/verify-email', { flowId, email }, { timeout: 30000 })
    ),
  forgotPasswordSendCode: (flowId: string) =>
    requestWithColdStartRetry(() =>
      api.post('/auth/forgot-password/send-code', { flowId }, { timeout: 60000 })
    ),
  forgotPasswordVerifyCodeFlow: (flowId: string, code: string) =>
    api.post('/auth/forgot-password/verify-code', { flowId, code }),
  forgotPasswordLookup: (identifier: string, companyCode?: string) =>
    requestWithColdStartRetry(() =>
      api.post('/auth/forgot-password/lookup', { identifier, companyCode }, { timeout: 30000 })
    ),
  forgotPasswordVerifyPhone: (lookupToken: string, phone: string) =>
    requestWithColdStartRetry(() =>
      api.post('/auth/forgot-password/verify-phone', { lookupToken, phone }, { timeout: 30000 })
    ),
  forgotPasswordRequest: (email: string, companyCode?: string, phone?: string, phoneVerifiedToken?: string) =>
    requestWithColdStartRetry(() =>
      api.post('/auth/forgot-password/request', { email, companyCode, phone, phoneVerifiedToken }, { timeout: 60000 })
    ),
  forgotPasswordVerify: (email: string, code: string) =>
    api.post('/auth/forgot-password/verify', { email, code }),
  forgotPasswordReset: (resetTicket: string, accountIds: string[], newPassword: string) =>
    api.post('/auth/forgot-password/reset', { resetTicket, accountIds, newPassword }),
  forgotPassword: (email: string, companyCode?: string) =>
    requestWithColdStartRetry(() =>
      api.post('/auth/forgot-password/request', { email, companyCode }, { timeout: 60000 })
    ),
  resetPassword: (token: string, newPassword: string) =>
    api.post('/auth/reset-password', { token, newPassword }),
  me: () => api.get('/auth/me'),
  checkCurrentSession: async () => {
    return axios.get(`${getApiBaseUrl()}/auth/session-probe`, {
      withCredentials: true,
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
  },
  getRecentSignIns: () => api.get('/auth/recent-signins'),
  getSessions: () => api.get('/auth/sessions'),
  revokeSession: (id: string) => api.delete(`/auth/sessions/${id}`),
  revokeOtherSessions: () => api.delete('/auth/sessions'),
  getActivity: () => api.get('/auth/activity'),
  reportSuspiciousActivity: () => api.post('/auth/security-alert/signout-and-reset', {}),
  requestEmailChangeOtp: (currentPassword: string, newEmail: string) =>
    api.post('/auth/profile/email/request-otp', { currentPassword, newEmail }),
  verifyEmailChangeOtp: (newEmail: string, code: string) =>
    api.post('/auth/profile/email/verify-otp', { newEmail, code }),
  requestPhoneChangeOtp: (currentPassword: string, newPhone: string) =>
    api.post('/auth/profile/phone/request-otp', { currentPassword, newPhone }),
  verifyPhoneChangeOtp: (newPhone: string, code: string) =>
    api.post('/auth/profile/phone/verify-otp', { newPhone, code }),
  refresh: () => performStaffRefresh(),
  logout: (expectedUserId?: string) => {
    const uid = expectedUserId || getCurrentTabUserId() || undefined;
    setStoredRefreshToken(null, false);
    return api.post('/auth/logout', { expectedUserId: uid });
  },
  logoutAll: (expectedUserId?: string) => {
    const uid = expectedUserId || getCurrentTabUserId() || undefined;
    setStoredRefreshToken(null, false);
    setStoredRefreshToken(null, true);
    return api.post('/auth/logout-all', { expectedUserId: uid });
  },
  updateProfile: (data: { name?: string; phone?: string; photoUrl?: string }) =>
    api.patch('/auth/profile', data),
  changePassword: (currentPass: string, newPass: string, logoutOthers?: boolean) =>
    api.post('/auth/change-password', { currentPass, newPass, logoutOthers: logoutOthers ?? true }),
  // 2-Step Verification
  verifyTwoFactor: (data: { loginTicket: string; code: string; trustDevice?: boolean }) =>
    api.post('/auth/login/verify-2fa', data),
  sendTwoFactorEmail: (data: { loginTicket: string }) =>
    api.post('/auth/login/send-2fa-email', data),
  getTwoFactorStatus: () => api.get('/auth/2fa/status'),
  setupTwoFactor: () => api.post('/auth/2fa/setup', {}),
  enableTwoFactor: (data: { code: string }) => api.post('/auth/2fa/enable', data),
  regenerateBackupCodes: (data: { currentPass: string; code: string }) =>
    api.post('/auth/2fa/backup-codes/regenerate', data),
  disableTwoFactor: (data: { currentPass: string; code: string }) =>
    api.post('/auth/2fa/disable', data),
  getTrustedDevices: () => api.get('/auth/devices/trusted'),
  revokeTrustedDevice: (id: string) => api.delete(`/auth/devices/trusted/${id}`),
  revokeAllTrustedDevices: () => api.delete('/auth/devices/trusted'),
};

// ─── Platform Auth ───────────────────────────────────────────────────────────
export const platformAuthApi = {
  login: (email: string, password: string, keepSignedIn?: boolean) =>
    requestWithColdStartRetry(() =>
      api.post('/platform-auth/login', { email, password, keepSignedIn }, { timeout: 60000 })
    ),
  verifyTwoFactor: (data: { loginTicket: string; code: string; trustDevice?: boolean }) =>
    api.post('/platform-auth/verify-2fa', data),
  sendTwoFactorEmail: (data: { loginTicket: string }) =>
    api.post('/platform-auth/send-2fa-email', data),
  me: () => api.get('/platform-auth/me'),
  checkCurrentSession: async () => {
    return axios.get(`${getApiBaseUrl()}/platform-auth/session-probe`, {
      withCredentials: true,
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
  },
  refresh: () => performPlatformRefresh(),
  logout: (expectedUserId?: string) => {
    const uid = expectedUserId || getCurrentTabUserId() || undefined;
    setStoredRefreshToken(null, true);
    return api.post('/platform-auth/logout', { expectedUserId: uid });
  },
};

// ─── Platform Multi-Tenant Master Portal ──────────────────────────────────────
export const platformApi = {
  listTenants: () => api.get('/platform/tenants'),
  getTenant: (id: string) => api.get(`/platform/tenants/${id}`),
  createTenant: (data: any) => api.post('/platform/tenants', data),
  updateTenant: (id: string, data: any) => api.put(`/platform/tenants/${id}`, data),
  deleteTenant: (id: string) => api.delete(`/platform/tenants/${id}`),
  impersonateTenant: (id: string) => api.post(`/platform/tenants/${id}/impersonate`),
  resetAdminPassword: (id: string, data?: { newPassword?: string; sendEmail?: boolean; mustResetPassword?: boolean; appUrl?: string; adminEmail?: string; adminPhone?: string }) =>
    api.post(`/platform/tenants/${id}/reset-admin-password`, data || {}),
  listTenantUsers: (tenantId: string) => api.get(`/platform/tenants/${tenantId}/users`),
  addTenantUser: (tenantId: string, data: any) => api.post(`/platform/tenants/${tenantId}/users`, data),
  deleteTenantUser: (tenantId: string, userId: string) => api.delete(`/platform/tenants/${tenantId}/users/${userId}`),
  listAdmins: () => api.get('/platform/admins'),
  createAdmin: (data: any) => api.post('/platform/admins', data),
  toggleAdminActive: (id: string, isActive?: boolean) => api.patch(`/platform/admins/${id}/toggle-active`, { isActive }),
  resetAdminUserPassword: (id: string) => api.post(`/platform/admins/${id}/reset-password`),
  deleteAdmin: (id: string) => api.delete(`/platform/admins/${id}`),
  getSystemInfo: () => api.get('/platform/system-info'),
  getMailStatus: () => api.get('/platform/mail-status'),
  sendMailTest: () => api.post('/platform/mail-test'),
  getRecentSignIns: () => api.get('/platform/recent-signins'),
};

// ─── Dashboard ───────────────────────────────────────────────────────────────
export const dashboardApi = {
  getKpis: (range?: string) => api.get('/dashboard/kpis', { params: range ? { range } : undefined }),
  completeActivity: (id: string) => api.patch('/dashboard/activities/' + id + '/complete'),
  getConversion: () => api.get('/dashboard/conversion'),
};

// ─── Notifications & Email Log ───────────────────────────────────────────────
export const notificationsApi = {
  list: (params?: Record<string, any>) => api.get('/notifications', { params }),
  syncGoDaddy: () => api.post('/notifications/sync-godaddy'),
  postInboundReply: (data: any) => api.post('/notifications/inbound-email', data),
};

// ─── Leads ───────────────────────────────────────────────────────────────────
export const leadsApi = {
  list: (params?: Record<string, any>) => api.get('/leads', { params }),
  get: (id: string) => api.get(`/leads/${id}`),
  create: (data: any) => api.post('/leads', data),
  createLead: (data: any) => api.post('/leads', data),
  updateStatus: (id: string, data: any) => api.patch(`/leads/${id}/status`, data),
  addActivity: (id: string, data: any) => api.post(`/leads/${id}/activities`, data),
  shareLead: (id: string, targetUserId: string) => api.post(`/leads/${id}/share`, { targetUserId }),
  previewSpreadsheet: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/leads/import-preview', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  previewJson: (records: any[]) => api.post('/leads/import-preview-json', { records }),
  commitImport: (records: any[]) => api.post('/leads/import-commit', { records }),
};

// ─── Orders ──────────────────────────────────────────────────────────────────
export const ordersApi = {
  list: (params?: Record<string, any>) => api.get('/orders', { params }),
  get: (id: string) => api.get(`/orders/${id}`),
  create: (data: any) => api.post('/orders', data),
  update: (id: string, data: any) => api.patch(`/orders/${id}`, data),
  updateStatus: (id: string, data: any) => api.patch(`/orders/${id}/status`, data),
  listShipments: (params?: Record<string, any>) => api.get('/orders/shipments/list', { params }),
  createShipment: (data: any) => api.post('/orders/shipments', data),
  updateShipmentStatus: (id: string, status: string) =>
    api.patch(`/orders/shipments/${id}/status`, { status }),
  updateShipment: (id: string, data: any) =>
    api.patch(`/orders/shipments/${id}`, data),
  verifyLiveTrackingUrl: (data: { trackingUrl?: string; courierName?: string; trackingNumber?: string }) =>
    api.post('/orders/shipments/verify-live-url', data),
  syncShipmentTracking: (id: string) => api.post(`/orders/shipments/${id}/sync-tracking`),
  getShipmentLiveTimeline: (id: string) => api.get(`/orders/shipments/${id}/live-timeline`),
  recordPayment: (id: string, data: any) => api.post(`/orders/${id}/payments`, data),
};

// ─── Quotations ───────────────────────────────────────────────────────────────
export const quotationsApi = {
  list: (params?: Record<string, any>) => api.get('/quotations', { params }),
  get: (id: string) => api.get(`/quotations/${id}`),
  create: (data: any) => api.post('/quotations', data),
  update: (id: string, data: any) => api.patch(`/quotations/${id}`, data),
  updateStatus: (id: string, status: string) => api.patch(`/quotations/${id}/status`, { status }),
  convertToOrder: (id: string) => api.post(`/quotations/${id}/convert-to-order`),
};

// ─── Inventory ───────────────────────────────────────────────────────────────
export const inventoryApi = {
  getStock: (params?: Record<string, any>) => api.get('/inventory/stock', { params }),
  recordMovement: (data: any) => api.post('/inventory/movements', data),
  getReorderAlerts: () => api.get('/inventory/reorder-alerts'),
  getWarehouses: () => api.get('/inventory/warehouses'),
  createWarehouse: (data: any) => api.post('/inventory/warehouses', data),
  getSkus: (search?: string) => api.get('/inventory/skus', { params: { search } }),
  getSku: (id: string) => api.get(`/inventory/skus/${id}`),
  createSku: (data: any) => api.post('/inventory/skus', data),
  updateSku: (id: string, data: any) => api.patch(`/inventory/skus/${id}`, data),
  deleteSku: (id: string) => api.delete(`/inventory/skus/${id}`),
  bulkDeleteSkus: (ids: string[]) => api.post('/inventory/skus/bulk-delete', { ids }),
  importCsv: (file: File, warehouseCode?: string) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/inventory/import-csv', fd, {
      params: { warehouseCode },
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  importSpreadsheetFile: (file: File, warehouseCode?: string) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/inventory/import-csv', fd, {
      params: { warehouseCode },
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  importJson: (records: any[], warehouseCode?: string) =>
    api.post('/inventory/import-json', { records, warehouseCode }),
  importSpreadsheetJson: (records: any[], warehouseCode?: string) =>
    api.post('/inventory/import-json', { records, warehouseCode }),
  getTransfers: (params?: Record<string, any>) => api.get('/inventory/transfers', { params }),
  getTransfersSummary: () => api.get('/inventory/transfers/summary'),
  initiateTransfer: (data: any) => api.post('/inventory/transfers', data),
  receiveTransfer: (id: string) => api.patch(`/inventory/transfers/${id}/receive`),
  cancelTransfer: (id: string) => api.patch(`/inventory/transfers/${id}/cancel`),
  getProjectStock: (params?: Record<string, any>) => api.get('/inventory/project-stock', { params }),
  getProjectStockSummary: () => api.get('/inventory/project-stock/summary'),
  createProjectStock: (data: any) => api.post('/inventory/project-stock', data),
  createProjectStockPosition: (data: any) => api.post('/inventory/project-stock', data),
  updateProjectStock: (id: string, data: any) => api.patch(`/inventory/project-stock/${id}`, data),
  updateProjectStockPosition: (id: string, data: any) => api.patch(`/inventory/project-stock/${id}`, data),
  deleteProjectStock: (id: string) => api.delete(`/inventory/project-stock/${id}`),
  deleteProjectStockPosition: (id: string) => api.delete(`/inventory/project-stock/${id}`),
  recordProjectStockPurchase: (id: string, data: any) =>
    api.post(`/inventory/project-stock/${id}/purchase`, data),
  bulkImportProjectStock: (rows: any[]) => api.post('/inventory/project-stock/bulk', { rows }),
  clearAll: (confirmPhrase = 'WIPE-INVENTORY', password = '') =>
    api.post('/inventory/clear-all', { confirmPhrase, password }),
  getProducts: () => api.get('/inventory/products'),
  seedProducts: () => api.post('/inventory/seed-products'),
  getDashboard: () => api.get('/inventory/dashboard'),
  uploadPurchaseDocument: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/inventory/purchase-documents/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  extractPurchaseDocument: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/inventory/purchase-documents/extract', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  getSupplierPurchases: (supplierId: string) => api.get(`/inventory/suppliers/${supplierId}/purchases`),
  recordSupplierPurchase: (supplierId: string, data: any) => api.post(`/inventory/suppliers/${supplierId}/purchase`, data),
  getPurchaseBills: (params?: Record<string, any>) => api.get('/inventory/purchase-bills', { params }),
  getPurchaseBill: (id: string) => api.get(`/inventory/purchase-bills/${id}`),
  createPurchaseBill: (data: any) => api.post('/inventory/purchase-bills', data),
  deletePurchaseBill: (id: string) => api.delete(`/inventory/purchase-bills/${id}`),
  scanBillOcr: (data: any) => api.post('/inventory/purchase-bills/scan-ocr', data),
  bulkEditComponents: (data: {
    items?: Array<{ id: string; skuId?: string; updates: Record<string, any> }>;
    ids?: string[];
    skuIds?: string[];
    updates?: Record<string, any>;
    rowUpdates?: any[];
  }) => api.post('/inventory/bulk-edit', data),
};

// ─── Suppliers ────────────────────────────────────────────────────────────────
export const suppliersApi = {
  list: (params?: Record<string, any>) => api.get('/suppliers', { params }),
  get: (id: string) => api.get(`/suppliers/${id}`),
  create: (data: any) => api.post('/suppliers', data),
  update: (id: string, data: any) => api.patch(`/suppliers/${id}`, data),
  delete: (id: string) => api.delete(`/suppliers/${id}`),
};

// ─── Invoices ─────────────────────────────────────────────────────────────────
export const invoicesApi = {
  list: (params?: Record<string, any>) => api.get('/invoices', { params }),
  get: (id: string) => api.get(`/invoices/${id}`),
  getNextNumber: (docType?: string, prefix?: string) =>
    api.get('/invoices/generate-number', { params: { docType, prefix } }),
  createDirect: (data: any) => api.post('/invoices/create-direct', data),
  update: (id: string, data: any) => api.patch(`/invoices/${id}`, data),
  generateFromOrder: (orderId: string, data?: any) =>
    api.post(`/invoices/order/${orderId}/generate`, data),
  voidInvoice: (id: string, reason: string) => api.patch(`/invoices/${id}/void`, { reason }),
  recordPayment: (id: string, data: any) => api.post(`/invoices/${id}/payments`, data),
  emailInvoice: (id: string, data?: { recipientEmail?: string; customNote?: string; templateType?: string }) =>
    api.post(`/invoices/${id}/email`, data || {}),
  downloadPdf: (id: string, templateType?: string) =>
    api.get(`/invoices/${id}/pdf`, {
      params: { templateType },
      responseType: 'blob',
    }),
  getCompanyProfile: () => api.get('/invoices/company-profile'),
  getSignatorySettings: () => api.get('/invoices/settings/signatory'),
  updateSignatorySettings: (data: {
    signatoryName?: string;
    signatoryDesignation?: string;
    signatureImage?: string | null;
    stampImage?: string | null;
  }) => api.post('/invoices/settings/signatory', data),
  getPrinters: () =>
    api.get<{
      printers: Array<{ deviceId: string; name: string; paperSizes?: string[] }>;
      defaultPrinter: { deviceId: string; name: string } | null;
    }>('/invoices/printers'),
  directPrintToPrinter: (
    id: string,
    data: {
      printerName?: string;
      copies?: number;
      copyType?: string;
      templateType?: string;
      paperSize?: string;
    },
  ) =>
    api.post<{
      success: boolean;
      message: string;
      printer: string;
      copies: number;
    }>(`/invoices/${id}/print-direct`, data),
};

// ─── Company Branding & Settings ───────────────────────────────────────────────
export const brandingApi = {
  get: (tenantId?: string) => api.get('/settings/branding', { params: tenantId ? { tenantId } : undefined }),
  update: (data: {
    companyDisplayName?: string;
    companyPhone?: string;
    companyLogoUrl?: string | null;
  }) => api.post('/settings/branding', data),
  getProfile: () => api.get('/settings/company-profile'),
  updateProfile: (data: any) => api.post('/settings/company-profile', data),
  uploadLogo: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post<{ success: boolean; message: string; logoUrl: string }>('/settings/branding/logo', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  uploadFavicon: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post<{ success: boolean; message: string; faviconUrl: string }>('/settings/branding/favicon', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export const mailAccountsApi = {
  list: () => api.get('/settings/mail-accounts'),
  create: (data: any) => api.post('/settings/mail-accounts', data),
  update: (id: string, data: any) => api.put(`/settings/mail-accounts/${id}`, data),
  delete: (id: string) => api.delete(`/settings/mail-accounts/${id}`),
  detect: (email: string) => api.post('/settings/mail-accounts/detect', { email }),
  test: (data: {
    id?: string;
    email?: string;
    smtpHost?: string;
    smtpPort?: number;
    encryption?: 'starttls' | 'ssl';
    smtpUser?: string;
    smtpPass?: string;
    sendTestEmail?: boolean;
  }) => api.post('/settings/mail-accounts/test', data),
  domainHealth: (id: string) => api.get(`/settings/mail-accounts/${id}/domain-health`),
};

export const webFormApi = {
  getSettings: () => api.get('/settings/web-form'),
  updateSettings: (data: any) => api.put('/settings/web-form', data),
  getWebhookConfig: () => api.get('/webhooks/config'),
  regenerateKey: () => api.post('/webhooks/regenerate-key'),
};

// ─── Companies / Accounts ─────────────────────────────────────────────────────
export const companiesApi = {
  list: (params?: Record<string, any>) => api.get('/companies', { params }),
  get: (id: string) => api.get(`/companies/${id}`),
  create: (data: any) => api.post('/companies', data),
  update: (id: string, data: any) => api.patch(`/companies/${id}`, data),
  delete: (id: string) => api.delete(`/companies/${id}`),
};

// ─── Users & Team Management ──────────────────────────────────────────────────
export const usersApi = {
  list: (params?: Record<string, any>) => api.get('/users', { params }),
  get: (id: string) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.patch(`/users/${id}`, data),
  resetCredentials: (id: string) => api.post(`/users/${id}/reset-credentials`),
  sendResetCode: (id: string) => api.post(`/users/${id}/send-reset-code`),
  revokeSessions: (id: string) => api.post(`/users/${id}/revoke-sessions`),
  resetTwoFactor: (id: string) => api.post(`/users/${id}/reset-2fa`),
  unlock: (id: string) => api.post(`/users/${id}/unlock`),
  forceResetAllPasswords: () => api.post('/users/force-reset-all'),
  toggleActive: (id: string, isActive: boolean) =>
    api.patch(`/users/${id}/toggle-active`, { isActive }),
  delete: (id: string) => api.delete(`/users/${id}`),
  downloadTemplate: () => api.get('/users/template-csv', { responseType: 'blob' }),
  importPreview: (records: any[]) => api.post('/users/import-preview', { records }),
  importCommit: (records: any[]) => api.post('/users/import-commit', { records }),
  getUserAccess: (id: string) => api.get(`/users/${id}/access`),
  updateUserAccess: (id: string, pages: string[]) => api.put(`/users/${id}/access`, { pages }),
  resetUserAccess: (id: string) => api.delete(`/users/${id}/access`),
  getAccessTemplates: () => api.get('/users/access-templates'),
  createAccessTemplate: (data: { name: string; description?: string; pages: string[] }) =>
    api.post('/users/access-templates', data),
  updateAccessTemplate: (templateId: string, data: { name: string; description?: string; pages: string[] }) =>
    api.put(`/users/access-templates/${templateId}`, data),
  deleteAccessTemplate: (templateId: string) =>
    api.delete(`/users/access-templates/${templateId}`),
};

// ─── Audit ───────────────────────────────────────────────────────────────────
export const auditApi = {
  getLogs: (params?: Record<string, any>) => api.get('/audit-logs', { params }),
};

// ─── Automation Rules ─────────────────────────────────────────────────────────
export const automationApi = {
  getRules: (params?: Record<string, any>) => api.get('/automation/rules', { params }),
  getMetrics: () => api.get('/automation/metrics'),
  getRule: (id: string) => api.get(`/automation/rules/${id}`),
  createRule: (data: any) => api.post('/automation/rules', data),
  updateRule: (id: string, data: any) => api.patch(`/automation/rules/${id}`, data),
  toggleRule: (id: string, isActive?: boolean) =>
    api.patch(`/automation/rules/${id}/toggle`, { isActive }),
  deleteRule: (id: string) => api.delete(`/automation/rules/${id}`),
  runNightlyReorderCheck: () => api.post('/automation/run-nightly-reorder'),
};

// ─── Custom Objects (Object Manager Metadata) ─────────────────────────────────
export const customObjectsApi = {
  getAll: () => api.get('/custom-objects'),
  get: (id: string) => api.get(`/custom-objects/${id}`),
  create: (data: { apiName: string; label: string; pluralLabel?: string; description?: string }) =>
    api.post('/custom-objects', data),
  update: (id: string, data: { label?: string; pluralLabel?: string; description?: string }) =>
    api.patch(`/custom-objects/${id}`, data),
  delete: (id: string) => api.delete(`/custom-objects/${id}`),

  // Field designer endpoints
  getFields: (objectId: string, includeDeleted = false) =>
    api.get(`/custom-objects/${objectId}/fields`, { params: { includeDeleted } }),
  createField: (objectId: string, data: any) =>
    api.post(`/custom-objects/${objectId}/fields`, data),
  updateField: (objectId: string, fieldId: string, data: any) =>
    api.patch(`/custom-objects/${objectId}/fields/${fieldId}`, data),
  softDeleteField: (objectId: string, fieldId: string) =>
    api.delete(`/custom-objects/${objectId}/fields/${fieldId}`),
  restoreField: (objectId: string, fieldId: string) =>
    api.patch(`/custom-objects/${objectId}/fields/${fieldId}/restore`),

  // Generic Record CRUD endpoints (Phase 2)
  getRecords: (objectApiName: string, params?: Record<string, any>) =>
    api.get(`/custom-objects/${objectApiName}/records`, { params }),
  getRecord: (objectApiName: string, recordId: string) =>
    api.get(`/custom-objects/${objectApiName}/records/${recordId}`),
  createRecord: (objectApiName: string, data: Record<string, any>) =>
    api.post(`/custom-objects/${objectApiName}/records`, data),
  updateRecord: (objectApiName: string, recordId: string, data: Record<string, any>) =>
    api.patch(`/custom-objects/${objectApiName}/records/${recordId}`, data),
  deleteRecord: (objectApiName: string, recordId: string) =>
    api.delete(`/custom-objects/${objectApiName}/records/${recordId}`),
  getLookupOptions: (targetObject: string, search?: string) =>
    api.get(`/custom-objects/lookups/${targetObject}`, { params: { search } }),
};

// ─── Daily Activities ─────────────────────────────────────────────────────────
export const activitiesApi = {
  listProjects: () => api.get('/activities/projects'),
  createProject: (data: { name: string; description?: string; status?: string }) =>
    api.post('/activities/projects', data),
  updateProject: (id: string, data: { name?: string; description?: string; status?: string }) =>
    api.put(`/activities/projects/${id}`, data),
  deleteProject: (id: string) => api.delete(`/activities/projects/${id}`),

  getAssignableUsers: () => api.get('/activities/assignable-users'),
  assignMembers: (projectId: string, memberIds: string[]) =>
    api.post(`/activities/projects/${projectId}/assign`, { memberIds }),

  listLogs: (projectId: string) => api.get(`/activities/projects/${projectId}/logs`),
  uploadLog: (projectId: string, formData: FormData) =>
    api.post(`/activities/projects/${projectId}/logs/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  deleteLog: (projectId: string, logId: string) =>
    api.delete(`/activities/projects/${projectId}/logs/${logId}`),
};

// ─── Webhooks & Ingestion Configuration ─────────────────────────────────────
export const webhooksApi = {
  getConfig: () => api.get('/webhooks/config'),
  regenerateKey: () => api.post('/webhooks/regenerate-key'),
  getInquiryInfo: (key?: string) => api.get(key ? `/webhooks/inquiry-info/${key}` : '/webhooks/inquiry-info'),
};
