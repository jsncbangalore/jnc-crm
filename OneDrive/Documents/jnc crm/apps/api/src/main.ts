/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import * as fs from 'fs';
import * as path from 'path';

// Load .env variables into process.env
try {
  const possiblePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../.env'),
  ];
  const envPath = possiblePaths.find((p) => fs.existsSync(p));
  if (envPath) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.substring(0, idx).trim();
        let val = trimmed.substring(idx + 1).trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.substring(1, val.length - 1);
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

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { validateEnvironmentOrExit } from './common/env-validation';
import { corsOriginCallback } from './common/cors-config';
import { requestIdMiddleware } from './common/request-id.middleware';
import { GlobalHttpExceptionFilter } from './common/http-exception.filter';
import { SanitizeResponseInterceptor } from './common/sanitize-response.interceptor';

async function bootstrap() {
  // 1. Strict Startup Secrets Validation Guard — Fail fast if mandatory secrets are missing
  validateEnvironmentOrExit();

  // 2. Log DB connection info (no password)
  const dbUrl = process.env.DATABASE_URL || '';
  let projectRef = 'unknown';
  let host = 'localhost';
  try {
    const matchHost = dbUrl.match(/@([^:\/]+)/);
    if (matchHost) host = matchHost[1];
    const matchRef = dbUrl.match(/postgres\.([a-z0-9]+)|db\.([a-z0-9]+)\.supabase|org\/([a-z0-9]+)/i);
    if (matchRef) {
      projectRef = matchRef[1] || matchRef[2] || matchRef[3];
    } else if (host.includes('supabase.com')) {
      projectRef = host.split('.')[0];
    } else {
      projectRef = process.env.NEW_PROJECT_REF || 'dev-local';
    }
  } catch (err) {}
  console.log(`Database project ${projectRef} @ ${host}`);

  const app = await NestFactory.create(AppModule);

  // 2. Behind proxy: configure Express trust proxy so Throttler and logs identify client IP correctly
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  // 3. HTTP Security via Helmet: HSTS (1 year + subdomains), CSP 'none', noSniff, frameguard deny, no-referrer
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
        },
      },
      noSniff: true,
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'no-referrer' },
      hidePoweredBy: true,
    }),
  );

  // 4. Parse cookies for HttpOnly refresh tokens
  app.use(cookieParser());

  // 5. Request ID tracking & secure logging (never log secrets/tokens/credentials)
  app.use(requestIdMiddleware);

  // 6. Body Size Limits: 1MB globally; 50MB only for spreadsheet import routes (leads and inventory)
  const defaultJsonParser = json({
    limit: '1mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  });
  const defaultUrlencodedParser = urlencoded({ extended: true, limit: '1mb' });
  const importJsonParser = json({
    limit: '50mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  });
  const importUrlencodedParser = urlencoded({ extended: true, limit: '50mb' });

  app.use((req: any, res: any, next: any) => {
    const isImportRoute =
      req.originalUrl &&
      (req.originalUrl.includes('/leads/import') ||
        req.originalUrl.includes('/inventory/import'));

    if (isImportRoute) {
      importJsonParser(req, res, (err: any) => {
        if (err) return next(err);
        importUrlencodedParser(req, res, next);
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
  app.useGlobalInterceptors(new SanitizeResponseInterceptor());

  // 10. CORS Configuration
  app.enableCors({
    origin: corsOriginCallback,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'Range'],
    exposedHeaders: ['Content-Disposition', 'Content-Range', 'Content-Length', 'X-Request-Id'],
    credentials: true,
  });

  const port = process.env.PORT || 3333;
  await app.listen(port);
  console.log(`JNC-CRM API running at http://localhost:${port}/api/v1`);
}

bootstrap();
