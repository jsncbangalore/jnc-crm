/* --- ROLE VS PAGE ACCESS REPRODUCTION AUDIT ---
 * Tests every company role against every standard page template's normal endpoints
 * to identify endpoints where granted pages return 403 due to @Roles guards.
 */

const path = require('path');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require(path.join(__dirname, '../node_modules/@prisma/client'));

const prisma = new PrismaClient();
const API_BASE = process.env.API_URL || 'http://localhost:3333/api/v1';

const ROLES = [
  'tenant_admin',
  'admin',
  'sub_admin',
  'project_manager',
  'developer_lead',
  'store_manager',
  'finance',
  'accountant',
  'employee',
  'developer',
];

const STANDARD_TEMPLATES = {
  inventory_only: {
    name: 'Inventory only',
    pages: ['inventory', 'suppliers', 'bills', 'shipments', 'notifications'],
  },
  sales: {
    name: 'Sales',
    pages: ['leads', 'lead_flow', 'quotations', 'orders', 'notifications'],
  },
  accounts: {
    name: 'Accounts',
    pages: ['invoices', 'quotations', 'bills', 'ledger', 'orders', 'notifications'],
  },
  daily_activities: {
    name: 'Project Work / Timesheets',
    pages: ['daily_activities', 'notifications'],
  },
  full_access: {
    name: 'Full Company Access',
    pages: [
      'leads', 'quotations', 'orders', 'shipments', 'inventory', 'suppliers',
      'invoices', 'bills', 'ledger', 'daily_activities', 'notifications'
    ],
  },
};

// Endpoints to test per page
const PAGE_ENDPOINTS = {
  shipments: [
    { method: 'GET', path: '/orders/shipments/list', desc: 'List shipments' },
    { method: 'POST', path: '/orders/shipments', desc: 'Create shipment', body: { orderId: 'dummy', trackingNumber: 'TRK-123', carrier: 'BlueDart' } },
  ],
  orders: [
    { method: 'GET', path: '/orders', desc: 'List orders' },
    { method: 'POST', path: '/orders', desc: 'Create order', body: { customerId: 'dummy', items: [] } },
  ],
  invoices: [
    { method: 'GET', path: '/invoices', desc: 'List invoices' },
    { method: 'POST', path: '/invoices', desc: 'Create invoice', body: { customerName: 'Test Cust', lines: [] } },
  ],
  quotations: [
    { method: 'GET', path: '/quotations', desc: 'List quotations' },
    { method: 'POST', path: '/quotations', desc: 'Create quotation', body: { customerName: 'Test Cust', items: [] } },
  ],
  inventory: [
    { method: 'GET', path: '/inventory', desc: 'List inventory' },
    { method: 'POST', path: '/inventory/items', desc: 'Create inventory item', body: { name: 'Item 1', sku: 'SKU-1' } },
  ],
  suppliers: [
    { method: 'GET', path: '/suppliers', desc: 'List suppliers' },
    { method: 'POST', path: '/suppliers', desc: 'Create supplier', body: { name: 'Vendor 1' } },
  ],
  bills: [
    { method: 'GET', path: '/inventory/purchase-bills', desc: 'List bills' },
  ],
  ledger: [
    { method: 'GET', path: '/ledger/statements', desc: 'View ledger statements' },
  ],
  leads: [
    { method: 'GET', path: '/leads', desc: 'List leads' },
    { method: 'POST', path: '/leads', desc: 'Create lead', body: { name: 'Lead 1', contactName: 'Lead 1' } },
  ],
  daily_activities: [
    { method: 'GET', path: '/activities', desc: 'List activities' },
    { method: 'POST', path: '/activities', desc: 'Create activity', body: { title: 'Task 1', hours: 2 } },
  ],
  notifications: [
    { method: 'GET', path: '/notifications', desc: 'List notifications' },
  ],
};

async function main() {
  const randSuffix = Math.floor(Math.random() * 899999 + 100000);
  const tenantId = `fake-tenant-roles-${randSuffix}`;
  const jwtSecret = process.env.JWT_SECRET || 'dev-insecure-secret-key-change-in-production-2026';

  console.log(`Setting up test tenant: ${tenantId}...`);
  const tenant = await prisma.tenant.create({
    data: {
      id: tenantId,
      name: 'Role Audit Tenant',
      code: `RA${randSuffix}`,
      slug: `role-audit-${randSuffix}`,
      status: 'active',
      planTier: 'enterprise',
      requireTwoFactor: false,
    },
  });

  const results = [];
  const blocked403 = [];

  try {
    for (const role of ROLES) {
      const userId = `fake-user-${role}-${randSuffix}`;
      const user = await prisma.user.create({
        data: {
          id: userId,
          tenant: { connect: { id: tenant.id } },
          email: `${role}_${randSuffix}@audit.fake`,
          name: `${role} User`,
          role: role,
          employeeCode: `EC-${role}-${randSuffix}`,
          passwordHash: '$2a$12$dummyhashforaudittestingonly',
          isActive: true,
        },
      });

      const token = jwt.sign(
        {
          sub: user.id,
          userId: user.id,
          id: user.id,
          email: user.email,
          role: user.role,
          tenantId: tenant.id,
        },
        jwtSecret,
        {
          audience: 'crm-client',
          issuer: 'crm-api',
          expiresIn: '1h',
        }
      );

      for (const [templateKey, template] of Object.entries(STANDARD_TEMPLATES)) {
        // Set user's page access to template pages
        await prisma.userPageAccess.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            tenantId: tenant.id,
            pages: JSON.stringify(template.pages),
          },
          update: {
            pages: JSON.stringify(template.pages),
          },
        });

        for (const page of template.pages) {
          const endpoints = PAGE_ENDPOINTS[page] || [];
          for (const ep of endpoints) {
            try {
              const res = await fetch(`${API_BASE}${ep.path}`, {
                method: ep.method,
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: ep.method !== 'GET' ? JSON.stringify(ep.body || {}) : undefined,
              });

              const body = await res.json().catch(() => ({}));
              const status = res.status;
              const errorMsg = body.message || '';

              results.push({
                role,
                template: templateKey,
                page,
                method: ep.method,
                endpoint: ep.path,
                status,
                message: errorMsg,
              });

              if (status === 403 && (errorMsg.includes('Required roles') || errorMsg.includes('Access denied'))) {
                blocked403.push({
                  role,
                  template: templateKey,
                  page,
                  method: ep.method,
                  endpoint: ep.path,
                  status,
                  message: errorMsg,
                });
              }
            } catch (err) {
              results.push({
                role,
                template: templateKey,
                page,
                method: ep.method,
                endpoint: ep.path,
                status: 'ERR',
                message: err.message,
              });
            }
          }
        }
      }

      // Cleanup user
      await prisma.userPageAccess.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }

  console.log('\n========================================================================================');
  console.log('ROLE VS PAGE ACCESS AUDIT: SUMMARY OF BLOCKED 403 ENDPOINTS');
  console.log('========================================================================================');
  console.log(`Total calls tested: ${results.length}`);
  console.log(`Total 403 Role-Blocked calls on GRANTED pages: ${blocked403.length}\n`);

  // Group by Page, Endpoint, Method, and list blocked roles
  const endpointMap = {};
  for (const b of blocked403) {
    const key = `${b.page} | ${b.method} ${b.endpoint}`;
    if (!endpointMap[key]) {
      endpointMap[key] = { page: b.page, method: b.method, endpoint: b.endpoint, roles: new Set(), message: b.message };
    }
    endpointMap[key].roles.add(b.role);
  }

  console.log('| Page | Method & Endpoint | Blocked Roles (Granted Page but Got 403) | Raw 403 Error |');
  console.log('|---|---|---|---|');
  for (const [key, item] of Object.entries(endpointMap)) {
    console.log(`| ${item.page} | ${item.method} ${item.endpoint} | ${Array.from(item.roles).join(', ')} | ${item.message} |`);
  }

  console.log('\nSample raw records (first 25):');
  console.table(blocked403.slice(0, 25).map(b => ({
    role: b.role,
    page: b.page,
    endpoint: `${b.method} ${b.endpoint}`,
    status: b.status,
    message: typeof b.message === 'string' ? b.message.slice(0, 45) : '',
  })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
