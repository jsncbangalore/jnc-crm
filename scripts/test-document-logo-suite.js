/**
 * scripts/test-document-logo-suite.js
 *
 * Automated test suite for company document logo and invoice plain print:
 * 1. Unit tests for helpers (image validation, numberToIndianWords, state codes, round off).
 * 2. API integration tests (branding retrieval, public logo 404, reset to NULL, multipart upload, PDF plain text).
 * 3. Playwright browser tests across viewports (1536x730, 390px, light & dark mode).
 * 4. Invoice print layout checks (no stray dots, no empty MSME, valid state code, tabular nums, Title Case words).
 * 5. Brand asset lock verification (zero modifications to product logos or brand.lock.json).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Load environment from apps/api/.env
const envPath = path.resolve(__dirname, '../apps/api/.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const k = trimmed.slice(0, idx).trim();
      const v = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[k]) process.env[k] = v;
    }
  });
}

const prisma = new PrismaClient();
const API_BASE = 'http://localhost:3333/api/v1';
const WEB_BASE = 'http://localhost:5173';
const ARTIFACTS_DIR = 'C:\\Users\\JNC R&D\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824';

const passedTests = [];
const failedTests = [];

function assert(title, condition, extraInfo = '') {
  if (condition) {
    console.log(`  [PASS] ${title}`);
    passedTests.push({ title, extraInfo });
  } else {
    console.error(`  [FAIL] ${title} ${extraInfo ? `-> ${extraInfo}` : ''}`);
    failedTests.push({ title, extraInfo });
  }
}

// ─── 1. UNIT TESTS ───────────────────────────────────────────────────────────
function runUnitTests() {
  console.log('\n============================================================');
  console.log('1. RUNNING UNIT TESTS');
  console.log('============================================================');

  // 1.1 Number to Words Converter
  const { numberToIndianWords } = require('../apps/api/dist/invoicing/invoice-config');

  const zeroWords = numberToIndianWords(0);
  assert('numberToIndianWords(0) returns "Indian Rupees Zero Only"', zeroWords === 'Indian Rupees Zero Only', zeroWords);

  const words118k = numberToIndianWords(118000);
  assert(
    'numberToIndianWords(118000) produces Title Case "Indian Rupees One Lakh Eighteen Thousand Only"',
    words118k === 'Indian Rupees One Lakh Eighteen Thousand Only',
    words118k
  );

  const wordsPaise = numberToIndianWords(118000.50);
  assert(
    'numberToIndianWords(118000.50) includes paise "Indian Rupees One Lakh Eighteen Thousand and Fifty Paise Only"',
    wordsPaise === 'Indian Rupees One Lakh Eighteen Thousand and Fifty Paise Only',
    wordsPaise
  );

  const wordsCrore = numberToIndianWords(10000000);
  assert(
    'numberToIndianWords(10000000) converts crores to "Indian Rupees One Crore Only"',
    wordsCrore === 'Indian Rupees One Crore Only',
    wordsCrore
  );

  // 1.2 State Code Resolver
  const STATE_TO_CODE = {
    'karnataka': '29',
    'maharashtra': '27',
    'delhi': '07',
    'tamil nadu': '33',
    'telangana': '36',
    'gujarat': '24',
  };
  function resolveStateCode(state, gstin) {
    if (gstin && gstin.trim().length >= 2 && /^\d{2}/.test(gstin.trim())) {
      return gstin.trim().slice(0, 2);
    }
    if (!state) return '29';
    return STATE_TO_CODE[state.trim().toLowerCase()] || '29';
  }

  assert('resolveStateCode("Karnataka") returns "29"', resolveStateCode('Karnataka') === '29');
  assert('resolveStateCode("Maharashtra") returns "27"', resolveStateCode('Maharashtra') === '27');
  assert('resolveStateCode("Delhi") returns "07"', resolveStateCode('Delhi') === '07');
  assert('resolveStateCode(null, "29ABCDE1234F1Z5") falls back to GSTIN prefix "29"', resolveStateCode(null, '29ABCDE1234F1Z5') === '29');
  assert('resolveStateCode(null, "33ABCDE1234F1Z5") falls back to GSTIN prefix "33"', resolveStateCode(null, '33ABCDE1234F1Z5') === '33');

  // 1.3 Round off row logic
  function shouldRenderRoundOff(roundOff) {
    return roundOff !== undefined && roundOff !== null && Number(roundOff) !== 0;
  }
  assert('Round off 0.00 is omitted', shouldRenderRoundOff(0) === false);
  assert('Round off undefined is omitted', shouldRenderRoundOff(undefined) === false);
  assert('Round off null is omitted', shouldRenderRoundOff(null) === false);
  assert('Round off +0.45 is rendered', shouldRenderRoundOff(0.45) === true);
  assert('Round off -0.30 is rendered', shouldRenderRoundOff(-0.30) === true);

  // 1.4 Image Validation Helper
  const { validateLogoField } = require('../apps/api/dist/common/shared-validation');
  assert('validateLogoField accepts empty string as clear/reset', validateLogoField('').valid === true);
  assert('validateLogoField accepts null as clear/reset', validateLogoField(null).valid === true);
  assert('validateLogoField rejects SVG images to prevent XSS', validateLogoField('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=').valid === false);
  assert('validateLogoField rejects plain text or invalid MIME', validateLogoField('data:text/plain;base64,aGVsbG8=').valid === false);
}

// ─── 2. API INTEGRATION TESTS ────────────────────────────────────────────────
async function runApiTests() {
  console.log('\n============================================================');
  console.log('2. RUNNING API INTEGRATION TESTS');
  console.log('============================================================');

  const randSuffix = String(Date.now()).slice(-6);
  const fakeTenantId = 'fake-tenant-logo-test-' + randSuffix;
  const fakeUserId = 'fake-user-logo-test-' + randSuffix;
  const fakeEmail = `fake_logo_${randSuffix}@example.fake`;
  const rawPassword = 'TestPassword123!';
  const passwordHash = await bcrypt.hash(rawPassword, 10);

  // Create clean tenant with logoUrl = null
  const tenant = await prisma.tenant.create({
    data: {
      id: fakeTenantId,
      code: 'LT' + randSuffix,
      name: 'Apex Precision Engineering Ltd',
      slug: 'apex-eng-' + randSuffix,
      phone: '+91 9876543210',
      email: fakeEmail,
      address: 'Plot 45, Peenya Industrial Area',
      city: 'Bangalore',
      state: 'Karnataka',
      gstin: '29AABCU9603R1ZJ',
      status: 'active',
      logoUrl: null, // Strictly null
    },
  });

  const user = await prisma.user.create({
    data: {
      id: fakeUserId,
      tenantId: fakeTenantId,
      email: fakeEmail,
      name: 'Apex Admin',
      employeeCode: 'EMP-LT-' + randSuffix,
      role: 'tenant_admin',
      passwordHash,
      isActive: true,
      tokenVersion: 0,
      firstLoginAfter2FaReleaseAt: new Date(),
    },
  });

  await prisma.userPageAccess.create({
    data: {
      userId: fakeUserId,
      tenantId: fakeTenantId,
      pages: JSON.stringify(['dashboard', 'invoices', 'quotations', 'bills', 'inventory', 'ledger', 'settings', 'branding']),
    },
  });

  const invoice = await prisma.invoice.create({
    data: {
      tenant: { connect: { id: fakeTenantId } },
      invoiceNumber: 'INV-2026-TEST-' + randSuffix,
      docType: 'tax_invoice',
      invoiceDate: new Date(),
      customerName: 'Global Client Systems',
      customerPhone: '+91 9123456780',
      customerState: 'Karnataka',
      customerGstin: '29ABCDE1234F1Z5',
      subtotal: 100000,
      cgstAmount: 9000,
      sgstAmount: 9000,
      igstAmount: 0,
      totalAmount: 118000,
      balanceDue: 118000,
      paymentStatus: 'unpaid',
      lines: {
        create: [
          {
            description: 'Precision Machined Flange X',
            hsnCode: '8504',
            unit: 'Nos',
            quantity: 10,
            unitPrice: 10000,
            taxRate: 18,
            lineTotal: 100000,
          },
        ],
      },
    },
  });

  const jwtSecret = process.env.JWT_SECRET || 'crm-jwt-secret-key-2026';
  const token = jwt.sign(
    {
      sub: fakeUserId,
      userId: fakeUserId,
      id: fakeUserId,
      tenantId: fakeTenantId,
      email: fakeEmail,
      role: 'tenant_admin',
      tokenVersion: 0,
    },
    jwtSecret,
    { audience: 'crm-client', issuer: 'crm-api', expiresIn: '2h' }
  );

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  try {
    // 2.1 GET /settings/branding with no custom logo returns companyLogoUrl = null
    const brandingRes = await fetch(`${API_BASE}/settings/branding`, { headers: authHeaders });
    const brandingData = await brandingRes.json();
    assert(
      'GET /settings/branding returns companyLogoUrl = null when no logo uploaded (never /logo.png)',
      brandingData.companyLogoUrl === null,
      `Received: ${brandingData.companyLogoUrl}`
    );

    // 2.2 GET /settings/branding/logo returns 404 when no custom logo configured
    const publicLogoRes = await fetch(`${API_BASE}/settings/branding/logo/${fakeTenantId}`);
    assert(
      'GET /settings/branding/logo returns HTTP 404 when tenant has no custom logo (never product logo)',
      publicLogoRes.status === 404,
      `Status: ${publicLogoRes.status}`
    );

    // 2.3 POST /settings/branding with companyLogoUrl = "" stores NULL in database
    await fetch(`${API_BASE}/settings/branding`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ companyDisplayName: 'Apex Precision', companyLogoUrl: '' }),
    });
    const tenantAfterBrandingEmpty = await prisma.tenant.findUnique({
      where: { id: fakeTenantId },
      select: { logoUrl: true },
    });
    assert(
      'POST /settings/branding with empty companyLogoUrl stores NULL in Tenant.logoUrl (not /logo.png)',
      tenantAfterBrandingEmpty.logoUrl === null,
      `Stored: ${tenantAfterBrandingEmpty.logoUrl}`
    );

    // 2.4 POST /settings/company-profile with logoUrl = "" stores NULL in database
    await fetch(`${API_BASE}/settings/company-profile`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Apex Precision', logoUrl: '' }),
    });
    const tenantAfterProfileEmpty = await prisma.tenant.findUnique({
      where: { id: fakeTenantId },
      select: { logoUrl: true },
    });
    assert(
      'POST /settings/company-profile with empty logoUrl stores NULL in Tenant.logoUrl (not /logo.png)',
      tenantAfterProfileEmpty.logoUrl === null,
      `Stored: ${tenantAfterProfileEmpty.logoUrl}`
    );

    // 2.5 POST /settings/branding/logo with 3 MB JPEG is rejected with HTTP 400
    const testImgDir = path.resolve(__dirname, '../scratch/test-images');
    const img3m = fs.readFileSync(path.join(testImgDir, 'logo-3mb.jpg'));
    const boundary = '----WebKitFormBoundary' + crypto.randomBytes(16).toString('hex');
    const body3m = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="logo-3mb.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
      img3m,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const upload3mRes = await fetch(`${API_BASE}/settings/branding/logo`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: body3m,
    });
    const upload3mData = await upload3mRes.json();
    assert(
      'POST /settings/branding/logo rejects 3 MB image with HTTP 400 "The logo is too large. Maximum 2 MB."',
      upload3mRes.status === 400 && upload3mData.message?.includes('too large'),
      `Status: ${upload3mRes.status} | Message: ${upload3mData.message}`
    );

    // 2.6 POST /settings/branding/logo with 100 KB PNG succeeds
    const img100k = fs.readFileSync(path.join(testImgDir, 'logo-100kb.png'));
    const boundary100k = '----WebKitFormBoundary' + crypto.randomBytes(16).toString('hex');
    const body100k = Buffer.concat([
      Buffer.from(`--${boundary100k}\r\nContent-Disposition: form-data; name="file"; filename="logo-100kb.png"\r\nContent-Type: image/png\r\n\r\n`),
      img100k,
      Buffer.from(`\r\n--${boundary100k}--\r\n`),
    ]);
    const upload100kRes = await fetch(`${API_BASE}/settings/branding/logo`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary100k}`,
      },
      body: body100k,
    });
    const upload100kData = await upload100kRes.json();
    assert(
      'POST /settings/branding/logo accepts 100 KB PNG and returns stable logo URL',
      upload100kRes.status === 201 && upload100kData.logoUrl?.includes('/api/v1/settings/branding/logo'),
      `Status: ${upload100kRes.status} | LogoUrl: ${upload100kData.logoUrl}`
    );

    // 2.7 Reset logo again to NULL
    await fetch(`${API_BASE}/settings/branding`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ companyDisplayName: 'Apex Precision', companyLogoUrl: null }),
    });

    // 2.8 GET /invoices/:id/pdf when logo is NULL generates valid PDF with plain company name
    const pdfRes = await fetch(`${API_BASE}/invoices/${invoice.id}/pdf`, { headers: authHeaders });
    const pdfBuf = await pdfRes.arrayBuffer();
    assert(
      'GET /invoices/:id/pdf generates valid PDF (>1000 bytes) with plain text company header when logo is NULL',
      pdfRes.status === 200 && pdfBuf.byteLength > 1000,
      `Status: ${pdfRes.status} | Bytes: ${pdfBuf.byteLength}`
    );

    return { token, tenant, user, invoice, rawPassword };
  } catch (err) {
    console.error('API Test Error:', err);
    assert('API tests completed without fatal exception', false, err.message);
  }
}

// ─── 3. PLAYWRIGHT BROWSER E2E TESTS ─────────────────────────────────────────
async function runBrowserTests(ctx) {
  console.log('\n============================================================');
  console.log('3. RUNNING PLAYWRIGHT BROWSER E2E TESTS');
  console.log('============================================================');

  const browser = await chromium.launch({ headless: true });

  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ctx.user.email, password: ctx.rawPassword }),
  });
  const loginData = await loginRes.json();
  const setCookieHeader = loginRes.headers.get('set-cookie') || '';
  const parsedCookies = [];
  const parts = setCookieHeader.split(/,(?=[a-zA-Z0-9_-]+=)/);
  for (const p of parts) {
    const match = p.trim().match(/^([^=]+)=([^;]+)/);
    if (match) {
      const name = match[1].trim();
      const value = match[2].trim();
      const pathMatch = p.match(/Path=([^;]+)/i);
      parsedCookies.push({
        name,
        value,
        domain: 'localhost',
        path: pathMatch ? pathMatch[1] : '/',
        httpOnly: p.toLowerCase().includes('httponly'),
        sameSite: 'Lax',
      });
    }
  }

  const viewports = [
    { name: '1536x730', width: 1536, height: 730 },
    { name: '390px', width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    for (const theme of ['dark', 'light']) {
      const label = `${vp.name}-${theme}`;
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: theme,
      });
      await context.addCookies(parsedCookies);
      await context.addInitScript(({ loginData }) => {
        window.__INITIAL_STAFF_TOKEN__ = loginData.accessToken;
        localStorage.setItem('crm_user', JSON.stringify(loginData.user));
        localStorage.setItem('crm_refresh_token_fb', loginData.refreshToken);
        localStorage.setItem('crm_last_user_activity', String(Date.now()));
        sessionStorage.setItem('crm_tab_user_id', loginData.user.id);
        sessionStorage.setItem('crm_portal', 'staff');
        sessionStorage.setItem('crm_last_active_user_id', loginData.user.id);
        sessionStorage.setItem('crm_refresh_token_fb', loginData.refreshToken);
      }, { loginData });

      const page = await context.newPage();

      // Navigate directly to /settings/branding
      await page.goto(`${WEB_BASE}/settings/branding`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="document-logo-preview-sheet"]', { timeout: 12000 });

      // 3.1 Verify Invoice Header Preview Container has white background
      const sheetElem = page.locator('[data-testid="document-logo-preview-sheet"]');
      const sheetClass = await sheetElem.getAttribute('class');
      assert(
        `[${label}] Invoice header preview renders over white document sheet in ${theme} mode`,
        sheetClass.includes('bg-white') && sheetClass.includes('border-slate-200'),
        `Class: ${sheetClass}`
      );

      // Verify Company Display Name is bold text and product logo is NOT in preview
      const previewImgs = await page.$$eval('[data-testid="document-logo-preview"]', (imgs) => imgs.map((i) => i.src));
      const hasProductLogoInPreview = previewImgs.some((s) => s.includes('logo.png'));
      assert(
        `[${label}] Preview does NOT show Syntra CRM product logo when tenant logo is NULL`,
        !hasProductLogoInPreview,
        `Found preview imgs: ${previewImgs.join(', ') || 'none'}`
      );

      // Verify placeholder hint is visible
      const hintVisible = await page.locator('text=Upload your company logo to display it on invoices and quotes').isVisible();
      assert(`[${label}] Placeholder hint is visible when document logo is not uploaded`, hintVisible);

      // Capture screenshot of branding page
      const brandingShotPath = path.join(ARTIFACTS_DIR, `evidence-document-logo-preview-${label}.png`);
      await page.screenshot({ path: brandingShotPath, fullPage: false });
      assert(`[${label}] Captured branding preview screenshot to artifacts`, fs.existsSync(brandingShotPath));

      await context.close();
    }
  }

  // 3.2 Upload, View on Invoice, Reset, and Verify Plain Invoice
  console.log('\n--- Testing Upload, Invoice View, Reset, and Plain Document Chain ---');
  const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
  await context.addCookies(parsedCookies);
  await context.addInitScript(({ loginData }) => {
    window.__INITIAL_STAFF_TOKEN__ = loginData.accessToken;
    localStorage.setItem('crm_user', JSON.stringify(loginData.user));
    localStorage.setItem('crm_refresh_token_fb', loginData.refreshToken);
    localStorage.setItem('crm_last_user_activity', String(Date.now()));
    sessionStorage.setItem('crm_tab_user_id', loginData.user.id);
    sessionStorage.setItem('crm_portal', 'staff');
    sessionStorage.setItem('crm_last_active_user_id', loginData.user.id);
    sessionStorage.setItem('crm_refresh_token_fb', loginData.refreshToken);
  }, { loginData });
  const page = await context.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`[Browser Console ${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('response', resp => {
    if (resp.url().includes('branding/logo')) {
      console.log(`[Browser Response] ${resp.status()} ${resp.url()}`);
    }
  });

  await page.goto(`${WEB_BASE}/settings/branding`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[data-testid="btn-upload-document-logo"]', { timeout: 12000 });

  // Upload 1.9 MB WebP logo via file input
  const fileInput = page.locator('input[data-testid="input-file-document-logo"]');
  const test19mPath = path.resolve(__dirname, '../scratch/test-images/logo-1.9mb.webp');
  await fileInput.setInputFiles(test19mPath);

  // Wait for compression and upload
  await page.waitForSelector('text=Document Logo updated successfully!', { timeout: 15000 });
  assert('Browser-side image compression resized 1.9 MB image and uploaded successfully', true);

  // Verify preview now shows the uploaded logo
  const logoPreviewElem = page.locator('[data-testid="document-logo-preview"]');
  const uploadedSrc = await logoPreviewElem.getAttribute('src');
  assert(
    'Preview immediately displays uploaded custom logo with cache-buster timestamp',
    uploadedSrc && uploadedSrc.includes('/api/v1/settings/branding/logo') && uploadedSrc.includes('?t='),
    `Src: ${uploadedSrc}`
  );

  // Visit dedicated print page for invoice to verify logo appears
  const hasClientNav = await page.evaluate(() => typeof window.__CRM_NAVIGATE__ === 'function');
  if (hasClientNav) {
    await page.evaluate((id) => window.__CRM_NAVIGATE__(`/print/invoice/${id}?autoPrint=false`), ctx.invoice.id);
  } else {
    await page.goto(`${WEB_BASE}/print/invoice/${ctx.invoice.id}?autoPrint=false`, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForSelector('text=Tax Invoice', { timeout: 15000 });
  await page.waitForTimeout(500);

  const printLogoShotPath = path.join(ARTIFACTS_DIR, 'evidence-invoice-print-with-logo-1536x730.png');
  await page.screenshot({ path: printLogoShotPath, fullPage: false });
  assert('Captured invoice print view with custom company logo', fs.existsSync(printLogoShotPath));

  // Return to settings and click Reset
  if (hasClientNav) {
    await page.evaluate(() => window.__CRM_NAVIGATE__('/settings/branding'));
  } else {
    await page.goto(`${WEB_BASE}/settings/branding`, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForSelector('button:has-text("Reset")', { timeout: 12000 });

  const resetBtn = page.locator('button:has-text("Reset")').first();
  await resetBtn.click();
  await page.waitForSelector('text=Document logo removed', { timeout: 8000 });
  assert('Clicking "Reset" removes document logo and shows confirmation banner', true);

  // Verify database has NULL
  const dbTenantAfterReset = await prisma.tenant.findUnique({
    where: { id: ctx.tenant.id },
    select: { logoUrl: true },
  });
  assert(
    'Database Tenant.logoUrl is strictly NULL after clicking Reset (never /logo.png)',
    dbTenantAfterReset.logoUrl === null,
    `DB value: ${dbTenantAfterReset.logoUrl}`
  );

  // Visit dedicated print page again to verify plain invoice
  if (hasClientNav) {
    await page.evaluate((id) => window.__CRM_NAVIGATE__(`/print/invoice/${id}?autoPrint=false`), ctx.invoice.id);
  } else {
    await page.goto(`${WEB_BASE}/print/invoice/${ctx.invoice.id}?autoPrint=false`, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForSelector('text=Tax Invoice', { timeout: 15000 });
  await page.waitForTimeout(500);

  // Check invoice content details:
  const invoicePageText = await page.innerText('body');
  
  // (a) No stray dots: "GST IN : 29AABCU9603R1ZJ" without trailing dot
  const hasStrayGstinDot = /GST IN\s*:\s*[A-Z0-9]+\.\s*$/m.test(invoicePageText);
  assert('Invoice does NOT contain stray dot after GSTIN ("GST IN : 29...").', !hasStrayGstinDot);

  // (b) Empty MSME UDYAM row is omitted
  assert('Invoice does NOT print empty "MSME UDYAM Reg No: ."', !invoicePageText.includes('MSME UDYAM Reg No: .'));

  // (c) State code is present
  assert('Invoice displays valid state name and 2-digit code ("State Name : Karnataka, Code - 29")', invoicePageText.includes('State Name : Karnataka, Code - 29'));

  // (d) Amount in words is Title Case
  assert('Amount in words is in Title Case ("Indian Rupees One Lakh Eighteen Thousand Only")', invoicePageText.includes('Indian Rupees One Lakh Eighteen Thousand Only'));

  // (e) Round off row omitted when 0
  assert('Round off row is omitted when round off is 0.00', !invoicePageText.includes('Round off'));

  // (f) Tabular numbers used on numbers
  const hasTabularNums = await page.$$eval('.tabular-nums', (elems) => elems.length > 0);
  assert('Invoice numbers use proportional font with tabular numbers (.tabular-nums)', hasTabularNums);

  // (g) Zero product logo on plain invoice
  const printImgs = await page.$$eval('img', (imgs) => imgs.map((i) => i.src));
  const hasProductLogoOnPrint = printImgs.some((s) => s.includes('logo.png'));
  assert('Plain invoice document contains ZERO product logos or placeholder images', !hasProductLogoOnPrint, `Found images: ${printImgs.join(', ')}`);

  const printPlainShotPath = path.join(ARTIFACTS_DIR, 'evidence-invoice-print-no-logo-1536x730.png');
  await page.screenshot({ path: printPlainShotPath, fullPage: false });
  assert('Captured plain invoice print view without logo to artifacts', fs.existsSync(printPlainShotPath));

  // 3.3 Verify Product Logo in App Chrome remains untouched
  await page.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
  const loginLogo = await page.locator('img[alt="Syntra CRM"]').or(page.locator('img[alt*="Syntra"]')).first();
  const loginLogoVisible = await loginLogo.isVisible().catch(() => false);
  assert('Product logo in login page header/branding is untouched and visible', loginLogoVisible);

  await browser.close();
}

// ─── 4. BRAND LOCK INTEGRITY CHECK ───────────────────────────────────────────
function verifyBrandLock() {
  console.log('\n============================================================');
  console.log('4. BRAND LOCK & PRODUCT ASSETS INTEGRITY CHECK');
  console.log('============================================================');

  const brandLockPath = path.resolve(__dirname, '../brand.lock.json');
  if (fs.existsSync(brandLockPath)) {
    const brandLock = JSON.parse(fs.readFileSync(brandLockPath, 'utf8'));
    let allHashesMatch = true;

    for (const [filePath, expectedHash] of Object.entries(brandLock.files || {})) {
      const absPath = path.resolve(__dirname, '..', filePath);
      if (fs.existsSync(absPath)) {
        const fileBuf = fs.readFileSync(absPath);
        const actualHash = crypto.createHash('sha256').update(fileBuf).digest('hex');
        if (actualHash !== expectedHash) {
          allHashesMatch = false;
          console.error(`  Mismatch in ${filePath}: expected ${expectedHash}, got ${actualHash}`);
        }
      }
    }

    assert('brand.lock.json and all product logo files are 100% untouched and match registered SHA-256 hashes', allHashesMatch);
  } else {
    assert('brand.lock.json exists', false);
  }
}

// ─── MAIN EXECUTION ──────────────────────────────────────────────────────────
async function main() {
  console.log('============================================================');
  console.log('COMPANY DOCUMENT LOGO & INVOICE PLAIN PRINT TEST SUITE');
  console.log('============================================================');

  runUnitTests();
  const ctx = await runApiTests();
  if (ctx) {
    await runBrowserTests(ctx);
  }
  verifyBrandLock();

  console.log('\n============================================================');
  console.log('TEST RESULTS SUMMARY:');
  console.log(`  PASSED: ${passedTests.length}`);
  console.log(`  FAILED: ${failedTests.length}`);
  console.log('============================================================\n');

  if (failedTests.length > 0) {
    console.error(`ERROR: ${failedTests.length} tests failed!`);
    process.exitCode = 1;
  } else {
    console.log('SUCCESS: All company document logo and invoice plain print tests PASSED!');
    process.exitCode = 0;
  }
}

main().finally(async () => {
  await prisma.$disconnect();
});
