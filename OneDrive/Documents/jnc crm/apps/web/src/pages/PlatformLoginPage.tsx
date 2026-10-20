/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, RefreshCw, AlertCircle } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';

export default function PlatformLoginPage() {
  const navigate = useNavigate();
  const { platformLogin } = useAuth();
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
      const result = await platformLogin(email.trim(), password);
      const destination = result.redirectPath || '/platform/companies';
      navigate(destination);
    } catch (err: any) {
      if (
        !err?.response ||
        err.code === 'ERR_NETWORK' ||
        err.code === 'ECONNABORTED' ||
        err.message?.includes('Network Error')
      ) {
        setError('Cannot reach the server. Check your connection and try again.');
      } else if (err.response?.status === 401) {
        setError(err.response?.data?.message || 'Invalid credentials.');
      } else {
        setError(err.response?.data?.message || 'Cannot reach the server. Check your connection and try again.');
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
        <div className="mb-6">
          <h2 className="text-[28px] font-semibold text-slate-900 dark:text-white leading-tight">
            Platform Administration
          </h2>
          <p className="text-[14px] text-slate-500 dark:text-slate-400 mt-1">
            Restricted access — platform super-admins only
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate autoComplete="off">
          {/* Email */}
          {/* Email or User ID */}
          <div>
            <label
              htmlFor="platform-email"
              className="block text-[14px] font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Email or User ID
            </label>
            {/* Browsers may still autofill despite these attributes */}
            <input
              id="platform-email"
              name="jnc-identity"
              type="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              className="w-full h-11 px-3.5 text-[16px] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#243049] rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#2563EB] focus:ring-[3px] focus:ring-[#2563EB]/25 transition-all"
              placeholder="admin@example.com or PSA-001"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="platform-password"
                className="text-[14px] font-medium text-slate-700 dark:text-slate-300"
              >
                Password
              </label>
              <Link
                to="/forgot-password?portal=platform"
                className="text-[13px] font-medium text-[#2563EB] hover:underline transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              {/* Browsers may still autofill despite these attributes */}
              <input
                id="platform-password"
                name="jnc-secret"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
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

          {/* Error & Portal Detection */}
          <AnimatePresence>
            {error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                role="alert"
                aria-live="assertive"
                className="p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] dark:bg-red-950/40 dark:border-red-900/60 dark:text-red-300 text-[13px] font-medium space-y-2.5"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle size={18} className="shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                  <div className="font-semibold">{error}</div>
                </div>

                {/* Company CRM Redirection Card */}
                <div className="pt-2 border-t border-red-200 dark:border-red-900/60 text-slate-700 dark:text-slate-300">
                  <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 mb-1">
                    Are you signing in to a company CRM?
                  </p>
                  <p className="text-[12px] text-slate-600 dark:text-slate-400 leading-relaxed mb-3">
                    Company users must use the company login.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="w-full h-10 inline-flex items-center justify-center gap-1.5 px-4 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-[13px] shadow-sm transition-all cursor-pointer"
                  >
                    <span>Go to Company Login (/login) &rarr;</span>
                  </button>
                </div>
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

        {/* Portal Switcher Footer */}
        <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 text-center">
          <p className="text-[13px] text-slate-500 dark:text-slate-400">
            Client company admin or employee?{' '}
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="font-semibold text-[#2563EB] hover:underline transition-colors"
            >
              Sign in to Company CRM (/login) &rarr;
            </button>
          </p>
        </div>
      </motion.div>
    </AuthLayout>
  );
}
