import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useBranding } from '../contexts/BrandingContext';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon, Lock, Mail, Eye, EyeOff, ArrowRight, RefreshCw, AlertCircle } from 'lucide-react';
import { User } from '../types';

export function getRoleRedirectPath(user: User | null): string {
  if (!user) return '/login';
  switch (user.role) {
    case 'platform_super_admin':
      return '/platform/companies';
    case 'super_admin':
      return (!user.tenantId || user.tenantId === 'default-tenant-id') ? '/platform/companies' : '/';
    case 'tenant_admin':
    case 'admin':
    case 'sub_admin':
      return '/';
    case 'employee':
      return '/leads';
    case 'developer':
    case 'developer_lead':
    case 'project_manager':
      return '/daily-activities';
    case 'store_manager':
      return '/inventory';
    case 'finance':
    case 'accountant':
      return '/invoices';
    case 'client':
    case 'customer':
      return '/orders';
    default:
      return '/';
  }
}

export default function LoginPage() {
  const { login } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { branding } = useBranding();
  const navigate = useNavigate();

  // Form states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const loggedInUser = await login(username, password);
      const destination = loggedInUser.redirectPath || getRoleRedirectPath(loggedInUser);
      navigate(destination);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Invalid User ID or Password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0F1117] text-slate-900 dark:text-slate-100 flex items-center justify-center p-4 relative transition-colors duration-150">
      {/* Theme Toggle */}
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-5 right-5 w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161922] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white shadow-sm transition-all cursor-pointer z-20"
        title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
      >
        {isDark ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-slate-600" />}
      </button>

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-sm"
      >
        {/* Company Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center p-2.5 rounded-xl bg-white dark:bg-[#161922] mb-3 shadow-sm border border-slate-200 dark:border-slate-800">
            <img
              src={branding.companyLogoUrl || '/jnc-logo.jpg'}
              alt={branding.companyDisplayName}
              className="h-10 w-auto object-contain"
            />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            {branding.companyDisplayName}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Enterprise CRM Portal
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white dark:bg-[#161922] border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg p-6 sm:p-7">
          <div className="mb-5">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Sign In</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Enter your credentials to access your account
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* User ID / Email */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                User ID or Email
              </label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-[#0F1117] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-crm-blue focus:border-transparent transition-all"
                  placeholder="Enter User ID or Email"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full pl-9 pr-9 py-2 text-sm bg-slate-50 dark:bg-[#0F1117] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-crm-blue focus:border-transparent transition-all"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-xs font-medium flex items-center gap-2"
              >
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-crm-blue hover:bg-crm-blue-hover text-white text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Subtle Footer */}
        <p className="text-center text-[11px] text-slate-400 dark:text-slate-500 mt-5">
          &copy; {new Date().getFullYear()} {branding.companyDisplayName}. All rights reserved.
        </p>
      </motion.div>
    </div>
  );
}
