/**
 * CSP-Compliant Invoice Direct Print Test Suite
 * 
 * Tests direct iframe printing under strict production Content-Security-Policy:
 * - default-src 'self'
 * - frame-src 'self'
 * - object-src 'none' (NO blob: in frame-src or object-src)
 * 
 * Verifications per scenario:
 * 1. Print frame (#crm-direct-print-sandbox) is created in the DOM.
 * 2. window.print is called exactly once.
 * 3. 0 CSP errors in browser console.
 * 4. Print frame remains in DOM 10 seconds after print() (never destroyed after 3s).
 * 5. Invoice print preview inside frame shows the identical totals to the screen.
 * 6. Print frame is cleanly removed after 'afterprint' event.
 * 
 * Scenarios tested:
 * - Viewport: 1536x730, Theme: Light
 * - Viewport: 1536x730, Theme: Dark
 * - Viewport: 390px (390x844), Theme: Light
 * - Viewport: 390px (390x844), Theme: Dark
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 4197;
const DIST_DIR = path.resolve(__dirname, '../apps/web/dist');

// Exact production CSP header from apps/web/public/.htaccess (no blob: in frame-src or object-src)
const PROD_CSP_HEADER = "default-src 'self'; script-src 'self' blob:; worker-src 'self' blob:; frame-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' http://localhost:3333 https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';";

const mimeTypes = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
      let reqPath = parsedUrl.pathname;
      let filePath = path.join(DIST_DIR, reqPath);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
      if (!fs.existsSync(filePath)) {
        filePath = path.join(DIST_DIR, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      res.setHeader('Content-Security-Policy', PROD_CSP_HEADER);
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      try {
        const content = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      } catch (err) {
        res.writeHead(500);
        res.end('Server Error: ' + err.message);
      }
    });

    server.listen(PORT, (err) => {
      if (err) return reject(err);
      console.log(`[Server] Production build running on http://localhost:${PORT} with production CSP.`);
      resolve(server);
    });
  });
}

const fakeUser = {
  id: 'usr-test-101',
  name: 'Test QA Admin',
  email: 'admin@test.local',
  role: 'tenant_admin',
  effectivePages: ['invoices', 'orders', 'quotations', 'inventory', 'ledger', 'dashboard', 'settings'],
  permissions: ['edit_price', 'view_cost', 'invoices_manage', 'inventory_manage'],
};

const fakeInvoice = {
  id: 'inv-test-999',
  invoiceNumber: 'INV-2026-9999',
  docType: 'tax_invoice',
  invoiceDate: '2026-11-04T10:00:00.000Z',
  dueDate: '2026-12-04T10:00:00.000Z',
  customerName: 'Audio Solutions Karnataka',
  customerAddress: '42 MG Road, Bengaluru, Karnataka - 560001',
  customerState: 'Karnataka',
  customerGstin: '29ABCDE1234F1Z5',
  createdAt: '2026-11-04T10:00:00.000Z',
  subtotal: 100000,
  cgstAmount: 9000,
  sgstAmount: 9000,
  igstAmount: 0,
  totalAmount: 118000,
  paymentStatus: 'paid',
  isVoided: false,
  lines: [
    {
      id: 'line-1',
      description: 'Studio Reference Monitor Pair',
      hsnCode: '85182200',
      quantity: 2,
      unitPrice: 50000,
      totalPrice: 100000,
    },
  ],
};

const scenarios = [
  { name: 'Desktop 1536x730 Light Mode', width: 1536, height: 730, theme: 'light' },
  { name: 'Desktop 1536x730 Dark Mode', width: 1536, height: 730, theme: 'dark' },
  { name: 'Mobile 390px Light Mode', width: 390, height: 844, theme: 'light' },
  { name: 'Mobile 390px Dark Mode', width: 390, height: 844, theme: 'dark' },
];

async function runScenario(browser, scenario) {
  console.log(`\n------------------------------------------------------------`);
  console.log(`RUNNING SCENARIO: ${scenario.name}`);
  console.log(`------------------------------------------------------------`);

  const context = await browser.newContext({
    viewport: { width: scenario.width, height: scenario.height },
    colorScheme: scenario.theme,
  });

  const page = await context.newPage();

  const cspViolations = [];
  page.on('console', (msg) => {
    const text = msg.text();
    console.log(`  [BROWSER LOG] ${text}`);
    if (text.includes('Refused to') || text.includes('Content Security Policy') || text.includes('violates the following')) {
      cspViolations.push(text);
      console.error(`  [CSP ERROR] ${text}`);
    }
  });

  // Intercept API calls
  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();

    // Allow all HTML documents and static assets to be served by local server
    if (req.resourceType() === 'document' || url.includes('/assets/') || url.endsWith('.woff2') || url.endsWith('.png') || url.endsWith('.svg') || url.endsWith('.css') || url.endsWith('.js') || url.endsWith('.html')) {
      return route.continue();
    }

    if (url.includes('/auth/me')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeUser) });
    }
    if (url.includes('/auth/refresh')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accessToken: 'fake-token', user: fakeUser }) });
    }
    if (url.includes('/health')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
    }
    if (url.includes('/branding')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ companyDisplayName: 'JNC Audio Systems', companyLogoUrl: '' }) });
    }
    if (url.includes('/company-profile')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ companyName: 'JNC Audio Systems', logoUrl: '' }) });
    }
    if (url.includes('/invoices/inv-test-999')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeInvoice) });
    }
    if (url.includes('/invoices')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [fakeInvoice], total: 1 }),
      });
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });

  // Prime local authentication state
  await page.addInitScript(({ user, theme }) => {
    localStorage.setItem('crm_user', JSON.stringify(user));
    localStorage.setItem('crm_portal', 'staff');
    localStorage.setItem('crm_staff_user_id', user.id);
    localStorage.setItem('crm_tab_user_id', user.id);
    localStorage.setItem('crm_activity_timestamp', String(Date.now()));
    localStorage.setItem('crm_theme', theme);
    sessionStorage.setItem('crm_portal', 'staff');
    sessionStorage.setItem('crm_tab_user_id', user.id);
  }, { user: fakeUser, theme: scenario.theme });

  await page.goto(`http://localhost:${PORT}/invoices`, { waitUntil: 'networkidle' });

  // Hook print() calls on any dynamically inserted iframe
  await page.evaluate(() => {
    window.__printCalls = 0;
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.id === 'crm-direct-print-sandbox' && node.contentWindow) {
            try {
              node.contentWindow.print = () => {
                window.__printCalls++;
              };
            } catch (e) {}
          }
        }
      }
    });
    observer.observe(document.body, { childList: true });
  });

  // Open the Invoice Modal
  console.log('  1. Opening Invoice Viewer modal...');
  const viewDocBtn = page.locator('button[title="View Official Document"]:visible, h3:has-text("INV-2026-9999"):visible').first();
  await viewDocBtn.waitFor({ state: 'visible', timeout: 8000 });
  await viewDocBtn.click();

  // Verify modal is visible
  const modalHeader = page.locator('h3:has-text("Tax Invoice")').first();
  await modalHeader.waitFor({ state: 'visible', timeout: 5000 });

  // Verify on-screen total
  const screenFooterText = await page.locator('span:has-text("Total: ₹")').first().textContent();
  console.log(`  Screen Invoice Total: "${screenFooterText?.trim()}"`);
  if (!screenFooterText || !screenFooterText.includes('1,18,000')) {
    throw new Error(`Screen total mismatch! Expected '1,18,000', got '${screenFooterText}'`);
  }

  // Click Print button
  console.log('  2. Clicking Print button in Invoice modal...');
  const printButton = page.locator('button[title="Print Official Vector PDF"]').first();
  await printButton.waitFor({ state: 'visible', timeout: 5000 });
  await printButton.click();

  // Check 1: Print iframe created in DOM
  console.log('  3. Verifying print frame (#crm-direct-print-sandbox) is created...');
  const printFrame = await page.waitForSelector('#crm-direct-print-sandbox', { state: 'attached', timeout: 5000 });
  if (!printFrame) {
    throw new Error('Print sandbox iframe was NOT found in DOM!');
  }
  console.log('  -> PASS: Print frame created.');

  // Check 2: window.print called once
  console.log('  4. Verifying window.print was called once...');
  await page.waitForFunction(() => window.__printCalls >= 1, { timeout: 5000 });
  const printCalls = await page.evaluate(() => window.__printCalls);
  if (printCalls !== 1) {
    throw new Error(`Expected window.print to be called exactly 1 time, got ${printCalls}`);
  }
  console.log(`  -> PASS: window.print called exactly ${printCalls} time.`);

  // Check 3: Zero CSP violations
  console.log('  5. Verifying zero CSP console errors...');
  if (cspViolations.length > 0) {
    throw new Error(`CSP Violations detected (${cspViolations.length}): ${cspViolations.join('; ')}`);
  }
  console.log('  -> PASS: Zero CSP console errors.');

  // Check 4: Frame still present 10 seconds after print()
  console.log('  6. Waiting 10 seconds to verify frame is NOT prematurely destroyed...');
  await page.waitForTimeout(10000);
  const isStillPresent = await page.evaluate(() => Boolean(document.getElementById('crm-direct-print-sandbox')));
  if (!isStillPresent) {
    throw new Error('FAILED: Print sandbox iframe was destroyed prematurely within 10 seconds!');
  }
  console.log('  -> PASS: Print frame is STILL present 10 seconds after print().');

  // Check 5: Totals check in iframe document matches screen
  console.log('  7. Verifying invoice print preview inside frame shows the identical totals to screen...');
  const printFrameHtml = await page.evaluate(() => {
    const f = document.getElementById('crm-direct-print-sandbox');
    return f?.contentDocument?.body?.innerText || '';
  });

  const totalsMatch = printFrameHtml.includes('1,18,000') && printFrameHtml.includes('INV-2026-9999');
  if (!totalsMatch) {
    throw new Error(`Print frame totals mismatch! Could not find '1,18,000' or invoice number in frame content: ${printFrameHtml.substring(0, 300)}`);
  }
  console.log('  -> PASS: Print preview totals match on-screen total (₹1,18,000 / INV-2026-9999).');

  // Check 6: Frame removed after 'afterprint' event
  console.log('  8. Dispatching afterprint event to verify clean teardown...');
  await page.evaluate(() => {
    window.dispatchEvent(new Event('afterprint'));
    const f = document.getElementById('crm-direct-print-sandbox');
    if (f && f.contentWindow) {
      try {
        f.contentWindow.dispatchEvent(new Event('afterprint'));
      } catch (e) {}
    }
  });

  await page.waitForFunction(() => !document.getElementById('crm-direct-print-sandbox'), { timeout: 3000 });
  const isRemoved = await page.evaluate(() => !document.getElementById('crm-direct-print-sandbox'));
  if (!isRemoved) {
    throw new Error('FAILED: Print frame was not removed after afterprint event!');
  }
  console.log('  -> PASS: Print frame removed cleanly on afterprint.');

  await context.close();
  console.log(`SCENARIO PASSED: ${scenario.name}\n`);
}

async function main() {
  console.log('============================================================');
  console.log('CSP DIRECT PRINT PLAYWRIGHT TEST SUITE');
  console.log('============================================================');

  let server;
  let browser;

  try {
    server = await startServer();
    browser = await chromium.launch({ headless: true });

    for (const scenario of scenarios) {
      await runScenario(browser, scenario);
    }

    console.log('============================================================');
    console.log('ALL 4 PRINT CSP SCENARIOS PASSED WITH ZERO VIOLATIONS');
    console.log('============================================================');
    process.exit(0);
  } catch (err) {
    console.error('\nTEST SUITE FAILED:', err);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
    if (server) server.close();
  }
}

main();
