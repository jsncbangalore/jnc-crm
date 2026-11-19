const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const WEB_URL = 'http://localhost:5173';
const ARTIFACT_DIR = 'C:\\Users\\JNC R&D\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824';
const SCREENSHOT_DIR = path.resolve(__dirname, '../deploy-release/screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function saveEvidence(filename, buffer) {
  const localPath = path.join(SCREENSHOT_DIR, filename);
  fs.writeFileSync(localPath, buffer);
  const artifactPath = path.join(ARTIFACT_DIR, filename);
  fs.writeFileSync(artifactPath, buffer);
  console.log(`[SAVED] ${filename} (${buffer.length} bytes)`);
}

async function captureEvidence() {
  console.log('========================================================================');
  console.log('PLAYWRIGHT EVIDENCE CAPTURE: LEDGER PAGE OVERHAUL');
  console.log('Capturing 1440px and 390px, Light and Dark, Both Tabs and Both Forms');
  console.log('========================================================================\n');

  const browser = await chromium.launch({ headless: true });

  try {
    // -------------------------------------------------------------------------
    // 1. DESKTOP CONTEXT (1440px x 900px)
    // -------------------------------------------------------------------------
    console.log('--- 1. Desktop 1440px Captures ---');
    const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    const page = await desktopContext.newPage();

    // Login via UI on dev database
    console.log('Logging in on dev database...');
    await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle' });
    await page.click('button:has-text("Have a company code")');
    await page.fill('#company-code-input', 'ACME-DEV-001');
    await page.fill('#company-identifier', 'tenant-admin@example.com');
    await page.fill('#company-password', 'DevPassword@123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1500);

    // Navigate to /ledger
    console.log('Navigating to /ledger...');
    await page.goto(`${WEB_URL}/ledger`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Capture 1: Customers Tab - Desktop Light
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    await page.waitForTimeout(300);
    let buf = await page.screenshot({ fullPage: false });
    saveEvidence('evidence-ledger-customers-desktop-light.png', buf);

    // Capture 2: Customers Tab - Desktop Dark
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.waitForTimeout(300);
    buf = await page.screenshot({ fullPage: false });
    saveEvidence('evidence-ledger-customers-desktop-dark.png', buf);

    // Switch to Suppliers Tab
    console.log('Switching to Suppliers Tab...');
    await page.click('[data-testid="tab-ledger-suppliers"]');
    await page.waitForTimeout(1000);

    // Capture 3: Suppliers Tab - Desktop Dark
    buf = await page.screenshot({ fullPage: false });
    saveEvidence('evidence-ledger-suppliers-desktop-dark.png', buf);

    // Capture 4: Suppliers Tab - Desktop Light
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    await page.waitForTimeout(300);
    buf = await page.screenshot({ fullPage: false });
    saveEvidence('evidence-ledger-suppliers-desktop-light.png', buf);

    // Capture 5: Record Payment / Receipt Form Modal - Light
    console.log('Opening Record Payment / Receipt Modal...');
    await page.click('[data-testid="btn-record-ledger-payment"]');
    await page.waitForTimeout(500);
    buf = await page.screenshot({ fullPage: false });
    saveEvidence('evidence-ledger-payment-form-light.png', buf);

    // Capture 6: Record Payment / Receipt Form Modal - Dark
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.waitForTimeout(300);
    buf = await page.screenshot({ fullPage: false });
    saveEvidence('evidence-ledger-payment-form-dark.png', buf);

    // Close payment modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // Capture 7: Add Manual Entry Form Modal - Dark
    console.log('Opening Add Manual Entry Modal...');
    await page.click('button:has-text("Add Entry")');
    await page.waitForTimeout(500);
    buf = await page.screenshot({ fullPage: false });
    saveEvidence('evidence-ledger-manual-entry-form-dark.png', buf);

    // Capture 8: Add Manual Entry Form Modal - Light
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    await page.waitForTimeout(300);
    buf = await page.screenshot({ fullPage: false });
    saveEvidence('evidence-ledger-manual-entry-form-light.png', buf);

    // Close entry modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    await desktopContext.close();

    // -------------------------------------------------------------------------
    // 2. MOBILE CONTEXT (390px x 844px)
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Mobile 390px Captures ---');
    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mobilePage = await mobileContext.newPage();

    // Login via UI on mobile
    await mobilePage.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle' });
    await mobilePage.click('button:has-text("Have a company code")');
    await mobilePage.fill('#company-code-input', 'ACME-DEV-001');
    await mobilePage.fill('#company-identifier', 'tenant-admin@example.com');
    await mobilePage.fill('#company-password', 'DevPassword@123');
    await mobilePage.click('button[type="submit"]');
    await mobilePage.waitForTimeout(1500);

    // Navigate to /ledger on mobile
    await mobilePage.goto(`${WEB_URL}/ledger`, { waitUntil: 'networkidle' });
    await mobilePage.waitForTimeout(1500);

    // Capture 9: Customers Tab - Mobile Light
    await mobilePage.evaluate(() => document.documentElement.classList.remove('dark'));
    await mobilePage.waitForTimeout(300);
    buf = await mobilePage.screenshot({ fullPage: false });
    saveEvidence('evidence-ledger-customers-mobile-light.png', buf);

    // Capture 10: Customers Tab - Mobile Dark
    await mobilePage.evaluate(() => document.documentElement.classList.add('dark'));
    await mobilePage.waitForTimeout(300);
    buf = await mobilePage.screenshot({ fullPage: false });
    saveEvidence('evidence-ledger-customers-mobile-dark.png', buf);

    // Switch to Suppliers Tab on mobile
    await mobilePage.click('button:has-text("Suppliers")');
    await mobilePage.waitForTimeout(1000);

    // Capture 11: Suppliers Tab - Mobile Dark
    buf = await mobilePage.screenshot({ fullPage: false });
    saveEvidence('evidence-ledger-suppliers-mobile-dark.png', buf);

    // Capture 12: Suppliers Tab - Mobile Light
    await mobilePage.evaluate(() => document.documentElement.classList.remove('dark'));
    await mobilePage.waitForTimeout(300);
    buf = await mobilePage.screenshot({ fullPage: false });
    saveEvidence('evidence-ledger-suppliers-mobile-light.png', buf);

    await mobileContext.close();

    console.log('\n========================================================================');
    console.log('[PASS] ALL 12 PLAYWRIGHT EVIDENCE SCREENSHOTS CAPTURED SUCCESSFULLY');
    console.log('========================================================================');
  } catch (err) {
    console.error('Playwright Error:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

captureEvidence();
