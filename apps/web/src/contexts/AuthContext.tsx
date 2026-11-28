/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { User } from '../types';
import {
  authApi,
  platformAuthApi,
  platformApi,
  getAccessToken,
  setStaffAccessToken,
  setPlatformAccessToken,
  setStoredRefreshToken,
  setCurrentTabUserId,
  getCurrentTabUserId,
  getImpersonationAccessToken,
  setImpersonationAccessToken,
  hasInFlightRequests,
  isSaveInProgress,
  notifyUserActivity,
  checkAndPerformProactiveRefresh,
  hasSessionIndicator,
} from '../services/api';
import {
  subscribeCrossTabAuth,
  broadcastSignIn,
  broadcastSignOut,
} from '../utils/crossTabSync';
import { clearTabSessionUser, clearStaleTabKeys } from '../utils/sessionSync';
import { isPlatformOwner } from '../utils/roles';
import { isTenantAdminRole } from '../config/roles-permissions';
import { Clock, AlertCircle } from 'lucide-react';
import { PAGE_KEY_TO_ROUTE } from '../config/page-registry';

export interface CompanyChoice {
  code: string;
  name: string;
}

export interface SelectionPending {
  companies: CompanyChoice[];
  selectionToken: string;
}

export interface SetupPass {
  setupToken: string;
  portal: 'company' | 'platform';
  user?: any;
  issuedAt: number;
  expiresAt: number;
  emailVerified?: boolean;
}

export type LoginResult =
  | (User & { redirectPath?: string })
  | { requiresCompanySelection: true; companies: CompanyChoice[]; selectionToken: string }
  | {
      requiresTwoFactor: true;
      methods: ('totp' | 'email')[];
      loginTicket: string;
      twoFactorGracePeriod?: { active: boolean; daysRemaining: number; deadline: string } | null;
    }
  | { requiresTwoFactorSetup: true; setupToken: string; user?: any };

interface AuthContextType {
  user: User | null;
  staffUser: User | null;
  platformUser: User | null;
  setupPass: SetupPass | null;
  setSetupPass: (pass: SetupPass | null) => void;
  clearSetupPass: () => void;
  completeForcedSetup: (authResult: { accessToken?: string; refreshToken?: string; user?: any }, portalType: 'company' | 'platform') => void;
  isLoading: boolean;
  /** Returns user on success, company selection, or 2FA challenge */
  login: (
    identifier: string,
    password: string,
    companyCode?: string,
  ) => Promise<LoginResult>;
  /** Complete multi-company login after user picks a company */
  selectCompany: (selectionToken: string, companyCode: string) => Promise<LoginResult>;
  platformLogin: (email: string, password: string) => Promise<LoginResult>;
  verifyTwoFactor: (
    loginTicket: string,
    code: string,
    trustDevice?: boolean
  ) => Promise<User & { redirectPath?: string }>;
  verifyPlatformTwoFactor: (
    loginTicket: string,
    code: string,
    trustDevice?: boolean
  ) => Promise<User & { redirectPath?: string }>;
  logout: () => Promise<void>;
  logoutStaff: () => Promise<void>;
  logoutPlatform: () => Promise<void>;
  logoutAll: () => Promise<void>;
  updateUser: (updatedFields: Partial<User>) => void;
  isAuthenticated: boolean;
  isImpersonating?: boolean;
  exitImpersonation?: () => void;
  /** Flag indicating session has expired (detected 401/403) */
  sessionExpired: boolean;
  /** Clears session and redirects to appropriate login page */
  clearSession: () => Promise<void>;
  applyLoginSession?: (session: { user: User; accessToken: string; refreshToken?: string; redirectPath?: string }) => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// Inactivity timeout read from VITE_INACTIVITY_TIMEOUT_MINUTES (default 60 minutes)
export const getInactivityTimeoutMinutes = (): number => {
  const envVal = import.meta.env?.VITE_INACTIVITY_TIMEOUT_MINUTES;
  const parsed = Number(envVal);
  if (!isNaN(parsed) && parsed > 0) {
    return parsed;
  }
  return 60;
};

export const getInactivityTimeoutMs = (): number => {
  return getInactivityTimeoutMinutes() * 60 * 1000;
};

export const hasUnsavedFormChanges = (): boolean => {
  if (typeof document === 'undefined') return false;
  try {
    if (document.querySelector('form.dirty, [data-unsaved="true"], .is-dirty, [data-is-dirty="true"]')) {
      return true;
    }
    const editableElements = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select'
    );
    for (let i = 0; i < editableElements.length; i++) {
      const el = editableElements[i];
      if (el.disabled || (el as any).readOnly) continue;
      const placeholder = 'placeholder' in el ? ((el as any).placeholder || '').toLowerCase() : '';
      const name = (el.name || '').toLowerCase();
      if (name.includes('search') || placeholder.includes('search')) continue;

      if (el instanceof HTMLInputElement) {
        if (el.type === 'checkbox' || el.type === 'radio') {
          if (el.checked !== el.defaultChecked) return true;
        } else if (el.value !== el.defaultValue && el.value.trim().length > 0) {
          return true;
        }
      } else if (el instanceof HTMLTextAreaElement) {
        if (el.value !== el.defaultValue && el.value.trim().length > 0) return true;
      } else if (el instanceof HTMLSelectElement) {
        if (el.selectedIndex > 0 && el.value !== '') {
          for (let j = 0; j < el.options.length; j++) {
            if (el.options[j].defaultSelected && j !== el.selectedIndex) return true;
          }
        }
      }
    }
  } catch {}
  return false;
};

export const WARNING_THRESHOLD_MS = 60 * 1000;
export const ACTIVITY_STORAGE_KEY = 'crm_last_activity_time';
export const USER_INPUT_STORAGE_KEY = 'crm_last_user_input_time';
export const MAX_EXTRA_SUPPRESSION_MS = 30 * 60 * 1000; // Cap suppression at 30 extra minutes
export const REFRESH_TOKEN_MAX_LIFE_MS = 12 * 60 * 60 * 1000; // 12 hours refresh token life

function clearStorageExceptTheme() {
  try {
    const consent = localStorage.getItem('crm_cookie_consent');
    const savedTheme = localStorage.getItem('crm_theme');
    localStorage.removeItem('app_branding');
    sessionStorage.removeItem('app_branding');
    localStorage.clear();
    if (consent) {
      localStorage.setItem('crm_cookie_consent', consent);
    }
    if (savedTheme && consent && consent.includes('"preferences":true')) {
      localStorage.setItem('crm_theme', savedTheme);
    }
    sessionStorage.clear();
  } catch {
    // ignore
  }
}

const getStoredUser = (portal: 'staff' | 'platform'): User | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(portal === 'platform' ? 'crm_platform_user' : 'crm_user');
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
};

const persistUserToStorage = (u: User | null, portal: 'staff' | 'platform') => {
  if (typeof window === 'undefined') return;
  try {
    const key = portal === 'platform' ? 'crm_platform_user' : 'crm_user';
    if (u) {
      localStorage.setItem(key, JSON.stringify(u));
      // Portal type is strictly tab-specific (sessionStorage only). Never leak to localStorage across tabs!
      localStorage.removeItem('crm_portal');
      sessionStorage.setItem('crm_portal', portal);
      localStorage.setItem(ACTIVITY_STORAGE_KEY, String(Date.now()));
    } else {
      localStorage.removeItem(key);
    }
  } catch {}
};

export function isPublicPath(path: string): boolean {
  const p = (path || '').toLowerCase().replace(/\/+$/, '') || '/';
  return (
    p === '/' ||
    p === '/index' ||
    p === '/index.html' ||
    p === '/home' ||
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
    p === '/cart' ||
    p === '/cookies' ||
    p === '/cookie-policy' ||
    p === '/help' ||
    p === '/privacy' ||
    p === '/privacy-policy' ||
    p === '/terms' ||
    p === '/terms-of-service' ||
    p === '/contact' ||
    p === '/contact-us' ||
    p === '/2fa' ||
    p.startsWith('/2fa') ||
    p === '/setup-2fa' ||
    p.startsWith('/setup-2fa')
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staffUser, setStaffUser] = useState<User | null>(() => getStoredUser('staff'));
  const [platformUser, setPlatformUser] = useState<User | null>(() => getStoredUser('platform'));

  const [isLoading, setIsLoading] = useState(true);
  const [showInactivityModal, setShowInactivityModal] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(60);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [setupPass, setSetupPass] = useState<SetupPass | null>(null);
  const clearSetupPass = useCallback(() => setSetupPass(null), []);

  const [sessionConflictBanner, setSessionConflictBanner] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('crm_session_conflict_banner') === 'true';
    }
    return false;
  });

  const dismissSessionConflictBanner = useCallback(() => {
    setSessionConflictBanner(false);
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('crm_session_conflict_banner');
      } catch {}
    }
  }, []);

  const lastActivityRef = useRef<number>(Date.now());
  const lastUserInputRef = useRef<number>(Date.now());
  const lastStorageWriteRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const isPlatform =
    typeof window !== 'undefined' && window.location.pathname.startsWith('/platform');
  const isImpersonating = typeof window !== 'undefined' && (
    sessionStorage.getItem('crm_tab_impersonating') === 'true' ||
    getImpersonationAccessToken() !== null
  );
  const user = isImpersonating ? (staffUser || platformUser) : isPlatform ? platformUser : staffUser;

  const setStaffUserWithStorage = useCallback((updater: User | null | ((prev: User | null) => User | null)) => {
    setStaffUser((prev) => {
      const next = typeof updater === 'function' ? (updater as any)(prev) : updater;
      persistUserToStorage(next, 'staff');
      return next;
    });
  }, []);

  const setPlatformUserWithStorage = useCallback((updater: User | null | ((prev: User | null) => User | null)) => {
    setPlatformUser((prev) => {
      const next = typeof updater === 'function' ? (updater as any)(prev) : updater;
      persistUserToStorage(next, 'platform');
      return next;
    });
  }, []);

  const [accessChangedNotice, setAccessChangedNotice] = useState(false);

  // Requirement 6: Refresh user's effective pages on window focus and after 403
  const refreshEffectivePages = useCallback(async (isAccessRevoked = false) => {
    if (!staffUser || !getAccessToken(false)) return;
    try {
      const meRes = await authApi.me();
      if (meRes?.data) {
        const freshUser = meRes.data;
        const oldPages = staffUser.effectivePages || [];
        const newPages = freshUser.effectivePages || [];
        const homeChanged = (freshUser.homePage || null) !== (staffUser.homePage || null);

        const hasDiff =
          homeChanged ||
          oldPages.length !== newPages.length ||
          oldPages.some((p: string) => !newPages.includes(p)) ||
          newPages.some((p: string) => !oldPages.includes(p));

        if (hasDiff) {
          setStaffUserWithStorage((prev) => {
            if (!prev) return freshUser;
            return {
              ...prev,
              ...freshUser,
              effectivePages: freshUser.effectivePages,
              homePage: freshUser.homePage,
            };
          });

          // Only show notice when access is genuinely revoked or changed after initial load
          if (oldPages.length > 0 && !isTenantAdminRole(freshUser.role) && !isPlatformOwner(freshUser)) {
            setAccessChangedNotice(true);
            setTimeout(() => setAccessChangedNotice(false), 4000);
          }

          if (isAccessRevoked) {
            let firstAllowedRoute = '/';
            if (Array.isArray(newPages) && newPages.length > 0) {
              for (const p of newPages) {
                if (PAGE_KEY_TO_ROUTE[p]) {
                  firstAllowedRoute = PAGE_KEY_TO_ROUTE[p];
                  break;
                }
              }
            }
            if (typeof window !== 'undefined' && window.location.pathname !== firstAllowedRoute) {
              window.location.href = firstAllowedRoute;
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }, [staffUser]);

  useEffect(() => {
    if (!staffUser) return;

    // Refresh permissions on initial mount
    refreshEffectivePages(false);

    let lastFocusTime = 0;
    const handleFocus = () => {
      const now = Date.now();
      if (now - lastFocusTime > 8000) {
        lastFocusTime = now;
        refreshEffectivePages(false);
      }
    };

    const handleAccessRevoked = () => {
      refreshEffectivePages(true);
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('crm:page-access-revoked', handleAccessRevoked);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('crm:page-access-revoked', handleAccessRevoked);
    };
  }, [staffUser, refreshEffectivePages]);

  const logoutStaff = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    } finally {
      setStaffAccessToken(null);
      setStoredRefreshToken(null, false);
      setStaffUserWithStorage(null);
      setCurrentTabUserId(null);
      clearTabSessionUser();
      broadcastSignOut();
      setShowInactivityModal(false);
      clearStorageExceptTheme();
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
      if (!isPublicPath(currentPath)) {
        window.history.replaceState(null, '', '/login');
        window.location.href = '/login';
      }
    }
  }, [setStaffUserWithStorage]);

  const logoutPlatform = useCallback(async () => {
    try {
      await platformAuthApi.logout();
    } catch {
      // ignore
    } finally {
      setPlatformAccessToken(null);
      setStoredRefreshToken(null, true);
      setPlatformUserWithStorage(null);
      setCurrentTabUserId(null);
      clearTabSessionUser();
      broadcastSignOut();
      setShowInactivityModal(false);
      clearStorageExceptTheme();
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
      if (!isPublicPath(currentPath)) {
        window.history.replaceState(null, '', '/platform/login');
        window.location.href = '/platform/login';
      }
    }
  }, [setPlatformUserWithStorage]);

  const logout = useCallback(async () => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/platform')) {
      await logoutPlatform();
    } else {
      await logoutStaff();
    }
  }, [logoutPlatform, logoutStaff]);

  const logoutAll = useCallback(async () => {
    try {
      await authApi.logoutAll();
    } catch {
      // ignore
    } finally {
      setStaffAccessToken(null);
      setStaffUserWithStorage(null);
      setPlatformAccessToken(null);
      setPlatformUserWithStorage(null);
      setCurrentTabUserId(null);
      clearTabSessionUser();
      broadcastSignOut();
      setShowInactivityModal(false);
      clearStorageExceptTheme();
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
      if (!isPublicPath(currentPath)) {
        window.history.replaceState(null, '', '/login');
        window.location.href = '/login';
      }
    }
  }, [setStaffUserWithStorage, setPlatformUserWithStorage]);

  // Session-expired: clearSession clears tokens/storage and redirects to index landing page with notice
  const clearSession = useCallback(async () => {
    try {
      // Best-effort POST /auth/logout once (never call legacy /api/logout)
      try {
        await (isPlatform ? platformAuthApi.logout() : authApi.logout()).catch(() => {});
      } catch {}

      if (isPlatform) {
        setPlatformAccessToken(null);
        setStoredRefreshToken(null, true);
        setPlatformUserWithStorage(null);
      } else {
        setStaffAccessToken(null);
        setStoredRefreshToken(null, false);
        setStaffUserWithStorage(null);
      }
      setCurrentTabUserId(null);
      clearTabSessionUser();
      broadcastSignOut();
      setShowInactivityModal(false);
      setSessionExpired(false);
      try {
        sessionStorage.setItem('crm_session_notice', 'Your session ended. Please sign in again');
      } catch {}
      const targetUrl = '/?notice=' + encodeURIComponent('Your session ended. Please sign in again');
      window.history.replaceState(null, '', targetUrl);
      window.location.href = targetUrl;
    } catch {
      // fallback redirect
      window.location.href = '/?notice=' + encodeURIComponent('Your session ended. Please sign in again');
    }
  }, [isPlatform, setStaffUserWithStorage, setPlatformUserWithStorage]);

  // Listen for the custom session-expired event dispatched by the API interceptor
  useEffect(() => {
    const handleExpiredEvent = () => {
      setSessionExpired(true);
    };
    window.addEventListener('crm:session-expired', handleExpiredEvent);
    return () => {
      window.removeEventListener('crm:session-expired', handleExpiredEvent);
    };
  }, []);

  // 1. Silent token refresh on initial page load:
  // /platform/* restores only the platform session; everything else restores only staff session.
  useEffect(() => {
    let isMounted = true;

    const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(ACTIVITY_STORAGE_KEY, String(Date.now()));
      } catch {}
    }

    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('crm_portal');
      } catch {}
    }

    const isPlatformRoute = currentPath.startsWith('/platform');

    (async () => {
      try {
        const hasConflictBanner =
          typeof window !== 'undefined' && sessionStorage.getItem('crm_session_conflict_banner') === 'true';
        if (hasConflictBanner) {
          // Tab was signed out due to a cross-tab session conflict.
          // Do not silently restore the newly logged-in account from cookies!
          setStaffAccessToken(null);
          setPlatformAccessToken(null);
          setStaffUserWithStorage(null);
          setPlatformUserWithStorage(null);
          clearTabSessionUser();
          setIsLoading(false);
          return;
        }

        const isTabImpersonating =
          typeof window !== 'undefined' &&
          (sessionStorage.getItem('crm_tab_impersonating') === 'true' ||
           Boolean(getImpersonationAccessToken()));
        if (isTabImpersonating) {
          // Tab is in an active impersonation session: do not call authApi.refresh() which relies on staff cookies!
          const storedImpersonateUser = typeof window !== 'undefined' ? sessionStorage.getItem('crm_tab_impersonate_user') : null;
          if (storedImpersonateUser) {
            try {
              const parsed = JSON.parse(storedImpersonateUser);
              setStaffUser(parsed);
              if (parsed.id) setCurrentTabUserId(parsed.id, false);
            } catch {}
          }
          setIsLoading(false);
          return;
        }

        if (isPlatformRoute) {
          // On platform routes, check for session indicator before attempting network refresh
          if (!hasSessionIndicator(true)) {
            setPlatformAccessToken(null);
            setPlatformUserWithStorage(null);
            setIsLoading(false);
            return;
          }
          try {
            const { data } = await platformAuthApi.refresh();
            if (isMounted && data) {
              lastActivityRef.current = Date.now();
              try {
                sessionStorage.setItem('crm_portal', 'platform');
              } catch {}
              setPlatformAccessToken(data.accessToken);
              if (data.refreshToken) {
                setStoredRefreshToken(data.refreshToken, true);
              }
              if (data.user) {
                setPlatformUserWithStorage(data.user);
                setCurrentTabUserId(data.user.id, true);
              }
            }
          } catch (err: any) {
            if (isMounted && err?.response?.status === 401) {
              setPlatformAccessToken(null);
              setPlatformUserWithStorage(null);
            }
          }
        } else {
          // On staff/company routes, check for session indicator before attempting network refresh
          if (!hasSessionIndicator(false)) {
            setStaffAccessToken(null);
            setStaffUserWithStorage(null);
            setIsLoading(false);
            return;
          }
          try {
            const { data } = await authApi.refresh();
            if (isMounted && data) {
              lastActivityRef.current = Date.now();
              try {
                sessionStorage.setItem('crm_portal', 'staff');
              } catch {}
              setStaffAccessToken(data.accessToken);
              if (data.refreshToken) {
                setStoredRefreshToken(data.refreshToken, false);
              }
              if (data.user) {
                setStaffUserWithStorage(data.user);
                setCurrentTabUserId(data.user.id, false);
              } else {
                const meRes = await authApi.me();
                if (isMounted && meRes.data) {
                  setStaffUserWithStorage(meRes.data);
                  if (meRes.data.id) setCurrentTabUserId(meRes.data.id, false);
                }
              }
            }
          } catch (err: any) {
            if (isMounted && err?.response?.status === 401) {
              setStaffAccessToken(null);
              setStaffUserWithStorage(null);
            }
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // Cross-tab sync: react safely to logins, logouts, or session changes in other tabs
  useEffect(() => {
    const handleReloadNotice = (e: any) => {
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
      if (isPublicPath(currentPath)) {
        clearStaleTabKeys();
        return;
      }
      const isPlatform = currentPath.startsWith('/platform');
      const isImpersonating = typeof window !== 'undefined' && sessionStorage.getItem('crm_tab_impersonating') === 'true';
      if (isImpersonating) return;

      const reqId = e?.detail?.requestId || Date.now().toString(36);
      console.warn('[AUTH_SYNC] Safe session termination: session conflict received.', {
        requestId: reqId,
        portal: isPlatform ? 'platform' : 'staff',
        timestamp: Date.now(),
      });

      setStaffAccessToken(null);
      setPlatformAccessToken(null);
      setStaffUserWithStorage(null);
      setPlatformUserWithStorage(null);
      clearTabSessionUser(isPlatform ? 'platform' : 'staff');
      clearStaleTabKeys();
      if (timerRef.current) clearInterval(timerRef.current);

      try {
        sessionStorage.setItem('crm_session_conflict_banner', 'true');
      } catch {}
      setSessionConflictBanner(true);

      const targetLogin = isPlatform ? '/platform/login' : '/login';
      if (typeof window !== 'undefined' && window.location.pathname !== targetLogin) {
        window.location.href = targetLogin;
      }
    };

    window.addEventListener('crm:session-conflict-reload', handleReloadNotice);

    const unsubscribe = subscribeCrossTabAuth((event) => {
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
      const isPlatform = currentPath.startsWith('/platform');
      const currentPortal: 'platform' | 'staff' = isPlatform ? 'platform' : 'staff';

      // 1. Cross-portal isolation: platform vs staff are independent sessions with separate cookies
      if (event.portal && event.portal !== currentPortal) {
        return;
      }

      // 2. Impersonation: do not raise conflict in impersonating tab
      const isImpersonating = typeof window !== 'undefined' && sessionStorage.getItem('crm_tab_impersonating') === 'true';
      if (isImpersonating) {
        return;
      }

      if (event.type === 'signed_in') {
        const currentId = getCurrentTabUserId(isPlatform);
        const lastKnownId = typeof window !== 'undefined'
          ? sessionStorage.getItem(isPlatform ? 'crm_last_active_platform_user_id' : 'crm_last_active_user_id')
          : null;
        const currentTenantId = !isPlatform ? sessionStorage.getItem('crm_tab_tenant_id') : undefined;

        // Never trigger conflict on public pages (/login, etc.)
        if (isPublicPath(currentPath)) {
          clearStaleTabKeys();
          return;
        }

        // Only trigger if THIS tab had an active or recently-active user session
        const tabUserToCheck = currentId || lastKnownId || (isPlatform ? platformUser?.id : staffUser?.id);
        if (!tabUserToCheck) {
          return;
        }

        // Same user check: signing in again as the SAME user in another tab must NEVER raise conflict
        const isSameUser = tabUserToCheck === event.userId;
        if (isSameUser) {
          return;
        }

        // Identity really changed: safe handling
        console.warn('[AUTH_SYNC] Safe session termination: identity changed in another tab.', {
          previousUser: tabUserToCheck,
          newUser: event.userId,
          portal: currentPortal,
          timestamp: Date.now(),
        });

        setStaffAccessToken(null);
        setPlatformAccessToken(null);
        setStaffUserWithStorage(null);
        setPlatformUserWithStorage(null);
        clearTabSessionUser(currentPortal);
        clearStaleTabKeys();
        if (timerRef.current) clearInterval(timerRef.current);

        try {
          sessionStorage.setItem('crm_session_conflict_banner', 'true');
        } catch {}
        setSessionConflictBanner(true);

        const targetLogin = isPlatform ? '/platform/login' : '/login';
        if (typeof window !== 'undefined' && window.location.pathname !== targetLogin) {
          window.location.href = targetLogin;
        }
      } else if (event.type === 'signed_out') {
        const prevId = getCurrentTabUserId(isPlatform);
        if (prevId && typeof window !== 'undefined') {
          sessionStorage.setItem(isPlatform ? 'crm_last_active_platform_user_id' : 'crm_last_active_user_id', prevId);
        }
        setStaffAccessToken(null);
        setPlatformAccessToken(null);
        setStaffUserWithStorage(null);
        setPlatformUserWithStorage(null);
        clearTabSessionUser(currentPortal);
        clearStaleTabKeys();
        if (timerRef.current) clearInterval(timerRef.current);
        if (!isPublicPath(currentPath)) {
          window.location.href = isPlatform ? '/platform/login' : '/login';
        }
      } else if (event.type === 'session_changed') {
        if (isPublicPath(currentPath)) {
          clearStaleTabKeys();
          return;
        }
        const currentId = getCurrentTabUserId(isPlatform) || (isPlatform ? platformUser?.id : staffUser?.id);
        if (event.userId && currentId === event.userId) {
          return;
        }
        setStaffAccessToken(null);
        setPlatformAccessToken(null);
        setStaffUserWithStorage(null);
        setPlatformUserWithStorage(null);
        clearTabSessionUser(currentPortal);
        clearStaleTabKeys();
        if (timerRef.current) clearInterval(timerRef.current);

        try {
          sessionStorage.setItem('crm_session_conflict_banner', 'true');
        } catch {}
        setSessionConflictBanner(true);

        const targetLogin = isPlatform ? '/platform/login' : '/login';
        if (typeof window !== 'undefined' && window.location.pathname !== targetLogin) {
          window.location.href = targetLogin;
        }
      }
    });

    return () => {
      window.removeEventListener('crm:session-conflict-reload', handleReloadNotice);
      unsubscribe();
    };
  }, [setStaffUserWithStorage, setPlatformUserWithStorage, staffUser, platformUser]);

  // 2. Keep session alive via silent proactive token refresh (no inactivity auto-logout)
  const resetInactivityTimer = useCallback(() => {
    setShowInactivityModal(false);
  }, []);

  useEffect(() => {
    if (!user) return;

    timerRef.current = setInterval(() => {
      checkAndPerformProactiveRefresh();
    }, 30000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [user]);

  const login = async (
    identifier: string,
    password: string,
    companyCode?: string,
  ): Promise<LoginResult> => {
    const { data } = await authApi.login(identifier, password, companyCode, true);

    if (data.requiresCompanySelection) {
      return {
        requiresCompanySelection: true as const,
        companies: data.companies as CompanyChoice[],
        selectionToken: data.selectionToken as string,
      };
    }

    if (data.requiresTwoFactor) {
      return {
        requiresTwoFactor: true as const,
        methods: data.methods as ('totp' | 'email')[],
        loginTicket: data.loginTicket as string,
        twoFactorGracePeriod: data.twoFactorGracePeriod,
      };
    }

    if (data.requiresTwoFactorSetup) {
      setSetupPass({
        setupToken: data.setupToken as string,
        portal: 'company',
        user: data.user,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 10 * 60 * 1000,
      });
      return {
        requiresTwoFactorSetup: true as const,
        setupToken: data.setupToken as string,
        user: data.user,
      };
    }

    lastActivityRef.current = Date.now();
    dismissSessionConflictBanner();
    try {
      sessionStorage.setItem('crm_portal', 'staff');
    } catch {}
    setStaffAccessToken(data.accessToken);
    if (data.refreshToken) {
      setStoredRefreshToken(data.refreshToken, false);
    }
    if (data.user) {
      try {
        localStorage.removeItem('app_branding');
        sessionStorage.removeItem('app_branding');
      } catch {}
      setStaffUserWithStorage(data.user);
      setCurrentTabUserId(data.user.id, false);
      broadcastSignIn(data.user.id, 'staff', data.user.tenantId);
      if (data.user.role === 'platform_super_admin') {
        setPlatformAccessToken(data.accessToken);
        setPlatformUserWithStorage(data.user);
      }
    }
    return { ...data.user, redirectPath: data.redirectPath } as User & { redirectPath?: string };
  };

  const platformLogin = async (email: string, password: string): Promise<LoginResult> => {
    const { data } = await platformAuthApi.login(email, password);

    if (data.requiresTwoFactor) {
      return {
        requiresTwoFactor: true as const,
        methods: data.methods as ('totp' | 'email')[],
        loginTicket: data.loginTicket as string,
        twoFactorGracePeriod: data.twoFactorGracePeriod,
      };
    }

    if (data.requiresTwoFactorSetup) {
      setSetupPass({
        setupToken: data.setupToken as string,
        portal: 'platform',
        user: data.user,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 10 * 60 * 1000,
      });
      return {
        requiresTwoFactorSetup: true as const,
        setupToken: data.setupToken as string,
        user: data.user,
      };
    }

    lastActivityRef.current = Date.now();
    dismissSessionConflictBanner();
    try {
      sessionStorage.setItem('crm_portal', 'platform');
    } catch {}
    setPlatformAccessToken(data.accessToken);
    setStaffAccessToken(data.accessToken);
    if (data.refreshToken) {
      setStoredRefreshToken(data.refreshToken, true);
    }
    if (data.user) {
      setPlatformUserWithStorage(data.user);
      setStaffUserWithStorage(data.user);
      setCurrentTabUserId(data.user.id, true);
      broadcastSignIn(data.user.id, 'platform');
    }
    return {
      ...data.user,
      redirectPath: data.redirectPath || '/platform/companies',
    } as User & { redirectPath?: string };
  };

  const selectCompany = async (selectionToken: string, companyCode: string): Promise<LoginResult> => {
    const { data } = await authApi.selectCompany(selectionToken, companyCode);

    if (data.requiresTwoFactor) {
      return {
        requiresTwoFactor: true as const,
        methods: data.methods as ('totp' | 'email')[],
        loginTicket: data.loginTicket as string,
        twoFactorGracePeriod: data.twoFactorGracePeriod,
      };
    }

    if (data.requiresTwoFactorSetup) {
      setSetupPass({
        setupToken: data.setupToken as string,
        portal: 'company',
        user: data.user,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 10 * 60 * 1000,
      });
      return {
        requiresTwoFactorSetup: true as const,
        setupToken: data.setupToken as string,
        user: data.user,
      };
    }

    lastActivityRef.current = Date.now();
    try {
      sessionStorage.setItem('crm_portal', 'staff');
    } catch {}
    setStaffAccessToken(data.accessToken);
    if (data.refreshToken) {
      setStoredRefreshToken(data.refreshToken, false);
    }
    if (data.user) {
      try {
        localStorage.removeItem('app_branding');
        sessionStorage.removeItem('app_branding');
      } catch {}
      setStaffUserWithStorage(data.user);
      setCurrentTabUserId(data.user.id);
      broadcastSignIn(data.user.id, 'staff');
    }
    return { ...data.user, redirectPath: data.redirectPath } as User & { redirectPath?: string };
  };

  const verifyTwoFactor = async (
    loginTicket: string,
    code: string,
    trustDevice?: boolean
  ): Promise<User & { redirectPath?: string }> => {
    const { data } = await authApi.verifyTwoFactor({ loginTicket, code, trustDevice });
    lastActivityRef.current = Date.now();
    try {
      sessionStorage.setItem('crm_portal', 'staff');
    } catch {}
    setStaffAccessToken(data.accessToken);
    if (data.refreshToken) {
      setStoredRefreshToken(data.refreshToken, false);
    }
    if (data.user) {
      setStaffUserWithStorage(data.user);
      setCurrentTabUserId(data.user.id);
      broadcastSignIn(data.user.id, 'staff');
      if (data.user.role === 'platform_super_admin') {
        setPlatformAccessToken(data.accessToken);
        setPlatformUserWithStorage(data.user);
      }
    }
    return { ...data.user, redirectPath: data.redirectPath } as User & { redirectPath?: string };
  };

  const verifyPlatformTwoFactor = async (
    loginTicket: string,
    code: string,
    trustDevice?: boolean
  ): Promise<User & { redirectPath?: string }> => {
    const { data } = await platformAuthApi.verifyTwoFactor({ loginTicket, code, trustDevice });
    lastActivityRef.current = Date.now();
    dismissSessionConflictBanner();
    try {
      sessionStorage.setItem('crm_portal', 'platform');
    } catch {}
    setPlatformAccessToken(data.accessToken);
    setStaffAccessToken(data.accessToken);
    if (data.refreshToken) {
      setStoredRefreshToken(data.refreshToken, true);
    }
    if (data.user) {
      setPlatformUserWithStorage(data.user);
      setStaffUserWithStorage(data.user);
      setCurrentTabUserId(data.user.id, true);
      broadcastSignIn(data.user.id, 'platform');
    }
    return {
      ...data.user,
      redirectPath: data.redirectPath || '/platform/companies',
    } as User & { redirectPath?: string };
  };

  const updateUser = (updatedFields: Partial<User>) => {
    if (isPlatform) {
      setPlatformUserWithStorage((prev) => {
        if (!prev) return updatedFields as User;
        return { ...prev, ...updatedFields };
      });
    } else {
      setStaffUserWithStorage((prev) => {
        if (!prev) return updatedFields as User;
        return { ...prev, ...updatedFields };
      });
    }
  };

  const completeForcedSetup = useCallback(
    (authResult: { accessToken?: string; refreshToken?: string; user?: any }, portalType: 'company' | 'platform') => {
      clearSetupPass();
      dismissSessionConflictBanner();
      lastActivityRef.current = Date.now();
      if (authResult.accessToken) {
        if (portalType === 'platform') {
          try {
            sessionStorage.setItem('crm_portal', 'platform');
          } catch {}
          setPlatformAccessToken(authResult.accessToken);
          setStaffAccessToken(authResult.accessToken);
          if (authResult.refreshToken) {
            setStoredRefreshToken(authResult.refreshToken, true);
          }
          if (authResult.user) {
            setPlatformUserWithStorage(authResult.user);
            setStaffUserWithStorage(authResult.user);
            setCurrentTabUserId(authResult.user.id, true);
            broadcastSignIn(authResult.user.id, 'platform');
          }
        } else {
          try {
            sessionStorage.setItem('crm_portal', 'staff');
          } catch {}
          setStaffAccessToken(authResult.accessToken);
          if (authResult.refreshToken) {
            setStoredRefreshToken(authResult.refreshToken, false);
          }
          if (authResult.user) {
            setStaffUserWithStorage(authResult.user);
            setCurrentTabUserId(authResult.user.id, false);
            broadcastSignIn(authResult.user.id, 'staff', authResult.user.tenantId);
            if (authResult.user.role === 'platform_super_admin') {
              setPlatformAccessToken(authResult.accessToken);
              setPlatformUserWithStorage(authResult.user);
            }
          }
        }
      }
    },
    [clearSetupPass, dismissSessionConflictBanner]
  );

  const applyLoginSession = useCallback((data: { user: User; accessToken: string; refreshToken?: string; redirectPath?: string }) => {
    const isPlatform = data.user?.role === 'platform_super_admin' && !data.user?.tenantId;
    dismissSessionConflictBanner();
    lastActivityRef.current = Date.now();
    try {
      sessionStorage.setItem('crm_portal', isPlatform ? 'platform' : 'staff');
      localStorage.removeItem('crm_portal');
    } catch {}
    setStaffAccessToken(data.accessToken);
    if (isPlatform) {
      setPlatformAccessToken(data.accessToken);
      setPlatformUserWithStorage(data.user);
    } else {
      setStaffUserWithStorage(data.user);
    }
    if (data.refreshToken) {
      setStoredRefreshToken(data.refreshToken, isPlatform);
    }
    if (data.user) {
      try {
        localStorage.removeItem('app_branding');
        sessionStorage.removeItem('app_branding');
      } catch {}
      setCurrentTabUserId(data.user.id, isPlatform);
      broadcastSignIn(data.user.id, isPlatform ? 'platform' : 'staff', data.user.tenantId);
    }
  }, [setStaffUserWithStorage, setPlatformUserWithStorage, dismissSessionConflictBanner]);

  const exitImpersonation = useCallback(() => {
    let impTenantId: string | null = null;
    if (typeof window !== 'undefined') {
      try {
        const storedUser = sessionStorage.getItem('crm_tab_impersonate_user');
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          impTenantId = parsed?.tenantId || parsed?.tenant?.id || null;
        }
      } catch {}
    }
    if (impTenantId) {
      platformApi.exitImpersonation(impTenantId).catch(() => {});
    }

    setStaffUser(null);
    setImpersonationAccessToken(null);
    setStaffAccessToken(null);
    setCurrentTabUserId(null);
    clearTabSessionUser('staff');
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('crm_tab_impersonating');
      sessionStorage.removeItem('crm_tab_impersonate_token');
      sessionStorage.removeItem('crm_tab_impersonate_user');
      sessionStorage.setItem('crm_portal', 'platform');
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        staffUser,
        platformUser,
        isImpersonating,
        exitImpersonation,
        isLoading,
        login,
        platformLogin,
        selectCompany,
        verifyTwoFactor,
        verifyPlatformTwoFactor,
        logout,
        logoutStaff,
        logoutPlatform,
        logoutAll,
        updateUser,
        isAuthenticated: !!user,
        sessionExpired,
        clearSession,
        applyLoginSession,
        setupPass,
        setSetupPass,
        clearSetupPass,
        completeForcedSetup,
      }}
    >
      {children}

      {/* Non-blocking Session Conflict Banner */}
      {sessionConflictBanner && (
        <div
          data-testid="session-conflict-banner"
          role="alert"
          className="fixed top-0 inset-x-0 z-[99999] bg-amber-500 dark:bg-amber-600 text-slate-950 font-medium px-4 py-2.5 shadow-md flex items-center justify-between text-xs sm:text-sm animate-in slide-in-from-top duration-200"
        >
          <div className="flex items-center gap-2 max-w-4xl mx-auto flex-1 justify-center sm:justify-start">
            <AlertCircle className="w-4 h-4 text-slate-950 shrink-0" aria-hidden="true" />
            <span>Another account signed in on this browser. This tab was signed out for your safety. To use multiple accounts simultaneously, open a separate browser profile.</span>
            <button
              type="button"
              onClick={() => {
                dismissSessionConflictBanner();
                if (typeof window !== 'undefined') {
                  const input = document.querySelector('input[name="username"]') as HTMLInputElement | null;
                  if (input) {
                    input.focus();
                    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  } else {
                    const isPlat = window.location.pathname.startsWith('/platform');
                    window.location.href = isPlat ? '/platform/login' : '/login';
                  }
                }
              }}
              className="ml-2 px-2.5 py-1 rounded-md bg-slate-950 text-white hover:bg-slate-800 text-xs font-semibold transition-colors shadow-xs"
            >
              Sign in again
            </button>
          </div>
          <button
            type="button"
            onClick={dismissSessionConflictBanner}
            aria-label="Dismiss notice"
            className="p-1 hover:bg-black/10 rounded-md transition-colors shrink-0 text-slate-950 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Access Changed Floating Notification */}
      {accessChangedNotice && (
        <div className="fixed top-5 right-5 z-[99999] flex items-center gap-3 bg-white dark:bg-slate-900 border border-amber-500/40 shadow-2xl rounded-2xl p-4 text-slate-900 dark:text-white max-w-sm animate-in slide-in-from-top duration-300">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold">Your access was changed</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Workspace navigation permissions were updated.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAccessChangedNotice(false)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs px-2 py-1 rounded"
          >
            ✕
          </button>
        </div>
      )}
    </AuthContext.Provider>
  );
}

if (typeof window !== 'undefined') {
  (window as any).getInactivityTimeoutMinutes = getInactivityTimeoutMinutes;
  (window as any).getInactivityTimeoutMs = getInactivityTimeoutMs;
  (window as any).hasUnsavedFormChanges = hasUnsavedFormChanges;
}

export const useAuth = () => useContext(AuthContext);
