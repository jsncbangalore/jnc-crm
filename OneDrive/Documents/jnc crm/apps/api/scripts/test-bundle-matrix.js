/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const { spawn } = require('child_process');
const http = require('http');

const bundleDir = 'C:/dev/test-api-bundle';

function getBaseSystemEnv() {
  const env = { ...process.env };
  const keysToClean = [
    'NODE_ENV', 'PORT', 'DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY',
    'FRONTEND_URL', 'ALLOWED_ORIGINS', 'CORS_ORIGIN', 'CORS_ORIGINS', 'SMTP_HOST', 'SMTP_PORT',
    'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'EMAIL_FROM', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN',
    'INDIAMART_WEBHOOK_SECRET', 'WEBSITE_WEBHOOK_SECRET', 'BACKUP_ENCRYPTION_KEY', 'ALLOW_OLD_LIVE',
    'ALLOWED_DB_HOSTS', 'ALLOWED_DB_PROJECT_REFS', 'BLOCKED_DB_PROJECT_REFS'
  ];
  keysToClean.forEach((k) => delete env[k]);
  return env;
}

const requiredAppVars = {
  NODE_ENV: 'production',
  PORT: '3456',
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/crm_dev?schema=public',
  JWT_SECRET: process.env.JWT_SECRET || 'crm-super-secure-secret-key-2026',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'crm-super-secure-refresh-key-2026',
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'Xh5+HgGukquuYy3uOTKQEP6LzdsXjHhxnAvrtZa+sjY=',
  FRONTEND_URL: process.env.FRONTEND_URL || 'https://admin.example.com',
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || 'https://admin.example.com,http://localhost:5173',
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.example.com',
  SMTP_PORT: process.env.SMTP_PORT || '465',
  SMTP_USER: process.env.SMTP_USER || 'mailer@example.com',
  SMTP_PASS: process.env.SMTP_PASS || 'mock_app_password_1234',
  EMAIL_FROM: process.env.EMAIL_FROM || 'mailer@example.com',
};

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function killProcessTree(pid) {
  try {
    require('child_process').execSync(`taskkill /pid ${pid} /f /t 2>nul`);
  } catch (e) {
    // already exited
  }
}

async function runBaseline() {
  console.log('========================================================================');
  console.log('TEST 1: Baseline Start with ONLY Required Variables (No .env File)');
  console.log('Location:', bundleDir);
  console.log('Port: 3456');
  console.log('========================================================================\n');

  const env = { ...getBaseSystemEnv(), ...requiredAppVars };

  const child = spawn('node', ['start_server.js'], {
    cwd: bundleDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', (d) => (output += d.toString()));
  child.stderr.on('data', (d) => (output += d.toString()));

  let started = false;
  let status = null;
  let body = null;

  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try {
      const res = await makeRequest('http://127.0.0.1:3456/api/v1/auth/me');
      status = res.statusCode;
      body = res.body;
      started = true;
      break;
    } catch (e) {
      // server still starting
    }
  }

  // Gracefully terminate child server
  killProcessTree(child.pid);

  if (started && status === 401) {
    console.log(`[PASS] Bundle started cleanly without .env file.`);
    console.log(`[PASS] GET http://localhost:3456/api/v1/auth/me returned HTTP ${status} Unauthorized.`);
    console.log(`Response payload: ${body.trim()}\n`);
    return { ok: true, status, body };
  } else {
    console.error(`[FAIL] Server failed to return 401. Status: ${status}`);
    console.error('Server output:\n', output);
    return { ok: false, status, output };
  }
}

async function runRemovalTest(variableToRemove) {
  const env = { ...getBaseSystemEnv(), ...requiredAppVars };
  delete env[variableToRemove];

  return new Promise((resolve) => {
    const child = spawn('node', ['start_server.js'], {
      cwd: bundleDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    child.stdout.on('data', (d) => (output += d.toString()));
    child.stderr.on('data', (d) => (output += d.toString()));

    const timer = setTimeout(() => {
      killProcessTree(child.pid);
      resolve({
        variable: variableToRemove,
        exitCode: -1,
        refused: false,
        namedInOutput: false,
        message: 'Timeout (Server did not exit)',
        output,
      });
    }, 10000);

    child.on('close', (code) => {
      clearTimeout(timer);
      const namedInOutput = output.includes(variableToRemove);
      const refused = code !== 0 && namedInOutput;
      resolve({
        variable: variableToRemove,
        exitCode: code,
        refused,
        namedInOutput,
        output: output.trim(),
      });
    });
  });
}

async function main() {
  const baselineResult = await runBaseline();
  if (!baselineResult.ok) {
    process.exit(1);
  }

  console.log('========================================================================');
  console.log('TEST 2: Removal Matrix (Removing One Required Variable at a Time)');
  console.log('========================================================================\n');

  const requiredToTest = [
    'NODE_ENV',
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'ENCRYPTION_KEY',
    'FRONTEND_URL',
    'ALLOWED_ORIGINS',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'EMAIL_FROM',
  ];

  const results = [];

  for (const v of requiredToTest) {
    process.stdout.write(`Testing removal of ${v.padEnd(22)} ... `);
    const res = await runRemovalTest(v);
    if (res.refused) {
      console.log(`[REFUSED - PASS] Exit code ${res.exitCode}, explicitly named '${v}'`);
    } else {
      console.log(`[UNEXPECTED] Exit code ${res.exitCode}, refused=${res.refused}`);
      console.log('Output:\n', res.output);
    }
    results.push(res);
  }

  console.log('\n========================================================================================');
  console.log('SUMMARY MATRIX: REAL DEPLOY BUNDLE ENVIRONMENT VALIDATION');
  console.log('========================================================================================');
  console.log(`| Variable Removed       | Exit Code | Startup Refused? | Variable Named in Error? | Status |`);
  console.log(`|------------------------|-----------|------------------|--------------------------|--------|`);
  for (const r of results) {
    const status = r.refused ? 'PASS' : 'FAIL';
    console.log(
      `| ${r.variable.padEnd(22)} | ${(r.exitCode + '').padEnd(9)} | ${(r.refused ? 'YES' : 'NO').padEnd(16)} | ${(r.namedInOutput ? 'YES' : 'NO').padEnd(24)} | ${status.padEnd(6)} |`
    );
  }
  console.log('========================================================================================\n');
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
