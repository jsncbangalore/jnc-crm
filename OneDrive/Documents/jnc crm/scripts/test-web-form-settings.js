const assert = require('assert');

async function main() {
  const BASE_URL = 'http://localhost:3333';
  console.log('========================================================================');
  console.log('WEB FORM SETTINGS & PUBLIC INQUIRY AUTOMATED TEST SUITE');
  console.log('Target API:', BASE_URL);
  console.log('========================================================================\n');

  // Step 0: Login as tenant_admin to obtain JWT token
  console.log('[Step 0] Logging in as tenant_admin...');
  const loginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: process.env.TEST_USER_EMAIL || 'admin@example.com',
      password: process.env.TEST_USER_PASSWORD || '',
      companyCode: process.env.TEST_TENANT_CODE || 'DEMO',
    }),
  });
  const loginData = await loginRes.json();
  assert.strictEqual(loginRes.status, 200, `Login failed: ${JSON.stringify(loginData)}`);
  const token = loginData.accessToken;
  assert.ok(token, 'Access token should be present');
  console.log('[OK] Logged in successfully. Token acquired.');

  // Fetch webhook key for this tenant
  const configRes = await fetch(`${BASE_URL}/api/v1/webhooks/config`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const configData = await configRes.json();
  const validKey = configData.webhookKey;
  assert.ok(validKey && validKey.startsWith('whk_'), `Webhook key should start with whk_: ${validKey}`);
  console.log(`[OK] Tenant active webhook key: ${validKey}\n`);

  // Test 1: GET /api/v1/webhooks/inquiry-info without key -> 404 "This form is not available"
  console.log('[Test 1] GET inquiry-info without key must return 404...');
  const noKeyRes = await fetch(`${BASE_URL}/api/v1/webhooks/inquiry-info`);
  const noKeyData = await noKeyRes.json();
  assert.strictEqual(noKeyRes.status, 404, 'Should return 404 when no key is provided');
  assert.strictEqual(noKeyData.message, 'This form is not available');
  console.log('[OK] Passed: 404 returned without key.\n');

  // Test 2: GET /api/v1/webhooks/inquiry-info/invalid_whk_key -> 404
  console.log('[Test 2] GET inquiry-info with invalid key must return 404...');
  const invalidKeyRes = await fetch(`${BASE_URL}/api/v1/webhooks/inquiry-info/invalid_whk_key_12345`);
  assert.strictEqual(invalidKeyRes.status, 404, 'Should return 404 for invalid key');
  console.log('[OK] Passed: 404 returned for invalid key.\n');

  // Test 3: Ensure form starts disabled and GET inquiry-info returns 404
  console.log('[Test 3] When isEnabled is false, inquiry-info must return 404...');
  // First set isEnabled: false
  await fetch(`${BASE_URL}/api/v1/settings/web-form`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ isEnabled: false }),
  });
  const disabledRes = await fetch(`${BASE_URL}/api/v1/webhooks/inquiry-info/${validKey}`);
  const disabledData = await disabledRes.json();
  assert.strictEqual(disabledRes.status, 404, 'Should return 404 when form is disabled');
  assert.strictEqual(disabledData.message, 'This form is not available');
  console.log('[OK] Passed: 404 returned when form is disabled.\n');

  // Test 4: Validation on PUT /api/v1/settings/web-form
  console.log('[Test 4] Validating input constraints on PUT /settings/web-form...');
  // 4a: Non-hex color rejected
  const badColorRes = await fetch(`${BASE_URL}/api/v1/settings/web-form`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ brandColor: 'not-a-color' }),
  });
  assert.strictEqual(badColorRes.status, 400, 'Non-hex brandColor must be rejected with 400');
  console.log('[OK] Passed: Non-hex brandColor rejected.');

  // 4b: Non-https redirectUrl rejected
  const badUrlRes = await fetch(`${BASE_URL}/api/v1/settings/web-form`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ redirectUrl: 'http://insecure-site.com' }),
  });
  assert.strictEqual(badUrlRes.status, 400, 'Non-https redirectUrl must be rejected with 400');
  console.log('[OK] Passed: Non-https redirectUrl rejected.\n');

  // Test 5: PUT /settings/web-form with full valid payload
  console.log('[Test 5] Updating web form settings with customized branding, products, and fields...');
  const updatePayload = {
    isEnabled: true,
    brandColor: '#0ea5e9',
    headline: 'Custom Engineering Quotation',
    description: 'Tell us your technical requirements to receive an official proposal.',
    submitButtonText: 'Request Quotation Now',
    thankYouTitle: 'Inquiry Received Successfully',
    thankYouMessage: 'Our engineering team will review and reply within 24 hours.',
    redirectUrl: 'https://example.com/thank-you',
    products: [
      { name: 'Industrial Inverter 5kVA', category: 'Power' },
      { name: 'Fiber Optic Patch Panel 24-Port', category: 'Networking' },
    ],
    fields: {
      name: { show: true, required: true },
      phone: { show: true, required: true },
      email: { show: true, required: false },
      company: { show: true, required: false },
      city: { show: true, required: false },
      product: { show: true, required: true },
      quantity: { show: true, required: false },
      urgency: { show: true, required: false },
      message: { show: true, required: false },
    },
    allowedOrigins: ['https://clientcompany.in', 'https://shop.clientcompany.in'],
  };

  const updateRes = await fetch(`${BASE_URL}/api/v1/settings/web-form`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(updatePayload),
  });
  assert.strictEqual(updateRes.status, 200, 'Settings update should succeed');
  const updatedSettings = await updateRes.json();
  assert.strictEqual(updatedSettings.brandColor, '#0ea5e9');
  assert.strictEqual(updatedSettings.headline, 'Custom Engineering Quotation');
  assert.strictEqual(updatedSettings.products.length, 2);
  assert.strictEqual(updatedSettings.isEnabled, true);
  console.log('[OK] Passed: Settings saved successfully.\n');

  // Test 6: GET inquiry-info with key returns public data only (no tenantId, no keys)
  console.log('[Test 6] GET inquiry-info/:key returns only public sanitized config...');
  const publicRes = await fetch(`${BASE_URL}/api/v1/webhooks/inquiry-info/${validKey}`);
  assert.strictEqual(publicRes.status, 200, 'Should return 200 for active form');
  const publicData = await publicRes.json();
  assert.strictEqual(publicData.brandColor, '#0ea5e9');
  assert.strictEqual(publicData.headline, 'Custom Engineering Quotation');
  assert.strictEqual(publicData.products.length, 2);
  assert.strictEqual(publicData.products[0].name, 'Industrial Inverter 5kVA');
  assert.strictEqual(publicData.submitButtonText, 'Request Quotation Now');
  assert.strictEqual(publicData.tenantId, undefined, 'tenantId must NOT be exposed in public info');
  assert.strictEqual(publicData.webhookKey, undefined, 'webhookKey must NOT be exposed in public info');
  console.log('[OK] Passed: Public inquiry info sanitized correctly.\n');

  // Test 7: Origin enforcement on POST /api/v1/webhooks/website/:key
  console.log('[Test 7] Verifying allowedOrigins restriction...');
  const disallowedOriginRes = await fetch(`${BASE_URL}/api/v1/webhooks/website/${validKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://malicious-website.com',
    },
    body: JSON.stringify({
      name: 'Hacker',
      phone: '5550123456',
      product: 'Industrial Inverter 5kVA',
    }),
  });
  assert.strictEqual(disallowedOriginRes.status, 403, 'Disallowed origin must be rejected with 403');
  console.log('[OK] Passed: Disallowed origin returned 403 Forbidden.');

  // Test 8: Required field validation (product is required in our config)
  console.log('[Test 8] Verifying required field validation...');
  const missingFieldRes = await fetch(`${BASE_URL}/api/v1/webhooks/website/${validKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://clientcompany.in',
    },
    body: JSON.stringify({
      name: 'Rajesh Sharma',
      phone: '5550123456',
      // product missing!
    }),
  });
  assert.strictEqual(missingFieldRes.status, 400, 'Missing required product field must return 400');
  console.log('[OK] Passed: Missing required field returned 400 Bad Request.');

  // Test 9: Honeypot detection (bot submission silently ignored)
  console.log('[Test 9] Verifying honeypot bot trap...');
  const botRes = await fetch(`${BASE_URL}/api/v1/webhooks/website/${validKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://clientcompany.in',
    },
    body: JSON.stringify({
      name: 'Spam Bot',
      phone: '5550123456',
      product: 'Industrial Inverter 5kVA',
      _hp_company_trap: 'http://spam-link.ru',
    }),
  });
  assert.strictEqual(botRes.status, 200, 'Honeypot returns 200 to fool bot');
  const botData = await botRes.json();
  assert.strictEqual(botData.status, 'SUCCESS');
  assert.strictEqual(botData.leadId, undefined, 'No leadId should be generated for bot submission');
  console.log('[OK] Passed: Honeypot silently trapped bot submission.');

  // Test 10: Valid submission creates lead with source 'web'
  console.log('[Test 10] Submitting valid lead from allowed origin...');
  const testPhone = `98450${Math.floor(10000 + Math.random() * 90000)}`;
  const validRes = await fetch(`${BASE_URL}/api/v1/webhooks/website/${validKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://clientcompany.in',
    },
    body: JSON.stringify({
      name: 'Automated Test Client',
      phone: testPhone,
      email: 'testclient@example.com',
      company: 'Client Org Ltd',
      product: 'Industrial Inverter 5kVA',
      message: 'Need urgent quote for factory backup power.',
    }),
  });
  assert.strictEqual(validRes.status, 200, 'Valid submission should return 200');
  const validData = await validRes.json();
  assert.strictEqual(validData.status, 'SUCCESS');
  assert.ok(validData.leadId, 'Lead ID must be generated');
  console.log(`[OK] Passed: Lead created with ID ${validData.leadId} for phone ${testPhone}.`);

  // Test 11: Unified public-inquiry endpoint parity
  console.log('[Test 11] Verifying parity of GET and POST /public-inquiry...');
  const piGetRes = await fetch(`${BASE_URL}/api/v1/public-inquiry?key=${validKey}`);
  assert.strictEqual(piGetRes.status, 200);
  const piGetData = await piGetRes.json();
  assert.strictEqual(piGetData.headline, 'Custom Engineering Quotation');

  const piPostRes = await fetch(`${BASE_URL}/api/v1/public-inquiry?key=${validKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://clientcompany.in',
    },
    body: JSON.stringify({
      name: 'Public Inquiry Lead',
      phone: `98451${Math.floor(10000 + Math.random() * 90000)}`,
      product: 'Fiber Optic Patch Panel 24-Port',
    }),
  });
  assert.strictEqual(piPostRes.status, 200);
  const piPostData = await piPostRes.json();
  assert.ok(piPostData.leadId);
  console.log('[OK] Passed: /public-inquiry routes correctly and identically.\n');

  console.log('========================================================================');
  console.log('ALL 11 AUTOMATED TESTS PASSED SUCCESSFULLY! ZERO FAILURES.');
  console.log('========================================================================');
}

main().catch((err) => {
  console.error('\n[ERROR] TEST RUN FAILED:', err.message);
  process.exit(1);
});
