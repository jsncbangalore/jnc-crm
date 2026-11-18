const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();

async function measureLoginBreakdown() {
  const fakeSlug = 'perf-' + Date.now().toString(36);
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Perf Test Tenant',
      code: fakeSlug.toUpperCase(),
      slug: fakeSlug,
      planTier: 'enterprise',
      maxUsers: 10,
      status: 'active',
    },
  });

  const rawPassword = 'StrongPassword!123';
  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(rawPassword, salt);

  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: `${fakeSlug}@test.com`,
      name: 'Perf Tester',
      employeeCode: 'EMP-PERF',
      role: 'tenant_admin',
      passwordHash,
      isActive: true,
      tokenVersion: 0,
    },
  });

  const ipAddress = '127.0.0.1';
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Playwright Reproduction Script';

  console.log('\n============================================================');
  console.log('SERVER-SIDE LOGIN TIMING BREAKDOWN (BENCHMARK)');
  console.log('============================================================');

  // Step 1: Request parsing & validation
  const t0 = performance.now();
  const rawIdentifier = `${fakeSlug}@test.com`.trim();
  const lower = rawIdentifier.toLowerCase();
  const companyCode = tenant.code;
  const t1 = performance.now();
  const parsingMs = t1 - t0;

  // Step 2: Tenant lookup
  const t2 = performance.now();
  const resolvedTenant = await prisma.tenant.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { code: { equals: companyCode.toUpperCase(), mode: 'insensitive' } },
        { slug: { equals: companyCode.toLowerCase(), mode: 'insensitive' } },
        { id: { equals: companyCode } },
      ],
    },
  });
  const t3 = performance.now();
  const tenantLookupMs = t3 - t2;

  // Step 3: Account lockout check
  const lockKey = `${lower}:${resolvedTenant.id}`;
  const t4 = performance.now();
  const lockoutAttempt = await prisma.accountLockout.findUnique({ where: { identityKey: lockKey } });
  const t5 = performance.now();
  const lockoutCheckMs = t5 - t4;

  // Step 4: User lookup (findCandidates)
  const t6 = performance.now();
  const candidates = await prisma.user.findMany({
    where: {
      tenantId: resolvedTenant.id,
      deletedAt: null,
      OR: [
        { email: { equals: lower, mode: 'insensitive' } },
        { employeeCode: { equals: rawIdentifier, mode: 'insensitive' } },
      ],
    },
    include: { tenant: true },
  });
  const t7 = performance.now();
  const userLookupMs = t7 - t6;

  // Step 5: Password hash verification (bcrypt.compare)
  const candidate = candidates[0];
  const t8 = performance.now();
  const passwordMatch = await bcrypt.compare(rawPassword, candidate.passwordHash);
  const t9 = performance.now();
  const bcryptCompareMs = t9 - t8;

  // Wrong password compare timing
  const tWrong0 = performance.now();
  const wrongMatch = await bcrypt.compare('WrongPassword!999', candidate.passwordHash);
  const tWrong1 = performance.now();
  const bcryptWrongCompareMs = tWrong1 - tWrong0;

  // Step 6: Reset failed attempts
  const t10 = performance.now();
  await prisma.accountLockout.deleteMany({ where: { identityKey: lockKey } });
  const t11 = performance.now();
  const resetAttemptsMs = t11 - t10;

  // Step 7: Fresh user lookup in _buildLoginResponse
  const t12 = performance.now();
  const freshUser = await prisma.user.findUnique({
    where: { id: candidate.id },
    include: { twoFactor: true, tenant: true },
  });
  const t13 = performance.now();
  const freshUserLookupMs = t13 - t12;

  // Step 8: Last login timestamp update
  const t14 = performance.now();
  await prisma.user.update({
    where: { id: candidate.id },
    data: { lastLoginAt: new Date() },
  });
  const t15 = performance.now();
  const lastLoginUpdateMs = t15 - t14;

  // Step 9: Prior session lookup (new device check)
  const t16 = performance.now();
  const priorSession = await prisma.refreshSession.findFirst({
    where: { userId: candidate.id },
  });
  const t17 = performance.now();
  const priorSessionCheckMs = t17 - t16;

  // Step 10: Token creation
  const t18 = performance.now();
  const accessToken = jwt.sign(
    { sub: candidate.id, email: candidate.email, role: candidate.role, tenantId: candidate.tenantId },
    process.env.JWT_SECRET || 'dev-secret-key-for-local-testing',
    { expiresIn: '15m' }
  );
  const refreshToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const t19 = performance.now();
  const tokenCreationMs = t19 - t18;

  // Step 11: Refresh session write to DB
  const t20 = performance.now();
  await prisma.refreshSession.create({
    data: {
      userId: candidate.id,
      tokenHash,
      familyId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 7 * 86400000),
      isRevoked: false,
      userAgent: userAgent.substring(0, 500),
      ipAddress: '127.0.0.1',
      lastUsedAt: new Date(),
      deviceLabel: 'Playwright Script',
    },
  });
  const t21 = performance.now();
  const sessionWriteMs = t21 - t20;

  // Step 12: Audit log write to DB
  const t22 = performance.now();
  await prisma.auditLog.create({
    data: {
      tenantId: candidate.tenantId,
      actorId: candidate.id,
      actorName: candidate.name,
      action: 'LOGIN_SUCCESS',
      entityName: 'User',
      entityId: candidate.id,
      afterState: JSON.stringify({ reason: 'SUCCESS' }),
      ipAddress: '127.0.0.1',
    },
  });
  const t23 = performance.now();
  const auditWriteMs = t23 - t22;

  console.log(`- Request parsing & validation:       ${parsingMs.toFixed(2)} ms`);
  console.log(`- Tenant resolution query:            ${tenantLookupMs.toFixed(2)} ms`);
  console.log(`- Lockout check query:                ${lockoutCheckMs.toFixed(2)} ms`);
  console.log(`- User lookup query (findCandidates):  ${userLookupMs.toFixed(2)} ms`);
  console.log(`- Password hash check (correct pw):   ${bcryptCompareMs.toFixed(2)} ms`);
  console.log(`- Password hash check (wrong pw):     ${bcryptWrongCompareMs.toFixed(2)} ms`);
  console.log(`- Reset failed attempts write:        ${resetAttemptsMs.toFixed(2)} ms`);
  console.log(`- Redundant fresh user lookup:        ${freshUserLookupMs.toFixed(2)} ms`);
  console.log(`- User lastLoginAt write:             ${lastLoginUpdateMs.toFixed(2)} ms`);
  console.log(`- Prior session check query:          ${priorSessionCheckMs.toFixed(2)} ms`);
  console.log(`- JWT token signing:                  ${tokenCreationMs.toFixed(2)} ms`);
  console.log(`- Refresh session DB write:           ${sessionWriteMs.toFixed(2)} ms`);
  console.log(`- Audit log DB write:                 ${auditWriteMs.toFixed(2)} ms`);
  console.log(`- Email / external calls:             0.00 ms (skipped / asynchronous)`);

  // Cleanup
  await prisma.refreshSession.deleteMany({ where: { userId: user.id } });
  await prisma.auditLog.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  await prisma.$disconnect();

  return {
    userEmail: user.email,
    rawPassword,
  };
}

measureLoginBreakdown().catch(console.error);
