/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { authApi, setStaffAccessToken, setPlatformAccessToken } from '../services/api';
import { Lock, Eye, EyeOff, ShieldAlert, LogOut, CheckCircle2, RefreshCw, AlertCircle } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';

export default function ForcePasswordResetPage() {
  const { user, updateUser, logout } = useAuth();
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  const checkCapsLock = (e: React.KeyboardEvent) => {
    if (e.getModifierState) {
      setCapsLockOn(e.getModifierState('CapsLock'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPass) {
      setError('Please enter your current temporary password.');
      return;
    }
    if (newPass.length < 12) {
      setError('New password must be at least 12 characters long for security.');
      return;
    }
    if (newPass !== confirmPass) {
      setError('New password and confirmation password do not match.');
      return;
    }
    if (currentPass === newPass) {
      setError('New password must be different from your temporary password.');
      return;
    }

    setLoading(true);
    try {
      const response = await authApi.changePassword(currentPass, newPass);
      const data = response?.data;
      if (data?.accessToken) {
        setStaffAccessToken(data.accessToken);
        if (user?.role === 'platform_super_admin') {
          setPlatformAccessToken(data.accessToken);
        }
      }
      setSuccess(true);
      setTimeout(() => {
        updateUser(data?.user || { mustResetPassword: false });
      }, 1000);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
        err?.message ||
        'Failed to update password. Please check your current password.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="space-y-6">
        <div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-3">
            <ShieldAlert size={24} />
          </div>
          <h1 className="text-[28px] font-bold text-slate-900 dark:text-white leading-tight">
            Password change required
          </h1>
          <p className="text-[16px] text-slate-600 dark:text-slate-400 mt-2">
            Welcome, <strong className="font-semibold text-slate-900 dark:text-white">{user?.name}</strong>. For your security, you must set a new password before accessing the system.
          </p>
        </div>

        {success ? (
          <div className="flex flex-col items-center py-6 text-center space-y-3" aria-live="polite">
            <CheckCircle2 size={44} className="text-emerald-500" />
            <h2 className="text-[20px] font-bold text-slate-900 dark:text-white">Password Updated</h2>
            <p className="text-[14px] text-slate-600 dark:text-slate-400">
              Your password has been changed successfully. Redirecting to workspace...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {error && (
              <div
                id="force-reset-error"
                className="p-3.5 rounded-[10px] bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-[14px] font-medium flex items-start gap-2.5"
                role="alert"
              >
                <AlertCircle size={18} className="shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            {/* Current Temporary Password */}
            <div>
              <label
                htmlFor="current-temporary-password"
                className="block text-[14px] font-semibold text-slate-800 dark:text-slate-200 mb-2"
              >
                Current temporary password
              </label>
              <div className="relative flex items-center">
                <Lock
                  size={20}
                  className="absolute left-[14px] text-slate-400 dark:text-slate-500 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="current-temporary-password"
                  name="currentPassword"
                  type={showCurrent ? 'text' : 'password'}
                  autoComplete="current-password"
                  autoFocus
                  value={currentPass}
                  onChange={(e) => {
                    setCurrentPass(e.target.value);
                    if (error) setError(null);
                  }}
                  onKeyDown={checkCapsLock}
                  onKeyUp={checkCapsLock}
                  aria-invalid={Boolean(error && !currentPass)}
                  aria-describedby={error ? 'force-reset-error' : undefined}
                  className="w-full h-[48px] rounded-[10px] border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[16px] text-slate-900 dark:text-white pl-[44px] pr-[44px] placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-[3px] focus:ring-blue-500/30 focus:border-blue-600 dark:focus:border-blue-500 transition-colors"
                  placeholder="••••••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-1 w-[40px] h-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer transition-colors"
                  aria-label={showCurrent ? 'Hide password' : 'Show password'}
                  title={showCurrent ? 'Hide password' : 'Show password'}
                >
                  {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label
                htmlFor="new-permanent-password"
                className="block text-[14px] font-semibold text-slate-800 dark:text-slate-200 mb-2"
              >
                New password
              </label>
              <div className="relative flex items-center">
                <Lock
                  size={20}
                  className="absolute left-[14px] text-slate-400 dark:text-slate-500 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="new-permanent-password"
                  name="newPassword"
                  type={showNew ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPass}
                  onChange={(e) => {
                    setNewPass(e.target.value);
                    if (error) setError(null);
                  }}
                  onKeyDown={checkCapsLock}
                  onKeyUp={checkCapsLock}
                  aria-invalid={Boolean(error && !newPass)}
                  aria-describedby={error ? 'force-reset-error' : undefined}
                  className="w-full h-[48px] rounded-[10px] border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[16px] text-slate-900 dark:text-white pl-[44px] pr-[44px] placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-[3px] focus:ring-blue-500/30 focus:border-blue-600 dark:focus:border-blue-500 transition-colors"
                  placeholder="Minimum 12 characters"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-1 w-[40px] h-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer transition-colors"
                  aria-label={showNew ? 'Hide password' : 'Show password'}
                  title={showNew ? 'Hide password' : 'Show password'}
                >
                  {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label
                htmlFor="confirm-permanent-password"
                className="block text-[14px] font-semibold text-slate-800 dark:text-slate-200 mb-2"
              >
                Confirm new password
              </label>
              <div className="relative flex items-center">
                <Lock
                  size={20}
                  className="absolute left-[14px] text-slate-400 dark:text-slate-500 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="confirm-permanent-password"
                  name="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPass}
                  onChange={(e) => {
                    setConfirmPass(e.target.value);
                    if (error) setError(null);
                  }}
                  onKeyDown={checkCapsLock}
                  onKeyUp={checkCapsLock}
                  aria-invalid={Boolean(error && !confirmPass)}
                  aria-describedby={error ? 'force-reset-error' : undefined}
                  className="w-full h-[48px] rounded-[10px] border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[16px] text-slate-900 dark:text-white pl-[44px] pr-[44px] placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-[3px] focus:ring-blue-500/30 focus:border-blue-600 dark:focus:border-blue-500 transition-colors"
                  placeholder="Repeat new password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-1 w-[40px] h-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer transition-colors"
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  title={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {capsLockOn && (
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-amber-600 dark:text-amber-400" role="status">
                <AlertCircle size={14} />
                <span>Caps Lock is on</span>
              </div>
            )}

            <div className="pt-2 space-y-3">
              <button
                type="submit"
                disabled={loading}
                className="w-full h-[48px] rounded-[10px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 disabled:cursor-not-allowed text-[16px] font-semibold text-white shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus:ring-[3px] focus:ring-blue-500/30"
              >
                {loading ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    <span>Updating password...</span>
                  </>
                ) : (
                  <span>Update Password</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => logout()}
                className="w-full h-[48px] rounded-[10px] border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[14px] font-semibold text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut size={16} />
                <span>Sign Out</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
