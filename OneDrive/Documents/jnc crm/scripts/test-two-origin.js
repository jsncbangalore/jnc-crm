/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const axios = require('axios');

const REPO_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(REPO_ROOT, 'apps/web/dist');
const WEB_PORT = 4173;
const API_PORT = 3333;
const API_URL = `http://localhost:${API_PORT}/api/v1`;

async function main() {
  console.log('========================================================================');
  console.log('TEST 1: TWO-ORIGIN TOPOLOGY PLAYWRIGHT VERIFICATION');
  console.log(`Web Origin (A): http://localhost:${WEB_PORT}`);
  console.log(`API Origin (B): http://localhost:${API_PORT} (Base: ${API_URL})`);
  console.log('Mode: Real separate HTTP origins (No Vite Proxy)');
  console.log('========================================================================\n');

  if (!fs.existsSync(DIST_DIR)) {
    throw new Error(`Web dist directory not found at ${DIST_DIR}. Run build first.`);
  }

  // 1. Verify API server is reachable
  console.log('[1/5] Verifying API Server health on Origin B ...');
  try {
    const res = await axios.get(`${API_URL}/settings/branding`, { timeout: 4000 });
    console.log(` -> API Server responding: HTTP ${res.status}`);
    console.log(` -> Branding Logo URL: ${res.data.companyLogoUrl}`);
  } catch (err) {
    throw new Error(`API server on http://localhost:${API_PORT} is not responding: ${err.message}`);
  }

  // 2. Start static HTTP server for Origin A
  console.log(`\n[2/5] Starting static server for Origin A on http://localhost:${WEB_PORT} ...`);
  const mimeTypes = {
    '.html': 'text/html; charset=UTF-8',
    '.js': 'application/javascript; charset=UTF-8',
    '.css': 'text/css; charset=UTF-8',
    '.json': 'application/json; charset=UTF-8',
    '.svg': 'image/svg+xml',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
  };

  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://localhost:${WEB_PORT}`);
    let reqPath = parsedUrl.pathname;
    let filePath = path.join(DIST_DIR, reqPath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    const isHtml = reqPath === '/' || reqPath.endsWith('.html') || !fs.existsSync(filePath);

    if (isHtml) {
      filePath = path.join(DIST_DIR, 'index.html');
      let html = fs.readFileSync(filePath, 'utf8');
      // Augment CSP meta tag for two-origin local testing against Origin B (port 3333)
      html = html.replace(
        "connect-src 'self' https://api.jsnc.co.in;",
        "connect-src 'self' http://localhost:3333 https://api.jsnc.co.in;"
      );
      html = html.replace(
        "img-src 'self' data: blob: https://api.jsnc.co.in;",
        "img-src 'self' data: blob: http://localhost:3333 https://api.jsnc.co.in;"
      );
      res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
      return res.end(html);
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    try {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    } catch {
      res.writeHead(500);
      res.end('Error loading asset');
    }
  });

  await new Promise((resolve) => server.listen(WEB_PORT, resolve));
  console.log(` -> Web bundle served at http://localhost:${WEB_PORT}`);

  // 3. Launch Playwright
  console.log('\n[3/5] Launching Playwright Chromium ...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem('jnc_origin_b', '3333');
      window.__ORIGIN_B__ = true;
    } catch {}
  });
  const page = await context.newPage();

  const consoleLogs = [];
  const cspErrors = [];
  const networkRequests = [];

  page.on('console', (msg) => {
    const text = msg.text();
    consoleLogs.push({ type: msg.type(), text });
    if (
      text.toLowerCase().includes('violates the following content security policy') ||
      (text.toLowerCase().includes('content security policy') && text.toLowerCase().includes('blocked'))
    ) {
      cspErrors.push(text);
    }
  });

  page.on('pageerror', (err) => {
    console.error(' [PAGE ERROR]', err.message);
  });

  page.on('request', (req) => {
    networkRequests.push({ url: req.url(), method: req.method() });
  });

  // Check 1: Direct unauthenticated request to private document must return 401
  console.log('\n[4/5] Executing Verification Assertions ...');
  console.log(' -> Check A: Unauthenticated request for private document ...');
  let unauthStatus = 0;
  try {
    const unauthRes = await context.request.get(
      `http://localhost:${API_PORT}/api/v1/inventory/purchase-documents/test-purchase-invoice.png`
    );
    unauthStatus = unauthRes.status();
    console.log(`    Status: HTTP ${unauthStatus} (Expected: 401)`);
  } catch (err) {
    console.error('    Error making unauthenticated request:', err.message);
  }

  // Check 2: Navigate to LoginPage on Origin A and verify company logo renders from Origin B
  console.log(' -> Check B: Navigating to LoginPage (Origin A) and testing logo rendering ...');
  await page.goto(`http://localhost:${WEB_PORT}/login`, { waitUntil: 'networkidle' });

  // Locate company logo
  const logoSelector = 'img[alt="JS Network Communication"], img[alt*="JNC"]';
  await page.waitForSelector(logoSelector, { timeout: 5000 });
  const logoInfo = await page.$eval(logoSelector, (img) => ({
    src: img.src,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    complete: img.complete,
  }));

  console.log(`    Logo src:           ${logoInfo.src}`);
  console.log(`    Logo naturalWidth:  ${logoInfo.naturalWidth} px`);
  console.log(`    Logo naturalHeight: ${logoInfo.naturalHeight} px`);
  console.log(`    Logo complete:      ${logoInfo.complete}`);

  // Check 3: Staff Login
  console.log(' -> Check C: Performing staff login ...');
  await page.fill('#identifier', 'tenantadmin@jsnc.co.in');
  await page.fill('#password', 'K7#xV9$mP2!qL5*w');
  await page.click('button[type="submit"]');

  // Wait for login redirect
  await page.waitForTimeout(2500);
  console.log(`    Current page URL after login: ${page.url()}`);

  // Check 4: Navigate to Inventory and open private document preview
  console.log(' -> Check D: Navigating to /inventory and opening private purchase document ...');
  await page.goto(`http://localhost:${WEB_PORT}/inventory`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Look for "View Bill" button in the inventory table
  const viewBillBtn = page.locator('button:has-text("View Bill")').first();
  await viewBillBtn.waitFor({ state: 'visible', timeout: 6000 });
  console.log('    Found "View Bill" button, clicking to trigger authenticated blob fetch ...');
  await viewBillBtn.click();

  // Wait for modal to render document preview
  await page.waitForSelector('img[alt="GST Invoice"], iframe[title="Invoice Document"]', { timeout: 6000 });
  await page.waitForTimeout(1000);

  const previewInfo = await page.$eval('img[alt="GST Invoice"]', (img) => ({
    src: img.src,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    complete: img.complete,
  })).catch(async () => {
    // If iframe
    return await page.$eval('iframe[title="Invoice Document"]', (frame) => ({
      src: frame.src,
      isIframe: true,
    }));
  });

  console.log('    Document Preview Details:', JSON.stringify(previewInfo, null, 2));

  // Check 5: Download purchase bill
  console.log(' -> Check E: Triggering document download ...');
  const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
  await page.click('a:has-text("Download Bill")');
  const download = await downloadPromise;
  const downloadedFilename = download.suggestedFilename();
  console.log(`    Downloaded Filename: ${downloadedFilename}`);

  // Cleanup
  await browser.close();
  await new Promise((resolve) => server.close(resolve));

  console.log('\n========================================================================');
  console.log('TWO-ORIGIN VERIFICATION RESULTS SUMMARY');
  console.log('========================================================================');
  const passUnauth = unauthStatus === 401;
  const passLogo = logoInfo.naturalWidth > 0 && logoInfo.src.includes(':3333');
  const passDocBlob = previewInfo.src && previewInfo.src.startsWith('blob:');
  const passDocRender = previewInfo.naturalWidth > 0 || previewInfo.isIframe;
  const passDownload = Boolean(downloadedFilename);
  const passCsp = cspErrors.length === 0;

  console.log(`1. Unauthenticated Request Gets 401  : ${passUnauth ? 'PASS' : 'FAIL'} (HTTP ${unauthStatus})`);
  console.log(`2. Company Logo Renders (Origin B)   : ${passLogo ? 'PASS' : 'FAIL'} (naturalWidth: ${logoInfo.naturalWidth}px, src: ${logoInfo.src})`);
  console.log(`3. Private Document Uses Blob URL    : ${passDocBlob ? 'PASS' : 'FAIL'} (src: ${previewInfo.src ? previewInfo.src.slice(0, 35) + '...' : 'NONE'})`);
  console.log(`4. Private Document Renders Correctly: ${passDocRender ? 'PASS' : 'FAIL'} (naturalWidth: ${previewInfo.naturalWidth || 'N/A'}px)`);
  console.log(`5. Private Document Downloads        : ${passDownload ? 'PASS' : 'FAIL'} (filename: ${downloadedFilename})`);
  console.log(`6. CSP Violations in Console         : ${passCsp ? 'PASS (0 errors)' : `FAIL (${cspErrors.length} errors)`}`);
  console.log('========================================================================\n');

  if (!passUnauth || !passLogo || !passDocBlob || !passDocRender || !passDownload || !passCsp) {
    console.error('[FATAL] One or more two-origin tests failed!');
    process.exit(1);
  } else {
    console.log('[TWO-ORIGIN TEST PASSED COMPLETELY]');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('[FATAL TEST ERROR]', err);
  process.exit(1);
});
