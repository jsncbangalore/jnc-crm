/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import { Eye, EyeOff, RefreshCw, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Reset link is missing or invalid. Please request a new one.');
      return;
    }
    if (newPassword.length < 12) {
      setError('Password must be at least 12 characters.');
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
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Reset link is invalid or has expired. Please request a new one.');
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
            Set new password
          </h2>
          <p className="text-[14px] text-slate-500 dark:text-slate-400 mt-1">
            Choose a strong password with at least 12 characters.
          </p>
        </div>

        <AnimatePresence mode="wait">
          {done ? (
            <motion.div
              key="done"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3 py-4 text-center"
            >
              <div className="w-12 h-12 rounded-full bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 flex items-center justify-center text-green-600 dark:text-green-400">
                <CheckCircle size={24} />
              </div>
              <p className="text-[14px] font-medium text-slate-700 dark:text-slate-300">
                Password reset successfully. Redirecting to sign in...
              </p>
            </motion.div>
          ) : (
            <motion.form key="form" onSubmit={handleSubmit} className="space-y-5" noValidate>
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
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={12}
                    className="w-full h-11 px-3.5 pr-12 text-[16px] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#243049] rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#2563EB] focus:ring-[3px] focus:ring-[#2563EB]/25 transition-all"
                    placeholder="Minimum 12 characters"
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
                {newPassword.length > 0 && newPassword.length < 12 && (
                  <p className="text-[12px] text-amber-600 dark:text-amber-400 mt-1">
                    {12 - newPassword.length} more characters needed
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="confirm-password"
                  className="block text-[14px] font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  className="w-full h-11 px-3.5 text-[16px] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#243049] rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#2563EB] focus:ring-[3px] focus:ring-[#2563EB]/25 transition-all"
                  placeholder="Repeat password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
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
                    <span>Resetting...</span>
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
