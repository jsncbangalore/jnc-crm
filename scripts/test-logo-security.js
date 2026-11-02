const assert = require('assert');

async function testLogoSecurity() {
  console.log('--- TESTING LOGO SECURITY & CROSS-TENANT ACCESS ---');

  // 1. Login as Acme tenant admin
  const loginRes = await fetch('http://127.0.0.1:3333/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'SecurePass123!' })
  });
  const { accessToken } = await loginRes.json();
  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  // 2. Cross-tenant access to Gamma tenant's portal logo
  const gammaTenantId = '53b11649-8fbd-4bbb-a38b-ee081db808c4';
  const crossTenantRes = await fetch(`http://127.0.0.1:3333/api/v1/settings/branding/portal-logo/${gammaTenantId}`, {
    headers: authHeaders
  });
  console.log(`Cross-tenant portal logo status: ${crossTenantRes.status} (Expected: 403 Forbidden)`);
  assert.strictEqual(crossTenantRes.status, 403, 'Cross-tenant portal logo access must be 403 Forbidden');
  console.log('✓ Cross-tenant access successfully blocked with 403 Forbidden!');

  // 3. Own tenant portal logo access
  const ownTenantRes = await fetch(`http://127.0.0.1:3333/api/v1/settings/branding/portal-logo/55051b53-7872-430e-b700-f7e6281e9ffe`, {
    headers: authHeaders
  });
  console.log(`Own tenant portal logo status: ${ownTenantRes.status} (Expected: 200 or 404 if no logo set, NOT 403)`);
  assert.notStrictEqual(ownTenantRes.status, 403, 'Own tenant portal logo access must NOT be 403 Forbidden');
  console.log('✓ Own tenant access allowed without 403!');

  // 4. Test uploading SVG is rejected
  const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
  const svgBody = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="test.svg"',
    'Content-Type: image/svg+xml',
    '',
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" stroke="green" stroke-width="4" fill="yellow" /></svg>',
    `--${boundary}--`
  ].join('\r\n');

  const uploadSvgRes = await fetch('http://127.0.0.1:3333/api/v1/settings/branding/portal-logo', {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    },
    body: svgBody
  });
  console.log(`Upload SVG status: ${uploadSvgRes.status} (Expected: 400 Bad Request)`);
  const svgErr = await uploadSvgRes.json();
  console.log('Upload SVG error message:', svgErr.message);
  assert.strictEqual(uploadSvgRes.status, 400, 'SVG upload must be rejected with 400');
  console.log('✓ SVG logo upload successfully rejected!');

  // 5. Test fake magic bytes (e.g. text disguised as PNG)
  const fakePngBody = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="fake.png"',
    'Content-Type: image/png',
    '',
    'NOT_A_REAL_PNG_HEADER_JUST_RANDOM_TEXT',
    `--${boundary}--`
  ].join('\r\n');

  const fakePngRes = await fetch('http://127.0.0.1:3333/api/v1/settings/branding/portal-logo', {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    },
    body: fakePngBody
  });
  console.log(`Fake PNG status: ${fakePngRes.status} (Expected: 400 Bad Request)`);
  assert.strictEqual(fakePngRes.status, 400, 'Fake PNG must be rejected with 400');
  console.log('✓ Invalid magic bytes successfully rejected!');

  console.log('\nALL LOGO SECURITY & CROSS-TENANT TESTS PASSED!\n');
}

testLogoSecurity().catch(err => {
  console.error(err);
  process.exit(1);
});
