/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth, CompanyChoice } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, RefreshCw, AlertCircle, ArrowLeft } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';
import { getRoleRedirectPath } from '../utils/roles';

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

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
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
                    <input
                      id="companyCode"
                      type="text"
                      autoComplete="organization"
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
                <input
                  id="identifier"
                  ref={identifierRef}
                  type="text"
                  autoComplete="username"
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
                  <a
                    href="/forgot-password"
                    className="text-[13px] font-medium text-[#2563EB] hover:underline transition-colors"
                  >
                    Forgot password?
                  </a>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
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
                {!showCodeField && !savedCode && (
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
                {!showCodeField && savedCode && (
                  <div className="mt-2 text-[13px] text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                    <span>
                      Signing in to <strong>{savedCode}</strong>
                    </span>
                    <span>·</span>
                    <button
                      type="button"
                      className="text-[#2563EB] hover:underline cursor-pointer"
                      onClick={() => {
                        setShowCodeField(true);
                        setCompanyCode(savedCode);
                      }}
                    >
                      Change
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
