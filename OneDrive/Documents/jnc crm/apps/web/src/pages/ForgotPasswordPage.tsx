/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../services/api';
import { RefreshCw, AlertCircle, CheckCircle2, ArrowLeft, Mail, ShieldAlert, Clock, Inbox } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';

export default function ForgotPasswordPage() {
  const [searchParams] = useSearchParams();
  const portalParam = searchParams.get('portal');
  const isPlatform = portalParam === 'platform';

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Cooldown countdown effect
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const maskEmail = (val: string) => {
    if (!val || !val.includes('@')) return val || 'your email';
    const [name, domain] = val.split('@');
    const masked = name.length <= 2 ? `${name}***` : `${name.slice(0, 3)}***`;
    return `${masked}@${domain}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
      setCooldown(60); // 60s cooldown before resend
    } catch (err: any) {
      if (err.response?.status === 429) {
        setError('Too many password reset attempts. Please wait a few minutes before trying again.');
      } else if (
        !err?.response ||
        err.code === 'ERR_NETWORK' ||
        err.code === 'ECONNABORTED' ||
        err.message?.includes('Network Error')
      ) {
        setError('Cannot reach the server. Check your internet connection and try again.');
      } else {
        const rawMsg = err.response?.data?.message;
        const msg = Array.isArray(rawMsg) ? rawMsg.join(', ') : rawMsg || 'Unable to send reset link. Please try again.';
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || loading) return;
    await handleSubmit({ preventDefault: () => {} } as any);
  };

  const backLink = isPlatform ? '/platform/login' : '/login';
  const backLabel = isPlatform ? 'Back to Platform Administration' : 'Back to Company Sign In';

  return (
    <AuthLayout>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full"
      >
        {/* Navigation Breadcrumb */}
        <div className="mb-5 flex items-center justify-between">
          <Link
            to={backLink}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#2563EB] hover:underline transition-colors"
          >
            <ArrowLeft size={14} /> {backLabel}
          </Link>
          <span className="text-[11px] font-semibold tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {isPlatform ? 'Platform Super-Admin' : 'Company CRM'}
          </span>
        </div>

        {/* Page Title */}
        <div className="mb-6">
          <h2 className="text-[26px] sm:text-[28px] font-semibold text-slate-900 dark:text-white leading-tight">
            Reset Your Password
          </h2>
          <p className="text-[14px] text-slate-500 dark:text-slate-400 mt-1.5">
            {isPlatform
              ? 'Enter your Platform Super-Admin email to receive a secure recovery link.'
              : 'Enter the email registered with your company workspace to receive a reset link.'}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {sent ? (
            <motion.div
              key="sent"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              {/* Success Badge */}
              <div className="p-5 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-sm">
                  <CheckCircle2 size={26} />
                </div>
                <div>
                  <h3 className="text-[16px] font-bold text-emerald-900 dark:text-emerald-200">
                    Recovery Link Dispatched
                  </h3>
                  <p className="text-[13px] text-emerald-800 dark:text-emerald-300 mt-1">
                    If an active account exists for <strong>{maskEmail(email)}</strong>, a secure password reset link has been dispatched.
                  </p>
                </div>
              </div>

              {/* Crucial Spam & Sender Guidance */}
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-900 dark:text-amber-200 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
                  <ShieldAlert size={16} className="shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>Important: Check Spam & Promotions Folders</span>
                </div>
                <p className="leading-relaxed text-slate-700 dark:text-slate-300">
                  Emails are sent from <strong>jayaraj@jsnc.co.in</strong> (JNC CRM). Automated system messages are frequently routed into the <strong>Spam</strong> or <strong>Junk</strong> folder by Gmail and Outlook.
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  The recovery link expires in <strong>24 hours</strong>.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={cooldown > 0 || loading}
                  className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121622] text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {cooldown > 0 ? (
                    <>
                      <Clock size={15} />
                      <span>Resend available in {cooldown}s</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw size={15} />
                      <span>Didn't receive it? Send again</span>
                    </>
                  )}
                </button>

                <Link
                  to={backLink}
                  className="w-full h-11 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[14px] font-semibold shadow-xs transition-all flex items-center justify-center gap-2"
                >
                  <span>{backLabel}</span>
                </Link>
              </div>
            </motion.div>
          ) : (
            <motion.form key="form" onSubmit={handleSubmit} className="space-y-5" noValidate autoComplete="off">
              {/* Sender Transparency Info */}
              <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/40 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2.5">
                <Mail size={16} className="shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                <div className="leading-relaxed text-[12px]">
                  Password reset emails are delivered from <strong>jayaraj@jsnc.co.in</strong>. Make sure to check your <strong>Inbox</strong> and <strong>Spam</strong> folder.
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
                disabled={loading}
                aria-busy={loading}
                className="w-full h-11 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] focus:outline-none focus:ring-[3px] focus:ring-[#2563EB]/35 text-white text-[15px] font-semibold shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" aria-hidden />
                    <span>Dispatching Reset Link...</span>
                  </>
                ) : (
                  <span>Send Password Reset Link</span>
                )}
              </button>

              {/* Portal Switcher Footer */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
                <p>
                  Need to switch portals?{' '}
                  <Link
                    to={isPlatform ? '/forgot-password' : '/forgot-password?portal=platform'}
                    className="font-semibold text-[#2563EB] hover:underline"
                  >
                    {isPlatform ? 'Reset Company CRM Password' : 'Reset Platform Admin Password'}
                  </Link>
                </p>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </AuthLayout>
  );
}
