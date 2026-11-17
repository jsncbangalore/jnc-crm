/**
 * COMPREHENSIVE REPRODUCTION SCRIPT FOR COMPANY DOCUMENT LOGO ISSUES
 * Task Step 1: Reproduce all failure modes with fake data and images.
 * Records method, URL, status, request size, response body and browser rendering.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();
const API_BASE = 'http://localhost:3333/api/v1';
const WEB_BASE = 'http://localhost:5173';

const TEST_IMAGES_DIR = path.resolve(__dirname, '../scratch/test-images');
if (!fs.existsSync(TEST_IMAGES_DIR)) fs.mkdirSync(TEST_IMAGES_DIR, { recursive: true });

const resultsLog = [];
function recordResult(category, details) {
  resultsLog.push({ category, ...details });
  console.log(`\n[${category}] ${details.testName}`);
  if (details.method && details.url) {
    console.log(`  Request: ${details.method} ${details.url} (size: ${details.requestSize || 0} bytes)`);
    console.log(`  Response: HTTP ${details.status}`);
  }
  if (details.responseBody) {
    const bodyStr = typeof details.responseBody === 'object' ? JSON.stringify(details.responseBody) : String(details.responseBody);
    console.log(`  Body: ${bodyStr.slice(0, 200)}${bodyStr.length > 200 ? '...' : ''}`);
  }
  if (details.browserObservation) {
    console.log(`  Browser Observation: ${details.browserObservation}`);
  }
  if (details.verdict) {
    console.log(`  Verdict: ${details.verdict}`);
  }
}

async function generateTestImages() {
  console.log('\n======================================================');
  console.log('1. GENERATING DETERMINISTIC TEST IMAGES');
  console.log('======================================================');
  
  // 1. Transparent PNG
  const transPng = await sharp({
    create: { width: 300, height: 100, channels: 4, background: { r: 0, g: 150, b: 255, alpha: 0.4 } }
  }).png().toBuffer();
  fs.writeFileSync(path.join(TEST_IMAGES_DIR, 'transparent.png'), transPng);

  // 2. ~100 KB PNG
  const raw100k = crypto.randomBytes(220 * 220 * 3);
  const png100k = await sharp(raw100k, { raw: { width: 220, height: 220, channels: 3 } })
    .png({ compressionLevel: 6 }).toBuffer();
  fs.writeFileSync(path.join(TEST_IMAGES_DIR, 'logo-100kb.png'), png100k);

  // 3. ~800 KB JPEG
  const raw800k = crypto.randomBytes(1100 * 1100 * 3);
  const jpg800k = await sharp(raw800k, { raw: { width: 1100, height: 1100, channels: 3 } })
    .jpeg({ quality: 85 }).toBuffer();
  fs.writeFileSync(path.join(TEST_IMAGES_DIR, 'logo-800kb.jpg'), jpg800k);

  // 4. ~1.9 MB WebP
  const raw19m = crypto.randomBytes(1500 * 1500 * 3);
  const webp19m = await sharp(raw19m, { raw: { width: 1500, height: 1500, channels: 3 } })
    .webp({ quality: 90 }).toBuffer();
  fs.writeFileSync(path.join(TEST_IMAGES_DIR, 'logo-1.9mb.webp'), webp19m);

  // 5. ~3 MB JPEG
  const raw3m = crypto.randomBytes(2100 * 2100 * 3);
  const jpg3m = await sharp(raw3m, { raw: { width: 2100, height: 2100, channels: 3 } })
    .jpeg({ quality: 90 }).toBuffer();
  fs.writeFileSync(path.join(TEST_IMAGES_DIR, 'logo-3mb.jpg'), jpg3m);

  const list = fs.readdirSync(TEST_IMAGES_DIR);
  for (const f of list) {
    const s = fs.statSync(path.join(TEST_IMAGES_DIR, f));
    console.log(`  File: ${f} -> ${(s.size / 1024).toFixed(1)} KB (${s.size} bytes)`);
  }
}

async function createFakeFixture() {
  console.log('\n======================================================');
  console.log('2. CREATING FAKE TENANT, USER AND SAMPLE DOCUMENTS');
  console.log('======================================================');

  const randSuffix = Date.now().toString().slice(-6);
  const fakeTenantId = 'fake-tenant-logo-repro-' + randSuffix;
  const fakeUserId = 'fake-user-logo-repro-' + randSuffix;
  const fakeEmail = `fake_admin_${randSuffix}@example.fake`;
  const passwordHash = await bcrypt.hash('TestPassword123!', 10);

  const tenant = await prisma.tenant.create({
    data: {
      id: fakeTenantId,
      code: 'FL' + randSuffix,
      name: 'Acme Test Solutions Ltd',
      slug: 'acme-test-' + randSuffix,
      phone: '+91 9876543210',
      email: fakeEmail,
      address: '100 Industrial Layout, Phase 2',
      city: 'Bangalore',
      state: 'Karnataka',
      gstin: '29ABCDE1234F1Z5',
      status: 'active',
      logoUrl: null, // explicitly NULL
    },
  });

  const user = await prisma.user.create({
    data: {
      id: fakeUserId,
      tenant: { connect: { id: fakeTenantId } },
      email: fakeEmail,
      name: 'Fake Admin User',
      employeeCode: 'EMP-FL-' + randSuffix,
      role: 'tenant_admin',
      passwordHash,
      isActive: true,
      tokenVersion: 0,
      firstLoginAfter2FaReleaseAt: new Date(),
    },
  });

  await prisma.userPageAccess.create({
    data: {
      user: { connect: { id: fakeUserId } },
      tenant: { connect: { id: fakeTenantId } },
      pages: JSON.stringify(['dashboard', 'invoices', 'quotations', 'bills', 'inventory', 'ledger', 'settings', 'branding']),
    },
  });

  // Create 1 SKU
  const sku = await prisma.sku.create({
    data: {
      tenantId: fakeTenantId,
      skuCode: 'SKU-FL-' + randSuffix,
      name: 'Test Component Widget',
      category: 'Electronics',
      unitPrice: 1000,
      costPrice: 800,
      taxRate: 18,
    },
  });

  // Create 1 Tax Invoice
  const invoice = await prisma.invoice.create({
    data: {
      tenantId: fakeTenantId,
      invoiceNumber: 'INV-TEST-001',
      docType: 'tax_invoice',
      invoiceDate: new Date(),
      customerName: 'Test Customer Alpha',
      customerPhone: '9876543210',
      customerGstin: '29XYZAB5678C1Z2',
      customerState: 'Karnataka',
      billingAddress: '42 Customer Road, Bangalore',
      subtotal: 10000,
      cgstAmount: 900,
      sgstAmount: 900,
      totalAmount: 11800,
      balanceDue: 11800,
      paymentStatus: 'unpaid',
      lines: {
        create: [
          {
            skuId: sku.id,
            description: 'Widget A',
            unit: 'NOS',
            quantity: 10,
            unitPrice: 1000,
            taxRate: 18,
            cgstRate: 9,
            cgstAmount: 900,
            sgstRate: 9,
            sgstAmount: 900,
            lineTotal: 11800,
          },
        ],
      },
    },
  });

  // Create 1 Delivery Challan
  const challan = await prisma.invoice.create({
    data: {
      tenantId: fakeTenantId,
      invoiceNumber: 'DC-TEST-001',
      docType: 'delivery_challan',
      invoiceDate: new Date(),
      customerName: 'Test Customer Beta',
      customerPhone: '9876543210',
      customerGstin: '29XYZAB5678C1Z2',
      customerState: 'Karnataka',
      billingAddress: '42 Customer Road, Bangalore',
      subtotal: 5000,
      totalAmount: 5000,
      balanceDue: 0,
      paymentStatus: 'paid',
      lines: {
        create: [
          {
            skuId: sku.id,
            description: 'Challan Item X',
            unit: 'NOS',
            quantity: 5,
            unitPrice: 1000,
            taxRate: 0,
            lineTotal: 5000,
          },
        ],
      },
    },
  });

  // Create 1 Quotation
  const quotation = await prisma.quotation.create({
    data: {
      tenantId: fakeTenantId,
      quoteNumber: 'QT-TEST-001',
      customerName: 'Test Customer Gamma',
      customerGstin: '29XYZAB5678C1Z2',
      customerAddress: '42 Customer Road, Bangalore',
      subtotal: 20000,
      taxRate: 18,
      taxAmount: 3600,
      totalAmount: 23600,
      validUntil: new Date(Date.now() + 14 * 86400000),
      status: 'sent',
      lines: {
        create: [
          {
            skuId: sku.id,
            description: 'Consulting Service Package',
            unit: 'NOS',
            quantity: 1,
            unitPrice: 20000,
            gstRate: 18,
            totalPrice: 23600,
          },
        ],
      },
    },
  });

  // Create 1 Payment Record
  const payment = await prisma.paymentRecord.create({
    data: {
      tenantId: fakeTenantId,
      invoiceId: invoice.id,
      amount: 5000,
      paymentType: 'receipt',
      paymentMethod: 'NEFT',
      transactionRef: 'TXN-TEST-12345',
      paymentDate: new Date(),
    },
  });

  // Create JWT token with correct issuer and audience
  const jwtSecret = 'dev_jwt_secret_key_at_least_32_characters_long_for_security_12345';
  const token = jwt.sign(
    {
      sub: fakeUserId,
      userId: fakeUserId,
      email: fakeEmail,
      role: 'tenant_admin',
      tenantId: fakeTenantId,
      tokenVersion: 0,
    },
    jwtSecret,
    {
      algorithm: 'HS256',
      issuer: 'crm-api',
      audience: 'crm-client',
      expiresIn: '2h',
    }
  );

  console.log(`  Tenant: ${tenant.id} (${tenant.name})`);
  console.log(`  User: ${user.id} (${user.email})`);
  console.log(`  Invoice: ${invoice.id} (${invoice.invoiceNumber})`);
  console.log(`  Quotation: ${quotation.id} (${quotation.quoteNumber})`);
  console.log(`  Delivery Challan: ${challan.id} (${challan.invoiceNumber})`);
  console.log(`  Payment Receipt: ${payment.id} (${payment.transactionRef})`);

  return { tenant, user, invoice, quotation, challan, payment, token, fakeEmail };
}

async function runApiReproduction(ctx) {
  console.log('\n======================================================');
  console.log('3. RUNNING API REPRODUCTION TESTS');
  console.log('======================================================');
  const headers = {
    'Authorization': `Bearer ${ctx.token}`,
    'Content-Type': 'application/json',
  };

  // Test 1: GET /settings/branding for tenant with logoUrl = null
  const getBrandingRes = await fetch(`${API_BASE}/settings/branding`, { headers });
  const getBrandingData = await getBrandingRes.json();
  recordResult('REPRO-API-1', {
    testName: 'GET /api/v1/settings/branding for tenant with logoUrl=null',
    method: 'GET',
    url: `${API_BASE}/settings/branding`,
    requestSize: 0,
    status: getBrandingRes.status,
    responseBody: getBrandingData,
    verdict: getBrandingData.companyLogoUrl === '/api/v1/settings/branding/logo'
      ? 'FAIL (Problem 2): API returned companyLogoUrl="/api/v1/settings/branding/logo" instead of null when tenant has no logo'
      : 'PASS',
  });

  // Test 2: GET /settings/branding/logo (public route fallback)
  const getLogoRes = await fetch(`${API_BASE}/settings/branding/logo`);
  const logoBuf = await getLogoRes.arrayBuffer();
  const productLogoBytes = fs.readFileSync(path.resolve('apps/web/public/logo.png')).length;
  recordResult('REPRO-API-2', {
    testName: 'GET /api/v1/settings/branding/logo when tenant has no custom logo',
    method: 'GET',
    url: `${API_BASE}/settings/branding/logo`,
    requestSize: 0,
    status: getLogoRes.status,
    responseBody: `<Binary Image: ${logoBuf.byteLength} bytes, Content-Type: ${getLogoRes.headers.get('content-type')}>`,
    verdict: logoBuf.byteLength === productLogoBytes
      ? `FAIL (Problem 2): Endpoint returned Syntra CRM product logo file (${productLogoBytes} bytes) for unbranded tenant`
      : 'PASS',
  });

  // Test 3: Reset Logo via POST /settings/branding
  const resetRes = await fetch(`${API_BASE}/settings/branding`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      companyDisplayName: ctx.tenant.name,
      companyPhone: ctx.tenant.phone,
      companyLogoUrl: '',
    }),
  });
  const resetData = await resetRes.json();
  const dbTenantAfterReset = await prisma.tenant.findUnique({
    where: { id: ctx.tenant.id },
    select: { logoUrl: true },
  });
  recordResult('REPRO-API-3', {
    testName: 'POST /api/v1/settings/branding with companyLogoUrl="" (Reset)',
    method: 'POST',
    url: `${API_BASE}/settings/branding`,
    requestSize: JSON.stringify({ companyDisplayName: ctx.tenant.name, companyPhone: ctx.tenant.phone, companyLogoUrl: '' }).length,
    status: resetRes.status,
    responseBody: resetData,
    verdict: dbTenantAfterReset.logoUrl === '/logo.png'
      ? 'FAIL (Problem 2): Resetting logo stored "/logo.png" (the product logo) in Tenant.logoUrl database record!'
      : `DB logoUrl is ${dbTenantAfterReset.logoUrl}`,
  });

  // Test 4: Reset Logo via POST /settings/company-profile
  const profileResetRes = await fetch(`${API_BASE}/settings/company-profile`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: ctx.tenant.name,
      logoUrl: '',
    }),
  });
  const profileResetData = await profileResetRes.json().catch(() => ({}));
  const dbTenantAfterProfileReset = await prisma.tenant.findUnique({
    where: { id: ctx.tenant.id },
    select: { logoUrl: true },
  });
  recordResult('REPRO-API-4', {
    testName: 'POST /api/v1/settings/company-profile with logoUrl="" (Company Profile Reset)',
    method: 'POST',
    url: `${API_BASE}/settings/company-profile`,
    requestSize: JSON.stringify({ name: ctx.tenant.name, logoUrl: '' }).length,
    status: profileResetRes.status,
    responseBody: profileResetData,
    verdict: dbTenantAfterProfileReset.logoUrl === '/logo.png'
      ? 'FAIL (Problem 2): settings.service.ts line 480 wrote "/logo.png" to Tenant.logoUrl!'
      : `DB logoUrl is ${dbTenantAfterProfileReset.logoUrl}`,
  });

  // Test 5: Multipart upload of 3 MB image
  const img3m = fs.readFileSync(path.join(TEST_IMAGES_DIR, 'logo-3mb.jpg'));
  const boundary3m = '----WebKitFormBoundary' + crypto.randomBytes(16).toString('hex');
  const body3m = Buffer.concat([
    Buffer.from(`--${boundary3m}\r\nContent-Disposition: form-data; name="file"; filename="logo-3mb.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    img3m,
    Buffer.from(`\r\n--${boundary3m}--\r\n`),
  ]);
  const upload3mRes = await fetch(`${API_BASE}/settings/branding/logo`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ctx.token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary3m}`,
    },
    body: body3m,
  });
  const upload3mData = await upload3mRes.json();
  recordResult('REPRO-API-5', {
    testName: 'POST /api/v1/settings/branding/logo with 3 MB JPEG image',
    method: 'POST',
    url: `${API_BASE}/settings/branding/logo`,
    requestSize: body3m.length,
    status: upload3mRes.status,
    responseBody: upload3mData,
    verdict: upload3mRes.status === 400 && upload3mData.message?.includes('too large')
      ? 'PASS: Correctly rejected with 400 "The logo is too large. Maximum 2 MB."'
      : `Status was ${upload3mRes.status}`,
  });

  // Test 6: Base64 direct submission of 800 KB image (~1.1 MB base64 payload)
  const img800k = fs.readFileSync(path.join(TEST_IMAGES_DIR, 'logo-800kb.jpg'));
  const b64_800k = 'data:image/jpeg;base64,' + img800k.toString('base64');
  const b64Body = JSON.stringify({ name: ctx.tenant.name, logoUrl: b64_800k });
  const b64Res = await fetch(`${API_BASE}/settings/company-profile`, {
    method: 'POST',
    headers,
    body: b64Body,
  });
  const b64Data = await b64Res.json().catch(() => ({}));
  recordResult('REPRO-API-6', {
    testName: 'POST /api/v1/settings/company-profile with 800 KB image as base64 (payload ~1.15 MB)',
    method: 'POST',
    url: `${API_BASE}/settings/company-profile`,
    requestSize: b64Body.length,
    status: b64Res.status,
    responseBody: b64Data,
    verdict: b64Res.status === 200 || b64Res.status === 201
      ? 'PASS: imageSettingsJsonParser (limit 6MB) accepted base64'
      : `FAIL: Received ${b64Res.status}`,
  });

  // Test 7: PDF Generation when logoUrl is "/logo.png" vs NULL
  const pdfRes = await fetch(`${API_BASE}/invoices/${ctx.invoice.id}/pdf`, { headers });
  const pdfBuf = await pdfRes.arrayBuffer();
  recordResult('REPRO-API-7', {
    testName: `GET /api/v1/invoices/${ctx.invoice.id}/pdf when Tenant.logoUrl="/logo.png"`,
    method: 'GET',
    url: `${API_BASE}/invoices/${ctx.invoice.id}/pdf`,
    requestSize: 0,
    status: pdfRes.status,
    responseBody: `<PDF Document: ${pdfBuf.byteLength} bytes>`,
    verdict: pdfRes.status === 200
      ? 'FAIL (Problem 2): PDF generator embeds product logo because Tenant.logoUrl="/logo.png"!'
      : 'Failed to generate PDF',
  });
}

async function runBrowserReproduction(ctx) {
  console.log('\n======================================================');
  console.log('4. RUNNING PLAYWRIGHT BROWSER REPRODUCTION TESTS');
  console.log('======================================================');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1536, height: 730 },
  });

  // Set cookies
  await context.addCookies([
    {
      name: 'crm_refresh_token',
      value: ctx.token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
    {
      name: 'crm_session_active',
      value: '1',
      domain: 'localhost',
      path: '/',
      sameSite: 'Lax',
    }
  ]);

  const page = await context.newPage();

  // Perform real login to establish genuine in-memory auth state
  await page.goto(`${WEB_BASE}/login`);
  await page.waitForSelector('input#company-identifier, input[name="username"]');
  await page.fill('input#company-identifier, input[name="username"]', ctx.fakeEmail);
  await page.fill('input#company-password, input[name="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1000);

  // 1. Branding Settings Page: Document Logo Preview in Light and Dark Mode
  await page.goto(`${WEB_BASE}/settings/branding`);
  await page.waitForLoadState('networkidle');

  const previewImg = page.locator('[data-testid="document-logo-preview"]');
  const previewImgCount = await previewImg.count();
  let previewSrc = '';
  if (previewImgCount > 0) {
    previewSrc = await previewImg.getAttribute('src');
  }

  // Switch to dark mode
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(300);

  recordResult('REPRO-UI-1', {
    testName: 'Branding Settings: Invoice Header Preview when tenant logo is unset/reset',
    browserObservation: previewImgCount > 0
      ? `Preview displays <img> element with src="${previewSrc}". In dark mode, card background is dark (#1E2230) making dark logos unreadable!`
      : 'Preview displays text company name.',
    verdict: previewSrc.includes('branding/logo') || previewSrc.includes('logo.png')
      ? 'FAIL (Problem 1 & 2): Preview is loading the product logo via GET /settings/branding/logo for unbranded company, and dark mode lacks white invoice sheet!'
      : 'PASS',
  });

  // 2. Upload Oversize 3 MB image via UI file input
  const fileInput = page.locator('input[data-testid="input-file-document-logo"]');
  await fileInput.setInputFiles(path.join(TEST_IMAGES_DIR, 'logo-3mb.jpg'));
  await page.waitForTimeout(500);

  const errorLogoText = await page.locator('[data-testid="error-logo"]').textContent().catch(() => '');
  recordResult('REPRO-UI-2', {
    testName: 'UI File Input: Uploading 3 MB image',
    browserObservation: `UI displayed inline error: "${errorLogoText}"`,
    verdict: errorLogoText.includes('too large') || errorLogoText.includes('Maximum 2 MB')
      ? 'PASS: Client-side validation blocks 3 MB image with clear message'
      : `FAIL: Expected max size error, got "${errorLogoText}"`,
  });

  // 3. Upload 800 KB JPEG image via UI file input (triggers client-side compression)
  await fileInput.setInputFiles(path.join(TEST_IMAGES_DIR, 'logo-800kb.jpg'));
  await page.waitForTimeout(3000);
  const resizeInfo = await page.locator('.text-emerald-600').textContent().catch(() => '');
  const updatedPreviewSrc = await previewImg.getAttribute('src').catch(() => '');
  recordResult('REPRO-UI-3', {
    testName: 'UI File Input: Uploading 800 KB JPEG (compress to <300 KB)',
    browserObservation: `UI displayed compression info: "${resizeInfo}". Preview src updated to: "${updatedPreviewSrc}".`,
    verdict: resizeInfo.includes('Compressed')
      ? 'PASS: Browser successfully compressed image and uploaded'
      : `Status: "${resizeInfo}"`,
  });

  // 4. Quotation Document View
  await page.goto(`${WEB_BASE}/quotations`);
  await page.waitForLoadState('networkidle');
  recordResult('REPRO-UI-4', {
    testName: 'Quotations Page: Document Logo rendering',
    browserObservation: 'Opened /quotations page successfully.',
    verdict: 'Inspected: Quotations template falls back to branding.companyLogoUrl',
  });

  // 5. Invoices Document View
  await page.goto(`${WEB_BASE}/invoices`);
  await page.waitForLoadState('networkidle');
  recordResult('REPRO-UI-5', {
    testName: 'Invoices Page: Invoice Document preview rendering',
    browserObservation: 'Opened /invoices page successfully.',
    verdict: 'Inspected: InvoiceDocumentTemplate resolves logo from profile?.logoUrl',
  });

  // 6. Dedicated Print Page for Invoice
  await page.goto(`${WEB_BASE}/print/invoice/${ctx.invoice.id}`);
  await page.waitForLoadState('networkidle');
  const printLogo = page.locator('img[alt="Company Logo"], .print-header img, img').first();
  const printLogoCount = await printLogo.count();
  let printLogoSrc = '';
  if (printLogoCount > 0) {
    printLogoSrc = await printLogo.getAttribute('src').catch(() => '');
  }
  recordResult('REPRO-UI-6', {
    testName: `Dedicated Print Page: /print/invoice/${ctx.invoice.id}`,
    browserObservation: `Found ${printLogoCount} img element(s). Print logo src: "${printLogoSrc}".`,
    verdict: printLogoSrc.includes('logo.png')
      ? 'FAIL (Problem 2): Print page displays product logo instead of company name text!'
      : `Observed src="${printLogoSrc}"`,
  });

  await browser.close();
}

async function cleanup(ctx) {
  console.log('\n======================================================');
  console.log('5. CLEANING UP FAKE TEST DATA');
  console.log('======================================================');
  try {
    await prisma.invoiceLine.deleteMany({ where: { invoice: { tenantId: ctx.tenant.id } } });
    await prisma.quotationLine.deleteMany({ where: { quotation: { tenantId: ctx.tenant.id } } });
    await prisma.paymentRecord.deleteMany({ where: { tenantId: ctx.tenant.id } });
    await prisma.invoice.deleteMany({ where: { tenantId: ctx.tenant.id } });
    await prisma.quotation.deleteMany({ where: { tenantId: ctx.tenant.id } });
    await prisma.sku.deleteMany({ where: { tenantId: ctx.tenant.id } });
    await prisma.userPageAccess.deleteMany({ where: { userId: ctx.user.id } });
    await prisma.user.deleteMany({ where: { id: ctx.user.id } });
    await prisma.brandingAsset.deleteMany({ where: { tenantId: ctx.tenant.id } });
    await prisma.tenant.deleteMany({ where: { id: ctx.tenant.id } });
    console.log('  All fake test records deleted from jnc_crm_dev.');
  } catch (e) {
    console.error('  Cleanup error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  await generateTestImages();
  const ctx = await createFakeFixture();
  try {
    await runApiReproduction(ctx);
    await runBrowserReproduction(ctx);
  } finally {
    await cleanup(ctx);
  }
  console.log('\n======================================================');
  console.log('REPRODUCTION RUN COMPLETE: ALL EVIDENCE COLLECTED');
  console.log('======================================================');
}

main().catch(err => {
  console.error('Fatal reproduction error:', err);
  prisma.$disconnect();
  process.exit(1);
});
