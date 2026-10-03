/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { authApi } from '../services/api';
import { Eye, EyeOff, RefreshCw, AlertCircle } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';

export default function PlatformLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await authApi.platformLogin(email.trim(), password);

      // Store tokens
      localStorage.setItem('jnc_access_token', data.accessToken);
      localStorage.setItem('jnc_refresh_token', data.refreshToken);
      localStorage.setItem('jnc_user', JSON.stringify(data.user));

      // Reload to let AuthContext re-initialize, then navigate
      window.location.href = '/platform/companies';
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Invalid credentials.');
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
        <div className="mb-6">
          <h2 className="text-[28px] font-semibold text-slate-900 dark:text-white leading-tight">
            Platform Administration
          </h2>
          <p className="text-[14px] text-slate-500 dark:text-slate-400 mt-1">
            Restricted access — platform super-admins only
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {/* Email */}
          <div>
            <label
              htmlFor="platform-email"
              className="block text-[14px] font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Email
            </label>
            <input
              id="platform-email"
              type="email"
              autoComplete="username"
              required
              className="w-full h-11 px-3.5 text-[16px] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#243049] rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#2563EB] focus:ring-[3px] focus:ring-[#2563EB]/25 transition-all"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="platform-password"
              className="block text-[14px] font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="platform-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                className="w-full h-11 px-3.5 pr-12 text-[16px] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#243049] rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#2563EB] focus:ring-[3px] focus:ring-[#2563EB]/25 transition-all"
                placeholder="Enter password"
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
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                role="alert"
                aria-live="assertive"
                className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] dark:bg-red-950/40 dark:border-red-900/60 dark:text-red-300 text-[13px] font-medium flex items-start gap-2"
              >
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            aria-busy={loading}
            className="w-full h-11 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] focus:outline-none focus:ring-[3px] focus:ring-[#2563EB]/35 text-white text-[15px] font-semibold shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
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
      </motion.div>
    </AuthLayout>
  );
}
