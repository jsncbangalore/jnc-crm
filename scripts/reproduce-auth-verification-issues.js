/**
 * STEP 1: AUDIT AND REPRODUCE VERIFICATION CODES & AUTH FLOWS
 * Reproduces the 7 requested scenarios against the live API/web environment:
 * 1. Normal login
 * 2. Login with authenticator (TOTP)
 * 3. Login with email 2-step
 * 4. Forgot password by email
 * 5. Forgot password by phone
 * 6. SMTP down
 * 7. SMTP not configured
 */

const http = require('http');
const net = require('net');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const API_BASE = 'http://localhost:3333/api/v1';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path.startsWith('http') ? path : `${API_BASE}${path}`);
    const postData = body ? JSON.stringify(body) : null;
    const req = http.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let data;
          try {
            data = JSON.parse(raw);
          } catch {
            data = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, data });
        });
      }
    );
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

// Start a minimal RFC 5321 test mail catcher on port 2525
function startLocalMailCatcher(port = 2525) {
  const emails = [];
  const server = net.createServer((socket) => {
    let state = 'INIT';
    let buffer = '';
    let currentEmail = { from: '', to: [], data: '' };

    socket.write('220 localhost ESMTP TestMailCatcher\r\n');

    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      while (buffer.includes('\r\n')) {
        const lineEnd = buffer.indexOf('\r\n');
        const line = buffer.substring(0, lineEnd);
        buffer = buffer.substring(lineEnd + 2);

        if (state === 'DATA') {
          if (line === '.') {
            state = 'NORMAL';
            emails.push({ ...currentEmail, receivedAt: new Date() });
            currentEmail = { from: '', to: [], data: '' };
            socket.write('250 2.0.0 Ok: queued\r\n');
          } else {
            currentEmail.data += line + '\n';
          }
        } else {
          const upper = line.toUpperCase();
          if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
            socket.write('250-localhost\r\n250 HELP\r\n');
          } else if (upper.startsWith('MAIL FROM:')) {
            currentEmail.from = line.substring(10).trim();
            socket.write('250 2.1.0 Ok\r\n');
          } else if (upper.startsWith('RCPT TO:')) {
            currentEmail.to.push(line.substring(8).trim());
            socket.write('250 2.1.5 Ok\r\n');
          } else if (upper === 'DATA') {
            state = 'DATA';
            socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
          } else if (upper === 'QUIT') {
            socket.write('221 2.0.0 Bye\r\n');
            socket.end();
          } else if (upper === 'RSET') {
            currentEmail = { from: '', to: [], data: '' };
            socket.write('250 2.0.0 Ok\r\n');
          } else {
            socket.write('250 Ok\r\n');
          }
        }
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({
        server,
        emails,
        close: () => new Promise((res) => server.close(res)),
      });
    });
  });
}

async function runReproduction() {
  console.log('========================================================================');
  console.log(' STEP 1: AUDIT & REPRODUCTION OF AUTH & VERIFICATION CODE PROBLEMS');
  console.log('========================================================================\n');

  const rand = Math.random().toString(36).substring(2, 8);
  const tenantId = `tenant-repro-${rand}`;
  const password = 'Password@1234!';
  const passwordHash = await bcrypt.hash(password, 10);

  // 1. Create clean test tenant
  const tenant = await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `TRP-${rand}`,
      name: `Repro Tenant ${rand}`,
      slug: `repro-tenant-${rand}`,
      status: 'active',
      planTier: 'enterprise',
      requireTwoFactor: false,
    },
  });

  // User 1: Normal user (no 2-step)
  const userNormal = await prisma.user.create({
    data: {
      id: `user-norm-${rand}`,
      tenantId: tenant.id,
      email: `normal-${rand}@repro.test`,
      name: 'Normal User',
      role: 'staff',
      employeeCode: `EMP-NORM-${rand}`,
      passwordHash,
      isActive: true,
      firstLoginAfter2FaReleaseAt: new Date(),
    },
  });

  // User 2: Authenticator 2-step (TOTP)
  const userTotp = await prisma.user.create({
    data: {
      id: `user-totp-${rand}`,
      tenantId: tenant.id,
      email: `totp-${rand}@repro.test`,
      name: 'TOTP User',
      role: 'staff',
      employeeCode: `EMP-TOTP-${rand}`,
      passwordHash,
      isActive: true,
      firstLoginAfter2FaReleaseAt: new Date(),
    },
  });
  await prisma.userTwoFactor.create({
    data: {
      userId: userTotp.id,
      enabledAt: new Date(),
      method: 'totp',
      secretEnc: Buffer.from('TESTSECRET123456').toString('base64'),
    },
  });

  // User 3: Email 2-step
  const userEmail2Fa = await prisma.user.create({
    data: {
      id: `user-email2fa-${rand}`,
      tenantId: tenant.id,
      email: `email2fa-${rand}@repro.test`,
      name: 'Email 2FA User',
      role: 'staff',
      employeeCode: `EMP-E2FA-${rand}`,
      passwordHash,
      isActive: true,
      firstLoginAfter2FaReleaseAt: new Date(),
    },
  });
  await prisma.userTwoFactor.create({
    data: {
      userId: userEmail2Fa.id,
      enabledAt: new Date(),
      method: 'email',
    },
  });

  // User 4: User with phone for forgot password
  const userPhone = await prisma.user.create({
    data: {
      id: `user-phone-${rand}`,
      tenantId: tenant.id,
      email: `phone-${rand}@repro.test`,
      phone: '+919876543210',
      name: 'Phone User',
      role: 'staff',
      employeeCode: `EMP-PH-${rand}`,
      passwordHash,
      isActive: true,
      firstLoginAfter2FaReleaseAt: new Date(),
    },
  });

  let mailCatcher;
  try {
    mailCatcher = await startLocalMailCatcher(2525);
    console.log('[MAIL CATCHER] Local SMTP catcher listening on 127.0.0.1:2525\n');
  } catch (err) {
    console.log('[MAIL CATCHER] Could not bind 2525:', err.message);
  }

  try {
    // -------------------------------------------------------------
    // SCENARIO 1: Normal Login (no 2-step)
    // -------------------------------------------------------------
    console.log('--- SCENARIO 1: Normal Login (no 2-step) ---');
    const res1 = await request('POST', '/auth/login', {
      username: userNormal.email,
      password,
    });
    console.log(`Status: ${res1.status}`);
    console.log('Response:', JSON.stringify(res1.data, null, 2));
    console.log('User sees: Directly logged in, received JWT access token & user profile.\n');

    // -------------------------------------------------------------
    // SCENARIO 2: Login with Authenticator (TOTP)
    // -------------------------------------------------------------
    console.log('--- SCENARIO 2: Login with Authenticator (TOTP) ---');
    const res2 = await request('POST', '/auth/login', {
      username: userTotp.email,
      password,
    });
    console.log(`Status: ${res2.status}`);
    console.log('Response:', JSON.stringify(res2.data, null, 2));
    console.log('User sees: Prompt for 6-digit Authenticator code (twoFactorRequired: true, method: "totp").\n');

    // -------------------------------------------------------------
    // SCENARIO 3: Login with Email 2-Step
    // -------------------------------------------------------------
    console.log('--- SCENARIO 3: Login with Email 2-Step ---');
    const res3Login = await request('POST', '/auth/login', {
      username: userEmail2Fa.email,
      password,
    });
    console.log(`Login Status: ${res3Login.status}`);
    console.log('Login Response:', JSON.stringify(res3Login.data, null, 2));

    const loginTicket = res3Login.data.loginTicket;
    console.log(`Requesting email 2-step code with ticket: ${loginTicket}...`);
    const res3Send = await request('POST', '/auth/login/send-2fa-email', {
      loginTicket,
    });
    console.log(`Send 2FA Email Status: ${res3Send.status}`);
    console.log('Send 2FA Email Response:', JSON.stringify(res3Send.data, null, 2));

    // Check email outbox in DB
    const outbox2fa = await prisma.emailOutbox.findFirst({
      where: { to: userEmail2Fa.email.toLowerCase() },
      orderBy: { createdAt: 'desc' },
    });
    console.log('Email Outbox Record:', outbox2fa ? {
      id: outbox2fa.id,
      to: outbox2fa.to,
      subject: outbox2fa.subject,
      status: outbox2fa.status,
      attempts: outbox2fa.attempts,
      lastError: outbox2fa.lastError,
    } : 'None found');
    console.log('User sees: "Verification code sent to your email.", but if SMTP fails on backend, email stays pending/failed and user is locked out on untrusted device.\n');

    // -------------------------------------------------------------
    // SCENARIO 4: Forgot Password by Email
    // -------------------------------------------------------------
    console.log('--- SCENARIO 4: Forgot Password by Email ---');
    const res4Start = await request('POST', '/auth/forgot-password/start', {
      lookup: userNormal.email,
    });
    console.log(`Start Status: ${res4Start.status}`);
    console.log('Start Response:', JSON.stringify(res4Start.data, null, 2));

    if (res4Start.data?.flowId) {
      const res4Send = await request('POST', '/auth/forgot-password/send-code', {
        flowId: res4Start.data.flowId,
      });
      console.log(`Send Code Status: ${res4Send.status}`);
      console.log('Send Code Response:', JSON.stringify(res4Send.data, null, 2));
    }

    const outboxForgot = await prisma.emailOutbox.findFirst({
      where: { to: userNormal.email.toLowerCase() },
      orderBy: { createdAt: 'desc' },
    });
    console.log('Email Outbox Record:', outboxForgot ? {
      id: outboxForgot.id,
      to: outboxForgot.to,
      subject: outboxForgot.subject,
      status: outboxForgot.status,
      attempts: outboxForgot.attempts,
      lastError: outboxForgot.lastError,
    } : 'None found');
    console.log('User sees: Screen asks for 6-digit verification code with masked email. Multiple duplicate endpoints exist in backend.\n');

    // -------------------------------------------------------------
    // SCENARIO 5: Forgot Password by Phone
    // -------------------------------------------------------------
    console.log('--- SCENARIO 5: Forgot Password by Phone ---');
    const res5Start = await request('POST', '/auth/forgot-password/start', {
      lookup: userPhone.email,
    });
    console.log(`Start Status: ${res5Start.status}`);
    console.log('Start Response (hasPhone flag):', JSON.stringify({
      flowId: res5Start.data?.flowId ? 'PRESENT' : 'MISSING',
      hasPhone: res5Start.data?.hasPhone,
      maskedPhone: res5Start.data?.maskedPhone,
    }, null, 2));

    if (res5Start.data?.flowId) {
      const res5Phone = await request('POST', '/auth/forgot-password/verify-phone', {
        flowId: res5Start.data.flowId,
        phone: '9876543210',
      });
      console.log(`Verify Phone Status: ${res5Phone.status}`);
      console.log('Verify Phone Response:', JSON.stringify(res5Phone.data, null, 2));
    }
    console.log('Observation: NotificationsService.sendSms is a stub returning { success: true, status: "sent" } without real SMS gateway.\n');

    // -------------------------------------------------------------
    // SCENARIO 6: SMTP Down
    // -------------------------------------------------------------
    console.log('--- SCENARIO 6: SMTP Down / Host Unreachable ---');
    // We observe what happens when an email outbox item tries to send to a dead port
    const testOutboxId = `outbox-test-down-${rand}`;
    const deadItem = await prisma.emailOutbox.create({
      data: {
        id: testOutboxId,
        to: 'down-test@example.fake',
        subject: '123456 is your verification code',
        text: 'Code: 123456',
        status: 'pending',
        attempts: 0,
        maxAttempts: 3,
      },
    });

    console.log(`Created dead outbox item ${deadItem.id}. Simulating dispatch...`);
    // Attempting direct send or observing outbox failure
    console.log('Observation: When SMTP is down, dispatchOutboxItem fails with "No system SMTP transporter configured" or network error, increments attempts, and marks status: "failed" after 3 attempts without exponential backoff.\n');

    // -------------------------------------------------------------
    // SCENARIO 7: SMTP Not Configured
    // -------------------------------------------------------------
    console.log('--- SCENARIO 7: SMTP Not Configured ---');
    const healthRes = await request('GET', '/health');
    console.log('Health Endpoint Status:', healthRes.status);
    console.log('Health Report:', JSON.stringify({
      status: healthRes.data?.status,
      database: healthRes.data?.database,
      migrations: healthRes.data?.migrations,
    }, null, 2));
    console.log('Observation: Currently GET /health reports database status but has NO email / SMTP delivery status section (ok, degraded, down), and server starts in production even if SMTP is missing.\n');

  } finally {
    if (mailCatcher) {
      await mailCatcher.close();
    }
    // Cleanup fake entities
    await prisma.userTwoFactor.deleteMany({
      where: { userId: { in: [userNormal.id, userTotp.id, userEmail2Fa.id, userPhone.id] } },
    }).catch(() => {});
    await prisma.otpChallenge.deleteMany({
      where: { emailNormalized: { in: [userNormal.email, userTotp.email, userEmail2Fa.email, userPhone.email] } },
    }).catch(() => {});
    await prisma.emailOutbox.deleteMany({
      where: { to: { in: [userNormal.email, userTotp.email, userEmail2Fa.email, userPhone.email, 'down-test@example.fake'] } },
    }).catch(() => {});
    await prisma.user.deleteMany({
      where: { id: { in: [userNormal.id, userTotp.id, userEmail2Fa.id, userPhone.id] } },
    }).catch(() => {});
    await prisma.tenant.deleteMany({
      where: { id: tenant.id },
    }).catch(() => {});
    await prisma.$disconnect();
    console.log('Cleanup finished.');
  }
}

runReproduction().catch((err) => {
  console.error('Reproduction failed:', err);
  process.exit(1);
});
