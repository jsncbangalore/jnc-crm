const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err));
  page.on('response', async res => {
    if (res.url().includes('/api/')) {
      const text = await res.text().catch(() => '');
      console.log('API:', res.status(), res.url(), text.substring(0, 100));
    }
  });

  await page.goto('http://localhost:5173/platform/login', { waitUntil: 'domcontentloaded' });
  await page.fill('#platform-email', 'platform@jsnc.co.in');
  await page.fill('#platform-password', 'type-your-own-long-password');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);
  console.log('Final URL:', page.url());
  const errorAlert = page.locator('[role="alert"]');
  if (await errorAlert.count() > 0) {
    console.log('Error alert text:', await errorAlert.innerText());
  }
  await browser.close();
})();
