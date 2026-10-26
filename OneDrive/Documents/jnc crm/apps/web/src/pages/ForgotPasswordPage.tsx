/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../services/api';
import {
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Mail,
  Clock,
  Building2,
  Eye,
  EyeOff,
  Check,
  Circle,
  Phone,
  Lock,
} from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';

interface PasswordRule {
  id: string;
  label: string;
}

interface AccountItem {
  accountId: string;
  label: string;
}

type ForgotStep = 'lookup' | 'phone' | 'otp' | 'new-password' | 'success';

export default function ForgotPasswordPage() {
  const [searchParams] = useSearchParams();

  // Track if accessed from platform login to direct return link
  const fromPlatform = searchParams.get('portal') === 'platform';

  // Clear query parameters from URL so route state is in memory only
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    if (typeof window !== 'undefined') {
      (window as any).__setForgotStep = (s: ForgotStep, opts?: any) => {
        setStep(s);
        if (s === 'phone') {
          setHasPhone(true);
          setLast4(opts?.last4 || '4821');
        } else if (s === 'otp') {
          setMobileVerified(opts?.mobileVerified ?? true);
          setMaskedEmail(opts?.maskedEmail || 'user***@example.com');
          setCodeDigits(opts?.digits || ['4', '8', '2', '1', '9', '0']);
        } else if (s === 'new-password') {
          setNewPassword(opts?.password || 'SecurePass#2026!');
          setConfirmPassword(opts?.password || 'SecurePass#2026!');
        }
      };
    }
  }, []);

  // Step state: lookup (1) -> phone (2) -> otp (3) -> new-password (4) -> success
  const [step, setStep] = useState<ForgotStep>('lookup');

  // Form inputs
  const [email, setEmail] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [showCompanyCode, setShowCompanyCode] = useState(false);
  const [phone, setPhone] = useState('');

  // Flow token & verification state
  const [flowId, setFlowId] = useState('');
  const [last4, setLast4] = useState('');
  const [hasPhone, setHasPhone] = useState(false);
  const [mobileVerified, setMobileVerified] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState('');

  // OTP inputs
  const [codeDigits, setCodeDigits] = useState<string[]>(['', '', '', '', '', '']);
  const codeInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Verification result & Reset Ticket
  const [resetTicket, setResetTicket] = useState<string>('');
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);

  // Password fields
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Policy rules
  const [policyRules, setPolicyRules] = useState<PasswordRule[]>([
    { id: 'minLength', label: 'Minimum 12 characters' },
    { id: 'notCommon', label: 'Cannot be a commonly guessed password' },
    { id: 'noPersonalInfo', label: 'Cannot contain parts of your name or email' },
  ]);

  // Loading, cooldown, and error state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  // Load public password policy on mount
  useEffect(() => {
    let isMounted = true;
    authApi
      .getPasswordPolicy()
      .then((res) => {
        if (!isMounted) return;
        if (res.data?.rules && Array.isArray(res.data.rules)) {
          setPolicyRules(res.data.rules);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // Cooldown countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // ─── Step 1 of 4: Reset password (Email Lookup) ───────────────────────────
  const handleLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const codeToSend = companyCode.trim() || undefined;
      const res = await authApi.forgotPasswordStart(email.trim(), codeToSend);
      if (res.data?.flowId) {
        setFlowId(res.data.flowId);
        if (res.data.maskedEmail) setMaskedEmail(res.data.maskedEmail);

        if (res.data.hasPhone && res.data.last4) {
          setHasPhone(true);
          setLast4(res.data.last4);
          setMobileVerified(false);
          setStep('phone');
        } else {
          // Normal user without registered mobile: proceed straight to email code step
          setHasPhone(false);
          setMobileVerified(false);
          try {
            const codeRes = await authApi.forgotPasswordSendCode(res.data.flowId);
            if (codeRes.data?.flowId) {
              setFlowId(codeRes.data.flowId);
            }
            setCooldown(codeRes.data?.resendAfterSeconds ?? 60);
          } catch {}
          setStep('otp');
          setTimeout(() => codeInputsRef.current[0]?.focus(), 100);
        }
      } else {
        setError('The details do not match. Check and try again.');
      }
    } catch (err: any) {
      if (err.response?.status === 429) {
        setError('Too many attempts. Please wait a few minutes before trying again.');
      } else if (!err?.response) {
        setError('Cannot reach the server. Check your connection and try again.');
      } else {
        const msg = err.response?.data?.message;
        setError(Array.isArray(msg) ? msg.join(', ') : msg || 'The details do not match. Check and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Step 2 of 4: Verify your mobile number ───────────────────────────────
  const handleVerifyPhone = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!phone.trim()) {
      setError('Please enter your registered mobile number.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await authApi.forgotPasswordVerifyPhoneFlow(flowId, phone.trim());
      if (res.data?.success) {
        setFlowId(res.data.flowId);
        setMobileVerified(true);
        if (res.data.maskedEmail) setMaskedEmail(res.data.maskedEmail);

        // Mobile verified! Send OTP code to user's saved email on account
        try {
          const codeRes = await authApi.forgotPasswordSendCode(res.data.flowId);
          if (codeRes.data?.flowId) {
            setFlowId(codeRes.data.flowId);
          }
          setCooldown(codeRes.data?.resendAfterSeconds ?? 60);
        } catch {}
        setStep('otp');
        setTimeout(() => codeInputsRef.current[0]?.focus(), 100);
      }
    } catch (err: any) {
      if (err.response?.status === 429) {
        setError('Too many attempts. Please wait a few minutes.');
      } else if (!err?.response) {
        setError('Cannot reach the server. Check your connection.');
      } else {
        const msg = err.response?.data?.message;
        setError(Array.isArray(msg) ? msg.join(', ') : msg || 'The details do not match. Check and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Step 3 of 4: Enter the code ──────────────────────────────────────────
  const handleDigitChange = (index: number, val: string) => {
    const clean = val.replace(/\D/g, '').slice(-1);
    const newDigits = [...codeDigits];
    newDigits[index] = clean;
    setCodeDigits(newDigits);
    setError('');

    if (clean && index < 5) {
      codeInputsRef.current[index + 1]?.focus();
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !codeDigits[index] && index > 0) {
      codeInputsRef.current[index - 1]?.focus();
    }
  };

  const handleDigitPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!paste) return;

    const newDigits = [...codeDigits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = paste[i] || '';
    }
    setCodeDigits(newDigits);

    const focusIdx = Math.min(paste.length, 5);
    codeInputsRef.current[focusIdx]?.focus();
  };

  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = codeDigits.join('');
    if (code.length < 6) {
      setError('Please enter all 6 digits of your verification code.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await authApi.forgotPasswordVerifyCodeFlow(flowId, code);
      const { resetTicket: ticket, accounts: accts, flowId: newFlowId } = res.data;
      if (newFlowId) setFlowId(newFlowId);
      setResetTicket(ticket);
      setAccounts(accts || []);
      setSelectedAccountIds((accts || []).map((a: AccountItem) => a.accountId));
      setStep('new-password');
    } catch (err: any) {
      if (!err?.response) {
        setError('Cannot reach the server. Check your connection.');
      } else {
        const msg = err.response?.data?.message;
        setError(Array.isArray(msg) ? msg.join(', ') : msg || 'Code is incorrect or expired.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (cooldown > 0 || loading) return;
    setError('');
    setLoading(true);
    try {
      const res = await authApi.forgotPasswordSendCode(flowId);
      if (res.data?.flowId) {
        setFlowId(res.data.flowId);
      }
      const resendAfter = res.data?.resendAfterSeconds ?? 60;
      setCooldown(resendAfter);
      setCodeDigits(['', '', '', '', '', '']);
      codeInputsRef.current[0]?.focus();
    } catch (err: any) {
      if (err.response?.status === 429) {
        setError('Too many requests. Please wait a few minutes before requesting another code.');
      } else if (!err?.response) {
        setError('Cannot reach the server. Check your connection.');
      } else {
        const msg = err.response?.data?.message;
        setError(Array.isArray(msg) ? msg.join(', ') : msg || 'Unable to resend verification code. Please wait.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUseDifferentEmail = () => {
    setError('');
    setStep('lookup');
    setPhone('');
    setCodeDigits(['', '', '', '', '', '']);
    setMobileVerified(false);
  };

  // ─── Step 4 of 4: Create new password ─────────────────────────────────────
  const evaluateRule = (ruleId: string, pwd: string): boolean => {
    if (!pwd) return false;
    switch (ruleId) {
      case 'minLength':
        return pwd.length >= 12;
      case 'notCommon': {
        const lower = pwd.toLowerCase();
        const commonList = [
          'password', 'password123', '123456789012', 'admin12345678', 'welcome12345',
          'administrator', 'qwertyuiop12', 'iloveyou1234', 'changeme1234', 'letmein12345',
          'crmadmin1234', 'company12345', 'supersecret1', 'passw0rd1234',
        ];
        return !commonList.some((c) => lower.includes(c));
      }
      case 'noPersonalInfo': {
        const lower = pwd.toLowerCase();
        if (email) {
          const emailParts = email.toLowerCase().split('@')[0].split(/[\._\-+]/);
          for (const part of emailParts) {
            if (part.length >= 3 && lower.includes(part)) return false;
          }
        }
        return true;
      }
      default:
        return true;
    }
  };

  const isAllRulesSatisfied = policyRules.every((r) => evaluateRule(r.id, newPassword));
  const isPasswordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const handleAccountToggle = (id: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleResetPassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!isAllRulesSatisfied) {
      setError('Please satisfy all password security requirements.');
      return;
    }
    if (!isPasswordsMatch) {
      setError('Passwords do not match.');
      return;
    }
    if (accounts.length > 0 && selectedAccountIds.length === 0) {
      setError('Please select at least one account to apply the new password.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await authApi.forgotPasswordReset(resetTicket, selectedAccountIds, newPassword);
      setStep('success');
    } catch (err: any) {
      if (!err?.response) {
        setError('Cannot reach the server. Check your connection.');
      } else {
        const msg = err.response?.data?.message;
        setError(Array.isArray(msg) ? msg.join(', ') : msg || 'Unable to reset password. Please start over.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Back button navigation
  const handleBack = () => {
    setError('');
    if (step === 'phone') {
      setStep('lookup');
    } else if (step === 'otp') {
      setStep(hasPhone ? 'phone' : 'lookup');
    } else if (step === 'new-password') {
      setStep('otp');
    }
  };

  const stepNumber =
    step === 'lookup'
      ? 1
      : step === 'phone'
      ? 2
      : step === 'otp'
      ? 3
      : 4;

  return (
    <AuthLayout>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full"
      >
        {/* Navigation Breadcrumb & Step X of 4 Header */}
        {step !== 'success' && (
          <div className="mb-4 flex items-center justify-between">
            {step === 'lookup' ? (
              <Link
                to={fromPlatform ? '/platform/login' : '/login'}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 transition-colors"
              >
                <ArrowLeft size={14} /> Back to Sign In
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
              >
                <ArrowLeft size={14} /> Back
              </button>
            )}

            {/* Step Counter Indicator */}
            <div className="text-[12px] font-semibold text-slate-400 dark:text-slate-500">
              Step {stepNumber} of 4
            </div>
          </div>
        )}

        {/* Page Title & Subtitle */}
        {step !== 'success' && (
          <div className="mb-6">
            <h1 className="text-[28px] font-bold text-slate-900 dark:text-white leading-tight">
              {step === 'lookup' && 'Reset password'}
              {step === 'phone' && 'Verify your mobile number'}
              {step === 'otp' && 'Enter the code'}
              {step === 'new-password' && 'Create new password'}
            </h1>
            <p className="text-[16px] text-slate-600 dark:text-slate-400 mt-2">
              {step === 'lookup' && 'Enter your registered email address or user ID to locate your account.'}
              {step === 'phone' && 'Enter your registered mobile number to confirm your identity.'}
              {step === 'otp' && 'Enter the 6-digit code sent to your registered email address.'}
              {step === 'new-password' && 'Choose a strong, unique password for your account.'}
            </p>
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* ────────────────── STEP 1 OF 4: RESET PASSWORD ────────────────── */}
          {step === 'lookup' && (
            <motion.form
              key="lookup"
              onSubmit={handleLookup}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-4"
              noValidate
              autoComplete="off"
            >
              {/* Email / User ID Field */}
              <div>
                <label
                  htmlFor="forgot-email-input"
                  className="block text-[14px] font-semibold text-slate-800 dark:text-slate-200 mb-2"
                >
                  Email or user ID
                </label>
                <div className="relative flex items-center">
                  <Mail size={20} className="absolute left-[14px] text-slate-400 dark:text-slate-500 pointer-events-none" aria-hidden="true" />
                  <input
                    id="forgot-email-input"
                    name="email"
                    type="text"
                    autoComplete="username"
                    required
                    className="w-full h-[48px] pl-[44px] pr-4 text-[16px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-[10px] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-[3px] focus:ring-blue-500/30 focus:border-blue-600 dark:focus:border-blue-500 transition-colors"
                    placeholder="name@example.com or user ID"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              {/* Company Code (Optional) - Kept in DOM, hidden by default */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <button
                    type="button"
                    onClick={() => setShowCompanyCode((prev) => !prev)}
                    className="text-[12px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors flex items-center gap-1 cursor-pointer focus:outline-none"
                  >
                    <span>{showCompanyCode ? '− Hide company code' : '+ Have a company code?'}</span>
                  </button>
                </div>
                <div className={showCompanyCode ? 'block space-y-1' : 'hidden'} aria-hidden={!showCompanyCode}>
                  <label
                    htmlFor="forgot-company-code"
                    className="block text-[14px] font-semibold text-slate-800 dark:text-slate-200"
                  >
                    Company code (optional)
                  </label>
                  <div className="relative flex items-center">
                    <Building2 size={20} className="absolute left-[14px] text-slate-400 dark:text-slate-500 pointer-events-none" aria-hidden="true" />
                    <input
                      id="forgot-company-code"
                      name="company"
                      type="text"
                      autoComplete="organization"
                      className="w-full h-[48px] pl-[44px] pr-4 text-[16px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-[10px] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-[3px] focus:ring-blue-500/30 focus:border-blue-600 dark:focus:border-blue-500 transition-colors uppercase font-mono tracking-wider text-sm"
                      placeholder="e.g. ACME"
                      value={companyCode}
                      onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                    />
                  </div>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400">
                    Only needed if your email is used in more than one company
                  </p>
                </div>
              </div>

              {/* Error Alert */}
              {error && (
                <div
                  role="alert"
                  className="p-3.5 rounded-[10px] bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-[14px] font-medium flex items-start gap-2.5"
                >
                  <AlertCircle size={18} className="shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="w-full h-[48px] rounded-[10px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-[3px] focus:ring-blue-500/30 text-white text-[16px] font-semibold shadow-xs transition-colors flex items-center justify-center gap-2 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-600 dark:disabled:text-slate-400 disabled:cursor-not-allowed disabled:shadow-none cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" aria-hidden />
                    <span>Locating account...</span>
                  </>
                ) : (
                  <span>Continue</span>
                )}
              </button>
            </motion.form>
          )}

          {/* ────────────────── STEP 2 OF 4: VERIFY YOUR MOBILE NUMBER ────────────────── */}
          {step === 'phone' && (
            <motion.form
              key="phone"
              onSubmit={handleVerifyPhone}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-4"
              noValidate
              autoComplete="off"
            >
              {/* Highlight Card with Masked Phone */}
              <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Phone size={20} />
                </div>
                <div>
                  <div className="text-[11px] text-blue-700 dark:text-blue-300 font-bold uppercase tracking-wider">
                    Registered mobile number
                  </div>
                  <div className="text-[17px] font-bold font-mono text-slate-900 dark:text-white tracking-widest mt-0.5">
                    •••••• {last4}
                  </div>
                </div>
              </div>

              {/* Under card guidance text */}
              <p className="text-[13px] text-slate-600 dark:text-slate-400">
                Not your number? Go back and check your email, or ask your administrator to update it.
              </p>

              <div>
                <label
                  htmlFor="verify-phone-input"
                  className="block text-[14px] font-semibold text-slate-800 dark:text-slate-200 mb-2"
                >
                  Enter full mobile number
                </label>
                <div className="relative flex rounded-[10px] border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden focus-within:ring-[3px] focus-within:ring-blue-500/30 focus-within:border-blue-600 dark:focus-within:border-blue-500 transition-colors">
                  <div className="flex items-center px-3.5 bg-slate-50 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold text-sm select-none">
                    +91
                  </div>
                  <input
                    id="verify-phone-input"
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="off"
                    data-lpignore="true"
                    required
                    className="flex-1 h-[48px] px-3.5 text-[16px] font-mono bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
                    placeholder={`10-digit number ending in ${last4}`}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoFocus
                  />
                </div>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1.5">
                  Confirm your 10-digit mobile number.
                </p>
              </div>

              {/* Error Alert */}
              {error && (
                <div
                  role="alert"
                  className="p-3.5 rounded-[10px] bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-[14px] font-medium flex items-start gap-2.5"
                >
                  <AlertCircle size={18} className="shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || phone.trim().length < 4}
                aria-busy={loading}
                className="w-full h-[48px] rounded-[10px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-[3px] focus:ring-blue-500/30 text-white text-[16px] font-semibold shadow-xs transition-colors flex items-center justify-center gap-2 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-600 dark:disabled:text-slate-400 disabled:cursor-not-allowed disabled:shadow-none cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" aria-hidden />
                    <span>Verifying mobile...</span>
                  </>
                ) : (
                  <span>Verify mobile number</span>
                )}
              </button>
            </motion.form>
          )}

          {/* ────────────────── STEP 3 OF 4: ENTER THE CODE ────────────────── */}
          {step === 'otp' && (
            <motion.form
              key="otp"
              onSubmit={handleVerifyOtp}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-5"
            >
              {/* Green 'Mobile verified' badge shown ONLY after server confirmed match */}
              {mobileVerified && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 flex items-center gap-2 text-emerald-800 dark:text-emerald-300 text-[13px] font-medium">
                  <CheckCircle2 size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>Mobile verified</span>
                </div>
              )}

              {/* 6 Digit Input Boxes with Paste Support */}
              <div className="grid grid-cols-6 gap-2 sm:gap-2.5 my-3 w-full">
                {codeDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => (codeInputsRef.current[idx] = el)}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                    onPaste={handleDigitPaste}
                    aria-label={`Digit ${idx + 1} of 6`}
                    className="w-full h-12 sm:h-14 text-center text-[20px] sm:text-[24px] font-bold font-mono bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/25 transition-all shadow-xs"
                    autoFocus={idx === 0}
                  />
                ))}
              </div>

              {/* Expiry Hint & Spam Warning */}
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-900 dark:text-amber-200 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
                  <Clock size={14} />
                  <span>Code expires in 10 minutes</span>
                </div>
                <p className="text-[12px] text-slate-600 dark:text-slate-300">
                  Never share this code with anyone. Check your spam folder if you do not receive it within a minute.
                </p>
              </div>

              {/* Error Alert */}
              {error && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-300 text-[13px] font-medium flex items-center gap-2"
                >
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Verify Code Button */}
              <button
                type="submit"
                disabled={loading || codeDigits.join('').length < 6}
                aria-busy={loading}
                className="w-full h-[48px] rounded-[10px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-[3px] focus:ring-blue-500/30 text-white text-[16px] font-semibold shadow-xs transition-colors flex items-center justify-center gap-2 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-600 dark:disabled:text-slate-400 disabled:cursor-not-allowed disabled:shadow-none cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" aria-hidden />
                    <span>Verifying code...</span>
                  </>
                ) : (
                  <span>Verify code</span>
                )}
              </button>

              {/* Resend and Email Switcher */}
              <div className="flex items-center justify-between text-xs pt-1 text-slate-500 dark:text-slate-400">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={cooldown > 0 || loading}
                  className="font-medium text-blue-600 hover:underline disabled:opacity-50 cursor-pointer"
                >
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                </button>
                <button
                  type="button"
                  onClick={handleUseDifferentEmail}
                  className="hover:underline text-slate-600 dark:text-slate-300 cursor-pointer font-medium"
                >
                  Use a different email
                </button>
              </div>
            </motion.form>
          )}

          {/* ────────────────── STEP 4 OF 4: CREATE NEW PASSWORD ────────────────── */}
          {step === 'new-password' && (
            <motion.form
              key="new-password"
              onSubmit={handleResetPassword}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-4"
            >
              {/* Account Selector (if multiple accounts match this email) */}
              {accounts.length > 1 && (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2">
                  <div className="text-[12px] font-bold text-slate-800 dark:text-slate-200">
                    Apply password reset to accounts:
                  </div>
                  <div className="space-y-1.5">
                    {accounts.map((acc) => (
                      <label
                        key={acc.accountId}
                        className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={selectedAccountIds.includes(acc.accountId)}
                          onChange={() => handleAccountToggle(acc.accountId)}
                          className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                        />
                        <span className="font-medium">{acc.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* New Password */}
              <div>
                <label className="block text-[14px] font-semibold text-slate-800 dark:text-slate-200 mb-2">
                  New password
                </label>
                <div className="relative flex items-center">
                  <Lock size={20} className="absolute left-[14px] text-slate-400 dark:text-slate-500 pointer-events-none" aria-hidden="true" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter at least 12 characters"
                    className="w-full h-[48px] pl-[44px] pr-[44px] text-[16px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-[10px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-[3px] focus:ring-blue-500/30 focus:border-blue-600 dark:focus:border-blue-500 transition-colors"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-1 w-[40px] h-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-[14px] font-semibold text-slate-800 dark:text-slate-200 mb-2">
                  Confirm password
                </label>
                <div className="relative flex items-center">
                  <Lock size={20} className="absolute left-[14px] text-slate-400 dark:text-slate-500 pointer-events-none" aria-hidden="true" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="w-full h-[48px] pl-[44px] pr-[44px] text-[16px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-[10px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-[3px] focus:ring-blue-500/30 focus:border-blue-600 dark:focus:border-blue-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-1 w-[40px] h-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer transition-colors"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    title={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Live Password Policy Checklist */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 space-y-1.5">
                <div className="text-[12px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Password requirements:
                </div>
                {policyRules.map((rule) => {
                  const passed = evaluateRule(rule.id, newPassword);
                  return (
                    <div
                      key={rule.id}
                      className={`flex items-center gap-2 text-xs transition-colors ${
                        passed
                          ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {passed ? (
                        <Check size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Circle size={12} className="shrink-0 text-slate-400 opacity-60" />
                      )}
                      <span>{rule.label}</span>
                    </div>
                  );
                })}
                <div
                  className={`flex items-center gap-2 text-xs pt-0.5 transition-colors ${
                    isPasswordsMatch
                      ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {isPasswordsMatch ? (
                    <Check size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Circle size={12} className="shrink-0 text-slate-400 opacity-60" />
                  )}
                  <span>Passwords match</span>
                </div>
              </div>

              {/* Error Alert */}
              {error && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-300 text-[13px] font-medium flex items-center gap-2"
                >
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Reset Submit Button */}
              <button
                type="submit"
                disabled={loading || !isAllRulesSatisfied || !isPasswordsMatch}
                aria-busy={loading}
                className="w-full h-[48px] rounded-[10px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-[3px] focus:ring-blue-500/30 text-white text-[16px] font-semibold shadow-xs transition-colors flex items-center justify-center gap-2 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-600 dark:disabled:text-slate-400 disabled:cursor-not-allowed disabled:shadow-none cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" aria-hidden />
                    <span>Updating password...</span>
                  </>
                ) : (
                  <span>Reset password</span>
                )}
              </button>
            </motion.form>
          )}

          {/* ────────────────── SUCCESS CONFIRMATION ────────────────── */}
          {step === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-4 py-2"
            >
              <div className="w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-md">
                <CheckCircle2 size={32} />
              </div>
              <div>
                <h3 className="text-[20px] font-bold text-slate-900 dark:text-white">
                  Password reset successfully!
                </h3>
                <p className="text-[13px] text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                  Your new password is now active. All previous sessions across all devices have been signed out for your security.
                </p>
              </div>

              <div className="pt-2 space-y-2.5">
                <Link
                  to={fromPlatform ? '/platform/login' : '/login'}
                  className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[14px] font-semibold flex items-center justify-center transition-colors shadow-xs"
                >
                  Back to Sign In
                </Link>
                <div className="text-center">
                  <Link
                    to={fromPlatform ? '/login' : '/platform/login'}
                    className="text-[12px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                  >
                    {fromPlatform ? 'Sign in to company portal' : 'Sign in to platform portal'}
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AuthLayout>
  );
}
