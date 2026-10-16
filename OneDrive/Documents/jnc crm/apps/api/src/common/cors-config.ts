/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Logger } from '@nestjs/common';

const logger = new Logger('CORS');
const rejectedOriginsSet = new Set<string>();

export const ALLOWED_ORIGIN_LIST = [
  'https://admin.jsnc.co.in',
  'http://admin.jsnc.co.in',
  'https://api.jsnc.co.in',
  'http://api.jsnc.co.in',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:3000',
  'http://localhost:3333',
];

export function getAllowedCorsOrigins(): string[] {
  const envOrigins = [
    ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : []),
    ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : []),
    ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : []),
    ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : []),
  ]
    .map((u) => u.trim())
    .filter(Boolean);

  return Array.from(new Set([...ALLOWED_ORIGIN_LIST, ...envOrigins]));
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
 * Accepts exact matches to allowed domains/local dev ports, or wildcard subdomain *.jsnc.co.in.
 */
export function isAllowedOrigin(origin?: string, frontendUrlEnv?: string): boolean {
  if (!origin) {
    return true; // Non-browser / same-origin / health check requests
  }

  // Always allow localhost & loopback IP on any port (development and local testing)
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

  const configuredOrigins = getAllowedCorsOrigins();

  if (configuredOrigins.includes(origin) || origin.endsWith('.jsnc.co.in')) {
    return true;
  }

  return false;
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
