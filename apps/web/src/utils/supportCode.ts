/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

// Alphabet strictly excluding visually ambiguous 0, O, 1, I, L
const CHARSET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const BASE = CHARSET.length;

/**
 * Derives a human-friendly short support code (e.g. 'K7F-29Q') deterministically from a full request ID.
 * The long UUID is never shown on screen.
 */
export function generateSupportCode(requestId?: string): string {
  if (!requestId || typeof requestId !== 'string' || !requestId.trim()) {
    let rand = '';
    for (let i = 0; i < 6; i++) {
      rand += CHARSET[Math.floor(Math.random() * BASE)];
    }
    return `${rand.slice(0, 3)}-${rand.slice(3, 6)}`;
  }

  const clean = requestId.trim();
  // FNV-1a 32-bit hash on string
  let hash = 0x811c9dc5;
  for (let i = 0; i < clean.length; i++) {
    hash ^= clean.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  let n = Math.abs(hash);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CHARSET[n % BASE];
    n = Math.floor(n / BASE);
  }
  return `${code.slice(0, 3)}-${code.slice(3, 6)}`;
}

/**
 * Checks if support code display is globally hidden via configuration.
 */
export function isSupportCodeHidden(): boolean {
  if (typeof process !== 'undefined' && process.env) {
    if (
      process.env.HIDE_SUPPORT_CODE === 'true' ||
      process.env.HIDE_SUPPORT_CODE === '1' ||
      process.env.VITE_HIDE_SUPPORT_CODE === 'true'
    ) {
      return true;
    }
  }
  if (typeof window !== 'undefined') {
    if (
      (import.meta as any)?.env?.VITE_HIDE_SUPPORT_CODE === 'true' ||
      (import.meta as any)?.env?.VITE_HIDE_SUPPORT_CODE === '1' ||
      (window as any).__HIDE_SUPPORT_CODE__ === true
    ) {
      return true;
    }
  }
  return false;
}
