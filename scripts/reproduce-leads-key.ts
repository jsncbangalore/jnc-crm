import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const consoleLogs: Array<{ type: string; text: string }> = [];
  page.on('console', (msg) => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (err) => {
    consoleLogs.push({ type: 'pageerror', text: err.message });
  });

  const networkLogs: Array<{ method: string; url: string; status: number }> = [];
  page.on('response', (res) => {
    networkLogs.push({ method: res.request().method(), url: res.url(), status: res.status() });
  });

  await page.goto('http://localhost:5173/login');
  await page.fill('input[type="email"]', 'tenant-admin@example.com');
  await page.fill('input[type="password"]', 'DevPassword@123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);

  console.log('Navigating to /leads...');
  await page.goto('http://localhost:5173/leads');
  await page.waitForTimeout(3000);

  // Switch tabs (Kanban, List, Client Directory)
  const buttons = await page.$$('button');
  for (const b of buttons) {
    const text = await b.textContent();
    if (text?.includes('Table') || text?.includes('List') || text?.includes('Directory')) {
      await b.click().catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  console.log('=== NETWORK LOG ===');
  for (const n of networkLogs.filter(n => n.url.includes('/api/v1/'))) {
    console.log(`${n.method} ${n.url} -> ${n.status}`);
  }

  console.log('\n=== CONSOLE LOGS ===');
  const duplicateKeyLogs = consoleLogs.filter(l => l.text.toLowerCase().includes('duplicate key') || l.text.toLowerCase().includes('same key') || l.text.toLowerCase().includes('two children with the same key'));
  for (const l of consoleLogs) {
    if (l.type === 'error' || l.type === 'warning' || l.text.includes('key')) {
      console.log(`[${l.type}] ${l.text}`);
    }
  }

  if (duplicateKeyLogs.length > 0) {
    console.log('\n[REPRODUCED] React Duplicate Key detected:');
    duplicateKeyLogs.forEach(d => console.log(d.text));
  } else {
    console.log('\nNo duplicate key warning found in default view. Inspecting current leads count in DB...');
  }

  await browser.close();
}

main().catch(console.error);
