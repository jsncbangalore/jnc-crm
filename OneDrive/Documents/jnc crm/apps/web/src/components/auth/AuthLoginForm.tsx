/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  RefreshCw,
  Clock,
  ArrowLeft,
  Building2,
  CheckCircle2,
} from 'lucide-react';
import { useAuth, CompanyChoice } from '../../contexts/AuthContext';
import { getRoleRedirectPath } from '../../utils/roles';
import { authApi, platformAuthApi, subscribeColdStart } from '../../services/api';
import TwoFactorChallenge from '../common/TwoFactorChallenge';

export interface AuthLoginFormProps {
  portal: 'company' | 'platform';
}

type Step = 'login' | 'select-company' | 'two-factor' | 'two-factor-setup';

export default function AuthLoginForm({ portal }: AuthLoginFormProps) {
  const isPlatform = portal === 'platform';
  const { login, platformLogin, selectCompany, logout } = useAuth();
  const navigate = useNavigate();


  // ── Form fields ─────────────────────────────────────────────────────────────
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isWakingUp, setIsWakingUp] = useState(false);

  // ── 2FA state ───────────────────────────────────────────────────────────────
  const [twoFactorData, setTwoFactorData] = useState<{
    loginTicket: string;
    methods: ('totp' | 'email')[];
    twoFactorGracePeriod?: { active: boolean; daysRemaining: number; deadline: string } | null;
  } | null>(null);
  const [setupToken, setSetupToken] = useState<string>('');

  // ── Company selection state ─────────────────────────────────────────────────
  const [companies, setCompanies] = useState<CompanyChoice[]>([]);
  const [selectionToken, setSelectionToken] = useState('');
  const [selectedCompanyCode, setSelectedCompanyCode] = useState('');

  const identifierRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return subscribeColdStart((waking) => setIsWakingUp(waking));
  }, []);

  // Caps lock listener
  const checkCapsLock = (e: React.KeyboardEvent) => {
    if (e.getModifierState) {
      setCapsLockOn(e.getModifierState('CapsLock'));
    }
  };

  // ── Submit handler ──────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier) {
      setError('Please enter your email or username.');
      identifierRef.current?.focus();
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      passwordRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      let result: any;
      if (isPlatform) {
        result = await platformLogin(trimmedIdentifier, password);
      } else {
        result = await login(
          trimmedIdentifier,
          password,
          companyCode.trim() || undefined,
        );
      }

      if ('requiresCompanySelection' in result && result.requiresCompanySelection) {
        setCompanies(result.companies || []);
        setSelectionToken(result.selectionToken || '');
        if (result.companies?.[0]) {
          setSelectedCompanyCode(result.companies[0].code);
        }
        setStep('select-company');
        return;
      }

      if ('requiresTwoFactor' in result && result.requiresTwoFactor) {
        setTwoFactorData({
          loginTicket: result.loginTicket,
          methods: result.methods,
          twoFactorGracePeriod: result.twoFactorGracePeriod,
        });
        setStep('two-factor');
        return;
      }

      if ('requiresTwoFactorSetup' in result && result.requiresTwoFactorSetup) {
        setSetupToken(result.setupToken);
        setStep('two-factor-setup');
        return;
      }

      const user = result as any;
      const destination = user.redirectPath || (isPlatform ? '/platform/companies' : getRoleRedirectPath(user));
      navigate(destination, { replace: true });
    } catch (err: any) {
      const status = err?.response?.status;
      const serverMessage = err?.response?.data?.message;

      if (!err?.response || err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
        setError('Cannot reach the server. Please check your connection and try again.');
      } else if (status === 401) {
        setError(serverMessage || 'Invalid credentials.');
      } else if (status === 403) {
        setError(serverMessage || 'Access restricted.');
      } else if (status === 429) {
        setError(serverMessage || 'Too many attempts. Please try again later.');
      } else {
        setError(serverMessage || 'Unable to sign in. Please verify your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompanyCode) {
      setError('Please select a company to proceed.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await selectCompany(selectionToken, selectedCompanyCode);

      if ('requiresTwoFactor' in result && result.requiresTwoFactor) {
        setTwoFactorData({
          loginTicket: result.loginTicket,
          methods: result.methods,
          twoFactorGracePeriod: result.twoFactorGracePeriod,
        });
        setStep('two-factor');
        return;
      }

      if ('requiresTwoFactorSetup' in result && result.requiresTwoFactorSetup) {
        setSetupToken(result.setupToken);
        setStep('two-factor-setup');
        return;
      }

      const user = result as any;
      const destination = user.redirectPath || getRoleRedirectPath(user);
      navigate(destination, { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Unable to sign in with selected company.');
    } finally {
      setLoading(false);
    }
  };

  // ── Company Chooser Step ────────────────────────────────────────────────────
  if (step === 'select-company') {
    return (
      <div className="space-y-6">
        <div>
          <button
            type="button"
            onClick={() => {
              setStep('login');
              setError('');
            }}
            className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 transition-colors mb-3 cursor-pointer"
          >
            <ArrowLeft size={16} />
            <span>Back to sign in</span>
          </button>
          <h1 className="text-[28px] font-bold text-slate-900 dark:text-white leading-tight">Select company</h1>
          <p className="text-[16px] text-slate-600 dark:text-slate-400 mt-2">
            Your account is associated with multiple companies. Select one to proceed.
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-[10px] bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-[14px] font-medium flex items-start gap-2.5" role="alert">
            <AlertCircle size={18} className="shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSelectCompanySubmit} className="space-y-4">
          <fieldset className="space-y-2.5">
            <legend className="sr-only">Select your company</legend>
            {companies.map((c) => (
              <label
                key={c.code}
                className={`flex items-center justify-between p-3.5 rounded-[10px] border cursor-pointer transition-colors ${
                  selectedCompanyCode === c.code
                    ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 dark:border-blue-500'
                    : 'border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="companyCodeRadio"
                    value={c.code}
                    checked={selectedCompanyCode === c.code}
                    onChange={() => setSelectedCompanyCode(c.code)}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="text-left">
                    <p className="text-[14px] font-semibold text-slate-900 dark:text-white">{c.name}</p>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 font-mono">Code: {c.code}</p>
                  </div>
                </div>
                <Building2 size={18} className="text-slate-400 shrink-0" />
              </label>
            ))}
          </fieldset>

          <button
            type="submit"
            disabled={loading || !selectedCompanyCode}
            className="w-full h-[48px] rounded-[10px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-600 dark:disabled:text-slate-400 disabled:cursor-not-allowed disabled:shadow-none text-[16px] font-semibold text-white shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus:ring-[3px] focus:ring-blue-500/30"
          >
            {loading ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <span>Continue</span>
            )}
          </button>
        </form>
      </div>
    );
  }

  // ── 2FA Step ────────────────────────────────────────────────────────────────
  if (step === 'two-factor' && twoFactorData) {
    return (
      <TwoFactorChallenge
        loginTicket={twoFactorData.loginTicket}
        allowedMethods={twoFactorData.methods}
        portal={portal}
        twoFactorGracePeriod={twoFactorData.twoFactorGracePeriod}
        onSuccess={(destination) => navigate(destination)}
        onBack={() => {
          setStep('login');
          setError('');
        }}
      />
    );
  }

  if (step === 'two-factor-setup') {
    return (
      <TwoFactorChallenge
        loginTicket=""
        allowedMethods={['totp']}
        portal={portal}
        forcedSetup={true}
        setupToken={setupToken}
        onSuccess={(destination) => navigate(destination)}
        onBack={() => {
          setStep('login');
          setError('');
        }}
      />
    );
  }

  // ── Primary Login Form Step ─────────────────────────────────────────────────
  const headingText = isPlatform ? 'Platform administration' : 'Sign in';
  const subtitleText = isPlatform
    ? 'Restricted access — authorized personnel only.'
    : 'Enter your credentials to access your account.';

  return (
    <div className="space-y-4">
      {/* Platform Cross-Link back to Company Login */}
      {isPlatform && (
        <div>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 transition-colors cursor-pointer"
          >
            <ArrowLeft size={16} />
            <span>Back to Company Sign In</span>
          </Link>
        </div>
      )}

      {/* Heading & Subtitle */}
      <div>
        <h1 className="text-[24px] sm:text-[26px] font-bold text-slate-900 dark:text-white leading-tight">
          {headingText}
        </h1>
        <p className="text-[14px] text-slate-600 dark:text-slate-400 mt-1.5">
          {subtitleText}
        </p>
      </div>

      {/* Cold Start Indicator */}
      {isWakingUp && (
        <div className="flex items-center gap-2 p-3 rounded-[10px] bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-[13px] animate-pulse">
          <Clock size={16} className="shrink-0 text-amber-600" />
          <span>Waking up the server, this can take up to a minute...</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate autoComplete="off" data-lpignore="true" className="space-y-3">
        {/* Form Error Banner (inside form) */}
        {error && (
          <div
            id={`${portal}-form-error`}
            className="p-3 rounded-[10px] bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-[13px] font-medium flex items-start gap-2.5"
            role="alert"
          >
            <AlertCircle size={18} className="shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
            <span>{error}</span>
          </div>
        )}
        {/* Company Code Field (Company Portal Only) - Placed Above Identifier */}
        {!isPlatform && (
          <div>
            <label
              htmlFor="company-code-input"
              className="block text-[13px] font-semibold text-slate-800 dark:text-slate-200 mb-1"
            >
              Company code (optional)
            </label>
            <div className="relative flex items-center">
              <Building2
                size={18}
                className="absolute left-[14px] text-slate-400 dark:text-slate-500 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="company-code-input"
                name="companyCode"
                type="text"
                autoComplete="organization"
                value={companyCode}
                onChange={(e) => {
                  setCompanyCode(e.target.value);
                  if (error) setError('');
                }}
                placeholder="e.g. ACME"
                className="w-full h-[44px] rounded-[10px] border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[15px] text-slate-900 dark:text-white pl-[42px] pr-4 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-[3px] focus:ring-blue-500/30 focus:border-blue-600 dark:focus:border-blue-500 transition-colors uppercase tracking-wider font-mono text-sm"
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Only needed if your email is used in more than one company
            </p>
          </div>
        )}

        {/* Identifier Field */}
        <div>
          <label
            htmlFor={`${portal}-identifier`}
            className="block text-[13px] font-semibold text-slate-800 dark:text-slate-200 mb-1"
          >
            Email or username
          </label>
          <div className="relative flex items-center">
            <Mail
              size={18}
              className="absolute left-[14px] text-slate-400 dark:text-slate-500 pointer-events-none"
              aria-hidden="true"
            />
            <input
              ref={identifierRef}
              id={`${portal}-identifier`}
              name="username"
              type="text"
              autoComplete="username"
              inputMode="email"
              autoFocus
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                if (error) setError('');
              }}
              aria-invalid={Boolean(error && !identifier.trim())}
              aria-describedby={error ? `${portal}-form-error` : undefined}
              placeholder="name@example.com or user ID"
              className="w-full h-[44px] rounded-[10px] border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[15px] text-slate-900 dark:text-white pl-[42px] pr-4 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-[3px] focus:ring-blue-500/30 focus:border-blue-600 dark:focus:border-blue-500 transition-colors"
              required
            />
          </div>
        </div>

        {/* Password Field */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label
              htmlFor={`${portal}-password`}
              className="text-[13px] font-semibold text-slate-800 dark:text-slate-200"
            >
              Password
            </label>
            <Link
              to={isPlatform ? '/forgot-password?portal=platform' : '/forgot-password'}
              className="text-[12px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative flex items-center">
            <Lock
              size={18}
              className="absolute left-[14px] text-slate-400 dark:text-slate-500 pointer-events-none"
              aria-hidden="true"
            />
            <input
              ref={passwordRef}
              id={`${portal}-password`}
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError('');
              }}
              onKeyDown={checkCapsLock}
              onKeyUp={checkCapsLock}
              aria-invalid={Boolean(error && !password)}
              aria-describedby={error ? `${portal}-form-error` : undefined}
              placeholder="••••••••••••"
              className="w-full h-[44px] rounded-[10px] border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[15px] text-slate-900 dark:text-white pl-[42px] pr-[42px] placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-[3px] focus:ring-blue-500/30 focus:border-blue-600 dark:focus:border-blue-500 transition-colors"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-1 w-[38px] h-[38px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {capsLockOn && (
            <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400" role="status">
              <AlertCircle size={13} />
              <span>Caps Lock is on</span>
            </div>
          )}
        </div>

        {/* Keep Me Signed In Checkbox */}
        <div className="pt-0.5">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={keepSignedIn}
              onChange={(e) => setKeepSignedIn(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 border-slate-300 dark:border-slate-700 focus:ring-blue-500 cursor-pointer"
            />
            <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
              Keep me signed in on this device
            </span>
          </label>
        </div>

        {/* Submit Button */}
        <div className="pt-1.5">
          <button
            type="submit"
            disabled={loading}
            className="w-full h-[44px] rounded-[10px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-600 dark:disabled:text-slate-400 disabled:cursor-not-allowed disabled:shadow-none text-[15px] font-semibold text-white shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus:ring-[3px] focus:ring-blue-500/30"
          >
            {loading ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <span>Sign in</span>
            )}
          </button>
        </div>
      </form>

      {/* Platform Cross-Link on Company Login */}
      {!isPlatform && (
        <div className="pt-2 text-center border-t border-slate-200 dark:border-slate-800/80">
          <Link
            to="/platform/login"
            className="text-[12px] font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          >
            Platform administration portal &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}
