/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');

// Load fallback database URL from secrets file if not present in environment
let dbUrl = process.env.DATABASE_URL;
let directUrl = process.env.DIRECT_URL;

const secretsPath = 'C:\\dev\\jnc-secrets\\live.env';
if (fs.existsSync(secretsPath)) {
  const envContent = fs.readFileSync(secretsPath, 'utf8');
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
      if (k === 'DATABASE_URL' && !dbUrl) dbUrl = v;
      if (k === 'DIRECT_URL' && !directUrl) directUrl = v;
    }
  });
}

// 32-byte valid base64 key for ENCRYPTION_KEY
const valid32ByteBase64Key = Buffer.from('12345678901234567890123456789012').toString('base64');

const env = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: '3333',
  FRONTEND_URL: 'https://admin.jsnc.co.in',
  ALLOWED_ORIGINS: 'https://admin.jsnc.co.in',
  MAIL_PROVIDER: 'brevo',
  BREVO_API_KEY: '<MASKED>',
  SMTP_HOST: 'smtp.brevo.com',
  SMTP_PORT: '587',
  SMTP_USER: 'jsnccrm@gmail.com',
  SMTP_PASS: '<MASKED>',
  EMAIL_FROM: 'jsnccrm@gmail.com',
  PRIMARY_EMAIL_FROM: 'jsnccrm@gmail.com',
  JWT_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  JWT_REFRESH_SECRET: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
  ENCRYPTION_KEY: valid32ByteBase64Key,
  DATABASE_URL: dbUrl || 'postgresql://postgres.aybysdzuwwtqhnzhgiwp:<MASKED>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
  DIRECT_URL: directUrl || 'postgresql://postgres.aybysdzuwwtqhnzhgiwp:<MASKED>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres',
};

console.log('=== STARTING API IN PRODUCTION MODE (NODE_ENV=production) ===\n');

const child = spawn('node', ['apps/api/dist/main.js'], {
  cwd: ROOT,
  env,
  stdio: ['pipe', 'pipe', 'pipe'],
});

let output = '';

child.stdout.on('data', (data) => {
  output += data.toString();
});

child.stderr.on('data', (data) => {
  output += data.toString();
});

setTimeout(() => {
  child.kill('SIGTERM');
  const lines = output.split('\n').filter(Boolean).slice(0, 40);
  console.log('--- FIRST 40 LINES OF PRODUCTION STARTUP LOG ---');
  console.log(lines.join('\n'));
  console.log('--- END OF STARTUP LOG CAPTURE ---');
  process.exit(0);
}, 8500);
