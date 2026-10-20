/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import {
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Mail,
  ShieldAlert,
  Clock,
  Inbox,
  Building2,
  Shield,
  Eye,
  EyeOff,
  Check,
  Circle,
  KeyRound,
  ShieldCheck,
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

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPortal = searchParams.get('portal') === 'platform' ? 'platform' : 'company';

  // Step state: 1 = Email, 2 = 6-digit OTP, 3 = New Password, 4 = Success
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [activeTab, setActiveTab] = useState<'company' | 'platform'>(initialPortal);
  const [email, setEmail] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [senderEmail, setSenderEmail] = useState<string>('jayaraj@jsnc.co.in');

  // OTP inputs
  const [codeDigits, setCodeDigits] = useState<string[]>(['', '', '', '', '', '']);
  const codeInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Verification result
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
    { id: 'uppercase', label: 'At least one uppercase letter' },
    { id: 'lowercase', label: 'At least one lowercase letter' },
    { id: 'number', label: 'At least one number' },
    { id: 'special', label: 'At least one special character' },
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
        if (res.data?.senderEmail) setSenderEmail(res.data.senderEmail);
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

  const handleTabChange = (tab: 'company' | 'platform') => {
    setActiveTab(tab);
    setError('');
    if (tab === 'platform') {
      setSearchParams({ portal: 'platform' });
    } else {
      setSearchParams({});
    }
  };

  const maskEmail = (val: string) => {
    if (!val || !val.includes('@')) return val || 'your email';
    const [name, domain] = val.split('@');
    const masked = name.length <= 2 ? `${name}***` : `${name.slice(0, 3)}***`;
    return `${masked}@${domain}`;
  };

  // ─── Step 1: Request OTP Code ──────────────────────────────────────────────
  const handleRequestOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your registered email address.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await authApi.forgotPasswordRequest(email.trim());
      const resendAfter = res.data?.resendAfterSeconds ?? 60;
      setCooldown(resendAfter);
      setStep(2);
      // Auto-focus first digit box
      setTimeout(() => {
        codeInputsRef.current[0]?.focus();
      }, 100);
    } catch (err: any) {
      if (err.response?.status === 429) {
        setError('Too many attempts. Please wait before requesting another code.');
      } else if (!err?.response) {
        setError('Cannot reach the server. Check your connection and try again.');
      } else {
        const msg = err.response?.data?.message;
        setError(Array.isArray(msg) ? msg.join(', ') : msg || 'Unable to send code. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Step 2: Code Boxes Handlers ───────────────────────────────────────────
  const handleDigitChange = (index: number, val: string) => {
    const cleaned = val.replace(/\D/g, '');
    const newDigits = [...codeDigits];

    if (cleaned.length === 0) {
      newDigits[index] = '';
      setCodeDigits(newDigits);
      return;
    }

    // Single digit input
    newDigits[index] = cleaned.slice(-1);
    setCodeDigits(newDigits);

    // Auto-advance
    if (index < 5 && cleaned.length > 0) {
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
      const res = await authApi.forgotPasswordVerify(email.trim(), code);
      const { resetTicket: ticket, accounts: accts } = res.data;
      setResetTicket(ticket);
      setAccounts(accts || []);
      setSelectedAccountIds((accts || []).map((a: AccountItem) => a.accountId));
      setStep(3);
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
      const res = await authApi.forgotPasswordRequest(email.trim());
      const resendAfter = res.data?.resendAfterSeconds ?? 60;
      setCooldown(resendAfter);
      setCodeDigits(['', '', '', '', '', '']);
      codeInputsRef.current[0]?.focus();
    } catch (err: any) {
      setError('Unable to resend verification code. Please wait.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Step 3: Password Rules & Submission ───────────────────────────────────
  const evaluateRule = (ruleId: string, pwd: string): boolean => {
    if (!pwd) return false;
    switch (ruleId) {
      case 'minLength':
        return pwd.length >= 12;
      case 'uppercase':
        return /[A-Z]/.test(pwd);
      case 'lowercase':
        return /[a-z]/.test(pwd);
      case 'number':
        return /[0-9]/.test(pwd);
      case 'special':
        return /[^A-Za-z0-9]/.test(pwd);
      case 'notCommon':
        return pwd.length >= 12 && !/^(password|123456789012|admin12345678)$/i.test(pwd);
      default:
        return pwd.length >= 12;
    }
  };

  const isAllRulesSatisfied = policyRules.every((r) => evaluateRule(r.id, newPassword));
  const isPasswordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const handleAccountToggle = (accId: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(accId)
        ? prev.length > 1
          ? prev.filter((id) => id !== accId)
          : prev // keep at least 1 selected
        : [...prev, accId],
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
    if (selectedAccountIds.length === 0) {
      setError('Please select at least one account to reset.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await authApi.forgotPasswordReset(resetTicket, selectedAccountIds, newPassword);
      setStep(4);
    } catch (err: any) {
      if (!err?.response) {
        setError('Cannot reach the server. Check your connection.');
      } else {
        const msg = err.response?.data?.message;
        setError(Array.isArray(msg) ? msg.join(', ') : msg || 'Unable to reset password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full"
      >
        {/* Navigation Breadcrumb */}
        {step !== 4 && (
          <div className="mb-4 flex items-center justify-between">
            {step === 1 ? (
              <Link
                to={activeTab === 'platform' ? '/platform/login' : '/login'}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#2563EB] hover:underline transition-colors"
              >
                <ArrowLeft size={14} />{' '}
                {activeTab === 'platform' ? 'Back to Platform Login' : 'Back to Company Sign In'}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setStep((prev) => ((prev - 1) as any));
                }}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:text-[#2563EB] transition-colors cursor-pointer"
              >
                <ArrowLeft size={14} /> Back
              </button>
            )}

            {/* Step Counter Indicator */}
            <div className="text-[12px] font-semibold text-slate-400 dark:text-slate-500">
              Step {step} of 3
            </div>
          </div>
        )}

        {/* Portal Tabs (Only shown in Step 1) */}
        {step === 1 && (
          <div className="mb-5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleTabChange('company')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'company'
                  ? 'bg-white dark:bg-[#1E293B] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Building2 size={14} />
              <span>Company CRM</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('platform')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'platform'
                  ? 'bg-white dark:bg-[#1E293B] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Shield size={14} />
              <span>Platform admin</span>
            </button>
          </div>
        )}

        {/* Page Title */}
        {step !== 4 && (
          <div className="mb-5">
            <h2 className="text-[24px] sm:text-[26px] font-semibold text-slate-900 dark:text-white leading-tight">
              {step === 1 && 'Reset Password'}
              {step === 2 && 'Enter Verification Code'}
              {step === 3 && 'Create New Password'}
            </h2>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
              {step === 1 &&
                (activeTab === 'platform'
                  ? 'Enter your Platform Super-Admin email to receive a 6-digit code.'
                  : 'Enter the email address registered with your company account.')}
              {step === 2 && (
                <>
                  We sent a 6-digit verification code to <strong>{maskEmail(email)}</strong>.
                </>
              )}
              {step === 3 && 'Choose a strong, unique password for your account.'}
            </p>
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* ────────────────── STEP 1: EMAIL INPUT ────────────────── */}
          {step === 1 && (
            <motion.form
              key="step1"
              onSubmit={handleRequestOtp}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-4"
              noValidate
              autoComplete="off"
            >
              {/* Dynamic Sender Note */}
              <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/40 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2.5">
                <Mail size={16} className="shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                <div className="leading-relaxed text-[12px]">
                  Verification codes are sent from <strong>{senderEmail}</strong>. Please check your <strong>Inbox</strong> and <strong>Spam</strong> folder.
                </div>
              </div>

              {/* Email Input */}
              <div>
                <label
                  htmlFor="forgot-email"
                  className="block text-[14px] font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Email Address
                </label>
                <div className="relative">
                  <input
                    id="forgot-email"
                    name="jnc-identity"
                    type="email"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    className="w-full h-11 pl-10 pr-3.5 text-[15px] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#243049] rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#2563EB] focus:ring-[3px] focus:ring-[#2563EB]/25 transition-all"
                    placeholder="Enter your registered email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                  />
                  <Inbox size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </div>

              {/* Optional Company Code (Only on Company CRM Tab) */}
              {activeTab === 'company' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="forgot-company-code"
                      className="block text-[14px] font-medium text-slate-700 dark:text-slate-300"
                    >
                      Company Code <span className="text-xs text-slate-400 font-normal">(Optional)</span>
                    </label>
                  </div>
                  <input
                    id="forgot-company-code"
                    name="jnc-company"
                    type="text"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    className="w-full h-11 px-3.5 text-[15px] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#243049] rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#2563EB] focus:ring-[3px] focus:ring-[#2563EB]/25 transition-all uppercase"
                    placeholder="e.g. JSNC"
                    value={companyCode}
                    onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                  />
                </div>
              )}

              {/* Error Alert */}
              {error && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] dark:bg-red-950/40 dark:border-red-900/60 dark:text-red-300 text-[13px] font-medium flex items-center gap-2"
                >
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="w-full h-11 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] focus:outline-none focus:ring-[3px] focus:ring-[#2563EB]/35 text-white text-[15px] font-semibold shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" aria-hidden />
                    <span>Sending Code...</span>
                  </>
                ) : (
                  <span>Send Verification Code</span>
                )}
              </button>

              {/* Back links to both portals */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-3">
                <Link to="/login" className="font-medium text-[#2563EB] hover:underline">
                  Company Login (/login)
                </Link>
                <span>&bull;</span>
                <Link to="/platform/login" className="font-medium text-[#2563EB] hover:underline">
                  Platform Admin (/platform/login)
                </Link>
              </div>
            </motion.form>
          )}

          {/* ────────────────── STEP 2: 6-DIGIT OTP BOXES ────────────────── */}
          {step === 2 && (
            <motion.form
              key="step2"
              onSubmit={handleVerifyOtp}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-5"
            >
              {/* 6 Code Boxes */}
              <div className="flex items-center justify-between gap-2 sm:gap-2.5 my-2">
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
                    className="w-12 h-14 sm:w-14 sm:h-16 text-center text-[24px] sm:text-[28px] font-bold font-mono bg-white dark:bg-[#0F172A] border-2 border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-[#2563EB] focus:ring-[3px] focus:ring-[#2563EB]/25 transition-all shadow-xs"
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
                  Never share this code with anyone. Check your Spam folder if you don't see it in 1 minute.
                </p>
              </div>

              {/* Error Alert */}
              {error && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] dark:bg-red-950/40 dark:border-red-900/60 dark:text-red-300 text-[13px] font-medium flex items-center gap-2"
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
                className="w-full h-11 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] focus:outline-none focus:ring-[3px] focus:ring-[#2563EB]/35 text-white text-[15px] font-semibold shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" aria-hidden />
                    <span>Verifying Code...</span>
                  </>
                ) : (
                  <span>Verify Code</span>
                )}
              </button>

              {/* Resend and Email Switcher */}
              <div className="flex items-center justify-between text-xs pt-1 text-slate-500 dark:text-slate-400">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={cooldown > 0 || loading}
                  className="font-medium text-[#2563EB] hover:underline disabled:opacity-50 cursor-pointer"
                >
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setStep(1);
                  }}
                  className="hover:underline text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  Use a different email
                </button>
              </div>
            </motion.form>
          )}

          {/* ────────────────── STEP 3: NEW PASSWORD & ACCOUNT SELECTOR ────────────────── */}
          {step === 3 && (
            <motion.form
              key="step3"
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
                <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter at least 12 characters"
                    className="w-full h-11 px-3.5 pr-10 text-[14px] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#243049] rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#2563EB] focus:ring-[3px] focus:ring-[#2563EB]/25 transition-all"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-type your new password"
                    className="w-full h-11 px-3.5 pr-10 text-[14px] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#243049] rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#2563EB] focus:ring-[3px] focus:ring-[#2563EB]/25 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Live Password Policy Checklist */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 space-y-1.5">
                <div className="text-[12px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Password Requirements:
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
                  className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] dark:bg-red-950/40 dark:border-red-900/60 dark:text-red-300 text-[13px] font-medium flex items-center gap-2"
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
                className="w-full h-11 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] focus:outline-none focus:ring-[3px] focus:ring-[#2563EB]/35 text-white text-[15px] font-semibold shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" aria-hidden />
                    <span>Updating Password...</span>
                  </>
                ) : (
                  <span>Reset Password</span>
                )}
              </button>
            </motion.form>
          )}

          {/* ────────────────── STEP 4: SUCCESS CONFIRMATION ────────────────── */}
          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-4 py-2"
            >
              <div className="w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-md">
                <CheckCircle2 size={32} />
              </div>
              <div>
                <h3 className="text-[20px] font-bold text-slate-900 dark:text-white">
                  Password Reset Successfully!
                </h3>
                <p className="text-[13px] text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                  Your new password is now active. All previous sessions across all devices have been signed out for your security.
                </p>
              </div>

              <div className="pt-2">
                <Link
                  to={activeTab === 'platform' ? '/platform/login' : '/login'}
                  className="w-full h-11 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[14px] font-semibold flex items-center justify-center transition-colors shadow-xs"
                >
                  {activeTab === 'platform' ? 'Sign In to Platform Admin' : 'Sign In to Company CRM'}
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AuthLayout>
  );
}
