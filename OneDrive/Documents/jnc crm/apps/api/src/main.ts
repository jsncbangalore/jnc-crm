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
import { json, urlencoded, static as expressStatic } from 'express';
import { validateEnvironmentOrExit } from './common/env-validation';
import { corsOriginCallback } from './common/cors-config';

async function bootstrap() {
  // 1. Strict Startup Secrets Validation Guard — Fail fast if mandatory secrets are missing
  validateEnvironmentOrExit();

  const app = await NestFactory.create(AppModule);

  // Capture rawBody buffer for HMAC-SHA256 signature verification (e.g. WhatsApp Webhooks)
  // while allowing up to 50MB payload for large spreadsheet uploads
  app.use(json({
    limit: '50mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // Serve purchase document uploads statically with inline display (prevent auto-download)
  const purchaseDocsDir = path.resolve(process.cwd(), '../../purchase-documents');
  if (!fs.existsSync(purchaseDocsDir)) fs.mkdirSync(purchaseDocsDir, { recursive: true });
  app.use(
    '/uploads/purchase-docs',
    expressStatic(purchaseDocsDir, {
      setHeaders: (res, filePath) => {
        res.setHeader('Content-Disposition', 'inline');
        if (filePath.endsWith('.avif')) res.setHeader('Content-Type', 'image/avif');
        if (filePath.endsWith('.webp')) res.setHeader('Content-Type', 'image/webp');
        if (filePath.endsWith('.png')) res.setHeader('Content-Type', 'image/png');
        if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) res.setHeader('Content-Type', 'image/jpeg');
        if (filePath.endsWith('.pdf')) res.setHeader('Content-Type', 'application/pdf');
      },
    })
  );

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Validation
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
  }));

  // CORS Configuration (Supports admin.jsnc.co.in, api.jsnc.co.in, localhost, and custom domains)
  app.enableCors({
    origin: corsOriginCallback,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'Range'],
    exposedHeaders: ['Content-Disposition', 'Content-Range', 'Content-Length'],
    credentials: true,
  });

  const port = process.env.PORT || 3333;
  await app.listen(port);
  console.log(`JNC-CRM API running at http://localhost:${port}/api/v1`);
}

bootstrap();
