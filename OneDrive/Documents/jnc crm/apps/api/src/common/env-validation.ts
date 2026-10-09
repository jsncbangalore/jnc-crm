/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Logger } from '@nestjs/common';

export interface EnvValidationResult {
  isValid: boolean;
  missingVariables: string[];
  configuredVariables: string[];
}

export const MANDATORY_ENV_VARS = [
  { key: 'PORT', description: 'Application HTTP port' },
  { key: 'DATABASE_URL', description: 'SQLite / PostgreSQL database connection URL' },
  { key: 'JWT_SECRET', description: 'Access token signing secret' },
  { key: 'JWT_REFRESH_SECRET', description: 'Refresh token signing secret' },
  { key: 'SMTP_HOST', description: 'SMTP server hostname for transactional emails' },
  { key: 'SMTP_PORT', description: 'SMTP server port (e.g. 465 / 587)' },
  { key: 'SMTP_USER', description: 'SMTP authentication username' },
  { key: 'SMTP_PASS', description: 'SMTP authentication password' },
  { key: 'EMAIL_FROM', description: 'Outbound email sender address' },
  { key: 'WHATSAPP_APP_SECRET', description: 'Meta WhatsApp webhook HMAC-SHA256 secret' },
  { key: 'WHATSAPP_VERIFY_TOKEN', description: 'Meta WhatsApp webhook verification token' },
  { key: 'INDIAMART_WEBHOOK_SECRET', description: 'IndiaMART push API shared secret token' },
  { key: 'WEBSITE_WEBHOOK_SECRET', description: 'Website RFQ & contact form shared secret' },
  { key: 'BACKUP_ENCRYPTION_KEY', description: 'AES-256-GCM database backup encryption key' },
  { key: 'ENCRYPTION_KEY', description: 'AES-256-GCM credentials encryption key (32 bytes base64)' },
];

const KNOWN_DEFAULT_SECRETS = [
  'secret', 'changeme', 'jwt_secret', 'jwt-secret', 'default', '12345678', 'password', 'admin'
];

export function validateEnvironmentOrExit(): EnvValidationResult {
  const logger = new Logger('EnvironmentValidationGuard');
  const missingVariables: string[] = [];
  const configuredVariables: string[] = [];
  const invalidVariables: string[] = [];

  // Alias SMTP_FROM to EMAIL_FROM with warning
  if (process.env.SMTP_FROM && !process.env.EMAIL_FROM) {
    logger.warn('SMTP_FROM is deprecated; aliasing to EMAIL_FROM. Please update configuration to use EMAIL_FROM.');
    process.env.EMAIL_FROM = process.env.SMTP_FROM;
  }

  // Deprecation warning for CORS_ORIGIN / CORS_ORIGINS
  if (process.env.CORS_ORIGIN || process.env.CORS_ORIGINS) {
    logger.warn('CORS_ORIGIN and CORS_ORIGINS are deprecated; use ALLOWED_ORIGINS instead.');
  }

  const isProduction = process.env.NODE_ENV === 'production';

  // Ignore COOKIE_SECURE=false in production
  if (isProduction && process.env.COOKIE_SECURE === 'false') {
    logger.warn('COOKIE_SECURE=false is ignored in production. Cookies are always secure in production.');
    process.env.COOKIE_SECURE = 'true';
  }

  // Enforce https:// FRONTEND_URL in production
  const frontendUrl = process.env.FRONTEND_URL || '';
  if (isProduction) {
    if (!frontendUrl || !frontendUrl.startsWith('https://')) {
      invalidVariables.push('In production, FRONTEND_URL must be specified and must start with https://');
    }
  }

  for (const item of MANDATORY_ENV_VARS) {
    const val = process.env[item.key];
    if (!val || val.trim() === '') {
      missingVariables.push(item.key);
    } else {
      configuredVariables.push(item.key);
    }
  }

  // Cryptographic Secret Strength Validation
  const jwtSecret = process.env.JWT_SECRET || '';
  if (jwtSecret.length < 32 || KNOWN_DEFAULT_SECRETS.includes(jwtSecret.toLowerCase())) {
    invalidVariables.push('JWT_SECRET must be at least 32 characters and cannot use known default values.');
  }

  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || '';
  if (jwtRefreshSecret.length < 32 || KNOWN_DEFAULT_SECRETS.includes(jwtRefreshSecret.toLowerCase())) {
    invalidVariables.push('JWT_REFRESH_SECRET must be at least 32 characters and cannot use known default values.');
  }

  const encryptionKey = process.env.ENCRYPTION_KEY || '';
  try {
    const keyBuf = Buffer.from(encryptionKey, 'base64');
    if (keyBuf.length !== 32) {
      invalidVariables.push('ENCRYPTION_KEY must be exactly 32 bytes when base64-decoded.');
    }
  } catch {
    invalidVariables.push('ENCRYPTION_KEY is not a valid base64-encoded string.');
  }

  if (missingVariables.length > 0) {
    console.error('\n================================================================================');
    console.error('❌ FATAL: MANDATORY SERVER ENVIRONMENT VARIABLES MISSING OR EMPTY');
    console.error('================================================================================');
    console.error('The application failed to start because the following required secrets are unset:\n');

    missingVariables.forEach((k) => {
      const def = MANDATORY_ENV_VARS.find((m) => m.key === k);
      console.error(`  ✖ [MISSING] ${k.padEnd(28)} - ${def?.description || ''}`);
    });

    console.error('\nConfigured Variables:');
    configuredVariables.forEach((k) => {
      console.error(`  ✔ [OK]      ${k.padEnd(28)}`);
    });

    console.error('\nAborting server bootstrap immediately to prevent insecure operation.');
    console.error('================================================================================\n');

    logger.error(`Application bootstrap aborted: ${missingVariables.length} mandatory environment variables are missing.`);
    process.exit(1);
  }

  if (invalidVariables.length > 0) {
    console.error('\n================================================================================');
    console.error('❌ FATAL: MANDATORY SERVER SECRETS FAILED SECURITY VALIDATION');
    console.error('================================================================================');
    invalidVariables.forEach((err) => {
      console.error(`  ✖ [SECURITY FLAW] ${err}`);
    });
    console.error('\nAborting server bootstrap immediately to prevent insecure operation.');
    console.error('================================================================================\n');

    logger.error(`Application bootstrap aborted: ${invalidVariables.length} secrets failed security validation.`);
    process.exit(1);
  }

  logger.log(`Environment validation passed. All ${MANDATORY_ENV_VARS.length} mandatory variables & secrets are configured.`);
  return { isValid: true, missingVariables: [], configuredVariables };
}
