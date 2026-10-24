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
  const appRootEnv = path.resolve(process.cwd(), '.env');
  const distParentEnv = path.resolve(__dirname, '../.env'); // When running as node dist/main.js
  const envPath = fs.existsSync(appRootEnv)
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
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';
import * as cors from 'cors';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { corsOriginCallback, getCorsOriginsCount, getAllowedCorsHosts } from './common/cors-config';
import { getFrontendUrl, getDatabaseProjectRef } from './common/url.util';
import { requestIdMiddleware } from './common/request-id.middleware';
import { GlobalHttpExceptionFilter } from './common/http-exception.filter';
import { SanitizeResponseInterceptor } from './common/sanitize-response.interceptor';
import { CacheControlInterceptor } from './common/cache-control.interceptor';
import { StripTenantPayloadInterceptor } from './common/strip-tenant-payload.interceptor';
import { parseTrustProxy } from './common/trust-proxy.util';
import { handlePublicCors, isPublicInquiryRoute } from './common/public-cors';
import { PrismaService } from './prisma/prisma.service';

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

  const app = await NestFactory.create(AppModule);

  // 2. Behind proxy: configure Express trust proxy so Throttler, audit logs, and rate limiters identify client IP correctly
  const expressApp = app.getHttpAdapter().getInstance();
  const isProd = process.env.NODE_ENV === 'production';
  const trustProxyHops = parseTrustProxy(process.env.TRUST_PROXY, isProd);
  expressApp.set('trust proxy', trustProxyHops);

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
  const mainCorsMiddleware = cors({
    origin: corsOriginCallback,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'Range'],
    exposedHeaders: ['Content-Disposition', 'Content-Range', 'Content-Length', 'X-Request-Id'],
    credentials: true,
  });

  app.use(async (req: any, res: any, next: any) => {
    const url = req.originalUrl || req.url || '';
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
