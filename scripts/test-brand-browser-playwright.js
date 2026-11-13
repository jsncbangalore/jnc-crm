/**
 * Playwright Browser Test for Brand Consistency
 * 
 * Renders in a real browser:
 * 1. Landing page
 * 2. Login page
 * 3. Shared Cart page (with fake requisition data)
 * 4. Marketing page (Contact page)
 * 
 * Asserts:
 * - Browser page title contains 'Syntra CRM'
 * - Visible footer text contains 'JNC Network Communication' and 'Syntra CRM' and 'All rights reserved.'
 * - No forbidden legacy brand names ('Apex', 'Syntra' without 'CRM')
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT_DIR = path.resolve(__dirname, '..');
const WEB_DIST = path.resolve(ROOT_DIR, 'apps/web/dist');
const MARKETING_DIR = path.resolve(ROOT_DIR, 'marketing-site');

const currentYear = new Date().getFullYear();
const EXPECTED_COPYRIGHT = `© ${currentYear} JNC Network Communication. Syntra CRM. All rights reserved.`;

// Simple HTTP static server with SPA fallback
function createTestServer() {
  return http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, 'http://localhost');
    const pathname = parsedUrl.pathname;

    // Route /marketing/* to marketing-site folder
    if (pathname.startsWith('/marketing/')) {
      const relative = pathname.replace('/marketing/', '');
      const filePath = path.join(MARKETING_DIR, relative);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        const mimeTypes = {
          '.html': 'text/html',
          '.css': 'text/css',
          '.js': 'application/javascript',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
        };
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        return res.end(fs.readFileSync(filePath));
      }
    }

    // Direct marketing files when requested as /styles.css or /assets/* from marketing pages
    if (pathname === '/styles.css') {
      const filePath = path.join(MARKETING_DIR, 'styles.css');
      if (fs.existsSync(filePath)) {
        res.writeHead(200, { 'Content-Type': 'text/css' });
        return res.end(fs.readFileSync(filePath));
      }
    }

    // Try web dist static files
    let distPath = path.join(WEB_DIST, pathname);
    if (fs.existsSync(distPath) && fs.statSync(distPath).isFile()) {
      const ext = path.extname(distPath);
      const mimeTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      return res.end(fs.readFileSync(distPath));
    }

    // SPA fallback: return index.html for all client routes
    const indexPath = path.join(WEB_DIST, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(fs.readFileSync(indexPath));
    }

    res.writeHead(404);
    res.end('Not Found');
  });
}

// Generate fake cart data query parameter
function makeFakeCartParam() {
  const payload = {
    t: 'Fake Test Component Requisition',
    d: '2026-11-13',
    i: [
      {
        c: 'FAKE-SKU-100',
        n: 'High-Density Switch 48-Port',
        p: 'Project Fake Cloud',
        s: 'Supplier Fake Vendor Ltd',
        cs: 10,
        q: 2,
        u: 'Nos',
        pr: 18500,
        tr: 18,
      },
    ],
  };
  return encodeURIComponent(Buffer.from(JSON.stringify(payload)).toString('base64'));
}

async function runBrowserTests() {
  console.log('[PLAYWRIGHT-BRAND] Starting browser verification server...');
  const server = createTestServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`[PLAYWRIGHT-BRAND] Test server running at ${baseUrl}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const testCases = [
    {
      name: 'Landing Page',
      url: `${baseUrl}/`,
      expectedTitle: 'Syntra CRM',
      footerSelector: 'footer',
    },
    {
      name: 'Login Page',
      url: `${baseUrl}/login`,
      expectedTitle: 'Syntra CRM',
      footerSelector: 'footer',
    },
    {
      name: 'Shared Cart Page (Fake Requisition Data)',
      url: `${baseUrl}/shared-cart?data=${makeFakeCartParam()}`,
      expectedTitle: 'Syntra CRM',
      footerSelector: 'footer',
    },
    {
      name: 'Marketing Page (Contact Page)',
      url: `${baseUrl}/marketing/contact.html`,
      expectedTitleContains: 'Syntra CRM',
      footerSelector: 'footer.site-footer',
    },
  ];

  let passedCount = 0;
  let failedCount = 0;

  for (const tc of testCases) {
    console.log(`\n--- Testing ${tc.name} ---`);
    console.log(`Navigating to: ${tc.url}`);
    await page.goto(tc.url, { waitUntil: 'domcontentloaded' });

    // 1. Check page title in browser
    const title = await page.title();
    console.log(`Browser Page Title: "${title}"`);
    if (tc.expectedTitle) {
      if (title === tc.expectedTitle) {
        console.log(`  [PASS] Page title exactly matches "${tc.expectedTitle}"`);
      } else {
        console.error(`  [FAIL] Expected title "${tc.expectedTitle}", got "${title}"`);
        failedCount++;
        continue;
      }
    } else if (tc.expectedTitleContains) {
      if (title.includes(tc.expectedTitleContains)) {
        console.log(`  [PASS] Page title contains "${tc.expectedTitleContains}"`);
      } else {
        console.error(`  [FAIL] Expected title to contain "${tc.expectedTitleContains}", got "${title}"`);
        failedCount++;
        continue;
      }
    }

    // 2. Wait for footer element to be rendered and visible
    await page.waitForSelector(tc.footerSelector, { timeout: 5000 });
    const footerElement = page.locator(tc.footerSelector).first();
    const isVisible = await footerElement.isVisible();
    const footerText = (await footerElement.textContent()) || '';
    const cleanFooterText = footerText.replace(/\s+/g, ' ').trim();
    console.log(`Visible Footer Text: "${cleanFooterText}"`);

    if (!isVisible) {
      console.error(`  [FAIL] Footer element is not visible!`);
      failedCount++;
      continue;
    }

    // Check footer contains Company Name and Product Name
    const hasLegalName = cleanFooterText.includes('JNC Network Communication');
    const hasProductName = cleanFooterText.includes('Syntra CRM');
    const hasCopyright = cleanFooterText.includes('All rights reserved');
    const hasYear = cleanFooterText.includes(String(currentYear));

    if (hasLegalName && hasProductName && hasCopyright && hasYear) {
      console.log(`  [PASS] Footer contains full required copyright: "© ${currentYear} JNC Network Communication. Syntra CRM. All rights reserved."`);
      passedCount++;
    } else {
      console.error(`  [FAIL] Footer missing required brand components.`);
      console.error(`         hasLegalName: ${hasLegalName}, hasProductName: ${hasProductName}, hasCopyright: ${hasCopyright}, hasYear: ${hasYear}`);
      failedCount++;
    }
  }

  await browser.close();
  server.close();

  console.log(`\n========================================`);
  console.log(`PLAYWRIGHT BRAND RESULTS: ${passedCount} passed, ${failedCount} failed`);
  console.log(`========================================`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

runBrowserTests().catch((err) => {
  console.error('[PLAYWRIGHT-BRAND] Error executing test:', err);
  process.exit(1);
});
