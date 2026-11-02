const path = require('path');
const { chromium } = require('playwright');
const axios = require('axios');

const BASE_URL = process.env.TEST_FRONTEND_URL || 'http://localhost:5173';
const ARTIFACT_DIR = 'C:\\Users\\JNC R&D\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824';

const TEST_EMAIL = 'repro-2fa-tester@example.internal';
const TEST_PASSWORD = 'DevPassword@123';

async function runBugBRepro() {
  // 1. API check: what does /auth/me return?
  const loginRes = await axios.post('http://localhost:3333/api/v1/auth/login', {
    identifier: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  const token = loginRes.data.accessToken;
  const meRes = await axios.get('http://localhost:3333/api/v1/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('BUG B REPRODUCTION:');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('/auth/me response keys:', Object.keys(meRes.data));
  console.log('/auth/me phone field value:', meRes.data.phone);
  console.log('/auth/me phoneVerified field present:', 'phoneVerified' in meRes.data);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 2. Playwright screenshot of Profile tab showing "No mobile number registered"
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="username"], #company-identifier', TEST_EMAIL);
  await page.fill('input[name="password"], #company-password', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'));

  // Dismiss cookie
  const cookieBtn = page.locator('button:has-text("Accept all")');
  if (await cookieBtn.count() > 0 && await cookieBtn.isVisible()) {
    await cookieBtn.click();
    await page.waitForTimeout(500);
  }

  // Navigate to My Account
  const profileBtn = page.locator('button[title*="Signed in as"], #user-profile-button').first();
  await profileBtn.waitFor({ state: 'visible', timeout: 5000 });
  await profileBtn.click();
  await page.waitForTimeout(500);

  const accountLink = page.locator('a[href="/account"]').first();
  await accountLink.waitFor({ state: 'visible', timeout: 5000 });
  await accountLink.click();
  await page.waitForURL((url) => url.pathname.includes('/account'));
  await page.waitForTimeout(500);

  // Reload the page: this forces AuthContext to call /auth/me to restore session user
  console.log('[NAV] Reloading page to trigger /auth/me fetch...');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Capture screenshot of profile tab showing "No mobile number registered"
  const screenshotPath = path.join(ARTIFACT_DIR, 'evidence-bug-b-reproduced.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`[EVIDENCE] Bug B Screenshot saved to: ${screenshotPath}`);

  // Check input value
  const phoneVal = await page.locator('input[disabled]').nth(2).inputValue().catch(() => null);
  console.log('Page registered phone input value:', phoneVal);

  await browser.close();
}

runBugBRepro().catch(console.error);
