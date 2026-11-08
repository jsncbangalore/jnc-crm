/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import * as fs from 'fs';
import * as path from 'path';

// Load .env variables strictly from application root directory only (NEVER traverse into parent directories)
try {
  const isDev = process.env.NODE_ENV !== 'production';
  const customEnv = process.env.ENV_FILE;
  const devFile = path.resolve(process.cwd(), '.env.development');
  const distDevFile = path.resolve(__dirname, '../.env.development');
  const appRootEnv = path.resolve(process.cwd(), '.env');
  const distParentEnv = path.resolve(__dirname, '../.env');
  const envPath = (customEnv && fs.existsSync(customEnv))
    ? customEnv
    : (isDev && fs.existsSync(devFile))
      ? devFile
      : (isDev && fs.existsSync(distDevFile))
        ? distDevFile
        : fs.existsSync(appRootEnv)
          ? appRootEnv
          : fs.existsSync(distParentEnv)
            ? distParentEnv
            : null;

  if (envPath) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.substring(0, idx).trim();
        let val = trimmed.substring(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    });
  }
} catch (e) {
  // ignore
}

import { validateEnvironmentOrExit } from './common/env-validation';

// 1. Strict Startup Secrets Validation Guard — Fail fast before loading framework or modules
validateEnvironmentOrExit();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { formatValidationErrors } from './common/validation-error.formatter';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';
import * as cors from 'cors';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import {
  corsOriginCallback,
  getCorsOriginsCount,
  getAllowedCorsHosts,
  CORS_ALLOWED_METHODS,
  CORS_ALLOWED_HEADERS,
  CORS_EXPOSED_HEADERS,
} from './common/cors-config';
import { getFrontendUrl, getDatabaseProjectRef } from './common/url.util';
import { requestIdMiddleware } from './common/request-id.middleware';
import { GlobalHttpExceptionFilter } from './common/http-exception.filter';
import { SanitizeResponseInterceptor } from './common/sanitize-response.interceptor';
import { CacheControlInterceptor } from './common/cache-control.interceptor';
import { StripTenantPayloadInterceptor } from './common/strip-tenant-payload.interceptor';
import { parseTrustProxy } from './common/trust-proxy.util';
import { handlePublicCors, isPublicInquiryRoute } from './common/public-cors';
import { PrismaService } from './prisma/prisma.service';


import { getMigrationStatus } from './common/migration-status.util';

/**
 * Deploy Safety Startup Guard.
 * Compares migration folders in the build against applied migrations in _prisma_migrations table.
 * In production, logs a clear error and causes /health/ready to return not ready.
 * Outputs loud warning if SKIP_MIGRATE is set.
 */
async function verifyMigrationsAppliedOrExit(prisma: PrismaService) {
  if (process.env.SKIP_MIGRATE === 'true') {
    console.warn(
      '\n\x1b[43m\x1b[30m\x1b[1m [CRITICAL WARNING] SKIP_MIGRATE=true IS SET IN ENVIRONMENT! \x1b[0m\n' +
      '\x1b[33m\x1b[1m' +
      '  >> Automatic database migrations are disabled at startup.\n' +
      '  >> If the database schema does not match the application code, runtime queries will fail.\n' +
      '  >> Ensure migrations are applied manually before processing live traffic!\n' +
      '*******************************************************************************\x1b[0m\n'
    );
  }

  try {
    const status = await getMigrationStatus(prisma);
    console.log(`[STARTUP MIGRATIONS] Migration count: ${status.applied} applied in database / ${status.total} migration folder(s) present.`);

    if (!status.isReady) {
      const errorMsg =
        `\n\x1b[41m\x1b[37m\x1b[1m [SCHEMA GUARD REFUSAL] Refusing to start because ${status.pending.length} migration(s) are pending: \x1b[0m\n` +
        `Pending Migrations:\n  - ${status.pending.join('\n  - ')}\n` +
        `Applied in DB: ${status.applied} | Total folders: ${status.total}.\n` +
        'ACTION REQUIRED: Run "npx prisma migrate deploy" or set ALLOW_PENDING_MIGRATIONS=true for a development run.\n';

      if (process.env.ALLOW_PENDING_MIGRATIONS === 'true') {
        console.warn(`[SCHEMA GUARD BYPASS] ALLOW_PENDING_MIGRATIONS=true is active. Continuing dev run despite ${status.pending.length} pending migration(s): ${status.pending.join(', ')}`);
      } else {
        console.error(errorMsg);
        process.exit(1);
      }
    } else {
      console.log(`[MIGRATION GUARD] OK: All ${status.total} migrations have been applied.`);
    }
  } catch (err) {
    console.warn(`[MIGRATION GUARD] Warning during migration check: ${err.message}`);
  }
}

async function bootstrap() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const mailProvider = (process.env.MAIL_PROVIDER || 'smtp').trim().toLowerCase();
  const corsOriginsCount = getCorsOriginsCount();
  const corsHosts = getAllowedCorsHosts();
  const dbProjectRef = getDatabaseProjectRef();

  const emailFrom = process.env.EMAIL_FROM || process.env.PRIMARY_EMAIL_FROM || '';
  const fromDomain = emailFrom.includes('@') ? emailFrom.split('@')[1] : 'not-configured';

  console.log(
    `Startup Config | NODE_ENV: ${nodeEnv} | Mail Provider: ${mailProvider} | From Domain: ${fromDomain} | CORS Origins Count: ${corsOriginsCount} | Allowed CORS Hosts: [${corsHosts.join(', ')}] | DB Project Ref: ${dbProjectRef}`
  );

  // 2. Log DB connection info (no password)
  const dbUrl = process.env.DATABASE_URL || '';
  const match = dbUrl.match(/postgresql:\/\/[^@]+@([^/:]+)[:\/](.+?)(?:\?|$)/);
  if (match) {
    const host = match[1];
    const dbName = match[2];
    console.log(`Database: ${dbName} @ ${host}`);
  } else {
    console.log('Database: <unknown>');
  }

  const app = await NestFactory.create(AppModule, { rawBody: true });

  // 2. Behind proxy: configure Express trust proxy so Throttler, audit logs, and rate limiters identify client IP correctly
  const expressApp = app.getHttpAdapter().getInstance();
  const isProd = process.env.NODE_ENV === 'production';
  const trustProxyHops = parseTrustProxy(process.env.TRUST_PROXY, isProd);
  expressApp.set('trust proxy', trustProxyHops);

  // Root health endpoints for Cloudflare / Render health checks (ensures HEAD / and GET / return 200 OK)
  expressApp.get('/', (_req: any, res: any) => res.status(200).json({ status: 'ok', service: 'crm-api' }));
  expressApp.head('/', (_req: any, res: any) => res.status(200).end());

  // 3. HTTP Security via Helmet: HSTS, strict CSP, noSniff, frameguard deny, strict-origin-when-cross-origin
  app.use(
    helmet({
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      noSniff: true,
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hidePoweredBy: true,
    }),
  );


  // 4. Parse cookies for HttpOnly refresh tokens
  app.use(cookieParser());

  // 5. Request ID tracking & secure logging (never log secrets/tokens/credentials)
  app.use(requestIdMiddleware);

  // 5b. Strict Cache Headers: no-store on private routes, public cross-origin on branding, private no-store on file downloads
  app.use((req: any, res: any, next: any) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const url = (req.originalUrl || req.url || '').toLowerCase();
    const isPublicBranding =
      url.includes('/settings/branding/logo') ||
      url.includes('/settings/branding/stamp');

    if (isPublicBranding) {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      return next();
    }

    const isPrivateFileDownload =
      url.includes('/download') ||
      url.includes('/export') ||
      url.includes('/pdf') ||
      url.includes('/uploads') ||
      url.includes('/purchase-documents');

    if (isPrivateFileDownload) {
      res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else {
      res.setHeader(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate',
      );
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    next();
  });

  // 6. Body Size Limits: 64kb for public forms, 1MB globally, 50MB only for spreadsheet imports
  const defaultJsonParser = json({
    limit: '1mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  });
  const defaultUrlencodedParser = urlencoded({ extended: true, limit: '1mb' });

  const publicJsonParser = json({
    limit: '64kb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  });
  const publicUrlencodedParser = urlencoded({ extended: true, limit: '64kb' });

  const importJsonParser = json({
    limit: '50mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  });
  const importUrlencodedParser = urlencoded({ extended: true, limit: '50mb' });

  app.use((req: any, res: any, next: any) => {
    const url = req.originalUrl || req.url || '';
    const isImportRoute =
      url.includes('/leads/import') ||
      url.includes('/inventory/import');
    const isPublicRoute = isPublicInquiryRoute(url);

    if (isImportRoute) {
      importJsonParser(req, res, (err: any) => {
        if (err) return next(err);
        importUrlencodedParser(req, res, next);
      });
    } else if (isPublicRoute) {
      publicJsonParser(req, res, (err: any) => {
        if (err) return next(err);
        publicUrlencodedParser(req, res, next);
      });
    } else {
      defaultJsonParser(req, res, (err: any) => {
        if (err) return next(err);
        defaultUrlencodedParser(req, res, next);
      });
    }
  });

  // 7. Global API Prefix
  app.setGlobalPrefix('api/v1');

  // 8. Strict Global ValidationPipe
    app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (validationErrors) => {
        const formatted = formatValidationErrors(validationErrors);
        if (formatted.hasUnknownField) {
          return new BadRequestException({
            statusCode: 400,
            code: 'UNKNOWN_FIELD',
            message: formatted.topMessage,
            fieldErrors: [],
            unknownFields: formatted.unknownFields,
          });
        }
        return new BadRequestException({
          statusCode: 400,
          code: 'VALIDATION_FAILED',
          message: formatted.topMessage,
          fieldErrors: formatted.fieldErrors,
        });
      },
    }),
  );

  // 9. Global Error Masking in Production & Response Secret Sanitizer
  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  app.useGlobalInterceptors(
    new SanitizeResponseInterceptor(),
    new CacheControlInterceptor(),
    new StripTenantPayloadInterceptor(),
  );

  // 10. CORS Configuration: Dedicated handling for public endpoints vs authenticated app
  const prismaService = app.get(PrismaService);

  // Deploy Safety Guard: Refuse to start in production if migrations are pending
  await verifyMigrationsAppliedOrExit(prismaService);
  const mainCorsMiddleware = cors({
    origin: corsOriginCallback,
    methods: CORS_ALLOWED_METHODS,
    allowedHeaders: CORS_ALLOWED_HEADERS,
    exposedHeaders: CORS_EXPOSED_HEADERS,
    credentials: true,
  });

  app.use(async (req: any, res: any, next: any) => {
    const url = req.originalUrl || req.url || '';
    if (url === '/public/demo-request' || url.startsWith('/public/demo-request?')) {
      req.url = '/api/v1' + req.url;
    }
    if (url.includes('/public/demo-request')) {
      return next();
    }
    if (isPublicInquiryRoute(url)) {
      return handlePublicCors(req, res, next, prismaService);
    }
    return mainCorsMiddleware(req, res, next);
  });

  const port = process.env.PORT || 3333;
  await app.listen(port);
  console.log(`CRM API running at http://localhost:${port}/api/v1`);
}

bootstrap();
