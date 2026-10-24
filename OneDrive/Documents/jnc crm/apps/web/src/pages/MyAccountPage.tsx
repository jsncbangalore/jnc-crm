/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../services/api';
import {
  User,
  Shield,
  ShieldAlert,
  ShieldCheck,
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
  Copy,
  Download,
  X,
} from 'lucide-react';
import { drawQrToCanvas } from '../utils/qr';
import { openCookiePreferencesPanel } from '../utils/cookieConsent';

interface SessionItem {
  id: string;
  deviceLabel: string;
  ipAddress: string;
  userAgent?: string;
  lastActive: string;
  createdAt: string;
  isCurrent: boolean;
}

interface TrustedDeviceItem {
  id: string;
  label: string;
  ip: string;
  userAgent?: string;
  expiresAt: string;
  lastUsedAt: string;
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
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'devices' | 'activity'>('profile');

  // Suspicious activity reporting state ("This wasn't me")
  const [suspiciousModalOpen, setSuspiciousModalOpen] = useState(false);
  const [reportingSuspicious, setReportingSuspicious] = useState(false);
  const [suspiciousError, setSuspiciousError] = useState('');

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
  const [currentPasswordForEmail, setCurrentPasswordForEmail] = useState('');

  // Mobile Phone Change OTP modal state
  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [phoneOtpCode, setPhoneOtpCode] = useState('');
  const [phoneOtpStep, setPhoneOtpStep] = useState<1 | 2>(1);
  const [phoneOtpLoading, setPhoneOtpLoading] = useState(false);
  const [phoneOtpError, setPhoneOtpError] = useState('');
  const [phoneOtpCooldown, setPhoneOtpCooldown] = useState(0);
  const [currentPasswordForPhone, setCurrentPasswordForPhone] = useState('');

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
    { id: 'notCommon', label: 'Cannot be a commonly guessed password' },
    { id: 'noPersonalInfo', label: 'Cannot contain parts of your name or email' },
  ]);

  // Two-Factor Authentication state
  const [twoFactorStatus, setTwoFactorStatus] = useState<{
    enabled: boolean;
    method: 'totp' | 'email' | null;
    enabledAt: string | null;
    backupCodesCount: number;
    policyRequired: boolean;
    isEnforcedRole: boolean;
    tenantRequired: boolean;
  } | null>(null);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);

  // Setup 2FA Modal
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupData, setSetupData] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [setupCodeDigits, setSetupCodeDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [setupError, setSetupError] = useState('');
  const [setupSuccessBackupCodes, setSetupSuccessBackupCodes] = useState<string[] | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [backupCodesCopied, setBackupCodesCopied] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const setupInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Regenerate Backup Codes Modal
  const [regenModalOpen, setRegenModalOpen] = useState(false);
  const [regenPassword, setRegenPassword] = useState('');
  const [regenCode, setRegenCode] = useState('');
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenError, setRegenError] = useState('');
  const [newBackupCodes, setNewBackupCodes] = useState<string[] | null>(null);

  // Disable 2FA Modal
  const [disableModalOpen, setDisableModalOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disableLoading, setDisableLoading] = useState(false);
  const [disableError, setDisableError] = useState('');

  // Devices tab state
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [revokingAllOthers, setRevokingAllOthers] = useState(false);

  // Trusted Devices state
  const [trustedDevices, setTrustedDevices] = useState<TrustedDeviceItem[]>([]);
  const [trustedDevicesLoading, setTrustedDevicesLoading] = useState(false);
  const [revokingDeviceId, setRevokingDeviceId] = useState<string | null>(null);
  const [revokingAllTrusted, setRevokingAllTrusted] = useState(false);

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

  // Load 2FA status when switching to Security tab
  useEffect(() => {
    if (activeTab === 'security') {
      loadTwoFactorStatus();
    }
  }, [activeTab]);

  // Load sessions and trusted devices when switching to Devices tab
  useEffect(() => {
    if (activeTab === 'devices') {
      loadSessions();
      loadTrustedDevices();
    }
  }, [activeTab]);

  // Render QR canvas whenever setupData updates
  useEffect(() => {
    if (setupModalOpen && setupData?.otpauthUrl && qrCanvasRef.current) {
      try {
        drawQrToCanvas(qrCanvasRef.current, setupData.otpauthUrl, {
          size: 200,
          margin: 2,
          colorDark: '#0F172A',
          colorLight: '#FFFFFF',
        });
      } catch (err) {}
    }
  }, [setupModalOpen, setupData]);

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

  // Phone OTP Cooldown timer
  useEffect(() => {
    if (phoneOtpCooldown <= 0) return;
    const t = setInterval(() => {
      setPhoneOtpCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [phoneOtpCooldown]);

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

  const loadTwoFactorStatus = async () => {
    setTwoFactorLoading(true);
    try {
      const res = await authApi.getTwoFactorStatus();
      if (res.data) {
        setTwoFactorStatus(res.data);
      }
    } catch {
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const loadTrustedDevices = async () => {
    setTrustedDevicesLoading(true);
    try {
      const res = await authApi.getTrustedDevices();
      if (Array.isArray(res.data)) {
        setTrustedDevices(res.data);
      }
    } catch {
    } finally {
      setTrustedDevicesLoading(false);
    }
  };

  const handleStartSetup = async () => {
    setSetupModalOpen(true);
    setSetupLoading(true);
    setSetupError('');
    setSetupSuccessBackupCodes(null);
    setSetupCodeDigits(['', '', '', '', '', '']);
    setSecretCopied(false);
    try {
      const res = await authApi.setupTwoFactor();
      if (res.data) {
        setSetupData({
          secret: res.data.secret,
          otpauthUrl: res.data.otpauthUrl,
        });
      }
    } catch (err: any) {
      setSetupError(err?.response?.data?.message || 'Failed to initialize 2-step verification.');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleConfirmSetup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = setupCodeDigits.join('').trim();
    if (code.length !== 6) {
      setSetupError('Please enter all 6 digits.');
      return;
    }
    setSetupLoading(true);
    setSetupError('');
    try {
      const res = await authApi.enableTwoFactor({ code });
      setSetupSuccessBackupCodes(res.data?.backupCodes || []);
      await loadTwoFactorStatus();
    } catch (err: any) {
      setSetupError(err?.response?.data?.message || 'Invalid verification code. Please check and try again.');
      setSetupCodeDigits(['', '', '', '', '', '']);
      setupInputRefs.current[0]?.focus();
    } finally {
      setSetupLoading(false);
    }
  };

  const handleOpenRegenerateModal = () => {
    setRegenModalOpen(true);
    setRegenPassword('');
    setRegenCode('');
    setRegenError('');
    setNewBackupCodes(null);
  };

  const handleConfirmRegenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regenPassword || !regenCode.trim()) {
      setRegenError('Password and current 6-digit code are required.');
      return;
    }
    setRegenLoading(true);
    setRegenError('');
    try {
      const res = await authApi.regenerateBackupCodes({
        currentPass: regenPassword,
        code: regenCode.trim(),
      });
      setNewBackupCodes(res.data?.backupCodes || []);
      await loadTwoFactorStatus();
    } catch (err: any) {
      setRegenError(err?.response?.data?.message || 'Failed to regenerate backup codes.');
    } finally {
      setRegenLoading(false);
    }
  };

  const handleOpenDisableModal = () => {
    setDisableModalOpen(true);
    setDisablePassword('');
    setDisableCode('');
    setDisableError('');
  };

  const handleConfirmDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disablePassword || !disableCode.trim()) {
      setDisableError('Password and current 6-digit code are required.');
      return;
    }
    setDisableLoading(true);
    setDisableError('');
    try {
      await authApi.disableTwoFactor({
        currentPass: disablePassword,
        code: disableCode.trim(),
      });
      setDisableModalOpen(false);
      await loadTwoFactorStatus();
      setSecurityMessage({ type: 'success', text: '2-step verification has been disabled.' });
    } catch (err: any) {
      setDisableError(err?.response?.data?.message || 'Failed to disable 2-step verification.');
    } finally {
      setDisableLoading(false);
    }
  };

  const handleRevokeTrustedDevice = async (id: string) => {
    setRevokingDeviceId(id);
    try {
      await authApi.revokeTrustedDevice(id);
      await loadTrustedDevices();
    } catch {
    } finally {
      setRevokingDeviceId(null);
    }
  };

  const handleRevokeAllTrustedDevices = async () => {
    setRevokingAllTrusted(true);
    try {
      await authApi.revokeAllTrustedDevices();
      await loadTrustedDevices();
    } catch {
    } finally {
      setRevokingAllTrusted(false);
    }
  };

  // ─── Suspicious Activity Handler ("This wasn't me") ────────────────────────
  const handleConfirmThisWasntMe = async () => {
    setReportingSuspicious(true);
    setSuspiciousError('');
    try {
      const res = await authApi.reportSuspiciousActivity();
      const targetEmail = res.data?.email || user?.email || '';
      await logout();
      try {
        sessionStorage.setItem('crm_security_alert_email', targetEmail);
      } catch {}
      navigate('/forgot-password?step=2');
    } catch (err: any) {
      const targetEmail = user?.email || '';
      await logout();
      try {
        sessionStorage.setItem('crm_security_alert_email', targetEmail);
      } catch {}
      navigate('/forgot-password?step=2');
    } finally {
      setReportingSuspicious(false);
      setSuspiciousModalOpen(false);
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
    if (!currentPasswordForEmail) {
      setEmailOtpError('Please enter your current password to change your email address.');
      return;
    }
    if (!newEmail.trim() || !newEmail.includes('@')) {
      setEmailOtpError('Please enter a valid email address.');
      return;
    }
    setEmailOtpError('');
    setEmailOtpLoading(true);
    try {
      const res = await authApi.requestEmailChangeOtp(currentPasswordForEmail, newEmail.trim());
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
      setCurrentPasswordForEmail('');
      setProfileMessage({ type: 'success', text: 'Email updated successfully. Please refresh.' });
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Verification code is incorrect or expired.';
      setEmailOtpError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setEmailOtpLoading(false);
    }
  };

  // ─── Mobile Phone Change OTP Handlers ───────────────────────────────────────
  const handleRequestPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPasswordForPhone) {
      setPhoneOtpError('Please enter your current password to change your mobile number.');
      return;
    }
    const digits = newPhone.replace(/\D/g, '');
    if (digits.length < 10) {
      setPhoneOtpError('Please enter a valid 10-digit mobile number.');
      return;
    }
    setPhoneOtpError('');
    setPhoneOtpLoading(true);
    try {
      const res = await authApi.requestPhoneChangeOtp(currentPasswordForPhone, newPhone.trim());
      setPhoneOtpCooldown(res.data?.resendAfterSeconds ?? 60);
      setPhoneOtpStep(2);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to dispatch verification code.';
      setPhoneOtpError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setPhoneOtpLoading(false);
    }
  };

  const handleVerifyPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneOtpCode.trim().length !== 6) {
      setPhoneOtpError('Please enter the 6-digit verification code.');
      return;
    }
    setPhoneOtpError('');
    setPhoneOtpLoading(true);
    try {
      const res = await authApi.verifyPhoneChangeOtp(newPhone.trim(), phoneOtpCode.trim());
      setPhoneModalOpen(false);
      setPhoneOtpStep(1);
      setPhoneOtpCode('');
      setCurrentPasswordForPhone('');
      setPhone(res.data?.phone || newPhone);
      setProfileMessage({ type: 'success', text: 'Mobile number updated successfully. Refreshing...' });
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Invalid or expired verification code.';
      setPhoneOtpError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setPhoneOtpLoading(false);
    }
  };

  // ─── Security Handlers ──────────────────────────────────────────────────────
  const evaluateRule = (ruleId: string, pwd: string): boolean => {
    if (!pwd) return false;
    switch (ruleId) {
      case 'minLength':
        return pwd.length >= 12;
      case 'notCommon': {
        const lower = pwd.toLowerCase();
        const commonList = [
          'password', 'password123', '123456789012', 'admin12345678', 'welcome12345',
          'administrator', 'qwertyuiop12', 'iloveyou1234', 'changeme1234', 'letmein12345',
          'crmadmin1234', 'company12345', 'supersecret1', 'passw0rd1234',
        ];
        return pwd.length >= 12 && !commonList.some((c) => lower.includes(c));
      }
      case 'noPersonalInfo': {
        const em = user?.email || '';
        const nm = user?.name || '';
        const lower = pwd.toLowerCase();
        if (em.includes('@')) {
          const prefix = em.split('@')[0].toLowerCase();
          if (prefix.length >= 3 && lower.includes(prefix)) return false;
        }
        if (nm) {
          const nameParts = nm.toLowerCase().split(/\s+/).filter((p) => p.length >= 3);
          if (nameParts.some((p) => lower.includes(p))) return false;
        }
        return true;
      }
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
                </div>

                {/* Mobile Phone Section with OTP */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Registered Mobile Number
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      disabled
                      value={phone || user?.phone || 'No mobile number registered'}
                      className="flex-1 h-10 px-3 text-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-400 font-mono cursor-not-allowed"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setPhoneModalOpen(true);
                        setPhoneOtpStep(1);
                        setNewPhone('');
                        setPhoneOtpError('');
                        setCurrentPasswordForPhone('');
                      }}
                      className="h-10 px-3.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      {phone || user?.phone ? 'Change Mobile' : 'Set Mobile'}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                    Setting or changing your mobile number requires your current password and 6-digit OTP verification sent to your registered email.
                  </p>
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

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between gap-3">
                    <div>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Cookie & Storage Preferences</span>
                      <p className="text-xs font-semibold text-slate-900 dark:text-white mt-0.5">
                        Manage theme, dashboard layout, and local data permissions
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openCookiePreferencesPanel()}
                      className="py-1.5 px-3 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-xs shrink-0 cursor-pointer"
                    >
                      Cookie settings
                    </button>
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

          {/* Two-Factor Authentication Card */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    twoFactorStatus?.enabled
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400'
                      : 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">2-Step Verification</h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        twoFactorStatus?.enabled
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {twoFactorStatus?.enabled ? 'Active' : 'Not Configured'}
                    </span>
                    {twoFactorStatus?.policyRequired && (
                      <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                        Enforced by Policy
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Protect your account with a time-based one-time password (TOTP) from an authenticator app.
                  </p>
                </div>
              </div>

              <div>
                {!twoFactorStatus?.enabled ? (
                  <button
                    type="button"
                    onClick={handleStartSetup}
                    disabled={twoFactorLoading}
                    className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <ShieldCheck size={15} />
                    <span>Set Up 2-Step Verification</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleOpenRegenerateModal}
                      className="h-9 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <KeyRound size={14} />
                      <span>Regenerate Backup Codes</span>
                    </button>
                    {!twoFactorStatus?.policyRequired && (
                      <button
                        type="button"
                        onClick={handleOpenDisableModal}
                        className="h-9 px-3.5 rounded-xl border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs font-semibold text-red-600 dark:text-red-300 transition-colors cursor-pointer"
                      >
                        <span>Disable</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {twoFactorStatus?.enabled ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[11px] text-slate-400 block font-medium">Primary Method</span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5 flex items-center gap-1.5">
                    <Smartphone size={14} className="text-blue-500" /> Authenticator App (TOTP)
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[11px] text-slate-400 block font-medium">Backup Recovery Codes</span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5 flex items-center gap-1.5">
                    <KeyRound size={14} className="text-amber-500" />
                    {twoFactorStatus.backupCodesCount} codes remaining
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[11px] text-slate-400 block font-medium">Activated</span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                    {twoFactorStatus.enabledAt ? new Date(twoFactorStatus.enabledAt).toLocaleDateString() : 'Active'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                When 2-step verification is active, signing in requires your password plus a one-time verification code from Google Authenticator, Microsoft Authenticator, 1Password, or any standard RFC 6238 TOTP client.
              </div>
            )}
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

          {/* Trusted Devices Section */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Trusted Devices</h3>
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                    30-Day Bypass
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Browsers remembered via "Trust this device for 30 days". These skip 2-step verification during login.
                </p>
              </div>
              {trustedDevices.length > 0 && (
                <button
                  type="button"
                  onClick={handleRevokeAllTrustedDevices}
                  disabled={revokingAllTrusted}
                  className="h-9 px-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-300 text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors flex items-center gap-2 cursor-pointer"
                >
                  {revokingAllTrusted ? <RefreshCw size={14} className="animate-spin" /> : <LogOut size={14} />}
                  <span>Revoke All Trusted Devices</span>
                </button>
              )}
            </div>

            {trustedDevicesLoading ? (
              <div className="p-8 text-center text-slate-400">
                <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                <p className="text-xs">Loading trusted devices...</p>
              </div>
            ) : trustedDevices.length === 0 ? (
              <div className="p-8 text-center text-slate-400 bg-white dark:bg-[#121622] rounded-2xl border border-slate-200 dark:border-slate-800 text-xs">
                No trusted devices registered. Check "Trust this device for 30 days" during login to remember a device.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {trustedDevices.map((d) => {
                  const isMobile = /iPhone|Android|Mobile/i.test(d.userAgent || d.label);
                  return (
                    <div
                      key={d.id}
                      className="p-4 rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                          {isMobile ? <Smartphone size={20} /> : <Laptop size={20} />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900 dark:text-white">{d.label}</span>
                            <span className="text-xs font-mono text-slate-400 dark:text-slate-500">IP: {d.ip}</span>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                            <span>Last used: {new Date(d.lastUsedAt).toLocaleDateString()}</span>
                            <span>&bull;</span>
                            <span>Expires: {new Date(d.expiresAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRevokeTrustedDevice(d.id)}
                        disabled={revokingDeviceId === d.id}
                        className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-200 dark:border-red-900/50 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-red-600 transition-colors cursor-pointer"
                      >
                        {revokingDeviceId === d.id ? 'Removing...' : 'Remove'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ────────────────── TAB 4: SIGN-IN ACTIVITY ────────────────── */}
      {activeTab === 'activity' && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Recent Sign-In Activity</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Review recent authentications and security events on your account.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSuspiciousModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/50 hover:bg-red-100 dark:hover:bg-red-900/60 transition-colors shadow-xs cursor-pointer shrink-0"
            >
              <ShieldAlert size={15} />
              This wasn't me
            </button>
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
                  aria-label="Close"
                >
                  <X size={16} />
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
                      Current Password
                    </label>
                    <input
                      type="password"
                      required
                      value={currentPasswordForEmail}
                      onChange={(e) => setCurrentPasswordForEmail(e.target.value)}
                      placeholder="Enter your current password"
                      className="w-full h-10 px-3 text-sm bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      New Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="e.g. name@example.com"
                      className="w-full h-10 px-3 text-sm bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
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

      {/* ────────────────── PHONE CHANGE OTP MODAL ────────────────── */}
      <AnimatePresence>
        {phoneModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white dark:bg-[#121622] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {user?.phone ? 'Change Mobile Number' : 'Set Mobile Number'}
                </h3>
                <button
                  type="button"
                  onClick={() => setPhoneModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 text-sm font-semibold cursor-pointer"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              {phoneOtpError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs font-medium flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{phoneOtpError}</span>
                </div>
              )}

              {phoneOtpStep === 1 ? (
                <form onSubmit={handleRequestPhoneOtp} className="space-y-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    To protect your account, changing your mobile number requires your current password. A 6-digit verification code will be sent to your registered email address ({user?.email}).
                  </p>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Current Password
                    </label>
                    <input
                      type="password"
                      required
                      value={currentPasswordForPhone}
                      onChange={(e) => setCurrentPasswordForPhone(e.target.value)}
                      placeholder="Enter your current password"
                      className="w-full h-10 px-3 text-sm bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      New Mobile Number
                    </label>
                    <div className="relative flex rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] overflow-hidden focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/20">
                      <div className="flex items-center px-3 bg-slate-50 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 text-slate-500 font-semibold text-xs select-none">
                        +91
                      </div>
                      <input
                        type="tel"
                        required
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="10-digit mobile number"
                        className="flex-1 h-10 px-3 text-sm font-mono bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                      Enter your 10-digit number. Formats with +91, spaces, dashes, or a leading 0 are automatically accepted.
                    </p>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setPhoneModalOpen(false)}
                      className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={phoneOtpLoading}
                      className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {phoneOtpLoading ? <RefreshCw size={13} className="animate-spin" /> : null}
                      <span>Send Verification Code</span>
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleVerifyPhoneOtp} className="space-y-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Enter the 6-digit verification code sent to your registered email <strong>{user?.email}</strong>.
                  </p>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Verification Code
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      required
                      value={phoneOtpCode}
                      onChange={(e) => setPhoneOtpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className="w-full h-12 px-3 text-center font-mono text-2xl font-bold tracking-widest bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                      autoFocus
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <button
                      type="button"
                      onClick={() => setPhoneOtpStep(1)}
                      className="hover:underline cursor-pointer"
                    >
                      Change number
                    </button>
                    <button
                      type="button"
                      onClick={handleRequestPhoneOtp}
                      disabled={phoneOtpCooldown > 0 || phoneOtpLoading}
                      className="font-medium text-blue-600 hover:underline disabled:opacity-50 cursor-pointer"
                    >
                      {phoneOtpCooldown > 0 ? `Resend in ${phoneOtpCooldown}s` : 'Resend code'}
                    </button>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setPhoneModalOpen(false)}
                      className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={phoneOtpLoading || phoneOtpCode.length < 6}
                      className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {phoneOtpLoading ? <RefreshCw size={13} className="animate-spin" /> : null}
                      <span>Confirm & Update</span>
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ────────────────── SUSPICIOUS ACTIVITY CONFIRMATION MODAL ────────────────── */}
      <AnimatePresence>
        {suspiciousModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white dark:bg-[#121622] rounded-2xl border border-red-200 dark:border-red-900/50 shadow-2xl p-6 space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                  <ShieldAlert size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Suspicious Sign-In Alert</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Did you notice an unrecognized sign-in event?</p>
                </div>
              </div>

              {suspiciousError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs font-medium flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{suspiciousError}</span>
                </div>
              )}

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-2">
                <p>Clicking <strong>"Confirm & Sign Out All Devices"</strong> will:</p>
                <ul className="list-disc list-inside space-y-1 text-slate-500 dark:text-slate-400">
                  <li>Immediately sign out all active sessions across all devices.</li>
                  <li>Log a security alert in the audit log for administrator review.</li>
                  <li>Dispatch a 6-digit verification code to <strong>{user?.email}</strong> and send you directly to reset your password.</li>
                </ul>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSuspiciousModalOpen(false)}
                  disabled={reportingSuspicious}
                  className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmThisWasntMe}
                  disabled={reportingSuspicious}
                  className="h-9 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {reportingSuspicious ? <RefreshCw size={13} className="animate-spin" /> : <ShieldAlert size={14} />}
                  <span>{reportingSuspicious ? 'Securing account...' : 'Confirm & Sign Out All'}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ────────────────── TWO-FACTOR SETUP MODAL ────────────────── */}
      <AnimatePresence>
        {setupModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-white dark:bg-[#121622] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4"
            >
              {setupSuccessBackupCodes ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <CheckCircle2 size={22} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        2-Step Verification Active
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Save your 10 backup recovery codes in a secure location.
                      </p>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 text-xs space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <ShieldAlert size={14} /> Keep these codes safe
                    </p>
                    <p className="text-[11px] leading-relaxed">
                      Store these one-time codes in a password manager or safe vault. Each code can be used once to access your account if you lose your authenticator. They will not be displayed again.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-2 text-center font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {setupSuccessBackupCodes.map((c, i) => (
                      <div key={i} className="p-1.5 rounded bg-white dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700/60 shadow-xs">
                        {c}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(setupSuccessBackupCodes.join('\n'));
                        setBackupCodesCopied(true);
                        setTimeout(() => setBackupCodesCopied(false), 2500);
                      }}
                      className="flex-1 h-9 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {backupCodesCopied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                      <span>{backupCodesCopied ? 'Copied' : 'Copy All'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const blob = new Blob(
                          [
                            `BACKUP RECOVERY CODES\n============================\nGenerated: ${new Date().toISOString()}\nKeep these codes safe and private. Each code can be used once.\n\n` +
                              setupSuccessBackupCodes.map((c, i) => `${i + 1}. ${c}`).join('\n') +
                              '\n',
                          ],
                          { type: 'text/plain;charset=utf-8' }
                        );
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `backup-codes-${Date.now()}.txt`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="flex-1 h-9 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Download size={14} />
                      <span>Download (.txt)</span>
                    </button>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setSetupModalOpen(false)}
                      className="h-9 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                      <ShieldCheck size={22} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        Set Up 2-Step Verification
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, etc.).
                      </p>
                    </div>
                  </div>

                  {setupError && (
                    <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs font-medium flex items-center gap-2">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{setupError}</span>
                    </div>
                  )}

                  {setupLoading && !setupData ? (
                    <div className="p-8 text-center text-slate-400 space-y-2">
                      <RefreshCw size={24} className="animate-spin mx-auto text-blue-600" />
                      <p className="text-xs">Generating secure authenticator key...</p>
                    </div>
                  ) : (
                    <>
                      {/* QR Code Canvas */}
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center space-y-3">
                        <div className="p-2 bg-white rounded-xl shadow-xs border border-slate-100">
                          <canvas ref={qrCanvasRef} className="rounded-lg" />
                        </div>
                        <div className="text-center w-full">
                          <span className="text-[11px] font-medium text-slate-400 block mb-1">
                            Or enter this setup key manually into your authenticator:
                          </span>
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs font-bold text-slate-900 dark:text-slate-100 select-all">
                            <span>{setupData?.secret || 'Generating...'}</span>
                            <button
                              type="button"
                              onClick={() => {
                                if (setupData?.secret) {
                                  navigator.clipboard.writeText(setupData.secret);
                                  setSecretCopied(true);
                                  setTimeout(() => setSecretCopied(false), 2500);
                                }
                              }}
                              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                              title="Copy Key"
                            >
                              {secretCopied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* 6 Digit Confirmation */}
                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 text-center">
                          Enter the 6-digit verification code from your authenticator:
                        </label>
                        <div className="flex items-center justify-center gap-2">
                          {setupCodeDigits.map((digit, idx) => (
                            <input
                              key={idx}
                              ref={(el) => (setupInputRefs.current[idx] = el)}
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={1}
                              value={digit}
                              onChange={(e) => {
                                const clean = e.target.value.replace(/\D/g, '');
                                const newDigits = [...setupCodeDigits];
                                if (!clean) {
                                  newDigits[idx] = '';
                                  setSetupCodeDigits(newDigits);
                                  return;
                                }
                                newDigits[idx] = clean.slice(-1);
                                setSetupCodeDigits(newDigits);
                                if (idx < 5) {
                                  setupInputRefs.current[idx + 1]?.focus();
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Backspace' && !setupCodeDigits[idx] && idx > 0) {
                                  setupInputRefs.current[idx - 1]?.focus();
                                }
                              }}
                              onPaste={(e) => {
                                e.preventDefault();
                                const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
                                if (!pasted) return;
                                const newDigits = [...setupCodeDigits];
                                for (let i = 0; i < pasted.length; i++) {
                                  newDigits[i] = pasted[i];
                                }
                                setSetupCodeDigits(newDigits);
                                const nextIdx = Math.min(pasted.length, 5);
                                setupInputRefs.current[nextIdx]?.focus();
                              }}
                              disabled={setupLoading}
                              className="w-10 h-11 text-center text-lg font-bold bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                            />
                          ))}
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setSetupModalOpen(false)}
                          disabled={setupLoading}
                          className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConfirmSetup()}
                          disabled={setupLoading || setupCodeDigits.join('').length !== 6}
                          className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {setupLoading ? <RefreshCw size={13} className="animate-spin" /> : <ShieldCheck size={14} />}
                          <span>Confirm & Enable</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ────────────────── REGENERATE BACKUP CODES MODAL ────────────────── */}
      <AnimatePresence>
        {regenModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white dark:bg-[#121622] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <KeyRound size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Regenerate Backup Codes
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Replace existing backup recovery codes with 10 new one-time codes.
                  </p>
                </div>
              </div>

              {regenError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs font-medium flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{regenError}</span>
                </div>
              )}

              {newBackupCodes ? (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-2 text-center font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {newBackupCodes.map((c, i) => (
                      <div key={i} className="p-1.5 rounded bg-white dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700/60 shadow-xs">
                        {c}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(newBackupCodes.join('\n'));
                        setBackupCodesCopied(true);
                        setTimeout(() => setBackupCodesCopied(false), 2500);
                      }}
                      className="flex-1 h-9 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {backupCodesCopied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                      <span>{backupCodesCopied ? 'Copied' : 'Copy All'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const blob = new Blob(
                          [
                            `BACKUP RECOVERY CODES\n============================\nGenerated: ${new Date().toISOString()}\n\n` +
                              newBackupCodes.map((c, i) => `${i + 1}. ${c}`).join('\n') +
                              '\n',
                          ],
                          { type: 'text/plain;charset=utf-8' }
                        );
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `backup-codes-${Date.now()}.txt`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="flex-1 h-9 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Download size={14} />
                      <span>Download (.txt)</span>
                    </button>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setRegenModalOpen(false)}
                      className="h-9 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleConfirmRegenerate} className="space-y-3">
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 text-xs">
                    All existing backup codes will immediately stop working.
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Current Password
                    </label>
                    <input
                      type="password"
                      required
                      value={regenPassword}
                      onChange={(e) => setRegenPassword(e.target.value)}
                      placeholder="Enter current password"
                      className="w-full h-10 px-3 text-sm bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Authenticator Code (6 Digits)
                    </label>
                    <input
                      type="text"
                      required
                      inputMode="numeric"
                      maxLength={6}
                      value={regenCode}
                      onChange={(e) => setRegenCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="e.g. 123456"
                      className="w-full h-10 px-3 text-sm font-mono bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setRegenModalOpen(false)}
                      disabled={regenLoading}
                      className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={regenLoading || !regenPassword || regenCode.length !== 6}
                      className="h-9 px-4 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {regenLoading ? <RefreshCw size={13} className="animate-spin" /> : <KeyRound size={14} />}
                      <span>Generate New Codes</span>
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ────────────────── DISABLE 2FA MODAL ────────────────── */}
      <AnimatePresence>
        {disableModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white dark:bg-[#121622] rounded-2xl border border-red-200 dark:border-red-900/50 shadow-2xl p-6 space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                  <ShieldAlert size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Disable 2-Step Verification
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    This removes the authenticator requirement and deletes all backup recovery codes.
                  </p>
                </div>
              </div>

              {disableError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs font-medium flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{disableError}</span>
                </div>
              )}

              <form onSubmit={handleConfirmDisable} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    required
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full h-10 px-3 text-sm bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Authenticator Code (6 Digits)
                  </label>
                  <input
                    type="text"
                    required
                    inputMode="numeric"
                    maxLength={6}
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 123456"
                    className="w-full h-10 px-3 text-sm font-mono bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setDisableModalOpen(false)}
                    disabled={disableLoading}
                    className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={disableLoading || !disablePassword || disableCode.length !== 6}
                    className="h-9 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {disableLoading ? <RefreshCw size={13} className="animate-spin" /> : <ShieldAlert size={14} />}
                    <span>Disable 2-Step</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
