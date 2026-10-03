/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { authApi } from '../services/api';
import { RefreshCw, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
    } catch (err: any) {
      // Server always returns 200, so any error here is a network issue
      setError('Unable to send reset link. Please try again.');
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
        <div className="mb-5">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#2563EB] hover:underline transition-colors"
          >
            <ArrowLeft size={14} /> Back to sign in
          </Link>
        </div>

        <div className="mb-6">
          <h2 className="text-[28px] font-semibold text-slate-900 dark:text-white leading-tight">
            Forgot password?
          </h2>
          <p className="text-[14px] text-slate-500 dark:text-slate-400 mt-1">
            Enter your email and we'll send a reset link if the account exists.
          </p>
        </div>

        <AnimatePresence mode="wait">
          {sent ? (
            <motion.div
              key="sent"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3 py-4 text-center"
            >
              <div className="w-12 h-12 rounded-full bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 flex items-center justify-center text-green-600 dark:text-green-400">
                <CheckCircle size={24} />
              </div>
              <p className="text-[14px] font-medium text-slate-700 dark:text-slate-300">
                If that email is registered, a reset link has been sent. Check your inbox.
              </p>
              <Link to="/login" className="mt-2 text-[13px] font-medium text-[#2563EB] hover:underline">
                Back to sign in
              </Link>
            </motion.div>
          ) : (
            <motion.form key="form" onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div>
                <label
                  htmlFor="forgot-email"
                  className="block text-[14px] font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Email
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  required
                  className="w-full h-11 px-3.5 text-[16px] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#243049] rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#2563EB] focus:ring-[3px] focus:ring-[#2563EB]/25 transition-all"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                />
              </div>

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

              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="w-full h-11 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] focus:outline-none focus:ring-[3px] focus:ring-[#2563EB]/35 text-white text-[15px] font-semibold shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" aria-hidden />
                    <span>Sending...</span>
                  </>
                ) : (
                  <span>Send reset link</span>
                )}
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </AuthLayout>
  );
}
