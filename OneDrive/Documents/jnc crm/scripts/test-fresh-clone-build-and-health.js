/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync, spawn } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const CLONE_DIR = 'C:\\dev\\temp-crm-clone-test';

console.log('=== TESTING FRESH CLONE BUILD & START COMMANDS ===\n');

try {
  if (fs.existsSync(CLONE_DIR)) {
    fs.rmSync(CLONE_DIR, { recursive: true, force: true });
  }

  console.log(`[Step 1/4] Cloning repository to ${CLONE_DIR}...`);
  execSync(`git clone "${REPO_ROOT}" "${CLONE_DIR}"`, { stdio: 'inherit' });

  // Copy working apps/api/src into clone directory so uncommitted changes are included in build
  fs.cpSync(
    path.join(REPO_ROOT, 'apps', 'api', 'src'),
    path.join(CLONE_DIR, 'apps', 'api', 'src'),
    { recursive: true }
  );

  console.log('\n[Step 2/4] Executing render.yaml buildCommand (npm install && npx prisma generate && npm --workspace=apps/api run build)...');
  execSync('npm install --no-audit --no-fund && npx prisma generate --schema=apps/api/prisma/schema.prisma && npm --workspace=apps/api run build', {
    cwd: CLONE_DIR,
    stdio: 'inherit',
  });
  console.log('[PASS] Fresh clone build succeeded cleanly.');

  console.log('\n[Step 3/4] Starting API using startCommand (node apps/api/dist/main.js)...');
  const dummy32ByteKey = Buffer.from('12345678901234567890123456789012').toString('base64');
  const testPort = 3456;

  let dbUrl = 'postgresql://postgres:dummy_password@localhost:5432/postgres';
  let directUrl = 'postgresql://postgres:dummy_password@localhost:5432/postgres';

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(testPort),
    FRONTEND_URL: 'https://admin.example.com',
    ALLOWED_ORIGINS: 'https://admin.example.com',
    MAIL_PROVIDER: 'brevo',
    BREVO_API_KEY: 'dummy_brevo_key_1234567890',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    SMTP_USER: 'test@example.com',
    SMTP_PASS: 'dummy_smtp_pass_1234567890',
    EMAIL_FROM: 'test@example.com',
    PRIMARY_EMAIL_FROM: 'test@example.com',
    JWT_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    JWT_REFRESH_SECRET: 'fedcba0123456789fedcba0123456789fedcba0123456789fedcba0123456789',
    ENCRYPTION_KEY: dummy32ByteKey,
    DATABASE_URL: dbUrl,
    DIRECT_URL: directUrl,
    WHATSAPP_APP_SECRET: 'dummy_whatsapp_app_secret_12345',
    WHATSAPP_VERIFY_TOKEN: 'dummy_whatsapp_verify_token_12345',
    INDIAMART_WEBHOOK_SECRET: 'dummy_indiamart_webhook_secret_12345',
    WEBSITE_WEBHOOK_SECRET: 'dummy_website_webhook_secret_12345',
    BACKUP_ENCRYPTION_KEY: dummy32ByteKey,
  };

  const serverProcess = spawn(process.execPath, ['apps/api/dist/main.js'], {
    cwd: CLONE_DIR,
    env,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  serverProcess.on('error', (err) => {
    console.error(`[SPAWN ERROR] Failed to start server process: ${err.message}`);
  });

  let serverLogs = '';
  serverProcess.stdout.on('data', (d) => {
    const msg = d.toString();
    serverLogs += msg;
    process.stdout.write(`[SERVER STDOUT] ${msg}`);
  });
  serverProcess.stderr.on('data', (d) => {
    const msg = d.toString();
    serverLogs += msg;
    process.stderr.write(`[SERVER STDERR] ${msg}`);
  });

  console.log(`\n[Step 4/4] Polling HTTP GET http://127.0.0.1:${testPort}/api/v1/health...`);

  let attempts = 0;
  const maxAttempts = 60;

  function tryHealthCheck() {
    attempts++;
    http
      .get(`http://127.0.0.1:${testPort}/api/v1/health`, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          console.log(`\nHTTP Response Status: ${res.statusCode}`);
          console.log(`HTTP Response Body:   ${data}`);
          serverProcess.kill('SIGTERM');

          if (res.statusCode === 200 && data.includes('"status":"ok"')) {
            console.log('\n[PASS] HEALTH CHECK PASSED SUCCESSFULLY!');
            cleanupClone();
            process.exit(0);
          } else {
            console.error('\n[ERROR] HEALTH CHECK FAILED!');
            cleanupClone();
            process.exit(1);
          }
        });
      })
      .on('error', (err) => {
        if (attempts < maxAttempts) {
          setTimeout(tryHealthCheck, 1000);
        } else {
          console.error(`\nHTTP request error after ${maxAttempts} attempts: ${err.message}`);
          console.error('--- SERVER OUTPUT LOGS ---');
          console.error(serverLogs);
          serverProcess.kill('SIGTERM');
          cleanupClone();
          process.exit(1);
        }
      });
  }

  setTimeout(tryHealthCheck, 2500);

} catch (err) {
  console.error('Error during fresh clone test execution:', err);
  cleanupClone();
  process.exit(1);
}

function cleanupClone() {
  try {
    if (fs.existsSync(CLONE_DIR)) {
      fs.rmSync(CLONE_DIR, { recursive: true, force: true });
      console.log(`[INFO] Cleaned up temporary clone directory ${CLONE_DIR}`);
    }
  } catch (e) {}
}
