/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const Module = require('module');

// Standalone fallback resolution for monorepo packages (e.g. on Render / Hostinger)
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain) {
  if (request === '@crm/shared-validation') {
    const candidatePaths = [
      path.resolve(__dirname, 'dist/common/shared-validation.js'),
      path.resolve(__dirname, 'packages/shared-validation/dist/index.js'),
      path.resolve(__dirname, 'packages/shared-validation/index.js'),
    ];
    for (const c of candidatePaths) {
      if (fs.existsSync(c)) return c;
    }
  }
  return originalResolve.apply(this, arguments);
};

// Hosting panels often inject environment variables directly into process.env.
// Load .env only if the file exists in the application root directory.
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.substring(0, idx).trim();
      let val = trimmed.substring(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

// Automatically apply pending Prisma migrations on startup if DATABASE_URL is present
if (process.env.DATABASE_URL && process.env.SKIP_MIGRATE !== 'true') {
  try {
    console.log('[STARTUP] Applying database migrations via prisma migrate deploy...');
    const { execSync } = require('child_process');
    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      cwd: __dirname,
      env: process.env,
    });
    console.log('[STARTUP] Database migrations completed.');
  } catch (err) {
    console.error('[STARTUP] Note: prisma migrate deploy finished with warning:', err.message);
  }
}

// Require the compiled NestJS entry point
require('./dist/main.js');
