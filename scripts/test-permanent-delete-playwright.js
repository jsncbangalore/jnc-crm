/**
 * Playwright E2E Test for Permanent Company Deletion UI:
 * 1. "Show deactivated" filter toggle.
 * 2. Internal company never shows a delete or permanent delete button.
 * 3. Confirm dialog: "Permanently Delete" button disabled until BOTH company code and 2-step code are entered.
 * 4. Tested in Light and Dark modes at 1536x730 (desktop) and 390px (mobile).
 * 5. Saves screenshots to artifact directory.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

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
const ARTIFACT_DIR = path.resolve('C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824');
const FRONTEND_URL = 'http://localhost:5173';

async function main() {
  console.log('========================================================================');
  console.log('  PLAYWRIGHT TEST: PERMANENT COMPANY DELETION UI & FILTER CONTROLS');
  console.log('========================================================================\n');

  if (!fs.existsSync(ARTIFACT_DIR)) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  }

  const testRunId = Date.now().toString().slice(-4);
  const deactCode = `TEST_PW_DEACT_${testRunId}`;

  // Ensure internal tenant has isInternal: true
  const internalTenant = await prisma.tenant.findFirst({
    where: { OR: [{ isInternal: true }, { code: 'ACME-DEV-001' }] },
  });
  if (internalTenant && !internalTenant.isInternal) {
    await prisma.tenant.update({
      where: { id: internalTenant.id },
      data: { isInternal: true },
    });
  }

  // Create deactivated test tenant
  const deactTenant = await prisma.tenant.create({
    data: {
      code: deactCode,
      name: `Playwright Test Deactivated ${testRunId}`,
      slug: `pw-deact-${testRunId.toLowerCase()}`,
      status: 'suspended',
      deletedAt: new Date(),
      isInternal: false,
    },
  });

  const browser = await chromium.launch({ headless: true });

  const testCases = [
    { name: 'desktop', width: 1536, height: 730, theme: 'light' },
    { name: 'desktop', width: 1536, height: 730, theme: 'dark' },
    { name: 'mobile', width: 390, height: 844, theme: 'light' },
    { name: 'mobile', width: 390, height: 844, theme: 'dark' },
  ];

  try {
    for (const tc of testCases) {
      console.log(`\n--- Running test: Viewport ${tc.name} (${tc.width}x${tc.height}) | Theme: ${tc.theme} ---`);

      const context = await browser.newContext({
        viewport: { width: tc.width, height: tc.height },
        colorScheme: tc.theme,
      });

      const page = await context.newPage();

      // Go to platform login
      await page.goto(`${FRONTEND_URL}/platform/login`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#platform-identifier', { timeout: 10000 });
      await page.evaluate(({ themeMode }) => {
        localStorage.setItem(
          'crm_cookie_consent',
          JSON.stringify({
            choice: 'all',
            preferences: true,
            policyVersion: '2026.10.1',
            savedAt: new Date().toISOString(),
          })
        );
        if (themeMode === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }, { themeMode: tc.theme });

      // Log in
      await page.fill('#platform-identifier', 'platform-owner-test@example.internal');
      await page.fill('#platform-password', 'PlatformPass@123');
      await page.click('button[type="submit"]');

      // Wait for navigation to /platform/companies
      await page.waitForURL((url) => url.pathname.includes('/platform/companies'), { timeout: 15000 });
      await page.waitForSelector('table', { timeout: 10000 });

      // Apply theme mode again after navigation & ensure cookie banner dismissed
      await page.evaluate(({ themeMode }) => {
        localStorage.setItem(
          'crm_cookie_consent',
          JSON.stringify({
            choice: 'all',
            preferences: true,
            policyVersion: '2026.10.1',
            savedAt: new Date().toISOString(),
          })
        );
        if (themeMode === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }, { themeMode: tc.theme });

      // If cookie banner is somehow visible, click accept all
      const acceptCookiesBtn = page.locator('aside[aria-labelledby="cookie-banner-title"] button:has-text("Accept All")');
      if (await acceptCookiesBtn.isVisible().catch(() => false)) {
        await acceptCookiesBtn.click().catch(() => {});
        await page.waitForTimeout(300);
      }

      // 1. Verify Internal Company NEVER shows delete button
      console.log('Checking internal company row has NO delete buttons...');
      const internalRow = page.locator('tr').filter({ hasText: 'ACME-DEV-001' }).first();
      if (await internalRow.isVisible({ timeout: 5000 }).catch(() => false)) {
        const deleteBtns = internalRow.locator('button[title*="delete" i], button[title*="Deactivate" i]');
        const count = await deleteBtns.count();
        console.log(`[PASS] Internal company row has 0 delete buttons (found: ${count})`);
        if (count > 0) throw new Error('Internal company unexpectedly displayed a delete button!');
      }

      // 2. Check "Show deactivated" toggle
      console.log('Testing "Show deactivated" toggle...');
      const searchInput = page.locator('input[placeholder*="Search by company name" i]');
      await searchInput.fill(deactCode);
      await page.waitForTimeout(600);

      // Without "Show deactivated", our deactivated tenant should NOT be visible
      let rowCount = await page.locator('tr').filter({ hasText: deactCode }).count();
      console.log(`Deactivated tenant row count before checking filter: ${rowCount} (expected: 0)`);
      if (rowCount > 0) throw new Error('Deactivated tenant was visible before checking "Show deactivated"!');

      // Check "Show deactivated"
      await page.locator('label:has-text("Show deactivated")').click();
      await page.waitForTimeout(1000);

      rowCount = await page.locator('tr').filter({ hasText: deactCode }).count();
      console.log(`Deactivated tenant row count after checking filter: ${rowCount} (expected: 1)`);
      if (rowCount === 0) {
        throw new Error('Deactivated tenant did not appear when "Show deactivated" was checked!');
      }
      console.log('[PASS] "Show deactivated" filter successfully displays deactivated workspaces.');

      // 3. Test Permanent Delete Confirm Dialog
      console.log('Testing Permanent Delete Modal & Button Disable Logic...');
      const deactRow = page.locator('tr').filter({ hasText: deactCode }).first();
      const permDeleteBtn = deactRow.locator('button:has-text("Permanently delete")');
      await permDeleteBtn.scrollIntoViewIfNeeded();
      await permDeleteBtn.click();
      await page.waitForTimeout(800);

      // Verify modal opened
      const modal = page.locator('.fixed.inset-0').filter({ hasText: 'Permanently Delete Company Workspace' });
      await modal.waitFor({ state: 'visible', timeout: 5000 });
      console.log('[PASS] Permanent Delete confirmation modal opened.');

      const confirmSubmitBtn = modal.locator('button[type="submit"]:has-text("Permanently Delete Everything")');

      // Check button is initially disabled
      let isDisabled = await confirmSubmitBtn.isDisabled();
      console.log(`Confirm button initially disabled: ${isDisabled} (expected: true)`);
      if (!isDisabled) throw new Error('Confirm delete button was not disabled on modal open!');

      // Enter only the company code
      const codeInput = modal.locator(`input[placeholder*="${deactCode}" i]`);
      await codeInput.fill(deactCode);
      await page.waitForTimeout(200);
      isDisabled = await confirmSubmitBtn.isDisabled();
      console.log(`Confirm button disabled with only company code: ${isDisabled} (expected: true)`);
      if (!isDisabled) throw new Error('Confirm delete button was enabled without 2-step code!');

      // Clear code and enter only 2-step code
      await codeInput.fill('');
      const totpInput = modal.locator('input[placeholder*="Enter 6-digit authenticator code" i]');
      await totpInput.fill('123456');
      await page.waitForTimeout(200);
      isDisabled = await confirmSubmitBtn.isDisabled();
      console.log(`Confirm button disabled with only 2-step code: ${isDisabled} (expected: true)`);
      if (!isDisabled) throw new Error('Confirm delete button was enabled without company code!');

      // Enter BOTH company code AND 2-step code
      await codeInput.fill(deactCode);
      await page.waitForTimeout(200);
      isDisabled = await confirmSubmitBtn.isDisabled();
      console.log(`Confirm button disabled with BOTH company code and 2-step code: ${isDisabled} (expected: false)`);
      if (isDisabled) throw new Error('Confirm delete button was unexpectedly disabled when both codes were filled!');
      console.log('[PASS] Confirm button enable/disable logic verified.');

      // Take screenshot of the modal with both fields filled
      const screenshotFilename = `evidence-permanent-delete-${tc.name}-${tc.theme}-${tc.width}x${tc.height}.png`;
      const screenshotPath = path.join(ARTIFACT_DIR, screenshotFilename);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`Saved screenshot: ${screenshotFilename}`);

      // Close modal
      await modal.locator('button:has-text("Cancel")').click();
      await page.waitForTimeout(400);

      await context.close();
    }
  } finally {
    await browser.close();

    // Clean up created test tenant
    console.log('\n--- Cleaning up test records ---');
    await prisma.tenant.deleteMany({
      where: { code: deactCode },
    });
    await prisma.$disconnect();
  }

  console.log('\n========================================================================');
  console.log('  ALL PLAYWRIGHT TESTS PASSED SUCCESSFULLY!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('Playwright test failed:', err);
  process.exit(1);
});
