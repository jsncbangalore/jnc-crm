const axios = require('axios');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { generateTotpToken, getTotpStep } = require(path.join(__dirname, '../apps/api/dist/common/totp.util'));

const prisma = new PrismaClient();

async function testEnable() {
  const baseURL = 'http://localhost:3333/api/v1';

  // 0. Ensure user has 2FA deleted and grace period expired
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const testUser = await prisma.user.findFirst({
    where: { email: 'company-admin-test@example.internal' }
  });
  if (testUser) {
    await prisma.userTwoFactor.deleteMany({ where: { userId: testUser.id } });
    await prisma.user.update({
      where: { id: testUser.id },
      data: { firstLoginAfter2FaReleaseAt: tenDaysAgo }
    });
  }

  // 1. Login Company Admin
  const loginRes = await axios.post(`${baseURL}/auth/login`, {
    companyCode: 'TEST-CORP-001',
    identifier: 'company-admin-test@example.internal',
    password: 'Password@123456',
  });
  const setupToken = loginRes.data.setupToken;

  // 2. Setup
  const setupRes = await axios.post(`${baseURL}/auth/2fa/setup`, {}, {
    headers: { 'x-setup-token': setupToken }
  });
  const secret = setupRes.data.secret;
  console.log('Setup succeeded. Secret generated.');

  // 3. Test wrong code
  try {
    await axios.post(`${baseURL}/auth/2fa/enable`, { code: '000000', setupToken });
    console.log('FAIL: Wrong code was accepted!');
  } catch (err) {
    console.log('Wrong code response (expected 400):', err.response?.status, err.response?.data?.message);
  }

  // 4. Test correct code
  const step = getTotpStep();
  const correctCode = generateTotpToken(secret, step, 6);
  const enableRes = await axios.post(`${baseURL}/auth/2fa/enable`, {
    code: correctCode,
    setupToken,
    trustDevice: true,
  });
  console.log('Enable status (expected 200):', enableRes.status);
  console.log('Backup codes count:', enableRes.data.backupCodes?.length);
  console.log('Access token returned:', Boolean(enableRes.data.accessToken));

  // 5. Test token reuse after enable (must be rejected!)
  try {
    await axios.post(`${baseURL}/auth/2fa/setup`, {}, {
      headers: { 'x-setup-token': setupToken }
    });
    console.log('FAIL: Token reused after enable!');
  } catch (err) {
    console.log('Token reuse response (expected 401):', err.response?.status, err.response?.data?.code, err.response?.data?.message);
  }

  // 6. Test login again with backup code or next step!
  const nextLoginRes = await axios.post(`${baseURL}/auth/login`, {
    companyCode: 'TEST-CORP-001',
    identifier: 'company-admin-test@example.internal',
    password: 'Password@123456',
  });
  console.log('Subsequent login status:', nextLoginRes.status);
  console.log('Subsequent login requiresTwoFactor:', nextLoginRes.data.requiresTwoFactor);
  const loginTicket = nextLoginRes.data.loginTicket;

  const backupCode = enableRes.data.backupCodes[0];
  const verifyRes = await axios.post(`${baseURL}/auth/login/verify-2fa`, {
    loginTicket,
    code: backupCode,
  });
  console.log('Verify 2FA login with backup code (expected 200):', verifyRes.status);
  console.log('Logged in user email:', verifyRes.data.user?.email);
  await prisma.$disconnect();
}

testEnable().catch((e) => {
  console.error(e);
  return prisma.$disconnect();
});
