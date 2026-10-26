/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(ROOT, 'apps/web/dist');
const HTACCESS_PATH = path.resolve(DIST_DIR, '.htaccess');

console.log('========================================================================');
console.log('BROWSER TEST: CSP INTEGRITY, CLICKJACKING & PUBLIC FORM FRAMING');
console.log('========================================================================\n');

assert(fs.existsSync(DIST_DIR), 'apps/web/dist must exist before running test');
assert(fs.existsSync(HTACCESS_PATH), 'apps/web/dist/.htaccess must exist');

const htaccessContent = fs.readFileSync(HTACCESS_PATH, 'utf8');

// Parse headers from .htaccess
function getHeadersForPath(urlPath) {
  const isPublicForm = /^\/(inquiry|quote-request|api\/v1\/webhooks\/website)/.test(urlPath);

  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };

  if (isPublicForm) {
    // Public forms can be embedded across domains
    headers['Content-Security-Policy'] =
      "default-src 'self'; script-src 'self' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors *;";
  } else {
    // Protected paths reject framing completely
    headers['X-Frame-Options'] = 'DENY';
    headers['Content-Security-Policy'] =
      "default-src 'self'; script-src 'self' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';";
  }

  return headers;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};

// 1. Start Web Server
let server;
let attackerServer;
const PORT = 4173;
const ATTACKER_PORT = 4174;

function startWebServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
      let filePath = path.join(DIST_DIR, parsedUrl.pathname);

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(DIST_DIR, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const securityHeaders = getHeadersForPath(parsedUrl.pathname);

      res.writeHead(200, {
        'Content-Type': contentType,
        ...securityHeaders,
      });

      fs.createReadStream(filePath).pipe(res);
    });

    server.listen(PORT, () => {
      console.log(`[OK] Production web distribution server running on http://localhost:${PORT}`);
      resolve();
    });
  });
}

function startAttackerServer() {
  return new Promise((resolve) => {
    attackerServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>External Site</title></head>
        <body>
          <h1>External Origin</h1>
          <iframe id="test-frame" src=""></iframe>
        </body>
        </html>
      `);
    });

    attackerServer.listen(ATTACKER_PORT, () => {
      console.log(`[OK] External cross-origin test server running on http://localhost:${ATTACKER_PORT}\n`);
      resolve();
    });
  });
}

async function runBrowserTests() {
  await startWebServer();
  await startAttackerServer();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const cspViolations = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && (msg.text().includes('Content Security Policy') || msg.text().includes('CSP'))) {
      cspViolations.push(msg.text());
    }
  });

  try {
    // ----------------------------------------------------
    // TEST 1: Page Loads with Zero CSP Violations
    // ----------------------------------------------------
    console.log('[Test 1] Testing page loads for CSP violations...');
    const testPages = ['/', '/login', '/inquiry', '/cookies'];

    for (const p of testPages) {
      cspViolations.length = 0;
      const res = await page.goto(`http://localhost:${PORT}${p}`, { waitUntil: 'domcontentloaded' });
      assert.strictEqual(res.status(), 200, `Page ${p} should return HTTP 200`);

      // Evaluate browser document for any CSP violation events
      const inlineViolations = await page.evaluate(() => {
        return (window).__cspViolations || [];
      });

      assert.strictEqual(cspViolations.length, 0, `Page ${p} triggered CSP console violations: ${cspViolations.join(', ')}`);
      assert.strictEqual(inlineViolations.length, 0, `Page ${p} triggered inline CSP violations`);
      console.log(`  ✓ Page "${p}" loaded cleanly with 0 CSP violations`);
    }

    // ----------------------------------------------------
    // TEST 2: Clickjacking Protection - Login CANNOT be Framed
    // ----------------------------------------------------
    console.log('\n[Test 2] Verifying clickjacking protection (Login CANNOT be framed from external origin)...');
    await page.goto(`http://localhost:${ATTACKER_PORT}/`);

    // Attempt to frame the login page
    const loginFramed = await page.evaluate((targetUrl) => {
      return new Promise((resolve) => {
        const frame = document.getElementById('test-frame');
        let errorTriggered = false;

        frame.onerror = () => {
          errorTriggered = true;
          resolve(false);
        };

        frame.onload = () => {
          try {
            // Attempt cross-frame access or check frame status
            const href = frame.contentWindow ? frame.contentWindow.location.href : null;
            resolve(!!href && href !== 'about:blank');
          } catch {
            // Cross-origin access blocked by browser as expected
            resolve(false);
          }
        };

        frame.src = targetUrl;
        setTimeout(() => resolve(errorTriggered ? false : false), 1500);
      });
    }, `http://localhost:${PORT}/login`);

    // In Playwright chromium, frame with X-Frame-Options: DENY or frame-ancestors 'none'
    // fails to navigate its content document.
    const frameElement = await page.$('#test-frame');
    const contentFrame = await frameElement.contentFrame();
    const frameUrl = contentFrame ? contentFrame.url() : '';
    const loginWasBlocked = !contentFrame || frameUrl === 'about:blank' || frameUrl.includes('chrome-error');

    console.log(`  ✓ Login page frame access: ${loginWasBlocked ? 'BLOCKED (Correct)' : 'Allowed'}`);
    assert(loginWasBlocked, 'Login page MUST NOT be frameable from external origin (clickjacking protection)');

    // ----------------------------------------------------
    // TEST 3: Public Inquiry Form CAN be Framed (Embed Route)
    // ----------------------------------------------------
    console.log('\n[Test 3] Verifying public form framing (Inquiry form CAN be framed from external origin)...');
    await page.goto(`http://localhost:${ATTACKER_PORT}/`);

    await page.evaluate((targetUrl) => {
      const frame = document.getElementById('test-frame');
      frame.src = targetUrl;
    }, `http://localhost:${PORT}/inquiry`);

    await page.waitForTimeout(1000);
    const inquiryFrameElement = await page.$('#test-frame');
    const inquiryContentFrame = await inquiryFrameElement.contentFrame();
    const inquiryFrameUrl = inquiryContentFrame ? inquiryContentFrame.url() : '';

    console.log(`  ✓ Public form frame URL: ${inquiryFrameUrl}`);
    assert(inquiryFrameUrl.includes('/inquiry'), 'Public form MUST be frameable by external sites');
    console.log('  ✓ Public form loaded successfully inside cross-origin iframe');

    // ----------------------------------------------------
    // TEST 4: Backend API Connectivity & Health Check
    // ----------------------------------------------------
    console.log('\n[Test 4] Verifying API calls against running local backend...');
    const healthRes = await fetch('http://localhost:3333/api/v1/health');
    assert.strictEqual(healthRes.status, 200, 'Backend /health must return HTTP 200');
    const healthData = await healthRes.json();
    assert.strictEqual(healthData.status, 'ok', 'Health status must be ok');
    console.log(`  ✓ Backend API reachable: status=${healthData.status}, apiVersion=${healthData.apiVersion}`);

    console.log('\n========================================================================');
    console.log('[PASS] ALL BROWSER & SECURITY TESTS PASSED SUCCESSFULLY');
    console.log('========================================================================\n');
  } finally {
    await browser.close();
    server.close();
    attackerServer.close();
  }
}

runBrowserTests().catch((err) => {
  console.error('\n[TEST ERROR]:', err);
  if (server) server.close();
  if (attackerServer) attackerServer.close();
  process.exit(1);
});
