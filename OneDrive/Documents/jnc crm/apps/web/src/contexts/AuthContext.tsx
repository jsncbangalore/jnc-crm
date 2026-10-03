import React, { createContext, useContext, useState, ReactNode } from 'react';
import { User } from '../types';
import { authApi } from '../services/api';

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
  ) => Promise<(User & { redirectPath?: string }) | { requiresCompanySelection: true; companies: CompanyChoice[]; selectionToken: string }>;
  /** Complete multi-company login after user picks a company */
  selectCompany: (selectionToken: string, companyCode: string) => Promise<User & { redirectPath?: string }>;
  logout: () => void;
  updateUser: (updatedFields: Partial<User>) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('jnc_user');
      const token = localStorage.getItem('jnc_access_token');
      if (stored && token) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to parse stored user:', e);
      localStorage.removeItem('jnc_user');
      localStorage.removeItem('jnc_access_token');
      localStorage.removeItem('jnc_refresh_token');
    }
    return null;
  });
  const [isLoading] = useState(false);

  const _storeSession = (data: any) => {
    localStorage.setItem('jnc_access_token', data.accessToken);
    localStorage.setItem('jnc_refresh_token', data.refreshToken);
    localStorage.setItem('jnc_user', JSON.stringify(data.user));
    setUser(data.user);
    return { ...data.user, redirectPath: data.redirectPath } as User & { redirectPath?: string };
  };

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

  const logout = () => {
    localStorage.removeItem('jnc_access_token');
    localStorage.removeItem('jnc_refresh_token');
    localStorage.removeItem('jnc_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, selectCompany, logout, updateUser, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
