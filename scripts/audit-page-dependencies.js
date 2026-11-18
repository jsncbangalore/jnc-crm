const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const ROOT_DIR = path.resolve(__dirname, '..');
// Load environment from apps/api/.env
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

// 1. Parse API methods from apps/web/src/services/api.ts
const apiTsPath = path.join(ROOT_DIR, 'apps/web/src/services/api.ts');
const apiContent = fs.readFileSync(apiTsPath, 'utf8');
const apiMap = {};

const apiObjRegex = /export const ([a-zA-Z0-9_]+Api)\s*=\s*\{([\s\S]*?)\n\};/g;
let match;
while ((match = apiObjRegex.exec(apiContent)) !== null) {
  const apiName = match[1];
  const body = match[2];
  const lines = body.split('\n');
  let currentMethod = null;
  let currentBlock = '';
  
  for (const line of lines) {
    const fnMatch = line.match(/^\s*([a-zA-Z0-9_]+)\s*:\s*(?:async\s*)?\(([^)]*)\)/);
    if (fnMatch) {
      if (currentMethod) processMethod(apiName, currentMethod, currentBlock);
      currentMethod = fnMatch[1];
      currentBlock = line;
    } else if (currentMethod) {
      currentBlock += '\n' + line;
    }
  }
  if (currentMethod) processMethod(apiName, currentMethod, currentBlock);
}

function processMethod(apiName, methodName, block) {
  const httpMatch = block.match(/api\.(get|post|put|patch|delete)(?:<[^>]+>)?\s*\(\s*([`'"][^`'"]+[`'"])/i);
  if (httpMatch) {
    const httpMethod = httpMatch[1].toUpperCase();
    let url = httpMatch[2].replace(/[`'"]/g, '').replace(/\$\{[^}]+\}/g, ':param');
    apiMap[`${apiName}.${methodName}`] = { method: httpMethod, url };
  } else {
    const customMatch = block.match(/(get|post|put|patch|delete)\s*\(\s*([`'"][^`'"]+[`'"])/i);
    if (customMatch) {
      apiMap[`${apiName}.${methodName}`] = { method: customMatch[1].toUpperCase(), url: customMatch[2].replace(/[`'"]/g, '').replace(/\$\{[^}]+\}/g, ':param') };
    }
  }
}

// 2. Parse backend controller routes and @PageAccess
const controllerFiles = [];
function findControllers(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      findControllers(p);
    } else if (f.endsWith('.controller.ts')) {
      controllerFiles.push(p);
    }
  }
}
findControllers(path.join(ROOT_DIR, 'apps/api/src'));

const endpointGuardMap = [];

for (const cFile of controllerFiles) {
  const content = fs.readFileSync(cFile, 'utf8');
  const cPrefixMatch = content.match(/@Controller\s*\(\s*(?:['"]([^'"]*)['"])?\s*\)/);
  const cPrefix = cPrefixMatch ? (cPrefixMatch[1] || '') : '';
  const cPageAccessMatch = content.match(/@PageAccess\s*\(\s*([^)]+)\s*\)\s*[\s\S]*?export class/);
  const classPageKeys = cPageAccessMatch ? cPageAccessMatch[1].split(',').map(s => s.trim().replace(/['"]/g, '')) : [];

  const methodBlocks = content.split(/@(Get|Post|Put|Patch|Delete)\s*\(/);
  for (let i = 1; i < methodBlocks.length; i += 2) {
    const httpMethod = methodBlocks[i].toUpperCase();
    const rest = methodBlocks[i + 1];
    const pathMatch = rest.match(/^\s*(?:['"]([^'"]*)['"])?\s*\)/);
    const subPath = pathMatch ? (pathMatch[1] || '') : '';
    const methodDeclMatch = rest.match(/\)\s*([\s\S]*?)(?:async\s+)?([a-zA-Z0-9_]+)\s*\(/);
    const methodDecorators = methodDeclMatch ? methodDeclMatch[1] : '';
    
    let methodPageKeys = [...classPageKeys];
    const mPageAccessMatch = methodDecorators.match(/@PageAccess\s*\(\s*([^)]+)\s*\)/);
    if (mPageAccessMatch) {
      methodPageKeys = mPageAccessMatch[1].split(',').map(s => s.trim().replace(/['"]/g, ''));
    }
    
    const isPublic = methodDecorators.includes('@Public()') || rest.slice(0, 100).includes('@Public()');
    const isAuthOnly = methodDecorators.includes('@AuthOnly()') || rest.slice(0, 100).includes('@AuthOnly()');

    let fullPath = '/' + [cPrefix, subPath].filter(Boolean).join('/').replace(/\/+/g, '/');
    if (!fullPath.startsWith('/')) fullPath = '/' + fullPath;
    if (fullPath.length > 1 && fullPath.endsWith('/')) fullPath = fullPath.slice(0, -1);
    
    endpointGuardMap.push({
      method: httpMethod,
      fullPath,
      pageKeys: methodPageKeys,
      isPublic,
      isAuthOnly,
      file: path.basename(cFile)
    });
  }
}

function resolveEndpoint(url, method) {
  let cleanUrl = url.split('?')[0].replace(/^http:\/\/[^/]+/, '');
  cleanUrl = cleanUrl.replace(/^\/api\/v1/, '');
  if (!cleanUrl.startsWith('/')) cleanUrl = '/' + cleanUrl;
  if (cleanUrl.length > 1 && cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);

  for (const ep of endpointGuardMap) {
    if (ep.method !== method) continue;
    const epParts = ep.fullPath.split('/');
    const urlParts = cleanUrl.split('/');
    if (epParts.length !== urlParts.length) continue;
    let match = true;
    for (let i = 0; i < epParts.length; i++) {
      if (epParts[i].startsWith(':')) continue;
      if (epParts[i] !== urlParts[i]) {
        match = false;
        break;
      }
    }
    if (match) return { ...ep, matchedPath: cleanUrl };
  }
  return null;
}

// Canonical page routes to audit
const auditPages = [
  { name: 'DashboardPage', file: 'DashboardPage.tsx', route: '/dashboard', pageKey: 'dashboard' },
  { name: 'LeadsPage', file: 'LeadsPage.tsx', route: '/leads', pageKey: 'leads' },
  { name: 'QuotationsPage', file: 'QuotationsPage.tsx', route: '/quotations', pageKey: 'quotations' },
  { name: 'OrdersPage', file: 'OrdersPage.tsx', route: '/orders', pageKey: 'orders' },
  { name: 'InvoicesPage', file: 'InvoicesPage.tsx', route: '/invoices', pageKey: 'invoices' },
  { name: 'ShipmentsPage', file: 'ShipmentsPage.tsx', route: '/shipments', pageKey: 'shipments' },
  { name: 'InventoryPage', file: 'InventoryPage.tsx', route: '/inventory', pageKey: 'inventory' },
  { name: 'SuppliersPage', file: 'SuppliersPage.tsx', route: '/suppliers', pageKey: 'suppliers' },
  { name: 'PurchaseBillsPage', file: 'PurchaseBillsPage.tsx', route: '/bills', pageKey: 'bills' },
  { name: 'LedgerPage', file: 'LedgerPage.tsx', route: '/ledger', pageKey: 'ledger' },
  { name: 'CustomersPage', file: 'CustomersPage.tsx', route: '/customers', pageKey: 'leads', secondaryKey: 'ledger' },
  { name: 'StartSetupPage', file: 'StartSetupPage.tsx', route: '/start-setup', pageKey: 'lead_setup' },
  { name: 'DailyActivitiesPage', file: 'DailyActivitiesPage.tsx', route: '/daily-activities', pageKey: 'daily_activities' },
  { name: 'NotificationsPage', file: 'NotificationsPage.tsx', route: '/notifications', pageKey: 'notifications' },
  { name: 'AutomationPage', file: 'AutomationPage.tsx', route: '/automation', pageKey: 'automation' },
  { name: 'ObjectManagerPage', file: 'ObjectManagerPage.tsx', route: '/setup/objects', pageKey: 'custom_objects' },
  { name: 'UsersPage', file: 'UsersPage.tsx', route: '/users', pageKey: 'users' },
  { name: 'AuditLogsPage', file: 'AuditLogsPage.tsx', route: '/audit-logs', pageKey: 'audit_logs' },
  { name: 'BrandingSettingsPage', file: 'BrandingSettingsPage.tsx', route: '/settings/branding', pageKey: 'branding' },
  { name: 'MailAccountsPage', file: 'MailAccountsPage.tsx', route: '/settings/mail', pageKey: 'mail_settings' },
  { name: 'MyAccountPage', file: 'MyAccountPage.tsx', route: '/account', pageKey: 'auth_only' },
  { name: 'SystemErrorsPage', file: 'SystemErrorsPage.tsx', route: '/system-errors', pageKey: 'admin_only' },
];

function scanFileForApiCalls(filePath, visited = new Set()) {
  if (visited.has(filePath) || !fs.existsSync(filePath)) return [];
  visited.add(filePath);

  const content = fs.readFileSync(filePath, 'utf8');
  const calls = [];

  const apiCallRegex = /([a-zA-Z0-9_]+Api)\.([a-zA-Z0-9_]+)\s*\(/g;
  let m;
  while ((m = apiCallRegex.exec(content)) !== null) {
    calls.push({
      callStr: `${m[1]}.${m[2]}`,
      file: path.relative(ROOT_DIR, filePath)
    });
  }

  const directApiRegex = /api\.(get|post|put|patch|delete)\s*\(\s*([`'"][^`'"]+[`'"])/gi;
  while ((m = directApiRegex.exec(content)) !== null) {
    const rawUrl = m[2].replace(/[`'"]/g, '').replace(/\$\{[^}]+\}/g, ':param');
    calls.push({
      callStr: `api.${m[1]}('${rawUrl}')`,
      directMethod: m[1].toUpperCase(),
      directUrl: rawUrl,
      file: path.relative(ROOT_DIR, filePath)
    });
  }

  const importRegex = /import\s+(?:\{[^}]+\}|\*\s+as\s+[a-zA-Z0-9_]+|[a-zA-Z0-9_]+)\s+from\s+['"]([^'"]+)['"]/g;
  while ((m = importRegex.exec(content)) !== null) {
    const importPath = m[1];
    if (importPath.startsWith('.')) {
      const dir = path.dirname(filePath);
      const candidates = [
        path.resolve(dir, importPath + '.tsx'),
        path.resolve(dir, importPath + '.ts'),
        path.resolve(dir, importPath + '/index.tsx'),
        path.resolve(dir, importPath + '/index.ts'),
        path.resolve(dir, importPath)
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
          if (!cand.includes('AuthContext') && !cand.includes('api.ts') && !cand.includes('node_modules')) {
            const subCalls = scanFileForApiCalls(cand, visited);
            calls.push(...subCalls);
          }
          break;
        }
      }
    }
  }

  return calls;
}

async function main() {
  console.log('========================================================================================');
  console.log('              PAGE DEPENDENCY AUDIT: CODE INVENTORY + PLAYWRIGHT RUNTIME                ');
  console.log('========================================================================================');

  // A. Static Code Audit
  const codeAuditRows = [];
  for (const p of auditPages) {
    const pagePath = path.join(ROOT_DIR, 'apps/web/src/pages', p.file);
    if (!fs.existsSync(pagePath)) continue;

    const rawCalls = scanFileForApiCalls(pagePath);
    const seen = new Set();
    const uniqueCalls = [];
    for (const c of rawCalls) {
      if (!seen.has(c.callStr)) {
        seen.add(c.callStr);
        uniqueCalls.push(c);
      }
    }

    for (const c of uniqueCalls) {
      let method, url;
      if (c.directMethod) {
        method = c.directMethod;
        url = c.directUrl;
      } else {
        const mapped = apiMap[c.callStr];
        if (mapped) {
          method = mapped.method;
          url = mapped.url;
        }
      }

      if (!url) continue;

      const resolved = resolveEndpoint(url, method);
      const epGuards = resolved ? resolved.pageKeys : [];
      const isPublic = resolved ? resolved.isPublic : false;
      const isAuthOnly = resolved ? resolved.isAuthOnly : false;

      let isCrossPage = false;
      if (!isPublic && !isAuthOnly && epGuards.length > 0) {
        const allowed = [p.pageKey];
        if (p.secondaryKey) allowed.push(p.secondaryKey);
        if (!epGuards.some(k => allowed.includes(k))) {
          isCrossPage = true;
        }
      }

      codeAuditRows.push({
        detection: 'Code Analysis',
        page: p.name,
        pageKey: p.pageKey,
        call: c.callStr,
        method,
        endpoint: url,
        endpointPageKeys: epGuards.length ? epGuards.join(', ') : (isPublic ? 'Public' : isAuthOnly ? 'AuthOnly' : 'None'),
        isCrossPage,
        source: path.basename(c.file)
      });
    }
  }

  // B. Playwright Runtime Network Recording
  console.log('Setting up test tenant and user for Playwright runtime network recording...');
  const suffix = String(Date.now()).slice(-6);
  const testTenantId = 'audit-tenant-' + suffix;
  const testUserId = 'audit-user-' + suffix;
  const testEmail = `auditor_${suffix}@example.fake`;
  console.log('Hashing password...');
  const rawPassword = 'AuditPassword123!';
  const passwordHash = bcrypt.hashSync(rawPassword, 10);
  console.log('Password hashed. Creating tenant...');

  const tenant = await prisma.tenant.create({
    data: {
      id: testTenantId,
      code: 'AUD' + suffix,
      name: 'Audit Global Tech ' + suffix,
      slug: 'audit-tech-' + suffix,
      status: 'active',
      planTier: 'enterprise',
      maxUsers: 100,
    },
  });
  console.log('Tenant created successfully:', tenant.id);

  const allCompanyPages = [
    'dashboard', 'leads', 'quotations', 'orders', 'invoices', 'shipments',
    'inventory', 'suppliers', 'bills', 'ledger', 'lead_setup', 'lead_flow',
    'daily_activities', 'notifications', 'automation', 'custom_objects',
    'audit_logs', 'users', 'teams', 'branding', 'mail_settings'
  ];

  const user = await prisma.user.create({
    data: {
      id: testUserId,
      tenantId: testTenantId,
      email: testEmail,
      name: 'System Auditor',
      employeeCode: 'AUD-' + suffix,
      role: 'tenant_admin',
      passwordHash,
      isActive: true,
      tokenVersion: 0,
      firstLoginAfter2FaReleaseAt: new Date(),
    },
  });

  await prisma.userPageAccess.create({
    data: {
      userId: testUserId,
      tenantId: testTenantId,
      pages: JSON.stringify(allCompanyPages),
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
      role: 'tenant_admin',
      tokenVersion: 0,
    },
    jwtSecret,
    { audience: 'crm-client', issuer: 'crm-api', expiresIn: '2h' }
  );

  const browser = await chromium.launch({ headless: true });
  const browserContext = await browser.newContext({
    viewport: { width: 1536, height: 730 },
  });

  await browserContext.addInitScript(({ token, user, tenant }) => {
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
  }, { token, user, tenant });

  const runtimeAuditRows = [];

  for (const p of auditPages) {
    const page = await browserContext.newPage();
    const recordedRequests = [];

    page.on('request', req => {
      const url = req.url();
      if (url.includes('/api/v1/')) {
        recordedRequests.push({
          method: req.method(),
          url: url.replace(/^http:\/\/[^/]+/, ''),
        });
      }
    });

    try {
      await page.goto(`http://localhost:5173${p.route}`, { waitUntil: 'networkidle', timeout: 7000 });
      await page.waitForTimeout(600);
    } catch {}

    const seenUrls = new Set();
    for (const req of recordedRequests) {
      if (req.url.includes('/auth/session-probe') || req.url.includes('/auth/me')) continue;
      const key = `${req.method} ${req.url.split('?')[0]}`;
      if (seenUrls.has(key)) continue;
      seenUrls.add(key);

      const resolved = resolveEndpoint(req.url, req.method);
      const epGuards = resolved ? resolved.pageKeys : [];
      const isPublic = resolved ? resolved.isPublic : false;
      const isAuthOnly = resolved ? resolved.isAuthOnly : false;

      let isCrossPage = false;
      if (!isPublic && !isAuthOnly && epGuards.length > 0) {
        const allowed = [p.pageKey];
        if (p.secondaryKey) allowed.push(p.secondaryKey);
        if (!epGuards.some(k => allowed.includes(k))) {
          isCrossPage = true;
        }
      }

      runtimeAuditRows.push({
        detection: 'Runtime Network',
        page: p.name,
        pageKey: p.pageKey,
        call: `HTTP ${req.method}`,
        method: req.method,
        endpoint: req.url.split('?')[0].replace(/^\/api\/v1/, ''),
        endpointPageKeys: epGuards.length ? epGuards.join(', ') : (isPublic ? 'Public' : isAuthOnly ? 'AuthOnly' : 'None'),
        isCrossPage,
        source: 'Page Mount'
      });
    }

    await page.close();
  }

  await browser.close();

  // Cleanup DB
  await prisma.userPageAccess.deleteMany({ where: { tenantId: testTenantId } });
  await prisma.user.deleteMany({ where: { tenantId: testTenantId } });
  await prisma.tenant.deleteMany({ where: { id: testTenantId } });

  // Output full combined table
  const allRows = [...runtimeAuditRows, ...codeAuditRows];

  // Save report
  fs.writeFileSync(path.join(ROOT_DIR, 'test-results/page-dependency-audit.json'), JSON.stringify(allRows, null, 2));

  console.log('\n=== COMPLETE PAGE DEPENDENCY AUDIT TABLE ===');
  console.table(allRows.map(r => ({
    'Page': r.page,
    'Page Key': r.pageKey,
    'Call': r.call,
    'Method': r.method,
    'Endpoint': r.endpoint,
    'Endpoint Page Key': r.endpointPageKeys,
    'Cross-Page?': r.isCrossPage ? 'YES (CROSS-PAGE)' : 'NO'
  })));

  const crossList = allRows.filter(r => r.isCrossPage);
  console.log(`\n========================================================================================`);
  console.log(`     IDENTIFIED CROSS-PAGE CALLS (ENDPOINT KEY != PAGE KEY) [${crossList.length} TOTAL]        `);
  console.log(`========================================================================================`);
  console.table(crossList.map(r => ({
    'Detection': r.detection,
    'Page': r.page,
    'Page Key': r.pageKey,
    'Call': r.call,
    'Method': r.method,
    'Endpoint': r.endpoint,
    'Endpoint Page Key': r.endpointPageKeys,
    'Source': r.source
  })));
}

main().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
