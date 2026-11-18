const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

const PAGES_TO_TEST = [
  { key: 'dashboard', route: '/dashboard', label: 'Dashboard' },
  { key: 'leads', route: '/leads', label: 'Leads' },
  { key: 'quotations', route: '/quotations', label: 'Quotations' },
  { key: 'orders', route: '/orders', label: 'Orders' },
  { key: 'shipments', route: '/shipments', label: 'Shipments' },
  { key: 'invoices', route: '/invoices', label: 'Invoices' },
  { key: 'inventory', route: '/inventory', label: 'Inventory' },
  { key: 'suppliers', route: '/suppliers', label: 'Suppliers' },
  { key: 'bills', route: '/bills', label: 'Purchase Bills' },
  { key: 'ledger', route: '/ledger', label: 'Ledger' },
  { key: 'daily_activities', route: '/daily-activities', label: 'Daily Activities' },
  { key: 'notifications', route: '/notifications', label: 'Notifications' },
  { key: 'users', route: '/users', label: 'Users' },
  { key: 'branding', route: '/settings/branding', label: 'Branding Settings' },
];

const ROLES_TO_TEST = [
  {
    roleName: 'Store Manager',
    email: 'store@demo.test',
    templateKey: 'inventory_only',
  },
  {
    roleName: 'Sales Rep',
    email: 'sales@demo.test',
    templateKey: 'sales',
  },
  {
    roleName: 'Accountant',
    email: 'accountant@demo.test',
    templateKey: 'accounts',
  },
  {
    roleName: 'Field Worker',
    email: 'viewer@demo.test',
    templateKey: 'daily_activities',
  },
  {
    roleName: 'Company Admin',
    email: 'admin@demo.test',
    templateKey: 'full_access',
  },
];

function parseCookies(setCookieHeader) {
  if (!setCookieHeader) return [];
  const cookies = [];
  const parts = setCookieHeader.split(/,(?=[a-zA-Z0-9_-]+=)/);
  for (const p of parts) {
    const match = p.trim().match(/^([^=]+)=([^;]+)/);
    if (match) {
      const name = match[1].trim();
      const value = match[2].trim();
      const pathMatch = p.match(/Path=([^;]+)/i);
      cookies.push({
        name,
        value,
        domain: 'localhost',
        path: pathMatch ? pathMatch[1] : '/',
        httpOnly: p.toLowerCase().includes('httponly'),
        sameSite: 'Lax',
      });
    }
  }
  return cookies;
}

async function main() {
  console.log('=== REAL-PAGE PLAYWRIGHT CROSS-PAGE DEPENDENCY MATRIX TEST ===\n');

  const browser = await chromium.launch({ headless: true });
  const matrixResults = [];
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  for (const roleDef of ROLES_TO_TEST) {
    // 1. Authenticate via dev-demo-login
    const loginRes = await fetch('http://localhost:3333/api/v1/auth/dev-demo-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: roleDef.email }),
    });

    if (!loginRes.ok) {
      throw new Error(`Failed to log in as ${roleDef.roleName} (${roleDef.email}): HTTP ${loginRes.status}`);
    }

    const authData = await loginRes.json();
    const setCookieHeader = loginRes.headers.get('set-cookie');
    const cookies = parseCookies(setCookieHeader);
    const effectivePages = authData.user?.effectivePages || [];

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies(cookies);

    await context.addInitScript(
      ({ authData }) => {
        window.__INITIAL_STAFF_TOKEN__ = authData.accessToken;
        localStorage.setItem('crm_user', JSON.stringify(authData.user));
        localStorage.setItem('crm_refresh_token_fb', authData.refreshToken);
        localStorage.setItem('crm_last_user_activity', String(Date.now()));
        sessionStorage.setItem('crm_tab_user_id', authData.user.id);
        sessionStorage.setItem('crm_portal', 'staff');
        sessionStorage.setItem('crm_last_active_user_id', authData.user.id);
        sessionStorage.setItem('crm_refresh_token_fb', authData.refreshToken);
      },
      { authData }
    );

    const page = await context.newPage();

    // Warm up session
    await page.goto('http://localhost:5173/notifications', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    for (const p of PAGES_TO_TEST) {
      totalTests++;
      const isGranted = effectivePages.includes(p.key);
      const networkFailures = [];
      const dataRequests = [];

      const responseHandler = (res) => {
        const url = res.url();
        const status = res.status();
        if (url.includes('/api/v1/')) {
          const pathOnly = url.split('?')[0].replace(/^.*\/api\/v1/, '');
          if (
            !pathOnly.includes('/health') &&
            !pathOnly.includes('/settings/branding') &&
            !pathOnly.includes('/auth/refresh') &&
            !pathOnly.includes('/auth/me') &&
            !pathOnly.includes('/notifications')
          ) {
            dataRequests.push({ url: pathOnly, status });
          }
          if (status === 403 || status === 401) {
            networkFailures.push({ url: pathOnly, status });
          }
        }
      };

      page.on('response', responseHandler);

      try {
        const hasClientNav = await page.evaluate(() => typeof window.__CRM_NAVIGATE__ === 'function');
        if (hasClientNav) {
          await page.evaluate((r) => window.__CRM_NAVIGATE__(r), p.route);
        } else {
          await page.goto(`http://localhost:5173${p.route}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        }
        await page.waitForTimeout(1000);

        let pass = true;
        let reason = 'Clean';

        if (isGranted) {
          // Must not have any 401/403 network failures
          await page.waitForTimeout(600);
          if (networkFailures.length > 0) {
            pass = false;
            reason = `Network 401/403: ${networkFailures.map((f) => `${f.status} ${f.url}`).join(', ')}`;
          } else {
            // Must not show error card or "Access denied"
            const pageText = await page.locator('body').innerText();
            if (
              pageText.includes('Access denied') ||
              pageText.includes('Your role does not have access') ||
              pageText.includes('You do not have permission to use')
            ) {
              pass = false;
              reason = 'Error card or Access Denied message displayed on granted page';
            }
          }
        } else {
          // Ungranted page: wait for "No Access" card to be present in DOM
          await page.waitForSelector('text=No Access', { timeout: 3000 }).catch(() => {});
          const pageText = await page.locator('body').innerText();
          const hasNoAccess = pageText.includes('No Access');
          if (!hasNoAccess) {
            pass = false;
            reason = 'Ungranted page did not show "No Access" screen';
          } else if (dataRequests.length > 0) {
            pass = false;
            reason = `Ungranted page made ${dataRequests.length} data requests: ${dataRequests.map((r) => r.url).join(', ')}`;
          }
        }

        console.log(`[${pass ? 'PASS' : 'FAIL'}] ${roleDef.roleName} -> ${p.label} (${isGranted ? 'GRANTED' : 'UNGRANTED'}): ${reason}`);

        if (pass) {
          passedTests++;
        } else {
          failedTests++;
        }

        matrixResults.push({
          role: roleDef.roleName,
          template: roleDef.templateKey,
          page: p.label,
          route: p.route,
          granted: isGranted ? 'GRANTED' : 'UNGRANTED',
          status: pass ? 'PASS' : 'FAIL',
          reason,
          requestsCount: dataRequests.length,
          networkFailures: networkFailures.length,
        });
      } catch (err) {
        failedTests++;
        console.log(`[FAIL] ${roleDef.roleName} -> ${p.label} (${isGranted ? 'GRANTED' : 'UNGRANTED'}): Exception: ${err.message}`);
        matrixResults.push({
          role: roleDef.roleName,
          template: roleDef.templateKey,
          page: p.label,
          route: p.route,
          granted: isGranted ? 'GRANTED' : 'UNGRANTED',
          status: 'FAIL',
          reason: `Exception: ${err.message}`,
          requestsCount: dataRequests.length,
          networkFailures: networkFailures.length,
        });
      } finally {
        page.off('response', responseHandler);
      }
    }

    await page.close();
    await context.close();
  }

  await browser.close();

  console.log('\n=== REAL-PAGE PLAYWRIGHT TEST MATRIX (ROLES x PAGES) ===');
  console.table(
    matrixResults.map((r) => ({
      Role: r.role,
      Page: r.page,
      Access: r.granted,
      Status: r.status,
      Notes: r.reason,
    }))
  );

  console.log(`\nTOTAL MATRIX TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);

  fs.mkdirSync(path.join(ROOT_DIR, 'test-results'), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT_DIR, 'test-results/page-matrix-results.json'),
    JSON.stringify({ totalTests, passedTests, failedTests, results: matrixResults }, null, 2)
  );

  if (failedTests > 0) {
    console.error(`FAILED: ${failedTests} matrix test(s) failed.`);
    process.exit(1);
  } else {
    console.log('SUCCESS: 100% of matrix test scenarios passed.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Test matrix execution error:', err);
  process.exit(1);
});
