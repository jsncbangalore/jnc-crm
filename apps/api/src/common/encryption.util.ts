/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM

/**
 * Derives a strict 32-byte (256-bit) Buffer suitable for AES-256-GCM from ENCRYPTION_KEY.
 *
 * Supported formats:
 * 1. 64-hex string: Buffer.from(key, 'hex') (length === 32 bytes).
 * 2. 32-byte base64 string: Buffer.from(key, 'base64') (length === 32 bytes).
 * 3. Exact 32-character UTF-8 string: Buffer.from(key, 'utf8') (length === 32 bytes).
 * 4. Passphrase / string fallback: crypto.createHash('sha256').update(key, 'utf8').digest() (length === 32 bytes).
 *
 * Throws an Error if the resulting key is not exactly 32 bytes.
 */
export function deriveAesKey(rawKey?: string | Buffer | null): Buffer {
  if (Buffer.isBuffer(rawKey) && rawKey.length === 32) {
    return rawKey;
  }

  if (!rawKey || typeof rawKey !== 'string') {
    const fallbackSecret = process.env.JWT_SECRET || 'dev_master_fallback_encryption_secret_key_32bytes!!';
    return crypto.createHash('sha256').update(fallbackSecret, 'utf8').digest();
  }

  const trimmed = rawKey.trim();

  // 1. 64-character hexadecimal key (64 hex characters = 32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    const hexBuf = Buffer.from(trimmed, 'hex');
    if (hexBuf.length === 32) return hexBuf;
  }

  // 2. 32-byte Base64 encoded key (typically 43 or 44 chars)
  if (/^[A-Za-z0-9+/=]{43,44}$/.test(trimmed)) {
    try {
      const b64Buf = Buffer.from(trimmed, 'base64');
      if (b64Buf.length === 32) return b64Buf;
    } catch {}
  }

  // 3. Exact 32-byte UTF-8 string (32 ASCII / single-byte characters)
  const utf8Buf = Buffer.from(trimmed, 'utf8');
  if (utf8Buf.length === 32) {
    return utf8Buf;
  }

  // 4. Any other non-empty key: SHA-256 digest is cryptographically 32 bytes
  const shaBuf = crypto.createHash('sha256').update(trimmed, 'utf8').digest();
  if (shaBuf.length === 32) {
    return shaBuf;
  }

  throw new Error(`Derived AES-256 encryption key is invalid (expected 32 bytes, got ${shaBuf.length} bytes).`);
}

function getKey(customKey?: string | Buffer | null): Buffer {
  return deriveAesKey(customKey || process.env.ENCRYPTION_KEY);
}

/**
 * Encrypts sensitive string using AES-256-GCM with a unique IV.
 * Result format: ivHex:tagHex:encryptedHex
 */
export function encryptAtRest(plainText: string | null | undefined, customKey?: string | Buffer | null): string | null {
  if (plainText === null || plainText === undefined || plainText === '') {
    return null;
  }
  const key = getKey(customKey);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts AES-256-GCM encrypted string.
 * Supports fallback if string is legacy unencrypted data.
 */
export function decryptAtRest(cipherText: string | null | undefined, customKey?: string | Buffer | null): string | null {
  if (cipherText === null || cipherText === undefined || cipherText === '') {
    return null;
  }

  const parts = cipherText.split(':');
  if (parts.length !== 3) {
    // Legacy unencrypted string fallback
    return cipherText;
  }

  const [ivHex, tagHex, encryptedHex] = parts;
  if (ivHex.length !== IV_LENGTH * 2 || tagHex.length !== 32) {
    // Malformed encrypted pattern fallback
    return cipherText;
  }

  try {
    const key = getKey(customKey);
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    // If decryption fails, return null or throw
    return null;
  }
}
