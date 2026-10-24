/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import * as crypto from 'crypto';

// Standard RFC 4648 Base32 alphabet
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encodes a Buffer to a Base32 string (RFC 4648)
 */
export function base32Encode(buffer: Buffer, pad = false): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  if (pad) {
    while (output.length % 8 !== 0) {
      output += '=';
    }
  }

  return output;
}

/**
 * Decodes a Base32 string to a Buffer (RFC 4648, handles padding '=' and whitespace)
 */
export function base32Decode(base32Str: string): Buffer {
  const cleaned = base32Str.toUpperCase().replace(/[\s=-]/g, '');
  if (!cleaned) return Buffer.alloc(0);

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) {
      throw new Error(`Invalid base32 character: ${cleaned[i]}`);
    }

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generates a cryptographically secure 20-byte Base32 secret for TOTP
 */
export function generateTotpSecret(): string {
  const bytes = crypto.randomBytes(20);
  return base32Encode(bytes);
}

/**
 * Calculates the current 30-second time step
 */
export function getTotpStep(timestampMs: number = Date.now(), stepSeconds = 30): number {
  return Math.floor(timestampMs / 1000 / stepSeconds);
}

/**
 * Generates a TOTP token using SHA-1 (RFC 6238) for a given step and digit length
 */
export function generateTotpToken(secretBase32: string, step: number, digits: number = 6): string {
  const key = base32Decode(secretBase32);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(step));

  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;

  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const mod = Math.pow(10, digits);
  const otp = binary % mod;
  return otp.toString().padStart(digits, '0');
}

/**
 * Constructs a standard RFC 6238 otpauth Key URI for QR codes and authenticator apps
 */
export function buildTotpUri(
  account: string,
  issuer: string,
  secret: string,
  algorithm = 'SHA1',
  digits = 6,
  period = 30,
): string {
  const encIssuer = encodeURIComponent(issuer);
  const encAccount = encodeURIComponent(account);
  return `otpauth://totp/${encIssuer}:${encAccount}?secret=${secret}&issuer=${encIssuer}&algorithm=${algorithm}&digits=${digits}&period=${period}`;
}

export interface VerifyTotpResult {
  valid: boolean;
  matchedStep?: number;
}

/**
 * Verifies a TOTP token against a secret.
 * Accept +/- 1 step window (window = 1).
 * Rejects any step <= lastUsedStep to prevent replay attacks.
 * Constant-time compare using timingSafeEqual.
 */
export function verifyTotpToken(
  token: string,
  secretBase32: string,
  lastUsedStep?: number | null,
  window = 1,
  timestampMs: number = Date.now(),
): VerifyTotpResult {
  if (!token || typeof token !== 'string') {
    return { valid: false };
  }

  const cleanToken = token.trim();
  if (!/^\d{6,8}$/.test(cleanToken)) {
    return { valid: false };
  }

  const currentStep = getTotpStep(timestampMs, 30);
  const tokenBuf = Buffer.from(cleanToken);

  for (let offset = -window; offset <= window; offset++) {
    const step = currentStep + offset;

    // Strict replay prevention: reject step if already used
    if (lastUsedStep !== undefined && lastUsedStep !== null && step <= lastUsedStep) {
      continue;
    }

    let candidateToken: string;
    try {
      candidateToken = generateTotpToken(secretBase32, step, cleanToken.length);
    } catch {
      return { valid: false };
    }

    const candidateBuf = Buffer.from(candidateToken);
    if (tokenBuf.length === candidateBuf.length && crypto.timingSafeEqual(tokenBuf, candidateBuf)) {
      return { valid: true, matchedStep: step };
    }
  }

  return { valid: false };
}

export function getBackupCodeServerSecret(): string {
  return process.env.OTP_SECRET || process.env.JWT_SECRET || 'crm-backup-code-hmac-secret-2026';
}

/**
 * Generates 10 single-use alphanumeric backup codes of 12 random characters (shown as XXXX-XXXX-XXXX)
 */
export function generateBackupCodes(count = 10): string[] {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Unambiguous base32-safe characters
  const codes: string[] = [];

  for (let i = 0; i < count; i++) {
    const bytes = crypto.randomBytes(12);
    let code = '';
    for (let b = 0; b < 12; b++) {
      code += chars[bytes[b] % chars.length];
    }
    // Format as XXXX-XXXX-XXXX
    codes.push(`${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`);
  }

  return codes;
}

/**
 * Hashes a backup code with HMAC-SHA256 using server secret for secure storage at rest
 */
export function hashBackupCode(code: string, secret?: string): string {
  const cleaned = code.toUpperCase().replace(/[\s-]/g, '');
  const serverSecret = typeof secret === 'string' && secret ? secret : getBackupCodeServerSecret();
  return crypto.createHmac('sha256', serverSecret).update(cleaned).digest('hex');
}

/**
 * Verifies and consumes a backup code against stored hashes.
 * Uses constant-time comparison via crypto.timingSafeEqual.
 * Supports HMAC-SHA256 (and legacy plain SHA-256 for backward compatibility before regenerate).
 * Removes consumed code upon match.
 */
export function verifyAndConsumeBackupCode(
  inputCode: string,
  backupCodesJson: string | null | undefined,
  secret?: string,
): { valid: boolean; remainingHashes: string[] } {
  if (!inputCode || !backupCodesJson) {
    return { valid: false, remainingHashes: [] };
  }

  let hashes: string[] = [];
  try {
    hashes = JSON.parse(backupCodesJson);
    if (!Array.isArray(hashes)) return { valid: false, remainingHashes: [] };
  } catch {
    return { valid: false, remainingHashes: [] };
  }

  const cleaned = inputCode.toUpperCase().replace(/[\s-]/g, '');
  const hmacHash = hashBackupCode(cleaned, secret);
  const plainSha256 = crypto.createHash('sha256').update(cleaned).digest('hex');

  const hmacHashBuf = Buffer.from(hmacHash);
  const plainSha256Buf = Buffer.from(plainSha256);

  let matchIndex = -1;
  for (let i = 0; i < hashes.length; i++) {
    const storedBuf = Buffer.from(hashes[i]);
    // 1. Check HMAC-SHA256
    if (storedBuf.length === hmacHashBuf.length && crypto.timingSafeEqual(storedBuf, hmacHashBuf)) {
      matchIndex = i;
      break;
    }
    // 2. Check legacy plain SHA-256 for backward compatibility prior to regeneration
    if (storedBuf.length === plainSha256Buf.length && crypto.timingSafeEqual(storedBuf, plainSha256Buf)) {
      matchIndex = i;
      break;
    }
  }

  if (matchIndex === -1) {
    return { valid: false, remainingHashes: hashes };
  }

  // Remove the consumed code (single use)
  const remaining = hashes.filter((_, idx) => idx !== matchIndex);
  return { valid: true, remainingHashes: remaining };
}
