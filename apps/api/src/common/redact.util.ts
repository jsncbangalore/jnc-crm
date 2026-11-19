/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Universal Sensitive Data Redaction Utilities
 *
 * Ensures passwords, tokens, cookies, Authorization headers, verification codes,
 * full bank account numbers, and full emails are redacted in all logs, audit rows,
 * and client error reports.
 */

const SENSITIVE_KEY_PATTERN = /^(password|passwd|pwd|hash|passwordHash|token|accessToken|refreshToken|jwt|secret|clientSecret|cookie|cookies|authorization|otp|twoFactorSecret|backupCodes|pin|accountNumber|bankAccountNumber|bankAccount)$/i;

const EMAIL_KEY_PATTERN = /^(email|userEmail|customerEmail|billingEmail|contactEmail)$/i;

/**
 * Redacts sensitive patterns in a raw string.
 */
export function redactSensitiveString(text?: string | null): string {
  if (!text || typeof text !== 'string') return '';

  return text
    // 1. Redact Authorization headers and Bearer tokens
    .replace(/(Authorization["']?\s*[:=]\s*["']?)(Bearer\s+)?[^\r\n,;]+/gi, '$1Bearer [REDACTED]')
    .replace(/Bearer\s+[^,\s;]+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g, '[REDACTED_JWT]')

    // 2. Redact Cookies
    .replace(/(Cookie["']?\s*[:=]\s*["']?)[^"',\r\n}]+/gi, '$1[REDACTED]')
    .replace(/\b(?:connect\.sid|session_id|refresh_token|access_token)=[^;&\s]+/gi, '$1=[REDACTED]')

    // 3. Redact Passwords and secrets
    .replace(/(password|passwd|pwd|pass|secret|client_secret|clientSecret)["']?\s*[:=]\s*["']?[^"',\s}]+["']?/gi, '$1=[REDACTED]')

    // 4. Redact OTPs and verification codes
    .replace(/(verificationCode|twoFactorCode|otpCode|otp|code|pin)["']?\s*[:=]\s*["']?\d{4,8}["']?/gi, '$1=[REDACTED]')

    // 5. Redact full email addresses
    .replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, '[REDACTED_EMAIL]')

    // 6. Redact full bank account numbers (9 to 18 contiguous digits)
    .replace(/(accountNumber|bankAccount|account_no|acct_num|accountNum)["']?\s*[:=]\s*["']?\d{9,18}["']?/gi, '$1=[REDACTED_ACCOUNT]')
    .replace(/\b\d{9,18}\b/g, '[REDACTED_NUMBER]');
}

/**
 * Deeply redacts sensitive keys and values in arbitrary objects (e.g. beforeState / afterState in audit logs).
 */
export function redactSensitiveObject<T = any>(data: T): T {
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    return redactSensitiveString(data) as unknown as T;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveObject(item)) as unknown as T;
  }

  if (typeof data === 'object') {
    const redacted: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        redacted[key] = '[REDACTED]';
      } else if (EMAIL_KEY_PATTERN.test(key)) {
        redacted[key] = '[REDACTED_EMAIL]';
      } else if (typeof value === 'string') {
        redacted[key] = redactSensitiveString(value);
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = redactSensitiveObject(value);
      } else {
        redacted[key] = value;
      }
    }
    return redacted as T;
  }

  return data;
}

/**
 * Strips query strings and URL fragments to preserve URL path only.
 */
export function cleanUrlPath(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '/';
  const clean = rawUrl.split('?')[0].split('#')[0].trim();
  return clean || '/';
}
