const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5174';

async function testInAppArchiveModal() {
  console.log('Testing in-app archive confirmation modal on /customers...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  const mockUser = {
    id: 'test-admin-id',
    name: 'Admin User',
    email: 'admin@dev.local',
    role: 'admin',
    tenantId: 'test-tenant-id',
    tenant: { id: 'test-tenant-id', name: 'Dev Tenant', code: 'DEV' },
    effectivePages: ['customers', 'invoices', 'orders', 'quotations', 'leads', 'inventory', 'ledger'],
  };

  const token = jwt.sign(
    {
      sub: mockUser.id,
      id: mockUser.id,
      email: mockUser.email,
      role: mockUser.role,
      tenantId: mockUser.tenantId,
      tokenVersion: 1,
      isPlatformAdmin: false,
    },
    'dev_jwt_secret_key_at_least_32_characters_long_for_security_12345',
    { expiresIn: '1h' }
  );

  await context.addCookies([
    {
      name: 'crm_session_active',
      value: '1',
      domain: 'localhost',
      path: '/',
    },
  ]);

  const page = await context.newPage();

  await page.addInitScript((u) => {
    localStorage.setItem('crm_user', JSON.stringify(u));
    localStorage.setItem('crm_portal', 'staff');
    localStorage.setItem('crm_staff_refresh_token', 'dev_mock_refresh_token');
    sessionStorage.setItem('crm_portal', 'staff');
    sessionStorage.setItem('crm_tab_user_id', u.id);
    sessionStorage.setItem('crm_tab_user_email', u.email);
  }, mockUser);

  await page.route('**/api/v1/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: token,
        refreshToken: 'dev_mock_refresh_token',
        user: mockUser,
      }),
    });
  });

  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockUser),
    });
  });

  // Route customer listing API to return sample customer
  await page.route('**/api/v1/companies/unified-customers*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 'c-12345',
            name: 'Client Alpha Full-29267',
            isRegistered: true,
            gstin: '29ABCDE1234F1Z5',
            phone: '+91 9876543210',
            email: 'contact@clientalpha.com',
            balance: 145000,
            documentCount: 8,
            lastActivity: new Date().toISOString(),
            isArchived: false,
            source: 'company',
          },
        ],
        possibleDuplicates: [],
      }),
    });
  });

  // Route archive API call
  let archiveEndpointCalled = false;
  await page.route('**/api/v1/companies/c-12345/archive', async (route) => {
    archiveEndpointCalled = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, message: 'Customer archived' }),
    });
  });

  // Catch any dialog event - if a native dialog appears, test fails!
  let nativeDialogTriggered = false;
  page.on('dialog', async (dialog) => {
    nativeDialogTriggered = true;
    console.error('FAILED: Native window.confirm was triggered:', dialog.message());
    await dialog.dismiss();
  });

  await page.goto(`${BASE_URL}/customers`);

  // Verify customer name appears in table
  await page.waitForSelector('text=Client Alpha Full-29267', { timeout: 10000 });
  console.log('    Found customer "Client Alpha Full-29267" in table.');

  // Find and click the archive button
  const archiveBtn = page.locator('button[title*="Archive customer"]').first();
  await archiveBtn.click();

  // Verify in-app modal appears
  const inAppModal = page.locator('[data-testid="archive-customer-modal"]');
  await inAppModal.waitFor({ state: 'visible', timeout: 5000 });
  console.log('    [PASS] In-app archive modal opened successfully!');

  if (nativeDialogTriggered) {
    throw new Error('Native window.confirm was incorrectly shown!');
  }

  // Verify modal text
  const modalText = await inAppModal.innerText();
  if (!modalText.includes('Archive customer "Client Alpha Full-29267"? This hides it from pickers while permanently preserving historical documents.')) {
    throw new Error('Modal text did not match expected copy');
  }
  console.log('    [PASS] Modal message correctly displays inside the app UI.');

  // Take screenshot as proof
  await page.screenshot({ path: 'scripts/evidence-in-app-archive-modal.png' });
  console.log('    Saved screenshot to scripts/evidence-in-app-archive-modal.png');

  // Test Cancel button closes the in-app modal
  const cancelBtn = inAppModal.locator('button:has-text("Cancel")');
  await cancelBtn.click();
  await inAppModal.waitFor({ state: 'hidden', timeout: 5000 });
  console.log('    [PASS] In-app modal closed cleanly on Cancel.');

  // Re-open and test Confirm Archive button
  await archiveBtn.click();
  await inAppModal.waitFor({ state: 'visible', timeout: 5000 });
  const confirmBtn = inAppModal.locator('button:has-text("Archive Customer")');
  await confirmBtn.click();

  await page.waitForTimeout(1000);
  if (!archiveEndpointCalled) {
    throw new Error('Archive API endpoint was not called on confirm!');
  }
  console.log('    [PASS] Archive endpoint called successfully on in-app modal confirm.');

  await browser.close();
  console.log('\n========================================================================');
  console.log('IN-APP ARCHIVE CONFIRMATION MODAL VERIFIED WITH 100% SUCCESS!');
  console.log('========================================================================\n');
}

testInAppArchiveModal().catch((err) => {
  console.error('\n[FAIL] Test failed:', err);
  process.exit(1);
});
