/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Parses the TRUST_PROXY environment variable safely.
 * Must be a number of hops (e.g. 1, 0, 2).
 * Default: 1 in production (behind reverse proxy), 0 in development.
 * Never true: boolean true is rejected for security to prevent proxy spoofing.
 */
export function parseTrustProxy(val?: string, isProd?: boolean): number {
  if (val === 'true' || val === 'TRUE') {
    console.warn(
      '[SECURITY WARNING] TRUST_PROXY cannot be true (boolean). Defaulting to numeric 1 hop.',
    );
    return 1;
  }
  if (val !== undefined && val.trim() !== '') {
    const parsed = parseInt(val.trim(), 10);
    if (!isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
    console.warn(
      `[SECURITY WARNING] Invalid TRUST_PROXY value "${val}". Expected integer hops. Defaulting to ${isProd ? 1 : 0}.`,
    );
  }
  return isProd ? 1 : 0;
}
