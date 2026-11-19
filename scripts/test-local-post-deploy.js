const { spawn } = require('child_process');
const path = require('path');

const env = {
  ...process.env,
  PORT: '3334',
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/jnc_crm_clean_test?schema=public',
  DIRECT_URL: 'postgresql://postgres:postgres@localhost:5432/jnc_crm_clean_test?schema=public',
  JWT_SECRET: 'production_super_secret_jwt_key_at_least_32_chars_long!!',
  JWT_REFRESH_SECRET: 'production_super_secret_refresh_key_at_least_32_chars!!',
  ENCRYPTION_KEY: 'production_super_secret_aes_encryption_key_32_chars!!',
  OTP_SECRET: 'production_super_secret_otp_key_at_least_32_chars_long!!',
  FRONTEND_URL: 'https://admin.jsnc.co.in',
  ALLOWED_ORIGINS: 'https://admin.jsnc.co.in,https://jsnc.co.in,https://www.jsnc.co.in',
  EMAIL_FROM: 'no-reply@jsnc.co.in',
  PRIMARY_EMAIL_FROM: 'no-reply@jsnc.co.in',
  MAIL_PROVIDER: 'resend',
  RESEND_API_KEY: 're_dummy_mock_key_for_testing_1234567890',
  META_APP_SECRET: 'meta_dummy_secret_16chars!!',
  DEV_DEMO_LOGIN: 'false',
  ENV_FILE: path.join(__dirname, 'empty.env')
};

console.log('[TEST] Starting local production API on port 3334...');
const server = spawn('node', ['apps/api/dist/main.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });

let serverOutput = '';
server.stdout.on('data', d => serverOutput += d.toString());
server.stderr.on('data', d => serverOutput += d.toString());

async function run() {
  // Wait for server to start
  let started = false;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch('http://localhost:3334/api/v1/health');
      if (res.status === 200) {
        started = true;
        break;
      }
    } catch {}
  }

  if (!started) {
    console.error('[TEST] Server failed to start. Logs:\n', serverOutput);
    server.kill();
    process.exit(1);
  }

  console.log('[TEST] Server ready. Running post-deploy check against http://localhost:3334...');
  const check = spawn('node', ['scripts/post-deploy-login-check.js', 'http://localhost:3334'], { stdio: 'inherit' });

  check.on('exit', (code) => {
    console.log(`[TEST] Post-deploy check exited with code: ${code}`);
    server.kill();
    process.exit(code);
  });
}

run();
