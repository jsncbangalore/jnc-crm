/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { extractSupabaseProjectRef } from './env-validation';

export function getFrontendUrl(overrideUrl?: string): string {
  if (overrideUrl && overrideUrl.trim()) {
    return overrideUrl.trim().replace(/\/+$/, '');
  }
  const isDev =
    process.env.NODE_ENV !== 'production' ||
    process.env.DATABASE_URL?.includes('localhost') ||
    process.env.DATABASE_URL?.includes('127.0.0.1');

  if (isDev) {
    const envUrl = process.env.APP_URL || process.env.FRONTEND_URL;
    if (envUrl && envUrl.includes('localhost')) {
      return envUrl.trim().replace(/\/+$/, '');
    }
    return 'http://localhost:5173';
  }

  const envUrl = process.env.FRONTEND_URL || process.env.APP_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return 'https://admin.jsnc.co.in';
}

export function getDatabaseProjectRef(): string {
  const dbUrl = process.env.DATABASE_URL || process.env.DIRECT_URL || '';
  if (!dbUrl) return 'not-configured';
  const ref = extractSupabaseProjectRef(dbUrl);
  if (ref) return ref;
  try {
    const parsed = new URL(dbUrl);
    return parsed.hostname;
  } catch {
    return 'dev-local';
  }
}
