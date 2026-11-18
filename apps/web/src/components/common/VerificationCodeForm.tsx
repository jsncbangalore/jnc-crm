/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Clock,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export type VerificationMethod = 'authenticator' | 'email' | 'backup';

export interface AlternativeMethodOption {
  method: VerificationMethod;
  label: string;
  onClick: () => void;
}

export interface VerificationCodeFormProps {
  method: VerificationMethod;
  recipientMasked?: string;
  title?: string;
  subtitle?: string;
  loading?: boolean;
  error?: string;
  onErrorClear?: () => void;
  onSubmit: (code: string) => Promise<void> | void;
  onResend?: () => Promise<void> | void;
  resendCooldown?: number;
  expiresInSeconds?: number;
  attemptsRemaining?: number | null;
  lockedUntilSeconds?: number | null;
  onBack?: () => void;
  backLabel?: string;
  alternativeMethods?: AlternativeMethodOption[];
  onLostAuthenticator?: () => void;
  lostAuthenticatorLabel?: string;
  trustDevice?: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: string;
  };
  submitLabel?: string;
  autoFocus?: boolean;
  className?: string;
}

export default function VerificationCodeForm({
  method,
  recipientMasked,
  title,
  subtitle,
  loading = false,
  error = '',
  onErrorClear,
  onSubmit,
  onResend,
  resendCooldown = 0,
  expiresInSeconds,
  attemptsRemaining,
  lockedUntilSeconds,
  onBack,
  backLabel = 'Back',
  alternativeMethods,
  onLostAuthenticator,
  lostAuthenticatorLabel = 'Lost your authenticator? Receive code by email',
  trustDevice,
  submitLabel,
  autoFocus = true,
  className = '',
}: VerificationCodeFormProps) {
  // 6 individual code boxes for numeric codes
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Single text code for backup recovery code (8-char alphanumeric)
  const [backupCode, setBackupCode] = useState<string>('');

  // Help accordion toggle
  const [showHelp, setShowHelp] = useState(false);

  // Live countdowns
  const [cooldown, setCooldown] = useState(resendCooldown);
  const [expiryCountdown, setExpiryCountdown] = useState<number | undefined>(expiresInSeconds);
  const [lockedCountdown, setLockedCountdown] = useState<number | undefined>(lockedUntilSeconds || undefined);

  useEffect(() => {
    setCooldown(resendCooldown);
  }, [resendCooldown]);

  useEffect(() => {
    if (expiresInSeconds !== undefined) {
      setExpiryCountdown(expiresInSeconds);
    }
  }, [expiresInSeconds]);

  useEffect(() => {
    if (lockedUntilSeconds !== undefined && lockedUntilSeconds !== null) {
      setLockedCountdown(lockedUntilSeconds);
    }
  }, [lockedUntilSeconds]);

  // Interval timer for countdowns
  useEffect(() => {
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      setExpiryCountdown((prev) => (prev !== undefined && prev > 0 ? prev - 1 : prev));
      setLockedCountdown((prev) => (prev !== undefined && prev > 0 ? prev - 1 : prev));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Reset inputs when method changes
  useEffect(() => {
    setDigits(['', '', '', '', '', '']);
    setBackupCode('');
    if (autoFocus) {
      setTimeout(() => {
        if (method === 'backup') {
          // Backup text input focus
        } else {
          inputRefs.current[0]?.focus();
        }
      }, 50);
    }
  }, [method, autoFocus]);

  // Clear error on user interaction
  const handleUserTyping = () => {
    if (error && onErrorClear) {
      onErrorClear();
    }
  };

  // ─── 6-Digit Box Handlers ──────────────────────────────────────────────────
  const handleDigitChange = (index: number, val: string) => {
    handleUserTyping();
    const clean = val.replace(/\D/g, '');
    if (!clean) {
      setDigits((prev) => {
        const next = [...prev];
        next[index] = '';
        return next;
      });
      return;
    }

    if (clean.length === 1) {
      const next = [...digits];
      next[index] = clean;
      setDigits(next);
      if (index < 5) {
        inputRefs.current[index + 1]?.focus();
      }
      if (next.every((d) => d.length === 1)) {
        void onSubmit(next.join(''));
      }
    } else if (clean.length > 1) {
      // Pasted multiple digits into single input
      handlePasteString(clean);
    }
  };

  const handlePasteString = (pasted: string) => {
    handleUserTyping();
    const cleanDigits = pasted.replace(/\D/g, '').slice(0, 6).split('');
    if (cleanDigits.length === 0) return;

    setDigits((prev) => {
      const next = [...prev];
      cleanDigits.forEach((d, idx) => {
        if (idx < 6) next[idx] = d;
      });
      return next;
    });

    const targetIndex = Math.min(cleanDigits.length, 5);
    inputRefs.current[targetIndex]?.focus();

    if (cleanDigits.length === 6) {
      void onSubmit(cleanDigits.join(''));
    }
  };

  const handleDigitPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (text) {
      handlePasteString(text);
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      handleUserTyping();
      if (!digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
        setDigits((prev) => {
          const next = [...prev];
          next[index - 1] = '';
          return next;
        });
      } else {
        setDigits((prev) => {
          const next = [...prev];
          next[index] = '';
          return next;
        });
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  // ─── Manual Form Submission ────────────────────────────────────────────────
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (method === 'backup') {
      const clean = backupCode.trim().replace(/\s+/g, '');
      if (clean) void onSubmit(clean);
    } else {
      const code = digits.join('');
      if (code.length === 6) void onSubmit(code);
    }
  };

  // ─── Resend Handler ────────────────────────────────────────────────────────
  const handleResendClick = async () => {
    if (cooldown > 0 || loading || !onResend) return;
    setDigits(['', '', '', '', '', '']);
    await onResend();
    inputRefs.current[0]?.focus();
  };

  // ─── Wording Resolution ────────────────────────────────────────────────────
  const resolvedTitle =
    title ||
    (method === 'email' ? 'Enter the code' : '2-Step Verification');

  const resolvedSubtitle =
    subtitle ||
    (method === 'authenticator'
      ? 'Enter the 6-digit code from your authenticator app.'
      : method === 'email'
      ? `Enter the 6-digit code we sent to ${recipientMasked || 'your registered email'}.`
      : 'Enter one of your backup codes.');

  const resolvedSubmitLabel =
    submitLabel ||
    (method === 'backup' ? 'Verify backup code' : 'Verify code');

  const isLocked = lockedCountdown !== undefined && lockedCountdown > 0;
  const isSubmitDisabled =
    loading ||
    isLocked ||
    (method === 'backup' ? backupCode.trim().length < 4 : digits.join('').length !== 6);

  return (
    <div className={`w-full space-y-4 ${className}`}>
      {/* Back Button */}
      {onBack && (
        <div className="mb-4">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 transition-colors cursor-pointer"
          >
            <span>&larr;</span>
            <span>{backLabel}</span>
          </button>
        </div>
      )}

      {/* Title & Subtitle */}
      <div className="mb-6 text-left">
        <h1 className="text-[28px] font-bold text-slate-900 dark:text-white leading-tight">
          {resolvedTitle}
        </h1>
        <p className="text-[16px] text-slate-600 dark:text-slate-400 mt-2">
          {resolvedSubtitle}
        </p>
      </div>

      {/* Error Banner (shown only after a failed attempt) */}
      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-[10px] bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-[14px] font-medium flex items-start gap-2.5"
        >
          <AlertCircle size={18} className="shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
          <div className="flex-1">
            <span>{error}</span>
            {attemptsRemaining !== undefined && attemptsRemaining !== null && attemptsRemaining > 0 && (
              <span className="block mt-0.5 text-xs text-rose-600/90 dark:text-rose-300/90 font-normal">
                {attemptsRemaining} attempt{attemptsRemaining > 1 ? 's' : ''} remaining before temporary lockout.
              </span>
            )}
          </div>
        </div>
      )}

      {/* Lockout Banner */}
      {isLocked && (
        <div className="p-3.5 rounded-[10px] bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2">
          <Clock size={16} className="shrink-0 text-amber-600" />
          <span>Too many failed attempts. Try again in {lockedCountdown}s.</span>
        </div>
      )}

      {/* Main Code Form */}
      <form onSubmit={handleFormSubmit} className="space-y-4" noValidate autoComplete="off">
        {method === 'backup' ? (
          <div>
            <label className="block text-[14px] font-semibold text-slate-800 dark:text-slate-200 mb-2">
              Backup Recovery Code
            </label>
            <input
              type="text"
              autoFocus
              value={backupCode}
              onChange={(e) => {
                handleUserTyping();
                setBackupCode(e.target.value.toUpperCase());
              }}
              placeholder="e.g. A1B2C3D4"
              maxLength={8}
              disabled={loading || isLocked}
              className="w-full h-[48px] px-4 rounded-[10px] border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono uppercase tracking-widest text-center text-[16px] font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-[3px] focus:ring-blue-500/30 focus:border-blue-600 dark:focus:border-blue-500 transition-colors disabled:opacity-50"
            />
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-6 gap-2 sm:gap-2.5 my-3 w-full">
              {digits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => (inputRefs.current[idx] = el)}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                  onPaste={handleDigitPaste}
                  disabled={loading || isLocked}
                  aria-label={`Digit ${idx + 1} of 6`}
                  className="w-full h-12 sm:h-14 text-center text-[20px] sm:text-[24px] font-bold font-mono bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/25 transition-all shadow-xs disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:cursor-not-allowed"
                  autoFocus={autoFocus && idx === 0}
                />
              ))}
            </div>

            {/* Expiry Countdown Note (if provided) */}
            {expiryCountdown !== undefined && expiryCountdown > 0 && (
              <div className="flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-slate-400 mt-1.5">
                <Clock size={13} className="shrink-0 text-slate-400" />
                <span>
                  Code expires in {Math.floor(expiryCountdown / 60)}:
                  {(expiryCountdown % 60).toString().padStart(2, '0')}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Trust this device for 30 days (Unchecked by default) */}
        {trustDevice && (
          <div className="pt-0.5">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={trustDevice.checked}
                onChange={(e) => trustDevice.onChange(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 border-slate-300 dark:border-slate-700 focus:ring-blue-500 cursor-pointer"
              />
              <span className="text-[12px] font-medium text-slate-600 dark:text-slate-400">
                {trustDevice.label || (
                  <>
                    Trust this device for 30 days{' '}
                    <span className="text-slate-400 dark:text-slate-500">(Only on your own device)</span>
                  </>
                )}
              </span>
            </label>
          </div>
        )}

        {/* Submit Button (Identical styling and spacing as Sign In) */}
        <div className="pt-1.5">
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="w-full h-[44px] rounded-[10px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-600 dark:disabled:text-slate-400 disabled:cursor-not-allowed disabled:shadow-none text-[15px] font-semibold text-white shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus:ring-[3px] focus:ring-blue-500/30"
          >
            {loading ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                <span>Verifying code...</span>
              </>
            ) : (
              <span>{resolvedSubmitLabel}</span>
            )}
          </button>
        </div>

        {/* Resend Action (if supported by method) */}
        {onResend && method === 'email' && (
          <div className="flex items-center justify-between text-xs pt-1 text-slate-500 dark:text-slate-400">
            <button
              type="button"
              onClick={handleResendClick}
              disabled={cooldown > 0 || loading || isLocked}
              className="font-medium text-blue-600 hover:underline dark:text-blue-400 disabled:opacity-50 cursor-pointer"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </button>
          </div>
        )}
      </form>

      {/* Alternative verification methods switch */}
      {alternativeMethods && alternativeMethods.length > 0 && (
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2 text-center text-xs">
          {alternativeMethods.map((alt, idx) => (
            <div key={idx}>
              <button
                type="button"
                onClick={alt.onClick}
                className="text-[12px] font-medium text-blue-600 hover:underline dark:text-blue-400 cursor-pointer inline-block"
              >
                {alt.label}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Lost your authenticator? Recovery path */}
      {onLostAuthenticator && method === 'authenticator' && (
        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={onLostAuthenticator}
            className="text-[12px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-medium cursor-pointer inline-block"
          >
            {lostAuthenticatorLabel}
          </button>
        </div>
      )}

      {/* Where is my code? Help Accordion */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
        <button
          type="button"
          onClick={() => setShowHelp(!showHelp)}
          className="flex items-center justify-center gap-1.5 w-full py-1 text-[12px] font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer transition-colors"
        >
          <HelpCircle size={13} className="shrink-0" />
          <span>Where is my code?</span>
          {showHelp ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {showHelp && (
          <div className="mt-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 text-[12px] text-slate-600 dark:text-slate-300 leading-relaxed text-left space-y-1.5">
            {method === 'authenticator' && (
              <>
                <p className="font-semibold text-slate-800 dark:text-slate-200">Authenticator App Codes:</p>
                <p>
                  Open your authenticator app (such as Google Authenticator, Authy, or Microsoft Authenticator) and look for your CRM account. Enter the 6-digit code shown there. Codes refresh every 30 seconds.
                </p>
                <p className="text-slate-500 dark:text-slate-400 text-[11px] pt-1">
                  Lost your phone or device? Use a backup recovery code or contact your workspace administrator to reset your 2-step verification.
                </p>
              </>
            )}

            {method === 'email' && (
              <>
                <p className="font-semibold text-slate-800 dark:text-slate-200">Email Verification Codes:</p>
                <p>
                  We sent a 6-digit code to your registered email address. Codes typically arrive within 60 seconds.
                </p>
                <p>
                  Check your spam, junk, or promotions folder. If the code does not arrive within a minute, click "Resend code".
                </p>
              </>
            )}

            {method === 'backup' && (
              <>
                <p className="font-semibold text-slate-800 dark:text-slate-200">Backup Recovery Codes:</p>
                <p>
                  Enter one of the 8-character backup codes provided when you first enrolled in 2-step verification.
                </p>
                <p>
                  Each backup code can be used only once. After use, it is permanently invalidated.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
