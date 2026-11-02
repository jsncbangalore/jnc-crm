/**
 * Shared Safe Formatting Utilities
 * Eliminates repetitive `(x || '').toUpperCase()` guards and prevents runtime null pointer errors.
 */

export function safeUpper(val: unknown, fallback = ''): string {
  if (val === null || val === undefined) return fallback;
  return String(val).trim().toUpperCase();
}

export function safeLower(val: unknown, fallback = ''): string {
  if (val === null || val === undefined) return fallback;
  return String(val).trim().toLowerCase();
}

export function safeTrim(val: unknown, fallback = ''): string {
  if (val === null || val === undefined) return fallback;
  return String(val).trim();
}

export function safeVoucherType(val: unknown, fallback = 'JOURNAL'): string {
  const upper = safeUpper(val);
  return upper || fallback;
}

export function safeStatus(val: unknown, fallback = 'ACTIVE'): string {
  const upper = safeUpper(val);
  return upper || fallback;
}

export function safeSide(val: unknown, fallback: 'DR' | 'CR' = 'DR'): 'DR' | 'CR' {
  const upper = safeUpper(val);
  if (upper === 'CR') return 'CR';
  if (upper === 'DR') return 'DR';
  return fallback;
}

export function safeLabel(val: unknown, fallback = 'Standard'): string {
  const str = safeTrim(val);
  return str || fallback;
}
