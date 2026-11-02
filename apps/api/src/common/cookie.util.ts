/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { CookieOptions } from 'express';

export const AUTH_COOKIE_PATH = '/api/v1/auth';
export const PLATFORM_AUTH_COOKIE_PATH = '/api/v1/platform-auth';
export const REFRESH_COOKIE_NAME = 'crm_refresh_token';
export const PLATFORM_REFRESH_COOKIE_NAME = 'crm_platform_refresh';
export const SESSION_ACTIVE_COOKIE_NAME = 'crm_session_active';
export const PLATFORM_SESSION_ACTIVE_COOKIE_NAME = 'crm_platform_session_active';

export const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days max
export const TRUSTED_DEVICE_COOKIE_NAME = 'crm_trusted_device';
export const TRUSTED_DEVICE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const TRUSTED_DEVICE_ADMIN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days for admins

export function isSecureCookie(): boolean {
  if (process.env.COOKIE_SECURE === 'false') return false;
  return process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging' || process.env.COOKIE_SECURE === 'true';
}

export function isCrossSiteDeployment(req?: any): boolean {
  const envSameSite = process.env.COOKIE_SAMESITE?.trim().toLowerCase();
  if (envSameSite === 'none') return true;
  if (envSameSite === 'lax' || envSameSite === 'strict') return false;

  // Check request origin vs request host
  if (req) {
    const rawOrigin = req.headers?.origin || req.headers?.referer;
    if (rawOrigin) {
      try {
        const originUrl = new URL(rawOrigin);
        const originHost = originUrl.hostname.toLowerCase();
        const reqHostRaw = req.get ? req.get('host') : req.headers?.host;
        if (reqHostRaw) {
          const reqHost = reqHostRaw.split(':')[0].toLowerCase();
          const cookieDomain = process.env.COOKIE_DOMAIN?.trim().replace(/^\./, '').toLowerCase();
          if (cookieDomain && originHost.endsWith(cookieDomain) && reqHost.endsWith(cookieDomain)) {
            return false;
          }
          if (originHost !== reqHost) {
            return true;
          }
        }
      } catch {}
    }
  }

  // Check FRONTEND_URL or CORS_ORIGIN
  const frontend = (process.env.FRONTEND_URL || process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGINS || '').split(',')[0].trim();
  if (frontend) {
    try {
      const feHost = new URL(frontend).hostname.toLowerCase();
      const apiRaw = process.env.API_HOST || process.env.HOST || '';
      const apiHost = apiRaw.includes('://')
        ? new URL(apiRaw).hostname.toLowerCase()
        : apiRaw.split(':')[0].toLowerCase();
      if (apiHost && feHost !== apiHost) {
        return true;
      }
    } catch {}
  }

  // In production / staging without explicit shared domain, cross-origin/site is default
  if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
    if (!process.env.COOKIE_DOMAIN?.trim()) {
      return true;
    }
  }

  return false;
}

export function getRefreshCookieSameSite(req?: any): 'none' | 'lax' | 'strict' {
  const envSameSite = process.env.COOKIE_SAMESITE?.trim().toLowerCase();
  if (envSameSite === 'none' || envSameSite === 'lax' || envSameSite === 'strict') {
    return envSameSite as 'none' | 'lax' | 'strict';
  }
  return isCrossSiteDeployment(req) ? 'none' : 'lax';
}

export function getCookieDomain(): string | undefined {
  const d = process.env.COOKIE_DOMAIN?.trim();
  return d ? d : undefined;
}

/**
 * Returns cookie options for refresh tokens:
 * - Domain: configured COOKIE_DOMAIN if set, host-only otherwise
 * - HttpOnly: true
 * - Secure: true in production/staging or when SameSite=None
 * - SameSite: 'none' when web and API are cross-site, 'lax' when same-site
 * - Exact path (/api/v1/auth or /api/v1/platform-auth)
 * - Lifetime: 7 days max (when keepSignedIn is true); session cookie when false
 */
export function getRefreshCookieOptions(path: string, keepSignedIn: boolean = false, req?: any): CookieOptions {
  const sameSite = getRefreshCookieSameSite(req);
  const secure = sameSite === 'none' ? true : isSecureCookie();
  const domain = getCookieDomain();

  return {
    httpOnly: true,
    secure,
    sameSite,
    path,
    ...(domain ? { domain } : {}),
    ...(keepSignedIn ? { maxAge: REFRESH_COOKIE_MAX_AGE_MS } : {}),
  };
}

export function getClearRefreshCookieOptions(path: string, req?: any): CookieOptions {
  const sameSite = getRefreshCookieSameSite(req);
  const secure = sameSite === 'none' ? true : isSecureCookie();
  const domain = getCookieDomain();

  return {
    httpOnly: true,
    secure,
    sameSite,
    path,
    ...(domain ? { domain } : {}),
  };
}

/**
 * Returns cookie options for trusted device token:
 * - httpOnly: true
 * - Secure: true in production/staging
 * - SameSite: 'lax'
 * - Path: '/' (shared so both /auth and /platform-auth receive it)
 * - Lifetime: 7 days for admin roles, 30 days for others
 */
export function getTrustedDeviceCookieOptions(isAdmin: boolean = false): CookieOptions {
  return {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: 'lax',
    path: '/',
    maxAge: isAdmin ? TRUSTED_DEVICE_ADMIN_MAX_AGE_MS : TRUSTED_DEVICE_MAX_AGE_MS,
  };
}

/**
 * Returns cookie options for session indicators (crm_session_active, crm_platform_session_active):
 * - Domain: configured COOKIE_DOMAIN if set, host-only otherwise
 * - HttpOnly: false (readable by frontend client)
 * - Secure: true in production/staging or when SameSite=None
 * - SameSite: 'none' when cross-site, 'lax' when same-site
 * - Path: '/'
 * - Lifetime: 7 days max (when keepSignedIn is true); session cookie when false
 * - Note: The cookie value must strictly be '1' and must NOT carry any user data.
 */
export function getSessionIndicatorCookieOptions(keepSignedIn: boolean = false, req?: any): CookieOptions {
  const sameSite = getRefreshCookieSameSite(req);
  const secure = sameSite === 'none' ? true : isSecureCookie();
  const domain = getCookieDomain();

  return {
    httpOnly: false,
    secure,
    sameSite,
    path: '/',
    ...(domain ? { domain } : {}),
    ...(keepSignedIn ? { maxAge: REFRESH_COOKIE_MAX_AGE_MS } : {}),
  };
}

export function getClearSessionIndicatorCookieOptions(req?: any): CookieOptions {
  const sameSite = getRefreshCookieSameSite(req);
  const secure = sameSite === 'none' ? true : isSecureCookie();
  const domain = getCookieDomain();

  return {
    httpOnly: false,
    secure,
    sameSite,
    path: '/',
    ...(domain ? { domain } : {}),
  };
}
