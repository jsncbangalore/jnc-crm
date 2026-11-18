const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function measureHttpLogin() {
  const code = 'bench-' + Date.now().toString(36);
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Bench Tenant',
      code: code.toUpperCase(),
      slug: code,
      planTier: 'enterprise',
      maxUsers: 10,
      status: 'active',
    },
  });

  const rawPassword = 'Password@123!';
  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(rawPassword, salt);

  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: `${code}@bench.test`,
      name: 'Bench User',
      employeeCode: 'EMP-B',
      role: 'tenant_admin',
      passwordHash,
      isActive: true,
      tokenVersion: 0,
    },
  });

  console.log('\n--- 1. MEASURING HTTP POST /auth/login ---');

  // Test 1: Wrong password
  const tWrong0 = performance.now();
  const wrongRes = await fetch('http://localhost:3333/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: user.email,
      password: 'WrongPassword999!',
      companyCode: tenant.code,
    }),
  });
  const tWrong1 = performance.now();
  const wrongStatus = wrongRes.status;
  const wrongBody = await wrongRes.json().catch(() => ({}));
  const wrongDurationMs = tWrong1 - tWrong0;
  console.log(`Wrong password: status=${wrongStatus}, duration=${wrongDurationMs.toFixed(2)} ms (${(wrongDurationMs / 1000).toFixed(2)} s)`);

  // Test 2: Correct password
  const tCorrect0 = performance.now();
  const correctRes = await fetch('http://localhost:3333/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: user.email,
      password: rawPassword,
      companyCode: tenant.code,
    }),
  });
  const tCorrect1 = performance.now();
  const correctStatus = correctRes.status;
  const correctBody = await correctRes.json().catch(() => ({}));
  const correctDurationMs = tCorrect1 - tCorrect0;
  console.log(`Correct password: status=${correctStatus}, duration=${correctDurationMs.toFixed(2)} ms (${(correctDurationMs / 1000).toFixed(2)} s)`);

  // Cleanup
  await prisma.refreshSession.deleteMany({ where: { userId: user.id } });
  await prisma.auditLog.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  await prisma.$disconnect();
}

measureHttpLogin().catch(console.error);
