/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useRef, useEffect } from 'react';
import {
  ShieldCheck,
  Smartphone,
  Mail,
  KeyRound,
  Copy,
  Check,
  Download,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { authApi, platformAuthApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { drawQrToCanvas } from '../../utils/qr';

interface TwoFactorChallengeProps {
  loginTicket: string;
  allowedMethods: ('totp' | 'email')[];
  portal?: 'company' | 'platform';
  twoFactorGracePeriod?: { active: boolean; daysRemaining: number; deadline: string } | null;
  forcedSetup?: boolean;
  setupToken?: string;
  onSuccess: (destination: string) => void;
  onBack: () => void;
}

export default function TwoFactorChallenge({
  loginTicket,
  allowedMethods,
  portal = 'company',
  twoFactorGracePeriod,
  forcedSetup = false,
  setupToken,
  onSuccess,
  onBack,
}: TwoFactorChallengeProps) {
  const { verifyTwoFactor, verifyPlatformTwoFactor } = useAuth();

  // Mode: 'code' (6-box OTP), 'backup' (alphanumeric backup code), or 'setup'
  const [mode, setMode] = useState<'code' | 'backup' | 'setup'>(forcedSetup ? 'setup' : 'code');
  const [codeDigits, setCodeDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [backupCode, setBackupCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(true);
  const [activeMethod, setActiveMethod] = useState<'totp' | 'email'>(allowedMethods.includes('totp') ? 'totp' : 'email');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailStatus, setEmailStatus] = useState<{ loading: boolean; message: string; isError?: boolean }>({
    loading: false,
    message: '',
  });

  // Forced setup state
  const [setupData, setSetupData] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupCodeDigits, setSetupCodeDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [generatedBackupCodes, setGeneratedBackupCodes] = useState<string[] | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [backupCopied, setBackupCopied] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const setupInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Focus first digit box on mount
  useEffect(() => {
    if (mode === 'code') {
      inputRefs.current[0]?.focus();
    }
  }, [mode]);

  // Load setup data if in forced setup
  useEffect(() => {
    if (mode === 'setup' && !setupData) {
      let isMounted = true;
      setSetupLoading(true);
      setError('');

      // Temporarily store setupToken in axios headers if provided
      const prevAuth = authApi;
      authApi
        .setupTwoFactor()
        .then((res) => {
          if (isMounted && res.data) {
            setSetupData({
              secret: res.data.secret,
              otpauthUrl: res.data.otpauthUrl,
            });
          }
        })
        .catch((err) => {
          if (isMounted) {
            setError(err?.response?.data?.message || 'Failed to initialize 2-step verification setup.');
          }
        })
        .finally(() => {
          if (isMounted) setSetupLoading(false);
        });

      return () => {
        isMounted = false;
      };
    }
  }, [mode, setupData]);

  // Render QR code to canvas whenever setupData arrives
  useEffect(() => {
    if (setupData?.otpauthUrl && canvasRef.current) {
      try {
        drawQrToCanvas(canvasRef.current, setupData.otpauthUrl, {
          size: 200,
          margin: 2,
          colorDark: '#0F172A',
          colorLight: '#FFFFFF',
        });
      } catch (err) {
        // Fallback or ignore
      }
    }
  }, [setupData]);

  // ── Input box change handling ────────────────────────────────────────────────
  const handleDigitChange = (index: number, val: string, isSetup = false) => {
    const clean = val.replace(/\D/g, '');
    const targetDigits = isSetup ? [...setupCodeDigits] : [...codeDigits];
    const refs = isSetup ? setupInputRefs : inputRefs;
    const setDigits = isSetup ? setSetupCodeDigits : setCodeDigits;

    if (!clean) {
      targetDigits[index] = '';
      setDigits(targetDigits);
      return;
    }

    // Single digit entry
    targetDigits[index] = clean.slice(-1);
    setDigits(targetDigits);

    // Auto advance focus
    if (index < 5) {
      refs.current[index + 1]?.focus();
    } else {
      // Last digit filled, trigger submit if all 6 filled
      const full = targetDigits.join('');
      if (full.length === 6) {
        if (isSetup) {
          handleConfirmSetup(full);
        } else {
          handleSubmitCode(full);
        }
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>, isSetup = false) => {
    const targetDigits = isSetup ? setupCodeDigits : codeDigits;
    const refs = isSetup ? setupInputRefs : inputRefs;

    if (e.key === 'Backspace' && !targetDigits[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, isSetup = false) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const targetDigits = isSetup ? [...setupCodeDigits] : [...codeDigits];
    const refs = isSetup ? setupInputRefs : inputRefs;
    const setDigits = isSetup ? setSetupCodeDigits : setCodeDigits;

    for (let i = 0; i < pasted.length; i++) {
      targetDigits[i] = pasted[i];
    }
    setDigits(targetDigits);

    const focusIdx = Math.min(pasted.length, 5);
    refs.current[focusIdx]?.focus();

    if (pasted.length === 6) {
      if (isSetup) {
        handleConfirmSetup(pasted);
      } else {
        handleSubmitCode(pasted);
      }
    }
  };

  // ── Submit 6-digit Code ──────────────────────────────────────────────────────
  const handleSubmitCode = async (providedCode?: string) => {
    const finalCode = (providedCode || codeDigits.join('')).trim();
    if (finalCode.length !== 6) {
      setError('Please enter all 6 digits.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const verifyFn = portal === 'platform' ? verifyPlatformTwoFactor : verifyTwoFactor;
      const user = await verifyFn(loginTicket, finalCode, trustDevice);
      const destination = (user as any).redirectPath || (portal === 'platform' ? '/platform/companies' : '/');
      onSuccess(destination);
    } catch (err: any) {
      setError(
        err?.response?.data?.message || 'Invalid or expired verification code. Please try again.'
      );
      setCodeDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  // ── Submit Backup Code ───────────────────────────────────────────────────────
  const handleSubmitBackupCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = backupCode.trim().replace(/\s+/g, '');
    if (!clean) {
      setError('Please enter a backup code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const verifyFn = portal === 'platform' ? verifyPlatformTwoFactor : verifyTwoFactor;
      const user = await verifyFn(loginTicket, clean, trustDevice);
      const destination = (user as any).redirectPath || (portal === 'platform' ? '/platform/companies' : '/');
      onSuccess(destination);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Invalid backup code. Please check and try again.');
      setBackupCode('');
    } finally {
      setLoading(false);
    }
  };

  // ── Send Email OTP ───────────────────────────────────────────────────────────
  const handleSendEmailOtp = async () => {
    setEmailStatus({ loading: true, message: '' });
    setError('');

    try {
      const apiFn = portal === 'platform' ? platformAuthApi.sendTwoFactorEmail : authApi.sendTwoFactorEmail;
      const res = await apiFn({ loginTicket });
      setEmailStatus({
        loading: false,
        message: res.data?.message || 'A verification code has been sent to your email.',
        isError: false,
      });
      setActiveMethod('email');
      setCodeDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err: any) {
      setEmailStatus({
        loading: false,
        message: err?.response?.data?.message || 'Failed to send email verification code.',
        isError: true,
      });
    }
  };

  // ── Confirm Forced Setup ─────────────────────────────────────────────────────
  const handleConfirmSetup = async (providedCode?: string) => {
    const finalCode = (providedCode || setupCodeDigits.join('')).trim();
    if (finalCode.length !== 6) {
      setError('Please enter all 6 digits to verify setup.');
      return;
    }

    setSetupLoading(true);
    setError('');

    try {
      const { data } = await authApi.enableTwoFactor({ code: finalCode });
      if (data.backupCodes) {
        setGeneratedBackupCodes(data.backupCodes);
      } else {
        onSuccess(portal === 'platform' ? '/platform/companies' : '/');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Invalid code. Check your authenticator app and try again.');
      setSetupCodeDigits(['', '', '', '', '', '']);
      setupInputRefs.current[0]?.focus();
    } finally {
      setSetupLoading(false);
    }
  };

  const handleCopySecret = () => {
    if (!setupData?.secret) return;
    navigator.clipboard.writeText(setupData.secret);
    setSecretCopied(true);
    setTimeout(() => setSecretCopied(false), 2500);
  };

  const handleCopyBackupCodes = () => {
    if (!generatedBackupCodes) return;
    navigator.clipboard.writeText(generatedBackupCodes.join('\n'));
    setBackupCopied(true);
    setTimeout(() => setBackupCopied(false), 2500);
  };

  const handleDownloadBackupCodes = () => {
    if (!generatedBackupCodes) return;
    const blob = new Blob(
      [
        `CRM BACKUP RECOVERY CODES\n============================\nGenerated: ${new Date().toISOString()}\nKeep these codes safe and private. Each code can be used once.\n\n` +
          generatedBackupCodes.map((c, i) => `${i + 1}. ${c}`).join('\n') +
          '\n',
      ],
      { type: 'text/plain;charset=utf-8' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crm-backup-codes-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── FORCED SETUP SCREEN ─────────────────────────────────────────────────────
  if (mode === 'setup') {
    // If backup codes are generated, show them once before finishing
    if (generatedBackupCodes) {
      return (
        <div className="space-y-5">
          <div className="text-center space-y-1.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center mx-auto">
              <CheckCircle2 size={24} />
            </div>
            <h2 className="text-[24px] font-bold text-slate-900 dark:text-white">
              2-Step Verification Active
            </h2>
            <p className="text-[13px] text-slate-500 dark:text-slate-400">
              Save your backup recovery codes. These are your only safety net if you lose access to your device.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 text-xs space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <ShieldAlert size={14} /> Keep these codes safe
            </p>
            <p className="text-[11px] leading-relaxed">
              Store these 10 one-time codes in a password manager or secure vault. Each code can only be used once. They will not be shown again.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-2 text-center font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
            {generatedBackupCodes.map((c, i) => (
              <div key={i} className="p-1.5 rounded bg-white dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700/60 shadow-xs">
                {c}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyBackupCodes}
              className="flex-1 h-10 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {backupCopied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              <span>{backupCopied ? 'Copied' : 'Copy All'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadBackupCodes}
              className="flex-1 h-10 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download size={14} />
              <span>Download (.txt)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => onSuccess(portal === 'platform' ? '/platform/companies' : '/')}
            className="w-full h-11 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[15px] font-semibold transition-all shadow-sm cursor-pointer"
          >
            I Have Saved My Codes &mdash; Continue
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] font-medium text-[#2563EB] hover:underline mb-2 transition-colors cursor-pointer"
        >
          <ArrowLeft size={14} />
          Back to login
        </button>

        <div>
          <h2 className="text-[24px] font-bold text-slate-900 dark:text-white leading-tight">
            Set up 2-step verification
          </h2>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
            Your role or company policy requires 2-step verification. Scan the QR code with an authenticator app (e.g. Google Authenticator, Microsoft Authenticator, 1Password).
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] dark:bg-red-950/40 dark:border-red-900/60 dark:text-red-300 text-[13px] font-medium flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {setupLoading && !setupData ? (
          <div className="p-8 text-center text-slate-400 space-y-2">
            <RefreshCw size={24} className="animate-spin mx-auto text-[#2563EB]" />
            <p className="text-xs">Generating secure authenticator key...</p>
          </div>
        ) : (
          <>
            {/* QR Code Canvas */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center space-y-3">
              <div className="p-2 bg-white rounded-xl shadow-xs border border-slate-100">
                <canvas ref={canvasRef} className="rounded-lg" />
              </div>
              <div className="text-center w-full">
                <span className="text-[11px] font-medium text-slate-400 block mb-1">
                  Or enter this setup key manually into your authenticator:
                </span>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs font-bold text-slate-900 dark:text-slate-100 select-all">
                  <span>{setupData?.secret || 'Generating...'}</span>
                  <button
                    type="button"
                    onClick={handleCopySecret}
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
              <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 text-center">
                Enter the 6-digit verification code from your authenticator:
              </label>
              <div className="grid grid-cols-6 gap-2 sm:gap-2.5 w-full">
                {setupCodeDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => (setupInputRefs.current[idx] = el)}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value, true)}
                    onKeyDown={(e) => handleKeyDown(idx, e, true)}
                    onPaste={(e) => handlePaste(e, true)}
                    disabled={setupLoading}
                    className="w-full h-12 sm:h-14 text-center text-xl font-bold bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#243049] rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-[#2563EB] focus:ring-[3px] focus:ring-[#2563EB]/25 transition-all"
                  />
                ))}
              </div>
            </div>

            <button
              type="button"
              disabled={setupLoading || setupCodeDigits.join('').length !== 6}
              onClick={() => handleConfirmSetup()}
              className="w-full h-11 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-[15px] font-semibold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              {setupLoading ? <RefreshCw size={16} className="animate-spin" /> : <ShieldCheck size={18} />}
              <span>Verify & Complete Enrollment</span>
            </button>
          </>
        )}
      </div>
    );
  }

  // ─── NORMAL 2FA CHALLENGE SCREEN ───────────────────────────────────────────
  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-[13px] font-medium text-[#2563EB] hover:underline mb-2 transition-colors cursor-pointer"
      >
        <ArrowLeft size={14} />
        Back to password
      </button>

      <div>
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50 flex items-center justify-center">
            {mode === 'backup' ? <KeyRound size={22} /> : activeMethod === 'email' ? <Mail size={22} /> : <Smartphone size={22} />}
          </div>
          <h2 className="text-[28px] font-bold text-slate-900 dark:text-white leading-tight">
            2-Step Verification
          </h2>
        </div>
        <p className="text-[16px] text-slate-600 dark:text-slate-400 mt-2">
          {mode === 'backup'
            ? 'Enter one of your 12-character emergency backup recovery codes.'
            : activeMethod === 'email'
            ? 'Enter the 6-digit verification code sent to your email.'
            : 'Enter the 6-digit security code generated by your authenticator app.'}
        </p>
      </div>

      {/* Grace period notification */}
      {twoFactorGracePeriod?.active && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
          <Clock size={16} className="shrink-0 text-amber-600" />
          <span>
            <strong>Grace period active:</strong> You have {twoFactorGracePeriod.daysRemaining} day(s) left to complete mandatory enrollment in My Account.
          </span>
        </div>
      )}

      {/* Email sent notification */}
      {emailStatus.message && (
        <div
          className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
            emailStatus.isError
              ? 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-900/50'
              : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
          }`}
        >
          {emailStatus.isError ? <AlertCircle size={16} className="shrink-0" /> : <CheckCircle2 size={16} className="shrink-0" />}
          <span>{emailStatus.message}</span>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] dark:bg-red-950/40 dark:border-red-900/60 dark:text-red-300 text-[13px] font-medium flex items-center gap-2"
        >
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── MODE: 6 DIGIT CODE ──────────────────────────────────────────────── */}
      {mode === 'code' && (
        <div className="space-y-4">
          <div className="grid grid-cols-6 gap-2 sm:gap-2.5 w-full">
            {codeDigits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => (inputRefs.current[idx] = el)}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                onPaste={handlePaste}
                disabled={loading}
                className="w-full h-12 sm:h-14 text-center text-xl font-bold bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#243049] rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-[#2563EB] focus:ring-[3px] focus:ring-[#2563EB]/25 transition-all shadow-xs"
              />
            ))}
          </div>

          <button
            type="button"
            disabled={loading || codeDigits.join('').length !== 6}
            onClick={() => handleSubmitCode()}
            className="w-full h-[48px] rounded-[10px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white text-[16px] font-semibold transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus:ring-[3px] focus:ring-blue-500/30"
          >
            {loading ? <RefreshCw size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
            <span>Verify and Continue</span>
          </button>
        </div>
      )}

      {/* ── MODE: BACKUP CODE ───────────────────────────────────────────────── */}
      {mode === 'backup' && (
        <form onSubmit={handleSubmitBackupCode} className="space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Emergency Backup Code
            </label>
            <input
              type="text"
              required
              autoFocus
              spellCheck={false}
              autoComplete="off"
              value={backupCode}
              onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
              placeholder="e.g. A1B2-C3D4-E5F6"
              className="w-full h-[48px] px-3.5 font-mono text-[16px] uppercase bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-[10px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-[3px] focus:ring-blue-500/30 focus:border-blue-600 dark:focus:border-blue-500 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !backupCode.trim()}
            className="w-full h-[48px] rounded-[10px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white text-[16px] font-semibold transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus:ring-[3px] focus:ring-blue-500/30"
          >
            {loading ? <RefreshCw size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
            <span>Verify Backup Code</span>
          </button>
        </form>
      )}

      {/* ── TRUST DEVICE CHECKBOX ───────────────────────────────────────────── */}
      <div className="pt-1">
        <label className="flex items-center gap-2.5 text-[13px] text-slate-600 dark:text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={trustDevice}
            onChange={(e) => setTrustDevice(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
          <span>Trust this device for 30 days</span>
        </label>
      </div>

      {/* ── ALTERNATIVE METHOD TOGGLES ───────────────────────────────────────── */}
      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2 text-center text-xs">
        {mode === 'code' ? (
          <button
            type="button"
            onClick={() => {
              setMode('backup');
              setError('');
            }}
            className="font-medium text-[#2563EB] hover:underline cursor-pointer block mx-auto"
          >
            Use a backup recovery code
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setMode('code');
              setError('');
            }}
            className="font-medium text-[#2563EB] hover:underline cursor-pointer block mx-auto"
          >
            Use authenticator app
          </button>
        )}

        {allowedMethods.includes('email') && activeMethod !== 'email' && (
          <button
            type="button"
            disabled={emailStatus.loading}
            onClick={handleSendEmailOtp}
            className="font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer block mx-auto"
          >
            {emailStatus.loading ? 'Sending email code...' : 'Send code to my email'}
          </button>
        )}

        {activeMethod === 'email' && (
          <button
            type="button"
            onClick={() => {
              setActiveMethod('totp');
              setEmailStatus({ loading: false, message: '' });
              setError('');
            }}
            className="font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer block mx-auto"
          >
            Switch back to authenticator app
          </button>
        )}
      </div>
    </div>
  );
}
