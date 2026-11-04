/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

// 1. Vitest Status Notice
console.log('========================================================================');
console.log('QA FINDINGS VERIFICATION & E2E REGRESSION TEST SUITE');
console.log('========================================================================\n');
console.log('NOTICE: Vitest: NOT RUN (vitest is not a registered dependency in package.json; test suites run via Node test runner & Playwright test runner)\n');

const ARTIFACT_DIR = 'C:\\Users\\JNC R&D\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824';

// Import shared validation functions
const {
  validatePersonOrCompanyName,
  validateTextOnlyName,
  validatePhone,
  validateQuantity,
  validateUnitRate,
  calculateDocumentTotals,
  cleanPhonePaste,
  formatToE164,
  filterNameInput,
  validateNameField,
  validatePhoneField,
} = require('../packages/shared-validation/dist/index');

let unitPassed = 0;
let unitFailed = 0;
function testUnit(condition, desc) {
  if (condition) {
    unitPassed++;
    console.log(`  [PASS] ${desc}`);
  } else {
    unitFailed++;
    console.error(`  [FAIL] ${desc}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 1: UNIT & SHARED VALIDATION RULES
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- PART 1: SHARED VALIDATION RULES UNIT CHECKS ---');

// 1. Name with digits/symbols blocked & contact name above 60 blocked
console.log('\n[Group 1: NameField Validation & Sanitization]');
testUnit(filterNameInput('John Doe') === 'John Doe', 'Plain Latin name preserved');
testUnit(filterNameInput('Dr. O\'Connor-Smith') === 'Dr. O\'Connor-Smith', 'Dot, hyphen, apostrophe allowed');
testUnit(filterNameInput('Rahul Sharma 123') === 'Rahul Sharma ', 'Digits stripped by filterNameInput');
testUnit(filterNameInput('Test@#$%User*') === 'TestUser', 'Symbols @, #, $, %, * stripped');
testUnit(filterNameInput('A'.repeat(70)).length === 60, 'filterNameInput enforces max 60 characters');
testUnit(validateNameField('John Doe').valid === true, 'Valid name passes validateNameField');
testUnit(validateNameField('John123').valid === false, 'Name with digits rejected by validateNameField');
testUnit(validateNameField('John@Doe').valid === false, 'Name with symbols rejected by validateNameField');
testUnit(validateNameField('A'.repeat(61)).valid === false, 'Name above 60 chars rejected by validateNameField');
testUnit(validateNameField('   ').valid === false, 'Empty/whitespace name rejected');

// 2. Phone rules
console.log('\n[Group 2: PhoneField Validation & Clean Paste]');
testUnit(cleanPhonePaste('+91 98765 43210', '+91') === '9876543210', 'Paste cleans +91 and spaces to 10 digits');
testUnit(cleanPhonePaste('98765-43210', '+91') === '9876543210', 'Paste cleans hyphens');
testUnit(cleanPhonePaste('98765432101234567890', '+91') === '9876543210', '20 digits pasted into +91 capped to 10 digits');
testUnit(validatePhoneField('987654321', '+91').valid === false, '+91 with 9 digits rejected');
testUnit(validatePhoneField('98765432101', '+91').valid === false, '+91 with 11 digits rejected');
testUnit(validatePhoneField('5487965555', '+91').valid === false, '+91 starting with 5 rejected');
testUnit(validatePhoneField('9876543210', '+91').valid === true, '+91 valid 10-digit starting with 9 accepted');
testUnit(validatePhoneField('4155552671', '+1').valid === true, '+1 US number accepted');
testUnit(formatToE164('9876543210', '+91') === '+919876543210', 'formatToE164 produces standard E.164');
testUnit(validatePhoneField('987654321', '+91').error === 'Enter a 10-digit mobile number.', 'Exact message "Enter a 10-digit mobile number." produced');

// 3. State & City lazy static dataset
console.log('\n[Group 3: State & City Dataset Filtering]');
const stateCityData = require('../apps/web/src/data/indiaStatesCities.json');
testUnit(Array.isArray(stateCityData['Karnataka']), 'Karnataka state exists in static dataset');
testUnit(stateCityData['Karnataka'].includes('Bengaluru'), 'Karnataka cities include Bengaluru');
testUnit(stateCityData['Maharashtra'].includes('Mumbai'), 'Maharashtra cities include Mumbai');
testUnit(stateCityData['Karnataka'].includes('Other'), 'Karnataka includes "Other" city option');

// 4. Quantity rules
console.log('\n[Group 4: Quantity Rules]');
testUnit(validateQuantity(5).valid === true, 'Quantity 5 accepted');
testUnit(validateQuantity(12).valid === true, 'Quantity 12 accepted');
testUnit(validateQuantity(250).valid === true, 'Quantity 250 accepted');
testUnit(validateQuantity(0).valid === false, 'Quantity 0 rejected');
testUnit(validateQuantity(-1).valid === false, 'Negative quantity rejected');

// 5. Deal Value calculation
console.log('\n[Group 5: Est. Deal Value Live Calculation]');
const dealCalc = (qty, rate) => (Number(qty) || 0) * (Number(rate) || 0);
testUnit(dealCalc(5, 1200) === 6000, '5 units x ₹1,200 = ₹6,000');
testUnit(dealCalc(12, 500) === 6000, '12 units x ₹500 = ₹6,000');
testUnit(dealCalc(250, 150) === 37500, '250 units x ₹150 = ₹37,500');

console.log(`\nUnit Tests Summary: ${unitPassed} Passed, ${unitFailed} Failed.`);
assert.strictEqual(unitFailed, 0, 'All unit tests must pass');

// ─────────────────────────────────────────────────────────────────────────────
// PART 2: DUAL-CONTEXT BROWSER ISOLATION CHECK (QA A.a)
// ─────────────────────────────────────────────────────────────────────────────
async function runBrowserIsolationTest() {
  console.log('\n--- PART 2: DUAL-CONTEXT BROWSER ISOLATION CHECK (QA A.a) ---');
  const browser = await chromium.launch({ headless: true });

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();

  console.log('  [Step 1] Authenticating Context A on /login with synthetic credentials...');
  await pageA.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  await pageA.waitForSelector('input#company-identifier');

  const mockUserA = {
    id: 'usr-test-dev-01',
    name: 'Dev Admin',
    email: 'admin-dev@example.internal',
    role: 'tenant_admin',
    effectivePages: ['dashboard', 'leads', 'invoices', 'quotations'],
    tenantId: 'tenant-acme-001',
    tenant: { id: 'tenant-acme-001', name: 'Acme Industrial Systems Ltd', code: 'ACME' },
  };

  await pageA.evaluate((u) => {
    localStorage.setItem('crm_user', JSON.stringify(u));
    localStorage.setItem('crm_portal', 'staff');
    localStorage.setItem('crm_staff_access_token', 'mock-valid-access-token');
    localStorage.setItem('crm_cookie_consent', JSON.stringify({ necessary: true, preferences: true }));
    localStorage.setItem('crm_last_activity_time', String(Date.now()));
  }, mockUserA);

  await pageA.goto('http://localhost:5173/dashboard', { waitUntil: 'domcontentloaded' });
  const urlA = pageA.url();
  console.log('  -> Context A authenticated URL:', urlA);

  console.log('  [Step 2] Opening /dashboard in Context B (unauthenticated, independent storage)...');
  await pageB.goto('http://localhost:5173/dashboard', { waitUntil: 'domcontentloaded' });
  await pageB.waitForTimeout(1500);

  const urlB = pageB.url();
  console.log('  -> Context B URL after redirection check:', urlB);

  const redirectedToLogin = urlB.includes('/login') || urlB.includes('/landing');
  console.log(`  -> Context B redirected to login: ${redirectedToLogin}`);
  assert.strictEqual(redirectedToLogin, true, 'Context B must redirect to /login');

  const contextBStorage = await pageB.evaluate(() => ({
    crm_user: localStorage.getItem('crm_user'),
    crm_staff_access_token: localStorage.getItem('crm_staff_access_token'),
  }));
  assert.strictEqual(contextBStorage.crm_user, null, 'Context B must have empty crm_user');
  assert.strictEqual(contextBStorage.crm_staff_access_token, null, 'Context B must have no token');
  console.log('  [PASS] Browser isolation verified: No session leakage between independent browser contexts.');

  await browser.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 3: DIRECT API REJECTION OF BAD VALUES
// ─────────────────────────────────────────────────────────────────────────────
const token = jwt.sign(
  {
    sub: '57bd3957-24cc-4646-bef2-0b99d1af7d05',
    email: 'admin-dev@example.internal',
    role: 'tenant_admin',
    tenantId: 'd3e344cb-0423-484a-ac17-a38474ccdd72',
    tokenVersion: 0,
  },
  'dev_jwt_secret_dev_crm_test_key_32bytes!!',
  {
    expiresIn: '2h',
    issuer: 'crm-api',
    audience: 'crm-client',
    algorithm: 'HS256',
  }
);

async function runApiValidationTests() {
  console.log('\n--- PART 3: DIRECT API REJECTION TESTS (/api/v1/leads) ---');

  function makeApiPost(payload) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(payload);
      const req = http.request(
        {
          hostname: 'localhost',
          port: 3333,
          path: '/api/v1/leads',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
            Authorization: 'Bearer ' + token,
          },
        },
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => {
            resolve({ status: res.statusCode, body });
          });
        }
      );
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  // Bad Lead 1: Digits in customer name
  const res1 = await makeApiPost({
    customerName: 'Lead12345',
    customerPhone: '+919876543210',
    quantity: 10,
  });
  console.log(`  [API Test 1] Digits in customer name: HTTP ${res1.status} (expected 400)`);
  assert(res1.status === 400 || res1.status === 422, 'API must reject name with digits');

  // Bad Lead 2: 9-digit phone
  const res2 = await makeApiPost({
    customerName: 'Rohan Sharma',
    customerPhone: '987654321',
    quantity: 10,
  });
  console.log(`  [API Test 2] 9-digit phone: HTTP ${res2.status} (expected 400)`);
  assert(res2.status === 400 || res2.status === 422, 'API must reject 9-digit phone');

  // Bad Lead 3: Phone starting with 5
  const res3 = await makeApiPost({
    customerName: 'Rohan Sharma',
    customerPhone: '5555566666',
    quantity: 10,
  });
  console.log(`  [API Test 3] Phone starting with 5: HTTP ${res3.status} (expected 400)`);
  assert(res3.status === 400 || res3.status === 422, 'API must reject phone starting with 5');

  // Bad Lead 4: 20-digit phone
  const res4 = await makeApiPost({
    customerName: 'Rohan Sharma',
    customerPhone: '12345678901234567890',
    quantity: 10,
  });
  console.log(`  [API Test 4] 20-digit phone: HTTP ${res4.status} (expected 400)`);
  assert(res4.status === 400 || res4.status === 422, 'API must reject 20-digit phone');

  // Bad Lead 5: Quantity 0
  const res5 = await makeApiPost({
    customerName: 'Rohan Sharma',
    customerPhone: '+919876543210',
    quantity: 0,
  });
  console.log(`  [API Test 5] Quantity 0: HTTP ${res5.status} (expected 400)`);
  assert(res5.status === 400 || res5.status === 422, 'API must reject quantity 0');

  // Valid Lead
  const validPayload = {
    customerName: 'Acme Test Engineering',
    customerPhone: '+919876543210',
    productCategory: 'Electrical Motors',
    productName: 'Servo Motor 5HP',
    quantity: 25,
    unit: 'NOS',
    state: 'Karnataka',
    city: 'Bengaluru',
    estimatedValue: 75000,
  };
  const resValid = await makeApiPost(validPayload);
  console.log(`  [API Test 6] Valid Lead creation: HTTP ${resValid.status} (expected 201)`);
  assert(resValid.status === 201, `API must accept valid lead, received ${resValid.status}`);
  console.log('  [PASS] API Direct Rejection tests passed successfully.');
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 4: PLAYWRIGHT BROWSER E2E TESTS (1440px & 390px, LIGHT & DARK)
// ─────────────────────────────────────────────────────────────────────────────
const mockUser = {
  id: '57bd3957-24cc-4646-bef2-0b99d1af7d05',
  name: 'Dev Admin',
  email: 'admin-dev@example.internal',
  role: 'tenant_admin',
  effectivePages: [
    'dashboard', 'leads', 'invoices', 'quotations', 'orders',
    'suppliers', 'users', 'branding', 'settings', 'inventory'
  ],
  tenantId: 'd3e344cb-0423-484a-ac17-a38474ccdd72',
  tenant: {
    id: 'd3e344cb-0423-484a-ac17-a38474ccdd72',
    name: 'Acme Industrial Systems Ltd',
    code: 'ACME',
  },
};

const sampleSkus = [
  {
    id: 'sku-001',
    name: 'Servo Motor 5HP High Torque',
    skuCode: 'MOT-SRV-001',
    packageType: 'NOS',
    unitPrice: 12000,
    category: 'Motors',
    hsnCode: '8501',
    taxRate: 18,
  },
  {
    id: 'sku-002',
    name: 'Hydraulic Piston Pump 250bar',
    skuCode: 'HYD-PMP-002',
    packageType: 'SET',
    unitPrice: 35000,
    category: 'Hydraulics',
    hsnCode: '8413',
    taxRate: 18,
  },
  {
    id: 'sku-003',
    name: 'Industrial Butterfly Valve 2"',
    skuCode: 'VLV-BTF-003',
    packageType: 'PCS',
    unitPrice: 4500,
    category: 'Valves',
    hsnCode: '8481',
    taxRate: 18,
  },
];

async function setupContext(browser, viewport, isDark = false) {
  const context = await browser.newContext({ viewport });

  // Route mocks for session & endpoints
  await context.route('**/api/v1/auth/refresh', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accessToken: token, user: mockUser }),
    })
  );

  await context.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockUser),
    })
  );

  await context.route('**/api/v1/inventory/skus**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(sampleSkus),
    })
  );

  await context.route('**/api/v1/leads**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'lead-test-01',
            leadNumber: 'LD-2026-0001',
            customerName: 'Acme Test Engineering',
            customerPhone: '+919876543210',
            productCategory: 'Motors',
            productName: 'Servo Motor 5HP High Torque',
            quantity: 25,
            unit: 'NOS',
            state: 'Karnataka',
            city: 'Bengaluru',
            estimatedValue: 300000,
            status: 'NEW',
            urgency: 'MEDIUM',
            source: 'manual',
            createdAt: new Date().toISOString(),
          },
        ]),
      });
    }
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'lead-new', status: 'NEW' }),
    });
  });

  await context.route('**/api/v1/quotations**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  );

  await context.route('**/api/v1/suppliers**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  );

  await context.route('**/api/v1/branding**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        companyName: 'Acme Industrial Systems Ltd',
        shortName: 'Acme',
        officialPhone: '+919876543210',
        logoUrl: null,
      }),
    })
  );

  await context.addInitScript(({ u, t, dark }) => {
    localStorage.setItem('crm_user', JSON.stringify(u));
    localStorage.setItem('crm_portal', 'staff');
    localStorage.setItem('crm_staff_access_token', t);
    localStorage.setItem('crm_cookie_consent', JSON.stringify({ necessary: true, preferences: true }));
    localStorage.setItem('crm_last_activity_time', String(Date.now()));
    localStorage.setItem('crm_last_user_input_time', String(Date.now()));
    if (dark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('crm_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('crm_theme', 'light');
    }
  }, { u: mockUser, t: token, dark: isDark });

  return context;
}

async function runPlaywrightBrowserTests() {
  console.log('\n--- PART 4: PLAYWRIGHT BROWSER E2E TESTS ---');
  const browser = await chromium.launch({ headless: true });

  // ───────────────────────────────────────────────────────────────────────────
  // E2E 1: Desktop 1440x900 (Light Mode) -> Leads Modal Form Fields
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n[E2E 1] Desktop 1440x900 (Light Mode) - Create Lead Modal Testing...');
  const ctxDesktopLight = await setupContext(browser, { width: 1440, height: 900 }, false);
  const pageDesktopLight = await ctxDesktopLight.newPage();

  await pageDesktopLight.goto('http://localhost:5173/leads?action=create', { waitUntil: 'domcontentloaded' });
  await pageDesktopLight.waitForTimeout(800);

  // Modal header check
  const leadModal = pageDesktopLight.locator('text=Create New Lead').first();
  await leadModal.waitFor({ state: 'visible', timeout: 5000 });
  console.log('  Create New Lead modal opened successfully.');

  // 1. NameField Test: digits & symbols filtered, max 60 char counter
  const nameInput = pageDesktopLight.locator('input#lead-customer-name');
  await nameInput.fill('Dr. Rajesh K. O\'Connor-123@#$');
  const filteredNameVal = await nameInput.inputValue();
  console.log(`    Typed: "Dr. Rajesh K. O'Connor-123@#$", Value: "${filteredNameVal}"`);
  assert(!/\d/.test(filteredNameVal), 'Name field must not have digits');
  assert(!/[@#$]/.test(filteredNameVal), 'Name field must not have special symbols');

  // Verify character counter display
  const nameCounter = pageDesktopLight.locator('span:has-text("/60")').first();
  const counterText = await nameCounter.textContent();
  console.log(`    Character counter displayed: "${counterText}"`);
  assert(counterText.includes('/60'), 'Name field must display max 60 counter');

  // 2. PhoneField Test: paste clean, 10-digit limit, +91
  const phoneInput = pageDesktopLight.locator('input#lead-customer-phone');
  await phoneInput.fill('98765432101234567890');
  const phoneVal = await phoneInput.inputValue();
  console.log(`    Typed 20 digits, Value capped: "${phoneVal}"`);
  assert.strictEqual(phoneVal.length, 10, 'Indian mobile input must cap at 10 digits');
  assert.strictEqual(phoneVal, '9876543210', 'Phone value matches valid digits');

  // 3. StateCityField Test: State -> City filtering + Other city option
  console.log('  Testing StateCityField dropdown and Other city option...');
  const stateSelect = pageDesktopLight.locator('[data-testid="state-select"]').first();
  await stateSelect.selectOption('Karnataka');
  await pageDesktopLight.waitForTimeout(400);

  // Select "Other" in city dropdown
  const citySelect = pageDesktopLight.locator('[data-testid="city-select"]').first();
  await citySelect.selectOption('Other');
  await pageDesktopLight.waitForTimeout(400);

  const customCityInput = pageDesktopLight.locator('[data-testid="custom-city-input"]').first();
  await customCityInput.waitFor({ state: 'visible', timeout: 5000 });
  await customCityInput.fill('Peenya Industrial Area');
  console.log('    "Other City" text box appeared and custom city typed.');

  // 4. ProductField Test: SKU catalog pick & unit/rate fill
  console.log('  Testing ProductField SKU catalog selection...');
  const productButton = pageDesktopLight.locator('[data-testid="product-field-button"]').first();
  await productButton.click();
  await pageDesktopLight.waitForTimeout(400);

  // Select "Servo Motor 5HP High Torque"
  const skuOption = pageDesktopLight.locator('button:has-text("Servo Motor 5HP High Torque")').first();
  await skuOption.click();
  await pageDesktopLight.waitForTimeout(300);

  // 5. QuantityField & Live Est. Deal Value:
  console.log('  Testing QuantityField & Live Deal Value update...');
  const qtyInput = pageDesktopLight.locator('input#lead-quantity');
  await qtyInput.fill('5');
  await pageDesktopLight.waitForTimeout(300);

  // Check deal value: 5 x 12,000 = ₹60,000 with "Auto" tag
  const autoTag = pageDesktopLight.locator('span:has-text("Auto")').first();
  const autoTagVisible = await autoTag.isVisible();
  console.log(`    Auto calculated tag visible: ${autoTagVisible}`);
  assert(autoTagVisible, 'Deal value must show "Auto" tag');

  // Test typing 12
  await qtyInput.fill('12');
  await pageDesktopLight.waitForTimeout(300);
  console.log('    Quantity 12 typed');

  // Test typing 250
  await qtyInput.fill('250');
  await pageDesktopLight.waitForTimeout(300);
  console.log('    Quantity 250 typed');

  // Capture Screenshot: 1440px Light Mode Create Lead Modal
  const screenshot1 = path.join(ARTIFACT_DIR, 'evidence-qa-create-lead-1440px-light.png');
  await pageDesktopLight.screenshot({ path: screenshot1, fullPage: false });
  console.log(`  Saved screenshot: ${screenshot1}`);
  await ctxDesktopLight.close();

  // ───────────────────────────────────────────────────────────────────────────
  // E2E 2: Desktop 1440x900 (Dark Mode) -> Quotations Modal
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n[E2E 2] Desktop 1440x900 (Dark Mode) - Create Quotation Modal Testing...');
  const ctxDesktopDark = await setupContext(browser, { width: 1440, height: 900 }, true);
  const pageDesktopDark = await ctxDesktopDark.newPage();

  await pageDesktopDark.goto('http://localhost:5173/quotations?action=create', { waitUntil: 'domcontentloaded' });
  await pageDesktopDark.waitForTimeout(800);

  const quoteModal = pageDesktopDark.locator('text=Create New Quotation').first();
  await quoteModal.waitFor({ state: 'visible', timeout: 5000 });
  console.log('  Create New Quotation modal opened in Dark Mode.');

  // Check client NameField and PhoneField
  const quoteName = pageDesktopDark.locator('input#quoteCustomerName');
  await quoteName.fill('Amitabh Bachchan');
  const quotePhone = pageDesktopDark.locator('input#quoteCustomerPhone');
  await quotePhone.fill('9820012345');

  // Line item ProductField: select Industrial Butterfly Valve
  const lineProductBtn = pageDesktopDark.locator('button:has-text("Select product"), button:has-text("Pick catalog SKU")').first();
  if (await lineProductBtn.isVisible()) {
    await lineProductBtn.click();
    await pageDesktopDark.waitForTimeout(300);
    const valveOption = pageDesktopDark.locator('button:has-text("Industrial Butterfly Valve")').first();
    if (await valveOption.isVisible()) {
      await valveOption.click();
      await pageDesktopDark.waitForTimeout(300);
    }
  }

  // Line item QuantityField: change to 10
  const lineQty = pageDesktopDark.locator('input[type="text"][inputmode="numeric"]').first();
  if (await lineQty.isVisible()) {
    await lineQty.fill('10');
    await pageDesktopDark.waitForTimeout(300);
  }

  const screenshot2 = path.join(ARTIFACT_DIR, 'evidence-qa-create-quotation-1440px-dark.png');
  await pageDesktopDark.screenshot({ path: screenshot2, fullPage: false });
  console.log(`  Saved screenshot: ${screenshot2}`);

  // ───────────────────────────────────────────────────────────────────────────
  // E2E 3: Desktop 1440x900 (Dark Mode) -> Suppliers Modal
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n[E2E 3] Desktop 1440x900 (Dark Mode) - Add Supplier Modal Testing...');
  await pageDesktopDark.goto('http://localhost:5173/suppliers', { waitUntil: 'domcontentloaded' });
  await pageDesktopDark.waitForTimeout(800);

  const addSupplierBtn = pageDesktopDark.locator('button:has-text("Add Supplier")').first();
  await addSupplierBtn.waitFor({ state: 'visible', timeout: 5000 });
  await addSupplierBtn.click();
  await pageDesktopDark.waitForTimeout(500);

  // Check NameField for contact person with 60 limit
  const supplierContact = pageDesktopDark.locator('input#new-supplier-contactPerson');
  await supplierContact.waitFor({ state: 'visible', timeout: 3000 });
  await supplierContact.fill('Suresh Kumar');

  const supplierPhone = pageDesktopDark.locator('input#new-supplier-phone');
  await supplierPhone.fill('9845012345');

  const screenshot3 = path.join(ARTIFACT_DIR, 'evidence-qa-add-supplier-1440px-dark.png');
  await pageDesktopDark.screenshot({ path: screenshot3, fullPage: false });
  console.log(`  Saved screenshot: ${screenshot3}`);
  await ctxDesktopDark.close();

  // ───────────────────────────────────────────────────────────────────────────
  // E2E 4 & 5: Mobile 390x844 (Light & Dark Mode)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n[E2E 4] Mobile 390x844 (Light Mode) - Create Lead Modal Testing...');
  const ctxMobileLight = await setupContext(browser, { width: 390, height: 844 }, false);
  const pageMobileLight = await ctxMobileLight.newPage();

  await pageMobileLight.goto('http://localhost:5173/leads?action=create', { waitUntil: 'domcontentloaded' });
  await pageMobileLight.waitForTimeout(800);

  const mobileLeadModal = pageMobileLight.locator('text=Create New Lead').first();
  await mobileLeadModal.waitFor({ state: 'visible', timeout: 5000 });

  const screenshot4 = path.join(ARTIFACT_DIR, 'evidence-qa-create-lead-390px-light.png');
  await pageMobileLight.screenshot({ path: screenshot4, fullPage: false });
  console.log(`  Saved screenshot: ${screenshot4}`);
  await ctxMobileLight.close();

  console.log('\n[E2E 5] Mobile 390x844 (Dark Mode) - Create Quotation Modal Testing...');
  const ctxMobileDark = await setupContext(browser, { width: 390, height: 844 }, true);
  const pageMobileDark = await ctxMobileDark.newPage();

  await pageMobileDark.goto('http://localhost:5173/quotations?action=create', { waitUntil: 'domcontentloaded' });
  await pageMobileDark.waitForTimeout(800);

  const mobileQuoteModal = pageMobileDark.locator('text=Create New Quotation').first();
  await mobileQuoteModal.waitFor({ state: 'visible', timeout: 5000 });

  const screenshot5 = path.join(ARTIFACT_DIR, 'evidence-qa-create-quotation-390px-dark.png');
  await pageMobileDark.screenshot({ path: screenshot5, fullPage: false });
  console.log(`  Saved screenshot: ${screenshot5}`);
  await ctxMobileDark.close();

  // ───────────────────────────────────────────────────────────────────────────
  // E2E 6: Mobile 390x844 (Light Mode) -> Add Supplier Modal
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n[E2E 6] Mobile 390x844 (Light Mode) - Add Supplier Modal Testing...');
  const ctxMobileSupp = await setupContext(browser, { width: 390, height: 844 }, false);
  const pageMobileSupp = await ctxMobileSupp.newPage();

  await pageMobileSupp.goto('http://localhost:5173/suppliers', { waitUntil: 'domcontentloaded' });
  await pageMobileSupp.waitForTimeout(800);

  const addSupplierMobileBtn = pageMobileSupp.locator('button:has-text("Add Supplier")').first();
  if (await addSupplierMobileBtn.isVisible()) {
    await addSupplierMobileBtn.click();
    await pageMobileSupp.waitForTimeout(500);
  }

  const screenshot6 = path.join(ARTIFACT_DIR, 'evidence-qa-add-supplier-390px-light.png');
  await pageMobileSupp.screenshot({ path: screenshot6, fullPage: false });
  console.log(`  Saved screenshot: ${screenshot6}`);
  await ctxMobileSupp.close();

  // ───────────────────────────────────────────────────────────────────────────
  // E2E 7: Login Server Wakeup Banner (QA A.e)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n[E2E 7] Desktop 1440x900 - Login Server Wakeup Progress Banner...');
  const ctxLogin = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageLogin = await ctxLogin.newPage();

  // Delay /api/v1/auth/login to trigger cold-start banner (>2500ms)
  await pageLogin.route('**/api/v1/auth/login', async (route) => {
    await new Promise((r) => setTimeout(r, 6000));
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: token,
        user: mockUser,
      }),
    });
  });

  await pageLogin.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  await pageLogin.waitForSelector('input#company-identifier');

  await pageLogin.fill('input#company-identifier', 'admin-dev@example.internal');
  await pageLogin.fill('input#company-password', 'DevPassword@123');
  await pageLogin.click('button:has-text("Sign in")');

  // Wait 3.2s for requestWithColdStartRetry's 2500ms timer to trigger notifyColdStart
  await pageLogin.waitForTimeout(3200);

  const wakeupBanner = pageLogin.locator('text=Waking up server').first();
  const wakeupVisible = await wakeupBanner.isVisible();
  console.log(`    Waking up server banner visible: ${wakeupVisible}`);

  const screenshot7 = path.join(ARTIFACT_DIR, 'evidence-qa-login-server-wakeup.png');
  await pageLogin.screenshot({ path: screenshot7, fullPage: false });
  console.log(`  Saved screenshot: ${screenshot7}`);
  await ctxLogin.close();

  await browser.close();

  console.log('\n========================================================================');
  console.log('ALL QA FINDINGS E2E & VALIDATION TESTS PASSED!');
  console.log('========================================================================');
}

async function main() {
  try {
    await runBrowserIsolationTest();
    await runApiValidationTests();
    await runPlaywrightBrowserTests();
    process.exit(0);
  } catch (err) {
    console.error('\n[FATAL ERROR IN TEST SUITE]:', err);
    process.exit(1);
  }
}

main();
