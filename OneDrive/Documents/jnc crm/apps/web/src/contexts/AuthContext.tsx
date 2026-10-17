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
} from '../services/api';
import { Clock } from 'lucide-react';

export interface CompanyChoice {
  code: string;
  name: string;
}

export interface SelectionPending {
  companies: CompanyChoice[];
  selectionToken: string;
}

interface AuthContextType {
  user: User | null;
  staffUser: User | null;
  platformUser: User | null;
  isLoading: boolean;
  /** Returns user on success, or `{ requiresCompanySelection, companies, selectionToken }` if more than one company matched */
  login: (
    identifier: string,
    password: string,
    companyCode?: string,
  ) => Promise<
    | (User & { redirectPath?: string })
    | { requiresCompanySelection: true; companies: CompanyChoice[]; selectionToken: string }
  >;
  /** Complete multi-company login after user picks a company */
  selectCompany: (selectionToken: string, companyCode: string) => Promise<User & { redirectPath?: string }>;
  platformLogin: (email: string, password: string) => Promise<User & { redirectPath?: string }>;
  logout: () => Promise<void>;
  logoutStaff: () => Promise<void>;
  logoutPlatform: () => Promise<void>;
  logoutAll: () => Promise<void>;
  updateUser: (updatedFields: Partial<User>) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// 12 hours total inactivity timeout (covers full workday shift); warning appears at 5 minutes remaining
const INACTIVITY_TIMEOUT_MS = 12 * 60 * 60 * 1000;
const WARNING_THRESHOLD_MS = 5 * 60 * 1000;

function clearStorageExceptTheme() {
  try {
    const savedTheme = localStorage.getItem('jnc_theme');
    localStorage.clear();
    if (savedTheme) {
      localStorage.setItem('jnc_theme', savedTheme);
    }
    sessionStorage.clear();
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staffUser, setStaffUser] = useState<User | null>(null);
  const [platformUser, setPlatformUser] = useState<User | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [showInactivityModal, setShowInactivityModal] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(120);

  const lastActivityRef = useRef<number>(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const isPlatform =
    typeof window !== 'undefined' && window.location.pathname.startsWith('/platform');
  const user = isPlatform ? (platformUser || staffUser) : (staffUser || platformUser);

  const logoutStaff = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    } finally {
      setStaffAccessToken(null);
      setStoredRefreshToken(null, false);
      setStaffUser(null);
      setShowInactivityModal(false);
      clearStorageExceptTheme();
      if (window.location.pathname !== '/login') {
        window.history.replaceState(null, '', '/login');
        window.location.href = '/login';
      }
    }
  }, []);

  const logoutPlatform = useCallback(async () => {
    try {
      await platformAuthApi.logout();
    } catch {
      // ignore
    } finally {
      setPlatformAccessToken(null);
      setStoredRefreshToken(null, true);
      setPlatformUser(null);
      setShowInactivityModal(false);
      if (window.location.pathname !== '/platform/login') {
        window.history.replaceState(null, '', '/platform/login');
        window.location.href = '/platform/login';
      }
    }
  }, []);

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
      setStaffUser(null);
      setPlatformAccessToken(null);
      setPlatformUser(null);
      setShowInactivityModal(false);
      clearStorageExceptTheme();
      window.history.replaceState(null, '', '/login');
      window.location.href = '/login';
    }
  }, []);

  // 1. Silent token refresh on initial page load:
  // /platform/* restores only the platform session; everything else restores only staff session.
  useEffect(() => {
    let isMounted = true;

    // Purge legacy storage entries on load
    try {
      localStorage.removeItem('jnc_user');
      localStorage.removeItem('jnc_access_token');
      localStorage.removeItem('jnc_refresh_token');
    } catch {
      // ignore
    }

    const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
    const isPublicStatic =
      currentPath === '/forgot-password' ||
      currentPath.startsWith('/reset-password') ||
      currentPath === '/inquiry' ||
      currentPath === '/quote-request' ||
      currentPath === '/shared-cart' ||
      currentPath === '/cart-share' ||
      currentPath === '/cart';

    if (isPublicStatic) {
      setIsLoading(false);
      return;
    }

    const isPlatformRoute = currentPath.startsWith('/platform');

    (async () => {
      try {
        if (isPlatformRoute) {
          // Restore primary platform session
          try {
            const { data } = await platformAuthApi.refresh();
            if (isMounted && data) {
              lastActivityRef.current = Date.now();
              setPlatformAccessToken(data.accessToken);
              if (data.refreshToken) {
                setStoredRefreshToken(data.refreshToken, true);
              }
              if (data.user) {
                setPlatformUser(data.user);
              }
            }
          } catch {
            // If platform refresh fails, check if a staff user is logged in
            // so PlatformOwnerGuard can display the "client-company portal" notice without redirect loop
            try {
              const { data: staffData } = await authApi.refresh();
              if (isMounted && staffData) {
                lastActivityRef.current = Date.now();
                setStaffAccessToken(staffData.accessToken);
                if (staffData.refreshToken) {
                  setStoredRefreshToken(staffData.refreshToken, false);
                }
                if (staffData.user) {
                  setStaffUser(staffData.user);
                }
              }
            } catch {
              if (isMounted) {
                setPlatformAccessToken(null);
                setPlatformUser(null);
              }
            }
          }
        } else {
          // Restore primary staff session
          const impToken =
            typeof window !== 'undefined'
              ? sessionStorage.getItem('jnc_impersonate_token')
              : null;
          if (impToken) {
            setStaffAccessToken(impToken);
            try {
              const meRes = await authApi.me();
              if (isMounted && meRes.data) {
                lastActivityRef.current = Date.now();
                setStaffUser(meRes.data);
                setIsLoading(false);
                return;
              }
            } catch {
              sessionStorage.removeItem('jnc_impersonate_token');
            }
          }

          try {
            const { data } = await authApi.refresh();
            if (isMounted && data) {
              lastActivityRef.current = Date.now();
              setStaffAccessToken(data.accessToken);
              if (data.refreshToken) {
                setStoredRefreshToken(data.refreshToken, false);
              }
              if (data.user) {
                setStaffUser(data.user);
              } else {
                const meRes = await authApi.me();
                if (isMounted && meRes.data) {
                  setStaffUser(meRes.data);
                }
              }
            }
          } catch {
            // If staff refresh fails, check if a platform admin is logged in
            // so CrmRouteGuard can display the "Impersonation Required" notice
            try {
              const { data: platData } = await platformAuthApi.refresh();
              if (isMounted && platData) {
                lastActivityRef.current = Date.now();
                setPlatformAccessToken(platData.accessToken);
                if (platData.refreshToken) {
                  setStoredRefreshToken(platData.refreshToken, true);
                }
                if (platData.user) {
                  setPlatformUser(platData.user);
                }
              }
            } catch {
              if (isMounted) {
                setStaffAccessToken(null);
                setStaffUser(null);
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

  // 2. Inactivity Tracking: 30 minutes total, 2-minute warning
  const resetInactivityTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (showInactivityModal) {
      setShowInactivityModal(false);
    }
  }, [showInactivityModal]);

  useEffect(() => {
    if (!user) return;

    lastActivityRef.current = Date.now();

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    const handleActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        lastActivityRef.current = Date.now();
      }
    };

    activityEvents.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }));
    window.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });
    window.addEventListener('focus', handleActivity, { passive: true });

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const timeLeft = INACTIVITY_TIMEOUT_MS - elapsed;

      if (timeLeft <= 0) {
        logout();
      } else if (timeLeft <= WARNING_THRESHOLD_MS) {
        setShowInactivityModal(true);
        setSecondsRemaining(Math.max(1, Math.round(timeLeft / 1000)));
      } else {
        setShowInactivityModal(false);
      }
    }, 1000);

    return () => {
      activityEvents.forEach((evt) => window.removeEventListener(evt, handleActivity));
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleActivity);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [user, logout]);

  const login = async (
    identifier: string,
    password: string,
    companyCode?: string,
  ) => {
    const { data } = await authApi.login(identifier, password, companyCode);

    if (data.requiresCompanySelection) {
      return {
        requiresCompanySelection: true as const,
        companies: data.companies as CompanyChoice[],
        selectionToken: data.selectionToken as string,
      };
    }

    lastActivityRef.current = Date.now();
    setStaffAccessToken(data.accessToken);
    if (data.refreshToken) {
      setStoredRefreshToken(data.refreshToken, false);
    }
    if (data.user) {
      setStaffUser(data.user);
      if (data.user.role === 'platform_super_admin') {
        setPlatformAccessToken(data.accessToken);
        setPlatformUser(data.user);
      }
    }
    return { ...data.user, redirectPath: data.redirectPath } as User & { redirectPath?: string };
  };

  const platformLogin = async (email: string, password: string) => {
    const { data } = await platformAuthApi.login(email, password);
    lastActivityRef.current = Date.now();
    setPlatformAccessToken(data.accessToken);
    setStaffAccessToken(data.accessToken);
    if (data.refreshToken) {
      setStoredRefreshToken(data.refreshToken, true);
    }
    if (data.user) {
      setPlatformUser(data.user);
      setStaffUser(data.user);
    }
    return {
      ...data.user,
      redirectPath: data.redirectPath || '/platform/companies',
    } as User & { redirectPath?: string };
  };

  const selectCompany = async (selectionToken: string, companyCode: string) => {
    const { data } = await authApi.selectCompany(selectionToken, companyCode);
    lastActivityRef.current = Date.now();
    setStaffAccessToken(data.accessToken);
    if (data.refreshToken) {
      setStoredRefreshToken(data.refreshToken, false);
    }
    if (data.user) {
      setStaffUser(data.user);
    }
    return { ...data.user, redirectPath: data.redirectPath } as User & { redirectPath?: string };
  };

  const updateUser = (updatedFields: Partial<User>) => {
    if (isPlatform) {
      setPlatformUser((prev) => {
        if (!prev) return updatedFields as User;
        return { ...prev, ...updatedFields };
      });
    } else {
      setStaffUser((prev) => {
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
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
