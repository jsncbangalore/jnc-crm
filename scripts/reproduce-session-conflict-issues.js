/* --- REPRODUCE SESSION CONFLICT & CHANGED MODAL ISSUES ---
 * Scenarios:
 * (a) Tab A signs in as user 1, Tab B signs in as user 2, then use Tab A
 * (b) Tab A signs out and sits on /login, Tab B signs in as another user
 * (c) Platform owner in Tab A and company admin in Tab B (different portals)
 * (d) 'Login As' impersonation
 * (e) A refresh that returns another user
 */

const path = require('path');
const bcrypt = require('bcryptjs');
const { chromium } = require('playwright');
const { PrismaClient } = require(path.join(__dirname, '../node_modules/@prisma/client'));

const prisma = new PrismaClient();
const API_BASE = process.env.API_URL || 'http://localhost:3333/api/v1';
const WEB_BASE = process.env.WEB_URL || 'http://localhost:5173';

const createdTenantIds = [];
const createdUserIds = [];

async function cleanup() {
  console.log('\n[CLEANUP] Cleaning up test records...');
  try {
    if (createdUserIds.length > 0) {
      await prisma.userPageAccess.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
      await prisma.refreshSession.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
      await prisma.otpChallenge.deleteMany({ where: { emailNormalized: { contains: 'repro_session_' } } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {});
    }
    if (createdTenantIds.length > 0) {
      await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } }).catch(() => {});
    }
  } catch (err) {
    console.error('Cleanup error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

async function createTestTenantAndUser(label, role = 'tenant_admin') {
  const rand = Math.floor(100000 + Math.random() * 900000);
  const tenantId = `tenant-${label}-${rand}`;
  const userId = `user-${label}-${rand}`;
  const email = `repro_session_${label}_${rand}@example.fake`;
  const password = 'DevPassword@123';
  const passwordHash = await bcrypt.hash(password, 10);

  let tenant = null;
  if (role !== 'platform_super_admin') {
    tenant = await prisma.tenant.create({
      data: {
        id: tenantId,
        code: `TN-${rand}`,
        name: `Tenant ${label} ${rand}`,
        slug: `tenant-${label}-${rand}`,
        status: 'active',
        planTier: 'enterprise',
        requireTwoFactor: false,
      },
    });
    createdTenantIds.push(tenant.id);
  }

  const user = await prisma.user.create({
    data: {
      id: userId,
      tenant: tenant ? { connect: { id: tenant.id } } : undefined,
      email,
      name: `User ${label}`,
      role,
      employeeCode: `EMP-${rand}`,
      passwordHash,
      isActive: true,
      firstLoginAfter2FaReleaseAt: new Date(),
    },
  });
  createdUserIds.push(user.id);

  if (tenant) {
    await prisma.userPageAccess.create({
      data: {
        tenant: { connect: { id: tenant.id } },
        user: { connect: { id: user.id } },
        pages: JSON.stringify(['dashboard', 'invoices', 'quotations', 'branding', 'companies']),
      },
    });
  }

  return { tenant, user, email, password };
}

async function attachTabInstrumentation(page, tabName) {
  await page.addInitScript((name) => {
    window.__tabName = name;

    function recordTrigger(item) {
      try {
        const existing = JSON.parse(sessionStorage.getItem('__captured_triggers') || '[]');
        existing.push(item);
        sessionStorage.setItem('__captured_triggers', JSON.stringify(existing));
      } catch {}
    }

    // Trigger 1: Cross-tab BroadcastChannel and storage events
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const origBC = window.BroadcastChannel;
        window.BroadcastChannel = function(channelName) {
          const ch = new origBC(channelName);
          if (channelName === 'crm_auth_channel' || channelName === 'crm_auth_sync') {
            ch.addEventListener('message', (ev) => {
              if (ev.data && (ev.data.type === 'signed_in' || ev.data.type === 'session_changed')) {
                recordTrigger({
                  trigger: 'Trigger 1: AuthContext cross-tab auth event (' + ev.data.type + ')',
                  channel: channelName,
                  detail: ev.data,
                  timestamp: Date.now(),
                });
              }
            });
          }
          return ch;
        };
        window.BroadcastChannel.prototype = origBC.prototype;
      } catch {}
    }

    // Trigger 2 / 3 / 4: Listen to crm:session-conflict-reload and crm:session-conflict
    window.addEventListener('crm:session-conflict-reload', (e) => {
      const detail = e.detail || {};
      let triggerType = 'Trigger 4: 409 SESSION_CHANGED from refresh';
      if (detail.expectedUserId && detail.incomingUserId) {
        if (detail.message?.includes('different tab')) {
          triggerType = 'Trigger 2: Refresh response user id differs from expected id';
        } else {
          triggerType = 'Trigger 3: API response user id differs from tab id';
        }
      }
      recordTrigger({
        trigger: triggerType,
        event: 'crm:session-conflict-reload',
        detail: e.detail,
        timestamp: Date.now(),
      });
    });

    window.addEventListener('crm:session-conflict', (e) => {
      recordTrigger({
        trigger: 'Trigger 1: Session conflict sync event',
        event: 'crm:session-conflict',
        detail: e.detail,
        timestamp: Date.now(),
      });
    });
  }, tabName);
}

async function inspectTabState(page, context) {
  const cookies = await context.cookies();
  const storage = await page.evaluate(() => {
    const sessionKeys = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      sessionKeys[k] = sessionStorage.getItem(k);
    }
    const localKeys = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith('crm_')) {
        localKeys[k] = localStorage.getItem(k);
      }
    }
    const modal = document.querySelector('h3');
    const modalText = modal ? modal.textContent : '';
    const hasModal = document.body.innerText.includes('Session Changed') && document.body.innerText.includes('Reload');
    const banner = document.querySelector('[data-testid="session-conflict-banner"]');
    const hasBanner = banner !== null;
    const bannerText = banner ? banner.textContent : '';
    const pageText = document.body.innerText.slice(0, 300).replace(/\s+/g, ' ');
    const url = window.location.href;
    let triggers = [];
    try {
      triggers = JSON.parse(sessionStorage.getItem('__captured_triggers') || '[]');
    } catch {}
    return { sessionKeys, localKeys, hasModal, modalText, hasBanner, bannerText, pageText, url, triggers };
  });

  return { cookies, storage };
}

async function performLogin(page, email, password, isPlatform = false) {
  const loginUrl = isPlatform ? `${WEB_BASE}/platform/login` : `${WEB_BASE}/login`;
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="username"]', { timeout: 15000 });
  await page.fill('input[name="username"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  // Wait for either URL change away from login, or session storage update
  await page.waitForFunction(() => {
    return (
      !window.location.pathname.includes('/login') ||
      sessionStorage.getItem('crm_tab_user_id') !== null ||
      document.body.innerText.includes('Session Changed')
    );
  }, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

async function main() {
  console.log('================================================================');
  console.log('STEP 1: REPRODUCE SESSION CONFLICT / CHANGED MODAL SCENARIOS');
  console.log('================================================================\n');

  const browser = await chromium.launch({ headless: true });

  try {
    // -------------------------------------------------------------
    // SCENARIO (a): Tab A signs in as User 1, Tab B signs in as User 2, then use Tab A
    // -------------------------------------------------------------
    console.log('-------------------------------------------------------------');
    console.log('SCENARIO (a): Tab A signs in as User 1, Tab B signs in as User 2, then use Tab A');
    console.log('-------------------------------------------------------------');
    {
      const u1 = await createTestTenantAndUser('A1');
      const u2 = await createTestTenantAndUser('A2');

      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const tabA = await context.newPage();
      await attachTabInstrumentation(tabA, 'TabA');
      const tabB = await context.newPage();
      await attachTabInstrumentation(tabB, 'TabB');

      // Both tabs start on /login
      await tabA.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
      await tabA.waitForSelector('input[name="username"]', { timeout: 15000 });
      await tabB.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
      await tabB.waitForSelector('input[name="username"]', { timeout: 15000 });

      console.log(`[Tab A] Logging in as User 1 (${u1.email})...`);
      await tabA.fill('input[name="username"]', u1.email);
      await tabA.fill('input[name="password"]', u1.password);
      await tabA.click('button[type="submit"]');
      await tabA.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 });
      await tabA.waitForTimeout(1000);

      console.log(`[Tab B] Logging in as User 2 (${u2.email})...`);
      await tabB.fill('input[name="username"]', u2.email);
      await tabB.fill('input[name="password"]', u2.password);
      await tabB.click('button[type="submit"]');
      await tabB.waitForTimeout(2000);

      console.log(`[Tab A] User acts in Tab A (clicks / views)...`);
      await tabA.bringToFront();
      await tabA.waitForTimeout(2000);

      const stateA = await inspectTabState(tabA, context);
      console.log('[Tab A State]:');
      console.log('  URL:', stateA.storage.url);
      console.log('  Modal visible ("Session Changed"):', stateA.storage.hasModal);
      console.log('  Non-blocking Banner visible:', stateA.storage.hasBanner);
      console.log('  Banner text:', stateA.storage.bannerText);
      console.log('  Triggers Fired in Tab A:', JSON.stringify(stateA.storage.triggers, null, 2));
      console.log('  SessionStorage Keys:', JSON.stringify(stateA.storage.sessionKeys, null, 2));
      console.log('  LocalStorage (crm_*) Keys:', JSON.stringify(stateA.storage.localKeys, null, 2));
      console.log('  Cookies:', stateA.cookies.map(c => `${c.name}=${c.value.slice(0, 15)}...`).join(', '));
      console.log('  Page preview:', stateA.storage.pageText.slice(0, 150));

      await context.close();
    }

    // -------------------------------------------------------------
    // SCENARIO (b): Tab A signs out and sits on /login, Tab B signs in as another user
    // -------------------------------------------------------------
    console.log('\n-------------------------------------------------------------');
    console.log('SCENARIO (b): Tab A signs out and sits on /login, Tab B signs in as another user');
    console.log('-------------------------------------------------------------');
    {
      const u1 = await createTestTenantAndUser('B1');
      const u2 = await createTestTenantAndUser('B2');

      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const tabA = await context.newPage();
      await attachTabInstrumentation(tabA, 'TabA');

      console.log(`[Tab A] Logging in as User 1 (${u1.email})...`);
      await tabA.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
      await tabA.waitForSelector('input[name="username"]', { timeout: 15000 });
      await tabA.fill('input[name="username"]', u1.email);
      await tabA.fill('input[name="password"]', u1.password);
      await tabA.click('button[type="submit"]');
      await tabA.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 });
      await tabA.waitForTimeout(1000);

      console.log(`[Tab A] Signing out in Tab A (sets crm_last_active_user_id and redirects to /login)...`);
      await tabA.evaluate(async () => {
        const uid = sessionStorage.getItem('crm_tab_user_id');
        if (uid) {
          sessionStorage.setItem('crm_last_active_user_id', uid);
        }
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify({}),
        }).catch(() => {});
        if (typeof BroadcastChannel !== 'undefined') {
          const ch = new BroadcastChannel('crm_auth_channel');
          ch.postMessage({ type: 'signed_out', timestamp: Date.now() });
          ch.close();
        }
        sessionStorage.removeItem('crm_tab_user_id');
        window.location.href = '/login';
      });
      await tabA.waitForFunction(() => window.location.pathname.includes('/login'), { timeout: 10000 });
      await tabA.waitForSelector('input[name="username"]', { timeout: 15000 });
      await tabA.waitForTimeout(1000);

      console.log(`[Tab B] Opening Tab B and logging in as User 2 (${u2.email})...`);
      const tabB = await context.newPage();
      await attachTabInstrumentation(tabB, 'TabB');
      await tabB.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
      await tabB.waitForSelector('input[name="username"]', { timeout: 15000 });
      await tabB.fill('input[name="username"]', u2.email);
      await tabB.fill('input[name="password"]', u2.password);
      await tabB.click('button[type="submit"]');
      await tabB.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 });
      await tabB.waitForTimeout(1500);

      console.log(`[Tab A] Checking Tab A sitting on /login...`);
      await tabA.bringToFront();
      await tabA.waitForTimeout(1500);

      const stateA = await inspectTabState(tabA, context);
      console.log('[Tab A State on /login]:');
      console.log('  URL:', stateA.storage.url);
      console.log('  Modal visible ("Session Changed"):', stateA.storage.hasModal);
      console.log('  Non-blocking Banner visible:', stateA.storage.hasBanner);
      console.log('  Triggers Fired in Tab A:', JSON.stringify(stateA.storage.triggers, null, 2));
      console.log('  SessionStorage Keys:', JSON.stringify(stateA.storage.sessionKeys, null, 2));
      console.log('  LocalStorage (crm_*) Keys:', JSON.stringify(stateA.storage.localKeys, null, 2));
      console.log('  Cookies:', stateA.cookies.map(c => `${c.name}=${c.value.slice(0, 15)}...`).join(', '));
      console.log('  Page preview:', stateA.storage.pageText.slice(0, 150));

      await context.close();
    }

    // -------------------------------------------------------------
    // SCENARIO (c): Platform owner in Tab A and Company admin in Tab B (different portals)
    // -------------------------------------------------------------
    console.log('\n-------------------------------------------------------------');
    console.log('SCENARIO (c): Platform owner in Tab A and Company admin in Tab B (different portals)');
    console.log('-------------------------------------------------------------');
    {
      const platUser = await createTestTenantAndUser('C_Platform', 'platform_super_admin');
      const compUser = await createTestTenantAndUser('C_Company', 'tenant_admin');

      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const tabA = await context.newPage();
      await attachTabInstrumentation(tabA, 'TabA_Platform');

      console.log(`[Tab A] Logging into Platform Console as (${platUser.email})...`);
      await tabA.goto(`${WEB_BASE}/platform/login`, { waitUntil: 'domcontentloaded' });
      await tabA.waitForSelector('input[name="username"]', { timeout: 15000 });
      await tabA.fill('input[name="username"]', platUser.email);
      await tabA.fill('input[name="password"]', platUser.password);
      await tabA.click('button[type="submit"]');
      await tabA.waitForFunction(() => window.location.pathname.includes('/platform/companies'), { timeout: 15000 });
      await tabA.waitForTimeout(1000);

      console.log(`[Tab B] Opening Tab B and logging into Company Portal as (${compUser.email})...`);
      const tabB = await context.newPage();
      await attachTabInstrumentation(tabB, 'TabB_Company');
      await tabB.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
      await tabB.waitForSelector('input[name="username"]', { timeout: 15000 });
      await tabB.fill('input[name="username"]', compUser.email);
      await tabB.fill('input[name="password"]', compUser.password);
      await tabB.click('button[type="submit"]');
      await tabB.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 });
      await tabB.waitForTimeout(1000);

      console.log(`[Tab A] Checking Tab A (Platform Console)...`);
      await tabA.bringToFront();
      await tabA.waitForTimeout(1500);

      const stateA = await inspectTabState(tabA, context);
      console.log('[Tab A State (Platform)]:');
      console.log('  URL:', stateA.storage.url);
      console.log('  Modal visible ("Session Changed"):', stateA.storage.hasModal);
      console.log('  Non-blocking Banner visible:', stateA.storage.hasBanner);
      console.log('  Triggers Fired in Tab A:', JSON.stringify(stateA.storage.triggers, null, 2));
      console.log('  SessionStorage Keys:', JSON.stringify(stateA.storage.sessionKeys, null, 2));
      console.log('  LocalStorage (crm_*) Keys:', JSON.stringify(stateA.storage.localKeys, null, 2));
      console.log('  Cookies:', stateA.cookies.map(c => `${c.name}=${c.value.slice(0, 15)}...`).join(', '));

      await context.close();
    }

    // -------------------------------------------------------------
    // SCENARIO (d): 'Login As' Impersonation
    // -------------------------------------------------------------
    console.log('\n-------------------------------------------------------------');
    console.log('SCENARIO (d): "Login As" impersonation');
    console.log('-------------------------------------------------------------');
    {
      const platUser = await createTestTenantAndUser('D_Platform', 'platform_super_admin');
      const compTenant = await createTestTenantAndUser('D_Company', 'tenant_admin');

      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const tabA = await context.newPage();
      await attachTabInstrumentation(tabA, 'TabA_Impersonate');

      console.log(`[Tab A] Logging into Platform Console as (${platUser.email})...`);
      await tabA.goto(`${WEB_BASE}/platform/login`, { waitUntil: 'domcontentloaded' });
      await tabA.waitForSelector('input[name="username"]', { timeout: 15000 });
      await tabA.fill('input[name="username"]', platUser.email);
      await tabA.fill('input[name="password"]', platUser.password);
      await tabA.click('button[type="submit"]');
      await tabA.waitForFunction(() => window.location.pathname.includes('/platform/companies'), { timeout: 15000 });
      await tabA.waitForTimeout(1000);

      console.log(`[Tab A] Clicking 'Login As' button for tenant ${compTenant.tenant.name}...`);
      await tabA.waitForSelector('button:has-text("Login As")', { timeout: 15000 });
      await tabA.click('button:has-text("Login As")');
      await tabA.waitForTimeout(500);

      // In confirmation dialog, click 'Enter Workspace'
      console.log(`[Tab A] Confirming 'Enter Workspace'...`);
      await tabA.waitForSelector('button:has-text("Enter Workspace")', { timeout: 5000 });
      await tabA.click('button:has-text("Enter Workspace")');
      await tabA.waitForTimeout(2000);

      const stateA = await inspectTabState(tabA, context);
      console.log('[Tab A State after Impersonate]:');
      console.log('  URL:', stateA.storage.url);
      console.log('  Modal visible ("Session Changed"):', stateA.storage.hasModal);
      console.log('  Non-blocking Banner visible:', stateA.storage.hasBanner);
      console.log('  Triggers Fired in Tab A:', JSON.stringify(stateA.storage.triggers, null, 2));
      console.log('  SessionStorage Keys:', JSON.stringify(stateA.storage.sessionKeys, null, 2));
      console.log('  Cookies:', stateA.cookies.map(c => `${c.name}=${c.value.slice(0, 15)}...`).join(', '));

      await context.close();
    }

    // -------------------------------------------------------------
    // SCENARIO (e): A refresh that returns another user
    // -------------------------------------------------------------
    console.log('\n-------------------------------------------------------------');
    console.log('SCENARIO (e): A refresh that returns another user');
    console.log('-------------------------------------------------------------');
    {
      const u1 = await createTestTenantAndUser('E1');
      const u2 = await createTestTenantAndUser('E2');

      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const tabA = await context.newPage();
      await attachTabInstrumentation(tabA, 'TabA_Refresh');

      console.log(`[Tab A] Logging in as User 1 (${u1.email})...`);
      await tabA.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
      await tabA.waitForSelector('input[name="username"]', { timeout: 15000 });
      await tabA.fill('input[name="username"]', u1.email);
      await tabA.fill('input[name="password"]', u1.password);
      await tabA.click('button[type="submit"]');
      await tabA.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 });
      await tabA.waitForTimeout(1000);

      console.log(`[Tab A] Storing expected user id as u1 (${u1.user.id}), but calling refresh when server has u2 session...`);
      // In same context, authenticate as u2 via POST /auth/login so crm_refresh_token cookie is switched to u2
      const tabB = await context.newPage();
      await tabB.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
      await tabB.evaluate(async ({ email, password }) => {
        await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: email, password }),
        });
      }, { email: u2.email, password: u2.password });
      await tabB.close();

      // Now cookie belongs to u2. In Tab A, perform a refresh with expected user u1:
      console.log(`[Tab A] Tab A attempts refresh with expectedUserId=${u1.user.id}...`);
      await tabA.bringToFront();
      const refreshResult = await tabA.evaluate(async (expectedId) => {
        try {
          const res = await fetch('/api/v1/auth/refresh', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'X-Requested-With': 'XMLHttpRequest',
              'X-Expected-User-Id': expectedId,
            },
            body: JSON.stringify({ expectedUserId: expectedId }),
          });
          const json = await res.json();
          // Simulate api.ts interceptor when status is 409
          if (res.status === 409) {
            window.dispatchEvent(
              new CustomEvent('crm:session-conflict-reload', {
                detail: {
                  message: 'You signed in with another account in a different tab',
                  expectedUserId: expectedId,
                  incomingUserId: 'another-user-id',
                  portal: 'staff',
                },
              })
            );
          }
          return { status: res.status, json };
        } catch (err) {
          return { error: err.message };
        }
      }, u1.user.id);

      console.log('  Refresh response status:', refreshResult.status, 'Body:', JSON.stringify(refreshResult.json));
      await tabA.waitForTimeout(1500);

      const stateA = await inspectTabState(tabA, context);
      console.log('[Tab A State after Refresh Mismatch]:');
      console.log('  URL:', stateA.storage.url);
      console.log('  Modal visible ("Session Changed"):', stateA.storage.hasModal);
      console.log('  Non-blocking Banner visible:', stateA.storage.hasBanner);
      console.log('  Triggers Fired in Tab A:', JSON.stringify(stateA.storage.triggers, null, 2));
      console.log('  SessionStorage Keys:', JSON.stringify(stateA.storage.sessionKeys, null, 2));
      console.log('  Cookies:', stateA.cookies.map(c => `${c.name}=${c.value.slice(0, 15)}...`).join(', '));

      await context.close();
    }

  } catch (err) {
    console.error('Test execution failed:', err);
  } finally {
    await browser.close();
    await cleanup();
  }
}

main().catch(console.error);
