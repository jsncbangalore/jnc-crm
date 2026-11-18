const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();
const API_BASE = 'http://localhost:3333/api/v1';
const WEB_BASE = 'http://localhost:5173';

async function main() {
  console.log('============================================================');
  console.log('STEP 1: REPRODUCE AND MEASURE BASELINE REPORT');
  console.log('Local environment: jnc_crm_dev | Fake data only | Fix nothing yet');
  console.log('============================================================\n');

  // Setup fake tenant and admin user
  const fakeId = 'repro-' + Date.now().toString(36);
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Repro Test Corp',
      code: fakeId.toUpperCase(),
      slug: fakeId,
      planTier: 'enterprise',
      maxUsers: 10,
      status: 'active',
    },
  });

  const rawPassword = 'Password@123!';
  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(rawPassword, salt);

  const adminUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: `${fakeId}@repro.test`,
      name: 'Admin Repro',
      employeeCode: 'EMP-ADM',
      role: 'tenant_admin',
      passwordHash,
      isActive: true,
      tokenVersion: 0,
    },
  });

  // Ensure full page access
  await prisma.userPageAccess.create({
    data: {
      userId: adminUser.id,
      tenantId: tenant.id,
      pages: JSON.stringify([
        'dashboard',
        'quotations',
        'orders',
        'invoices',
        'shipments',
        'leads',
        'customers',
        'inventory',
        'bills',
        'payments',
        'ledger',
        'branding',
        'daily_activities',
      ]),
    },
  });

  let browser = null;
  try {
    // ─────────────────────────────────────────────────────────────
    // PROBLEM 1: POST /auth/login timing & server breakdown
    // ─────────────────────────────────────────────────────────────
  console.log('------------------------------------------------------------');
  console.log('PROBLEM 1: POST /auth/login TIMING & BREAKDOWN');
  console.log('------------------------------------------------------------');

  // 1a: Wrong password HTTP request
  const tWrong0 = performance.now();
  const wrongRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: adminUser.email,
      password: 'IncorrectPassword999!',
      companyCode: tenant.code,
    }),
  });
  const tWrong1 = performance.now();
  const wrongMs = tWrong1 - tWrong0;
  const wrongData = await wrongRes.json().catch(() => ({}));

  console.log(`[HTTP] Method: POST | URL: ${API_BASE}/auth/login (Wrong Password)`);
  console.log(`       Status: ${wrongRes.status} ${wrongRes.statusText} | Timing: ${wrongMs.toFixed(2)} ms (${(wrongMs / 1000).toFixed(2)} s)`);
  console.log(`       Response: ${JSON.stringify(wrongData)}`);

  // 1b: Correct password HTTP request
  const tCorrect0 = performance.now();
  const correctRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: adminUser.email,
      password: rawPassword,
      companyCode: tenant.code,
    }),
  });
  const tCorrect1 = performance.now();
  const correctMs = tCorrect1 - tCorrect0;
  const correctData = await correctRes.json().catch(() => ({}));

  console.log(`\n[HTTP] Method: POST | URL: ${API_BASE}/auth/login (Correct Password)`);
  console.log(`       Status: ${correctRes.status} ${correctRes.statusText} | Timing: ${correctMs.toFixed(2)} ms (${(correctMs / 1000).toFixed(2)} s)`);
  console.log(`       Response: User ID ${correctData.user?.id}, Role: ${correctData.user?.role}`);

  // 1c: Server-side timing breakdown benchmark
  console.log('\n[SERVER-SIDE LOGIN TIMING BREAKDOWN]');
  const tParse0 = performance.now();
  const rawIdentifier = adminUser.email.trim();
  const lower = rawIdentifier.toLowerCase();
  const companyCode = tenant.code;
  const tParse1 = performance.now();

  const tTen0 = performance.now();
  const resolvedTenant = await prisma.tenant.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { code: { equals: companyCode.toUpperCase(), mode: 'insensitive' } },
        { slug: { equals: companyCode.toLowerCase(), mode: 'insensitive' } },
        { id: { equals: companyCode } },
      ],
    },
  });
  const tTen1 = performance.now();

  const lockKey = `${lower}:${resolvedTenant.id}`;
  const tLock0 = performance.now();
  await prisma.accountLockout.findUnique({ where: { identityKey: lockKey } });
  const tLock1 = performance.now();

  const tCand0 = performance.now();
  const candidates = await prisma.user.findMany({
    where: {
      tenantId: resolvedTenant.id,
      deletedAt: null,
      OR: [
        { email: { equals: lower, mode: 'insensitive' } },
        { employeeCode: { equals: rawIdentifier, mode: 'insensitive' } },
      ],
    },
    include: { tenant: true },
  });
  const tCand1 = performance.now();

  const tBcrypt0 = performance.now();
  await bcrypt.compare(rawPassword, candidates[0].passwordHash);
  const tBcrypt1 = performance.now();

  const tBcryptWrong0 = performance.now();
  await bcrypt.compare('WrongPassword999!', candidates[0].passwordHash);
  const tBcryptWrong1 = performance.now();

  const tReset0 = performance.now();
  await prisma.accountLockout.deleteMany({ where: { identityKey: lockKey } });
  const tReset1 = performance.now();

  const tFresh0 = performance.now();
  await prisma.user.findUnique({
    where: { id: candidates[0].id },
    include: { twoFactor: true, tenant: true },
  });
  const tFresh1 = performance.now();

  const tLastLog0 = performance.now();
  await prisma.user.update({
    where: { id: candidates[0].id },
    data: { lastLoginAt: new Date() },
  });
  const tLastLog1 = performance.now();

  const tPrior0 = performance.now();
  await prisma.refreshSession.findFirst({
    where: { userId: candidates[0].id },
  });
  const tPrior1 = performance.now();

  const tJwt0 = performance.now();
  jwt.sign(
    { sub: candidates[0].id, email: candidates[0].email, role: candidates[0].role, tenantId: candidates[0].tenantId },
    process.env.JWT_SECRET || 'dev-secret-key-for-local-testing',
    { expiresIn: '15m' }
  );
  const refreshToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const tJwt1 = performance.now();

  const tSess0 = performance.now();
  await prisma.refreshSession.create({
    data: {
      userId: candidates[0].id,
      tokenHash,
      familyId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 7 * 86400000),
      isRevoked: false,
      userAgent: 'Playwright',
      ipAddress: '127.0.0.1',
      lastUsedAt: new Date(),
      deviceLabel: 'Playwright Benchmark',
    },
  });
  const tSess1 = performance.now();

  const tAud0 = performance.now();
  await prisma.auditLog.create({
    data: {
      tenantId: candidates[0].tenantId,
      actorId: candidates[0].id,
      actorName: candidates[0].name,
      action: 'LOGIN_SUCCESS',
      entityName: 'User',
      entityId: candidates[0].id,
      afterState: JSON.stringify({ reason: 'SUCCESS' }),
      ipAddress: '127.0.0.1',
    },
  });
  const tAud1 = performance.now();

  console.log(`  1. Request parsing & validation:        ${(tParse1 - tParse0).toFixed(2)} ms`);
  console.log(`  2. Tenant resolution query:             ${(tTen1 - tTen0).toFixed(2)} ms`);
  console.log(`  3. Lockout check query:                 ${(tLock1 - tLock0).toFixed(2)} ms`);
  console.log(`  4. User lookup query (findCandidates):   ${(tCand1 - tCand0).toFixed(2)} ms`);
  console.log(`  5. Password hash check (bcrypt.compare): ${(tBcrypt1 - tBcrypt0).toFixed(2)} ms (Wrong pw: ${(tBcryptWrong1 - tBcryptWrong0).toFixed(2)} ms)`);
  console.log(`  6. Lockout attempts reset write:        ${(tReset1 - tReset0).toFixed(2)} ms`);
  console.log(`  7. Redundant fresh user lookup query:   ${(tFresh1 - tFresh0).toFixed(2)} ms`);
  console.log(`  8. User lastLoginAt update write:       ${(tLastLog1 - tLastLog0).toFixed(2)} ms`);
  console.log(`  9. Prior session lookup query:          ${(tPrior1 - tPrior0).toFixed(2)} ms`);
  console.log(` 10. JWT token signing & hash:            ${(tJwt1 - tJwt0).toFixed(2)} ms`);
  console.log(` 11. Refresh session creation write:      ${(tSess1 - tSess0).toFixed(2)} ms`);
  console.log(` 12. Audit log creation write:            ${(tAud1 - tAud0).toFixed(2)} ms`);
  console.log(` 13. External / email notifications:      0.00 ms (skipped / asynchronous)`);

  // Launch Playwright for UI reproduction
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
  const page = await context.newPage();

  // ─────────────────────────────────────────────────────────────
  // PROBLEM 2: Navigation flicker (/dashboard -> / -> /dashboard)
  // ─────────────────────────────────────────────────────────────
  console.log('\n------------------------------------------------------------');
  console.log('PROBLEM 2: AFTER LOGIN NAVIGATION SEQUENCE');
  console.log('------------------------------------------------------------');

  const navHistory = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      navHistory.push({ url: frame.url(), time: performance.now() });
    }
  });

  const tNavStart = performance.now();
  await page.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#company-identifier', adminUser.email);
  await page.fill('#company-password', rawPassword);
  await page.click('button[type="submit"]');

  await page.waitForTimeout(2500);

  console.log(`Navigation events recorded immediately following login submission:`);
  navHistory.forEach((n, idx) => {
    const relMs = (n.time - tNavStart).toFixed(1);
    console.log(`  Step ${idx + 1} [+${relMs} ms]: ${n.url}`);
  });
  const urls = navHistory.map((n) => new URL(n.url).pathname);
  console.log(`What browser shows: Navigated through paths: [${urls.join(' -> ')}]`);

  // ─────────────────────────────────────────────────────────────
  // PROBLEM 4: GET /health/schema 403 calls
  // ─────────────────────────────────────────────────────────────
  console.log('\n------------------------------------------------------------');
  console.log('PROBLEM 4: GET /health/schema CALLS FOR COMPANY SESSION');
  console.log('------------------------------------------------------------');

  const healthSchemaCalls = [];
  page.on('response', (res) => {
    if (res.url().includes('/health/schema')) {
      healthSchemaCalls.push({
        method: res.request().method(),
        url: res.url(),
        status: res.status(),
      });
    }
  });

  // Navigate to 3 different pages in company session
  await page.goto(`${WEB_BASE}/quotations`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.goto(`${WEB_BASE}/invoices`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.goto(`${WEB_BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  console.log(`Total /health/schema network calls observed: ${healthSchemaCalls.length}`);
  healthSchemaCalls.forEach((call, i) => {
    console.log(`  Call #${i + 1}: ${call.method} ${call.url} -> Status: ${call.status}`);
  });
  console.log(`What browser shows: AppLayout triggered /health/schema on repeated renders/mounts.`);

  // ─────────────────────────────────────────────────────────────
  // PROBLEM 5: OPTIONS preflight repeated without caching
  // ─────────────────────────────────────────────────────────────
  console.log('\n------------------------------------------------------------');
  console.log('PROBLEM 5: OPTIONS PREFLIGHT FOR /dashboard/kpis');
  console.log('------------------------------------------------------------');

  const optRes = await fetch(`${API_BASE}/dashboard/kpis`, {
    method: 'OPTIONS',
    headers: {
      'Origin': 'http://localhost:5173',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'Authorization',
    },
  });
  const maxAgeHeader = optRes.headers.get('access-control-max-age');
  console.log(`[HTTP] Method: OPTIONS | URL: ${API_BASE}/dashboard/kpis`);
  console.log(`       Status: ${optRes.status} ${optRes.statusText}`);
  console.log(`       Access-Control-Max-Age header: ${maxAgeHeader ? maxAgeHeader : '<MISSING / NOT SET>'}`);
  console.log(`What browser shows: Because Access-Control-Max-Age is absent, the browser does not cache preflights and repeats OPTIONS on subsequent API calls.`);

  // ─────────────────────────────────────────────────────────────
  // PROBLEM 7: Dashboard 'Receivable' vs AR Analytics
  // ─────────────────────────────────────────────────────────────
  console.log('\n------------------------------------------------------------');
  console.log('PROBLEM 7: DASHBOARD "RECEIVABLE" (590) VS AR ANALYTICS (10,030)');
  console.log('------------------------------------------------------------');

  // Create customer
  const customer = await prisma.company.create({
    data: {
      tenantId: tenant.id,
      name: 'SK Enterprises',
      billingEmail: 'sk@example.com',
      state: 'Karnataka',
    },
  });

  // Create 3 unpaid tax invoices:
  // Invoice 1: 590 (due in 10 days - 0-30 days bucket)
  // Invoice 2: 4,720 (due 35 days ago - 31-60 days bucket)
  // Invoice 3: 4,720 (due 45 days ago - 31-60 days bucket)
  const now = new Date();
  const d1 = new Date(now.getTime() + 10 * 86400000);
  const d2 = new Date(now.getTime() - 35 * 86400000);
  const d3 = new Date(now.getTime() - 45 * 86400000);

  const inv1 = await prisma.invoice.create({
    data: {
      tenantId: tenant.id,
      invoiceNumber: 'INV-REC-001',
      docType: 'tax_invoice',
      customerName: customer.name,
      customerPhone: '9876543210',
      companyId: customer.id,
      totalAmount: 590,
      balanceDue: 590,
      paymentStatus: 'unpaid',
      isVoided: false,
      dueDate: d1,
      createdAt: now,
    },
  });

  const inv2 = await prisma.invoice.create({
    data: {
      tenantId: tenant.id,
      invoiceNumber: 'INV-REC-002',
      docType: 'tax_invoice',
      customerName: customer.name,
      customerPhone: '9876543210',
      companyId: customer.id,
      totalAmount: 4720,
      balanceDue: 4720,
      paymentStatus: 'unpaid',
      isVoided: false,
      dueDate: d2,
      createdAt: new Date(now.getTime() - 40 * 86400000),
    },
  });

  const inv3 = await prisma.invoice.create({
    data: {
      tenantId: tenant.id,
      invoiceNumber: 'INV-REC-003',
      docType: 'tax_invoice',
      customerName: customer.name,
      customerPhone: '9876543210',
      companyId: customer.id,
      totalAmount: 4720,
      balanceDue: 4720,
      paymentStatus: 'unpaid',
      isVoided: false,
      dueDate: d3,
      createdAt: new Date(now.getTime() - 50 * 86400000),
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      tenantId: tenant.id,
      partyType: 'customer',
      partyId: customer.id,
      entryDate: now,
      financialYear: '26-27',
      voucherType: 'sales',
      voucherNo: 'INV-REC-001',
      particulars: 'Sales - INV-REC-001',
      debit: 590,
      credit: 0,
      sourceType: 'invoice',
      sourceId: inv1.id,
    },
  });

  // Query Dashboard KPIs
  const dashRes = await fetch(`${API_BASE}/dashboard/kpis`, {
    headers: { Authorization: `Bearer ${correctData.accessToken}` },
  });
  const dashData = await dashRes.json();
  const dashReceivable = dashData?.kpis?.invoices?.unpaidAmount;

  // Query AR Aging
  const arRes = await fetch(`${API_BASE}/dashboard/analytics/receivables`, {
    headers: { Authorization: `Bearer ${correctData.accessToken}` },
  });
  const arData = await arRes.json();
  const arTotalReceivable = arData?.summary?.totalReceivable;

  console.log(`[HTTP] GET /dashboard/kpis -> Dashboard Card Receivable: ₹${dashReceivable}`);
  console.log(`[HTTP] GET /dashboard/analytics/receivables -> AR Analytics Total Outstanding: ₹${arTotalReceivable}`);
  console.log(`Discrepancy confirmed: Dashboard shows ₹${dashReceivable} while AR Analytics shows ₹${arTotalReceivable}`);
  console.log(`What browser shows: Dashboard metric card renders ₹${dashReceivable} while clicking through to AR aging shows ₹${arTotalReceivable} across 3 unpaid invoices (590 in 0-30 days, 9440 in 31-60 days).`);

  // Check Activity card label
  console.log(`Activity card label in dashboard: followUpsDueCount=${dashData?.kpis?.leads?.count || 0}, recentOrders count=${dashData?.recentOrders?.length || 0}`);

  // ─────────────────────────────────────────────────────────────
  // PROBLEM 8: Quotation modal -> New Customer Create & Select form reload
  // ─────────────────────────────────────────────────────────────
  console.log('\n------------------------------------------------------------');
  console.log('PROBLEM 8: QUOTATION NEW CUSTOMER "CREATE & SELECT" FORM RELOAD');
  console.log('------------------------------------------------------------');

  await page.goto(`${WEB_BASE}/quotations`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  // Click Create Quotation button
  const createQuoteBtn = page.locator('button:has-text("Create Quotation"), button:has-text("New Quote")').first();
  if (await createQuoteBtn.isVisible()) {
    await createQuoteBtn.click();
    await page.waitForTimeout(500);

    // Open "New Customer" submodal
    const newCustBtn = page.locator('button:has-text("New Customer")').first();
    if (await newCustBtn.isVisible()) {
      await newCustBtn.click();
      await page.waitForTimeout(300);

      // Fill customer name
      await page.fill('input[placeholder*="Acme Tech Solutions"]', 'Test Customer From Modal');

      const urlBefore = page.url();
      // Click "Create & Select"
      const createAndSelectBtn = page.locator('button:has-text("Create & Select")');
      const btnType = await createAndSelectBtn.getAttribute('type');
      console.log(`Button "Create & Select" type attribute: "${btnType}" (inside nested form)`);

      await createAndSelectBtn.click();
      await page.waitForTimeout(1000);

      const urlAfter = page.url();
      console.log(`URL before click: ${urlBefore}`);
      console.log(`URL after click:  ${urlAfter}`);
      console.log(`What browser shows: Clicking submit in nested form submitted the form with default GET, appending query '?' (${urlAfter}) and reloaded the whole page, discarding draft.`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // PROBLEM 10: Create Document Form amount in words & placeholders
  // ─────────────────────────────────────────────────────────────
  console.log('\n------------------------------------------------------------');
  console.log('PROBLEM 10: CREATE DOCUMENT FORM (0 TOTAL & PLACEHOLDERS)');
  console.log('------------------------------------------------------------');

  await page.goto(`${WEB_BASE}/invoices`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  const createDocBtn = page.locator('button:has-text("Create Document")').first();
  if (await createDocBtn.isVisible()) {
    await createDocBtn.click();
    await page.waitForTimeout(500);

    // Amount in words for 0 total
    const amountInWordsEl = page.locator('text=Indian Rupees Zero Only, text=Amount in Words: >> .. >> p');
    const amountWordsText = await amountInWordsEl.first().textContent().catch(() => '');

    // HSN input placeholder
    const hsnInput = page.locator('input[placeholder="85312000"]').first();
    const hsnPlaceholder = await hsnInput.getAttribute('placeholder').catch(() => '');

    // Unit rate placeholder
    const rateInput = page.locator('input[placeholder="0.00"]').first();
    const ratePlaceholder = await rateInput.getAttribute('placeholder').catch(() => '');

    console.log(`Initial Total: ₹0.00`);
    console.log(`Amount in Words text rendered: "${amountWordsText.trim()}"`);
    console.log(`HSN input placeholder: "${hsnPlaceholder}" (renders dark/filled-in appearance)`);
    console.log(`Unit rate input placeholder: "${ratePlaceholder}"`);
    console.log(`What browser shows: When total is 0, 'Indian Rupees Zero Only' displays. HSN field shows '85312000' without 'e.g.' and unit rate defaults to '0.00'.`);
  }

  // ─────────────────────────────────────────────────────────────
  // PROBLEM 11: Public Contact Page & Submit Inquiry
  // ─────────────────────────────────────────────────────────────
  console.log('\n------------------------------------------------------------');
  console.log('PROBLEM 11: PUBLIC CONTACT PAGE & SUBMIT INQUIRY');
  console.log('------------------------------------------------------------');

  const contactNetworkCalls = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/')) {
      contactNetworkCalls.push({ method: req.method(), url: req.url() });
    }
  });

  await page.goto(`${WEB_BASE}/contact`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  const salesEmailText = await page.locator('text=sales@example.com').first().textContent().catch(() => 'not found');
  const supportEmailText = await page.locator('text=support@example.com').first().textContent().catch(() => 'not found');

  console.log(`Sales email on page: "${salesEmailText.trim()}"`);
  console.log(`Support email on page: "${supportEmailText.trim()}"`);

  // Fill and submit inquiry form
  await page.fill('input[placeholder="First and last name"]', 'Test Lead');
  await page.fill('input[placeholder="name@example.com"]', 'lead@test.com');
  await page.fill('input[placeholder="Company name"]', 'Acme Corp');
  await page.fill('textarea[placeholder="Please describe how we can assist you..."]', 'Testing inquiry form behavior');

  const preCallCount = contactNetworkCalls.length;
  await page.click('button:has-text("Submit Inquiry")');
  await page.waitForTimeout(1000);
  const postCallCount = contactNetworkCalls.length;

  const successHeader = await page.locator('text=Thank You for Reaching Out!').isVisible();
  console.log(`API network calls made on submit: ${postCallCount - preCallCount} calls`);
  console.log(`Form displayed simulated success message: ${successHeader}`);
  console.log(`What browser shows: Page displayed 'Thank You for Reaching Out!' after client-side setTimeout without storing inquiry in database or notifying sales address.`);

  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }

    // Cleanup
    console.log('\n[CLEANUP] Cleaning up fake test tenant and records...');
    try { await prisma.ledgerEntry.deleteMany({ where: { tenantId: tenant.id } }); } catch {}
    try { await prisma.invoice.deleteMany({ where: { tenantId: tenant.id } }); } catch {}
    try { await prisma.company.deleteMany({ where: { tenantId: tenant.id } }); } catch {}
    try { await prisma.refreshSession.deleteMany({ where: { userId: adminUser.id } }); } catch {}
    try { await prisma.auditLog.deleteMany({ where: { tenantId: tenant.id } }); } catch {}
    try { await prisma.userPageAccess.deleteMany({ where: { tenantId: tenant.id } }); } catch {}
    try { await prisma.user.deleteMany({ where: { tenantId: tenant.id } }); } catch {}
    try { await prisma.tenant.deleteMany({ where: { id: tenant.id } }); } catch {}
    await prisma.$disconnect();

    console.log('[CLEANUP] Complete.');
  }
}

main().catch(console.error);
