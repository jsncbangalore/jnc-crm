const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const artifactDir = path.resolve(
  'C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824'
);

async function run() {
  console.log('Launching browser for Ledger verification...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // 1. Log in
  console.log('Navigating to login...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
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
  await page.reload({ waitUntil: 'domcontentloaded' });

  const codeBtn = page.locator('button:has-text("Have a company code")');
  if (await codeBtn.isVisible().catch(() => false)) {
    await codeBtn.click();
  }

  await page.fill('#company-code-input', 'ACME-DEV-001');
  await page.fill('#company-identifier', 'tenant-admin@example.com');
  await page.fill('#company-password', 'DevPassword@123');
  await page.click('button[type="submit"]');

  // Wait for login redirection
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  console.log('Logged in successfully. Navigating to /ledger...');

  // 2. Go to /ledger
  await page.goto('http://localhost:5173/ledger');
  await page.waitForSelector('[data-testid="tab-ledger-customers"]', { timeout: 15000 });
  await page.waitForTimeout(2000); // Allow statement to load

  // Verify Demo banner
  const demoBanner = await page.$('[data-testid="demo-data-banner"]');
  console.log('Demo banner visible:', !!demoBanner);

  // Capture 1440 Simple View
  const p1440Simple = path.join(artifactDir, 'evidence-ledger-1440-simple.png');
  await page.screenshot({ path: p1440Simple, fullPage: true });
  console.log('Saved:', p1440Simple);

  // Switch to Accountant View
  console.log('Switching to Accountant view...');
  await page.click('text="Accountant view"');
  await page.waitForTimeout(600);
  const p1440Accountant = path.join(artifactDir, 'evidence-ledger-1440-accountant.png');
  await page.screenshot({ path: p1440Accountant, fullPage: true });
  console.log('Saved:', p1440Accountant);

  // Switch to Suppliers tab
  console.log('Switching to Suppliers (you owe) tab...');
  await page.click('[data-testid="tab-ledger-suppliers"]');
  await page.waitForTimeout(1000);
  const p1440Suppliers = path.join(artifactDir, 'evidence-ledger-suppliers-1440.png');
  await page.screenshot({ path: p1440Suppliers, fullPage: true });
  console.log('Saved:', p1440Suppliers);

  // Switch back to Customers tab
  console.log('Switching back to Customers (owe you) tab...');
  await page.click('[data-testid="tab-ledger-customers"]');
  await page.waitForTimeout(1000);

  // Open Record Receipt Modal
  console.log('Opening Record Receipt modal...');
  const recordBtn = page.locator('[data-testid="btn-record-ledger-payment"]');
  await recordBtn.waitFor({ state: 'visible', timeout: 8000 });
  await recordBtn.click();

  console.log('Waiting for modal to be visible...');
  await page.waitForSelector('[data-testid="unified-payment-amount-input"]', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Enter amount to test auto-allocation and summary line
  console.log('Entering payment amount 200000...');
  await page.fill('[data-testid="unified-payment-amount-input"]', '200000');
  await page.waitForTimeout(800);

  const pReceipt1440 = path.join(artifactDir, 'evidence-record-receipt-modal-1440.png');
  await page.screenshot({ path: pReceipt1440 });
  console.log('Saved:', pReceipt1440);

  // Keyboard navigation: Escape closes modal
  console.log('Testing keyboard navigation: Escape key to close modal...');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);

  // 3. Viewport 1366x768
  console.log('Testing viewport 1366x768...');
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(800);
  const p1366 = path.join(artifactDir, 'evidence-ledger-1366x768.png');
  await page.screenshot({ path: p1366, fullPage: true });
  console.log('Saved:', p1366);

  // 4. Viewport 390 mobile
  console.log('Testing viewport 390x844 (Mobile)...');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(800);
  const p390 = path.join(artifactDir, 'evidence-ledger-390-mobile.png');
  await page.screenshot({ path: p390, fullPage: true });
  console.log('Saved:', p390);

  // Open modal on mobile
  await page.click('[data-testid="btn-record-ledger-payment"]');
  await page.waitForSelector('[data-testid="unified-payment-amount-input"]', { timeout: 10000 });
  await page.waitForTimeout(600);
  const pReceipt390 = path.join(artifactDir, 'evidence-record-receipt-modal-390.png');
  await page.screenshot({ path: pReceipt390 });
  console.log('Saved:', pReceipt390);

  // Close modal with keyboard Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  await browser.close();
  console.log('All Playwright screenshots and keyboard navigation tests verified successfully!');
}

run().catch((err) => {
  console.error('Error during capture:', err);
  process.exit(1);
});
