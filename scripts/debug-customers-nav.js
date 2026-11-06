const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('response', (res) => {
    if (res.status() >= 400) console.log('HTTP ERROR:', res.status(), res.url());
  });

  await page.goto('http://localhost:5173/login');
  await page.evaluate(() =>
    localStorage.setItem(
      'crm_cookie_consent',
      JSON.stringify({ choice: 'all', preferences: true, policyVersion: '2026.10.1', savedAt: new Date().toISOString() })
    )
  );
  await page.reload();
  const codeBtn = page.locator('button:has-text("Have a company code")');
  if (await codeBtn.isVisible().catch(() => false)) await codeBtn.click();
  await page.fill('#company-code-input', 'ACME-DEV-001');
  await page.fill('#company-identifier', 'admin@seed.dev');
  await page.fill('#company-password', 'DevPassword@123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard');
  console.log('Logged in. Navigating to /customers...');
  await page.goto('http://localhost:5173/customers');
  await page.waitForTimeout(2000);
  console.log('FINAL URL:', page.url());
  await browser.close();
})();
