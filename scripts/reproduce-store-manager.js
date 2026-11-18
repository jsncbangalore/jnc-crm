const { chromium } = require('playwright');

async function test() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 730 } });
  const page = await ctx.newPage();

  console.log('Navigating to login page...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });

  // Click on "Store & Inventory Manager" demo card/button
  console.log('Clicking Store Manager demo login...');
  const storeBtn = page.locator('button:has-text("Store & Inventory Manager"), div:has-text("Store & Inventory Manager")').last();
  await storeBtn.click();

  // Wait for navigation away from login
  await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 10000 });
  console.log('Logged in! Current URL:', page.url());

  const networkRequests = [];
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/api/v1/')) {
      networkRequests.push({
        status: res.status(),
        method: res.request().method(),
        url: url.replace(/^http:\/\/[^/]+/, ''),
      });
    }
  });

  console.log('Navigating to /shipments...');
  await page.goto('http://localhost:5173/shipments', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  console.log('\n--- Network Requests on /shipments ---');
  networkRequests.forEach((req) => {
    console.log(`  [${req.status}] ${req.method} ${req.url}`);
  });

  const failed = networkRequests.filter((r) => r.status >= 400);
  console.log(`\nFailed requests count on /shipments: ${failed.length}`);

  const pageText = await page.innerText('body');
  console.log('Does page show error banner or access denied?');
  const errorElements = await page.locator(':has-text("access"), :has-text("permission"), :has-text("Order records"), :has-text("error")').allInnerTexts().catch(() => []);
  console.log('Error matches:', errorElements.slice(0, 5));

  await browser.close();
}

test().catch(console.error);
