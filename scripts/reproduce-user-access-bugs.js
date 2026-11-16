const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const axios = require('axios');

const prisma = new PrismaClient();
const API_URL = 'http://localhost:3333/api/v1';

async function runReproduction() {
  console.log('========================================================================');
  console.log('STEP 1 & 3: REPRODUCE USER ACCESS BUGS & TEAM FALLBACK AUDIT');
  console.log('========================================================================\n');

  const stamp = Date.now();
  const testTenantCode = `ACCREPRO${stamp % 10000}`;
  const testTenantId = `repro-tenant-${stamp}`;

  try {
    // 1. Create fake tenant
    const tenant = await prisma.tenant.create({
      data: {
        id: testTenantId,
        code: testTenantCode,
        name: `Repro Tenant ${testTenantCode}`,
        slug: `repro-${stamp}`,
        status: 'active',
        maxUsers: 50,
      },
    });

    const adminHash = await bcrypt.hash('Admin@12345678', 10);
    const adminUser = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        employeeCode: `${testTenantCode}-ADM-001`,
        name: 'Repro Admin',
        email: `admin-${stamp}@repro.test`,
        passwordHash: adminHash,
        role: 'tenant_admin',
        isActive: true,
        mustResetPassword: false,
      },
    });

    console.log(`[SETUP] Created test tenant: ${tenant.name} (${tenant.code})`);
    console.log(`[SETUP] Created test admin: ${adminUser.email}`);

    // Admin login
    const adminLoginRes = await axios.post(`${API_URL}/auth/login`, {
      identifier: adminUser.email,
      password: 'Admin@12345678',
      companyCode: tenant.code,
    });
    const adminToken = adminLoginRes.data.accessToken;
    console.log('[SETUP] Admin logged in successfully.\n');

    // ========================================================================
    // CASE 1: Primary Symptom Reproduction
    // User created with Accounts template (6 pages) and landing page Invoices
    // ========================================================================
    console.log('------------------------------------------------------------------------');
    console.log('CASE 1: User created with Accounts template and landing page Invoices');
    console.log('------------------------------------------------------------------------');

    const accountsPages = ['invoices', 'quotations', 'bills', 'ledger', 'orders', 'notifications'];
    const accountsPayload = {
      name: 'Accounts Specialist',
      email: `acct-${stamp}@repro.test`,
      phone: '9876543210',
      role: 'employee',
      teamId: null,
      warehouseId: null,
      pages: accountsPages,
      homePage: 'invoices',
    };

    console.log('(a) Exact JSON body web sends to POST /users:');
    console.log(JSON.stringify(accountsPayload, null, 2));

    const createUserRes = await axios.post(`${API_URL}/users`, accountsPayload, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const createdUser = createUserRes.data.user;
    const tempPassword = createUserRes.data.tempPassword;

    console.log('\n    POST /users Response:');
    console.log('    Status:', createUserRes.status);
    console.log('    User returned:', JSON.stringify(createdUser, null, 2));
    console.log('    Temp password:', tempPassword);

    // (b) Check stored UserPageAccess.pages in database
    const dbPageAccess = await prisma.userPageAccess.findUnique({
      where: { userId: createdUser.id },
    });
    console.log('\n(b) Stored UserPageAccess in database:');
    console.log(JSON.stringify(dbPageAccess, null, 2));

    // (c) User login response
    const userLoginRes = await axios.post(`${API_URL}/auth/login`, {
      identifier: accountsPayload.email,
      password: tempPassword,
      companyCode: tenant.code,
    });
    console.log('\n(c) Login Response:');
    console.log('    effectivePages:', JSON.stringify(userLoginRes.data.user.effectivePages));
    console.log('    homePage:', JSON.stringify(userLoginRes.data.user.homePage));
    console.log('    redirectPath:', JSON.stringify(userLoginRes.data.redirectPath));
    console.log('    mustResetPassword:', userLoginRes.data.user.mustResetPassword);

    const userToken = userLoginRes.data.accessToken;

    // (d) GET /auth/me response
    const authMeRes = await axios.get(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    console.log('\n(d) GET /auth/me Response:');
    console.log('    effectivePages:', JSON.stringify(authMeRes.data.effectivePages));
    console.log('    homePage:', JSON.stringify(authMeRes.data.homePage));
    console.log('    role:', authMeRes.data.role);

    // Now test what happens after forced password reset!
    console.log('\n--- Checking after password change (ForcePasswordReset) ---');
    const pwdRes = await axios.post(
      `${API_URL}/auth/change-password`,
      { currentPass: tempPassword, newPass: 'NewSecurePassword@123' },
      { headers: { Authorization: `Bearer ${userToken}` } }
    );
    console.log('POST /auth/change-password Response user:');
    console.log('    user.effectivePages:', JSON.stringify(pwdRes.data.user?.effectivePages));
    console.log('    user.homePage:', JSON.stringify(pwdRes.data.user?.homePage));

    // What if /auth/me is called with new token from change-password:
    const newAuthMeRes = await axios.get(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${pwdRes.data.accessToken}` },
    });
    console.log('GET /auth/me with new token:');
    console.log('    effectivePages:', JSON.stringify(newAuthMeRes.data.effectivePages));
    console.log('    homePage:', JSON.stringify(newAuthMeRes.data.homePage));

    // ========================================================================
    // CASE 2: Permutations of Templates x Landing Pages x Roles
    // ========================================================================
    console.log('\n------------------------------------------------------------------------');
    console.log('CASE 2: Template x Allowed Landing Page x Role Permutations');
    console.log('------------------------------------------------------------------------');

    const TEMPLATES = {
      inventory_only: ['inventory', 'suppliers', 'bills', 'shipments', 'notifications'],
      sales: ['leads', 'lead_flow', 'quotations', 'orders', 'notifications'],
      accounts: ['invoices', 'quotations', 'bills', 'ledger', 'orders', 'notifications'],
      daily_activities: ['daily_activities', 'notifications'],
      full_access: [
        'dashboard', 'leads', 'quotations', 'orders', 'invoices', 'shipments',
        'inventory', 'suppliers', 'bills', 'ledger', 'lead_flow', 'lead_setup',
        'daily_activities', 'notifications', 'custom_objects', 'automation',
        'audit_logs', 'users', 'teams', 'branding', 'mail_settings'
      ],
    };

    const ROLES = ['employee', 'accountant', 'store_manager'];
    let counter = 0;

    for (const [tplKey, tplPages] of Object.entries(TEMPLATES)) {
      for (const role of ROLES) {
        // Pick first and second allowed landing pages
        const landingPagesToTest = [tplPages[0], tplPages[Math.min(1, tplPages.length - 1)]];
        for (const landingPage of landingPagesToTest) {
          counter++;
          const uPayload = {
            name: `Test User Permutation`,
            email: `t${counter}-${stamp}@repro.test`,
            phone: '9876543210',
            role,
            pages: tplPages,
            homePage: landingPage,
          };
          const res = await axios.post(`${API_URL}/users`, uPayload, {
            headers: { Authorization: `Bearer ${adminToken}` },
          });
          const lRes = await axios.post(`${API_URL}/auth/login`, {
            identifier: uPayload.email,
            password: res.data.tempPassword,
            companyCode: tenant.code,
          });
          const matchPages = JSON.stringify(tplPages.sort()) === JSON.stringify(lRes.data.user.effectivePages.sort());
          const matchHome = lRes.data.user.homePage === landingPage;
          console.log(`[PERMUTATION] Tpl: ${tplKey.padEnd(16)} | Role: ${role.padEnd(13)} | Landing: ${landingPage.padEnd(16)} | Pages Match: ${matchPages ? 'OK' : 'MISMATCH'} | Home Match: ${matchHome ? 'OK' : 'MISMATCH'} | Redirect: ${lRes.data.redirectPath}`);
        }
      }
    }

    // ========================================================================
    // CASE 3: Edge Case - Choose template THEN change role
    // ========================================================================
    console.log('\n------------------------------------------------------------------------');
    console.log('CASE 3: Edge Case - Form selects Template THEN changes Role');
    console.log('------------------------------------------------------------------------');

    // In web UsersPage.tsx:
    // When role is changed in onChange (line 2125-2135):
    // const defaultPages = getLegacyPagesForRole(newRole);
    // setCreatePages(defaultPages);
    // setCreateHomePage(defaultPages[0] || 'dashboard');
    // setCreateTemplateId('');
    console.log('Code in UsersPage.tsx lines 2125-2135:');
    console.log(`
      onChange={(e) => {
        const newRole = e.target.value as Role;
        setCreateForm({ ...createForm, role: newRole });
        const defaultPages = getLegacyPagesForRole(newRole);
        setCreatePages(defaultPages);
        setCreateHomePage(defaultPages[0] || 'dashboard');
        setCreateTemplateId('');
      }}
    `);
    console.log('Divergence pinpoint: If admin selects template first (e.g. Accounts), and then changes Role (e.g. to accountant), createPages is completely overwritten with getLegacyPagesForRole(newRole)!');

    // ========================================================================
    // CASE 4: Step 3 - Team Fallback Audit
    // ========================================================================
    console.log('\n------------------------------------------------------------------------');
    console.log('CASE 4 (STEP 3): TEAM FALLBACK AUDIT');
    console.log('------------------------------------------------------------------------');

    // Create a team with allowedPages = ['ledger', 'bills']
    const teamRes = await axios.post(
      `${API_URL}/teams`,
      { name: 'Accounts Team', allowedPages: ['ledger', 'bills'] },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    const team = teamRes.data;
    console.log(`[TEAM] Created team "${team.name}" with allowedPages:`, team.allowedPages);

    // Subcase 4A: User with ONLY team (no personal UserPageAccess)
    const userOnlyTeam = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        employeeCode: `${testTenantCode}-EMP-TEAMONLY`,
        name: 'Team Only User',
        email: `teamonly-${stamp}@repro.test`,
        passwordHash: adminHash,
        role: 'employee',
        teamId: team.id,
        isActive: true,
        mustResetPassword: false,
      },
    });

    const loginTeamOnly = await axios.post(`${API_URL}/auth/login`, {
      identifier: userOnlyTeam.email,
      password: 'Admin@12345678',
      companyCode: tenant.code,
    });
    console.log('\n4A. User with ONLY team (no UserPageAccess):');
    console.log('    effectivePages:', JSON.stringify(loginTeamOnly.data.user.effectivePages));
    console.log('    homePage:', JSON.stringify(loginTeamOnly.data.user.homePage));
    console.log('    redirectPath:', JSON.stringify(loginTeamOnly.data.redirectPath));

    // Subcase 4B: User with Team AND Personal UserPageAccess
    const userTeamAndCustom = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        employeeCode: `${testTenantCode}-EMP-TEAMANDCUSTOM`,
        name: 'Team and Custom User',
        email: `teamcustom-${stamp}@repro.test`,
        passwordHash: adminHash,
        role: 'employee',
        teamId: team.id,
        isActive: true,
        mustResetPassword: false,
      },
    });
    await prisma.userPageAccess.create({
      data: {
        userId: userTeamAndCustom.id,
        tenantId: tenant.id,
        pages: JSON.stringify({ pages: accountsPages, homePage: 'invoices' }),
      },
    });

    const loginTeamAndCustom = await axios.post(`${API_URL}/auth/login`, {
      identifier: userTeamAndCustom.email,
      password: 'Admin@12345678',
      companyCode: tenant.code,
    });
    console.log('\n4B. User with Team AND Personal UserPageAccess:');
    console.log('    UserPageAccess pages:', JSON.stringify(accountsPages));
    console.log('    effectivePages:', JSON.stringify(loginTeamAndCustom.data.user.effectivePages));
    console.log('    homePage:', JSON.stringify(loginTeamAndCustom.data.user.homePage));
    console.log('    redirectPath:', JSON.stringify(loginTeamAndCustom.data.redirectPath));

    // Subcase 4C: User with NO team and NO UserPageAccess
    const userNoTeamNoAccess = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        employeeCode: `${testTenantCode}-EMP-NOTEAM`,
        name: 'No Team No Access User',
        email: `noteam-${stamp}@repro.test`,
        passwordHash: adminHash,
        role: 'employee',
        teamId: null,
        isActive: true,
        mustResetPassword: false,
      },
    });

    const loginNoTeam = await axios.post(`${API_URL}/auth/login`, {
      identifier: userNoTeamNoAccess.email,
      password: 'Admin@12345678',
      companyCode: tenant.code,
    });
    console.log('\n4C. User with NO team and NO UserPageAccess:');
    console.log('    effectivePages:', JSON.stringify(loginNoTeam.data.user.effectivePages));
    console.log('    homePage:', JSON.stringify(loginNoTeam.data.user.homePage));
    console.log('    redirectPath:', JSON.stringify(loginNoTeam.data.redirectPath));

    // Cleanup throwaway tenant
    console.log('\n[CLEANUP] Cleaning up throwaway tenant...');
    await prisma.userPageAccess.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.team.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    console.log('[CLEANUP] Done.');

  } catch (err) {
    console.error('Reproduction script failed:', err.response?.data || err.message);
  } finally {
    await prisma.$disconnect();
  }
}

runReproduction();
