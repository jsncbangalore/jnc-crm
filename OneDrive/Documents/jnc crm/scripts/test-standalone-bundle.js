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
const AdmZip = require('adm-zip');

const zipPath = path.resolve(__dirname, '../deploy-release/api-bundle.zip');
const targetDir = path.resolve(__dirname, '../deploy-release/test-api-bundle-standalone');
const secretsPath = process.env.SECRETS_PATH || path.resolve(__dirname, '../.secrets/live.env');

if (!fs.existsSync(zipPath)) {
  console.error(`[FAIL] Missing zip archive at ${zipPath}. Run release:pack first.`);
  process.exit(1);
}

const envContent = fs.readFileSync(secretsPath, 'utf8');
const envVars = { ...process.env };
envContent.split('\n').forEach(line => {
  line = line.trim();
  if (!line || line.startsWith('#')) return;
  const idx = line.indexOf('=');
  if (idx !== -1) {
    let k = line.substring(0, idx).trim();
    let v = line.substring(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.substring(1, v.length - 1);
    }
    envVars[k] = v;
  }
});

// Update connection_limit=5 on DATABASE_URL and EXPLICITLY DELETE DIRECT_URL
if (envVars.DATABASE_URL) {
  envVars.DATABASE_URL = envVars.DATABASE_URL.replace(/connection_limit=1/g, 'connection_limit=5');
}
delete envVars.DIRECT_URL;

envVars.PORT = '3340';
envVars.JWT_SECRET = envVars.JWT_SECRET || 'standalone-test-jwt-secret-key-32-chars-long-123456';
envVars.JWT_REFRESH_SECRET = envVars.JWT_REFRESH_SECRET || 'standalone-test-jwt-refresh-secret-key-32';
envVars.ENCRYPTION_KEY = envVars.ENCRYPTION_KEY || require('crypto').randomBytes(32).toString('base64');
envVars.FRONTEND_URL = envVars.FRONTEND_URL || 'https://admin.example.com';
envVars.ALLOWED_ORIGINS = envVars.ALLOWED_ORIGINS || 'https://admin.example.com';
envVars.SMTP_HOST = envVars.SMTP_HOST || 'smtp.example.com';
envVars.SMTP_PORT = envVars.SMTP_PORT || '465';
envVars.SMTP_USER = envVars.SMTP_USER || 'noreply@example.com';
envVars.SMTP_PASS = envVars.SMTP_PASS || 'mock-pass';
envVars.EMAIL_FROM = envVars.EMAIL_FROM || 'noreply@example.com';
envVars.TRUST_PROXY = '1';
envVars.NODE_ENV = 'production';

async function runStandaloneTest() {
  console.log('========================================================================');
  console.log('STANDALONE API BUNDLE VERIFICATION (WITHOUT DIRECT_URL)');
  console.log('========================================================================\n');

  console.log(`[1/4] Extracting ${zipPath} to ${targetDir} ...`);
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(targetDir, true);
  console.log(' -> Extracted successfully.');

  console.log('\n[2/4] Executing npm install --omit=dev --legacy-peer-deps in extracted bundle ...');
  execSync('npm install --omit=dev --legacy-peer-deps --ignore-scripts', { cwd: targetDir, stdio: 'inherit' });
  const prismaBin = path.join(targetDir, 'node_modules', 'prisma', 'build', 'index.js');
  execSync(`node "${prismaBin}" generate`, { cwd: targetDir, stdio: 'inherit', env: envVars });
  console.log(' -> npm install completed cleanly.');

  console.log('\n[3/4] Booting start_server.js on port 3340 (DATABASE_URL set, DIRECT_URL NOT set) ...');
  const serverProc = spawn('node', ['start_server.js'], {
    cwd: targetDir,
    env: envVars,
    stdio: 'pipe',
  });

  serverProc.stdout.on('data', d => process.stdout.write(d));
  serverProc.stderr.on('data', d => process.stderr.write(d));

  let online = false;
  let status = 0;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await new Promise((resolve, reject) => {
        const req = http.get('http://127.0.0.1:3340/api/v1/auth/me', (r) => {
          let b = '';
          r.on('data', chunk => b += chunk);
          r.on('end', () => resolve({ statusCode: r.statusCode, body: b }));
        });
        req.on('error', reject);
      });
      status = res.statusCode;
      if (status === 401) {
        online = true;
        break;
      }
    } catch (e) {}
  }

  serverProc.kill();

  console.log('\n[4/4] Assertion Verification:');
  console.log(` -> DIRECT_URL present in env: ${Boolean(envVars.DIRECT_URL)} (Expected: false)`);
  console.log(` -> DATABASE_URL contains connection_limit=5: ${envVars.DATABASE_URL.includes('connection_limit=5')}`);
  console.log(` -> GET /api/v1/auth/me Response Status: HTTP ${status} ${status === 401 ? '(PASS)' : '(FAIL)'}`);

  console.log('========================================================================');
  if (online && status === 401 && !envVars.DIRECT_URL) {
    console.log('[STANDALONE BUNDLE TEST PASSED COMPLETELY]');
  } else {
    console.error('[STANDALONE BUNDLE TEST FAILED]');
    process.exit(1);
  }
}

runStandaloneTest().catch(err => {
  console.error('[STANDALONE BUNDLE FAIL]', err.message);
  process.exit(1);
});
