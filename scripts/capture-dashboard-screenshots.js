/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.resolve(__dirname, '../evidence/dashboard');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const VIEWPORTS = [
  { name: '1440px-desktop', width: 1440, height: 900 },
  { name: '1024px-tablet-landscape', width: 1024, height: 768 },
  { name: '768px-tablet-portrait', width: 768, height: 1024 },
  { name: '390px-phone', width: 390, height: 844 },
];

const FAKE_POPULATED_KPIS = {
  period: '7d',
  periodLabel: 'Last 7 days',
  isPlatformOwner: false,
  platformMetrics: null,
  clientTenantInfo: {
    id: 'tenant-demo',
    code: 'ACME',
    name: 'Acme Enterprises Pvt Ltd',
    isOnboarded: false,
    gstin: '29ABCDE1234F1Z5',
    pan: 'ABCDE1234F',
    bankAccountNumber: null,
    stampUrl: null,
    address: '123 Industrial Area',
    city: 'Bengaluru',
  },
  kpis: {
    leads: {
      count: 42,
      changePct: 8,
      dailyAverage: '6.0',
      trend: [5, 6, 4, 8, 7, 5, 7],
    },
    quotations: {
      openCount: 6,
      openValue: 320000,
      expiringThisWeek: 2,
    },
    orders: {
      inProgressCount: 9,
    },
    invoices: {
      unpaidAmount: 110000,
      overdueCount: 4,
    },
    revenue: {
      thisMonth: 840000,
    },
    inventory: {
      lowStockCount: 3,
    },
  },
  needsAttention: [
    {
      id: 'setup',
      type: 'setup',
      text: 'Finish your company setup. Add legal name, GSTIN, PAN, bank details and stamp so invoices show your details. (3 of 6 done)',
      actionLabel: 'Finish setup',
      actionLink: '/settings/branding',
    },
    {
      id: 'low_stock',
      type: 'low_stock',
      text: '3 items are below reorder level. Restock or create a purchase bill.',
      actionLabel: 'Review items',
      actionLink: '/inventory',
    },
    {
      id: 'expiring_quote',
      type: 'expiring_quote',
      text: '2 quotations expire this week',
      actionLabel: 'Open quotes',
      actionLink: '/quotations',
    },
    {
      id: 'overdue_invoice',
      type: 'overdue_invoice',
      text: '4 overdue invoices',
      actionLabel: 'View invoices',
      actionLink: '/invoices',
    },
  ],
  leadsChart: {
    total: 42,
    dailyAverage: '6.0',
    sources: ['indiamart', 'web', 'whatsapp', 'manual'],
    days: [
      { date: '18 Oct', total: 5, indiamart: 2, web: 1, whatsapp: 1, manual: 1 },
      { date: '19 Oct', total: 6, indiamart: 3, web: 1, whatsapp: 1, manual: 1 },
      { date: '20 Oct', total: 4, indiamart: 1, web: 2, whatsapp: 1, manual: 0 },
      { date: '21 Oct', total: 8, indiamart: 4, web: 2, whatsapp: 1, manual: 1 },
      { date: '22 Oct', total: 7, indiamart: 3, web: 2, whatsapp: 1, manual: 1 },
      { date: '23 Oct', total: 5, indiamart: 2, web: 1, whatsapp: 2, manual: 0 },
      { date: '24 Oct', total: 7, indiamart: 3, web: 2, whatsapp: 1, manual: 1 },
    ],
  },
  pipeline: {
    total: 42,
    winRate: 25,
    periodLabel: 'Last 7 days',
    stages: [
      { stage: 'new', label: 'New', count: 18, percent: 43, color: '#3B82F6' },
      { stage: 'contacted', label: 'Contacted', count: 10, percent: 24, color: '#EAB308' },
      { stage: 'qualified', label: 'Qualified', count: 6, percent: 14, color: '#8B5CF6' },
      { stage: 'quoted', label: 'Quoted', count: 4, percent: 10, color: '#F59E0B' },
      { stage: 'won', label: 'Won', count: 3, percent: 7, color: '#10B981' },
      { stage: 'lost', label: 'Lost', count: 1, percent: 2, color: '#EF4444' },
    ],
  },
  recentOrders: [
    {
      id: 'ord-1',
      orderNumber: 'ORD-2026-101',
      customerName: 'Alpha Engineering Works',
      totalAmount: 125000,
      status: 'confirmed',
      confirmedAt: '2026-10-24T10:00:00.000Z',
    },
    {
      id: 'ord-2',
      orderNumber: 'ORD-2026-102',
      customerName: 'Beta Industrial Solutions',
      totalAmount: 78500,
      status: 'processing',
      confirmedAt: '2026-10-23T15:30:00.000Z',
    },
    {
      id: 'ord-3',
      orderNumber: 'ORD-2026-103',
      customerName: 'Gamma Automation Systems',
      totalAmount: 240000,
      status: 'dispatched',
      confirmedAt: '2026-10-23T09:15:00.000Z',
    },
    {
      id: 'ord-4',
      orderNumber: 'ORD-2026-104',
      customerName: 'Delta Fabrication Corp',
      totalAmount: 45000,
      status: 'confirmed',
      confirmedAt: '2026-10-22T14:20:00.000Z',
    },
    {
      id: 'ord-5',
      orderNumber: 'ORD-2026-105',
      customerName: 'Sigma Controls & Pumps',
      totalAmount: 96000,
      status: 'delivered',
      confirmedAt: '2026-10-21T11:45:00.000Z',
    },
  ],
  followUpsDue: [
    {
      id: 'act-1',
      title: 'Discuss commercial volume discount',
      customerName: 'Alpha Engineering Works',
      scheduledAt: '2026-10-24T11:00:00.000Z',
      isOverdue: false,
    },
    {
      id: 'act-2',
      title: 'Follow up on technical drawing approval',
      customerName: 'Gamma Automation Systems',
      scheduledAt: '2026-10-23T16:00:00.000Z',
      isOverdue: true,
    },
    {
      id: 'act-3',
      title: 'Confirm delivery schedule for Batch 2',
      customerName: 'Beta Industrial Solutions',
      scheduledAt: '2026-10-24T15:00:00.000Z',
      isOverdue: false,
    },
  ],
};

const FAKE_EMPTY_KPIS = {
  period: '7d',
  periodLabel: 'Last 7 days',
  isPlatformOwner: false,
  platformMetrics: null,
  clientTenantInfo: {
    id: 'tenant-empty',
    code: 'NEW',
    name: 'New Company',
    isOnboarded: true,
    gstin: '29ABCDE1234F1Z5',
    pan: 'ABCDE1234F',
    bankAccountNumber: '1234567890',
    stampUrl: 'https://example.com/stamp.png',
    address: '456 Business Park',
    city: 'Bengaluru',
  },
  kpis: {
    leads: {
      count: 0,
      changePct: 0,
      dailyAverage: '0.0',
      trend: [0, 0, 0, 0, 0, 0, 0],
    },
    quotations: {
      openCount: 0,
      openValue: 0,
      expiringThisWeek: 0,
    },
    orders: {
      inProgressCount: 0,
    },
    invoices: {
      unpaidAmount: 0,
      overdueCount: 0,
    },
    revenue: {
      thisMonth: 0,
    },
    inventory: {
      lowStockCount: 0,
    },
  },
  needsAttention: [],
  leadsChart: {
    total: 0,
    dailyAverage: '0.0',
    sources: ['indiamart', 'web', 'whatsapp', 'manual'],
    days: [
      { date: '18 Oct', total: 0, indiamart: 0, web: 0, whatsapp: 0, manual: 0 },
      { date: '19 Oct', total: 0, indiamart: 0, web: 0, whatsapp: 0, manual: 0 },
      { date: '20 Oct', total: 0, indiamart: 0, web: 0, whatsapp: 0, manual: 0 },
      { date: '21 Oct', total: 0, indiamart: 0, web: 0, whatsapp: 0, manual: 0 },
      { date: '22 Oct', total: 0, indiamart: 0, web: 0, whatsapp: 0, manual: 0 },
      { date: '23 Oct', total: 0, indiamart: 0, web: 0, whatsapp: 0, manual: 0 },
      { date: '24 Oct', total: 0, indiamart: 0, web: 0, whatsapp: 0, manual: 0 },
    ],
  },
  pipeline: {
    total: 0,
    winRate: 0,
    periodLabel: 'Last 7 days',
    stages: [],
  },
  recentOrders: [],
  followUpsDue: [],
};

const MOCK_USER = {
  id: 'usr-demo-01',
  name: 'Alex Morgan',
  email: 'alex@example.internal',
  role: 'tenant_admin',
  tenantId: 'tenant-demo',
  effectivePages: ['dashboard', 'leads', 'quotations', 'orders', 'invoices', 'inventory', 'daily_activities'],
};

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-credentials': 'true',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': '*',
  'content-type': 'application/json',
};

async function run() {
  console.log('=== STARTING PLAYWRIGHT DASHBOARD SCREENSHOT CAPTURE ===\n');

  const browser = await chromium.launch({ headless: true });
  const generatedFiles = [];

  for (const vp of VIEWPORTS) {
    for (const theme of ['light', 'dark']) {
      for (const state of ['populated', 'empty']) {
        const file = `dashboard-${state}-${vp.name}-${theme}.png`;
        console.log(`Capturing: ${file}...`);

        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          colorScheme: theme,
        });

        const page = await context.newPage();

        // Catch all API requests across ports 5173 and 3333
        await page.route('**/*', async (route) => {
          const req = route.request();
          const url = req.url();
          const method = req.method();

          if (url.includes('/api/v1/')) {
            if (method === 'OPTIONS') {
              return route.fulfill({ status: 204, headers: CORS_HEADERS });
            }

            if (url.includes('/auth/session-probe')) {
              return route.fulfill({
                status: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ signedIn: true, displayName: 'Alex Morgan' }),
              });
            }

            if (url.includes('/auth/refresh')) {
              return route.fulfill({
                status: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                  accessToken: 'mock-access-token',
                  refreshToken: 'mock-refresh-token',
                  user: MOCK_USER,
                }),
              });
            }

            if (url.includes('/auth/me')) {
              return route.fulfill({
                status: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify(MOCK_USER),
              });
            }

            if (url.includes('/dashboard/kpis')) {
              const payload = state === 'populated' ? FAKE_POPULATED_KPIS : FAKE_EMPTY_KPIS;
              return route.fulfill({
                status: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify(payload),
              });
            }

            if (url.includes('/settings/branding')) {
              return route.fulfill({
                status: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ companyDisplayName: 'CRM' }),
              });
            }

            return route.fulfill({
              status: 200,
              headers: CORS_HEADERS,
              body: JSON.stringify({ success: true }),
            });
          }

          return route.continue();
        });

        // Set local storage session tokens & theme before navigating
        await page.addInitScript(({ th, usr }) => {
          localStorage.setItem('crm_theme', th);
          if (th === 'dark') {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
          localStorage.setItem('crm_cookie_consent', JSON.stringify({
            choice: 'all',
            preferences: true,
            policyVersion: '2026.10.1',
            savedAt: new Date().toISOString(),
          }));
          sessionStorage.setItem('crm_portal', 'staff');
          sessionStorage.setItem('crm_access_token', 'mock-access-token');
          sessionStorage.setItem('crm_user', JSON.stringify(usr));
        }, { th: theme, usr: MOCK_USER });

        await page.goto('http://localhost:5173/dashboard', { waitUntil: 'networkidle' });

        // Ensure theme applied & allow full vertical expansion for fullPage screenshot
        await page.evaluate((th) => {
          if (th === 'dark') {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
          const banners = document.querySelectorAll('.fixed');
          banners.forEach((b) => {
            if (b.innerText && b.innerText.includes('Cookies')) b.remove();
          });
          document.querySelectorAll('*').forEach((el) => {
            const s = window.getComputedStyle(el);
            if (s.overflowY === 'auto' || s.overflowY === 'scroll') {
              el.style.overflowY = 'visible';
              el.style.height = 'auto';
            }
          });
          document.documentElement.style.height = 'auto';
          document.body.style.height = 'auto';
          const root = document.getElementById('root');
          if (root) {
            root.style.height = 'auto';
            root.style.minHeight = 'auto';
          }
          const minHScreen = document.querySelector('.min-h-screen');
          if (minHScreen) {
            minHScreen.style.height = 'auto';
            minHScreen.style.minHeight = 'auto';
          }
        }, theme);

        await page.waitForTimeout(600);

        await page.screenshot({
          path: path.join(OUTPUT_DIR, file),
          fullPage: true,
        });

        generatedFiles.push(`evidence/dashboard/${file}`);
        await context.close();
      }
    }
  }

  await browser.close();

  console.log('\n========================================================================');
  console.log(`Successfully captured all ${generatedFiles.length} dashboard screenshots:`);
  console.log('========================================================================');
  generatedFiles.forEach((f) => console.log(` - ${f}`));
  console.log('\nDone.');
}

run().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
