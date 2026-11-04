/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const { chromium } = require('playwright');
const assert = require('assert');

async function testBrowserIsolation() {
  console.log('========================================================================');
  console.log('TEST: DUAL-CONTEXT BROWSER ISOLATION & SESSION SEPARATION');
  console.log('========================================================================\n');

  const browser = await chromium.launch({ headless: true });

  // Context A: Represents Browser 1
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();

  // Context B: Represents Browser 2 (independent storage, independent cookies)
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();

  console.log('[Step 1] Navigating Context A to /login...');
  await pageA.goto('http://localhost:5173/login');
  await pageA.waitForSelector('input#company-identifier');

  // Perform login on Context A using synthetic dev test credentials
  console.log('[Step 2] Authenticating Context A...');
  await pageA.fill('input#company-identifier', 'admin-dev@example.internal');
  await pageA.fill('input#company-password', 'DevPassword@123');

  // Check if company code input is needed or click login
  const companyCodeVisible = await pageA.isVisible('input[name="companyCode"]');
  if (companyCodeVisible) {
    await pageA.fill('input[name="companyCode"]', 'ACME');
  }

  // Inject session directly into Context A to simulate successful login
  const mockUser = {
    id: 'usr-test-admin-01',
    name: 'Operations Manager',
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
  }, mockUser);

  await pageA.goto('http://localhost:5173/dashboard');
  const urlA = pageA.url();
  console.log('  -> Context A current URL:', urlA);

  console.log('\n[Step 3] Opening /dashboard in Context B (completely fresh browser context)...');
  await pageB.goto('http://localhost:5173/dashboard');
  await pageB.waitForTimeout(1500);

  const urlB = pageB.url();
  console.log('  -> Context B current URL:', urlB);

  // Assertions
  const redirectedToLogin = urlB.includes('/login') || urlB.includes('/landing');
  console.log(`\n[Result] Context B redirected to login/landing: ${redirectedToLogin}`);
  assert.strictEqual(redirectedToLogin, true, 'Context B must redirect to /login when Context A is logged in');

  const contextBStorage = await pageB.evaluate(() => {
    return {
      crm_user: localStorage.getItem('crm_user'),
      crm_portal: localStorage.getItem('crm_portal'),
      crm_staff_access_token: localStorage.getItem('crm_staff_access_token'),
    };
  });
  console.log('  -> Context B localStorage contents:', JSON.stringify(contextBStorage));
  assert.strictEqual(contextBStorage.crm_user, null, 'Context B must have empty crm_user in localStorage');
  assert.strictEqual(contextBStorage.crm_staff_access_token, null, 'Context B must have no access token');

  await browser.close();
  console.log('\n========================================================================');
  console.log('[PASS] BROWSER ISOLATION VERIFIED: No cross-context session leakage.');
  console.log('========================================================================\n');
}

testBrowserIsolation().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
