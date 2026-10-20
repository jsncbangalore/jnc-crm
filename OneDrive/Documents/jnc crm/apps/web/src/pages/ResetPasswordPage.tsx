/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React from 'react';
import { motion } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import { ShieldCheck, ArrowRight, ArrowLeft, KeyRound, Building2, Shield } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const portalParam = searchParams.get('portal');
  const isPlatform = portalParam === 'platform';

  const forgotPasswordUrl = isPlatform ? '/forgot-password?portal=platform' : '/forgot-password';

  return (
    <AuthLayout>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full space-y-6"
      >
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            to={isPlatform ? '/platform/login' : '/login'}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#2563EB] hover:underline transition-colors"
          >
            <ArrowLeft size={14} />{' '}
            {isPlatform ? 'Back to Platform Login' : 'Back to Company Sign In'}
          </Link>
        </div>

        {/* Security Upgrade Notice Card */}
        <div className="p-6 rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 shadow-xs text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-950/50 text-[#2563EB] flex items-center justify-center mx-auto border border-blue-200 dark:border-blue-900/60">
            <KeyRound size={28} />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-100/70 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 text-[11px] font-bold uppercase tracking-wider">
              <ShieldCheck size={13} />
              <span>Security System Upgraded</span>
            </div>
            <h2 className="text-[22px] sm:text-[24px] font-bold text-slate-900 dark:text-white leading-tight">
              Email Links Replaced with OTP Verification
            </h2>
            <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed max-w-md mx-auto">
              For enhanced security and account protection, password reset links have been replaced with fast, single-use <strong>6-digit verification codes</strong> delivered directly to your registered email.
            </p>
          </div>

          <div className="pt-2 space-y-2.5">
            <Link
              to={forgotPasswordUrl}
              className="w-full h-11 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] focus:outline-none focus:ring-[3px] focus:ring-[#2563EB]/35 text-white text-[15px] font-semibold shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Request 6-Digit Verification Code</span>
              <ArrowRight size={16} />
            </Link>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <Link
                to="/login"
                className="h-10 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Building2 size={13} />
                <span>Company Login</span>
              </Link>
              <Link
                to="/platform/login"
                className="h-10 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Shield size={13} />
                <span>Platform Admin</span>
              </Link>
            </div>
          </div>
        </div>
      </motion.div>
    </AuthLayout>
  );
}
