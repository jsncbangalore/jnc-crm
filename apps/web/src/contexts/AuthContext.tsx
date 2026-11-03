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
  setStaffAccessToken,
  setPlatformAccessToken,
  setStoredRefreshToken,
  setCurrentTabUserId,
  getCurrentTabUserId,
  hasInFlightRequests,
  isSaveInProgress,
  notifyUserActivity,
  checkAndPerformProactiveRefresh,
} from '../services/api';
import {
  subscribeCrossTabAuth,
  broadcastSignIn,
  broadcastSignOut,
} from '../utils/crossTabSync';
import { clearTabSessionUser } from '../utils/sessionSync';
import { isPlatformOwner } from '../utils/roles';
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
      localStorage.setItem('crm_portal', portal);
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
    p === '/contact-us'
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staffUser, setStaffUser] = useState<User | null>(() => getStoredUser('staff'));
  const [platformUser, setPlatformUser] = useState<User | null>(() => getStoredUser('platform'));

  const [isLoading, setIsLoading] = useState(true);
  const [showInactivityModal, setShowInactivityModal] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(60);

  const lastActivityRef = useRef<number>(Date.now());
  const lastUserInputRef = useRef<number>(Date.now());
  const lastStorageWriteRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const isPlatform =
    typeof window !== 'undefined' && window.location.pathname.startsWith('/platform');
  const user = isPlatform ? (platformUser || staffUser) : (staffUser || platformUser);

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

  const [sessionChangedNotice, setSessionChangedNotice] = useState(false);
  const [accessChangedNotice, setAccessChangedNotice] = useState(false);

  // Requirement 6: Refresh user's effective pages on window focus and after 403
  const refreshEffectivePages = useCallback(async (isAccessRevoked = false) => {
    if (!staffUser) return;
    try {
      const meRes = await authApi.me();
      if (meRes?.data) {
        const freshUser = meRes.data;
        const oldPages = staffUser.effectivePages || [];
        const newPages = freshUser.effectivePages || [];

        const hasDiff =
          oldPages.length !== newPages.length ||
          oldPages.some((p: string) => !newPages.includes(p)) ||
          newPages.some((p: string) => !oldPages.includes(p));

        if (hasDiff || isAccessRevoked) {
          setStaffUser((prev) => {
            if (!prev) return freshUser;
            return {
              ...prev,
              ...freshUser,
              effectivePages: freshUser.effectivePages,
            };
          });

          // Only show notice when access is genuinely revoked or changed after initial load
          if (isAccessRevoked || (hasDiff && oldPages.length > 0 && freshUser.role !== 'tenant_admin' && !isPlatformOwner(freshUser))) {
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

  // 1. Silent token refresh on initial page load:
  // /platform/* restores only the platform session; everything else restores only staff session.
  useEffect(() => {
    let isMounted = true;

    // Check 15-minute inactivity limit on startup
    const storedLastActive = typeof window !== 'undefined' ? localStorage.getItem(ACTIVITY_STORAGE_KEY) : null;
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
    if (storedLastActive) {
      const parsedTime = Number(storedLastActive);
      if (!isNaN(parsedTime) && parsedTime > 0 && Date.now() - parsedTime >= getInactivityTimeoutMs()) {
        // Inactivity limit exceeded while CRM was closed or idle
        setStaffAccessToken(null);
        setStoredRefreshToken(null, false);
        setStaffUserWithStorage(null);
        setPlatformAccessToken(null);
        setStoredRefreshToken(null, true);
        setPlatformUserWithStorage(null);
        clearTabSessionUser();
        clearStorageExceptTheme();
        setIsLoading(false);
        if (!isPublicPath(currentPath)) {
          window.history.replaceState(null, '', '/login');
          window.location.href = '/login';
        }
        return;
      }
    }
    // CRM is active or restored within 15 minutes, update last activity timestamp
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(ACTIVITY_STORAGE_KEY, String(Date.now()));
      } catch {}
    }

    const savedPortal = typeof window !== 'undefined'
      ? (sessionStorage.getItem('crm_portal') || localStorage.getItem('crm_portal'))
      : null;
    
    // Check if there are active user credentials or session hints in browser storage
    const hasExistingSession =
      typeof window !== 'undefined' &&
      (Boolean(localStorage.getItem('crm_user')) ||
       Boolean(localStorage.getItem('crm_platform_user')) ||
       Boolean(localStorage.getItem('crm_staff_refresh_token')) ||
       Boolean(localStorage.getItem('crm_platform_refresh_token')) ||
       Boolean(localStorage.getItem('crm_refresh_token_fb')) ||
       Boolean(localStorage.getItem('platform_refresh_token_fb')));

    const isPublicStatic = !hasExistingSession && isPublicPath(currentPath);

    if (isPublicStatic) {
      setIsLoading(false);
      return;
    }

    const isPlatformRoute = currentPath.startsWith('/platform');

    (async () => {
      try {
        if (savedPortal === 'platform') {
          // Restore ONLY platform session
          try {
            const { data } = await platformAuthApi.refresh();
            if (isMounted && data) {
              lastActivityRef.current = Date.now();
              setPlatformAccessToken(data.accessToken);
              if (data.refreshToken) {
                setStoredRefreshToken(data.refreshToken, true);
              }
              if (data.user) {
                setPlatformUserWithStorage(data.user);
                setCurrentTabUserId(data.user.id);
              }
              if (!isPlatformRoute && typeof window !== 'undefined') {
                window.location.replace('/platform/companies');
                return;
              }
            }
          } catch (err: any) {
            if (isMounted && (err?.response?.status === 401 || err?.response?.status === 403)) {
              setPlatformAccessToken(null);
              setPlatformUserWithStorage(null);
            }
          }
        } else if (savedPortal === 'staff') {
          // Restore ONLY staff session
          try {
            const { data } = await authApi.refresh();
            if (isMounted && data) {
              lastActivityRef.current = Date.now();
              setStaffAccessToken(data.accessToken);
              if (data.refreshToken) {
                setStoredRefreshToken(data.refreshToken, false);
              }
              if (data.user) {
                setStaffUserWithStorage(data.user);
                setCurrentTabUserId(data.user.id);
              } else {
                const meRes = await authApi.me();
                if (isMounted && meRes.data) {
                  setStaffUserWithStorage(meRes.data);
                  if (meRes.data.id) setCurrentTabUserId(meRes.data.id);
                }
              }
            }
          } catch (err: any) {
            if (isMounted && (err?.response?.status === 401 || err?.response?.status === 403)) {
              setStaffAccessToken(null);
              setStaffUserWithStorage(null);
            }
          }
        } else {
          // savedPortal not explicitly set
          if (isPlatformRoute) {
            try {
              const { data } = await platformAuthApi.refresh();
              if (isMounted && data) {
                try {
                  sessionStorage.setItem('crm_portal', 'platform');
                  localStorage.setItem('crm_portal', 'platform');
                } catch {}
                lastActivityRef.current = Date.now();
                setPlatformAccessToken(data.accessToken);
                if (data.refreshToken) {
                  setStoredRefreshToken(data.refreshToken, true);
                }
                if (data.user) {
                  setPlatformUserWithStorage(data.user);
                  setCurrentTabUserId(data.user.id);
                }
              }
            } catch (err: any) {
              if (isMounted && (err?.response?.status === 401 || err?.response?.status === 403)) {
                setPlatformAccessToken(null);
                setPlatformUserWithStorage(null);
              }
            }
          } else {
            try {
              const { data } = await authApi.refresh();
              if (isMounted && data) {
                try {
                  sessionStorage.setItem('crm_portal', 'staff');
                  localStorage.setItem('crm_portal', 'staff');
                } catch {}
                lastActivityRef.current = Date.now();
                setStaffAccessToken(data.accessToken);
                if (data.refreshToken) {
                  setStoredRefreshToken(data.refreshToken, false);
                }
                if (data.user) {
                  setStaffUserWithStorage(data.user);
                  setCurrentTabUserId(data.user.id);
                } else {
                  const meRes = await authApi.me();
                  if (isMounted && meRes.data) {
                    setStaffUserWithStorage(meRes.data);
                    if (meRes.data.id) setCurrentTabUserId(meRes.data.id);
                  }
                }
              }
            } catch {
              // Staff refresh failed; try platform refresh fallback
              try {
                const { data: platData } = await platformAuthApi.refresh();
                if (isMounted && platData) {
                  try {
                    sessionStorage.setItem('crm_portal', 'platform');
                    localStorage.setItem('crm_portal', 'platform');
                  } catch {}
                  lastActivityRef.current = Date.now();
                  setPlatformAccessToken(platData.accessToken);
                  if (platData.refreshToken) {
                    setStoredRefreshToken(platData.refreshToken, true);
                  }
                  if (platData.user) {
                    setPlatformUserWithStorage(platData.user);
                    setCurrentTabUserId(platData.user.id);
                  }
                  if (typeof window !== 'undefined') {
                    window.location.replace('/platform/companies');
                    return;
                  }
                }
              } catch (err: any) {
                if (isMounted && (err?.response?.status === 401 || err?.response?.status === 403)) {
                  setStaffAccessToken(null);
                  setStaffUserWithStorage(null);
                  setPlatformAccessToken(null);
                  setPlatformUserWithStorage(null);
                }
              }
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

  // Cross-tab sync: react immediately to logins, logouts, or session changes in other tabs
  useEffect(() => {
    const handleReloadNotice = () => {
      setStaffAccessToken(null);
      setPlatformAccessToken(null);
      setStaffUserWithStorage(null);
      setPlatformUserWithStorage(null);
      clearTabSessionUser();
      if (timerRef.current) clearInterval(timerRef.current);
      setSessionChangedNotice(true);
    };

    window.addEventListener('crm:session-conflict-reload', handleReloadNotice);

    const unsubscribe = subscribeCrossTabAuth((event) => {
      if (event.type === 'signed_in') {
        const currentId = getCurrentTabUserId();
        const lastKnownId = typeof window !== 'undefined' ? sessionStorage.getItem('crm_last_active_user_id') : null;
        const isImpersonating = typeof window !== 'undefined' && sessionStorage.getItem('crm_tab_impersonating') === 'true';
        if (isImpersonating) return;

        // Only trigger session_changed modal if THIS tab had an active or recently-active user session that differed from the newly signed-in user
        const tabUserToCheck = currentId || lastKnownId;
        if (tabUserToCheck && tabUserToCheck !== event.userId) {
          setStaffAccessToken(null);
          setPlatformAccessToken(null);
          setStaffUserWithStorage(null);
          setPlatformUserWithStorage(null);
          clearTabSessionUser();
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem('crm_last_active_user_id');
          }
          if (timerRef.current) clearInterval(timerRef.current);
          setSessionChangedNotice(true);
        }
      } else if (event.type === 'signed_out') {
        const prevId = getCurrentTabUserId();
        if (prevId && typeof window !== 'undefined') {
          sessionStorage.setItem('crm_last_active_user_id', prevId);
        }
        setStaffAccessToken(null);
        setPlatformAccessToken(null);
        setStaffUserWithStorage(null);
        setPlatformUserWithStorage(null);
        clearTabSessionUser();
        if (timerRef.current) clearInterval(timerRef.current);
        const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
        if (!isPublicPath(currentPath)) {
          window.history.replaceState(null, '', '/login');
          window.location.href = '/login';
        }
      } else if (event.type === 'session_changed') {
        setStaffAccessToken(null);
        setPlatformAccessToken(null);
        setStaffUserWithStorage(null);
        setPlatformUserWithStorage(null);
        clearTabSessionUser();
        if (timerRef.current) clearInterval(timerRef.current);
        setSessionChangedNotice(true);
      }
    });

    return () => {
      window.removeEventListener('crm:session-conflict-reload', handleReloadNotice);
      unsubscribe();
    };
  }, [setStaffUserWithStorage, setPlatformUserWithStorage]);

  // 2. Inactivity Tracking: exactly 15 minutes of inactivity triggers logout; 1-minute warning
  const resetInactivityTimer = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    lastUserInputRef.current = now;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(ACTIVITY_STORAGE_KEY, String(now));
        localStorage.setItem(USER_INPUT_STORAGE_KEY, String(now));
      } catch {}
    }
    notifyUserActivity();
    setShowInactivityModal(false);
  }, []);

  useEffect(() => {
    if (!user) return;

    const now = Date.now();
    lastActivityRef.current = now;
    lastUserInputRef.current = now;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(ACTIVITY_STORAGE_KEY, String(now));
        localStorage.setItem(USER_INPUT_STORAGE_KEY, String(now));
      } catch {}
    }

    const activityEvents = [
      'mousemove',
      'mousedown',
      'keydown',
      'keyup',
      'input',
      'change',
      'touchstart',
      'scroll',
      'click',
      'wheel',
      'beforeinput',
      'paste',
    ];
    const handleActivity = () => {
      const current = Date.now();
      lastActivityRef.current = current;
      lastUserInputRef.current = current;
      notifyUserActivity();
      if (current - lastStorageWriteRef.current > 3000) {
        lastStorageWriteRef.current = current;
        try {
          localStorage.setItem(ACTIVITY_STORAGE_KEY, String(current));
          localStorage.setItem(USER_INPUT_STORAGE_KEY, String(current));
        } catch {}
      }
      if (showInactivityModal) {
        setShowInactivityModal(false);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const current = Date.now();
        lastActivityRef.current = current;
        lastUserInputRef.current = current;
        notifyUserActivity();
        try {
          localStorage.setItem(ACTIVITY_STORAGE_KEY, String(current));
          localStorage.setItem(USER_INPUT_STORAGE_KEY, String(current));
        } catch {}
      }
    };

    activityEvents.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }));
    window.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });
    window.addEventListener('focus', handleActivity, { passive: true });

    timerRef.current = setInterval(() => {
      // 1. Proactive Refresh: while active, check and refresh access token ~2 minutes before expiration
      checkAndPerformProactiveRefresh();

      // 2. Unsaved changes or in-flight save guard:
      // Cap the combined suppression at 30 extra minutes after the last real user input.
      // Background polling requests (notifications, automation, health) never count as activity.
      // Never exceed the refresh token life.
      const isSaving = isSaveInProgress();
      const hasRequests = hasInFlightRequests();
      const hasUnsaved = hasUnsavedFormChanges();
      const isSuppressionEligible = isSaving || hasRequests || hasUnsaved;

      let lastUserInput = lastUserInputRef.current;
      try {
        const storedInput = localStorage.getItem(USER_INPUT_STORAGE_KEY);
        if (storedInput) {
          const parsed = Number(storedInput);
          if (!isNaN(parsed) && parsed > 0) {
            lastUserInput = Math.max(lastUserInput, parsed);
          }
        }
      } catch {}

      const current = Date.now();
      const elapsedSinceUserInput = current - lastUserInput;
      const baseTimeoutMs = getInactivityTimeoutMs();

      if (isSuppressionEligible) {
        // Combined suppression is capped at 30 extra minutes (e.g. 60m + 30m = 90m),
        // and cannot exceed the refresh token life (12 hours).
        const maxAllowedDuration = Math.min(
          baseTimeoutMs + MAX_EXTRA_SUPPRESSION_MS,
          REFRESH_TOKEN_MAX_LIFE_MS
        );
        const timeLeft = maxAllowedDuration - elapsedSinceUserInput;

        if (timeLeft <= 0) {
          setShowInactivityModal(false);
          logout();
        } else if (timeLeft <= WARNING_THRESHOLD_MS) {
          setShowInactivityModal(true);
          setSecondsRemaining(Math.max(1, Math.round(timeLeft / 1000)));
        } else {
          setShowInactivityModal(false);
        }
      } else {
        // Standard inactivity timeout when no unsaved changes or active saves
        const timeLeft = baseTimeoutMs - elapsedSinceUserInput;

        if (timeLeft <= 0) {
          setShowInactivityModal(false);
          logout();
        } else if (timeLeft <= WARNING_THRESHOLD_MS) {
          setShowInactivityModal(true);
          setSecondsRemaining(Math.max(1, Math.round(timeLeft / 1000)));
        } else {
          setShowInactivityModal(false);
        }
      }
    }, 1000);

    return () => {
      activityEvents.forEach((evt) => window.removeEventListener(evt, handleActivity));
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleActivity);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [user, logout, showInactivityModal]);

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
      return {
        requiresTwoFactorSetup: true as const,
        setupToken: data.setupToken as string,
        user: data.user,
      };
    }

    lastActivityRef.current = Date.now();
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
      setCurrentTabUserId(data.user.id);
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
      setCurrentTabUserId(data.user.id);
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

  return (
    <AuthContext.Provider
      value={{
        user,
        staffUser,
        platformUser,
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
      }}
    >
      {children}

      {/* Inactivity Warning Modal */}
      {showInactivityModal && user && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
              <Clock className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Session Expiring Soon
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                You have been inactive. For your security, you will be logged out in{' '}
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  {secondsRemaining}s
                </span>
                .
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={resetInactivityTimer}
                className="flex-1 py-2 px-3 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm"
              >
                Stay Signed In
              </button>
              <button
                onClick={() => logout()}
                className="py-2 px-3 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session Changed Across Tabs Modal */}
      {sessionChangedNotice && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl text-center space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Session Changed
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                You signed in with another account in a different tab.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.location.reload();
                }
              }}
              className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-all shadow-md active:scale-[0.98]"
            >
              Reload
            </button>
          </div>
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
