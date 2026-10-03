/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth, CompanyChoice } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useBranding } from '../contexts/BrandingContext';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon, Eye, EyeOff, RefreshCw, AlertCircle, ChevronRight, ArrowLeft } from 'lucide-react';

const COMPANY_CODE_KEY = 'jnc_last_company_code';

import { getRoleRedirectPath } from '../utils/roles';
export { getRoleRedirectPath };

type Step = 'login' | 'select-company';

export default function LoginPage() {
  const { login, selectCompany } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { branding } = useBranding();
  const navigate = useNavigate();

  // ── Form state ──────────────────────────────────────────────────────────────
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showCodeField, setShowCodeField] = useState(false);
  const [companyCode, setCompanyCode] = useState<string>('');
  const [savedCode, setSavedCode] = useState<string>(() => localStorage.getItem(COMPANY_CODE_KEY) || '');

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ── Company selection state ──────────────────────────────────────────────────
  const [companies, setCompanies] = useState<CompanyChoice[]>([]);
  const [selectionToken, setSelectionToken] = useState('');
  const [selectingCompany, setSelectingCompany] = useState<string | null>(null);

  // On mount, restore saved code
  useEffect(() => {
    if (savedCode) {
      setShowCodeField(true);
      setCompanyCode(savedCode);
    }
  }, [savedCode]);

  const identifierRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    identifierRef.current?.focus();
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const effectiveCode = showCodeField ? companyCode.trim() : undefined;

  const saveCode = (code: string) => {
    if (code) {
      localStorage.setItem(COMPANY_CODE_KEY, code);
      setSavedCode(code);
    } else {
      localStorage.removeItem(COMPANY_CODE_KEY);
      setSavedCode('');
    }
  };

  // ── Submit login form ─────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (effectiveCode) saveCode(effectiveCode);

    try {
      const result = await login(identifier, password, effectiveCode);

      if ('requiresCompanySelection' in result && result.requiresCompanySelection) {
        setCompanies(result.companies);
        setSelectionToken(result.selectionToken);
        setStep('select-company');
        return;
      }

      // Normal login success
      const user = result as any;
      const destination = user.redirectPath || getRoleRedirectPath(user);
      navigate(destination);
    } catch (err: any) {
      const msg: string = err?.response?.data?.message || 'Invalid credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Company selection step ────────────────────────────────────────────────────
  const handleSelectCompany = async (code: string) => {
    setSelectingCompany(code);
    setError('');
    try {
      const user = await selectCompany(selectionToken, code);
      saveCode(code);
      const destination = (user as any).redirectPath || getRoleRedirectPath(user);
      navigate(destination);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Unable to sign in. Please try again.');
      setSelectingCompany(null);
    }
  };

  // ── Derived error hints ───────────────────────────────────────────────────────
  const isGenericError = error === 'Invalid credentials.' || error === 'Invalid credentials';
  const showCodeHint = isGenericError && !effectiveCode;

  // ── Left panel content ───────────────────────────────────────────────────────
  const LeftPanel = () => (
    <div className="hidden lg:flex flex-col justify-center px-12 py-16 bg-crm-blue text-white relative overflow-hidden">
      {/* decorative circles */}
      <div className="absolute -top-16 -left-16 w-64 h-64 bg-white/5 rounded-full" />
      <div className="absolute bottom-0 right-0 w-48 h-48 bg-white/5 rounded-full translate-x-1/3 translate-y-1/3" />

      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <img
              src={branding.companyLogoUrl || '/jnc-logo.jpg'}
              alt={branding.companyDisplayName}
              className="h-7 w-auto object-contain"
            />
          </div>
          <span className="text-xl font-bold tracking-tight">{branding.companyDisplayName}</span>
        </div>

        <h1 className="text-3xl font-extrabold mb-4 leading-snug">
          Enterprise CRM<br />at your fingertips
        </h1>
        <p className="text-blue-100 text-sm leading-relaxed max-w-xs">
          Manage leads, orders, and customer relationships — all in one secure, multi-tenant platform.
        </p>
        <p className="text-blue-200 text-xs mt-4">
          Built for growing B2B businesses.
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0F1117] text-slate-900 dark:text-slate-100 flex relative">
      {/* Theme Toggle */}
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-5 right-5 w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161922] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white shadow-sm transition-all cursor-pointer z-20"
        title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
        aria-label={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
      >
        {isDark ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-slate-600" />}
      </button>

      {/* Left panel */}
      <div className="w-full lg:w-[45%] xl:w-[40%]">
        <LeftPanel />
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25 }}
          className="w-full max-w-sm"
        >
          {/* ── STEP: Login ───────────────────────────────────────────────────── */}
          {step === 'login' && (
            <>
              {/* Mobile logo */}
              <div className="lg:hidden text-center mb-6">
                <div className="inline-flex items-center gap-2 mb-2">
                  <img
                    src={branding.companyLogoUrl || '/jnc-logo.jpg'}
                    alt={branding.companyDisplayName}
                    className="h-8 w-auto object-contain"
                  />
                  <span className="text-lg font-bold">{branding.companyDisplayName}</span>
                </div>
              </div>

              <div className="mb-6">
                <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">Sign in</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Enter your credentials to continue
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {/* User ID / Email */}
                <div>
                  <label
                    htmlFor="identifier"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    User ID or Email
                  </label>
                  <input
                    id="identifier"
                    ref={identifierRef}
                    type="text"
                    autoComplete="username"
                    required
                    className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-[#0F1117] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-crm-blue focus:border-transparent transition-all"
                    placeholder="Enter User ID or Email"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                  />
                </div>

                {/* Password */}
                <div>
                  <label
                    htmlFor="password"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      className="w-full px-3 pr-10 py-2.5 text-sm bg-slate-50 dark:bg-[#0F1117] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-crm-blue focus:border-transparent transition-all"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {/* Company code toggle */}
                <AnimatePresence>
                  {!showCodeField && savedCode && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2"
                    >
                      <span>
                        Signing in to <strong>{savedCode}</strong>
                      </span>
                      <button
                        type="button"
                        className="text-crm-blue underline"
                        onClick={() => {
                          setShowCodeField(true);
                          setCompanyCode(savedCode);
                        }}
                      >
                        Change
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {showCodeField && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <label
                        htmlFor="companyCode"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                      >
                        Company Code
                      </label>
                      <input
                        id="companyCode"
                        type="text"
                        autoComplete="organization"
                        className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-[#0F1117] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-crm-blue focus:border-transparent transition-all"
                        placeholder="e.g. JNC"
                        value={companyCode}
                        onChange={(e) => setCompanyCode(e.target.value)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {!showCodeField && !savedCode && (
                  <button
                    type="button"
                    className="text-xs text-crm-blue hover:underline"
                    onClick={() => setShowCodeField(true)}
                  >
                    Sign in with a company code
                  </button>
                )}

                <div className="text-right">
                  <a href="/forgot-password" className="text-xs text-slate-500 dark:text-slate-400 hover:text-crm-blue transition-colors">
                    Forgot password?
                  </a>
                </div>

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      key="error"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      role="alert"
                      aria-live="assertive"
                      className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-xs font-medium"
                    >
                      <div className="flex items-start gap-2">
                        <AlertCircle size={14} className="shrink-0 mt-0.5" />
                        <div>
                          <p>{error}</p>
                          {showCodeHint && (
                            <p className="mt-1 text-red-500 dark:text-red-500">
                              Staff accounts can also{' '}
                              <button
                                type="button"
                                className="underline"
                                onClick={() => setShowCodeField(true)}
                              >
                                sign in with a company code
                              </button>
                              .
                            </p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-lg bg-crm-blue hover:bg-crm-blue-hover text-white text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                  aria-busy={loading}
                >
                  {loading ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" aria-hidden />
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign in</span>
                      <ChevronRight size={14} aria-hidden />
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {/* ── STEP: Company selection ────────────────────────────────────────── */}
          {step === 'select-company' && (
            <>
              <button
                type="button"
                onClick={() => { setStep('login'); setError(''); }}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-6 transition-colors"
              >
                <ArrowLeft size={13} />
                Back
              </button>

              <div className="mb-6">
                <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">Choose your company</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Your account exists in multiple companies. Select one to continue.
                </p>
              </div>

              {error && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-xs font-medium flex items-center gap-2"
                >
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-3">
                {companies.map((company) => (
                  <button
                    key={company.code}
                    type="button"
                    disabled={!!selectingCompany}
                    onClick={() => handleSelectCompany(company.code)}
                    className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161922] hover:border-crm-blue hover:bg-blue-50/30 dark:hover:border-crm-blue dark:hover:bg-blue-950/20 transition-all text-left disabled:opacity-60"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{company.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{company.code}</p>
                    </div>
                    {selectingCompany === company.code ? (
                      <RefreshCw size={16} className="animate-spin text-crm-blue" />
                    ) : (
                      <ChevronRight size={16} className="text-slate-400" />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Footer */}
          <p className="text-center text-[11px] text-slate-400 dark:text-slate-500 mt-8">
            &copy; {new Date().getFullYear()} {branding.companyDisplayName}. All rights reserved.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
