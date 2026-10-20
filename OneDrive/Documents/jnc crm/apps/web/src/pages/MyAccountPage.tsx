/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../services/api';
import {
  User,
  Shield,
  Laptop,
  Smartphone,
  Activity,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
  LogOut,
  Mail,
  Phone,
  Building2,
  Calendar,
  Clock,
  KeyRound,
  Check,
  Circle,
  Globe,
  Camera,
} from 'lucide-react';

interface SessionItem {
  id: string;
  deviceLabel: string;
  ipAddress: string;
  userAgent?: string;
  lastActive: string;
  createdAt: string;
  isCurrent: boolean;
}

interface ActivityItem {
  id: string;
  status: 'SUCCESS' | 'FAILED';
  timestamp: string;
  ipAddress: string;
  deviceLabel: string;
  portal: string;
}

interface PasswordRule {
  id: string;
  label: string;
}

export default function MyAccountPage() {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'devices' | 'activity'>('profile');

  // Profile tab state
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [photoUrl, setPhotoUrl] = useState(user?.photoUrl || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Email Change OTP modal state
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [emailOtpStep, setEmailOtpStep] = useState<1 | 2>(1);
  const [emailOtpLoading, setEmailOtpLoading] = useState(false);
  const [emailOtpError, setEmailOtpError] = useState('');
  const [emailOtpCooldown, setEmailOtpCooldown] = useState(0);

  // Security tab state
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [logoutOthers, setLogoutOthers] = useState(true);
  const [securitySaving, setSecuritySaving] = useState(false);
  const [securityMessage, setSecurityMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [policyRules, setPolicyRules] = useState<PasswordRule[]>([
    { id: 'minLength', label: 'Minimum 12 characters' },
    { id: 'uppercase', label: 'At least one uppercase letter' },
    { id: 'lowercase', label: 'At least one lowercase letter' },
    { id: 'number', label: 'At least one number' },
    { id: 'special', label: 'At least one special character' },
  ]);

  // Devices tab state
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [revokingAllOthers, setRevokingAllOthers] = useState(false);

  // Activity tab state
  const [activityLogs, setActivityLogs] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // Sync user state
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setPhone(user.phone || '');
      setPhotoUrl(user.photoUrl || '');
    }
  }, [user]);

  // Load password policy
  useEffect(() => {
    authApi
      .getPasswordPolicy()
      .then((res) => {
        if (res.data?.rules && Array.isArray(res.data.rules)) {
          setPolicyRules(res.data.rules);
        }
      })
      .catch(() => {});
  }, []);

  // Load sessions when switching to Devices tab
  useEffect(() => {
    if (activeTab === 'devices') {
      loadSessions();
    }
  }, [activeTab]);

  // Load activity when switching to Activity tab
  useEffect(() => {
    if (activeTab === 'activity') {
      loadActivity();
    }
  }, [activeTab]);

  // Email OTP Cooldown timer
  useEffect(() => {
    if (emailOtpCooldown <= 0) return;
    const t = setInterval(() => {
      setEmailOtpCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [emailOtpCooldown]);

  const loadSessions = async () => {
    setSessionsLoading(true);
    try {
      const res = await authApi.getSessions();
      setSessions(res.data || []);
    } catch {
      // fallback
    } finally {
      setSessionsLoading(false);
    }
  };

  const loadActivity = async () => {
    setActivityLoading(true);
    try {
      const res = await authApi.getActivity();
      setActivityLogs(res.data || []);
    } catch {
      // fallback
    } finally {
      setActivityLoading(false);
    }
  };

  // ─── Profile Handlers ───────────────────────────────────────────────────────
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMessage(null);
    try {
      await authApi.updateProfile({ name, phone, photoUrl });
      setProfileMessage({ type: 'success', text: 'Profile updated successfully.' });
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to update profile.';
      setProfileMessage({ type: 'error', text: Array.isArray(msg) ? msg.join(', ') : msg });
    } finally {
      setProfileSaving(false);
    }
  };

  // ─── Email Change OTP Handlers ──────────────────────────────────────────────
  const handleRequestEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newEmail.includes('@')) {
      setEmailOtpError('Please enter a valid email address.');
      return;
    }
    setEmailOtpError('');
    setEmailOtpLoading(true);
    try {
      const res = await authApi.requestEmailChangeOtp(newEmail.trim());
      setEmailOtpCooldown(res.data?.resendAfterSeconds ?? 60);
      setEmailOtpStep(2);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to dispatch verification code.';
      setEmailOtpError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setEmailOtpLoading(false);
    }
  };

  const handleVerifyEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (emailOtpCode.trim().length !== 6) {
      setEmailOtpError('Please enter the 6-digit code.');
      return;
    }
    setEmailOtpError('');
    setEmailOtpLoading(true);
    try {
      await authApi.verifyEmailChangeOtp(newEmail.trim(), emailOtpCode.trim());
      setEmailModalOpen(false);
      setEmailOtpStep(1);
      setEmailOtpCode('');
      setProfileMessage({ type: 'success', text: 'Email updated successfully. Please refresh.' });
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Verification code is incorrect or expired.';
      setEmailOtpError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setEmailOtpLoading(false);
    }
  };

  // ─── Security Handlers ──────────────────────────────────────────────────────
  const evaluateRule = (ruleId: string, pwd: string): boolean => {
    if (!pwd) return false;
    switch (ruleId) {
      case 'minLength':
        return pwd.length >= 12;
      case 'uppercase':
        return /[A-Z]/.test(pwd);
      case 'lowercase':
        return /[a-z]/.test(pwd);
      case 'number':
        return /[0-9]/.test(pwd);
      case 'special':
        return /[^A-Za-z0-9]/.test(pwd);
      default:
        return pwd.length >= 12;
    }
  };

  const isAllSecurityRulesPassed = policyRules.every((r) => evaluateRule(r.id, newPass));
  const isSecurityPasswordsMatch = newPass.length > 0 && newPass === confirmPass;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPass) {
      setSecurityMessage({ type: 'error', text: 'Current password is required.' });
      return;
    }
    if (!isAllSecurityRulesPassed) {
      setSecurityMessage({ type: 'error', text: 'New password does not meet requirements.' });
      return;
    }
    if (!isSecurityPasswordsMatch) {
      setSecurityMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setSecuritySaving(true);
    setSecurityMessage(null);
    try {
      await authApi.changePassword(currentPass, newPass, logoutOthers);
      setSecurityMessage({ type: 'success', text: 'Password changed successfully.' });
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to change password.';
      setSecurityMessage({ type: 'error', text: Array.isArray(msg) ? msg.join(', ') : msg });
    } finally {
      setSecuritySaving(false);
    }
  };

  // ─── Devices Handlers ───────────────────────────────────────────────────────
  const handleRevokeSession = async (sessionId: string) => {
    setRevokingSessionId(sessionId);
    try {
      await authApi.revokeSession(sessionId);
      await loadSessions();
    } catch {
      // ignore
    } finally {
      setRevokingSessionId(null);
    }
  };

  const handleRevokeAllOtherSessions = async () => {
    setRevokingAllOthers(true);
    try {
      await authApi.revokeOtherSessions();
      await loadSessions();
    } catch {
      // ignore
    } finally {
      setRevokingAllOthers(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">My Account</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Manage your personal profile, security credentials, active devices, and login history.
        </p>
      </div>

      {/* Tabs Bar */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'profile'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <User size={16} />
          <span>Profile</span>
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'security'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Shield size={16} />
          <span>Security</span>
        </button>

        <button
          onClick={() => setActiveTab('devices')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'devices'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Laptop size={16} />
          <span>Devices & Sessions</span>
        </button>

        <button
          onClick={() => setActiveTab('activity')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'activity'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Activity size={16} />
          <span>Sign-In Activity</span>
        </button>
      </div>

      {/* ────────────────── TAB 1: PROFILE ────────────────── */}
      {activeTab === 'profile' && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {profileMessage && (
            <div
              className={`p-4 rounded-xl text-sm font-medium flex items-center gap-2 ${
                profileMessage.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
              }`}
            >
              {profileMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span>{profileMessage.text}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left: Avatar Card */}
            <div className="p-6 rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center space-y-4">
              <div className="relative">
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={user?.name || 'User'}
                    className="w-28 h-28 rounded-full object-cover border-4 border-slate-100 dark:border-slate-800 shadow-sm"
                  />
                ) : (
                  <div className="w-28 h-28 rounded-full bg-blue-600 text-white text-3xl font-bold flex items-center justify-center border-4 border-slate-100 dark:border-slate-800 shadow-sm">
                    {user?.name ? user.name.slice(0, 2).toUpperCase() : 'U'}
                  </div>
                )}
                <div className="absolute bottom-1 right-1 p-2 rounded-full bg-slate-900 text-white shadow-md cursor-pointer hover:bg-blue-600 transition-colors">
                  <Camera size={14} />
                </div>
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">{user?.name}</h3>
                <p className="text-xs font-mono text-blue-600 dark:text-blue-400 mt-0.5">
                  {user?.employeeCode || user?.email}
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-semibold capitalize">
                  {user?.role?.replace('_', ' ')}
                </div>
              </div>
            </div>

            {/* Right: Editable Form & Read-only Meta */}
            <div className="md:col-span-2 space-y-6">
              <form
                onSubmit={handleSaveProfile}
                className="p-6 rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 space-y-4"
              >
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Personal Information</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full h-10 px-3 text-sm bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Phone Number
                    </label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full h-10 px-3 text-sm bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Photo URL (Avatar Link)
                  </label>
                  <input
                    type="url"
                    value={photoUrl}
                    onChange={(e) => setPhotoUrl(e.target.value)}
                    placeholder="https://example.com/avatar.jpg"
                    className="w-full h-10 px-3 text-sm bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                  />
                </div>

                {/* Email Section with Change Email OTP */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Email Address
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="email"
                      disabled
                      value={user?.email || ''}
                      className="flex-1 h-10 px-3 text-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-400 select-all cursor-not-allowed"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setEmailModalOpen(true);
                        setEmailOtpStep(1);
                        setNewEmail('');
                        setEmailOtpError('');
                      }}
                      className="h-10 px-3.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Change Email
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                    Changing your email address requires 6-digit OTP verification sent to your new inbox.
                  </p>
                </div>

                <div className="pt-3 flex justify-end">
                  <button
                    type="submit"
                    disabled={profileSaving}
                    className="h-10 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {profileSaving ? <RefreshCw size={14} className="animate-spin" /> : null}
                    <span>Save Changes</span>
                  </button>
                </div>
              </form>

              {/* Read-Only Account Metadata */}
              <div className="p-6 rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 space-y-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Account Details</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60">
                    <span className="text-slate-500 dark:text-slate-400">Workspace / Organization</span>
                    <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                      {user?.tenant?.name || 'Platform Administration'}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60">
                    <span className="text-slate-500 dark:text-slate-400">Employee Code</span>
                    <p className="font-mono font-semibold text-slate-900 dark:text-white mt-0.5">
                      {user?.employeeCode || 'N/A'}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60">
                    <span className="text-slate-500 dark:text-slate-400">Role Rank</span>
                    <p className="font-semibold capitalize text-slate-900 dark:text-white mt-0.5">
                      {user?.role?.replace('_', ' ')}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60">
                    <span className="text-slate-500 dark:text-slate-400">Account Created</span>
                    <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                      {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ────────────────── TAB 2: SECURITY ────────────────── */}
      {activeTab === 'security' && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {securityMessage && (
            <div
              className={`p-4 rounded-xl text-sm font-medium flex items-center gap-2 ${
                securityMessage.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
              }`}
            >
              {securityMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span>{securityMessage.text}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left: Password Status Card */}
            <div className="p-6 rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center">
                <KeyRound size={20} />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Password Status</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                We recommend changing your password every 90 days. Always use a distinct, randomly generated passphrase.
              </p>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                <span>Last Changed: </span>
                <strong className="text-slate-900 dark:text-white">
                  {user?.lastPasswordChangeAt
                    ? new Date(user.lastPasswordChangeAt).toLocaleDateString()
                    : 'Recently'}
                </strong>
              </div>
            </div>

            {/* Right: Change Password Form */}
            <form
              onSubmit={handleChangePassword}
              className="md:col-span-2 p-6 rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 space-y-4"
            >
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Change Account Password</h3>

              {/* Current Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    required
                    value={currentPass}
                    onChange={(e) => setCurrentPass(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full h-10 px-3 pr-10 text-sm bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showCurrentPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    required
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    placeholder="Enter new password (min 12 chars)"
                    className="w-full h-10 px-3 pr-10 text-sm bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showNewPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPass ? 'text' : 'password'}
                    required
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    placeholder="Re-type new password"
                    className="w-full h-10 px-3 pr-10 text-sm bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showConfirmPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Live Policy Checklist */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 space-y-1.5">
                <div className="text-[12px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Security Checklist:
                </div>
                {policyRules.map((rule) => {
                  const passed = evaluateRule(rule.id, newPass);
                  return (
                    <div
                      key={rule.id}
                      className={`flex items-center gap-2 text-xs transition-colors ${
                        passed ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {passed ? (
                        <Check size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Circle size={12} className="shrink-0 text-slate-400 opacity-60" />
                      )}
                      <span>{rule.label}</span>
                    </div>
                  );
                })}
                <div
                  className={`flex items-center gap-2 text-xs pt-0.5 transition-colors ${
                    isSecurityPasswordsMatch
                      ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {isSecurityPasswordsMatch ? (
                    <Check size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Circle size={12} className="shrink-0 text-slate-400 opacity-60" />
                  )}
                  <span>Passwords match</span>
                </div>
              </div>

              {/* Sign out others checkbox */}
              <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={logoutOthers}
                  onChange={(e) => setLogoutOthers(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                />
                <span className="font-medium">Sign out of all other browsers and devices</span>
              </label>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={securitySaving || !isAllSecurityRulesPassed || !isSecurityPasswordsMatch}
                  className="h-10 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {securitySaving ? <RefreshCw size={14} className="animate-spin" /> : null}
                  <span>Update Password</span>
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      )}

      {/* ────────────────── TAB 3: DEVICES & SESSIONS ────────────────── */}
      {activeTab === 'devices' && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Active Sessions</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                These devices are currently authenticated and holding active refresh tokens.
              </p>
            </div>
            {sessions.filter((s) => !s.isCurrent).length > 0 && (
              <button
                type="button"
                onClick={handleRevokeAllOtherSessions}
                disabled={revokingAllOthers}
                className="h-9 px-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-300 text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors flex items-center gap-2 cursor-pointer"
              >
                {revokingAllOthers ? <RefreshCw size={14} className="animate-spin" /> : <LogOut size={14} />}
                <span>Sign Out All Other Devices</span>
              </button>
            )}
          </div>

          {sessionsLoading ? (
            <div className="p-8 text-center text-slate-400">
              <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
              <p className="text-xs">Loading active sessions...</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-white dark:bg-[#121622] rounded-2xl border border-slate-200 dark:border-slate-800 text-xs">
              No other active sessions detected.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {sessions.map((s) => {
                const isMobile = /iPhone|Android|Mobile/i.test(s.userAgent || s.deviceLabel);
                return (
                  <div
                    key={s.id}
                    className="p-4 rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                        {isMobile ? <Smartphone size={20} /> : <Laptop size={20} />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">{s.deviceLabel}</span>
                          {s.isCurrent && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                              Current Device
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>IP: {s.ipAddress}</span>
                          <span>&bull;</span>
                          <span>Active {new Date(s.lastActive).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    {!s.isCurrent && (
                      <button
                        type="button"
                        onClick={() => handleRevokeSession(s.id)}
                        disabled={revokingSessionId === s.id}
                        className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-200 dark:hover:border-red-900/50 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-red-600 transition-colors cursor-pointer"
                      >
                        {revokingSessionId === s.id ? 'Signing out...' : 'Sign Out'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      )}

      {/* ────────────────── TAB 4: SIGN-IN ACTIVITY ────────────────── */}
      {activeTab === 'activity' && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Recent Sign-In Activity</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Review recent authentications and security events on your account.
            </p>
          </div>

          {activityLoading ? (
            <div className="p-8 text-center text-slate-400">
              <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
              <p className="text-xs">Loading sign-in activity...</p>
            </div>
          ) : activityLogs.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-white dark:bg-[#121622] rounded-2xl border border-slate-200 dark:border-slate-800 text-xs">
              No recent sign-in events recorded.
            </div>
          ) : (
            <div className="bg-white dark:bg-[#121622] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Date & Time</th>
                      <th className="px-4 py-3">Device / Browser</th>
                      <th className="px-4 py-3">IP Address</th>
                      <th className="px-4 py-3">Portal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {activityLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] ${
                              log.status === 'SUCCESS'
                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                                : 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                            }`}
                          >
                            {log.status === 'SUCCESS' ? <Check size={10} /> : <AlertCircle size={10} />}
                            {log.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-medium">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300 font-medium">{log.deviceLabel}</td>
                        <td className="px-4 py-3 font-mono text-slate-500 dark:text-slate-400">{log.ipAddress}</td>
                        <td className="px-4 py-3 capitalize text-slate-600 dark:text-slate-300 font-medium">
                          {log.portal}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* ────────────────── EMAIL CHANGE OTP MODAL ────────────────── */}
      <AnimatePresence>
        {emailModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white dark:bg-[#121622] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Change Email Address</h3>
                <button
                  type="button"
                  onClick={() => setEmailModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 text-sm font-semibold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {emailOtpError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs font-medium flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{emailOtpError}</span>
                </div>
              )}

              {emailOtpStep === 1 ? (
                <form onSubmit={handleRequestEmailOtp} className="space-y-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Enter your new email address. We will dispatch a 6-digit confirmation code before applying the change.
                  </p>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      New Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="e.g. name@company.com"
                      className="w-full h-10 px-3 text-sm bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                      autoFocus
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEmailModalOpen(false)}
                      className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={emailOtpLoading}
                      className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {emailOtpLoading ? <RefreshCw size={13} className="animate-spin" /> : null}
                      <span>Send Code</span>
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleVerifyEmailOtp} className="space-y-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Enter the 6-digit verification code sent to <strong>{newEmail}</strong>.
                  </p>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Verification Code
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      required
                      value={emailOtpCode}
                      onChange={(e) => setEmailOtpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className="w-full h-12 px-3 text-center font-mono text-2xl font-bold tracking-widest bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                      autoFocus
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <button
                      type="button"
                      onClick={() => setEmailOtpStep(1)}
                      className="hover:underline cursor-pointer"
                    >
                      Change email
                    </button>
                    <button
                      type="button"
                      onClick={handleRequestEmailOtp}
                      disabled={emailOtpCooldown > 0 || emailOtpLoading}
                      className="font-medium text-blue-600 hover:underline disabled:opacity-50 cursor-pointer"
                    >
                      {emailOtpCooldown > 0 ? `Resend in ${emailOtpCooldown}s` : 'Resend code'}
                    </button>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEmailModalOpen(false)}
                      className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={emailOtpLoading || emailOtpCode.length < 6}
                      className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {emailOtpLoading ? <RefreshCw size={13} className="animate-spin" /> : null}
                      <span>Confirm & Update</span>
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
