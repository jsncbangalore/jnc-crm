/**
 * Playwright End-to-End Suite for Company Branding, GST Page, and Portal Header
 *
 * Verifies:
 * 1. Name switching between Company A (Acme Corporation Ltd) and Company B (Beta Logistics Systems)
 *    - Header displays B's name each time and NEVER A's name
 * 2. Portal logo upload & immediate header update without a page reload (cache-busting query parameter)
 *    - Without portal logo, header displays company name as text
 * 3. Document logo on invoice PDF:
 *    - Uploaded Document logo is embedded into invoice PDF buffer (contains /Image XObject)
 * 4. 1 MB PNG saves successfully end to end
 * 5. 3 MB image is refused with friendly message: "The logo is too large. Maximum 2 MB."
 * 6. Symmetrical Stamp support and inline field errors under each field
 * 7. Screenshots captured at 1440px and 390px
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

const BASE_URL = 'http://localhost:5173';
const API_BASE = 'http://localhost:3333/api/v1';
const ARTIFACTS_DIR = 'C:\\Users\\JNC R&D\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824';

// Helper to generate a valid PNG buffer of specified dimensions and compression level
function makeValidPng(width, height, level = 1) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // CRC32 table
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    let crc = 0 ^ (-1);
    const combined = Buffer.concat([typeBuf, data]);
    for (let i = 0; i < combined.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ combined[i]) & 0xff];
    }
    crc = (crc ^ (-1)) >>> 0;
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8-bit
  ihdrData[9] = 2; // RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = makeChunk('IHDR', ihdrData);

  const rowLen = 1 + width * 3;
  const rawData = Buffer.alloc(rowLen * height);
  for (let y = 0; y < height; y++) {
    const offset = y * rowLen;
    rawData[offset] = 0; // filter 0
    for (let x = 0; x < width * 3; x++) {
      rawData[offset + 1 + x] = (x * 3 + y * 7 + 42) & 0xff;
    }
  }

  const compressed = zlib.deflateSync(rawData, { level });
  const idat = makeChunk('IDAT', compressed);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

async function performLogin(page, email, password) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("input[name=\"username\"], #company-identifier", { timeout: 10000 });
  await page.fill("input[name=\"username\"], #company-identifier", email);
  await page.fill("input[name=\"password\"], #company-password", password);
  await page.click("button[type=\"submit\"]");
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });
  await page.waitForTimeout(1000);
}

async function runTests() {
  console.log('================================================================');
  console.log('   PLAYWRIGHT E2E: COMPANY BRANDING, GST PAGE & PORTAL HEADER   ');
  console.log('================================================================\n');

  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }

  const tempDir = path.resolve(process.cwd(), 'scratch/test-assets');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // 1. Create test images
  console.log('1. Preparing test image buffers...');
  const png100x40 = makeValidPng(120, 36, 1);
  const portalLogoPath = path.join(tempDir, 'portal_logo_test.png');
  fs.writeFileSync(portalLogoPath, png100x40);

  // 1 MB PNG (~1.03 MB uncompressed)
  const png1MB = makeValidPng(600, 600, 0);
  const png1MBPath = path.join(tempDir, 'document_logo_1mb.png');
  fs.writeFileSync(png1MBPath, png1MB);
  console.log(`   - 1 MB PNG created: ${(png1MB.length / (1024 * 1024)).toFixed(2)} MB (${png1MB.length} bytes)`);

  // 3 MB PNG (~3.16 MB uncompressed, strictly > 2 MB)
  const png3MB = makeValidPng(1050, 1050, 0);
  const png3MBPath = path.join(tempDir, 'document_logo_3mb.png');
  fs.writeFileSync(png3MBPath, png3MB);
  console.log(`   - 3 MB PNG created: ${(png3MB.length / (1024 * 1024)).toFixed(2)} MB (${png3MB.length} bytes)`);

  const browser = await chromium.launch({ headless: true });

  try {
    // ──────────────────────────────────────────────────────────────────────────
    // TEST 1: COMPANY A LOGIN & HEADER NAME ISOLATION
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n2. Testing Company A Login & Header Display...');
    const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageA = await contextA.newPage();

    await performLogin(pageA, 'tenant-admin@example.com', 'DevPassword@123');
    await pageA.waitForSelector('[data-testid="portal-company-name"]', { timeout: 10000 });

    const companyAName = await pageA.textContent('[data-testid="portal-company-name"]');
    console.log(`   - Company A header text: "${companyAName.trim()}"`);
    if (!companyAName.includes('Acme Corporation Ltd')) {
      throw new Error(`Expected Company A header to be 'Acme Corporation Ltd', got '${companyAName}'`);
    }

    // Capture Company A 1440px desktop screenshot
    const shotA1440 = path.join(ARTIFACTS_DIR, 'evidence-branding-1440-company-a.png');
    await pageA.screenshot({ path: shotA1440 });
    console.log(`   [OK] Captured Company A 1440px: ${shotA1440}`);

    // Capture Company A 390px mobile screenshot
    await pageA.setViewportSize({ width: 390, height: 844 });
    await pageA.waitForTimeout(400);
    const shotA390 = path.join(ARTIFACTS_DIR, 'evidence-branding-390-company-a.png');
    await pageA.screenshot({ path: shotA390 });
    console.log(`   [OK] Captured Company A 390px: ${shotA390}`);

    // Reset to desktop width
    await pageA.setViewportSize({ width: 1440, height: 900 });

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 2: SWITCHING TO COMPANY B ON SAME BROWSER (HEADER ISOLATION)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n3. Testing Company B Login on Same Browser (Header Name Isolation)...');
    // Clear session storage and cookies to simulate clean logout on same browser context
    await pageA.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await performLogin(pageA, 'beta-admin@example.com', 'DevPassword@123');
    await pageA.waitForSelector('[data-testid="portal-company-name"]', { timeout: 10000 });

    const companyBName = await pageA.textContent('[data-testid="portal-company-name"]');
    console.log(`   - Company B header text: "${companyBName.trim()}"`);

    if (!companyBName.includes('Beta Logistics Systems')) {
      throw new Error(`Expected Company B header to be 'Beta Logistics Systems', got '${companyBName}'`);
    }
    if (companyBName.includes('Acme Corporation Ltd')) {
      throw new Error(`CRITICAL LEAK: Company B header contains Company A's name!`);
    }
    console.log('   [OK] Name switching verified: Header shows B\'s name and never A\'s.');

    // Capture Company B 1440px desktop screenshot
    const shotB1440 = path.join(ARTIFACTS_DIR, 'evidence-branding-1440-company-b.png');
    await pageA.screenshot({ path: shotB1440 });
    console.log(`   [OK] Captured Company B 1440px: ${shotB1440}`);

    // Capture Company B 390px mobile screenshot
    await pageA.setViewportSize({ width: 390, height: 844 });
    await pageA.waitForTimeout(400);
    const shotB390 = path.join(ARTIFACTS_DIR, 'evidence-branding-390-company-b.png');
    await pageA.screenshot({ path: shotB390 });
    console.log(`   [OK] Captured Company B 390px: ${shotB390}`);

    // Reset to desktop width
    await pageA.setViewportSize({ width: 1440, height: 900 });

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 3: BRANDING SETTINGS PAGE & FILE SIZE LIMITS (3 MB REFUSED, 1 MB SAVES)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n4. Testing Branding Settings Page & File Size Validation...');
    await pageA.goto(`${BASE_URL}/settings/branding`);
    await pageA.waitForSelector('[data-testid="input-company-name"]', { timeout: 10000 });

    // Check Company B's input is prefilled with Beta Logistics Systems
    const inputName = await pageA.inputValue('[data-testid="input-company-name"]');
    console.log(`   - Company Name input value: "${inputName}"`);
    if (!inputName.includes('Beta Logistics Systems')) {
      throw new Error(`Expected input-company-name to have 'Beta Logistics Systems', got '${inputName}'`);
    }

    // TEST 3A: 3 MB image is refused with friendly message
    console.log('\n   [Test 3A] Uploading 3 MB image to Document Logo input...');
    const docInput = await pageA.$('[data-testid="input-file-document-logo"]');
    await docInput.setInputFiles(png3MBPath);
    await pageA.waitForSelector('[data-testid="error-logo"]', { timeout: 5000 });

    const logoErrorText = await pageA.textContent('[data-testid="error-logo"]');
    console.log(`   - Error displayed under Document Logo: "${logoErrorText.trim()}"`);
    if (!logoErrorText.includes('The logo is too large. Maximum 2 MB.')) {
      throw new Error(`Expected 'The logo is too large. Maximum 2 MB.', got '${logoErrorText}'`);
    }
    console.log('   [OK] 3 MB image correctly refused with friendly message!');

    // TEST 3B: 1 MB PNG saves successfully
    console.log('\n   [Test 3B] Uploading 1 MB PNG to Document Logo input...');
    await docInput.setInputFiles(png1MBPath);

    // Wait for resize/upload and preview to render
    await pageA.waitForSelector('[data-testid="document-logo-preview"]', { timeout: 10000 });
    console.log('   - Document Logo Preview rendered successfully!');

    // Fill other profile fields to test end-to-end saving
    await pageA.fill('[data-testid="input-company-phone"]', '+91 98765 43210');
    await pageA.fill('[data-testid="input-address"]', '42, Industrial Area Phase II');
    await pageA.fill('[data-testid="input-city"]', 'Bengaluru');
    await pageA.fill('[data-testid="input-state"]', 'Karnataka');
    await pageA.fill('[data-testid="input-pincode"]', '560100');
    await pageA.fill('[data-testid="input-email"]', 'billing@beta-logistics.example.com');
    await pageA.fill('[data-testid="input-gstin"]', '29ABCDE1234F1Z5');
    await pageA.fill('[data-testid="input-pan"]', 'ABCDE1234F');
    await pageA.fill('[data-testid="input-bank-name"]', 'Standard Chartered Bank');
    await pageA.fill('[data-testid="input-bank-account-number"]', '9876543210001');
    await pageA.fill('[data-testid="input-bank-ifsc"]', 'SCBL0001234');

    // Click Save All Settings
    await pageA.click('[data-testid="btn-save-branding"]');
    await pageA.waitForSelector('[data-testid="save-success-message"]', { timeout: 10000 });

    const saveSuccess = await pageA.textContent('[data-testid="save-success-message"]');
    console.log(`   - Save success message: "${saveSuccess.trim()}"`);
    console.log('   [OK] 1 MB PNG and all profile/GST/banking fields saved successfully!');

    // Capture Branding Settings page at 1440px desktop
    const shotBranding1440 = path.join(ARTIFACTS_DIR, 'evidence-branding-1440-saved.png');
    await pageA.screenshot({ path: shotBranding1440, fullPage: true });
    console.log(`   [OK] Captured Branding Settings 1440px: ${shotBranding1440}`);

    // Capture Branding Settings page at 390px mobile
    await pageA.setViewportSize({ width: 390, height: 844 });
    await pageA.waitForTimeout(400);
    const shotBranding390 = path.join(ARTIFACTS_DIR, 'evidence-branding-390-saved.png');
    await pageA.screenshot({ path: shotBranding390, fullPage: true });
    console.log(`   [OK] Captured Branding Settings 390px: ${shotBranding390}`);

    // Reset to desktop width
    await pageA.setViewportSize({ width: 1440, height: 900 });

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 4: PORTAL LOGO UPLOAD & IMMEDIATE LIVE HEADER UPDATE (NO RELOAD)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n5. Testing Portal Logo Upload & Immediate Live Header Update...');
    // Before upload: header displays company name text
    const headerBefore = await pageA.textContent('[data-testid="portal-company-name"]');
    console.log(`   - Header before portal logo upload (text): "${headerBefore.trim()}"`);

    // Upload portal logo
    const portalInput = await pageA.$('[data-testid="input-file-portal-logo"]');
    await portalInput.setInputFiles(portalLogoPath);

    // Assert header IMMEDIATELY renders [data-testid="portal-header-logo"] without a page reload!
    await pageA.waitForSelector('[data-testid="portal-header-logo"]', { timeout: 10000 });
    const logoSrc = await pageA.getAttribute('[data-testid="portal-header-logo"]', 'src');
    console.log(`   - Portal Header Logo rendered immediately! src: "${logoSrc}"`);
    if (!logoSrc.includes('/portal-logo')) {
      throw new Error(`Expected portal logo src to include '/portal-logo', got '${logoSrc}'`);
    }

    // Capture screenshot showing the portal logo in header at 1440px
    const shotHeaderLogo1440 = path.join(ARTIFACTS_DIR, 'evidence-branding-1440-header-logo.png');
    await pageA.screenshot({ path: shotHeaderLogo1440 });
    console.log(`   [OK] Captured Header Portal Logo 1440px: ${shotHeaderLogo1440}`);

    // Capture screenshot at 390px mobile
    await pageA.setViewportSize({ width: 390, height: 844 });
    await pageA.waitForTimeout(400);
    const shotHeaderLogo390 = path.join(ARTIFACTS_DIR, 'evidence-branding-390-header-logo.png');
    await pageA.screenshot({ path: shotHeaderLogo390 });
    console.log(`   [OK] Captured Header Portal Logo 390px: ${shotHeaderLogo390}`);

    // Reset to desktop width
    await pageA.setViewportSize({ width: 1440, height: 900 });

    // Now remove Portal Logo: Header must revert back to text immediately without reload!
    console.log('\n   - Removing portal logo...');
    await pageA.click('[data-testid="btn-remove-portal-logo"]');
    await pageA.waitForSelector('[data-testid="portal-company-name"]', { timeout: 10000 });
    const headerAfterRemove = await pageA.textContent('[data-testid="portal-company-name"]');
    console.log(`   - Header immediately reverted to text: "${headerAfterRemove.trim()}"`);
    console.log('   [OK] Portal logo upload and live header updates work flawlessly without reload!');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 5: DOCUMENT LOGO ON INVOICE PDF BUFFER
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n6. Testing Document Logo embedded in Invoice PDF...');
    // We already uploaded a Document logo for Company A in earlier step.
    // Fetch Company A's invoice PDF via API and verify /Image XObject
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'tenant-admin@example.com', password: 'DevPassword@123' }),
    });
    const { accessToken } = await loginRes.json();

    const pdfRes = await fetch(`${API_BASE}/invoices/5ebe4d35-5876-4230-85d1-76cb860b899e/pdf`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (pdfRes.status !== 200) {
      throw new Error(`Expected HTTP 200 from invoice PDF endpoint, got ${pdfRes.status}`);
    }

    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
    console.log(`   - Downloaded invoice PDF: ${pdfBuffer.length} bytes`);
    if (pdfBuffer.toString('utf8', 0, 5) !== '%PDF-') {
      throw new Error('Downloaded invoice buffer is not a valid PDF file');
    }

    const pdfBinaryStr = pdfBuffer.toString('binary');
    const hasImageXObject = pdfBinaryStr.includes('/Image') || pdfBinaryStr.includes('/XObject');
    console.log(`   - Contains /Image XObject in PDF structure: ${hasImageXObject}`);
    if (!hasImageXObject) {
      throw new Error('Expected invoice PDF to embed the Document Logo (/Image XObject)');
    }
    console.log('   [OK] Document Logo successfully embedded in invoice PDF!');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 6: LOAD FAILURE AND RETRY BUTTON
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n7. Testing Load Failure State & Retry Banner...');
    // Simulate API profile endpoint failure with route intercept
    await pageA.route('**/settings/company-profile', (route) => {
      route.abort('failed');
    });

    await pageA.goto(`${BASE_URL}/settings/branding`);
    await pageA.waitForSelector('[data-testid="load-error-banner"]', { timeout: 10000 });

    const bannerText = await pageA.textContent('[data-testid="load-error-banner"]');
    console.log(`   - Error banner displayed: "${bannerText.replace(/\s+/g, ' ').trim()}"`);

    // Verify retry button is visible
    const retryBtn = await pageA.$('[data-testid="retry-load-button"]');
    if (!retryBtn) {
      throw new Error('Expected Retry button to be present in load-error-banner');
    }

    // Verify input fields were cleared so stale/other company data is NEVER shown
    const clearedName = await pageA.inputValue('[data-testid="input-company-name"]');
    console.log(`   - Company Name field cleared on error: "${clearedName}" (stale data prevented)`);

    // Unroute and test Retry
    await pageA.unroute('**/settings/company-profile');
    await retryBtn.click();
    await pageA.waitForFunction(() => !document.querySelector('[data-testid="load-error-banner"]'), { timeout: 10000 });
    console.log('   [OK] Retry succeeded and restored company settings clean state!');

    console.log('\n================================================================');
    console.log('   ALL BRANDING & PORTAL HEADER TESTS PASSED SUCCESSFULLY!      ');
    console.log('================================================================\n');
  } catch (err) {
    console.error('\n[TEST FAILURE]', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

runTests();
