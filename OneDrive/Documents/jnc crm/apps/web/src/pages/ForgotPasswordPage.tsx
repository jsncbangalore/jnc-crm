/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useBranding } from '../contexts/BrandingContext';
import { authApi } from '../services/api';
import { RefreshCw, AlertCircle, CheckCircle, ArrowLeft, Sun, Moon } from 'lucide-react';

export default function ForgotPasswordPage() {
  const { isDark, toggleTheme } = useTheme();
  const { branding } = useBranding();
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
    <div className="min-h-screen bg-slate-50 dark:bg-[#0F1117] flex items-center justify-center p-6 relative">
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-5 right-5 w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161922] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white shadow-sm transition-all cursor-pointer z-20"
        aria-label={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
      >
        {isDark ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-slate-600" />}
      </button>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="mb-6">
          <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
            <ArrowLeft size={13} /> Back to sign in
          </Link>
        </div>

        <div className="bg-white dark:bg-[#161922] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-lg p-7">
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white mb-1">Forgot password?</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
            Enter your email and we'll send a reset link if the account exists.
          </p>

          <AnimatePresence mode="wait">
            {sent ? (
              <motion.div key="sent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3 py-4 text-center">
                <CheckCircle size={40} className="text-green-500" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  If that email is registered, a reset link has been sent. Check your inbox.
                </p>
                <Link to="/login" className="mt-2 text-xs text-crm-blue underline">Back to sign in</Link>
              </motion.div>
            ) : (
              <motion.form key="form" onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div>
                  <label htmlFor="forgot-email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Email
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    required
                    className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-[#0F1117] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-crm-blue focus:border-transparent transition-all"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                  />
                </div>

                {error && (
                  <div role="alert" aria-live="assertive" className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  aria-busy={loading}
                  className="w-full py-2.5 px-4 rounded-lg bg-crm-blue hover:bg-crm-blue-hover text-white text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                >
                  {loading ? <><RefreshCw size={14} className="animate-spin" /><span>Sending...</span></> : <span>Send reset link</span>}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
