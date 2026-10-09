/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Validates if an incoming origin header is permitted by CORS.
 * In production: ONLY origins explicitly listed in ALLOWED_ORIGINS or FRONTEND_URL.
 * No wildcard *.jsnc.co.in, no http:// variants, no localhost in production.
 */
export function isAllowedOrigin(origin?: string): boolean {
  if (!origin) {
    return true; // Non-browser / same-origin requests
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const allowedSet = new Set<string>();

  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || '';
  if (allowedOriginsEnv) {
    allowedOriginsEnv.split(',').forEach((o) => {
      const trimmed = o.trim();
      if (trimmed) allowedSet.add(trimmed);
    });
  }

  const frontendUrlEnv = process.env.FRONTEND_URL || '';
  if (frontendUrlEnv) {
    frontendUrlEnv.split(',').forEach((o) => {
      const trimmed = o.trim();
      if (trimmed) allowedSet.add(trimmed);
    });
  }

  if (!isProduction) {
    allowedSet.add('http://localhost:5173');
    allowedSet.add('http://localhost:3000');
    allowedSet.add('http://localhost:3333');
    allowedSet.add('http://127.0.0.1:5173');
    allowedSet.add('http://127.0.0.1:3333');
  }

  return allowedSet.has(origin);
}

/**
 * Express / NestJS CORS origin callback handler used in app.enableCors()
 */
export function corsOriginCallback(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) {
  if (isAllowedOrigin(origin)) {
    callback(null, true);
  } else {
    callback(null, false);
  }
}
