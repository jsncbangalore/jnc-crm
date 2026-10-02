import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { authApi } from '../services/api';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string, companyCode?: string) => Promise<User & { redirectPath?: string }>;
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
  const [isLoading, setIsLoading] = useState(false);

  const login = async (username: string, password: string, companyCode?: string): Promise<User & { redirectPath?: string }> => {
    const { data } = await authApi.login(username, password, companyCode);
    localStorage.setItem('jnc_access_token', data.accessToken);
    localStorage.setItem('jnc_refresh_token', data.refreshToken);
    localStorage.setItem('jnc_user', JSON.stringify(data.user));
    setUser(data.user);
    return { ...data.user, redirectPath: data.redirectPath };
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
    <AuthContext.Provider value={{ user, isLoading, login, logout, updateUser, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
