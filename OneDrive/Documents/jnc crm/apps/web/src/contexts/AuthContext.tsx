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
import { authApi, setAccessToken } from '../services/api';
import { AlertCircle, Clock } from 'lucide-react';

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
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  updateUser: (updatedFields: Partial<User>) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// 30 minutes total inactivity timeout; warning appears at 28 minutes (2 minutes remaining)
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const WARNING_THRESHOLD_MS = 2 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('jnc_user');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      localStorage.removeItem('jnc_user');
    }
    return null;
  });

  const [isLoading, setIsLoading] = useState(true);
  const [showInactivityModal, setShowInactivityModal] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(120);

  const lastActivityRef = useRef<number>(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const _storeSession = (data: any) => {
    // Keep access token in memory only; reset inactivity timestamp for new session
    lastActivityRef.current = Date.now();
    setAccessToken(data.accessToken);
    if (data.user) {
      localStorage.setItem('jnc_user', JSON.stringify(data.user));
      setUser(data.user);
    }
    return { ...data.user, redirectPath: data.redirectPath } as User & { redirectPath?: string };
  };

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    } finally {
      setAccessToken(null);
      localStorage.removeItem('jnc_user');
      localStorage.removeItem('jnc_access_token');
      localStorage.removeItem('jnc_refresh_token');
      setUser(null);
      setShowInactivityModal(false);
      if (
        window.location.pathname !== '/login' &&
        window.location.pathname !== '/platform/login'
      ) {
        window.location.href = '/login';
      }
    }
  }, []);

  const logoutAll = useCallback(async () => {
    try {
      await authApi.logoutAll();
    } catch {
      // ignore
    } finally {
      setAccessToken(null);
      localStorage.removeItem('jnc_user');
      localStorage.removeItem('jnc_access_token');
      localStorage.removeItem('jnc_refresh_token');
      setUser(null);
      setShowInactivityModal(false);
      window.location.href = '/login';
    }
  }, []);

  // 1. Silent token refresh on initial page load using HttpOnly cookie
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { data } = await authApi.refresh();
        if (isMounted && data) {
          _storeSession(data);
        }
      } catch {
        if (isMounted) {
          setAccessToken(null);
          // If on protected page without session, clear user
          const isPublicPage =
            window.location.pathname.startsWith('/login') ||
            window.location.pathname.startsWith('/forgot-password') ||
            window.location.pathname.startsWith('/reset-password') ||
            window.location.pathname.startsWith('/platform/login');
          if (!isPublicPage) {
            setUser(null);
            localStorage.removeItem('jnc_user');
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

    // Reset timestamp and modal state whenever active user is present
    lastActivityRef.current = Date.now();
    setShowInactivityModal(false);

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    const handleActivity = () => {
      lastActivityRef.current = Date.now();
    };

    activityEvents.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }));

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

    return _storeSession(data);
  };

  const selectCompany = async (selectionToken: string, companyCode: string) => {
    const { data } = await authApi.selectCompany(selectionToken, companyCode);
    return _storeSession(data);
  };

  const updateUser = (updatedFields: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return null;
      const merged = { ...prev, ...updatedFields };
      localStorage.setItem('jnc_user', JSON.stringify(merged));
      return merged;
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        selectCompany,
        logout,
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
