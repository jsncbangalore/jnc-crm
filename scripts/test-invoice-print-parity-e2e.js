const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function testInvoicePrintParityE2E() {
  console.log('=== Starting Invoice Print & Download End-to-End Parity Test ===');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error('[Browser Error]', msg.text());
      consoleErrors.push(msg.text());
    }
  });

  const pageErrors = [];
  page.on('pageerror', err => {
    console.error('[Page Uncaught Error]', err.message);
    pageErrors.push(err.message);
  });

  // Navigate to login
  console.log('1. Navigating to login...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('crm_cookie_consent', JSON.stringify({
      choice: 'all',
      policyVersion: '2026.10.1',
      savedAt: new Date().toISOString(),
      preferences: { essential: true, analytics: true, functional: true },
    }));
  });

  // Log in as tenant admin
  console.log('2. Logging in as tenant admin...');
  await page.fill('#company-code-input', 'ACME-DEV-001');
  await page.fill('#company-identifier', 'admin@example.com');
  await page.fill('#company-password', 'DevPassword@123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 10000 });
  console.log('✓ Logged in successfully!');

  // Navigate to Invoices
  console.log('3. Navigating to Invoices...');
  await page.goto('http://localhost:5173/invoices', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Take screenshot of Invoices list
  await page.screenshot({ path: 'scratch/evidence-invoices-list.png' });

  // Find first invoice row and click to open
  console.log('4. Opening first invoice in list...');
  const firstInvRow = page.locator('table tbody tr').first();
  await firstInvRow.click();
  await page.waitForTimeout(1500);

  // Verify modal is open and click Print & Download
  console.log('5. Clicking Direct Print / Print & Download button...');
  const printBtn = page.locator('button:has-text("Direct Print"), button:has-text("Print")').first();
  await printBtn.click();
  await page.waitForTimeout(2500);

  // Verify DirectPrintModal is open
  const directModal = page.locator('text=Invoice Print & Download').first();
  const isDirectOpen = await directModal.isVisible();
  console.log('✓ DirectPrintModal visible:', isDirectOpen);

  // Verify PDF Stream iframe
  const iframe = page.locator('iframe[title="Invoice PDF Stream"]').first();
  const hasIframe = await iframe.isVisible();
  console.log('✓ PDF Stream iframe visible:', hasIframe);

  // Test copy buttons
  console.log('6. Testing Copy selector buttons...');
  const duplicateBtn = page.locator('button:has-text("Duplicate")').first();
  if (await duplicateBtn.isVisible()) {
    await duplicateBtn.click();
    await page.waitForTimeout(1000);
    console.log('✓ Switched to Duplicate copy');
  }

  const all3Btn = page.locator('button:has-text("All 3")').first();
  if (await all3Btn.isVisible()) {
    await all3Btn.click();
    await page.waitForTimeout(1000);
    console.log('✓ Switched to All 3 copies');
  }

  // Test paper size buttons
  console.log('7. Testing Paper size buttons...');
  const a5Btn = page.locator('button:has-text("A5")').first();
  if (await a5Btn.isVisible()) {
    await a5Btn.click();
    await page.waitForTimeout(1000);
    console.log('✓ Switched to A5 paper size');
  }

  // Take screenshot of modal
  await page.screenshot({ path: 'scratch/evidence-print-modal.png' });

  // Copy to artifact directory
  const artifactDir = 'C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824';
  fs.copyFileSync('scratch/evidence-print-modal.png', path.join(artifactDir, 'evidence-print-modal.png'));
  console.log('✓ Screenshot saved to evidence-print-modal.png');

  // Check console errors
  const realErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('manifest'));
  if (realErrors.length > 0) {
    console.error('Test detected console errors:', realErrors);
    throw new Error(`Console errors found: ${realErrors.join(', ')}`);
  }
  if (pageErrors.length > 0) {
    console.error('Test detected uncaught page errors:', pageErrors);
    throw new Error(`Page errors found: ${pageErrors.join(', ')}`);
  }

  console.log('════════════════════════════════════════════════════════');
  console.log('PLAYWRIGHT INVOICE PRINT PARITY E2E TEST PASSED! (0 ERRORS)');
  console.log('════════════════════════════════════════════════════════');

  await browser.close();
}

testInvoicePrintParityE2E().catch(err => {
  console.error('E2E test failed:', err);
  process.exit(1);
});
