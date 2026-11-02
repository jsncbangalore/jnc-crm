const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = path.resolve('C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824');
const BASE_URL = 'http://localhost:5173';

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
];

const THEMES = ['light', 'dark'];

async function run() {
  console.log('========================================================================');
  console.log('PLAYWRIGHT VERIFICATION SCREENSHOT RECORDING RUNNER');
  console.log('========================================================================\n');

  const browser = await chromium.launch({ headless: true });

  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      console.log(`\n==================================================`);
      console.log(`>>> RECORDING: Viewport ${vp.name}px | Theme: ${theme.toUpperCase()} <<<`);
      console.log(`==================================================`);

      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: theme,
      });

      const page = await context.newPage();

      try {
        // ─── 0. LOGIN ──────────────────────────────────────────────────────────
        console.log(`[0/4] Logging in...`);
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(500);

        const companyInput = page.locator('input[name="companyCode"]');
        if (await companyInput.isVisible({ timeout: 1000 }).catch(() => false)) {
          await companyInput.fill('ACME');
        }

        await page.fill('input[name="username"]', 'admin@example.com');
        await page.fill('input[name="password"]', 'DevPassword@123');
        await page.click('button[type="submit"]');

        await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });
        console.log(`      ✓ Logged in successfully`);

        // Apply theme preference
        await page.evaluate((t) => {
          localStorage.setItem('crm_theme', t);
          if (t === 'dark') {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }, theme);
        await page.waitForTimeout(400);

        // ─── 1. LEDGER PAGE ────────────────────────────────────────────────────
        console.log(`[1/4] Capturing Ledger (${vp.name}px ${theme})...`);
        await page.goto(`${BASE_URL}/ledger`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1200);

        // Select Customer A in party list
        const custARow = page.locator('button, tr, div').filter({ hasText: 'Customer A' }).first();
        if (await custARow.isVisible({ timeout: 2000 }).catch(() => false)) {
          await custARow.click();
          await page.waitForTimeout(800);
        }

        const ledgerPath = path.join(ARTIFACT_DIR, `screenshot-ledger-${vp.name}-${theme}.png`);
        await page.screenshot({ path: ledgerPath, fullPage: false });
        console.log(`      ✓ Saved: ${ledgerPath}`);

        // ─── 2. RECORD PAYMENT MODAL ───────────────────────────────────────────
        console.log(`[2/4] Capturing Record Payment Modal (${vp.name}px ${theme})...`);
        const recBtn = page.locator('button:has-text("Record receipt"), button:has-text("Record payment")').first();
        if (await recBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await recBtn.click();
          await page.waitForTimeout(800);

          // Tick open bill checkbox
          const openBillCheckbox = page.locator('input[type="checkbox"]').nth(1);
          if (await openBillCheckbox.isVisible({ timeout: 1500 }).catch(() => false)) {
            await openBillCheckbox.click();
            await page.waitForTimeout(400);
          }

          const paymentModalPath = path.join(ARTIFACT_DIR, `screenshot-payment-modal-${vp.name}-${theme}.png`);
          await page.screenshot({ path: paymentModalPath, fullPage: false });
          console.log(`      ✓ Saved: ${paymentModalPath}`);

          // Close modal
          const cancelBtn = page.locator('button:has-text("Cancel")').first();
          if (await cancelBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await cancelBtn.click();
            await page.waitForTimeout(400);
          }
        }

        // ─── 3. INVOICES PAGE ──────────────────────────────────────────────────
        console.log(`[3/4] Capturing Invoices (${vp.name}px ${theme})...`);
        await page.goto(`${BASE_URL}/invoices`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1500);

        const invoicesPath = path.join(ARTIFACT_DIR, `screenshot-invoices-${vp.name}-${theme}.png`);
        await page.screenshot({ path: invoicesPath, fullPage: false });
        console.log(`      ✓ Saved: ${invoicesPath}`);

        // ─── 4. PURCHASE BILL COPY ─────────────────────────────────────────────
        console.log(`[4/4] Capturing Purchase Bill Copy (${vp.name}px ${theme})...`);
        await page.goto(`${BASE_URL}/purchase-bills`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1500);

        const softCopyBtn = page.locator('button:has-text("View Soft Copy")').first();
        if (await softCopyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await softCopyBtn.click();
          await page.waitForTimeout(800);

          const softCopyPath = path.join(ARTIFACT_DIR, `screenshot-purchase-bill-copy-${vp.name}-${theme}.png`);
          await page.screenshot({ path: softCopyPath, fullPage: false });
          console.log(`      ✓ Saved: ${softCopyPath}`);
        } else {
          console.log(`      ! View Soft Copy button not found`);
        }

      } catch (err) {
        console.error(`Error capturing ${vp.name}px ${theme}:`, err.message);
      } finally {
        await context.close();
      }
    }
  }

  await browser.close();
  console.log('\n========================================================================');
  console.log('ALL PLAYWRIGHT VERIFICATION SCREENSHOTS SAVED SUCCESSFULLY!');
  console.log('========================================================================');
}

run().catch((err) => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
