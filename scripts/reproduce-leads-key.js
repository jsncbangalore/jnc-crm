const { chromium } = require('playwright');

async function main() {
  console.log('Starting Playwright browser for Leads reproduction...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleLogs = [];
  page.on('console', (msg) => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (err) => {
    consoleLogs.push({ type: 'pageerror', text: err.message });
  });

  const networkLogs = [];
  page.on('response', (res) => {
    networkLogs.push({ method: res.request().method(), url: res.url(), status: res.status() });
  });

  console.log('Navigating to login...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#company-identifier', { timeout: 10000 });
  await page.fill('#company-identifier', 'tenant-admin@example.com');
  await page.fill('#company-password', 'DevPassword@123');
  await page.click('button[type="submit"]');

  console.log('Waiting for authentication navigation...');
  await page.waitForTimeout(3000);

  console.log('Navigating to /leads...');
  await page.goto('http://localhost:5173/leads', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Switch tabs
  try {
    const tableBtn = await page.locator('button:has-text("Table View")');
    if (await tableBtn.isVisible()) {
      console.log('Switching to Table View...');
      await tableBtn.click();
      await page.waitForTimeout(1000);
    }
  } catch {}

  try {
    const dirBtn = await page.locator('button:has-text("Client Directory")');
    if (await dirBtn.isVisible()) {
      console.log('Switching to Client Directory...');
      await dirBtn.click();
      await page.waitForTimeout(1000);
    }
  } catch {}

  console.log('\n=== NETWORK LOG ===');
  for (const n of networkLogs.filter(n => n.url.includes('/api/v1/'))) {
    console.log(`${n.method} ${n.url} -> ${n.status}`);
  }

  console.log('\n=== CONSOLE LOGS ===');
  for (const l of consoleLogs) {
    if (l.type === 'error' || l.type === 'warning' || l.text.toLowerCase().includes('key')) {
      console.log(`[${l.type}] ${l.text}`);
    }
  }

  const dupes = consoleLogs.filter(l => 
    l.text.includes('Encountered two children with the same key') ||
    l.text.includes('duplicate key')
  );

  if (dupes.length > 0) {
    console.log('\n[REPRODUCED] React Duplicate Key detected:');
    dupes.forEach(d => console.log(d.text));
  } else {
    console.log('\nResult: No duplicate key warning detected in current render.');
  }

  await browser.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
