/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Logger } from '@nestjs/common';

const logger = new Logger('CORS');
const rejectedOriginsSet = new Set<string>();

export const DEV_DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:3000',
  'http://localhost:3333',
];

/**
 * NOTE ON CLIENT / TENANT MARKETING WEBSITES:
 * Client marketing websites that host or embed public inquiry forms must NEVER
 * be added to ALLOWED_ORIGINS.
 *
 * ALLOWED_ORIGINS is reserved strictly for authenticated CRM portals (e.g. portal.domain.com)
 * where session cookies, HttpOnly refresh tokens, and Authorization credentials are permitted.
 *
 * Public endpoints (/public-inquiry, /webhooks/website/:key, /webhooks/inquiry-info)
 * have their own isolated CORS handling (handlePublicCors) that reads WebFormSettings.allowedOrigins
 * per company, strictly disallows credentials, and never sets cookies.
 */
export function getAllowedCorsOrigins(): string[] {
  const envOrigins = [
    ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : []),
    ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : []),
    ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : []),
    ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : []),
  ]
    .map((u) => u.trim())
    .filter(Boolean);

  const baseList = process.env.NODE_ENV === 'production' ? [] : DEV_DEFAULT_ORIGINS;
  return Array.from(new Set([...baseList, ...envOrigins]));
}

export function getCorsOriginsCount(): number {
  return getAllowedCorsOrigins().length;
}

export function getAllowedCorsHosts(): string[] {
  const origins = getAllowedCorsOrigins();
  const hosts = origins.map((u) => {
    try {
      return new URL(u).hostname;
    } catch {
      return u;
    }
  });
  return Array.from(new Set(hosts));
}

/**
 * Validates if an incoming origin header is permitted by CORS.
 * Accepts exact matches to allowed domains/local dev ports.
 */
export function isAllowedOrigin(origin?: string, frontendUrlEnv?: string): boolean {
  if (!origin) {
    return true; // Non-browser / same-origin / health check requests
  }

  // Allow localhost & loopback IP on any port in development
  if (process.env.NODE_ENV !== 'production') {
    if (
      origin.startsWith('http://localhost:') ||
      origin === 'http://localhost' ||
      origin.startsWith('https://localhost:') ||
      origin === 'https://localhost' ||
      origin.startsWith('http://127.0.0.1:') ||
      origin === 'http://127.0.0.1' ||
      origin.startsWith('https://127.0.0.1:') ||
      origin === 'https://127.0.0.1'
    ) {
      return true;
    }
  }

  const configuredOrigins = getAllowedCorsOrigins();
  return configuredOrigins.includes(origin);
}

/**
 * Express / NestJS CORS origin callback handler used in app.enableCors()
 */
export function corsOriginCallback(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) {
  if (isAllowedOrigin(origin, process.env.FRONTEND_URL)) {
    callback(null, true);
  } else {
    if (origin && !rejectedOriginsSet.has(origin)) {
      rejectedOriginsSet.add(origin);
      const count = getCorsOriginsCount();
      logger.warn(`CORS rejected origin ${origin}; allowed origins: ${count} configured`);
    }
    callback(null, false);
  }
}
