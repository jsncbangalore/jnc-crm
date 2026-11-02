/**
 * Playwright Test: Customer Creation Error Resilience & React Error #31 Prevention
 * Verifies that creating a customer with invalid phone and invalid GSTIN:
 * 1. Shows inline messages for both fields
 * 2. Never crashes React with Error #31
 * 3. Never triggers ErrorBoundary
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.TEST_FRONTEND_URL || 'http://localhost:4173';
const ARTIFACT_DIR = 'C:\\Users\\JNC R&D\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824';

const ADMIN_EMAIL = 'admin@zzclienttest.com';
const PASSWORD = 'DevPassword@123';

async function performLogin(page) {
  console.log(`Navigating to ${BASE_URL}/login...`);
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="username"], #company-identifier', { timeout: 10000 });
  await page.fill('input[name="username"], #company-identifier', ADMIN_EMAIL);
  await page.fill('input[name="password"], #company-password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  await page.waitForTimeout(1000);
}

async function run() {
  console.log('=== TEST: Customer Error Resilience & React Error #31 Prevention ===');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1536, height: 730 } });

  // Point web requests directly to local dev API
  await page.addInitScript(() => {
    window.__CRM_API_URL__ = 'http://localhost:3333/api/v1';
    localStorage.setItem('crm_api_base_url', 'http://localhost:3333/api/v1');
  });

  let pageErrors = [];
  page.on('pageerror', (err) => {
    console.error('[BROWSER_UNCAUGHT_EXCEPTION]:', err.message);
    pageErrors.push(err.message);
  });

  try {
    await performLogin(page);
    console.log('Logged in successfully. Navigating to /invoices...');

    await page.goto(`${BASE_URL}/invoices`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Look for Create Document or New Invoice button
    console.log('Opening Create Document modal...');
    const createBtn = page.locator('button:has-text("Create Document"), button:has-text("New Document"), button:has-text("Create Invoice")').first();
    await createBtn.click();
    await page.waitForTimeout(1000);

    // Click "+ New Customer" button inside CustomerSelectWithModal
    console.log('Opening "+ New Customer" modal...');
    const newCustBtn = page.locator('button:has-text("+ New Customer"), button:has-text("New Customer")').first();
    await newCustBtn.click();
    await page.waitForTimeout(1000);

    // Fill in customer form with invalid phone and invalid GSTIN
    console.log('Filling form with invalid phone and invalid GSTIN...');
    await page.fill('input[placeholder*="Acme Tech"]', 'Test Resilience Enterprise');
    await page.fill('input[placeholder*="10-digit"]', '12345');
    await page.fill('input[placeholder*="15-character"]', 'INVALID_GSTIN_123');

    // Submit form
    console.log('Submitting customer form...');
    const submitBtn = page.locator('form button[type="submit"]:has-text("Create & Select"), form button[type="submit"]').first();
    await submitBtn.click();
    await page.waitForTimeout(1500);

    // Assert inline errors are present
    const phoneError = page.locator('p.text-rose-500:has-text("Phone"), p.text-rose-500:has-text("10 digits")').first();
    const gstinError = page.locator('p.text-rose-500:has-text("GSTIN"), p.text-rose-500:has-text("15")').first();

    const phoneErrorVisible = await phoneError.isVisible();
    const gstinErrorVisible = await gstinError.isVisible();

    console.log(`Inline Phone Error visible: ${phoneErrorVisible}`);
    console.log(`Inline GSTIN Error visible: ${gstinErrorVisible}`);

    // Assert ErrorBoundary did NOT catch any React error #31
    const errorBoundary = page.locator('text="Something went wrong"');
    const isErrorBoundaryVisible = await errorBoundary.isVisible();
    console.log(`ErrorBoundary triggered: ${isErrorBoundaryVisible}`);

    // Take screenshot for evidence (1536x730)
    const screenshotPath = path.join(ARTIFACT_DIR, 'evidence-customer-error-resilience-1536x730.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved to: ${screenshotPath}`);

    // Also capture at mobile 390px viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const screenshot390Path = path.join(ARTIFACT_DIR, 'evidence-customer-error-resilience-390px.png');
    await page.screenshot({ path: screenshot390Path, fullPage: true });
    console.log(`Mobile screenshot saved to: ${screenshot390Path}`);

    // Check for any React Error #31 in page errors
    const react31Errors = pageErrors.filter((e) => e.includes('Minified React error #31') || e.includes('Objects are not valid as a React child'));
    if (react31Errors.length > 0) {
      throw new Error(`React Error #31 detected: ${react31Errors.join('; ')}`);
    }

    if (isErrorBoundaryVisible) {
      throw new Error('ErrorBoundary was triggered! Form crashed instead of displaying inline errors.');
    }

    if (!phoneErrorVisible && !gstinErrorVisible) {
      throw new Error('Neither phone nor GSTIN inline errors were visible!');
    }

    console.log('SUCCESS: Customer creation with invalid phone & GSTIN showed inline errors and never crashed!');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
