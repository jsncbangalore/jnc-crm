const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1536, height: 730 } });

  page.on('console', (msg) => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.error('BROWSER ERROR:', err.message));
  page.on('requestfailed', (req) => console.error('REQUEST FAILED:', req.url(), req.failure()?.errorText));
  page.on('response', (res) => {
    if (res.url().includes('auth') || res.status() >= 400) {
      console.log('HTTP RESPONSE:', res.status(), res.url());
    }
  });

  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  console.log('Login page loaded');

  // Click on the Accountant demo login button
  const accountantBtn = page.locator('[data-testid="demo-btn-accountant"]');
  await accountantBtn.waitFor({ state: 'visible', timeout: 5000 });
  await accountantBtn.click();
  console.log('Accountant demo button clicked');

  await page.waitForTimeout(3000);
  console.log('Current URL after 3s:', page.url());

  const errEl = await page.locator('[data-testid="demo-login-panel"] .text-red-700').textContent().catch(() => null);
  if (errEl) {
    console.log('Error shown in demo panel:', errEl);
  }

  await page.screenshot({
    path: 'C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824/evidence-demo-click-debug.png',
    fullPage: true,
  });

  await browser.close();
})().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
