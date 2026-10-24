/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import * as crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { readWebFormSettingsStore } from '../settings/web-form-settings.util';

/**
 * Checks if the request targets a public inquiry / website lead route
 */
export function isPublicInquiryRoute(urlPath: string): boolean {
  if (!urlPath) return false;
  const clean = urlPath.split('?')[0].toLowerCase();
  return (
    clean.includes('/public-inquiry') ||
    clean.includes('/webhooks/inquiry-info') ||
    clean.includes('/webhooks/website')
  );
}

/**
 * Extracts public tenant webhook key from query, path, header, or body
 */
export function extractPublicKey(req: Request): string | undefined {
  // 1. Query parameter (?key=...)
  const queryKey = req.query?.key as string | undefined;
  if (queryKey && typeof queryKey === 'string' && queryKey.trim()) {
    return queryKey.trim();
  }

  // 2. Custom header (x-tenant-key)
  const headerKey = (req.headers['x-tenant-key'] || req.headers['x-api-key']) as string | undefined;
  if (headerKey && typeof headerKey === 'string' && headerKey.trim()) {
    return headerKey.trim();
  }

  // 3. URL path parameter (:key)
  const url = req.originalUrl || req.url || '';
  const pathPart = url.split('?')[0];

  // Match /webhooks/inquiry-info/:key
  const infoMatch = pathPart.match(/\/webhooks\/inquiry-info\/([^/?#]+)/i);
  if (infoMatch && infoMatch[1]) {
    return decodeURIComponent(infoMatch[1]).trim();
  }

  // Match /webhooks/website/:key
  const websiteMatch = pathPart.match(/\/webhooks\/website\/([^/?#]+)/i);
  if (websiteMatch && websiteMatch[1]) {
    return decodeURIComponent(websiteMatch[1]).trim();
  }

  // Fallback: check query string in URL if req.query is not yet populated
  const qIdx = url.indexOf('?');
  if (qIdx !== -1) {
    const searchParams = new URLSearchParams(url.substring(qIdx));
    const k = searchParams.get('key');
    if (k && k.trim()) return k.trim();
  }

  // 4. Request body key (if parsed)
  if (req.body && typeof req.body === 'object' && req.body.key && typeof req.body.key === 'string') {
    return req.body.key.trim();
  }

  return undefined;
}

/**
 * Normalizes incoming origin to exact scheme, host, and port (e.g. https://example.com)
 */
export function parseExactOrigin(rawOrigin?: string): string | null {
  if (!rawOrigin || typeof rawOrigin !== 'string') return null;
  const trimmed = rawOrigin.trim();
  try {
    const u = new URL(trimmed);
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Resolves company by key and loads company's allowed website origins
 */
export async function resolveCompanyByKey(
  key: string,
  prisma: any,
): Promise<{ tenantId: string; allowedOrigins: string[] } | null> {
  const trimmed = key.trim();
  const keyHash = crypto.createHash('sha256').update(trimmed).digest('hex');

  let tenant: any = null;
  try {
    tenant = await prisma.tenant.findFirst({
      where: {
        OR: [{ webhookKeyHash: keyHash }, { webhookKeyHash: trimmed }],
        deletedAt: null,
        status: 'active',
      },
      select: { id: true },
    });
  } catch {
    return null;
  }

  if (!tenant) return null;

  // Read company allowed origins from database table or fallback store
  let allowedOrigins: string[] = [];
  try {
    const settings = await prisma.webFormSettings?.findUnique({
      where: { tenantId: tenant.id },
      select: { allowedOrigins: true },
    });
    if (settings && settings.allowedOrigins) {
      allowedOrigins = Array.isArray(settings.allowedOrigins)
        ? settings.allowedOrigins
        : JSON.parse(settings.allowedOrigins || '[]');
    }
  } catch {
    // Graceful fallback to file store
  }

  if (allowedOrigins.length === 0) {
    const fallback = readWebFormSettingsStore();
    if (fallback[tenant.id]?.allowedOrigins) {
      allowedOrigins = fallback[tenant.id].allowedOrigins;
    }
  }

  // Normalize all allowed origins in the list
  const normalizedList = allowedOrigins
    .map((o) => parseExactOrigin(o))
    .filter((o): o is string => Boolean(o));

  return {
    tenantId: tenant.id,
    allowedOrigins: normalizedList,
  };
}

/**
 * Prevents response from ever setting cookies or credentials headers
 */
function enforceNoCookiesAndNoCredentials(res: Response): void {
  // Override setHeader to intercept set-cookie and access-control-allow-credentials
  const origSetHeader = res.setHeader.bind(res);
  res.setHeader = function (name: string, value: any) {
    const lower = name.toLowerCase();
    if (lower === 'set-cookie' || lower === 'access-control-allow-credentials') {
      return res; // drop silently
    }
    return origSetHeader(name, value);
  };

  res.removeHeader('Set-Cookie');
  res.removeHeader('set-cookie');
  res.removeHeader('Access-Control-Allow-Credentials');
  res.removeHeader('access-control-allow-credentials');
}

/**
 * Dedicated CORS & Origin verification handler for public inquiry routes
 */
export async function handlePublicCors(
  req: Request,
  res: Response,
  next: NextFunction,
  prisma: any,
): Promise<void> {
  const url = req.originalUrl || req.url || '';
  if (!isPublicInquiryRoute(url)) {
    return next();
  }

  // Security invariant: public endpoints never allow credentials and never set cookies
  enforceNoCookiesAndNoCredentials(res);

  // 1. Key must be provided
  const key = extractPublicKey(req);
  if (!key) {
    // Missing key: plain 404 'This form is not available' without CORS headers
    res.removeHeader('Access-Control-Allow-Origin');
    res.removeHeader('Access-Control-Allow-Methods');
    res.removeHeader('Access-Control-Allow-Headers');
    res.status(404).type('text/plain').send('This form is not available');
    return;
  }

  // 2. Company lookup by key
  const company = await resolveCompanyByKey(key, prisma);
  if (!company) {
    // Unknown key: plain 404 'This form is not available' without CORS headers
    res.removeHeader('Access-Control-Allow-Origin');
    res.removeHeader('Access-Control-Allow-Methods');
    res.removeHeader('Access-Control-Allow-Headers');
    res.status(404).type('text/plain').send('This form is not available');
    return;
  }

  // 3. Origin verification
  const rawOrigin = req.headers.origin as string | undefined;

  // Server-to-server calls without an Origin header stay allowed with the key
  if (!rawOrigin) {
    res.removeHeader('Access-Control-Allow-Origin');
    return next();
  }

  const incomingOrigin = parseExactOrigin(rawOrigin);
  const allowedList = company.allowedOrigins || [];

  // When the list is empty, browser requests from other origins are rejected
  if (!incomingOrigin || allowedList.length === 0 || !allowedList.includes(incomingOrigin)) {
    res.removeHeader('Access-Control-Allow-Origin');
    res.removeHeader('Access-Control-Allow-Methods');
    res.removeHeader('Access-Control-Allow-Headers');
    if (req.method === 'OPTIONS') {
      res.status(403).type('text/plain').send('Origin not permitted by form configuration.');
      return;
    }
    res.status(403).type('text/plain').send('Origin not permitted by form configuration.');
    return;
  }

  // Origin is allowed! Set public CORS headers (never credentials)
  res.setHeader('Access-Control-Allow-Origin', incomingOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Accept, X-Requested-With, x-tenant-key, range',
  );
  res.setHeader('Access-Control-Max-Age', '86400');
  res.removeHeader('Access-Control-Allow-Credentials');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  return next();
}
