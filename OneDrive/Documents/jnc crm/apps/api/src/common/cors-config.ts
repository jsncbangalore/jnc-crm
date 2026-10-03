/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

export const ALLOWED_ORIGIN_LIST = [
  'https://admin.jsnc.co.in',
  'http://admin.jsnc.co.in',
  'https://api.jsnc.co.in',
  'http://api.jsnc.co.in',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3333',
];

/**
 * Validates if an incoming origin header is permitted by CORS.
 * Accepts exact matches to allowed domains/local dev ports, or wildcard subdomain *.jsnc.co.in.
 */
export function isAllowedOrigin(origin?: string, frontendUrlEnv?: string): boolean {
  if (!origin) {
    return true; // Non-browser / same-origin / health check requests
  }

  const configuredOrigins = [
    ...ALLOWED_ORIGIN_LIST,
    ...(frontendUrlEnv ? frontendUrlEnv.split(',').map((u) => u.trim()) : []),
  ];

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
    callback(new Error('Origin not allowed by CORS'));
  }
}
