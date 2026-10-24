const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('request', req => {
    if (req.url().includes('/api/v1/')) {
      console.log('API REQ:', req.method(), req.url());
    }
  });
  page.on('response', async res => {
    if (res.url().includes('/api/v1/')) {
      const text = await res.text().catch(() => '');
      console.log('API RES:', res.status(), res.url(), text ? text.substring(0, 150) : '');
    }
  });

  await page.goto('http://localhost:5173/platform/login', { waitUntil: 'domcontentloaded' });
  await page.fill('#platform-email', process.env.TEST_PLATFORM_EMAIL || 'platform@example.com');
  await page.fill('#platform-password', 'type-your-own-long-password');
  await page.click('button[type="submit"]');

  await page.waitForURL(url => url.pathname.includes('/platform/companies'), { timeout: 10000 });
  console.log('Logged in URL:', page.url());

  const cookies = await context.cookies();
  console.log('Cookies in Context:', cookies.map(c => ({ name: c.name, path: c.path, domain: c.domain })));

  console.log('--- RELOADING PAGE ---');
  await page.waitForTimeout(1000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  console.log('URL after reload:', page.url());

  await browser.close();
})();
