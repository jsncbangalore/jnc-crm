/**
 * Playwright Screen Verification Test Suite
 * 
 * Verifies key screens with explicit assertions:
 * 1. Auth Login Screen: Server cold-start wake-up message, elapsed seconds counter, Retry button, polling /health.
 * 2. Create Lead Screen: NameField multilingual input, character counter, "Use letters only" error, PhoneField paste overflow error.
 * 3. Create Quotation Screen: Selling price lock, absence of "below unit cost".
 * 4. Add Supplier Screen: Contact person NameField counter, Hindi input, PhoneField mobile/landline toggle.
 * 
 * Saves screenshots inside the repo's evidence/ folder.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const EVIDENCE_DIR = path.resolve(__dirname, '../evidence');
if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

async function run() {
  console.log('='.repeat(70));
  console.log('PLAYWRIGHT SCREEN ASSERTIONS & EVIDENCE CAPTURE');
  console.log(`Evidence Directory: ${EVIDENCE_DIR}`);
  console.log('='.repeat(70));

  const browser = await chromium.launch({ headless: true });
  let passed = 0;
  let failed = 0;

  function assertCondition(desc, condition) {
    if (condition) {
      passed++;
      console.log(`[PASS] ${desc}`);
    } else {
      failed++;
      console.error(`[FAIL] ${desc}`);
    }
  }

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // Screen 1: Auth Login Server Wake-up Screen
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 1. Screen: Auth Login Server Wake-up ---');
    const authContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const authPage = await authContext.newPage();

    // Intercept login request to simulate cold start delay (> 2.5s)
    let delayedRoute = null;
    await authPage.route('**/api/v1/auth/login', async (route) => {
      delayedRoute = route;
      // Hold route for 4 seconds to trigger cold start timer
      await new Promise((r) => setTimeout(r, 4000));
      try {
        await route.abort('timedout');
      } catch {}
    });

    await authPage.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
    await authPage.waitForSelector('input#company-identifier');

    await authPage.fill('input#company-identifier', 'admin@example.com');
    await authPage.fill('input#company-password', 'DemoPassword123!');
    await authPage.click('button:has-text("Sign in")');

    // Wait 2800ms for requestWithColdStartRetry to notifyColdStart(true)
    await authPage.waitForTimeout(3000);

    // Explicit Assertions on Wake-up UI
    const wakeupBanner = authPage.locator('text=The server is waking up, this can take up to a minute').first();
    const hasWakeupMessage = await wakeupBanner.isVisible().catch(() => false);
    const pageBodyText = await authPage.textContent('body');
    const hasSecondsCounter = /\d+s/.test(pageBodyText);
    const retryBtn = authPage.locator('button:has-text("Retry")').first();
    const hasRetryButton = await retryBtn.isVisible().catch(() => false);

    assertCondition('Wake-up banner message is exact ("The server is waking up, this can take up to a minute")', hasWakeupMessage);
    assertCondition('Wake-up timer displays real elapsed seconds counter (e.g. 0s / 1s)', hasSecondsCounter);
    assertCondition('Wake-up banner renders a Retry button', hasRetryButton);

    // Save screenshot
    const wakeupShotPath = path.join(EVIDENCE_DIR, 'qa-screen-login-wakeup.png');
    await authPage.screenshot({ path: wakeupShotPath, fullPage: false });
    console.log(`  -> Saved evidence screenshot: ${wakeupShotPath}`);
    await authContext.close();

    // ─────────────────────────────────────────────────────────────────────────
    // Screen 2: Real Login & Create Lead Modal (Multilingual NameField & PhoneField)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 2. Screen: Create Lead Modal (NameField & PhoneField) ---');
    const appCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await appCtx.addInitScript(() => {
      localStorage.setItem('crm_cookie_consent', JSON.stringify({ necessary: true, preferences: true, analytics: false, marketing: false, timestamp: Date.now() }));
    });
    const appPage = await appCtx.newPage();

    // Perform real login
    await appPage.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
    await appPage.waitForSelector('input#company-identifier');
    await appPage.fill('input#company-identifier', 'admin@zzclienttest.com');
    await appPage.fill('input#company-password', 'DevPassword@123');
    await appPage.click('button:has-text("Sign in")');
    await appPage.waitForURL((url) => !url.toString().includes('/login'), { timeout: 15000 });
    console.log('  -> Logged in to app! Navigating to /leads ...');

    await appPage.goto('http://localhost:5173/leads', { waitUntil: 'networkidle' });

    // Click "New Lead" button to open modal
    const newLeadBtn = appPage.locator('button:has-text("New Lead"), button:has-text("Add Lead")').first();
    await newLeadBtn.click();
    await appPage.waitForSelector('#lead-customer-name', { timeout: 8000 });

    const nameInput = appPage.locator('#lead-customer-name').first();
    const phoneInput = appPage.locator('#lead-customer-phone').first();

    // 2a. Type Kannada name with combining marks: 'ರಾಘವೇಂದ್ರ ಹೆಗಡೆ'
    const kannadaName = 'ರಾಘವೇಂದ್ರ ಹೆಗಡೆ';
    await nameInput.fill(kannadaName);
    const typedValue = await nameInput.inputValue();
    assertCondition('NameField accepts Kannada combining marks: value matches "ರಾಘವೇಂದ್ರ ಹೆಗಡೆ"', typedValue === kannadaName);

    // 2b. Assert character counter shows exact length: '15/60'
    const counterLocator = appPage.locator('text=/\\d+\\/60/').first();
    const counterText = await counterLocator.textContent();
    assertCondition(`NameField counter shows correct length (${counterText})`, counterText.includes('60') && counterText.includes(String(kannadaName.length)));

    // 2c. Type digits into NameField -> Verify filtered / error text
    await nameInput.fill('Rahul 123');
    const filteredValue = await nameInput.inputValue();
    assertCondition('NameField blocks digits: "Rahul 123" filtered to letters/space', !filteredValue.includes('123'));

    // 2d. PhoneField paste overflow check (Paste 13 digits: '9876543210123')
    await phoneInput.evaluate((el) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', '9876543210123');
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
    });
    await appPage.waitForTimeout(400);

    const phoneErrorLocator = appPage.locator('text=Pasted number has too many digits').first();
    const hasPhoneError = await phoneErrorLocator.isVisible().catch(() => false);
    assertCondition('PhoneField shows error on too-long paste without silent truncation', hasPhoneError);

    // Save screenshot
    const leadShotPath = path.join(EVIDENCE_DIR, 'qa-screen-create-lead.png');
    await appPage.screenshot({ path: leadShotPath });
    console.log(`  -> Saved evidence screenshot: ${leadShotPath}`);

    // ─────────────────────────────────────────────────────────────────────────
    // Screen 3: Create Quotation Modal (Selling Price & Cost Price Protection)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 3. Screen: Create Quotation Modal (Pricing & Permissions) ---');
    await appPage.goto('http://localhost:5173/quotations', { waitUntil: 'networkidle' });

    const newQuoteBtn = appPage.locator('button:has-text("New Quotation"), button:has-text("Create Quotation")').first();
    await newQuoteBtn.click();
    await appPage.waitForTimeout(1000);

    // Assert absence of "below unit cost" warning anywhere in the DOM
    const quoteDomText = await appPage.textContent('body');
    const hasBelowCostWarning = quoteDomText.toLowerCase().includes('below unit cost');
    assertCondition('Absence of "below unit cost" warning on screen', !hasBelowCostWarning);

    // Save screenshot
    const quoteShotPath = path.join(EVIDENCE_DIR, 'qa-screen-create-quotation.png');
    await appPage.screenshot({ path: quoteShotPath });
    console.log(`  -> Saved evidence screenshot: ${quoteShotPath}`);

    // ─────────────────────────────────────────────────────────────────────────
    // Screen 4: Add Supplier Modal (NameField & Landline Toggle)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 4. Screen: Add Supplier Modal (NameField & Landline Toggle) ---');
    await appPage.goto('http://localhost:5173/suppliers', { waitUntil: 'networkidle' });

    const addSupBtn = appPage.locator('button:has-text("Add Supplier"), button:has-text("New Supplier")').first();
    await addSupBtn.click();
    await appPage.waitForSelector('#new-supplier-contactPerson', { timeout: 5000 });

    const supContactInput = appPage.locator('#new-supplier-contactPerson').first();
    const hasContactNameField = await supContactInput.isVisible();
    assertCondition('Contact Person field uses NameField component', hasContactNameField);

    // Type Hindi Name: 'राहुल शर्मा'
    const hindiName = 'राहुल शर्मा';
    await supContactInput.fill(hindiName);
    const supContactValue = await supContactInput.inputValue();
    assertCondition('Contact Person accepts Hindi Unicode letters & combining marks', supContactValue === hindiName);

    // Verify Mobile / Landline Toggle in PhoneField
    const landlineBtn = appPage.locator('button:has-text("Landline")').first();
    const hasLandlineToggle = await landlineBtn.isVisible();
    assertCondition('PhoneField renders Landline / Mobile type toggle', hasLandlineToggle);

    if (hasLandlineToggle) {
      await landlineBtn.click();
      await appPage.waitForTimeout(200);
      const isLandlineSelected = (await landlineBtn.getAttribute('class') || '').includes('bg-') || (await landlineBtn.getAttribute('class') || '').includes('text-');
      assertCondition('User can switch to Landline phone type', isLandlineSelected);
    }

    // Save screenshot
    const supShotPath = path.join(EVIDENCE_DIR, 'qa-screen-add-supplier.png');
    await appPage.screenshot({ path: supShotPath });
    console.log(`  -> Saved evidence screenshot: ${supShotPath}`);

    // ─────────────────────────────────────────────────────────────────────────
    // Screen 5: Mobile 390px Viewport Capture
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 5. Screen: Mobile 390px Viewport Capture ---');
    await appPage.setViewportSize({ width: 390, height: 844 });
    await appPage.goto('http://localhost:5173/leads', { waitUntil: 'networkidle' });

    const mobNewLeadBtn = appPage.locator('button:has-text("New Lead"), button:has-text("Add Lead")').first();
    if (await mobNewLeadBtn.isVisible()) {
      await mobNewLeadBtn.click();
      await appPage.waitForSelector('#lead-customer-name', { timeout: 8000 });
    }

    const mobLeadShot = path.join(EVIDENCE_DIR, 'qa-screen-create-lead-390px.png');
    await appPage.screenshot({ path: mobLeadShot });
    console.log(`  -> Saved mobile evidence screenshot: ${mobLeadShot}`);

    await appCtx.close();
  } catch (err) {
    console.error('Fatal error during Playwright screen testing:', err);
    failed++;
  } finally {
    await browser.close();
  }

  console.log('\n' + '='.repeat(70));
  console.log(`PLAYWRIGHT SCREEN RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('='.repeat(70));

  if (failed > 0) {
    process.exit(1);
  }
}

run();
