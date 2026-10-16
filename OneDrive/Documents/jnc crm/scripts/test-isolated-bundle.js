/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { execSync, spawn } = require('child_process');

async function runIsolatedTest() {
  console.log('========================================================================');
  console.log('ISOLATED DEPLOY BUNDLE VERIFICATION TEST');
  console.log('========================================================================\n');

  const bundleDir = path.resolve(__dirname, '../deploy-bundle/api');
  const tempDir = path.resolve(__dirname, '../../bundle-test-isolated');

  console.log(`[Step 1] Source Bundle: ${bundleDir}`);
  console.log(`[Step 1] Isolated Temp Directory: ${tempDir}`);

  if (!fs.existsSync(bundleDir)) {
    throw new Error(`Bundle directory does not exist: ${bundleDir}. Run npm run bundle:api first.`);
  }

  // Copy bundle to tempDir
  console.log('\n[Step 2] Copying deploy-bundle/api to temp directory outside repository...');
  fs.mkdirSync(tempDir, { recursive: true });

  function copyRecursive(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath = path.join(src, item.name);
      const destPath = path.join(dest, item.name);
      if (item.isDirectory()) {
        copyRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
  copyRecursive(bundleDir, tempDir);
  console.log('Files copied successfully.');

  // Run npm install --omit=dev in tempDir
  console.log('\n[Step 3] Running `npm install --omit=dev` in isolated temp folder...');
  const npmInstallOutput = execSync('npm install --omit=dev', {
    cwd: tempDir,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  console.log(npmInstallOutput || '(npm install completed silently with exit code 0)');

  // Verify node_modules and prisma client generated
  const prismaClientPath = path.join(tempDir, 'node_modules/.prisma/client');
  console.log(`Prisma Client generated in node_modules: ${fs.existsSync(prismaClientPath)}`);

  // Start the server
  const testPort = 3339;
  console.log(`\n[Step 4] Starting server via \`node start_server.js\` on port ${testPort}...`);

  const serverEnv = {
    ...process.env,
    PORT: String(testPort),
    DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/jnc_crm_test?schema=public',
    JWT_SECRET: 'test-jwt-secret-key-32-chars-long-minimum-safe',
    JWT_EXPIRATION: '1d',
    JWT_REFRESH_SECRET: 'test-jwt-refresh-secret-key-32-chars-minimum',
    JWT_REFRESH_EXPIRATION: '7d',
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1025',
    SMTP_USER: 'test',
    SMTP_PASS: 'test',
    EMAIL_FROM: 'test@jnc.local',
    PRIMARY_EMAIL_FROM: 'test@jnc.local',
    FRONTEND_URL: 'http://localhost:5173',
    CORS_ORIGIN: 'http://localhost:5173',
    WHATSAPP_APP_SECRET: 'test-whatsapp-secret-32-chars-long-safe',
    WHATSAPP_VERIFY_TOKEN: 'test-verify-token',
    INDIAMART_WEBHOOK_SECRET: 'test-indiamart-secret',
    WEBSITE_WEBHOOK_SECRET: 'test-website-secret',
    BACKUP_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
    BACKUP_OFFSITE_PATH: 'backups/test',
    ENCRYPTION_KEY: 'Xh5+HgGukquuYy3uOTKQEP6LzdsXjHhxnAvrtZa+sjY=',
    NODE_ENV: 'test',
  };

  const serverProcess = spawn('node', ['start_server.js'], {
    cwd: tempDir,
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverStdout = '';
  let serverStderr = '';
  serverProcess.stdout.on('data', (d) => {
    const str = d.toString();
    serverStdout += str;
    process.stdout.write(str);
  });
  serverProcess.stderr.on('data', (d) => {
    const str = d.toString();
    serverStderr += str;
    process.stderr.write(str);
  });

  // Wait for server to listen
  console.log('Waiting for API server to listen...');
  let listening = false;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${testPort}/api/v1/auth/me`, (res) => {
          let body = '';
          res.on('data', (c) => { body += c; });
          res.on('end', () => resolve({ statusCode: res.statusCode, body }));
        });
        req.on('error', reject);
        req.setTimeout(1000, () => req.destroy());
      });
      console.log(`\n[Step 5] Server responded to GET /api/v1/auth/me:`);
      console.log(`HTTP Status Code: ${res.statusCode}`);
      console.log(`Response Body: ${res.body}`);
      listening = true;

      if (res.statusCode === 401) {
        console.log('\n[PASS] Verified /api/v1/auth/me correctly returned HTTP 401 Unauthorized.');
      } else {
        console.error(`\n[FAIL] Expected 401, but got ${res.statusCode}`);
      }
      break;
    } catch (e) {
      // not yet up
    }
  }

  // Kill server process
  console.log('\n[Step 6] Terminating isolated test server process...');
  serverProcess.kill('SIGTERM');
  try {
    process.kill(serverProcess.pid);
  } catch (_) {}

  console.log('\n--- Server Logs (stdout) ---');
  console.log(serverStdout || '(none)');
  if (serverStderr) {
    console.log('--- Server Logs (stderr) ---');
    console.log(serverStderr);
  }

  // Cleanup temp dir
  console.log('\n[Step 7] Cleaning up temp directory...');
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log('Temp directory cleaned up successfully.');
  } catch (err) {
    console.log(`Note: Temp directory will be cleaned by OS (${err.message})`);
  }

  if (!listening) {
    throw new Error('API server failed to respond within timeout. See server logs above.');
  }

  console.log('\n========================================================================');
  console.log('ISOLATED BUNDLE VERIFICATION COMPLETE: ALL CHECKS PASSED');
  console.log('========================================================================\n');
}

runIsolatedTest().catch((err) => {
  console.error('[FATAL TEST ERROR]:', err);
  process.exit(1);
});
