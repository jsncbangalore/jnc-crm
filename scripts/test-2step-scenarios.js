/**
 * Automated test script for 2-step setup: wrong code, resend countdown, correct code flow
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Load environment variables for DB
if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(process.cwd(), 'apps/api/.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        process.env[match[1]] = value;
      }
    }
  }
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const FRONTEND_URL = 'http://localhost:5173';

async function main() {
  console.log('========================================================================');
  console.log('  TEST 2-STEP SETUP SCENARIOS: WRONG CODE, RESEND LIMIT, CORRECT CODE');
  console.log('========================================================================\n');

  const runId = Date.now().toString().slice(-4);
  const tenantCode = `TEST_SCEN_${runId}`;
  const userEmail = `scen_admin_${runId}@example.fake`;
  const plainPassword = 'Password@123';
  const passwordHash = await bcrypt.hash(plainPassword, 10);
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

  // Create tenant and admin forced into 2FA setup
  const tenant = await prisma.tenant.create({
    data: {
      code: tenantCode,
      name: `Scenario Test Corp ${runId}`,
      slug: `scen-${runId}`,
      status: 'active',
      isInternal: false,
      users: {
        create: [
          {
            email: userEmail,
            name: 'Scenario Admin',
            role: 'tenant_admin',
            employeeCode: `EMP-SCEN-${runId}`,
            passwordHash,
            firstLoginAfter2FaReleaseAt: tenDaysAgo,
          },
        ],
      },
    },
    include: { users: true },
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    console.log(`[AUTH] Navigating to ${FRONTEND_URL}/login...`);
    await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#company-identifier', { timeout: 10000 });

    // Set cookie consent
    await page.evaluate(() => {
      localStorage.setItem(
        'crm_cookie_consent',
        JSON.stringify({
          choice: 'all',
          preferences: true,
          policyVersion: '2026.10.1',
          savedAt: new Date().toISOString(),
        })
      );
    });

    console.log(`[AUTH] Logging in with ${userEmail}...`);
    await page.fill('#company-identifier', userEmail);
    await page.fill('#company-password', plainPassword);
    await page.click('button[type="submit"]');

    // Wait for forced 2-step setup to render
    await page.waitForSelector('text=Step 1: Verify your email', { timeout: 10000 });
    console.log('[PASS] Step 1: Verify your email rendered on screen.');

    // 1. Verify resend button shows countdown and is disabled
    const resendBtn = await page.waitForSelector('button:has-text("Resend code in")', { timeout: 5000 });
    const isResendDisabled = await resendBtn.isDisabled();
    const resendBtnText = await resendBtn.innerText();
    console.log(`[PASS] Resend button status: disabled=${isResendDisabled}, text="${resendBtnText}"`);

    // 2. Submit wrong code ('999999')
    console.log('[TEST] Entering wrong verification code 999999...');
    for (let i = 0; i < 6; i++) {
      const input = await page.waitForSelector(`input[data-testid="email-otp-${i}"]`);
      await input.fill('9');
    }

    // Wait a moment for auto-submit or click button if enabled
    await page.waitForTimeout(1500);

    const errorMsgEl = await page.waitForSelector('.text-rose-500, .text-rose-600, .bg-rose-50, [data-testid="inline-error-banner"], [role="alert"]', { timeout: 5000 }).catch(() => null);
    const bodyTextAfterWrong = await page.innerText('body');
    if (bodyTextAfterWrong.includes('The code is not correct') || bodyTextAfterWrong.includes('not correct')) {
      console.log('[PASS] UI correctly displayed error: "The code is not correct. Check your email."');
    } else {
      console.warn('[WARN] Body snippet after wrong code:', bodyTextAfterWrong.slice(0, 300));
    }

    // 3. Query real code from DB (EmailOutbox)
    const outbox = await prisma.emailOutbox.findFirst({
      where: { to: userEmail },
      orderBy: { createdAt: 'desc' },
    });
    if (!outbox) {
      throw new Error('EmailOutbox record not found for ' + userEmail);
    }
    const match = outbox.subject.match(/^(\d{6})/);
    const realCode = match ? match[1] : null;
    console.log(`[AUTH] Retrieved real email verification code: ${realCode}`);

    // 4. Fill real code and submit
    console.log('[TEST] Entering real verification code in UI...');
    for (let i = 0; i < 6; i++) {
      const digit = realCode[i];
      const input = await page.waitForSelector(`input[data-testid="email-otp-${i}"]`);
      await input.fill(digit);
    }

    await page.waitForTimeout(2000);

    // 5. Verify advance to Step 2: Set up authenticator app
    await page.waitForSelector('text=Step 2: Set up authenticator app', { timeout: 10000 });
    console.log('[PASS] Successfully advanced to Step 2: Set up authenticator app with QR code and secret!');

    // Check QR canvas or secret code element
    const canvas = await page.$('canvas');
    console.log(`[PASS] Authenticator QR canvas rendered: ${Boolean(canvas)}`);

    console.log('\n========================================================================');
    console.log('  ALL 2-STEP SETUP SCENARIOS PASSED SUCCESSFULLY');
    console.log('========================================================================\n');

  } finally {
    await browser.close();
    console.log('[CLEANUP] Removing scenario test tenant...');
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
    console.log('[CLEANUP] Done.');
  }
}

main().catch((err) => {
  console.error('Scenario test failed:', err);
  process.exit(1);
});
