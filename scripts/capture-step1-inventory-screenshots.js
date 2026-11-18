const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = path.resolve('C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824');
const EVIDENCE_DIR = path.resolve(__dirname, '../evidence/verification-screens');

for (const dir of [ARTIFACT_DIR, EVIDENCE_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const VIEWPORTS = [
  { name: '1536x730', width: 1536, height: 730 },
  { name: '390px', width: 390, height: 844 },
];

const THEMES = ['light', 'dark'];

async function run() {
  console.log('=== STARTING CAPTURE OF 7 VERIFICATION SCREENS INVENTORY ===\n');

  const browser = await chromium.launch({ headless: true });
  const capturedScreenshots = [];

  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      console.log(`\n--- Capturing Viewport: ${vp.name} | Theme: ${theme} ---`);

      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: theme,
      });

      const page = await context.newPage();

      // Mock API responses
      await page.route('**/api/v1/auth/version-check', (route) => {
        route.fulfill({ status: 200, json: { isOutdated: false, version: '1.1.0' } });
      });

      await page.route('**/api/v1/auth/login', (route) => {
        route.fulfill({
          status: 200,
          json: {
            requiresTwoFactor: true,
            loginTicket: 'ticket-inventory-123',
            methods: ['totp', 'email'],
          },
        });
      });

      await page.route('**/api/v1/auth/login/send-2fa-email', (route) => {
        route.fulfill({
          status: 200,
          json: { message: 'Verification code sent to your email.' },
        });
      });

      const applyTheme = async () => {
        await page.evaluate((th) => {
          if (th === 'dark') {
            document.documentElement.classList.add('dark');
            localStorage.setItem('crm_theme', 'dark');
          } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('crm_theme', 'light');
          }
          localStorage.setItem('crm_cookie_consent_v1', JSON.stringify({
            choice: 'necessary_only',
            preferences: false,
            policyVersion: '2026-v1',
            savedAt: new Date().toISOString(),
          }));
        }, theme);
        await page.waitForTimeout(150);
      };

      const saveScreen = async (screenId) => {
        const filename = `inventory-${screenId}-${vp.name}-${theme}.png`;
        const evidencePath = path.join(EVIDENCE_DIR, filename);
        const artifactPath = path.join(ARTIFACT_DIR, filename);

        await page.screenshot({ path: evidencePath, fullPage: false });
        fs.copyFileSync(evidencePath, artifactPath);
        capturedScreenshots.push({ screenId, viewport: vp.name, theme, filename, path: artifactPath });
        console.log(`[CAPTURED] ${filename}`);
      };

      // ── 1. Login 2-Step by Authenticator ────────────────────────────────────
      await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
      await applyTheme();
      await page.fill('input[name="companyCode"]', 'ACME').catch(() => {});
      await page.fill('input[name="username"]', 'admin@example.com').catch(() => {});
      await page.fill('input[name="password"]', 'Correct#Pass123').catch(() => {});
      await page.click('button[type="submit"]');
      await page.waitForSelector('text=2-Step Verification', { timeout: 4000 });
      await applyTheme();
      await saveScreen('01-login-2step-authenticator');

      // ── 2. Login 2-Step by Email ────────────────────────────────────────────
      // Click "Lost your authenticator? Receive code by email"
      const emailFallbackBtn = page.locator('text=Lost your authenticator? Receive code by email').first();
      if (await emailFallbackBtn.isVisible()) {
        await emailFallbackBtn.click();
        await page.waitForTimeout(300);
      }
      await applyTheme();
      await saveScreen('02-login-2step-email');

      // ── 3. Login 2-Step by Backup Code ──────────────────────────────────────
      const backupBtn = page.locator('text=Use a backup code').first();
      if (await backupBtn.isVisible()) {
        await backupBtn.click();
        await page.waitForTimeout(300);
      }
      await applyTheme();
      await saveScreen('03-login-2step-backup');

      // ── 4. Forced 2-Step Setup ──────────────────────────────────────────────
      await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
      await page.route('**/api/v1/auth/login', (route) => {
        route.fulfill({
          status: 200,
          json: {
            requiresTwoFactorSetup: true,
            setupToken: 'mock-setup-token-xyz',
          },
        });
      });
      await page.route('**/api/v1/auth/two-factor/forced-setup/pass', (route) => {
        route.fulfill({
          status: 200,
          json: {
            success: true,
            emailMasked: 'a***@d***.com',
            remainingSeconds: 600,
          },
        });
      });
      await applyTheme();
      await page.fill('input[name="companyCode"]', 'ACME').catch(() => {});
      await page.fill('input[name="username"]', 'admin@example.com').catch(() => {});
      await page.fill('input[name="password"]', 'Correct#Pass123').catch(() => {});
      await page.click('button[type="submit"]');
      await page.waitForSelector('text=Step 1: Verify your email', { timeout: 4000 }).catch(() => {});
      await applyTheme();
      await saveScreen('04-forced-2step-setup');

      // ── 5. Forgot Password OTP ──────────────────────────────────────────────
      await page.goto('http://localhost:5173/forgot-password', { waitUntil: 'networkidle' });
      await applyTheme();
      await page.evaluate(() => {
        if (typeof window.__setForgotStep === 'function') {
          window.__setForgotStep('otp', { maskedEmail: 'user***@company.com' });
        }
      });
      await page.waitForTimeout(300);
      await applyTheme();
      await saveScreen('05-forgot-password-otp');

      // ── 6. Email Change OTP (in My Account) ──────────────────────────────────
      await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
      await page.evaluate(() => {
        localStorage.setItem('crm_access_token', 'mock-access-token');
        localStorage.setItem('crm_user', JSON.stringify({
          id: 'mock-user-1',
          name: 'Sarah Connor',
          email: 'sarah@syntracrm.local',
          role: 'admin',
          tenantId: 'mock-tenant-1',
          tenant: { name: 'Acme Cyberdyne', code: 'ACME' },
        }));
      });
      await page.goto('http://localhost:5173/my-account', { waitUntil: 'networkidle' });
      await applyTheme();
      // Click Change email button to open modal
      const changeEmailBtn = page.locator('button:has-text("Change Email")').first();
      if (await changeEmailBtn.isVisible()) {
        await changeEmailBtn.click();
        await page.waitForTimeout(200);
        // Fill step 1 and submit to reach step 2
        await page.fill('input[type="password"]', 'Correct#Pass123').catch(() => {});
        await page.fill('input[type="email"]', 'sarah.new@syntracrm.local').catch(() => {});
        // Mock request-otp
        await page.route('**/api/v1/auth/email-change/request-otp', (route) => {
          route.fulfill({ status: 200, json: { success: true } });
        });
        const sendCodeBtn = page.locator('button:has-text("Send Code")').first();
        if (await sendCodeBtn.isVisible()) {
          await sendCodeBtn.click();
          await page.waitForTimeout(300);
        }
      }
      await applyTheme();
      await saveScreen('06-email-change-otp');

      // Close email modal if open
      const closeEmailBtn = page.locator('button:has-text("Cancel")').first();
      if (await closeEmailBtn.isVisible()) await closeEmailBtn.click();

      // ── 7. Phone Change OTP (in My Account) ──────────────────────────────────
      const changePhoneBtn = page.locator('button:has-text("Add Mobile Number"), button:has-text("Change Number"), button:has-text("Verify")').first();
      if (await changePhoneBtn.isVisible()) {
        await changePhoneBtn.click();
        await page.waitForTimeout(200);
        await page.fill('input[type="password"]', 'Correct#Pass123').catch(() => {});
        await page.fill('input[type="tel"]', '9876543210').catch(() => {});
        await page.route('**/api/v1/auth/phone-change/request-otp', (route) => {
          route.fulfill({ status: 200, json: { success: true } });
        });
        const sendPhoneCodeBtn = page.locator('button:has-text("Send Verification Code")').first();
        if (await sendPhoneCodeBtn.isVisible()) {
          await sendPhoneCodeBtn.click();
          await page.waitForTimeout(300);
        }
      }
      await applyTheme();
      await saveScreen('07-phone-change-otp');

      await context.close();
    }
  }

  await browser.close();
  console.log(`\n=== INVENTORY CAPTURE COMPLETE: ${capturedScreenshots.length} screenshots saved ===`);
}

run().catch((err) => {
  console.error('[FATAL CAPTURE ERROR]', err);
  process.exit(1);
});
