/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.resolve(__dirname, '../evidence/auth');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const VIEWPORTS = [
  { name: '1440px-desktop', width: 1440, height: 900 },
  { name: '1024px-tablet-landscape', width: 1024, height: 768 },
  { name: '768px-tablet-portrait', width: 768, height: 1024 },
  { name: '390px-phone', width: 390, height: 844 },
];

async function run() {
  console.log('=== STARTING PLAYWRIGHT AUTH PAGES & 4-STEP RESET CAPTURE ===\n');

  const browser = await chromium.launch({ headless: true });
  const generatedFiles = [];

  for (const vp of VIEWPORTS) {
    for (const theme of ['light', 'dark']) {
      console.log(`Processing ${vp.name} [${theme}]...`);

      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: theme,
      });

      const page = await context.newPage();

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
        await page.waitForTimeout(100);
      };

      // ── 1. Company Login ──────────────────────────────────────────────────
      await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
      await applyTheme();
      await page.fill('input[name="companyCode"]', 'ACME').catch(() => {});
      await page.fill('input[name="username"]', 'user@example.com').catch(() => {});
      await page.fill('input[name="password"]', 'Correct#Pass123').catch(() => {});
      const fileLogin = `company-login-${vp.name}-${theme}.png`;
      await page.screenshot({ path: path.join(OUTPUT_DIR, fileLogin), fullPage: false });
      generatedFiles.push(fileLogin);

      // ── 2. Platform Login ─────────────────────────────────────────────────
      await page.goto('http://localhost:5173/platform/login', { waitUntil: 'networkidle' });
      await applyTheme();
      await page.fill('input[name="username"]', 'admin@example.internal').catch(() => {});
      await page.fill('input[name="password"]', 'Platform#AdminPass123').catch(() => {});
      const filePlatform = `platform-login-${vp.name}-${theme}.png`;
      await page.screenshot({ path: path.join(OUTPUT_DIR, filePlatform), fullPage: false });
      generatedFiles.push(filePlatform);

      // ── 3. Step 1 of 4: Reset Password (Lookup) ───────────────────────────
      await page.goto('http://localhost:5173/forgot-password', { waitUntil: 'networkidle' });
      await applyTheme();
      await page.fill('input#forgot-email-input', 'name@example.com');
      await page.fill('input#forgot-company-code', 'ACME').catch(() => {});
      const fileStep1 = `reset-step1-lookup-${vp.name}-${theme}.png`;
      await page.screenshot({ path: path.join(OUTPUT_DIR, fileStep1), fullPage: false });
      generatedFiles.push(fileStep1);

      // ── 4. Step 2 of 4: Verify your mobile number ─────────────────────────
      await page.evaluate(() => {
        if (typeof window.__setForgotStep === 'function') {
          window.__setForgotStep('phone', { last4: '4821' });
        }
      });
      await page.waitForSelector('input#verify-phone-input', { timeout: 3000 });
      await applyTheme();
      await page.fill('input#verify-phone-input', ['555', '019', '4821'].join(''));
      const fileStep2 = `reset-step2-phone-${vp.name}-${theme}.png`;
      await page.screenshot({ path: path.join(OUTPUT_DIR, fileStep2), fullPage: false });
      generatedFiles.push(fileStep2);

      // ── 5. Step 3 of 4: Enter the code ────────────────────────────────────
      await page.evaluate(() => {
        if (typeof window.__setForgotStep === 'function') {
          window.__setForgotStep('otp', {
            mobileVerified: true,
            maskedEmail: 'user***@example.com',
            digits: ['4', '8', '2', '1', '9', '0'],
          });
        }
      });
      await page.waitForSelector('input[aria-label="Digit 1 of 6"]', { timeout: 3000 });
      await applyTheme();
      const fileStep3 = `reset-step3-code-${vp.name}-${theme}.png`;
      await page.screenshot({ path: path.join(OUTPUT_DIR, fileStep3), fullPage: false });
      generatedFiles.push(fileStep3);

      // ── 6. Step 4 of 4: Create new password ───────────────────────────────
      await page.evaluate(() => {
        if (typeof window.__setForgotStep === 'function') {
          window.__setForgotStep('new-password', { password: 'SecurePass#2026!' });
        }
      });
      await page.waitForSelector('input[placeholder="Enter at least 12 characters"]', { timeout: 3000 });
      await applyTheme();
      await page.fill('input[placeholder="Enter at least 12 characters"]', 'SecurePass#2026!');
      await page.fill('input[placeholder="Repeat new password"]', 'SecurePass#2026!');
      await page.waitForTimeout(150);
      const fileStep4 = `reset-step4-password-${vp.name}-${theme}.png`;
      await page.screenshot({ path: path.join(OUTPUT_DIR, fileStep4), fullPage: false });
      generatedFiles.push(fileStep4);

      await context.close();
    }
  }

  await browser.close();

  console.log(`\n========================================================================`);
  console.log(`Successfully captured all ${generatedFiles.length} screenshots:`);
  console.log(`========================================================================`);
  for (const f of generatedFiles) {
    console.log(` - evidence/auth/${f}`);
  }
}

run().catch((err) => {
  console.error('Screenshot run error:', err);
  process.exit(1);
});
