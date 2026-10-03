/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM

function getKey(): Buffer {
  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error('ENCRYPTION_KEY environment variable is missing.');
  }
  const key = Buffer.from(rawKey, 'base64');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be a 32-byte base64-encoded string.');
  }
  return key;
}

/**
 * Encrypts sensitive string using AES-256-GCM with a unique IV.
 * Result format: ivHex:tagHex:encryptedHex
 */
export function encryptAtRest(plainText: string | null | undefined): string | null {
  if (plainText === null || plainText === undefined || plainText === '') {
    return null;
  }
  const key = getKey();
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
export function decryptAtRest(cipherText: string | null | undefined): string | null {
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
    const key = getKey();
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
