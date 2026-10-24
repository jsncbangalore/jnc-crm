/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getConsent,
  setConsent,
  COOKIE_CONSENT_EVENT,
  COOKIE_OPEN_PANEL_EVENT,
} from '../../utils/cookieConsent';
import { useBranding } from '../../contexts/BrandingContext';

export default function CookieConsentBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [necessaryAllowed, setNecessaryAllowed] = useState(true);
  const [preferencesAllowed, setPreferencesAllowed] = useState(false);
  const location = useLocation();
  const { branding } = useBranding();

  const evaluateVisibility = useCallback(() => {
    if (typeof window === 'undefined') return;

    // Do not show on login, public inquiry, quote-request, embedded forms, or cookies policy page
    const path = location.pathname.toLowerCase();
    const search = location.search.toLowerCase();
    const isExcludedPage =
      path === '/login' ||
      path === '/platform/login' ||
      path.startsWith('/inquiry') ||
      path.startsWith('/quote-request') ||
      path === '/cookies' ||
      path === '/cookie-policy' ||
      search.includes('embed=true');

    if (isExcludedPage) {
      setIsVisible(false);
      return;
    }

    const consent = getConsent();
    if (consent === null) {
      setIsVisible(true);
      setPreferencesAllowed(false);
    } else {
      setIsVisible(false);
      setPreferencesAllowed(consent.preferences);
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    evaluateVisibility();

    const handleConsentChange = () => {
      evaluateVisibility();
    };

    const handleOpenPanel = () => {
      const current = getConsent();
      setPreferencesAllowed(Boolean(current?.preferences));
      setIsCustomizing(true);
      setIsVisible(true);
    };

    window.addEventListener(COOKIE_CONSENT_EVENT, handleConsentChange);
    window.addEventListener(COOKIE_OPEN_PANEL_EVENT, handleOpenPanel);

    return () => {
      window.removeEventListener(COOKIE_CONSENT_EVENT, handleConsentChange);
      window.removeEventListener(COOKIE_OPEN_PANEL_EVENT, handleOpenPanel);
    };
  }, [evaluateVisibility]);

  // Keyboard navigation: Escape closes panel without granting consent
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isVisible) {
        if (isCustomizing) {
          setIsCustomizing(false);
        } else {
          // Temporarily hide for this session without saving any consent
          setIsVisible(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, isCustomizing]);

  if (!isVisible) {
    return null;
  }

  const handleAcceptAll = () => {
    setConsent('all');
    setIsVisible(false);
    setIsCustomizing(false);
  };

  const handleRejectOptional = () => {
    setConsent('necessary_only');
    setIsVisible(false);
    setIsCustomizing(false);
  };

  const handleSaveCustom = () => {
    setConsent('custom', preferencesAllowed);
    setIsVisible(false);
    setIsCustomizing(false);
  };

  const handleDismissWithoutConsent = () => {
    // Dismissing does NOT count as consent
    setIsVisible(false);
    setIsCustomizing(false);
  };

  const productName = branding.companyDisplayName || 'CRM Workspace';

  return (
    <AnimatePresence>
      <motion.aside
        role="dialog"
        aria-modal="false"
        aria-labelledby="cookie-banner-title"
        aria-describedby="cookie-banner-desc"
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 sm:bottom-4 sm:left-4 sm:right-auto sm:max-w-xl z-50 p-3 sm:p-0 pointer-events-auto"
      >
        <div className="bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-4 sm:p-5 text-slate-800 dark:text-slate-100 ring-1 ring-black/5 dark:ring-white/5">
          {!isCustomizing ? (
            /* ─── Compact Default View ────────────────────────────────────── */
            <div>
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3
                  id="cookie-banner-title"
                  className="text-sm font-bold text-slate-900 dark:text-white leading-tight"
                >
                  Cookies on {productName}
                </h3>
                <button
                  type="button"
                  onClick={handleDismissWithoutConsent}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-xs"
                  aria-label="Close cookie banner without saving consent"
                  title="Close (does not count as consent)"
                >
                  ✕
                </button>
              </div>

              <p
                id="cookie-banner-desc"
                className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-3.5"
              >
                We use necessary cookies to keep you signed in and your account secure. With your permission,
                we also save your preferences, such as theme and dashboard layout. We do not use advertising
                or analytics cookies.
              </p>

              <div className="flex items-center justify-between gap-2 mb-3">
                <Link
                  to="/cookies"
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Cookie details
                </Link>
              </div>

              {/* Three buttons of equal size and weight */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={handleRejectOptional}
                  className="w-full py-2 px-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-all text-center"
                >
                  Reject optional
                </button>
                <button
                  type="button"
                  onClick={() => setIsCustomizing(true)}
                  className="w-full py-2 px-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-all text-center"
                >
                  Choose
                </button>
                <button
                  type="button"
                  onClick={handleAcceptAll}
                  className="w-full py-2 px-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-all text-center"
                >
                  Accept all
                </button>
              </div>
            </div>
          ) : (
            /* ─── Granular Selection Panel ────────────────────────────────── */
            <div>
              <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Cookie Preferences
                </h3>
                <button
                  type="button"
                  onClick={() => setIsCustomizing(false)}
                  className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium"
                >
                  Back
                </button>
              </div>

              <div className="space-y-3 mb-4">
                {/* Strictly Necessary Row with interactive toggle switch */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          Strictly Necessary
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                          {necessaryAllowed ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Keeps you securely signed in and protects multi-tenant sessions.
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={necessaryAllowed}
                        onChange={(e) => setNecessaryAllowed(e.target.checked)}
                        className="sr-only peer"
                        aria-label="Toggle strictly necessary storage"
                      />
                      <div className="w-9 h-5 bg-slate-300 dark:bg-slate-700 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  {!necessaryAllowed && (
                    <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-[10px] text-amber-800 dark:text-amber-300 leading-snug">
                      ⚠️ Turning off necessary storage will prevent login and active session features.
                    </div>
                  )}
                </div>

                {/* Preferences Row */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      Preferences
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Saves your interface theme (light/dark) and dashboard layout settings.
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={preferencesAllowed}
                      onChange={(e) => setPreferencesAllowed(e.target.checked)}
                      className="sr-only peer"
                      aria-label="Enable preferences storage"
                    />
                    <div className="w-9 h-5 bg-slate-300 dark:bg-slate-700 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Link
                  to="/cookies"
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Cookie details
                </Link>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCustomizing(false)}
                    className="py-1.5 px-3 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveCustom}
                    className="py-1.5 px-3.5 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-xs"
                  >
                    Save choice
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
