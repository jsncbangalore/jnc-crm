/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

export function getFrontendUrl(overrideUrl?: string): string {
  if (overrideUrl && overrideUrl.trim() && !overrideUrl.includes('localhost')) {
    return overrideUrl.trim().replace(/\/+$/, '');
  }
  const envUrl = process.env.FRONTEND_URL || process.env.APP_URL;
  if (envUrl && envUrl.trim() && !envUrl.includes('localhost')) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:5173';
  }
  return 'https://admin.jsnc.co.in';
}
