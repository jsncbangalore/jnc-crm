/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Logger } from '@nestjs/common';

export type EnvCategory = 'REQUIRED' | 'FEATURE-GATED' | 'OPTIONAL';

export interface EnvDefinition {
  key: string;
  category: EnvCategory;
  description: string;
  isSecret?: boolean;
}

export const ENV_CATALOG: EnvDefinition[] = [
  // ─── REQUIRED FOR INITIAL LIVE START ──────────────────────────────────────
  { key: 'NODE_ENV', category: 'REQUIRED', description: 'Application environment (production, staging, development, test)' },
  { key: 'PORT', category: 'REQUIRED', description: 'Application HTTP listening port (defaults to 3000 if unset by hosting panel)' },
  { key: 'DATABASE_URL', category: 'REQUIRED', description: 'Database connection string (PostgreSQL pooler or SQLite)', isSecret: true },
  { key: 'JWT_SECRET', category: 'REQUIRED', description: 'HMAC-SHA256 secret for signing access tokens (>= 32 chars)', isSecret: true },
  { key: 'JWT_REFRESH_SECRET', category: 'REQUIRED', description: 'HMAC-SHA256 secret for signing refresh tokens (>= 32 chars)', isSecret: true },
  { key: 'OTP_SECRET', category: 'REQUIRED', description: 'HMAC-SHA256 secret for one-time verification codes (>= 32 chars)', isSecret: true },
  { key: 'ENCRYPTION_KEY', category: 'REQUIRED', description: 'AES-256-GCM encryption key (32 bytes base64 encoded)', isSecret: true },
  { key: 'FRONTEND_URL', category: 'REQUIRED', description: 'Full URL of frontend application (e.g. https://your-domain.com)' },
  { key: 'ALLOWED_ORIGINS', category: 'REQUIRED', description: 'Comma-separated list of allowed CORS origins' },
  { key: 'SMTP_HOST', category: 'REQUIRED', description: 'SMTP server hostname for transactional email delivery' },
  { key: 'SMTP_PORT', category: 'REQUIRED', description: 'SMTP server port (e.g. 587 or 465)' },
  { key: 'SMTP_USER', category: 'REQUIRED', description: 'SMTP authentication username / sender account' },
  { key: 'SMTP_PASS', category: 'REQUIRED', description: 'SMTP authentication password', isSecret: true },
  { key: 'EMAIL_FROM', category: 'REQUIRED', description: 'Canonical outbound sender address' },

  // ─── FEATURE-GATED (Disabled unless configured; routes return 503/404) ────
  { key: 'WHATSAPP_APP_SECRET', category: 'FEATURE-GATED', description: 'Meta WhatsApp webhook HMAC signature verification secret', isSecret: true },
  { key: 'WHATSAPP_VERIFY_TOKEN', category: 'FEATURE-GATED', description: 'Meta WhatsApp webhook subscription handshake token', isSecret: true },
  { key: 'INDIAMART_WEBHOOK_SECRET', category: 'FEATURE-GATED', description: 'IndiaMART push API shared secret token', isSecret: true },
  { key: 'WEBSITE_WEBHOOK_SECRET', category: 'FEATURE-GATED', description: 'Website RFQ & contact form submission secret token', isSecret: true },
  { key: 'BACKUP_ENCRYPTION_KEY', category: 'FEATURE-GATED', description: 'AES-256-GCM database backup archive encryption key', isSecret: true },

  // ─── OPTIONAL / RUNTIME SETTINGS & SCRIPT GUARDS ─────────────────────────
  { key: 'PRODUCT_NAME', category: 'OPTIONAL', description: 'White-label application product display name (default: CRM)' },
  { key: 'PRODUCT_LOGO_URL', category: 'OPTIONAL', description: 'White-label application product logo URL' },
  { key: 'TRUST_PROXY', category: 'OPTIONAL', description: 'Number of upstream reverse proxy hops (integer, default: 1 in production, 0 in development; never true)' },
  { key: 'SMTP_FROM', category: 'OPTIONAL', description: 'Deprecated alias for EMAIL_FROM (emits warning if used)' },
  { key: 'CORS_ORIGIN', category: 'OPTIONAL', description: 'Legacy alias for ALLOWED_ORIGINS' },
  { key: 'CORS_ORIGINS', category: 'OPTIONAL', description: 'Legacy alias for ALLOWED_ORIGINS' },
  { key: 'JWT_EXPIRATION', category: 'OPTIONAL', description: 'Access token expiration duration (default: 15m)' },
  { key: 'APP_URL', category: 'OPTIONAL', description: 'Backend public URL if different from request host' },
  { key: 'BACKUP_OFFSITE_PATH', category: 'OPTIONAL', description: 'Custom offsite backup directory path (default: backups/offsite)' },
  { key: 'CUSTOMER_LIST_SCOPE', category: 'OPTIONAL', description: 'Overrides customer list visibility scoping behavior' },
  { key: 'LEGACY_WEBHOOK_TENANT_CODE', category: 'OPTIONAL', description: 'Tenant code pinned for deprecated unkeyed webhooks' },
  { key: 'WEBSITE_SUBMISSION_SECRET', category: 'OPTIONAL', description: 'Legacy alias for WEBSITE_WEBHOOK_SECRET' },
  { key: 'ALLOW_OLD_LIVE', category: 'OPTIONAL', description: 'Set to "yes" only during emergency rollback to permit old Supabase database' },
  { key: 'ALLOWED_DB_HOSTS', category: 'OPTIONAL', description: 'Whitelist of allowed database hostnames in maintenance scripts' },
  { key: 'ALLOWED_DB_PROJECT_REFS', category: 'OPTIONAL', description: 'Whitelist of allowed Supabase project references in scripts' },
  { key: 'BLOCKED_DB_PROJECT_REFS', category: 'OPTIONAL', description: 'Blacklist of Supabase project references to protect against accidental writes' },
  { key: 'CONFIRM_PRODUCTION', category: 'OPTIONAL', description: 'Requires "yes" before running destructive production scripts' },
  { key: 'OWNER_EMAIL', category: 'OPTIONAL', description: 'Real mailbox for owner account (used by owner:reset & prod:bootstrap)' },
  { key: 'OWNER_PASSWORD', category: 'OPTIONAL', description: 'Initial or override password for owner account in scripts', isSecret: true },
  { key: 'OWNER_NAME', category: 'OPTIONAL', description: 'Display name for owner account in scripts' },
  { key: 'PLATFORM_ADMIN_EMAIL', category: 'OPTIONAL', description: 'Real mailbox for platform admin (used by platform:reset & prod:bootstrap)' },
  { key: 'PLATFORM_PASSWORD', category: 'OPTIONAL', description: 'Override password for platform admin in scripts', isSecret: true },
  { key: 'PLATFORM_ADMIN_NAME', category: 'OPTIONAL', description: 'Display name for platform admin in scripts' },
  { key: 'PLATFORM_ADMIN_CODE', category: 'OPTIONAL', description: 'Employee code override for platform admin' },
  { key: 'TENANT_NAME', category: 'OPTIONAL', description: 'Tenant company display name in prod:bootstrap' },
];

const KNOWN_DEFAULT_SECRETS = [
  'secret', 'changeme', 'jwt_secret', 'jwt-secret', 'default', '12345678', 'password', 'admin',
  'your-jwt-secret', 'your-refresh-secret', 'supersecret', 'your-database-password', '<password>',
  'type-your-own-long-password'
];

export interface EnvValidationResult {
  isValid: boolean;
  missingVariables: string[];
  configuredVariables: string[];
  invalidVariables: string[];
  warnings: string[];
  featureGatedStatus: Record<string, 'enabled' | 'disabled'>;
}

export interface ValidationOptions {
  exitOnError?: boolean;
  verbose?: boolean;
}

/**
 * Extracts Supabase project ref from user (postgres.<ref>) or hostname (db.<ref>.supabase.co)
 */
export function extractSupabaseProjectRef(urlStr?: string): string | null {
  if (!urlStr) return null;
  try {
    const parsed = new URL(urlStr);
    const user = decodeURIComponent(parsed.username || '');
    if (user.includes('.')) {
      return user.split('.').slice(1).join('.').toLowerCase();
    }
    const host = parsed.hostname.toLowerCase();
    if (host.endsWith('.supabase.co')) {
      const parts = host.split('.');
      if (parts.length >= 3 && parts[0] === 'db') {
        return parts[1].toLowerCase();
      }
    }
  } catch {
    const matchUser = urlStr.match(/:\/\/([^:/@]+)(?::[^@]*)?@/);
    if (matchUser && matchUser[1].includes('.')) {
      return matchUser[1].split('.').slice(1).join('.').toLowerCase();
    }
    const matchDirectHost = urlStr.match(/@db\.([a-z0-9_-]+)\.supabase\.co/i);
    if (matchDirectHost) {
      return matchDirectHost[1].toLowerCase();
    }
  }
  return null;
}

/**
 * Single unified validator function called by both startup guard (main.ts) and env:check script.
 */
export function validateEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  options: ValidationOptions = {}
): EnvValidationResult {
  const exitOnError = options.exitOnError ?? false;
  const verbose = options.verbose ?? false;
  const warnings: string[] = [];
  const missingVariables: string[] = [];
  const configuredVariables: string[] = [];
  const invalidVariables: string[] = [];
  const featureGatedStatus: Record<string, 'enabled' | 'disabled'> = {};

  // 1. Alias normalization: EMAIL_FROM vs SMTP_FROM
  if (env.SMTP_FROM && !env.EMAIL_FROM) {
    warnings.push("Using deprecated 'SMTP_FROM'. Please migrate environment configuration to 'EMAIL_FROM'.");
    env.EMAIL_FROM = env.SMTP_FROM;
  }

  // 2. Alias normalization: ALLOWED_ORIGINS vs CORS_ORIGIN / CORS_ORIGINS
  if ((env.CORS_ORIGIN || env.CORS_ORIGINS) && !env.ALLOWED_ORIGINS) {
    const aliased = (env.CORS_ORIGIN || env.CORS_ORIGINS || '').trim();
    warnings.push("Using legacy 'CORS_ORIGIN(S)'. Please configure canonical 'ALLOWED_ORIGINS'.");
    env.ALLOWED_ORIGINS = aliased;
  }

  // 3. Hosting default: PORT (defaults to 3000 if unset by hosting panel)
  if (!env.PORT || env.PORT.trim() === '') {
    env.PORT = '3000';
    if (verbose) {
      console.log("[INFO] PORT is unset by hosting panel; defaulted to '3000'.");
    }
  }

  // 4. Strict check for REQUIRED variables
  const mailProviderRaw = (env.MAIL_PROVIDER || '').trim().toLowerCase();
  const mailProvider = mailProviderRaw === 'resend' || (!mailProviderRaw && env.RESEND_API_KEY)
    ? 'resend'
    : (mailProviderRaw === 'brevo' || (!mailProviderRaw && env.BREVO_API_KEY) ? 'brevo' : 'smtp');

  const requiredKeys = [
    'NODE_ENV',
    'PORT',
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'ENCRYPTION_KEY',
    'FRONTEND_URL',
    'ALLOWED_ORIGINS',
    'EMAIL_FROM',
  ];

  if (mailProvider === 'smtp') {
    requiredKeys.push('SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS');
  } else if (mailProvider === 'resend') {
    requiredKeys.push('RESEND_API_KEY');
  } else if (mailProvider === 'brevo') {
    requiredKeys.push('BREVO_API_KEY');
  }

  for (const key of requiredKeys) {
    const val = env[key];
    if (!val || val.trim() === '') {
      missingVariables.push(key);
    } else {
      configuredVariables.push(key);
    }
  }

  // 5. Value and cryptographic format validation
  if (env.NODE_ENV) {
    const validEnvs = ['production', 'staging', 'development', 'test'];
    if (!validEnvs.includes(env.NODE_ENV.toLowerCase())) {
      invalidVariables.push(`NODE_ENV must be one of [${validEnvs.join(', ')}], received '${env.NODE_ENV}'.`);
    }
  }

  const isProduction = env.NODE_ENV?.toLowerCase() === 'production';

  // Mail provider validation and warnings
  const isRender = !!(env.RENDER || process.env.RENDER);
  if (mailProvider === 'smtp' && isProduction && isRender) {
    warnings.push('CRITICAL: MAIL_PROVIDER is smtp while running on Render in production mode. Render blocks outbound SMTP ports 25, 465, and 587. Email delivery will fail. Set MAIL_PROVIDER=resend or brevo.');
  } else if (mailProvider === 'smtp' && isProduction) {
    warnings.push('SMTP ports 25, 465, 587 are blocked on Render free/starter tiers. Use RESEND or BREVO.');
  }

  if (mailProvider === 'resend') {
    if (!env.RESEND_API_KEY || !env.RESEND_API_KEY.trim()) {
      invalidVariables.push("MAIL_PROVIDER is 'resend', but RESEND_API_KEY is missing or empty.");
    }
    const fromEmail = (env.EMAIL_FROM || process.env.EMAIL_FROM || '').trim().toLowerCase();
    if (!fromEmail) {
      invalidVariables.push("MAIL_PROVIDER is 'resend', but EMAIL_FROM is missing or empty.");
    }
  }

  if (env.PORT) {
    const portNum = parseInt(env.PORT, 10);
    if (isNaN(portNum) || portNum <= 0 || portNum > 65535) {
      invalidVariables.push(`PORT must be a valid integer between 1 and 65535, received '${env.PORT}'.`);
    }
  }

  if (env.JWT_SECRET) {
    const secret = env.JWT_SECRET;
    if (secret.length < 32) {
      invalidVariables.push(`JWT_SECRET must be at least 32 characters in length (current length: ${secret.length}).`);
    }
    if (KNOWN_DEFAULT_SECRETS.includes(secret.toLowerCase())) {
      invalidVariables.push('JWT_SECRET cannot use known weak or default values.');
    }
  }

  if (env.JWT_REFRESH_SECRET) {
    const rSecret = env.JWT_REFRESH_SECRET;
    if (rSecret.length < 32) {
      invalidVariables.push(`JWT_REFRESH_SECRET must be at least 32 characters in length (current length: ${rSecret.length}).`);
    }
    if (KNOWN_DEFAULT_SECRETS.includes(rSecret.toLowerCase())) {
      invalidVariables.push('JWT_REFRESH_SECRET cannot use known weak or default values.');
    }
    if (env.JWT_SECRET && rSecret === env.JWT_SECRET) {
      invalidVariables.push('JWT_REFRESH_SECRET must be distinct from JWT_SECRET.');
    }
  }

  if (isProduction) {
    if (!env.DATABASE_URL || !env.DATABASE_URL.trim()) {
      invalidVariables.push('DATABASE_URL is required in production mode.');
    }
    if (!env.FRONTEND_URL || !env.FRONTEND_URL.trim()) {
      invalidVariables.push('FRONTEND_URL is required in production mode.');
    }
    if (!env.ALLOWED_ORIGINS || !env.ALLOWED_ORIGINS.trim()) {
      invalidVariables.push('ALLOWED_ORIGINS is required in production mode.');
    }
    if (!env.EMAIL_FROM || !env.EMAIL_FROM.trim()) {
      invalidVariables.push('EMAIL_FROM is required in production mode.');
    }
    if (!env.SMTP_HOST || !env.SMTP_HOST.trim()) {
      invalidVariables.push('SMTP_HOST is required in production mode.');
    }
    if (!env.SMTP_PORT || !String(env.SMTP_PORT).trim()) {
      invalidVariables.push('SMTP_PORT is required in production mode.');
    }
    if (!env.SMTP_USER || !env.SMTP_USER.trim()) {
      invalidVariables.push('SMTP_USER is required in production mode.');
    }
    if (!env.SMTP_PASS || !env.SMTP_PASS.trim()) {
      invalidVariables.push('SMTP_PASS is required in production mode.');
    }
    if (env.EMAIL_FROM && env.SMTP_USER) {
      const canonicalFrom = env.EMAIL_FROM.trim().toLowerCase();
      const canonicalUser = env.SMTP_USER.trim().toLowerCase();
      if (canonicalFrom !== canonicalUser) {
        invalidVariables.push(
          `EMAIL_FROM ('${env.EMAIL_FROM}') must match SMTP_USER ('${env.SMTP_USER}') in production mode.`
        );
      }
    }
    if (!env.OTP_SECRET && env.JWT_SECRET && env.JWT_SECRET.trim().length >= 32) {
      env.OTP_SECRET = env.JWT_SECRET;
    }
    if (!env.OTP_SECRET || env.OTP_SECRET.trim().length < 32) {
      invalidVariables.push(
        `OTP_SECRET is required and must be at least 32 characters in length in production (current length: ${env.OTP_SECRET ? env.OTP_SECRET.trim().length : 0}).`,
      );
    }
    if (env.OTP_SECRET && KNOWN_DEFAULT_SECRETS.includes(env.OTP_SECRET.toLowerCase())) {
      invalidVariables.push('OTP_SECRET cannot use known weak or default values.');
    }
    if (!env.ENCRYPTION_KEY || env.ENCRYPTION_KEY.trim().length < 32) {
      invalidVariables.push(
        `ENCRYPTION_KEY (mail password encryption key) is required and must be at least 32 characters in production (current length: ${env.ENCRYPTION_KEY ? env.ENCRYPTION_KEY.trim().length : 0}).`,
      );
    }
  } else if (env.OTP_SECRET && env.OTP_SECRET.length < 32) {
    warnings.push(`OTP_SECRET is recommended to be at least 32 characters (current: ${env.OTP_SECRET.length}).`);
  }

  if (env.ENCRYPTION_KEY) {
    const key = env.ENCRYPTION_KEY;
    try {
      const buf = Buffer.from(key, 'base64');
      if (buf.length !== 32) {
        if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
          // Allowed: 32 bytes hex encoded
        } else {
          invalidVariables.push(`ENCRYPTION_KEY must be exactly 32 bytes when base64-decoded (got ${buf.length} bytes).`);
        }
      }
    } catch {
      invalidVariables.push('ENCRYPTION_KEY is not a valid base64-encoded string.');
    }
  }

  if (env.FRONTEND_URL) {
    try {
      const parsed = new URL(env.FRONTEND_URL);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        invalidVariables.push(`FRONTEND_URL must use http or https protocol (received: '${env.FRONTEND_URL}').`);
      }
      if (isProduction && !env.FRONTEND_URL.toLowerCase().startsWith('https://')) {
        invalidVariables.push(`FRONTEND_URL must use https:// protocol in production mode (received: '${env.FRONTEND_URL}').`);
      }
    } catch {
      invalidVariables.push(`FRONTEND_URL is not a valid URL: '${env.FRONTEND_URL}'.`);
    }
  }

  if (env.ALLOWED_ORIGINS) {
    const isProd = env.NODE_ENV?.toLowerCase() === 'production';
    const origins = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
    if (isProd && origins.includes('*')) {
      invalidVariables.push("Wildcard origin '*' in ALLOWED_ORIGINS is prohibited in production mode.");
    }
  }

  if (env.SMTP_FROM) {
    warnings.push('SMTP_FROM is deprecated. Use EMAIL_FROM as the canonical environment variable.');
    if (!env.EMAIL_FROM) {
      process.env.EMAIL_FROM = env.SMTP_FROM;
    }
  }

  if (isProduction && process.env.COOKIE_SECURE === 'false') {
    warnings.push('COOKIE_SECURE=false is ignored in production mode. Secure flag is strictly enforced.');
    delete process.env.COOKIE_SECURE;
  }

  if (env.SMTP_PORT) {
    const p = parseInt(env.SMTP_PORT, 10);
    if (isNaN(p) || p <= 0 || p > 65535) {
      invalidVariables.push(`SMTP_PORT must be a valid integer port between 1 and 65535 (received: '${env.SMTP_PORT}').`);
    }
  }

  if (env.EMAIL_FROM || process.env.EMAIL_FROM) {
    const targetEmail = env.EMAIL_FROM || process.env.EMAIL_FROM;
    if (!targetEmail || !targetEmail.includes('@')) {
      invalidVariables.push(`EMAIL_FROM must be a valid email address (received: '${targetEmail}').`);
    }
  }

  if (env.TRUST_PROXY !== undefined && env.TRUST_PROXY !== '') {
    if (env.TRUST_PROXY.toLowerCase() === 'true') {
      invalidVariables.push('TRUST_PROXY cannot be "true" (boolean). It must be an integer count of proxy hops (e.g. 1) to prevent IP spoofing.');
    } else {
      const hops = parseInt(env.TRUST_PROXY, 10);
      if (isNaN(hops) || hops < 0) {
        invalidVariables.push(`TRUST_PROXY must be a non-negative integer (received: '${env.TRUST_PROXY}').`);
      }
    }
  } else if (isProduction) {
    warnings.push('TRUST_PROXY is unset in production; defaulting to 1 hop. If all users share an IP or get blocked together, check TRUST_PROXY.');
  }

  if (env.DATABASE_URL) {
    const dbUrl = env.DATABASE_URL;
    let hostname = '';
    try {
      const parsed = new URL(dbUrl);
      hostname = parsed.hostname;
    } catch {
      const match = dbUrl.match(/@([^:/]+)(?::(\d+))?(?:\/(.+))?$/);
      if (match) hostname = match[1];
    }

    const allowOldLive = env.ALLOW_OLD_LIVE?.toLowerCase() === 'yes';
    const projectRef = extractSupabaseProjectRef(dbUrl);

    const blockedRefs = (env.BLOCKED_DB_PROJECT_REFS || '')
      .split(',')
      .map((r) => r.trim().toLowerCase())
      .filter(Boolean);

    const allowedRefs = (env.ALLOWED_DB_PROJECT_REFS || '')
      .split(',')
      .map((r) => r.trim().toLowerCase())
      .filter(Boolean);

    const allowedHosts = (env.ALLOWED_DB_HOSTS || '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);

    const isLocal = ['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(hostname.toLowerCase());
    const isSupabase = hostname.toLowerCase().endsWith('supabase.com') || hostname.toLowerCase().endsWith('supabase.co');

    if (projectRef) {
      if (blockedRefs.includes(projectRef)) {
        if (!allowOldLive) {
          invalidVariables.push(`DATABASE_URL targets blocked legacy project reference '${projectRef}'. To override for rollback, set ALLOW_OLD_LIVE=yes.`);
        }
      } else if (isProduction && allowedRefs.length > 0 && !allowedRefs.includes(projectRef)) {
        if (!allowOldLive) {
          invalidVariables.push(`DATABASE_URL project reference '${projectRef}' is not in ALLOWED_DB_PROJECT_REFS.`);
        }
      }
    } else if (isSupabase) {
      invalidVariables.push('Supabase DATABASE_URL requires project reference in user name (postgres.<project-ref>), but none was found.');
    } else if (hostname && !isLocal && allowedHosts.length > 0 && !allowedHosts.includes(hostname.toLowerCase())) {
      invalidVariables.push(`Database host '${hostname}' is neither local nor declared in ALLOWED_DB_HOSTS.`);
    }
  }

  // 6. FEATURE-GATED variables checks
  const featureGatedKeys = [
    'WHATSAPP_APP_SECRET',
    'WHATSAPP_VERIFY_TOKEN',
    'INDIAMART_WEBHOOK_SECRET',
    'WEBSITE_WEBHOOK_SECRET',
    'BACKUP_ENCRYPTION_KEY',
  ];

  for (const key of featureGatedKeys) {
    const val = env[key];
    if (val && val.trim() !== '') {
      featureGatedStatus[key] = 'enabled';
      configuredVariables.push(key);
      if (val.length < 16) {
        invalidVariables.push(`${key} is enabled but must be at least 16 characters in length.`);
      }
      if (KNOWN_DEFAULT_SECRETS.includes(val.toLowerCase())) {
        invalidVariables.push(`${key} is enabled but cannot use known default/placeholder secrets.`);
      }
    } else {
      featureGatedStatus[key] = 'disabled';
    }
  }

  const isValid = missingVariables.length === 0 && invalidVariables.length === 0;

  if (warnings.length > 0 && (verbose || exitOnError)) {
    warnings.forEach((w) => console.warn(`  [WARN] ${w}`));
  }

  if (!isValid && exitOnError) {
    console.error('\n================================================================================');
    console.error('[FATAL]: SERVER ENVIRONMENT VALIDATION FAILED');
    console.error('================================================================================');

    if (missingVariables.length > 0) {
      console.error('The following REQUIRED variables are missing or empty:');
      missingVariables.forEach((k) => {
        const def = ENV_CATALOG.find((m) => m.key === k);
        console.error(`  [-] [MISSING] ${k.padEnd(24)} - ${def?.description || ''}`);
      });
      console.error('');
    }

    if (invalidVariables.length > 0) {
      console.error('The following variables failed security / format validation:');
      invalidVariables.forEach((err) => {
        console.error(`  [-] [INVALID] ${err}`);
      });
      console.error('');
    }

    console.error('Feature-gated integrations status:');
    Object.entries(featureGatedStatus).forEach(([k, status]) => {
      console.error(`  - ${k.padEnd(28)} : ${status.toUpperCase()} ${status === 'disabled' ? '(routes will return 503/404)' : ''}`);
    });

    console.error('\nAborting server bootstrap to prevent unconfigured or insecure execution.');
    console.error('================================================================================\n');

    process.exit(1);
  }

  return {
    isValid,
    missingVariables,
    configuredVariables,
    invalidVariables,
    warnings,
    featureGatedStatus,
  };
}

/**
 * Startup guard exported for main.ts bootstrap.
 */
export function validateEnvironmentOrExit(env: NodeJS.ProcessEnv = process.env): EnvValidationResult {
  const logger = new Logger('EnvironmentValidationGuard');
  const result = validateEnvironment(env, { exitOnError: true });
  logger.log('Environment validation passed. All required runtime variables and secrets are configured.');
  return result;
}
