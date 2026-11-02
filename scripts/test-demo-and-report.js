const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const res = await fetch('http://localhost:3333/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'tenant-admin@example.com',
      password: 'DevPassword@123',
    }),
  });
  const data = await res.json();
  const token = data.accessToken || data.token;
  if (!token) {
    console.error('Login failed:', data);
    return;
  }
  console.log('Logged in successfully. User tenant isDemo:', data.user?.tenant?.isDemo, 'user isDemo:', data.user?.isDemo);

  // Test party source report
  const repRes = await fetch('http://localhost:3333/api/v1/ledger/party-source-report', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const repData = await repRes.json();
  console.log('Party Source Report:', JSON.stringify(repData, null, 2));

  // Test reset demo data
  const resetRes = await fetch('http://localhost:3333/api/v1/ledger/reset-demo', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const resetData = await resetRes.json();
  console.log('Reset Demo Data Response:', resetData);
}

test().catch(console.error).finally(() => prisma.$disconnect());
