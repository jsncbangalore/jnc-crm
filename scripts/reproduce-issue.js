const axios = require('axios');

async function testReproduction() {
  const baseURL = 'http://localhost:3333/api/v1';

  console.log('========================================================================');
  console.log('1. REPRODUCE: COMPANY ADMIN FORCED SETUP');
  console.log('========================================================================');

  // A1. Login as Company Admin
  console.log('--- A1: POST /api/v1/auth/login ---');
  let companyLoginRes;
  try {
    companyLoginRes = await axios.post(`${baseURL}/auth/login`, {
      companyCode: 'TEST-CORP-001',
      identifier: 'company-admin-test@example.internal',
      password: 'Password@123456',
    });
    console.log('Company Admin Login Status:', companyLoginRes.status);
    console.log('Company Admin Login Response Body:', JSON.stringify(companyLoginRes.data, null, 2));
  } catch (err) {
    console.log('Company Admin Login Failed:', err.response?.status, err.response?.data || err.message);
    return;
  }

  const companySetupToken = companyLoginRes.data.setupToken;

  // A2. 2FA Setup request as currently performed by web client (No headers, no token)
  console.log('\n--- A2: POST /api/v1/auth/2fa/setup (as currently sent by web client: empty body, no headers) ---');
  try {
    const setupRes = await axios.post(`${baseURL}/auth/2fa/setup`, {});
    console.log('Setup Status:', setupRes.status);
    console.log('Setup Response Body:', JSON.stringify(setupRes.data, null, 2));
  } catch (err) {
    console.log('Setup Status:', err.response?.status);
    console.log('Setup Response Body:', JSON.stringify(err.response?.data, null, 2));
  }

  // A3. What if setupToken is passed as x-setup-token header or in body?
  console.log('\n--- A3: POST /api/v1/auth/2fa/setup with x-setup-token header ---');
  try {
    const setupWithHeaderRes = await axios.post(
      `${baseURL}/auth/2fa/setup`,
      {},
      { headers: { 'x-setup-token': companySetupToken } }
    );
    console.log('Setup with header Status:', setupWithHeaderRes.status);
    console.log('Setup with header Response:', JSON.stringify(setupWithHeaderRes.data, null, 2));
  } catch (err) {
    console.log('Setup with header Status:', err.response?.status);
    console.log('Setup with header Response:', JSON.stringify(err.response?.data, null, 2));
  }

  console.log('\n========================================================================');
  console.log('2. REPRODUCE: PLATFORM OWNER FORCED SETUP');
  console.log('========================================================================');

  // B1. Login as Platform Super Admin
  console.log('--- B1: POST /api/v1/platform-auth/login ---');
  let platLoginRes;
  try {
    platLoginRes = await axios.post(`${baseURL}/platform-auth/login`, {
      email: 'platform-owner-test@example.internal',
      password: 'Password@123456',
    });
    console.log('Platform Owner Login Status:', platLoginRes.status);
    console.log('Platform Owner Login Response Body:', JSON.stringify(platLoginRes.data, null, 2));
  } catch (err) {
    console.log('Platform Owner Login Failed:', err.response?.status, err.response?.data || err.message);
    return;
  }

  const platSetupToken = platLoginRes.data.setupToken;

  // B2. 2FA Setup request as currently performed by web client (calls /auth/2fa/setup)
  console.log('\n--- B2: POST /api/v1/auth/2fa/setup for Platform Owner (as currently sent by web client) ---');
  try {
    const platSetupRes = await axios.post(
      `${baseURL}/auth/2fa/setup`,
      {},
      { headers: { 'x-setup-token': platSetupToken } }
    );
    console.log('Platform Owner calling /auth/2fa/setup Status:', platSetupRes.status);
    console.log('Platform Owner calling /auth/2fa/setup Response:', JSON.stringify(platSetupRes.data, null, 2));
  } catch (err) {
    console.log('Platform Owner calling /auth/2fa/setup Status:', err.response?.status);
    console.log('Platform Owner calling /auth/2fa/setup Response:', JSON.stringify(err.response?.data, null, 2));
  }

  // B3. 2FA Setup request on platform endpoint (/platform-auth/2fa/setup)
  console.log('\n--- B3: POST /api/v1/platform-auth/2fa/setup (Target platform route) ---');
  try {
    const platRouteRes = await axios.post(
      `${baseURL}/platform-auth/2fa/setup`,
      {},
      { headers: { 'x-setup-token': platSetupToken } }
    );
    console.log('/platform-auth/2fa/setup Status:', platRouteRes.status);
    console.log('/platform-auth/2fa/setup Response:', JSON.stringify(platRouteRes.data, null, 2));
  } catch (err) {
    console.log('/platform-auth/2fa/setup Status:', err.response?.status);
    console.log('/platform-auth/2fa/setup Response:', JSON.stringify(err.response?.data, null, 2));
  }
}

testReproduction().catch(console.error);
