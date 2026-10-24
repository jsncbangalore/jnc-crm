/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { canStore, COOKIE_CONSENT_EVENT } from '../utils/cookieConsent';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const getSystemTheme = (): Theme => {
  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
};

const applyDOMTheme = (newTheme: Theme) => {
  const root = document.documentElement;
  root.classList.add('no-theme-transition');
  if (newTheme === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
  }

  // Without consent, do not write to localStorage; keep in memory only
  if (canStore('preferences')) {
    try {
      localStorage.setItem('crm_theme', newTheme);
    } catch {}
  }

  // Remove temporary transition lock immediately on next frame
  requestAnimationFrame(() => {
    root.classList.remove('no-theme-transition');
  });
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (canStore('preferences')) {
      try {
        const savedTheme = localStorage.getItem('crm_theme');
        if (savedTheme === 'light' || savedTheme === 'dark') {
          return savedTheme;
        }
      } catch {}
    }
    return getSystemTheme();
  });

  useEffect(() => {
    applyDOMTheme(theme);
  }, [theme]);

  // Sync when cookie consent changes or when system color scheme changes
  useEffect(() => {
    const handleConsentChange = () => {
      if (!canStore('preferences')) {
        // Preference storage revoked: remove any stored theme key and adopt system theme if not overridden in memory
        try {
          localStorage.removeItem('crm_theme');
        } catch {}
      } else {
        // Preference storage consented: persist active in-memory theme
        try {
          localStorage.setItem('crm_theme', theme);
        } catch {}
      }
    };

    window.addEventListener(COOKIE_CONSENT_EVENT, handleConsentChange);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, handleConsentChange);
  }, [theme]);

  // Listen to prefers-color-scheme changes when preferences are not stored
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = (e: MediaQueryListEvent) => {
      if (!canStore('preferences')) {
        const sysTheme: Theme = e.matches ? 'dark' : 'light';
        setThemeState(sysTheme);
        applyDOMTheme(sysTheme);
      }
    };
    if (media.addEventListener) {
      media.addEventListener('change', handleMediaChange);
      return () => media.removeEventListener('change', handleMediaChange);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const nextTheme: Theme = prev === 'dark' ? 'light' : 'dark';
      applyDOMTheme(nextTheme);
      return nextTheme;
    });
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    applyDOMTheme(newTheme);
    setThemeState(newTheme);
  }, []);

  const contextValue = useMemo(
    () => ({
      theme,
      isDark: theme === 'dark',
      toggleTheme,
      setTheme,
    }),
    [theme, toggleTheme, setTheme]
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
