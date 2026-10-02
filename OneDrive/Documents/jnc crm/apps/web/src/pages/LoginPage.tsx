import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useBranding } from '../contexts/BrandingContext';
import { useNavigate } from 'react-router-dom';
import {
  Sun, Moon, ShieldCheck, Lock, Mail, Eye, EyeOff, KeyRound,
  CheckCircle2, ArrowRight, UserCheck, Sparkles, Building2,
  Smartphone, RefreshCw, AlertCircle, Users, Zap
} from 'lucide-react';
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

  // Login inputs
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [enable2FA, setEnable2FA] = useState(false);

  // 2FA Verification Step
  const [is2FAStep, setIs2FAStep] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // States
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [detectedRole, setDetectedRole] = useState<string | null>(null);

  // Quick Demo Account Selectors
  const DEMO_ACCOUNTS = [
    { label: 'Super Admin', code: 'JNC-SA-001', role: 'super_admin', icon: '👑', target: 'Platform & All Companies' },
    { label: 'Tenant Admin', code: 'JNC-JSNC-001-SA-001', role: 'tenant_admin', icon: '🏢', target: 'Company Management' },
    { label: 'Sales Rep', code: 'JNC-EMP-001', role: 'employee', icon: '💼', target: 'Leads & Quotations' },
    { label: 'Developer', code: 'JNC-DEV-001', role: 'developer', icon: '💻', target: 'Daily Activities & Logs' },
  ];

  const handleFillDemo = (code: string) => {
    setUsername(code);
    setError('');
  };

  const handleInitialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const loggedInUser = await login(username, password);
      setDetectedRole(loggedInUser.role);

      if (enable2FA) {
        // Trigger 2FA step verification
        setPendingUser(loggedInUser);
        setIs2FAStep(true);
        setResendCooldown(30);
        const timer = setInterval(() => {
          setResendCooldown((prev) => {
            if (prev <= 1) {
              clearInterval(timer);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        // Direct Role-Based Redirect
        const destination = getRoleRedirectPath(loggedInUser);
        navigate(destination);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Invalid credentials. Please verify your Email/User ID and password.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FASubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.trim().length < 4) {
      setError('Please enter a valid 6-digit authentication code.');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      if (pendingUser) {
        const destination = getRoleRedirectPath(pendingUser);
        navigate(destination);
      } else {
        navigate('/');
      }
    }, 600);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0F1117] text-slate-900 dark:text-slate-100 flex items-center justify-center p-4 relative transition-colors duration-150">
      {/* Floating Theme Toggle */}
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-xl border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-700 dark:text-slate-200 hover:border-crm-blue dark:hover:border-crm-blue shadow-sm transition-all cursor-pointer z-20"
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
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[650px] h-[650px] bg-crm-blue/10 dark:bg-crm-blue/5 rounded-full blur-[130px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md relative z-10"
      >
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-white dark:bg-[#181B26] mb-3.5 shadow-lg border border-slate-200 dark:border-white/10">
            <img
              src={branding.companyLogoUrl || '/jnc-logo.jpg'}
              alt={branding.companyDisplayName}
              className="h-11 w-auto object-contain"
            />
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {branding.companyDisplayName}
          </h1>
          <p className="text-xs text-crm-blue dark:text-crm-blue-light mt-0.5 font-bold uppercase tracking-wider">
            Unified Enterprise Authentication Portal
          </p>
        </div>

        {/* Main Card */}
        <div className="card shadow-2xl bg-white dark:bg-[#151824] border border-slate-200 dark:border-[#2A3042] rounded-2xl overflow-hidden p-6 sm:p-7">
          
          <AnimatePresence mode="wait">
            {!is2FAStep ? (
              /* ─── STEP 1: CREDENTIALS LOGIN ────────────────────────────── */
              <motion.div
                key="credentials-step"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-4"
              >
                <div className="border-b border-slate-100 dark:border-white/5 pb-3">
                  <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center justify-between">
                    <span>Sign In to CRM</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      Multi-Tenant Protected
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Universal single login for Employees, Clients, Admins & Finance.
                  </p>
                </div>

                <form onSubmit={handleInitialSubmit} className="space-y-4">
                  {/* Username / Employee Code / Email */}
                  <div>
                    <label className="label text-xs font-bold text-slate-700 dark:text-slate-300">
                      User ID, Employee Code, or Email *
                    </label>
                    <div className="relative">
                      <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        className="input pl-9 text-xs font-medium"
                        placeholder="e.g. JNC-SA-001, admin@jncnetwork.com"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="label text-xs font-bold text-slate-700 dark:text-slate-300 mb-0">
                        Password *
                      </label>
                    </div>
                    <div className="relative">
                      <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className="input pl-9 pr-9 text-xs font-medium"
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Two-Factor Authentication Option Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042]">
                    <div className="flex items-center gap-2">
                      <Smartphone size={15} className="text-crm-teal" />
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">Two-Factor Authentication (2FA)</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Require secondary OTP verification</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enable2FA}
                        onChange={(e) => setEnable2FA(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-crm-teal"></div>
                    </label>
                  </div>

                  {/* Error Message */}
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-medium flex items-center gap-2"
                    >
                      <AlertCircle size={15} className="shrink-0" />
                      <span>{error}</span>
                    </motion.div>
                  )}

                  {/* Submit Button */}
                  <motion.button
                    type="submit"
                    disabled={loading}
                    whileTap={{ scale: 0.98 }}
                    className="btn-primary w-full justify-center py-2.5 text-xs font-black shadow-glow-blue flex items-center gap-2"
                  >
                    {loading ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Verifying Credentials...</span>
                      </>
                    ) : (
                      <>
                        <span>Sign In & Detect Role</span>
                        <ArrowRight size={14} />
                      </>
                    )}
                  </motion.button>
                </form>

                {/* Quick 1-Click Demo Accounts Bar */}
                <div className="pt-2 border-t border-slate-100 dark:border-white/5 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">
                    Quick Role Sign-In Switcher:
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {DEMO_ACCOUNTS.map((acc) => (
                      <button
                        key={acc.code}
                        type="button"
                        onClick={() => handleFillDemo(acc.code)}
                        className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all text-left flex items-center justify-between ${
                          username === acc.code
                            ? 'bg-crm-blue/15 border-crm-blue text-crm-blue dark:text-crm-blue-light font-bold'
                            : 'bg-slate-50 dark:bg-[#181B26] border-slate-200 dark:border-[#2A3042] text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20'
                        }`}
                        title={`Fill ${acc.label} (${acc.code})`}
                      >
                        <span className="truncate">{acc.icon} {acc.label}</span>
                        <span className="text-[9px] font-mono opacity-60 truncate">{acc.code.slice(0, 10)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : (
              /* ─── STEP 2: 2FA OTP VERIFICATION ─────────────────────────── */
              <motion.div
                key="2fa-step"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="border-b border-slate-100 dark:border-white/5 pb-3">
                  <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center justify-between">
                    <span>Two-Factor Authentication</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-crm-teal/15 text-crm-teal border border-crm-teal/30">
                      Step 2 of 2
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Enter the 6-digit verification code sent to your registered channel.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-blue-50 dark:bg-[#181B26] border border-blue-200 dark:border-[#2A3042] text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 dark:text-white">Authenticated Account:</span>
                    <span className="font-mono font-bold text-crm-blue">{pendingUser?.employeeCode}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                    <span>Role Level:</span>
                    <span className="font-bold capitalize text-emerald-600 dark:text-emerald-400">{pendingUser?.role.replace('_', ' ')}</span>
                  </div>
                </div>

                <form onSubmit={handleVerify2FASubmit} className="space-y-4">
                  <div>
                    <label className="label text-xs font-bold text-slate-700 dark:text-slate-300">
                      6-Digit Security OTP Code *
                    </label>
                    <div className="relative">
                      <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        maxLength={6}
                        className="input pl-9 text-center font-mono text-base tracking-widest font-black"
                        placeholder="• • • • • •"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                        required
                        autoFocus
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 text-center">
                      Tip: For sandbox verification, enter any 6 digits (e.g. 123456).
                    </p>
                  </div>

                  {error && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-medium">
                      {error}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIs2FAStep(false);
                        setOtpCode('');
                      }}
                      className="btn btn-secondary text-xs flex-1"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={loading || otpCode.length < 4}
                      className="btn-primary text-xs flex-1 justify-center py-2.5 shadow-glow-teal bg-crm-teal hover:bg-crm-teal-hover border-crm-teal"
                    >
                      {loading ? 'Verifying...' : 'Verify & Continue'}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

        </div>

        {/* Security & Isolation Trust Badges */}
        <div className="mt-5 grid grid-cols-3 gap-2 text-center text-[10px] text-slate-500 dark:text-slate-400 font-medium">
          <div className="p-2 rounded-xl bg-white/60 dark:bg-[#13161F] border border-slate-200/80 dark:border-white/5 flex flex-col items-center gap-1 shadow-sm">
            <ShieldCheck size={14} className="text-emerald-500" />
            <span>256-Bit SSL AES</span>
          </div>
          <div className="p-2 rounded-xl bg-white/60 dark:bg-[#13161F] border border-slate-200/80 dark:border-white/5 flex flex-col items-center gap-1 shadow-sm">
            <Users size={14} className="text-crm-blue" />
            <span>Multi-Tenant RBAC</span>
          </div>
          <div className="p-2 rounded-xl bg-white/60 dark:bg-[#13161F] border border-slate-200/80 dark:border-white/5 flex flex-col items-center gap-1 shadow-sm">
            <Zap size={14} className="text-amber-500" />
            <span>Instant Role Route</span>
          </div>
        </div>

        {/* Brand Calligraphy Seal */}
        <div className="mt-6 text-center space-y-0.5">
          <p className="font-fancy text-2xl text-slate-400 dark:text-slate-500 select-none">
            JS Network & Power Solutions
          </p>
          <p className="font-brush text-[11px] text-crm-teal/80 dark:text-crm-teal/70 tracking-widest uppercase">
            Official Enterprise CRM
          </p>
        </div>
      </motion.div>
    </div>
  );
}
