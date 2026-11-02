const { chromium } = require('playwright');

async function reproduce() {
  console.log('--- Reproducing Auth / Refresh Bug ---');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleLogs = [];
  page.on('console', msg => {
    console.log(`[Browser ${msg.type()}]`, msg.text());
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });

  page.on('pageerror', err => {
    console.log('[Browser Uncaught]', err.message);
  });

  page.on('request', req => {
    if (req.url().includes('/auth/')) {
      console.log(`-> [Request] ${req.method()} ${req.url()}`);
      console.log('   Headers:', JSON.stringify(req.headers()));
    }
  });

  page.on('response', async res => {
    if (res.url().includes('/auth/')) {
      console.log(`<- [Response] ${res.status()} ${res.url()}`);
      console.log('   Headers:', JSON.stringify(await res.allHeaders()));
    }
  });

  // Let's test a direct fetch from the web page on origin http://localhost:5173 to API on http://127.0.0.1:3333
  await page.goto('http://localhost:5173/login');
  await page.waitForTimeout(1000);

  console.log('\n--- Simulating refresh call from page context ---');
  const result = await page.evaluate(async () => {
    try {
      const res = await fetch('http://127.0.0.1:3333/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-Expected-User-Id': 'some-user-id',
        },
        body: JSON.stringify({ expectedUserId: 'some-user-id' }),
      });
      return { status: res.status, ok: res.ok };
    } catch (e) {
      return { error: e.message, name: e.name };
    }
  });

  console.log('Fetch result:', result);

  await browser.close();
}

reproduce().catch(console.error);
