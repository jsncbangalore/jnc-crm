import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useBranding } from '../contexts/BrandingContext';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { branding } = useBranding();
  const navigate = useNavigate();
  const [companyCode, setCompanyCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const loggedInUser = await login(username, password, companyCode.trim() || undefined);
      const isPlatformOwner =
        loggedInUser?.role === 'platform_super_admin' ||
        (loggedInUser?.role === 'super_admin' && (!loggedInUser?.tenantId || loggedInUser?.tenantId === 'default-tenant-id'));

      if (isPlatformOwner) {
        navigate('/platform/companies');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0F1117] text-slate-900 dark:text-slate-100 flex items-center justify-center p-4 relative transition-colors duration-150">
      {/* Floating Theme Toggle */}
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-xl border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-700 dark:text-slate-200 hover:border-crm-blue dark:hover:border-crm-blue shadow-sm transition-all cursor-pointer"
        title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
      >
        {isDark ? (
          <Sun size={18} className="text-amber-400 shrink-0" />
        ) : (
          <Moon size={18} className="text-indigo-600 shrink-0" />
        )}
      </button>

      {/* Background radial glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-crm-blue/10 rounded-full blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-white mb-4 shadow-md border border-slate-200 dark:border-white/20">
            <img
              src={branding.companyLogoUrl || '/jnc-logo.jpg'}
              alt={branding.companyDisplayName}
              className="h-12 w-auto object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{branding.companyDisplayName}</h1>
          <p className="font-comeitiye text-xl text-crm-blue dark:text-crm-blue-light mt-1 tracking-wide">
            Precision in Security, PA & Power Systems
          </p>
          {branding.companyPhone && (
            <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5 font-mono">Contact: {branding.companyPhone}</p>
          )}
        </div>

        <div className="card shadow-xl dark:shadow-2xl">
          <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100 dark:border-white/5">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Sign In to CRM</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">JNC Platform & Client Workspaces</p>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-crm-blue/10 text-crm-blue dark:text-crm-blue-light border border-crm-blue/20">
              SaaS Multi-Org
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label text-xs">User ID, Employee Code, or Email</label>
              <input
                type="text"
                className="input text-xs"
                placeholder="Enter User ID, Employee Code, or Email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Sign in with your assigned company credentials or registered email.
              </p>
            </div>

            <div>
              <label className="label text-xs">Password</label>
              <input
                type="password"
                className="input text-xs"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {/* Optional Company Code Field (Auto-detected if left empty) */}
            <div className="pt-1">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-slate-500 dark:text-slate-400">Organization / Company Code</span>
                <span className="text-[11px] text-slate-400 font-medium">Optional</span>
              </div>
              <input
                type="text"
                className="input uppercase font-mono tracking-wider text-xs bg-slate-50/50 dark:bg-black/20"
                placeholder="Enter company code (Optional)"
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value)}
              />
            </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm rounded-lg px-4 py-3"
                  >
                    {error}
                  </motion.div>
                )}

                <motion.button
                  type="submit"
                  disabled={loading}
                  whileTap={{ scale: 0.98 }}
                  className="btn-primary w-full justify-center py-3 text-sm font-bold shadow-glow-blue"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Signing in...
                    </span>
                  ) : (
                    'Sign In to CRM'
                  )}
                </motion.button>
              </form>
            </div>

        {/* Brand Calligraphy Seal */}
        <div className="mt-8 text-center space-y-1">
          <p className="font-fancy text-3xl text-slate-400 dark:text-slate-500/80 select-none">
            JS Network & Power Solutions
          </p>
          <p className="font-brush text-xs text-crm-teal/80 dark:text-crm-teal/70 tracking-widest uppercase">
            Official Enterprise CRM
          </p>
        </div>
      </motion.div>
    </div>
  );
}
