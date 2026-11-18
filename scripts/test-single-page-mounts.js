const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const ROOT_DIR = path.resolve(__dirname, '..');
const envFile = path.join(ROOT_DIR, 'apps/api/.env');
if (fs.existsSync(envFile)) {
  const content = fs.readFileSync(envFile, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const k = trimmed.slice(0, idx).trim();
      let v = trimmed.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[k] = v;
    }
  }
}

const prisma = new PrismaClient();

const testPages = [
  { name: 'ShipmentsPage', route: '/shipments', pageKey: 'shipments' },
  { name: 'LeadsPage', route: '/leads', pageKey: 'leads' },
  { name: 'QuotationsPage', route: '/quotations', pageKey: 'quotations' },
  { name: 'OrdersPage', route: '/orders', pageKey: 'orders' },
  { name: 'InvoicesPage', route: '/invoices', pageKey: 'invoices' },
  { name: 'InventoryPage', route: '/inventory', pageKey: 'inventory' },
  { name: 'SuppliersPage', route: '/suppliers', pageKey: 'suppliers' },
  { name: 'PurchaseBillsPage', route: '/bills', pageKey: 'bills' },
  { name: 'LedgerPage', route: '/ledger', pageKey: 'ledger' },
  { name: 'DashboardPage', route: '/dashboard', pageKey: 'dashboard' },
  { name: 'DailyActivitiesPage', route: '/daily-activities', pageKey: 'daily_activities' },
  { name: 'NotificationsPage', route: '/notifications', pageKey: 'notifications' },
  { name: 'AutomationPage', route: '/automation', pageKey: 'automation' },
  { name: 'StartSetupPage', route: '/start-setup', pageKey: 'lead_setup' },
  { name: 'UsersPage', route: '/users', pageKey: 'users' },
  { name: 'AuditLogsPage', route: '/audit-logs', pageKey: 'audit_logs' },
  { name: 'BrandingSettingsPage', route: '/settings/branding', pageKey: 'branding' },
  { name: 'MailAccountsPage', route: '/settings/mail', pageKey: 'mail_settings' },
];

async function main() {
  console.log('Testing each page with ONLY its granted page key in Playwright...');
  const suffix = String(Date.now()).slice(-6);
  const testTenantId = 'single-page-tenant-' + suffix;
  const testUserId = 'single-page-user-' + suffix;
  const testEmail = `single_${suffix}@example.fake`;
  const passwordHash = bcrypt.hashSync('Pass123456789!', 10);

  const tenant = await prisma.tenant.create({
    data: {
      id: testTenantId,
      code: 'SP' + suffix,
      name: 'Single Page Co ' + suffix,
      slug: 'single-page-' + suffix,
      status: 'active',
      planTier: 'enterprise',
      maxUsers: 50,
    },
  });

  const user = await prisma.user.create({
    data: {
      id: testUserId,
      tenantId: testTenantId,
      email: testEmail,
      name: 'Single Page Tester',
      employeeCode: 'SP-' + suffix,
      role: 'employee',
      passwordHash,
      isActive: true,
      tokenVersion: 0,
      firstLoginAfter2FaReleaseAt: new Date(),
    },
  });

  const jwtSecret = process.env.JWT_SECRET || 'dev_secret_key_12345678901234567890123456789012';
  const token = jwt.sign(
    {
      sub: testUserId,
      userId: testUserId,
      id: testUserId,
      tenantId: testTenantId,
      email: testEmail,
      role: 'employee',
      tokenVersion: 0,
    },
    jwtSecret,
    { audience: 'crm-client', issuer: 'crm-api', expiresIn: '2h' }
  );

  const browser = await chromium.launch({ headless: true });
  const failedMountCalls = [];

  for (const p of testPages) {
    await prisma.userPageAccess.upsert({
      where: { userId: testUserId },
      create: {
        userId: testUserId,
        tenantId: testTenantId,
        pages: JSON.stringify([p.pageKey]),
      },
      update: {
        pages: JSON.stringify([p.pageKey]),
      },
    });

    const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
    await context.addInitScript(({ token, user, tenant, pageKey }) => {
      localStorage.setItem('crm_access_token', token);
      localStorage.setItem('crm_refresh_token', token);
      localStorage.setItem('crm_user', JSON.stringify({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: tenant.id,
        tenantCode: tenant.code,
        tenantName: tenant.name,
      }));
      sessionStorage.setItem('crm_portal', 'staff');
      sessionStorage.setItem('crm_tab_user_id', user.id);
    }, { token, user, tenant, pageKey: p.pageKey });

    const page = await context.newPage();
    const responses = [];

    page.on('response', res => {
      const url = res.url();
      if (url.includes('/api/v1/') && !url.includes('/auth/session-probe')) {
        responses.push({
          method: res.request().method(),
          url: url.replace(/^http:\/\/[^/]+/, ''),
          status: res.status(),
        });
      }
    });

    try {
      await page.goto(`http://localhost:5173${p.route}`, { waitUntil: 'networkidle', timeout: 7000 });
      await page.waitForTimeout(600);
    } catch {}

    const errors = responses.filter(r => r.status === 403 || r.status === 401 || r.status === 500);
    if (errors.length > 0) {
      for (const err of errors) {
        console.log(`  [FAIL ON MOUNT] Page ${p.name} (${p.pageKey}) made call: ${err.method} ${err.url} -> Status ${err.status}`);
        failedMountCalls.push({
          page: p.name,
          pageKey: p.pageKey,
          method: err.method,
          url: err.url,
          status: err.status,
        });
      }
    } else {
      console.log(`  [PASS ON MOUNT] Page ${p.name} (${p.pageKey}) made ${responses.length} calls - zero 403/401 errors!`);
    }

    await page.close();
    await context.close();
  }

  await browser.close();

  // Cleanup
  await prisma.userPageAccess.deleteMany({ where: { tenantId: testTenantId } });
  await prisma.user.deleteMany({ where: { tenantId: testTenantId } });
  await prisma.tenant.deleteMany({ where: { id: testTenantId } });

  console.log(`\n============================================================`);
  console.log(`SUMMARY: ${failedMountCalls.length} calls failed on initial page mount`);
  console.log(`============================================================`);
  console.table(failedMountCalls);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
