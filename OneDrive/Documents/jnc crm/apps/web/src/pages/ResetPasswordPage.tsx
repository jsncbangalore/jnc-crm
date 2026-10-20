/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import { Eye, EyeOff, RefreshCw, AlertCircle, CheckCircle2, ArrowLeft, Check, Circle, ShieldCheck } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';

interface PasswordRule {
  id: string;
  label: string;
}

interface PasswordPolicyData {
  minLength: number;
  maxLength: number;
  rules: PasswordRule[];
  senderEmail?: string;
}

// Client-side quick check list matching common obvious passwords
const COMMON_GUESSES = new Set([
  'password', 'password123', '123456789012', 'admin12345678', 'welcome12345',
  'administrator', 'qwertyuiop12', 'iloveyou1234', 'changeme1234', 'letmein12345',
  'jncnetwork123', 'crmadmin1234', 'company12345', 'supersecret1', 'passw0rd1234',
  '1234567890123', 'abcdefghijklm', '098765432112', 'pass12345678', 'system123456',
  'master123456', 'trustno11234', 'dragon123456', 'football1234', 'monkey123456'
]);

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const portalParam = searchParams.get('portal');
  const isPlatform = portalParam === 'platform';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // Dynamic policy loaded from GET /auth/password-policy
  const [policy, setPolicy] = useState<PasswordPolicyData>({
    minLength: 12,
    maxLength: 200,
    rules: [
      { id: 'minLength', label: 'Minimum 12 characters' },
      { id: 'notCommon', label: 'Cannot be a commonly guessed password' },
      { id: 'noPersonalInfo', label: 'Cannot contain parts of your name or email' }
    ]
  });

  useEffect(() => {
    let isMounted = true;
    authApi
      .getPasswordPolicy()
      .then((res) => {
        if (isMounted && res.data?.rules) {
          setPolicy(res.data);
        }
      })
      .catch(() => {
        // Fallback default rules remain active
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Evaluate rule adherence dynamically based on rules from server
  const evaluateRule = (ruleId: string, pwd: string): boolean => {
    if (!pwd) return false;
    if (ruleId === 'minLength') {
      return pwd.length >= (policy.minLength || 12);
    }
    if (ruleId === 'notCommon') {
      const lower = pwd.toLowerCase();
      const letters = lower.replace(/[^a-z]/g, '');
      return pwd.length >= 12 && !COMMON_GUESSES.has(lower) && !COMMON_GUESSES.has(letters);
    }
    if (ruleId === 'noPersonalInfo') {
      return pwd.length >= 12;
    }
    // Generic fallback for any other server-provided rule
    return pwd.length >= (policy.minLength || 12);
  };

  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const isMinLengthSatisfied = newPassword.length >= (policy.minLength || 12);
  const allRulesSatisfied = policy.rules.every((r) => evaluateRule(r.id, newPassword));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Reset token is missing from the URL. Please request a new link.');
      return;
    }
    if (!isMinLengthSatisfied) {
      setError(`Password must be at least ${policy.minLength || 12} characters in length.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPassword(token, newPassword);
      setDone(true);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'The reset link is invalid or has expired. Please request a new one.';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setLoading(false);
    }
  };

  const targetLoginPath = isPlatform ? '/platform/login' : '/login';
  const targetLoginLabel = isPlatform ? 'Sign In to Platform Admin' : 'Sign In to Company CRM';

  return (
    <AuthLayout>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full"
      >
        <div className="mb-5">
          <Link
            to={targetLoginPath}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#2563EB] hover:underline transition-colors"
          >
            <ArrowLeft size={14} /> Back to Sign In
          </Link>
        </div>

        <div className="mb-6">
          <h2 className="text-[26px] sm:text-[28px] font-semibold text-slate-900 dark:text-white leading-tight">
            Create New Password
          </h2>
          <p className="text-[14px] text-slate-500 dark:text-slate-400 mt-1">
            Choose a strong, unique password to secure your account.
          </p>
        </div>

        <AnimatePresence mode="wait">
          {done ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-5 text-center py-2"
            >
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mx-auto shadow-sm">
                <CheckCircle2 size={32} />
              </div>

              <div>
                <h3 className="text-[18px] font-bold text-slate-900 dark:text-white">
                  Password Reset Complete
                </h3>
                <p className="text-[13px] text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  Your password has been securely updated and all previous sessions have been logged out.
                </p>
              </div>

              {/* Primary button to right login page */}
              <div className="pt-2 space-y-2.5">
                <button
                  type="button"
                  onClick={() => navigate(targetLoginPath)}
                  className="w-full h-11 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[14px] font-semibold shadow-sm transition-all flex items-center justify-center cursor-pointer"
                >
                  <span>{targetLoginLabel} &rarr;</span>
                </button>

                <div className="text-center">
                  <Link
                    to={isPlatform ? '/login' : '/platform/login'}
                    className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                  >
                    {isPlatform ? 'Go to Company CRM Login instead' : 'Go to Platform Super-Admin Login instead'}
                  </Link>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.form key="form" onSubmit={handleSubmit} className="space-y-4" noValidate autoComplete="off">
              {/* New Password */}
              <div>
                <label
                  htmlFor="new-password"
                  className="block text-[14px] font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    name="jnc-new-secret"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={policy.minLength || 12}
                    className="w-full h-11 px-3.5 pr-12 text-[15px] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#243049] rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#2563EB] focus:ring-[3px] focus:ring-[#2563EB]/25 transition-all"
                    placeholder={`At least ${policy.minLength || 12} characters`}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoFocus
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
              </div>

              {/* Confirm Password */}
              <div>
                <label
                  htmlFor="confirm-password"
                  className="block text-[14px] font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    id="confirm-password"
                    name="jnc-confirm-secret"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    className="w-full h-11 px-3.5 pr-12 text-[15px] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#243049] rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#2563EB] focus:ring-[3px] focus:ring-[#2563EB]/25 transition-all"
                    placeholder="Repeat new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="w-10 h-10 flex items-center justify-center absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {/* Password match check */}
                {confirmPassword.length > 0 && (
                  <p
                    className={`text-[12px] font-medium mt-1.5 flex items-center gap-1.5 ${
                      passwordsMatch
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {passwordsMatch ? (
                      <>
                        <Check size={14} />
                        <span>Passwords match</span>
                      </>
                    ) : (
                      <span>✕ Passwords do not match</span>
                    )}
                  </p>
                )}
              </div>

              {/* Live Checklist from GET /auth/password-policy */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-[#2563EB]" />
                  <span>Password requirements</span>
                </div>
                <div className="space-y-1.5">
                  {policy.rules.map((rule) => {
                    const isPassed = evaluateRule(rule.id, newPassword);
                    return (
                      <div
                        key={rule.id}
                        className={`flex items-center gap-2 text-[12px] transition-colors ${
                          isPassed
                            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {isPassed ? (
                          <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />
                        ) : (
                          <Circle size={14} className="shrink-0 text-slate-400 dark:text-slate-600" />
                        )}
                        <span>{rule.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Error Alert */}
              {error && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] dark:bg-red-950/40 dark:border-red-900/60 dark:text-red-300 text-[13px] font-medium flex items-center gap-2"
                >
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || !isMinLengthSatisfied || !passwordsMatch}
                aria-busy={loading}
                className="w-full h-11 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] focus:outline-none focus:ring-[3px] focus:ring-[#2563EB]/35 text-white text-[15px] font-semibold shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" aria-hidden />
                    <span>Updating password...</span>
                  </>
                ) : (
                  <span>Reset password</span>
                )}
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </AuthLayout>
  );
}
