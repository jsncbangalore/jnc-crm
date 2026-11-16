/**
 * Reproduce Problem (3): Forced 2-step setup past grace period
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
  console.log('  REPRODUCE PROBLEM 3: FORCED 2-STEP SETUP FLOW IN BROWSER');
  console.log('========================================================================\n');

  const runId = Date.now().toString().slice(-4);
  const tenantCode = `TEST_GRACE_${runId}`;
  const userEmail = `grace_admin_${runId}@example.fake`;
  const plainPassword = 'Password@123';
  const passwordHash = await bcrypt.hash(plainPassword, 10);
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

  // Create tenant and admin who is 10 days past firstLoginAfter2FaReleaseAt
  const tenant = await prisma.tenant.create({
    data: {
      code: tenantCode,
      name: `Grace Test Corp ${runId}`,
      slug: `grace-${runId}`,
      status: 'active',
      isInternal: false,
      users: {
        create: [
          {
            email: userEmail,
            name: 'Grace Admin User',
            role: 'tenant_admin',
            employeeCode: `EMP-GRACE-${runId}`,
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

  // Monitor network traffic
  page.on('request', (req) => {
    if (req.url().includes('/auth/')) {
      console.log(`--> [HTTP REQ] ${req.method()} ${req.url()}`);
      if (req.postData()) {
        try {
          const parsed = JSON.parse(req.postData());
          // mask sensitive fields
          if (parsed.password) parsed.password = '***';
          console.log(`    Body:`, JSON.stringify(parsed));
        } catch {
          console.log(`    Body:`, req.postData().slice(0, 100));
        }
      }
    }
  });

  page.on('response', async (res) => {
    if (res.url().includes('/auth/')) {
      console.log(`<-- [HTTP RES] ${res.status()} ${res.statusText()} ${res.url()}`);
      try {
        const text = await res.text();
        console.log(`    Body:`, text.slice(0, 200));
      } catch {}
    }
  });

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

    console.log(`[AUTH] Submitting credentials for ${userEmail}...`);
    await page.fill('#company-identifier', userEmail);
    await page.fill('#company-password', plainPassword);
    await page.click('button[type="submit"]');

    // Wait a couple of seconds to see what page shows
    await page.waitForTimeout(3000);

    const bodyText = await page.innerText('body');
    console.log('\n--- Visible Text on Screen ---');
    console.log(bodyText.split('\n').filter(l => l.trim().length > 0).slice(0, 25).join('\n'));
    console.log('------------------------------\n');

    // Take screenshot for evidence
    const screenshotPath = path.join('C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824', 'repro-forced-2step-before.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Saved screenshot to ${screenshotPath}`);

  } finally {
    await browser.close();
    console.log('\n[CLEANUP] Removing test tenant...');
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
    console.log('[CLEANUP] Done.');
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
