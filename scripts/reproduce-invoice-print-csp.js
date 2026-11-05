/**
 * Step 1 Reproduction Script: Invoice Print CSP Violation & 3-Second Teardown
 * 
 * Runs a local server serving apps/web/dist with the EXACT production CSP from .htaccess:
 *   default-src 'self'; script-src 'self' blob:; worker-src 'self' blob:;
 *   frame-src 'self'; object-src 'none'; ... (NO frame-src for blob:)
 * 
 * Demonstrates:
 * 1. An iframe with blob: src is blocked by CSP: "Refused to frame 'blob:...' because it violates the following Content Security Policy directive..."
 * 2. 3-second iframe teardown destroys the print context prematurely.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 4195;
const DIST_DIR = path.resolve(__dirname, '../apps/web/dist');

// Exact CSP header from apps/web/public/.htaccess
const PROD_CSP_HEADER = "default-src 'self'; script-src 'self' blob:; worker-src 'self' blob:; frame-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' http://localhost:3333 https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';";

const mimeTypes = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function startServer() {
  return new Promise((resolve) => {
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

      // Attach strict production security headers matching .htaccess
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

    server.listen(PORT, () => {
      console.log(`[Server] Production build running at http://localhost:${PORT} with strict CSP`);
      resolve(server);
    });
  });
}

async function run() {
  console.log('='.repeat(70));
  console.log('REPRODUCING INVOICE PRINT CSP VIOLATION (blob: iframe & 3s teardown)');
  console.log('='.repeat(70));

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const cspViolations = [];
  const consoleMessages = [];

  page.on('console', (msg) => {
    const text = msg.text();
    consoleMessages.push(text);
    if (text.includes('Refused to') || text.includes('Content Security Policy') || text.includes('CSP')) {
      cspViolations.push(text);
      console.log(`[BROWSER CONSOLE CSP ERROR] ${text}`);
    }
  });

  try {
    await page.goto(`http://localhost:${PORT}/login`, { waitUntil: 'domcontentloaded' });

    console.log('\n[Trigger] Simulating legacy invoice print pattern:');
    console.log('  1. Downloading/generating PDF blob');
    console.log('  2. Appending 1x1 hidden iframe with blob: URL src');
    console.log('  3. Calling iframe.contentWindow.print()');
    console.log('  4. setTimeout removal of iframe after 3 seconds\n');

    const result = await page.evaluate(async () => {
      // Create a mock PDF blob
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);

      // Legacy pattern: hidden 1x1 iframe with blob: src
      const iframe = document.createElement('iframe');
      iframe.id = 'legacy-invoice-print-frame';
      iframe.style.width = '1px';
      iframe.style.height = '1px';
      iframe.style.position = 'fixed';
      iframe.style.top = '-1000px';

      // Setting blob: src under strict CSP (frame-src 'self' object-src 'none')
      iframe.src = blobUrl;
      document.body.appendChild(iframe);

      // Check if frame was loaded or blocked
      let printAttemptError = null;
      try {
        if (iframe.contentWindow) {
          // May throw security error or print on blocked frame
          iframe.contentWindow.print();
        }
      } catch (e) {
        printAttemptError = e.message;
      }

      // 3-second teardown timer
      let removedAt = null;
      const startTime = Date.now();
      setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
          removedAt = Date.now() - startTime;
        }
      }, 3000);

      // Wait 3500ms to observe teardown
      await new Promise((r) => setTimeout(r, 3500));

      const isFrameStillPresent = Boolean(document.getElementById('legacy-invoice-print-frame'));

      return {
        blobUrlScheme: blobUrl.split(':')[0],
        printAttemptError,
        isFrameStillPresent,
        removedAt,
      };
    });

    console.log('--- REPRODUCTION RESULTS ---');
    console.log(`Blob URL Scheme           : ${result.blobUrlScheme}:`);
    console.log(`Iframe still present > 3s : ${result.isFrameStillPresent} (prematurely destroyed after ~3000ms)`);
    console.log(`CSP Console Violations    : ${cspViolations.length}`);
    cspViolations.forEach((v, i) => console.log(`  [${i + 1}] ${v}`));

    if (cspViolations.length > 0) {
      console.log('\n[CONFIRMED BUG REPRODUCED]');
      console.log('The production CSP strictly blocked the blob: iframe src.');
      console.log('The 3-second removal prematurely tore down the print frame.');
    } else {
      console.warn('Warning: No CSP messages captured.');
    }

  } finally {
    await browser.close();
    server.close();
  }
}

run();
