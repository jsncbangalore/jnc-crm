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

/**
 * Returns cookie options for refresh tokens:
 * - Host-only (strictly NO domain attribute)
 * - HttpOnly: true
 * - Secure: true in production/staging
 * - SameSite: 'strict'
 * - Exact path (/api/v1/auth or /api/v1/platform-auth)
 * - Lifetime: 7 days max (when keepSignedIn is true); session cookie (no maxAge/Expires) when false
 */
export function getRefreshCookieOptions(path: string, keepSignedIn: boolean = false): CookieOptions {
  return {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: 'strict',
    path,
    ...(keepSignedIn ? { maxAge: REFRESH_COOKIE_MAX_AGE_MS } : {}),
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
 * - Host-only (strictly NO domain attribute)
 * - HttpOnly: false (readable by frontend client)
 * - Secure: true in production/staging
 * - SameSite: 'strict'
 * - Path: '/'
 * - Lifetime: 7 days max (when keepSignedIn is true); session cookie (no maxAge/Expires) when false
 * - Note: The cookie value must strictly be '1' and must NOT carry any user data.
 */
export function getSessionIndicatorCookieOptions(keepSignedIn: boolean = false): CookieOptions {
  return {
    httpOnly: false,
    secure: isSecureCookie(),
    sameSite: 'strict',
    path: '/',
    ...(keepSignedIn ? { maxAge: REFRESH_COOKIE_MAX_AGE_MS } : {}),
  };
}
