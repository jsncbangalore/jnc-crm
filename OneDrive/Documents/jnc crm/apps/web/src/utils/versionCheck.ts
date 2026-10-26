/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { REQUIRED_API_VERSION } from '../constants/version';
import { authApi } from '../services/api';

/**
 * Compares two semantic version strings (e.g. "1.1.0" and "1.0.0").
 * Returns:
 *   1 if v1 > v2
 *  -1 if v1 < v2
 *   0 if v1 === v2
 */
export function compareSemver(v1: string, v2: string): number {
  const parse = (v: string) =>
    (v || '0.0.0')
      .replace(/^v/i, '')
      .split('.')
      .map((seg) => parseInt(seg, 10) || 0);

  const [maj1, min1, pat1] = parse(v1);
  const [maj2, min2, pat2] = parse(v2);

  if (maj1 !== maj2) return maj1 > maj2 ? 1 : -1;
  if (min1 !== min2) return min1 > min2 ? 1 : -1;
  if (pat1 !== pat2) return pat1 > pat2 ? 1 : -1;
  return 0;
}

export interface ApiCompatibilityResult {
  compatible: boolean;
  apiVersion?: string;
  requiredVersion: string;
  isOutdated: boolean;
  message?: string;
}

/**
 * Probes the backend API /health endpoint and verifies compatibility against REQUIRED_API_VERSION.
 * If the API is older than REQUIRED_API_VERSION, returns compatible: false.
 */
export async function checkApiCompatibility(): Promise<ApiCompatibilityResult> {
  try {
    const res = await authApi.getHealth();
    const ver = res.data?.apiVersion || res.data?.version || '1.0.0';
    const isOutdated = compareSemver(ver, REQUIRED_API_VERSION) < 0;

    return {
      compatible: !isOutdated,
      apiVersion: ver,
      requiredVersion: REQUIRED_API_VERSION,
      isOutdated,
      message: isOutdated
        ? 'We are updating the system. Please try again in a few minutes.'
        : undefined,
    };
  } catch (err: any) {
    // If the endpoint does not exist on the target API (404/405), the API is definitely an older release
    if (err?.response?.status === 404 || err?.response?.status === 405) {
      return {
        compatible: false,
        apiVersion: '1.0.0',
        requiredVersion: REQUIRED_API_VERSION,
        isOutdated: true,
        message: 'We are updating the system. Please try again in a few minutes.',
      };
    }
    // If the health check fails due to transient network issues, do not falsely flag as outdated
    return {
      compatible: true,
      requiredVersion: REQUIRED_API_VERSION,
      isOutdated: false,
    };
  }
}
