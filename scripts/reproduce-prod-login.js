/* --- Reproduce Production Login Issues --- */
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const bcrypt = require('bcryptjs');
const http = require('http');
const { spawn } = require('child_process');

const DB_URL = 'postgresql://postgres:postgres@localhost:5432/jnc_crm_clean_test?schema=public';
const prisma = new PrismaClient({ datasourceUrl: DB_URL });

async function setupUsers() {
  console.log('[SETUP] Preparing test tenant and users...');
  const tenant = await prisma.tenant.upsert({
    where: { code: 'REPRO' },
    update: { requireTwoFactor: false, status: 'active' },
    create: {
      code: 'REPRO',
      name: 'Repro Company',
      slug: 'repro',
      status: 'active',
      requireTwoFactor: false,
    },
  });

  const hash = await bcrypt.hash('TestPassword123!', 10);
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

  // Clean up any prior test users with these emails
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          'staff-repro@example.com',
          'admin-grace@example.com',
          'platform-grace@example.com',
          'user-2fa-enabled@example.com',
        ],
      },
    },
  });

  // Insert test users using raw SQL to bypass Prisma client schema mismatch during setup
  const staffId = '11111111-1111-1111-1111-111111111111';
  const adminId = '22222222-2222-2222-2222-222222222222';
  const platId = '33333333-3333-3333-3333-333333333333';
  const u2faId = '44444444-4444-4444-4444-444444444444';

  await prisma.$executeRawUnsafe(`
    INSERT INTO "User" (id, email, name, "employeeCode", "passwordHash", role, "tenantId", "isActive", "createdAt", "updatedAt")
    VALUES ('${staffId}', 'staff-repro@example.com', 'Staff Repro', 'STF-001', '${hash}', 'employee', '${tenant.id}', true, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO "User" (id, email, name, "employeeCode", "passwordHash", role, "tenantId", "isActive", "firstLoginAfter2FaReleaseAt", "createdAt", "updatedAt")
    VALUES ('${adminId}', 'admin-grace@example.com', 'Admin Grace Expired', 'ADM-GRC-001', '${hash}', 'tenant_admin', '${tenant.id}', true, NOW() - INTERVAL '10 days', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO "User" (id, email, name, "employeeCode", "passwordHash", role, "tenantId", "isActive", "firstLoginAfter2FaReleaseAt", "createdAt", "updatedAt")
    VALUES ('${platId}', 'platform-grace@example.com', 'Platform Grace Expired', 'PLT-GRC-001', '${hash}', 'platform_super_admin', NULL, true, NOW() - INTERVAL '10 days', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO "User" (id, email, name, "employeeCode", "passwordHash", role, "tenantId", "isActive", "createdAt", "updatedAt")
    VALUES ('${u2faId}', 'user-2fa-enabled@example.com', 'User 2FA Enabled', 'U2FA-001', '${hash}', 'employee', '${tenant.id}', true, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  `);

  await prisma.userTwoFactor.deleteMany({ where: { userId: u2faId } });
  await prisma.userTwoFactor.create({
    data: {
      userId: u2faId,
      enabledAt: new Date(),
      method: 'totp',
      secretEnc: 'test_encrypted_secret',
    },
  });

  console.log('[SETUP] Test users ready.');
  await prisma.$disconnect();
}

function postJson(pathUrl, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3333,
        path: pathUrl,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'x-request-id': 'repro-' + Math.random().toString(36).substring(2, 9),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body), headers: res.headers });
          } catch {
            resolve({ status: res.statusCode, rawBody: body, headers: res.headers });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function run() {
  await setupUsers();

  // Environment variables matching render.yaml / Render dashboard
  const prodEnv = {
    ...process.env,
    ENV_FILE: path.resolve(__dirname, 'empty.env'),
    NODE_ENV: 'production',
    PORT: '3333',
    DATABASE_URL: DB_URL,
    DIRECT_URL: DB_URL,
    FRONTEND_URL: 'https://admin.jsnc.co.in',
    ALLOWED_ORIGINS: 'https://admin.jsnc.co.in,https://jsnc.co.in',
    MAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 're_1234567890abcdef1234567890abcdef',
    EMAIL_FROM: 'notifications@jsnc.co.in',
    PRIMARY_EMAIL_FROM: 'notifications@jsnc.co.in',
    JWT_SECRET: 'jwt_secret_at_least_32_characters_random_string_long',
    JWT_REFRESH_SECRET: 'jwt_refresh_secret_at_least_32_chars_random_string',
    ENCRYPTION_KEY: Buffer.from('12345678901234567890123456789012').toString('base64'),
    BACKUP_ENCRYPTION_KEY: Buffer.from('12345678901234567890123456789012').toString('base64'),
    SMTP_HOST: 'smtp.sendgrid.net',
    SMTP_PORT: '587',
    SMTP_USER: 'notifications@jsnc.co.in',
    SMTP_PASS: 'secret_smtp_password_key',
    META_APP_SECRET: 'meta_app_secret_16chars',
    DEV_DEMO_LOGIN: 'false',
  };

  console.log('[SERVER] Starting production server on port 3333...');
  const server = spawn('node', ['apps/api/dist/main.js'], {
    env: prodEnv,
    cwd: path.resolve(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverLogs = [];
  server.stdout.on('data', (d) => {
    const s = d.toString();
    serverLogs.push(s);
    process.stdout.write('[API OUT] ' + s);
  });
  server.stderr.on('data', (d) => {
    const s = d.toString();
    serverLogs.push(s);
    process.stderr.write('[API ERR] ' + s);
  });

  // Wait for server to become healthy
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const res = await new Promise((res, rej) => {
        http.get('http://localhost:3333/api/v1/health', (r) => res(r.statusCode)).on('error', rej);
      });
      if (res === 200) {
        ready = true;
        break;
      }
    } catch {}
  }

  if (!ready) {
    console.error('[ERROR] Server failed to start or healthcheck did not pass');
    server.kill();
    process.exit(1);
  }

  console.log('\n======================================================');
  console.log('REPRODUCING LOGIN SCENARIOS IN PRODUCTION MODE');
  console.log('======================================================\n');

  // Clear logs before tests
  serverLogs = [];

  // Scenario (a): Normal staff user
  console.log('--- SCENARIO (A): Normal staff user ---');
  const resA = await postJson('/api/v1/auth/login', {
    identifier: 'staff-repro@example.com',
    password: 'TestPassword123!',
  });
  console.log('HTTP Status:', resA.status);
  console.log('Response Body:', JSON.stringify(resA.data || resA.rawBody, null, 2));

  // Scenario (b): Company admin whose 2-step grace period ended
  console.log('\n--- SCENARIO (B): Company admin whose grace period ended ---');
  const resB = await postJson('/api/v1/auth/login', {
    identifier: 'admin-grace@example.com',
    password: 'TestPassword123!',
  });
  console.log('HTTP Status:', resB.status);
  console.log('Response Body:', JSON.stringify(resB.data || resB.rawBody, null, 2));

  // Scenario (c): Platform owner whose grace ended
  console.log('\n--- SCENARIO (C): Platform owner whose grace ended ---');
  const resC = await postJson('/api/v1/platform-auth/login', {
    email: 'platform-grace@example.com',
    password: 'TestPassword123!',
  });
  console.log('HTTP Status:', resC.status);
  console.log('Response Body:', JSON.stringify(resC.data || resC.rawBody, null, 2));

  // Scenario (d): User with 2-step enabled
  console.log('\n--- SCENARIO (D): User with 2-step enabled ---');
  const resD = await postJson('/api/v1/auth/login', {
    identifier: 'user-2fa-enabled@example.com',
    password: 'TestPassword123!',
  });
  console.log('HTTP Status:', resD.status);
  console.log('Response Body:', JSON.stringify(resD.data || resD.rawBody, null, 2));

  console.log('\n--- SERVER LOGS DURING LOGINS ---');
  console.log(serverLogs.join(''));

  server.kill();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
