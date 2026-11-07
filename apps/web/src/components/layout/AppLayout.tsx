import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, Link } from 'react-router-dom';
import Navbar from './Navbar';
import MobileDock from './MobileDock';
import { useAuth } from '../../contexts/AuthContext';
import { useBranding } from '../../contexts/BrandingContext';
import { useAllowedPages } from '../../hooks/useAllowedPages';
import { getProductName } from '../../config/brand';
import { authApi, setAccessToken, setImpersonationAccessToken, getImpersonationAccessToken, setCurrentTabUserId } from '../../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import { KeyRound, ShieldAlert, CheckCircle2, Lock, Database } from 'lucide-react';
import { openCookiePreferencesPanel } from '../../utils/cookieConsent';
import BrandLogo from '../common/BrandLogo';
import Footer from '../common/Footer';
import SessionExpiredBanner from './SessionExpiredBanner';

export default function AppLayout({ children }: { children?: React.ReactNode } = {}) {
  const { user, updateUser, logout, sessionExpired } = useAuth();
  const { branding } = useBranding();
  const { hasZeroPages } = useAllowedPages();

  // Forced password reset state
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Schema update check for admins
  const [schemaPendingCount, setSchemaPendingCount] = useState<number | null>(null);

  useEffect(() => {
    const isAdmin =
      user?.role === 'admin' ||
      user?.role === 'tenant_admin' ||
      user?.role === 'platform_super_admin' ||
      user?.role === 'platform_admin' ||
      Boolean((user as any)?.isPlatformAdmin);

    if (!isAdmin) return;

    let mounted = true;
    authApi.getSchemaStatus()
      .then((res) => {
        if (!mounted) return;
        if (res.data?.ok === false && res.data?.pendingCount > 0) {
          setSchemaPendingCount(res.data.pendingCount);
        } else {
          setSchemaPendingCount(null);
        }
      })
      .catch(() => {});

    return () => { mounted = false; };
  }, [user]);

  const handleForcedResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPass.length < 6) {
      setError('Please choose a password with at least 6 characters.');
      return;
    }
    if (newPass !== confirmPass) {
      setError('New passwords do not match.');
      return;
    }

    setResetting(true);
    try {
      await authApi.changePassword(currentPass, newPass);
      setSuccess(true);
      setTimeout(() => {
        updateUser({ mustResetPassword: false });
        setSuccess(false);
      }, 1200);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to update password. Please check your current password.');
    } finally {
      setResetting(false);
    }
  };

  const navigate = useNavigate();

  const handleExitImpersonation = async () => {
    setImpersonationAccessToken(null);
    setAccessToken(null);
    setCurrentTabUserId(null);
    navigate('/platform/companies');
  };

  const isImpersonating = Boolean((user as any)?.isImpersonating || getImpersonationAccessToken());

  // When user has zero pages, hide all navigation surfaces (desktop navbar, mobile dock, footer, top bar)
  if (hasZeroPages) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0F1117] text-slate-900 dark:text-slate-100 flex flex-col">
        {sessionExpired && <SessionExpiredBanner />}
        {children || <Outlet />}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0F1117] text-slate-900 dark:text-slate-100 overflow-x-hidden pb-16 lg:pb-0">
      {/* ─── SESSION EXPIRED BANNER ───── */}
      {sessionExpired && <SessionExpiredBanner />}

      {/* ─── SCHEMA UPDATE PENDING RED BANNER (ADMIN ONLY) ───── */}
      {schemaPendingCount != null && schemaPendingCount > 0 && (
        <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-between text-xs font-bold shadow-md z-50 sticky top-0">
          <div className="flex items-center gap-2">
            <Database size={15} />
            <span>Database update pending: {schemaPendingCount} migrations</span>
          </div>
          <span className="text-[11px] font-normal opacity-90 hidden sm:inline">
            Action required: Run &quot;npx prisma migrate deploy&quot; to apply pending updates
          </span>
        </div>
      )}

      {/* ─── IMPERSONATION BANNER ───── */}
      {isImpersonating && (
        <div className="bg-amber-600 text-white px-4 py-2 flex items-center justify-between text-xs font-medium shadow-md z-50 sticky top-0">
          <span>
            You are viewing <strong>{(user as any)?.impersonatedTenantName || 'Client Workspace'}</strong>
          </span>
          <button
            onClick={handleExitImpersonation}
            className="btn bg-white text-slate-900 hover:bg-slate-100 text-xs px-3 py-1 rounded-lg font-bold shadow-sm transition-all"
          >
            Exit
          </button>
        </div>
      )}

      {/* Mobile-only slim top bar — permanent brand */}
      <div className="lg:hidden flex items-center justify-between px-4 py-2.5 bg-white/95 dark:bg-[#181B26]/95 backdrop-blur-md border-b border-slate-200 dark:border-[#2A3042] sticky top-0 z-40 shrink-0">
        <div className="flex items-center gap-2">
          <BrandLogo size={28} variant="icon" />
          <span className="text-xs font-bold text-slate-900 dark:text-white tracking-tight">
            JNC CRM
          </span>
        </div>
      </div>

      <Navbar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden w-full">
        <div className="p-3 sm:p-5 lg:p-6 max-w-[1700px] mx-auto w-full min-w-0 overflow-x-hidden">
          {children || <Outlet />}
        </div>
      </main>

      {/* ─── GLOBAL SHARED FOOTER (Signed-in: clean copyright only, no cookie links) ── */}
      <Footer mobileDockOffset={true} showCookieLinks={false} />

      {/* ─── NATIVE SMARTPHONE BOTTOM NAVIGATION DOCK ─────────────────────── */}
      <MobileDock />

      {/* ─── MANDATORY FORCED PASSWORD RESET MODAL ───────────────────────── */}
      <AnimatePresence>
        {user?.mustResetPassword && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-white dark:bg-[#181B26] border border-amber-500/30 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] text-center">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center mx-auto mb-3">
                  <KeyRound size={28} />
                </div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Action Required: Change Temporary Password</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  For your account security, you must set a new personal password before accessing the {getProductName(branding)} portal.
                </p>
              </div>

              {success ? (
                <div className="p-8 text-center space-y-3">
                  <CheckCircle2 size={40} className="text-emerald-500 mx-auto" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Password Updated Successfully!</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Unlocking your CRM session...</p>
                </div>
              ) : (
                <form onSubmit={handleForcedResetSubmit} className="p-6 space-y-4">
                  {error && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-crm-coral flex items-center gap-2">
                      <ShieldAlert size={15} className="shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div>
                    <label className="label">Current Temporary Password *</label>
                    <input
                      type="password"
                      className="input text-xs"
                      placeholder="Enter the temporary password provided"
                      value={currentPass}
                      onChange={(e) => setCurrentPass(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="label">New Personal Password *</label>
                    <input
                      type="password"
                      className="input text-xs"
                      placeholder="Min 6 characters (letters, numbers, symbols)"
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="label">Confirm New Password *</label>
                    <input
                      type="password"
                      className="input text-xs"
                      placeholder="Re-enter your new password"
                      value={confirmPass}
                      onChange={(e) => setConfirmPass(e.target.value)}
                      required
                    />
                  </div>

                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      type="submit"
                      disabled={resetting}
                      className="btn-primary text-xs w-full py-2.5 shadow-glow-blue justify-center"
                    >
                      {resetting ? 'Updating Password...' : 'Save New Password & Continue'}
                    </button>
                    <button
                      type="button"
                      onClick={logout}
                      className="btn-ghost text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 py-1.5"
                    >
                      Cancel and Log Out
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
