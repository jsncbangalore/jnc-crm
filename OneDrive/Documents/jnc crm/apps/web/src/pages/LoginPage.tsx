/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth, CompanyChoice } from '../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, RefreshCw, AlertCircle, ArrowLeft, Clock } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';
import { getRoleRedirectPath } from '../utils/roles';
import { subscribeColdStart } from '../services/api';

export { getRoleRedirectPath };

const COMPANY_CODE_KEY = 'jnc_last_company_code';

type Step = 'login' | 'select-company';

export default function LoginPage() {
  const { login, selectCompany } = useAuth();
  const navigate = useNavigate();

  // ── Form state ──────────────────────────────────────────────────────────────
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showCodeField, setShowCodeField] = useState(false);
  const [companyCode, setCompanyCode] = useState<string>('');

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isWakingUp, setIsWakingUp] = useState(false);

  useEffect(() => {
    return subscribeColdStart((waking) => setIsWakingUp(waking));
  }, []);

  // ── Company selection state ──────────────────────────────────────────────────
  const [companies, setCompanies] = useState<CompanyChoice[]>([]);
  const [selectionToken, setSelectionToken] = useState('');
  const [selectingCompany, setSelectingCompany] = useState<string | null>(null);

  // On mount, ensure legacy saved company code is removed from localStorage
  useEffect(() => {
    try {
      localStorage.removeItem(COMPANY_CODE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const identifierRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    identifierRef.current?.focus();
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const effectiveCode = showCodeField ? companyCode.trim() : undefined;

  // ── Submit login form ─────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

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
      if (
        !err?.response ||
        err.code === 'ERR_NETWORK' ||
        err.code === 'ECONNABORTED' ||
        err.message?.includes('Network Error')
      ) {
        setError('Cannot reach the server. Check your connection and try again.');
      } else if (err.response?.status === 401) {
        setError(err.response?.data?.message || 'Invalid credentials.');
      } else {
        setError(err.response?.data?.message || 'Cannot reach the server. Check your connection and try again.');
      }
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
      const destination = (user as any).redirectPath || getRoleRedirectPath(user);
      navigate(destination);
    } catch (err: any) {
      if (
        !err?.response ||
        err.code === 'ERR_NETWORK' ||
        err.code === 'ECONNABORTED' ||
        err.message?.includes('Network Error')
      ) {
        setError('Cannot reach the server. Check your connection and try again.');
      } else {
        setError(err?.response?.data?.message || 'Unable to sign in. Please try again.');
      }
      setSelectingCompany(null);
    }
  };

  // ── Derived error hints ───────────────────────────────────────────────────────
  const isGenericError = error === 'Invalid credentials.' || error === 'Invalid credentials';
  const showCodeHint = isGenericError && !effectiveCode;

  return (
    <AuthLayout>
      <motion.div
        key={step}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2 }}
        className="w-full"
      >
        {/* ── STEP: Login ───────────────────────────────────────────────────── */}
        {step === 'login' && (
          <>
            <div className="mb-6">
              <h2 className="text-[28px] font-semibold text-slate-900 dark:text-white leading-tight">
                Sign in
              </h2>
              <p className="text-[14px] text-slate-500 dark:text-slate-400 mt-1">
                Enter your credentials to continue
              </p>
            </div>

            {isWakingUp && (
              <div className="mb-4 flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-[13px] rounded-lg animate-pulse">
                <Clock size={16} className="shrink-0 text-amber-600 dark:text-amber-400" />
                <span>Waking up the server, this can take up to a minute...</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5" noValidate autoComplete="off">
              {/* Company Code Input (Slides in ABOVE User ID field) */}
              <AnimatePresence initial={false}>
                {showCodeField && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <label
                      htmlFor="companyCode"
                      className="block text-[14px] font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Company Code
                    </label>
                    {/* Browsers may still autofill despite these attributes */}
                    <input
                      id="companyCode"
                      name="jnc-company"
                      type="text"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      className="w-full h-11 px-3.5 text-[16px] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#243049] rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#2563EB] focus:ring-[3px] focus:ring-[#2563EB]/25 transition-all"
                      placeholder="e.g. JNC"
                      value={companyCode}
                      onChange={(e) => setCompanyCode(e.target.value)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* User ID / Email */}
              <div>
                <label
                  htmlFor="identifier"
                  className="block text-[14px] font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  User ID or Email
                </label>
                {/* Browsers may still autofill despite these attributes */}
                <input
                  id="identifier"
                  name="jnc-identity"
                  ref={identifierRef}
                  type="text"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  className="w-full h-11 px-3.5 text-[16px] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#243049] rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#2563EB] focus:ring-[3px] focus:ring-[#2563EB]/25 transition-all"
                  placeholder="Enter User ID or Email"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="password"
                    className="text-[14px] font-medium text-slate-700 dark:text-slate-300"
                  >
                    Password
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-[13px] font-medium text-[#2563EB] hover:underline transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  {/* Browsers may still autofill despite these attributes */}
                  <input
                    id="password"
                    name="jnc-secret"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    className="w-full h-11 px-3.5 pr-12 text-[16px] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#243049] rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#2563EB] focus:ring-[3px] focus:ring-[#2563EB]/25 transition-all"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="w-10 h-10 flex items-center justify-center absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {/* Small text link directly under the password field */}
                {!showCodeField && (
                  <div className="mt-2">
                    <button
                      type="button"
                      className="text-[13px] font-medium text-[#2563EB] hover:underline cursor-pointer"
                      onClick={() => setShowCodeField(true)}
                    >
                      Sign in with a company code
                    </button>
                  </div>
                )}
              </div>

              {/* Error Alert */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    role="alert"
                    aria-live="assertive"
                    className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] dark:bg-red-950/40 dark:border-red-900/60 dark:text-red-300 text-[13px] font-medium"
                  >
                    <div className="flex items-start gap-2">
                      <AlertCircle size={16} className="shrink-0 mt-0.5" />
                      <div>
                        <p>{error}</p>
                        {showCodeHint && (
                          <p className="mt-1 text-[#B91C1C] dark:text-red-300">
                            Staff accounts can also{' '}
                            <button
                              type="button"
                              className="underline cursor-pointer font-semibold"
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

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] focus:outline-none focus:ring-[3px] focus:ring-[#2563EB]/35 text-white text-[15px] font-semibold shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                aria-busy={loading}
              >
                {loading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" aria-hidden />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <span>Sign in</span>
                )}
              </button>

              {/* Platform Super Admin Switcher */}
              <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 text-center">
                <p className="text-[13px] text-slate-500 dark:text-slate-400">
                  Platform Super Administrator?{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/platform/login')}
                    className="font-semibold text-[#2563EB] hover:underline transition-colors"
                  >
                    Sign in to Platform Console (/platform/login) &rarr;
                  </button>
                </p>
              </div>
            </form>
          </>
        )}

        {/* ── STEP: Company selection ────────────────────────────────────────── */}
        {step === 'select-company' && (
          <>
            <button
              type="button"
              onClick={() => {
                setStep('login');
                setError('');
              }}
              className="flex items-center gap-1.5 text-[13px] font-medium text-[#2563EB] hover:underline mb-5 transition-colors cursor-pointer"
            >
              <ArrowLeft size={14} />
              Back
            </button>

            <div className="mb-6">
              <h2 className="text-[28px] font-semibold text-slate-900 dark:text-white leading-tight">
                Choose your company
              </h2>
              <p className="text-[14px] text-slate-500 dark:text-slate-400 mt-1">
                Your account exists in multiple companies. Select one to continue.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="mb-4 p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] dark:bg-red-950/40 dark:border-red-900/60 dark:text-red-300 text-[13px] font-medium flex items-center gap-2"
              >
                <AlertCircle size={16} className="shrink-0" />
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
                  className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl border border-[#CBD5E1] dark:border-[#243049] bg-white dark:bg-[#0F172A] hover:border-[#2563EB] hover:bg-blue-50/30 dark:hover:border-[#2563EB] dark:hover:bg-blue-950/20 transition-all text-left disabled:opacity-60 cursor-pointer"
                >
                  <div>
                    <p className="text-[15px] font-semibold text-slate-900 dark:text-white">
                      {company.name}
                    </p>
                    <p className="text-[13px] text-slate-500 dark:text-slate-400">
                      {company.code}
                    </p>
                  </div>
                  {selectingCompany === company.code && (
                    <RefreshCw size={16} className="animate-spin text-[#2563EB]" />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </motion.div>
    </AuthLayout>
  );
}
